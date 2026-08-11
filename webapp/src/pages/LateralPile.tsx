import { useMemo, useState } from 'react'
import { ReportControls } from '../components/ReportControls'
import {
  bromsClay, bromsSand, pyAnalysis,
  type PileHead, type SoilModel, type PyResult, type BromsResult,
} from '../engine/lateralPile'
import { buildLateralPileSolution } from '../lib/lateralPileSolution'
import { WorkedSolution } from '../components/WorkedSolution'
import { PageHeader, CalcBody } from '../components/calc'
import { Card, ResultCard } from '../components/qty'

function num(v: string, d = 0): number { const n = parseFloat(v); return Number.isFinite(n) ? n : d }
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '—')
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '—')

function Field({ label, value, onChange, unit, step = 'any' }: {
  label: string; value: number; onChange: (v: number) => void; unit?: string; step?: string
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 font-medium text-slate-600">{label}{unit ? ` (${unit})` : ''}</span>
      <input type="number" step={step} value={value} onChange={(e) => onChange(num(e.target.value))}
        className="rounded-md border border-slate-300 px-2.5 py-1.5" />
    </label>
  )
}

function Out({ label, value, ok, sub }: { label: string; value: string; ok?: boolean; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between border-t border-slate-100 py-1 text-sm">
      <span className="text-slate-500">{label}{sub && <span className="ml-1 text-[11px] text-slate-400">{sub}</span>}</span>
      <span className={`font-mono font-medium ${ok === undefined ? 'text-slate-800' : ok ? 'text-emerald-600' : 'text-red-600'}`}>{value}</span>
    </div>
  )
}

/** Deflection, moment and soil-reaction profiles down the pile. */
function PyProfiles({ res, L }: { res: PyResult; L: number }) {
  const W = 470, H = 300, padT = 18, padB = 30
  const panelW = (W - 30) / 3
  const series = [
    { key: 'y' as const, title: 'y (mm)', color: '#0056b3' },
    { key: 'moment' as const, title: 'M (kN·m)', color: '#b45309' },
    { key: 'p' as const, title: 'p (kN/m)', color: '#0f766e' },
  ]
  const Y = (z: number) => padT + ((H - padT - padB) * z) / Math.max(L, 1e-9)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border border-slate-200 bg-white" style={{ maxHeight: 320 }}>
      {series.map((s, si) => {
        const vals = res.stations.map((st) => st[s.key])
        const m = Math.max(...vals.map(Math.abs), 1e-9)
        const x0 = 12 + si * (panelW + 6)
        const cx = x0 + panelW / 2
        const X = (v: number) => cx + ((panelW / 2 - 6) * v) / m
        const d = res.stations
          .map((st, i) => `${i ? 'L' : 'M'}${X(st[s.key]).toFixed(1)},${Y(st.z).toFixed(1)}`).join(' ')
        return (
          <g key={s.key}>
            <line x1={cx} y1={padT} x2={cx} y2={H - padB} stroke="#e2e8f0" strokeWidth={0.9} />
            <line x1={x0} y1={padT} x2={x0 + panelW} y2={padT} stroke="#475569" strokeWidth={1} />
            <path d={d} fill="none" stroke={s.color} strokeWidth={1.8} />
            <text x={cx} y={11} fontSize={9} fill="#334155" textAnchor="middle" fontWeight={700}>{s.title}</text>
            <text x={cx} y={H - 18} fontSize={8} fill="#94a3b8" textAnchor="middle">±{f1(m)}</text>
          </g>
        )
      })}
      <text x={12} y={H - 4} fontSize={8.5} fill="#64748b">z = 0</text>
      <text x={W - 40} y={H - 4} fontSize={8.5} fill="#64748b">z = {f1(L)} m</text>
    </svg>
  )
}

function BromsCard({ r, title }: { r: BromsResult; title: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="mb-1 text-[12px] font-bold text-slate-700">{title}</p>
      <Out label="Ultimate lateral load Hu" value={`${f1(r.Hu)} kN`} />
      <Out label="Short-pile (soil) capacity" value={`${f1(r.shortPile)} kN`}
        ok={r.mode === 'short' ? false : undefined} />
      <Out label="Long-pile (hinge) capacity" value={`${f1(r.longPile)} kN`}
        ok={r.mode === 'long' ? false : undefined} />
      <Out label="Governing mechanism" value={r.mode === 'short' ? 'soil failure' : 'pile hinge'} />
      <Out label="Mmax at Hu" value={`${f1(r.Mmax)} kN·m`} sub={`at z = ${f2(r.zMax)} m`} />
    </div>
  )
}

