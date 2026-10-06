import { useState, useMemo } from 'react'
import {
  generalBearingCapacity, compareMethods, BEARING_METHOD_LABEL, type BearingMethod,
} from '../engine/bearingGeneral'
import { SoilLayerPicker } from '../components/SoilLayerPicker'
import { buildBearingSolution } from '../lib/geotechPageSolutions'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { FootingSection } from '../components/geotechSketches'
import { f1, f2, f3 } from '../lib/format'

// Split out of the old combined "Geotechnical toolkit" page. Bearing capacity
// is reached from foundation design, earth pressure from retaining walls —
// stacking them on one screen meant neither had room for a worked solution.

const METHODS: BearingMethod[] = ['meyerhof', 'hansen', 'vesic']

export default function BearingCapacity() {
  const [c, setC] = useState(20)
  const [phi, setPhi] = useState(30)
  const [gamma, setGamma] = useState(18)
  const [gammaSat, setGammaSat] = useState(20)
  const [B, setB] = useState(2)
  const [L, setL] = useState(2)
  const [strip, setStrip] = useState(false)
  const [Df, setDf] = useState(1.5)
  const [dw, setDw] = useState<number | ''>('')
  const [eB, setEB] = useState(0)
  const [incl, setIncl] = useState(0)
  const [method, setMethod] = useState<BearingMethod>('vesic')
  const [FS, setFS] = useState(3)

  const input = useMemo(() => ({
    c, phiDeg: phi, gamma, gammaSat, B, L: strip ? Infinity : L, Df,
    waterTable: dw === '' ? undefined : dw,
    eB, loadInclination: incl, FS,
  }), [c, phi, gamma, gammaSat, B, L, strip, Df, dw, eB, incl, FS])

  const solved = useMemo(() => {
    try {
      return { r: generalBearingCapacity({ ...input, method }), error: null as string | null }
    } catch (e) {
      return { r: null, error: e instanceof Error ? e.message : String(e) }
    }
  }, [input, method])

  const all = useMemo(() => (solved.r ? compareMethods(input) : null), [solved.r, input])
  const steps = useMemo(
    () => (solved.r ? buildBearingSolution({ ...input, method }, solved.r) : []),
    [solved.r, input, method])

  const r = solved.r

  return (
    <WorkspacePage title="Bearing Capacity" badges={['Geotechnical', 'Meyerhof · Hansen · Vesić']}
      intro="Shallow-foundation bearing capacity by the general equation, with shape, depth and inclination factors and Meyerhof's effective area for an eccentric load. Nq and Nc are Prandtl/Reissner in all three methods; only Nγ and the shape and depth factors differ, so the method is an explicit input and the result records which one produced it."
      inputs={<>
        <InputGroup title="Soil">
          <div className="col-span-2">
            <SoilLayerPicker want={['c', 'phiDeg', 'gamma', 'gammaSat']} onApply={(f) => {
              if (f.c != null) setC(f.c)
              if (f.phiDeg != null) setPhi(f.phiDeg)
              if (f.gamma != null) setGamma(f.gamma)
              if (f.gammaSat != null) setGammaSat(f.gammaSat)
            }} />
          </div>
          <Num label="Cohesion c" unit="kPa" value={c} onChange={setC} />
          <Num label="Friction φ" unit="°" value={phi} onChange={setPhi} />
          <Num label="γ moist" unit="kN/m³" value={gamma} onChange={setGamma} />
          <Num label="γ saturated" unit="kN/m³" value={gammaSat} onChange={setGammaSat} />
          <label className="col-span-2 flex flex-col gap-1 text-[12.5px] font-semibold text-ink">
            Water table depth (m, blank = none)
            <input type="number" step="0.5" value={dw} placeholder="none"
              onChange={(e) => setDw(e.target.value === '' ? '' : parseFloat(e.target.value))}
              className="w-full rounded-md border border-field-line bg-surface px-2.5 py-1.5 text-sm font-normal" />
          </label>
        </InputGroup>
        <InputGroup title="Footing">
          <Num label="Width B" unit="m" value={B} onChange={setB} />
          {!strip ? <Num label="Length L" unit="m" value={L} onChange={setL} /> : <div />}
          <Num label="Founding depth Df" unit="m" value={Df} onChange={setDf} />
          <Num label="Eccentricity eB" unit="m" value={eB} onChange={setEB} />
          <Num label="Load inclination β" unit="°" value={incl} onChange={setIncl} />
          <label className="col-span-2 flex items-center gap-2 text-[12.5px] font-semibold text-ink">
            <input type="checkbox" checked={strip} onChange={(e) => setStrip(e.target.checked)} className="accent-brand" />
            Strip footing (L → ∞)
          </label>
        </InputGroup>
        <InputGroup title="Method and safety">
          <div className="col-span-2">
            <Pick label="Method" value={method} onChange={(v) => setMethod(v as BearingMethod)} options={METHODS.map((m) => [m, BEARING_METHOD_LABEL[m]])} />
          </div>
          <Num label="Factor of safety" value={FS} onChange={setFS} step="0.5" />
        </InputGroup>
      </>}
      checks={r ? <>
        <CheckCard title="Allowable net pressure" basis={`${BEARING_METHOD_LABEL[method]}, FS ${f1(FS)}`} status="info" value={f2(r.qallowNet)} unit="kPa"
          formula="q_a,net = (q_ult − q) / FS"
          pairs={[{ label: 'Ultimate', value: `${f2(r.qult)} kPa` }, { label: 'Allowable gross', value: `${f2(r.qallowGross)} kPa` }]} />
        {all && <CheckCard title="Three methods" basis="same footing, q_ult" status="info" value={f2(all[method].qult)} unit="kPa selected"
          pairs={METHODS.filter((m) => m !== method).map((m) => ({ label: BEARING_METHOD_LABEL[m], value: `${f2(all[m].qult)} kPa` }))} />}
        <CheckCard title="Bearing factors" basis="Nc · Nq · Nγ" status="info" value={`${f2(r.Nc)} · ${f2(r.Nq)} · ${f2(r.Ngamma)}`}
          pairs={[{ label: 'Effective B′', value: `${f2(r.effectiveB)} m` }, { label: 'γ in Nγ term', value: `${f2(r.gammaEffective)} kN/m³` }]} />
      </> : (
        <CheckCard title="Check the inputs" basis="bearing capacity" status="warn" pillLabel="CHECK" value="—" formula={solved.error ?? 'Check the inputs.'} />
      )}
      summary={[
        { label: 'Soil', value: `c ${f2(c)} kPa, φ ${f2(phi)}°, γ ${f2(gamma)} kN/m³` },
        { label: 'Footing', value: strip ? `strip, B ${f2(B)} m` : `${f2(B)} × ${f2(L)} m` },
        { label: 'Founding depth', value: `${f2(Df)} m` },
        { label: 'Water table', value: dw === '' ? 'none' : `${f2(dw)} m` },
      ]}
      drawing={r ? { title: 'Footing section', node: <div data-pdf-drawing><FootingSection B={B} Df={Df} dw={dw === '' ? undefined : dw} eB={eB} incl={incl} effectiveB={r.effectiveB} surcharge={r.surcharge} strip={strip} /></div> } : undefined}
      resultsCaption={r && r.notes.length ? r.notes.join(' ') : undefined}
      results={r ? [
        { check: 'Ultimate q_ult', basis: BEARING_METHOD_LABEL[method], demand: `${f2(r.qult)} kPa`, status: 'info' as const },
        { check: 'Net ultimate', basis: 'q_ult − q', demand: `${f2(r.qnet)} kPa`, status: 'info' as const },
        { check: 'Allowable net', basis: `÷ FS ${f1(FS)}`, demand: `${f2(r.qallowNet)} kPa`, status: 'info' as const },
        { check: 'Shape factors', basis: 'sc · sq · sγ', demand: `${f3(r.sc)} · ${f3(r.sq)} · ${f3(r.sgamma)}`, status: 'info' as const },
        { check: 'Depth factors', basis: 'dc · dq · dγ', demand: `${f3(r.dc)} · ${f3(r.dq)} · ${f3(r.dgamma)}`, status: 'info' as const },
        { check: 'Inclination factors', basis: 'ic · iq · iγ', demand: `${f3(r.ic)} · ${f3(r.iq)} · ${f3(r.igamma)}`, status: 'info' as const },
      ] : [{ check: 'Capacity', basis: solved.error ?? 'invalid input', demand: '—', status: 'warn' as const }]}
      steps={steps.length ? steps : [{ title: 'Check the inputs', lines: [{ text: solved.error ?? 'Check the inputs.' }] }]}
      references={[
        { topic: 'General bearing equation', basis: 'c Nc sc dc ic + q Nq sq dq iq + ½ γ B′ Nγ sγ dγ iγ', source: 'Meyerhof (1963); Hansen (1970); Vesić (1973)' },
        { topic: 'Effective area', basis: 'B′ = B − 2e', source: 'Meyerhof (1953)' },
        { topic: 'Water-table correction', basis: 'three cases on dw against Df and Df + B', source: 'Das, Principles of Foundation Engineering, Ch. 4' },
      ]}
    />
  )
}
