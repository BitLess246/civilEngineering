// Four screenshots of the app doing the work. View layer.
//
// The third panel is the one that matters. Anybody can show a rendering; a
// schedule listing 21 columns over capacity, each with the seismic combination
// that governed it, is the panel that says the checks are real. A storyboard
// where everything passes persuades nobody who designs for a living.
//
// EVERY IMAGE IS LAZY AND CARRIES ITS OWN DIMENSIONS. `loading="lazy"` keeps
// them off the critical path — the diagram and the worked solution above are
// what the page is judged on, and they cost nothing to render. `width`/`height`
// reserve the box so nothing below jumps as each one arrives, which is the
// failure the removed video's poster attribute existed to prevent.

import { PANELS, COMPARISON, type Panel } from './storyboardData'

function Tile({ p, ratio }: { p: Panel; ratio: string }) {
  return (
    <figure className="m-0 overflow-hidden rounded-lg border border-[#e3e1da] bg-white">
      <img
        src={p.src}
        alt={p.alt}
        width={1280}
        height={800}
        loading="lazy"
        decoding="async"
        className={`block w-full bg-[#f7f5ef] ${ratio}`}
      />
      <figcaption className="border-t border-[#e3e1da] px-4 py-2.5">
        <p className="text-[13px] font-bold text-[#0f1b2a]">{p.label}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#5c6675]">{p.caption}</p>
      </figcaption>
    </figure>
  )
}

export function Storyboard() {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {PANELS.map((p) => <Tile key={p.src} p={p} ratio="aspect-[16/10] object-cover" />)}
    </div>
  )
}

/**
 * The same report before and after — side by side, because that is the point.
 *
 * `object-contain` and a portrait ratio, unlike the tiles above: these are A4
 * pages, and cropping one to a landscape box would cut off the summary table
 * that carries the whole comparison.
 */
export function ReportComparison() {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      {COMPARISON.map((p) => <Tile key={p.src} p={p} ratio="aspect-[3/4] object-contain" />)}
    </div>
  )
}
