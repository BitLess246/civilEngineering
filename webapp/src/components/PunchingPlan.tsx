// ─────────────────────────────────────────────────────────────────────────
// Punching shear — the critical perimeter in plan, beside the failure cone.
//
// The page reports b0 and three capacities and never shows the one thing the
// whole check depends on: WHERE the critical section is, and how the column's
// POSITION changes its shape.
//
//   • b0 is taken at d/2 from the column face (§22.6.4.1). Half the effective
//     depth, not the full depth and not the column face itself.
//   • An INTERIOR column has a closed perimeter; an EDGE column has three
//     sides, a CORNER column two. That is exactly why αs is 40 / 30 / 20 in
//     Eq. 22.6.5.2c, and the drawing makes the two facts one picture instead
//     of two unrelated numbers.
//   • The failure surface is a CONE spreading at roughly 45° from the column
//     face down through the slab, which is what "punching" means and why the
//     perimeter is offset at all.
//
// Geometry only. `engine/punchingShear` decides everything.
// ─────────────────────────────────────────────────────────────────────────

import { DrawingFrame } from './DrawingFrame'
import { DimSide, Tick } from './dims'

const INK = '#37526e'
const CONC = '#eef3f8'
const COL = '#37526e'
const CRIT = '#c2402a'
const DIM = '#1f77b4'
const FAINT = '#a39d8d'

export type PunchPosition = 'interior' | 'edge' | 'corner'

export interface PunchingPlanProps {
  /** Column dimensions, mm. */
  c1: number
  c2: number
  /** Effective depth, mm — the perimeter sits at d/2 from the face. */
  d: number
  /** Slab thickness, mm — the section is drawn at the plan's scale. */
  h: number
  position: PunchPosition
  /** From the engine, labelled rather than recomputed. */
  b0: number
  alphaS: number
}

