import { describe, it, expect } from 'vitest'
import { pushoverAnalysis, type PushoverInput } from './pushover'
import { solveFrame3D, rectJ, type F3Node, type F3Member, type F3Support } from './frame3d'

const E = 25000, G = E / 2.4
const b = 300, h = 500
const A = b * h, Iz = (b * h ** 3) / 12, Iy = (h * b ** 3) / 12, J = rectJ(b, h)
const sec = { E, G, A, Iy, Iz, J }
const EIz = E * Iz * 1e-9   // kN·m²

describe('pushover — horizontal cantilever (single Mz hinge at base)', () => {
  // member along X, fixed at i; lateral tip load in −Y bends about Z (Mz).
  const L = 3, Mp = 60
  const nodes: F3Node[] = [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: L, y: 0, z: 0 }]
  const members: F3Member[] = [{ id: 'm', i: 'a', j: 'b', ...sec }]
  const supports: F3Support[] = [{ node: 'a', fixity: 'fixed' }]
  const input: PushoverInput = {
    nodes, members, supports,
    Mp: { m: Mp },
    pattern: { b: -1 },     // 1 kN downward (−Y) at the tip
    dir: 1,                  // control/push direction = Y
    controlNode: 'b',
  }

  it('first hinge forms at the base, then mechanism (pinned base → unstable)', () => {
    const r = pushoverAnalysis(input)
    expect(r.curve.length).toBe(2)          // origin + one yield event
    expect(r.mechanism).toBe(true)
    expect(r.hinges).toHaveLength(1)
    expect(r.hinges[0]).toMatchObject({ member: 'm', end: 'i', axis: 'z' })
  })

  it('capacity base shear = Mp / L and roof disp = Mp·L²/(3EIz)', () => {
    const r = pushoverAnalysis(input)
    const yield_ = r.curve[1]
    expect(Math.abs(yield_.baseShear)).toBeCloseTo(Mp / L, 6)             // base moment V·L = Mp
    expect(Math.abs(yield_.roofDisp)).toBeCloseTo((Mp * L * L) / (3 * EIz), 6)
  })
})

describe('pushover — fixed–fixed beam, central load (limit load 8·Mp/L)', () => {
  // A---C---B, both ends built in, point load at midspan C. Elastic end and
  // centre moments are equal (PL/8) so three hinges form ~together; the plastic
  // collapse load is P_u = 8·Mp/L (textbook). bends about Mz.
  const L = 4, Mp = 60
  const nodes: F3Node[] = [
    { id: 'a', x: 0, y: 0, z: 0 }, { id: 'c', x: L / 2, y: 0, z: 0 }, { id: 'bb', x: L, y: 0, z: 0 },
  ]
  const members: F3Member[] = [
    { id: 'ac', i: 'a', j: 'c', ...sec }, { id: 'cb', i: 'c', j: 'bb', ...sec },
  ]
  const supports: F3Support[] = [{ node: 'a', fixity: 'fixed' }, { node: 'bb', fixity: 'fixed' }]
  const input: PushoverInput = {
    nodes, members, supports,
    Mp: { ac: Mp, cb: Mp },
    pattern: { c: -1 },      // unit downward load at midspan
    dir: 1,
    controlNode: 'c',
  }

  it('collapses at P_u ≈ 8·Mp/L with a mechanism', () => {
    const r = pushoverAnalysis(input)
    expect(r.mechanism).toBe(true)
    const peak = Math.max(...r.curve.map((p) => Math.abs(p.baseShear)))
    expect(peak).toBeCloseTo((8 * Mp) / L, 3)
  })

  it('first yield matches the elastic peak-moment demand (Mp / max elastic M per unit load)', () => {
    const r = pushoverAnalysis(input)
    // independent elastic solve under the same unit pattern
    const el = solveFrame3D(nodes, members, supports, [{ kind: 'node', node: 'c', Fy: -1, cat: 'E' }])!
    const maxM = Math.max(
      ...el.members.flatMap((m) => [Math.abs(m.Mz[0]), Math.abs(m.Mz[m.Mz.length - 1])]),
    )
    expect(Math.abs(r.curve[1].baseShear)).toBeCloseTo(Mp / maxM, 4)
  })
})

