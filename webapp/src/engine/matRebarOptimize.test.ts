import { describe, it, expect } from 'vitest'
import {
  MAT_BAR_SIZES, SPACING_MODULES, beta1, rhoTensionControlled, asMinShrinkage,
  maxSpacing, minClear, matCandidates, optimizeMatRebar, optimizeFootingRebar,
  optimizeSlabRebar, slabStrips,
  type MatSection, type MatStrip,
} from './matRebarOptimize'
import { designSquareFooting, type SquareFootingInput } from './isolatedFooting'
import { optimizeRectFootingRebar, optimizeEccentricFootingRebar } from './matRebarOptimize'
import { designSlabDDM, type SlabInput } from './slabDDM'
import { firstFailure, MAX_TIE_STEEL } from './rebarScore'

// ── Fixtures ──────────────────────────────────────────────────────────────

const footing = (o: Partial<SquareFootingInput> = {}): SquareFootingInput => ({
  serviceLoad: 1200, ultimateLoad: 1700, columnWidth: 400,
  fc: 21, fy: 415, qAllow: 200, gammaSoil: 18, gammaConc: 24,
  H: 1.5, barDia: 20, cover: 75, ...o,
})

// The Slab Design page's own defaults — a 6 × 6 panel, D = 5, L = 2 kPa.
const panel = (o: Partial<SlabInput> = {}): SlabInput => ({
  lx: 6, ly: 6, colWidth: 400, D: 5, L: 2, fc: 28, fy: 415, cover: 20, ...o,
})

const section = (o: Partial<MatSection> = {}): MatSection =>
  ({ h: 200, cover: 20, fc: 28, fy: 415, kind: 'two-way', ...o })

const strip = (o: Partial<MatStrip> = {}): MatStrip =>
  ({ label: 'strip', b: 3000, d: 170, AsReq: 2000, ...o })

// ── Code limits, against hand calcs ───────────────────────────────────────

describe('code limits', () => {
  it('β1 per §22.2.2.4.3', () => {
    expect(beta1(21)).toBeCloseTo(0.85, 6)
    expect(beta1(28)).toBeCloseTo(0.85, 6)
    // 0.85 − 0.05·(35 − 28)/7 = 0.80
    expect(beta1(35)).toBeCloseTo(0.80, 6)
    expect(beta1(55)).toBeCloseTo(0.65, 6)   // floor
    expect(beta1(80)).toBeCloseTo(0.65, 6)
  })

  it('ρ at εt = 0.005 — 0.85·β1·(f′c/fy)·(3/8)', () => {
    // 0.85 · 0.85 · (28/415) · 0.375 = 0.0182801
    expect(rhoTensionControlled(28, 415)).toBeCloseTo(0.0182801, 7)
    expect(rhoTensionControlled(21, 415)).toBeCloseTo(0.0137101, 7)
  })

  it('§7.6.1.1 shrinkage & temperature minimum steps at Grade 420', () => {
    expect(asMinShrinkage(415, 1000, 200)).toBeCloseTo(0.0020 * 1000 * 200, 6)
    expect(asMinShrinkage(420, 1000, 200)).toBeCloseTo(0.0018 * 1000 * 200, 6)
    expect(asMinShrinkage(520, 1000, 200)).toBeCloseTo(0.0018 * 1000 * 200, 6)
  })

  it('maximum spacing — §7.7.2.3 for one-way, §8.7.2.2 for two-way, both capped at 450', () => {
    expect(maxSpacing('one-way', 100)).toBe(300)
    expect(maxSpacing('two-way', 100)).toBe(200)
    expect(maxSpacing('one-way', 200)).toBe(450)   // 3h = 600, capped
    expect(maxSpacing('two-way', 300)).toBe(450)   // 2h = 600, capped
  })

  it('§25.2.1 minimum clear spacing carries the aggregate term', () => {
    expect(minClear(12, 20)).toBeCloseTo(80 / 3, 6)   // 4/3 · 20 governs
    expect(minClear(32, 20)).toBe(32)                  // db governs
    expect(minClear(10, 10)).toBe(25)                  // the 25 mm floor governs
  })
})

