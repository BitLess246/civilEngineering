/**
 * Make horizontally scrolling regions keyboard-reachable — but only when they
 * actually scroll.
 *
 * The app has 84 `overflow-x-auto` containers (wide tables: schedules, rebar
 * rankings, load-combination matrices) and NONE of them was focusable, so a
 * keyboard user could not scroll one at all. That is WCAG 2.1.1, and axe
 * reports it as `scrollable-region-focusable`.
 *
 * The obvious fix — `tabIndex={0}` on all 84 — is worse than it looks: most of
 * those regions fit their content most of the time, and a tab stop that
 * scrolls nothing is 84 extra presses for the very users the fix is for. So
 * the attribute is applied per element, from measurement, and removed again
 * when the region stops overflowing.
 *
 * Done at the DOM level rather than by editing 84 call sites because the
 * condition is a LAYOUT fact, not a markup fact: the same table overflows at
 * 390px and not at 1440px, overflows at 150% browser zoom and not at 100%, and
 * overflows once a schedule has 30 rows and not when it has 3. A prop cannot
 * know any of that; a ResizeObserver can.
 *
 * Deliberately NOT adding `role="region"`: that would be a landmark, and a
 * landmark needs an accessible name. Eighty-four unnamed regions would be
 * worse for a screen-reader user than none. Focusability is what the failure
 * is about.
 */

const SELECTOR = '[class*="overflow-x-auto"]'

/** Tab stop if it scrolls, none if it does not. The 1px allows for rounding. */
function sync(el: HTMLElement): void {
  const scrolls = el.scrollWidth - el.clientWidth > 1
  if (scrolls) {
    if (el.tabIndex !== 0) el.tabIndex = 0
  } else if (el.hasAttribute('tabindex')) {
    el.removeAttribute('tabindex')
  }
}

/**
 * Watch the document for scrollable regions. Returns a teardown.
 *
 * One ResizeObserver for size changes and one MutationObserver for regions
 * that arrive with a re-render (every calculator result panel does).
 */
export function watchScrollableRegions(root: ParentNode = document): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {}

  const ro = new ResizeObserver((entries) => {
    for (const e of entries) sync(e.target as HTMLElement)
  })
  const seen = new WeakSet<Element>()

  const scan = () => {
    for (const el of root.querySelectorAll<HTMLElement>(SELECTOR)) {
      sync(el)
      if (!seen.has(el)) { seen.add(el); ro.observe(el) }
    }
  }
  scan()

  const mo = new MutationObserver(scan)
  mo.observe(root instanceof Document ? root.body : (root as Element), { childList: true, subtree: true })

  return () => { ro.disconnect(); mo.disconnect() }
}

/** Exported for the test: the overflow decision, without any DOM plumbing. */
export const overflows = (scrollWidth: number, clientWidth: number): boolean =>
  scrollWidth - clientWidth > 1
