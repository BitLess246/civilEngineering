// ─────────────────────────────────────────────────────────────────────────
// Charts for the hydrology calculators. Every chart carries numbered axes
// (a curve with no scale is a picture, not a chart), quantities with
// different units never share an axis, and the values a page reports —
// peaks, lags, attenuation, base times — are dimensioned between drawn
// lines rather than left as captions.
// ─────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react'
import { DrawingFrame } from './DrawingFrame'
import { HDim, VDim, WATER } from './hydraulicsSketches'
import type { RationalResult } from '../engine/rationalMethod'
import { INK, MUTED, HAIR, f2, f3 } from '../lib/influenceStyle'
import { niceStep, tickLabel, axesMap } from '../lib/chartScale'

const mono = 'var(--font-mono, monospace)'
const halo = { paintOrder: 'stroke' as const, stroke: 'var(--sheet)', strokeWidth: 3 }

export function Axes({ box, xMax, yMax, xLabel, yLabel }: {
  box: { x0: number; x1: number; top: number; base: number }; xMax: number; yMax: number; xLabel: string; yLabel: string
}) {
  const { X, Y } = axesMap(box, xMax, yMax)
  const xs = niceStep(xMax, 6), ys = niceStep(yMax, 4)
  const xt: number[] = [], yt: number[] = []
  for (let v = 0; v <= xMax * 1.0001; v += xs) xt.push(v)
  for (let v = 0; v <= yMax * 1.0001; v += ys) yt.push(v)
  return (
    <g>
      {yt.map((v) => (
        <g key={`y${v}`}>
          {v > 0 && <line x1={box.x0} x2={box.x1} y1={Y(v)} y2={Y(v)} stroke={HAIR} strokeWidth="0.7" />}
          <line x1={box.x0 - 4} x2={box.x0} y1={Y(v)} y2={Y(v)} stroke={INK} strokeWidth="1" />
          <text x={box.x0 - 7} y={Y(v) + 3.5} textAnchor="end" fontSize="9.5" fill={MUTED} fontFamily={mono}>{tickLabel(v, ys)}</text>
        </g>
      ))}
      {xt.map((v) => (
        <g key={`x${v}`}>
          <line x1={X(v)} x2={X(v)} y1={box.base} y2={box.base + 4} stroke={INK} strokeWidth="1" />
          {v > 0 && <text x={X(v)} y={box.base + 15} textAnchor="middle" fontSize="9.5" fill={MUTED} fontFamily={mono}>{tickLabel(v, xs)}</text>}
        </g>
      ))}
      <line x1={box.x0} x2={box.x1} y1={box.base} y2={box.base} stroke={INK} strokeWidth="1.2" />
      <line x1={box.x0} x2={box.x0} y1={box.top - 6} y2={box.base} stroke={INK} strokeWidth="1.2" />
      <text x={box.x0} y={box.top - 12} textAnchor="middle" fontSize="10" fill={MUTED} fontFamily={mono}>{yLabel}</text>
      <text x={box.x1} y={box.base + 30} textAnchor="end" fontSize="10" fill={MUTED} fontFamily={mono}>{xLabel}</text>
    </g>
  )
}

function Chart({ label, W, H, children }: { label: string; W: number; H: number; children: ReactNode }) {
  return (
    <DrawingFrame label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>{children}</svg>
    </DrawingFrame>
  )
}

// ── Rational method ──────────────────────────────────────────────────────

/** Two bars to one scale: the catchment area split by sub-area, and the
 *  effective area C·A each sub-area contributes. The second bar's length over
 *  the first's is the weighted C — the composite the formula uses. */
