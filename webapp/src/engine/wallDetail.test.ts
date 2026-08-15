import { describe, it, expect } from 'vitest'
import {
  shearFrictionSteel, wallMinRatios, wallMaxSpacing, designWallDetail, wrapNote,
  buildWallCornerDetail, buildWallIntersectionDetail, buildWallJointDetail,
  FRICTION_MU, ROUGHENING_AMPLITUDE, TWO_CURTAIN_THICKNESS,
  type WallDetailInput,
} from './wallDetail'

// ─────────────────────────────────────────────────────────────────────────
// WORKED EXAMPLE — the fixture every assertion below is checked against.
//
//   Wall      t = 200 mm, one curtain, cover 20 mm
//   Steel     ⌀12 @ 200 c/c each way, f'c = 21 MPa, fy = 415 MPa
//   Joint     ℓw = 3.00 m, Vu = 400 kN across a roughened construction joint
//
// BY HAND
//
//   Curtains — t = 200 ≤ 250, so ONE curtain (§411.7.2.3)
//   Spacing  — s_max = lesser of 3t = 600 and 450 → 450; 200 provided ✓
//
//   Ratios (Table 411.6.1) — fy = 415 < 420, so the ⌀16/Grade-420 row does NOT
//     apply and the "other deformed bars" row governs: ρℓ 0.0015, ρt 0.0025.
//     provided = Ab/(s·t) = 113.10/(200·200) = 0.002827 ≥ both ✓
//
//   Development §425.4.2.3 — cb = min(20 + 6, 100) = 26, (cb+Ktr)/db = 2.167
//     ld  = 415·0.8·12 / (1.1·4.583·2.167) = 364.75 mm
//     lap = Class B = 1.3·ld = 474.18 mm                        §425.5.2
//   Standard hook §425.4.3.1 — no ψc/ψr (a hook in a wall corner has neither
//     the 65 mm side cover nor ties around it):
//     ldh = 0.24·415·12 / 4.583 = 260.81 mm  (> 8db = 96, > 150) ✓
//     tail = 12db = 144 mm                                      §425.3.1
//
//   Shear friction §422.9 across the joint, roughened → μ = 1.0λ = 1.0
//     Ac    = 3000 · 200 = 600 000 mm²
//     Avf   = (Vu/φ)/(μ·fy) = (400/0.75)·1000 / (1.0·415) = 1285.1 mm²
//     Vn,max = min(0.2·21, 3.3 + 0.08·21, 11) = min(4.2, 4.98, 11) = 4.2 MPa
//            → 2520 kN, φVn,max = 1890 kN ≥ 400 ✓
//     provided by the vertical curtain crossing the joint:
//            113.10 · (3000/200) = 1696.5 mm² ≥ 1285.1 ✓
// ─────────────────────────────────────────────────────────────────────────
const wall: WallDetailInput = {
  mark: 'W1', t: 200, barDia: 12, spacing: 200,
  cover: 20, fc: 21, fy: 415,
  Vu: 400, lw: 3.0, surface: 'roughened',
}
const LAP_B = 474.18, LDH = 260.81, AVF = 1285.14, AVF_PROVIDED = 1696.46

