import { describe, it, expect } from 'vitest'
import { designTrussJoint, eccentricityForGap, gapAt, type JointBranch } from './hssTrussJoint'

// HSS102x102x6.4: B = H = 101.6, t = 5.92 (design wall), A = 2170
// HSS152x152x6.4: B = H = 152.4, t = 5.92, A = 3380
// HSS64x64x4.8:  B = H = 63.5,  t = 4.42, A = 994
const br = (id: string, theta: number, P: number): JointBranch => ({ id, shape: 'HSS64x64x4.8', theta, P, Fy: 345, Fu: 450 })

describe('T-connection — a lone vertical on a chord (Table K3.2, β ≤ 0.85)', () => {
  it('chord wall plastification, by hand', () => {
    const r = designTrussJoint({ node: 'n', chordShape: 'HSS102x102x6.4', Fy: 345, Fu: 450, chordN: [40, 60], branches: [br('v', 90, -30)] })!
    expect(r.covered).toBe(true)
    expect(r.branches[0].kind).toBe('T')
    // β = η = 63.5/101.6 = 0.625; Qf = 1 (chord in tension)
    // φPn = 1.0·345·5.92²·[2(0.625)/0.375 + 4/√0.375] = 12 091.0 × 9.8653 = 119.28 kN
    const c = r.branches[0].checks.find((q) => q.name === 'chord wall plastification')!
    expect(c.capacity).toBeCloseTo(119.28, 1)
    expect(c.util).toBeCloseTo(30 / 119.28, 3)
    expect(r.ok).toBe(true)
  })

  it('a chord in compression lowers it through Qf = 1.3 − 0.4U/β', () => {
    const r = designTrussJoint({ node: 'n', chordShape: 'HSS102x102x6.4', Fy: 345, Fu: 450, chordN: [-500, -520], branches: [br('v', 90, -30)] })!
    // lower-compression side −500: U = 500 000/(345·2170) = 0.6679; Qf = 1.3 − 0.4·0.6679/0.625 = 0.8725
    expect(r.U).toBeCloseTo(0.6679, 4)
    const c = r.branches[0].checks[0]
    expect(c.capacity).toBeCloseTo(119.28 * 0.8725, 1)
    // a little compression does not reduce it: Qf capped at 1.0
    const light = designTrussJoint({ node: 'n', chordShape: 'HSS102x102x6.4', Fy: 345, Fu: 450, chordN: [-200, -210], branches: [br('v', 90, -30)] })!
    expect(light.branches[0].checks[0].capacity).toBeCloseTo(119.28, 1)
  })

  it('an inclined lone branch is a Y, and sinθ raises its demand on the face', () => {
    const r = designTrussJoint({ node: 'n', chordShape: 'HSS102x102x6.4', Fy: 345, Fu: 450, chordN: [10, 10], branches: [br('d', 60, 30)] })!
    expect(r.branches[0].kind).toBe('Y')
    // η = (63.5/sin60)/101.6 = 0.7217: φPn·sin60 = 12 091.0·[2(0.7217)/0.375 + 6.5320] = 125.52 kN → /sin60
    expect(r.branches[0].checks[0].capacity).toBeCloseTo(125.52 / Math.sin(Math.PI / 3), 0)
  })
})

