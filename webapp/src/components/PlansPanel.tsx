import { useMemo, useState, type JSX } from 'react'
import type { StructuralModel } from '../engine/model'
import type { StructureDesign } from '../engine/pipeline'
import { buildPlan, planToSvg } from '../engine/planRenderer'
import { buildFootingDetail } from '../engine/footingDetail'
import { buildColumnDetail } from '../engine/columnDetail'
import { buildBeamDetail } from '../engine/beamDetail'
import { buildSlabOpeningDetail } from '../engine/slabOpening'
import { buildWallCornerDetail, buildWallIntersectionDetail, buildWallJointDetail } from '../engine/wallDetail'
import { footingsForPlan, footingDetailBundles, columnDetailBundles, beamDetailBundles, slabOpeningBundles, wallDetailBundles, type SoilInput } from '../lib/planDetails'

const FLOOR_ORD = ['Ground', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth']
/** Framed-level ordinal (1 = first floor above the base) → floor name. */
function floorName(k: number): string { return `${FLOOR_ORD[k - 1] ?? `${k}th`} Floor` }

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

  // one framing plan per framed floor, named 'Ground/Second/… Floor Framing Plan'
  const framings = useMemo(() => {
    const ys = [...new Set(model.nodes.map((n) => Math.round(n.y * 100) / 100))].sort((a, b) => a - b)
    const floors = ys.slice(1)   // skip the base (foundation)
    const idxs = floors.length ? floors.map((_, i) => i + 1) : [1]
    return idxs.map((level, i) => {
      const name = floorName(level)
      const d = buildPlan(model, { kind: 'framing', level, detailNo: '1', sheetRef: `S-${2 + i}`, title: `${name} FRAMING PLAN`.toUpperCase() })
      if (!d) return null
      return { heading: `${name} framing plan`, file: `framing-${name.toLowerCase().replace(/\s+/g, '-')}.svg`, svg: planToSvg(d) }
    }).filter((x): x is { heading: string; file: string; svg: string } => x != null)
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

  // Typical column details — one per column TYPE. Every figure on these sheets
  // (lo, s_conf, s_out) was already computed by columnDesign and shown only as
  // a number in the schedule; this draws it.
  const colDetails = useMemo(() => {
    if (!design) return []
    return columnDetailBundles(model, design).map((b, i) => ({
      mark: b.mark,
      detail: b.detail,
      svg: planToSvg(buildColumnDetail(b.detail, { detailNo: String(i + 1), sheetRef: 'S-06' }), 900),
    }))
  }, [model, design])

  const beamDetails = useMemo(() => {
    if (!design) return []
    return beamDetailBundles(model, design).map((b, i) => ({
      mark: b.mark, detail: b.detail,
      svg: planToSvg(buildBeamDetail(b.detail, { detailNo: String(i + 1), sheetRef: 'S-07' }), 1100),
    }))
  }, [model, design])

  // Slab openings — one trimmer-bar sheet per opening cast through a designed
  // panel. Nothing shows when no panel has one, which is the usual case.
  const openingDetails = useMemo(() => {
    if (!design) return []
    return slabOpeningBundles(model, design).map((b, i) => {
      const d = buildSlabOpeningDetail(b.detail, { detailNo: String(i + 1), sheetRef: 'S-08' })
      return { mark: b.mark, detail: b.detail, result: d.result, svg: planToSvg(d, 1100) }
    })
  }, [model, design])

  // Wall standard details — corner, intersection and construction joint per
  // distinct wall type. Only shown when the model actually has shear walls.
  const wallDetails = useMemo(() => {
    if (!design) return []
    return wallDetailBundles(design).map((b, i) => {
      const sheets = [
        buildWallCornerDetail(b.detail, { detailNo: String(3 * i + 1), sheetRef: 'S-09' }),
        buildWallIntersectionDetail(b.detail, { detailNo: String(3 * i + 2), sheetRef: 'S-09' }),
        buildWallJointDetail(b.detail, { detailNo: String(3 * i + 3), sheetRef: 'S-09' }),
      ]
      return {
        mark: b.mark, detail: b.detail, result: sheets[0].result,
        sheets: sheets.map((d) => ({ title: d.title, svg: planToSvg(d, 1100) })),
      }
    })
  }, [design])

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

      {framings.map((f) => <Sheet key={f.file} title={f.heading} svg={f.svg} file={f.file} />)}
      {foundation
        ? <Sheet title="Foundation plan" svg={foundation} file="foundation-plan.svg" />
        : <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">Run the design to generate the foundation plan &amp; footing details.</p>}

      {beamDetails.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Typical beam details</h4>
          {beamDetails.map((d) => (
            <Sheet key={d.mark} title={`${d.mark} — ${d.detail.b}×${d.detail.h} · span ${d.detail.L.toFixed(2)} m`}
              svg={d.svg} file={`beam-detail-${d.mark}.svg`} />
          ))}
        </div>
      )}

      {openingDetails.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Slab opening details</h4>
          {openingDetails.map((d) => (
            <div key={d.mark} className="space-y-1">
              <Sheet
                title={`${d.mark} — ${Math.round((d.result.box.x1 - d.result.box.x0) * 1000)}×${Math.round((d.result.box.y1 - d.result.box.y0) * 1000)} opening · ${d.result.x.eachSide}-⌀${d.detail.barDia} + ${d.result.y.eachSide}-⌀${d.detail.barDia} ea. side`}
                svg={d.svg} file={`slab-opening-${d.mark.replace(/\//g, '-')}.svg`} />
              {!d.result.ok && (
                <ul className="space-y-0.5 px-1 text-[11px] leading-snug text-amber-700">
                  {d.result.notes.map((n) => <li key={n}>⚠ {n}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {wallDetails.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Wall standard details</h4>
          {wallDetails.map((w) => (
            <div key={w.mark} className="space-y-2">
              <p className="text-[11px] text-slate-500">
                {w.mark} — {Math.round(w.detail.t)} thk · {w.result.curtains} curtain{w.result.curtains > 1 ? 's' : ''} ·
                ⌀{w.detail.barDia} @ {Math.round(w.detail.spacing)} horiz / {Math.round(w.detail.vertSpacing ?? w.detail.spacing)} vert
              </p>
              {w.sheets.map((sh) => (
                <Sheet key={sh.title} title={sh.title} svg={sh.svg}
                  file={`${sh.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.svg`} />
              ))}
              {!w.result.ok && (
                <ul className="space-y-0.5 px-1 text-[11px] leading-snug text-amber-700">
                  {w.result.notes.map((n) => <li key={n}>⚠ {n}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {colDetails.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Typical column details</h4>
          {colDetails.map((d) => (
            <Sheet key={d.mark} title={`${d.mark} — ${d.detail.b}×${d.detail.h ?? d.detail.b} · ${d.detail.bars}-⌀${d.detail.barDia}`}
              svg={d.svg} file={`column-detail-${d.mark}.svg`} />
          ))}
        </div>
      )}

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
