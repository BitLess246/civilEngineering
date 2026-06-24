import { describe, it, expect } from 'vitest'
import { solveFrame3D, rectJ, type F3Node, type F3Member, type F3Support, type F3Load } from './frame3d'

// Section: 300×500 mm concrete (MPa → kN/mm²; A mm²; EA = E·A kN)
const E = 25000, G = E / 2.4
const b = 300, h = 500
const A = b * h, Iz = (b * h ** 3) / 12, Iy = (h * b ** 3) / 12, J = rectJ(b, h)
const sec = { E, G, A, Iy, Iz, J }
const EA = (E * A) / 1000   // kN (A in mm², E in kN/mm²; /1000 = unit conversion m→mm in frame3d)
// Note: frame3d uses L in metres; EA/L gives kN/m stiffness, consistent with kN forces.

const alpha = 10e-6   // /°C — typical concrete
const deltaT = 30     // °C rise

/** Two-node member fully fixed at both ends along global X. */
const bothFixed = (loads: F3Load[]) => solveFrame3D(
  [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 4, y: 0, z: 0 }] as F3Node[],
  [{ id: 'm', i: 'a', j: 'b', ...sec }] as F3Member[],
  [{ node: 'a', fixity: 'fixed' }, { node: 'b', fixity: 'fixed' }] as F3Support[],
  loads,
)!

/** Cantilever: fixed at a, free at b. */
const cantilever = (loads: F3Load[]) => solveFrame3D(
  [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 3, y: 0, z: 0 }] as F3Node[],
  [{ id: 'm', i: 'a', j: 'b', ...sec }] as F3Member[],
  [{ node: 'a', fixity: 'fixed' }] as F3Support[],
  loads,
)!

describe('member-thermal — both ends fixed (L = 4 m, ΔT = +30 °C, α = 10e-6)', () => {
  const PT = EA * alpha * deltaT   // expected axial thermal force, kN

  it('axial force = −EA·α·ΔT (compression) throughout the restrained member', () => {
    const ld: F3Load = { kind: 'member-thermal', member: 'm', PT, cat: 'D' }
    const r = bothFixed([ld])
    // N should be negative (compression) and constant along the member
    for (const N of r.members[0].N) {
      expect(N).toBeCloseTo(-PT, 4)
    }
  })

  it('no transverse force or moment for uniform thermal load', () => {
    const ld: F3Load = { kind: 'member-thermal', member: 'm', PT, cat: 'D' }
    const r = bothFixed([ld])
    const m = r.members[0]
    for (const v of [...m.Vy, ...m.Vz, ...m.My, ...m.Mz, ...m.T]) {
      expect(Math.abs(v)).toBeLessThan(1e-6)
    }
  })

  it('both nodes have zero displacement (fully constrained)', () => {
    const ld: F3Load = { kind: 'member-thermal', member: 'm', PT, cat: 'D' }
    const r = bothFixed([ld])
    for (const d of r.d) expect(Math.abs(d)).toBeLessThan(1e-12)
  })

  it('reactions at fixed ends: equal and opposite axial (compression pair)', () => {
    const ld: F3Load = { kind: 'member-thermal', member: 'm', PT, cat: 'D' }
    const r = bothFixed([ld])
    // Support at a pushes +X (opposes outward expansion at i-end); b pushes −X
    const Ra = r.reactions.find((rx) => rx.node === 'a')!
    const Rb = r.reactions.find((rx) => rx.node === 'b')!
    expect(Ra.F[0]).toBeCloseTo(+PT, 3)
    expect(Rb.F[0]).toBeCloseTo(-PT, 3)
    // Net reaction = 0 (self-equilibrating)
    expect(Ra.F[0] + Rb.F[0]).toBeCloseTo(0, 10)
  })
})

describe('member-thermal — cantilever (fixed at a, free at b)', () => {
  const PT = EA * alpha * deltaT

  it('free end can expand → zero internal axial force', () => {
    const ld: F3Load = { kind: 'member-thermal', member: 'm', PT, cat: 'D' }
    const r = cantilever([ld])
    for (const N of r.members[0].N) {
      expect(Math.abs(N)).toBeLessThan(1e-6)
    }
  })

  it('free end displaces by α·ΔT·L (free thermal elongation)', () => {
    const L = 3
    const ld: F3Load = { kind: 'member-thermal', member: 'm', PT, cat: 'D' }
    const r = cantilever([ld])
    // node b is DOF index 1, DOF 0 is u_x of node b
    expect(r.d[6]).toBeCloseTo(alpha * deltaT * L, 7)
  })

  it('no reaction at fixed end for cantilever (no restraint of free expansion)', () => {
    const ld: F3Load = { kind: 'member-thermal', member: 'm', PT, cat: 'D' }
    const r = cantilever([ld])
    const Ra = r.reactions.find((rx) => rx.node === 'a')!
    expect(Math.abs(Ra.F[0])).toBeLessThan(1e-6)
  })
})

describe('member-thermal — scaling via combo factor', () => {
  it('zero load factor → no thermal effect', () => {
    // A thermal load with factor 0 should be filtered out by applyF3Combo
    // Test indirectly: PT=0 → same as no load → no axial force in cantilever
    const ld: F3Load = { kind: 'member-thermal', member: 'm', PT: 0, cat: 'D' }
    const r = cantilever([ld])
    for (const N of r.members[0].N) expect(Math.abs(N)).toBeLessThan(1e-9)
  })

  it('cooling (negative ΔT) gives tension in restrained member', () => {
    const PT = EA * alpha * 20   // cooling → member wants to contract → tension
    const ld: F3Load = { kind: 'member-thermal', member: 'm', PT: -PT, cat: 'D' }
    const r = bothFixed([ld])
    // Negative PT means contraction; internal force = +PT (tension)
    for (const N of r.members[0].N) expect(N).toBeCloseTo(PT, 4)
  })
})
