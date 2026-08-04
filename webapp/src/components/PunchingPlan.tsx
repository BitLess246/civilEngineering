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
  position: PunchPosition
  /** From the engine, labelled rather than recomputed. */
  b0: number
  alphaS: number
}

export function PunchingPlan({ c1, c2, d, position, b0, alphaS }: PunchingPlanProps) {
  const ML = 54, MR = 46, MT = 40, MB = 128
  const PLAN = 190
  // Slab shown around the column with room for the perimeter and the offset.
  const extent = Math.max(c1, c2) + 2 * d + Math.max(c1, c2) * 0.9
  const s = PLAN / Math.max(extent, 1)
  const W = ML + PLAN + MR, HT = MT + PLAN + MB

  const cw = c1 * s, ch = c2 * s, off = (d / 2) * s
  // Interior sits centred; edge is pushed to the slab edge on one side; corner
  // on two. The slab edge is where the perimeter stops being closed.
  const cx = ML + PLAN / 2 - (position === 'interior' ? 0 : PLAN / 2 - cw / 2 - off - 4)
  const cy = MT + PLAN / 2 - (position === 'corner' ? PLAN / 2 - ch / 2 - off - 4 : 0)

  const l = cx - cw / 2 - off, r = cx + cw / 2 + off
  const t = cy - ch / 2 - off, bm = cy + ch / 2 + off

  // The perimeter is closed for an interior column, open at the free edge(s).
  const openLeft = position === 'edge' || position === 'corner'
  const openTop = position === 'corner'
  const edgeX = cx - cw / 2 - off - 4        // the slab's free edge
  const edgeY = cy - ch / 2 - off - 4

  return (
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
      {openTop && <line x1={edgeX} y1={edgeY} x2={ML + PLAN} y2={edgeY} stroke={INK} strokeWidth={2.2} />}
      {(openLeft || openTop) && (
        <text x={openLeft ? edgeX + 4 : ML + 4} y={(openTop ? edgeY : MT) + 11} fontSize={7} fill={FAINT}>
          slab edge
        </text>
      )}

      {/* the column */}
      <rect x={cx - cw / 2} y={cy - ch / 2} width={cw} height={ch} fill={COL} opacity={0.85} />
      <text x={cx} y={cy + 3} fontSize={7.5} fill="#fff" textAnchor="middle">c₁×c₂</text>

      {/* the critical perimeter — open where the slab is */}
      <path
        d={[
          `M${openLeft ? edgeX : l} ${t}`,
          openTop ? '' : `L${l} ${t}`,
          `L${r} ${t} L${r} ${bm} L${openLeft ? edgeX : l} ${bm}`,
          openLeft ? '' : `L${l} ${t}`,
        ].filter(Boolean).join(' ')}
        fill="none" stroke={CRIT} strokeWidth={2} strokeDasharray="7 3" />

      {/* the d/2 offset, dimensioned where it is easiest to read */}
      <g>
        <line x1={cx + cw / 2} y1={bm + 14} x2={r} y2={bm + 14} stroke={DIM} strokeWidth={0.9} />
        {[cx + cw / 2, r].map((x) => <line key={x} x1={x - 3} y1={bm + 17} x2={x + 3} y2={bm + 11} stroke={DIM} strokeWidth={1.1} />)}
        <text x={(cx + cw / 2 + r) / 2} y={bm + 28} fontSize={8} fill={DIM} textAnchor="middle"
          paintOrder="stroke" stroke="#fff" strokeWidth={2.6}>d/2 = {Math.round(d / 2)}</text>
      </g>

      {/* ── the failure cone, in section under the plan ─────────────────── */}
      {(() => {
        const sy = MT + PLAN + 56, sh = 30
        const half = cw / 2, spread = off * 2
        return (
          <g>
            <text x={ML} y={sy - 30} fontSize={9} fontWeight={700} fill={INK}>SECTION — failure cone</text>
            <rect x={ML} y={sy} width={PLAN} height={sh} fill={CONC} stroke={INK} strokeWidth={1.2} />
            <rect x={cx - half} y={sy - 16} width={cw} height={16} fill={COL} opacity={0.85} />
            {/* ~45° through the slab, which is what "punching" means */}
            <line x1={cx - half} y1={sy} x2={cx - half - spread} y2={sy + sh} stroke={CRIT} strokeWidth={1.8} strokeDasharray="6 3" />
            <line x1={cx + half} y1={sy} x2={cx + half + spread} y2={sy + sh} stroke={CRIT} strokeWidth={1.8} strokeDasharray="6 3" />
            <text x={cx + half + spread + 6} y={sy + sh - 2} fontSize={7.5} fill={CRIT}>≈45°</text>
            <text x={ML + PLAN + 4} y={sy + sh / 2} fontSize={7.5} fill={DIM}>d = {Math.round(d)}</text>
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
  )
}