describe('shear friction — §422.9', () => {
  it('carries the Table 422.9.4.2 μ values', () => {
    expect(FRICTION_MU.monolithic).toBe(1.4)
    expect(FRICTION_MU.roughened).toBe(1.0)
    expect(FRICTION_MU['not-roughened']).toBe(0.6)
    expect(FRICTION_MU['as-rolled-steel']).toBe(0.7)
  })

  it('sizes Avf from Vu/φ over μ·fy', () => {
    const r = shearFrictionSteel({ Vu: 400, Ac: 600e3, fc: 21, fy: 415, surface: 'roughened' })
    expect(r.mu).toBe(1.0)
    expect(r.Avf).toBeCloseTo(AVF, 1)
    expect(r.capOK).toBe(true)
  })

  it('costs 67% more steel when the joint is not roughened', () => {
    // The whole reason the roughening note is on the drawing: μ drops 1.0 → 0.6.
    const rough = shearFrictionSteel({ Vu: 400, Ac: 600e3, fc: 21, fy: 415, surface: 'roughened' })
    const smooth = shearFrictionSteel({ Vu: 400, Ac: 600e3, fc: 21, fy: 415, surface: 'not-roughened' })
    expect(smooth.Avf / rough.Avf).toBeCloseTo(1 / 0.6, 6)
    expect(smooth.notes.join(' ')).toContain(`${ROUGHENING_AMPLITUDE} mm amplitude`)
  })

  it('caps Vn by the INTERFACE, not by the steel — §422.9.4.4', () => {
    // 4.2 MPa governs at f'c 21 (0.2f'c below both 3.3+0.08f'c and 11).
    const r = shearFrictionSteel({ Vu: 2000, Ac: 600e3, fc: 21, fy: 415, surface: 'roughened' })
    expect(r.VnMax).toBeCloseTo(2520, 6)
    expect(r.phiVnMax).toBeCloseTo(1890, 6)
    expect(r.capOK).toBe(false)
    expect(r.notes.join(' ')).toContain('§422.9.4.4')
    // an unroughened joint at high f'c is held to 5.5 MPa instead of 3.3+0.08f'c
    const hi = shearFrictionSteel({ Vu: 1, Ac: 1e6, fc: 40, fy: 415, surface: 'not-roughened' })
    expect(hi.VnMax).toBeCloseTo(5.5 * 1e6 / 1000, 6)      // 5.5 < 0.2·40 = 8.0
  })

  it('credits a PERMANENT compression across the interface — §422.9.4.5', () => {
    const bare = shearFrictionSteel({ Vu: 400, Ac: 600e3, fc: 21, fy: 415, surface: 'roughened' })
    const held = shearFrictionSteel({ Vu: 400, Ac: 600e3, fc: 21, fy: 415, surface: 'roughened', Pu: 133.33 })
    expect(held.Avf).toBeLessThan(bare.Avf)
    expect(held.Avf).toBeCloseTo(((400 / 0.75) - 133.33) * 1000 / 415, 3)
    // and a compression bigger than the demand cannot make Avf negative
    expect(shearFrictionSteel({ Vu: 10, Ac: 600e3, fc: 21, fy: 415, surface: 'roughened', Pu: 900 }).Avf).toBe(0)
  })
})

describe('distributed wall steel — §411.6 / §411.7', () => {
  it('drops to the heavier minimum below Grade 420', () => {
    // NSCP's Grade-415 bar does NOT meet the "fy ≥ 420" row, so the wall needs
    // ρt 0.0025 rather than 0.0020 — the same threshold slabDDM uses for
    // §408.6.1.1 temperature steel, kept consistent on purpose.
    expect(wallMinRatios(12, 415)).toEqual({ rhoL: 0.0015, rhoT: 0.0025 })
    expect(wallMinRatios(12, 420)).toEqual({ rhoL: 0.0012, rhoT: 0.0020 })
    expect(wallMinRatios(20, 420)).toEqual({ rhoL: 0.0015, rhoT: 0.0025 })   // bar too big
  })

  it('limits spacing to the lesser of 3t and 450', () => {
    expect(wallMaxSpacing(100)).toBe(300)      // 3t governs
    expect(wallMaxSpacing(200)).toBe(450)      // the 450 cap governs
  })
})

describe('designWallDetail — the worked example', () => {
  const r = designWallDetail(wall)

  it('takes one curtain at 200 mm and two past the §411.7.2.3 threshold', () => {
    expect(r.curtains).toBe(1)
    expect(designWallDetail({ ...wall, t: TWO_CURTAIN_THICKNESS + 1 }).curtains).toBe(2)
    expect(designWallDetail({ ...wall, t: TWO_CURTAIN_THICKNESS }).curtains).toBe(1)
  })

  it('checks spacing and both minimum ratios', () => {
    expect(r.sMax).toBe(450)
    expect(r.spacingOK).toBe(true)
    expect(r.rhoTMin).toBe(0.0025)
    expect(r.rhoT).toBeCloseTo(0.0028274, 7)
    expect(r.rhoL).toBeCloseTo(0.0028274, 7)
    expect(r.rhoOK).toBe(true)
  })

  it('sizes the corner bar leg as the Class B lap it has to make', () => {
    expect(r.lapB).toBeCloseTo(LAP_B, 1)
    expect(r.cornerLeg).toBe(r.lapB)
  })

  it('develops the branch wall bars with a standard hook', () => {
    expect(r.ldh).toBeCloseTo(LDH, 1)
    expect(r.hookTail).toBe(144)               // 12db
  })

  it('counts the vertical curtain as the joint shear-friction steel', () => {
    expect(r.joint?.Avf).toBeCloseTo(AVF, 1)
    expect(r.AvfProvided).toBeCloseTo(AVF_PROVIDED, 1)
    expect(r.jointOK).toBe(true)
    expect(r.ok).toBe(true)
  })
})