export function RationalBars({ res }: { res: RationalResult }) {
  const W = 640, H = 290, x0 = 40, x1 = W - 40
  const k = (x1 - x0) / Math.max(res.A, 1e-9)
  const rowA = 56, rowC = 176, bh = 34, gap = 30
  // left edges are running sums of the widths before each segment
  const segs = res.subAreas.map((s, i) => {
    const before = res.subAreas.slice(0, i)
    return {
      s,
      a: { x: x0 + before.reduce((t, p) => t + p.a, 0) * k, w: s.a * k },
      c: { x: x0 + before.reduce((t, p) => t + p.c * p.a, 0) * k, w: s.c * s.a * k },
    }
  })
  const ca = res.C * res.A
  return (
    <Chart label="Catchment area and effective area" W={W} H={H}>
      <text x={x0} y={rowA - 22} fontSize="10.5" fontWeight="700" fill={INK} fontFamily={mono}>catchment area A</text>
      <text x={x0} y={rowC - 22} fontSize="10.5" fontWeight="700" fill={INK} fontFamily={mono}>effective area C·A (the part that runs off)</text>
      {segs.map(({ s, a, c }, i) => (
        <g key={i}>
          <rect x={a.x} y={rowA} width={a.w} height={bh} fill={`rgba(15,76,146,${0.08 + 0.12 * (i % 2)})`} stroke={INK} strokeWidth="1" />
          {a.w > 70 && <text x={a.x + a.w / 2} y={rowA + bh / 2 + 4} textAnchor="middle" fontSize="9.5" fill={INK} fontFamily={mono}>{s.name || `#${i + 1}`} · {f2(s.a)} ha</text>}
          <rect x={c.x} y={rowC} width={Math.max(c.w, 0.5)} height={bh} fill={`rgba(15,76,146,${0.35 + 0.2 * (i % 2)})`} stroke={INK} strokeWidth="1" />
          {c.w > 70 && <text x={c.x + c.w / 2} y={rowC + bh / 2 + 4} textAnchor="middle" fontSize="9.5" fill={INK} fontFamily={mono}>C {f2(s.c)} × {f2(s.a)}</text>}
          {/* each sub-area's effective part drops from its own area */}
          <line x1={a.x} x2={c.x} y1={rowA + bh + gap + 6} y2={rowC} stroke={HAIR} strokeWidth="0.8" strokeDasharray="2 3" />
        </g>
      ))}
      <line x1={x0 + res.A * k} x2={x0 + ca * k} y1={rowA + bh + gap + 6} y2={rowC} stroke={HAIR} strokeWidth="0.8" strokeDasharray="2 3" />
      {/* extension lines from the bar ends down to each dimension */}
      {[x0, x0 + res.A * k].map((x) => <line key={`ea${x}`} x1={x} x2={x} y1={rowA + bh + 3} y2={rowA + bh + gap + 4} stroke={MUTED} strokeWidth="0.8" />)}
      {[x0, x0 + ca * k].map((x) => <line key={`ec${x}`} x1={x} x2={x} y1={rowC + bh + 3} y2={rowC + bh + gap + 4} stroke={MUTED} strokeWidth="0.8" />)}
      <HDim y={rowA + bh + gap} a={x0} b={x0 + res.A * k} label={`A = ${f3(res.A)} ha`} />
      <HDim y={rowC + bh + gap} a={x0} b={x0 + ca * k} label={`C·A = ${f3(ca)} ha  →  C = C·A / A = ${f3(res.C)}`} />
      <text x={x0} y={H - 10} fontSize="10" fill={MUTED} fontFamily={mono}>Q = C·i·A/360 = {f3(res.C)} × {f2(res.i)} × {f3(res.A)} / 360 = {f3(res.Q)} m³/s</text>
    </Chart>
  )
}

// ── SCS triangular unit hydrograph ───────────────────────────────────────

export function TriHydrograph({ tp, qp, tb, P, Q }: { tp: number; qp: number; tb: number; P: number; Q: number }) {
  const W = 640, H = 350
  const box = { x0: 70, x1: W - 40, top: 56, base: H - 104 }
  const xMax = tb * 1.08, yMax = qp * 1.2
  const { X, Y } = axesMap(box, xMax, yMax)
  return (
    <Chart label="Triangular unit hydrograph" W={W} H={H}>
      <Axes box={box} xMax={xMax} yMax={yMax} xLabel="t (h)" yLabel="Q (m³/s)" />
      <polygon points={`${X(0)},${Y(0)} ${X(tp)},${Y(qp)} ${X(tb)},${Y(0)}`} fill="rgba(15,76,146,0.14)" stroke={WATER} strokeWidth="1.8" />
      <line x1={X(tp)} x2={X(tp)} y1={Y(qp)} y2={box.base + 50} stroke={MUTED} strokeWidth="0.8" strokeDasharray="4 3" />
      <line x1={X(tb)} x2={X(tb)} y1={box.base} y2={box.base + 76} stroke={MUTED} strokeWidth="0.8" />
      <line x1={X(0)} x2={X(0)} y1={box.base} y2={box.base + 76} stroke={MUTED} strokeWidth="0.8" />
      <text x={X(tp) + 7} y={Y(qp) - 4} fontSize="10.5" fontWeight="700" fill={INK} fontFamily={mono} {...halo}>Qp = {f2(qp)} m³/s</text>
      <HDim y={box.base + 46} a={X(0)} b={X(tp)} label={`Tp = ${f3(tp)} h`} color={MUTED} />
      <HDim y={box.base + 72} a={X(0)} b={X(tb)} label={`tb = ${f2(tb)} h = 2.67 Tp`} color={MUTED} />
      <text x={box.x0 + 8} y={box.top - 26} fontSize="10" fill={MUTED} fontFamily={mono}>P = {f2(P)} mm → runoff Q = {f2(Q)} mm</text>
    </Chart>
  )
}

