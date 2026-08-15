import { describe, it, expect } from 'vitest'
import {
  designBeamColumnJoint, buildBeamColumnJointDetail, effectiveJointWidth, jointHookLdh, wrapNote,
  JOINT_GAMMA, PHI_JOINT, COLUMN_DEPTH_BAR_DIAS, PROBABLE_FY, JOINT_HOOP_SPACING_MAX,
  type BeamColumnJointInput,
} from './beamColumnJoint'

// ─────────────────────────────────────────────────────────────────────────
// WORKED EXAMPLE — the joint the model actually produces, and it FAILS twice.
//
//   Column   400 × 400, ⌀20 verticals, ⌀10 hoops @ 100, cover 40
//   Beam     250 × 300 framing in one side, ⌀28 bars, 2 top / 2 bottom
//   Joint    confined on three faces, f'c 21 MPa, fy 415 MPa
//
// BY HAND
//
//   Effective width §418.8.4.3 / §415.4.2 — the least of
//     b + h  = 250 + 400 = 650
//     b + 2x = 250 + 2(200) = 650        (beam centred, x = colB/2)
//     colB   = 400                        ← governs
//   Aj = bj·h = 400 × 400 = 160 000 mm²
//
//   Strength §418.8.4.3, three faces → γ = 1.2
//     Vn  = 1.2 · 1.0 · √21 · 160 000 = 879 855 N = 879.85 kN
//     φVn = 0.85 · 879.85 = 747.87 kN            (φ = 0.85, §421.2.4.3)
//
//   Demand §418.8.2.1 — the BARS at 1.25fy, not the factored moment
//     As,top = 2 · π/4 · 28² = 1231.50 mm²
//     Vu = 1.25 · 415 · 1231.50 / 1000 = 638.84 kN  ≤ 747.87 ✓
//
//   §418.8.2.3 — column depth ≥ 20db = 20(28) = 560 mm; provided 400  ✗
//   §418.8.5.1 — ℓdh = fy·db/(5.4λ√f'c) = 415(28)/(5.4·4.5826) = 469.6 mm
//                available inside the column = 400 − 40 − 10 = 350   ✗
//
// Both failures are the same physical fact: a ⌀28 beam bar is too big for a
// 400 mm column. That is what the sheet exists to say out loud.
// ─────────────────────────────────────────────────────────────────────────
const joint: BeamColumnJointInput = {
  mark: 'J1',
  colB: 400, colH: 400, colBarDia: 20, colBars: 8, hoopDia: 10, hoopSpacing: 100,
  beamB: 250, beamH: 300, beamBarDia: 28, topBars: 2, botBars: 2,
  confinement: 'three-faces', fc: 21, fy: 415, cover: 40,
}
/** The same joint sized so it works: a 600 column and ⌀20 beam bars. */
const good: BeamColumnJointInput = {
  ...joint, mark: 'J2',
  colB: 600, colH: 600, beamB: 500, beamH: 500, beamBarDia: 20,
  topBars: 4, botBars: 3, interior: true, confinement: 'four-faces', wideBeams: true,
}

describe('effective joint width — §418.8.4.3 / §415.4.2', () => {
  it('takes the least of b+h, b+2x and the column width', () => {
    expect(effectiveJointWidth(250, 400, 400)).toBe(400)      // the column governs
    expect(effectiveJointWidth(250, 900, 300)).toBe(550)      // b + h governs
  })

  it('narrows for an ECCENTRIC beam — it cannot mobilise the far side', () => {
    // Beam pushed 150 mm off centre in a 600 column: x = 300 − 150 = 150,
    // so b + 2x = 200 + 300 = 500 rather than the full 600.
    expect(effectiveJointWidth(200, 600, 600, 0)).toBe(600)
    expect(effectiveJointWidth(200, 600, 600, 150)).toBe(500)
    expect(effectiveJointWidth(200, 600, 600, 300)).toBe(200)
  })
})

