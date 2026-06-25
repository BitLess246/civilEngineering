import { ResultCard, Row } from './qty'
import type { AccelSpectrum, DesignSpectrumPoint } from '../engine/accelSpectrum'

interface Props {
  /** Elastic response spectrum computed from the uploaded record. */
  spec: AccelSpectrum
  /** NSCP 208 design spectrum sampled at the same periods. */
  design: DesignSpectrumPoint[]
  /** Name of the source record, for the caption. */
  recordName?: string
}

/**
 * Elastic response spectrum (PSA vs period) computed from an uploaded
 * accelerogram, overlaid on the NSCP 208 design spectrum (Tier 4 C8).
 */
export function RecordedSpectrumPanel({ spec, design, recordName }: Props) {
  const W = 480, H = 300, padL = 52, padR = 14, padT = 16, padB = 40
  const x0 = padL, x1 = W - padR, y0 = H - padB, y1 = padT

  const Tmax = Math.max(...spec.points.map((p) => p.T), 1e-6)
  const saMax = Math.max(
    spec.peakPSA,
    ...design.map((d) => d.Sa),
    1e-6,
  )
  const sx = (T: number) => x0 + (T / Tmax) * (x1 - x0)
  const sy = (sa: number) => y0 - (sa / saMax) * (y0 - y1)

  const line = (pts: [number, number][]) =>
    pts.map(([T, sa]) => `${sx(T).toFixed(1)},${sy(sa).toFixed(1)}`).join(' ')

  const recPts = line(spec.points.map((p) => [p.T, p.PSA]))
  const dsgPts = line(design.map((d) => [d.T, d.Sa]))

  // axis ticks
  const xTicks = Array.from({ length: 5 }, (_, i) => (Tmax * i) / 4)
  const yTicks = Array.from({ length: 5 }, (_, i) => (saMax * i) / 4)

  return (
    <ResultCard title="Response spectrum vs NSCP 208 design spectrum">
      <div className="col-span-full mb-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto' }}>
          {/* grid + ticks */}
          {yTicks.map((sa, i) => (
            <g key={`y${i}`}>
              <line x1={x0} y1={sy(sa)} x2={x1} y2={sy(sa)} stroke="#eef2f7" strokeWidth={1} />
              <text x={x0 - 5} y={sy(sa) + 3} fontSize={8} fill="#64748b" textAnchor="end">{sa.toFixed(1)}</text>
            </g>
          ))}
          {xTicks.map((T, i) => (
            <text key={`x${i}`} x={sx(T)} y={y0 + 12} fontSize={8} fill="#64748b" textAnchor="middle">{T.toFixed(1)}</text>
          ))}
          {/* axes */}
          <line x1={x0} y1={y0} x2={x1} y2={y0} stroke="#94a3b8" strokeWidth={1} />
          <line x1={x0} y1={y0} x2={x0} y2={y1} stroke="#94a3b8" strokeWidth={1} />
          <text x={(x0 + x1) / 2} y={H - 6} fontSize={9} fill="#475569" textAnchor="middle">Period T (s)</text>
          <text x={12} y={(y0 + y1) / 2} fontSize={9} fill="#475569" textAnchor="middle"
            transform={`rotate(-90 12 ${(y0 + y1) / 2})`}>PSA (m/s²)</text>

          {/* design spectrum (red dashed) */}
          <polyline points={dsgPts} fill="none" stroke="#dc2626" strokeWidth={1.6} strokeDasharray="5 3" />
          {/* recorded spectrum (blue solid) */}
          <polyline points={recPts} fill="none" stroke="#0056b3" strokeWidth={1.8} />
          {/* peak marker */}
          <circle cx={sx(spec.peakPSAT)} cy={sy(spec.peakPSA)} r={2.6} fill="#0056b3" />

          {/* legend */}
          <g transform={`translate(${x1 - 150}, ${y1 + 4})`}>
            <line x1={0} y1={4} x2={18} y2={4} stroke="#0056b3" strokeWidth={1.8} />
            <text x={22} y={7} fontSize={8} fill="#334155">Record ({(spec.zeta * 100).toFixed(0)}% damping)</text>
            <line x1={0} y1={16} x2={18} y2={16} stroke="#dc2626" strokeWidth={1.6} strokeDasharray="5 3" />
            <text x={22} y={19} fontSize={8} fill="#334155">NSCP 208 design</text>
          </g>
        </svg>
      </div>

      <Row label="Peak ground accel (PGA)" value={`${spec.pga.toFixed(3)} m/s²`} sub={`${(spec.pga / 9.81).toFixed(3)} g`} />
      <Row label="Peak spectral accel (PSA)" value={`${spec.peakPSA.toFixed(3)} m/s²`} sub={`at T = ${spec.peakPSAT.toFixed(2)} s`} />
      <Row label="Amplification PSA/PGA" value={spec.pga > 0 ? `${(spec.peakPSA / spec.pga).toFixed(2)}×` : '—'} />
      <Row label="Damping ζ" value={`${(spec.zeta * 100).toFixed(0)} %`}
        sub={recordName ? `record: ${recordName}` : undefined} />
    </ResultCard>
  )
}
