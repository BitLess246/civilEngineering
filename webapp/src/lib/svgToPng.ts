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
// to the page's CSS, so a Tailwind class like `stroke-slate-400` resolves to
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
    const w = Math.round(rect.width || vb?.width || 0)
    const h = Math.round(rect.height || vb?.height || 0)
    if (!w || !h) return null

    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(w))
    clone.setAttribute('height', String(h))
    if (!clone.getAttribute('viewBox') && vb) {
      clone.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${vb.height}`)
    }

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
