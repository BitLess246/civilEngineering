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

  it('balanced within 20 % → K; overlap 25.85 / (63.5/sin45) = 28.8 %, so overlapped K at e = 0', () => {
    expect(r.branches.every((b) => b.kind === 'K')).toBe(true)
    expect(r.gap!.kind).toBe('overlap')
    expect(r.gap!.e).toBe(0)
    expect(r.gap!.Ov!).toBeCloseTo(25.85 / 89.80, 3)
    expect(r.covered).toBe(true)
  })

  it('overlapping branch local yielding, by hand (Ov 25–50 % band)', () => {
    // i = the diagonal (equal sizes: the tie-break keeps the vertical as the through branch)
    // beoi = 10/(101.6/5.92)·(345·5.92)/(345·4.42)·63.5 = 49.557; beov = 10/(63.5/4.42)·63.5 = 44.200
    // Pn,i = 345·4.42·[(0.2879/0.5)(127 − 17.68) + 49.557 + 44.200] = 238.95 kN; φ = 0.95 → 227.0
    const d = r.branches.find((b) => b.id === 'd')!
    expect(d.checks[0].capacity).toBeCloseTo(227.0, 0)
    // the overlapped branch j takes the same in proportion to its yield force (equal tubes → equal)
    const v = r.branches.find((b) => b.id === 'v')!
    expect(v.checks[0].capacity).toBeCloseTo(227.0, 0)
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