// ── The search shape ──────────────────────────────────────────────────────

describe('the mat search', () => {
  it('only ever proposes a spacing off the module — no 143 mm mats', () => {
    const c = optimizeMatRebar([strip()], section())
    expect(c.spacing).not.toBeNull()
    expect(SPACING_MODULES).toContain(c.spacing as (typeof SPACING_MODULES)[number])
    for (const s of c.selection.ranked) {
      expect(SPACING_MODULES).toContain(s.layout.spacing as (typeof SPACING_MODULES)[number])
    }
  })

  it('searches every diameter × spacing pair', () => {
    const c = optimizeMatRebar([strip()], section())
    const all = [...c.selection.ranked, ...c.selection.rejected]
    expect(all.length).toBe(MAT_BAR_SIZES.length * SPACING_MODULES.length)
    // and every diameter is represented
    expect(new Set(all.map((s) => s.layout.db)).size).toBe(MAT_BAR_SIZES.length)
  })

  it('the bar count follows from the spacing, not from the area', () => {
    // b = 3000, cover = 20 → floor(2960/150) + 1 = 20 bars at 150 c/c.
    const c = matCandidates([strip()], section(), 12, { spacings: [150] })
    expect(c).toHaveLength(1)
    expect(c[0].layout.bars).toBe(20)
    expect(c[0].layout.spacing).toBe(150)
  })

  it('a mat is one layer and has no symmetry to prefer', () => {
    const c = optimizeMatRebar([strip()], section())
    expect(c.selection.best?.layout.layers).toHaveLength(1)
    // An odd count must be able to win — a mat has no centreline.
    const odd = c.selection.ranked.filter((s) => s.layout.bars % 2 === 1)
    expect(odd.length).toBeGreaterThan(0)
    for (const s of odd) {
      const even = c.selection.ranked.find((e) => e.layout.db === s.layout.db && e.layout.bars % 2 === 0)
      if (even) expect(s.scores.simplicity).toBeCloseTo(even.scores.simplicity, 9)
    }
  })

  it('is deterministic', () => {
    const a = optimizeMatRebar([strip()], section())
    const b = optimizeMatRebar([strip()], section())
    expect(b.db).toBe(a.db)
    expect(b.spacing).toBe(a.spacing)
    expect(b.selection.ranked.map((s) => `${s.layout.db}@${s.layout.spacing}`))
      .toEqual(a.selection.ranked.map((s) => `${s.layout.db}@${s.layout.spacing}`))
  })
})

// ── Compliance is a gate ──────────────────────────────────────────────────

