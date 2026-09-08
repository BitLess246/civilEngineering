import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { modelToFrame3D } from './modelBridge'
import { analyzeFrame3D, localAxes, type V3 } from './frame3d'
import type { RectSection } from './model'
import {
  projectView, fitView, supportSymbol, modelDiagram, loadDiagram, deflectedDiagram,
  forceDiagram, reactionDiagram, memberDeflectedCurve, displacedNodes, autoAmplification,
  signRuns, bestView, DIAGRAM_W, DIAGRAM_H,
} from './analysisDiagram'

const section: RectSection = { id: 's1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }

function frame() {
  const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section, slabThickness: 200 })
  m.loads = buildGravityLoads(m, 4.8, 2.4)
  return m
}
function solved() {
  const m = frame()
  const br = modelToFrame3D(m, {})
  const a = analyzeFrame3D(br.nodes, br.members, br.supports, br.loads, {}, undefined, br.diaphragmGroups, br.shells)!
  return { m, r: a.perCombo[a.govIdx].result! }
}

// ─────────────────────────────────────────────────────────────────────────
// PROJECTION
// ─────────────────────────────────────────────────────────────────────────
describe('projectView', () => {
  it('the orthographic views each drop exactly one world axis', () => {
    const p = { x: 3, y: 4, z: 5 }
    // page +Y is DOWN, so a world level y draws at −y
    expect(projectView(p, 'xy')).toEqual([3, -4])
    expect(projectView(p, 'zy')).toEqual([5, -4])
    expect(projectView(p, 'xz')).toEqual([3, 5])
    // moving along the dropped axis does not move the point
    expect(projectView({ ...p, z: 99 }, 'xy')).toEqual(projectView(p, 'xy'))
    expect(projectView({ ...p, x: 99 }, 'zy')).toEqual(projectView(p, 'zy'))
    expect(projectView({ ...p, y: 99 }, 'xz')).toEqual(projectView(p, 'xz'))
  })

  it('the isometric separates all three axes, and keeps y up the page', () => {
    const o = projectView({ x: 0, y: 0, z: 0 }, 'iso')
    const ux = projectView({ x: 1, y: 0, z: 0 }, 'iso')
    const uy = projectView({ x: 0, y: 1, z: 0 }, 'iso')
    const uz = projectView({ x: 0, y: 0, z: 1 }, 'iso')
    for (const [a, b] of [[ux, uy], [uy, uz], [ux, uz]] as const)
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(0.5)
    // +y is straight up the page (negative page-Y), +x down-right, +z down-left
    expect(uy[0] - o[0]).toBeCloseTo(0, 12)
    expect(uy[1] - o[1]).toBeLessThan(0)
    expect(ux[0] - o[0]).toBeGreaterThan(0)
    expect(uz[0] - o[0]).toBeLessThan(0)
    expect(ux[1] - o[1]).toBeGreaterThan(0)
    expect(uz[1] - o[1]).toBeGreaterThan(0)
  })
})