describe('pushover — fixed-base portal frame', () => {
  const span = 6, height = 4, Mp = 120
  const nodes: F3Node[] = [
    { id: 'bl', x: 0, y: 0, z: 0 }, { id: 'br', x: span, y: 0, z: 0 },
    { id: 'tl', x: 0, y: height, z: 0 }, { id: 'tr', x: span, y: height, z: 0 },
  ]
  const beamSec = { E: E * 100, G: G * 100, A, Iy, Iz, J }   // strong beam → column hinges
  const members: F3Member[] = [
    { id: 'cL', i: 'bl', j: 'tl', ...sec }, { id: 'cR', i: 'br', j: 'tr', ...sec },
    { id: 'bm', i: 'tl', j: 'tr', ...beamSec },
  ]
  const supports: F3Support[] = [{ node: 'bl', fixity: 'fixed' }, { node: 'br', fixity: 'fixed' }]
  const input: PushoverInput = {
    nodes, members, supports,
    Mp: { cL: Mp, cR: Mp },         // beam stays elastic
    pattern: { tl: 1 }, dir: 0, controlNode: 'tr', maxEvents: 20,
  }

  it('forms a column-sway mechanism with four My hinges', () => {
    const r = pushoverAnalysis(input)
    expect(r.mechanism).toBe(true)
    expect(r.hinges.length).toBe(4)
    expect(r.hinges.every((hg) => (hg.member === 'cL' || hg.member === 'cR') && hg.axis === 'y')).toBe(true)
  })

  it('first yield = Mp / (max elastic column moment per unit load)', () => {
    const r = pushoverAnalysis(input)
    const el = solveFrame3D(nodes, members, supports, [{ kind: 'node', node: 'tl', Fx: 1, cat: 'E' }])!
    const maxM = Math.max(
      ...['cL', 'cR'].map((id) => {
        const m = el.members.find((x) => x.id === id)!
        return Math.max(Math.abs(m.My[0]), Math.abs(m.My[m.My.length - 1]))
      }),
    )
    expect(Math.abs(r.curve[1].baseShear)).toBeCloseTo(Mp / maxM, 3)
  })

  it('capacity curve: displacement increases and secant stiffness never increases', () => {
    const r = pushoverAnalysis(input)
    const pts = r.curve
    for (let k = 1; k < pts.length; k++)
      expect(Math.abs(pts[k].roofDisp)).toBeGreaterThan(Math.abs(pts[k - 1].roofDisp) - 1e-12)
    const stiff: number[] = []
    for (let k = 1; k < pts.length; k++) {
      const dV = Math.abs(pts[k].baseShear) - Math.abs(pts[k - 1].baseShear)
      const dD = Math.abs(pts[k].roofDisp) - Math.abs(pts[k - 1].roofDisp)
      if (dD > 1e-12) stiff.push(dV / dD)
    }
    for (let k = 1; k < stiff.length; k++)
      expect(stiff[k]).toBeLessThanOrEqual(stiff[k - 1] + 1e-6)
  })

  it('respects targetDisp early stop', () => {
    const r = pushoverAnalysis({ ...input, targetDisp: 1e-4 })
    const last = r.curve[r.curve.length - 1]
    expect(Math.abs(last.roofDisp)).toBeGreaterThanOrEqual(1e-4)
    expect(r.curve.length).toBeLessThanOrEqual(5)
  })
})

describe('pushover — guards', () => {
  const nodes: F3Node[] = [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 3, y: 0, z: 0 }]
  const members: F3Member[] = [{ id: 'm', i: 'a', j: 'b', ...sec }]
  const supports: F3Support[] = [{ node: 'a', fixity: 'fixed' }]

  it('zero load pattern returns only the origin', () => {
    const r = pushoverAnalysis({ nodes, members, supports, Mp: { m: 60 }, pattern: { b: 0 }, controlNode: 'b' })
    expect(r.curve).toHaveLength(1)
    expect(r.mechanism).toBe(false)
  })

  it('no Mp assigned → stays elastic (origin only, not a mechanism)', () => {
    const r = pushoverAnalysis({ nodes, members, supports, Mp: {}, pattern: { b: -1 }, dir: 1, controlNode: 'b' })
    expect(r.curve).toHaveLength(1)
    expect(r.hinges).toHaveLength(0)
    expect(r.mechanism).toBe(false)
  })
})

describe('pushover — P–M interaction reduces hinge capacity', () => {
  // Portal frame: a lateral push induces overturning ⇒ axial in the columns
  // (windward tension, leeward compression). With P–M active the columns hinge
  // at the reduced Mpc(P) < Mp, so the collapse base shear drops.
  const span = 6, height = 4, Mp = 120
  const nodes: F3Node[] = [
    { id: 'bl', x: 0, y: 0, z: 0 }, { id: 'br', x: span, y: 0, z: 0 },
    { id: 'tl', x: 0, y: height, z: 0 }, { id: 'tr', x: span, y: height, z: 0 },
  ]
  const beamSec = { E: E * 100, G: G * 100, A, Iy, Iz, J }
  const members: F3Member[] = [
    { id: 'cL', i: 'bl', j: 'tl', ...sec }, { id: 'cR', i: 'br', j: 'tr', ...sec },
    { id: 'bm', i: 'tl', j: 'tr', ...beamSec },
  ]
  const supports: F3Support[] = [{ node: 'bl', fixity: 'fixed' }, { node: 'br', fixity: 'fixed' }]
  const base: PushoverInput = {
    nodes, members, supports,
    Mp: { cL: Mp, cR: Mp }, pattern: { tl: 1 }, dir: 0, controlNode: 'tr', maxEvents: 20,
  }
  // small axial capacity so the overturning axial is a meaningful fraction of Py
  const pm = { cL: { Pcap: 400, kind: 'concrete' as const }, cR: { Pcap: 400, kind: 'concrete' as const } }

  it('the peak base shear with P–M ≤ without P–M', () => {
    const peak = (r: ReturnType<typeof pushoverAnalysis>) => Math.max(...r.curve.map((p) => Math.abs(p.baseShear)))
    const noPM = pushoverAnalysis(base)
    const withPM = pushoverAnalysis({ ...base, pm })
    expect(peak(withPM)).toBeLessThanOrEqual(peak(noPM) + 1e-9)
    expect(peak(withPM)).toBeLessThan(peak(noPM))   // axial here is non-trivial
  })

  it('hinge records carry the axial force and reduced Mpc (≤ Mp)', () => {
    const r = pushoverAnalysis({ ...base, pm })
    expect(r.hinges.length).toBeGreaterThan(0)
    for (const h of r.hinges) {
      expect(h.axial).toBeDefined()
      expect(h.Mpc).toBeDefined()
      expect(h.Mpc!).toBeLessThanOrEqual(Mp + 1e-9)
      expect(h.Mpc!).toBeGreaterThanOrEqual(0)
    }
    // at least one column carried compression (negative axial)
    expect(r.hinges.some((h) => (h.axial ?? 0) < 0)).toBe(true)
  })

  it('without pm the hinge records omit axial/Mpc (backward compatible)', () => {
    const r = pushoverAnalysis(base)
    for (const h of r.hinges) {
      expect(h.axial).toBeUndefined()
      expect(h.Mpc).toBeUndefined()
    }
  })
})