describe('hook development in a joint — §418.8.5.1', () => {
  it('is fy·db/(5.4λ√f′c), floored at 8db and 150 mm', () => {
    expect(jointHookLdh(28, 415, 21)).toBeCloseTo(469.57, 1)
    expect(jointHookLdh(20, 415, 21)).toBeCloseTo(335.41, 1)
    // a small bar in strong concrete hits the 8db floor
    expect(jointHookLdh(12, 275, 60)).toBe(150)
    expect(jointHookLdh(25, 275, 60)).toBe(8 * 25)
  })

  it('is SHORTER than the general §425.4.3 hook, because the core is confined', () => {
    // §425.4.3.1 gives 0.24·fy·db/√f'c for the same bar — 528 mm against 470.
    const general = (0.24 * 415 * 28) / Math.sqrt(21)
    expect(jointHookLdh(28, 415, 21)).toBeLessThan(general)
  })
})

describe('designBeamColumnJoint — the worked example', () => {
  const r = designBeamColumnJoint(joint)

  it('carries the Table 418.8.4.3 γ values', () => {
    expect(JOINT_GAMMA['four-faces']).toBe(1.7)
    expect(JOINT_GAMMA['three-faces']).toBe(1.2)
    expect(JOINT_GAMMA['two-opposite']).toBe(1.2)
    expect(JOINT_GAMMA.other).toBe(1.0)
    expect(PHI_JOINT).toBe(0.85)                 // NOT the 0.75 of member shear
  })

  it('sizes the joint area and its shear strength', () => {
    expect(r.bj).toBe(400)
    expect(r.Aj).toBe(160000)
    expect(r.gamma).toBe(1.2)
    expect(r.Vn).toBeCloseTo(879.85, 1)
    expect(r.phiVn).toBeCloseTo(747.87, 1)
  })

  it('takes the demand from the BARS at 1.25fy, not from the factored moment', () => {
    expect(PROBABLE_FY).toBe(1.25)
    expect(r.Vu).toBeCloseTo(638.84, 1)
    expect(r.shearOK).toBe(true)
  })

  it('adds both faces at an INTERIOR joint, and credits the column shear', () => {
    const inner = designBeamColumnJoint({ ...joint, interior: true })
    expect(inner.Vu).toBeCloseTo(2 * 638.84, 1)          // top + bottom both pull
    const relieved = designBeamColumnJoint({ ...joint, Vcol: 100 })
    expect(relieved.Vu).toBeCloseTo(638.84 - 100, 1)
    // …and the credit cannot drive the demand negative
    expect(designBeamColumnJoint({ ...joint, Vcol: 5000 }).Vu).toBe(0)
  })

  it('FAILS the §418.8.2.3 column depth — a ⌀28 bar needs 560 mm of column', () => {
    expect(COLUMN_DEPTH_BAR_DIAS).toBe(20)
    expect(r.colDepthMin).toBe(560)
    expect(r.colDepthOK).toBe(false)
    expect(r.notes.join(' ')).toContain('§418.8.2.3')
  })

  it('FAILS the hook fit — 470 mm of ℓdh in 350 mm of column', () => {
    expect(r.ldh).toBeCloseTo(469.57, 1)
    expect(r.ldhAvail).toBe(350)                          // 400 − 40 cover − 10 hoop
    expect(r.ldhFits).toBe(false)
    expect(r.hookTail).toBe(336)                          // 12db
    expect(r.notes.join(' ')).toContain('§418.8.5.1')
  })

  it('is not OK overall, and says why', () => {
    expect(r.ok).toBe(false)
    expect(r.notes.length).toBeGreaterThanOrEqual(2)
  })
})

