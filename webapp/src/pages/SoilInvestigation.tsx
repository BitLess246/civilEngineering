import { useEffect, useMemo, useState } from 'react'
import { useInvestigation } from '../lib/useInvestigation'
import { useSoilsSync } from '../lib/useSoilsSync'
import { buildBoreholeLog } from '../engine/soils/logRenderer'
import { planToSvg } from '../engine/planRenderer'
import { validateInvestigation, type ValidationIssue } from '../engine/soils/validate'
import { sptProfile, type LayerUnitWeight } from '../engine/soils/sptProfile'
import type { StressLayer } from '../engine/soils/overburden'
import { classifyUSCS } from '../engine/soils/uscs'
import { densityFromN60, consistencyFromN60 } from '../engine/soils/spt'
import {
  layerThickness, recoveryRatio, soilFamily, isCohesive,
  type Borehole, type SoilLayer, type Sample, type LabTest, type LabTestType, type LabTestStatus,
  type LayerParameters, type CptReading,
} from '../engine/soils/model'
import {
  LAB_TESTS, labSpec, isImplemented, evaluateTest, summarise, readDirectShear,
  type LabOutcome,
} from '../engine/soils/lab'
import { classifySample } from '../engine/soils/classifySample'
import {
  shearEnvelopeChart, consolidationChart, gradingChart,
} from '../engine/soils/lab/plots'
import { buildSection, sectionDrawing } from '../engine/soils/section'
import {
  processSounding, sbtProfile, relativeDensity, frictionAngle, undrainedStrength,
} from '../engine/soils/cpt'
import { layerThickness as _lt } from '../engine/soils/model'
import { liquefactionProfile } from '../engine/soils/liquefaction'
import { liquefactionChart, skipText } from '../engine/soils/liquefactionPlot'
import { finesByLayer, finesMap } from '../engine/soils/finesContent'
import { seismicCoefficients, type SeismicZone, type SoilProfile } from '../engine/nscpSeismic'
import { resolveParameters, bearingInputs, PARAMETER_LABEL } from '../engine/soils/parameters'
import { describeProvenance, PROVENANCE_LABEL, type SourcedValue } from '../engine/soils/provenance'
import { cite } from '../engine/soils/standards'

const f2 = (n: number | undefined) => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(2))
const f1 = (n: number | undefined) => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(1))
const f0 = (n: number | undefined) => (n == null || !Number.isFinite(n) ? '—' : Math.round(n).toString())

function num(v: string, d = 0): number { const n = parseFloat(v); return Number.isFinite(n) ? n : d }

// ── Small shared bits ─────────────────────────────────────────────────────

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (!issues.length) {
    return (
      <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
        No integrity issues.
      </p>
    )
  }
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')
  return (
    <div className="space-y-1.5">
      {errors.map((i, k) => (
        <p key={`e${k}`} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          <strong className="font-semibold">Error</strong> — {i.message}
        </p>
      ))}
      {warnings.map((i, k) => (
        <p key={`w${k}`} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <strong className="font-semibold">Check</strong> — {i.message}
        </p>
      ))}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-0.5 font-mono text-[15px] font-semibold text-slate-800">{value}</p>
      {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
    </div>
  )
}

// ── Borehole log ──────────────────────────────────────────────────────────

function LogView({ bh }: { bh: Borehole }) {
  // The drawing is pure geometry (engine/soils/logRenderer) serialised by the
  // same planToSvg the structural drawings use — no painting code here.
  const svg = useMemo(() => planToSvg(buildBoreholeLog(bh), 640), [bh])
  return <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
}

// ── Layer editor ──────────────────────────────────────────────────────────

function LayerRow({
  layer, onChange, onRemove,
}: { layer: SoilLayer; onChange: (patch: Partial<SoilLayer>) => void; onRemove: () => void }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="py-0.5 pr-2">
        <input type="number" step="0.1" value={layer.depthTop}
          onChange={(e) => onChange({ depthTop: num(e.target.value) })}
          className="w-16 rounded border border-slate-200 px-1 py-0.5 text-right font-mono" />
      </td>
      <td className="py-0.5 pr-2">
        <input type="number" step="0.1" value={layer.depthBottom}
          onChange={(e) => onChange({ depthBottom: num(e.target.value) })}
          className="w-16 rounded border border-slate-200 px-1 py-0.5 text-right font-mono" />
      </td>
      <td className="py-0.5 pr-2 text-right font-mono text-slate-500">{f2(layerThickness(layer))}</td>
      <td className="py-0.5 pr-2">
        <input value={layer.symbol ?? ''} placeholder="—"
          onChange={(e) => onChange({ symbol: e.target.value.toUpperCase() || undefined })}
          className="w-16 rounded border border-slate-200 px-1 py-0.5 font-mono uppercase" />
      </td>
      <td className="py-0.5 pr-2">
        <input value={layer.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="w-full min-w-[8rem] rounded border border-slate-200 px-1 py-0.5" />
      </td>
      <td className="py-0.5 pr-2">
        <input value={layer.description ?? ''}
          onChange={(e) => onChange({ description: e.target.value || undefined })}
          className="w-full min-w-[12rem] rounded border border-slate-200 px-1 py-0.5" />
      </td>
      <td className="py-0.5 text-right">
        <button onClick={onRemove} className="rounded px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50">
          remove
        </button>
      </td>
    </tr>
  )
}

/**
 * Descriptive term for a corrected blow count. Cohesive soils take a
 * CONSISTENCY (soft/firm/stiff), granular ones a DENSITY (loose/dense) — they
 * are different scales, and using the wrong one turns an N of 6 in a silty sand
 * into "firm" when it is "loose". The family comes from `soilFamily`, which the
 * log renderer also uses, so the drawing and the table cannot disagree.
 */
function describeN60(n60: number, layer: SoilLayer | undefined): string {
  if (!layer) return densityFromN60(n60)
  return isCohesive(soilFamily(layer.symbol, layer.name))
    ? consistencyFromN60(n60)
    : densityFromN60(n60)
}

// ── Page ──────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'boreholes' | 'profile' | 'spt' | 'cpt' | 'lab' | 'liquefaction' | 'classification' | 'parameters'

