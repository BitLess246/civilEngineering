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
//     one in every corner and at most 300 mm apart (§22.7.6.1). Torsion is
//     carried by the shell, so bunching them into the tension face — the
//     flexural instinct — does not work here.
//
// Geometry only. `engine/torsionDesign` decides everything.
// ─────────────────────────────────────────────────────────────────────────

const INK = '#37526e'
const CONC = '#eef3f8'
const STIRRUP = '#c2402a'
const LONG = '#0f4c92'
const FLOW = '#0e7490'
const DIM = '#1f77b4'
const FAINT = '#a39d8d'

/** §22.7.6.1 — longitudinal torsional bars at most this far apart. */
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
  const ML = 62, MR = 150, MT = 34, MB = 62
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
  const bars: [number, number][] = [
    [sx, sy], [sx + sw, sy], [sx, sy + sh], [sx + sw, sy + sh],
  ]
  for (let i = 1; i <= nx; i++) {
    const x = sx + (sw * i) / (nx + 1)
    bars.push([x, sy], [x, sy + sh])
  }
  for (let i = 1; i <= ny; i++) {
    const y = sy + (sh * i) / (ny + 1)
    bars.push([sx, y], [sx + sw, y])
  }
  const br = Math.max(2.4, (barDia / 2) * s)

  return (
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
          whole of §22.7 turns on */}
      <g>
        <line x1={sx} y1={y0 + hh + 18} x2={sx + sw} y2={y0 + hh + 18} stroke={DIM} strokeWidth={0.9} />
        {[sx, sx + sw].map((x) => (
          <line key={x} x1={x - 4} y1={y0 + hh + 22} x2={x + 4} y2={y0 + hh + 14} stroke={DIM} strokeWidth={1.2} />
        ))}
        <text x={sx + sw / 2} y={y0 + hh + 14} fontSize={8.5} fill={DIM} textAnchor="middle"
          paintOrder="stroke" stroke="#fff" strokeWidth={2.6}>x₁ = {Math.round(x1)}</text>

        <line x1={x0 - 18} y1={sy} x2={x0 - 18} y2={sy + sh} stroke={DIM} strokeWidth={0.9} />
        {[sy, sy + sh].map((y) => (
          <line key={y} x1={x0 - 22} y1={y + 4} x2={x0 - 14} y2={y - 4} stroke={DIM} strokeWidth={1.2} />
        ))}
        <text x={x0 - 28} y={sy + sh / 2} fontSize={8.5} fill={DIM} textAnchor="middle"
          transform={`rotate(-90 ${x0 - 28} ${sy + sh / 2})`}
          paintOrder="stroke" stroke="#fff" strokeWidth={2.6}>y₁ = {Math.round(y1)}</text>

        <text x={x0 + bw / 2} y={y0 - 9} fontSize={8} fill={FAINT} textAnchor="middle">
          {Math.round(b)} × {Math.round(h)} gross
        </text>
      </g>

      {/* the symbols, spelled out beside the section */}
      <g fontSize={8.5}>
        <rect x={W - MR + 4} y={MT + 2} width={11} height={8} fill={STIRRUP} opacity={0.25}
          stroke={STIRRUP} strokeWidth={1.1} />
        <text x={W - MR + 22} y={MT + 10} fill={STIRRUP}>Aoh = {Math.round(Aoh).toLocaleString()} mm²</text>
        <text x={W - MR + 22} y={MT + 23} fill={STIRRUP}>ph = {Math.round(ph).toLocaleString()} mm</text>
        <line x1={W - MR + 4} y1={MT + 36} x2={W - MR + 15} y2={MT + 36} stroke={FLOW}
          strokeWidth={1.1} strokeDasharray="4 2" />
        <text x={W - MR + 22} y={MT + 39} fill={FLOW}>Ao = 0.85·Aoh</text>
        <text x={W - MR + 22} y={MT + 52} fill={FLOW}>= {Math.round(Ao).toLocaleString()} mm²</text>
        <circle cx={W - MR + 9} cy={MT + 63} r={3} fill={LONG} />
        <text x={W - MR + 22} y={MT + 66} fill={LONG}>Al = {Math.round(Al).toLocaleString()} mm²</text>
        <text x={W - MR + 22} y={MT + 79} fill={LONG}>{bars.length} bars, s ≤ {LONG_BAR_MAX_SPACING} mm</text>
        {stirrupNote && <text x={W - MR + 4} y={MT + 96} fill={STIRRUP}>{stirrupNote}</text>}
      </g>

      <text x={W / 2} y={HT - 18} fontSize={7.5} fill={FAINT} textAnchor="middle">
        §22.7 treats the section as a thin-walled TUBE — only the shell inside the closed stirrup carries torque.
      </text>
      <text x={W / 2} y={HT - 7} fontSize={7.5} fill={FAINT} textAnchor="middle">
x₁, y₁ are stirrup CENTRELINE dimensions · Al is spread around ph, not bunched in the tension face.
      </text>
    </svg>
  )
}
