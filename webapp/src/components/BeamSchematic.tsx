import type { JSX } from 'react'
import { DimBelow, DimSide } from './dims'

const STROKE = '#37526e'
const FILL = '#eef3f8'
const BAR = '#37526e'
const CENTROID = '#dc2626'

export interface BeamSchematicProps {
  b: number; h: number; cover: number; barDia: number; stirrupDia: number
  bars: number; d: number
  /** Tension bars per layer, bottom first (default: one layer of `bars`). */
  layers?: number[]
  /** Compression bars per layer, top first ([] / undefined → none). */
  comprLayers?: number[]
  comprBars?: number
  comprBarDia?: number
}

/** Beam cross-section to scale: stirrup drawn at its real thickness with 135°
 *  hooks, layered tension + compression bars, and a red × on the
 *  tension-steel centroid (where d is measured). */
export function BeamSchematic({
  b, h, cover, barDia, stirrupDia, bars, d, layers, comprLayers, comprBars = 0, comprBarDia,
}: BeamSchematicProps): JSX.Element {
  const W = 320, H = 312
  const padL = 60, padT = 30, availW = 150, availH = 210
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
  const bendR = (2 * stirrupDia) * s            // §407.3.2: inside bend 4ds → centreline radius ≈ 2ds
  // 135° hooks: from the top corners, into the core at 45°, length max(6ds,75).
  const hookLen = Math.max(6 * stirrupDia, 75) * s
  const hk = hookLen / Math.SQRT2

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

  // Tension-steel centroid (where d is measured) — red ×.
  const cxMid = x0 + bw / 2
  const cyD = y0 + dPx
  const X = 6

  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <text x={padL} y={14} fontSize={11} fontWeight={700} fill="#0056b3">SECTION</text>

      {/* concrete */}
      <rect x={x0} y={y0} width={bw} height={hh} rx={2} fill={FILL} stroke={STROKE} strokeWidth={1.6} />

      {/* stirrup at real thickness, rounded bends */}
      <rect x={sx0} y={sy0} width={sw} height={sh} rx={bendR}
        fill="none" stroke={BAR} strokeWidth={stW} opacity={0.85} />
      {/* 135° hooks into the core from the top-left corner pair */}
      <line x1={sx0 + bendR * 0.3} y1={sy0 + bendR * 0.3} x2={sx0 + bendR * 0.3 + hk} y2={sy0 + bendR * 0.3 + hk}
        stroke={BAR} strokeWidth={stW} strokeLinecap="round" opacity={0.85} />
      <line x1={sx0 + bendR * 1.1} y1={sy0 - stW * 0.1} x2={sx0 + bendR * 1.1 + hk * 0.55} y2={sy0 + hk * 0.95}
        stroke={BAR} strokeWidth={stW} strokeLinecap="round" opacity={0.85} />

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

      {/* red × at the tension-steel centroid */}
      <line x1={cxMid - X} y1={cyD - X} x2={cxMid + X} y2={cyD + X} stroke={CENTROID} strokeWidth={1.8} />
      <line x1={cxMid - X} y1={cyD + X} x2={cxMid + X} y2={cyD - X} stroke={CENTROID} strokeWidth={1.8} />

      {/* labels: compression on top, tension at the bottom */}
      {nC > 0 && (
        <text x={x0 + bw / 2} y={y0 - 6} fontSize={8.5} fill={BAR} textAnchor="middle">
          {nC} ⌀{dbC} mm{cLay.length > 1 ? ` (${cLay.join('+')})` : ''} top
        </text>
      )}
      <text x={x0 + bw / 2} y={y0 + hh + 12} fontSize={8.5} fill={BAR} textAnchor="middle">
        {n} ⌀{barDia} mm{lay.length > 1 ? ` (${lay.join('+')})` : ''}
      </text>

      {/* dimensions: b below, h left, d right (to the red centroid) */}
      <DimBelow xA={x0} xB={x0 + bw} featY={y0 + hh + 14} dY={y0 + hh + 30} label={`b = ${Math.round(b)} mm`} />
      <DimSide yA={y0} yB={y0 + hh} featX={x0} dX={x0 - 16} label={`h = ${Math.round(h)} mm`} side="left" />
      <DimSide yA={y0} yB={cyD} featX={x0 + bw} dX={x0 + bw + 16} label={`d = ${Math.round(d)} mm`} side="right" />
    </svg>
  )
}
