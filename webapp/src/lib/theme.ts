/**
 * UI themes — the registry, and the one place a theme id becomes real.
 *
 * VALUES DO NOT LIVE HERE. They live in `styles/themes.css`, and this module
 * only names the themes and applies an id to the document. Keeping one source
 * of truth matters more than convenience: a TypeScript copy of the palette
 * would drift from the stylesheet the browser actually paints, and the
 * contrast test would then be checking numbers nobody ships. `theme.test.ts`
 * parses the CSS for the same reason.
 *
 * Applying a theme sets `data-theme` on <html>. Nothing re-renders: every
 * colour utility compiles to `var(--color-*)`, which resolves against the
 * `--t-*` block the attribute selects, so the repaint is the browser's.
 */

export const THEMES = [
  {
    id: 'drafting',
    name: 'Drafting sheet',
    blurb: 'Warm paper, ink navy and drafting blue — the workbench as a drawing sheet.',
    swatch: ['#f4f3ef', '#0f1b2a', '#0f4c92'],
  },
  {
    id: 'daylight',
    name: 'Daylight',
    blurb: 'The same drafting language on a true-neutral ground. Cooler greys, one blue.',
    swatch: ['#fafaf8', '#10192b', '#0b4a8f'],
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    blurb: 'Inverted sheet for long sessions and low light.',
    swatch: ['#0b1420', '#e8eef7', '#7cb8ff'],
  },
  {
    id: 'mono',
    name: 'Mono',
    blurb: 'Near-black on white. Colour is reserved for verdicts, so a failing check is the only saturated thing on screen.',
    swatch: ['#ffffff', '#0a0a0a', '#00429b'],
  },
  {
    id: 'minimal',
    name: 'Minimal',
    blurb: 'No accent at all — actions are ink, and hairlines carry the structure.',
    swatch: ['#fcfcfc', '#1c1c1c', '#2b2b2b'],
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export const DEFAULT_THEME: ThemeId = 'drafting'
export const THEME_KEY = 'civeng-theme'

const IDS: readonly string[] = THEMES.map((t) => t.id)

/** Narrow an unknown string, so a hand-edited localStorage value cannot
 *  stamp an attribute no stylesheet answers and leave the app unstyled. */
export const isThemeId = (v: unknown): v is ThemeId =>
  typeof v === 'string' && IDS.includes(v)

export function loadTheme(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return isThemeId(v) ? v : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME   // private mode, blocked storage
  }
}

export function saveTheme(id: ThemeId): void {
  try { localStorage.setItem(THEME_KEY, id) } catch { /* nothing to do */ }
}

/**
 * Put the theme on the document.
 *
 * The default is stamped explicitly rather than left absent: the pre-hydration
 * script in index.html writes the same attribute, and an app that sometimes
 * omits it makes `[data-theme="drafting"]` and `:root` two subtly different
 * selectors to reason about.
 */
export function applyTheme(id: ThemeId): void {
  document.documentElement.setAttribute('data-theme', id)
}
