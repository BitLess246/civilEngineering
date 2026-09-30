import { DrawingFrame } from './DrawingFrame'
import { curveLayout, CURVE_W, CURVE_H, CURVE_MIN_FONT, type CurvePoint } from '../lib/capacityCurve'

/**
 * Base shear vs control-node displacement, sized to the Model Space side panel
 * (see `lib/capacityCurve`). A red point marks where a hinge forms or yields.
 */
export function CapacityCurveChart({ points, label }: { points: CurvePoint[]; label: string }) {
  const g = curveLayout(points)
  const midY = (g.y0 + g.y1) / 2
  return (
    <DrawingFrame label={label}>
      <svg viewBox={`0 0 ${CURVE_W} ${CURVE_H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
        <line x1={g.x0} y1={g.y0} x2={g.x1} y2={g.y0} stroke="#475569" strokeWidth={1.2} />
        <line x1={g.x0} y1={g.y0} x2={g.x0} y2={g.y1} stroke="#475569" strokeWidth={1.2} />
        {g.yTicks.map((t, k) => (
          <g key={`y${k}`}>
            <line x1={g.x0} y1={t.y} x2={g.x1} y2={t.y} stroke="#e2e8f0" strokeWidth={0.8} />
            <text x={g.x0 - 5} y={t.y + 3} fontSize={CURVE_MIN_FONT} fill="#64748b" textAnchor="end">{t.label}</text>
          </g>
        ))}
        {g.xTicks.map((t, k) => (
          // the last tick sits on the right edge of the plot: anchored there, not centred past it
          <text key={`x${k}`} x={t.x} y={g.y0 + 13} fontSize={CURVE_MIN_FONT} fill="#64748b"
            textAnchor={k === 0 ? 'start' : k === g.xTicks.length - 1 ? 'end' : 'middle'}>{t.label}</text>
        ))}
        <polyline points={g.polyline} fill="none" stroke="#0056b3" strokeWidth={2} />
        {g.points.map((p, i) => (
          <circle key={i} cx={p.cx} cy={p.cy} r={i === 0 ? 2.2 : 2.6} fill={p.hot ? '#dc2626' : '#0056b3'}>
            {p.title && <title>{p.title}</title>}
          </circle>
        ))}
        <text x={(g.x0 + g.x1) / 2} y={CURVE_H - 4} fontSize={10} fill="#334155" textAnchor="middle" fontWeight={700}>
          control-node displacement (mm)
        </text>
        <text x={11} y={midY} fontSize={10} fill="#334155" textAnchor="middle" fontWeight={700}
          transform={`rotate(-90 11 ${midY})`}>base shear (kN)</text>
      </svg>
    </DrawingFrame>
  )
}
