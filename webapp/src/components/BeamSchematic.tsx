import type { JSX } from 'react'
import { DimBelow, DimSide } from './dims'

const STROKE = '#37526e'
const FILL = '#eef3f8'
const BAR = '#37526e'
const CENTROID = '#dc2626'

export interface BeamSchematicProps {
  b: number; h: number; cover: number; barDia: number; stirrupDia: number
  bars: number; d: number
  /** Compression-steel centroid depth d′, mm — draws its dim line + cross when set. */
  dPrime?: number
  /** Tension bars per layer, bottom first (default: one layer of `bars`). */
  layers?: number[]
  /** Compression bars per layer, top first ([] / undefined → none). */
  comprLayers?: number[]
  comprBars?: number
  comprBarDia?: number
}

/** Small thin × with dashed extension lines out to a dimension line. */
function CentroidMark({ cx, cy, toX }: { cx: number; cy: number; toX: number }) {
  const X = 3.5
  return (
    <g>
      <line x1={cx - X} y1={cy - X} x2={cx + X} y2={cy + X} stroke={CENTROID} strokeWidth={1.1} />
      <line x1={cx - X} y1={cy + X} x2={cx + X} y2={cy - X} stroke={CENTROID} strokeWidth={1.1} />
      <line x1={cx + X + 2} y1={cy} x2={toX} y2={cy} stroke={CENTROID} strokeWidth={0.7} strokeDasharray="4 3" />
    </g>
  )
}

/** Beam cross-section to scale: open stirrup with two 135° corner hooks at its
 *  real thickness, layered tension + compression bars, red × centroid marks
 *  tied to the d / d′ dimension lines with dashed extensions. */