describe('designBeamColumnJoint — a joint that works', () => {
  const r = designBeamColumnJoint(good)

  it('passes every check once the column is big enough for the bar', () => {
    expect(r.colDepthMin).toBe(400)
    expect(r.colDepthOK).toBe(true)
    expect(r.ldhFits).toBe(true)
    expect(r.shearOK).toBe(true)
    expect(r.ok).toBe(true)
    expect(r.notes).toEqual([])
  })

  it('halves the joint hoops where four wide beams frame in — §418.8.3.2', () => {
    expect(r.halvedHoops).toBe(true)
    expect(r.jointHoopSpacing).toBe(Math.min(JOINT_HOOP_SPACING_MAX, 2 * 100))
    // …and does not, without the four faces
    const three = designBeamColumnJoint({ ...good, confinement: 'three-faces' })
    expect(three.halvedHoops).toBe(false)
    expect(three.jointHoopSpacing).toBe(100)
    const narrow = designBeamColumnJoint({ ...good, wideBeams: false })
    expect(narrow.halvedHoops).toBe(false)
  })

  it('fails on shear when the joint is unconfined and the beams are heavy', () => {
    const weak = designBeamColumnJoint({ ...good, confinement: 'other', topBars: 8, botBars: 8 })
    expect(weak.gamma).toBe(1.0)
    expect(weak.shearOK).toBe(false)
    expect(weak.notes.join(' ')).toContain('§418.8.4.3')
    expect(weak.notes.join(' ')).toContain('γ = 1.0')
  })
})

describe('wrapNote', () => {
  it('breaks on spaces and never exceeds the width', () => {
    const l = wrapNote('COLUMN CONFINEMENT HOOPS CONTINUE THROUGH THE JOINT', 18)
    for (const x of l) expect(x.length).toBeLessThanOrEqual(18)
    expect(l.join(' ')).toBe('COLUMN CONFINEMENT HOOPS CONTINUE THROUGH THE JOINT')
  })
})

const GLYPH = 0.63
const textOf = (d: ReturnType<typeof buildBeamColumnJointDetail>) =>
  d.primitives.filter((p) => p.kind === 'text' || p.kind === 'dim').map((p) => (p as { text: string }).text)