describe('designWallDetail — the cases the detail exists to catch', () => {
  it('fails a wall whose distributed steel is under the §411.6.1 minimum', () => {
    const r = designWallDetail({ ...wall, spacing: 300, vertSpacing: 300 })
    expect(r.rhoT).toBeLessThan(r.rhoTMin)
    expect(r.rhoOK).toBe(false)
    expect(r.ok).toBe(false)
    expect(r.notes.join(' ')).toContain('§411.6.1')
  })

  it('fails a spacing past the lesser of 3t and 450', () => {
    const r = designWallDetail({ ...wall, t: 120, spacing: 400, vertSpacing: 400 })
    expect(r.sMax).toBe(360)
    expect(r.spacingOK).toBe(false)
    expect(r.notes.join(' ')).toContain('§411.7.2.1')
  })

  it('fails a joint whose vertical steel cannot carry the shear, and says the spacing that would', () => {
    const r = designWallDetail({ ...wall, surface: 'not-roughened' })
    expect(r.joint?.mu).toBe(0.6)
    expect(r.joint?.Avf).toBeCloseTo(AVF / 0.6, 1)      // 2141.9 > 1696.5 provided
    expect(r.jointOK).toBe(false)
    expect(r.ok).toBe(false)
    const said = r.notes.join(' ')
    expect(said).toContain('§422.9')
    // the remedy it prints really does provide enough steel
    const s2 = Number(said.match(/tighten the vertical spacing to (\d+) mm/)![1])
    const fixed = designWallDetail({ ...wall, surface: 'not-roughened', vertSpacing: s2 })
    expect(fixed.AvfProvided!).toBeGreaterThanOrEqual(fixed.joint!.Avf)
    expect(fixed.jointOK).toBe(true)
  })

  it('reports the interface cap rather than sizing steel for a joint that cannot work', () => {
    const r = designWallDetail({ ...wall, Vu: 2500 })
    expect(r.joint?.capOK).toBe(false)
    expect(r.jointOK).toBe(false)
    expect(r.notes.join(' ')).toContain('thicken the wall')
  })

  it('leaves the joint unchecked when no shear is supplied', () => {
    const r = designWallDetail({ mark: 'W2', t: 200, barDia: 12, spacing: 200, fc: 21, fy: 415 })
    expect(r.joint).toBeUndefined()
    expect(r.jointOK).toBe(true)
    expect(r.ok).toBe(true)
  })
})

describe('wrapNote', () => {
  it('breaks on spaces and never exceeds the width', () => {
    const lines = wrapNote('ROUGHEN THE JOINT TO A FULL 6 MM AMPLITUDE AND REMOVE ALL LAITANCE', 20)
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(20)
    expect(lines.join(' ')).toBe('ROUGHEN THE JOINT TO A FULL 6 MM AMPLITUDE AND REMOVE ALL LAITANCE')
  })
  it('passes text through when the width is unusable', () => {
    expect(wrapNote('ABC DEF', 4)).toEqual(['ABC DEF'])
  })
})

// ── the sheets ──────────────────────────────────────────────────────────────

const GLYPH = 0.63
/**
 * Every primitive, text extents included, inside the sheet bounds.
 *
 * `frame` now SIZES the sheet to its content, so this cannot fail for a kind
 * that sizing already handles — what it still catches is a primitive kind the
 * sizing loop forgets (the next one added), which is exactly how text came to
 * be printed off the paper in the first place. Overlaps between elements are
 * not detectable here and were checked by rendering.
 */
function assertOnSheet(d: { primitives: readonly unknown[]; bounds: { minX: number; minY: number; maxX: number; maxY: number } }): void {
  type P = {
    kind: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number
    w?: number; h?: number; cx?: number; cy?: number; r?: number
    text?: string; size?: number; anchor?: string; rotate?: number
    cmds?: { x: number; y: number }[]
  }
  for (const raw of d.primitives) {
    const p = raw as P
    let xs: number[] = [], ys: number[] = []
    if (p.kind === 'line' || p.kind === 'dim') { xs = [p.x1!, p.x2!]; ys = [p.y1!, p.y2!] }
    else if (p.kind === 'rect') { xs = [p.x!, p.x! + p.w!]; ys = [p.y!, p.y! + p.h!] }
    else if (p.kind === 'circle') { xs = [p.cx! - p.r!, p.cx! + p.r!]; ys = [p.cy! - p.r!, p.cy! + p.r!] }
    else if (p.kind === 'path') { xs = p.cmds!.map((c) => c.x); ys = p.cmds!.map((c) => c.y) }
    else if (p.kind === 'text') {
      const w = p.text!.length * GLYPH * p.size!, h = p.size!
      const a = p.anchor ?? 'start'
      const lead = a === 'middle' ? -w / 2 : a === 'end' ? -w : 0
      if (p.rotate) { xs = [p.x! - h / 2, p.x! + h / 2]; ys = [p.y! + lead, p.y! + lead + w] }
      else { xs = [p.x! + lead, p.x! + lead + w]; ys = [p.y! - h / 2, p.y! + h / 2] }
    }
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(d.bounds.minX - 1e-9); expect(x).toBeLessThanOrEqual(d.bounds.maxX + 1e-9) }
    for (const y of ys) { expect(y).toBeGreaterThanOrEqual(d.bounds.minY - 1e-9); expect(y).toBeLessThanOrEqual(d.bounds.maxY + 1e-9) }
  }
}

