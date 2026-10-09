// ─────────────────────────────────────────────────────────────────────────
// Drawings for the traffic calculators: the AADT growth curve, the signal
// cycle, the D/D/1 cumulative curves and the roundabout conflict plan. Each
// sits in its own DrawingFrame; values the page reports are dimensioned
// between drawn lines, and every chart axis is numbered.
// ─────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react'
import { DrawingFrame } from './DrawingFrame'
import { Axes } from './waterCharts'
import { HDim, VDim, WATER } from './hydraulicsSketches'
import type { WebsterResult } from '../engine/websterSignal'
import type { DD1Result } from '../engine/trafficQueue'
import { INK, MUTED, f2 } from '../lib/influenceStyle'
import { niceStep, tickLabel, axesMap } from '../lib/chartScale'

const mono = 'var(--font-mono, monospace)'
const halo = { paintOrder: 'stroke' as const, stroke: 'var(--sheet)', strokeWidth: 3 }
const RED = 'rgba(200,60,60,0.95)'
const AMBER = 'rgba(232,179,75,0.6)'
const n0 = (v: number) => Math.round(v).toLocaleString('en-US')

function Chart({ label, W, H, children }: { label: string; W: number; H: number; children: ReactNode }) {
  return (
    <DrawingFrame label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>{children}</svg>
    </DrawingFrame>
  )
}

/** AADT compounding from the base year to the design year: the growth added
 *  is dimensioned from the base AADT, carried across as an extension line. */
export function GrowthCurve({ aadt0, growthPct, years }: { aadt0: number; growthPct: number; years: number }) {
  const W = 640, H = 320
  const box = { x0: 78, x1: W - 150, top: 52, base: H - 56 }
  const nYr = Math.max(years, 1)
  const at = (t: number) => aadt0 * Math.pow(1 + growthPct / 100, t)
  const end = at(years)
  const yMax = Math.max(aadt0, end) * 1.15
  const { X, Y } = axesMap(box, nYr, yMax)
  const pts = Array.from({ length: 41 }, (_, i) => (i / 40) * years).map((t) => `${X(t).toFixed(2)},${Y(at(t)).toFixed(2)}`).join(' ')
  return (
    <Chart label="AADT projection to the design year" W={W} H={H}>
      <Axes box={box} xMax={nYr} yMax={yMax} xLabel="years from base" yLabel="AADT (veh/day)" />
      <polyline points={pts} fill="none" stroke={WATER} strokeWidth="2.2" />
      <circle cx={X(0)} cy={Y(aadt0)} r="3.5" fill={WATER} />
      <circle cx={X(years)} cy={Y(end)} r="3.5" fill={WATER} />
      <line x1={X(0)} x2={X(years) + 30} y1={Y(aadt0)} y2={Y(aadt0)} stroke={MUTED} strokeWidth="0.8" />
      <line x1={X(years)} x2={X(years) + 30} y1={Y(end)} y2={Y(end)} stroke={MUTED} strokeWidth="0.8" />
      <text x={X(0) + 8} y={Y(aadt0) + 15} fontSize="10" fill={INK} fontFamily={mono} {...halo}>base {n0(aadt0)}</text>
      <text x={X(years) - 6} y={Y(end) - 10} textAnchor="end" fontSize="10" fontWeight="700" fill={INK} fontFamily={mono} {...halo}>design year {n0(end)}</text>
      {Math.abs(end - aadt0) > 1 && <VDim x={X(years) + 24} a={Y(end)} b={Y(aadt0)} label={`${end >= aadt0 ? '+' : '−'}${n0(Math.abs(end - aadt0))}`} color={INK} />}
      <text x={box.x0 + 8} y={box.top - 26} fontSize="9.5" fill={MUTED} fontFamily={mono}>AADTₙ = AADT₀ (1 + {f2(growthPct)} %)ⁿ</text>
    </Chart>
  )
}

/** The fixed-time cycle as one bar: each phase's lost time then its
 *  effective green, on a numbered time axis with the cycle dimensioned. */
