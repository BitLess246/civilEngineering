import { useMemo, useState } from 'react'
import { useInvestigation } from '../lib/useInvestigation'
import { buildBoreholeLog } from '../engine/soils/logRenderer'
import { planToSvg } from '../engine/planRenderer'
import { validateInvestigation, type ValidationIssue } from '../engine/soils/validate'
import { sptProfile, type LayerUnitWeight } from '../engine/soils/sptProfile'
import { classifyUSCS } from '../engine/soils/uscs'
import { densityFromN60, consistencyFromN60 } from '../engine/soils/spt'
import {
  layerThickness, recoveryRatio, soilFamily, isCohesive,
  type Borehole, type SoilLayer, type Sample, type LabTest, type LabTestType, type LabTestStatus,
} from '../engine/soils/model'
import {
  LAB_TESTS, labSpec, isImplemented, evaluateTest, summarise,
} from '../engine/soils/lab'
import { classifySample } from '../engine/soils/classifySample'
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

type Tab = 'overview' | 'boreholes' | 'profile' | 'spt' | 'lab' | 'classification'

export default function SoilInvestigation() {
  const api = useInvestigation()
  const { investigation: inv } = api
  const [tab, setTab] = useState<Tab>('overview')
  const [holeIdx, setHoleIdx] = useState(0)
  const [importError, setImportError] = useState<string | null>(null)

  const issues = useMemo(() => (inv ? validateInvestigation(inv) : []), [inv])
  const bh: Borehole | undefined = inv?.boreholes[holeIdx]

  // Unit weights entered per layer for the stress profile. They are an
  // INTERPRETATION, not data, so they live in page state rather than in the
  // stored investigation until the Phase 5 parameter engine gives them a home
  // with provenance attached.
  const [unitWeights, setUnitWeights] = useState<Record<string, LayerUnitWeight>>({})

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
        {(['overview', 'boreholes', 'profile', 'spt', 'lab', 'classification'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-t-md px-3 py-1.5 text-[13px] font-medium capitalize ${
              tab === t ? 'border-b-2 border-[#0056b3] text-[#0056b3]' : 'text-slate-600 hover:text-slate-900'
            }`}>
            {t === 'spt' ? 'SPT' : t === 'lab' ? 'Laboratory' : t}
          </button>
        ))}
      </nav>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <section className="mt-5 space-y-5">
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
              interpretation, so they are entered here rather than stored as data. Layers left blank stop the stress
              profile at that depth — the blow counts below are still corrected for equipment, just not for overburden.
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
                          onChange={(e) => setUnitWeights((u) => ({
                            ...u,
                            [l.id]: { ...u[l.id], gamma: num(e.target.value) },
                          }))}
                          className="w-20 rounded border border-slate-200 px-1 py-0.5 text-right font-mono" />
                      </td>
                      <td className="py-0.5 pr-3">
                        <input type="number" step="0.5" value={unitWeights[l.id]?.gammaSat ?? ''}
                          onChange={(e) => setUnitWeights((u) => ({
                            ...u,
                            [l.id]: { gamma: u[l.id]?.gamma ?? 18, gammaSat: num(e.target.value) },
                          }))}
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

      {tab === 'classification' && (
        <section className="mt-5">
          <ClassificationPanel />
        </section>
      )}

    </main>
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
