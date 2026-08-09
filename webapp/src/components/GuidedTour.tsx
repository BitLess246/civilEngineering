// ─────────────────────────────────────────────────────────────────────────
// A spotlight walkthrough that takes over the screen. Generic — it knows
// nothing about soils, only about steps, anchors and tabs.
//
// HOW IT POINTS AT THINGS. Each step names a `data-tour` value; the overlay
// measures that element and cuts a hole in the dimmer over it. Measuring on
// every step (and on resize/scroll) rather than once is what keeps the hole on
// target when switching tabs changes the layout underneath.
//
// AN ANCHOR THAT IS NOT THERE MUST NOT BREAK THE TOUR. A step whose element is
// missing — a panel that needs data the user has not entered yet — degrades to
// a centred card with the same words, rather than a spotlight over the corner
// of the page or a crash mid-walkthrough. The tour is the thing a stuck user
// reaches for, so it has to be the most robust screen in the app.
//
// It scrolls the anchor into view, traps Escape, and restores nothing else:
// the tour never edits data, so leaving it at any point is always safe.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'

export interface TourStepView {
  id: string
  anchor?: string
  title: string
  body: string
  why?: string
}

interface Rect { top: number; left: number; width: number; height: number }

const PAD = 6

export function GuidedTour({
  step, index, total, onNext, onPrev, onClose,
}: {
  step: TourStepView
  index: number
  total: number
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}) {
  const [rect, setRect] = useState<Rect | null>(null)

  const measure = useCallback(() => {
    if (!step.anchor) { setRect(null); return }
    const el = document.querySelector(`[data-tour="${step.anchor}"]`)
    if (!el) { setRect(null); return }
    const r = el.getBoundingClientRect()
    // A zero-sized anchor is a hidden one; treat it as absent rather than
    // spotlighting a point.
    if (r.width < 1 || r.height < 1) { setRect(null); return }
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 })
  }, [step.anchor])

  // Measured on the NEXT FRAME rather than synchronously: switching step also
  // switches tab, and measuring before that paint reads the previous tab's
  // geometry and puts the hole over the wrong element. The second pass covers
  // the smooth scroll settling.
  useEffect(() => {
    document.querySelector(`[data-tour="${step.anchor}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const raf = requestAnimationFrame(measure)
    const t = setTimeout(measure, 320)
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
  }, [measure, step.anchor])

  useEffect(() => {
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') onNext()
      else if (e.key === 'ArrowLeft') onPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNext, onPrev])

  const last = index >= total - 1

  /** Rough card height, for placement only — the card is clamped either way. */
  const CARD_H = 280

  // The card goes under the spotlight when there is room below it and above it
  // when there is not: a card covering the thing it describes is worse than no
  // card. Then it is CLAMPED into the viewport, because an anchor taller than
  // the screen (a whole panel) otherwise pushes the card off the top and the
  // walkthrough becomes unreadable at exactly the step that needed it.
  const cardTop = (() => {
    if (!rect) return null
    const below = rect.top + rect.height + 12
    const above = rect.top - CARD_H - 12
    const preferred = below + CARD_H < window.innerHeight - 16 ? below
      : above > 16 ? above
        : below
    return Math.min(Math.max(preferred, 16), Math.max(window.innerHeight - CARD_H - 16, 16))
  })()

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Guided walkthrough">
      {/* Dimmer with a hole. Four panels rather than an SVG mask so the cut-out
          stays crisp at any zoom and the anchor underneath is still clickable. */}
      {rect ? (
        <>
          <div className="absolute left-0 right-0 top-0 bg-slate-900/55" style={{ height: Math.max(rect.top, 0) }} onClick={onClose} />
          <div className="absolute left-0 bg-slate-900/55" style={{ top: rect.top, width: Math.max(rect.left, 0), height: rect.height }} onClick={onClose} />
          <div className="absolute right-0 bg-slate-900/55" style={{ top: rect.top, left: rect.left + rect.width, height: rect.height }} onClick={onClose} />
          <div className="absolute bottom-0 left-0 right-0 bg-slate-900/55" style={{ top: rect.top + rect.height }} onClick={onClose} />
          <div
            className="pointer-events-none absolute rounded-lg ring-2 ring-[#0056b3] ring-offset-2 ring-offset-transparent"
            style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
        </>
      ) : (
        <div className="absolute inset-0 bg-slate-900/55" onClick={onClose} />
      )}

      <div
        className={`absolute w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-2xl ${
          rect ? '' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'}`}
        style={{
          maxHeight: 'calc(100vh - 2rem)',
          overflowY: 'auto',
          ...(rect ? {
            top: cardTop ?? undefined,
            left: Math.min(Math.max(rect.left, 16), Math.max(window.innerWidth - 432, 16)),
          } : {}),
        }}>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
          Step {index + 1} of {total}
        </p>
        <h2 className="mt-1 text-[15px] font-bold text-[#0056b3]">{step.title}</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-700">{step.body}</p>
        {step.why && <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{step.why}</p>}

        {/* The step names a control that is not on screen. Saying so beats a
            centred card that reads as though the tour lost its place — the
            control usually appears once the PREVIOUS step has been done. */}
        {!rect && step.anchor && (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
            This control is not on screen yet — it appears once the previous step has been done.
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <button onClick={onClose} className="text-[11px] text-slate-500 hover:text-slate-800">
            Close (Esc)
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button onClick={onPrev}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-[12px] text-slate-700 hover:bg-slate-50">
                Back
              </button>
            )}
            <button onClick={last ? onClose : onNext}
              className="rounded-md bg-[#0056b3] px-3 py-1 text-[12px] font-semibold text-white hover:bg-[#004a99]">
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        </div>

        <div className="mt-3 flex gap-1">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-[#0056b3]' : 'bg-slate-200'}`} />
          ))}
        </div>
      </div>
    </div>
  )
}