// ── Muskingum routing ────────────────────────────────────────────────────

export function RoutedHydrographs({ inflow, outflow, dt }: { inflow: number[]; outflow: number[]; dt: number }) {
  const W = 640, H = 330
  const box = { x0: 66, x1: W - 40, top: 52, base: H - 56 }
  const tEnd = (inflow.length - 1) * dt
  const yMax = Math.max(...inflow, ...outflow, 1e-6) * 1.15
  const { X, Y } = axesMap(box, tEnd, yMax)
  const line = (qs: number[]) => qs.map((q, i) => `${i ? 'L' : 'M'} ${X(i * dt).toFixed(2)} ${Y(q).toFixed(2)}`).join(' ')
  const iP = inflow.indexOf(Math.max(...inflow)), oP = outflow.indexOf(Math.max(...outflow))
  const tI = iP * dt, tO = oP * dt, qI = inflow[iP], qO = outflow[oP]
  const lagY = Y(qO) + 22
  return (
    <Chart label="Muskingum routing — inflow and outflow hydrographs" W={W} H={H}>
      <Axes box={box} xMax={tEnd} yMax={yMax} xLabel="t (h)" yLabel="Q (m³/s)" />
      <path d={`${line(inflow)} L ${X(tEnd)} ${box.base} L ${X(0)} ${box.base} Z`} fill="rgba(15,76,146,0.07)" />
      <path d={line(inflow)} fill="none" stroke={WATER} strokeWidth="1.6" strokeDasharray="6 3" />
      <path d={`${line(outflow)} L ${X(tEnd)} ${box.base} L ${X(0)} ${box.base} Z`} fill="rgba(15,76,146,0.15)" />
      <path d={line(outflow)} fill="none" stroke={WATER} strokeWidth="2.2" />
      {/* peak verticals, the inflow peak level carried across to the outflow peak */}
      <line x1={X(tI)} x2={X(tI)} y1={Y(qI)} y2={box.base} stroke={MUTED} strokeWidth="0.8" strokeDasharray="3 3" />
      <line x1={X(tO)} x2={X(tO)} y1={Y(qO)} y2={box.base} stroke={MUTED} strokeWidth="0.8" strokeDasharray="3 3" />
      <line x1={X(tI)} x2={X(tO) + 30} y1={Y(qI)} y2={Y(qI)} stroke={MUTED} strokeWidth="0.8" />
      <line x1={X(tO)} x2={X(tO) + 30} y1={Y(qO)} y2={Y(qO)} stroke={MUTED} strokeWidth="0.8" />
      <text x={X(tI) - 6} y={Y(qI) - 6} textAnchor="end" fontSize="10" fill={INK} fontFamily={mono} {...halo}>inflow peak {f2(qI)}</text>
      <text x={X(tO) + 34} y={Y(qO) + 14} fontSize="10" fill={INK} fontFamily={mono} {...halo}>outflow peak {f2(qO)}</text>
      {oP > iP && <HDim y={lagY} a={X(tI)} b={X(tO)} label={`lag ${f2(tO - tI)} h`} color={INK} />}
      <VDim x={X(tO) + 24} a={Y(qI)} b={Y(qO)} label={`attenuation ${f2(qI - qO)}`} color={INK} />
      <text x={box.x0 + 8} y={box.top - 26} fontSize="9.5" fill={MUTED} fontFamily={mono}>dashed = inflow · solid = routed outflow</text>
    </Chart>
  )
}

// ── Detention routing ────────────────────────────────────────────────────