export default function SoilInvestigation() {
  const api = useInvestigation()
  const { investigation: inv } = api
  const [tab, setTab] = useState<Tab>('overview')
  const [holeIdx, setHoleIdx] = useState(0)
  // Design earthquake, shared between the liquefaction tab and the report.
  // Undefined until the engineer enters one — the report then states that
  // liquefaction was not assessed instead of inventing a ground motion.
  const [reportSeismic, setReportSeismic] = useState<{ amax: number; magnitude: number } | undefined>(undefined)
  const [importError, setImportError] = useState<string | null>(null)

  const issues = useMemo(() => (inv ? validateInvestigation(inv) : []), [inv])
  const bh: Borehole | undefined = inv?.boreholes[holeIdx]

  // Unit weights are stored on the investigation as ASSUMED values with a
  // rationale, not held in page state. They are an interpretation, which is
  // exactly what `assumed` provenance is for — and storing them is what lets
  // the analysis pages read a layer through SoilLayerPicker without the number
  // arriving from nowhere.
  const unitWeights: Record<string, LayerUnitWeight> = useMemo(() => {
    const out: Record<string, LayerUnitWeight> = {}
    for (const p of inv?.parameters ?? []) {
      const g = p.unitWeight?.value
      if (g != null) out[p.layerId] = { gamma: g, gammaSat: p.saturatedUnitWeight?.value }
    }
    return out
  }, [inv])

  const setUnitWeight = (layerId: string, key: 'gamma' | 'gammaSat', value: number) => api.update((d) => {
    const bhId = d.boreholes[holeIdx]?.id
    if (!bhId) return
    let entry = d.parameters.find((p) => p.layerId === layerId)
    if (!entry) {
      entry = { layerId, boreholeId: bhId }
      d.parameters.push(entry)
    }
    const field = key === 'gamma' ? 'unitWeight' : 'saturatedUnitWeight'
    entry[field] = {
      value, unit: 'kN/m³',
      provenance: {
        kind: 'assumed',
        rationale: key === 'gamma'
          ? 'Bulk unit weight entered by the engineer for the effective-stress profile.'
          : 'Saturated unit weight entered by the engineer for the effective-stress profile.',
      },
    }
  })

  const profile = useMemo(
    () => (bh ? sptProfile(bh, unitWeights) : null),
    [bh, unitWeights],
  )

  if (!inv) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Geotechnical</p>
        <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Soil investigation</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter a site investigation once — boreholes, strata, samples and field tests — and reuse it across the
          bearing-capacity, settlement, slope and pile calculators instead of retyping soil properties on each.
        </p>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-[1.05rem] font-bold text-[#0056b3]">Start</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => api.newInvestigation()}
              className="rounded-md bg-[#0056b3] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#004a99]">
              New investigation
            </button>
            <button onClick={api.loadSample}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Load the example
            </button>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Investigations are stored in this browser only. Export the JSON to keep a copy — it is the backup, not a
            convenience.
          </p>
        </section>
      </main>
    )
  }

  const set = api.update

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Geotechnical</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">
        {inv.meta.title || 'Untitled investigation'}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {inv.meta.investigationNo || 'no reference'} · {inv.meta.site.projectName || 'no project name'}
        {inv.meta.site.location ? ` · ${inv.meta.site.location}` : ''}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={() => api.newInvestigation()}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
          New
        </button>
        <button onClick={api.loadSample}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
          Load example
        </button>
        <button
          onClick={() => {
            const blob = new Blob([api.exportJSON()], { type: 'application/json' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `${inv.meta.investigationNo || 'investigation'}.json`
            a.click()
            URL.revokeObjectURL(a.href)
          }}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
          Export JSON
        </button>
        <button
          onClick={async () => {
            if (!inv) return
            const { buildSoilsReport } = await import('../engine/soils/report')
            const { downloadSoilsReport } = await import('../lib/soilsPdf')
            downloadSoilsReport(buildSoilsReport(inv, {
              // The liquefaction section is only run when a design earthquake
              // has been entered on its tab; otherwise the report says so
              // rather than assuming one.
              seismic: reportSeismic,
              preparedBy: inv.meta.engineer,
            }))
          }}
          className="rounded-md bg-[#0056b3] px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-[#004a99]">
          Report PDF
        </button>
        <label className="cursor-pointer rounded-md border border-slate-300 px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
          Import JSON
          <input type="file" accept="application/json" className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setImportError(null)
              try { api.importJSON(await file.text()) }
              catch (err) { setImportError(err instanceof Error ? err.message : String(err)) }
              e.target.value = ''
            }} />
        </label>
        {api.investigations.length > 1 && (
          <select value={api.activeId ?? ''} onChange={(e) => api.open(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-[12px]">
            {api.investigations.map((s) => (
              <option key={s.id} value={s.id}>{s.investigationNo || s.title}</option>
            ))}
          </select>
        )}
      </div>

      {importError && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          {importError}
        </p>
      )}

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-slate-200">
        {(['overview', 'boreholes', 'profile', 'spt', 'cpt', 'lab', 'liquefaction', 'parameters', 'classification'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-t-md px-3 py-1.5 text-[13px] font-medium capitalize ${
              tab === t ? 'border-b-2 border-[#0056b3] text-[#0056b3]' : 'text-slate-600 hover:text-slate-900'
            }`}>
            {t === 'spt' ? 'SPT' : t === 'cpt' ? 'CPT' : t === 'lab' ? 'Laboratory' : t}
          </button>
        ))}
      </nav>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <section className="mt-5 space-y-5">
          <SyncPanel />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Boreholes" value={String(inv.boreholes.length)} />
            <Stat label="Samples" value={String(inv.boreholes.reduce((n, b) => n + b.samples.length, 0))} />
            <Stat label="SPT tests" value={String(inv.boreholes.reduce((n, b) => n + b.spt.length, 0))} />
            <Stat label="Lab tests"
              value={String(inv.boreholes.reduce((n, b) => n + b.samples.reduce((m, s) => m + s.tests.length, 0), 0))} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Investigation</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                ['Reference', inv.meta.investigationNo, (v: string) => set((d) => { d.meta.investigationNo = v })],
                ['Title', inv.meta.title, (v: string) => set((d) => { d.meta.title = v })],
                ['Project', inv.meta.site.projectName, (v: string) => set((d) => { d.meta.site.projectName = v })],
                ['Client', inv.meta.site.client ?? '', (v: string) => set((d) => { d.meta.site.client = v })],
                ['Location', inv.meta.site.location ?? '', (v: string) => set((d) => { d.meta.site.location = v })],
                ['Engineer', inv.meta.engineer ?? '', (v: string) => set((d) => { d.meta.engineer = v })],
              ] as [string, string, (v: string) => void][]).map(([label, value, onChange]) => (
                <label key={label} className="flex flex-col text-sm">
                  <span className="mb-1 font-medium text-slate-600">{label}</span>
                  <input value={value} onChange={(e) => onChange(e.target.value)}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5" />
                </label>
              ))}
              <label className="flex flex-col text-sm">
                <span className="mb-1 font-medium text-slate-600">Status</span>
                <select value={inv.meta.status}
                  onChange={(e) => set((d) => { d.meta.status = e.target.value as typeof d.meta.status })}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5">
                  {['draft', 'fieldwork', 'laboratory', 'analysis', 'review', 'completed'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Data integrity</h2>
            <IssueList issues={issues} />
            <p className="mt-3 text-[11px] text-slate-500">
              Errors are the physically impossible — overlapping layers, groundwater below the hole, a plastic limit
              above the liquid limit. Warnings are the merely unusual, which is often perfectly real. Nothing here is
              repaired automatically: an unlogged interval may be a logging error or an unrecovered run, and only
              whoever was on the rig knows which.
            </p>
          </div>
        </section>
      )}

      {/* ── Boreholes ── */}
      {tab === 'boreholes' && (
        <section className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {inv.boreholes.map((b, i) => (
              <button key={b.id} onClick={() => setHoleIdx(i)}
                className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
                  i === holeIdx ? 'bg-[#0056b3] text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}>
                {b.name}
              </button>
            ))}
            <button
              onClick={() => {
                const n = inv.boreholes.length + 1
                set((d) => {
                  d.boreholes.push({
                    id: `bh_${Date.now().toString(36)}`,
                    name: `BH-${String(n).padStart(2, '0')}`,
                    kind: 'borehole', actualDepth: 10,
                    layers: [], samples: [], spt: [],
                  })
                })
                setHoleIdx(inv.boreholes.length)
              }}
              className="rounded-md border border-dashed border-slate-300 px-2.5 py-1 text-[12px] text-slate-600 hover:bg-slate-50">
              + borehole
            </button>
          </div>

          {bh && (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">{bh.name}</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {([
                    ['Name', bh.name, 'text', (v: string) => set((d) => { d.boreholes[holeIdx].name = v })],
                    ['Ground elevation (m)', bh.groundElevation ?? '', 'number',
                      (v: string) => set((d) => { d.boreholes[holeIdx].groundElevation = v === '' ? undefined : num(v) })],
                    ['Depth (m)', bh.actualDepth, 'number',
                      (v: string) => set((d) => { d.boreholes[holeIdx].actualDepth = num(v) })],
                    ['Diameter (mm)', bh.diameter ?? '', 'number',
                      (v: string) => set((d) => { d.boreholes[holeIdx].diameter = v === '' ? undefined : num(v) })],
                    ['Groundwater (m)', bh.groundwaterDepth ?? '', 'number',
                      (v: string) => set((d) => { d.boreholes[holeIdx].groundwaterDepth = v === '' ? undefined : num(v) })],
                  ] as [string, string | number, string, (v: string) => void][]).map(([label, value, type, onChange]) => (
                    <label key={label} className="flex flex-col text-sm">
                      <span className="mb-1 font-medium text-slate-600">{label}</span>
                      <input type={type} step="any" value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="rounded-md border border-slate-300 px-2.5 py-1.5" />
                    </label>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-slate-500">
                  Leave groundwater blank when it was not encountered — the log then says so rather than drawing a
                  table at an assumed depth.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Borehole log</h2>
                <LogView bh={bh} />
                <p className="mt-2 text-[11px] text-slate-500">
                  Strata hatching follows the USCS group symbol where one has been entered, otherwise the description —
                  in which the noun governs, so &ldquo;Silty Sand&rdquo; is drawn as a sand. A refusal blow count is
                  marked with an asterisk so it cannot be read as a measurement.
                </p>
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Soil profile ── */}
      {tab === 'profile' && bh && (
        <section className="mt-5 space-y-4">
          <SectionPanel boreholes={inv.boreholes} />
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[1.05rem] font-bold text-[#0056b3]">{bh.name} — stratigraphy</h2>
              <button
                onClick={() => set((d) => {
                  const layers = d.boreholes[holeIdx].layers
                  const top = layers.length ? layers[layers.length - 1].depthBottom : 0
                  layers.push({
                    id: `l_${Date.now().toString(36)}`,
                    depthTop: top, depthBottom: top + 1, name: 'New layer',
                  })
                })}
                className="rounded-md border border-dashed border-slate-300 px-2.5 py-1 text-[12px] text-slate-600 hover:bg-slate-50">
                + layer
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="py-1 pr-2">Top (m)</th><th className="py-1 pr-2">Base (m)</th>
                    <th className="py-1 pr-2 text-right">Thk</th><th className="py-1 pr-2">USCS</th>
                    <th className="py-1 pr-2">Name</th><th className="py-1 pr-2">Description</th><th />
                  </tr>
                </thead>
                <tbody>
                  {bh.layers.map((l, i) => (
                    <LayerRow key={l.id} layer={l}
                      onChange={(patch) => set((d) => {
                        Object.assign(d.boreholes[holeIdx].layers[i], patch)
                      })}
                      onRemove={() => set((d) => { d.boreholes[holeIdx].layers.splice(i, 1) })} />
                  ))}
                </tbody>
              </table>
            </div>
            {!bh.layers.length && (
              <p className="mt-3 text-[12px] text-slate-500">No layers logged yet.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-[1.05rem] font-bold text-[#0056b3]">Samples</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="py-1 pr-3">Sample</th><th className="py-1 pr-3">Type</th>
                    <th className="py-1 pr-3">Depth (m)</th><th className="py-1 pr-3 text-right">Recovery</th>
                    <th className="py-1 pr-3">Tests</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {bh.samples.map((s) => (
                    <tr key={s.id} className="border-b border-slate-100">
                      <td className="py-0.5 pr-3">{s.name}</td>
                      <td className="py-0.5 pr-3">{s.type}</td>
                      <td className="py-0.5 pr-3">{f2(s.depthTop)}–{f2(s.depthBottom)}</td>
                      <td className="py-0.5 pr-3 text-right">
                        {recoveryRatio(s) == null ? '—' : `${f0(recoveryRatio(s))} %`}
                      </td>
                      <td className="py-0.5 pr-3 font-sans">
                        {s.tests.length
                          ? s.tests.map((t) => `${t.type}${t.status === 'complete' ? '' : ` (${t.status})`}`).join(', ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!bh.samples.length && <p className="mt-3 text-[12px] text-slate-500">No samples recorded.</p>}
          </div>
        </section>
      )}

      {/* ── SPT ── */}
      {tab === 'spt' && bh && profile && (
        <section className="mt-5 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Unit weights for the stress profile</h2>
            <p className="mb-3 text-[11px] text-slate-500">
              (N₁)₆₀ needs the effective stress at each test depth, which needs a unit weight per layer. These are an
              interpretation, so they are stored as ASSUMED values with that stated on them — which is also what
              lets the bearing-capacity and slope pages read this layer without the number arriving from nowhere.
              Layers left blank stop the stress profile at that depth; the blow counts below are still corrected for
              equipment, just not for overburden.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="py-1 pr-3">Layer</th><th className="py-1 pr-3">γ (kN/m³)</th>
                    <th className="py-1 pr-3">γsat (kN/m³)</th>
                  </tr>
                </thead>
                <tbody>
                  {bh.layers.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100">
                      <td className="py-0.5 pr-3">{l.name}</td>
                      <td className="py-0.5 pr-3">
                        <input type="number" step="0.5" value={unitWeights[l.id]?.gamma ?? ''}
                          onChange={(e) => setUnitWeight(l.id, 'gamma', num(e.target.value))}
                          className="w-20 rounded border border-slate-200 px-1 py-0.5 text-right font-mono" />
                      </td>
                      <td className="py-0.5 pr-3">
                        <input type="number" step="0.5" value={unitWeights[l.id]?.gammaSat ?? ''}
                          onChange={(e) => setUnitWeight(l.id, 'gammaSat', num(e.target.value))}
                          className="w-20 rounded border border-slate-200 px-1 py-0.5 text-right font-mono" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Corrected blow counts</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-[12px]">
                <thead className="text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="py-1 pr-3 text-left">Depth (m)</th><th className="py-1 pr-3 text-left">Layer</th>
                    <th className="py-1 pr-3">N</th><th className="py-1 pr-3">C_R</th>
                    <th className="py-1 pr-3">N₆₀</th><th className="py-1 pr-3">σ′ᵥ₀</th>
                    <th className="py-1 pr-3">C_N</th><th className="py-1 pr-3">(N₁)₆₀</th>
                    <th className="py-1 pr-3 text-left">Description</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {profile.rows.map((r) => (
                    <tr key={r.testId} className={`border-b border-slate-100 ${r.refusal ? 'bg-amber-50' : ''}`}>
                      <td className="py-0.5 pr-3 text-left">{f2(r.depth)}</td>
                      <td className="py-0.5 pr-3 text-left font-sans">{r.layerName ?? '—'}</td>
                      <td className="py-0.5 pr-3">{r.N}{r.refusal ? '*' : ''}</td>
                      <td className="py-0.5 pr-3">{f2(r.cr)}</td>
                      <td className="py-0.5 pr-3 font-semibold">{f1(r.n60)}</td>
                      <td className="py-0.5 pr-3">{f0(r.effectiveStress)}</td>
                      <td className="py-0.5 pr-3">{f2(r.cn)}</td>
                      <td className="py-0.5 pr-3 font-semibold">{f1(r.n160)}</td>
                      <td className="py-0.5 pr-3 text-left font-sans text-slate-600">
                        {r.refusal
                          ? 'refusal'
                          : describeN60(r.n60, bh.layers.find((l) => l.id === r.layerId))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!profile.rows.length && <p className="mt-3 text-[12px] text-slate-500">No SPT results recorded.</p>}
            {profile.notes.map((n, k) => (
              <p key={k} className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                {n}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* ── Classification ── */}
      {tab === 'lab' && bh && (
        <section className="mt-5">
          <LabPanel
            bh={bh}
            onAdd={(sampleId, type) => set((d) => {
              const spec = labSpec(type)!
              const sample = d.boreholes[holeIdx].samples.find((x) => x.id === sampleId)
              sample?.tests.push({
                id: `t_${Date.now().toString(36)}`,
                type, standard: spec.standard,
                status: isImplemented(type) ? 'in-progress' : 'planned',
              })
            })}
            onRows={(sampleId, testId, rows) => set((d) => {
              const t = d.boreholes[holeIdx].samples
                .find((x) => x.id === sampleId)?.tests.find((x) => x.id === testId)
              if (t) t.data = { ...t.data, readings: rows }
            })}
            onPoints={(sampleId, testId, rows) => set((d) => {
              const t = d.boreholes[holeIdx].samples
                .find((x) => x.id === sampleId)?.tests.find((x) => x.id === testId)
              if (t) t.data = { ...t.data, points: rows }
            })}
            onChoice={(sampleId, testId, key, value) => set((d) => {
              const t = d.boreholes[holeIdx].samples
                .find((x) => x.id === sampleId)?.tests.find((x) => x.id === testId)
              if (t) t.data = { ...t.data, [key]: value }
            })}
            onApplySymbol={(layerId, symbol) => set((d) => {
              const l = d.boreholes[holeIdx].layers.find((x) => x.id === layerId)
              if (l) l.symbol = symbol
            })}
            onData={(sampleId, testId, key, value) => set((d) => {
              const t = d.boreholes[holeIdx].samples
                .find((x) => x.id === sampleId)?.tests.find((x) => x.id === testId)
              if (!t) return
              t.data = { ...t.data, [key]: value }
            })}
            onStatus={(sampleId, testId, status) => set((d) => {
              const t = d.boreholes[holeIdx].samples
                .find((x) => x.id === sampleId)?.tests.find((x) => x.id === testId)
              if (t) t.status = status
            })}
            onRemove={(sampleId, testId) => set((d) => {
              const sample = d.boreholes[holeIdx].samples.find((x) => x.id === sampleId)
              if (!sample) return
              sample.tests = sample.tests.filter((x) => x.id !== testId)
            })}
          />
        </section>
      )}

      {tab === 'parameters' && bh && (
        <section className="mt-5">
          <ParametersPanel bh={bh} unitWeights={unitWeights} stored={inv.parameters} />
        </section>
      )}

      {tab === 'cpt' && bh && (
        <section className="mt-5">
          <CptPanel bh={bh} unitWeights={unitWeights} onChange={(rows) => api.update((d) => {
            const target = d.boreholes[holeIdx]
            if (target) target.cpt = rows
          })} />
        </section>
      )}

      {tab === 'liquefaction' && bh && (
        <section className="mt-5">
          <LiquefactionPanel bh={bh} unitWeights={unitWeights} onSeismic={setReportSeismic} />
        </section>
      )}

      {tab === 'classification' && (
        <section className="mt-5">
          <ClassificationPanel />
        </section>
      )}

    </main>
  )
}

// ── Sync ──────────────────────────────────────────────────────────────────
// Manual, never automatic. Two-sided edits are reported as conflicts and
// resolved by keeping ONE SIDE WHOLE — there is no field-by-field merge,
// because deciding which of two blow counts is right is an engineer's call.

function SyncPanel() {
  const s = useSoilsSync()
  const [open, setOpen] = useState(false)

  const badge =
    s.availability.kind === 'ready' ? { text: 'signed in', cls: 'bg-emerald-100 text-emerald-800' }
      : s.availability.kind === 'signed-out' ? { text: 'signed out', cls: 'bg-amber-100 text-amber-900' }
      : { text: 'not configured', cls: 'bg-slate-200 text-slate-700' }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[1.05rem] font-bold text-[#0056b3]">
            Cloud backup
            <span className={`ml-2 rounded px-1.5 py-0.5 align-middle text-[10px] font-semibold ${badge.cls}`}>
              {badge.text}
            </span>
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Investigations live in THIS BROWSER until you sync. Nothing syncs on a timer or on save — moving data
            between machines is a decision, not something that happens while you type.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setOpen(true); void s.check() }} disabled={s.busy || s.availability.kind === 'not-configured'}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            Check connection
          </button>
          <button onClick={() => { setOpen(true); void s.sync() }} disabled={s.busy || s.availability.kind !== 'ready'}
            className="rounded-md bg-[#0056b3] px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-[#004a99] disabled:opacity-40">
            {s.busy ? 'Working…' : 'Sync now'}
          </button>
        </div>
      </div>

      {s.availability.kind === 'not-configured' && (
        <p className="mt-2 text-[11px] text-slate-600">
          Cloud storage is not configured for this deployment, so everything stays local. Export JSON is the backup.
        </p>
      )}
      {s.availability.kind === 'signed-out' && (
        <p className="mt-2 text-[11px] text-amber-800">
          Sign in to sync. The connection check still runs signed out, but it can only verify the schema and the
          security policies — not a real save.
        </p>
      )}

      {s.error && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[12px] text-red-800">{s.error}</p>
      )}

      {open && s.diagnostics && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-1.5 text-[11px] font-semibold text-slate-700">
            Connection check {s.diagnostics.ok ? '— all clear' : '— PROBLEMS FOUND'}
          </p>
          <ul className="space-y-1">
            {s.diagnostics.results.map((r) => (
              <li key={r.name} className="flex items-baseline gap-2 text-[11px]">
                <span className={`rounded px-1 text-[9px] font-bold ${
                  r.status === 'pass' ? 'bg-emerald-100 text-emerald-800'
                    : r.status === 'fail' ? 'bg-red-100 text-red-800' : 'bg-slate-200 text-slate-600'
                }`}>{r.status.toUpperCase()}</span>
                <span className="font-medium text-slate-700">{r.name}</span>
                <span className="text-slate-600">{r.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open && s.report && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-slate-700">Last sync</p>
          <ul className="mt-1 space-y-0.5 text-[11px]">
            {s.report.outcomes.map((o) => (
              <li key={`${o.kind}-${o.id}`} className="text-slate-600">
                <span className="font-mono">{o.id}</span> — {o.kind === 'failed' ? `failed: ${o.error}` : o.kind}
              </li>
            ))}
            {!s.report.outcomes.length && <li className="text-slate-500">Nothing to sync.</li>}
          </ul>

          {s.report.conflicts.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-[12px] font-bold text-amber-900">
                {s.report.conflicts.length} conflict{s.report.conflicts.length === 1 ? '' : 's'} — nothing was changed
              </p>
              <p className="mt-0.5 text-[11px] text-amber-900">
                These were edited in both places. Choose which version to keep; the other is discarded, so export
                first if you are not sure. There is no automatic merge — deciding which of two readings is right is
                yours to make.
              </p>
              {s.report.conflicts.map((c) => (
                <div key={c.id} className="mt-2 rounded border border-amber-200 bg-white p-2">
                  <p className="font-mono text-[11px] font-semibold text-slate-800">
                    {c.local.meta.investigationNo || c.id}
                  </p>
                  <p className="text-[10px] text-slate-600">
                    This browser: {c.local.boreholes.length} hole(s) · Server: {c.remote.investigation.boreholes.length} hole(s),
                    saved {new Date(c.remote.updatedAt).toLocaleString()}
                  </p>
                  <div className="mt-1 flex gap-2">
                    <button onClick={() => void s.resolve(c.id, 'local')} disabled={s.busy}
                      className="rounded border border-slate-300 px-2 py-0.5 text-[11px] hover:bg-slate-50 disabled:opacity-40">
                      Keep this browser&apos;s
                    </button>
                    <button onClick={() => void s.resolve(c.id, 'remote')} disabled={s.busy}
                      className="rounded border border-slate-300 px-2 py-0.5 text-[11px] hover:bg-slate-50 disabled:opacity-40">
                      Keep the server&apos;s
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── CPT ───────────────────────────────────────────────────────────────────
// A cone takes NO SAMPLE, so everything here is behaviour inferred from
// resistance. The table says "behaviour" and never prints a USCS symbol.

function CptPanel({ bh, unitWeights, onChange }: {
  bh: Borehole
  unitWeights: Record<string, LayerUnitWeight>
  onChange: (rows: CptReading[]) => void
}) {
  // Memoised so the `?? []` fallback does not hand the memos below a new array
  // identity on every render.
  const rows = useMemo(() => bh.cpt ?? [], [bh.cpt])
  const [nkt, setNkt] = useState(15)

  const layers = useMemo(() => {
    const ordered = [...bh.layers].sort((a, b) => a.depthTop - b.depthTop)
    const out: StressLayer[] = []
    for (const l of ordered) {
      const uw = unitWeights[l.id]
      if (!uw) break
      out.push({ thickness: _lt(l), gamma: uw.gamma, gammaSat: uw.gammaSat })
    }
    // With no logged strata a cone sounding still needs a stress profile, so
    // fall back to a single column of whatever the first layer weighs — and the
    // engine's own note about assumptions still applies.
    return out
  }, [bh.layers, unitWeights])

  const sounding = useMemo(
    () => processSounding(rows, layers, bh.groundwaterDepth, { nkt }),
    [rows, layers, bh.groundwaterDepth, nkt],
  )
  const zones = useMemo(() => sbtProfile(sounding), [sounding])

  const patch = (i: number, key: keyof CptReading, v: number | undefined) => {
    const next = rows.map((r, k) => (k === i ? { ...r, [key]: v } : r))
    onChange(next)
  }

  if (!layers.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-[1.05rem] font-bold text-[#0056b3]">Cone penetration test</h2>
        <p className="text-[12px] text-amber-800">
          Every normalised cone quantity needs the effective stress at the reading depth, which needs a logged
          layer with a unit weight. Log the strata and enter unit weights on the SPT tab first — nothing here is
          computed from an assumed profile.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[1.05rem] font-bold text-[#0056b3]">Cone penetration test</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {cite('d5778')}. A cone recovers NO SAMPLE, so the classification below is a soil BEHAVIOUR type —
              a clayey sand and a sandy clay can plot in the same zone, and only a sample settles it.
            </p>
          </div>
          <label className="flex flex-col text-[11px]">
            <span className="mb-0.5 text-slate-600">N<sub>kt</sub> for s<sub>u</sub></span>
            <input type="number" step="1" value={nkt} onChange={(e) => setNkt(num(e.target.value, 15))}
              className="w-20 rounded border border-slate-300 px-1.5 py-1 text-right font-mono" />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-[12px]">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-1 pr-2 text-left">Depth (m)</th>
                <th className="py-1 pr-2">q<sub>c</sub> (MPa)</th>
                <th className="py-1 pr-2">f<sub>s</sub> (kPa)</th>
                <th className="py-1 pr-2">u₂ (kPa)</th>
                <th className="py-1 pr-2">q<sub>t</sub></th>
                <th className="py-1 pr-2">I<sub>c</sub></th>
                <th className="py-1 pr-3 text-left">Behaviour</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const out = sounding.rows[i]
                return (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-0.5 pr-2">
                      <input type="number" step="0.25" value={r.depth}
                        onChange={(e) => patch(i, 'depth', num(e.target.value))}
                        className="w-20 rounded border border-slate-200 px-1 py-0.5 text-right font-mono" />
                    </td>
                    <td className="py-0.5 pr-2">
                      <input type="number" step="0.1" value={r.qc}
                        onChange={(e) => patch(i, 'qc', num(e.target.value))}
                        className="w-20 rounded border border-slate-200 px-1 py-0.5 text-right font-mono" />
                    </td>
                    <td className="py-0.5 pr-2">
                      <input type="number" step="1" value={r.fs}
                        onChange={(e) => patch(i, 'fs', num(e.target.value))}
                        className="w-20 rounded border border-slate-200 px-1 py-0.5 text-right font-mono" />
                    </td>
                    <td className="py-0.5 pr-2">
                      <input type="number" step="1" value={r.u2 ?? ''} placeholder="—"
                        onChange={(e) => patch(i, 'u2', e.target.value === '' ? undefined : num(e.target.value))}
                        className="w-20 rounded border border-slate-200 px-1 py-0.5 text-right font-mono" />
                    </td>
                    <td className="py-0.5 pr-2 font-mono text-slate-600">
                      {out ? f2(out.qt) : '—'}{out && !out.corrected ? '*' : ''}
                    </td>
                    <td className="py-0.5 pr-2 font-mono font-semibold">
                      {out?.normalised ? f2(out.normalised.ic) : '—'}
                    </td>
                    <td className="py-0.5 pr-3 text-left">{out?.sbt?.label ?? out?.skipped ?? '—'}</td>
                    <td className="py-0.5">
                      <button onClick={() => onChange(rows.filter((_, k) => k !== i))}
                        className="rounded px-1 text-[10px] text-red-600 hover:bg-red-50">×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button
          onClick={() => onChange([...rows, { depth: rows.length ? rows[rows.length - 1].depth + 0.5 : 1, qc: 5, fs: 50 }])}
          className="mt-1 rounded border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50">
          + reading
        </button>
        {sounding.rows.some((r) => !r.corrected) && (
          <p className="mt-1 text-[10px] text-slate-500">* q<sub>t</sub> could not be corrected — no u₂ at that depth.</p>
        )}

        {sounding.notes.map((n, k) => (
          <p key={k} className="mt-2 text-[11px] text-amber-900">{n}</p>
        ))}
      </div>

      {zones.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-[1.05rem] font-bold text-[#0056b3]">Behaviour over the sounding</h2>
          <ul className="space-y-0.5 text-[12px]">
            {zones.map((z) => (
              <li key={z.zone} className="flex items-baseline gap-2">
                <span className="font-mono text-slate-500">zone {z.zone}</span>
                <span className="text-slate-800">{z.label}</span>
                <span className="font-mono text-slate-600">{(z.fraction * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sounding.rows.some((r) => r.normalised) && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-[1.05rem] font-bold text-[#0056b3]">Correlations</h2>
          <p className="mb-2 text-[11px] text-slate-500">
            Each is refused outside the soil it applies to, with the reason — the same rule the SPT correlations follow.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="py-1 pr-3">Depth</th><th className="py-1 pr-3">D<sub>r</sub></th>
                  <th className="py-1 pr-3">φ′</th><th className="py-1 pr-3">s<sub>u</sub></th>
                </tr>
              </thead>
              <tbody>
                {sounding.rows.filter((r) => r.normalised).map((r) => {
                  const dr = relativeDensity(r.normalised!)
                  const phi = frictionAngle(r.normalised!)
                  const su = undrainedStrength(r.normalised!, r.totalStress, nkt)
                  const cell = (c: { value?: number; unit: string; refusal?: string }) =>
                    c.value != null
                      ? <span className="font-mono">{f1(c.value)} {c.unit}</span>
                      : <span className="text-[10px] text-slate-500">{c.refusal}</span>
                  return (
                    <tr key={r.depth} className="border-b border-slate-100 align-top">
                      <td className="py-0.5 pr-3 font-mono">{f2(r.depth)}</td>
                      <td className="py-0.5 pr-3">{cell(dr)}</td>
                      <td className="py-0.5 pr-3">{cell(phi)}</td>
                      <td className="py-0.5 pr-3">{cell(su)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Correlated section ────────────────────────────────────────────────────
// The one drawing in this module that is an INTERPRETATION rather than a
// record, so the caption says which parts are measured before the reader
// scrolls to it.

function SectionPanel({ boreholes }: { boreholes: Borehole[] }) {
  const section = useMemo(() => buildSection(boreholes), [boreholes])
  const svg = useMemo(
    () => (section.holes.length > 1 ? planToSvg(sectionDrawing(section), 720) : null),
    [section],
  )
  if (!svg) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-[1.05rem] font-bold text-[#0056b3]">Correlated section</h2>
        <p className="text-[12px] text-slate-600">
          A section needs at least two boreholes. With one there is nothing to correlate.
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-[1.05rem] font-bold text-[#0056b3]">Correlated section</h2>
      <p className="mb-3 text-[11px] text-slate-500">
        Only the vertical hole traces are measured. Every boundary between holes is inferred and is drawn
        dashed to say so — this is the most over-read drawing in a geotechnical report, and it is an
        interpretation, not a record. Layers are correlated by USCS symbol or name, never by their position
        in the sequence.
      </p>
      <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
      {section.notes.map((n, k) => (
        <p key={k} className="mt-2 text-[11px] text-amber-900">{n}</p>
      ))}
    </div>
  )
}

// ── Liquefaction ──────────────────────────────────────────────────────────
// The NCEER triggering check run down the hole, with the FS profile drawn.
//
// The seismic input is ENTERED, not inferred. a_max is a surface peak ground
// acceleration and the honest sources for it are a hazard study or a site
// response analysis; NSCP's Ca is offered as a screening stand-in with that
// said plainly, because quietly substituting a design coefficient for a PGA is
// the kind of shortcut that is invisible in the output.

function LiquefactionPanel({ bh, unitWeights, onSeismic }: {
  bh: Borehole; unitWeights: Record<string, LayerUnitWeight>
  onSeismic?: (s: { amax: number; magnitude: number }) => void
}) {
  const [amax, setAmax] = useState(0.4)
  const [magnitude, setMagnitude] = useState(7.5)
  const [zone, setZone] = useState<SeismicZone>(4)
  const [soil, setSoil] = useState<SoilProfile>('SD')

  const fines = useMemo(() => finesByLayer(bh), [bh])
  const profile = useMemo(
    () => liquefactionProfile(bh, unitWeights, { amax, magnitude, finesContent: finesMap(fines) }),
    [bh, unitWeights, amax, magnitude, fines],
  )
  const svg = useMemo(
    () => planToSvg(liquefactionChart(profile, { waterTable: bh.groundwaterDepth, holeDepth: bh.actualDepth }), 560),
    [profile, bh],
  )
  const ca = useMemo(() => seismicCoefficients(zone, soil).Ca, [zone, soil])

  // Publish the design earthquake so the report can run the same assessment.
  useEffect(() => { onSeismic?.({ amax, magnitude }) }, [amax, magnitude, onSeismic])

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-[1.05rem] font-bold text-[#0056b3]">Design earthquake</h2>
        <p className="mb-3 text-[11px] text-slate-500">
          a_max is the peak acceleration at the GROUND SURFACE. A site-specific hazard or site-response study is the
          defensible source; the NSCP seismic coefficient below is a screening stand-in only, and using it is a
          decision worth recording in the report.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-[11px]">
            <span className="mb-0.5 text-slate-600">a_max (g)</span>
            <input type="number" step="0.05" min="0" value={amax}
              onChange={(e) => setAmax(num(e.target.value))}
              className="w-24 rounded border border-slate-300 px-1.5 py-1 text-right font-mono" />
          </label>
          <label className="flex flex-col text-[11px]">
            <span className="mb-0.5 text-slate-600">Magnitude M<sub>w</sub></span>
            <input type="number" step="0.1" min="0" value={magnitude}
              onChange={(e) => setMagnitude(num(e.target.value))}
              className="w-24 rounded border border-slate-300 px-1.5 py-1 text-right font-mono" />
          </label>
          <div className="flex items-end gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2">
            <label className="flex flex-col text-[11px]">
              <span className="mb-0.5 text-slate-600">NSCP zone</span>
              <select value={zone} onChange={(e) => setZone(Number(e.target.value) as SeismicZone)}
                className="rounded border border-slate-300 px-1.5 py-1">
                <option value={2}>2</option><option value={4}>4</option>
              </select>
            </label>
            <label className="flex flex-col text-[11px]">
              <span className="mb-0.5 text-slate-600">Soil profile</span>
              <select value={soil} onChange={(e) => setSoil(e.target.value as SoilProfile)}
                className="rounded border border-slate-300 px-1.5 py-1">
                {(['SA', 'SB', 'SC', 'SD', 'SE'] as SoilProfile[]).map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </label>
            <button onClick={() => setAmax(Number(ca.toFixed(2)))}
              className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
              use Ca = {ca.toFixed(2)}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-[1.05rem] font-bold text-[#0056b3]">Fines content</h2>
        {fines.length ? (
          <ul className="text-[11px] text-slate-600">
            {fines.map((f) => (
              <li key={f.layerId} className="font-mono">
                {bh.layers.find((l) => l.id === f.layerId)?.name ?? f.layerId}: {f.fines.toFixed(1)}%
                <span className="ml-1.5 font-sans text-slate-500">
                  from {f.fromSamples.map((x) => x.sampleName).join(', ')}
                  {f.fromSamples.length > 1 ? ' (mean)' : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-amber-800">
            No sieve analysis on any sample, so every layer is corrected as CLEAN SAND. That overstates the resistance
            of a silty sand — run a sieve on the samples in the liquefiable layers before relying on these numbers.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Triggering by test</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[12px]">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-1 pr-3 text-left">Depth (m)</th>
                <th className="py-1 pr-3 text-left">Layer</th>
                <th className="py-1 pr-3">(N₁)₆₀cs</th>
                <th className="py-1 pr-3">CSR</th>
                <th className="py-1 pr-3">CRR</th>
                <th className="py-1 pr-3">FS</th>
              </tr>
            </thead>
            <tbody>
              {profile.rows.map((r) => (
                <tr key={r.testId} className="border-b border-slate-100">
                  <td className="py-0.5 pr-3 text-left font-mono">{f2(r.depth)}</td>
                  <td className="py-0.5 pr-3 text-left">{r.layerName ?? '—'}</td>
                  {r.result ? (
                    <>
                      <td className="py-0.5 pr-3 font-mono">{f1(r.result.n160cs)}</td>
                      <td className="py-0.5 pr-3 font-mono">{r.result.csr.toFixed(3)}</td>
                      <td className="py-0.5 pr-3 font-mono">{r.result.crr != null ? r.result.crr.toFixed(3) : '—'}</td>
                      <td className={`py-0.5 pr-3 font-mono font-semibold ${
                        r.result.factorOfSafety == null ? 'text-slate-500'
                          : r.result.factorOfSafety < 1 ? 'text-red-700'
                          : r.result.factorOfSafety < 1.3 ? 'text-amber-700' : 'text-emerald-700'
                      }`}>
                        {r.result.factorOfSafety != null ? r.result.factorOfSafety.toFixed(2) : 'too dense'}
                      </td>
                    </>
                  ) : (
                    <td colSpan={4} className="py-0.5 pr-3 text-left text-[11px] text-slate-500">
                      {r.skipped ? skipText(r.skipped) : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {profile.rows.flatMap((r) => r.result?.notes ?? []).length > 0 && (
          <ul className="mt-3 space-y-1">
            {[...new Set(profile.rows.flatMap((r) => r.result?.notes ?? []))].map((n, k) => (
              <li key={k} className="text-[10px] text-amber-900">{n}</li>
            ))}
          </ul>
        )}
        {profile.notes.map((n, k) => (
          <p key={k} className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">{n}</p>
        ))}

        <p className="mt-3 text-[10px] text-slate-500">
          {cite('d1586')} blow counts through the NCEER simplified procedure (Youd et al. 2001). FS here is TRIGGERING
          only — it does not predict post-liquefaction settlement, bearing loss or lateral spread, each of which is a
          separate analysis.
        </p>
      </div>
    </div>
  )
}

// ── Classification calculator ─────────────────────────────────────────────
// A standalone USCS check driven by typed gradation and plasticity, so a
// classification can be worked out before the sample data model carries the
// laboratory results (Phase 4).

function ClassificationPanel() {
  const [gravel, setGravel] = useState(5)
  const [sand, setSand] = useState(62)
  const [fines, setFines] = useState(33)
  const [cu, setCu] = useState(8)
  const [cc, setCc] = useState(1.5)
  const [ll, setLl] = useState(42)
  const [pl, setPl] = useState(23)
  const [organic, setOrganic] = useState(false)

  const pi = Math.max(ll - pl, 0)
  const result = useMemo(
    () => classifyUSCS({ gravel, sand, fines, cu, cc, liquidLimit: ll, plasticityIndex: pi, organic }),
    [gravel, sand, fines, cu, cc, ll, pi, organic],
  )

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Gradation and plasticity</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ['Gravel (%)', gravel, setGravel], ['Sand (%)', sand, setSand], ['Fines (%)', fines, setFines],
            ['Cu', cu, setCu], ['Cc', cc, setCc], ['LL (%)', ll, setLl], ['PL (%)', pl, setPl],
          ] as [string, number, (v: number) => void][]).map(([label, value, onChange]) => (
            <label key={label} className="flex flex-col text-sm">
              <span className="mb-1 font-medium text-slate-600">{label}</span>
              <input type="number" step="any" value={value}
                onChange={(e) => onChange(num(e.target.value))}
                className="rounded-md border border-slate-300 px-2.5 py-1.5" />
            </label>
          ))}
          <label className="flex items-end gap-2 text-sm">
            <input type="checkbox" checked={organic} onChange={(e) => setOrganic(e.target.checked)}
              className="mb-2 h-4 w-4" />
            <span className="mb-1.5 font-medium text-slate-600">Organic</span>
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-[1.05rem] font-bold text-[#0056b3]">USCS — ASTM D2487</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Group symbol" value={result.symbol ?? '—'} sub={result.dual ? 'dual symbol' : undefined} />
          <Stat label="PI" value={f0(pi)} sub="LL − PL" />
          <Stat label="Fines" value={`${f0(fines)} %`} sub={result.coarseGrained ? 'coarse-grained' : 'fine-grained'} />
          <Stat label="Group name" value={result.name ?? '—'} />
        </div>
        <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
          {result.reason}
        </p>
        {result.notes.map((n, k) => (
          <p key={k} className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            {n}
          </p>
        ))}
        {!result.symbol && (
          <p className="mt-2 text-[11px] text-slate-500">
            The classifier will not guess. Where D2487 needs a test that has not been run, it says which one rather
            than picking the likeliest symbol.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Laboratory ────────────────────────────────────────────────────────────

/**
 * A laboratory result printed to the precision the measurement supports. A
 * strength read off a proving ring is not known to three decimal places, and
 * "qu = 97.456 kPa" claims a precision the test does not have. Only the
 * dimensionless ratios (Gs) earn three.
 */
function formatOutcome(s: { label: string; value: number; unit: string }): string {
  const dp = s.unit === '' ? 3 : 1
  // No space before a degree sign; one before every other unit.
  const gap = s.unit === '°' ? '' : ' '
  return `${s.label} = ${s.value.toFixed(dp)}${s.unit ? gap + s.unit : ''}`
}

function TestCard({
  test, onData, onRows, onPoints, onChoice, onStatus, onRemove,
}: {
  test: LabTest
  onData: (key: string, value: number) => void
  onRows: (rows: StackRow[]) => void
  onPoints: (rows: ShearRow[]) => void
  onChoice: (key: string, value: string) => void
  onStatus: (s: LabTestStatus) => void
  onRemove: () => void
}) {
  const spec = labSpec(test.type)
  const { outcome, error } = evaluateTest(test)
  const implemented = isImplemented(test.type)

  return (
    <div className={`rounded-lg border p-3 ${test.status === 'void' ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-[13px] font-semibold text-slate-800">{spec?.label ?? test.type}</span>
          <span className="ml-2 font-mono text-[10px] text-slate-500">{cite(test.standard)}</span>
        </div>
        <div className="flex items-center gap-2">
          <select value={test.status} onChange={(e) => onStatus(e.target.value as LabTestStatus)}
            className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px]">
            {(['planned', 'in-progress', 'complete', 'void'] as LabTestStatus[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button onClick={onRemove} className="rounded px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50">
            remove
          </button>
        </div>
      </div>

      {spec?.purpose && <p className="mt-1 text-[11px] text-slate-500">{spec.purpose}</p>}

      {!implemented ? (
        <p className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
          Booked against this sample. No data form yet — this test&rsquo;s engine has not shipped, and the schedule
          shows it rather than hiding it.
        </p>
      ) : (
        <>
          {spec!.formKind === 'sieve-stack' && (
            <SieveStack
              rows={(test.data?.readings as StackRow[] | undefined) ?? []}
              onChange={(rows) => onRows(rows)} />
          )}

          {spec!.formKind === 'shear-points' && (
            <ShearPoints
              rows={(test.data?.points as ShearRow[] | undefined) ?? []}
              onChange={(rows) => onPoints(rows)} />
          )}

          {spec!.formKind === 'load-increments' && (
            <LoadIncrements
              rows={(test.data?.points as LoadRow[] | undefined) ?? []}
              onChange={(rows) => onPoints(rows as unknown as ShearRow[])} />
          )}

          {test.type === 'ucs' && (
            <label className="mt-2 flex flex-col text-[11px]">
              <span className="mb-0.5 text-slate-600">Soil condition</span>
              <select
                value={(test.data?.soil as string | undefined) ?? 'saturated-cohesive'}
                onChange={(e) => onChoice('soil', e.target.value)}
                className="rounded border border-slate-300 px-1.5 py-1">
                <option value="saturated-cohesive">Saturated cohesive (cu = qu/2 applies)</option>
                <option value="fissured">Fissured</option>
                <option value="partly-saturated">Partly saturated</option>
                <option value="granular">Granular</option>
              </select>
              <span className="mt-0.5 text-[10px] text-slate-500">
                cu = qu/2 assumes φ = 0. Outside a saturated cohesive soil the module reports qu and declines cu.
              </span>
            </label>
          )}

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {spec!.fields.map((f) => (
              <label key={f.key} className="flex flex-col text-[11px]">
                <span className="mb-0.5 text-slate-600">
                  {f.label}{f.unit ? ` (${f.unit})` : ''}{f.optional ? '' : ' *'}
                </span>
                <input type="number" step="any"
                  value={(test.data?.[f.key] as number | undefined) ?? ''}
                  placeholder={f.placeholder != null ? String(f.placeholder) : ''}
                  onChange={(e) => onData(f.key, num(e.target.value))}
                  className="rounded border border-slate-300 px-1.5 py-1 text-right font-mono" />
              </label>
            ))}
          </div>

          {error && (
            <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-800">
              {error}
            </p>
          )}

          {outcome && <TestChart test={test} outcome={outcome} />}

          {outcome && (
            <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5">
              <p className="font-mono text-[13px] font-semibold text-emerald-900">
                {formatOutcome(summarise(outcome))}
              </p>
              {outcome.result.notes.map((n, k) => (
                <p key={k} className="mt-1 text-[10px] text-amber-900">{n}</p>
              ))}
            </div>
          )}

          {!outcome && !error && (
            <p className="mt-2 text-[11px] text-slate-500">Enter every required field to compute a result.</p>
          )}
        </>
      )}
    </div>
  )
}

function LabPanel({
  bh, onAdd, onData, onRows, onPoints, onChoice, onStatus, onRemove, onApplySymbol,
}: {
  bh: Borehole
  onAdd: (sampleId: string, type: LabTestType) => void
  onData: (sampleId: string, testId: string, key: string, value: number) => void
  onRows: (sampleId: string, testId: string, rows: StackRow[]) => void
  onPoints: (sampleId: string, testId: string, rows: ShearRow[]) => void
  onChoice: (sampleId: string, testId: string, key: string, value: string) => void
  onStatus: (sampleId: string, testId: string, status: LabTestStatus) => void
  onRemove: (sampleId: string, testId: string) => void
  onApplySymbol: (layerId: string, symbol: string) => void
}) {
  if (!bh.samples.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[12px] text-slate-600">
          No samples in {bh.name}. Laboratory tests are booked against a sample, not a layer — a sample recovered
          across a stratigraphic boundary belongs to the hole at a depth.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {bh.samples.map((s) => (
        <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[1.05rem] font-bold text-[#0056b3]">
              {s.name}
              <span className="ml-2 font-mono text-[12px] font-normal text-slate-500">
                {f2(s.depthTop)}–{f2(s.depthBottom)} m · {s.type}
              </span>
            </h2>
            <select value="" onChange={(e) => { if (e.target.value) onAdd(s.id, e.target.value as LabTestType) }}
              className="rounded-md border border-slate-300 px-2 py-1 text-[12px]">
              <option value="">+ add a test…</option>
              {LAB_TESTS.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}{isImplemented(t.type) ? '' : ' (no form yet)'}
                </option>
              ))}
            </select>
          </div>

          {/* A strength or compressibility test needs an undisturbed specimen. */}
          {s.tests.some((t) => labSpec(t.type)?.needsUndisturbed && t.status !== 'void')
            && !['undisturbed', 'shelby-tube', 'core'].includes(s.type) && (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              A strength or compressibility test is booked on a <strong>{s.type}</strong> sample. Those need an
              undisturbed specimen — the result will understate the in-situ soil.
            </p>
          )}

          {s.tests.length ? (
            <div className="space-y-2">
              {s.tests.map((t) => (
                <TestCard key={t.id} test={t}
                  onData={(key, value) => onData(s.id, t.id, key, value)}
                  onRows={(rows) => onRows(s.id, t.id, rows)}
                  onPoints={(rows) => onPoints(s.id, t.id, rows)}
                  onChoice={(key, value) => onChoice(s.id, t.id, key, value)}
                  onStatus={(status) => onStatus(s.id, t.id, status)}
                  onRemove={() => onRemove(s.id, t.id)} />
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-slate-500">No tests booked on this sample.</p>
          )}

          <SampleClassificationCard sample={s} layers={bh.layers} onApply={onApplySymbol} />
        </div>
      ))}
    </div>
  )
}

// ── Sieve stack ───────────────────────────────────────────────────────────

/** Standard stack a blank sieve test starts from. */
const DEFAULT_STACK: { size: number; designation: string }[] = [
  { size: 9.5, designation: '3/8 in' },
  { size: 4.75, designation: 'No. 4' },
  { size: 2.0, designation: 'No. 10' },
  { size: 0.85, designation: 'No. 20' },
  { size: 0.425, designation: 'No. 40' },
  { size: 0.15, designation: 'No. 100' },
  { size: 0.075, designation: 'No. 200' },
]

interface StackRow { size: number; designation?: string; massRetained: number }

function SieveStack({
  rows, onChange,
}: { rows: StackRow[]; onChange: (rows: StackRow[]) => void }) {
  const stack = rows.length ? rows : DEFAULT_STACK.map((r) => ({ ...r, massRetained: 0 }))
  const set = (i: number, patch: Partial<StackRow>) =>
    onChange(stack.map((r, k) => (k === i ? { ...r, ...patch } : r)))

  return (
    <div className="mt-2">
      <table className="w-full text-left text-[11px]">
        <thead className="text-slate-500">
          <tr className="border-b border-slate-200">
            <th className="py-1 pr-2">Sieve</th>
            <th className="py-1 pr-2">Opening (mm)</th>
            <th className="py-1 pr-2 text-right">Mass retained (g)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {stack.map((r, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-0.5 pr-2">
                <input value={r.designation ?? ''} placeholder="—"
                  onChange={(e) => set(i, { designation: e.target.value || undefined })}
                  className="w-20 rounded border border-slate-200 px-1 py-0.5" />
              </td>
              <td className="py-0.5 pr-2">
                <input type="number" step="any" value={r.size}
                  onChange={(e) => set(i, { size: num(e.target.value) })}
                  className="w-20 rounded border border-slate-200 px-1 py-0.5 text-right font-mono" />
              </td>
              <td className="py-0.5 pr-2 text-right">
                <input type="number" step="any" value={r.massRetained}
                  onChange={(e) => set(i, { massRetained: num(e.target.value) })}
                  className="w-24 rounded border border-slate-200 px-1 py-0.5 text-right font-mono" />
              </td>
              <td className="py-0.5 text-right">
                <button onClick={() => onChange(stack.filter((_, k) => k !== i))}
                  className="rounded px-1 text-[10px] text-red-600 hover:bg-red-50">×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={() => onChange([...stack, { size: 0.075, massRetained: 0 }])}
        className="mt-1 rounded border border-dashed border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50">
        + sieve
      </button>
    </div>
  )
}

// ── Sample classification ─────────────────────────────────────────────────

function SampleClassificationCard({
  sample, layers, onApply,
}: {
  sample: Sample
  layers: SoilLayer[]
  onApply: (layerId: string, symbol: string) => void
}) {
  const c = useMemo(() => classifySample(sample), [sample])
  const layer = layers.find((l) => l.id === sample.layerId)
  const symbol = c.uscs?.symbol

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
        Classification from this sample
      </p>

      {symbol ? (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-[16px] font-semibold text-[#0056b3]">{symbol}</span>
          <span className="text-[12px] text-slate-700">{c.uscs!.name}</span>
          {c.aashto?.label && (
            <span className="font-mono text-[11px] text-slate-500">AASHTO {c.aashto.label}</span>
          )}
        </div>
      ) : (
        <p className="mt-1 text-[12px] text-slate-600">
          {c.uscs?.reason ?? 'Not enough laboratory data to classify this sample yet.'}
        </p>
      )}

      {c.missing.length > 0 && (
        <p className="mt-1.5 text-[11px] text-slate-600">
          Run to complete it: <strong>{c.missing.join(', ')}</strong>
        </p>
      )}

      {symbol && c.uscs!.reason && (
        <p className="mt-1.5 text-[11px] text-slate-600">{c.uscs!.reason}</p>
      )}

      {c.notes.map((n, k) => (
        <p key={k} className="mt-1 text-[10px] text-amber-900">{n}</p>
      ))}

      {symbol && layer && (
        layer.symbol === symbol ? (
          <p className="mt-2 text-[11px] text-emerald-700">
            Layer &ldquo;{layer.name}&rdquo; already carries {symbol}.
          </p>
        ) : (
          <button onClick={() => onApply(layer.id, symbol)}
            className="mt-2 rounded-md bg-[#0056b3] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#004a99]">
            {layer.symbol
              ? `Replace ${layer.symbol} with ${symbol} on “${layer.name}”`
              : `Apply ${symbol} to “${layer.name}”`}
          </button>
        )
      )}

      {symbol && !layer && (
        <p className="mt-2 text-[11px] text-slate-500">
          This sample is not attributed to a layer, so there is nothing to apply the symbol to.
        </p>
      )}
    </div>
  )
}

// ── Direct-shear specimens ────────────────────────────────────────────────

interface ShearRow { normalStress: number; peakShear: number; residualShear?: number }

function ShearPoints({
  rows, onChange,
}: { rows: ShearRow[]; onChange: (rows: ShearRow[]) => void }) {
  const pts = rows.length ? rows : [
    { normalStress: 50, peakShear: 0 },
    { normalStress: 100, peakShear: 0 },
    { normalStress: 200, peakShear: 0 },
  ]
  const set = (i: number, patch: Partial<ShearRow>) =>
    onChange(pts.map((r, k) => (k === i ? { ...r, ...patch } : r)))

  return (
    <div className="mt-2">
      <table className="w-full text-left text-[11px]">
        <thead className="text-slate-500">
          <tr className="border-b border-slate-200">
            <th className="py-1 pr-2">Specimen</th>
            <th className="py-1 pr-2 text-right">σ′n (kPa)</th>
            <th className="py-1 pr-2 text-right">τ peak (kPa)</th>
            <th className="py-1 pr-2 text-right">τ residual (kPa)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {pts.map((r, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-0.5 pr-2 text-slate-600">{i + 1}</td>
              {([
                ['normalStress', r.normalStress] as const,
                ['peakShear', r.peakShear] as const,
                ['residualShear', r.residualShear] as const,
              ]).map(([key, v]) => (
                <td key={key} className="py-0.5 pr-2 text-right">
                  <input type="number" step="any" value={v ?? ''}
                    placeholder={key === 'residualShear' ? 'optional' : ''}
                    onChange={(e) => set(i, {
                      [key]: e.target.value === '' ? undefined : num(e.target.value),
                    } as Partial<ShearRow>)}
                    className="w-24 rounded border border-slate-200 px-1 py-0.5 text-right font-mono" />
                </td>
              ))}
              <td className="py-0.5 text-right">
                <button onClick={() => onChange(pts.filter((_, k) => k !== i))}
                  className="rounded px-1 text-[10px] text-red-600 hover:bg-red-50">×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => onChange([...pts, { normalStress: 0, peakShear: 0 }])}
        className="mt-1 rounded border border-dashed border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50">
        + specimen
      </button>
    </div>
  )
}

// ── Design parameters ─────────────────────────────────────────────────────

const PROVENANCE_STYLE: Record<string, string> = {
  measured: 'bg-emerald-100 text-emerald-800',
  derived: 'bg-sky-100 text-sky-800',
  correlated: 'bg-amber-100 text-amber-900',
  assumed: 'bg-violet-100 text-violet-800',
}

/**
 * A parameter printed to the precision its SOURCE supports.
 *
 * A correlated friction angle carries roughly ±3° of scatter — the registry
 * entry says so in as many words — so printing "46.6°" claims a precision the
 * relation does not have and invites a reader to treat it like a measurement.
 * Correlations are shown whole; measurements keep a decimal.
 */
function formatParameter(v: SourcedValue): string {
  if (v.unit === '—' || v.unit === '') return v.value.toFixed(3)
  const dp = v.provenance.kind === 'correlated' ? 0 : 1
  return `${v.value.toFixed(dp)} ${v.unit}`
}


function ParametersPanel({
  bh, unitWeights, stored,
}: {
  bh: Borehole
  unitWeights: Record<string, LayerUnitWeight>
  stored: LayerParameters[]
}) {
  const resolutions = useMemo(
    () => bh.layers.map((layer) => ({
      layer,
      r: resolveParameters({
        borehole: bh, layer, unitWeights,
        stored: stored.find((p) => p.layerId === layer.id),
      }),
    })),
    [bh, unitWeights, stored],
  )

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-[1.05rem] font-bold text-[#0056b3]">Design parameters</h2>
        <p className="text-[11px] text-slate-500">
          Resolved once per layer from every piece of evidence available, each carrying where it came from. A stated
          engineer override beats a measurement, a measurement beats a correlation, and a parameter with no evidence
          at all stays <strong>absent</strong> — it is never filled in with a textbook value, because a number that
          looks measured but is not is the failure this module exists to prevent.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
          {(['measured', 'derived', 'correlated', 'assumed'] as const).map((k) => (
            <span key={k} className={`rounded px-1.5 py-0.5 font-semibold ${PROVENANCE_STYLE[k]}`}>
              {PROVENANCE_LABEL[k]}
            </span>
          ))}
        </div>
      </div>

      {resolutions.map(({ layer, r }) => {
        const bearing = bearingInputs(r, unitWeights[layer.id]?.gamma)
        return (
          <div key={layer.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[1rem] font-bold text-[#0056b3]">
                {layer.name}
                <span className="ml-2 font-mono text-[12px] font-normal text-slate-500">
                  {f2(layer.depthTop)}–{f2(layer.depthBottom)} m{layer.symbol ? ` · ${layer.symbol}` : ''}
                </span>
              </h3>
            </div>

            {r.resolved.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead className="text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="py-1 pr-3">Parameter</th>
                      <th className="py-1 pr-3 text-right">Value</th>
                      <th className="py-1 pr-3">Source</th>
                      <th className="py-1 pr-3">Basis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.resolved.map((p) => (
                      <tr key={p.key} className="border-b border-slate-100 align-top">
                        <td className="py-1 pr-3">{PARAMETER_LABEL[p.key] ?? p.key}</td>
                        <td className="py-1 pr-3 text-right font-mono font-semibold">
                          {formatParameter(p.value)}
                        </td>
                        <td className="py-1 pr-3">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${PROVENANCE_STYLE[p.value.provenance.kind]}`}>
                            {PROVENANCE_LABEL[p.value.provenance.kind]}
                          </span>
                        </td>
                        <td className="py-1 pr-3 text-[11px] text-slate-600">
                          {describeProvenance(p.value.provenance)}
                          {p.value.note && <span className="block text-slate-500">{p.value.note}</span>}
                          {p.alternatives.length > 0 && (
                            <span className="mt-0.5 block text-[10px] text-slate-500">
                              Also available: {p.alternatives.map((a) =>
                                `${formatParameter(a)} (${PROVENANCE_LABEL[a.provenance.kind].toLowerCase()})`,
                              ).join(', ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[12px] text-slate-600">
                No evidence for any parameter in this layer yet — no laboratory tests on its samples and no usable
                field tests within it.
              </p>
            )}

            {bearing.missing.length > 0 && (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                A bearing-capacity check on this layer still needs:{' '}
                <strong>{bearing.missing.map((k) => PARAMETER_LABEL[k] ?? k).join(', ')}</strong>. Nothing has been
                assumed on your behalf.
              </p>
            )}

            {r.notes.map((n, k) => (
              <p key={k} className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
                {n}
              </p>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── Oedometer increments ──────────────────────────────────────────────────

interface LoadRow { stress: number; compression: number; t50?: number }

const DEFAULT_INCREMENTS = [12.5, 25, 50, 100, 200, 400, 800]

function LoadIncrements({
  rows, onChange,
}: { rows: LoadRow[]; onChange: (rows: LoadRow[]) => void }) {
  const pts: LoadRow[] = rows.length ? rows : DEFAULT_INCREMENTS.map((stress) => ({ stress, compression: 0 }))
  const set = (i: number, patch: Partial<LoadRow>) =>
    onChange(pts.map((r, k) => (k === i ? { ...r, ...patch } : r)))

  return (
    <div className="mt-2">
      <table className="w-full text-left text-[11px]">
        <thead className="text-slate-500">
          <tr className="border-b border-slate-200">
            <th className="py-1 pr-2 text-right">σ′ (kPa)</th>
            <th className="py-1 pr-2 text-right">Compression (mm)</th>
            <th className="py-1 pr-2 text-right">t₅₀ (min)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {pts.map((r, i) => (
            <tr key={i} className="border-b border-slate-100">
              {([['stress', r.stress] as const, ['compression', r.compression] as const, ['t50', r.t50] as const])
                .map(([key, v]) => (
                  <td key={key} className="py-0.5 pr-2 text-right">
                    <input type="number" step="any" value={v ?? ''}
                      placeholder={key === 't50' ? 'optional' : ''}
                      onChange={(e) => set(i, {
                        [key]: e.target.value === '' ? undefined : num(e.target.value),
                      } as Partial<LoadRow>)}
                      className="w-24 rounded border border-slate-200 px-1 py-0.5 text-right font-mono" />
                  </td>
                ))}
              <td className="py-0.5 text-right">
                <button onClick={() => onChange(pts.filter((_, k) => k !== i))}
                  className="rounded px-1 text-[10px] text-red-600 hover:bg-red-50">×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[10px] text-slate-500">
        Without t₅₀ the magnitude of settlement can be computed but not its rate.
      </p>
      <button onClick={() => onChange([...pts, { stress: 0, compression: 0 }])}
        className="mt-1 rounded border border-dashed border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50">
        + increment
      </button>
    </div>
  )
}

// ── Test charts ───────────────────────────────────────────────────────────

/**
 * The plot for a test whose key number is traditionally read off a graph.
 *
 * The consolidation result tells the reader to "check σ′p against the plotted
 * curve" and the shear result warns about a poor fit; both were unactionable
 * until there was a curve to look at.
 */
function TestChart({ test, outcome }: { test: LabTest; outcome: LabOutcome }) {
  const svg = useMemo(() => {
    switch (outcome.kind) {
      // The envelope needs the specimens themselves, which live on the test
      // data rather than the fitted result — plotting the fit without the
      // points it was fitted through is exactly the picture that hides an
      // outlier.
      case 'direct-shear':
        return planToSvg(shearEnvelopeChart(outcome.result, readDirectShear(test)?.points ?? []), 460)
      case 'consolidation':
        return planToSvg(consolidationChart(outcome.result), 460)
      case 'sieve':
        return planToSvg(gradingChart(outcome.result), 460)
      default:
        return null
    }
  }, [test, outcome])

  if (!svg) return null
  return <div className="mt-2 overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
}
