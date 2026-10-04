import { useState } from 'react'
import 'katex/dist/katex.min.css'
import { muskingumRoute, type MuskingumResult } from '../engine/muskingum'
import { Card, Num, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, f2, f3 } from '../lib/influenceStyle'

// Muskingum channel routing — K, X and Δt give the three weighting
// coefficients; the inflow hydrograph routes step by step through
// O2 = C0·I2 + C1·I1 + C2·O1, with the peak attenuation and lag read off
// the paired hydrographs.

const SAMPLE_INFLOW = [0, 10, 30, 60, 90, 70, 45, 25, 12, 5, 0]

export default function Muskingum() {
  const [K, setK] = useState(1)
  const [X, setX] = useState(0.2)
  const [dt, setDt] = useState(0.5)
  const [inflow, setInflow] = useState<number[]>(SAMPLE_INFLOW)

  const out: { r: MuskingumResult | null; error: string | null } = (() => {
    try {
      return { r: muskingumRoute({ K, X, dt, inflow }), error: null }
    } catch (e) {
      return { r: null, error: e instanceof Error ? e.message : 'Invalid input.' }
    }
  })()
  const r = out.r

  const setOrd = (i: number, v: number) => setInflow((qs) => qs.map((q, j) => (j === i ? v : q)))

  const steps: SolutionStep[] = r ? [
    {
      title: 'Storage model',
      lines: [
        { tex: 'S = K\\,[\\,X I + (1-X)\\,O\\,]' },
        { text: `K = ${f2(K)} h is the reach's storage time constant; X = ${f2(X)} weights inflow against outflow storage (0 = level-pool reservoir, 0.5 = pure translation).` },
      ],
    },
    {
      title: 'Routing coefficients',
      lines: [
        { tex: 'C_0 = \\frac{0.5\\Delta t - KX}{K(1-X) + 0.5\\Delta t},\\quad C_1 = \\frac{0.5\\Delta t + KX}{K(1-X) + 0.5\\Delta t},\\quad C_2 = \\frac{K(1-X) - 0.5\\Delta t}{K(1-X) + 0.5\\Delta t}' },
        { tex: `D = ${f2(K)}\\times ${(1 - X).toFixed(2)} + 0.5\\times ${f2(dt)} = ${f3(K * (1 - X) + 0.5 * dt)}` },
        { tex: `C_0 = \\frac{0.5\\times ${f2(dt)} - ${f2(K)}\\times ${f2(X)}}{D} = ${f3(r.C0)},\\; C_1 = \\frac{0.5\\times ${f2(dt)} + ${f2(K)}\\times ${f2(X)}}{D} = ${f3(r.C1)},\\; C_2 = \\frac{${f2(K)}\\times ${(1 - X).toFixed(2)} - 0.5\\times ${f2(dt)}}{D} = ${f3(r.C2)},\\; \\sum C = 1` },
        { text: `All three are non-negative because 2KX = ${f2(2 * K * X)} h ≤ Δt = ${f2(dt)} h ≤ 2K(1−X) = ${f2(2 * K * (1 - X))} h — the stability window.` },
      ],
    },
    {
      title: 'Step the hydrograph',
      lines: [
        { tex: 'O_2 = C_0 I_2 + C_1 I_1 + C_2 O_1' },
        { tex: `O_1 = ${f3(r.C0)}\\times ${f2(inflow[1])} + ${f3(r.C1)}\\times ${f2(inflow[0])} + ${f3(r.C2)}\\times ${f2(r.outflow[0])} = ${f2(r.outflow[1])}\\ \\text{m}^3/\\text{s}` },
        { text: `Starting from steady flow O0 = I0 = ${f2(inflow[0])} m³/s, each interval routes ${f2(dt)} h of inflow. ${inflow.length} ordinates in, ${inflow.length} out.` },
        { tex: `Q_{peak}\\colon ${f2(r.peakIn)} \\rightarrow ${f2(r.peakOut)}\\ \\text{m}^3/\\text{s} \\quad (${f2(r.attenuationPct)}\\%\\ \\text{attenuated})` },
        { text: `The peak passes the reach ${f2(r.lagHr)} h later than it entered — translation plus storage.` },
      ],
    },
    {
      title: 'Volume check',
      lines: [
        { tex: '\\text{trap}(I) - \\text{trap}(O) = \\Delta S = K[\\,XI + (1-X)O\\,]_{end} - K[\\,XI + (1-X)O\\,]_{start}' },
        { tex: `\\text{trap}(I) - \\text{trap}(O) = ${(r.volumeIn / 1000).toFixed(1)} - ${(r.volumeOut / 1000).toFixed(1)} = ${((r.volumeIn - r.volumeOut) / 1000).toFixed(1)}\\ \\times 10^3\\text{ m}^3 = \\Delta S` },
        { text: `Inflow ${(r.volumeIn / 1000).toFixed(1)} ×10³ m³, outflow ${(r.volumeOut / 1000).toFixed(1)} ×10³ m³; the difference is stored in (or released from) the reach, exactly the change in K[XI+(1−X)O].` },
      ],
    },
    ...r.notes.map((nt) => ({ title: 'Note', lines: [{ text: nt }] })),
  ] : []

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Muskingum Routing Report" badges={[r ? `−${f2(r.attenuationPct)}% peak` : 'channel routing']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Route a flood wave through a river reach with the Muskingum method: the storage
        S = K[X·I + (1−X)·O] turns K, X and the routing interval into three weighting
        coefficients that translate and attenuate the inflow hydrograph, with the
        stability window 2KX ≤ Δt ≤ 2K(1−X) enforced.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Reach and interval">
            <Num label="Storage constant K" unit="h" value={K} onChange={setK} min={0.1} max={72} step="0.1" />
            <Num label="Weighting X" value={X} onChange={setX} min={0} max={0.5} step="0.05" />
            <Num label="Routing interval Δt" unit="h" value={dt} onChange={setDt} min={0.1} max={24} step="0.1" />
            <div className="sm:col-span-2 lg:col-span-3 text-xs text-muted">
              Stability: 2KX = {f2(2 * K * X)} h ≤ Δt ≤ {f2(2 * K * (1 - X))} h
            </div>
          </Card>

          <Card title="Inflow hydrograph (m³/s per Δt)">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => { setK(1); setX(0.2); setDt(0.5); setInflow(SAMPLE_INFLOW) }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — 90 m³/s triangular flood wave
              </button>
            </div>
            {inflow.map((q, i) => (
              <div key={i} className="grid grid-cols-[44px_minmax(0,1fr)_32px] items-center gap-2 sm:col-span-2 lg:col-span-3">
                <span className="text-xs text-muted">{f3(i * dt)} h</span>
                <input
                  type="number" value={q} min={0} step={1}
                  onChange={(e) => setOrd(i, Number(e.target.value))}
                  className="w-full rounded-md border border-field-line bg-surface px-2 py-1.5 text-sm"
                  aria-label={`Inflow at t = ${i * dt} h`}
                />
                <button type="button" aria-label={`Remove ordinate ${i + 1}`}
                  onClick={() => setInflow((qs) => qs.filter((_, j) => j !== i))}
                  className="rounded-md border border-field-line px-1 py-1 text-xs text-muted hover:text-fail">
                  ✕
                </button>
              </div>
            ))}
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => setInflow((qs) => [...qs, qs[qs.length - 1] ?? 0])}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                + Add ordinate
              </button>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {r ? (
            <>
              <ResultCard title="Routing coefficients">
                <Row label="C0 · C1 · C2" value={`${f3(r.C0)} · ${f3(r.C1)} · ${f3(r.C2)}`} sub="weights of I2, I1, O1 — they sum to 1" />
                <Row label="Stability window" value={`${f2(2 * K * X)} – ${f2(2 * K * (1 - X))} h`} sub={`Δt = ${f2(dt)} h inside it`} />
              </ResultCard>

              <ResultCard title="Peak transformation">
                <Row label="Peak inflow" value={`${f2(r.peakIn)} m³/s`} sub={`at t = ${f2(r.tPeakIn)} h`} />
                <Row label="Peak outflow" value={`${f2(r.peakOut)} m³/s`} sub={`at t = ${f2(r.tPeakOut)} h — lag ${f2(r.lagHr)} h`} />
                <Row label="Attenuation" value={`${f2(r.attenuationPct)} %`} sub={`${f2(r.peakIn - r.peakOut)} m³/s absorbed by reach storage`} />
                <Row label="Volumes" value={`${(r.volumeIn / 1000).toFixed(1)} / ${(r.volumeOut / 1000).toFixed(1)} ×10³ m³`} sub="difference = change in reach storage" />
              </ResultCard>

              <DrawingCard title="Inflow vs routed outflow" meta={`${inflow.length} ordinates at Δt = ${f2(dt)} h`}>
                <Hydrographs inflow={inflow} outflow={r.outflow} dt={dt} />
              </DrawingCard>

              <WorkedSolution steps={steps} title="Muskingum routing — step by step" />
            </>
          ) : (
            <ResultCard title="Check the inputs">
              <p className="text-sm text-fail">{out.error ?? 'Give at least three non-negative inflow ordinates.'}</p>
            </ResultCard>
          )}
        </div>
      </div>
    </div>
  )
}

