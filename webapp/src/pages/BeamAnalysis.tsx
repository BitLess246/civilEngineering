import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  analyzeBeam, spansToSegments, type Support, type SupportType, type BeamLoad, type LoadCategory,
} from '../engine/beamAnalysis'
import { deriveBeam } from '../engine/beamDerivation'
import { detectCriticalSections } from '../engine/beamSections'
import { SECTIONS_HANDOFF_KEY } from './BeamDesign'
import { BEAM_LOADS_HANDOFF_KEY } from './LoadPath'
import { BeamElevation } from '../components/BeamElevation'
import { Diagram } from '../components/Diagram'
import { DIAGRAM_GRID } from '../lib/diagramLabel'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { f1, f2 } from '../lib/format'
import 'katex/dist/katex.min.css'

const CATS: [LoadCategory, string][] = [
  ['D', 'D — dead'], ['L', 'L — live'], ['Lr', 'Lr — roof live'],
  ['S', 'S — snow'], ['R', 'R — rain'], ['W', 'W — wind'], ['E', 'E — seismic'],
]

let uid = 1
interface SupRow extends Support { id: number }
/** One span: its length (m) and its own section — E in MPa, I in mm⁴. */
interface SpanRow { id: number; L: number; E: number; I: number }
const E0 = 25000, I0 = 3.125e9
type LoadRow = BeamLoad & { id: number }

const DEF_SUPPORTS: SupRow[] = [
  { id: uid++, type: 'pin', x: 0 },
  { id: uid++, type: 'roller', x: 6 },
]
const DEF_LOADS: LoadRow[] = [
  { id: uid++, type: 'udl', x1: 0, x2: 6, w: 8, cat: 'D' },
  { id: uid++, type: 'udl', x1: 0, x2: 6, w: 5, cat: 'L' },
]

