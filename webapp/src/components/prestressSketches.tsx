// ─────────────────────────────────────────────────────────────────────────
// Drawing for the prestressed beam calculator.
// ─────────────────────────────────────────────────────────────────────────
import { DimBelow, DimSide } from './dims'
import { udlStations } from './udl'
import { DrawingFrame } from './DrawingFrame'
import { WATER } from './hydraulicsSketches'
import { INK, MUTED } from '../lib/influenceStyle'

/** The beam in elevation on a pin and a roller, the UDL landing on its top
 *  edge and the straight tendon at e below the centroid. Depth is exaggerated
 *  against the span so the eccentricity reads; the drawing says by how much. */
export function PSElevation({ h, e, span }: { h: number; e: number; span: number }) {
  const W = 340, HT = 220
  const x0 = 46, bw = 248
  const y0 = 74, H = 56
  const yc = y0 + H / 2, yTendon = Math.min(y0 + H - 5, yc + (e / h) * H)
  const arrows = udlStations(bw).map((t) => x0 + t * bw)
  return (
    <DrawingFrame label="prestressed section">
      <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block w-full max-w-[380px]" style={{ fontFamily: 'Arial, sans-serif' }}>
        {/* UDL: top line + arrows touching the beam's top edge */}
        <line x1={x0} y1={y0 - 26} x2={x0 + bw} y2={y0 - 26} stroke={MUTED} strokeWidth="1.4" />
        {arrows.map((x) => (
          <g key={x} stroke={MUTED} strokeWidth="1.4">
            {/* The tip lands ON the top edge (y0). It used to stop at y0 − 0.5,
                which with a 1.4 stroke reads as a load floating above the beam. */}
            <line x1={x} y1={y0 - 26} x2={x} y2={y0 - 6} />
            <path d={`M${x - 3.2} ${y0 - 6} L${x} ${y0} L${x + 3.2} ${y0 - 6} z`} fill={MUTED} stroke="none" />
          </g>
        ))}
        <text x={x0 + bw / 2} y={y0 - 32} fontSize="8.5" fill={MUTED} textAnchor="middle">w (D + L)</text>
        {/* beam */}
        <rect x={x0} y={y0} width={bw} height={H} fill="rgba(15,76,146,0.08)" stroke={INK} strokeWidth="1.6" />
        <line x1={x0} y1={yc} x2={x0 + bw} y2={yc} stroke={MUTED} strokeWidth="0.8" strokeDasharray="3 4" />
        <line x1={x0} y1={yTendon} x2={x0 + bw} y2={yTendon} stroke={WATER} strokeWidth="2.2" strokeDasharray="8 4" />
        <text x={x0 + bw / 2} y={y0 + H + 12} fontSize="8.5" fontFamily="IBM Plex Mono, monospace" fill={WATER} textAnchor="middle">
          Aps · e = {e} mm below cg
        </text>
        {/* supports ON the soffit: pin (triangle apex at the beam) + roller */}
        <g stroke={INK} strokeWidth="1.4" fill="var(--sheet)">
          <path d={`M${x0 + 10} ${y0 + H} L${x0 + 1} ${y0 + H + 15} L${x0 + 19} ${y0 + H + 15} z`} />
          <line x1={x0 - 5} y1={y0 + H + 15} x2={x0 + 25} y2={y0 + H + 15} />
          <circle cx={x0 + bw - 10} cy={y0 + H + 7.5} r={7} />
          <line x1={x0 + bw - 25} y1={y0 + H + 15} x2={x0 + bw + 5} y2={y0 + H + 15} />
        </g>
        {/* dimensions (shared template) */}
        <DimBelow xA={x0} xB={x0 + bw} featY={y0 + H + 18} dY={y0 + H + 40} label={`L = ${span} m`} />
        <DimSide yA={y0} yB={y0 + H} featX={x0 + bw} dX={x0 + bw + 20} label={`h = ${h} mm`} side="right" />
        <DimSide yA={yc} yB={yTendon} featX={x0} dX={x0 - 18} label={`e`} side="left" />
        <text x={x0} y={HT - 6} fontSize="8" fill={MUTED} fontFamily="IBM Plex Mono, monospace">depth exaggerated ×{((H / Math.max(h, 1)) / (bw / Math.max(span * 1000, 1))).toFixed(1)}</text>
      </svg>
    </DrawingFrame>
  )
}

