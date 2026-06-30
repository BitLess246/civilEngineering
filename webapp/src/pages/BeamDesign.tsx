import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { designBeam, beamServiceDeflection, type BeamDesignInput, type BeamDesignResult } from '../engine/beamDesign'
import type { BeamSupport } from '../engine/beamDeflection'
import type { CriticalSection } from '../engine/beamSections'
import { BeamSchematic } from '../components/BeamSchematic'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import { buildBeamSolution } from '../lib/beamSolution'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
import { Math as KTex } from '../lib/math'
import { f0, f1 } from '../lib/format'
import 'katex/dist/katex.min.css'

interface FormState extends BeamDesignInput { fyt: number; legs: number; comprBarDia: number }

const DEFAULTS: FormState = {
  b: 300, h: 500, cover: 40, barDia: 20, comprBarDia: 16, stirrupDia: 10,
  fc: 28, fy: 415, fyt: 415, Mu: 180, Vu: 150, legs: 2,
}

const REGION: Record<string, string> = {
  none: 'No stirrups required',
  minimum: 'Minimum stirrups',
  designed: 'Stirrups designed',
  inadequate: '⚠ Section inadequate',
}

/** Storage key for the Beam Analysis → multi-section handoff. */
export const SECTIONS_HANDOFF_KEY = 'beam-critical-sections'

let uid = 1
interface SecRow extends CriticalSection { id: number }

const DEF_SECTIONS: SecRow[] = [
  { id: uid++, label: 'Midspan', x: 3, Mu: 180, Vu: 30 },
  { id: uid++, label: 'Support', x: 0, Mu: -120, Vu: 150 },
]

function sectionOK(r: BeamDesignResult): boolean {
  return r.flexOK && r.comprEffective && r.comprNAOK && r.region !== 'inadequate'
}