describe('fitView', () => {
  const pts = [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }, { x: 6, y: 6, z: 0 }, { x: 0, y: 6, z: 0 }]

  it('lands every point inside the box, clear of the padding', () => {
    const f = fitView(pts, 'xy')
    for (const p of pts) {
      const [x, y] = f.at(p)
      expect(x).toBeGreaterThanOrEqual(10 - 1e-9)
      expect(x).toBeLessThanOrEqual(DIAGRAM_W - 10 + 1e-9)
      expect(y).toBeGreaterThanOrEqual(10 - 1e-9)
      expect(y).toBeLessThanOrEqual(DIAGRAM_H - 10 + 1e-9)
    }
  })

  it('is ISOTROPIC — a square bay stays square, it is not stretched to the box', () => {
    const f = fitView(pts, 'xy')
    const [x0, y0] = f.at(pts[0]), [x1, y1] = f.at(pts[1]), [x3, y3] = f.at(pts[3])
    expect(Math.hypot(x1 - x0, y1 - y0)).toBeCloseTo(Math.hypot(x3 - x0, y3 - y0), 9)
  })

  it('a degenerate set (one point) does not divide by zero', () => {
    const f = fitView([{ x: 2, y: 2, z: 2 }], 'iso')
    const [x, y] = f.at({ x: 2, y: 2, z: 2 })
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// SUPPORT SYMBOLS — one per fixity, and they must be told apart
// ─────────────────────────────────────────────────────────────────────────
describe('supportSymbol', () => {
  it('draws a different symbol for every fixity', () => {
    // Compared whole, not by primitive KIND: a pin and a spring are both a
    // path over a hatched ground, and telling them apart is the geometry's
    // job — a test that only counts kinds would pass on two identical stamps.
    const kinds = ['pin', 'fixed', 'roller', 'spring'] as const
    const sig = kinds.map((k) => JSON.stringify(supportSymbol(0, 0, k)))
    expect(new Set(sig).size).toBe(kinds.length)
  })
  it('a roller has wheels and a fixed base has none', () => {
    expect(supportSymbol(0, 0, 'roller').filter((p) => p.kind === 'circle')).toHaveLength(2)
    expect(supportSymbol(0, 0, 'fixed').filter((p) => p.kind === 'circle')).toHaveLength(0)
    expect(supportSymbol(0, 0, 'fixed').some((p) => p.kind === 'rect')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE DEFLECTED CURVE IS THE ELEMENT'S OWN CUBIC
//
// Hand check against the closed form. A cantilever of length L carrying P at
// the tip has v(x) = P·x²(3L − x)/(6EI), so at midspan v = 5PL³/(48EI). Its
// tip values are v(L) = PL³/(3EI) and θ(L) = PL²/(2EI) — feed those in as the
// end displacement and rotation and the interpolation must reproduce the
// exact cubic, because it IS the cubic the element was integrated from.
// ─────────────────────────────────────────────────────────────────────────
describe('memberDeflectedCurve', () => {
  const a = { id: 'a', x: 0, y: 0, z: 0 }
  const b = { id: 'b', x: 4, y: 0, z: 0 }
  const L = 4, EI = 1, P = 1

  it('reproduces the cantilever cubic exactly at every station', () => {
    const [, ey, ez] = localAxes([1, 0, 0] as V3)
    const vTip = (P * L ** 3) / (3 * EI)
    const tTip = (P * L ** 2) / (2 * EI)
    const dj = [ey[0] * vTip, ey[1] * vTip, ey[2] * vTip, ez[0] * tTip, ez[1] * tTip, ez[2] * tTip]
    const pts = memberDeflectedCurve(a, b, [0, 0, 0, 0, 0, 0], dj, 1, 8)
    const exact = (x: number) => (P * x * x * (3 * L - x)) / (6 * EI)
    pts.forEach((p, k) => {
      const x = (k / 8) * L
      const off = (p[0] - x) * ey[0] + p[1] * ey[1] + p[2] * ey[2]
      expect(off).toBeCloseTo(exact(x), 9)
    })
    // and midspan is the textbook 5PL³/48EI
    const mid = pts[4]
    expect(mid[0] * ey[0] + mid[1] * ey[1] + mid[2] * ey[2] - 0).toBeCloseTo((5 * P * L ** 3) / (48 * EI), 9)
  })

  it('a rigid-body translation of both ends moves the member and does not bend it', () => {
    const d = [0.1, 0.2, 0.3, 0, 0, 0]
    const pts = memberDeflectedCurve(a, b, d, d, 1, 6)
    pts.forEach((p, k) => {
      const t = k / 6
      expect(p[0]).toBeCloseTo(a.x + (b.x - a.x) * t + 0.1, 12)
      expect(p[1]).toBeCloseTo(0.2, 12)
      expect(p[2]).toBeCloseTo(0.3, 12)
    })
  })

  it('ends are pinned to the node displacements whatever happens between', () => {
    const di = [0.01, -0.02, 0.03, 0.001, 0.002, 0.003]
    const dj = [-0.04, 0.05, -0.06, -0.003, 0.001, 0.002]
    const pts = memberDeflectedCurve(a, b, di, dj, 1, 10)
    expect(pts[0]).toEqual([a.x + di[0], a.y + di[1], a.z + di[2]])
    const last = pts[pts.length - 1]
    expect(last[0]).toBeCloseTo(b.x + dj[0], 9)
    expect(last[1]).toBeCloseTo(b.y + dj[1], 9)
    expect(last[2]).toBeCloseTo(b.z + dj[2], 9)
  })

  it('amplification scales the departure from the chord, not the chord', () => {
    const dj = [0, 0.01, 0, 0, 0, 0]
    const one = memberDeflectedCurve(a, b, [0, 0, 0, 0, 0, 0], dj, 1, 4)
    const ten = memberDeflectedCurve(a, b, [0, 0, 0, 0, 0, 0], dj, 10, 4)
    expect(ten[2][1]).toBeCloseTo(10 * one[2][1], 12)
    expect(ten[0]).toEqual(one[0])
  })
})

describe('autoAmplification', () => {
  it('draws the peak displacement at the asked fraction of the model diagonal', () => {
    const { m, r } = solved()
    const amp = autoAmplification(m, r, 0.05)
    let dMax = 0
    for (let i = 0; i < m.nodes.length; i++)
      dMax = Math.max(dMax, Math.hypot(r.d[6 * i], r.d[6 * i + 1], r.d[6 * i + 2]))
    const xs = m.nodes.map((n) => n.x), ys = m.nodes.map((n) => n.y), zs = m.nodes.map((n) => n.z)
    const span = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), Math.max(...zs) - Math.min(...zs))
    expect(amp * dMax).toBeCloseTo(0.05 * span, 9)
    expect(amp).toBeGreaterThan(1)
  })

  it('a structure that did not move is drawn at 1, not at infinity', () => {
    const m = frame()
    const zero = { d: new Array(m.nodes.length * 6).fill(0), reactions: [], members: [], Mmax: 0, Vmax: 0, Nmax: 0 }
    expect(autoAmplification(m, zero, 0.05)).toBe(1)
  })
})

describe('displacedNodes', () => {
  it('moves every node by its own three translations, amplified', () => {
    const { m, r } = solved()
    const out = displacedNodes(m, r, 3)
    out.forEach((n, i) => {
      expect(n.id).toBe(m.nodes[i].id)
      expect(n.y).toBeCloseTo(m.nodes[i].y + 3 * r.d[6 * i + 1], 12)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// SIGN RUNS — one lobe per sign, meeting on the axis
// ─────────────────────────────────────────────────────────────────────────
describe('signRuns', () => {
  it('one run for a diagram that never changes sign', () => {
    expect(signRuns([1, 2, 3, 2, 1])).toEqual([{ lo: 0, hi: 4, positive: true }])
    expect(signRuns([-1, -2, -1])).toEqual([{ lo: 0, hi: 2, positive: false }])
  })
  it('two runs that OVERLAP at the crossing, so the lobes meet on the axis', () => {
    const runs = signRuns([-2, -1, 1, 2])
    expect(runs).toHaveLength(2)
    expect(runs[0].positive).toBe(false)
    expect(runs[1].positive).toBe(true)
    expect(runs[1].lo).toBeLessThanOrEqual(runs[0].hi)   // shared station
  })
  it('nothing to draw for an all-zero member', () => {
    expect(signRuns([0, 0, 0])).toEqual([])
    expect(signRuns([5])).toEqual([])
  })
})

describe('bestView', () => {
  it('collapses a single-plane frame to its own elevation', () => {
    const flat = generateGridModel({ baysX: [6, 6], baysZ: [], storeyH: [3], section })
    expect(bestView(flat)).toBe('xy')
    expect(bestView(frame())).toBe('iso')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE FIGURES — every one reports the engine's own numbers, never its own
// ─────────────────────────────────────────────────────────────────────────
const texts = (d: { primitives: { kind: string }[] }) =>
  d.primitives.filter((p): p is { kind: 'text'; text: string } => p.kind === 'text').map((p) => p.text)

describe('modelDiagram', () => {
  const m = frame()
  const d = modelDiagram(m)

  it('draws a line for every member and a symbol at every support', () => {
    const lines = d.primitives.filter((p) => p.kind === 'line')
    expect(lines.length).toBeGreaterThanOrEqual(m.members.length)
    // every support contributes its ground hatch, so the count rises with them
    const bare = modelDiagram({ ...m, supports: [] })
    expect(d.primitives.length).toBeGreaterThan(bare.primitives.length)
  })

  it('prints every node and member id when the model is small enough', () => {
    const t = texts(d)
    for (const n of m.nodes) expect(t).toContain(n.id)
    for (const x of m.members) expect(t).toContain(x.id)
  })

  it('DROPS the ids on a model too dense to letter, and says it did', () => {
    const d2 = modelDiagram(m, { maxLabels: 4 })
    const t = texts(d2)
    expect(t).not.toContain(m.nodes[0].id)
    expect(t.join(' ')).toMatch(/ids omitted/)
    // the drawing is still there — only the lettering went
    expect(d2.primitives.filter((p) => p.kind === 'line').length).toBeGreaterThanOrEqual(m.members.length)
  })

  it('fills the page box it was asked for', () => {
    expect(d.bounds).toEqual({ minX: 0, minY: 0, maxX: DIAGRAM_W, maxY: DIAGRAM_H })
  })
})

describe('loadDiagram', () => {
  const m = frame()
  it('is null for a category the model does not carry — no empty frame is printed', () => {
    expect(loadDiagram(m, 'W')).toBeNull()
    expect(loadDiagram(m, 'D')).not.toBeNull()
  })

  it('calls out the load it drew, in the load\'s own units', () => {
    const t = texts(loadDiagram(m, 'D')!).join(' ')
    expect(t).toMatch(/kN\/m/)      // the member self-weight line loads
    expect(t).toMatch(/kPa/)        // the slab area loads
    expect(t).toMatch(/DEAD \(D\)/)
  })

  const arrowLengths = (d: { primitives: { kind: string }[] }) => d.primitives
    .filter((p): p is { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string } =>
      p.kind === 'line' && (p as { stroke?: string }).stroke === '#b45309')
    .map((p) => Math.hypot(p.x2 - p.x1, p.y2 - p.y1))
    .sort((a, b) => b - a)

  const twoLoads = (big: number, small: number) => {
    const m2 = frame()
    m2.loads = [
      { kind: 'node', node: m2.nodes[0].id, Fy: -big, cat: 'L' },
      { kind: 'node', node: m2.nodes[1].id, Fy: -small, cat: 'L' },
    ]
    return arrowLengths(loadDiagram(m2, 'L')!)
  }

  it('arrow length is PROPORTIONAL to magnitude — that is the point of drawing them', () => {
    const lens = twoLoads(100, 40)
    expect(lens).toHaveLength(2)
    expect(lens[0] / lens[1]).toBeCloseTo(2.5, 2)
  })

  it('…but a load far under the peak still draws as an arrow, not as nothing', () => {
    const lens = twoLoads(100, 0.5)
    expect(lens[1]).toBeGreaterThan(0.9)         // the floor, not 0.045 mm
    expect(lens[1]).toBeLessThan(lens[0] / 4)    // and still obviously the smaller load
  })
})

describe('deflectedDiagram', () => {
  const { m, r } = solved()
  it('reports the amplification and the real peak displacement, in mm', () => {
    const d = deflectedDiagram(m, r, { caseName: 'combo 1' })
    const t = texts(d).join(' ')
    expect(t).toMatch(/amplified ×/)
    let dMax = 0
    for (let i = 0; i < m.nodes.length; i++)
      dMax = Math.max(dMax, Math.hypot(r.d[6 * i], r.d[6 * i + 1], r.d[6 * i + 2]))
    expect(t).toContain((dMax * 1000).toFixed(2))
    expect(t).toContain('combo 1')
  })
  it('draws the undeformed model AND a curve per member', () => {
    const d = deflectedDiagram(m, r)
    expect(d.primitives.filter((p) => p.kind === 'path' && p.stroke === '#0f4c92')).toHaveLength(m.members.length)
  })
})

describe('forceDiagram', () => {
  const { m, r } = solved()
  it('prints the solver\'s own peak, not one of its own', () => {
    for (const comp of ['Mz', 'Vy', 'N'] as const) {
      const peak = Math.max(0, ...r.members.flatMap((x) => x[comp].map(Math.abs)))
      expect(texts(forceDiagram(m, r, comp)).join(' ')).toContain(peak.toFixed(1))
    }
  })
  it('a member with a sign change draws two lobes, in two colours', () => {
    const d = forceDiagram(m, r, 'Mz')
    const fills = new Set(d.primitives.filter((p) => p.kind === 'path' && p.fill && p.fill !== 'none').map((p) => (p as { fill: string }).fill))
    // a gravity frame hogs at the supports and sags at midspan
    expect(fills.has('#0f4c92')).toBe(true)
    expect(fills.has('#b91c1c')).toBe(true)
  })
  it('an unloaded structure draws no ribbon and still returns a figure', () => {
    const flat = { ...r, members: r.members.map((x) => ({ ...x, Mz: x.Mz.map(() => 0) })) }
    const d = forceDiagram(m, flat, 'Mz')
    expect(d.primitives.filter((p) => p.kind === 'path' && p.fill === '#0f4c92')).toHaveLength(0)
    expect(texts(d).join(' ')).toContain('0.0')
  })
})

describe('reactionDiagram', () => {
  const { m, r } = solved()
  it('prints ΣFy — the same sum the equilibrium check uses', () => {
    const sum = r.reactions.reduce((s, x) => s + x.F[1], 0)
    expect(texts(reactionDiagram(m, r)).join(' ')).toContain(sum.toFixed(1))
  })
  it('one arrow per support', () => {
    const d = reactionDiagram(m, r)
    expect(d.primitives.filter((p) => p.kind === 'line' && p.stroke === '#b91c1c')).toHaveLength(r.reactions.length)
  })
})