export function DetentionCharts({ inflow, outflows, stages, dtMin, peakIn, peakOut, peakStage, depthMax }: {
  inflow: number[]; outflows: number[]; stages: number[]; dtMin: number
  peakIn: number; peakOut: number; peakStage: number; depthMax: number
}) {
  const W = 640, H = 470
  const tEnd = (inflow.length - 1) * dtMin
  const top = { x0: 66, x1: W - 40, top: 52, base: 216 }
  const bot = { x0: 66, x1: W - 40, top: 300, base: H - 50 }
  const qMax = Math.max(peakIn, peakOut, 1e-6) * 1.15
  const hMax = Math.max(depthMax, peakStage, 1e-6) * 1.2
  const A = axesMap(top, tEnd, qMax), B = axesMap(bot, tEnd, hMax)
  const line = (vs: number[], m: typeof A) => vs.map((v, i) => `${i ? 'L' : 'M'} ${m.X(i * dtMin).toFixed(2)} ${m.Y(v).toFixed(2)}`).join(' ')
  const iO = outflows.indexOf(peakOut), tO = iO * dtMin
  const iS = stages.indexOf(Math.max(...stages)), tS = iS * dtMin
  const over = peakStage > depthMax
  return (
    <Chart label="Detention routing — hydrographs and stage" W={W} H={H}>
      <Axes box={top} xMax={tEnd} yMax={qMax} xLabel="t (min)" yLabel="Q (m³/s)" />
      <path d={line(inflow, A)} fill="none" stroke={WATER} strokeWidth="1.5" strokeDasharray="6 3" />
      <path d={`${line(outflows, A)} L ${A.X(tEnd)} ${top.base} L ${A.X(0)} ${top.base} Z`} fill="rgba(15,76,146,0.15)" />
      <path d={line(outflows, A)} fill="none" stroke={WATER} strokeWidth="2.2" />
      {/* the outflow peaks where it crosses the falling inflow; the same instant marks the peak stage below */}
      {iS === iO && <line x1={A.X(tO)} x2={A.X(tO)} y1={A.Y(peakOut)} y2={B.Y(peakStage)} stroke={MUTED} strokeWidth="0.8" strokeDasharray="3 3" />}
      <circle cx={A.X(tO)} cy={A.Y(peakOut)} r="3.5" fill={WATER} />
      <text x={A.X(tO) + 7} y={A.Y(peakOut) - 7} fontSize="10" fontWeight="700" fill={INK} fontFamily={mono} {...halo}>peak outflow {f2(peakOut)} m³/s</text>
      <text x={top.x0 + 8} y={top.top - 26} fontSize="9.5" fill={MUTED} fontFamily={mono}>dashed = inflow (peak {f2(peakIn)}) · solid = outflow</text>

      <Axes box={bot} xMax={tEnd} yMax={hMax} xLabel="t (min)" yLabel="stage (m)" />
      <line x1={bot.x0} x2={bot.x1} y1={B.Y(depthMax)} y2={B.Y(depthMax)} stroke="rgba(200,60,60,0.75)" strokeWidth="1.1" strokeDasharray="6 3" />
      <text x={bot.x1 - 4} y={B.Y(depthMax) - 5} textAnchor="end" fontSize="9.5" fill="rgba(200,60,60,0.95)" fontFamily={mono} {...halo}>usable depth {f2(depthMax)} m</text>
      <path d={`M ${B.X(0)} ${B.Y(0)} ${stages.map((s, i) => `L ${B.X(i * dtMin).toFixed(2)} ${B.Y(s).toFixed(2)}`).join(' ')} L ${B.X(tEnd)} ${bot.base} L ${B.X(0)} ${bot.base} Z`} fill="rgba(15,76,146,0.12)" />
      <path d={`M ${B.X(0)} ${B.Y(0)} ${stages.map((s, i) => `L ${B.X(i * dtMin).toFixed(2)} ${B.Y(s).toFixed(2)}`).join(' ')}`} fill="none" stroke={WATER} strokeWidth="2" />
      <circle cx={B.X(tS)} cy={B.Y(peakStage)} r="3.5" fill={over ? 'rgba(200,60,60,0.95)' : WATER} />
      <text x={B.X(tS) + 7} y={B.Y(peakStage) + 15} fontSize="10" fontWeight="700" fill={INK} fontFamily={mono} {...halo}>peak stage {f3(peakStage)} m{over ? ' — overtops' : ''}</text>
    </Chart>
  )
}
