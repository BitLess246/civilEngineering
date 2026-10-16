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
//  MOMENT: why the vertical steel is where it is. A closed ring cannot bow
//  out without stretching its hoops, so only the zone near the fixed base
//  bends — hard, with the WATER face in tension at the foot — and a small
//  reversal above it puts the outer face in tension. Drawn on the tension
//  side, from the shell solution the engine already ran.
//
//  PLAN: what the hoop steel actually is. Rings are a closed loop resisting
//  T = γw·H·D/2 by pure tension; in section they are cut end-on and draw as
//  dots, which is exactly why a section alone cannot show them.
//
// Geometry only. `engine/waterTank` decides everything.
// ─────────────────────────────────────────────────────────────────────────

import { DrawingFrame } from './DrawingFrame'
import { SurfaceMark } from './hydraulicsSketches'
import { Tick } from './dims'
import type { CylinderWall } from '../engine/waterTank'

const INK = '#37526e'
const CONC = '#eef3f8'
const WATER = '#cfe4f2'
const HOOP = '#c2402a'       // ring steel — the tension the design is driven by
const VERT = '#0f4c92'       // vertical steel — the base cantilever
const PRESS = '#0e7490'
const DIM = '#1f77b4'
const FAINT = '#a39d8d'
const HALO = { paintOrder: 'stroke' as const, stroke: 'var(--sheet, #fff)', strokeWidth: 2.6 }

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
  /** The shell solution — its moment profile is drawn beside the wall. */
  shell?: Pick<CylinderWall, 'M0' | 'Mspan' | 'xSpan' | 'at'>
}

/** Horizontal arrow from (x1,y) to (x2,y) with a filled head at x2. */
function HArrow({ x1, x2, y, color }: { x1: number; x2: number; y: number; color: string }) {
  const k = Math.sign(x2 - x1) || 1
  return (
    <g>
      <line x1={x1} y1={y} x2={x2 - k * 4} y2={y} stroke={color} strokeWidth={1.2} />
      <path d={`M${x2} ${y} l${-k * 5} -2.8 v5.6 z`} fill={color} />
    </g>
  )
}