describe('N joint — vertical + 45° diagonal, as noded: the branches OVERLAP', () => {
  const r = designTrussJoint({
    node: 'n', chordShape: 'HSS102x102x6.4', Fy: 345, Fu: 450, chordN: [80, 110],
    branches: [br('v', 90, -30), br('d', 45, 30 / Math.SQRT1_2)],
  })!

  it('the noded geometry: g = (H/2)·sin135°/(sin90·sin45) − Hb/2 − Hb/(2 sin45) = −25.85 mm', () => {
    expect(gapAt(101.6, 63.5, 90, 63.5, 45, 0)).toBeCloseTo(-25.85, 2)
    // and the inverse: the e that gives that gap is 0
    expect(eccentricityForGap(101.6, 63.5, 90, 63.5, 45, gapAt(101.6, 63.5, 90, 63.5, 45, 0))).toBeCloseTo(0, 9)
  })

  it('balanced within 20 % → K; equal tubes, the more heavily loaded diagonal is the through branch, so the vertical laps onto it: Ov = 25.85 / 63.5 = 40.7 % at e = 0', () => {
    expect(r.branches.every((b) => b.kind === 'K')).toBe(true)
    expect(r.gap!.kind).toBe('overlap')
    expect(r.gap!.e).toBe(0)
    expect(r.gap!.Ov!).toBeCloseTo(25.85 / 63.5, 3)
    expect(r.covered).toBe(true)
  })

  it('overlapping branch local yielding, by hand (Ov 25–50 % band)', () => {
    // i = the vertical (30 kN against the diagonal's 42.4 — Packer 2014 / CIDECT DG3)
    // beoi = 10/(101.6/5.92)·(345·5.92)/(345·4.42)·63.5 = 49.557; beov = 10/(63.5/4.42)·63.5 = 44.200
    // Pn,i = 345·4.42·[(0.40711/0.5)(127 − 17.68) + 49.557 + 44.200] = 278.70 kN; φ = 0.95 → 264.77
    const v = r.branches.find((b) => b.id === 'v')!
    expect(v.checks[0].capacity).toBeCloseTo(264.77, 1)
    // the overlapped branch j takes the same in proportion to its yield force (equal tubes → equal)
    const d = r.branches.find((b) => b.id === 'd')!
    expect(d.checks[0].capacity).toBeCloseTo(264.77, 1)
  })
})

describe('Warren K joint — two 45° diagonals on a wide chord: a real GAP', () => {
  const r = designTrussJoint({
    node: 'n', chordShape: 'HSS152x152x6.4', Fy: 345, Fu: 450, chordN: [-100, -150],
    branches: [br('a', 45, -50), br('b', 45, 50)],
  })!

  it('as noded g = 76.2·sin90/(sin45)² − 2·44.90 = 62.6 mm ≥ tb1 + tb2 → gapped at e = 0', () => {
    expect(r.gap!.kind).toBe('gap')
    expect(r.gap!.g).toBeCloseTo(62.6, 1)
    expect(r.gap!.e).toBe(0)
    expect(r.covered).toBe(true)
  })

  it('chord wall plastification and sidewall shear, by hand', () => {
    // βeff = 4·63.5/(4·152.4) = 0.41667; γ = 152.4/11.84 = 12.872; U = 100 000/(345·3380) = 0.0858 → Qf = 1
    // φPn·sin45 = 0.9·345·5.92²·9.8·0.41667·√12.872 = 159.42 kN → /sin45 = 225.46 kN
    const a = r.branches.find((b) => b.id === 'a')!
    const plast = a.checks.find((q) => q.name === 'chord wall plastification')!
    expect(plast.capacity).toBeCloseTo(225.46, 0)
    // §G4: h = 152.4 − 3·5.92 = 134.64; Aw = 2·134.64·5.92 = 1594.1; φVn = 0.9·0.6·345·1594.1 = 296.99 kN
    const side = a.checks.find((q) => q.name === 'chord sidewall shear in the gap')!
    expect(side.capacity).toBeCloseTo(296.99, 1)
    expect(side.demand).toBeCloseTo(50 * Math.SQRT1_2, 9)
    // square branches: no punching, no uneven-load check (Table K3.2)
    expect(a.checks.some((q) => q.name.startsWith('shear yielding'))).toBe(false)
  })
})

describe('outside Table K3.2A — not covered, and not failed', () => {
  it('a shallow diagonal at θ = 20° near a gable eave', () => {
    const r = designTrussJoint({
      node: 'n', chordShape: 'HSS102x102x6.4', Fy: 345, Fu: 450, chordN: [50, 60],
      branches: [br('v', 90, -10), br('d', 20, 10 / Math.sin((20 * Math.PI) / 180))],
    })!
    expect(r.covered).toBe(false)
    expect(r.limitNotes.some((n) => /θ = 20\.0° < 30°/.test(n))).toBe(true)
    expect(r.ok).toBe(true)          // not designed here — a gusset plate is
  })

  it('a chord too slender for Chapter K', () => {
    // HSS254x254x6.4: B/t = 254/5.92 ≈ 43 > 35
    const r = designTrussJoint({ node: 'n', chordShape: 'HSS254x254x6.4', Fy: 345, Fu: 450, chordN: [0, 0], branches: [br('v', 90, -10)] })!
    expect(r.covered).toBe(false)
  })
})

