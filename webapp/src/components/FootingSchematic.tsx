import type { JSX } from 'react'

const DIM = '#1f77b4'
const STROKE = '#37526e'
const FILL = '#eef3f8'
const COL = '#37526e'
const GAP = 4
const TK = 4

function Tick({ x, y }: { x: number; y: number }) {
  // 45° architectural tick
  return <line x1={x - TK} y1={y + TK} x2={x + TK} y2={y - TK} stroke={DIM} strokeWidth={1.2} />
}

/** Horizontal dimension below a feature (extension lines + dim line + ticks + label). */
function DimBelow({ xA, xB, featY, dY, label }: { xA: number; xB: number; featY: number; dY: number; label: string }) {
  return (
    <g>
      <line x1={xA} y1={featY + GAP} x2={xA} y2={dY + 5} stroke={DIM} strokeWidth={0.6} />
      <line x1={xB} y1={featY + GAP} x2={xB} y2={dY + 5} stroke={DIM} strokeWidth={0.6} />
      <line x1={xA} y1={dY} x2={xB} y2={dY} stroke={DIM} strokeWidth={0.9} />
      <Tick x={xA} y={dY} />
      <Tick x={xB} y={dY} />
      <text x={(xA + xB) / 2} y={dY - 4} fontSize={9.5} fill={DIM} textAnchor="middle"
        paintOrder="stroke" stroke="#fff" strokeWidth={2.6}>{label}</text>
    </g>
  )
}

/** Vertical dimension to one side of a feature. side='right' puts it on the right. */
function DimSide({ yA, yB, featX, dX, label, side }: { yA: number; yB: number; featX: number; dX: number; label: string; side: 'left' | 'right' }) {
  const ext = side === 'right' ? 5 : -5
  const lab = side === 'right' ? dX + 11 : dX - 11
  const e1 = side === 'right' ? featX + GAP : featX - GAP
  return (
    <g>
      <line x1={e1} y1={yA} x2={dX + ext} y2={yA} stroke={DIM} strokeWidth={0.6} />
      <line x1={e1} y1={yB} x2={dX + ext} y2={yB} stroke={DIM} strokeWidth={0.6} />
      <line x1={dX} y1={yA} x2={dX} y2={yB} stroke={DIM} strokeWidth={0.9} />
      <Tick x={dX} y={yA} />
      <Tick x={dX} y={yB} />
      <text x={lab} y={(yA + yB) / 2} fontSize={9.5} fill={DIM} textAnchor="middle"
        transform={`rotate(-90 ${lab} ${(yA + yB) / 2})`} paintOrder="stroke" stroke="#fff" strokeWidth={2.6}>{label}</text>
    </g>
  )
}

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
