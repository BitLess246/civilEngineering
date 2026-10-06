import { useState } from 'react'
import {
  waterNu, hazenWilliams, darcyWeisbach, type PipeResult,
} from '../engine/pipeFlow'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { PipeProfile } from '../components/hydraulicsSketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

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
  let res: PipeResult | null = null
  let err = ''
  try {
    res = method === 'hw'
      ? hazenWilliams({ L, D: Dm, C, Q, minorK: K })
      : darcyWeisbach({ L, D: Dm, eps: parseFloat(eps) || 0, nu: waterNu(temp), Q, minorK: K })
  } catch (e) { err = (e as Error).message }
  const vhead = res ? (res.V * res.V) / (2 * 9.81) : NaN

  const steps: SolutionStep[] = res ? (method === 'hw' ? [
    {
      title: 'Velocity from the discharge',
      lines: [
        { tex: `A = \\frac{\\pi D^2}{4} = \\frac{\\pi\\times ${f3(Dm)}^2}{4} = ${f3(Math.PI * Dm * Dm / 4)}\\text{ m}^2, \\qquad V = \\frac{Q}{A} = \\frac{${f3(Q)}}{${f3(Math.PI * Dm * Dm / 4)}} = ${f3(res.V)}\\text{ m/s}` },
      ],
    },
    {
      title: 'Hazen–Williams slope',
      lines: [
        { tex: `V = 0.8492\\, C\\, R^{0.63}\\, S^{0.54} \\;\\Rightarrow\\; S = \\left(\\frac{V}{0.8492\\, C\\, R^{0.63}}\\right)^{1/0.54}` },
        { tex: `S = \\left(\\frac{${f3(res.V)}}{0.8492\\times ${f2(C)}\\times ${f3(Dm / 4)}^{0.63}}\\right)^{1/0.54} = ${f3(res.S)}\\text{ m/m}, \\quad R = D/4 = ${f3(Dm / 4)}\\text{ m}` },
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
        { tex: `A = ${f3(Math.PI * Dm * Dm / 4)}\\text{ m}^2, \\qquad V = \\frac{Q}{A} = \\frac{${f3(Q)}}{${f3(Math.PI * Dm * Dm / 4)}} = ${f3(res.V)}\\text{ m/s}` },
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
            { tex: `\\frac{1}{\\sqrt{f}} = -2\\log_{10}\\left(\\frac{${f3(parseFloat(eps) || 0)}}{3.7\\times ${f3(Dm)}} + \\frac{2.51}{${f2(res.Re / 1e5)}\\times 10^5\\sqrt{f}}\\right) \\;\\Rightarrow\\; f = ${f3(res.f)}` },
            { text: `ε/D = ${f3((parseFloat(eps) || 0) / Dm)}. The Colebrook equation is implicit in f — the engine iterates it to machine precision (your Moody-chart reading, refined).` },
          ],
    },
    {
      title: 'Head loss',
      lines: [
        { tex: `h_f = f\\,\\frac{L}{D}\\,\\frac{V^2}{2g} = ${f3(res.f)}\\times\\frac{${f2(L)}}{${f3(Dm)}}\\times\\frac{${f3(res.V)}^2}{2\\times 9.81} = ${f3(res.hf)}\\text{ m}` },
        { tex: `h_m = \\Sigma K\\,\\frac{V^2}{2g} = ${f2(K)}\\times\\frac{${f3(res.V)}^2}{2\\times 9.81} = ${f3(res.hm)}\\text{ m} \\;\\Rightarrow\\; h_{total} = ${f3(res.hTotal)}\\text{ m}` },
        ...res.warnings.map((w) => ({ item: w })),
      ],
    },
  ]) : [{ title: 'Check the inputs', lines: [{ text: err }] }]

  return (
    <WorkspacePage title="Pipe Flow" badges={['Hydraulics', method === 'hw' ? 'Hazen–Williams' : 'Darcy–Weisbach']}
      intro="Friction loss in a full pipe by the two workhorse laws — Hazen–Williams for water mains, Darcy–Weisbach with an iterated Colebrook f when the roughness and temperature are known — with the minor losses ΣK on top."
      inputs={<>
        <InputGroup title="Method">
          <div className="col-span-2">
            <Pick label="Law" value={method} onChange={(v) => setMethod(v as Method)}
              options={[['hw', 'Hazen–Williams — water mains'], ['dw', 'Darcy–Weisbach — any fluid']]} />
          </div>
        </InputGroup>
        <InputGroup title="Pipe and flow">
          <Num label="Length L" unit="m" value={L} onChange={setL} min={1} max={100000} step="10" />
          <Num label="Diameter D" unit="mm" value={D} onChange={setD} min={15} max={3000} step="10" />
          <Num label="Discharge Q" unit="m³/s" value={Q} onChange={setQ} min={0.0001} max={50} step="0.01" />
          <Num label="Minor losses ΣK" value={K} onChange={setK} min={0} max={50} step="0.5" />
        </InputGroup>
        {method === 'hw' ? (
          <InputGroup title="Roughness" hint="PVC ≈ 150 · new cast iron ≈ 130 · old steel ≈ 100. Design on the aged value.">
            <Num label="Hazen–Williams C" value={C} onChange={setC} min={50} max={160} step="5" />
          </InputGroup>
        ) : (
          <InputGroup title="Roughness and temperature">
            <div className="col-span-2"><Pick label="Material ε" value={eps} onChange={setEps} options={EPS_PRESETS} /></div>
            <Num label="Water temperature" unit="°C" value={temp} onChange={setTemp} min={0} max={40} step="5" />
          </InputGroup>
        )}
      </>}
      checks={res ? <>
        <CheckCard title="Total head loss" basis={`${f2(L)} m of ${f2(D)} mm pipe`} status="info" value={f3(res.hTotal)} unit="m" formula="h = hf + ΣK·V²/2g"
          pairs={[{ label: 'Friction hf', value: `${f3(res.hf)} m` }, { label: 'Minor hm', value: `${f3(res.hm)} m` }]} />
        <CheckCard title="Hydraulic gradient" basis={method === 'hw' ? `C = ${f2(C)}` : `f = ${f3(res.f)}`} status="info" value={f2(res.S100)} unit="m per 100 m" formula={method === 'hw' ? 'V = 0.8492 C R^0.63 S^0.54' : 'hf = f (L/D) V²/2g'}
          pairs={[{ label: 'Slope S', value: `${f3(res.S)} m/m` }, ...(method === 'dw' ? [{ label: 'Reynolds', value: `${f2(res.Re / 1e5)}×10⁵, ${res.regime}` }] : [{ label: 'Hydraulic radius', value: `${f3(Dm / 4)} m` }])]} />
        <CheckCard title="Velocity" basis="full pipe" status={res.V > 3 ? 'warn' : 'info'} pillLabel={res.V > 3 ? 'HIGH' : undefined} value={f3(res.V)} unit="m/s" formula="V = Q / (πD²/4)"
          pairs={[{ label: 'Velocity head', value: `${f3(vhead)} m` }, { label: 'Flow area', value: `${f3((Math.PI * Dm * Dm) / 4)} m²` }]} />
      </> : (
        <CheckCard title="Check the inputs" basis="positive L, D and Q" status="warn" pillLabel="CHECK" value="—" formula={err} />
      )}
      summary={[
        { label: 'Law', value: method === 'hw' ? 'Hazen–Williams' : 'Darcy–Weisbach' }, { label: 'Length L', value: `${f2(L)} m` },
        { label: 'Diameter D', value: `${f2(D)} mm` }, { label: 'Discharge Q', value: `${f3(Q)} m³/s` },
        { label: 'Minor losses ΣK', value: f2(K) },
        method === 'hw' ? { label: 'Roughness C', value: f2(C) } : { label: 'Roughness ε', value: `${f2((parseFloat(eps) || 0) * 1000)} mm, ${f2(temp)} °C` },
      ]}
      drawing={res ? { title: 'Energy and hydraulic grade lines', node: <div data-pdf-drawing><PipeProfile L={L} res={res} /></div> } : undefined}
      resultsCaption={res && res.warnings.length ? res.warnings.join(' ') : undefined}
      results={res ? [
        { check: 'Velocity', basis: 'Q/A', demand: `${f3(res.V)} m/s`, limit: '≈ 3 m/s practical', status: res.V > 3 ? 'warn' : 'info' },
        { check: 'Friction loss hf', basis: method === 'hw' ? 'S·L' : 'f(L/D)V²/2g', demand: `${f3(res.hf)} m`, status: 'info' },
        { check: 'Minor losses hm', basis: 'ΣK·V²/2g', demand: `${f3(res.hm)} m`, status: 'info' },
        { check: 'Total head loss', basis: 'hf + hm', demand: `${f3(res.hTotal)} m`, status: 'info' },
      ] : [{ check: 'Head loss', basis: err, demand: '—', status: 'warn' }]}
      steps={steps}
      references={[
        { topic: 'Hazen–Williams', basis: 'V = 0.8492·C·R^0.63·S^0.54 (SI); hf = 10.67·L·Q^1.852/(C^1.852·D^4.87)', source: 'Water-supply practice' },
        { topic: 'Darcy–Weisbach', basis: 'hf = f(L/D)V²/2g; Colebrook 1/√f = −2log(ε/3.7D + 2.51/(Re√f))', source: 'Fluid mechanics — pipe flow' },
        { topic: 'Minor losses', basis: 'hm = ΣK·V²/2g', source: 'Fluid mechanics — local losses' },
      ]}
    />
  )
}
