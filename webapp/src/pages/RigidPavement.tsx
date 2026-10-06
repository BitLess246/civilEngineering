import { useState } from 'react'
import {
  requiredD, J_OPTIONS, type RigidResult,
} from '../engine/rigidPavement'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { RigidJoint } from '../components/pavementSketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Rigid Pavement — the AASHTO 1993 rigid design equation solved for the
// PCC slab thickness D from the design ESALs, reliability, modulus of
// rupture, load transfer and drainage.

const SAMPLE = {
  W18: 5_000_000, reliability: 90, S0: 0.35, pt: 2.5,
  sc_MPa: 4.5, Cd: 1, J: 3.2, E_MPa: 27580, k_MNpm3: 54.3,
}

export default function RigidPavement() {
  const [W18, setW18] = useState(SAMPLE.W18)
  const [reliability, setReliability] = useState(SAMPLE.reliability)
  const [S0, setS0] = useState(SAMPLE.S0)
  const [pt, setPt] = useState(SAMPLE.pt)
  const [sc, setSc] = useState(SAMPLE.sc_MPa)
  const [Cd, setCd] = useState(SAMPLE.Cd)
  const [J, setJ] = useState(SAMPLE.J)
  const [E, setE] = useState(SAMPLE.E_MPa)
  const [k, setK] = useState(SAMPLE.k_MNpm3)

  const out: { r: RigidResult | null; err: string | null } = (() => {
    try {
      return { r: requiredD({ W18, reliability, S0, pi: 4.5, pt, sc_MPa: sc, Cd, J, E_MPa: E, k_MNpm3: k }), err: null }
    } catch (e) {
      return { r: null, err: e instanceof Error ? e.message : 'Check the inputs' }
    }
  })()
  const { r, err } = out

  const steps: SolutionStep[] = r ? [
    {
      title: 'Reliability → standard normal deviate',
      lines: [
        { tex: `ZR = ${f2(r.ZR)} \\;\\text{ at }\\; R = ${reliability}\\,\\% \\quad (\\text{AASHTO ladder})` },
        { text: `Overall standard deviation S0 = ${f2(S0)} (rigid practice 0.30–0.50). Serviceability p0 = 4.5 (rigid) and pt = ${f2(pt)} give ΔPSI = ${f2(r.dPSI)}.` },
      ],
    },
    {
      title: 'Material, subgrade and drainage inputs (US units as printed)',
      lines: [
        { tex: `s_c' = ${f2(r.scPsi)}\\ \\text{psi} \\quad C_d = ${f2(Cd)} \\quad J = ${f2(J)} \\quad E = ${(r.Epsi / 1e6).toFixed(1)}\\times 10^6\\ \\text{psi}` },
        { tex: `k = ${f2(k)}\\ \\text{MN/m}^3 \\div 0.271447 = ${f2(r.kPci)}\\ \\text{pci}` },
        { text: 'k is the modulus of subgrade reaction in the Guide\'s own pci — subgrade support, read from a plate test or a CBR correlation (compacted subgrades run about 75–220 pci). There is no default: a slab must never be sized for soil that was never entered. J falls as load transfer improves (2.8 tied PCC shoulder … 3.2 untied).' },
      ],
    },
    {
      title: 'Solve the rigid equation for D (bisection on a monotone RHS)',
      lines: [
        { tex: '\\log_{10} W_{18} = Z_R S_0 + 7.35\\log_{10}(D+1) - 0.06 + \\frac{\\log_{10}\\frac{\\Delta PSI}{4.5-1.5}}{1 + \\frac{1.624\\times 10^7}{(D+1)^{8.46}}} + (4.22 - 0.32\\,p_t)\\log_{10}\\!\\left[\\frac{s_c\' C_d (D^{0.75}-1.132)}{215.63\\, J (D^{0.75} - \\frac{18.42}{(E/k)^{0.25}})}\\right]' },
        { tex: `D = ${f2(r.D_in)}\\ \\text{in} = ${f2(r.D)}\\ \\text{mm} \\qquad \\text{check: log}_{10}W_{18} = ${f3(r.logW18)} = \\log_{10}(${(W18 / 1e6).toFixed(2)}\\times 10^6)` },
        { text: 'Round UP to the next 10 mm for the construction surface — the equation is a minimum, and dowel/edge detailing follows the same Guide.' },
      ],
    },
  ] : [{ title: 'Check the inputs', lines: [{ text: err ?? 'Check the inputs.' }] }]

  const loadSample = () => { setW18(SAMPLE.W18); setReliability(SAMPLE.reliability); setS0(SAMPLE.S0); setPt(SAMPLE.pt); setSc(SAMPLE.sc_MPa); setCd(SAMPLE.Cd); setJ(SAMPLE.J); setE(SAMPLE.E_MPa); setK(SAMPLE.k_MNpm3) }
  const Dbuild = r ? Math.ceil(r.D / 10) * 10 : 0
  return (
    <WorkspacePage title="Rigid Pavement" badges={['Pavement', 'AASHTO 1993 rigid']}
      intro="The AASHTO 1993 rigid design equation: the PCC slab thickness D that carries the design ESALs at the chosen reliability, modulus of rupture, load-transfer coefficient and drainage condition."
      inputs={<>
        <InputGroup title="Traffic and reliability">
          <div className="col-span-2"><Num label="Design ESALs W18" value={W18} onChange={setW18} min={1} step="1000" /></div>
          <Num label="Reliability R" unit="%" value={reliability} onChange={setReliability} min={50} max={99.9} step="1" />
          <Num label="Std dev S₀" value={S0} onChange={setS0} min={0.1} max={0.6} step="0.01" />
          <Num label="Terminal pt" value={pt} onChange={setPt} min={1.5} max={4} step="0.1" />
        </InputGroup>
        <InputGroup title="Concrete and support">
          <Num label="Rupture sc'" unit="MPa" value={sc} onChange={setSc} min={2} max={8} step="0.1" />
          <Num label="Modulus E" unit="MPa" value={E} onChange={setE} min={15000} max={50000} step="500" />
          <Num label="Subgrade k" unit="MN/m³" value={k} onChange={setK} min={5} max={150} step="1" />
          <Num label="Drainage Cd" value={Cd} onChange={setCd} min={0.7} max={1.25} step="0.05" />
          <div className="col-span-2">
            <Pick label="Load transfer J" value={String(J)} onChange={(v) => setJ(Number(v))} options={J_OPTIONS.map((o) => [String(o.j), o.label])} />
          </div>
          <div className="col-span-2">
            <button type="button" onClick={loadSample}
              className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">Sample: 5 M ESALs, 90 %, J 3.2</button>
          </div>
        </InputGroup>
      </>}
      checks={r ? <>
        <CheckCard title="Slab thickness" basis="AASHTO 1993 rigid equation" status="info" value={f2(r.D)} unit="mm"
          formula="log W18 = Z_R S₀ + 7.35 log(D + 1) − 0.06 + …"
          pairs={[{ label: 'Build (next 10 mm)', value: `${Dbuild} mm` }, { label: 'Inches', value: f2(r.D_in) }]} />
        <CheckCard title="Design inputs" basis={`R ${f2(reliability)} %`} status="info" value={f2(r.ZR)} unit="Z_R"
          pairs={[{ label: 'ΔPSI', value: f2(r.dPSI) }, { label: 'k', value: `${f2(r.kPci)} pci` }]} />
      </> : (
        <CheckCard title="Check the inputs" basis="AASHTO 1993 rigid" status="warn" pillLabel="CHECK" value="—" formula={err ?? 'Check the inputs.'} />
      )}
      summary={[
        { label: 'W18', value: `${(W18 / 1e6).toFixed(2)} × 10⁶` },
        { label: 'Reliability', value: `${f2(reliability)} %, S₀ ${f2(S0)}` },
        { label: 'Concrete', value: `sc' ${f2(sc)} MPa, E ${f2(E)} MPa` },
        { label: 'Support', value: `k ${f2(k)} MN/m³, Cd ${f2(Cd)}, J ${f2(J)}` },
      ]}
      drawing={r ? { title: 'Slab at a transverse joint', node: <div data-pdf-drawing><RigidJoint D={r.D} /></div> } : undefined}
      results={r ? [
        { check: 'Required slab D', basis: 'rigid design equation', demand: `${f2(r.D)} mm (${f2(r.D_in)} in)`, status: 'info' as const },
        { check: 'Construction thickness', basis: 'rounded up to 10 mm', demand: `${Dbuild} mm`, status: 'info' as const },
        { check: 'Equation check', basis: `log₁₀ W18 = ${f3(Math.log10(W18))}`, demand: f3(r.logW18), status: 'pass' as const },
      ] : [{ check: 'Slab', basis: err ?? 'invalid input', demand: '—', status: 'warn' as const }]}
      steps={steps}
      references={[
        { topic: 'Rigid design equation', basis: 'log W18 in D, sc′, Cd, J, E, k', source: 'AASHTO Guide for Design of Pavement Structures (1993), Part II' },
        { topic: 'Load transfer J', basis: '2.8 tied PCC shoulder … 3.2 untied', source: 'AASHTO 1993, Part II (load transfer)' },
        { topic: 'Dowel sizing', basis: 'diameter ≈ D/8 rule of thumb (drawing only)', source: 'common practice; not designed here' },
      ]}
    />
  )
}
