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
  /** Neutral-axis depth c (mm) — used to cap drawn bars when the layout diverges. */
  naDepth?: number
  /** When false the section can't fit the steel: bars are clipped at the NA and
   *  an explicit warning is drawn. */
  flexOK?: boolean
  /** Hogging (−Mu): the whole arrangement mirrors — tension steel at the TOP,
   *  compression at the bottom, d measured from the bottom (compression) face. */
  hogging?: boolean
}

/** Thin + mark with a dashed extension line out to a dimension line. */
function CentroidMark({ cx, cy, toX }: { cx: number; cy: number; toX: number }) {
  const A = 4
  return (
    <g stroke={CENTROID} strokeWidth={0.7}>
      <line x1={cx - A} y1={cy} x2={cx + A} y2={cy} />
      <line x1={cx} y1={cy - A} x2={cx} y2={cy + A} />
      <line x1={cx + A + 2} y1={cy} x2={toX} y2={cy} strokeDasharray="4 3" />
    </g>
  )
}

/** Beam cross-section to scale: stirrup with 135° hooks that bend smoothly
 *  around the corner bar at the D_bend radius, layered bars (clipped at the
 *  NA when the section is over-full), and thin + centroid marks tied to the
 *  d / d′ dimension lines. */
export function BeamSchematic({
  b, h, cover, barDia, stirrupDia, bars, d, dPrime, layers, comprLayers,
  comprBars = 0, comprBarDia, naDepth = 0, flexOK = true, hogging = false,
}: BeamSchematicProps): JSX.Element {
  const W = 330, H = 322
  const padL = 90, padT = 18, availW = 150, availH = 220
  const s = Math.min(availW / b, availH / h)
  const bw = b * s, hh = h * s
  const x0 = padL + (availW - bw) / 2, y0 = padT
  const br = Math.max(3, (barDia / 2) * s)
  const dPx = d * s

  // Stirrup centreline; stroke scaled to the actual bar thickness. The bend
  // radius is the §407.3.2 D_bend centreline: inside Ø 4ds → r = (4/2 + 1/2)ds.
  const inset = (cover + stirrupDia / 2) * s
  const stW = Math.max(1, stirrupDia * s)
  const sx0 = x0 + inset, sy0 = y0 + inset
  const sw = bw - 2 * inset, sh = hh - 2 * inset
  const r = Math.max(3, 2.5 * stirrupDia * s)
  const ext = Math.max(6 * stirrupDia, 75) * s
  const e = ext / Math.SQRT2

  // 135° hooks around the top-left corner bar (centre O, radius r = D_bend).
  // Hook 1 comes off the TOP leg: arc T(12:00) → L(9:00) → E1(7:30), then a
  // straight 45° extension into the core. Hook 2 comes off the LEFT leg:
  // arc L(9:00) → T(12:00) → E2(1:30), extension parallel to hook 1's.
  const Ox = sx0 + r, Oy = sy0 + r
  const k = Math.SQRT1_2 * r
  const T = { x: Ox, y: Oy - r }
  const L = { x: Ox - r, y: Oy }
  const E1 = { x: Ox - k, y: Oy + k }
  const E2 = { x: Ox + k, y: Oy - k }
  const hook1 = `M ${T.x} ${T.y} A ${r} ${r} 0 0 0 ${E1.x} ${E1.y} L ${E1.x + e} ${E1.y + e}`
  const hook2 = `M ${L.x} ${L.y} A ${r} ${r} 0 0 1 ${E2.x} ${E2.y} L ${E2.x + e} ${E2.y + e}`

  const lay = layers && layers.length > 0 ? layers : [Math.max(2, bars)]
  const n = lay.reduce((a, q) => a + q, 0)
  const x1 = x0 + (cover + stirrupDia + barDia / 2) * s
  const x2 = x0 + bw - (cover + stirrupDia + barDia / 2) * s
  const pitch = (barDia + 25) * s

  const rowX = (q: number) => Array.from({ length: q }, (_, i) => (q === 1 ? (x1 + x2) / 2 : x1 + ((x2 - x1) * i) / (q - 1)))

  const dbC = comprBarDia ?? barDia
  const brC = Math.max(3, (dbC / 2) * s)
  const cLay = comprLayers && comprLayers.length > 0 ? comprLayers : (comprBars > 0 ? [comprBars] : [])
  const nC = cLay.reduce((a, q) => a + q, 0)
  const pitchC = (dbC + 25) * s

  // Hogging mirrors everything: tension anchors at the TOP and stacks down,
  // compression anchors at the bottom and stacks up; depths measure from the
  // compression face (bottom).
  const sgn = hogging ? -1 : 1
  const yTen = hogging
    ? y0 + (cover + stirrupDia + barDia / 2) * s
    : y0 + hh - (cover + stirrupDia + barDia / 2) * s
  const yCom = hogging
    ? y0 + hh - (cover + stirrupDia + dbC / 2) * s
    : y0 + (cover + stirrupDia + dbC / 2) * s
  const tenY = (li: number) => yTen - sgn * li * pitch          // toward mid-depth
  const comY = (li: number) => yCom + sgn * li * pitchC

  // When the layout diverges, clip the drawing at the neutral axis (measured
  // from the compression face): tension layers stay on their side, compression
  // layers on theirs.
  const yNA = naDepth > 0
    ? (hogging ? y0 + hh - naDepth * s : y0 + naDepth * s)
    : (hogging ? sy0 + sh - r : sy0 + r)
  const maxTen = flexOK ? lay.length : Math.max(1, Math.floor((Math.abs(yTen - yNA) - br) / pitch) + 1)
  const maxCom = flexOK ? cLay.length : Math.max(nC > 0 ? 1 : 0, Math.floor((Math.abs(yNA - yCom) - brC) / pitchC) + 1)
  const layDrawn = lay.slice(0, maxTen)
  const cLayDrawn = cLay.slice(0, maxCom)

  const hasDP = nC > 0 && dPrime !== undefined
  const dxInner = x0 + bw + 14
  const dxOuter = x0 + bw + (hasDP ? 38 : 16)
  const cxMid = x0 + bw / 2
  const cyD = hogging ? y0 + hh - dPx : y0 + dPx
  const cyDP = hasDP ? (hogging ? y0 + hh - (dPrime as number) * s : y0 + (dPrime as number) * s) : 0

  const tenLabel = lay.length > 3
    ? `${n} ⌀${barDia} mm — ${lay.length} layers`
    : `${n} ⌀${barDia} mm${lay.length > 1 ? ` (${lay.join('+')})` : ''}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      {/* concrete */}
      <rect x={x0} y={y0} width={bw} height={hh} rx={2} fill={FILL} stroke={STROKE} strokeWidth={1.6} />

      {/* stirrup body + the two 135° corner hooks (smooth D_bend arcs) */}
      <rect x={sx0} y={sy0} width={sw} height={sh} rx={r}
        fill="none" stroke={BAR} strokeWidth={stW} opacity={0.8} />
      <path d={hook1} fill="none" stroke={BAR} strokeWidth={stW} strokeLinecap="round" opacity={0.8} />
      <path d={hook2} fill="none" stroke={BAR} strokeWidth={stW} strokeLinecap="round" opacity={0.8} />

      {/* compression bars (hollow), stacking away from their face */}
      {cLayDrawn.map((q, li) =>
        rowX(q).map((bx, i) => (
          <circle key={`c${li}-${i}`} cx={bx} cy={comY(li)} r={brC} fill="#fff" stroke={BAR} strokeWidth={1.6} />
        )),
      )}

      {/* tension bars (solid), stacking toward mid-depth */}
      {layDrawn.map((q, li) =>
        rowX(q).map((bx, i) => (
          <circle key={`t${li}-${i}`} cx={bx} cy={tenY(li)} r={br} fill={BAR} />
        )),
      )}

      {/* over-full section: NA line + explicit warning */}
      {!flexOK && (
        <g>
          <line x1={x0 - 4} y1={yNA} x2={x0 + bw + 4} y2={yNA} stroke={CENTROID} strokeWidth={0.8} strokeDasharray="6 4" />
          <text x={x0 + bw - 4} y={yNA - 4} fontSize={8} fill={CENTROID} textAnchor="end">N.A.</text>
          <text x={x0 + bw / 2} y={y0 + hh / 2} fontSize={9.5} fontWeight={700} fill={CENTROID} textAnchor="middle"
            paintOrder="stroke" stroke="#fff" strokeWidth={3}>
            ⚠ n = {bars} bars cannot fit in the section
          </text>
        </g>
      )}

      {/* centroid marks with dashed ties to their dimension lines */}
      {hasDP && <CentroidMark cx={cxMid} cy={cyDP} toX={dxInner} />}
      <CentroidMark cx={cxMid} cy={cyD} toX={dxOuter} />

      {/* labels: each group labelled at its own face */}
      {nC > 0 && (
        <text x={x0 + bw / 2} y={hogging ? y0 + hh + 12 : y0 - 6} fontSize={8.5} fill={BAR} textAnchor="middle">
          {nC} ⌀{dbC} mm{cLay.length > 1 ? (cLay.length > 3 ? ` — ${cLay.length} layers` : ` (${cLay.join('+')})`) : ''}{hogging ? ' bottom' : ' top'}
        </text>
      )}
      <text x={x0 + bw / 2} y={hogging ? y0 - 6 : y0 + hh + 12} fontSize={8.5} fill={BAR} textAnchor="middle">
        {tenLabel}{hogging ? ' top' : ''}
      </text>

      {/* dimensions: b below, h left, d (and d′ for DRRB) right — measured
          from the compression face (top for sagging, bottom for hogging) */}
      <DimBelow xA={x0} xB={x0 + bw} featY={y0 + hh + 14} dY={y0 + hh + 30} label={`b = ${Math.round(b)} mm`} />
      <DimSide yA={y0} yB={y0 + hh} featX={x0} dX={x0 - 16} label={`h = ${Math.round(h)} mm`} side="left" />
      {hasDP && (
        <DimSide yA={hogging ? cyDP : y0} yB={hogging ? y0 + hh : cyDP} featX={x0 + bw} dX={dxInner}
          label={`d' = ${Math.round(dPrime as number)} mm`} side="right" />
      )}
      <DimSide yA={hogging ? cyD : y0} yB={hogging ? y0 + hh : cyD} featX={x0 + bw} dX={dxOuter}
        label={`d = ${Math.round(d)} mm`} side="right" />
    </svg>
  )
}
