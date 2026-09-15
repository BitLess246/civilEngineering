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
  const STATUS = 'emerald|green|lime|red|rose|amber|yellow|orange'
  const PROPS = 'text|bg|border|ring|divide|fill|stroke|decoration'

  const stockStatus = () => {
    const found: string[] = []
    for (const [file, src] of Object.entries(SOURCES)) {
      for (const c of classStrings(src)) {
        for (const m of c.matchAll(new RegExp(`(?<![\\w:-])(?:${PROPS})-(?:${STATUS})-\\d{2,3}(?![\\w-])`, 'g'))) {
          found.push(`${file}: ${m[0]}`)
        }
      }
    }
    return found
  }

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
