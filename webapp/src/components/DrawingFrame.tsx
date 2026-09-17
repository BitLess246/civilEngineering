// ─────────────────────────────────────────────────────────────────────────
// THE DRAWING FRAME — one place that decides how small a figure may get.
//
// Named `DrawingFrame`, not `Drawing`: `engine/planRenderer` already exports a
// `Drawing` TYPE for the drawing model, and `figures.tsx` imports both.
//
// Every cross-section, elevation and plan in this app sets `viewBox` + a
// full-width box, which scales the geometry and the ANNOTATION together. The
// geometry survives a phone; the dimensions and bar callouts do not. Measured
// at 320 px, every drawing's smallest annotation was under 7.2 px and the
// worst three were 2.5–2.8 px — see `docs/AuditRemediation.md` § D.
//
// What this does: measure the drawing's own smallest `<text>`, ask
// `lib/drawingScale` for the width at which that text lands on the floor, and
// refuse to render narrower. Below that the frame SCROLLS.
//
// WHY SCROLL RATHER THAN GROW THE TEXT. Growing annotation as the box narrows
// is what a draughtsman does — plotted text height is fixed regardless of
// drawing scale — and it was the first design. It re-flows labels that were
// placed by hand against the geometry (`textAnchor="middle"` under a dimension
// line, a callout tucked beside a bar), so at 3× the labels collide with the
// thing they label. Scrolling leaves every drawing's composition exactly as
// authored. Panning a legible drawing beats reading an illegible one.
//
// MEASURED, NOT DECLARED. The smallest annotation is read out of the rendered
// SVG rather than passed in as a prop, so there is no per-drawing number to
// drift out of sync when a label is added. It costs one layout read per
// drawing per resize.
// ─────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ANNOTATION_FLOOR_PX, DRAWING_MAX_VH, drawingWidthBounds,
} from '../lib/drawingScale'

export interface DrawingFrameProps {
  children: ReactNode
  /** Override the floor for one figure. Almost nothing should. */
  floorPx?: number
  /** Override the height ceiling, as a fraction of the viewport. */
  maxVh?: number
  /** Extra classes for the scroll frame. */
  className?: string
  /**
   * What the figure is, for the scroll region's accessible name. A scrollable
   * region needs one — without it the keyboard-reachable box announces nothing
   * (this is the same `tabIndex`/`aria-label` pairing the audit's scroll-region
   * pass established for the data tables).
   */
  label: string
}

/**
 * Wrap a `<svg viewBox=…>` figure so it stops shrinking before its annotation
 * becomes unreadable.
 *
 * The child is expected to be a single SVG that fills the frame; anything else
 * renders unchanged, because a frame that cannot find a drawing should be
 * invisible rather than clever.
 */
export function DrawingFrame({
  children, floorPx = ANNOTATION_FLOOR_PX, maxVh = DRAWING_MAX_VH, className = '', label,
}: DrawingFrameProps) {
  const frame = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ min: 0, max: 0 })

  const measure = useCallback(() => {
    const svg = frame.current?.querySelector('svg')
    const vb = svg?.viewBox?.baseVal
    if (!svg || !vb?.width) return
    let units = Infinity
    for (const t of svg.querySelectorAll('text')) {
      if (!t.textContent?.trim()) continue
      // `font-size` on an SVG text resolves in USER UNITS, which is the whole
      // point — a computed value of 6.5 here is 6.5 units, not 6.5 px.
      const fs = parseFloat(getComputedStyle(t).fontSize)
      if (Number.isFinite(fs) && fs > 0 && fs < units) units = fs
    }
    // A figure with no annotation has nothing to keep legible; leave it fluid.
    if (units === Infinity) { setBox({ min: 0, max: 0 }); return }
    const b = drawingWidthBounds(
      vb.width, vb.height, units, window.innerHeight * maxVh, floorPx)
    setBox({ min: Math.ceil(b.min), max: Math.ceil(b.max) })
  }, [floorPx, maxVh])

  useEffect(() => {
    measure()
    const el = frame.current
    if (!el || typeof ResizeObserver === 'undefined') return
    // Re-measured on resize because the child can re-render with different
    // labels (a schedule row added, a units switch) and change its own floor.
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // The ceiling is a fraction of the VIEWPORT, which a ResizeObserver on the
    // frame does not see when only the window height changes.
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [measure, children])

  // `tabIndex={0}` only while it can actually scroll: a focus stop on a box
  // with nothing to scroll is a keyboard trap for no reason.
  const scrolls = box.min > 0
  return (
    <div
      ref={frame}
      // `contain: inline-size` is load-bearing, not a flourish, and it took
      // three tries to get right — each one measured, because each failed
      // somewhere the previous one passed.
      //
      // `overflow-x: auto` alone does NOT stop a box contributing its
      // content's intrinsic width to a grid ancestor. On /slab-design the
      // leak was `DIV.space-y-5 lg:sticky` — the GRID ITEM three levels above
      // this frame, carrying `min-width: auto` — whose track computed to
      // 833 px instead of its share and pushed the page 236 px past the
      // viewport at 1280. Nothing this component can set on ITSELF fixes an
      // ancestor's automatic minimum size.
      //
      // `width: 0; min-width: 100%` did fix that (a zero width contributes
      // nothing upward) and broke /truss by 47–55 px, because in a FLEX row
      // `min-width: 100%` means 100% of the flex container and the frame then
      // demands the whole row alongside its siblings.
      //
      // Inline-size containment is the actual tool: the frame's inline size is
      // computed without regard to its descendants, so it contributes nothing
      // upward AND still takes its width from whatever box it is placed in —
      // grid track, flex row or plain block alike.
      style={{ contain: 'inline-size' }}
      className={`w-full overflow-x-auto ${className}`}
      {...(scrolls ? { tabIndex: 0, role: 'region', 'aria-label': label } : {})}
    >
      <div style={box.min ? { minWidth: box.min, maxWidth: box.max || undefined } : undefined}>
        {children}
      </div>
    </div>
  )
}
