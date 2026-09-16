/**
 * Where the token contrast test cannot see.
 *
 * `theme.test.ts` proves each PAIR of roles contrasts — `on-solid` on `brand`
 * clears 4.5:1 in all five themes. It says nothing about a class string that
 * puts `text-on-solid` on `bg-brand/55`, because the /55 composites the brand
 * over whatever is behind it and the result is a colour no token names.
 *
 * That gap shipped. The active sidebar link was `bg-brand/55 text-on-solid`,
 * and on Blueprint it measured 3.48:1 (#08111c on #476c97) on EVERY tool route
 * — the single most repeated contrast failure in the app, under a test suite
 * that was green. The same audit found a light-on-light island at 1.17:1 where
 * one component mixed a stock BACKGROUND with stock TEXT, which the theme
 * inverts independently.
 *
 * Both are usage patterns, not token values, so they are checked here against
 * the source rather than against the palette.
 */
import { describe, it, expect } from 'vitest'
import themesCss from '../styles/themes.css?raw'
import stockCss from 'tailwindcss/theme.css?raw'

const SOURCES = import.meta.glob('../**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** One element's classes per chunk — same model as hoverStates.test.ts. */
const classStrings = (src: string): string[] =>
  [...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/g)]
    .flatMap((m) => [m[1], m[2], m[3]].filter(Boolean) as string[])

/**
 * THE WHOLE FILE, because `className=` is not where the classes are.
 *
 * The status rule below asserted `[]` and was green while THIRTY-SEVEN stock
 * status utilities shipped, because every one of them sits somewhere
 * `classStrings` cannot see: a lookup table (`toggle: { cls: 'bg-amber-50…' }`),
 * a module constant (`const delBtn = '… text-red-500 …'`), an argument to a
 * cell helper (`cell(c.totalFloat, isCrit ? 'bg-red-500 …' : …)`), a ternary
 * assigned to a variable three lines above the element. Tailwind does not care
 * where the string is written — it scans the source — so a guard that reads
 * one attribute is checking the notation, not the colour.
 *
 * That is the second time in this repo a guard passed its own sabotage by
 * modelling too small a span. So the span is now the file, and the cost is
 * accepted: a comment may not spell a banned utility either. Nothing in the
 * app needs to, and `svgToPng.ts` — the one place that does — is `.ts`, which
 * this glob does not read.
 */
const PROPS = 'text|bg|border|ring|divide|fill|stroke|decoration|from|via|to|placeholder|accent|outline|shadow|caret'
const STATUS_FAMILIES = 'emerald|green|lime|red|rose|amber|yellow|orange'

/**
 * There is no ratchet any more.
 *
 * This constant held `ModelSpace.tsx` and `SoilInvestigation.tsx` while their
 * 422 neutrals were migrated in phases 2 and 3 — landed WITH the first phase
 * rather than after the last, so every other file was held to the rule from the
 * day it existed instead of the day the debt cleared. Phase 3 emptied it. The
 * rules below are absolute; if one ever needs an exemption again, it belongs
 * here, named, with the phase that will remove it.
 */

/** Every `<prop>-<family>-<step>` in the app. */
const scan = (families: string) => {
  const re = new RegExp(`(?<![\\w:-])(?:${PROPS})-(?:${families})-\\d{2,3}(?![\\w-])`, 'g')
  const found: string[] = []
  for (const [file, src] of Object.entries(SOURCES)) {
    for (const m of src.matchAll(re)) found.push(`${file}: ${m[0]}`)
  }
  return found
}

describe('the source actually loaded', () => {
  it('has the app in it', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50)
    expect(Object.values(SOURCES).join('').length).toBeGreaterThan(100000)
  })
})

