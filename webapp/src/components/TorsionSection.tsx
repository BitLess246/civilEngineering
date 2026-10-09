// ─────────────────────────────────────────────────────────────────────────
// Torsion section — the thin-walled tube the design is actually about.
//
// ACI 318-14 §22.7 treats a solid section in torsion as a HOLLOW TUBE: only
// the outer shell, bounded by the closed stirrup, is assumed to carry the
// torque. Every symbol on the page comes off that idea, and none of it is
// visible in a table of numbers:
//
//   • Aoh is the area enclosed by the stirrup CENTRELINE — x₁ × y₁ — not the
//     gross section, and not the area inside the stirrup's inner face.
//   • ph is that centreline's perimeter, which is what sets both the
//     longitudinal steel Al = (At/s)·ph·(fyt/fy) and the spacing cap ph/8.
//   • Ao = 0.85·Aoh is the shear-flow path, drawn inside Aoh.
//   • The longitudinal torsional bars are DISTRIBUTED around that perimeter,
//     one in every corner and at most 300 mm apart (§9.7.5.1). Torsion is
//     carried by the shell, so bunching them into the tension face — the
//     flexural instinct — does not work here.
//
// Geometry only. `engine/torsionDesign` decides everything.
// ─────────────────────────────────────────────────────────────────────────

import { DrawingFrame } from './DrawingFrame'
import { DimBelow, DimSide } from './dims'

const INK = '#37526e'
const CONC = '#eef3f8'
const STIRRUP = '#c2402a'
const LONG = '#0f4c92'
const FLOW = '#0e7490'
const FAINT = '#a39d8d'

/** ACI 318-14 §9.7.5.1 — longitudinal torsional bars at most this far apart. */
const LONG_BAR_MAX_SPACING = 300

export interface TorsionSectionProps {
  /** Gross section, mm. */
  b: number
  h: number
  /** Stirrup centreline dimensions, from the engine. */
  x1: number
  y1: number
  barDia: number
  stirrupDia: number
  /** Callouts, taken from the engine rather than recomputed here. */
  Aoh: number
  ph: number
  Ao: number
  Al: number
  stirrupNote?: string
}