export default function LateralPile() {
  const [soilKind, setSoilKind] = useState<'clay' | 'sand'>('clay')
  const [L, setL] = useState(12)
  const [D, setD] = useState(0.6)
  const [EI, setEI] = useState(180000)
  const [My, setMy] = useState(900)
  const [H, setH] = useState(150)
  const [e, setE] = useState(0.5)
  const [head, setHead] = useState<PileHead>('free')
  // clay
  const [cu, setCu] = useState(40)
  const [e50, setE50] = useState(0.01)
  // sand
  const [phi, setPhi] = useState(33)
  const [k, setK] = useState(25000)
  const [gamma, setGamma] = useState(9)

  const soil: SoilModel = soilKind === 'clay'
    ? { kind: 'clay', cu, gamma, e50 }
    : { kind: 'sand', gamma, phiDeg: phi, k }

  const broms = useMemo(() => (soilKind === 'clay'
    ? bromsClay({ L, d: D, cu, My, e, head })
    : bromsSand({ L, d: D, gamma, phiDeg: phi, My, e, head })),
  [soilKind, L, D, cu, My, e, head, gamma, phi])

  const py = useMemo(
    () => pyAnalysis({ L, D, EI, H, e: head === 'free' ? e : 0, head, soil, elements: 60 }),
    [L, D, EI, H, e, head, soilKind, cu, e50, gamma, phi, k], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const util = broms.Hu > 0 ? H / broms.Hu : Infinity
  const headOK = py.yHead <= 25    // 25 mm is the usual serviceability yardstick

  const solution = buildLateralPileSolution(
    { soilKind, L, D, EI, My, H, e, head, cu, e50, phiDeg: phi, k, gamma }, broms, py,
  )

  const report = {
    docCode: 'G-LP',
    ok: util <= 1 && headOK && py.converged,
    governing: `Broms ${broms.mode}-pile Hu = ${f1(broms.Hu)} kN · head deflection ${f1(py.yHead)} mm`,
    stats: [
      { label: 'Ultimate capacity Hu', value: f1(broms.Hu), unit: 'kN' },
      { label: 'Head deflection', value: f1(py.yHead), unit: 'mm' },
      { label: 'Max moment (p–y)', value: f1(py.Mmax), unit: 'kN·m' },
    ],
    checks: [
      { name: `Lateral capacity H/Hu (Broms, ${broms.mode} pile)`, ratio: util, ok: util <= 1 },
      // 25 mm is the usual serviceability yardstick, not a code limit — stated
      // in the check name so it reads as the convention it is.
      { name: 'Head deflection vs 25 mm', ratio: py.yHead / 25, ok: headOK },
    ],
    data: [
      ['Soil model', soilKind],
      ['Pile length L', `${f2(L)} m`],
      ['Diameter D', `${f2(D)} m`],
      ['Flexural stiffness EI', `${f0(EI)} kN·m²`],
      ['Yield moment My', `${f1(My)} kN·m`],
      ['Lateral load H', `${f1(H)} kN`],
      ['Load eccentricity e', `${f2(e)} m`],
      ['Head fixity', head],
      ...(soilKind === 'clay'
        ? [['Undrained strength cu', `${f1(cu)} kPa`] as [string, string],
           ['Strain ε₅₀', f2(e50)] as [string, string]]
        : [['Friction angle φ', `${f1(phi)}°`] as [string, string],
           ['Subgrade modulus k', `${f0(k)} kN/m³`] as [string, string]]),
      ['Effective unit weight γ′', `${f1(gamma)} kN/m³`],
      ['Broms short-pile capacity', `${f1(broms.shortPile)} kN`],
      ['Broms long-pile capacity', `${f1(broms.longPile)} kN`],
      ['Broms Mmax at Hu', `${f1(broms.Mmax)} kN·m`],
      ['p–y max moment depth', `${f2(py.zMmax)} m`],
      ['p–y convergence', `${py.converged ? 'converged' : 'DID NOT CONVERGE'} in ${py.iterations} iterations (residual ${py.residual.toExponential(1)})`],
    ] as [string, string][],
    steps: solution,
  }

  return (
        <div>
      <PageHeader title="Laterally loaded pile" badges={['Broms', 'Matlock', 'API RP 2A']} />
      <CalcBody wide>
        <div className="space-y-5">
      <ReportControls title="Laterally Loaded Pile" badges={['Broms', 'Matlock', 'API RP 2A']} report={report} />
      <p className="mt-2 text-sm text-slate-600">
        Two questions, two methods. <strong>Broms</strong> gives the ultimate lateral capacity in closed form and
        says whether the soil or the pile section fails first. <strong>p-y</strong> solves the pile as a beam on
        nonlinear soil springs and gives what Broms cannot — head deflection, and where the maximum moment sits.
      </p>

      <Card title="Pile & loading">
        <div className="col-span-full grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Embedded length L" unit="m" value={L} onChange={setL} step="0.5" />
          <Field label="Diameter D" unit="m" value={D} onChange={setD} step="0.05" />
          <Field label="Rigidity EI" unit="kN·m²" value={EI} onChange={setEI} step="10000" />
          <Field label="Yield moment My" unit="kN·m" value={My} onChange={setMy} step="50" />
          <Field label="Lateral load H" unit="kN" value={H} onChange={setH} step="10" />
          <Field label="Load height e" unit="m" value={e} onChange={setE} step="0.25" />
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium text-slate-600">Head condition</span>
            <select value={head} onChange={(ev) => setHead(ev.target.value as PileHead)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5">
              <option value="free">Free (rotates)</option>
              <option value="fixed">Fixed (capped)</option>
            </select>
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium text-slate-600">Soil type</span>
            <select value={soilKind} onChange={(ev) => setSoilKind(ev.target.value as 'clay' | 'sand')}
              className="rounded-md border border-slate-300 px-2.5 py-1.5">
              <option value="clay">Clay (Matlock)</option>
              <option value="sand">Sand (API)</option>
            </select>
          </label>
        </div>
      </Card>

      <Card title="Soil">
        <div className="col-span-full grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Unit weight γ′" unit="kN/m³" value={gamma} onChange={setGamma} step="0.5" />
          {soilKind === 'clay' ? (
            <>
              <Field label="Undrained cu" unit="kPa" value={cu} onChange={setCu} step="5" />
              <Field label="Strain ε₅₀" value={e50} onChange={setE50} step="0.005" />
            </>
          ) : (
            <>
              <Field label="Friction φ′" unit="°" value={phi} onChange={setPhi} step="1" />
              <Field label="Subgrade k" unit="kN/m³" value={k} onChange={setK} step="5000" />
            </>
          )}
        </div>
        {head === 'fixed' && (
          <p className="mt-2 text-[11px] text-amber-700">
            A fixed head has no free rotation, so the load height e is not used by either method.
          </p>
        )}
      </Card>

      <ResultCard title="Ultimate capacity — Broms">
        <BromsCard r={broms} title={soilKind === 'clay' ? 'Cohesive (9·cu·d below 1.5d)' : 'Cohesionless (3·Kp·γ·z·d)'} />
        <div className="mt-3">
          <Out label="Applied H / Hu" value={f2(util)} ok={util <= 1}
            sub={util <= 1 ? 'within ultimate capacity' : 'exceeds ultimate capacity'} />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          The governing capacity is the LOWER of the two mechanisms, which is also what tells you which kind of pile
          this is — &ldquo;short&rdquo; is a verdict, not a length. Broms is an ultimate check: apply your own factor
          of safety, typically 2 to 3 on Hu for a working load.
        </p>
      </ResultCard>

      <ResultCard title="Response at working load — p-y">
        <PyProfiles res={py} L={L} />
        <div className="mt-3">
          <Out label="Head deflection" value={`${f2(py.yHead)} mm`} ok={headOK}
            sub="25 mm is the usual serviceability yardstick" />
          <Out label="Maximum moment" value={`${f1(py.Mmax)} kN·m`} sub={`at z = ${f2(py.zMmax)} m`} />
          <Out label="Moment utilisation M/My" value={f2(My > 0 ? py.Mmax / My : Infinity)}
            ok={My > 0 && py.Mmax <= My} />
          <Out label="Solution" value={py.converged ? `converged in ${f0(py.iterations)} iterations` : 'did not converge'}
            ok={py.converged} sub={`residual ${py.residual.toExponential(1)}`} />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Clay uses Matlock&rsquo;s soft-clay curve, sand the API RP 2A sand curve. The pile is modelled as beam
          elements on nonlinear springs and solved by Newton; the residual is reported so a solve that fell short is
          visible rather than silently presented as an answer. Deflections are relative to the undeflected pile axis.
        </p>
      </ResultCard>
      {/* The step-by-step already existed and only ever reached the PDF. */}
      <div className="mt-5">
        <WorkedSolution steps={solution} title="Calculation report — worked solution" />
      </div>
        </div>
      </CalcBody>
    </div>
  )
}