export function CycleBar({ res }: { res: WebsterResult }) {
  const W = 700, H = 210
  const x0 = 36, x1 = W - 36, y0 = 86, bh = 34
  const X = (s: number) => x0 + (s / res.C) * (x1 - x0)
  const blocks = res.phases.flatMap((p, i) => {
    const a = res.phases.slice(0, i).reduce((t, q) => t + q.lost + q.g, 0)
    return [
      { a, b: a + p.lost, green: false, name: p.name },
      { a: a + p.lost, b: a + p.lost + p.g, green: true, name: p.name },
    ]
  })
  const step = niceStep(res.C, 6)
  const ticks: number[] = []
  for (let t = 0; t <= res.C + 1e-9; t += step) ticks.push(t)
  const axisY = y0 + bh + 20
  return (
    <Chart label="Signal cycle diagram" W={W} H={H}>
      {/* the cycle, its ends carried up to the dimension */}
      <line x1={x0} x2={x0} y1={y0 - 40} y2={y0} stroke={MUTED} strokeWidth="0.8" />
      <line x1={x1} x2={x1} y1={y0 - 40} y2={y0} stroke={MUTED} strokeWidth="0.8" />
      <HDim y={y0 - 36} a={x0} b={x1} label={`C = ${f2(res.C)} s${Math.abs(res.C - res.C0) > 0.01 ? ` (Webster C₀ = ${f2(res.C0)} s)` : ''}`} />
      {blocks.map((b, i) => {
        const w = X(b.b) - X(b.a)
        return (
          <g key={i}>
            <rect x={X(b.a)} y={y0} width={Math.max(w, 0.5)} height={bh} fill={b.green ? 'rgba(15,76,146,0.82)' : AMBER} stroke={INK} strokeWidth="0.8" />
            {b.green && w > 40 && <text x={X(b.a) + w / 2} y={y0 + bh / 2 + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#ffffff" fontFamily={mono}>g {f2(b.b - b.a)} s</text>}
            {!b.green && w > 26 && <text x={X(b.a) + w / 2} y={y0 + bh / 2 + 4} textAnchor="middle" fontSize="9.5" fill={INK} fontFamily={mono}>{f2(b.b - b.a)}</text>}
            {b.green && <text x={X(b.a) + w / 2} y={y0 - 8} textAnchor="middle" fontSize="10" fill={INK} fontFamily={mono} {...halo}>{b.name}</text>}
          </g>
        )
      })}
      <line x1={x0} x2={x1} y1={axisY} y2={axisY} stroke={INK} strokeWidth="1.1" />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={X(t)} x2={X(t)} y1={axisY} y2={axisY + 4} stroke={INK} strokeWidth="1" />
          <text x={X(t)} y={axisY + 15} textAnchor="middle" fontSize="9.5" fill={MUTED} fontFamily={mono}>{tickLabel(t, step)}</text>
        </g>
      ))}
      <text x={x1} y={axisY + 30} textAnchor="end" fontSize="10" fill={MUTED} fontFamily={mono}>t (s)</text>
      <rect x={x0} y={axisY + 22} width={12} height={8} fill={AMBER} stroke={INK} strokeWidth="0.6" />
      <text x={x0 + 17} y={axisY + 30} fontSize="9.5" fill={MUTED} fontFamily={mono}>lost time (L = {f2(res.L)} s)</text>
      <rect x={x0 + 190} y={axisY + 22} width={12} height={8} fill="rgba(15,76,146,0.82)" stroke={INK} strokeWidth="0.6" />
      <text x={x0 + 207} y={axisY + 30} fontSize="9.5" fill={MUTED} fontFamily={mono}>effective green</text>
    </Chart>
  )
}

/** Cumulative arrivals and departures. The queue at its longest is the
 *  vertical gap, dimensioned between the curves; the line clears where they
 *  meet again, marked on the time axis. Delay is the shaded area. */
