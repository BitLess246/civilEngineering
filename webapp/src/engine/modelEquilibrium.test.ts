// Statics of the whole Model Space pipeline (model → bridge → frame3d → stitch),
// checked from the MODEL's own loads rather than the bridge's: ΣF and ΣM about
// the origin must close, and a cantilever's root actions must be the statics
// values. Each variant is a route by which a load can be moved — split beams
// under a mesh, rigid end zones (nodal couples), diaphragm ties, spring bases.
// Written after the standalone beam calculator turned out to drop overhang
// loads, double count a load on a support and flip a couple's sign: none of
// those exist here, and this keeps it that way.
// Units: m, kN, kN·m.
import { describe, it, expect, vi } from 'vitest'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { runModelAnalysis } from './modelAnalysis'
import { equilibriumRows } from '../lib/analysisAppendix'
import type { RectSection, StructuralModel, ModelLoad } from './model'

vi.setConfig({ testTimeout: 60_000 })

const section: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const DL = 1.4   // 1.4D — every load below is dead

/** An asymmetric 2×1-bay, 2-storey frame with generated gravity loads. */
function base(): StructuralModel {
  const m = generateGridModel({ baysX: [6, 5], baysZ: [5], storeyH: [3, 3], section, slabThickness: 150 })
  m.loads = [...buildGravityLoads(m, 1.5, 2.4)]
  return m
}
const firstBeam = (m: StructuralModel) => m.members.find((q) => q.role === 'beam' || q.role === 'girder')!

/** The dead loads as point forces at their resultants — from model geometry only. */
function resultants(m: StructuralModel): { W: number; x: number; z: number }[] {
  const pos = new Map(m.nodes.map((n) => [n.id, n]))
  const out: { W: number; x: number; z: number }[] = []
  for (const l of m.loads as ModelLoad[]) {
    if (l.cat !== 'D') continue
    if (l.kind === 'member-udl' || l.kind === 'member-point') {
      const mb = m.members.find((q) => q.id === l.member)!
      const a = pos.get(mb.i)!, b = pos.get(mb.j)!
      const t = l.kind === 'member-point' ? l.t : 0.5
      const W = l.kind === 'member-point' ? l.P : l.w * Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
      out.push({ W, x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) })
    } else if (l.kind === 'area') {
      // the generated panels are horizontal rectangles: resultant at the centroid
      const p = m.plates.find((q) => q.id === l.plate)!.corners.map((id) => pos.get(id)!)
      const xs = p.map((q) => q.x), zs = p.map((q) => q.z)
      const A = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs))
      out.push({ W: l.q * A, x: xs.reduce((s, v) => s + v, 0) / 4, z: zs.reduce((s, v) => s + v, 0) / 4 })
    } else if (l.kind === 'node') {
      const n = pos.get(l.node)!
      out.push({ W: -(l.Fy ?? 0), x: n.x, z: n.z })
    }
  }
  return out
}

function solve(m: StructuralModel) {
  const r = runModelAnalysis({ model: m, opts: {}, drift: { hasSeis: false, T: 0, R: 8.5, axis: 'x', pDelta: false } })
  const run = r.analysis!.perCombo.find((c) => c.combo.name === '1.4D')!
  return { analysis: r.analysis!, res: run.result! }
}

/** ΣF and ΣM (about the origin) of reactions + applied loads, and the scale to judge them by. */
function closes(m: StructuralModel) {
  const { analysis, res } = solve(m)
  const pos = new Map(m.nodes.map((n) => [n.id, n]))
  const loads = resultants(m)
  let fy = 0, mx = 0, mz = 0, scaleF = 0, scaleM = 0
  for (const { W, x, z } of loads) {
    const Fy = -DL * W          // r × (0, Fy, 0) = (−z·Fy, 0, x·Fy)
    fy += Fy; mx += -z * Fy; mz += x * Fy
    scaleF += Math.abs(Fy); scaleM += Math.abs(x * Fy) + Math.abs(z * Fy)
  }
  for (const q of res.reactions) {
    const n = pos.get(q.node)!
    fy += q.F[1]
    mx += n.y * q.F[2] - n.z * q.F[1] + q.M[0]
    mz += n.x * q.F[1] - n.y * q.F[0] + q.M[2]
  }
  const eq = equilibriumRows(m, analysis)
  return { fy: fy / scaleF, mx: mx / scaleM, mz: mz / scaleM, appendixWorst: Math.max(...eq.map((e) => e.residualPct)) }
}

