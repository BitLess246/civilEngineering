import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  generalBearingCapacity, compareMethods, BEARING_METHOD_LABEL, type BearingMethod,
} from '../engine/bearingGeneral'
import { ReportControls } from '../components/ReportControls'
import { SoilLayerPicker } from '../components/SoilLayerPicker'
import { WorkedSolution } from '../components/WorkedSolution'
import { buildBearingSolution } from '../lib/geotechPageSolutions'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
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
    <main className="mx-auto max-w-[1400px] px-5 py-8 sm:px-7">
      <Link to="/geotech" className="no-print text-sm text-[#0056b3] hover:underline">← Geotechnical</Link>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#0056b3]">Bearing Capacity</h1>
      <p className="no-print mt-1 max-w-3xl text-sm text-slate-600">
        Shallow-foundation bearing capacity by the general equation, with shape, depth and
        inclination factors and Meyerhof&rsquo;s effective area for eccentric load. Nq and Nc are
        Prandtl/Reissner in all three methods; only Nγ and the shape/depth factors differ — so the
        method is an explicit input and the result records which one produced it.
      </p>
      <ReportControls title="Bearing Capacity" badges={['Meyerhof', 'Hansen', 'Vesić']} />

      <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
        <div className="flex flex-col gap-5">
          <Card title="Soil">
            <div className="col-span-full">
              <SoilLayerPicker want={['c', 'phiDeg', 'gamma', 'gammaSat']} onApply={(f) => {
                if (f.c != null) setC(f.c)
                if (f.phiDeg != null) setPhi(f.phiDeg)
                if (f.gamma != null) setGamma(f.gamma)
                if (f.gammaSat != null) setGammaSat(f.gammaSat)
              }} />
            </div>
            <Num label="Cohesion c" unit="kPa" value={c} onChange={setC} />
            <Num label="φ" unit="°" value={phi} onChange={setPhi} />
            <Num label="γ (moist)" unit="kN/m³" value={gamma} onChange={setGamma} />
            <Num label="γsat" unit="kN/m³" value={gammaSat} onChange={setGammaSat} />
            <label className="flex flex-col text-sm">
              <span className="mb-1 text-[11.5px] font-semibold text-[#5c6675]">Water table depth (m)</span>
              <input type="number" step="0.5" value={dw} placeholder="none"
                onChange={(e) => setDw(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="rounded-md border border-[#d6d3c9] bg-[#fcfbf8] px-2.5 py-1.5 text-[13px]" />
            </label>
          </Card>

          <Card title="Footing">
            <Num label="Width B" unit="m" value={B} onChange={setB} />
            {!strip && <Num label="Length L" unit="m" value={L} onChange={setL} />}
            <Num label="Founding depth Df" unit="m" value={Df} onChange={setDf} />
            <Num label="Eccentricity eB" unit="m" value={eB} onChange={setEB} />
            <Num label="Load inclination β" unit="°" value={incl} onChange={setIncl} />
            <label className="col-span-full flex items-center gap-2 text-sm">
              <input type="checkbox" checked={strip} onChange={(e) => setStrip(e.target.checked)} />
              <span>Strip footing (L → ∞)</span>
            </label>
          </Card>

          <Card title="Method &amp; safety">
            <Pick label="Method" value={method} onChange={(v) => setMethod(v as BearingMethod)}
              options={METHODS.map((m) => [m, BEARING_METHOD_LABEL[m]])} />
            <Num label="Factor of safety" value={FS} onChange={setFS} step="0.5" />
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          {solved.error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">{solved.error}</p>
          )}
          {r && (
            <>
              <ResultCard title="Capacity">
                <Row label="Ultimate qult" value={`${f2(r.qult)} kPa`} />
                <Row label="Net ultimate qnet" value={`${f2(r.qnet)} kPa`} />
                <Row label={`Allowable NET (FS ${f1(FS)})`} value={`${f2(r.qallowNet)} kPa`}
                  sub="compare a footing pressure to this" />
                <Row label="Allowable gross" value={`${f2(r.qallowGross)} kPa`} />
              </ResultCard>

              <ResultCard title="Factors">
                <Row label="Nc / Nq / Nγ" value={`${f2(r.Nc)} / ${f2(r.Nq)} / ${f2(r.Ngamma)}`} />
                <Row label="Shape sc / sq / sγ" value={`${f3(r.sc)} / ${f3(r.sq)} / ${f3(r.sgamma)}`} />
                <Row label="Depth dc / dq / dγ" value={`${f3(r.dc)} / ${f3(r.dq)} / ${f3(r.dgamma)}`} />
                <Row label="Inclination ic / iq / iγ" value={`${f3(r.ic)} / ${f3(r.iq)} / ${f3(r.igamma)}`} />
                <Row label="Effective B′" value={`${f2(r.effectiveB)} m`} />
                <Row label="Surcharge q" value={`${f2(r.surcharge)} kPa`} />
                <Row label="γ in the Nγ term" value={`${f2(r.gammaEffective)} kN/m³`} />
              </ResultCard>

              {all && (
                <ResultCard title="All three methods, same footing">
                  {METHODS.map((m) => (
                    <Row key={m} label={BEARING_METHOD_LABEL[m]} value={`${f2(all[m].qult)} kPa`}
                      sub={m === method ? 'selected' : undefined} />
                  ))}
                  <p className="mt-2 text-[10.5px] text-slate-500">
                    They disagree by design. A bearing pressure quoted without naming its method is
                    not reproducible.
                  </p>
                </ResultCard>
              )}

              {r.notes.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  {r.notes.map((n, k) => <li key={k} className="text-[11px] text-amber-900">{n}</li>)}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      {steps.length > 0 && <WorkedSolution steps={steps} />}
    </main>
  )
}
