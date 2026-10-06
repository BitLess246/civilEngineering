// ─────────────────────────────────────────────────────────────────────────
// Drawings for the connection calculators. Plan geometry in mm, y UP (the
// engine's convention), drawn to one scale.
// ─────────────────────────────────────────────────────────────────────────
import { DrawingFrame } from './DrawingFrame'
import { Tick } from './dims'
import type { WeldSegment, WeldConnResult } from '../engine/weldedConnection'

const WELD = '#0f4c92'
const CRIT = '#c2402a'
const CENT = '#0e7490'
const LOAD = '#5c6675'
const DIM = '#1f77b4'
const FAINT = '#a39d8d'
const HALO = { paintOrder: 'stroke' as const, stroke: 'var(--sheet, #fff)', strokeWidth: 2.6 }

/**
 * The weld group in plan: each segment named, the centroid C, the load drawn
 * as the arrow it is (at its point, in its direction), the eccentricities ex
 * and ey dimensioned from C to the load's line of action, and the critical
 * endpoint marked. The old plot drew the load as a dashed line to C — which is
 * the eccentricity, not the load — and named nothing.
 */
export function WeldGroupPlan({ segs, r, px, py, P, angleDeg, Plabel }: {
  segs: WeldSegment[]; r: WeldConnResult; px: number; py: number
  P: number; angleDeg: number; Plabel: string
}) {
  const xs = segs.flatMap((s) => [s.x1, s.x2]).concat([r.Cx, px])
  const ys = segs.flatMap((s) => [s.y1, s.y2]).concat([r.Cy, py])
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const ML = 40, MR = 70, MT = 56, MB = 70, PW = 300, PH = 220
  const sc = Math.min(PW / Math.max(maxX - minX, 1), PH / Math.max(maxY - minY, 1))
  const W = ML + (maxX - minX) * sc + MR, HT = MT + (maxY - minY) * sc + MB
  const X = (x: number) => ML + (x - minX) * sc
  const Y = (y: number) => MT + (maxY - y) * sc
  const rad = (angleDeg * Math.PI) / 180
  const ux = Math.cos(rad), uy = -Math.sin(rad)          // screen direction of the load
  const crit = r.points[r.criticalIndex]
  const yDim = Y(minY) + 36                               // ex, below everything and its labels
  const xDim = X(maxX) + 26                               // ey, right of everything
  const showEx = Math.abs(r.ex) * sc > 4, showEy = Math.abs(r.ey) * sc > 4
  return (
    <DrawingFrame label="weld group plan">
      <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block h-auto w-full max-w-[520px]" style={{ fontFamily: 'Arial, sans-serif' }}>
        {segs.map((s) => (
          <g key={s.id}>
            <line x1={X(s.x1)} y1={Y(s.y1)} x2={X(s.x2)} y2={Y(s.y2)} stroke={WELD} strokeWidth={4} strokeLinecap="round" />
            <text x={(X(s.x1) + X(s.x2)) / 2 + 7} y={(Y(s.y1) + Y(s.y2)) / 2 + 3} fontSize={8.5} fill={WELD} {...HALO}>{s.id}</text>
          </g>
        ))}
        {r.points.map((p, i) => i === r.criticalIndex ? null : (
          <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={2.4} fill={FAINT} />
        ))}
        {crit && (
          <g>
            <circle cx={X(crit.x)} cy={Y(crit.y)} r={5} fill={CRIT} />
            <text x={X(crit.x) + 8} y={Y(crit.y) + 14} fontSize={8} fill={CRIT} {...HALO}>
              critical · {r.fMax.toFixed(0)} N/mm
            </text>
          </g>
        )}

        {/* centroid */}
        <g stroke={CENT} strokeWidth={1.2}>
          <circle cx={X(r.Cx)} cy={Y(r.Cy)} r={4} fill="none" />
          <line x1={X(r.Cx) - 8} y1={Y(r.Cy)} x2={X(r.Cx) + 8} y2={Y(r.Cy)} />
          <line x1={X(r.Cx)} y1={Y(r.Cy) - 8} x2={X(r.Cx)} y2={Y(r.Cy) + 8} />
        </g>
        <text x={X(r.Cx) + 7} y={Y(r.Cy) - 6} fontSize={8.5} fill={CENT} {...HALO}>C</text>

        {/* the load, drawn as it acts: tail at the load point, in its direction */}
        <g stroke={LOAD} fill={LOAD}>
          <line x1={X(px)} y1={Y(py)} x2={X(px) + ux * 38} y2={Y(py) + uy * 38} strokeWidth={1.6} />
          <path d={`M${X(px) + ux * 44} ${Y(py) + uy * 44} l${-ux * 8 - uy * 4} ${-uy * 8 + ux * 4} l${uy * 8} ${-ux * 8} z`} stroke="none" />
          <circle cx={X(px)} cy={Y(py)} r={3} stroke="none" />
        </g>
        <text x={X(px) + ux * 46 + 4} y={Y(py) + uy * 46 + 3} fontSize={8.5} fill={LOAD} {...HALO}>
          {Plabel} {P.toFixed(0)} kN · {angleDeg.toFixed(0)}°
        </text>

        {/* eccentricities from C to the load point, each end on an extension line */}
        {showEx && (
          <g>
            <line x1={X(r.Cx)} y1={Y(r.Cy) + 10} x2={X(r.Cx)} y2={yDim + 5} stroke={DIM} strokeWidth={0.6} />
            <line x1={X(px)} y1={Y(py) + 5} x2={X(px)} y2={yDim + 5} stroke={DIM} strokeWidth={0.6} />
            <line x1={X(r.Cx)} y1={yDim} x2={X(px)} y2={yDim} stroke={DIM} strokeWidth={0.9} />
            <Tick x={X(r.Cx)} y={yDim} /><Tick x={X(px)} y={yDim} />
            <text x={(X(r.Cx) + X(px)) / 2} y={yDim - 4} fontSize={8.5} fill={DIM} textAnchor="middle" {...HALO}>ex = {r.ex.toFixed(0)}</text>
          </g>
        )}
        {showEy && (
          <g>
            <line x1={X(r.Cx) + 10} y1={Y(r.Cy)} x2={xDim + 5} y2={Y(r.Cy)} stroke={DIM} strokeWidth={0.6} />
            <line x1={X(px) + 5} y1={Y(py)} x2={xDim + 5} y2={Y(py)} stroke={DIM} strokeWidth={0.6} />
            <line x1={xDim} y1={Y(r.Cy)} x2={xDim} y2={Y(py)} stroke={DIM} strokeWidth={0.9} />
            <Tick x={xDim} y={Y(r.Cy)} /><Tick x={xDim} y={Y(py)} />
            <text x={xDim + 6} y={(Y(r.Cy) + Y(py)) / 2 + 3} fontSize={8.5} fill={DIM} {...HALO}>ey = {r.ey.toFixed(0)}</text>
          </g>
        )}
        <text x={W / 2} y={HT - 6} fontSize={7} fill={FAINT} textAnchor="middle">plan · to scale · mm · angle measured from +x, counter-clockwise</text>
      </svg>
    </DrawingFrame>
  )
}

