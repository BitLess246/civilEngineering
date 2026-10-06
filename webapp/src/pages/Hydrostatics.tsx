import { useState } from 'react'
// Every page that renders worked-solution math carries its own KaTeX stylesheet
// — it stays out of the pages that never show an equation.
import 'katex/dist/katex.min.css'
import {
  planeForce, curvedGateForce, floatingStability, manometer,
  accelTilt, accelPressure, rotationRise, GAMMA_W,
  type PlaneShape,
} from '../engine/hydrostatics'
import { bernoulli, waterJet } from '../engine/hydraulics'
import { Num, Pick } from '../components/qty'
import { DrawingFrame } from '../components/DrawingFrame'
import { WorkedSolution } from '../components/WorkedSolution'
import {
  Workspace, InputRail, InputGroup, CheckCard, DocPanel, DocSection, KeyValueGrid,
  ResultsTable, ReferenceList, ReportTitleBlock,
} from '../components/workspace'
import { useWorkspaceReport } from '../lib/useWorkspaceReport'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Hydrostatics & hydraulics — force on plane surfaces with the center of
// pressure, curved-gate components, buoyancy and metacentric stability,
// manometers and relative equilibrium (engine/hydrostatics.ts), plus the
// energy equation and the jet on a vane (engine/hydraulics.ts). Laid out on
// the three-column workspace (components/workspace.tsx).

const TITLE = 'Hydrostatics & Hydraulics'
type BernoulliUnknown = 'p2' | 'v2' | 'z2' | 'hL' | 'hP' | 'hT'
const UNKNOWN_LABEL: Record<BernoulliUnknown, string> = {
  p2: 'p₂', v2: 'v₂', z2: 'z₂', hL: 'head loss hL', hP: 'pump head hP', hT: 'turbine head hT',
}
const round = (x: number) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : 0)

interface LegUI {
  gamma: string
  h: string
  sign: 'down' | 'up'
}

const sNum = (s: string): number => (parseFloat(s) || 0)