export function TankSection({ H, D, t, freeboard, T, hoopBars, vertBars, shell }: TankSectionProps) {
  const fb = Math.max(0, freeboard)
  const wallH = H + fb
  // Left margin carries, from the outside in: the H / freeboard chain and its
  // rotated label, then the stored water with the pressure wedge inside it.
  const DIM_X = 26, WATER_W = 96
  const ML = DIM_X + 22 + WATER_W, MR = 210, MT = 40, MB = 77
  const WALL_H = 210
  const s = WALL_H / Math.max(wallH, 1e-9)        // m → units, ONE scale for the section
  const tw = Math.max(5, (t / 1000) * s)          // wall thickness at that scale

  const yTop = MT, yBase = MT + WALL_H
  const yWater = yTop + fb * s
  const xWall = ML                                // inner (water) face of the wall
  const xIn = xWall - WATER_W                     // where the cut of the water ends
  // Moment profile, right of the wall on the section's height scale: M on its
  // TENSION side — water face (left of the axis) negative, outer face right.
  const mMax = shell ? Math.max(Math.abs(shell.M0), Math.abs(shell.Mspan), 1e-9) : 1
  const mS = 44 / mMax
  const mLeft = shell ? Math.max(0, -shell.M0) * mS : 0
  const mRight = shell ? Math.max(0, shell.Mspan) * mS : 0
  const xAx = xWall + tw + 42 + mLeft            // clear of the base slab's end
  // what lies right of the wall's water face before the plan begins
  const RW = shell ? tw + 42 + mLeft + Math.max(mRight + 74, 112) : 40
  const W = ML + RW + MR, HT = MT + WALL_H + MB
  const mPts = shell ? Array.from({ length: 61 }, (_, i) => {
    const x = (H * i) / 60
    return `${(xAx + shell.at(x).M * mS).toFixed(2)},${(yBase - x * s).toFixed(2)}`
  }) : []

  // Triangular hydrostatic pressure, inside the tank, its arrows landing ON
  // the wall's water face.
  const pMax = 74
  const xP = xWall

  // Plan: the ring at the base, to the right of the section (its own scale).
  const cx = ML + RW + MR / 2, cy = MT + WALL_H / 2 - 6
  const rOut = 58, rIn = rOut * (1 - Math.min(0.35, (t / 1000) / Math.max(D / 2 + t / 1000, 1e-9)))
  const rMid = (rOut + rIn) / 2

  // Bars: the base moment of a wall fixed at its foot puts the WATER face in
  // tension, so the vertical steel is drawn there (it used to sit near the dry
  // face); the rings sit just outside it.
  const xVert = xWall + Math.min(tw * 0.25, 3)
  const xHoop = xWall + Math.min(tw * 0.55, 7)

  return (
    <DrawingFrame label="water tank section">
      <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block h-auto w-full"
        style={{ fontFamily: 'Arial, sans-serif' }}>
        {/* ── SECTION ─────────────────────────────────────────────────────── */}
        <text x={xIn} y={MT - 24} fontSize={9} fontWeight={700} fill={INK}>WALL SECTION</text>

        {/* stored water, the surface marked ▽ */}
        <rect x={xIn} y={yWater} width={WATER_W} height={yBase - yWater} fill={WATER} opacity={0.75} />
        <line x1={xIn} y1={yWater} x2={xWall} y2={yWater} stroke={PRESS} strokeWidth={1.1} />
        <SurfaceMark x={xIn + WATER_W * 0.6} y={yWater} />

        {/* the wall */}
        <rect x={xWall} y={yTop} width={tw} height={WALL_H} fill={CONC} stroke={INK} strokeWidth={1.5} />
        {/* base slab, drawn only as context — designed separately */}
        <rect x={xIn} y={yBase} width={tw + WATER_W + 26} height={16} fill="#e2e5ea" stroke={INK} strokeWidth={1.1} />
        <text x={xWall + tw + 30} y={yBase + 27} fontSize={7} fill={FAINT}>base slab — designed separately</text>

        {/* hydrostatic pressure: ZERO at the surface, γw·H at the base */}
        <polygon points={`${xP},${yWater} ${xP},${yBase} ${xP - pMax},${yBase}`}
          fill={PRESS} opacity={0.16} stroke={PRESS} strokeWidth={0.9} />
        {[0.25, 0.5, 0.75, 1].map((f) => {
          const y = yWater + (yBase - yWater) * f - (f === 1 ? 2 : 0)
          return <HArrow key={f} x1={xP - pMax * f} x2={xP} y={y} color={PRESS} />
        })}
        <text x={xP - pMax - 4} y={yBase - 4} fontSize={7.5} fill={PRESS} textAnchor="end">γw·H</text>

        {/* hoop steel — rings cut end-on, closer together near the base where T
            peaks, which is the point the drawing exists to make */}
        {Array.from({ length: 9 }, (_, i) => {
          const f = 1 - (i / 8) ** 1.6            // bunched toward the base
          const y = yWater + (yBase - yWater) * f - 4
          return <circle key={i} cx={xHoop} cy={y} r={2} fill={HOOP} />
        })}
        {/* vertical steel — the base cantilever, on the water face, lapped
            into the base slab with an L */}
        <path d={`M${xVert} ${yTop + 6} L${xVert} ${yBase + 9} L${xVert - 16} ${yBase + 9}`}
          fill="none" stroke={VERT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* H and freeboard as one chain, each end on an extension line: the
            wall top, the water surface, the base */}
        <g stroke={DIM}>
          <line x1={xWall - 4} y1={yTop} x2={DIM_X - 5} y2={yTop} strokeWidth={0.6} />
          <line x1={xIn - 4} y1={yWater} x2={DIM_X - 5} y2={yWater} strokeWidth={0.6} />
          <line x1={xIn - 4} y1={yBase} x2={DIM_X - 5} y2={yBase} strokeWidth={0.6} />
          <line x1={DIM_X} y1={yTop} x2={DIM_X} y2={yBase} strokeWidth={0.9} />
        </g>
        {[yTop, yWater, yBase].map((y) => <Tick key={y} x={DIM_X} y={y} />)}
        <text x={DIM_X - 9} y={(yWater + yBase) / 2} fontSize={8.5} fill={DIM} textAnchor="middle"
          transform={`rotate(-90 ${DIM_X - 9} ${(yWater + yBase) / 2})`} {...HALO}>H = {H.toFixed(2)} m</text>
        <text x={DIM_X + 7} y={yTop + 10} fontSize={7.5} fill={DIM} {...HALO}>fb {fb.toFixed(2)} m</text>

        {/* t across the wall top */}
        <g stroke={DIM}>
          <line x1={xWall} y1={yTop - 3} x2={xWall} y2={yTop - 15} strokeWidth={0.6} />
          <line x1={xWall + tw} y1={yTop - 3} x2={xWall + tw} y2={yTop - 15} strokeWidth={0.6} />
          <line x1={xWall - 6} y1={yTop - 10} x2={xWall + tw + 6} y2={yTop - 10} strokeWidth={0.9} />
        </g>
        <Tick x={xWall} y={yTop - 10} /><Tick x={xWall + tw} y={yTop - 10} />
        <text x={xWall + tw + 9} y={yTop - 7} fontSize={7.5} fill={DIM} {...HALO}>t = {t} mm</text>

        {/* ── MOMENT ──────────────────────────────────────────────────────── */}
        {shell && <g>
          <text x={xAx - mLeft} y={MT - 24} fontSize={9} fontWeight={700} fill={INK}>MOMENT — shell</text>
          <polygon points={[`${xAx},${yBase}`, ...mPts, `${xAx},${yBase - H * s}`].join(' ')}
            fill={VERT} opacity={0.12} />
          <polyline points={mPts.join(' ')} fill="none" stroke={VERT} strokeWidth={1.3} />
          <line x1={xAx} y1={yTop} x2={xAx} y2={yBase} stroke={INK} strokeWidth={0.8} />
          <text x={xAx + 5} y={yBase - 4} fontSize={7.5} fill={VERT} {...HALO}>
            M₀ = {Math.abs(shell.M0).toFixed(2)} kN·m/m · water face
          </text>
          {shell.Mspan > 1e-6 && <text x={xAx + mRight + 5} y={yBase - shell.xSpan * s + 3} fontSize={7.5} fill={VERT} {...HALO}>
            {shell.Mspan.toFixed(2)} @ {shell.xSpan.toFixed(2)} m
          </text>}
        </g>}

        {/* ── PLAN ────────────────────────────────────────────────────────── */}
        <text x={cx - rOut} y={cy - rOut - 22} fontSize={9} fontWeight={700} fill={INK}>PLAN — ring at base</text>
        <circle cx={cx} cy={cy} r={rOut} fill={CONC} stroke={INK} strokeWidth={1.4} />
        <circle cx={cx} cy={cy} r={rIn} fill={WATER} stroke={INK} strokeWidth={1.2} opacity={0.85} />
        <circle cx={cx} cy={cy} r={rMid} fill="none" stroke={HOOP} strokeWidth={2.2} />
        {/* D is the INTERNAL diameter: the dimension ends on the inner face */}
        <line x1={cx - rIn} y1={cy} x2={cx + rIn} y2={cy} stroke={DIM} strokeWidth={0.9} />
        <Tick x={cx - rIn} y={cy} /><Tick x={cx + rIn} y={cy} />
        <text x={cx} y={cy - 4} fontSize={8} fill={DIM} textAnchor="middle" {...HALO}>D = {D.toFixed(2)} m</text>
        {/* the ring tension, as it acts: TANGENTIAL, the two halves of a cut
            through the ring at its top pulled apart */}
        <line x1={cx} y1={cy - rOut - 3} x2={cx} y2={cy - rIn + 3} stroke="var(--sheet, #fff)" strokeWidth={2.4} />
        <HArrow x1={cx - 3} x2={cx - 22} y={cy - rMid} color={HOOP} />
        <HArrow x1={cx + 3} x2={cx + 22} y={cy - rMid} color={HOOP} />
        <text x={cx + 26} y={cy - rMid - 5} fontSize={8} fill={HOOP} {...HALO}>T</text>
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

        <text x={W / 2} y={HT - 29} fontSize={7.5} fill={FAINT} textAnchor="middle">
          Section to one scale; plan to its own. Pressure is triangular: T peaks at the base and falls as γw·z·D/2.
        </text>
        {shell && <text x={W / 2} y={HT - 18} fontSize={7.5} fill={FAINT} textAnchor="middle">
          M is drawn on its tension face: the fixed base bends the water face; the rings carry the rest of the pressure.
        </text>}
        <text x={W / 2} y={HT - 7} fontSize={7.5} fill={FAINT} textAnchor="middle">
          Ring steel may be reduced with height — rings are drawn closer together near the base for that reason.
        </text>
      </svg>
    </DrawingFrame>
  )
}