describe('buildWallCornerDetail', () => {
  const d = buildWallCornerDetail(wall, { detailNo: '1', sheetRef: 'S-09' })
  const texts = d.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text)
  const flat = texts.join(' ').replace(/\s+/g, ' ')

  it('titles, bounds and stays on the sheet', () => {
    expect(d.title).toBe('TYPICAL WALL CORNER — W1')
    for (const v of Object.values(d.bounds)) expect(Number.isFinite(v)).toBe(true)
    assertOnSheet(d)
  })

  it('draws an L-shaped corner bar per curtain, with both legs the Class B lap', () => {
    const paths = d.primitives.filter((p) => p.kind === 'path') as { cmds: { x: number; y: number }[] }[]
    expect(paths).toHaveLength(d.result.curtains)
    for (const p of paths) {
      expect(p.cmds).toHaveLength(3)
      const [a, b, c] = p.cmds
      // one leg out in x, one in y, each the lap length — the whole point
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(d.result.cornerLeg / 1000, 9)
      expect(Math.hypot(c.x - b.x, c.y - b.y)).toBeCloseTo(d.result.cornerLeg / 1000, 9)
      expect(Math.abs(a.y - b.y)).toBeLessThan(1e-9)        // first leg is horizontal
      expect(Math.abs(c.x - b.x)).toBeLessThan(1e-9)        // second is vertical
    }
  })

  it('states the rule a bar schedule cannot carry', () => {
    expect(flat).toContain('CONTINUOUS AROUND THE CORNER')
    expect(flat).toContain('DO NOT STOP THE HORIZONTAL BARS AT THE CORNER FACE')
    expect(flat).toContain('§425.5.2')
    expect(flat).toContain('§411.6.1')
    expect(flat).toContain(`${Math.round(d.result.lapB)}`)
  })

  it('does not carry the intersection sheet\'s hook warning', () => {
    // `designWallDetail` is shared by all three sheets, so a note pushed onto
    // the shared result printed the ℓdh-does-not-fit warning on the CORNER
    // sheet, where there is no hook. Found by rendering; kept honest here.
    expect(d.result.ldhFits).toBe(false)
    expect(flat).not.toContain('ℓDH')
    expect(flat).not.toContain('HOOKED INTO')
  })

  it('draws two curtains of bars on a thick wall and one on a thin one', () => {
    const dots = (x: ReturnType<typeof buildWallCornerDetail>) =>
      x.primitives.filter((p) => p.kind === 'circle' && p.fill === '#b45309').length
    const thick = buildWallCornerDetail({ ...wall, t: 300 })
    expect(thick.result.curtains).toBe(2)
    expect(dots(thick)).toBeGreaterThan(dots(d))
  })
})