export function QueueCurves({ res }: { res: DD1Result }) {
  const W = 680, H = 360
  const box = { x0: 70, x1: W - 40, top: 52, base: H - 70 }
  const n = res.cumArrivals.length
  // minute t carries the counts at its end; the curves start from the origin
  const arr = [0, ...res.cumArrivals], dep = [0, ...res.cumDepartures]
  const yMax = Math.max(arr[n], dep[n], 1) * 1.1
  const { X, Y } = axesMap(box, n, yMax)
  const line = (vs: number[]) => vs.map((v, t) => `${X(t).toFixed(2)},${Y(v).toFixed(2)}`).join(' ')
  const band = `${line(arr)} ${dep.map((v, t) => `${X(t).toFixed(2)},${Y(v).toFixed(2)}`).reverse().join(' ')}`
  const tq = res.maxQueueMinute
  const tl = Math.max(1, Math.round(tq * 0.55))
  return (
    <Chart label="Cumulative arrival and departure curves" W={W} H={H}>
      <Axes box={box} xMax={n} yMax={yMax} xLabel="t (min)" yLabel="vehicles (cumulative)" />
      <polygon points={band} fill="rgba(200,60,60,0.13)" />
      <polyline points={line(arr)} fill="none" stroke={WATER} strokeWidth="2.2" />
      <polyline points={line(dep)} fill="none" stroke={INK} strokeWidth="2" strokeDasharray="7 3" />
      <text x={X(tl) - 6} y={Y(arr[tl]) - 8} textAnchor="end" fontSize="10" fill={INK} fontFamily={mono} {...halo}>arrivals</text>
      <text x={X(tl) + 8} y={Y(dep[tl]) + 16} fontSize="10" fill={INK} fontFamily={mono} {...halo}>departures (μ = {n0(res.service)} veh/h)</text>
      {/* the queue at its longest is the gap between the curves; its label sits
          above-left of the peak, where the arrival curve falls away */}
      {res.maxQueue > 0 && <>
        <VDim x={X(tq)} a={Y(arr[tq])} b={Y(dep[tq])} label="" color={RED} />
        <text x={X(tq) - 8} y={Y(arr[tq]) - 10} textAnchor="end" fontSize="10" fontWeight="700" fill={RED} fontFamily={mono} {...halo}>Qmax {f2(res.maxQueue)} veh at {f2(tq)} min</text>
      </>}
      {res.dissipation !== null && res.maxQueue > 0 && (() => {
        const td = res.dissipation, yd = Y(arr[Math.min(n, Math.round(td))])
        return <>
          <circle cx={X(td)} cy={yd} r="3.5" fill={INK} />
          <text x={X(td) - 8} y={yd - 10} textAnchor="end" fontSize="10" fontWeight="700" fill={INK} fontFamily={mono} {...halo}>queue clears at {f2(td)} min</text>
        </>
      })()}
      <text x={box.x0 + 8} y={box.top - 26} fontSize="9.5" fill={MUTED} fontFamily={mono}>shaded area = total delay {n0(res.totalDelay)} veh·min</text>
    </Chart>
  )
}

/** Four-leg roundabout in plan, right-hand traffic circulating
 *  counter-clockwise. The analysed entry is leg 1 from the west; the
 *  circulating stream that crosses it is drawn and labelled where it passes
 *  in front of that entry. */
