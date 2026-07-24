import { describe, it, expect } from 'vitest'
import {
  torsionalVerdict, softStoreyVerdicts, massVerdicts, geometricVerdicts, assessIrregularities,
} from './irregularity'
import { emptyModel, type StructuralModel, type Node, type Member, type RectSection, type Storey } from './model'

// ── pure checks vs NSCP thresholds ──────────────────────────────────────
describe('irregularity — torsional (Table 208-10 Type 1a/1b)', () => {
  it('regular when both ends drift equally', () => {
    expect(torsionalVerdict(10, 10).verdict).toBe('none')          // ratio 1.0
  })
  it('irregular above 1.2× the average', () => {
    // δmax=13, δmin=7 → avg=10 → 1.3 > 1.2
    const r = torsionalVerdict(13, 7); expect(r.verdict).toBe('irregular'); expect(r.ratio).toBeCloseTo(1.3, 6)
  })
  it('extreme above 1.4× the average', () => {
    // δmax=15, δmin=5 → avg=10 → 1.5 > 1.4
    expect(torsionalVerdict(15, 5).verdict).toBe('extreme')
  })
  it('just below 1.2 stays regular', () => {
    expect(torsionalVerdict(11.9, 10.1).verdict).toBe('none')      // 1.081
  })
})

describe('irregularity — soft storey (Table 208-9 Type 1a/1b)', () => {
  // k ordered bottom→top
  it('regular when stiffness is uniform', () => {
    expect(softStoreyVerdicts([100, 100, 100, 100]).every((v) => v.verdict === 'none')).toBe(true)
  })
  it('flags a storey below 70% of the one above', () => {
    // k0/above = 65/100 = 0.65 (<0.70, >0.60) ⇒ irregular via the 'above' clause;
    // the softer storeys further up keep avg-of-3 = 73.3 so that clause stays OK.
    const v = softStoreyVerdicts([65, 100, 60, 60])[0]
    expect(v.basis).toBe('above'); expect(v.verdict).toBe('irregular'); expect(v.ratio).toBeCloseTo(0.65, 6)
  })
  it('extreme below 60% of the one above', () => {
    const v = softStoreyVerdicts([55, 100, 100, 100])[0]
    expect(v.verdict).toBe('extreme')
  })
  it('flags below 80% of the average of the three above', () => {
    // k0=77, three above avg=100 → 0.77 < 0.80 but 0.77 > 0.70 of above(100)=OK on the above clause
    const v = softStoreyVerdicts([77, 100, 100, 100])[0]
    expect(v.basis).toBe('avg3'); expect(v.verdict).toBe('irregular')
  })
  it('never flags the top storey (no storey above)', () => {
    expect(softStoreyVerdicts([100, 100]).length).toBe(1)          // only the bottom storey is checked
  })
})

describe('irregularity — mass (Table 208-9 Type 2)', () => {
  it('regular when weights are similar', () => {
    expect(massVerdicts([100, 100, 100]).every((v) => v.verdict === 'none')).toBe(true)
  })
  it('flags a storey over 150% of an adjacent storey', () => {
    const v = massVerdicts([100, 160, 100])       // middle 160 vs 100 → 1.6 > 1.5
    expect(v[1].verdict).toBe('irregular'); expect(v[1].ratio).toBeCloseTo(1.6, 6)
  })
  it('a heavier lower floor does not falsely flag a light roof', () => {
    // roof(top) lighter than floor below → roof ratio 0.5 ⇒ none; floor below ratio vs roof = 2.0>1.5 flags the floor
    const v = massVerdicts([100, 200, 100])
    expect(v[2].verdict).toBe('none')             // the light roof itself is not flagged
  })
})

describe('irregularity — vertical geometric (Table 208-9 Type 3)', () => {
  it('flags a storey wider than 130% of an adjacent storey', () => {
    const v = geometricVerdicts([10, 14, 10])     // 14/10 = 1.4 > 1.3
    expect(v[1].verdict).toBe('irregular')
  })
  it('regular within 130%', () => {
    expect(geometricVerdicts([10, 12, 10]).every((v) => v.verdict === 'none')).toBe(true)  // 1.2
  })
})

// ── model adapter: a 2-storey, 4-column frame with a crafted E displacement ──
function twoStoreyModel(): StructuralModel {
  const m = emptyModel('irreg-test')
  const sec: RectSection = { id: 'C', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  m.sections = [sec]
  // a 6×6 m bay, columns at the four corners, two storeys of 3 m
  const xs = [0, 6], zs = [0, 6], ys = [0, 3, 6]
  const nodes: Node[] = []
  for (const y of ys) for (const x of xs) for (const z of zs) nodes.push({ id: `n_${x}_${y}_${z}`, x, y, z })
  m.nodes = nodes
  const members: Member[] = []
  for (let l = 0; l < ys.length - 1; l++) for (const x of xs) for (const z of zs)
    members.push({ id: `c_${x}_${ys[l]}_${z}`, i: `n_${x}_${ys[l]}_${z}`, j: `n_${x}_${ys[l + 1]}_${z}`, role: 'column', section: 'C' })
  m.members = members
  m.storeys = [{ id: 's1', name: 'L1', elevation: 3 }, { id: 's2', name: 'L2', elevation: 6 }] as Storey[]
  return m
}

describe('irregularity — model adapter', () => {
  const model = twoStoreyModel()
  // nodeOrder = model.nodes; craft displacements so the +Z edge (z=6) racks
  // much more than the −Z edge (z=0) at level 1 → torsional irregularity in X.
  const nodeOrder = model.nodes.map((n) => ({ id: n.id, y: n.y }))
  const uX = (n: Node): number => {
    if (n.y === 0) return 0
    const base = n.y === 3 ? 0.010 : 0.020            // m, uniform part
    const twist = (n.z === 6 ? 1 : -1) * (n.y === 3 ? 0.006 : 0.012)  // ± edge twist
    return base + twist
  }
  const d: number[] = []
  for (const n of nodeOrder) {
    const nd = model.nodes.find((q) => q.id === n.id)!
    d.push(uX(nd), 0, 0, 0, 0, 0)                     // only the X component matters
  }
  const storeyForce = [{ elevation: 3, F: 50 }, { elevation: 6, F: 50 }]

  it('flags torsional irregularity from the crafted twist', () => {
    const flags = assessIrregularities(model, { nodeOrder, d, storeyForce, dir: 'x' })
    const tor = flags.find((f) => f.code.startsWith('P1'))
    expect(tor).toBeTruthy()
    expect(tor!.table).toBe('Table 208-10')
    expect(tor!.dir).toBe('x')
    // level-1 drift: +edge 16 mm, −edge 4 mm → avg 10 → ratio 1.6 ⇒ extreme
    expect(tor!.ratio).toBeGreaterThan(1.4)
    expect(tor!.verdict).toBe('extreme')
  })

  it('a uniform (untwisted) field trips no torsional flag', () => {
    const dU: number[] = []
    for (const n of nodeOrder) dU.push(n.y === 0 ? 0 : n.y === 3 ? 0.010 : 0.020, 0, 0, 0, 0, 0)
    const flags = assessIrregularities(model, { nodeOrder, d: dU, storeyForce, dir: 'x' })
    expect(flags.some((f) => f.code.startsWith('P1'))).toBe(false)
  })
})
