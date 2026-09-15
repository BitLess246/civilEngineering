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
  // A RATCHET, not a clean bill. The token migration never reached the status
  // colours on most pages: 140 stock emerald/green/red/rose uses survive across
  // 33 of the 65. They are not currently BROKEN — Blueprint inverts the stock
  // ramp (#755), so `text-emerald-600` lands as a light green on a dark ground
  // and happens to pass — but they are fragile: they track Tailwind's ramp
  // rather than the theme's semantic roles, and they inverted by accident
  // rather than by design.
  //
  // LintelDesign was the one page where a stock colour carried the page's
  // actual PASS/FAIL readout, and it failed contrast in ALL FIVE themes. That
  // one is migrated. The rest are named here with an exact count so a new page
  // cannot add to the pile and so the debt is a number rather than a feeling.
  const BASELINE = 140

  const stockVerdicts = () => {
    const found: string[] = []
    for (const [file, src] of Object.entries(SOURCES)) {
      if (!file.includes('/pages/')) continue
      for (const c of classStrings(src)) {
        const m = c.match(/(?<![\w:-])text-(?:emerald|green|red|rose)-(?:[5-9]\d{2})(?![\w-])/)
        if (m) found.push(`${file}: ${m[0]}`)
      }
    }
    return found
  }

  it('does not grow', () => {
    expect(stockVerdicts().length).toBeLessThanOrEqual(BASELINE)
  })

  it('is gone from the pages that carry a verdict readout', () => {
    // These print a design PASS/FAIL the reader acts on, so their status
    // colour has to be the theme's, not Tailwind's.
    const migrated = ['LintelDesign.tsx']
    const left = stockVerdicts()
    for (const page of migrated) expect(left.filter((o) => o.includes(page))).toEqual([])
  })
})