describe('compliance gates', () => {
  it('the adopted mat passes every check', () => {
    for (const kind of ['one-way', 'two-way'] as const) {
      const c = optimizeMatRebar([strip()], section({ kind }))
      expect(c.selection.best).not.toBeNull()
      expect(firstFailure(c.selection.best!.compliance)).toBeNull()
    }
  })

  it('every rejected candidate really does fail its named gate', () => {
    const c = optimizeMatRebar([strip()], section())
    for (const r of c.selection.rejected) {
      expect(r.failedGate).not.toBeNull()
      expect(r.compliance.find((x) => x.id === r.failedGate!.id)!.pass).toBe(false)
    }
  })

  it('§8.7.2.2 rejects a spacing a thin slab cannot carry', () => {
    // h = 120 → 2h = 240, so 250 and 300 are out on the two-way clause even
    // though a 3h one-way slab of the same thickness would allow both.
    const two = matCandidates([strip({ d: 90, AsReq: 600 })], section({ h: 120 }), 12)
    for (const s of [250, 300]) {
      const c = two.find((x) => x.layout.spacing === s)!
      expect(firstFailure(c.compliance)?.id).toBe('max-spacing')
    }
    const one = matCandidates([strip({ d: 90, AsReq: 600 })], section({ h: 120, kind: 'one-way' }), 12)
    expect(firstFailure(one.find((x) => x.layout.spacing === 250)!.compliance)).toBeNull()
  })

  it('§25.2.1\'s aggregate term rejects a mat that max(db, 25) alone would pass', () => {
    // ⌀25 at 75 c/c → 50 mm clear. Fine against max(db, 25) = 25 mm, and fine
    // against 4/3 · 20 = 26.7 mm — but a 40 mm aggregate needs 53.3 mm.
    const s = section({ h: 600, kind: 'one-way' })
    const st = strip({ d: 500, AsReq: 4000 })
    const plain = matCandidates([st], s, 25, { spacings: [75], aggregate: 20 })
    expect(firstFailure(plain[0].compliance)).toBeNull()
    const chunky = matCandidates([st], s, 25, { spacings: [75], aggregate: 40 })
    expect(firstFailure(chunky[0].compliance)?.id).toBe('min-clear')
  })

  it('§21.2.2 rejects a mat that would need more steel than φ = 0.90 allows', () => {
    // A 150 mm slab asked to carry a heavy strip: the steel fits, but ρ lands
    // past the tension-controlled limit, so the φ the design used is wrong.
    const s = section({ h: 150 })
    const heavy = matCandidates([strip({ d: 120, AsReq: 8000 })], s, 25, { spacings: [75] })
    expect(firstFailure(heavy[0].compliance)?.id).toBe('tension-controlled')
  })

  it('reports the section, not the bars, when the section is the problem', () => {
    const c = optimizeMatRebar([strip({ d: 60, AsReq: 9000 })], section({ h: 90 }))
    expect(c.db).toBeNull()
    expect(c.blocker).not.toBeNull()
    expect(['flexural-capacity', 'tension-controlled']).toContain(c.blocker!.id)
    expect(c.selection.margin).toMatch(/ACI 318-14/)
  })
})

// ── It is not the minimum-steel or the tightest-spacing choice ────────────

describe('what it is not', () => {
  it('does not simply take the least steel', () => {
    const c = optimizeFootingRebar(footing())
    const leanest = c.selection.ranked.reduce((a, s) =>
      s.layout.AsProv < a.layout.AsProv ? s : a)
    expect(c.selection.best!.layout.AsProv).toBeGreaterThan(leanest.layout.AsProv)
  })

  it('does not simply take the tightest spacing', () => {
    const c = optimizeFootingRebar(footing())
    const tightest = Math.min(...c.selection.ranked.map((s) => s.layout.spacing))
    expect(c.spacing).toBeGreaterThan(tightest)
  })

  it('does not simply take the smallest bar — the footing skips ⌀10 and ⌀12', () => {
    const c = optimizeFootingRebar(footing())
    expect(c.designs.has(10)).toBe(true)     // it was searched
    expect(c.db).toBeGreaterThan(12)         // and lost anyway
  })

  it('never buys its way to a tighter mat through the near-tie rule', () => {
    // The failure this guards against, measured: on a lightly loaded strip
    // the spacing modules run 75–300 mm, so the areas at one diameter span
    // 1.3× to 4.4× the requirement while the totals compress into one 0.03
    // band. Promoting on serviceability alone reached the tight end every
    // time — 2.6× the steel for a 0.014 difference in score.
    const light = strip({ b: 3000, d: 114, AsReq: 1032 })
    const c = optimizeMatRebar([light], section({ h: 140 }))
    const best = c.selection.best!
    const leader = c.selection.ranked.reduce((a, s) => (s.total > a.total ? s : a))
    expect(best.layout.AsProv)
      .toBeLessThanOrEqual(leader.layout.AsProv * (1 + MAX_TIE_STEEL) + 1e-9)
    // and the concrete outcome: nothing near 2.6× survives
    expect(best.layout.AsProv / best.layout.AsReq).toBeLessThan(2)
  })

  it('detailing a whole panel gives the light strips a looser mat than the heavy ones', () => {
    const c = optimizeSlabRebar(panel())
    const byLoad = [...c.strips].sort((a, b) => a.AsReq / a.b - b.AsReq / b.b)
    const lightest = byLoad[0], heaviest = byLoad[byLoad.length - 1]
    expect(heaviest.AsReq / heaviest.b).toBeGreaterThan(lightest.AsReq / lightest.b)
    // One diameter, different spacings — which is what "⌀12 @ 100 T, @ 175 B"
    // on a drawing means, and what quoting one mat everywhere would lose.
    expect(lightest.spacing).toBeGreaterThan(heaviest.spacing)
  })
})