describe('Model Space statics close from the model\'s own loads (1.4D)', () => {
  const pointLoads = (m: StructuralModel): StructuralModel => ({
    ...m,
    // t = 0.5 lands on a mesh junction at n = 2 (must go to exactly one part);
    // t = 0.02 / 0.985 sit inside the rigid end zones (nodal-couple path)
    loads: [...m.loads, ...[[0.5, 40], [0.3, 25], [0.02, 60], [0.985, 45]].map(([t, P]) =>
      ({ kind: 'member-point' as const, member: firstBeam(m).id, t, P, cat: 'D' as const }))],
  })
  const variants: [string, () => StructuralModel][] = [
    ['tributary frame', base],
    ['meshed slab n = 3 (split beams)', () => ({ ...base(), shellElements: true, shellSubdiv: 3 })],
    ['rigid end zones', () => ({ ...base(), rigidEndZones: true })],
    ['rigid diaphragm', () => ({ ...base(), diaphragm: true })],
    ['mesh + zones + diaphragm', () => ({ ...base(), shellElements: true, shellSubdiv: 2, rigidEndZones: true, diaphragm: true })],
    ['point loads on a split beam', () => pointLoads({ ...base(), shellElements: true, shellSubdiv: 2 })],
    ['point loads inside rigid zones', () => pointLoads({ ...base(), rigidEndZones: true })],
    ['spring base support', () => {
      const m = base(), s = m.supports[1]
      m.supports = m.supports.map((q) => (q === s ? { node: q.node, fixity: 'spring' as const, kx: 1e5, ky: 2e4, kz: 1e5 } : q))
      return m
    }],
  ]
  for (const [name, make] of variants) {
    it(name, () => {
      const c = closes(make())
      expect(Math.abs(c.fy)).toBeLessThan(1e-9)
      expect(Math.abs(c.mx)).toBeLessThan(1e-9)
      expect(Math.abs(c.mz)).toBeLessThan(1e-9)
      expect(c.appendixWorst).toBeLessThan(1e-6)   // the report's own C.1 check agrees
    })
  }
})

describe('a cantilever overhang carries its load to the root', () => {
  // 2 m overhang off the roof corner: w = 10 kN/m and P = 20 kN at the tip (added after the
  // gravity loads were generated, so it carries no self weight of its own)
  function withCantilever(rigidEndZones: boolean): StructuralModel {
    const m = { ...base(), rigidEndZones }
    const top = Math.max(...m.nodes.map((n) => n.y))
    const corner = m.nodes.filter((n) => n.y === top).sort((a, b) => b.x - a.x || a.z - b.z)[0]
    m.nodes = [...m.nodes, { id: 'tip', x: corner.x + 2, y: top, z: corner.z }]
    m.members = [...m.members, { id: 'cant', i: corner.id, j: 'tip', role: 'beam', section: firstBeam(m).section }]
    m.loads = [...m.loads, { kind: 'member-udl', member: 'cant', w: 10, cat: 'D' }, { kind: 'member-point', member: 'cant', t: 1, P: 20, cat: 'D' }]
    return m
  }
  const actions = (m: StructuralModel) => {
    const c = solve(m).res.members.find((q) => q.id === 'cant')!
    return { M0: Math.abs(c.Mz[0]), V0: Math.abs(c.Vy[0]), Mtip: Math.abs(c.Mz[c.Mz.length - 1]) }
  }

  it('node to node: M = 1.4(wL²/2 + PL), V = 1.4(wL + P), M_tip = 0', () => {
    const { M0, V0, Mtip } = actions(withCantilever(false))
    expect(M0).toBeCloseTo(DL * (10 * 4 / 2 + 20 * 2), 6)
    expect(V0).toBeCloseTo(DL * (10 * 2 + 20), 6)
    expect(Mtip).toBeCloseTo(0, 9)
    expect(Math.abs(closes(withCantilever(false)).mz)).toBeLessThan(1e-9)
  })

  it('with rigid zones the diagram starts at the column face, and still closes', () => {
    const m = withCantilever(true)
    const { M0, V0 } = actions(m)
    // the face sits u = 2 − r from the tip; V and M must belong to the SAME u
    const u = (V0 / DL - 20) / 10
    expect(u).toBeGreaterThan(1.5); expect(u).toBeLessThan(2)
    expect(M0).toBeCloseTo(DL * (10 * u * u / 2 + 20 * u), 6)
    expect(Math.abs(closes(m).mz)).toBeLessThan(1e-9)
  })
})
