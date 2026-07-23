import { useMemo, useState, type JSX } from 'react'
import type { StructuralModel } from '../engine/model'
import type { StructureDesign } from '../engine/pipeline'
import { buildPlan, planToSvg } from '../engine/planRenderer'
import { buildFootingDetail } from '../engine/footingDetail'
import { footingsForPlan, footingDetailBundles, type SoilInput } from '../lib/planDetails'

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

function Sheet({ title, svg, file }: { title: string; svg: string; file: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5">
        <span className="text-xs font-semibold text-slate-600">{title}</span>
        <button type="button" onClick={() => download(file, svg)}
          className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50">
          ↓ SVG
        </button>
      </div>
      <RawSvg svg={svg} className="overflow-x-auto p-3" />
    </div>
  )
}

/** "Plans" tab: framing + foundation plans and per-footing detail sheets,
 *  generated live from the model + design. The column cross-section on each
 *  detail sheet is the report's ColumnSchematic component. */
export function PlansPanel({ model, design, soil }: { model: StructuralModel; design: StructureDesign | null; soil: SoilInput }): JSX.Element {
  const [hooked, setHooked] = useState(false)

  const framing = useMemo(() => {
    const d = buildPlan(model, { kind: 'framing', detailNo: '1', sheetRef: 'S-2' })
    return d ? planToSvg(d) : null
  }, [model])

  const foundation = useMemo(() => {
    if (!design) return null
    const d = buildPlan(model, { kind: 'foundation', detailNo: '1', sheetRef: 'S-1', footings: footingsForPlan(design), foundingElev: soil.H != null ? -Math.abs(soil.H) : undefined })
    return d ? planToSvg(d) : null
  }, [model, design, soil])

  const details = useMemo(() => {
    if (!design) return []
    return footingDetailBundles(model, design, soil).map((b, i) => ({
      ...b,
      svg: planToSvg(buildFootingDetail({ ...b.detail, endHook: hooked ? '90' : 'none' }, { detailNo: String(i + 1), sheetRef: 'S-05' }), 1100),
    }))
  }, [model, design, soil, hooked])

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] leading-snug text-slate-500">
          Structural plans drafted from the model — grid, framing marks &amp; schedule, foundation footings and
          per-type footing detail sheets. Export any sheet as SVG.
        </p>
        <label className="flex shrink-0 items-center gap-1.5 pl-3 text-[11px] text-slate-600">
          <input type="checkbox" checked={hooked} onChange={(e) => setHooked(e.target.checked)} />
          90° mat hooks
        </label>
      </div>

      {framing && <Sheet title="Framing plan" svg={framing} file="framing-plan.svg" />}
      {foundation
        ? <Sheet title="Foundation plan" svg={foundation} file="foundation-plan.svg" />
        : <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">Run the design to generate the foundation plan &amp; footing details.</p>}

      {details.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Footing details</h4>
          {details.map((d) => (
            <div key={d.mark} className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5">
                <span className="text-xs font-semibold text-slate-600">{d.mark} — {Math.round(d.detail.B * 1000)}×{Math.round(d.detail.B * 1000)} · {Math.round(d.detail.H * 1000)} thk</span>
                <button type="button" onClick={() => download(`footing-detail-${d.mark}.svg`, d.svg)}
                  className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50">
                  ↓ SVG
                </button>
              </div>
              <RawSvg svg={d.svg} className="overflow-x-auto p-3" />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