export default function Hydrostatics() {
  const [shape, setShape] = useState<'rect' | 'circle'>('rect')
  const [b, setB] = useState(2)
  const [h, setH] = useState(3)
  const [dia, setDia] = useState(2)
  const [hc, setHc] = useState(1.5)
  const [theta, setTheta] = useState(90)
  const [gateR, setGateR] = useState(2)
  const [gateW, setGateW] = useState(3)
  // water standing above the gate's top; the projection's centroid is h₀ + R/2
  const [gateH0, setGateH0] = useState(0)
  const gateHc = gateH0 + gateR / 2
  const [bargeL, setBargeL] = useState(10)
  const [bargeB, setBargeB] = useState(4)
  const [draft, setDraft] = useState(1.5)
  const [kg, setKG] = useState(1.2)
  const [pStart, setPStart] = useState(50)
  const [legs, setLegs] = useState<LegUI[]>([
    { gamma: '133.1', h: '0.1', sign: 'down' },
    { gamma: '9.81', h: '0.2', sign: 'up' },
  ])
  const [ax, setAx] = useState(3)
  const [azH, setAzH] = useState(2)
  const [az, setAz] = useState(2)
  const [omega, setOmega] = useState(3)
  const [rotR, setRotR] = useState(1)
  // energy equation (folded in from the Hydraulics engine) — kPa at the page edge
  const [solveFor, setSolveFor] = useState<BernoulliUnknown>('p2')
  const [p1, setP1] = useState(200)
  const [v1, setV1] = useState(2)
  const [z1, setZ1] = useState(10)
  const [p2, setP2] = useState(150)
  const [v2, setV2] = useState(4)
  const [z2, setZ2] = useState(12)
  const [hL, setHL] = useState(0.5)
  const [hP, setHP] = useState(0)
  const [hT, setHT] = useState(0)
  // jet on a vane
  const [jetV, setJetV] = useState(20)
  const [jetD, setJetD] = useState(50)
  const [jetTheta, setJetTheta] = useState(90)
  const [jetU, setJetU] = useState(5)
  const report = useWorkspaceReport(TITLE, ['Hydrostatics', 'Hydraulics'])

  const loadSample = () => {
    setShape('rect'); setB(2); setH(3); setDia(2); setHc(1.5); setTheta(90)
    setGateR(2); setGateW(3); setGateH0(0)
    setBargeL(10); setBargeB(4); setDraft(1.5); setKG(1.2)
    setPStart(50)
    setLegs([{ gamma: '133.1', h: '0.1', sign: 'down' }, { gamma: '9.81', h: '0.2', sign: 'up' }])
    setAx(3); setAzH(2); setAz(2); setOmega(3); setRotR(1)
    setSolveFor('p2'); setP1(200); setV1(2); setZ1(10); setP2(150); setV2(4); setZ2(12); setHL(0.5); setHP(0); setHT(0)
    setJetV(20); setJetD(50); setJetTheta(90); setJetU(5)
  }

  const planeShape: PlaneShape = shape === 'rect' ? { kind: 'rect', b, h } : { kind: 'circle', d: dia }
  const pl = planeForce({ shape: planeShape, hc, thetaDeg: theta })
  const gate = curvedGateForce({ R: gateR, W: gateW, hc: gateHc })
  const fl = floatingStability({ L: bargeL, B: bargeB, draft, KG: kg })
  const tilt = accelTilt(ax)
  const mano = manometer(pStart, legs.map((l) => ({ gamma: sNum(l.gamma), h: sNum(l.h), sign: l.sign === 'down' ? 1 as const : -1 as const })))

  const rise = rotationRise(omega, rotR)
  // only the KNOWN quantities go in; the unknown is the engine's to return
  const known = <T,>(k: BernoulliUnknown, v: T): T | undefined => (solveFor === k ? undefined : v)
  let bern: ReturnType<typeof bernoulli>
  let bernOk = true
  try {
    bern = bernoulli({
      p1: p1 * 1000, v1, z1, p2: known('p2', p2 * 1000), v2: known('v2', v2), z2: known('z2', z2),
      hL: known('hL', hL), hP: known('hP', hP), hT: known('hT', hT), solveFor,
    })
  } catch {
    // v₂ with negative head: the flow cannot get there with this much energy
    bernOk = false
    bern = { p2: p2 * 1000, v2: 0, z2, hL, hP, hT, head1: NaN, head2: NaN }
  }
  if (bernOk && solveFor === 'hL' && bern.hL < 0) bernOk = false   // energy gained with no pump
  const bernValue = !bernOk && solveFor === 'v2'
    ? { value: '—', unit: 'no real v₂' }
    : solveFor === 'p2' ? { value: f2(bern.p2 / 1000), unit: 'kPa' }
    : solveFor === 'v2' ? { value: f3(bern.v2), unit: 'm/s' }
    : { value: f3(bern[solveFor]), unit: 'm' }
  // total head at 2 from the FINAL p₂, v₂, z₂ — the engine's `head2` is a
  // working quantity (the velocity head when solving for v₂), not this
  const H2 = bern.p2 / (GAMMA_W * 1000) + (bern.v2 * bern.v2) / 19.62 + bern.z2
  const jet = waterJet({ v: jetV, d: jetD / 1000, thetaDeg: jetTheta, u: Math.min(jetU, jetV) })

  const setLeg = (k: number, patch: Partial<LegUI>) =>
    setLegs((ls) => ls.map((l, j) => (j === k ? { ...l, ...patch } : l)))

  const steps: SolutionStep[] = [
    {
      title: 'Plane surface — resultant and center of pressure',
      lines: [
        { tex: `F = \\gamma\\,h_c\\,A = ${f2(GAMMA_W)}\\times${f2(hc)}\\times${f3(pl.A)} = ${f2(pl.F)}\\ \\text{kN}` },
        { tex: `y_p = y_c + \\frac{I_{xx,c}}{y_c A} = ${f3(pl.ycPlane)} + \\frac{${f3(pl.Ixxc)}}{${f3(pl.ycPlane)}\\times${f3(pl.A)}} = ${f3(pl.ypPlane)}\\ \\text{m along the plate}` },
        { tex: `h_p = y_p\\sin${f2(theta)}^\\circ = ${f3(pl.hpVertical)}\\ \\text{m vertical}` },
        { text: 'Pressure grows with depth, so the resultant strikes below the centroid — deeper on steep plates, and the magnitude never cares about the inclination, only the centroid depth.' },
      ],
    },
    {
      title: 'Quarter-circular gate — two components, one center',
      lines: [
        { tex: `h_c = h_0 + \\tfrac{R}{2} = ${f2(gateH0)} + ${f2(gateR / 2)} = ${f2(gateHc)}\\ \\text{m}` },
        { tex: `F_h = \\gamma\\,h_c\\,(R\\cdot W) = ${f2(GAMMA_W)}\\times${f2(gateHc)}\\times${f2(gateR * gateW)} = ${f2(gate.Fh)}\\ \\text{kN}` },
        { tex: `F_v = \\gamma\\,W\\left(R\\,h_0 + \\tfrac{\\pi R^2}{4}\\right) = ${f2(GAMMA_W)}\\times${f2(gateW)}\\times${f3(gateR * gateH0 + (Math.PI * gateR * gateR) / 4)} = ${f2(gate.Fv)}\\ \\text{kN}` },
        { tex: `R = \\sqrt{F_h^2+F_v^2} = ${f2(gate.R)}\\ \\text{kN} \\qquad \\theta = \\tan^{-1}(F_v/F_h) = ${f2(gate.thetaDeg)}^\\circ` },
        { text: 'The horizontal push is the force on the projected rectangle; the vertical one is the fluid weight the arc holds up. On a circular arc the resultant always passes through the center — the pressure acts normal to the skin everywhere.' },
      ],
    },
    {
      title: 'Flotation and metacentric stability',
      lines: [
        { tex: `F_b = \\gamma\\,V = ${f2(GAMMA_W)}\\times${f2(fl.V)} = ${f2(fl.Fb)}\\ \\text{kN}` },
        { tex: `BM = I_{oo}/V = ${f3((bargeL * bargeB ** 3) / 12)}/${f2(fl.V)} = ${f3(fl.BM)}\\ \\text{m} \\qquad GM = ${f2(fl.KB)} + ${f3(fl.BM)} - ${f2(kg)} = ${f3(fl.GM)}\\ \\text{m}` },
        { text: fl.stable
          ? 'GM > 0 — the metacenter sits above the center of gravity, so a heel sets up a righting couple. Widen the beam or lower KG to grow it.'
          : 'GM ≤ 0 — the metacenter is at or below the center of gravity: no righting couple. Widen the beam, lighten the topsides, or add ballast low.' },
      ],
    },
    {
      title: 'Manometer walk and rigid-body motion',
      lines: [
        { tex: `p = ${f2(pStart)}${legs.map((l) => ` ${l.sign === 'down' ? '+' : '-'} ${f2(sNum(l.gamma))}\\times${f2(sNum(l.h))}`).join('')} = ${f2(mano)}\\ \\text{kPa}` },
        { tex: `\\tan\\theta = a_x/g = ${f2(ax)}/9.81 = ${f3(tilt.tanTheta)}\\ \\Rightarrow\\ \\theta = ${f2(tilt.thetaDeg)}^\\circ` },
        { tex: `p = \\rho(g+a_z)h = ${f2(accelPressure(azH, az))}\\ \\text{kPa at }${f2(azH)}\\text{ m} \\qquad z = \\omega^2r^2/2g = ${f3(rotationRise(omega, rotR))}\\ \\text{m}` },
        { text: 'Walk a manometer adding γh going down, subtracting going up. Accelerate the tank and the free surface tilts (or the pressure gains ρ·az·h); spin it and the surface is a paraboloid rising ω²r²/2g at the rim.' },
      ],
    },
    {
      title: `Energy equation — solving for ${UNKNOWN_LABEL[solveFor]}`,
      lines: bernOk ? [
        { tex: `H_1 = \\frac{p_1}{\\gamma} + \\frac{v_1^2}{2g} + z_1 = \\frac{${f2(p1)}}{${f2(GAMMA_W)}} + \\frac{${f2(v1)}^2}{19.62} + ${f2(z1)} = ${f3(bern.head1)}\\ \\text{m}` },
        { tex: `H_1 + h_P = H_2 + h_T + h_L \\;\\Rightarrow\\; ${f3(bern.head1)} + ${f3(bern.hP)} = ${f3(H2)} + ${f3(bern.hT)} + ${f3(bern.hL)}` },
        { tex: `${solveFor === 'p2' ? 'p_2' : solveFor === 'v2' ? 'v_2' : solveFor === 'z2' ? 'z_2' : solveFor === 'hL' ? 'h_L' : solveFor === 'hP' ? 'h_P' : 'h_T'} = ${bernValue.value}\\ \\text{${bernValue.unit}}` },
        { text: solveFor === 'hL' && bern.hL < 0
          ? 'A negative head loss means point 2 holds more energy than point 1 supplied — the flow runs the other way, or a pump is missing.'
          : 'Total head is conserved between the points once the machines add (pump) or take (turbine) their share and friction takes the loss.' },
      ] : [
        { text: 'No real solution: with the given heads the flow has less energy at point 2 than its pressure and elevation alone require, so v₂² would be negative. Lower z₂ or p₂, or add a pump.' },
      ],
    },
    {
      title: 'Jet on a vane — impulse–momentum',
      lines: [
        { tex: `A = \\tfrac{\\pi}{4}d^2 = ${f3(jet.A * 1e4)}\\times10^{-4}\\ \\text{m}^2 \\qquad Q_r = A(v-u) = ${f3(jet.Q)}\\ \\text{m}^3/\\text{s}` },
        { tex: `F_x = \\rho Q_r (v-u)(1-\\cos\\theta) = ${f2(jet.F_x)}\\ \\text{N} \\qquad P = F_x u = ${f2(jet.power)}\\ \\text{W}` },
        { tex: `\\eta = \\frac{F_x u}{\\tfrac12 \\rho A v^3} = ${f2(jet.efficiency * 100)}\\%` },
        { text: 'A single moving vane intercepts only the relative flow A(v − u); its efficiency peaks at u = v/3 — 8/27 for a flat plate, twice that for a full reversal.' },
      ],
    },
  ]

  return (
    <Workspace title={TITLE} badges={['Statics', 'Bernoulli', 'Momentum']}
      intro="Fluid at rest, in rigid-body motion and in steady flow: plane and curved surfaces, buoyancy and stability, manometers, accelerating and spinning vessels, the energy equation with pumps and losses, and a jet on a vane — every line worked with your numbers."
      inputs={
        <InputRail>
          {report.group}
          <InputGroup title="Plane surface">
            <div className="col-span-2">
              <button type="button" onClick={loadSample}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample set
              </button>
            </div>
            <Pick label="Shape" value={shape} onChange={(v) => setShape(v as typeof shape)}
              options={[['rect', 'Rectangle'], ['circle', 'Circle']]} />
            {shape === 'rect' ? (
              <>
                <Num label="Width b" unit="m" value={b} onChange={setB} min={0.1} step="0.5" />
                <Num label="Height h" unit="m" value={h} onChange={setH} min={0.1} step="0.5" />
              </>
            ) : (
              <Num label="Diameter d" unit="m" value={dia} onChange={setDia} min={0.1} step="0.5" />
            )}
            <Num label="Centroid depth hc" unit="m" value={hc} onChange={setHc} min={0.05} step="0.1" />
            <Num label="Inclination θ" unit="°" value={theta} onChange={setTheta} min={1} max={90} step="5" />
          </InputGroup>

          <InputGroup title="Curved gate (quarter circle)">
            <Num label="Radius R" unit="m" value={gateR} onChange={setGateR} min={0.1} step="0.5" />
            <Num label="Width W" unit="m" value={gateW} onChange={setGateW} min={0.1} step="0.5" />
            <div className="col-span-2">
              <Num label="Water above gate top h₀" unit="m" value={gateH0} onChange={setGateH0} min={0} step="0.1" />
            </div>
          </InputGroup>

          <InputGroup title="Box barge">
            <Num label="Length L" unit="m" value={bargeL} onChange={setBargeL} min={1} step="1" />
            <Num label="Beam B" unit="m" value={bargeB} onChange={setBargeB} min={0.5} step="0.5" />
            <Num label="Draft d" unit="m" value={draft} onChange={setDraft} min={0.1} step="0.1" />
            <Num label="KG above keel" unit="m" value={kg} onChange={setKG} min={0} step="0.1" />
          </InputGroup>

          <InputGroup title="Manometer">
            <div className="col-span-2">
              <Num label="Starting pressure" unit="kPa" value={pStart} onChange={setPStart} step="1" />
            </div>
            {legs.map((l, k) => (
              <div key={k} className="col-span-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
                <Num label={`γ leg ${k + 1}`} unit="kN/m³" value={sNum(l.gamma)} onChange={(v) => setLeg(k, { gamma: String(v) })} min={0.1} step="0.1" />
                <Num label="h" unit="m" value={sNum(l.h)} onChange={(v) => setLeg(k, { h: String(v) })} min={0} step="0.05" />
                <Pick label="Going" value={l.sign} onChange={(v) => setLeg(k, { sign: v as LegUI['sign'] })}
                  options={[['down', 'Down +'], ['up', 'Up −']]} />
                <button type="button" aria-label={`Remove leg ${k + 1}`} onClick={() => setLegs((ls) => ls.filter((_, j) => j !== k))}
                  className="mb-1 rounded-md border border-field-line px-1.5 py-1 text-xs text-muted hover:text-fail">✕</button>
              </div>
            ))}
            <div className="col-span-2">
              <button type="button" onClick={() => setLegs((ls) => [...ls, { gamma: '9.81', h: '0.1', sign: 'down' }])}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                + Add leg
              </button>
            </div>
          </InputGroup>

          <InputGroup title="Moving vessels">
            <Num label="Horizontal ax" unit="m/s²" value={ax} onChange={setAx} step="0.5" />
            <Num label="Vertical az (+ up)" unit="m/s²" value={az} onChange={setAz} step="0.5" />
            <Num label="Depth h (vertical)" unit="m" value={azH} onChange={setAzH} min={0} step="0.5" />
            <Num label="Spin ω" unit="rad/s" value={omega} onChange={setOmega} min={0} step="0.5" />
            <Num label="Rim radius r" unit="m" value={rotR} onChange={setRotR} min={0} step="0.5" />
          </InputGroup>

          <InputGroup title="Energy equation (Bernoulli)" hint="Point 1 → point 2; pick the unknown — its field is computed.">
            <div className="col-span-2">
              <Pick label="Solve for" value={solveFor} onChange={(v) => setSolveFor(v as BernoulliUnknown)}
                options={[['p2', 'Pressure p₂'], ['v2', 'Velocity v₂'], ['z2', 'Elevation z₂'], ['hL', 'Head loss hL'], ['hP', 'Pump head hP'], ['hT', 'Turbine head hT']]} />
            </div>
            <Num label="p₁" unit="kPa" value={p1} onChange={setP1} step="1" />
            <Num label="p₂" unit="kPa" value={solveFor === 'p2' ? round(bern.p2 / 1000) : p2} onChange={setP2} step="1" disabled={solveFor === 'p2'} />
            <Num label="v₁" unit="m/s" value={v1} onChange={setV1} min={0} step="0.1" />
            <Num label="v₂" unit="m/s" value={solveFor === 'v2' ? round(bern.v2) : v2} onChange={setV2} min={0} step="0.1" disabled={solveFor === 'v2'} />
            <Num label="z₁" unit="m" value={z1} onChange={setZ1} step="0.5" />
            <Num label="z₂" unit="m" value={solveFor === 'z2' ? round(bern.z2) : z2} onChange={setZ2} step="0.5" disabled={solveFor === 'z2'} />
            <Num label="Head loss hL" unit="m" value={solveFor === 'hL' ? round(bern.hL) : hL} onChange={setHL} min={0} step="0.1" disabled={solveFor === 'hL'} />
            <Num label="Pump head hP" unit="m" value={solveFor === 'hP' ? round(bern.hP) : hP} onChange={setHP} min={0} step="0.5" disabled={solveFor === 'hP'} />
            <Num label="Turbine head hT" unit="m" value={solveFor === 'hT' ? round(bern.hT) : hT} onChange={setHT} min={0} step="0.5" disabled={solveFor === 'hT'} />
          </InputGroup>

          <InputGroup title="Jet on a vane">
            <Num label="Jet velocity v" unit="m/s" value={jetV} onChange={setJetV} min={0.1} step="1" />
            <Num label="Jet diameter d" unit="mm" value={jetD} onChange={setJetD} min={1} step="5" />
            <Num label="Deflection θ" unit="°" value={jetTheta} onChange={setJetTheta} min={0} max={180} step="15" />
            <Num label="Vane speed u" unit="m/s" value={jetU} onChange={setJetU} min={0} step="1" />
          </InputGroup>
        </InputRail>
      }
      checks={
        <>
          <CheckCard title="Plane force" basis={`${shape === 'rect' ? `${f2(b)} × ${f2(h)} m plate` : `⌀${f2(dia)} m plate`} · θ = ${f2(theta)}°`}
            status="info" value={f2(pl.F)} unit="kN" formula={`F = γ·hc·A = ${f2(GAMMA_W)}·${f2(hc)}·${f3(pl.A)}`}
            pairs={[{ label: 'CP depth hp', value: `${f3(pl.hpVertical)} m` }, { label: 'CP along plate', value: `${f3(pl.ypPlane)} m` }]} />
          <CheckCard title="Curved gate" basis={`R ${f2(gateR)} m · h₀ ${f2(gateH0)} m above the top`}
            status="info" value={f2(gate.R)} unit="kN" formula={`R = √(Fh² + Fv²) at ${f2(gate.thetaDeg)}°`}
            pairs={[{ label: 'Fh (projection)', value: `${f2(gate.Fh)} kN` }, { label: 'Fv (water above)', value: `${f2(gate.Fv)} kN` }]} />
          <CheckCard title="Flotation stability" basis={`${f2(bargeL)} × ${f2(bargeB)} m barge · draft ${f2(draft)} m`}
            status={fl.stable ? 'pass' : 'fail'} pillLabel={fl.stable ? 'STABLE' : 'UNSTABLE'}
            value={f3(fl.GM)} unit="m" formula="GM = KB + BM − KG  (> 0 to right itself)"
            pairs={[{ label: 'Buoyancy Fb', value: `${f2(fl.Fb)} kN` }, { label: 'BM = I/V', value: `${f3(fl.BM)} m` }]} />
          <CheckCard title="Manometer" basis={`${legs.length} legs from ${f2(pStart)} kPa`}
            status="info" value={f2(mano)} unit="kPa" formula="p = p₀ + Σ ±γ·h" />
          <CheckCard title="Moving vessel" basis={`ax ${f2(ax)} · az ${f2(az)} m/s² · ω ${f2(omega)} rad/s`}
            status="info" value={f2(tilt.thetaDeg)} unit="° tilt" formula="tanθ = ax / g"
            pairs={[{ label: `p at ${f2(azH)} m`, value: `${f2(accelPressure(azH, az))} kPa` }, { label: 'Rim rise', value: `${f3(rise)} m` }]} />
          <CheckCard title="Energy equation" basis={`solving for ${UNKNOWN_LABEL[solveFor]}`}
            status={bernOk ? 'info' : 'warn'} pillLabel={bernOk ? undefined : 'CHECK'}
            value={bernValue.value} unit={bernValue.unit} formula="p₁/γ + v₁²/2g + z₁ + hP = p₂/γ + v₂²/2g + z₂ + hT + hL"
            pairs={[{ label: 'Head at 1', value: `${f3(bern.head1)} m` }, { label: 'Head at 2', value: `${f3(H2)} m` }]} />
          <CheckCard title="Jet on a vane" basis={`${f2(jetV)} m/s jet · θ ${f2(jetTheta)}° · u ${f2(jetU)} m/s`}
            status="info" value={jet.F_x >= 1000 ? f2(jet.F_x / 1000) : f2(jet.F_x)} unit={jet.F_x >= 1000 ? 'kN' : 'N'} formula="Fx = ρQ(v − u)(1 − cosθ)"
            pairs={[{ label: 'Power F·u', value: `${f2(jet.power / 1000)} kW` }, { label: 'Efficiency', value: `${f2(jet.efficiency * 100)} %` }]} />
        </>
      }
      document={
        <DocPanel tabs={[
          {
            id: 'sheet', label: 'Drawing sheet', content: (
              <>
                {report.printHeader}
                <ReportTitleBlock title={TITLE} lh={report.lh} today={report.today} />
                <DocSection num={1} title="Input summary">
                  <KeyValueGrid items={[
                    { label: 'Plate', value: shape === 'rect' ? `${f2(b)} × ${f2(h)} m` : `⌀${f2(dia)} m` },
                    { label: 'Centroid depth hc', value: `${f2(hc)} m` },
                    { label: 'Inclination θ', value: `${f2(theta)}°` },
                    { label: 'Gate R × W', value: `${f2(gateR)} × ${f2(gateW)} m` },
                    { label: 'Water over gate h₀', value: `${f2(gateH0)} m` },
                    { label: 'Barge L × B', value: `${f2(bargeL)} × ${f2(bargeB)} m` },
                    { label: 'Draft / KG', value: `${f2(draft)} / ${f2(kg)} m` },
                    { label: 'Unit weight γ', value: `${f2(GAMMA_W)} kN/m³` },
                    { label: 'Accel ax / az', value: `${f2(ax)} / ${f2(az)} m/s²` },
                    { label: 'Spin ω / r', value: `${f2(omega)} rad/s / ${f2(rotR)} m` },
                    { label: 'Point 1 p, v, z', value: `${f2(p1)} kPa, ${f2(v1)} m/s, ${f2(z1)} m` },
                    { label: 'Jet v, d, θ, u', value: `${f2(jetV)} m/s, ${f2(jetD)} mm, ${f2(jetTheta)}°, ${f2(jetU)} m/s` },
                  ]} />
                </DocSection>
                <DocSection num={2} title="Pressure on the plate" card aside={<span className="no-print rounded-full border border-ok-line bg-ok-tint px-2 py-0.5 text-[10px] font-bold text-ok">LIVE</span>}>
                  <PressureDiagram thetaDeg={theta} />
                </DocSection>
                <DocSection num={3} title="Results summary">
                  <ResultsTable caption="Values from the inputs on the left; flotation is the one pass/fail check — GM must be positive." rows={[
                    { check: 'Plane resultant', basis: 'γ·hc·A', demand: `${f2(pl.F)} kN`, status: 'info' },
                    { check: 'Center of pressure', basis: 'yc + Ixx/(yc·A)', demand: `${f3(pl.hpVertical)} m`, status: 'info' },
                    { check: 'Gate resultant', basis: '√(Fh² + Fv²)', demand: `${f2(gate.R)} kN`, status: 'info' },
                    { check: 'Metacentric height GM', basis: 'KB + BM − KG', demand: `${f3(fl.GM)} m`, limit: '> 0', status: fl.stable ? 'pass' : 'fail' },
                    { check: 'Manometer far end', basis: 'p₀ + Σ ±γh', demand: `${f2(mano)} kPa`, status: 'info' },
                    { check: 'Surface tilt', basis: 'tan⁻¹(ax/g)', demand: `${f2(tilt.thetaDeg)}°`, status: 'info' },
                    { check: `Energy eq. — ${UNKNOWN_LABEL[solveFor]}`, basis: 'Bernoulli with hP, hT, hL', demand: `${bernValue.value} ${bernValue.unit}`, status: bernOk ? 'info' : 'warn' },
                    { check: 'Jet force on vane', basis: 'ρQ(v−u)(1−cosθ)', demand: jet.F_x >= 1000 ? `${f2(jet.F_x / 1000)} kN` : `${f2(jet.F_x)} N`, status: 'info' },
                  ]} />
                </DocSection>
              </>
            ),
          },
          { id: 'calc', label: 'Calculations', content: <WorkedSolution steps={steps} title="Hydrostatics & hydraulics — step by step" /> },
          {
            id: 'refs', label: 'References', content: (
              <DocSection num={4} title="Basis of each result">
                <ReferenceList items={[
                  { topic: 'Plane surface', basis: 'F = γ·hc·A; yp = yc + Ixx,c/(yc·A) along the plane', source: 'Hydrostatics — force on plane areas' },
                  { topic: 'Curved gate', basis: 'Fh on the vertical projection; Fv = weight of fluid vertically above the arc', source: 'Hydrostatics — curved surfaces' },
                  { topic: 'Flotation', basis: 'Fb = γV; GM = KB + BM − KG, BM = I/V; stable for GM > 0', source: 'Archimedes; metacentric stability' },
                  { topic: 'Manometer', basis: 'Walk the legs: +γh going down, −γh going up', source: 'Pressure measurement' },
                  { topic: 'Relative equilibrium', basis: 'tanθ = ax/g; p = ρ(g + az)h; z = ω²r²/2g', source: 'Rigid-body motion of fluids' },
                  { topic: 'Energy equation', basis: 'p₁/γ + v₁²/2g + z₁ + hP = p₂/γ + v₂²/2g + z₂ + hT + hL', source: 'Bernoulli, extended for machines and losses' },
                  { topic: 'Jet on a vane', basis: 'F = ρQ(v − u)(1 − cosθ); η = F·u / (½ρAv³)', source: 'Impulse–momentum' },
                ]} />
              </DocSection>
            ),
          },
        ]} />
      }
    />
  )
}

