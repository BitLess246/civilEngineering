import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  analyzeBeam, type Support, type SupportType, type BeamLoad, type LoadCategory,
} from '../engine/beamAnalysis'
import { detectCriticalSections } from '../engine/beamSections'
import { SECTIONS_HANDOFF_KEY } from './BeamDesign'
import { BEAM_LOADS_HANDOFF_KEY } from './LoadPath'
import { BeamElevation } from '../components/BeamElevation'
import { Diagram } from '../components/Diagram'
import { ReportControls } from '../components/ReportControls'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
import { f1, f2 } from '../lib/format'
import 'katex/dist/katex.min.css'

const CATS: [LoadCategory, string][] = [
  ['D', 'D — dead'], ['L', 'L — live'], ['Lr', 'Lr — roof live'],
  ['S', 'S — snow'], ['R', 'R — rain'], ['W', 'W — wind'], ['E', 'E — seismic'],
]

let uid = 1
interface SupRow extends Support { id: number }
type LoadRow = BeamLoad & { id: number }

const DEF_SUPPORTS: SupRow[] = [
  { id: uid++, type: 'pin', x: 0 },
  { id: uid++, type: 'roller', x: 6 },
]
const DEF_LOADS: LoadRow[] = [
  { id: uid++, type: 'udl', x1: 0, x2: 6, w: 8, cat: 'D' },
  { id: uid++, type: 'udl', x1: 0, x2: 6, w: 5, cat: 'L' },
]

function ItemShell({ title, onRemove, children }: {
  title: string; onRemove: () => void; children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</span>
        <button type="button" onClick={onRemove} className="text-xs text-red-500 hover:underline">remove</button>
      </div>
      {/* fields take only the width they need — no wide blank area on
          one-field cards like pin/roller */}
      <div className="flex flex-wrap gap-3 [&>label]:w-36">{children}</div>
    </div>
  )
}