// ── Footings ──────────────────────────────────────────────────────────────

describe('isolated footing mats', () => {
  it('adopts a compliant mat and reports it as ⌀db @ spacing', () => {
    const c = optimizeFootingRebar(footing())
    expect(c.db).not.toBeNull()
    expect(c.spacing).not.toBeNull()
    expect(c.bars).toBeGreaterThan(2)
    expect(firstFailure(c.selection.best!.compliance)).toBeNull()
  })

  it('re-runs the designer per diameter, because Dc and B move with db', () => {
    const c = optimizeFootingRebar(footing())
    expect(c.designs.size).toBe(MAT_BAR_SIZES.length)
    // A bigger bar means a deeper footing: Dc = d_req + cover + db.
    const thin = c.designs.get(10)!, thick = c.designs.get(25)!
    expect(thick.Dc).toBeGreaterThanOrEqual(thin.Dc)
    // and the reported design is the one at the adopted diameter
    expect(c.design).toBe(c.designs.get(c.db!))
  })

  it('the adopted design is reproducible by re-running designSquareFooting', () => {
    const i = footing()
    const c = optimizeFootingRebar(i)
    const again = designSquareFooting({ ...i, barDia: c.db! })
    expect(again.B).toBeCloseTo(c.design!.B, 9)
    expect(again.Dc).toBeCloseTo(c.design!.Dc, 9)
    expect(again.steelArea).toBeCloseTo(c.design!.steelArea, 6)
  })

  it('provides at least the steel the flexure check demanded', () => {
    for (const P of [800, 1200, 2000, 3000]) {
      const c = optimizeFootingRebar(footing({ serviceLoad: P, ultimateLoad: P * 1.42 }))
      expect(c.selection.best, `P = ${P}`).not.toBeNull()
      const l = c.selection.best!.layout
      expect(l.AsProv).toBeGreaterThanOrEqual(l.AsReq - 1e-6)
    }
  })

  it('is detailed as a one-way slab — §7.7.2.3, not §8.7.2.2', () => {
    const c = optimizeFootingRebar(footing())
    const rule = c.selection.best!.compliance.find((x) => x.id === 'max-spacing')!
    expect(rule.clause).toContain('7.7.2.3')
  })
})

// ── Two-way slabs ─────────────────────────────────────────────────────────