function Hydrographs({ inflow, outflow, dt }: { inflow: number[]; outflow: number[]; dt: number }) {
  const W = 640, H = 320
  const x0 = 62, x1 = W - 40
  const baseY = H - 48
  const topY = 40
  const tEnd = (inflow.length - 1) * dt
  const qMax = Math.max(...inflow, ...outflow, 1) * 1.12
  const px = (t: number) => x0 + (t / Math.max(tEnd, 1e-9)) * (x1 - x0)
  const py = (q: number) => baseY - (q / qMax) * (baseY - topY)

  const path = (qs: number[]) => qs.map((q, i) => `${i === 0 ? 'M' : 'L'} ${px(i * dt).toFixed(2)} ${py(q).toFixed(2)}`).join(' ')
  const area = (qs: number[]) =>
    `${path(qs)} L ${px((qs.length - 1) * dt)} ${baseY} L ${px(0)} ${baseY} Z`

  const iPeak = inflow.indexOf(Math.max(...inflow))
  const oPeak = outflow.indexOf(Math.max(...outflow))

  return (
    <DrawingFrame label="Muskingum routing — inflow and outflow hydrographs">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Routed hydrograph">
        {/* axes */}
        <line x1={x0} x2={x1} y1={baseY} y2={baseY} stroke={INK} strokeWidth="1.2" />
        <line x1={x0} x2={x0} y1={topY - 8} y2={baseY} stroke={INK} strokeWidth="1.2" />
        {/* inflow area + line */}
        <path d={area(inflow)} fill="rgba(15,76,146,0.08)" stroke="none" />
        <path d={path(inflow)} stroke="rgba(15,76,146,0.85)" strokeWidth="1.8" fill="none" strokeDasharray="6 3" />
        {/* outflow area + line */}
        <path d={area(outflow)} fill="rgba(15,76,146,0.16)" stroke="none" />
        <path d={path(outflow)} stroke="rgba(15,76,146,0.95)" strokeWidth="2.2" fill="none" />
        {/* peak markers */}
        <line x1={px(iPeak * dt)} x2={px(iPeak * dt)} y1={py(inflow[iPeak])} y2={baseY} stroke={MUTED} strokeWidth="1" strokeDasharray="3 3" />
        <line x1={px(oPeak * dt)} x2={px(oPeak * dt)} y1={py(outflow[oPeak])} y2={baseY} stroke={MUTED} strokeWidth="1" strokeDasharray="3 3" />
        <text x={px(iPeak * dt) + 5} y={py(inflow[iPeak]) - 4} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">in {f2(inflow[iPeak])}</text>
        <text x={px(oPeak * dt) + 5} y={py(outflow[oPeak]) - 4} fontSize="10" fill={INK} fontFamily="var(--font-mono, monospace)">out {f2(outflow[oPeak])}</text>
        {/* axis labels */}
        <text x={14} y={topY} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">Q (m³/s)</text>
        <text x={x1} y={baseY + 16} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">t (h)</text>
        <text x={x0} y={baseY + 16} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">0</text>
        <text x={x0 + 8} y={topY - 12} fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">
          solid = routed outflow · dashed = inflow · lag {f2((oPeak - iPeak) * dt)} h
        </text>
      </svg>
    </DrawingFrame>
  )
}