export default function BeamAnalysis() {
  // Handoff from the Load Path page (?handoff=loads): span + edge line loads
  // arrive via sessionStorage; default supports = pin/roller at the ends.
  const [params] = useSearchParams()
  const handoff = useMemo(() => {
    if (params.get('handoff') !== 'loads') return null
    try {
      const raw = sessionStorage.getItem(BEAM_LOADS_HANDOFF_KEY)
      if (!raw) return null
      const { L, loads } = JSON.parse(raw) as { L: number; loads: BeamLoad[] }
      if (!(L > 0) || !loads?.length) return null
      return {
        L,
        supports: [{ id: uid++, type: 'pin', x: 0 }, { id: uid++, type: 'roller', x: L }] as SupRow[],
        loads: loads.map((ld) => ({ ...ld, id: uid++ })) as LoadRow[],
      }
    } catch { return null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [L, setL] = useState(handoff?.L ?? 6)
  const [E, setE] = useState(25000)
  const [I, setI] = useState(3.125e9)
  const [supports, setSupports] = useState<SupRow[]>(handoff?.supports ?? DEF_SUPPORTS)
  const [loads, setLoads] = useState<LoadRow[]>(handoff?.loads ?? DEF_LOADS)
  const [selIdx, setSelIdx] = useState<number | null>(null)
  const navigate = useNavigate()

  const setSup = (id: number, patch: Partial<SupRow>) =>
    setSupports((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const setLoad = (id: number, patch: Partial<LoadRow>) =>
    setLoads((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } as LoadRow : l)))

  const addSupport = (type: SupportType) =>
    setSupports((ss) => [...ss, { id: uid++, type, x: L / 2, ...(type === 'spring' ? { k: 5000 } : {}) }])
  const addLoad = (type: BeamLoad['type']) => {
    const base = { id: uid++, cat: 'D' as LoadCategory }
    if (type === 'point') setLoads((ls) => [...ls, { ...base, type, x: L / 2, P: 50 }])
    else if (type === 'udl') setLoads((ls) => [...ls, { ...base, type, x1: 0, x2: L, w: 10 }])
    else if (type === 'vdl') setLoads((ls) => [...ls, { ...base, type, x1: 0, x2: L, w1: 0, w2: 10 }])
    else setLoads((ls) => [...ls, { ...base, type, x: L / 2, M: 20 }])
  }

  const stable = supports.length >= 2 || supports.some((s) => s.type === 'fixed')
  const valid = L > 0 && E > 0 && I > 0 && stable && loads.length > 0

  const res = useMemo(() => {
    if (!valid) return null
    try { return analyzeBeam(supports, loads, L, E, I) } catch { return null }
  }, [supports, loads, L, E, I, valid])

  const shownIdx = selIdx !== null && res && res.perCombo[selIdx]?.result ? selIdx : res?.govIdx ?? 0
  const shown = res ? res.perCombo[shownIdx] : null
  const r = shown?.result ?? null
  const allowDefl = (L * 1000) / 360
  const vlines = supports.map((s) => ({ x: s.x, label: s.type === 'spring' ? 'k' : s.type[0].toUpperCase() }))

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">Beam Analysis</h1>
      <p className="no-print mt-1 text-slate-600">
        Euler–Bernoulli FEM (Hermite elements, Gauss-5) with modular supports — pin / roller / fixed / spring at any
        position — and categorised loads run through all 7 NSCP 2015 load combinations. Includes a three-moment
        (Clapeyron) cross-check for continuous beams.
      </p>
      <ReportControls title="Beam Analysis Report" />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card title="Beam">
            <Num label="Span L" unit="m" value={L} onChange={setL} />
            <Num label="Modulus E" unit="MPa" value={E} onChange={setE} />
            <Num label="Inertia I" unit="mm⁴" value={I} onChange={setI} />
          </Card>

          <fieldset className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <legend className="px-2 text-[1.02rem] font-bold text-[#0056b3]">Supports</legend>
            <div className="no-print mb-3 flex flex-wrap gap-2">
              {(['pin', 'roller', 'fixed', 'spring'] as SupportType[]).map((t) => (
                <button key={t} type="button" onClick={() => addSupport(t)}
                  className="rounded-md border border-[#cddcf0] bg-[#eaf1f9] px-3 py-1.5 text-sm font-semibold text-[#0f4c92] hover:bg-[#dce9f7]">
                  + {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {supports.length === 0 && <p className="text-sm text-slate-500">No supports — add at least 2 (or a single Fixed).</p>}
              {supports.map((s) => (
                <ItemShell key={s.id} title={s.type} onRemove={() => setSupports((ss) => ss.filter((q) => q.id !== s.id))}>
                  <Num label="x" unit="m" value={s.x} onChange={(v) => setSup(s.id, { x: v })} />
                  {s.type === 'spring' && (
                    <Num label="k" unit="kN/m" value={s.k ?? 5000} onChange={(v) => setSup(s.id, { k: v })} />
                  )}
                </ItemShell>
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <legend className="px-2 text-[1.02rem] font-bold text-[#0056b3]">Loads</legend>
            <div className="no-print mb-3 flex flex-wrap gap-2">
              {([['point', '+ Point'], ['udl', '+ UDL'], ['vdl', '+ VDL'], ['moment', '+ Moment']] as const).map(([t, lbl]) => (
                <button key={t} type="button" onClick={() => addLoad(t)}
                  className="rounded-md border border-[#cddcf0] bg-[#eaf1f9] px-3 py-1.5 text-sm font-semibold text-[#0f4c92] hover:bg-[#dce9f7]">
                  {lbl}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {loads.length === 0 && <p className="text-sm text-slate-500">No loads yet.</p>}
              {loads.map((ld) => (
                <ItemShell key={ld.id} title={ld.type.toUpperCase()} onRemove={() => setLoads((ls) => ls.filter((q) => q.id !== ld.id))}>
                  {ld.type === 'point' && <>
                    <Num label="x" unit="m" value={ld.x} onChange={(v) => setLoad(ld.id, { x: v })} />
                    <Num label="P" unit="kN" value={ld.P} onChange={(v) => setLoad(ld.id, { P: v })} />
                  </>}
                  {ld.type === 'udl' && <>
                    <Num label="x₁" unit="m" value={ld.x1} onChange={(v) => setLoad(ld.id, { x1: v })} />
                    <Num label="x₂" unit="m" value={ld.x2} onChange={(v) => setLoad(ld.id, { x2: v })} />
                    <Num label="w" unit="kN/m" value={ld.w} onChange={(v) => setLoad(ld.id, { w: v })} />
                  </>}
                  {ld.type === 'vdl' && <>
                    <Num label="x₁" unit="m" value={ld.x1} onChange={(v) => setLoad(ld.id, { x1: v })} />
                    <Num label="x₂" unit="m" value={ld.x2} onChange={(v) => setLoad(ld.id, { x2: v })} />
                    <Num label="w₁" unit="kN/m" value={ld.w1} onChange={(v) => setLoad(ld.id, { w1: v })} />
                    <Num label="w₂" unit="kN/m" value={ld.w2} onChange={(v) => setLoad(ld.id, { w2: v })} />
                  </>}
                  {ld.type === 'moment' && <>
                    <Num label="x" unit="m" value={ld.x} onChange={(v) => setLoad(ld.id, { x: v })} />
                    <Num label="M" unit="kN·m" value={ld.M} onChange={(v) => setLoad(ld.id, { M: v })} />
                  </>}
                  <Pick label="Category" value={ld.cat} onChange={(v) => setLoad(ld.id, { cat: v as LoadCategory })} options={CATS} />
                </ItemShell>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <ResultCard title="Model">
            <BeamElevation L={L} supports={supports} loads={loads} />
            {!stable && <p className="mt-1 text-sm text-red-600">⚠ Unstable — add at least 2 supports (or one Fixed).</p>}
          </ResultCard>

          {res && (
            <ResultCard title="NSCP 2015 load combinations">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-left uppercase tracking-wide text-slate-500">
                      <th className="py-1 pr-2 font-semibold">Combination</th>
                      <th className="py-1 pr-2 text-right font-semibold">Vmax</th>
                      <th className="py-1 pr-2 text-right font-semibold">Mmax</th>
                      <th className="py-1 text-right font-semibold">δmax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.perCombo.map((pc, i) => (
                      <tr key={pc.combo.name}
                        onClick={() => pc.result && setSelIdx(i)}
                        className={`border-t border-slate-100 ${pc.result ? 'cursor-pointer hover:bg-blue-50' : 'text-slate-300'} ${
                          i === res.govIdx ? 'bg-amber-50 font-semibold' : ''} ${i === shownIdx ? 'outline outline-1 outline-[#0056b3]' : ''}`}>
                        <td className="py-1 pr-2">{pc.combo.name}{i === res.govIdx ? ' ★' : ''}</td>
                        <td className="py-1 pr-2 text-right">{pc.result ? f1(pc.result.Vmax) : pc.skipped ? '—' : 'sing.'}</td>
                        <td className="py-1 pr-2 text-right">{pc.result ? f1(pc.result.Mmax) : '—'}</td>
                        <td className="py-1 text-right">{pc.result ? f2(pc.result.Dmax) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">★ governing (largest |M|). Click a row to view its reactions & diagrams.</p>
            </ResultCard>
          )}

          {r && shown && (
            <ResultCard title={`Reactions — ${shown.combo.name}`}>
              {r.reactions.map((rc, i) => (
                <Row key={i} label={`x = ${f2(rc.x)} m (${rc.type})`}
                  value={`${f2(rc.Rv)} kN`}
                  sub={Math.abs(rc.Rm) > 0.01 ? `M = ${f2(rc.Rm)} kN·m` : undefined} />
              ))}
              <Row alert={r.Dmax > allowDefl} label="Deflection vs L/360"
                value={r.Dmax <= allowDefl ? '✓ OK' : '✗ exceeds'}
                sub={`${f2(r.Dmax)} ≤ ${f2(allowDefl)} mm`} />
              <div className="no-print mt-3 flex flex-wrap gap-2">
                <Link to={`/beam-design?mu=${r.Mmax.toFixed(1)}&vu=${r.Vmax.toFixed(1)}`}
                  className="inline-block rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[#0056b3] transition hover:border-[#0056b3] hover:bg-blue-50">
                  Use Mmax & Vmax →
                </Link>
                <button type="button"
                  onClick={() => {
                    const gov = res!.perCombo[res!.govIdx].result!
                    const secs = detectCriticalSections(gov)
                    if (!secs.length) return
                    sessionStorage.setItem(SECTIONS_HANDOFF_KEY, JSON.stringify(secs))
                    navigate('/beam-design?sections=auto')
                  }}
                  className="inline-block rounded-md border border-[#cddcf0] bg-[#eaf1f9] px-4 py-2 text-sm font-semibold text-[#0f4c92] transition hover:bg-[#dce9f7]">
                  ⚡ Auto-detect critical sections → design
                </button>
              </div>
            </ResultCard>
          )}
        </div>
      </div>

      {r && shown && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <Diagram xs={r.xs} ys={r.V} title={`SHEAR — ${shown.combo.name}`} unit="kN" color="#1f77b4" vlines={vlines} decimals={1} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <Diagram xs={r.xs} ys={r.M} title="MOMENT" unit="kN·m" color="#d62728" vlines={vlines} decimals={1} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <Diagram xs={r.xs} ys={r.D} title="DEFLECTION" unit="mm" color="#2ca02c" vlines={vlines} decimals={2} />
          </div>
        </div>
      )}

      {res?.tmt && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm print-avoid-break">
          <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">
            Three-moment theorem check <span className="text-xs font-normal text-slate-500">Clapeyron — governing combo, interior support moments</span>
          </h2>
          {res.tmt.positions.map((x, i) => (
            <Row key={i} label={`Support @ x = ${f2(x)} m`}
              value={`M = ${f2(res.tmt!.supportMoments[i])} kN·m`}
              sub={`R = ${f2(res.tmt!.reactions[i])} kN`} />
          ))}
          <p className="mt-1 text-xs text-slate-500">
            M₍ᵢ₋₁₎Lᵢ + 2Mᵢ(Lᵢ+Lᵢ₊₁) + Mᵢ₊₁Lᵢ₊₁ = −6(Q/L)ᵢ − 6(Q/L)ᵢ₊₁ — end moments 0, interior solved from the
            tri-diagonal system. Compare with the FEM reactions above as an independent hand-method check.
          </p>
        </div>
      )}
    </div>
  )
}
