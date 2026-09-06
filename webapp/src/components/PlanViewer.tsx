// The Plans tab's sheets, one at a time, filling the screen.
//
// The stacked rail on the tab is right for comparing sheets side by side, but
// a framing plan read on a laptop is a squint: the grid bubbles, the bar marks
// and the dimension strings are drawn for an A1 sheet, not for a 300 px rail
// card. Clicking a sheet opens it here, where the drawing is laid out at the
// same width the PDF prints it and the browser scales it to the screen.
//
// Flipping through the set is the point — Ground, Second, foundation, the
// column on grid B — so the left and right edges of the screen are click
// zones (and ←/→ work), and the sheet's own ↓ SVG sits in the bar, saving
// exactly the bytes the screen is showing. Escape, the ✕ and the dark area
// around the sheet all leave.
//
// No portal: every overlay in this app is an in-place `fixed` div, which also
// escapes the rail's `overflow-hidden` that would clip anything mounted there.
import { useCallback, useEffect, type JSX } from 'react'
import { stepIndex, type PlanSheet } from '../lib/planSheets'
import { isTypingTarget } from '../lib/history'
import { downloadSvg } from '../lib/downloadSvg'

export function PlanViewer({ sheets, index, onNavigate, onClose }: {
  /** The set in DISPLAY order — the same order the tab stacks the sheets in,
   *  so "next" moves the way the page reads. */
  sheets: { sheet: PlanSheet; svg: string }[]
  index: number
  onNavigate: (index: number) => void
  onClose: () => void
}): JSX.Element | null {
  const count = sheets.length
  const i = Math.min(Math.max(index, 0), count - 1)
  const at = sheets[i]

  const prev = useCallback(() => onNavigate(stepIndex(index, count, -1)), [index, count, onNavigate])
  const next = useCallback(() => onNavigate(stepIndex(index, count, 1)), [index, count, onNavigate])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A field left focused on the page owns the arrows — moving its caret
      // must not also flip the sheet underneath it.
      if (isTypingTarget(e.target)) return
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next() }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onClose, prev, next])

  if (!at) return null
  const s = at.sheet
  // The drawing's own aspect, from the viewBox planToSvg wrote — sized by it,
  // the white sheet hugs its drawing and the dark around it is truly backdrop.
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(at.svg)
  const ratio = vb ? `${vb[1]} / ${vb[2]}` : undefined
  const zone = 'absolute inset-y-0 z-10 flex w-14 items-center justify-center text-3xl text-white/70 transition hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-20 md:w-24 md:text-4xl'

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-[#0f1b2a]/[.92]"
      onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={`${s.title}, full screen`}>

      {/* Title bar: what sheet, which of how many, save it, leave. */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-bold uppercase tracking-wide text-white">{s.title}</h2>
          <p className="truncate text-[11px] text-white/50">
            {s.subtitle ? `${s.group} · ${s.subtitle}` : s.group}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] tabular-nums text-white/50">{i + 1} / {count}</span>
          <button type="button" onClick={() => downloadSvg(`${s.key}.svg`, at.svg)}
            className="rounded-md border border-white/20 px-2.5 py-1 text-[11px] font-medium text-white/80 hover:bg-white/10">
            ↓ SVG
          </button>
          <button type="button" onClick={onClose} aria-label="Close full screen view"
            className="rounded-md border border-white/20 px-2.5 py-1 text-[11px] font-medium text-white/80 hover:bg-white/10">
            ✕ Close
          </button>
        </div>
      </div>

      {/* The sheet, scaled to fit. The sheet box stops the mousedown; a click
          on the dark letterbox around it is a click on the backdrop — out. */}
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 flex items-center justify-center p-8 md:p-12">
          <div className="max-h-full max-w-full [&>svg]:h-full [&>svg]:w-full"
            style={ratio ? { aspectRatio: ratio } : undefined}
            onMouseDown={(e) => e.stopPropagation()}
            dangerouslySetInnerHTML={{ __html: at.svg }} />
        </div>

        {/* The click zones. Buttons, not hotspots — what they do is what they
            say; the ends fade out instead of wrapping. */}
        <button type="button" onClick={prev} disabled={i === 0}
          onMouseDown={(e) => e.stopPropagation()}
          className={`${zone} left-0`} title="Previous sheet (←)" aria-label="Previous sheet">
          ‹
        </button>
        <button type="button" onClick={next} disabled={i === count - 1}
          onMouseDown={(e) => e.stopPropagation()}
          className={`${zone} right-0`} title="Next sheet (→)" aria-label="Next sheet">
          ›
        </button>
      </div>
    </div>
  )
}
