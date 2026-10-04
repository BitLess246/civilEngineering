import { useState } from 'react'
// Every page that renders worked-solution math carries its own KaTeX stylesheet
// — it stays out of the pages that never show an equation.
import 'katex/dist/katex.min.css'
import {
  planeForce, curvedGateForce, floatingStability, manometer,
  accelTilt, accelPressure, rotationRise, GAMMA_W,
  type PlaneShape,
} from '../engine/hydrostatics'
import { Card, Num, Pick, ResultCard, Row } from '../components/qty'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Hydrostatics — force on plane surfaces with the center of pressure,
// curved-gate components, buoyancy and metacentric stability, manometers,
// and relative equilibrium (engine/hydrostatics.ts).

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
  const [gateHc, setGateHc] = useState(1)
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

  const loadSample = () => {
    setShape('rect'); setB(2); setH(3); setDia(2); setHc(1.5); setTheta(90)
    setGateR(2); setGateW(3); setGateHc(1)
    setBargeL(10); setBargeB(4); setDraft(1.5); setKG(1.2)
    setPStart(50)
    setLegs([{ gamma: '133.1', h: '0.1', sign: 'down' }, { gamma: '9.81', h: '0.2', sign: 'up' }])
    setAx(3); setAzH(2); setAz(2); setOmega(3); setRotR(1)
  }

  const planeShape: PlaneShape = shape === 'rect' ? { kind: 'rect', b, h } : { kind: 'circle', d: dia }
  const pl = planeForce({ shape: planeShape, hc, thetaDeg: theta })
  const gate = curvedGateForce({ R: gateR, W: gateW, hc: gateHc })
  const fl = floatingStability({ L: bargeL, B: bargeB, draft, KG: kg })
  const tilt = accelTilt(ax)
  const mano = manometer(pStart, legs.map((l) => ({ gamma: sNum(l.gamma), h: sNum(l.h), sign: l.sign === 'down' ? 1 as const : -1 as const })))

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
        { tex: `F_h = \\gamma\\,h_c\\,(R\\cdot W) = ${f2(GAMMA_W)}\\times${f2(gateHc)}\\times${f2(gateR * gateW)} = ${f2(gate.Fh)}\\ \\text{kN}` },
        { tex: `F_v = \\gamma\\,V = ${f2(GAMMA_W)}\\times${f3((Math.PI * gateR * gateR) / 4 * gateW)} = ${f2(gate.Fv)}\\ \\text{kN}` },
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
  ]

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Hydrostatics Report" badges={[`F ${f2(pl.F)} kN @ ${f3(pl.hpVertical)} m`, fl.stable ? `GM ${f3(fl.GM)} m — stable` : 'Unstable']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Fluid at rest and in rigid-body motion: plane-surface force with its center of
        pressure, curved-gate components, buoyancy and metacentric stability, manometers,
        and accelerating or rotating vessels — every line worked with your numbers below.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Plane surface">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button" onClick={loadSample}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — 2×3 plate at 1.5 m
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
          </Card>

          <Card title="Curved gate (quarter-circular)">
            <Num label="Radius R" unit="m" value={gateR} onChange={setGateR} min={0.1} step="0.5" />
            <Num label="Width W" unit="m" value={gateW} onChange={setGateW} min={0.1} step="0.5" />
            <Num label="Centroid depth" unit="m" value={gateHc} onChange={setGateHc} min={0.05} step="0.1" />
          </Card>

          <Card title="Box barge">
            <Num label="Length L" unit="m" value={bargeL} onChange={setBargeL} min={1} step="1" />
            <Num label="Beam B" unit="m" value={bargeB} onChange={setBargeB} min={0.5} step="0.5" />
            <Num label="Draft d" unit="m" value={draft} onChange={setDraft} min={0.1} step="0.1" />
            <Num label="KG above keel" unit="m" value={kg} onChange={setKG} min={0} step="0.1" />
          </Card>

          <Card title="Manometer legs">
            {legs.map((l, k) => (
              <div key={k} className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
                <Num label="γ" unit="kN/m³" value={sNum(l.gamma)} onChange={(v) => setLeg(k, { gamma: String(v) })} min={0.1} step="0.1" />
                <Num label="h" unit="m" value={sNum(l.h)} onChange={(v) => setLeg(k, { h: String(v) })} min={0} step="0.05" />
                <Pick label="Going" value={l.sign} onChange={(v) => setLeg(k, { sign: v as LegUI['sign'] })}
                  options={[['down', 'Down +'], ['up', 'Up −']]} />
                <button type="button" aria-label={`Remove leg ${k + 1}`} onClick={() => setLegs((ls) => ls.filter((_, j) => j !== k))}
                  className="rounded-md border border-field-line px-1 py-1 text-xs text-muted hover:text-fail">✕</button>
              </div>
            ))}
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <button type="button" onClick={() => setLegs((ls) => [...ls, { gamma: '9.81', h: '0.1', sign: 'down' }])}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                + Add leg
              </button>
              <Num label="Starting pressure" unit="kPa" value={pStart} onChange={setPStart} step="1" />
            </div>
          </Card>

          <Card title="Moving vessels">
            <Num label="Horizontal ax" unit="m/s²" value={ax} onChange={setAx} step="0.5" />
            <Num label="Depth h (vertical accel)" unit="m" value={azH} onChange={setAzH} min={0} step="0.5" />
            <Num label="Vertical az (+ up)" unit="m/s²" value={az} onChange={setAz} step="0.5" />
            <Num label="Spin ω" unit="rad/s" value={omega} onChange={setOmega} min={0} step="0.5" />
            <Num label="Rim radius r" unit="m" value={rotR} onChange={setRotR} min={0} step="0.5" />
          </Card>
        </div>

        <div className="space-y-5">
          <ResultCard title="Plane force">
            <Row label="Resultant F" value={`${f2(pl.F)} kN`} sub={`γ·hc·A = ${f2(GAMMA_W)}·${f2(hc)}·${f3(pl.A)}`} />
            <Row label="Center of pressure" value={`${f3(pl.hpVertical)} m deep`} sub={`${f3(pl.ypPlane)} m along the plate`} />
          </ResultCard>

          <ResultCard title="Gate + flotation">
            <Row label="Gate resultant" value={`${f2(gate.R)} kN @ ${f2(gate.thetaDeg)}°`} sub={`Fh ${f2(gate.Fh)} · Fv ${f2(gate.Fv)} kN`} />
            <Row label="Buoyancy" value={`${f2(fl.Fb)} kN`} sub={`V ${f2(fl.V)} m³`} />
            <Row label="GM" value={`${f3(fl.GM)} m`} sub={fl.stable ? 'stable — righting couple' : 'NOT stable'} alert={!fl.stable} />
          </ResultCard>

          <ResultCard title="Manometer + motion">
            <Row label="Far-end pressure" value={`${f2(mano)} kPa`} sub={`from ${f2(pStart)} kPa over ${legs.length} legs`} />
            <Row label="Surface tilt" value={`${f2(tilt.thetaDeg)}°`} sub={`tanθ ${f3(tilt.tanTheta)}`} />
            <Row label="Rim rise" value={`${f3(rotationRise(omega, rotR))} m`} sub={`ω ${f2(omega)} rad/s · r ${f2(rotR)} m`} />
          </ResultCard>

          <PressureDiagram thetaDeg={theta} />

          <WorkedSolution steps={steps} title="Hydrostatics — step by step" />
        </div>
      </div>
    </div>
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
    <div className="rounded-xl border border-hairline bg-sheet p-4 shadow-sm">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">Pressure on the plate</p>
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
