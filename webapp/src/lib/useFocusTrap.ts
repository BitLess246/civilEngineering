/**
 * Keep keyboard focus inside an open overlay, and give it back on close.
 *
 * The app ships seven `role="dialog" aria-modal="true"` overlays and not one
 * of them traps focus: measured on the welcome dialog, tabs 1–14 stay inside
 * and tabs 15–24 walk out into the dimmed page behind it. `aria-modal="true"`
 * hides that page from a screen reader while the keyboard still reaches it,
 * which is the worst of both — a sighted keyboard user tabs into content they
 * cannot see, and a screen-reader user is told it is not there.
 *
 * This hook exists because the mobile nav drawer would otherwise have been the
 * eighth. It is deliberately small and general so the other seven can adopt it
 * without inheriting anything drawer-specific.
 *
 * Three jobs, which is what "trap" actually means:
 *   1. move focus INTO the overlay when it opens (otherwise the first Tab
 *      starts from wherever the trigger was, i.e. outside),
 *   2. wrap Tab and Shift+Tab at the two ends,
 *   3. restore focus to the trigger on close, so the keyboard does not land
 *      back at the top of the document.
 */
import { useEffect, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Visible, focusable descendants in DOM order. */
function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement)
}

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onEscape?: () => void): void {
  useEffect(() => {
    if (!active) return
    const root = ref.current
    if (!root) return

    const previous = document.activeElement as HTMLElement | null
    // Focus the panel itself rather than its first control: a drawer that
    // opens with the first nav link highlighted reads as though that link was
    // chosen. The panel carries tabIndex={-1} for this.
    const first = focusable(root)
    ;(root.tabIndex === -1 ? root : first[0])?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onEscape?.(); return }
      if (e.key !== 'Tab') return
      const items = focusable(root)
      if (items.length === 0) { e.preventDefault(); return }
      const firstEl = items[0], lastEl = items[items.length - 1]
      const current = document.activeElement
      // Wrap at both ends, and pull focus back in if it has escaped already.
      if (e.shiftKey && (current === firstEl || current === root || !root.contains(current))) {
        e.preventDefault(); lastEl.focus()
      } else if (!e.shiftKey && (current === lastEl || !root.contains(current))) {
        e.preventDefault(); firstEl.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [ref, active, onEscape])
}
