import { useMemo, useState, type JSX } from 'react'
import type { StructuralModel } from '../engine/model'
import type { StructureDesign } from '../engine/pipeline'
import { planToSvg } from '../engine/planRenderer'
import { buildSheetSet, groupSheets, type PlanSheet } from '../lib/planSheets'
import type { SoilInput } from '../lib/planDetails'

/** Render a trusted, engine-generated SVG string. */
function RawSvg({ svg, className }: { svg: string; className?: string }): JSX.Element {
  return <div className={className} dangerouslySetInnerHTML={{ __html: svg }} />
}

function download(name: string, svg: string): void {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

/**
 * One sheet.
 *
 * The design findings a sheet carries — a hook that does not develop, a bar the
 * offset rule will not let anyone bend — are NOT printed under it here. They
 * are `RebarCage.notes`, and the Display tab already lists them once each with
 * every member they apply to; repeated per sheet they came out as a wall of
 * amber under every elevation, the same three findings over and over, with the
 * lap counts ("shown on the elevation") mixed in among them saying nothing the
 * drawing does not.
 *
 * `PlanSheet.warnings` is still carried, because the sheet set is also the
 * PDF's, and a caller that wants to collect them still can.
 */
function Sheet({ sheet, svg }: { sheet: PlanSheet; svg: string }): JSX.Element {
  return (
    <div className="space-y-1">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5">
          <span className="text-xs font-semibold text-slate-600">
            {sheet.title}
            {sheet.subtitle && <span className="font-normal text-slate-400"> · {sheet.subtitle}</span>}
          </span>
          <button type="button" onClick={() => download(`${sheet.key}.svg`, svg)}
            className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50">
            ↓ SVG
          </button>
        </div>
        <RawSvg svg={svg} className="overflow-x-auto p-3" />
      </div>
    </div>
  )
}

/** "Plans" tab: framing + foundation plans and every standard detail sheet,
 *  generated live from the model + design. The set comes from `planSheets`, so
 *  the tab and the PDF report cannot show different drawings. */
export function PlansPanel({ model, design, soil }: { model: StructuralModel; design: StructureDesign | null; soil: SoilInput }): JSX.Element {
  const [hooked, setHooked] = useState(false)

  const groups = useMemo(
    () => groupSheets(buildSheetSet(model, design, soil, { hookedMatBars: hooked }))
      .map((g) => ({ ...g, sheets: g.sheets.map((s) => ({ sheet: s, svg: planToSvg(s.drawing, 1100) })) })),
    [model, design, soil, hooked],
  )

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-end">
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
          {g.sheets.map(({ sheet, svg }) => <Sheet key={sheet.key} sheet={sheet} svg={svg} />)}
        </div>
      ))}
    </section>
  )
}
