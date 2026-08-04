// ─────────────────────────────────────────────────────────────────────────
// Soil profile under a footing, with the stress bulb that drives settlement.
//
// The page reports a settlement per layer and never shows the profile those
// layers form. Three things only a drawing makes obvious:
//
//   • WHERE the water table sits relative to each layer. Below it the layer
//     is buoyant, so σ′ climbs more slowly — which is why `effectiveStress`
//     subtracts pore pressure and why the same soil settles differently at
//     different depths.
//   • THAT Δσ DECAYS. The stress increase is largest just under the footing
//     and small a couple of widths down, so a thick soft layer deep in the
//     profile may contribute less than a thin one near the surface. A table
//     of per-layer settlements makes the governing layer look arbitrary; the
//     decay curve makes it obvious.
//   • WHICH layer governs — highlighted, so the number the page already
//     computes has a place on the picture.
//
// Geometry only. `engine/settlement` decides everything.
// ─────────────────────────────────────────────────────────────────────────

const INK = '#37526e'
const WATER = '#0e7490'
const STRESS = '#c2402a'
const GOV = '#b97d10'
const DIM = '#1f77b4'
const FAINT = '#a39d8d'

/** Distinct, muted fills for successive strata. Cycled, so any number of
 *  layers draws without a palette lookup failing. */
const STRATA = ['#e7e2d4', '#dfe6ec', '#e6e0e8', '#dde8de', '#eae3d8']

export interface ProfileLayer {
  name: string
  /** Depth to the top of the layer and its thickness, m. */
  zTop: number
  H: number
  /** Stress increase at mid-height, kPa — from the engine. */
  dSigma: number
  /** Effective overburden at mid-height, kPa — from the engine. */
  sigma0: number
  /** Settlement contributed, mm. */
  settlement: number
}

export interface SoilProfileProps {
  layers: ProfileLayer[]
  /** Founding depth and footing width, m. */
  Df: number
  B: number
  /** Water table depth below ground, m. Infinity = none within the profile. */
  waterTable: number
  /** Bearing pressure, kPa. */
  q: number
  /** Index of the layer contributing the most settlement, or -1. */
  governing: number
}

export function SoilProfile({ layers, Df, B, waterTable, q, governing }: SoilProfileProps) {
  const total = layers.reduce((a, l) => Math.max(a, l.zTop + l.H), 0) || 1
  const ML = 118, MR = 96, MT = 46, MB = 44
  const COL_W = 150, DEPTH = 250
  const s = DEPTH / total
  const W = ML + COL_W + MR, HT = MT + DEPTH + MB
  const zy = (z: number) => MT + z * s

  // Δσ decay plot, to the right of the strata, on its own scale.
  const dMax = Math.max(q, ...layers.map((l) => l.dSigma), 1)
  const px = (v: number) => ML + COL_W + 12 + (v / dMax) * (MR - 30)

  const fw = Math.min(COL_W * 0.8, B * s)   // footing, to the profile's scale

  return (
    <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block h-auto w-full"
      style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* strata */}
      {layers.map((l, i) => {
        const y = zy(l.zTop), hgt = l.H * s
        const gov = i === governing
        return (
          <g key={i}>
            <rect x={ML} y={y} width={COL_W} height={hgt}
              fill={STRATA[i % STRATA.length]} stroke={INK} strokeWidth={0.9} />
            {gov && <rect x={ML} y={y} width={COL_W} height={hgt} fill={GOV} opacity={0.22}
              stroke={GOV} strokeWidth={2} />}
            <text x={ML - 8} y={y + hgt / 2 - 3} fontSize={8} fill={INK} textAnchor="end">{l.name}</text>
            <text x={ML - 8} y={y + hgt / 2 + 8} fontSize={7} fill={FAINT} textAnchor="end">
              {l.H.toFixed(1)} m · {l.settlement.toFixed(1)} mm{gov ? ' ← governs' : ''}
            </text>
          </g>
        )
      })}

      {/* ground line and the footing sitting at Df */}
      <line x1={ML - 30} y1={MT} x2={ML + COL_W + 6} y2={MT} stroke={INK} strokeWidth={1.6} />
      <rect x={ML + (COL_W - fw) / 2} y={zy(Df) - 10} width={fw} height={10}
        fill={INK} opacity={0.8} />
      <text x={ML + COL_W / 2} y={zy(Df) - 14} fontSize={7.5} fill={INK} textAnchor="middle">
        q = {q.toFixed(0)} kPa
      </text>
      {/* Df sits INSIDE the profile column: outside it, on the left, it printed
          straight through the layer names. */}
      <g>
        <line x1={ML + 8} y1={MT} x2={ML + 8} y2={zy(Df)} stroke={DIM} strokeWidth={0.8} />
        {[MT, zy(Df)].map((y) => <line key={y} x1={ML + 5} y1={y} x2={ML + 11} y2={y} stroke={DIM} strokeWidth={0.9} />)}
        <text x={ML + 13} y={(MT + zy(Df)) / 2 + 3} fontSize={7.5} fill={DIM}>Df = {Df.toFixed(1)} m</text>
      </g>

      {/* water table — the reason σ′ and σ diverge below it */}
      {Number.isFinite(waterTable) && waterTable <= total && (
        <g>
          <line x1={ML - 12} y1={zy(waterTable)} x2={ML + COL_W + 6} y2={zy(waterTable)}
            stroke={WATER} strokeWidth={1.3} />
          {[0, 1, 2].map((k) => (
            <path key={k} d={`M${ML + 8 + k * 7} ${zy(waterTable) + 4} l3 -4 l3 4`}
              fill="none" stroke={WATER} strokeWidth={1} />
          ))}
          <text x={ML + COL_W + 8} y={zy(waterTable) - 3} fontSize={7.5} fill={WATER}>
            ▽ WT {waterTable.toFixed(1)} m
          </text>
        </g>
      )}

      {/* Δσ decay — the point of the whole drawing */}
      <g>
        <line x1={px(0)} y1={MT} x2={px(0)} y2={MT + DEPTH} stroke={FAINT} strokeWidth={0.8} />
        <polyline
          points={layers.map((l) => `${px(l.dSigma)},${zy(l.zTop + l.H / 2)}`).join(' ')}
          fill="none" stroke={STRESS} strokeWidth={1.6} />
        {layers.map((l, i) => (
          <g key={i}>
            <circle cx={px(l.dSigma)} cy={zy(l.zTop + l.H / 2)} r={2.2} fill={STRESS} />
            <text x={px(l.dSigma) + 5} y={zy(l.zTop + l.H / 2) + 3} fontSize={7} fill={STRESS}>
              {l.dSigma.toFixed(0)}
            </text>
          </g>
        ))}
        <text x={px(0)} y={MT - 8} fontSize={7.5} fill={STRESS}>Δσ at mid-height, kPa</text>
      </g>

      <text x={ML} y={MT - 26} fontSize={9} fontWeight={700} fill={INK}>SOIL PROFILE &amp; STRESS DECAY</text>
      <text x={W / 2} y={HT - 6} fontSize={7.5} fill={FAINT} textAnchor="middle">
Δσ is zero above founding level, peaks just under the footing, then decays — a thick deep layer can settle less than a thin shallow one.
      </text>
    </svg>
  )
}
