import { useState, useMemo } from 'react'
import { activeThrust, passiveThrust } from '../engine/geotech'
import { coulombActiveThrust, coulombPassiveThrust, mononobeOkabe } from '../engine/coulomb'
import { SoilLayerPicker } from '../components/SoilLayerPicker'
import { buildEarthPressureSolution } from '../lib/geotechPageSolutions'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { WallPressure } from '../components/geotechSketches'
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

  const act = coulomb.active
  const errors = [coulomb.error, seismic.error].filter((e): e is string => !!e)
  return (
    <WorkspacePage title="Lateral Earth Pressure" badges={['Geotechnical', 'Rankine · Coulomb · M–O']}
      intro="Rankine and Coulomb active and passive thrust, with the Mononobe–Okabe seismic case. Rankine needs a smooth vertical wall and level fill; Coulomb carries wall friction, an inclined back face and a sloping backfill, and reduces exactly to Rankine when all three are zero."
      inputs={<>
        <InputGroup title="Soil and wall">
          <div className="col-span-2">
            <SoilLayerPicker want={['phiDeg', 'gamma']} onApply={(f) => {
              if (f.phiDeg != null) setPhi(f.phiDeg)
              if (f.gamma != null) setGamma(f.gamma)
            }} />
          </div>
          <Num label="Unit weight γ" unit="kN/m³" value={gamma} onChange={setGamma} />
          <Num label="Friction φ" unit="°" value={phi} onChange={setPhi} />
          <Num label="Wall height H" unit="m" value={H} onChange={setH} />
          <Num label="Surcharge q" unit="kPa" value={q} onChange={setQ} />
        </InputGroup>
        <InputGroup title="Coulomb geometry" hint="All zero reduces Coulomb to Rankine.">
          <Num label="Wall friction δ" unit="°" value={delta} onChange={setDelta} />
          <Num label="Back face θ" unit="°" value={theta} onChange={setTheta} />
          <Num label="Backfill slope β" unit="°" value={beta} onChange={setBeta} />
        </InputGroup>
        <InputGroup title="Seismic (Mononobe–Okabe)" hint="kh = 0 disables the seismic case.">
          <Num label="Horizontal kh" value={kh} onChange={setKh} step="0.05" />
          <Num label="Vertical kv" value={kv} onChange={setKv} step="0.05" />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Active thrust" basis={act ? 'Coulomb' : 'Rankine'} status="info" value={f2(act?.P ?? rankA.P)} unit="kN/m"
          formula={act ? 'Pa = ½ Ka γ H² + Ka q H, at (δ + θ)' : 'Pa = ½ Ka γ H² + Ka q H'}
          pairs={[{ label: 'Ka', value: f3(act?.K ?? rankA.K) }, { label: 'Acts at', value: `${f2(act?.lineOfAction ?? rankA.lineOfAction)} m above base` }]} />
        <CheckCard title="Passive thrust" basis={coulomb.passive ? 'Coulomb' : 'Rankine'} status="info" value={f2(coulomb.passive?.P ?? rankP.P)} unit="kN/m"
          pairs={[{ label: 'Kp', value: f3(coulomb.passive?.K ?? rankP.K) }, { label: 'Rankine Kp', value: f3(rankP.K) }]} />
        {seismic.r && <CheckCard title="Seismic thrust" basis="Mononobe–Okabe" status="info" value={f2(seismic.r.P)} unit="kN/m"
          formula="ψ = arctan[kh / (1 − kv)]"
          pairs={[{ label: 'Increment ΔPae', value: `${f2(seismic.r.increment)} kN/m` }, { label: 'Kae', value: f3(seismic.r.K) }]} />}
        {errors.map((e) => <CheckCard key={e} title="Geometry" basis="Coulomb wedge" status="fail" pillLabel="NO WEDGE" value="—" formula={e} />)}
      </>}
      summary={[
        { label: 'Soil', value: `γ ${f2(gamma)} kN/m³, φ ${f2(phi)}°` },
        { label: 'Wall', value: `H ${f2(H)} m, q ${f2(q)} kPa` },
        { label: 'Coulomb', value: `δ ${f2(delta)}°, θ ${f2(theta)}°, β ${f2(beta)}°` },
        { label: 'Seismic', value: kh > 0 ? `kh ${f2(kh)}, kv ${f2(kv)}` : 'off' },
      ]}
      drawing={{ title: 'Wall and active pressure', node: <div data-pdf-drawing><WallPressure H={H} thetaDeg={act ? theta : 0} betaDeg={act ? beta : 0} q={q} gamma={gamma}
        K={act?.K ?? rankA.K} P={act?.P ?? rankA.P} lineOfAction={act?.lineOfAction ?? rankA.lineOfAction} inclinationDeg={act?.inclinationDeg ?? 0}
        seismic={seismic.r ? { increment: seismic.r.increment, at: seismic.r.incrementLineOfAction } : null} /></div> }}
      resultsCaption={notes.length ? notes.join(' ') : undefined}
      results={[
        { check: 'Rankine Ka · Pa', basis: `acts ${f2(rankA.lineOfAction)} m above base`, demand: `${f3(rankA.K)} · ${f2(rankA.P)} kN/m`, status: 'info' as const },
        { check: 'Rankine Kp · Pp', basis: 'full height', demand: `${f3(rankP.K)} · ${f2(rankP.P)} kN/m`, status: 'info' as const },
        ...(act ? [{ check: 'Coulomb Ka · Pa', basis: `${f1(act.inclinationDeg)}° from horizontal`, demand: `${f3(act.K)} · ${f2(act.P)} kN/m`, status: 'info' as const },
          { check: 'Coulomb components', basis: 'horizontal / vertical', demand: `${f2(act.horizontal)} / ${f2(act.vertical)} kN/m`, status: 'info' as const }] : []),
        ...(seismic.r ? [{ check: 'Mononobe–Okabe Pae', basis: `ψ ${f2(seismic.r.psiDeg)}°, at ${f2(seismic.r.lineOfAction)} m`, demand: `${f2(seismic.r.P)} kN/m`, status: 'info' as const }] : []),
      ]}
      steps={steps}
      references={[
        { topic: 'Rankine', basis: 'Ka = tan²(45 − φ/2), Kp = tan²(45 + φ/2)', source: 'Rankine (1857); Das, Principles of Geotechnical Engineering' },
        { topic: 'Coulomb', basis: 'wall friction, inclined back face, sloping fill', source: 'Coulomb (1776); Das' },
        { topic: 'Seismic', basis: 'Mononobe–Okabe pseudo-static wedge', source: 'Mononobe & Matsuo (1929); Okabe (1926)' },
      ]}
    />
  )
}
