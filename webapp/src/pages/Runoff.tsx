import { useState } from 'react'
import 'katex/dist/katex.min.css'
import {
  scsRunoffSuite, type RunoffSuite, type CnPart,
} from '../engine/runoffHydrology'
import { Card, Num, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, f2, f3 } from '../lib/influenceStyle'

// SCS Runoff — the NRCS curve-number chain: composite CN from land covers,
// retention S and initial abstraction Ia, runoff depth Q from the storm P,
// the TR-55 lag-method time of concentration, and the triangular unit
// hydrograph peak (SI twin of the 484 equation) with the runoff volume.

const SAMPLE: CnPart[] = [
  { name: 'Meadow, B soils', area: 20, cn: 75 },
  { name: 'Roofs & pavement', area: 30, cn: 85 },
]

export default function Runoff() {
  const [parts, setParts] = useState<CnPart[]>(SAMPLE)
  const [P, setP] = useState(120)
  const [L, setL] = useState(500)
  const [slopePct, setSlopePct] = useState(3)
  const [dtMin, setDtMin] = useState(10)

  const out: { s: RunoffSuite | null } = (() => {
    try {
      return { s: scsRunoffSuite({ parts, P, L, slopePct, dtMin }) }
    } catch { return { s: null } }
  })()
  const s = out.s

  const setPart = (i: number, patch: Partial<CnPart>) => {
    setParts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  }

  const steps: SolutionStep[] = s ? [
    {
      title: 'Composite curve number',
      lines: [
        { tex: 'CN = \\frac{\\sum A_i CN_i}{\\sum A_i}' },
        { text: s.composite.rows.map((r) => `${r.name}: ${r.area} ha × CN ${r.cn} (${(r.weight * 100).toFixed(0)} %)`).join(' · ') },
        { tex: `CN = ${f2(s.composite.cn)} \\quad\\Rightarrow\\quad S = \\frac{25400}{CN} - 254 = ${f2(s.runoff.S)}\\ \\text{mm}` },
      ],
    },
    {
      title: 'Runoff depth',
      lines: [
        { tex: 'I_a = 0.2S \\quad\\quad Q = \\frac{(P - I_a)^2}{P - I_a + S}' },
        { tex: `I_a = ${f2(s.runoff.Ia)}\\ \\text{mm} \\quad Q = \\frac{(${f2(P)} - ${f2(s.runoff.Ia)})^2}{${f2(P)} - ${f2(s.runoff.Ia)} + ${f2(s.runoff.S)}} = ${f2(s.runoff.Q)}\\ \\text{mm}` },
        { text: `Volumetric runoff coefficient Q/P = ${f3(s.runoff.coefficient)}; the storm delivers ${(s.runoff.Q / 10).toFixed(1)} L/m² over the catchment — ${(s.volumeM3 / 1000).toFixed(1)} × 10³ m³ in total (V = 10·Q·A_ha).` },
      ],
    },
    {
      title: 'Lag time → time of concentration (TR-55)',
      lines: [
        { tex: 'T_{lag} = \\frac{L^{0.8}(S + 25.4)^{0.7}}{7069\\sqrt{Y}} \\quad\\quad T_c = \\frac{T_{lag}}{0.6}' },
        { text: `L = ${f3(L)} m of hydraulic length, Y = ${f2(slopePct)} % average watershed slope, S in mm. Lag = ${f3(s.lag.lagHr)} h → Tc = ${f3(s.lag.tcHr)} h (${f2(s.lag.tcHr * 60)} min).` },
      ],
    },
    {
      title: 'Triangular unit hydrograph peak',
      lines: [
        { tex: 'T_p = \\frac{\\Delta t}{2} + 0.6\\,T_c \\quad\\quad Q_p = \\frac{0.208\\,A\\,Q}{T_p}' },
        { text: `Δt = ${dtMin} min computation interval, A = ${(s.composite.area / 100).toFixed(2)} km², Q in mm. The SI coefficient 0.208 is the metric twin of the 484 in TR-55's US-unit equation; the base time is 2.67·Tp.` },
        { tex: `T_p = ${f3(s.uh.tp)}\\ \\text{h} \\;\\Rightarrow\\; Q_p = ${f2(s.uh.qp)}\\ \\text{m}^3/\\text{s},\\quad t_b = ${f2(s.uh.tb)}\\ \\text{h}` },
      ],
    },
    ...s.runoff.notes.map((nt) => ({ title: 'Note', lines: [{ text: nt }] })),
  ] : []

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="SCS Runoff Report" badges={[s ? `CN ${f2(s.composite.cn)}` : 'NRCS CN']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        The NRCS curve-number chain for a design storm: an area-weighted composite CN,
        retention S and initial abstraction Ia, the runoff depth and its volume, the
        TR-55 lag-method time of concentration, and the triangular unit-hydrograph
        peak discharge for the catchment.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Catchment">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => { setParts(SAMPLE.map((p) => ({ ...p }))); setP(120); setL(500); setSlopePct(3); setDtMin(10) }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — 50 ha · CN 81 · 120 mm storm
              </button>
            </div>
            <Num label="Storm depth P" unit="mm" value={P} onChange={setP} min={0} max={800} step="5" />
            <Num label="Hydraulic length L" unit="m" value={L} onChange={setL} min={20} max={20000} step="10" />
            <Num label="Watershed slope Y" unit="%" value={slopePct} onChange={setSlopePct} min={0.1} max={50} step="0.1" />
            <Num label="Computation interval Δt" unit="min" value={dtMin} onChange={setDtMin} min={2} max={60} step="1" />
          </Card>

          <Card title="Land covers (area · curve number)">
            {parts.map((p, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_84px_74px_32px] items-center gap-2 sm:col-span-2 lg:col-span-3">
                <input
                  value={p.name}
                  onChange={(e) => setPart(i, { name: e.target.value })}
                  className="w-full rounded-md border border-field-line bg-surface px-2 py-1.5 text-sm"
                  aria-label={`Cover ${i + 1} name`}
                />
                <input
                  type="number" value={p.area} min={0.1} step={1}
                  onChange={(e) => setPart(i, { area: Number(e.target.value) })}
                  className="w-full rounded-md border border-field-line bg-surface px-2 py-1.5 text-sm"
                  aria-label={`Cover ${i + 1} area (ha)`}
                />
                <input
                  type="number" value={p.cn} min={30} max={100} step={1}
                  onChange={(e) => setPart(i, { cn: Number(e.target.value) })}
                  className="w-full rounded-md border border-field-line bg-surface px-2 py-1.5 text-sm"
                  aria-label={`Cover ${i + 1} CN`}
                />
                <button type="button" aria-label={`Remove cover ${i + 1}`}
                  onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))}
                  className="rounded-md border border-field-line px-1 py-1 text-xs text-muted hover:text-fail">
                  ✕
                </button>
              </div>
            ))}
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => setParts((ps) => [...ps, { name: 'New cover', area: 10, cn: 80 }])}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                + Add cover
              </button>
              <span className="self-center text-xs text-muted">area in hectares · CN 30–100</span>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {s ? (
            <>
              <ResultCard title="Runoff depth & volume">
                <Row label="Composite CN" value={f2(s.composite.cn)} sub={`${f3(s.composite.area)} ha total`} />
                <Row label="Retention S" value={`${f2(s.runoff.S)} mm`} sub={`Ia = 0.2S = ${f2(s.runoff.Ia)} mm`} />
                <Row label="Runoff depth Q" value={`${f2(s.runoff.Q)} mm`} sub={`of P = ${f2(P)} mm · Q/P = ${f3(s.runoff.coefficient)}`} />
                <Row label="Runoff volume" value={`${f3(s.volumeM3)} m³`} sub={`10·Q·A = ${(s.volumeM3 / 1000).toFixed(1)} × 10³ m³`} />
              </ResultCard>

              <ResultCard title="Timing & peak (TR-55)">
                <Row label="Lag time" value={`${f3(s.lag.lagHr)} h`} sub={`${f2(s.lag.lagHr * 60)} min`} />
                <Row label="Time of concentration Tc" value={`${f3(s.lag.tcHr)} h`} sub={`${f2(s.lag.tcHr * 60)} min (Tlag/0.6)`} />
                <Row label="Time to peak Tp" value={`${f3(s.uh.tp)} h`} sub={`Δt/2 + 0.6·Tc = ${f2(s.uh.tp * 60)} min`} />
                <Row label="Peak discharge Qp" value={`${f2(s.uh.qp)} m³/s`} sub={`0.208·A·Q/Tp on ${(s.composite.area / 100).toFixed(2)} km² · base ${f2(s.uh.tb)} h`} />
              </ResultCard>

              <DrawingCard title="Triangular hydrograph" meta="TR-55 triangular UH of the storm">
                <DrawingFrame label="Runoff hydrograph">
                  <Hydrograph tp={s.uh.tp} qp={s.uh.qp} tb={s.uh.tb} P={P} Q={s.runoff.Q} />
                </DrawingFrame>
              </DrawingCard>

              <WorkedSolution steps={steps} title="SCS runoff — step by step" />
            </>
          ) : (
            <ResultCard title="Check the inputs">
              <p className="text-sm text-fail">
                Keep every cover area positive and its CN between 30 and 100, give a positive
                hydraulic length and watershed slope. A storm below the initial abstraction
                simply produces zero runoff — the page still shows the retention numbers.
              </p>
            </ResultCard>
          )}
        </div>
      </div>
    </div>
  )
}

