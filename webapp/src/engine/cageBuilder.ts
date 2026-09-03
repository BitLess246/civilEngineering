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
import { buildSlabCage, type SlabCageDir } from './slabCage'
import { buildStairCage } from './stairCage'
import { placeStair } from './stairPlacement'
import { spliceCage } from './barSplice'
import { STOCK_BAR_LENGTH } from './rebarModel'
import type { CageKind, RebarCage } from './rebarModel'
import { beamMomentRatios, momentRatioLimits, type BeamMomentRatios } from './beamMomentRatios'

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
  const memberAbove = (memberId: string, node: string) => {
    const here = pos.get(node)
    if (!here) return undefined
    return model.members.find((m) => {
      if (m.id === memberId || m.role !== 'column') return false
      if (m.i !== node && m.j !== node) return false
      const other = pos.get(m.i === node ? m.j : m.i)
      return !!other && other.y > here.y + 1e-6
    })
  }
  const sectionAbove = (memberId: string, node: string): RectSection | undefined => {
    const up = memberAbove(memberId, node)
    return up ? secOf(up.id) : undefined
  }

  /**
   * How far past the floor the bars run before they lap, m — §418.7.4.3.
   *
   * A column lap splice belongs in the CENTRE HALF of the column it sits in, so
   * the bars below carry on up into the storey above and lap there. A quarter
   * of that column's height puts the lap at the bottom of its middle half; if
   * the lap is long enough to run out the top of the window it is centred on
   * the storey instead, which is the best that height allows.
   */
  const spliceRiseAbove = (memberId: string, node: string, lap: number): number => {
    const up = memberAbove(memberId, node)
    const a = up && pos.get(up.i), b = up && pos.get(up.j)
    if (!a || !b) return 0
    const hStorey = Math.abs(b.y - a.y)
    if (hStorey <= 0) return 0
    return lap <= hStorey / 2 ? hStorey / 4 : Math.max(0, (hStorey - lap) / 2)
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
  /** Push a cage, tagged with the kind of element it belongs to — the tag a
   *  viewer filters on, so it is stated here rather than guessed from the mark. */
  const add = (kind: CageKind, cage: RebarCage) => { cages.push({ ...cage, kind }) }
  const unplaced: string[] = []
  /** Splice options for a member, from its own concrete and steel. */
  const spliceOf = (
    sec: RectSection, barDia: number,
    prefer?: number[], preferByRole?: Record<string, number[]>,
  ) => {
    const dl = calcDevLength({
      db: barDia, fc: sec.fc, fy: sec.fy,
      topBar: false, epoxy: 'none', lambda: 1, cbKtr_db: 2.5,
    })
    return { stock: STOCK_BAR_LENGTH, lap: dl.ls_B / 1000, prefer, preferByRole }
  }

  for (const b of design.beams) {
    const mem = memById.get(b.id)
    const ni = mem && pos.get(mem.i), nj = mem && pos.get(mem.j)
    if (!mem || !ni || !nj) { unplaced.push(b.id); continue }
    const sec = secOf(b.id)
    const sag = b.sections.filter((s) => !s.hogging)
    const hog = b.sections.filter((s) => s.hogging)
    // WHICH SPACING GOES WHERE — positionally, not by extremes.
    //
    // `sEnd` and `sMid` are documented as "the spacing at the supports and
    // through the middle", and taking min/max of every section instead read
    // them as extremes. Midspan needs no shear steel, so its `sAdopt` is 0 and
    // was filtered out; `max` then fell back to an END value and the middle
    // was detailed to a support's requirement. Conservative, but it also meant
    // the two were equal on a symmetric beam, so the 2h zone the whole layout
    // exists to create never appeared.
    //
    // At a support the spacing is `sHinge` — `sAdopt` capped by §418.6.4.4
    // (SMF) or §418.4.2.4 (IMF), which shear demand alone never reaches.
    const atEnds = b.sections.filter((s) => s.hogging)
    const atMid = b.sections.filter((s) => !s.hogging)
    const ends = atEnds.map((s) => s.design.sHinge).filter((v) => v > 0)
    const mids = atMid.map((s) => s.design.sAdopt).filter((v) => v > 0)
    // Fall back across the two rather than to a default: a beam with only
    // hogging sections still needs a middle, and vice versa.
    const spac = b.sections.map((s) => s.design.sAdopt).filter((v) => v > 0)
    const sEndMm = ends.length ? Math.min(...ends) : (spac.length ? Math.min(...spac) : 0)
    const sMidMm = mids.length ? Math.max(...mids) : (spac.length ? Math.max(...spac) : 0)
    // WHERE EACH FACE MAY BE SPLICED — and the two faces are OPPOSITE.
    //
    // A top bar is in tension over the supports, so it laps in the MIDDLE HALF
    // and never in an end quarter. A bottom bar is in tension at midspan, so it
    // laps in an END QUARTER and never in the middle half. That is the standard
    // bar-bending sheet's "avoid splicing in this region" on both faces.
    //
    // One shared list used to serve both, which offered every bar both zones —
    // so whichever the geometry picked, half the splices landed in the zone the
    // rule exists to keep them out of.
    const beamSplice = spliceOf(sec, sec.barDia, [0.5], {
      top: [0.5],                       // middle half
      bottom: [0.125, 0.875],           // end quarters
    })
    add('beam', spliceCage(buildBeamCage({
      // The cage is told how its bars WILL be lapped, so it can close the
      // stirrups up through each lap before it places them.
      splice: beamSplice,
      mark: b.id, L: b.L,
      colBLeft: colWidthAt(mem.i), colBRight: colWidthAt(mem.j),
      b: sec.b, h: sec.h, cover: sec.cover, barDia: sec.barDia, stirrupDia: sec.tieDia,
      topBars: Math.max(0, ...hog.map((s) => s.design.bars)),
      botBars: Math.max(0, ...sag.map((s) => s.design.bars)),
      sEnd: sEndMm,
      sMid: sMidMm,
      // Which §418 curtailment the faces obey — see `BeamCageInput.system`.
      system: design.system,
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
      // The column concrete the end hooks develop in, so the cage itself can
      // say when a bar does not develop — see `BeamCageInput.jointConcrete`.
      ...(() => {
        const col = colAt(mem.i) ?? colAt(mem.j)
        const cs = col && secOf(col.id)
        return cs && Number.isFinite(cs.fc) && Number.isFinite(cs.fy)
          ? { jointConcrete: { fc: cs.fc, fy: cs.fy, colH: Math.min(cs.b, cs.h ?? cs.b) } }
          : {}
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
    add('column', spliceCage(buildColumnCage({
      mark: c.id, b: sec.b, h: sec.h, cover: sec.cover, spliceLap: lap,
      spliceRise: lap > 0 ? spliceRiseAbove(c.id, topNode, lap / 1000) : 0,
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
    add('footing', spliceCage(buildFootingCage({
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

  // ── slabs: both mats of every designed panel ────────────────────────────
  //
  // The one element covering the whole floor was the one drawn bare. Each
  // panel's steel comes from its OWN DDM strips — the spacing the design
  // adopted, per strip, per direction — so the cage cannot disagree with the
  // schedule beside it.
  //
  // A panel is placed only when its four corners really do make an axis-aligned
  // rectangle: the DDM is a rectangular-panel method, and a mat laid out on a
  // skewed quadrilateral as though it were rectangular would be steel drawn
  // where there is no concrete. Anything else is reported, not guessed at.
  //
  // NOT billed here. `takeoff` still measures slab steel from the DDM strip
  // areas and never asks for a plate's cage, so nothing is counted twice;
  // moving that bill onto these bars would replace its 0.3·ln approximation
  // with real cut lengths, and is a change to the ESTIMATE rather than to the
  // drawing.
  for (const sl of design.slabs) {
    const pl = model.plates.find((p) => p.id === sl.plate)
    const ns = pl?.corners.map((cid) => pos.get(cid))
    if (!pl || !ns || ns.some((p) => !p)) { unplaced.push(`slab@${sl.plate}`); continue }
    const xs = ns.map((p) => p!.x), zs = ns.map((p) => p!.z), ys = ns.map((p) => p!.y)
    const x0 = Math.min(...xs), x1 = Math.max(...xs)
    const z0 = Math.min(...zs), z1 = Math.max(...zs)
    const rect = ns.every((p) =>
      (Math.abs(p!.x - x0) < 1e-6 || Math.abs(p!.x - x1) < 1e-6)
      && (Math.abs(p!.z - z0) < 1e-6 || Math.abs(p!.z - z1) < 1e-6))
    const flat = Math.max(...ys) - Math.min(...ys) < 1e-6
    if (!rect || !flat || x1 - x0 < 1e-6 || z1 - z0 < 1e-6) {
      unplaced.push(`slab@${sl.plate}`); continue
    }
    const sec = model.sections[0] ?? FALLBACK
    /**
     * Width of the beam framing one edge of the panel, m.
     *
     * The panel's edge is the supporting beam's CENTRELINE, so this width is
     * what decides how far the bottom mat may carry past that edge before it
     * leaves the concrete. One width for all four edges — which is what
     * `model.sections[0]` was — has no reason to be the width of the beam the
     * bar actually ends in, and where it was the wider of them the bar was
     * drawn outside the narrower beam's face.
     *
     * The narrowest beam on the edge decides, for the same reason. `undefined`
     * where no beam runs along the edge at the panel's own level (a wall, or an
     * unsupported edge), and `buildSlabCage` falls back to `support`.
     */
    const edgeBeams = (axis: 'x' | 'z', at: number, lo: number, hi: number): RectSection[] => {
      const y = ys[0]!
      const out: RectSection[] = []
      for (const m of model.members) {
        if (!isBeam(m.role)) continue
        const a = pos.get(m.i), b = pos.get(m.j)
        if (!a || !b) continue
        const on = (p: { x: number; y: number; z: number }) =>
          Math.abs((axis === 'x' ? p.x : p.z) - at) < 1e-6 && Math.abs(p.y - y) < 1e-6
        if (!on(a) || !on(b)) continue
        // Only the stretch of the line the panel actually sits against: a beam
        // further along the same gridline supports a different panel.
        const u0 = axis === 'x' ? a.z : a.x, u1 = axis === 'x' ? b.z : b.x
        if (Math.min(u0, u1) > hi - 1e-6 || Math.max(u0, u1) < lo + 1e-6) continue
        out.push(secOf(m.id))
      }
      return out
    }
    /** Narrowest beam on an edge — see `edgeBeams`. */
    const edgeWidth = (axis: 'x' | 'z', at: number, lo: number, hi: number): number | undefined => {
      const w = edgeBeams(axis, at, lo, hi).map((sec) => sec.b / 1000)
      return w.length ? Math.min(...w) : undefined
    }
    /**
     * Level of the TOP of the framing beams' top bars, m — what the slab's top
     * mat rests on, and what its bottom bar hooks over at a free edge.
     *
     * A beam's node line IS its top face (`levelDrop`), and `beamCage` insets
     * its top bar by cover + stirrup + half a diameter from there, so the top
     * of that bar is cover + stirrup below the node.
     *
     * The HIGHEST across the four edges, not the average or the nearest: the
     * mat is one plane laid across all of them, so it comes to rest on
     * whichever bar stands proudest. With one section for the whole frame — the
     * usual case — every edge gives the same answer and the choice does not
     * arise.
     */
    const supportBarTop = (() => {
      const secs = [
        ...edgeBeams('x', x0, z0, z1), ...edgeBeams('x', x1, z0, z1),
        ...edgeBeams('z', z0, x0, x1), ...edgeBeams('z', z1, x0, x1),
      ]
      if (!secs.length) return undefined
      return ys[0]! - Math.min(...secs.map((sec) => (sec.cover + sec.tieDia) / 1000))
    })()
    // The DDM names its directions by the panel's own short/long sides, so map
    // each back onto the model axis it actually runs along before placing bars.
    const dd = sl.design
    const dirFor = (len: number): SlabCageDir => {
      const r = Math.abs(dd.x.l1 - len) <= Math.abs(dd.y.l1 - len) ? dd.x : dd.y
      const at = (name: string) => r.locations.find((l) => l.name === name)
      const pos1 = at('+M'), neg = at('Int −M') ?? at('Ext −M') ?? at('Support −M')
      return {
        ln: r.ln, csWidth: r.csWidth,
        botCs: pos1?.column.spacing ?? 200, botMs: pos1?.middle.spacing ?? 250,
        topCs: neg?.column.spacing ?? 200, topMs: neg?.middle.spacing ?? 250,
      }
    }
    // Which edges another panel carries on past. It decides what the top mat
    // does there — half a shared bar at a continuous edge, a bar turned down
    // into the support at a free one — and without it every interior support
    // is drawn with two top mats, one from each side.
    const shares = (a: string, b: string) => model.plates.some((q) =>
      q.id !== pl.id && q.role !== 'wall' && q.corners.includes(a) && q.corners.includes(b))
    const cornerAt = (fx: number, fz: number) =>
      pl.corners.find((cid) => {
        const q = pos.get(cid)!
        return Math.abs(q.x - fx) < 1e-6 && Math.abs(q.z - fz) < 1e-6
      })
    const edgeShared = (fx0: number, fz0: number, fx1: number, fz1: number) => {
      const a = cornerAt(fx0, fz0), b = cornerAt(fx1, fz1)
      return a !== undefined && b !== undefined && shares(a, b)
    }
    // Slab bars are spliced like every other bar: a mat across a 9 m panel is
    // two stock bars lapped, not one 9 m piece, and the lap is steel that has
    // to be drawn and paid for. Bottom bars lap near the supports (the end
    // eighths) and top bars near midspan — §25.5.2's arrangement, the same one
    // the beams use.
    add('slab', spliceCage(buildSlabCage({
      mark: sl.plate,
      x0, x1, z0, z1, yTop: ys[0]!,
      h: dd.h, cover: 20, barDia: sl.barDia,
      x: dirFor(x1 - x0), z: dirFor(z1 - z0),
      support: Math.min(sec.b, sec.h) / 1000,
      supportBarTop,
      edgeSupport: {
        xLo: edgeWidth('x', x0, z0, z1), xHi: edgeWidth('x', x1, z0, z1),
        zLo: edgeWidth('z', z0, x0, x1), zHi: edgeWidth('z', z1, x0, x1),
      },
      edges: {
        xLo: edgeShared(x0, z0, x0, z1), xHi: edgeShared(x1, z0, x1, z1),
        zLo: edgeShared(x0, z0, x1, z0), zHi: edgeShared(x0, z1, x1, z1),
      },
    }), spliceOf(sec, sl.barDia, [0.5], {
      top: [0.5],                       // middle half
      bottom: [0.125, 0.875],           // end eighths, over the supports
    })))
  }

  // ── stairs: the steel in each flight ────────────────────────────────────
  //
  // A flight is a one-way slab spanning up the slope, and its cage comes from
  // the same `designStair` row the schedule prints — so the bars drawn are the
  // bars designed. Placement is `placeStair`'s, the same geometry the loads
  // were built on.
  for (const st of design.stairs) {
    const model_st = (model.stairs ?? []).find((x) => x.id === st.id)
    const p = model_st && placeStair(model, model_st)
    if (!model_st || !p) { unplaced.push(`stair@${st.id}`); continue }
    add('stair', buildStairCage({
      mark: st.id, placed: p, cover: 20,
      mainDia: 12, distDia: 10,
      mainSpacing: st.design.mainSpacing, distSpacing: st.design.distSpacing,
      support: model_st.support,
    }))
  }

  return { cages, unplaced }
}

// ─────────────────────────────────────────────────────────────────────────
// THE MOMENT-STRENGTH RATIOS, ON THE PLACED CAGES
//
// §418.6.3.2 (SMF) and §418.4.2.2 (IMF) are rules about the strength a beam
// PROVIDES, so they can only be checked once the bars exist. That is here and
// not in the pipeline: the pipeline designs each section against its own
// demand and never learns what ran through from the neighbouring one, and the
// optimizer would pay for a cage on every trial if the check lived in
// `designOK`. A caller that wants the check asks for it.
// ─────────────────────────────────────────────────────────────────────────

/** One beam's ratio check, against the span it was measured on. */
export interface BeamRatioRow {
  /** Member id — the same mark the cage carries. */
  id: string
  /** Clear span checked, m (support face to support face). */
  Ln: number
  ratios: BeamMomentRatios
}

/**
 * Check every concrete beam's strength envelope against the ratios its lateral
 * system imposes. Empty for a gravity design, which has no reversal rule.
 *
 * The stations are the two JOINT FACES and the span between them — half the
 * column sits inside each end of the beam, and "at the face of the joint" is
 * where the clause measures.
 */
export function structureMomentRatios(
  model: StructuralModel, design: StructureDesign, cages: RebarCage[],
): BeamRatioRow[] {
  if (!momentRatioLimits(design.system)) return []
  const pos = new Map(model.nodes.map((n) => [n.id, n]))
  const memById = new Map(model.members.map((m) => [m.id, m]))
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const byMember = new Map<string, RebarCage>()
  for (const c of cages) if (!byMember.has(c.member)) byMember.set(c.member, c)

  /** Half the plan width of the column at a node, m — 0 where none frames in. */
  const halfCol = (node: string): number => {
    const col = model.members.find((m) => m.role === 'column' && (m.i === node || m.j === node))
    const cs = col && secById.get(memById.get(col.id)?.section ?? '')
    return cs ? Math.min(cs.b, cs.h) / 2000 : 0
  }

  const rows: BeamRatioRow[] = []
  for (const b of design.beams) {
    const mem = memById.get(b.id)
    const ni = mem && pos.get(mem.i), nj = mem && pos.get(mem.j)
    const cage = byMember.get(b.id)
    const sec = secById.get(mem?.section ?? '')
    if (!mem || !ni || !nj || !cage || !sec) continue
    const dx = nj.x - ni.x, dz = nj.z - ni.z
    const span = Math.hypot(dx, dz)
    if (span < 1e-6) continue                        // a vertical member is no beam
    const u0 = halfCol(mem.i), u1 = span - halfCol(mem.j)
    if (!(u1 > u0)) continue
    const r = beamMomentRatios(
      {
        cage, along: [dx / span, 0, dz / span], origin: [ni.x, ni.y, ni.z],
        b: sec.b / 1000, h: sec.h / 1000, soffit: ni.y - sec.h / 1000,
      },
      u0, u1, sec.fc, sec.fy, design.system,
    )
    if (r.applies) rows.push({ id: b.id, Ln: u1 - u0, ratios: r })
  }
  return rows
}