function ItemShell({ title, onRemove, children, wideLast }: {
  title: string; onRemove: () => void; children: React.ReactNode
  /** Room for a 10-digit inertia (mm⁴) in the last field. */
  wideLast?: boolean
}) {
  return (
    <div className="rounded-lg border border-hairline bg-sheet-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-muted">{title}</span>
        <button type="button" onClick={onRemove} className="text-xs text-fail hover:underline">remove</button>
      </div>
      {/* fields take only the width they need — no wide blank area on
          one-field cards like pin/roller */}
      <div className={`flex flex-wrap gap-3 [&>label]:w-36 ${wideLast ? '[&>label:last-child]:w-48' : ''}`}>{children}</div>
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

  const [spans, setSpans] = useState<SpanRow[]>([{ id: uid++, L: handoff?.L ?? 6, E: E0, I: I0 }])
  const L = spans.reduce((a, s) => a + s.L, 0)
  const segments = useMemo(() => spansToSegments(spans), [spans])
  const [supports, setSupports] = useState<SupRow[]>(handoff?.supports ?? DEF_SUPPORTS)
  const [loads, setLoads] = useState<LoadRow[]>(handoff?.loads ?? DEF_LOADS)
  const [selIdx, setSelIdx] = useState<number | null>(null)
  const navigate = useNavigate()

  const setSpan = (id: number, patch: Partial<SpanRow>) =>
    setSpans((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  // A new span copies the last one's section and gets a roller at its far end.
  const addSpan = () => {
    const last = spans[spans.length - 1]
    setSpans((ss) => [...ss, { id: uid++, L: last.L, E: last.E, I: last.I }])
    setSupports((ss) => [...ss, { id: uid++, type: 'roller', x: L + last.L }])
  }
  // Only the last span comes off, so the others keep their positions; supports
  // past the new end go with it.
  const removeLastSpan = () => {
    if (spans.length < 2) return
    const newL = L - spans[spans.length - 1].L
    setSpans((ss) => ss.slice(0, -1))
    setSupports((ss) => ss.filter((q) => q.x <= newL + 1e-6))
  }
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
  const valid = spans.every((s) => s.L > 0 && s.E > 0 && s.I > 0) && stable && loads.length > 0

  const res = useMemo(() => {
    if (!valid) return null
    const total = segments[segments.length - 1].x1
    try { return analyzeBeam(supports, loads, total, spans[0].E, spans[0].I, segments) } catch { return null }
  }, [supports, loads, spans, segments, valid])

  const shownIdx = selIdx !== null && res && res.perCombo[selIdx]?.result ? selIdx : res?.govIdx ?? 0
  const shown = res ? res.perCombo[shownIdx] : null
  const r = shown?.result ?? null
  const vlines = supports.map((s) => ({ x: s.x, label: s.type === 'spring' ? 'k' : s.type[0].toUpperCase() }))

  // Deflection per span against that span's own L/360 (ACI Table 24.2.2) — a
  // short stiff span and a long one share no single limit.
  const spanDefl = r ? segments.map((g, k) => {
    let d = 0
    r.xs.forEach((x, i) => { if (x >= g.x0 - 1e-9 && x <= g.x1 + 1e-9) d = Math.max(d, Math.abs(r.D[i])) })
    const allow = ((g.x1 - g.x0) * 1000) / 360
    return { k, d, allow, ratio: d / allow }
  }) : []
  const govDefl = spanDefl.reduce<(typeof spanDefl)[number] | null>((a, s) => (!a || s.ratio > a.ratio ? s : a), null)
  const allowDefl = govDefl?.allow ?? (L * 1000) / 360
  const deflOK = spanDefl.length > 0 && spanDefl.every((s) => s.ratio <= 1)
  const multi = spans.length > 1
  const spanName = (k: number) => (multi ? `span ${k + 1}` : 'span')
  const gov = res ? res.perCombo[res.govIdx] : null
  // the hand derivation of the combination on screen — reactions, V, M and
  // the elastic curve worked the way they are on paper
  const derivation = useMemo(() => (shown?.result
    ? deriveBeam(supports, shown.factored, segments[segments.length - 1].x1, spans[0].E, spans[0].I, segments, shown.combo.name, shown.result.reactions)
    : null), [shown, supports, segments, spans])
  const report = res && r && shown ? {
    docCode: 'BA-01',
    ok: deflOK,
    governing: `Governing ${gov?.combo.name ?? '—'}: Mmax ${f1(gov?.result?.Mmax ?? NaN)} kN·m, Vmax ${f1(gov?.result?.Vmax ?? NaN)} kN`,
    stats: [
      { label: 'Mmax', value: f1(r.Mmax), unit: 'kN·m' },
      { label: 'Vmax', value: f1(r.Vmax), unit: 'kN' },
      { label: 'δmax', value: f2(r.Dmax), unit: 'mm' },
    ],
    checks: spanDefl.map((s) => ({ name: `Deflection δ / (L/360), ${spanName(s.k)} — ${shown.combo.name}`, ratio: s.ratio, ok: s.ratio <= 1 })),
    data: [
      ['Total length', `${f2(L)} m`],
      ...spans.map((s, k) => [multi ? `Span ${k + 1}` : 'Span', `L ${f2(s.L)} m · E ${s.E} MPa · I ${s.I.toExponential(3)} mm⁴`] as [string, string]),
      ['Supports', supports.map((s0) => `${s0.type} @ ${f2(s0.x)}`).join(', ')],
      ...loads.map((ld) => [`${ld.type.toUpperCase()} (${ld.cat})`,
        ld.type === 'point' ? `${f2(ld.P)} kN @ ${f2(ld.x)} m`
          : ld.type === 'udl' ? `${f2(ld.w)} kN/m, ${f2(ld.x1)}–${f2(ld.x2)} m`
            : ld.type === 'vdl' ? `${f2(ld.w1)}→${f2(ld.w2)} kN/m, ${f2(ld.x1)}–${f2(ld.x2)} m`
              : `${f2(ld.M)} kN·m @ ${f2(ld.x)} m`] as [string, string]),
    ] as [string, string][],
    steps: [
      {
        title: 'Load combinations',
        lines: [
          ...res.perCombo.filter((pc) => pc.result).map((pc) => ({
            item: `${pc.combo.name}: Vmax ${f1(pc.result!.Vmax)} kN · Mmax ${f1(pc.result!.Mmax)} kN·m · δmax ${f2(pc.result!.Dmax)} mm${pc === gov ? ' — governs' : ''}`,
          })),
          { text: `The derivation below is worked for ${shown.combo.name}${shownIdx === res.govIdx ? ' (governing)' : ''}; pick another row in the combinations table to work that one instead.` },
        ],
        clause: 'NSCP 2015 §203.3.1',
      },
      ...(derivation?.steps ?? []),
    ],
  } : undefined

  return (
    <WorkspacePage title="Beam Analysis" badges={['Analysis', 'NSCP 2015 combinations']}
      intro="Euler–Bernoulli finite elements over one or more spans, each span with its own E and I, with pin, roller, fixed or spring supports anywhere along the beam, and categorised loads run through the NSCP 2015 load combinations. Continuous beams carry a three-moment (Clapeyron) cross-check, generalized for a different EI in each span, and the Calculations tab works the combination by hand: reactions, shear and moment equations, and the elastic curve by double integration."
      report={report}
      inputs={<>
        <InputGroup title="Spans" hint={multi ? `${spans.length} spans · total ${f2(L)} m` : undefined}>
          <div className="col-span-2">
            <div className="no-print mb-3 flex flex-wrap gap-2">
              <button type="button" onClick={addSpan}
                className="rounded-md border border-brand-line bg-brand-tint px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-tint">
                + Span
              </button>
            </div>
            <div className="space-y-3">
              {spans.map((s, k) => {
                const fields = <>
                  <Num label="Length" unit="m" value={s.L} onChange={(v) => setSpan(s.id, { L: v })} />
                  <Num label="Modulus E" unit="MPa" value={s.E} onChange={(v) => setSpan(s.id, { E: v })} />
                  <Num label="Inertia I" unit="mm⁴" value={s.I} onChange={(v) => setSpan(s.id, { I: v })} />
                </>
                // only the last span is removable — removing one in the middle would slide every support after it
                return multi && k === spans.length - 1
                  ? <ItemShell key={s.id} title={`Span ${k + 1}`} onRemove={removeLastSpan} wideLast>{fields}</ItemShell>
                  : (
                    <div key={s.id} className="rounded-lg border border-hairline bg-sheet-2 p-3">
                      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{multi ? `Span ${k + 1}` : 'Span'}</div>
                      <div className="flex flex-wrap gap-3 [&>label]:w-36 [&>label:last-child]:w-48">{fields}</div>
                    </div>
                  )
              })}
            </div>
          </div>
        </InputGroup>
        <InputGroup title="Supports">
          <div className="col-span-2">
            <div className="no-print mb-3 flex flex-wrap gap-2">
              {(['pin', 'roller', 'fixed', 'spring'] as SupportType[]).map((t) => (
                <button key={t} type="button" onClick={() => addSupport(t)}
                  className="rounded-md border border-brand-line bg-brand-tint px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-tint">
                  + {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {supports.length === 0 && <p className="text-sm text-muted">No supports — add at least 2 (or a single Fixed).</p>}
              {supports.map((s) => (
                <ItemShell key={s.id} title={s.type} onRemove={() => setSupports((ss) => ss.filter((q) => q.id !== s.id))}>
                  <Num label="x" unit="m" value={s.x} onChange={(v) => setSup(s.id, { x: v })} />
                  {s.type === 'spring' && (
                    <Num label="k" unit="kN/m" value={s.k ?? 5000} onChange={(v) => setSup(s.id, { k: v })} />
                  )}
                </ItemShell>
              ))}
            </div>
          </div>
        </InputGroup>
        <InputGroup title="Loads">
          <div className="col-span-2">
            <div className="no-print mb-3 flex flex-wrap gap-2">
              {([['point', '+ Point'], ['udl', '+ UDL'], ['vdl', '+ VDL'], ['moment', '+ Moment']] as const).map(([t, lbl]) => (
                <button key={t} type="button" onClick={() => addLoad(t)}
                  className="rounded-md border border-brand-line bg-brand-tint px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-tint">
                  {lbl}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {loads.length === 0 && <p className="text-sm text-muted">No loads yet.</p>}
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
          </div>
        </InputGroup>
      </>}
      checks={r && shown && res ? <>
        <CheckCard title="Governing combination" basis="largest |M|" status="info" value={gov?.combo.name ?? '—'}
          pairs={[{ label: 'Mmax', value: `${f1(gov?.result?.Mmax ?? NaN)} kN·m` }, { label: 'Vmax', value: `${f1(gov?.result?.Vmax ?? NaN)} kN` }]} />
        {govDefl && (
          <CheckCard title={multi ? `Deflection — ${spanName(govDefl.k)} governs` : 'Deflection'} basis={`L/360 · ${shown.combo.name}`} status={deflOK ? 'pass' : 'fail'}
            value={f2(govDefl.d)} unit="mm" ratio={govDefl.ratio} ratioLabel="δ ÷ L/360"
            pairs={[{ label: 'Limit', value: `${f2(allowDefl)} mm` }, ...(multi ? [{ label: 'Spans checked', value: String(spans.length) }] : [])]} />
        )}
        <div className="no-print flex flex-wrap gap-2">
          <Link to={`/beam-design?mu=${r.Mmax.toFixed(1)}&vu=${r.Vmax.toFixed(1)}`}
            className="rounded-md border border-field-line px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand-tint">
            Use Mmax and Vmax →
          </Link>
          <button type="button"
            onClick={() => {
              const g = res.perCombo[res.govIdx].result!
              const secs = detectCriticalSections(g)
              if (!secs.length) return
              sessionStorage.setItem(SECTIONS_HANDOFF_KEY, JSON.stringify(secs))
              navigate('/beam-design?sections=auto')
            }}
            className="rounded-md border border-brand-line bg-brand-tint px-3 py-1.5 text-xs font-semibold text-brand">
            Auto-detect critical sections → design
          </button>
        </div>
      </> : <p className="text-sm text-fail">{stable ? 'Add at least one load.' : 'Unstable — add at least two supports, or one fixed.'}</p>}
      summary={[
        { label: multi ? 'Spans' : 'Beam', value: spans.map((s) => `${f2(s.L)} m (E ${s.E}, I ${s.I.toExponential(2)})`).join(' + ') },
        { label: 'Supports', value: supports.map((s0) => `${s0.type} @ ${f2(s0.x)} m`).join(', ') || '—' },
        { label: 'Loads', value: `${loads.length} (${[...new Set(loads.map((ld) => ld.cat))].join(', ')})` },
      ]}
      drawing={{ title: 'Model', node: <div data-pdf-drawing><BeamElevation L={L} supports={supports} loads={loads} spans={spans} /></div> }}
      resultsCaption={shown ? `Reactions and deflection for ${shown.combo.name} — pick another combination in the table below.` : undefined}
      results={r && shown ? [
        ...r.reactions.map((rc) => ({ check: `Reaction @ ${f2(rc.x)} m`, basis: rc.type, demand: `${f2(rc.Rv)} kN`,
          limit: Math.abs(rc.Rm) > 0.01 ? `M ${f2(rc.Rm)} kN·m` : undefined, status: 'info' as const })),
        ...spanDefl.map((s) => ({ check: multi ? `Deflection, span ${s.k + 1}` : 'Deflection', basis: `L/360 (L = ${f2(segments[s.k].x1 - segments[s.k].x0)} m)`,
          demand: `${f2(s.d)} mm`, limit: `${f2(s.allow)} mm`, ratio: s.ratio, status: s.ratio <= 1 ? 'pass' as const : 'fail' as const })),
      ] : []}
      extraSections={res && r && shown ? [
        { title: 'NSCP 2015 load combinations', node: (
          <div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-left uppercase tracking-wide text-muted">
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
                        className={`border-t border-hairline-2 ${pc.result ? 'cursor-pointer hover:bg-brand-tint' : 'text-faint'} ${
                          i === res.govIdx ? 'bg-warn-tint font-semibold' : ''} ${i === shownIdx ? 'outline outline-1 outline-brand' : ''}`}>
                        <td className="py-1 pr-2">{pc.combo.name}{i === res.govIdx ? ' ★' : ''}</td>
                        <td className="py-1 pr-2 text-right">{pc.result ? f1(pc.result.Vmax) : pc.skipped ? '—' : 'sing.'}</td>
                        <td className="py-1 pr-2 text-right">{pc.result ? f1(pc.result.Mmax) : '—'}</td>
                        <td className="py-1 text-right">{pc.result ? f2(pc.result.Dmax) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            <p className="mt-1 text-[11px] text-muted">★ governing (largest |M|).<span className="no-print"> Click a row to view its reactions and diagrams.</span></p>
          </div>
        ) },
        { title: `Shear, moment and deflection — ${shown.combo.name}`, node: (
          <div className={`gap-6 ${DIAGRAM_GRID}`}>
            <Diagram xs={r.xs} ys={r.V} title={`SHEAR — ${shown.combo.name}`} unit="kN" color="#1f77b4" vlines={vlines} decimals={1} />
            <Diagram xs={r.xs} ys={r.M} title="MOMENT" unit="kN·m" color="#d62728" vlines={vlines} decimals={1} />
            <Diagram xs={r.xs} ys={r.D} title="DEFLECTION" unit="mm" color="#2ca02c" vlines={vlines} decimals={2} />
          </div>
        ) },
        ...(res.tmt ? [{ title: 'Three-moment check (Clapeyron)', node: (
          <div className="text-sm">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-muted"><th className="py-1">Support</th><th className="text-right">M (kN·m)</th><th className="text-right">R (kN)</th></tr></thead>
              <tbody>
                {res.tmt.positions.map((x, i) => (
                  <tr key={i} className="border-t border-hairline-2">
                    <td className="py-1">x = {f2(x)} m</td>
                    <td className="text-right font-mono">{f2(res.tmt!.supportMoments[i])}</td>
                    <td className="text-right font-mono">{f2(res.tmt!.reactions[i])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-muted">
              M₍ᵢ₋₁₎Lᵢ/EIᵢ + 2Mᵢ(Lᵢ/EIᵢ + Lᵢ₊₁/EIᵢ₊₁) + Mᵢ₊₁Lᵢ₊₁/EIᵢ₊₁ = −6(Q/L)ᵢ/EIᵢ − 6(Q/L)ᵢ₊₁/EIᵢ₊₁ — end
              moments zero, or set by statics where an overhang carries load; the interior solved from the tri-diagonal
              system, governing combination; with one EI throughout it is the classic form. Compare with the FEM reactions
              as an independent hand check.
            </p>
          </div>
        ) }] : []),
      ] : []}
      steps={report?.steps ?? []}
      references={[
        { topic: 'Load combinations', basis: 'categorised loads factored per combination', source: 'NSCP 2015 §203.3' },
        { topic: 'Analysis', basis: 'Hermite beam elements, EI per span; three-moment cross-check with Lᵢ/EIᵢ terms', source: 'Hibbeler, Structural Analysis' },
        { topic: 'Hand derivation', basis: 'statics; three-moment equation; force method by virtual work; double integration EI y″ = M', source: 'Hibbeler, Structural Analysis ch. 2, 8, 10, 12' },
        { topic: 'Deflection limit', basis: 'L/360 of each span', source: 'ACI 318-14 Table 24.2.2 · NSCP 2015 Table 424.2.2' },
      ]}
    />
  )
}