export function TorsionSection({
  b, h, x1, y1, barDia, stirrupDia, Aoh, ph, Ao, Al, stirrupNote,
}: TorsionSectionProps) {
  const ML = 62, MR = 184, MT = 40, MB = 62
  const DRAW = 210
  const s = Math.min(DRAW / Math.max(b, 1), DRAW / Math.max(h, 1))
  const bw = b * s, hh = h * s
  const col = Math.max(bw, 120)
  const W = ML + col + MR, HT = MT + hh + MB
  const x0 = ML + (col - bw) / 2, y0 = MT

  // Stirrup centreline, centred in the section.
  const sx = x0 + (bw - x1 * s) / 2, sy = y0 + (hh - y1 * s) / 2
  const sw = x1 * s, sh = y1 * s

  // Shear-flow path: Ao = 0.85·Aoh, so the equivalent tube centreline sits
  // inside the stirrup by √0.85 on each dimension.
  const k = Math.sqrt(Math.max(0, Math.min(1, Ao / Math.max(Aoh, 1e-9))))
  const fw = sw * k, fh = sh * k
  const fx = sx + (sw - fw) / 2, fy = sy + (sh - fh) / 2

  // Longitudinal bars around the stirrup perimeter: the four corners always,
  // then enough intermediates that no gap exceeds 300 mm.
  const nx = Math.max(0, Math.ceil(x1 / LONG_BAR_MAX_SPACING) - 1)
  const ny = Math.max(0, Math.ceil(y1 / LONG_BAR_MAX_SPACING) - 1)
  // Bars sit INSIDE the stirrup, their centres (ds + db)/2 in from its
  // centreline — drawn on the centreline they overlapped the stirrup.
  const inset = ((stirrupDia + barDia) / 2) * s
  const bx0 = sx + inset, bx1 = sx + sw - inset, by0 = sy + inset, by1 = sy + sh - inset
  const bars: [number, number][] = [
    [bx0, by0], [bx1, by0], [bx0, by1], [bx1, by1],
  ]
  for (let i = 1; i <= nx; i++) {
    const x = bx0 + ((bx1 - bx0) * i) / (nx + 1)
    bars.push([x, by0], [x, by1])
  }
  for (let i = 1; i <= ny; i++) {
    const y = by0 + ((by1 - by0) * i) / (ny + 1)
    bars.push([bx0, y], [bx1, y])
  }
  const br = Math.max(2.4, (barDia / 2) * s)

  return (
    <DrawingFrame label="torsion section">
      <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block h-auto w-full"
        style={{ fontFamily: 'Arial, sans-serif' }}>
        <rect x={x0} y={y0} width={bw} height={hh} fill={CONC} stroke={INK} strokeWidth={1.6} />

        {/* Aoh — the area enclosed by the stirrup CENTRELINE */}
        <rect x={sx} y={sy} width={sw} height={sh} fill={STIRRUP} opacity={0.07} />
        <rect x={sx} y={sy} width={sw} height={sh} rx={Math.max(2, 2 * stirrupDia * s)}
          fill="none" stroke={STIRRUP} strokeWidth={Math.max(1.4, stirrupDia * s)} />

        {/* Ao = 0.85·Aoh — the shear-flow path inside it, with the circulation */}
        <rect x={fx} y={fy} width={fw} height={fh} fill="none" stroke={FLOW}
          strokeWidth={1.1} strokeDasharray="5 3" />
        {([[fx + fw / 2, fy, 1, 0], [fx + fw, fy + fh / 2, 0, 1],
           [fx + fw / 2, fy + fh, -1, 0], [fx, fy + fh / 2, 0, -1]] as const).map(([px, py, dx, dy], i) => (
          <path key={i}
            d={`M${px - dx * 8} ${py - dy * 8} L${px + dx * 8} ${py + dy * 8}`
              + ` M${px + dx * 8} ${py + dy * 8} l${-dx * 4 - dy * 3} ${-dy * 4 + dx * 3}`
              + ` M${px + dx * 8} ${py + dy * 8} l${-dx * 4 + dy * 3} ${-dy * 4 - dx * 3}`}
            stroke={FLOW} strokeWidth={1.3} fill="none" strokeLinecap="round" />
        ))}

        {/* longitudinal torsional steel, distributed around the perimeter */}
        {bars.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={br} fill={LONG} />)}

        {/* x₁ and y₁ are stirrup-CENTRELINE dimensions — the distinction the
            whole of §22.7 turns on — so their extension lines leave the
            stirrup's centreline corners, not the concrete face */}
        <g>
          <DimBelow xA={sx} xB={sx + sw} featY={sy + sh} dY={y0 + hh + 20} label={`x₁ = ${Math.round(x1)}`} />
          <DimSide yA={sy} yB={sy + sh} featX={sx} dX={x0 - 20} label={`y₁ = ${Math.round(y1)}`} side="left" />
          {/* the gross section, dimensioned off its own faces */}
          <DimBelow xA={x0} xB={x0 + bw} featY={y0 - 8} dY={y0 - 20} label={`b = ${Math.round(b)}`} />
          <DimSide yA={y0} yB={y0 + hh} featX={x0 + bw} dX={x0 + bw + 18} label={`h = ${Math.round(h)}`} side="right" />
        </g>

        {/* the symbols, spelled out beside the section */}
        <g fontSize={8.5}>
          <rect x={W - MR + 38} y={MT + 2} width={11} height={8} fill={STIRRUP} opacity={0.25}
            stroke={STIRRUP} strokeWidth={1.1} />
          <text x={W - MR + 56} y={MT + 10} fill={STIRRUP}>Aoh = {Math.round(Aoh).toLocaleString()} mm²</text>
          <text x={W - MR + 56} y={MT + 23} fill={STIRRUP}>ph = {Math.round(ph).toLocaleString()} mm</text>
          <line x1={W - MR + 38} y1={MT + 36} x2={W - MR + 49} y2={MT + 36} stroke={FLOW}
            strokeWidth={1.1} strokeDasharray="4 2" />
          <text x={W - MR + 56} y={MT + 39} fill={FLOW}>Ao = 0.85·Aoh</text>
          <text x={W - MR + 56} y={MT + 52} fill={FLOW}>= {Math.round(Ao).toLocaleString()} mm²</text>
          <circle cx={W - MR + 43} cy={MT + 63} r={3} fill={LONG} />
          <text x={W - MR + 56} y={MT + 66} fill={LONG}>Al = {Math.round(Al).toLocaleString()} mm²</text>
          <text x={W - MR + 56} y={MT + 79} fill={LONG}>{bars.length} bars, s ≤ {LONG_BAR_MAX_SPACING} mm</text>
          {stirrupNote && <text x={W - MR + 38} y={MT + 96} fill={STIRRUP}>{stirrupNote}</text>}
        </g>

        <text x={W / 2} y={HT - 18} fontSize={7.5} fill={FAINT} textAnchor="middle">
          §22.7 treats the section as a thin-walled TUBE — only the shell inside the closed stirrup carries torque.
        </text>
        <text x={W / 2} y={HT - 7} fontSize={7.5} fill={FAINT} textAnchor="middle">
  x₁, y₁ are stirrup CENTRELINE dimensions · Al is spread around ph, not bunched in the tension face.
        </text>
      </svg>
    </DrawingFrame>
  )
}
