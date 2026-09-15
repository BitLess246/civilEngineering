import { useEffect, useRef, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// The landing page's live window into the 3D Model Space.
//
// This replaced the "Rather than watch a demo, run one" card. The section now
// carries a scaled-down iframe of the page itself (/model?embed=1), so what it
// advertises is what it shows: the real workbench, generating its demo frame
// and idling into a slow orbit. Inside the preview only the walkthrough and
// the 3D viewport take pointer events — the lock is the page's own (see the
// `EMBED` comment in ModelSpace.tsx), this component only sizes the window.
//
// The iframe is mounted lazily — a scroll-past landing page should not pay
// for the whole workbench chunk until the section is actually near the
// viewport — and then stays mounted: unmounting it on the way back up would
// regenerate the demo frame and reset the camera every time.
// ─────────────────────────────────────────────────────────────────────────────

/** The size the preview lays the page out at before scaling. Wide enough that
 *  the workbench's `lg` layout applies (sidebar, viewport + control rail), so
 *  the preview shows the page as desktop users see it. */
const INTRINSIC_W = 1600
const INTRINSIC_H = 1000

export function ModelSpacePreview() {
  const boxRef = useRef<HTMLDivElement>(null)
  // Near the viewport → mount the iframe. One-way: once live, it stays.
  const [live, setLive] = useState(false)
  // Measured scale: slot width ÷ intrinsic width. Measured, not hardcoded,
  // because the slot reflows between breakpoints.
  const [scale, setScale] = useState(0)

  useEffect(() => {
    const el = boxRef.current
    if (!el || live) return
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { setLive(true); io.disconnect() }
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [live])

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver((es) => {
      const w = es.at(-1)?.contentRect.width
      if (w) setScale(w / INTRINSIC_W)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <figure className="m-0">
      <div ref={boxRef}
        className="relative w-full overflow-hidden rounded-lg border border-hairline bg-rail"
        style={{ aspectRatio: `${INTRINSIC_W} / ${INTRINSIC_H}` }}>
        {!live && (
          <div className="flex h-full items-center justify-center font-mono text-xs text-rail-muted">
            Loading the workbench…
          </div>
        )}
        {live && scale > 0 && (
          <iframe src="/model?embed=1" title="3D Model Space — the real workbench, scaled down"
            loading="lazy" tabIndex={-1}
            className="absolute left-0 top-0 border-0"
            style={{ width: INTRINSIC_W, height: INTRINSIC_H, transform: `scale(${scale})`, transformOrigin: 'top left' }} />
        )}
      </div>
      {/* The page's own viewport hint, verbatim — it doubles as the promise
          that this picture is live and can be grabbed. */}
      <figcaption className="mt-2 text-right font-mono text-[10.5px] text-faint">
        live · orbit: drag · pan: ⇧drag · zoom: scroll
      </figcaption>
    </figure>
  )
}
