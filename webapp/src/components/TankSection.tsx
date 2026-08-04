// ─────────────────────────────────────────────────────────────────────────
// Circular tank — wall section beside a plan through the ring.
//
// The two drawings answer the two questions the numbers leave open:
//
//  SECTION: where the load comes from. The hydrostatic pressure is TRIANGULAR,
//  zero at the surface and γw·H at the base, which is why the hoop tension the
//  page reports is a MAXIMUM at the base and why the ring steel can be reduced
//  up the wall. A page that only prints T at the base invites uniform rings
//  the whole way up.
//
//  PLAN: what the hoop steel actually is. Rings are a closed loop resisting
//  T = γw·H·D/2 by pure tension; in section they are cut end-on and draw as
//  dots, which is exactly why a section alone cannot show them.
//
// Geometry only. `engine/waterTank` decides everything.
// ─────────────────────────────────────────────────────────────────────────

const INK = '#37526e'
const CONC = '#eef3f8'
const WATER = '#cfe4f2'
const HOOP = '#c2402a'       // ring steel — the tension the design is driven by
const VERT = '#0f4c92'       // vertical steel — the base cantilever
const PRESS = '#0e7490'
const DIM = '#1f77b4'
const FAINT = '#a39d8d'

export interface TankSectionProps {
  /** Water depth, m. */
  H: number
  /** Internal diameter, m. */
  D: number
  /** Wall thickness, mm. */
  t: number
  /** Freeboard above the water surface, m. */
  freeboard: number
  /** Maximum hoop tension at the base, kN/m — labelled, not recomputed. */
  T: number
  hoopBars?: string
  vertBars?: string
}