describe('on-solid sits on a solid fill', () => {
  it('is never paired with an opacity-modified background', () => {
    // `bg-brand/55` is not `bg-brand`. The token test verifies the second and
    // is silent about the first, so the rule is that the first may not carry
    // on-solid at all.
    const offenders: string[] = []
    for (const [file, src] of Object.entries(SOURCES)) {
      for (const c of classStrings(src)) {
        if (!/(?<![\w:-])text-on-solid(?![\w-])/.test(c)) continue
        const faded = c.match(/(?<![\w:-])bg-(?:brand|brand-hover|ok|warn|fail)\/\d+/)
        if (faded) offenders.push(`${file}: ${faded[0]} with text-on-solid`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe("Blueprint's inverted stock ramps are complete", () => {
  // The light-on-light island was NOT a per-component mistake. #755 inverts
  // Tailwind's stock palette for Blueprint — step N takes step (1000-N) — but
  // it generated only the steps the codebase happened to name at the time.
  // `slate-50` and `slate-950` were never written, so `bg-slate-50` kept its
  // stock LIGHT value while the text over it inverted: #e2e8f0 on #f8fafc,
  // 1.17:1, measured on the foundation page. The block's own comment promised
  // "50 is the darkest" for a ramp that did not define 50.
  //
  // My first guess at a guard here was a heuristic about which step pairs
  // "collide", and it was wrong twice — it missed the real failure and then
  // flagged eight pairs that measure 15:1. A hole in a ramp is the actual
  // defect, and it is exactly checkable, so that is what is checked.
  const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

  const parse = (css: string) => {
    const out: Record<string, Record<number, string>> = {}
    for (const m of css.matchAll(/--color-([a-z]+)-(\d+):\s*([^;]+);/g)) {
      ;(out[m[1]] ??= {})[Number(m[2])] = m[3].trim().replace(/\s*\/\*.*$/, '')
    }
    return out
  }

  const blueprint = themesCss.slice(themesCss.indexOf('[data-theme="blueprint"]'))
  const inverted = parse(blueprint)
  const stock = parse(stockCss)
  const FAMILIES = Object.keys(inverted).filter((f) => f in stock && stock[f][500])

  it('parsed both palettes', () => {
    expect(FAMILIES.length).toBeGreaterThanOrEqual(6)
    expect(Object.keys(stock).length).toBeGreaterThan(15)
  })

  it('defines every step of every family it touches', () => {
    const holes: string[] = []
    for (const f of FAMILIES) for (const n of STEPS) {
      if (!(n in inverted[f])) holes.push(`${f}-${n}`)
    }
    expect(holes).toEqual([])
  })

  it('gives each step the value of its mirror', () => {
    const wrong: string[] = []
    for (const f of FAMILIES) for (const n of STEPS) {
      const want = stock[f][1000 - n]
      if (want && inverted[f][n] !== want) wrong.push(`${f}-${n}: ${inverted[f][n]} != stock ${f}-${1000 - n}`)
    }
    expect(wrong).toEqual([])
  })

  it('is an involution — 50 and 950 swap, 500 is its own mirror', () => {
    for (const f of FAMILIES) {
      expect(inverted[f][50], f).toBe(stock[f][950])
      expect(inverted[f][950], f).toBe(stock[f][50])
      expect(inverted[f][500], f).toBe(stock[f][500])
    }
  })
})

describe('verdict colour comes from the status roles', () => {
  // Was a RATCHET at 140 while the debt stood. The debt is gone: all 519 uses
  // of the eight status families across 61 files now name a role, so this is a
  // rule rather than a ceiling.
  //
  // sky/blue/violet are deliberately NOT here. They carry informational tags —
  // "derived", "field" — not a verdict, and no role names that, so they keep
  // the (complete, inverted) stock ramp. A rule that swept them up would be
  // demanding a token that does not exist.
  const STATUS = STATUS_FAMILIES

  const stockStatus = () => scan(STATUS)

  it('is not painted with a stock colour anywhere', () => {
    expect(stockStatus()).toEqual([])
  })

  it('has roles for all three verdicts, at every weight a component needs', () => {
    // The migration needed a fill, a tint behind text, a border and a hover
    // for each; a missing one is what forces a component back onto the stock
    // ramp, which is how the debt accumulated the first time.
    const bp = themesCss.slice(themesCss.indexOf('[data-theme="blueprint"]'))
    for (const role of ['ok', 'warn', 'fail']) {
      for (const suffix of ['', '-tint', '-line', '-hover']) {
        expect(bp, `${role}${suffix}`).toContain(`--t-${role}${suffix}:`)
      }
    }
  })
})

describe('neutral surfaces come from the neutral roles', () => {
  // The last stock family in the app, and by far the biggest: 1 083 `slate-*`
  // utilities across 72 files, doing the jobs fifteen roles already name.
  //
  // WHAT THIS IS NOT. It is not an accessibility fix, and the claim that it
  // was is the thing this comment exists to correct. Blueprint INVERTS the
  // stock slate ramp (step N takes step 1000−N), so `text-slate-600` on
  // `bg-sheet` measures 6.01:1 there and 7.56:1 on Drafting — both pass AA,
  // and the first two attempts at measuring it said otherwise: hex arithmetic
  // against the stock ramp ignored the inversion (2.22:1), and reading
  // `getComputedStyle` back as RGB when the browser returns `oklch(…)` was
  // worse (1.86:1). The real numbers came from painting the computed value
  // into a canvas `fillStyle` and reading the sRGB back.
  //
  // So the reason is consistency, not contrast: a component that names the
  // stock ramp inherits whatever the inversion happens to give it, and a
  // component that names a role inherits what the theme MEANT. Only the
  // second survives a sixth theme.
  const NEUTRAL = 'slate|gray|zinc|neutral|stone'

  it('is never painted with a stock neutral anywhere', () => {
    expect(scan(NEUTRAL)).toEqual([])
  })

  it('has a role for every job the stock ramp was doing', () => {
    // A missing role is what forces a component back onto the stock ramp, so
    // the fifteen the migration mapped onto are asserted present rather than
    // assumed. Checked in Blueprint because that is where a hole shows.
    const bp = themesCss.slice(themesCss.indexOf('[data-theme="blueprint"]'))
    for (const role of [
      'paper', 'sheet', 'sheet-2', 'field', 'rail', 'rail-ink', 'rail-muted',
      'ink', 'ink-2', 'muted', 'faint', 'hairline', 'hairline-2', 'field-line',
      'on-solid',
    ]) expect(bp, role).toContain(`--t-${role}:`)
  })
})

describe('every stock family the app still names is inverted for Blueprint', () => {
  // The inversion block is the ONLY thing that makes a stock utility follow a
  // dark theme, and the completeness test above it reads its families OUT of
  // that block — so a family with no block at all is a family nothing checks.
  // `teal` and `purple` shipped exactly that way: the documentation control
  // key and the balanced-point row of the P-M table kept their stock LIGHT
  // values on Blueprint's dark ground. This asks the question from the other
  // side: what do the COMPONENTS name, and does each of those have a block?
  it('leaves no family defined only by Tailwind', () => {
    const bp = themesCss.slice(themesCss.indexOf('[data-theme="blueprint"]'))
    const inverted = new Set(
      [...bp.matchAll(/--color-([a-z]+)-\d{2,3}:/g)].map((m) => m[1]))
    const named = new Set<string>()
    for (const src of Object.values(SOURCES)) {
      for (const m of src.matchAll(
        new RegExp(`(?<![\\w:-])(?:${PROPS})-([a-z]+)-\\d{2,3}(?![\\w-])`, 'g'))) named.add(m[1])
    }
    const orphans = [...named].filter((f) => !inverted.has(f))
    expect(orphans, 'named in a component, absent from the inversion block').toEqual([])
  })
})

describe('colour is never written as a literal in a class', () => {
  /**
   * An arbitrary value — `text-[#7c3aed]` — is the one spelling that follows NO
   * theme at all. A stock family at least inverts on Blueprint; a literal hex is
   * the same pixels on every ground, which is how the modal panel's accent came
   * out as stock violet-600 on a near-black sheet. `ModelSpace.tsx` carried
   * seven of them, all the same colour, all of which simply meant
   * `text-violet-600` — and naming the family was the whole fix, because the
   * inversion then applies for free.
   *
   * This rule is broader than the migration that prompted it, on purpose: the
   * point of a token layer is that nothing outside it states a colour.
   */
  const FIXED = [
    // The CPM precedence diagram's date-block key: early dates green, late
    // dates teal, on white cells inside the drawn node. A drawing convention
    // with a printed legend, not a theme surface — the same call the migration
    // made for the other screen drawings. It has to stay legible against its
    // own fill in every theme, which is exactly what NOT following the theme
    // buys. Its verdict colours (critical vs not) are roles, not literals.
    'CriticalPathDiagram.tsx',
  ]

  // THE WHOLE FILE, for the same reason the status rule reads the whole file.
  // The first cut of this rule used `classStrings`, and a sabotage caught it
  // within the hour: the eight literals it allowlists are arguments to a `cell`
  // helper, not `className=` attributes, so pointing the allowlist at a
  // NON-EXISTENT file left the rule green. Writing the identical span bug into
  // the rule standing next to the one that documents that span bug is why this
  // comment exists.
  const hexes = (src: string) =>
    [...src.matchAll(/(?<![\w:-])[a-z-]+-\[#[0-9a-fA-F]{3,8}\](?![\w-])/g)].map((m) => m[0])

  it('uses no arbitrary colour value outside the drawing keys', () => {
    const found: string[] = []
    for (const [file, src] of Object.entries(SOURCES)) {
      if (FIXED.some((f) => file.endsWith(f))) continue
      for (const h of hexes(src)) found.push(`${file}: ${h}`)
    }
    expect(found, 'name a token or a family instead').toEqual([])
  })

  it('has no stale or unnecessary allowlist entry', () => {
    // Read OUT OF `FIXED`, not spelled again here. The first version asserted a
    // hardcoded filename, so renaming the entry left it green — a staleness
    // check that could not see the list it guards. The second assertion is the
    // other direction: an entry whose file no longer contains a literal is an
    // exemption nothing needs, and those are how an allowlist grows.
    for (const entry of FIXED) {
      const hit = Object.entries(SOURCES).find(([f]) => f.endsWith(entry))
      expect(hit, `allowlisted "${entry}" matches no file`).toBeTruthy()
      expect(hexes(hit![1]).length, `"${entry}" no longer needs the allowlist`)
        .toBeGreaterThan(0)
    }
  })

  it('still watches the allowlisted files for everything else', () => {
    // An allowlist that silences a whole FILE is how the status rule went
    // blind. This one is scoped to one SPELLING: the neutral and status rules
    // run over every allowlisted file like any other, and did in fact catch
    // this one's `bg-red-500` and `bg-slate-400` in phase 1.
    const stock = [...scan('slate|gray|zinc|neutral|stone'), ...scan(STATUS_FAMILIES)]
    for (const entry of FIXED) {
      expect(stock.filter((h) => h.includes(entry.replace('.tsx', ''))), entry).toEqual([])
    }
  })
})