export function PunchingPlan({ c1, c2, d, h, position, b0, alphaS }: PunchingPlanProps) {
  const ML = 54, MR = 64, MT = 40
  const PLAN = 190
  // Slab shown around the column with room for the perimeter and the offset.
  const extent = Math.max(c1, c2) + 2 * d + Math.max(c1, c2) * 0.9
  const s = PLAN / Math.max(extent, 1)
  const W = ML + PLAN + MR

  const cw = c1 * s, ch = c2 * s, off = (d / 2) * s
  // c₁ is drawn across the page and is the side PARALLEL to a free edge (the
  // engine's convention: b₀ = (c₁ + d) + 2(c₂ + d/2) at an edge), so an edge
  // column's free edge is the TOP of the plan, and a corner adds the left.
  // This used to put the edge column's free edge on the left — parallel to c₂,
  // the transpose of the perimeter the engine measures.
  const openTop = position === 'edge' || position === 'corner'
  const openLeft = position === 'corner'
  const cx = ML + PLAN / 2 - (openLeft ? PLAN / 2 - cw / 2 - off - 4 : 0)
  const cy = MT + PLAN / 2 - (openTop ? PLAN / 2 - ch / 2 - off - 4 : 0)

  const l = cx - cw / 2 - off, r = cx + cw / 2 + off
  const t = cy - ch / 2 - off, bm = cy + ch / 2 + off
  const edgeX = cx - cw / 2 - off - 4        // the slab's free edges
  const edgeY = cy - ch / 2 - off - 4
  // the perimeter runs out to a free edge and stops there — no side along it
  const yTo = openTop ? edgeY : t, xTo = openLeft ? edgeX : l
  const perimeter = `M${r} ${yTo} L${r} ${bm} L${xTo} ${bm}`
    + (openLeft ? '' : ` L${l} ${yTo}`) + (openTop ? '' : ` L${r} ${t}`)

  const sy = MT + PLAN + 44, sh = Math.max(14, h * s), dd = Math.min(sh - 2, d * s)
  const HT = sy + sh + 16 + 40

  return (
    <DrawingFrame label="punching shear plan">
      <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block h-auto w-full"
        style={{ fontFamily: 'Arial, sans-serif' }}>
        <text x={ML} y={MT - 16} fontSize={9} fontWeight={700} fill={INK}>
          PLAN — critical section at d/2
        </text>

        {/* the slab, clipped at any free edge */}
        <rect x={openLeft ? edgeX : ML} y={openTop ? edgeY : MT}
          width={(openLeft ? ML + PLAN - edgeX : PLAN)} height={(openTop ? MT + PLAN - edgeY : PLAN)}
          fill={CONC} stroke={INK} strokeWidth={1.2} />
        {openLeft && <line x1={edgeX} y1={openTop ? edgeY : MT} x2={edgeX} y2={MT + PLAN} stroke={INK} strokeWidth={2.2} />}
        {openTop && <line x1={openLeft ? edgeX : ML} y1={edgeY} x2={ML + PLAN} y2={edgeY} stroke={INK} strokeWidth={2.2} />}
        {(openLeft || openTop) && (
          <text x={openLeft ? edgeX + 4 : ML + 4} y={(openTop ? edgeY : MT) + 11} fontSize={7} fill={FAINT}>
            slab edge
          </text>
        )}

        {/* the column */}
        <rect x={cx - cw / 2} y={cy - ch / 2} width={cw} height={ch} fill={COL} opacity={0.85} />

        {/* the critical perimeter — open where the slab is */}
        <path d={perimeter} fill="none" stroke={CRIT} strokeWidth={2} strokeDasharray="7 3" />

        {/* c₁ and the d/2 offset as one chain below the plan, every end on an
            extension line off a column corner or a perimeter corner */}
        {(() => {
          const row = bm + 16
          const colL = cx - cw / 2, colR = cx + cw / 2, colB = cy + ch / 2
          const stops = [...(openLeft ? [] : [l]), colL, colR, r]
          return (
            <g>
              {[colL, colR].map((x) => <line key={`c${x}`} x1={x} y1={colB + 3} x2={x} y2={row + 5} stroke={DIM} strokeWidth={0.6} />)}
              {[...(openLeft ? [] : [l]), r].map((x) => <line key={`p${x}`} x1={x} y1={bm + 3} x2={x} y2={row + 5} stroke={DIM} strokeWidth={0.6} />)}
              <line x1={stops[0]} y1={row} x2={r} y2={row} stroke={DIM} strokeWidth={0.9} />
              {stops.map((x) => <Tick key={`t${x}`} x={x} y={row} />)}
              <text x={cx} y={row - 4} fontSize={8} fill={DIM} textAnchor="middle"
                paintOrder="stroke" stroke="var(--sheet, #fff)" strokeWidth={2.6}>c₁ = {Math.round(c1)}</text>
              <text x={r + 7} y={row + 3} fontSize={8} fill={DIM}
                paintOrder="stroke" stroke="var(--sheet, #fff)" strokeWidth={2.6}>d/2 = {Math.round(d / 2)}</text>
              <DimSide yA={cy - ch / 2} yB={colB} featX={colR} dX={r + 14} label={`c₂ = ${Math.round(c2)}`} side="right" />
            </g>
          )
        })()}

        {/* ── the failure cone, in section under the plan, at the plan's scale.
            The column is BELOW the slab, as it is in the building: the top
            steel is the tension steel, d runs from the soffit up to it, and
            the cone rises at ~45° from the column face, crossing the critical
            section at d/2. ─────────────────────────────────────────────────── */}
        {(() => {
          const half = cw / 2
          const ySteel = sy + sh - dd
          const slabL = openLeft ? edgeX : ML
          return (
            <g>
              <text x={ML} y={sy - 8} fontSize={9} fontWeight={700} fill={INK}>SECTION — failure cone</text>
              <rect x={slabL} y={sy} width={ML + PLAN - slabL} height={sh} fill={CONC} stroke={INK} strokeWidth={1.2} />
              <rect x={cx - half} y={sy + sh} width={cw} height={16} fill={COL} opacity={0.85} />
              <line x1={slabL + 3} y1={ySteel} x2={ML + PLAN - 3} y2={ySteel} stroke={INK} strokeWidth={1} strokeDasharray="2 2" />
              {(openLeft ? [1] : [-1, 1]).map((k) => (
                <g key={k}>
                  <line x1={cx + k * half} y1={sy + sh} x2={cx + k * (half + dd)} y2={ySteel} stroke={CRIT} strokeWidth={1.8} strokeDasharray="6 3" />
                  <line x1={cx + k * (half + off)} y1={sy} x2={cx + k * (half + off)} y2={sy + sh} stroke={CRIT} strokeWidth={0.8} />
                </g>
              ))}
              <text x={cx + half + dd + 4} y={ySteel + 9} fontSize={7.5} fill={CRIT}>≈45°</text>
              <DimSide yA={ySteel} yB={sy + sh} featX={ML + PLAN} dX={ML + PLAN + 14} label={`d = ${Math.round(d)}`} side="right" />
            </g>
          )
        })()}

        {/* what the position actually buys you */}
        <text x={W / 2} y={HT - 20} fontSize={8} fill={CRIT} textAnchor="middle">
          {position} column · b₀ = {Math.round(b0).toLocaleString()} mm · αs = {alphaS}
        </text>
        <text x={W / 2} y={HT - 8} fontSize={7.5} fill={FAINT} textAnchor="middle">
  Perimeter closes only for an interior column — hence αs = 40 / 30 / 20 (§22.6.5.2c).
        </text>
      </svg>
    </DrawingFrame>
  )
}
