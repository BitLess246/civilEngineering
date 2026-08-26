import { describe, it, expect } from 'vitest'
import {
  buildFrameElevation, clipToBand, runInk, pitchRuns, pitchNote, angledLeader,
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

describe('pitchRuns', () => {
  it('groups stations into runs of constant pitch', () => {
    const st = [0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 1.0, 1.1]
    expect(pitchRuns(st)).toEqual([
      { count: 3, pitch: 100 }, { count: 3, pitch: 200 }, { count: 2, pitch: 100 },
    ])
    expect(pitchNote(pitchRuns(st))).toBe('3@100, 3@200, 2@100')
  })

  it('tolerates the millimetre or two a divided gap lands on', () => {
    // A middle span DIVIDED into n equal parts gives pitches a hair apart.
    // "11@218, 1@219" describes the same layout worse than "12@218".
    const st = [0, 0.218, 0.436, 0.655, 0.873]
    expect(pitchRuns(st)).toHaveLength(1)
    expect(pitchRuns(st)[0].count).toBe(4)
  })

  it('says nothing about a single bar, which has no pitch', () => {
    expect(pitchRuns([0.5])).toEqual([])
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

  it('draws the column face that is actually IN VIEW, so its bars fit inside it', () => {
    // `columnCage` puts the section's h on global X and its b on global Z, so a
    // lettered line (running in x) sees h and a numbered one sees b. Drawn as b
    // either way, a 300×500 column on grid A came out 300 wide with its bars
    // spread 410 — the steel outside its own concrete.
    for (const [key, want] of [['frame-a-3-20', 500], ['frame-1-3-20', 300]] as const) {
      const b = bundles.find((x) => x.key === key)!.input
      const col = b.members.find((m) => m.role === 'column')!
      expect(Math.round((col.u1 - col.u0) * 1000)).toBe(want)
      // and every bar of that column's cage really is inside it
      const cage = b.cages.find((c) => c.member === col.mark)!
      const us = cage.runs.flatMap((r) => r.path.map((p) =>
        (p[0] - b.plane.origin[0]) * b.plane.u[0] + (p[2] - b.plane.origin[2]) * b.plane.u[2]))
      expect(Math.min(...us)).toBeGreaterThanOrEqual(col.u0 - 1e-9)
      expect(Math.max(...us)).toBeLessThanOrEqual(col.u1 + 1e-9)
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

  it('puts the grid bubbles ABOVE the drawing, where a reader looks first', () => {
    // Below, they had the span dimensions and every beam's schedule stacked on
    // top of them, and the framing plans carry theirs above.
    const beams = bundles.find((x) => x.key === 'frame-a-3-20')!.input.members
    const top = Math.min(...beams.map((m) => -m.yTop))     // page-Y of the highest concrete
    const circles = d.primitives.filter((p) => p.kind === 'circle') as { cy: number; cx: number }[]
    // one per grid position, all of them above the concrete. The fourth circle
    // on the sheet is the title block's own detail bubble, far below.
    expect(circles.filter((c) => c.cy < top)).toHaveLength(3)
    expect(circles.filter((c) => c.cy > top)).toHaveLength(1)
    // …and the span dimensions stay BELOW it, so the two never share a lane
    const dims = d.primitives.filter((p) => p.kind === 'dim'
      && Math.abs((p as { y1: number; y2: number }).y1 - (p as { y2: number }).y2) < 1e-9) as { y1: number }[]
    expect(Math.max(...dims.map((x) => x.y1))).toBeGreaterThan(top)
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
    expect(textsOf(d).some((t) => t.includes('REDUCES'))).toBe(false)
    expect(d.designNotes.some((n) => n.includes('reduces'))).toBe(false)
  })

  it('carries what the CAGES flagged, so retiring a sheet cannot retire a check', () => {
    // The ℓdh check used to live on the typical beam detail and existed only
    // for as long as that sheet did. It is the cage's now, and reaches every
    // view of the same bar.
    expect(d.designNotes.some((n) => /ℓdh \d+ exceeds/.test(n))).toBe(true)
    // …named by the member it is about, so it is actionable
    expect(d.designNotes.every((n) => /^[\w.]+: /.test(n))).toBe(true)
    // …and counted once each, not once per bar in the face
    expect(new Set(d.designNotes).size).toBe(d.designNotes.length)
  })

  it('reports the laps it had to introduce, counted off the pieces it cut', () => {
    expect(d.designNotes.some((n) => /1 lap per bar/.test(n))).toBe(true)
  })

  it('schedules the stirrups it actually drew', () => {
    const sched = textsOf(d).filter((t) => t.includes('STIRRUPS'))
    expect(sched.length).toBe(2)                     // one per beam
    expect(sched[0]).toMatch(/2L-⌀\d+ STIRRUPS, \d+ No\./)
    // the pitch line beside it parses as runs of constant spacing
    expect(textsOf(d).some((t) => /^\d+@\d+(, \d+@\d+)*$/.test(t))).toBe(true)
  })

  it('places every callout AGAINST its beam, not out at the band edge', () => {
    // The band is half a storey either side; a label parked out there makes the
    // reader hunt for which member it names.
    const beam = bundles.find((x) => x.key === 'frame-a-3-20')!.input
      .members.find((m) => m.role === 'beam')!
    const yTop = -beam.yTop, yBot = -beam.yBot        // page-Y
    const labels = d.primitives.filter((p) => p.kind === 'text'
      && (/STIRRUPS/.test(p.text) || /THRU/.test(p.text) || /^bx/.test(p.text))) as { y: number }[]
    expect(labels.length).toBeGreaterThan(0)
    const depth = yBot - yTop
    for (const t of labels) {
      // within a couple of beam depths of the concrete — the band edge is more
      // than three away, which is where these used to sit
      expect(t.y).toBeGreaterThan(yTop - 2 * depth)
      expect(t.y).toBeLessThan(yBot + 2 * depth)
    }
  })

  it('gives each FACE its own leader, pointing at its own bars', () => {
    // One callout that pointed at the top steel and then recited both faces
    // told the reader about a bar the arrow was nowhere near.
    const beam = bundles.find((x) => x.key === 'frame-a-3-20')!.input
      .members.filter((m) => m.role === 'beam').sort((a, b) => a.u0 - b.u0)[0]
    const yTop = -beam.yTop, yBot = -beam.yBot, depth = yBot - yTop
    // the arrowhead is the only FILLED path on the sheet — one per leader
    const heads = d.primitives.filter((p) => p.kind === 'path' && p.fill && p.fill !== 'none'
      && p.cmds[0].x >= beam.u0 && p.cmds[0].x <= beam.u1) as { cmds: { x: number; y: number }[] }[]
    const at = (lo: number, hi: number) => heads.filter((h) => h.cmds[0].y > lo && h.cmds[0].y < hi)
    expect(at(yTop - 1e-9, yTop + depth * 0.3)).toHaveLength(1)         // top steel
    expect(at(yBot - depth * 0.3, yBot + 1e-9)).toHaveLength(1)         // bottom steel
    expect(at(yTop + depth * 0.4, yTop + depth * 0.6)).toHaveLength(1)  // a stirrup, mid-depth
    // …and each says what it is
    const t = textsOf(d)
    expect(t.some((x) => /^\d-⌀\d+ TOP THRU/.test(x))).toBe(true)
    expect(t.some((x) => /^\d-⌀\d+ BOT\. THRU/.test(x))).toBe(true)
    expect(t.some((x) => /STIRRUPS/.test(x))).toBe(true)
    // no label names a face it does not point at
    expect(t.some((x) => /TOP THRU/.test(x) && /BOT\./.test(x))).toBe(false)
  })

  it('names the member with a plain label, since a mark points at no one bar', () => {
    const marks = textsOf(d).filter((x) => /^bx[\d.]+ /.test(x))
    expect(marks).toHaveLength(2)
    expect(marks[0]).toMatch(/^bx[\d.]+ {2}300×500$/)
  })

  it('keeps every callout inside the sheet it is drawn on', () => {
    const us = d.primitives.filter((p) => p.kind === 'rect').flatMap((p) => {
      const r = p as { x: number; w: number }
      return [r.x, r.x + r.w]
    })
    const uMin = Math.min(...us), uMax = Math.max(...us)
    for (const p of d.primitives) {
      if (p.kind !== 'text' || !/STIRRUPS|THRU/.test(p.text)) continue
      const w = p.text.length * 0.63 * p.size
      const lo = p.anchor === 'end' ? p.x - w : p.x
      expect(lo).toBeGreaterThanOrEqual(uMin - 1e-6)
      expect(lo + w).toBeLessThanOrEqual(uMax + 1e-6)
    }
  })

  it('keeps every callout in its OWN bay, clear of the columns', () => {
    // Bounded to the sheet rather than the beam, a label slides across the
    // column and names a member a bay away as far as the eye can tell.
    const beams = bundles.find((x) => x.key === 'frame-a-3-20')!.input
      .members.filter((m) => m.role === 'beam').sort((a, b) => a.u0 - b.u0)
    for (const p of d.primitives) {
      if (p.kind !== 'text' || !/STIRRUPS|THRU|^bx/.test(p.text)) continue
      const w = p.text.length * 0.63 * p.size
      const lo = p.anchor === 'end' ? p.x - w : p.x
      const owner = beams.find((b) => lo >= b.u0 - 1e-6 && lo + w <= b.u1 + 1e-6)
      expect(owner, `"${p.text}" straddles a bay`).toBeDefined()
    }
  })

  it('counts the bars off the cage, not off the design input', () => {
    expect(textsOf(d).some((t) => /\d-⌀20 TOP THRU/.test(t))).toBe(true)
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

describe('angledLeader — the leg runs at 45°', () => {
  /** The inclined leg: the one plain line between the knee and the arrowhead. */
  const leg = (prims: ReturnType<typeof angledLeader>) => {
    const l = prims.find((p) => p.kind === 'line') as
      { x1: number; y1: number; x2: number; y2: number }
    return { dx: l.x2 - l.x1, dy: l.y2 - l.y1 }
  }

  it('makes the leg 45° whatever the label says', () => {
    // `leader` puts its knee a fixed distance from the text anchor, so moving
    // the label in close to the member flattens the leg to a glancing wedge —
    // 27° on the first attempt at this. The knee is placed one rise from the
    // target instead, which fixes the angle at 45° by construction.
    for (const text of ['B1', 'B1  300×500 — a very much longer callout indeed']) {
      const { dx, dy } = leg(angledLeader({ x: 5, y: 0, ty: -0.4, side: 'right', text, size: 0.1 }))
      expect(Math.abs(Math.abs(dx) - Math.abs(dy))).toBeLessThan(1e-9)
    }
  })

  it('holds 45° however far the label is placed from the target', () => {
    for (const ty of [-0.2, -0.6, -1.5]) {
      const { dx, dy } = leg(angledLeader({ x: 5, y: 0, ty, side: 'right', text: 'B1', size: 0.1 }))
      expect(Math.abs(dx)).toBeCloseTo(Math.abs(dy), 9)
    }
  })

  it('turns OBTUSE at the knee — the leg carries on AWAY from the label', () => {
    // With the target on the NEAR side of the knee the leg doubles back
    // underneath its own landing: a near reversal, which reads as a line
    // folded on itself rather than one stroke running out to a point. The
    // landing and the leg have to lean the same way.
    for (const side of ['left', 'right'] as const) {
      const p = angledLeader({ x: 5, y: 0, ty: -0.4, side, text: 'B1', size: 0.1 })
      const l = p.find((q) => q.kind === 'line') as { x1: number; x2: number }
      const t = p.find((q) => q.kind === 'text') as { x: number }
      // out from the text anchor to the knee, then ON in the same direction
      expect(Math.sign(l.x1 - t.x)).toBe(Math.sign(l.x2 - l.x1))
    }
  })

  it('runs the leg the way the label is, on each side', () => {
    const r = leg(angledLeader({ x: 5, y: 0, ty: -0.4, side: 'right', text: 'B1', size: 0.1 }))
    const l = leg(angledLeader({ x: 5, y: 0, ty: -0.4, side: 'left', text: 'B1', size: 0.1 }))
    expect(Math.sign(r.dx)).toBe(-Math.sign(l.dx))
  })

  it('flips to the other side rather than run the label off the sheet', () => {
    const within: [number, number] = [0, 6]
    const near = angledLeader({ x: 5.6, y: 0, ty: -0.4, side: 'left', within, text: 'A LONG CALLOUT', size: 0.1 })
    const xs = near.filter((p) => p.kind === 'text').map((p) => (p as { x: number }).x)
    // asked for 'left' (label to the RIGHT) it would overrun 6.0, so it went left
    expect(Math.max(...xs)).toBeLessThanOrEqual(6 + 1e-9)
  })

  it('keeps the side it was asked for when that side fits', () => {
    const within: [number, number] = [0, 12]
    const a = angledLeader({ x: 6, y: 0, ty: -0.4, side: 'left', within, text: 'B1', size: 0.1 })
    const b = angledLeader({ x: 6, y: 0, ty: -0.4, side: 'left', text: 'B1', size: 0.1 })
    expect(leg(a)).toEqual(leg(b))
  })
})