export function TankSection({ H, D, t, freeboard, T, hoopBars, vertBars }: TankSectionProps) {
  const wallH = H + Math.max(0, freeboard)
  // Left margin has to carry, from the outside in: the H dimension line and
  // its rotated label, then the stored water with the pressure wedge inside
  // it. The first version used 96 and put the dimension at x = −12, off the
  // canvas entirely.
  const DIM_X = 26, WATER_W = 96
  const ML = DIM_X + 22 + WATER_W, MR = 210, MT = 34, MB = 66
  const WALL_H = 210
  const s = WALL_H / Math.max(wallH, 1e-9)        // m → units, vertical
  const tw = Math.max(5, (t / 1000) * s)          // wall thickness, same scale

  const yTop = MT, yBase = MT + WALL_H
  const yWater = yTop + Math.max(0, freeboard) * s
  const xWall = ML                                // inner face of the wall
  const W = ML + 40 + MR, HT = MT + WALL_H + MB

  // Triangular hydrostatic pressure, drawn INSIDE the tank pushing outward.
  const pMax = 74
  const xP = xWall - 6

  // Plan: a ring at the base, drawn to the right of the section.
  const cx = ML + 40 + MR / 2, cy = MT + WALL_H / 2 - 6
  const rOut = 58, rIn = rOut * (1 - Math.min(0.35, (t / 1000) / Math.max(D, 1e-9) * 2))

  return (
    <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block h-auto w-full"
      style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* ── SECTION ─────────────────────────────────────────────────────── */}
      <text x={ML} y={MT - 14} fontSize={9} fontWeight={700} fill={INK}>WALL SECTION</text>

      {/* stored water */}
      <rect x={xWall - WATER_W} y={yWater} width={WATER_W} height={yBase - yWater} fill={WATER} opacity={0.75} />
      <line x1={xWall - WATER_W} y1={yWater} x2={xWall} y2={yWater} stroke={PRESS} strokeWidth={1.1} />
      <text x={xWall - 4} y={yWater - 5} fontSize={7.5} fill={PRESS} textAnchor="end">water surface</text>

      {/* the wall */}
      <rect x={xWall} y={yTop} width={tw} height={WALL_H} fill={CONC} stroke={INK} strokeWidth={1.5} />
      {/* base slab, drawn only as context — designed separately */}
      <rect x={xWall - WATER_W} y={yBase} width={tw + WATER_W + 26} height={16} fill="#e2e5ea" stroke={INK} strokeWidth={1.1} />
      <text x={xWall + tw + 30} y={yBase + 27} fontSize={7} fill={FAINT}>base slab — designed separately</text>

      {/* hydrostatic pressure: ZERO at the surface, γw·H at the base */}
      <polygon points={`${xP},${yWater} ${xP},${yBase} ${xP - pMax},${yBase}`}
        fill={PRESS} opacity={0.16} stroke={PRESS} strokeWidth={0.9} />
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f} stroke={PRESS} strokeWidth={1}>
          <line x1={xP - pMax * f} y1={yWater + (yBase - yWater) * f} x2={xP} y2={yWater + (yBase - yWater) * f} />
          <path d={`M${xP - 4} ${yWater + (yBase - yWater) * f - 2.6} L${xP} ${yWater + (yBase - yWater) * f} L${xP - 4} ${yWater + (yBase - yWater) * f + 2.6}`}
            fill={PRESS} stroke="none" />
        </g>
      ))}
      <text x={xP - pMax - 4} y={yBase - 4} fontSize={7.5} fill={PRESS} textAnchor="end">γw·H</text>
      <text x={xP - 6} y={yWater + 12} fontSize={7.5} fill={PRESS} textAnchor="end">0</text>

      {/* hoop steel — rings cut end-on, closer together near the base where T
          peaks, which is the point the drawing exists to make */}
      {Array.from({ length: 9 }, (_, i) => {
        const f = 1 - (i / 8) ** 1.6            // bunched toward the base
        const y = yWater + (yBase - yWater) * f
        return <circle key={i} cx={xWall + tw * 0.28} cy={y} r={2} fill={HOOP} />
      })}
      {/* vertical steel — the base cantilever, on the water face */}
      <line x1={xWall + tw * 0.72} y1={yTop + 6} x2={xWall + tw * 0.72} y2={yBase - 2}
        stroke={VERT} strokeWidth={2} strokeLinecap="round" />
      <line x1={xWall + tw * 0.72} y1={yBase - 2} x2={xWall + tw * 0.72 + 14} y2={yBase - 2}
        stroke={VERT} strokeWidth={2} strokeLinecap="round" />

      {/* dimensions */}
      <g>
        <line x1={DIM_X} y1={yWater} x2={DIM_X} y2={yBase} stroke={DIM} strokeWidth={0.9} />
        {[yWater, yBase].map((y) => <line key={y} x1={DIM_X - 4} y1={y + 4} x2={DIM_X + 4} y2={y - 4} stroke={DIM} strokeWidth={1.2} />)}
        <text x={DIM_X - 9} y={(yWater + yBase) / 2} fontSize={8.5} fill={DIM} textAnchor="middle"
          transform={`rotate(-90 ${DIM_X - 9} ${(yWater + yBase) / 2})`}
          paintOrder="stroke" stroke="#fff" strokeWidth={2.6}>H = {H.toFixed(2)} m</text>
        <line x1={DIM_X} y1={yTop} x2={DIM_X} y2={yWater} stroke={DIM} strokeWidth={0.9} />
        <text x={DIM_X + 6} y={yTop + 10} fontSize={7.5} fill={DIM}>fb {freeboard.toFixed(2)} m</text>
        <text x={xWall + tw + 5} y={yTop + 12} fontSize={7.5} fill={DIM}>t = {t} mm</text>
      </g>

      {/* ── PLAN ────────────────────────────────────────────────────────── */}
      <text x={cx - rOut} y={cy - rOut - 16} fontSize={9} fontWeight={700} fill={INK}>PLAN — ring at base</text>
      <circle cx={cx} cy={cy} r={rOut} fill={CONC} stroke={INK} strokeWidth={1.4} />
      <circle cx={cx} cy={cy} r={rIn} fill={WATER} stroke={INK} strokeWidth={1.2} opacity={0.85} />
      <circle cx={cx} cy={cy} r={(rOut + rIn) / 2} fill="none" stroke={HOOP} strokeWidth={2.2} />
      {/* the hoop tension the ring resists, shown as it acts */}
      {[0, 90, 180, 270].map((a) => {
        const rad = (a * Math.PI) / 180
        const x = cx + Math.cos(rad) * (rOut + 12), y = cy + Math.sin(rad) * (rOut + 12)
        const x2 = cx + Math.cos(rad) * (rOut + 1), y2 = cy + Math.sin(rad) * (rOut + 1)
        return <line key={a} x1={x} y1={y} x2={x2} y2={y2} stroke={PRESS} strokeWidth={1.2}
          markerEnd="" strokeLinecap="round" />
      })}
      <text x={cx} y={cy + 3} fontSize={8} fill={INK} textAnchor="middle">D = {D.toFixed(2)} m</text>
      <text x={cx} y={cy + rOut + 20} fontSize={7.5} fill={HOOP} textAnchor="middle">
        ring resists T = γw·H·D/2 = {T.toFixed(1)} kN/m
      </text>

      {/* legend */}
      <g fontSize={8}>
        <circle cx={cx - rOut} cy={cy + rOut + 34} r={2} fill={HOOP} />
        <text x={cx - rOut + 8} y={cy + rOut + 37} fill={HOOP}>hoop {hoopBars ?? ''}</text>
        <line x1={cx - rOut - 3} y1={cy + rOut + 48} x2={cx - rOut + 3} y2={cy + rOut + 48} stroke={VERT} strokeWidth={2} />
        <text x={cx - rOut + 8} y={cy + rOut + 51} fill={VERT}>vertical {vertBars ?? ''}</text>
      </g>

      <text x={W / 2} y={HT - 18} fontSize={7.5} fill={FAINT} textAnchor="middle">
        Pressure is triangular: T peaks at the base and falls as γw·z·D/2 up the wall.
      </text>
      <text x={W / 2} y={HT - 7} fontSize={7.5} fill={FAINT} textAnchor="middle">
        Ring steel may be reduced with height — rings are drawn closer together near the base for that reason.
      </text>
    </svg>
  )
}
