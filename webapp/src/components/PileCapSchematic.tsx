import type { JSX } from 'react'
import type { PileCoord } from '../engine/pileCap'
import { DimBelow, DimSide } from './dims'

const BLUE  = '#0056b3'
const STEEL = '#37526e'
const FILL  = '#eef3f8'
const CRACK = '#c2402a'

// Piles and the column are drawn as LINE WORK, not as filled shapes.
//
// A pile in a cap plan is BELOW the cap — you are looking at it through
// concrete — so a broken line is the drafting convention and a solid disc is
// simply wrong. The column is above the cut, so it is an outline. Filling
// either one also fought the crack paths for attention, and the cracks are the
// thing an engineer needs to see.

interface Props {
  capBx: number        // mm
  capBy: number        // mm
  coords: PileCoord[]  // pile centres from cap centre, mm
  pileDia: number      // mm
  colX: number         // mm
  colY: number         // mm
  reactions: number[]  // service, kN
  /** Effective depth, mm — sets where the punching cone is drawn (d/2 from
   *  the column face). Optional so existing callers keep working; the cone is
   *  omitted rather than guessed when it is not supplied. */
  d?: number
}

/** Top-view (plan) schematic of the pile cap with pile reactions. */
export function PileCapSchematic({ capBx, capBy, coords, pileDia, colX, colY, reactions, d }: Props): JSX.Element {
  const W = 320
  const PAD = 40
  const availW = W - 2 * PAD
  const availH = 220

  // Scale to fit cap in the available area
  const s = Math.min(availW / capBx, availH / capBy)

  // Cap corners in SVG coords (cap centre → SVG centre)
  const cx = W / 2
  const cy = availH / 2 + PAD / 2
  const cW = capBx * s
  const cH = capBy * s
  const capX = cx - cW / 2
  const capY = cy - cH / 2

  // Column rectangle
  const colW = colX * s
  const colH = colY * s

  // Pile radius in pixels
  const pr = Math.max(4, pileDia * s / 2)

  // Punching cone at d/2 from the column face — the same critical section
  // the punching check uses. Omitted when d is not supplied.
  const punchOff = d && d > 0 ? (d / 2) * s : 0

  return (
    <svg viewBox={`0 0 ${W} ${availH + PAD + 46}`} xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>

      {/* Title */}
      <text x={14} y={16} fontSize={11} fontWeight={700} fill={BLUE}>PLAN (top view)</text>

      {/* Cap outline */}
      <rect x={capX} y={capY} width={cW} height={cH} rx={2}
        fill={FILL} stroke={STEEL} strokeWidth={1.4} />

      {/* Piles */}
      {coords.map((p, i) => {
        const px = cx + p.x * s
        const py = cy - p.y * s  // SVG y-down → invert y
        // The reaction is carried by the LABEL, not by a fill: a shade of blue
        // cannot be read back as a number, and the number is printed anyway.
        return (
          <g key={i}>
            <circle cx={px} cy={py} r={pr} fill="none" stroke={BLUE} strokeWidth={1.3}
              strokeDasharray="5 3" />
            <text x={px} y={py + pr + 9} fontSize={8} fill={STEEL} textAnchor="middle"
              paintOrder="stroke" stroke="#fff" strokeWidth={2}>
              {reactions[i].toFixed(0)} kN
            </text>
          </g>
        )
      })}

      {/* Column — outline only. It is above the cut, and a solid block hid the
          cracks that radiate from its face. */}
      <rect x={cx - colW / 2} y={cy - colH / 2} width={colW} height={colH}
        fill="none" stroke={STEEL} strokeWidth={1.6} />

      {/* ── Likely cracking ──────────────────────────────────────────────
          Two mechanisms, both starting at the column and both what the cap's
          reinforcement is there to control:

          • FLEXURAL cracks on the underside, running between the column face
            and each pile — the cap spans as a deep member from the column out
            to the pile heads, so the tension face cracks along those lines.
            This is why the main mat runs pile-to-pile rather than uniformly.
          • A PUNCHING cone around the column, drawn at d/2 from its face — the
            same critical section the punching check uses.

          Drawn faint and dashed: these are expected crack PATHS, not a
          prediction that the cap has failed. */}
      <g stroke={CRACK} strokeWidth={1.1} strokeDasharray="4 3" fill="none" opacity={0.85}>
        {coords.map((p, i) => {
          const px = cx + p.x * s, py = cy - p.y * s
          // Start at the column face on the line to the pile, not at its centre.
          const dx = px - cx, dy = py - cy
          const len = Math.hypot(dx, dy) || 1
          const tx = Math.min(colW / 2 / Math.abs(dx || 1e-9), colH / 2 / Math.abs(dy || 1e-9))
          const fx = cx + dx * Math.min(tx, 1), fy = cy + dy * Math.min(tx, 1)
          return <line key={`ck${i}`} x1={fx} y1={fy} x2={px - (dx / len) * pr} y2={py - (dy / len) * pr} />
        })}
        <rect x={cx - colW / 2 - punchOff} y={cy - colH / 2 - punchOff}
          width={colW + 2 * punchOff} height={colH + 2 * punchOff} />
      </g>
      <text x={14} y={capY + cH + 56} fontSize={8} fill={CRACK}>
        ┄ likely cracking: flexural, column face → pile · punching cone at d/2
      </text>

      {/* Dimensions: Bx below, By right, pile spacing between the first pile pair */}
      <DimBelow xA={capX} xB={capX + cW} featY={capY + cH} dY={capY + cH + 16}
        label={`Bx = ${(capBx / 1000).toFixed(2)} m`} />
      <DimSide yA={capY} yB={capY + cH} featX={capX + cW} dX={capX + cW + 14}
        label={`By = ${(capBy / 1000).toFixed(2)} m`} side="right" />

      {/* N-piles label */}
      <text x={14} y={capY + cH + 44} fontSize={9.5} fill={STEEL}>
        {coords.length}-pile cap · pile ⌀{pileDia} mm
      </text>
    </svg>
  )
}
