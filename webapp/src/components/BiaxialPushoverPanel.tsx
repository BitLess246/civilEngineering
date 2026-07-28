import { ResultCard, Row } from './qty'
import { summarizeBiaxialPushover, type BiaxialPushoverResult } from '../engine/biaxialFrameModel'

/** Base shear vs control-node displacement, with yield onset marked. */
function CapacityCurve({ res }: { res: BiaxialPushoverResult }) {
  const xs = res.curve.map((p) => Math.abs(p.disp) * 1000)   // mm
  const ys = res.curve.map((p) => Math.abs(p.shear))         // kN
  const xMax = Math.max(...xs, 1e-9), yMax = Math.max(...ys, 1e-9)

  const W = 460, H = 280, padL = 56, padR = 16, padT = 16, padB = 40
  const x0 = padL, x1 = W - padR, y0 = H - padB, y1 = padT
  const sx = (v: number) => x0 + (x1 - x0) * (v / xMax)
  const sy = (v: number) => y0 - (y0 - y1) * (v / yMax)
  const pts = res.curve.map((_, i) => `${sx(xs[i]).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <line x1={x0} y1={y0} x2={x1} y2={y0} stroke="#475569" strokeWidth={1.2} />
      <line x1={x0} y1={y0} x2={x0} y2={y1} stroke="#475569" strokeWidth={1.2} />
      {[0, 0.5, 1].map((f) => (
        <g key={`y${f}`}>
          <line x1={x0} y1={sy(yMax * f)} x2={x1} y2={sy(yMax * f)} stroke="#e2e8f0" strokeWidth={0.8} />
          <text x={x0 - 6} y={sy(yMax * f) + 3} fontSize={9} fill="#64748b" textAnchor="end">{(yMax * f).toFixed(0)}</text>
        </g>
      ))}
      {[0, 0.5, 1].map((f) => (
        <text key={`x${f}`} x={sx(xMax * f)} y={y0 + 14} fontSize={9} fill="#64748b" textAnchor="middle">{(xMax * f).toFixed(1)}</text>
      ))}
      <polyline points={pts} fill="none" stroke="#0056b3" strokeWidth={2} />
      {res.curve.map((p, i) => (
        <circle key={i} cx={sx(xs[i])} cy={sy(ys[i])} r={2.6}
          fill={p.hinges > 0 ? '#dc2626' : '#0056b3'}>
          <title>{`Δ ${xs[i].toFixed(1)} mm · V ${ys[i].toFixed(1)} kN · ${p.hinges} hinge(s) yielding`}</title>
        </circle>
      ))}
      <text x={(x0 + x1) / 2} y={H - 4} fontSize={10} fill="#334155" textAnchor="middle" fontWeight={700}>
        control-node displacement (mm)
      </text>
      <text x={12} y={(y0 + y1) / 2} fontSize={10} fill="#334155" textAnchor="middle" fontWeight={700}
        transform={`rotate(-90 12 ${(y0 + y1) / 2})`}>base shear (kN)</text>
    </svg>
  )
}

export function BiaxialPushoverPanel({ res }: { res: BiaxialPushoverResult }) {
  const s = summarizeBiaxialPushover(res)
  const clean = s.nonConverged === 0

  return (
    <ResultCard title={`Biaxial pushover — push at ${res.angleDeg}° in plan`}>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
        <CapacityCurve res={res} />
      </div>

      <Row label="Peak base shear" value={`${s.peakShear.toFixed(1)} kN`}
        sub={`measured on the global ${res.controlDir.toUpperCase()} axis`} />
      <Row label="Peak control displacement" value={`${(s.peakDisp * 1000).toFixed(1)} mm`}
        sub={`drift ${(s.drift * 100).toFixed(2)}% of H = ${res.totalHeight.toFixed(2)} m`} />
      <Row label="Hinges past yield" value={`${s.yielded}`}
        sub={`${s.nHingeable} members hingeable`} />
      <Row alert={!clean} label={clean ? '✓ Converged at every step' : '✗ Some steps did not converge'}
        value={`${res.curve.length} steps`}
        sub={clean
          ? `worst residual ${s.worstResidual.toExponential(1)}`
          : `${s.nonConverged} short of tolerance — worst ${s.worstResidual.toExponential(1)}`} />

      {s.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2">
          {s.warnings.map((w) => (
            <li key={w} className="flex gap-2 text-[11px] leading-5 text-amber-900">
              <span aria-hidden>⚠</span><span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      {s.worst.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <p className="mb-1 text-[11px] font-semibold text-slate-600">
            Most-utilised hinges — moments are about the member’s own local axes
          </p>
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-1 pr-2">Member</th>
                <th className="py-1 pr-2">End</th>
                <th className="py-1 pr-2">My (kN·m)</th>
                <th className="py-1 pr-2">Mz (kN·m)</th>
                <th className="py-1 pr-2">N (kN)</th>
                <th className="py-1 pr-2">θp (mrad)</th>
                <th className="py-1 pr-2">D/C</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {s.worst.map((h) => (
                <tr key={`${h.member}-${h.end}`} className="border-b border-slate-100 last:border-0">
                  <td className="py-1 pr-2">{h.member}</td>
                  <td className="py-1 pr-2 text-slate-500">{h.end}</td>
                  <td className="py-1 pr-2">{h.My.toFixed(1)}</td>
                  <td className="py-1 pr-2">{h.Mz.toFixed(1)}</td>
                  <td className="py-1 pr-2 text-slate-500">{h.axial.toFixed(1)}</td>
                  <td className="py-1 pr-2 text-slate-500">
                    {(Math.hypot(h.plasticY, h.plasticZ) * 1000).toFixed(2)}
                  </td>
                  <td className={`py-1 pr-2 font-semibold ${h.yielded ? 'text-red-600' : 'text-slate-700'}`}>
                    {Number.isFinite(h.utilisation) ? h.utilisation.toFixed(2) : '∞'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ResultCard>
  )
}