describe('two-way slab panels', () => {
  it('adopts one diameter for the whole panel and a spacing per strip', () => {
    const c = optimizeSlabRebar(panel())
    expect(c.db).not.toBeNull()
    expect(c.strips.length).toBeGreaterThan(3)
    for (const s of c.strips) {
      expect(SPACING_MODULES).toContain(s.spacing as (typeof SPACING_MODULES)[number])
    }
    // Strips genuinely differ — a column strip at a support is not a middle
    // strip at midspan, and detailing them the same wastes steel.
    expect(new Set(c.strips.map((s) => s.spacing)).size).toBeGreaterThan(1)
  })

  it('every strip is compliant at the adopted diameter', () => {
    const c = optimizeSlabRebar(panel())
    const sec: MatSection = { h: c.design!.h, cover: 20, fc: 28, fy: 415, kind: 'two-way' }
    for (const s of c.strips) {
      const st = slabStrips(c.design!).find((x) => x.label === s.label)!
      const cand = matCandidates([st], sec, c.db!, { spacings: [s.spacing] })
      expect(firstFailure(cand[0].compliance), `${s.label} @ ${s.spacing}`).toBeNull()
    }
  })

  it('splits the panel into the strips it is actually detailed on', () => {
    const r = designSlabDDM({ ...panel(), barDia: 12 })
    const strips = slabStrips(r)
    // x and y, each with its locations, each with a column and a middle strip.
    expect(strips.length).toBe(r.x.locations.length * 2 + r.y.locations.length * 2)
    expect(strips.every((s) => s.b > 0 && s.d > 0)).toBe(true)
  })

  it('§8.7.2.2 is the governing spacing clause, not §7.7.2.3', () => {
    const c = optimizeSlabRebar(panel())
    const rule = c.selection.best!.compliance.find((x) => x.id === 'max-spacing')!
    expect(rule.clause).toContain('8.7.2.2')
  })

  it('says the panel is too thin rather than inventing a mat for it', () => {
    // A 6 × 7 panel at D = 5.5 / L = 4.8 kPa. §408.3.1.2's minimum thickness
    // assumes edge beams with αfm ≥ 2, which designSlabDDM deliberately does
    // NOT credit for slab steel — so at hmin the required ρ runs past the
    // tension-controlled limit and no mat can be compliant.
    const heavy = panel({ lx: 6, ly: 7, D: 5.5, L: 4.8 })
    const thin = optimizeSlabRebar(heavy)
    expect(thin.db).toBeNull()
    expect(thin.blocker).not.toBeNull()
    expect(thin.selection.rejected.length).toBeGreaterThan(0)

    // The fix is depth, and the optimiser agrees the moment it is given some.
    const thick = optimizeSlabRebar({ ...heavy, h: 220 })
    expect(thick.db).not.toBeNull()
    expect(firstFailure(thick.selection.best!.compliance)).toBeNull()
  })

  it('a heavier panel gets more steel per metre, at the same thickness', () => {
    // h pinned so the comparison is about load, not about the two panels
    // landing on different §408.3.1.2 minimum thicknesses.
    const light = optimizeSlabRebar(panel({ D: 4, L: 2, h: 200 }))
    const heavy = optimizeSlabRebar(panel({ D: 7, L: 5, h: 200 }))
    expect(light.db).not.toBeNull()
    expect(heavy.db).not.toBeNull()
    const per = (c: typeof light) => c.selection.best!.layout.AsProv / c.selection.best!.layout.spacing
    expect(per(heavy)).toBeGreaterThan(per(light))
  })
})

// ── The prose matches the drawing ─────────────────────────────────────────

describe('how a mat is named', () => {
  it('quotes a spacing, not a bar count, in the reason and the margin', () => {
    const c = optimizeMatRebar([strip()], section())
    const spaced = /⌀\d+ @ \d+/
    expect(c.selection.best!.reason).toMatch(spaced)
    expect(c.selection.margin).toMatch(spaced)
    // "30⌀12" is what a beam schedule says; a slab drawing does not.
    expect(c.selection.best!.reason).not.toMatch(/^\d+⌀/)
  })

  it('never calls a mat symmetric — there is no centreline to be symmetric about', () => {
    const c = optimizeMatRebar([strip()], section())
    for (const s of c.selection.ranked) expect(s.reason).not.toMatch(/symmetric/)
  })

  it('a rejected mat names itself the same way', () => {
    const c = optimizeMatRebar([strip()], section())
    for (const r of c.selection.rejected) expect(r.reason).toMatch(/⌀\d+ @ \d+/)
  })
})

// ── Every footing shape, not just the concentric square ───────────────────

