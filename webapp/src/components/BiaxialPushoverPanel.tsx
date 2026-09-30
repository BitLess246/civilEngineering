import { ResultCard, Row } from './qty'
import { summarizeBiaxialPushover, type BiaxialPushoverResult } from '../engine/biaxialFrameModel'
import { CapacityCurveChart } from './CapacityCurveChart'

/** Base shear vs control-node displacement; a red point has hinges yielding. */
function CapacityCurve({ res }: { res: BiaxialPushoverResult }) {
  return (
    <CapacityCurveChart label="biaxial pushover curves" points={res.curve.map((p) => ({
      x: p.disp * 1000, y: p.shear, hot: p.hinges > 0,
      title: `Δ ${(Math.abs(p.disp) * 1000).toFixed(1)} mm · V ${Math.abs(p.shear).toFixed(1)} kN · ${p.hinges} hinge(s) yielding`,
    }))} />
  )
}

export function BiaxialPushoverPanel({ res }: { res: BiaxialPushoverResult }) {
  const s = summarizeBiaxialPushover(res)
  const clean = s.nonConverged === 0

  return (
    <ResultCard title={`Biaxial pushover — push at ${res.angleDeg}° in plan`}>
      <div className="mb-3 rounded-lg border border-hairline bg-sheet-2 p-2">
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
        <ul className="mt-3 space-y-1 rounded-lg border border-warn-line bg-warn-tint p-2">
          {s.warnings.map((w) => (
            <li key={w} className="flex gap-2 text-[11px] leading-5 text-warn">
              <span aria-hidden>⚠</span><span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      {s.worst.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <p className="mb-1 text-[11px] font-semibold text-muted">
            Most-utilised hinges — moments are about the member’s own local axes
          </p>
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr className="border-b border-hairline">
                <th className="py-1 pr-2">Member</th>
                <th className="py-1 pr-2">End</th>
                <th className="py-1 pr-2">My (kN·m)</th>
                <th className="py-1 pr-2">Mz (kN·m)</th>
                <th className="py-1 pr-2">N (kN)</th>
                <th className="py-1 pr-2">θp (mrad)</th>
                <th className="py-1 pr-2">D/C</th>
              </tr>
            </thead>
            <tbody className="text-ink-2">
              {s.worst.map((h) => (
                <tr key={`${h.member}-${h.end}`} className="border-b border-hairline-2 last:border-0">
                  <td className="py-1 pr-2">{h.member}</td>
                  <td className="py-1 pr-2 text-muted">{h.end}</td>
                  <td className="py-1 pr-2">{h.My.toFixed(1)}</td>
                  <td className="py-1 pr-2">{h.Mz.toFixed(1)}</td>
                  <td className="py-1 pr-2 text-muted">{h.axial.toFixed(1)}</td>
                  <td className="py-1 pr-2 text-muted">
                    {(Math.hypot(h.plasticY, h.plasticZ) * 1000).toFixed(2)}
                  </td>
                  <td className={`py-1 pr-2 font-semibold ${h.yielded ? 'text-fail' : 'text-ink-2'}`}>
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
