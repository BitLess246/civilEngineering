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

import { PANELS } from './storyboardData'

export function Storyboard() {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      {PANELS.map((p) => (
        <figure key={p.src} className="m-0 overflow-hidden rounded-lg border border-[#e3e1da] bg-white">
          <img
            src={p.src}
            alt={p.alt}
            width={1280}
            height={800}
            loading="lazy"
            decoding="async"
            className="block aspect-[16/10] w-full bg-[#f7f5ef] object-cover"
          />
          <figcaption className="border-t border-[#e3e1da] px-4 py-2.5">
            <p className="text-[13px] font-bold text-[#0f1b2a]">{p.label}</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#5c6675]">{p.caption}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
