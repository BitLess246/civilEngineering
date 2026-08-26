import { describe, it, expect } from 'vitest'
import {
  buildFrameElevation, clipToBand, runInk,
  type FrameElevationInput, type ElevationMember,
} from './frameElevation'
import { elevationPlane, type RebarCage, type RebarRun } from './rebarModel'
import { STEEL, STEEL_LIGHT } from './sheetInk'
import { designStructure } from './pipeline'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { buildStructureCages } from './cageBuilder'
import { frameElevationBundles, gridLines } from '../lib/planDetails'

// ─────────────────────────────────────────────────────────────────────────
// A 2-bay, 2-storey frame, designed and caged — the same one the cage tests
// use, so a bar that moves there moves here.
// ─────────────────────────────────────────────────────────────────────────
const section = { id: 's1', name: 'C1', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.2, 3.2], section })
model.loads = buildGravityLoads(model, 4.8, 2.4)
const design = designStructure(model, { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 } as never)!
const { cages } = buildStructureCages(model, design)
const bundles = frameElevationBundles(model, design, cages)

const textsOf = (d: { primitives: { kind: string }[] }) =>
  d.primitives.filter((p): p is Extract<typeof p, { kind: 'text' }> & { text: string } => p.kind === 'text')
    .map((p) => (p as unknown as { text: string }).text)

describe('clipToBand', () => {
  it('cuts a segment ON the band edge, so a bar reads as running out', () => {
    const [piece] = clipToBand([[0, 0], [0, 10]], 2, 6)
    expect(piece).toEqual([[0, 2], [0, 6]])
  })

  it('gives a bar that leaves and comes back TWO pieces, not one straight line', () => {
    // Joined end to end this would draw a bar through a region it never enters
    // — which on a joint sheet is a bar through the middle of a column.
    const out = clipToBand([[0, 0], [1, 0], [1, 10], [2, 10], [2, 0], [3, 0]], -1, 1)
    expect(out).toHaveLength(2)
    expect(out[0][0]).toEqual([0, 0])
    expect(out[1][out[1].length - 1]).toEqual([3, 0])
  })

  it('keeps a segment that crosses the whole band with neither end inside', () => {
    expect(clipToBand([[0, -5], [0, 5]], -1, 1)).toEqual([[[0, -1], [0, 1]]])
  })

  it('drops a run entirely outside', () => {
    expect(clipToBand([[0, 8], [3, 9]], -1, 1)).toEqual([])
  })
})

describe('runInk — one accent hue', () => {
  const r = (role: RebarRun['role']): RebarRun =>
    ({ mark: 'x', dia: 20, role, member: 'm', path: [], bendDia: [], count: 1 })

  it('inks longitudinal steel in the accent and transverse in its light tint', () => {
    expect(runInk(r('top'))).toBe(STEEL)
    expect(runInk(r('vertical'))).toBe(STEEL)
    expect(runInk(r('stirrup'))).toBe(STEEL_LIGHT)
    expect(runInk(r('tie'))).toBe(STEEL_LIGHT)
  })

  it('uses NO third colour for context — weight separates it, not hue', () => {
    const inks = new Set((['top', 'bottom', 'vertical', 'stirrup', 'tie'] as const).map((x) => runInk(r(x))))
    expect(inks.size).toBe(2)
  })
})

describe('gridLines', () => {
  it('reads the lines off where the columns actually stand', () => {
    // 3 × 2 columns: two lettered lines running in x, three numbered in z.
    const g = gridLines(model)
    expect(g.filter((x) => x.axis === 'x').map((x) => x.label)).toEqual(['A', 'B'])
    expect(g.filter((x) => x.axis === 'z').map((x) => x.label)).toEqual(['1', '2', '3'])
  })
})

describe('frameElevationBundles', () => {
  it('makes one sheet per grid line per FRAMED level, and none for the base', () => {
    // 5 lines × 2 framed levels. Level 0 has columns but no beams, so no sheet.
    expect(bundles).toHaveLength(10)
    expect(bundles.every((b) => b.input.y > 0)).toBe(true)
    expect(new Set(bundles.map((b) => b.key)).size).toBe(bundles.length)
  })

  it('bands the sheet half a storey each side of the beams', () => {
    const b = bundles.find((x) => x.key === 'frame-a-3-20')!
    expect(b.input.yLo).toBeCloseTo(3.2 - 1.6, 9)
    expect(b.input.yHi).toBeCloseTo(3.2 + 1.6, 9)
  })

  it('bands a ROOF level off the storey below, so the sheet keeps its shape', () => {
    // Nothing above the roof to take half of. Taking zero would collapse the
    // sheet onto the beam and lose the joint it exists to show.
    const b = bundles.find((x) => x.key === 'frame-a-6-40')!
    expect(b.input.yHi - b.input.y).toBeCloseTo(1.6, 9)
  })

  it('hangs each beam BELOW its level — the node is the top of the beam', () => {
    const b = bundles.find((x) => x.key === 'frame-a-3-20')!
    for (const m of b.input.members.filter((x) => x.role === 'beam')) {
      expect(m.yTop).toBeCloseTo(3.2, 9)
      expect(m.yBot).toBeCloseTo(3.2 - 0.5, 9)
    }
  })

  it('carries the columns from BOTH storeys, cut to the band', () => {
    const b = bundles.find((x) => x.key === 'frame-a-3-20')!
    const cols = b.input.members.filter((x) => x.role === 'column')
    expect(cols.filter((c) => c.yTop <= 3.2 + 1e-6)).toHaveLength(3)   // below
    expect(cols.filter((c) => c.yBot >= 3.2 - 1e-6)).toHaveLength(3)   // above
    for (const c of cols) {
      expect(c.yBot).toBeGreaterThanOrEqual(b.input.yLo - 1e-9)
      expect(c.yTop).toBeLessThanOrEqual(b.input.yHi + 1e-9)
    }
  })

  it('carries the CAGES of everything it draws, and nothing it does not', () => {
    const b = bundles.find((x) => x.key === 'frame-a-3-20')!
    const drawn = new Set(b.input.members.map((m) => m.mark))
    expect(b.input.cages.length).toBeGreaterThan(0)
    for (const c of b.input.cages) expect(drawn.has(c.member)).toBe(true)
    // every member it draws has its cage — a concrete box with no steel in it
    // is the failure this sheet replaced
    for (const mark of drawn) expect(b.input.cages.some((c) => c.member === mark)).toBe(true)
  })
})

