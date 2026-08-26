// ─────────────────────────────────────────────────────────────────────────
// PLACING THE CAGES — every bar in the structure, where it actually is.
//
// `beamCage` and `columnCage` each build one member's steel in model space,
// but they have to be told where that member is. This is the piece that knows:
// it walks the design, finds each member in the model, and hands the builders
// the real axis, level and support widths.
//
// That makes it the one place the whole structure's reinforcement exists as
// geometry, which is what a 3D view needs and what the take-off should be
// summing. The take-off used to call the builders with placeholder positions
// — every beam at the origin, every column centred on [0, 0] — because it only
// wanted lengths; correct for weight, useless for anything that has to draw
// the result.
//
// PLACEMENT. A member's box in the 3D scene is centred on the line joining its
// two nodes, so the node sits at the section CENTROID: a beam's soffit is
// h/2 below the node, and a column runs between its two node levels on their
// shared plan position.
//
// Units: geometry m, bar sizes mm. Model space, y up.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection } from './model'
import type { StructureDesign } from './pipeline'
import { buildBeamCage } from './beamCage'
import { buildColumnCage, perimeterBars } from './columnCage'
import { calcDevLength } from './devLength'
import { buildFootingCage } from './footingCage'
import { spliceCage } from './barSplice'
import { STOCK_BAR_LENGTH } from './rebarModel'
import type { RebarCage } from './rebarModel'

const FALLBACK: RectSection = {
  id: '', name: '', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40,
}

/** Two members are collinear when their axes point the same way, either sense. */
function collinear(
  a: { i: string; j: string }, b: { i: string; j: string },
  pos: Map<string, { x: number; y: number; z: number }>,
): boolean {
  const dir = (m: { i: string; j: string }) => {
    const p = pos.get(m.i), q = pos.get(m.j)
    if (!p || !q) return null
    const d = [q.x - p.x, q.y - p.y, q.z - p.z]
    const l = Math.hypot(d[0], d[1], d[2])
    return l < 1e-9 ? null : ([d[0] / l, d[1] / l, d[2] / l] as const)
  }
  const u = dir(a), v = dir(b)
  if (!u || !v) return false
  return Math.abs(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) > 0.98
}

export interface StructureCages {
  cages: RebarCage[]
  /** Members named in the design that could not be placed — no member in the
   *  model, or its nodes missing. Reported rather than dropped silently. */
  unplaced: string[]
}

/**
 * Every beam and column cage in the structure, placed.
 *
 * A beam's ends are continuous where another beam carries on collinearly past
 * that node; otherwise they are end supports and the bars hook. A column's
 * joint gap is the depth of the deepest beam framing into its top, so the
 * column's own ties stop clear of the band the joint hoops own (§418.8.3) and
 * the steel there is neither drawn nor paid for twice.
 */
/** §20.6.1.3.1 — concrete cast against and permanently in contact with
 *  ground gets 75 mm cover. */
export const FOOTING_COVER = 75

