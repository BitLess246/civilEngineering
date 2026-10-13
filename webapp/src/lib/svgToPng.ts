// ─────────────────────────────────────────────────────────────────────────
// SVG → PNG data URL, for putting a page's schematic into its PDF.
//
// The Model Space report embeds a PNG grabbed from the WebGL canvas. The
// calculator pages draw their schematics as inline SVG instead, so they need
// one conversion step: serialise the live element, load it as an image, and
// paint it onto a canvas.
//
// WHAT WILL NOT SURVIVE THE TRIP: anything styled from an external stylesheet.
// An `<img>` loading an SVG renders it in an isolated document with no access
// to the page's CSS, so a themed class like `stroke-hairline` resolves to
// nothing and the shape comes out black or invisible. The schematics in this
// repo set stroke/fill as SVG PRESENTATION ATTRIBUTES (`stroke={STROKE}`), which
// travel with the markup and do survive — that is why this works here, and the
// thing to check first if a new schematic exports blank.
//
// Text is a second trap: fonts are not embedded, so the isolated document falls
// back to a default face. Metrics shift slightly; layout does not break because
// the schematics position text explicitly rather than relying on measured width.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Rendering scale — 3× keeps the raster crisp at print resolution, capped so a
 * large schematic cannot balloon the file.
 *
 * The figure lands about 150 mm wide on A4, which at 300 dpi is ~1770 px, so
 * anything past ~1800 px is detail no printer can use. This cap is a guard for
 * unusually large drawings, not a fix for a measured problem — the 6.3 MB beam
 * PDF that prompted the investigation was caused by jsPDF embedding the raster
 * UNCOMPRESSED, and is fixed in `pdfKit.figure` by passing a compression mode.
 * At 1446×1410 this cap was not even reached.
 */
const SCALE = 3
const MAX_PX = 1800

export interface Box { x: number; y: number; width: number; height: number }

/**
 * The viewBox to rasterise: the drawn content plus a margin, never past the
 * canvas the page shows.
 *
 * A schematic's canvas is sized for the SCREEN column, not for its ink — the
 * retaining wall leaves a quarter of its width empty beside the pressure
 * diagram, the footing a band above the plan — and the PDF figure fitted that
 * whole canvas into its frame, so the empty part took the frame's width and
 * the drawing came out small and off to one side. Cropped to the ink, the same
 * frame holds the drawing centred and as large as the frame allows.
 *
 * Clipped to `vb` because content past the viewBox is hidden on screen, and the
 * sheet should not print what the page does not show. `pad` is in user units
 * and covers what `getBBox` leaves out (stroke half-widths, glyph overhang).
 * Falls back to `vb` when the box is empty or degenerate.
 */
export function contentCrop(vb: Box, ink: Box | null, pad: number): Box {
  if (!ink || !(ink.width > 0) || !(ink.height > 0)) return vb
  const x0 = Math.max(vb.x, ink.x - pad), y0 = Math.max(vb.y, ink.y - pad)
  const x1 = Math.min(vb.x + vb.width, ink.x + ink.width + pad), y1 = Math.min(vb.y + vb.height, ink.y + ink.height + pad)
  return x1 - x0 > 0 && y1 - y0 > 0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : vb
}

/**
 * Serialise an on-screen `<svg>` to a PNG data URL.
 *
 * Returns null rather than throwing when the element is missing or the browser
 * refuses to rasterise it: a schematic that will not convert should cost the
 * report its figure, not the whole export.
 */
export async function svgToPng(svg: SVGSVGElement | null, background = '#ffffff'): Promise<string | null> {
  if (!svg) return null
  try {
    // Size from the layout box, falling back to the viewBox for an SVG that has
    // not been laid out (display:none, off-screen print block).
    const rect = svg.getBoundingClientRect()
    const vb = svg.viewBox?.baseVal
    const w0 = rect.width || vb?.width || 0
    const h0 = rect.height || vb?.height || 0
    if (!w0 || !h0) return null
    const full: Box = vb && vb.width > 0 && vb.height > 0 ? { x: vb.x, y: vb.y, width: vb.width, height: vb.height } : { x: 0, y: 0, width: w0, height: h0 }
    let ink: Box | null = null
    try { ink = svg.getBBox() } catch { /* not rendered — keep the full canvas */ }
    // the 'meet' scale the page draws at, so the raster keeps its on-screen size
    const k = Math.min(w0 / full.width, h0 / full.height)
    const crop = contentCrop(full, ink, 6 / k)
    const w = Math.round(crop.width * k)
    const h = Math.round(crop.height * k)
    if (!w || !h) return null

    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(w))
    clone.setAttribute('height', String(h))
    clone.setAttribute('viewBox', `${crop.x} ${crop.y} ${crop.width} ${crop.height}`)
    // the crop changes the box's aspect; the content keeps its own
    clone.setAttribute('preserveAspectRatio', 'xMidYMid meet')

    const markup = new XMLSerializer().serializeToString(clone)
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('svg failed to load'))
      el.src = url
    })

    const scale = Math.min(SCALE, MAX_PX / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // The SVG is transparent; the PDF page is white. Paint the background in
    // explicitly or antialiased edges fringe against black.
    ctx.fillStyle = background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/** Convenience: find the first `<svg>` inside a container and convert it. */
export const captureSvgIn = (root: Element | null): Promise<string | null> =>
  svgToPng(root?.querySelector('svg') ?? null)
