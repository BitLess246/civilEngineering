import { ResultCard, Row } from './qty'
import type { PushoverModelResult } from '../engine/pushoverModel'
import type { HingeId } from '../engine/pushover'

/** Short hinge label, e.g. "C1 @i (Mz)", "B2 @i (Vy)", "BR3 @i (axial)". */
function hingeLabel(h: HingeId): string {
  const tag = h.type === 'moment' ? `M${h.axis}` : h.type === 'shear' ? `V${h.axis}` : 'axial'
  return `${h.member} @${h.end} (${tag})`
}

/** Capacity (pushover) curve: base shear vs control-node displacement. */
function CapacityCurve({ res }: { res: PushoverModelResult }) {
  const curve = res.result.curve
  const xs = curve.map((p) => Math.abs(p.roofDisp) * 1000)   // mm
  const ys = curve.map((p) => Math.abs(p.baseShear))         // kN
  const xMax = Math.max(...xs, 1e-9), yMax = Math.max(...ys, 1e-9)

  const W = 460, H = 280, padL = 56, padR = 16, padT = 16, padB = 40
  const x0 = padL, x1 = W - padR, y0 = H - padB, y1 = padT
  const sx = (v: number) => x0 + (x1 - x0) * (v / xMax)
  const sy = (v: number) => y0 - (y0 - y1) * (v / yMax)
  const pts = curve.map((_, i) => `${sx(xs[i]).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      {/* axes */}
      <line x1={x0} y1={y0} x2={x1} y2={y0} stroke="#475569" strokeWidth={1.2} />
      <line x1={x0} y1={y0} x2={x0} y2={y1} stroke="#475569" strokeWidth={1.2} />
      {/* gridlines + tick labels (0, mid, max) */}
      {[0, 0.5, 1].map((f) => (
        <g key={`y${f}`}>
          <line x1={x0} y1={sy(yMax * f)} x2={x1} y2={sy(yMax * f)} stroke="#e2e8f0" strokeWidth={0.8} />
          <text x={x0 - 6} y={sy(yMax * f) + 3} fontSize={9} fill="#64748b" textAnchor="end">{(yMax * f).toFixed(0)}</text>
        </g>
      ))}
      {[0, 0.5, 1].map((f) => (
        <text key={`x${f}`} x={sx(xMax * f)} y={y0 + 14} fontSize={9} fill="#64748b" textAnchor="middle">{(xMax * f).toFixed(1)}</text>
      ))}
      {/* curve */}
      <polyline points={pts} fill="none" stroke="#0056b3" strokeWidth={2} />
      {curve.map((p, i) => (
        <circle key={i} cx={sx(xs[i])} cy={sy(ys[i])} r={i === 0 ? 2.5 : 3}
          fill={p.newHinge ? '#dc2626' : '#0056b3'} />
      ))}
      {/* axis titles */}
      <text x={(x0 + x1) / 2} y={H - 4} fontSize={10} fill="#334155" textAnchor="middle" fontWeight={700}>
        control-node displacement (mm)
      </text>
      <text x={12} y={(y0 + y1) / 2} fontSize={10} fill="#334155" textAnchor="middle" fontWeight={700}
        transform={`rotate(-90 12 ${(y0 + y1) / 2})`}>base shear (kN)</text>
    </svg>
  )
}

export function PushoverPanel({ res, dirLabel }: { res: PushoverModelResult; dirLabel: string }) {
  const curve = res.result.curve
  const peakV = Math.max(...curve.map((p) => Math.abs(p.baseShear)))
  const peakD = Math.max(...curve.map((p) => Math.abs(p.roofDisp)))
  const drift = res.totalHeight > 0 ? peakD / res.totalHeight : 0
  const nHinges = res.result.hinges.length
  // event → hinge record, to surface P–M axial/reduced-capacity in the table
  const hingeByEvent = new Map(res.result.hinges.map((h) => [h.event, h]))

  return (
    <ResultCard title={`Pushover capacity — push ${dirLabel}`}>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
        <CapacityCurve res={res} />
      </div>
      <Row label="Peak base shear" value={`${peakV.toFixed(1)} kN`}
        sub={res.result.mechanism ? 'collapse mechanism' : 'target reached'} />
      <Row label="Peak roof displacement" value={`${(peakD * 1000).toFixed(1)} mm`}
        sub={`drift ${(drift * 100).toFixed(2)}% of H`} />
      <Row label="Plastic hinges formed" value={`${nHinges}`}
        sub={`${res.nHingeable} members hingeable`} />
      <Row alert={res.result.mechanism} label={res.result.mechanism ? '✗ Mechanism formed' : '✓ Stable to target'}
        value={`${curve.length - 1} events`}
        sub={res.result.mechanism ? 'a collapse mechanism developed' : 'no mechanism within target drift'} />

      {nHinges > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-1 pr-2">Event</th>
                <th className="py-1 pr-2">V (kN)</th>
                <th className="py-1 pr-2">Δ (mm)</th>
                <th className="py-1 pr-2">Hinge</th>
                {res.pmInteraction && <th className="py-1 pr-2">N (kN)</th>}
                {res.pmInteraction && <th className="py-1 pr-2">Mpc (kN·m)</th>}
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {curve.slice(1).map((p) => {
                const h = hingeByEvent.get(p.event)
                return (
                <tr key={p.event} className="border-b border-slate-100 last:border-0">
                  <td className="py-1 pr-2">{p.event}</td>
                  <td className="py-1 pr-2 font-semibold">{Math.abs(p.baseShear).toFixed(1)}</td>
                  <td className="py-1 pr-2">{(Math.abs(p.roofDisp) * 1000).toFixed(1)}</td>
                  <td className="py-1 pr-2 text-slate-500">
                    {p.newHinge ? hingeLabel(p.newHinge) : '—'}
                  </td>
                  {res.pmInteraction && <td className="py-1 pr-2 text-slate-500">{h?.axial !== undefined ? h.axial.toFixed(1) : '—'}</td>}
                  {res.pmInteraction && <td className="py-1 pr-2 text-slate-500">{h?.Mpc !== undefined ? h.Mpc.toFixed(1) : '—'}</td>}
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </ResultCard>
  )
}