/** Pressure prism on a surface-piercing plate at the live inclination:
 *  arrows grow with depth (triangular distribution), F strikes at the
 *  third-point — the picture of why the center of pressure sits below the
 *  centroid. Schematic, not to the entered dimensions. */
function PressureDiagram({ thetaDeg }: { thetaDeg: number }) {
  const W = 640, Hh = 300
  const x0 = 200, surfY = 40
  const rad = (thetaDeg * Math.PI) / 180
  const plateLen = 190
  const dx = Math.cos(rad) * plateLen, dy = Math.sin(rad) * plateLen
  const x1 = x0 + dx, y1 = surfY + dy
  // outward normal to the plate (away from the fluid, drawn side)
  const nx = Math.sin(rad), ny = -Math.cos(rad)
  const arrows = [0.2, 0.4, 0.6, 0.8, 1.0].map((f) => {
    const len = 80 * f
    return { x0: x0 + dx * f, y0: surfY + dy * f, x1: x0 + dx * f + nx * len, y1: surfY + dy * f + ny * len }
  })
  const cpF = 2 / 3
  return (
    <div data-pdf-drawing className="mx-auto max-w-[640px]">
      <DrawingFrame label="Hydrostatic pressure distribution">
      <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full" role="img" aria-label="Pressure distribution on an inclined plate">
        <title>Pressure distribution on an inclined plate</title>
        <line x1={40} y1={surfY} x2={W - 20} y2={surfY} stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
        <text x={W - 26} y={surfY - 8} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.65">free surface</text>
        <line x1={x0} y1={surfY} x2={x1} y2={y1} stroke="currentColor" strokeWidth="3" />
        {arrows.map((a, k) => (
          <line key={k} x1={a.x0} y1={a.y0} x2={a.x1} y2={a.y1} stroke="currentColor" strokeWidth="1.3" opacity="0.7" />
        ))}
        <circle cx={x0 + dx * cpF} cy={surfY + dy * cpF} r="4" fill="currentColor" />
        <text x={x0 + dx * cpF + 10} y={surfY + dy * cpF + 4} fontSize="10.5" fill="currentColor">F at CP (lower third)</text>
      </svg>
      </DrawingFrame>
    </div>
  )
}
