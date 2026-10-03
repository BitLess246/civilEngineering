import { useState } from 'react'
import 'katex/dist/katex.min.css'
import {
  requiredD, J_OPTIONS, type RigidResult,
} from '../engine/rigidPavement'
import { Card, Num, ResultCard, Row, Pick } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, f2, f3 } from '../lib/influenceStyle'

// Rigid Pavement — the AASHTO 1993 rigid design equation solved for the
// PCC slab thickness D from the design ESALs, reliability, modulus of
// rupture, load transfer and drainage.

const SAMPLE = {
  W18: 5_000_000, reliability: 90, S0: 0.35, pt: 2.5,
  sc_MPa: 4.5, Cd: 1, J: 3.2, E_MPa: 27580,
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

  let r: RigidResult | null = null
  let err: string | null = null
  try { r = requiredD({ W18, reliability, S0, pi: 4.5, pt, sc_MPa: sc, Cd, J, E_MPa: E }) }
  catch (e) { err = e instanceof Error ? e.message : 'Check the inputs' }

  const steps: SolutionStep[] = r ? [
    {
      title: 'Reliability → standard normal deviate',
      lines: [
        { tex: `ZR = ${f2(r.ZR)} \\;\\text{ at }\\; R = ${reliability}\\,\\% \\quad (\\text{AASHTO ladder})` },
        { text: `Overall standard deviation S0 = ${f2(S0)} (rigid practice 0.30–0.50). Serviceability p0 = 4.5 (rigid) and pt = ${f2(pt)} give ΔPSI = ${f2(r.dPSI)}.` },
      ],
    },
    {
      title: 'Material and drainage inputs (US units as printed)',
      lines: [
        { tex: `s_c' = ${f2(r.scPsi)}\\ \\text{psi} \\quad C_d = ${f2(Cd)} \\quad J = ${f2(J)} \\quad E = ${(r.Epsi / 1e6).toFixed(1)}\\times 10^6\\ \\text{psi},\\; c = 0.25` },
        { text: 'The Guide converts flexural strength with the c = 0.25 strength ratio inside the E/c term; J falls as load transfer improves (2.8 tied PCC shoulder … 3.2 untied).' },
      ],
    },
    {
      title: 'Solve the rigid equation for D (bisection on a monotone RHS)',
      lines: [
        { tex: '\\log_{10} W_{18} = Z_R S_0 + 7.35\\log_{10}(D+1) - 0.06 + \\frac{\\log_{10}\\frac{\\Delta PSI}{4.5-1.5}}{1 + \\frac{1.624\\times 10^7}{(D+1)^{8.46}}} + (4.22 - 0.32\\,p_t)\\log_{10}\\!\\left[\\frac{s_c\' C_d (D^{0.75}-1.132)}{215.63\\, J (D^{0.75} - \\frac{18.42}{(E/c)^{0.25}})}\\right]' },
        { tex: `D = ${f2(r.D_in)}\\ \\text{in} = ${f2(r.D)}\\ \\text{mm} \\qquad \\text{check: log}_{10}W_{18} = ${f3(r.logW18)} = \\log_{10}(${(W18 / 1e6).toFixed(2)}\\times 10^6)` },
        { text: 'Round UP to the next 10 mm for the construction surface — the equation is a minimum, and dowel/edge detailing follows the same Guide.' },
      ],
    },
  ] : []

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Rigid Pavement Report" badges={[r ? `D ${f2(r.D)} mm` : 'AASHTO 93 rigid']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        The AASHTO 1993 rigid design equation: the PCC slab thickness D that carries the
        design ESALs at the chosen reliability, modulus of rupture, load-transfer coefficient
        and drainage condition. The twin of the /pavement flexible tool — same traffic,
        different material model.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Traffic & reliability">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => { setW18(SAMPLE.W18); setReliability(SAMPLE.reliability); setS0(SAMPLE.S0); setPt(SAMPLE.pt); setSc(SAMPLE.sc_MPa); setCd(SAMPLE.Cd); setJ(SAMPLE.J); setE(SAMPLE.E_MPa) }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — 5 M ESALs · 90 % · J 3.2
              </button>
            </div>
            <Num label="Design ESALs W18" unit="—" value={W18} onChange={setW18} min={1} step="1000" />
            <Num label="Reliability R" unit="%" value={reliability} onChange={setReliability} min={50} max={99.9} step="1" />
            <Num label="Std deviation S0" unit="—" value={S0} onChange={setS0} min={0.1} max={0.6} step="0.01" />
            <Num label="Terminal serviceability pt" unit="—" value={pt} onChange={setPt} min={1.5} max={4} step="0.1" />
          </Card>

          <Card title="Concrete & load transfer">
            <Num label="Modulus of rupture sc'" unit="MPa" value={sc} onChange={setSc} min={2} max={8} step="0.1" />
            <Num label="Elastic modulus E" unit="MPa" value={E} onChange={setE} min={15000} max={50000} step="500" />
            <Num label="Drainage coefficient Cd" unit="—" value={Cd} onChange={setCd} min={0.7} max={1.25} step="0.05" />
            <Pick label="Load-transfer coefficient J" value={String(J)} onChange={(v) => setJ(Number(v))}
              options={J_OPTIONS.map((o) => [String(o.j), o.label])} />
          </Card>
        </div>

        <div className="space-y-5">
          {r ? (
            <>
              <ResultCard title="Required slab thickness">
                <Row label="D (computed)" value={`${f2(r.D)} mm`} sub={`${f2(r.D_in)} inches — the Guide's native unit`} />
                <Row label="Design ΔPSI" value={f2(r.dPSI)} sub={`p0 = 4.5 → pt = ${f2(pt)}`} />
                <Row label="ZR at the reliability" value={f2(r.ZR)} sub={`S0 = ${f2(S0)} · equation check log₁₀W18 = ${f3(r.logW18)}`} />
              </ResultCard>

              <DrawingCard title="Slab cross-section" meta="PCC slab on granular base — dowelled transverse joints">
                <DrawingFrame label="Rigid pavement section">
                  <Section D={r.D} />
                </DrawingFrame>
              </DrawingCard>

              <WorkedSolution steps={steps} title="AASHTO 93 rigid — step by step" />
            </>
          ) : (
            <ResultCard title="Check the inputs">
              <p className="text-sm text-fail">{err}</p>
            </ResultCard>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ D }: { D: number }) {
  const W = 640, Hh = 260
  const x0 = 90, x1 = W - 90
  const scale = Math.max(0.35, Math.min(1.6, D / 200))
  const t = D * scale
  const slabY = 150
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full" role="img" aria-label="Rigid pavement cross-section">
      {/* slab */}
      <rect x={x0} y={slabY} width={x1 - x0} height={t} fill="rgba(15,76,146,0.16)" stroke={INK} strokeWidth="1.4" />
      {/* base */}
      <rect x={x0} y={slabY + t} width={x1 - x0} height={26} fill="rgba(115,109,94,0.28)" stroke={MUTED} strokeWidth="1" />
      {/* subgrade */}
      <rect x={x0} y={slabY + t + 26} width={x1 - x0} height={30} fill="rgba(115,109,94,0.14)" stroke="none" />
      {/* dowel bars */}
      {[0.18, 0.38, 0.62, 0.82].map((f, i) => (
        <circle key={i} cx={x0 + (x1 - x0) * f} cy={slabY + t / 2} r="3.4" fill="none" stroke={INK} strokeWidth="1.2" />
      ))}
      <text x={x0 - 10} y={slabY + t / 2 + 4} textAnchor="end" fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">dowels</text>
      {/* dimension line */}
      <line x1={x1 + 14} x2={x1 + 14} y1={slabY} y2={slabY + t} stroke={MUTED} strokeWidth="1" />
      <text x={x1 + 20} y={slabY + t / 2 + 4} fontSize="11" fill={INK} fontFamily="var(--font-mono, monospace)">
        D = {f2(D)} mm
      </text>
      {/* layer labels */}
      <text x={x0 + 8} y={slabY - 8} fontSize="10.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">PCC slab — sc′, E, J load transfer</text>
      <text x={x0 + 8} y={slabY + t + 17} fontSize="10.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">granular base · Cd</text>
      <text x={x0 + 8} y={slabY + t + 45} fontSize="10.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">compacted subgrade</text>
    </svg>
  )
}