export default function BeamDesign() {
  const [params] = useSearchParams()

  // Handoffs from Beam Analysis: ?mu&vu (single) or ?sections=auto (multi,
  // via sessionStorage — the list is too rich for query params).
  const handoff = useMemo(() => {
    if (params.get('sections') === 'auto') {
      try {
        const raw = sessionStorage.getItem(SECTIONS_HANDOFF_KEY)
        if (raw) {
          const secs = (JSON.parse(raw) as CriticalSection[]).map((s) => ({ ...s, id: uid++ }))
          if (secs.length) return { multi: true as const, sections: secs }
        }
      } catch { /* fall through to defaults */ }
    }
    const mu = parseFloat(params.get('mu') ?? ''), vu = parseFloat(params.get('vu') ?? '')
    return {
      multi: false as const,
      single: {
        ...(Number.isFinite(mu) ? { Mu: mu } : {}),
        ...(Number.isFinite(vu) ? { Vu: vu } : {}),
      },
    }
  }, [params])

  const [f, setF] = useState<FormState>({ ...DEFAULTS, ...(handoff.multi ? {} : handoff.single) })
  const [span, setSpan] = useState<number>(NaN)
  const [support, setSupport] = useState<BeamSupport>('simple')
  const [svcWD, setSvcWD] = useState<number>(NaN)
  const [svcWL, setSvcWL] = useState<number>(NaN)
  const [multi, setMulti] = useState<boolean>(handoff.multi)
  const [sections, setSections] = useState<SecRow[]>(handoff.multi ? handoff.sections : DEF_SECTIONS)
  const [selId, setSelId] = useState<number | null>(handoff.multi ? handoff.sections[0].id : null)
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))
  const setSec = (id: number, patch: Partial<SecRow>) =>
    setSections((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  const sectionGeomOK = useMemo(() => {
    const keys: (keyof FormState)[] = ['b', 'h', 'cover', 'barDia', 'stirrupDia', 'fc', 'fy', 'fyt', 'legs']
    return keys.every((k) => Number.isFinite(f[k] as number)) && f.b > 0 && f.h > 0 && f.fc > 0 && f.fy > 0
      && f.h - f.cover - f.stirrupDia - f.barDia / 2 > 0
  }, [f])

  // Per-section designs (multi) — hogging sections design with |Mu|.
  const designs = useMemo(() => {
    if (!sectionGeomOK || !multi) return []
    return sections.map((s) => {
      if (!Number.isFinite(s.Mu) || !Number.isFinite(s.Vu)) return null
      return designBeam({ ...f, Mu: Math.abs(s.Mu), Vu: Math.abs(s.Vu) })
    })
  }, [f, sections, multi, sectionGeomOK])

  // The active demand: selected section (multi) or the single Mu/Vu fields.
  const selIdx = multi ? Math.max(0, sections.findIndex((s) => s.id === selId)) : -1
  const active = multi ? sections[selIdx] ?? sections[0] : null
  const hogging = multi ? (active?.Mu ?? 0) < 0 : f.Mu < 0

  const singleValid = sectionGeomOK && Number.isFinite(f.Mu) && Number.isFinite(f.Vu)
  const r = multi
    ? designs[selIdx] ?? null
    : singleValid ? designBeam({ ...f, Mu: Math.abs(f.Mu) }) : null
  const demand = multi
    ? { Mu: Math.abs(active?.Mu ?? 0), Vu: Math.abs(active?.Vu ?? 0) }
    : { Mu: Math.abs(f.Mu), Vu: f.Vu }
  const solution = useMemo(
    () => (r ? buildBeamSolution({ ...f, ...demand }, r) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r, f, demand.Mu, demand.Vu],
  )

  const deflection = useMemo(() => {
    if (!r || !Number.isFinite(span) || !Number.isFinite(svcWD) || !Number.isFinite(svcWL)) return null
    return beamServiceDeflection({
      b: f.b, h: f.h, d: r.d, As: r.As,
      AsPrime: r.mode === 'DRRB' ? r.AsPrime : 0, dPrime: r.dPrime,
      fc: f.fc, fy: f.fy, span, support, wD: svcWD, wL: svcWL,
    })
  }, [r, f.b, f.h, f.fc, f.fy, span, support, svcWD, svcWL])

  const stirrupText = (rr: BeamDesignResult) =>
    rr.region === 'designed' || rr.region === 'minimum'
      ? `⌀${f.stirrupDia} ${f.legs}-leg @ ${f0(rr.sAdopt)} mm`
      : rr.region === 'none' ? '— none' : '⚠ enlarge'

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">Beam Design</h1>
      <p className="no-print mt-1 text-slate-600">
        Rectangular RC beam — SRRB/DRRB flexure, §407.7 bar layout with automatic layering (Varignon d), one-way
        shear & 135° hooks. Design one section, or a whole list of critical sections (negative Mu = hogging) on the
        same cross-section — auto-detected from Beam Analysis or entered by hand. NSCP 2015 / ACI 318-14.
      </p>
      <ReportControls title="Beam Design Report" />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card title="Section">
            <Num label="Width b" unit="mm" value={f.b} onChange={set('b')} />
            <Num label="Total depth h" unit="mm" value={f.h} onChange={set('h')} />
            <Num label="Clear cover" unit="mm" value={f.cover} onChange={set('cover')} />
            <Num label={<>Bar <KTex tex="d_b" /></>} unit="mm" value={f.barDia} onChange={set('barDia')} />
            <Num label={<>Compr. bar <KTex tex="d_b'" /></>} unit="mm" value={f.comprBarDia} onChange={set('comprBarDia')} />
            <Num label={<>Stirrup <KTex tex="d_s" /></>} unit="mm" value={f.stirrupDia} onChange={set('stirrupDia')} />
            <Num label="Stirrup legs" value={f.legs} onChange={set('legs')} />
          </Card>
          <Card title="Materials">
            <Num label={<KTex tex="f'_c" />} unit="MPa" value={f.fc} onChange={set('fc')} />
            <Num label={<KTex tex="f_y" />} unit="MPa" value={f.fy} onChange={set('fy')} />
            <Num label={<KTex tex="f_{yt}" />} unit="MPa" value={f.fyt} onChange={set('fyt')} />
          </Card>

          <Card title="Serviceability (optional)">
            <Num label="Span" unit="m" value={span} onChange={setSpan} />
            <Pick label="Support" value={support} onChange={(v) => setSupport(v as BeamSupport)}
              options={[['simple', 'Simply supported'], ['one-end', 'One end continuous'], ['both-ends', 'Both ends continuous'], ['cantilever', 'Cantilever']]} />
            <Num label={<>Dead load <KTex tex="w_D" /></>} unit="kN/m" value={svcWD} onChange={setSvcWD} />
            <Num label={<>Live load <KTex tex="w_L" /></>} unit="kN/m" value={svcWL} onChange={setSvcWL} />
          </Card>

          <Card title="Factored demands">
            <Pick label="Mode" value={multi ? 'multi' : 'single'}
              onChange={(v) => setMulti(v === 'multi')}
              options={[['single', 'Single section'], ['multi', 'Multiple critical sections']]} />
            {!multi && <>
              <Num label={<KTex tex="M_u" />} unit="kN·m" value={f.Mu} onChange={set('Mu')} />
              <Num label={<KTex tex="V_u" />} unit="kN" value={f.Vu} onChange={set('Vu')} />
            </>}
            {hogging && !multi && (
              <p className="col-span-full text-xs text-slate-400">Negative Mu — hogging: designed with |Mu|; the tension steel goes at the TOP.</p>
            )}
          </Card>

          {multi && (
            <fieldset className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <legend className="px-2 text-[1.02rem] font-bold text-[#0056b3]">Critical sections</legend>
              <div className="no-print mb-3 flex flex-wrap items-center gap-2">
                <button type="button"
                  onClick={() => setSections((ss) => [...ss, { id: uid++, label: `Section ${ss.length + 1}`, x: 0, Mu: 50, Vu: 30 }])}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-[#0056b3] hover:border-[#0056b3] hover:bg-blue-50">
                  + Add section
                </button>
                <span className="text-xs text-slate-400">or auto-detect from <Link to="/beam-analysis" className="text-[#0056b3] hover:underline">Beam Analysis</Link>. Negative Mu = hogging (top steel).</span>
              </div>
              <div className="space-y-3">
                {sections.map((s) => (
                  <div key={s.id} className={`rounded-lg border p-3 ${s.id === active?.id ? 'border-[#0056b3] bg-blue-50/40' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="mb-2 flex items-center justify-between">
                      <input value={s.label} onChange={(e) => setSec(s.id, { label: e.target.value })}
                        className="w-1/2 rounded border border-transparent bg-transparent px-1 text-xs font-bold uppercase tracking-wide text-slate-600 focus:border-slate-300 focus:bg-white" />
                      <span className="flex gap-3">
                        <button type="button" onClick={() => setSelId(s.id)} className="text-xs text-[#0056b3] hover:underline">view</button>
                        <button type="button" onClick={() => setSections((ss) => ss.filter((q) => q.id !== s.id))} className="text-xs text-red-500 hover:underline">remove</button>
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <Num label="x" unit="m" value={s.x} onChange={(v) => setSec(s.id, { x: v })} />
                      <Num label={<KTex tex="M_u" />} unit="kN·m" value={s.Mu} onChange={(v) => setSec(s.id, { Mu: v })} />
                      <Num label={<KTex tex="V_u" />} unit="kN" value={s.Vu} onChange={(v) => setSec(s.id, { Vu: v })} />
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          )}
        </div>

        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          {multi && (
            <ResultCard title="Section schedule">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-left uppercase tracking-wide text-slate-500">
                      <th className="py-1 pr-2 font-semibold">Section</th>
                      <th className="py-1 pr-2 font-semibold">Mode</th>
                      <th className="py-1 pr-2 font-semibold">Tension</th>
                      <th className="py-1 pr-2 font-semibold">Compr.</th>
                      <th className="py-1 font-semibold">Stirrups</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sections.map((s, i) => {
                      const d = designs[i]
                      const bad = d ? !sectionOK(d) : true
                      return (
                        <tr key={s.id} onClick={() => setSelId(s.id)}
                          className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50 ${
                            bad ? 'bg-red-50 text-red-700' : ''} ${s.id === active?.id ? 'outline outline-1 outline-[#0056b3]' : ''}`}>
                          <td className="py-1 pr-2">{s.label}{s.Mu < 0 ? ' (hog)' : ''}</td>
                          <td className="py-1 pr-2">{d ? d.mode : '—'}</td>
                          <td className="py-1 pr-2">{d ? `${d.bars}⌀${f.barDia}${d.layers.length > 1 ? ` (${d.layers.join('+')})` : ''}` : '—'}</td>
                          <td className="py-1 pr-2">{d && d.comprBars > 0 ? `${d.comprBars}⌀${f.comprBarDia}` : '—'}</td>
                          <td className="py-1">{d ? (d.sAdopt > 0 ? `@${f0(d.sAdopt)}` : d.region === 'none' ? 'none' : '⚠') : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Click a row to view its drawing, results and worked solution. Red rows have errors.</p>
            </ResultCard>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">
              Section preview{multi && active ? ` — ${active.label}` : ''}
            </h2>
            {r ? (
              <BeamSchematic b={f.b} h={f.h} cover={f.cover} barDia={f.barDia} stirrupDia={f.stirrupDia}
                bars={r.bars} d={r.d} dPrime={r.comprLayers.length > 0 ? r.dPrime : undefined}
                layers={r.layers} comprLayers={r.comprLayers}
                comprBars={r.comprBars} comprBarDia={f.comprBarDia}
                naDepth={r.cNA} flexOK={r.flexOK} hogging={hogging} />
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">Enter a valid section (d must be positive).</p>
            )}
          </div>

          {r && (
            <ResultCard title={`Results${multi && active ? ` — ${active.label}` : ''}`}>
              {!r.flexOK && (
                <Row alert label="⚠ Section" value={`${r.bars} bars cannot fit`}
                  sub="layout diverges — enlarge b or h" />
              )}
              {hogging && <Row label="Orientation" value="hogging (−Mu)" sub="tension steel at the top" />}
              <Row label="Effective depth d" value={`${f1(r.d)} mm`}
                sub={r.layers.length > 1 ? `dt=${f1(r.dt)} · ȳ=${f1(r.yBar)} mm` : undefined} />
              <Row label="Flexure mode" value={r.mode}
                sub={`φMn,max=${f1(r.phiMnMax)} kN·m`} />
              <Row label="Tension steel" value={`${r.bars} ⌀${f.barDia} mm`}
                sub={`As=${f0(r.As)} mm² · ${r.usedMin ? 'ρ_min' : `ρ=${r.rho.toFixed(4)}`}`} />
              <Row label="ρ limits"
                value={`ρ=${r.rho.toFixed(4)}`}
                sub={`ρ_min=${r.rhoMin.toFixed(4)} · ρ_b=${r.rhoB.toFixed(4)} · ρ_max=${r.rhoMax.toFixed(4)}`} />
              <Row label="Layers" value={r.layers.length > 1 ? `${r.layers.length} (${r.layers.join(' + ')})` : '1'}
                sub={`s_clear=${f0(r.sClear)} ≥ ${f0(r.sMinClear)} mm`} />
              {r.mode === 'DRRB' && (
                <Row alert={!r.comprEffective} label="Compression steel"
                  value={r.comprEffective ? `${r.comprBars} ⌀${f.comprBarDia} mm` : '✗ ineffective'}
                  sub={r.comprEffective
                    ? `A's=${f0(r.AsPrime)} mm² · f's=${f1(r.fsPrime)} MPa${r.fsYields ? '' : ' (n.y.)'}`
                    : `f's=${f1(r.fsPrime)} ≤ 0.85f'c`} />
              )}
              {r.comprLayers.length > 0 && (
                <Row label="Compr. layers"
                  value={r.comprLayers.length > 1 ? `${r.comprLayers.length} (${r.comprLayers.join(' + ')})` : '1'}
                  sub={`d'=${f1(r.dPrime)} mm · s'_clear=${f0(r.comprSClear)} ≥ ${f0(r.comprSMinClear)}`} />
              )}
              {r.comprLayers.length > 0 && (
                <Row alert={!r.comprNAOK} label="NA check" value={r.comprNAOK ? '✓ above NA' : '✗ crosses NA'}
                  sub={`deepest d'=${f0(r.dPrimeExtreme)} vs c=${f0(r.cNA)} mm`} />
              )}
              <Row label={<KTex tex="\phi V_c" />} value={`${f1(r.phiVc)} kN`} sub={`Vc=${f1(r.Vc)}`} />
              <Row alert={r.region === 'inadequate'} label="Shear" value={REGION[r.region]} />
              <Row label="Stirrups" value={stirrupText(r)}
                sub={r.region === 'designed' ? `s_req=${f0(r.sReq)} · s_max=${f0(r.sMax)} mm` : undefined} />
              <Row label="Hooks (135°)" value={`ext ${f0(r.stirrupHookExt)} mm`}
                sub={`bend Ø ${f0(r.stirrupBendDia)} mm (4ds)`} />
            </ResultCard>
          )}
          {deflection && (
            <ResultCard title="Serviceability — ACI 318-14 §24.2">
              <Row label="Min. thickness h_min" value={`${deflection.hMin.toFixed(0)} mm`}
                alert={!deflection.hMinOK}
                sub={`Table 409.3.1.1 (${deflection.support})${deflection.hMinOK ? ' — h ≥ h_min ✓, deflection check waivable' : ' — h < h_min ✗, deflection governs'}`} />
              <Row label="Section state" value={deflection.cracked ? 'Cracked (Ma > Mcr)' : 'Uncracked'} />
              <Row label={<><KTex tex="I_g" /> (gross)</>} value={`${(deflection.Ig / 1e6).toFixed(0)} ×10⁶ mm⁴`} />
              <Row label={<><KTex tex="I_{cr}" /> (cracked)</>} value={`${(deflection.Icr / 1e6).toFixed(0)} ×10⁶ mm⁴`} />
              <Row label={<><KTex tex="M_{cr}" /></>} value={`${deflection.Mcr.toFixed(1)} kN·m`} />
              <Row label={<><KTex tex="I_e" /> (Branson)</>} value={`${(deflection.Ie / 1e6).toFixed(0)} ×10⁶ mm⁴`} />
              <Row label={<>Immed. dead <KTex tex="\delta_D" /></>} value={`${deflection.deltaD.toFixed(1)} mm`} />
              <Row label={<>Immed. live <KTex tex="\delta_L" /></>} value={`${deflection.deltaL.toFixed(1)} mm`}
                alert={!deflection.liveOK}
                sub={`L/360 = ${deflection.limitL360.toFixed(1)} mm${deflection.liveOK ? ' ✓' : ' ✗'}`} />
              <Row label={<>Long-term <KTex tex="\lambda_\Delta" /></>}
                value={deflection.lambdaDelta.toFixed(3)}
                sub="ξ=2.0 (≥5 yr), §24.2.4.1.1" />
              <Row label={<>Total <KTex tex="\delta_{total}" /></>}
                value={`${deflection.deltaTotal.toFixed(1)} mm`}
                alert={!deflection.totalOK}
                sub={`L/240 = ${deflection.limitL240.toFixed(1)} mm${deflection.totalOK ? ' ✓' : ' ✗'}`} />
            </ResultCard>
          )}
        </div>
      </div>

      {solution && (
        <WorkedSolution steps={solution}
          title={multi && active ? `Solution — ${active.label}` : 'Solution — step by step'} />
      )}
    </div>
  )
}