// ── triangular hydrograph drawing ────────────────────────────────────────

function Hydrograph({ tp, qp, tb, P, Q }: { tp: number; qp: number; tb: number; P: number; Q: number }) {
  const W = 640, Hh = 300
  const x0 = 70, x1 = W - 60
  const baseY = Hh - 52
  const topY = 46
  const qpPix = Math.min(baseY - topY - 24, 150)
  const tpX = x0 + ((x1 - x0) * tp) / Math.max(tb, 1e-9)
  const tbX = x0 + (x1 - x0)

  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full" role="img" aria-label="Triangular hydrograph">
      {/* axes */}
      <line x1={x0} x2={x1} y1={baseY} y2={baseY} stroke={INK} strokeWidth="1.2" />
      <line x1={x0} x2={x0} y1={topY - 8} y2={baseY} stroke={INK} strokeWidth="1.2" />
      {/* the triangle */}
      <polygon points={`${x0},${baseY} ${tpX},${baseY - qpPix} ${tbX},${baseY}`}
        fill="rgba(15,76,146,0.12)" stroke="rgba(15,76,146,0.85)" strokeWidth="1.8" />
      {/* peak marker */}
      <line x1={tpX} x2={tpX} y1={baseY - qpPix} y2={baseY} stroke={MUTED} strokeWidth="1" strokeDasharray="4 3" />
      <text x={tpX + 6} y={baseY - qpPix + 2} fontSize="11" fill={INK} fontFamily="var(--font-mono, monospace)">
        Qp = {f2(qp)} m³/s
      </text>
      <text x={tpX} y={baseY + 16} textAnchor="middle" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
        Tp = {f3(tp)} h
      </text>
      <text x={tbX} y={baseY + 16} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
        tb = {f2(tb)} h
      </text>
      {/* axis labels */}
      <text x={16} y={topY} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">Q (m³/s)</text>
      <text x={x1} y={baseY + 30} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">t (h)</text>
      {/* catchment note */}
      <text x={x0 + 8} y={topY - 12} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
        P = {f2(P)} mm → Q = {f2(Q)} mm runoff · ΔQp triangle, base 2.67·Tp
      </text>
    </svg>
  )
}
