// ─────────────────────────────────────────────────────────────────────────
// THE MODEL SPACE, BEFORE IT ARRIVES.
//
// `/model` is a lazy chunk carrying three.js, and it is the biggest one in the
// app. What stood in for it was a line of centred text, so the page went:
// one sentence → footer → (chunk lands) → a full workspace shoving the footer
// two thousand pixels down. It read as loading backwards, and on a slow
// connection the footer was the only thing on screen.
//
// So the placeholder is the WORKSPACE'S OWN SHAPE, at its own size: the ribbon
// strip, the dark viewport, the 380 px rail with a few sections in it. Nothing
// moves when the real thing replaces it, because the real thing is already the
// size of the hole.
//
// Deliberately NOT a copy of the real markup. It mirrors the outer boxes —
// which is what decides the page height — and stops there; a skeleton that
// tried to reproduce eleven tabs and thirty controls would be a second
// description of the layout, drifting from the first the day either changes.
// ─────────────────────────────────────────────────────────────────────────

/** One shimmering block. `animate-pulse` is Tailwind's, and it already stops
 *  under `prefers-reduced-motion`. */
function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#e7e5de] ${className}`} />
}

/** A rail section: a short title bar and a couple of field-shaped rows. */
function RailSection({ rows = 2 }: { rows?: number }) {
  return (
    <div className="border-b border-[#eeece5] py-3.5">
      <Bar className="h-2 w-24" />
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        {Array.from({ length: rows * 2 }, (_, i) => <Bar key={i} className="h-7" />)}
      </div>
    </div>
  )
}

/**
 * The 3D Model Space placeholder, shown while its chunk downloads.
 *
 * `aria-busy` with a polite live region rather than a spinner glyph: a screen
 * reader gets told the workspace is loading once, and is not read a wall of
 * decorative boxes.
 */
export function ModelSpaceSkeleton() {
  return (
    <div className="mx-auto max-w-[1700px]" aria-busy="true">
      <span className="sr-only" role="status">Loading the 3D model space…</span>

      {/* Ribbon — same border, background and padding as the real one, and the
          same HEIGHT, which is the only number here that has to be right.

          The real ribbon wraps its eleven tabs onto two lines under their group
          labels; measured in the browser it is 76 px against the 41 px a single
          row of placeholders gave, and that 35 px was the entire footer shift
          left after the workspace grid below already matched to the pixel. It
          is stated as a height rather than reproduced by copying the ribbon's
          markup, because a second copy of eleven tabs and five group labels
          would drift from the first the day either changes — and drift there
          is silent, where a wrong number here is one measurement away from
          being caught again. */}
      <div aria-hidden className="flex min-h-[76px] items-center gap-2 border-b border-[#e3e1da] bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Bar className="h-6 w-16" />
          <Bar className="h-6 w-20" />
          <Bar className="h-6 w-16" />
          <Bar className="h-6 w-24" />
          <Bar className="h-6 w-16" />
          <Bar className="h-6 w-20" />
          <Bar className="h-6 w-14" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Bar className="h-6 w-14" />
          <Bar className="h-6 w-16" />
        </div>
      </div>

      {/* Workspace — the same grid, heights and gaps the page uses, which is
          the whole point: the footer lands where it will finally sit. */}
      <div aria-hidden className="grid grid-cols-1 gap-4 p-4 lg:h-[calc(100vh-6.5rem)] lg:min-h-[520px] lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="lg:flex lg:min-h-0 lg:flex-col">
          <div className="relative h-[80vh] min-h-[460px] overflow-hidden rounded-lg border border-[#e3e1da] bg-[#0f1b2a] lg:h-full lg:min-h-0">
            {/* The viewport is dark, so its own shimmer has to be light — the
                grey used everywhere else would be invisible on it. */}
            <div className="absolute left-4 top-4 h-6 w-44 animate-pulse rounded bg-white/10" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[12px] tracking-wide text-white/35">Loading the 3D model space…</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[#e3e1da] bg-white px-4 py-1">
          <RailSection rows={2} />
          <RailSection rows={3} />
          <RailSection rows={1} />
        </div>
      </div>
    </div>
  )
}