export function RoundaboutPlan({ legs, veAdj, vcAdj, lanes }: { legs: number[]; veAdj: number; vcAdj: number; lanes: number }) {
  const W = 700, H = 380
  const cx = W / 2, cy = H / 2 + 4
  const Ri = 56, Ro = Ri + 34, Rmid = (Ri + Ro) / 2, hw = 13
  // legs run to the frame: long east–west, as far as the height allows north–south
  const lenOf = (dy: number) => (dy === 0 ? cx - Ro - 24 : cy - Ro - 14)
  // legs clockwise from the west entry: 1 W, 2 N, 3 E, 4 S
  const dirs = [{ dx: -1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }]
  // the circulating path that passes in front of the west entry, from the north
  const a0 = -Math.PI / 2 + 0.35, a1 = Math.PI - 0.28
  const arc = `M ${cx + Rmid * Math.cos(a0)} ${cy + Rmid * Math.sin(a0)} A ${Rmid} ${Rmid} 0 0 0 ${cx + Rmid * Math.cos(a1)} ${cy + Rmid * Math.sin(a1)}`
  const tip = { x: cx + Rmid * Math.cos(a1), y: cy + Rmid * Math.sin(a1) }
  return (
    <Chart label="Roundabout conflict diagram" W={W} H={H}>
      {/* approach roadways */}
      {dirs.map((d, i) => {
        const px = -d.dy, py = d.dx // unit normal
        const L = lenOf(d.dy)
        const s = { x: cx + d.dx * (Ro - 4), y: cy + d.dy * (Ro - 4) }, e = { x: cx + d.dx * (Ro + L), y: cy + d.dy * (Ro + L) }
        const entry = i === 0
        return (
          <g key={i}>
            <polygon points={`${s.x + px * hw},${s.y + py * hw} ${e.x + px * hw},${e.y + py * hw} ${e.x - px * hw},${e.y - py * hw} ${s.x - px * hw},${s.y - py * hw}`}
              fill={entry ? 'rgba(15,76,146,0.1)' : 'rgba(115,109,94,0.08)'} stroke="none" />
            <line x1={s.x + px * hw} y1={s.y + py * hw} x2={e.x + px * hw} y2={e.y + py * hw} stroke={INK} strokeWidth="1.2" />
            <line x1={s.x - px * hw} y1={s.y - py * hw} x2={e.x - px * hw} y2={e.y - py * hw} stroke={INK} strokeWidth="1.2" />
            <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke={MUTED} strokeWidth="0.8" strokeDasharray="6 5" />
            {/* the label sits beside the road, at its outer end */}
            <text x={d.dy === 0 ? e.x : e.x + hw + 8} y={d.dy === 0 ? e.y - hw - 8 : e.y - d.dy * 16 + 4}
              textAnchor={d.dx < 0 || d.dy !== 0 ? 'start' : 'end'} fontSize={entry ? '11' : '10'} fontWeight={entry ? 700 : 400}
              fill={entry ? WATER : INK} fontFamily={mono}>Leg {i + 1} · {n0(legs[i])} pc/h</text>
          </g>
        )
      })}
      {/* circulatory roadway and central island */}
      <circle cx={cx} cy={cy} r={Ro} fill="var(--sheet)" stroke={INK} strokeWidth="1.3" />
      <circle cx={cx} cy={cy} r={Ri} fill="rgba(115,109,94,0.16)" stroke={INK} strokeWidth="1.3" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fill={MUTED} fontFamily={mono}>central island</text>
      {/* the entry movement */}
      <line x1={cx - Ro - lenOf(0) + 16} y1={cy + hw / 2} x2={cx - Ro - 6} y2={cy + hw / 2} stroke={WATER} strokeWidth="2.2" />
      <polygon points={`${cx - Ro - 2},${cy + hw / 2} ${cx - Ro - 12},${cy + hw / 2 - 5} ${cx - Ro - 12},${cy + hw / 2 + 5}`} fill={WATER} />
      <text x={cx - Ro - lenOf(0) + 16} y={cy + hw + 18} fontSize="10.5" fontWeight="700" fill={WATER} fontFamily={mono} {...halo}>ve {n0(veAdj)} pc/h · {lanes} lane{lanes > 1 ? 's' : ''}</text>
      {/* the circulating stream crossing it */}
      <path d={arc} fill="none" stroke={RED} strokeWidth="2" strokeDasharray="6 4" />
      <polygon points={`${tip.x},${tip.y} ${tip.x - 4},${tip.y - 11} ${tip.x + 6},${tip.y - 8}`} fill={RED} />
      <text x={cx - Ro * 0.72 - 10} y={cy - Ro * 0.72 - 12} textAnchor="end" fontSize="10.5" fontWeight="700" fill={RED} fontFamily={mono} {...halo}>vc {n0(vcAdj)} pc/h</text>
      <text x={18} y={H - 40} fontSize="9.5" fill={MUTED} fontFamily={mono}>right-hand traffic,</text>
      <text x={18} y={H - 26} fontSize="9.5" fill={MUTED} fontFamily={mono}>counter-clockwise circulation</text>
      <text x={18} y={H - 12} fontSize="9.5" fill={MUTED} fontFamily={mono}>flows are peak-15 rates (÷ PHF)</text>
    </Chart>
  )
}
