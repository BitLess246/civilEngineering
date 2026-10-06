import type { JSX } from 'react'
import type { InteractionResult } from '../engine/columnDesign'
import { DrawingFrame } from './DrawingFrame'
import { niceStep, tickLabel } from '../lib/chartScale'
import { INK, MUTED } from '../lib/influenceStyle'

const NOM = MUTED
const DES = 'rgba(15,76,146,0.95)'
const DEMAND = 'rgba(200,60,60,0.95)'
const BAL = 'rgba(124,58,237,0.95)'
const halo = { paintOrder: 'stroke' as const, stroke: 'var(--sheet, #fff)', strokeWidth: 2.6 }

/** P–M interaction diagram: nominal curve (grey), design curve φPn–φMn with
 *  the 0.80Po cap (blue), the balanced point, and the factored demand. */
export function InteractionDiagram({ r, Pu, Mu }: {
  r: InteractionResult; Pu?: number; Mu?: number
}): JSX.Element {
  const W = 460, H = 320
  const padL = 54, padR = 16, padT = 40, padB = 44
  const pts = r.curve

  const Mmax = Math.max(...pts.map((p) => p.Mn), Mu ?? 0) * 1.06
  const Pmax = Math.max(r.Po, Pu ?? 0) * 1.06
  const Pmin = Math.min(0, ...pts.map((p) => p.Pn)) * 1.1
  const sx = (m: number) => padL + ((W - padL - padR) * m) / Math.max(Mmax, 1e-9)
  const sy = (p: number) => padT + ((H - padT - padB) * (Pmax - p)) / Math.max(Pmax - Pmin, 1e-9)

  const nomLine = pts.map((p) => `${sx(p.Mn).toFixed(1)},${sy(p.Pn).toFixed(1)}`).join(' ')
  // Design curve: φPn capped at φ·0.80Po.
  const cap = 0.65 * r.PnMax
  const desPts = pts.map((p) => ({ m: p.phi * p.Mn, P: Math.min(p.phi * p.Pn, cap) }))
  const desLine = desPts.map((p) => `${sx(p.m).toFixed(1)},${sy(p.P).toFixed(1)}`).join(' ')

  // round ticks: P from the deepest tension row to the cap, M from zero
  const pStep = niceStep(Pmax - Pmin, 5), mStep = niceStep(Mmax, 4)
  const pTicks: number[] = [], mTicks: number[] = []
  for (let v = Math.ceil(Pmin / pStep) * pStep; v <= Pmax + 1e-9; v += pStep) pTicks.push(v)
  for (let v = 0; v <= Mmax + 1e-9; v += mStep) mTicks.push(v)
  return (
    <DrawingFrame label="P-M interaction diagram">
      <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
        <text x={padL} y={14} fontSize={11} fontWeight={700} fill={DES}>P–M INTERACTION</text>

        {/* axes + round ticks; each axis title stands clear of its tick labels */}
        <line x1={padL} y1={sy(0)} x2={W - padR} y2={sy(0)} stroke={INK} strokeWidth={1} />
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke={INK} strokeWidth={1} />
        {pTicks.map((P) => (
          <g key={`p${P}`}>
            {Math.abs(P) > 1e-9 && <line x1={padL} y1={sy(P)} x2={W - padR} y2={sy(P)} stroke="var(--hairline, #e5e2da)" strokeWidth={0.6} />}
            <line x1={padL - 3} y1={sy(P)} x2={padL} y2={sy(P)} stroke={INK} />
            <text x={padL - 6} y={sy(P) + 3} fontSize={8} fill={MUTED} textAnchor="end">{tickLabel(P, pStep)}</text>
          </g>
        ))}
        {mTicks.map((M) => (
          <g key={`m${M}`}>
            <line x1={sx(M)} y1={H - padB} x2={sx(M)} y2={H - padB + 3} stroke={INK} />
            <text x={sx(M)} y={H - padB + 13} fontSize={8} fill={MUTED} textAnchor="middle">{tickLabel(M, mStep)}</text>
          </g>
        ))}
        <text x={W - padR} y={H - 8} fontSize={8.5} fill={MUTED} textAnchor="end">M (kN·m)</text>
        <text x={padL} y={padT - 8} fontSize={8.5} fill={MUTED} textAnchor="middle">P (kN)</text>

        {/* curves */}
        <polyline points={nomLine} fill="none" stroke={NOM} strokeWidth={1.3} strokeDasharray="5 3" />
        <polyline points={desLine} fill="none" stroke={DES} strokeWidth={1.8} />

        {/* balanced point */}
        <circle cx={sx(r.balanced.Mb)} cy={sy(r.balanced.Pb)} r={3.5} fill="none" stroke={BAL} strokeWidth={1.5} />
        <text x={sx(r.balanced.Mb) - 6} y={sy(r.balanced.Pb) - 6} fontSize={8} fill={BAL} textAnchor="end" {...halo}>balanced</text>

        {/* demand */}
        {Pu !== undefined && Mu !== undefined && (
          <g>
            <line x1={sx(0)} y1={sy(0)} x2={sx(Mu)} y2={sy(Pu)} stroke={DEMAND} strokeWidth={0.7} strokeDasharray="4 3" />
            <circle cx={sx(Mu)} cy={sy(Pu)} r={3.5} fill={DEMAND} />
            <text x={sx(Mu) + 6} y={sy(Pu) + 3} fontSize={8} fill={DEMAND} {...halo}>(Mu, Pu)</text>
          </g>
        )}

        {/* legend */}
        <g fontSize={8} fill={MUTED}>
          <line x1={W - 150} y1={padT - 20} x2={W - 130} y2={padT - 20} stroke={NOM} strokeDasharray="5 3" strokeWidth={1.3} />
          <text x={W - 126} y={padT - 17}>nominal Pn–Mn</text>
          <line x1={W - 150} y1={padT - 8} x2={W - 130} y2={padT - 8} stroke={DES} strokeWidth={1.8} />
          <text x={W - 126} y={padT - 5}>design φPn–φMn (capped)</text>
        </g>
      </svg>
    </DrawingFrame>
  )
}