describe('buildBeamColumnJointDetail', () => {
  const d = buildBeamColumnJointDetail(joint, { detailNo: '1', sheetRef: 'S-10' })
  const flat = textOf(d).join(' ').replace(/\s+/g, ' ')

  it('titles and returns finite, ordered bounds', () => {
    expect(d.title).toBe('TYPICAL BEAM–COLUMN JOINT — J1')
    for (const v of Object.values(d.bounds)) expect(Number.isFinite(v)).toBe(true)
    expect(d.bounds.maxX).toBeGreaterThan(d.bounds.minX)
    expect(d.bounds.maxY).toBeGreaterThan(d.bounds.minY)
  })

  it('carries BOTH views, the plan below the section', () => {
    expect(flat).toContain('VERTICAL SECTION Y-Y')
    expect(flat).toContain('PLAN SECTION X-X')
    const yy = d.primitives.find((p) => p.kind === 'text' && (p as { text: string }).text === 'VERTICAL SECTION Y-Y') as { y: number }
    const xx = d.primitives.find((p) => p.kind === 'text' && (p as { text: string }).text === 'PLAN SECTION X-X') as { y: number }
    expect(xx.y).toBeGreaterThan(yy.y)                    // y runs DOWN the sheet
  })

  it('hooks the beam bars into the confined core, 60 clear, in both views', () => {
    const paths = d.primitives.filter((p) => p.kind === 'path') as { cmds: { x: number; y: number }[] }[]
    // two hooked bars in the elevation (top + bottom) and two runs in the plan
    expect(paths.length).toBe(4)
    const hooked = paths.filter((p) => p.cmds.length === 3)
    expect(hooked).toHaveLength(2)
    for (const p of hooked) {
      const [, b2, c] = p.cmds
      expect(Math.abs(c.x - b2.x)).toBeLessThan(1e-9)      // the tail turns square
      expect(Math.abs(c.y - b2.y)).toBeGreaterThan(0)
    }
    expect(flat).toContain('60 CL. TO END OF HOOKS')
  })

  it('draws the column hoops continuing THROUGH the joint', () => {
    // Horizontal rebar lines inside the joint block (0 ≤ y ≤ beam depth).
    const bh = joint.beamH / 1000
    const inJoint = d.primitives.filter((p) => p.kind === 'line' && p.stroke === '#b45309'
      && Math.abs(p.y1 - p.y2) < 1e-9 && p.y1 > 0 && p.y1 < bh) as unknown[]
    expect(inJoint.length).toBeGreaterThan(0)
    expect(flat).toContain(`JOINT HOOPS ⌀10 @ ${d.result.jointHoopSpacing}`)
  })

  it('states the joint checks, and prints the failures in red', () => {
    expect(flat).toContain('§418.8.4')
    expect(flat).toContain('§418.8.2.3')
    expect(flat).toContain('§418.8.5.1')
    expect(flat).toContain(`20db = ${d.result.colDepthMin}`)
    const warn = d.primitives.filter((p) => p.kind === 'text' && p.color === '#b91c1c') as { text: string }[]
    expect(d.result.ok).toBe(false)
    expect(warn.length).toBeGreaterThan(0)
    expect(warn.map((w) => w.text).join(' ')).toContain('⚠')
  })

  it('drops the warnings when the joint works', () => {
    const ok = buildBeamColumnJointDetail(good, { detailNo: '2' })
    expect(ok.result.ok).toBe(true)
    const warn = ok.primitives.filter((p) => p.kind === 'text' && p.color === '#b91c1c')
    expect(warn).toHaveLength(0)
  })

  it('puts the title block below both views and the notes', () => {
    const titleText = d.primitives.find((p) => p.kind === 'text'
      && (p as { text: string }).text.startsWith('TYPICAL BEAM')) as { y: number }
    const planText = d.primitives.find((p) => p.kind === 'text'
      && (p as { text: string }).text === 'PLAN SECTION X-X') as { y: number }
    expect(titleText.y).toBeGreaterThan(planText.y)
    expect(textOf(d)).toContain('SCALE')
    expect(textOf(d)).toContain('NTS')
    expect(textOf(d)).toContain('S-10')
  })

  it('draws every primitive, text extents included, inside the sheet bounds', () => {
    for (const p of d.primitives) {
      let xs: number[] = [], ys: number[] = []
      if (p.kind === 'line' || p.kind === 'dim') { xs = [p.x1, p.x2]; ys = [p.y1, p.y2] }
      else if (p.kind === 'rect') { xs = [p.x, p.x + p.w]; ys = [p.y, p.y + p.h] }
      else if (p.kind === 'circle') { xs = [p.cx - p.r, p.cx + p.r]; ys = [p.cy - p.r, p.cy + p.r] }
      else if (p.kind === 'path') { xs = p.cmds.map((c) => c.x); ys = p.cmds.map((c) => c.y) }
      else if (p.kind === 'text') {
        const w = p.text.length * GLYPH * p.size
        const lead = p.anchor === 'middle' ? -w / 2 : p.anchor === 'end' ? -w : 0
        xs = [p.x + lead, p.x + lead + w]; ys = [p.y - p.size / 2, p.y + p.size / 2]
      }
      for (const x of xs) { expect(x).toBeGreaterThanOrEqual(d.bounds.minX - 1e-9); expect(x).toBeLessThanOrEqual(d.bounds.maxX + 1e-9) }
      for (const y of ys) { expect(y).toBeGreaterThanOrEqual(d.bounds.minY - 1e-9); expect(y).toBeLessThanOrEqual(d.bounds.maxY + 1e-9) }
    }
  })

  it('survives a degenerate joint without throwing', () => {
    const bare = buildBeamColumnJointDetail({
      colB: 0, colH: 0, colBarDia: 0, colBars: 0, hoopDia: 0, hoopSpacing: 0,
      beamB: 0, beamH: 0, beamBarDia: 0, topBars: 0, botBars: 0,
    })
    expect(bare.primitives.length).toBeGreaterThan(0)
    for (const v of Object.values(bare.bounds)) expect(Number.isFinite(v)).toBe(true)
  })
})