describe('buildFrameElevation', () => {
  const d = buildFrameElevation(bundles.find((x) => x.key === 'frame-a-3-20')!.input, { sheetRef: 'S-04' })

  it('titles itself by grid line and level', () => {
    expect(d.title).toBe('FRAME ELEVATION — GRID A @ EL 3.20')
    expect(textsOf(d)).toContain('EL 3.20')
  })

  it('draws EVERY bar of every cage it was given, clipped to the band', () => {
    // the STEEL paths only — a leader's own arm lands outside the band by
    // design, since that is where its text sits
    const paths = d.primitives.filter((p) => p.kind === 'path'
      && (p.stroke === STEEL || p.stroke === STEEL_LIGHT))
    expect(paths.length).toBeGreaterThan(100)
    const band = [-(3.2 + 1.6), -(3.2 - 1.6)]
    for (const p of paths) {
      if (p.kind !== 'path') continue
      for (const c of p.cmds) {
        expect(c.y).toBeGreaterThanOrEqual(band[0] - 1e-6)
        expect(c.y).toBeLessThanOrEqual(band[1] + 1e-6)
      }
    }
  })

  it('carries the general-notes pointer and nothing else in prose', () => {
    // The rulebook lives on S-01; this sheet says so in one line and stops.
    const notes = textsOf(d).filter((t) => t.startsWith('REFER TO'))
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('S-01')
  })

  it('dimensions the beam depth ONCE, clear of the columns', () => {
    const dims = d.primitives.filter((p) => p.kind === 'dim') as Extract<typeof d.primitives[number], { kind: 'dim' }>[]
    const depth = dims.filter((p) => Math.abs(p.x1 - p.x2) < 1e-9)
    expect(depth).toHaveLength(1)
    expect(depth[0].text).toBe('500')
    // …and to the LEFT of everything drawn, not on the joint between two beams
    expect(depth[0].x1).toBeLessThan(0)
  })

  it('says nothing about a column step where there is none', () => {
    expect(d.designNotes).toEqual([])
    expect(textsOf(d).some((t) => t.includes('REDUCES'))).toBe(false)
  })
})

describe('buildFrameElevation — a column that steps in', () => {
  // The case the typical detail could never show: the storey above is smaller,
  // so the bars below have to crank to find the bars above.
  const member = (o: Partial<ElevationMember> & { mark: string; role: 'beam' | 'column' }): ElevationMember =>
    ({ u0: 0, u1: 1, yBot: 0, yTop: 1, bw: 300, d: 500, ...o })
  const i: FrameElevationInput = {
    line: 'A', y: 3, yLo: 1.5, yHi: 4.5,
    plane: elevationPlane([1, 0, 0], [0, 0, 0]),
    members: [
      member({ mark: 'B1', role: 'beam', u0: 0.25, u1: 5.75, yBot: 2.5, yTop: 3 }),
      member({ mark: 'C1', role: 'column', u0: -0.25, u1: 0.25, yBot: 1.5, yTop: 3, bw: 500, d: 500 }),
      member({ mark: 'C1b', role: 'column', u0: -0.15, u1: 0.15, yBot: 3, yTop: 4.5, bw: 300, d: 300 }),
      member({ mark: 'C2', role: 'column', u0: 5.75, u1: 6.25, yBot: 1.5, yTop: 3, bw: 500, d: 500 }),
      member({ mark: 'C2b', role: 'column', u0: 5.85, u1: 6.15, yBot: 3, yTop: 4.5, bw: 500, d: 500 }),
    ],
    grids: [{ u: 0, label: '1' }, { u: 6, label: '2' }],
    cages: [] as RebarCage[],
    subject: new Set(['B1']),
  }
  const d = buildFrameElevation(i)

  it('calls the reduction out where it happens, and only there', () => {
    expect(textsOf(d).filter((t) => t.includes('REDUCES'))).toEqual([
      'COLUMN REDUCES 500×500 → 300×300',
    ])
  })

  it('reports it as a design note rather than a paragraph under the drawing', () => {
    expect(d.designNotes).toHaveLength(1)
    expect(d.designNotes[0]).toContain('grid 1')
    expect(d.designNotes[0]).toContain('§410.7.4.1')
  })
})
