import { describe, it, expect } from 'vitest'
import themesCss from '../styles/themes.css?inline'
import { THEMES, DEFAULT_THEME, isThemeId } from './theme'

/**
 * Contrast is enforced, not intended.
 *
 * This parses the SHIPPED stylesheet rather than a TypeScript copy of the
 * palette. A duplicated table would pass while the browser painted something
 * else, which is the failure mode this whole token layer exists to end.
 *
 * Every pair below is a surface a role is ACTUALLY painted on, taken from the
 * usage survey — `fail` is both text on a sheet and a solid fill with white on
 * it (22 `text-` vs 5 `bg-`), so it is checked both ways. Checking every role
 * against plain white instead would pass a theme whose failure chip is
 * unreadable.
 */

type Pal = Record<string, string>

function parseThemes(css: string): Record<string, Pal> {
  const out: Record<string, Pal> = {}
  const block = /\[data-theme="([a-z]+)"\]\s*\{([^}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = block.exec(css))) {
    const pal: Pal = {}
    for (const [, k, v] of m[2].matchAll(/--t-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) pal[k] = v.toLowerCase()
    out[m[1]] = pal
  }
  return out
}

const srgb = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgb(v / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** [foreground, background, minimum, why] */
const TEXT_PAIRS: [string, string, number][] = [
  ['ink', 'sheet', 4.5], ['ink', 'paper', 4.5], ['ink-2', 'sheet', 4.5],
  ['muted', 'sheet', 4.5], ['muted', 'paper', 4.5], ['muted', 'sheet-2', 4.5],
  ['faint', 'sheet', 4.5], ['faint', 'paper', 4.5], ['faint', 'sheet-2', 4.5],
  ['rail-ink', 'rail', 4.5], ['rail-muted', 'rail', 4.5], ['rail-accent', 'rail', 4.5],
  ['brand', 'sheet', 4.5], ['brand', 'paper', 4.5], ['brand', 'brand-tint', 4.5],
  ['on-solid', 'brand', 4.5], ['on-solid', 'brand-hover', 4.5], ['on-solid', 'fail', 4.5],
  ['ok', 'sheet', 4.5], ['ok', 'ok-tint', 4.5],
  ['warn', 'sheet', 4.5], ['warn', 'warn-tint', 4.5],
  ['fail', 'sheet', 4.5], ['fail', 'fail-tint', 4.5],
]

/** WCAG 1.4.11: a focus ring is non-text information and needs 3:1. */
const NON_TEXT_PAIRS: [string, string, number][] = [
  ['focus', 'sheet', 3.0], ['focus', 'paper', 3.0], ['focus', 'field', 3.0],
]

// `?inline` needs `css: true` in vite.config.ts — vitest defaults to `false`,
// which resolves this to an EMPTY STRING and would have made every assertion
// below pass vacuously. The parse-count guard is what caught that, and is why
// it is the first test in the file.
const palettes = parseThemes(themesCss)

describe('themes — every palette is legible, by measurement', () => {
  it('parses one block per registered theme', () => {
    // Guards the sweep below against passing vacuously on an empty parse.
    expect(Object.keys(palettes).sort()).toEqual(THEMES.map((t) => t.id).slice().sort())
    for (const id of Object.keys(palettes)) expect(Object.keys(palettes[id]).length).toBe(30)
  })

  for (const { id, name } of THEMES) {
    it(`${name}: text roles meet WCAG AA on the surfaces they are painted on`, () => {
      const pal = palettes[id]
      const fails: string[] = []
      for (const [fg, bg, min] of TEXT_PAIRS) {
        expect(pal[fg], `${id} is missing --t-${fg}`).toBeDefined()
        expect(pal[bg], `${id} is missing --t-${bg}`).toBeDefined()
        const r = ratio(pal[fg], pal[bg])
        if (r < min) fails.push(`${fg} on ${bg} = ${r.toFixed(2)} (need ${min})`)
      }
      expect(fails).toEqual([])
    })

    it(`${name}: the focus ring clears 3:1 against every surface it lands on`, () => {
      const pal = palettes[id]
      const fails: string[] = []
      for (const [fg, bg, min] of NON_TEXT_PAIRS) {
        const r = ratio(pal[fg], pal[bg])
        if (r < min) fails.push(`${fg} on ${bg} = ${r.toFixed(2)} (need ${min})`)
      }
      expect(fails).toEqual([])
    })

    it(`${name}: hover is DISTINGUISHABLE from rest, in whichever direction`, () => {
      // `brand-hover` is a role, not "a darker blue" — Blueprint lifts instead
      // of darkening. What must hold in every theme is that the two differ
      // enough to read as feedback.
      const pal = palettes[id]
      expect(ratio(pal['brand'], pal['brand-hover'])).toBeGreaterThan(1.15)
    })
  }

  it('the measurement actually discriminates', () => {
    // A contrast checker that returns >=4.5 for everything would pass all of
    // the above. These are the known answers.
    expect(ratio('#ffffff', '#000000')).toBeCloseTo(21, 1)
    expect(ratio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(ratio('#a39d8d', '#f4f3ef')).toBeCloseTo(2.44, 1)   // the shipped failure
  })

  it('an unknown id cannot reach the document', () => {
    expect(isThemeId('drafting')).toBe(true)
    expect(isThemeId('blueprint')).toBe(true)
    expect(isThemeId('hacked')).toBe(false)
    expect(isThemeId(null)).toBe(false)
    expect(THEMES.some((t) => t.id === DEFAULT_THEME)).toBe(true)
  })
})