describe('buildWallIntersectionDetail', () => {
  const d = buildWallIntersectionDetail(wall, { detailNo: '2', sheetRef: 'S-09' })
  const flat = d.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text).join(' ').replace(/\s+/g, ' ')

  it('titles, bounds and stays on the sheet', () => {
    expect(d.title).toBe('TYPICAL WALL INTERSECTION — W1')
    assertOnSheet(d)
  })

  it('draws a U-bar, not a hook, when ℓdh cannot fit the through wall', () => {
    // The fixture is the case that matters: a ⌀12 hook needs ℓdh = 261 mm and a
    // 200 mm wall offers 180. Drawing a standard hook here would draw a bar
    // that cannot be built, so the anchor becomes a Class B lapped U-bar.
    expect(d.result.ldhFits).toBe(false)
    expect(d.result.ldhAvail).toBe(180)
    const paths = d.primitives.filter((p) => p.kind === 'path') as { cmds: { x: number; y: number }[] }[]
    expect(paths).toHaveLength(d.result.curtains)
    for (const p of paths) {
      const [, b, c] = p.cmds
      expect(Math.hypot(c.x - b.x, c.y - b.y)).toBeCloseTo(d.result.lapB / 1000, 9)
      expect(Math.abs(c.y - b.y)).toBeLessThan(1e-9)        // the leg turns square
    }
    expect(flat).toContain('U-BAR')
    expect(flat).toContain('OVERRUNS — AVAIL. 180')
  })

  it('draws the standard hook once the wall is thick enough to develop it', () => {
    // 300 mm wall, cover 20 → 280 available against the same 261 required.
    const thick = buildWallIntersectionDetail({ ...wall, t: 300 })
    expect(thick.result.ldhFits).toBe(true)
    const paths = thick.primitives.filter((p) => p.kind === 'path') as { cmds: { x: number; y: number }[] }[]
    for (const p of paths) {
      const [, b, c] = p.cmds
      expect(Math.hypot(c.x - b.x, c.y - b.y)).toBeCloseTo(thick.result.hookTail / 1000, 9)
    }
    const t = thick.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text).join(' ').replace(/\s+/g, ' ')
    expect(t).toContain('STD. 90° HOOK')
    expect(t).toContain('§425.4.3')
    expect(t).not.toContain('OVERRUNS')
  })

  it('dimensions ℓdh from the face of the through wall, into it', () => {
    expect(flat).toContain(`ℓdh = ${Math.round(d.result.ldh)}`)
    expect(flat).toContain('NOT CUT AT THE INTERSECTION')
    // the dimension runs INTO the wall (decreasing y from the face), which is
    // the direction that makes an overrun visible instead of hiding it
    const dim = d.primitives.find((p) => p.kind === 'dim' && (p as { text: string }).text.startsWith('ℓdh')) as { y1: number; y2: number }
    expect(dim.y1).toBeCloseTo(wall.t / 1000, 9)
    expect(dim.y2).toBeCloseTo(wall.t / 1000 - d.result.ldh / 1000, 9)
    expect(dim.y2).toBeLessThan(0)                          // it pokes out the far face
  })
})

describe('buildWallJointDetail', () => {
  const d = buildWallJointDetail(wall, { detailNo: '3', sheetRef: 'S-09' })
  const flat = d.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text).join(' ').replace(/\s+/g, ' ')

  it('titles, bounds and stays on the sheet', () => {
    expect(d.title).toBe('TYPICAL WALL CONSTRUCTION JOINT — W1')
    assertOnSheet(d)
  })

  it('draws the joint as a roughened line, not a straight one', () => {
    const joint = d.primitives.find((p) => p.kind === 'path') as { cmds: { x: number; y: number }[] }
    expect(joint.cmds.length).toBeGreaterThan(8)
    const ys = new Set(joint.cmds.map((c) => Math.round(c.y * 1e6)))
    expect(ys.size).toBeGreaterThan(1)                     // it really zig-zags
  })

  it('carries the two things the joint depends on', () => {
    expect(flat).toContain(`${ROUGHENING_AMPLITUDE} mm AMPLITUDE`)
    expect(flat).toContain('REMOVE ALL LAITANCE')
    expect(flat).toContain('§426.5.6')
    expect(flat).toContain('SHEAR-FRICTION REINFORCEMENT (§422.9)')
    expect(flat).toContain(`Avf REQ'D ${Math.round(d.result.joint!.Avf)} mm²`)
  })

  it('prints the failing rules on the sheet, in red', () => {
    const bad = buildWallJointDetail({ ...wall, surface: 'not-roughened' }, { detailNo: '3' })
    const warn = bad.primitives.filter((p) => p.kind === 'text' && p.color === '#b91c1c') as { text: string }[]
    expect(bad.result.ok).toBe(false)
    expect(warn.length).toBeGreaterThan(0)
    expect(warn.map((t) => t.text).join(' ')).toContain('⚠')
  })
})

describe('every wall sheet survives a degenerate input', () => {
  const bare: WallDetailInput = { t: 0, barDia: 0, spacing: 0 }
  for (const [name, build] of [
    ['corner', buildWallCornerDetail], ['intersection', buildWallIntersectionDetail], ['joint', buildWallJointDetail],
  ] as const) {
    it(name, () => {
      const d = build(bare)
      expect(d.primitives.length).toBeGreaterThan(0)
      for (const v of Object.values(d.bounds)) expect(Number.isFinite(v)).toBe(true)
      expect(d.bounds.maxX).toBeGreaterThan(d.bounds.minX)
      expect(d.bounds.maxY).toBeGreaterThan(d.bounds.minY)
    })
  }
})
