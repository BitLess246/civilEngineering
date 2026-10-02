import { useState } from 'react'
import 'katex/dist/katex.min.css'
import {
  waterNu, hazenWilliams, darcyWeisbach, type PipeResult,
} from '../engine/pipeFlow'
import { Card, Num, Pick, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, f2, f3 } from '../lib/influenceStyle'

// Pipe Flow — friction loss in a full circular pipe by Hazen–Williams or
// Darcy–Weisbach (Colebrook f), with ΣK minor losses on top
// (engine/pipeFlow.ts).

type Method = 'hw' | 'dw'

const EPS_PRESETS: [string, string][] = [
  ['0.0000015', 'PVC / glass — 0.0015 mm'],
  ['0.000045', 'Commercial steel — 0.045 mm'],
  ['0.00026', 'Cast iron — 0.26 mm'],
  ['0.0006', 'Riveted steel — 0.6 mm'],
  ['0.0003', 'Concrete — 0.3 mm'],
]

export default function PipeFlow() {
  const [method, setMethod] = useState<Method>('hw')
  const [L, setL] = useState(1000)
  const [D, setD] = useState(300)
  const [Q, setQ] = useState(0.1)
  const [C, setC] = useState(120)
  const [eps, setEps] = useState('0.000045')
  const [temp, setTemp] = useState(25)
  const [K, setK] = useState(2)

  const Dm = D / 1000

  const res: PipeResult | null = (() => {
    try {
      return method === 'hw'
        ? hazenWilliams({ L, D: Dm, C, Q, minorK: K })
        : darcyWeisbach({ L, D: Dm, eps: parseFloat(eps) || 0, nu: waterNu(temp), Q, minorK: K })
    } catch { return null }
  })()

  const steps: SolutionStep[] = res ? (method === 'hw' ? [
    {
      title: 'Velocity from the discharge',
      lines: [
        { tex: `A = \\frac{\\pi D^2}{4} = \\frac{\\pi\\times ${f3(Dm)}^2}{4} = ${f3(Math.PI * Dm * Dm / 4)}\\text{ m}^2, \\qquad V = \\frac{Q}{A} = ${f3(res.V)}\\text{ m/s}` },
      ],
    },
    {
      title: 'Hazen–Williams slope',
      lines: [
        { tex: `V = 0.8492\\, C\\, R^{0.63}\\, S^{0.54} \\;\\Rightarrow\\; S = \\left(\\frac{V}{0.8492\\, C\\, R^{0.63}}\\right)^{1/0.54}` },
        { tex: `R = D/4 = ${f3(Dm / 4)}\\text{ m}, \\; C = ${f2(C)} \\;\\Rightarrow\\; S = ${f3(res.S)}\\text{ m/m}` },
        { text: 'S is the head lost per metre of pipe — the hydraulic gradient. The 0.8492 constant is SI, for water at ordinary temperatures in turbulent water-main flow.' },
      ],
    },
    {
      title: 'Head loss',
      lines: [
        { tex: `h_f = S\\cdot L = ${f3(res.S)}\\times ${f2(L)} = ${f3(res.hf)}\\text{ m} \\;\\left(${f2(res.S100)}\\text{ m per 100 m}\\right)` },
        { tex: `h_m = \\Sigma K\\,\\frac{V^2}{2g} = ${f2(K)}\\times\\frac{${f3(res.V)}^2}{2\\times 9.81} = ${f3(res.hm)}\\text{ m}` },
        { text: `Total ${f3(res.hTotal)} m. The equivalent Q-form h_f = 10.67·L·Q^1.852/(C^1.852·D^4.87) gives the same answer to a fraction of a percent.` },
        ...res.warnings.map((w) => ({ item: w })),
      ],
    },
  ] : [
    {
      title: 'Velocity and Reynolds number',
      lines: [
        { tex: `A = ${f3(Math.PI * Dm * Dm / 4)}\\text{ m}^2, \\qquad V = \\frac{Q}{A} = ${f3(res.V)}\\text{ m/s}` },
        { tex: `Re = \\frac{VD}{\\nu} = \\frac{${f3(res.V)}\\times ${f3(Dm)}}{${f3(waterNu(temp))}} = ${f2(res.Re / 1e5)}\\times 10^5` },
        { text: `ν from the water temperature ${f2(temp)} °C. ${res.regime === 'laminar' ? 'Re < 2300: laminar — Poiseuille applies, f = 64/Re.' : res.regime === 'transition' ? '2300–4000: the transition band — neither law holds cleanly, so treat f as approximate.' : 'Re > 4000: turbulent — Colebrook–White applies.'}` },
      ],
    },
    {
      title: 'Friction factor',
      lines: res.regime === 'laminar'
        ? [{ tex: `f = \\frac{64}{Re} = ${f3(res.f)}` }]
        : [
            { tex: `\\frac{1}{\\sqrt{f}} = -2\\log_{10}\\left(\\frac{\\varepsilon}{3.7 D} + \\frac{2.51}{Re\\sqrt{f}}\\right) \\;\\Rightarrow\\; f = ${f3(res.f)}` },
            { text: `ε/D = ${f3((parseFloat(eps) || 0) / Dm)}. The Colebrook equation is implicit in f — the engine iterates it to machine precision (your Moody-chart reading, refined).` },
          ],
    },
    {
      title: 'Head loss',
      lines: [
        { tex: `h_f = f\\,\\frac{L}{D}\\,\\frac{V^2}{2g} = ${f3(res.f)}\\times\\frac{${f2(L)}}{${f3(Dm)}}\\times\\frac{${f3(res.V)}^2}{2\\times 9.81} = ${f3(res.hf)}\\text{ m}` },
        { tex: `h_m = \\Sigma K\\,\\frac{V^2}{2g} = ${f3(res.hm)}\\text{ m} \\;\\Rightarrow\\; h_{total} = ${f3(res.hTotal)}\\text{ m}` },
        ...res.warnings.map((w) => ({ item: w })),
      ],
    },
  ]) : []

  return (
    <div>
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <ReportControls title="Pipe Flow Report" badges={[method === 'hw' ? 'Hazen–Williams' : 'Darcy–Weisbach']} />
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Friction loss in a full pipe, the two workhorse laws: Hazen–Williams for water-main work,
          Darcy–Weisbach with an iterated Colebrook f when you have the roughness and temperature.
          Minor losses stack on top as ΣK.
        </p>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="space-y-5">
            <Card title="Method and pipe">
              <Pick label="Law" value={method} onChange={(v) => setMethod(v as Method)}
                options={[['hw', 'Hazen–Williams — water mains'], ['dw', 'Darcy–Weisbach — any fluid']]} />
              <Num label="Length L" unit="m" value={L} onChange={setL} min={1} max={100000} step="10" />
              <Num label="Diameter D" unit="mm" value={D} onChange={setD} min={15} max={3000} step="10" />
              <Num label="Discharge Q" unit="m³/s" value={Q} onChange={setQ} min={0.0001} max={50} step="0.01" />
              <Num label="Minor losses ΣK" value={K} onChange={setK} min={0} max={50} step="0.5" />
            </Card>

            {method === 'hw' ? (
              <Card title="Hazen–Williams roughness">
                <Num label="C" value={C} onChange={setC} min={50} max={160} step="5" />
                <p className="text-[11px] text-faint sm:col-span-2 lg:col-span-3">
                  PVC ≈ 150 · new cast iron ≈ 130 · old steel ≈ 100 · old brick ≈ 90. C degrades as
                  the pipe ages — design on the ten-year value, not the day-one value.
                </p>
              </Card>
            ) : (
              <Card title="Roughness and temperature">
                <Pick label="Material ε" value={eps} onChange={setEps} options={EPS_PRESETS} />
                <Num label="Water temperature" unit="°C" value={temp} onChange={setTemp} min={0} max={40} step="5" />
              </Card>
            )}
          </div>

          <div className="space-y-5">
            {res ? (
              <>
                <ResultCard title="Head loss">
                  <Row label="Velocity V" value={`${f3(res.V)} m/s`} sub={`${f3(Math.PI * Dm * Dm / 4)} m² flow area`} />
                  <Row label="Friction loss hf" value={`${f3(res.hf)} m`} sub={`${f2(res.S100)} m per 100 m of pipe`} />
                  <Row label="Minor losses hm" value={`${f3(res.hm)} m`} sub={`ΣK = ${f2(K)}`} />
                  <Row label="Total head loss" value={`${f3(res.hTotal)} m`} sub="friction + minor" />
                  {method === 'dw' && !Number.isNaN(res.Re) && (
                    <Row label="Reynolds / f" value={`Re = ${f2(res.Re / 1e5)}×10⁵ · f = ${f3(res.f)}`} sub={res.regime} />
                  )}
                </ResultCard>

                {res.warnings.length > 0 && (
                  <ResultCard title="Notes">
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                      {res.warnings.map((w) => <li key={w}>{w}</li>)}
                    </ul>
                  </ResultCard>
                )}

                <DrawingCard title="Hydraulic profile" meta="HGL and energy line along the pipe">
                  <HGLDiagram L={L} res={res} />
                </DrawingCard>

                <WorkedSolution steps={steps} title="Pipe flow — step-by-step" />
              </>
            ) : (
              <ResultCard title="Check the inputs">
                <p className="text-sm text-fail">
                  Give a positive length, diameter and discharge; C between 50 and 160 for
                  Hazen–Williams; a non-negative roughness for Darcy–Weisbach.
                </p>
              </ResultCard>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── longitudinal profile: pipe, HGL (S slope), EGL above it ─────────────

function HGLDiagram({ L, res }: { L: number; res: PipeResult }) {
  const W = 640
  const H = 320
  const pad = 46

  const drop = Math.max(res.hTotal, 0.001)
  const HGLtop = pad + 16
  const HGLbot = H - pad - 46
  const bedY = H - pad

  // draw the HGL as a straight line at the average slope
  const x0 = pad
  const x1 = W - pad
  const vhead = (res.V * res.V) / (2 * 9.81)
  const eglOff = Math.max(6, Math.min(18, (HGLbot - HGLtop) * vhead / (drop * 3)))

  return (
    <DrawingFrame label="Hydraulic grade line along the pipe">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Hydraulic grade line">
        {/* pipe */}
        <rect x={x0} y={bedY - 22} width={x1 - x0} height={16} fill="rgba(15,76,146,0.12)" stroke={INK} strokeWidth="1.4" />
        <line x1={x0 - 8} x2={x1 + 8} y1={bedY} y2={bedY} stroke={INK} strokeWidth="1.6" />

        {/* HGL */}
        <line x1={x0} x2={x1} y1={HGLtop} y2={HGLbot} stroke="rgba(15,76,146,0.85)" strokeWidth="1.6" />
        {/* EGL: V²/2g above the HGL */}
        <line x1={x0} x2={x1} y1={HGLtop - eglOff} y2={HGLbot - eglOff} stroke="rgba(15,76,146,0.5)" strokeWidth="1" strokeDasharray="6 3" />
        <text x={x0 + 6} y={HGLtop - eglOff - 6} fontSize="10" fill="rgba(15,76,146,0.85)" fontFamily="var(--font-mono, monospace)">
          EGL — V²/2g = {f3(vhead)} m above
        </text>
        <text x={x0 + 6} y={HGLtop + 14} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">
          HGL — falls with the slope S = {f3(res.S)} m/m
        </text>

        {/* total drop tag */}
        <line x1={x1 - 26} x2={x1 - 26} y1={HGLtop} y2={HGLbot} stroke={MUTED} strokeWidth="1" />
        <text x={x1 - 32} y={(HGLtop + HGLbot) / 2} textAnchor="end" fontSize="10.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">
          hf = {f3(res.hf)} m
        </text>

        <text x={pad} y={H - 8} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
          L = {f2(L)} m · hm = {f3(res.hm)} m · total = {f3(res.hTotal)} m
        </text>
      </svg>
    </DrawingFrame>
  )
}
