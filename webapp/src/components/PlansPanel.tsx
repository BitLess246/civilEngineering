import { useMemo, useState, type JSX } from 'react'
import type { StructuralModel } from '../engine/model'
import type { StructureDesign } from '../engine/pipeline'
import { planToSvg } from '../engine/planRenderer'
import { buildSheetSet, groupSheets, type PlanSheet } from '../lib/planSheets'
import { downloadSvg } from '../lib/downloadSvg'
import type { SoilInput } from '../lib/planDetails'
import { PlanViewer } from './PlanViewer'

/** Render a trusted, engine-generated SVG string. Extra props land on the
 *  wrapper div — the sheet uses them to make the drawing itself clickable. */
function RawSvg({ svg, className, ...rest }:
  { svg: string; className?: string } & JSX.IntrinsicElements['div']): JSX.Element {
  return <div className={className} dangerouslySetInnerHTML={{ __html: svg }} {...rest} />
}

/**
 * One sheet.
 *
 * The drawing is itself the way in: clicking it opens the sheet in the
 * fullscreen viewer, where it is readable. The header keeps two explicit
 * buttons — ⛶ for the viewer, ↓ SVG for the file — so neither hides behind
 * the other.
 *
 * The design findings a sheet carries — a hook that does not develop, a bar
 * the offset rule will not let anyone bend — are NOT printed under it here.
 * They are `RebarCage.notes`, and the Display tab already lists them once each
 * with every member they apply to; repeated per sheet they came out as a wall
 * of amber under every elevation, the same three findings over and over, with
 * the lap counts mixed in among them saying nothing the drawing does not.
 *
 * `PlanSheet.warnings` is still carried, because the sheet set is also the
 * PDF's, and a caller that wants to collect them still can.
 */
function Sheet({ sheet, svg, onOpen }: { sheet: PlanSheet; svg: string; onOpen: () => void }): JSX.Element {
  return (
    <div className="space-y-1">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5">
          <span className="text-xs font-semibold text-slate-600">
            {sheet.title}
            {sheet.subtitle && <span className="font-normal text-slate-400"> · {sheet.subtitle}</span>}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={onOpen} title="View full screen"
              className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50">
              ⛶
            </button>
            <button type="button" onClick={() => downloadSvg(`${sheet.key}.svg`, svg)}
              className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50">
              ↓ SVG
            </button>
          </span>
        </div>
        <RawSvg svg={svg} onClick={onOpen} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
          aria-label={`View ${sheet.title} full screen`}
          className="cursor-zoom-in select-none overflow-x-auto p-3 hover:bg-slate-50/70" />
      </div>
    </div>
  )
}

/** "Plans" tab: framing + foundation plans and every standard detail sheet,
 *  generated live from the model + design. The set comes from `planSheets`, so
 *  the tab and the PDF report cannot show different drawings. Clicking a sheet
 *  opens the fullscreen viewer, which walks the set in the very order the tab
 *  stacks it. */
export function PlansPanel({ model, design, soil }: { model: StructuralModel; design: StructureDesign | null; soil: SoilInput }): JSX.Element {
  const [hooked, setHooked] = useState(false)
  const [viewing, setViewing] = useState<number | null>(null)

  /** The set flat, in sheet order, serialised once at the PDF's width. */
  const sheets = useMemo(
    () => buildSheetSet(model, design, soil, { hookedMatBars: hooked })
      .map((sheet) => ({ sheet, svg: planToSvg(sheet.drawing, 1100) })),
    [model, design, soil, hooked],
  )
  /** The same set grouped for display, each entry carrying its flat index —
   *  the number the viewer opens and flips from. */
  const groups = useMemo(() => {
    const byKey = new Map(sheets.map((s) => [s.sheet.key, s]))
    const indexOf = new Map(sheets.map((s, i) => [s.sheet.key, i]))
    return groupSheets(sheets.map((s) => s.sheet)).map((g) => ({
      group: g.group,
      sheets: g.sheets.map((s) => ({ ...byKey.get(s.key)!, index: indexOf.get(s.key)! })),
    }))
  }, [sheets])

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="pl-3 text-[11px] text-slate-400">Click a plan to view it full screen.</p>
        <label className="flex shrink-0 items-center gap-1.5 pl-3 text-[11px] text-slate-600">
          <input type="checkbox" checked={hooked} onChange={(e) => setHooked(e.target.checked)} />
          90° mat hooks
        </label>
      </div>

      {!design && (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
          Run the design to generate the foundation plan &amp; the detail sheets.
        </p>
      )}

      {groups.map((g) => (
        <div key={g.group} className="space-y-3">
          {g.group !== 'Plans' && (
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.group}</h4>
          )}
          {g.sheets.map(({ sheet, svg, index }) => (
            <Sheet key={sheet.key} sheet={sheet} svg={svg} onOpen={() => setViewing(index)} />
          ))}
        </div>
      ))}

      {viewing != null && sheets.length > 0 && (
        <PlanViewer sheets={sheets} index={Math.min(viewing, sheets.length - 1)}
          onNavigate={setViewing} onClose={() => setViewing(null)} />
      )}
    </section>
  )
}
