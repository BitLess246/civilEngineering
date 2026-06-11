import type { JSX } from 'react'
import { DimBelow, DimSide } from './dims'

const STROKE = '#37526e'
const FILL = '#eef3f8'
const COL = '#37526e'

export interface SchematicProps {
  /** Footing length along x, m. */
  Bx: number
  /** Footing width along y, m (= Bx for a square footing). */
  By: number
  /** Slab thickness D_c, mm. */
  Dc: number
  /** Square column width, mm. */
  columnWidth: number
  /** Total depth H, m. */
  H: number
}

/** Plan + section of a designed footing, drawn to scale. */
export function FootingSchematic({ Bx, By, Dc, columnWidth, H }: SchematicProps): JSX.Element {
  const W = 360
  const cm = columnWidth / 1000

  // ── PLAN (single scale → true proportions) ──
  const planTop = 36
  const RM = 52
  const px0 = 14
  const availW = W - RM - px0
  const availH = 116
  const s = Math.min(availW / Bx, availH / By)
  const fW = Bx * s
  const fH = By * s
  const fx = px0 + (availW - fW) / 2
  const fyTop = planTop
  const fyBot = planTop + fH
  const cxc = fx + fW / 2
  const cyc = (fyTop + fyBot) / 2
  const cpx = Math.max(6, cm * s)

  // ── SECTION ──
  const secTitleY = fyBot + 64
  const secTop = secTitleY + 10
  const gl = secTop + 6
  const slabX = 46
  const sW = W - slabX - 44
  const sV = 96 / H
  const Hpx = Math.max(46, H * sV)
  const slabH = Math.max(8, (Dc / 1000) * sV)
  const slabY = gl + (Hpx - slabH)
  const baseY = gl + Hpx
  const stubW = 28
  const soilTicks: JSX.Element[] = []
  for (let x = slabX; x < slabX + sW; x += 12) {
    soilTicks.push(<line key={`s${x}`} x1={x} y1={gl} x2={x - 6} y2={gl + 6} stroke="#caa472" strokeWidth={0.8} />)
  }

  const totalH = baseY + 26

  return (
    <svg viewBox={`0 0 ${W} ${totalH}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <text x={14} y={20} fontSize={11} fontWeight={700} fill="#0056b3">PLAN</text>
      {/* footing + column */}
      <rect x={fx} y={fyTop} width={fW} height={fH} rx={2} fill={FILL} stroke={STROKE} strokeWidth={1.4} />
      <rect x={cxc - cpx / 2} y={cyc - cpx / 2} width={cpx} height={cpx} fill={COL} />
      <DimBelow xA={fx} xB={fx + fW} featY={fyBot} dY={fyBot + 20} label={`Bx = ${Bx.toFixed(2)} m`} />
      <DimSide yA={fyTop} yB={fyBot} featX={fx + fW} dX={fx + fW + 10} label={`By = ${By.toFixed(2)} m`} side="right" />

      <text x={14} y={secTitleY} fontSize={11} fontWeight={700} fill="#0056b3">SECTION</text>
      {/* ground + soil */}
      <line x1={slabX} y1={gl} x2={slabX + sW} y2={gl} stroke="#8a6d3b" strokeWidth={1.2} />
      {soilTicks}
      {/* slab + column stub */}
      <rect x={slabX} y={slabY} width={sW} height={slabH} fill="#cfe0f1" stroke={STROKE} strokeWidth={1.4} />
      <rect x={slabX + sW / 2 - stubW / 2} y={gl} width={stubW} height={slabY - gl} fill={COL} />
      <DimSide yA={gl} yB={baseY} featX={slabX} dX={slabX - 12} label={`H = ${H.toFixed(2)} m`} side="left" />
      <DimSide yA={slabY} yB={baseY} featX={slabX + sW} dX={slabX + sW + 8} label={`Dc = ${Math.round(Dc)} mm`} side="right" />
    </svg>
  )
}
