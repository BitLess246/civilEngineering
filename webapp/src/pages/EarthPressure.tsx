import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { activeThrust, passiveThrust } from '../engine/geotech'
import { coulombActiveThrust, coulombPassiveThrust, mononobeOkabe } from '../engine/coulomb'
import { ReportControls } from '../components/ReportControls'
import { SoilLayerPicker } from '../components/SoilLayerPicker'
import { WorkedSolution } from '../components/WorkedSolution'
import { buildEarthPressureSolution } from '../lib/geotechPageSolutions'
import { Num, Card, ResultCard, Row } from '../components/qty'
import { f1, f2, f3 } from '../lib/format'

// Split out of the old combined "Geotechnical toolkit" page, which stacked
// earth pressure, bearing capacity and slope stability on one screen. They
// answer unrelated questions, are reached from different parts of a job, and
// none of them had a worked solution.

export default function EarthPressure() {
  const [gamma, setGamma] = useState(18)
  const [H, setH] = useState(5)
  const [phi, setPhi] = useState(30)
  const [q, setQ] = useState(10)
  // Coulomb extras — all zero reduces Coulomb exactly to Rankine.
  const [delta, setDelta] = useState(20)
  const [theta, setTheta] = useState(0)
  const [beta, setBeta] = useState(0)
  const [kh, setKh] = useState(0)
  const [kv, setKv] = useState(0)

  const rankA = useMemo(() => activeThrust({ gamma, H, phiDeg: phi, surcharge: q }), [gamma, H, phi, q])
  const rankP = useMemo(() => passiveThrust({ gamma, H, phiDeg: phi }), [gamma, H, phi])

  // The wall geometry is rebuilt inside each memo rather than held in a
  // render-scoped object: a fresh object every render is a new dependency
  // every render, which defeats the memo it is passed to.
  const coulomb = useMemo(() => {
    const g = { phiDeg: phi, deltaDeg: delta, thetaDeg: theta, betaDeg: beta, gamma, H }
    try {
      return {
        active: coulombActiveThrust({ ...g, surcharge: q }),
        passive: coulombPassiveThrust(g),
        error: null as string | null,
      }
    } catch (e) {
      return { active: null, passive: null, error: e instanceof Error ? e.message : String(e) }
    }
  }, [phi, delta, theta, beta, gamma, H, q])

  const seismic = useMemo(() => {
    if (kh <= 0 || coulomb.error) return { r: null, error: null as string | null }
    try {
      const g = { phiDeg: phi, deltaDeg: delta, thetaDeg: theta, betaDeg: beta, gamma, H }
      return { r: mononobeOkabe({ ...g, kh, kv }), error: null }
    } catch (e) {
      return { r: null, error: e instanceof Error ? e.message : String(e) }
    }
  }, [phi, delta, theta, beta, gamma, H, kh, kv, coulomb.error])

  const steps = useMemo(() => buildEarthPressureSolution(
    { gamma, H, phiDeg: phi, surcharge: q, deltaDeg: delta, thetaDeg: theta, betaDeg: beta, kh, kv },
    rankA, rankP, coulomb.active, coulomb.passive, seismic.r,
  ), [gamma, H, phi, q, delta, theta, beta, kh, kv, rankA, rankP, coulomb, seismic])

  const notes = [...(coulomb.active?.notes ?? []), ...(coulomb.passive?.notes ?? []), ...(seismic.r?.notes ?? [])]

  return (
    <main className="mx-auto max-w-[1400px] px-5 py-8 sm:px-7">
      <Link to="/geotech" className="no-print text-sm text-[#0056b3] hover:underline">← Geotechnical</Link>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#0056b3]">Lateral Earth Pressure</h1>
      <p className="no-print mt-1 max-w-3xl text-sm text-slate-600">
        Rankine and Coulomb active and passive thrust, with the Mononobe–Okabe seismic case.
        Rankine needs a smooth vertical wall and level fill; Coulomb carries wall friction, an
        inclined back face and a sloping backfill, and reduces exactly to Rankine when all three are zero.
      </p>
      <ReportControls title="Lateral Earth Pressure" badges={['Rankine', 'Coulomb', 'NSCP 2015']} />

      <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
        <div className="flex flex-col gap-5">
          <Card title="Soil &amp; wall">
            <div className="col-span-full">
              <SoilLayerPicker want={['phiDeg', 'gamma']} onApply={(f) => {
                if (f.phiDeg != null) setPhi(f.phiDeg)
                if (f.gamma != null) setGamma(f.gamma)
              }} />
            </div>
            <Num label="γ — unit weight" unit="kN/m³" value={gamma} onChange={setGamma} />
            <Num label="φ — friction angle" unit="°" value={phi} onChange={setPhi} />
            <Num label="Wall height H" unit="m" value={H} onChange={setH} />
            <Num label="Surcharge q" unit="kPa" value={q} onChange={setQ} />
          </Card>

          <Card title="Coulomb geometry" hint="all zero → Rankine">
            <Num label="Wall friction δ" unit="°" value={delta} onChange={setDelta} />
            <Num label="Back face θ from vertical" unit="°" value={theta} onChange={setTheta} />
            <Num label="Backfill slope β" unit="°" value={beta} onChange={setBeta} />
          </Card>

          <Card title="Seismic (Mononobe–Okabe)" hint="kh = 0 disables">
            <Num label="Horizontal kh" value={kh} onChange={setKh} step="0.05" />
            <Num label="Vertical kv" value={kv} onChange={setKv} step="0.05" />
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <ResultCard title="Rankine">
            <Row label="Ka" value={f3(rankA.K)} />
            <Row label="Active thrust Pa" value={`${f2(rankA.P)} kN/m`}
              sub={`acts ${f2(rankA.lineOfAction)} m above base`} />
            <Row label="Pressure at base" value={`${f2(rankA.basePressure)} kPa`} />
            <Row label="Kp" value={f3(rankP.K)} />
            <Row label="Passive thrust Pp" value={`${f2(rankP.P)} kN/m`} />
          </ResultCard>

          {coulomb.error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">{coulomb.error}</p>
          )}
          {coulomb.active && (
            <ResultCard title="Coulomb">
              <Row label="Ka" value={f3(coulomb.active.K)} sub={`Rankine ${f3(rankA.K)}`} />
              <Row label="Active thrust Pa" value={`${f2(coulomb.active.P)} kN/m`}
                sub={`${f1(coulomb.active.inclinationDeg)}° from horizontal`} />
              <Row label="Horizontal / vertical"
                value={`${f2(coulomb.active.horizontal)} / ${f2(coulomb.active.vertical)} kN/m`} />
              <Row label="Acts at" value={`${f2(coulomb.active.lineOfAction)} m above base`} />
              {coulomb.passive && <Row label="Kp" value={f3(coulomb.passive.K)} />}
              {coulomb.passive && <Row label="Passive thrust Pp" value={`${f2(coulomb.passive.P)} kN/m`} />}
            </ResultCard>
          )}

          {seismic.error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">{seismic.error}</p>
          )}
          {seismic.r && (
            <ResultCard title="Mononobe–Okabe (seismic)">
              <Row label="ψ — inertia angle" value={`${f2(seismic.r.psiDeg)}°`} />
              <Row label="Kae" value={f3(seismic.r.K)} />
              <Row label="Total Pae" value={`${f2(seismic.r.P)} kN/m`} />
              <Row label="Static Pa" value={`${f2(seismic.r.staticP)} kN/m`} />
              <Row label="Increment ΔPae" value={`${f2(seismic.r.increment)} kN/m`}
                sub={`at ${f2(seismic.r.incrementLineOfAction)} m`} />
              <Row label="Combined line of action" value={`${f2(seismic.r.lineOfAction)} m`} />
            </ResultCard>
          )}

          {notes.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3">
              {notes.map((n, k) => <li key={k} className="text-[11px] text-amber-900">{n}</li>)}
            </ul>
          )}
        </div>
      </div>

      <WorkedSolution steps={steps} />
    </main>
  )
}