describe('rectangular and eccentric footings search too', () => {
  const common = {
    serviceLoad: 1200, ultimateLoad: 1700, columnWidth: 400, fc: 28, fy: 415,
    qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5, cover: 75,
    barDia: 32,   // a deliberately silly seed — the search must ignore it
  }

  it('all three shapes pick their own bar, not the seed', () => {
    const shapes = [
      optimizeFootingRebar(common as never),
      optimizeRectFootingRebar({ ...common, sizing: { mode: 'ratio', ratio: 1.5 } } as never),
      optimizeEccentricFootingRebar({ ...common, serviceMoment: 120, ultimateMoment: 170 } as never),
    ]
    for (const c of shapes) {
      expect(c.db).not.toBeNull()
      expect(c.db).toBeLessThan(32)
      expect(firstFailure(c.selection.best!.compliance)).toBeNull()
    }
  })

  it('a rectangular footing gets ONE diameter and a spacing per direction', () => {
    // The two directions carry different steel; quoting the governing strip's
    // spacing on both would over-provide the lighter one.
    const c = optimizeRectFootingRebar({ ...common, sizing: { mode: 'ratio', ratio: 1.5 } } as never)
    expect(c.strips).toHaveLength(2)
    expect(c.strips.map((s) => s.label)).toEqual(['long direction', 'short direction'])
    expect(new Set(c.strips.map((s) => s.spacing)).size).toBeGreaterThan(1)
    for (const st of c.strips) {
      const Ab = (Math.PI / 4) * c.db! * c.db!
      expect(st.bars * Ab).toBeGreaterThanOrEqual(st.AsReq - 1e-6)
      expect(SPACING_MODULES).toContain(st.spacing as (typeof SPACING_MODULES)[number])
    }
  })

  it('re-running the designer at the adopted diameter reproduces the design', () => {
    const c = optimizeEccentricFootingRebar({
      ...common, serviceMoment: 120, ultimateMoment: 170,
    } as never)
    expect(c.design).toBe(c.designs.get(c.db!))
  })
})

describe('optimizeSlabRebar — the thickness an undetailable panel needs', () => {
  // A 6 × 5 m INTERIOR panel at 150 mm. Its deflections are the smallest on the
  // floor, so it clears §408.3.1.2 and §424.2 while every edge panel around it
  // does not — and it is the one panel whose only failing term is "no mat
  // complies". D is 8.4 kPa: 4.8 imposed dead plus the panel's own 0.15 × 24.
  const panel: SlabInput = {
    lx: 6, ly: 5, colWidth: 300, D: 8.4, L: 2.4, fc: 28, fy: 415,
    h: 150, cover: 20, barDia: 12, exterior: { x: false, y: false }, withBeams: true,
  }

  it('rejects every diameter at 150 mm — thin ones on §22.2, thick ones on §21.2.2', () => {
    const mat = optimizeSlabRebar(panel)
    expect(mat.db).toBeNull()
    expect(mat.selection.ranked).toHaveLength(0)

    // The squeeze runs ACROSS diameters, which is why no closed form at a
    // single db can see it: the small bars cannot fit the steel, and at the
    // depth the big bars leave, the steel is past the tension-controlled limit.
    const rhoMax = rhoTensionControlled(panel.fc, panel.fy)
    const rhoReq = (db: number) => {
      const strips = slabStrips(mat.designs.get(db)!)
      const g = strips.reduce((a, c) => (c.AsReq / c.b > a.AsReq / a.b ? c : a))
      return g.AsReq / (g.b * g.d)
    }
    expect(rhoReq(10)).toBeLessThan(rhoMax)      // would be fine — will not fit
    expect(rhoReq(25)).toBeGreaterThan(rhoMax)   // would fit — not tension-controlled
    const gates = new Set(mat.selection.rejected.map((c) => c.failedGate?.id))
    expect(gates).toContain('flexural-capacity')
    expect(gates).toContain('tension-controlled')
  })

  it('reports the thickness that clears it, and that thickness really does', () => {
    const mat = optimizeSlabRebar(panel)
    expect(mat.minThickness).toBe(175)
    // Not merely a bigger number: the panel is detailable there and was not one
    // step below, so it is the FIRST thickness that works.
    expect(optimizeSlabRebar({ ...panel, h: 175 }).db).not.toBeNull()
    expect(optimizeSlabRebar({ ...panel, h: 150 }).db).toBeNull()
  })

  it('is null whenever a mat WAS found — it is a diagnosis, not a suggestion', () => {
    for (const h of [175, 200, 225]) {
      const mat = optimizeSlabRebar({ ...panel, h })
      expect(mat.db).not.toBeNull()
      expect(mat.minThickness).toBeNull()
    }
  })

  it('is null when depth is not the obstacle', () => {
    // Degenerate span: no candidates, so no thickness can be honestly named.
    expect(optimizeSlabRebar({ ...panel, lx: 0, ly: 0 }).minThickness).toBeNull()
  })
})
