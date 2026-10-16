// ─────────────────────────────────────────────────────────────────────────
// SCROLL EDGES — say that a box scrolls, where it is cut off.
//
// The drawing frame refuses to shrink a figure past its legibility floor and
// scrolls instead, and the results table keeps a 620 px minimum for the same
// reason. Both were RIGHT to scroll and both looked broken doing it: in a
// 494 px column the beam section's strain diagram simply stopped at the edge
// ("εcu = 0.0"), and the table lost its Util. and Status columns, with nothing
// to say there was more. A scrollbar on a trackpad is invisible until touched.
//
// So: a fade on each edge that has content beyond it, and — until the reader
// has scrolled at all — one small "scroll" hint. Pure presentation; the boxes
// keep their own overflow rules. Hidden from the PDF (`data-pdf-skip`), where
// figures are painted at the page's width and nothing is cut.
// ─────────────────────────────────────────────────────────────────────────
import type { Edges } from '../lib/scrollEdges'

const fade = (side: 'left' | 'right') =>
  `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, var(--color-sheet, #fff), transparent)`

/** The edge fades and the first-time hint, laid over a `relative` parent. */
export function EdgeFades({ edges }: { edges: Edges }) {
  return <>
    {edges.left && <div aria-hidden data-pdf-skip className="pointer-events-none absolute inset-y-0 left-0 w-8" style={{ background: fade('left') }} />}
    {edges.right && <div aria-hidden data-pdf-skip className="pointer-events-none absolute inset-y-0 right-0 w-10" style={{ background: fade('right') }} />}
    {edges.right && !edges.touched && (
      <span data-pdf-skip aria-hidden
        className="pointer-events-none absolute bottom-2 right-2 rounded-full border border-hairline bg-sheet px-2 py-0.5 text-[10.5px] font-medium text-muted shadow-sm">
        scroll →
      </span>
    )}
  </>
}