export function BeamSchematic({
  b, h, cover, barDia, stirrupDia, bars, d, dPrime, layers, comprLayers, comprBars = 0, comprBarDia,
}: BeamSchematicProps): JSX.Element {
  const W = 330, H = 312
  const padL = 56, padT = 30, availW = 150, availH = 210
  const s = Math.min(availW / b, availH / h)
  const bw = b * s, hh = h * s
  const x0 = padL + (availW - bw) / 2, y0 = padT
  const br = Math.max(3, (barDia / 2) * s)
  const dPx = d * s

  // Stirrup centreline rectangle; stroke scaled to the actual bar thickness.
  const inset = (cover + stirrupDia / 2) * s
  const stW = Math.max(1, stirrupDia * s)
  const sx0 = x0 + inset, sy0 = y0 + inset
  const sw = bw - 2 * inset, sh = hh - 2 * inset
  const r = Math.max(2, 2 * stirrupDia * s)     // §407.3.2 bend: centreline radius ≈ 2ds
  // 135° hook: wraps the corner bar and extends into the core at 45°.
  const ext = Math.max(6 * stirrupDia, 75) * s
  const e = ext / Math.SQRT2

  // One open path: tip A → wrap top-left corner → full perimeter → wrap the
  // same corner from the left leg → tip B. Both tips point into the core at 45°.
  const stirrupPath = [
    `M ${sx0 + r * 0.9 + e} ${sy0 + r * 0.1 + e}`,                 // tip A (from the top leg)
    `L ${sx0 + r * 0.9} ${sy0 + r * 0.1}`,
    `Q ${sx0 + r * 0.45} ${sy0 - stW * 0.15} ${sx0 + r} ${sy0}`,   // wrap onto the top leg
    `L ${sx0 + sw - r} ${sy0}`,
    `Q ${sx0 + sw} ${sy0} ${sx0 + sw} ${sy0 + r}`,
    `L ${sx0 + sw} ${sy0 + sh - r}`,
    `Q ${sx0 + sw} ${sy0 + sh} ${sx0 + sw - r} ${sy0 + sh}`,
    `L ${sx0 + r} ${sy0 + sh}`,
    `Q ${sx0} ${sy0 + sh} ${sx0} ${sy0 + sh - r}`,
    `L ${sx0} ${sy0 + r}`,
    `Q ${sx0 - stW * 0.15} ${sy0 + r * 0.45} ${sx0 + r * 0.1} ${sy0 + r * 0.9}`, // wrap from the left leg
    `L ${sx0 + r * 0.1 + e} ${sy0 + r * 0.9 + e}`,                 // tip B
  ].join(' ')

  const lay = layers && layers.length > 0 ? layers : [Math.max(2, bars)]
  const n = lay.reduce((a, k) => a + k, 0)
  const x1 = x0 + (cover + stirrupDia + barDia / 2) * s
  const x2 = x0 + bw - (cover + stirrupDia + barDia / 2) * s
  const yBottom = y0 + hh - (cover + stirrupDia + barDia / 2) * s
  const pitch = (barDia + 25) * s

  const rowX = (k: number) => Array.from({ length: k }, (_, i) => (k === 1 ? (x1 + x2) / 2 : x1 + ((x2 - x1) * i) / (k - 1)))

  // Compression bars, layered downward from the top.
  const dbC = comprBarDia ?? barDia
  const brC = Math.max(3, (dbC / 2) * s)
  const cLay = comprLayers && comprLayers.length > 0 ? comprLayers : (comprBars > 0 ? [comprBars] : [])
  const nC = cLay.reduce((a, k) => a + k, 0)
  const yTop = y0 + (cover + stirrupDia + dbC / 2) * s
  const pitchC = (dbC + 25) * s

  // Dimension-line x positions on the right: d′ inner, d outer.
  const hasDP = nC > 0 && dPrime !== undefined
  const dxInner = x0 + bw + 14
  const dxOuter = x0 + bw + (hasDP ? 38 : 16)
  const cxMid = x0 + bw / 2
  const cyD = y0 + dPx
  const cyDP = hasDP ? y0 + (dPrime as number) * s : 0

  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <text x={padL} y={14} fontSize={11} fontWeight={700} fill="#0056b3">SECTION</text>

      {/* concrete */}
      <rect x={x0} y={y0} width={bw} height={hh} rx={2} fill={FILL} stroke={STROKE} strokeWidth={1.6} />

      {/* open stirrup with two 135° hooks at the top-left corner */}
      <path d={stirrupPath} fill="none" stroke={BAR} strokeWidth={stW}
        strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />

      {/* compression bars (hollow), layered downward */}
      {cLay.map((k, li) =>
        rowX(k).map((bx, i) => (
          <circle key={`c${li}-${i}`} cx={bx} cy={yTop + li * pitchC} r={brC} fill="#fff" stroke={BAR} strokeWidth={1.6} />
        )),
      )}

      {/* tension bars (solid), layered upward */}
      {lay.map((k, li) =>
        rowX(k).map((bx, i) => (
          <circle key={`t${li}-${i}`} cx={bx} cy={yBottom - li * pitch} r={br} fill={BAR} />
        )),
      )}

      {/* centroid marks with dashed ties to their dimension lines */}
      {hasDP && <CentroidMark cx={cxMid} cy={cyDP} toX={dxInner} />}
      <CentroidMark cx={cxMid} cy={cyD} toX={dxOuter} />

      {/* labels: compression on top, tension at the bottom */}
      {nC > 0 && (
        <text x={x0 + bw / 2} y={y0 - 6} fontSize={8.5} fill={BAR} textAnchor="middle">
          {nC} ⌀{dbC} mm{cLay.length > 1 ? ` (${cLay.join('+')})` : ''} top
        </text>
      )}
      <text x={x0 + bw / 2} y={y0 + hh + 12} fontSize={8.5} fill={BAR} textAnchor="middle">
        {n} ⌀{barDia} mm{lay.length > 1 ? ` (${lay.join('+')})` : ''}
      </text>

      {/* dimensions: b below, h left, d (and d′ for DRRB) right */}
      <DimBelow xA={x0} xB={x0 + bw} featY={y0 + hh + 14} dY={y0 + hh + 30} label={`b = ${Math.round(b)} mm`} />
      <DimSide yA={y0} yB={y0 + hh} featX={x0} dX={x0 - 16} label={`h = ${Math.round(h)} mm`} side="left" />
      {hasDP && (
        <DimSide yA={y0} yB={cyDP} featX={x0 + bw} dX={dxInner} label={`d' = ${Math.round(dPrime as number)}`} side="right" />
      )}
      <DimSide yA={y0} yB={cyD} featX={x0 + bw} dX={dxOuter} label={`d = ${Math.round(d)} mm`} side="right" />
    </svg>
  )
}