describe('classification is by balance, not by count', () => {
  it('two branches whose punching loads do not balance within 20 % are T and Y, not K', () => {
    const r = designTrussJoint({
      node: 'n', chordShape: 'HSS102x102x6.4', Fy: 345, Fu: 450, chordN: [10, 10],
      branches: [br('v', 90, -30), br('d', 45, 10)],
    })!
    expect(r.branches.map((b) => b.kind).sort()).toEqual(['T', 'Y'])
    expect(r.gap).toBeUndefined()
  })

  it('zero-force branches are not checked; a non-HSS chord is not this module’s', () => {
    const r = designTrussJoint({ node: 'n', chordShape: 'HSS102x102x6.4', Fy: 345, Fu: 450, chordN: [0, 0], branches: [br('v', 90, 0)] })!
    expect(r.branches).toEqual([])
    expect(designTrussJoint({ node: 'n', chordShape: 'W310x52', Fy: 345, Fu: 450, chordN: [0], branches: [] })).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// PUBLISHED EXAMPLE — Packer, J.A. (2014), "HSS Truss Connections with Three
// Branches", AISC Engineering Journal 51(3), pp. 145–153: "Design example for
// HSS overlapped KT connection" (LRFD). Inputs and answers are the paper's,
// in US units, converted exactly; the paper rounds to three figures.
//   chord   HSS10×10×3/8  A1085: B = H = 10 in, t = 0.375 in, A = 14.1 in²
//   1, 2    HSS5×5×5/16          Bb = Hb = 5 in, tb = 0.313 in, Ab = 5.61 in²
//   3       HSS4×4×1/4           Bb = Hb = 4 in, tb = 0.250 in, Ab = 3.60 in²
//   Fy = Fyb = 50 ksi, Fu = 65 ksi; θ1 = θ2 = 60°, θ3 = 90°
//   Ov(1 on 2) = 50 %, lov = 2.89 in, e = −2.5 in
//   Pr1 = 120 kips (C), Pr2 = 189 kips (T), Pr3 = 60 kips (C)
// Published: Pn3 = 166 kips, φPn3 = 158; Pn1 = 221, φPn1 = 210;
//            Pn2 = 220, φPn2 = 209 — all o.k.
// ─────────────────────────────────────────────────────────────────────────
describe('Packer (2014) EJ 51(3) — overlapped KT, the published worked example', () => {
  const inch = 25.4, in2 = 645.16, kip = 4.4482216, ksi = (kip * 1000) / in2
  const tube = (b: number, tt: number, A: number) => ({ B: b * inch, H: b * inch, t: tt * inch, A: A * in2 })
  const Fy = 50 * ksi, Fu = 65 * ksi
  const r = designTrussJoint({
    node: 'KT', chordShape: 'HSS10x10x3/8 (A1085)', chord: tube(10, 0.375, 14.1), Fy, Fu, chordN: [0, 0],
    e: -2.5 * inch,
    branches: [
      { id: '1', shape: 'HSS5x5x5/16', section: tube(5, 0.313, 5.61), theta: 60, lean: -1, P: -120 * kip, Fy, Fu },
      { id: '2', shape: 'HSS5x5x5/16', section: tube(5, 0.313, 5.61), theta: 60, lean: 1, P: 189 * kip, Fy, Fu },
      { id: '3', shape: 'HSS4x4x1/4', section: tube(4, 0.25, 3.6), theta: 90, lean: 0, P: -60 * kip, Fy, Fu },
    ],
  })!
  const Pn = (id: string) => r.branches.find((b) => b.id === id)!.checks[0].capacity / 0.95 / kip          // kips

  it('passes the limits of applicability the paper checks one by one, and is an overlapped KT', () => {
    expect(r.limitNotes).toEqual([])
    expect(r.covered).toBe(true)
    expect(r.branches.every((b) => b.kind === 'KT')).toBe(true)
    expect(r.gap!.kt).toBe(true)
    expect(r.gap!.kind).toBe('overlap')
    // Ov = 50 %; lov = 0.50·lp = 0.50·5.774 = 2.89 in
    expect(r.gap!.Ov!).toBeCloseTo(0.5, 9)
    expect(-r.gap!.g / inch).toBeCloseTo(2.89, 2)
  })

  it('branch 3, lapping onto both diagonals: Pn3 = 166 kips, φPn3 = 158', () => {
    expect(Pn('3')).toBeCloseTo(166, 0)
    expect(r.branches.find((b) => b.id === '3')!.checks[0].capacity / kip).toBeCloseTo(158, 0)
  })

  it('branch 1, overlapping branch 2 by 50 % (Eq. K2-18 then, K3-16 now): Pn1 = 221 kips, φPn1 = 210', () => {
    expect(Pn('1')).toBeCloseTo(221, 0)
    expect(r.branches.find((b) => b.id === '1')!.checks[0].capacity / kip).toBeCloseTo(210, 0)
  })

  it('branch 2, the through branch: Pn2 = Ab2·Fy·min(221/281, 166/180) — the paper prints 220 kips, φPn2 = 209', () => {
    // 221.0/280.5 × 280.5 = 221.0 unrounded; the paper's 220 is its own rounding
    expect(Math.abs(Pn('2') - 220)).toBeLessThan(1.5)
    expect(Math.abs(r.branches.find((b) => b.id === '2')!.checks[0].capacity / kip - 209)).toBeLessThan(1.5)
  })

  it('every branch o.k. at the paper’s LRFD forces, with its utilisation', () => {
    expect(r.ok).toBe(true)
    const u = (id: string) => r.branches.find((b) => b.id === id)!.util
    expect(u('3')).toBeCloseTo(60 / 157.7, 2)
    expect(u('1')).toBeCloseTo(120 / 210.0, 2)
    expect(u('2')).toBeCloseTo(189 / 210.0, 2)
  })

  it('left to choose e itself, it laps the diagonals 25 % instead — inside the e band', () => {
    const auto = designTrussJoint({ node: 'KT', chordShape: '', chord: tube(10, 0.375, 14.1), Fy, Fu, chordN: [0, 0],
      branches: [
        { id: '1', shape: '', section: tube(5, 0.313, 5.61), theta: 60, P: -120 * kip, Fy, Fu },
        { id: '2', shape: '', section: tube(5, 0.313, 5.61), theta: 60, P: 189 * kip, Fy, Fu },
        { id: '3', shape: '', section: tube(4, 0.25, 3.6), theta: 90, P: -60 * kip, Fy, Fu },
      ] })!
    expect(auto.gap!.Ov!).toBeCloseTo(0.25, 9)
    expect(auto.gap!.e).toBeGreaterThanOrEqual(-0.55 * 254)
    expect(auto.covered).toBe(true)
  })
})

describe('gapped KT — the odd-sense branch split to balance its neighbours (Packer 2014, case 1)', () => {
  // HSS152x152x6.4 chord, three HSS64x64x4.8 webs: diagonals at 45° both in
  // compression, the vertical in tension balancing both
  const r = designTrussJoint({
    node: 'n', chordShape: 'HSS152x152x6.4', Fy: 345, Fu: 450, chordN: [-100, -150],
    branches: [br('a', 45, -50), br('v', 90, 2 * 50 * Math.SQRT1_2), br('b', 45, -50)],
  })!

  it('as noded the vertical sits on the diagonals’ toes; the least e opening both gaps to tb + tb', () => {
    // gA(e) = (76.2 + e)·cot45 − 44.90 − 31.75 ≥ 8.84 → e = 9.29 mm ≤ 0.25H = 38.1
    expect(r.gap!.kt).toBe(true)
    expect(r.gap!.kind).toBe('gap')
    expect(r.gap!.e).toBeCloseTo(4.42 + 4.42 + 63.5 / (2 * Math.SQRT1_2) + 31.75 - 76.2, 6)
    expect(r.gap!.g).toBeCloseTo(8.84, 6)
    expect(r.covered).toBe(true)
  })

  it('each diagonal is one K with half the vertical: 50 kN against φPn = 225.46 (the Warren case above)', () => {
    const a = r.branches.find((b) => b.id === 'a')!
    expect(a.checks.find((q) => q.name.startsWith('chord wall plastification'))!.capacity).toBeCloseTo(225.46, 0)
    expect(a.util).toBeCloseTo(50 / 225.46, 3)
  })

  it('the vertical’s two shares ADD: 2 × 35.36 / 159.42 — the whole of it against one K’s plastification', () => {
    const v = r.branches.find((b) => b.id === 'v')!
    expect(v.checks.length).toBe(4)          // plastification + sidewall shear, in each sub-K
    expect(v.util).toBeCloseTo((50 * Math.SQRT2) / 159.42, 3)
  })
})