export function buildStructureCages(model: StructuralModel, design: StructureDesign): StructureCages {
  const pos = new Map(model.nodes.map((n) => [n.id, n]))
  const memById = new Map(model.members.map((m) => [m.id, m]))
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const secOf = (memberId: string): RectSection =>
    secById.get(memById.get(memberId)?.section ?? '') ?? model.sections[0] ?? FALLBACK

  const isBeam = (r: string) => r === 'beam' || r === 'girder'
  const beamsAtNode = new Map<string, typeof model.members>()
  for (const m of model.members) {
    if (!isBeam(m.role)) continue
    for (const n of [m.i, m.j]) {
      const list = beamsAtNode.get(n) ?? []
      list.push(m); beamsAtNode.set(n, list)
    }
  }
  const carriesOn = (mem: { id: string; i: string; j: string }, node: string) =>
    (beamsAtNode.get(node) ?? []).some((o) => o.id !== mem.id && collinear(o, mem, pos))

  /** The column at a node — what a beam bar has to anchor into. */
  const colAt = (node: string) =>
    model.members.find((m) => m.role === 'column' && (m.i === node || m.j === node))
  /** Plan width of the column at a node, mm — 0 where none frames in. */
  const colWidthAt = (node: string): number => {
    const col = colAt(node)
    if (!col) return 0
    const cs = secOf(col.id)
    return Math.min(cs.b, cs.h)
  }
  /** Depth of the deepest beam framing into a node, m — the joint band. */
  const beamDepthAt = (node: string): number => {
    const list = beamsAtNode.get(node) ?? []
    let d = 0
    for (const m of list) d = Math.max(d, secOf(m.id).h / 1000)
    return d
  }

  /** Does a column reach out of this node, up (`+1`) or down (`−1`)? */
  const columnBeyond = (node: string, way: 1 | -1, exclude?: string): boolean => {
    const here = pos.get(node)
    if (!here) return false
    return model.members.some((m) => {
      if (m.id === exclude || m.role !== 'column') return false
      if (m.i !== node && m.j !== node) return false
      const other = pos.get(m.i === node ? m.j : m.i)
      return !!other && way * (other.y - here.y) > 1e-6
    })
  }
  /** Does another column carry on ABOVE this node? A roof column laps nothing. */
  const columnAbove = (memberId: string, node: string) => columnBeyond(node, 1, memberId)

  /**
   * The section of the column continuing ABOVE a node — what the projecting
   * bars have to be cranked to meet.
   *
   * Where the storey above is smaller its bars stand further in, and a bar
   * cranked by a fixed diameter never reaches them. Same size, this changes
   * nothing.
   */
  const sectionAbove = (memberId: string, node: string): RectSection | undefined => {
    const here = pos.get(node)
    if (!here) return undefined
    const up = model.members.find((m) => {
      if (m.id === memberId || m.role !== 'column') return false
      if (m.i !== node && m.j !== node) return false
      const other = pos.get(m.i === node ? m.j : m.i)
      return !!other && other.y > here.y + 1e-6
    })
    return up ? secOf(up.id) : undefined
  }

  /**
   * A transverse beam at a node, and which way it runs across `mem` — where a
   * bar with nowhere vertical to hook can turn instead.
   */
  const sideBeamAt = (mem: { id: string; i: string; j: string }, node: string): 1 | -1 | undefined => {
    const here = pos.get(node), a = pos.get(mem.i), b = pos.get(mem.j)
    if (!here || !a || !b) return undefined
    const ux = b.x - a.x, uz = b.z - a.z
    const l = Math.hypot(ux, uz) || 1
    const px = -uz / l, pz = ux / l                 // across the beam, in plan
    for (const o of beamsAtNode.get(node) ?? []) {
      if (o.id === mem.id) continue
      const far = pos.get(o.i === node ? o.j : o.i)
      if (!far) continue
      const across = (far.x - here.x) * px + (far.z - here.z) * pz
      if (Math.abs(across) > 1e-6) return across > 0 ? 1 : -1
    }
    return undefined
  }

  /**
   * Where a roof column's hook has to run to pass UNDER the top steel of the
   * beams framing in, m relative to the node — NEGATIVE, because the node is
   * the top of the beam and that steel is just below it. The deepest beam
   * decides.
   */
  const beamTopSteelRise = (node: string, colBarDia: number): number | undefined => {
    const list = beamsAtNode.get(node) ?? []
    if (!list.length) return undefined
    let deep: RectSection | undefined
    for (const m of list) {
      const bs = secOf(m.id)
      if (!deep || bs.h > deep.h) deep = bs
    }
    if (!deep) return undefined
    // The beam's top steel sits just under the node, which is the top of the
    // beam; the column's hook has to go UNDER that steel, so the rise is
    // negative — the bar turns in below the node, not above it.
    return -(deep.cover + deep.tieDia + deep.barDia + colBarDia / 2) / 1000
  }

  /** Pedestal at a base node, m — the column between the node and the pad top. */
  const pedestalAt = new Map(design.footings.map((f) => [f.node, f.pedestal]))

  const cages: RebarCage[] = []
  const unplaced: string[] = []
  /** Splice options for a member, from its own concrete and steel. */
  const spliceOf = (sec: RectSection, barDia: number, prefer?: number[]) => {
    const dl = calcDevLength({
      db: barDia, fc: sec.fc, fy: sec.fy,
      topBar: false, epoxy: 'none', lambda: 1, cbKtr_db: 2.5,
    })
    return { stock: STOCK_BAR_LENGTH, lap: dl.ls_B / 1000, prefer }
  }

  for (const b of design.beams) {
    const mem = memById.get(b.id)
    const ni = mem && pos.get(mem.i), nj = mem && pos.get(mem.j)
    if (!mem || !ni || !nj) { unplaced.push(b.id); continue }
    const sec = secOf(b.id)
    const sag = b.sections.filter((s) => !s.hogging)
    const hog = b.sections.filter((s) => s.hogging)
    const spac = b.sections.map((s) => s.design.sAdopt).filter((v) => v > 0)
    // Bottom steel laps near the SUPPORTS and top steel near MIDSPAN — each
    // where its own bar is least stressed, the standard "50% of splices on each
    // side of the support" arrangement. One preference list serves both because
    // the two are complementary points on the same run.
    const beamSplice = spliceOf(sec, sec.barDia, [0.08, 0.5, 0.92])
    cages.push(spliceCage(buildBeamCage({
      mark: b.id, L: b.L,
      colBLeft: colWidthAt(mem.i), colBRight: colWidthAt(mem.j),
      b: sec.b, h: sec.h, cover: sec.cover, barDia: sec.barDia, stirrupDia: sec.tieDia,
      topBars: Math.max(0, ...hog.map((s) => s.design.bars)),
      botBars: Math.max(0, ...sag.map((s) => s.design.bars)),
      sEnd: spac.length ? Math.min(...spac) : 0,
      sMid: spac.length ? Math.max(...spac) : 0,
      continuousLeft: carriesOn(mem, mem.i),
      continuousRight: carriesOn(mem, mem.j),
      // Which way a hooked bar may turn: a tail leaving the top of the joint
      // needs a column above to sit in, and at a roof there is none.
      columnAboveLeft: columnBeyond(mem.i, 1),
      columnAboveRight: columnBeyond(mem.j, 1),
      columnBelowLeft: columnBeyond(mem.i, -1),
      columnBelowRight: columnBeyond(mem.j, -1),
      sideBeamLeft: sideBeamAt(mem, mem.i),
      sideBeamRight: sideBeamAt(mem, mem.j),
      // The support's own detailing, so the hook lands at the far face of the
      // confined core rather than at some assumed cover (§418.8.4.1).
      ...(() => {
        const cs = colAt(mem.i) ?? colAt(mem.j)
        const c = cs && secOf(cs.id)
        return c ? { colCover: c.cover, colTieDia: c.tieDia, colBarDia: c.barDia } : {}
      })(),
      axis: { x0: ni.x, z0: ni.z, x1: nj.x, z1: nj.z },
      // THE NODE IS THE TOP OF THE BEAM.
      //
      // It used to be read as the beam's centroid, so half the beam was drawn
      // above the node — through the column that starts there. A floor level is
      // the top of the beam, the columns meet at it, and the beam hangs below.
      ySoffit: ni.y - sec.h / 1000,
    }), beamSplice))
  }

  for (const c of design.columns) {
    const mem = memById.get(c.id)
    const ni = mem && pos.get(mem.i), nj = mem && pos.get(mem.j)
    if (!mem || !ni || !nj) { unplaced.push(c.id); continue }
    const sec = secOf(c.id)
    const yHi = Math.max(ni.y, nj.y)
    const topNode = ni.y >= nj.y ? mem.i : mem.j
    const baseNode = ni.y >= nj.y ? mem.j : mem.i
    // A column on a footing does not start at its base node: the pad's top is
    // the founding depth less its own thickness below that, and the column runs
    // down to meet it. Drawn from the node, that pedestal was missing from the
    // cage, the concrete and the bill alike.
    const yLo = Math.min(ni.y, nj.y) - (pedestalAt.get(baseNode) ?? 0)
    const jd = beamDepthAt(topNode)
    // …and the joint at the BASE, where a column starts at a floor rather than
    // on a footing. `yLo` is the pedestal bottom; the joint is at the node.
    const yLo0 = Math.min(ni.y, nj.y)
    const baseJd = beamDepthAt(baseNode)
    // §25.5.5 compression lap, only where a column actually continues above.
    const lap = columnAbove(c.id, topNode)
      ? calcDevLength({
          db: sec.barDia, fc: sec.fc, fy: sec.fy,
          topBar: false, epoxy: 'none', lambda: 1, cbKtr_db: 2.5,
        }).lsc
      : 0
    cages.push(spliceCage(buildColumnCage({
      mark: c.id, b: sec.b, h: sec.h, cover: sec.cover, spliceLap: lap,
      barDia: sec.barDia, bars: c.bars, tieDia: sec.tieDia,
      sConfined: c.tieSpacingFinal > 0 ? c.tieSpacingFinal : c.tieSpacing,
      sOutside: c.seismicSOut ?? c.tieSpacing,
      lo: c.seismicLoZone ?? 0,
      centre: [ni.x, ni.z],
      yBottom: yLo, yTop: yHi,
      // The joint band at EACH end that has one, which the joint's own hoops
      // own (§418.8.3). Only the top used to be cleared, so at every floor the
      // column starting there re-filled the band the column below had left
      // empty and the joint came out with both sets through it.
      // The beam hangs BELOW its node, so the joint band is the depth under it.
      jointGaps: [
        ...(jd > 0 ? [[yHi - jd, yHi] as [number, number]] : []),
        ...(baseJd > 0 ? [[yLo0 - baseJd, yLo0] as [number, number]] : []),
      ],
      // Nothing above to lap onto: the bar develops itself instead, turning in
      // under the beam's top steel (§425.4.2 and the standard roof detail).
      topHookRise: lap > 0 ? undefined : beamTopSteelRise(topNode, sec.barDia),
      // The bars above, so a reduction in column size cranks to meet them.
      ...(() => {
        const up = sectionAbove(c.id, topNode)
        return up && (up.b !== sec.b || (up.h ?? up.b) !== (sec.h ?? sec.b))
          ? { above: { b: up.b, h: up.h ?? up.b, cover: up.cover, barDia: up.barDia, tieDia: up.tieDia } }
          : {}
      })(),
      // A vertical is already lapped at the floor; a stock splice only appears
      // in a storey tall enough to need one, and belongs low, clear of the
      // hinge zone at the top.
    }), spliceOf(sec, sec.barDia, [0.35])))
  }

  // ── footings: the mat, and the dowels the column laps onto ──────────────
  //
  // Placed last because a dowel copies the column's own bar positions, so the
  // column has to have been resolved first. A footing whose column is missing
  // is reported unplaced rather than given a guessed cage.
  for (const f of design.footings) {
    const col = model.members.find((m) => m.role === 'column' && (m.i === f.node || m.j === f.node))
    const at = pos.get(f.node)
    if (!col || !at) { unplaced.push(`footing@${f.node}`); continue }
    const sec = secOf(col.id)
    const cd = design.columns.find((c) => c.id === col.id)
    const lap = calcDevLength({
      db: sec.barDia, fc: sec.fc, fy: sec.fy,
      topBar: false, epoxy: 'none', lambda: 1, cbKtr_db: 2.5,
    }).lsc
    cages.push(spliceCage(buildFootingCage({
      mark: `F-${f.node}`,
      B: f.design.B, Dc: f.design.Dc, cover: FOOTING_COVER,
      barDia: f.barDia, bars: f.design.bars,
      centre: [at.x, at.z],
      // the pad's top is the pedestal below the column's base node
      yTop: Math.min(pos.get(col.i)?.y ?? at.y, pos.get(col.j)?.y ?? at.y) - f.pedestal,
      colBars: perimeterBars({
        b: sec.b, h: sec.h, cover: sec.cover,
        barDia: sec.barDia, bars: cd?.bars ?? 4, tieDia: sec.tieDia,
      }),
      colBarDia: sec.barDia,
      lap,
    }), spliceOf(sec, f.barDia)))
  }

  return { cages, unplaced }
}
