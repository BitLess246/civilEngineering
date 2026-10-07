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
import { criticalSection } from '../engine/shear'

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
  // The column stands FLUSH with each free edge — its outer face is the slab
  // edge — which is what the engine's b₀ and A₀ assume: the section runs from
  // the edge, round the inner faces at d/2, and back to the edge.
  const openTop = position === 'edge' || position === 'corner'
  const openLeft = position === 'corner'
  const cx = openLeft ? ML + cw / 2 : ML + PLAN / 2
  const cy = openTop ? MT + ch / 2 : MT + PLAN / 2

  const l = cx - cw / 2 - off, r = cx + cw / 2 + off
  const t = cy - ch / 2 - off, bm = cy + ch / 2 + off
  // the perimeter runs out to a free edge and stops there — no side along it
  const yTo = openTop ? MT : t, xTo = openLeft ? ML : l
  const perimeter = `M${r} ${yTo} L${r} ${bm} L${xTo} ${bm}`
    + (openLeft ? '' : ` L${l} ${yTo}`) + (openTop ? '' : ` L${r} ${t}`)
  // the engine's section, labelled — the drawing takes b₀ and A₀ from it
  const cs = criticalSection(c2, c1, d, position)
  const legX = openLeft ? 'c₁ + d/2' : 'c₁ + d'
  const legY = openTop ? 'c₂ + d/2' : 'c₂ + d'
  const lenX = openLeft ? c1 + d / 2 : c1 + d, lenY = openTop ? c2 + d / 2 : c2 + d
  const b0Tex = position === 'interior' ? `2(${legX}) + 2(${legY})`
    : position === 'edge' ? `(${legX}) + 2(${legY})` : `(${legX}) + (${legY})`
  const b0Num = position === 'interior' ? `2(${Math.round(lenX)}) + 2(${Math.round(lenY)})`
    : position === 'edge' ? `${Math.round(lenX)} + 2(${Math.round(lenY)})` : `${Math.round(lenX)} + ${Math.round(lenY)}`

  const sy = MT + PLAN + 44, sh = Math.max(14, h * s), dd = Math.min(sh - 2, d * s)
  const HT = sy + sh + 16 + 72
  const halo = { paintOrder: 'stroke' as const, stroke: 'var(--sheet, #fff)', strokeWidth: 2.6 }

  return (
    <DrawingFrame label="punching shear plan">
      <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block h-auto w-full"
        style={{ fontFamily: 'Arial, sans-serif' }}>
        <text x={ML} y={MT - 16} fontSize={9} fontWeight={700} fill={INK}>
          PLAN — critical section at d/2
        </text>

        {/* the slab; a free edge is drawn heavy, a continuing side light */}
        <rect x={ML} y={MT} width={PLAN} height={PLAN} fill={CONC} stroke={INK} strokeWidth={0.8} strokeDasharray="5 3" />
        {openLeft && <line x1={ML} y1={MT} x2={ML} y2={MT + PLAN} stroke={INK} strokeWidth={2.2} />}
        {openTop && <line x1={ML} y1={MT} x2={ML + PLAN} y2={MT} stroke={INK} strokeWidth={2.2} />}
        {openTop && <text x={openLeft ? ML + 4 : ML} y={MT - 4} fontSize={7} fill={FAINT}>free edge</text>}
        {openLeft && <text x={ML - 4} y={MT + PLAN} fontSize={7} fill={FAINT} textAnchor="start"
          transform={`rotate(-90 ${ML - 4} ${MT + PLAN})`}>free edge</text>}

        {/* A₀ — the area inside the section, whose load does not punch */}
        <rect x={xTo} y={yTo} width={r - xTo} height={bm - yTo} fill={CRIT} opacity={0.1} />

        {/* the column */}
        <rect x={cx - cw / 2} y={cy - ch / 2} width={cw} height={ch} fill={COL} opacity={0.85} />

        {/* the critical perimeter — open where the slab is */}
        <path d={perimeter} fill="none" stroke={CRIT} strokeWidth={2} strokeDasharray="7 3" />
        <text x={(xTo + r) / 2} y={bm - 3} fontSize={7} fill={CRIT} textAnchor="middle" {...halo}>{legX}</text>
        <text x={r - 3} y={(yTo + bm) / 2} fontSize={7} fill={CRIT} textAnchor="middle" {...halo}
          transform={`rotate(-90 ${r - 3} ${(yTo + bm) / 2})`}>{legY}</text>

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
          const slabL = ML
          return (
            <g>
              <text x={ML} y={sy - 8} fontSize={9} fontWeight={700} fill={INK}>SECTION — failure cone</text>
              <rect x={slabL} y={sy} width={PLAN} height={sh} fill={CONC} stroke={INK} strokeWidth={1.2} />
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

        {/* what the position actually buys you — one fact per line, each inside the sheet */}
        <text x={W / 2} y={HT - 56} fontSize={8} fill={CRIT} textAnchor="middle" fontWeight={700}>
          {position} column · αs = {alphaS} · {position === 'interior' ? 'closed on four sides' : `flush with the free ${openLeft ? 'edges' : 'edge'}`}
        </text>
        <text x={W / 2} y={HT - 43} fontSize={8} fill={CRIT} textAnchor="middle">
          b₀ = {b0Tex} = {b0Num} = {Math.round(b0).toLocaleString()} mm
        </text>
        <text x={W / 2} y={HT - 30} fontSize={8} fill={CRIT} textAnchor="middle">
          A₀ = ({legX})({legY}) = {Math.round(lenX)} × {Math.round(lenY)} = {(cs.Ao / 1e6).toFixed(3)} m²
        </text>
        <text x={W / 2} y={HT - 12} fontSize={7} fill={FAINT} textAnchor="middle">
          Each free edge drops one side of b₀ and one d/2 of A₀ (§22.6.4.1, §22.6.5.2c).
        </text>
      </svg>
    </DrawingFrame>
  )
}
