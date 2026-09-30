import { ResultCard, Row } from './qty'
import type { PushoverModelResult } from '../engine/pushoverModel'
import type { HingeId } from '../engine/pushover'
import { CapacityCurveChart } from './CapacityCurveChart'

/** Short hinge label, e.g. "C1 @i (Mz)", "B2 @i (Vy)", "BR3 @i (axial)". */
function hingeLabel(h: HingeId): string {
  const tag = h.type === 'moment' ? `M${h.axis}` : h.type === 'shear' ? `V${h.axis}` : 'axial'
  return `${h.member} @${h.end} (${tag})`
}

/** Capacity (pushover) curve: base shear vs control-node displacement; a red
 *  point is an event where a new hinge formed. */
function CapacityCurve({ res }: { res: PushoverModelResult }) {
  return (
    <CapacityCurveChart label="pushover curve" points={res.result.curve.map((p) => ({
      x: p.roofDisp * 1000, y: p.baseShear, hot: !!p.newHinge,
      title: `Δ ${(Math.abs(p.roofDisp) * 1000).toFixed(1)} mm · V ${Math.abs(p.baseShear).toFixed(1)} kN`,
    }))} />
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
      <div className="mb-3 rounded-lg border border-hairline bg-sheet-2 p-2">
        <CapacityCurve res={res} />
      </div>
      <Row label="Peak base shear" value={`${peakV.toFixed(1)} kN`}
        sub={`${res.result.mechanism ? 'collapse mechanism' : 'target reached'}${res.pDelta ? ' · P-Δ on' : ''}`} />
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
            <thead className="text-muted">
              <tr className="border-b border-hairline">
                <th className="py-1 pr-2">Event</th>
                <th className="py-1 pr-2">V (kN)</th>
                <th className="py-1 pr-2">Δ (mm)</th>
                <th className="py-1 pr-2">Hinge</th>
                {res.pmInteraction && <th className="py-1 pr-2">N (kN)</th>}
                {res.pmInteraction && <th className="py-1 pr-2">Mpc (kN·m)</th>}
              </tr>
            </thead>
            <tbody className="text-ink-2">
              {curve.slice(1).map((p) => {
                const h = hingeByEvent.get(p.event)
                return (
                <tr key={p.event} className="border-b border-hairline-2 last:border-0">
                  <td className="py-1 pr-2">{p.event}</td>
                  <td className="py-1 pr-2 font-semibold">{Math.abs(p.baseShear).toFixed(1)}</td>
                  <td className="py-1 pr-2">{(Math.abs(p.roofDisp) * 1000).toFixed(1)}</td>
                  <td className="py-1 pr-2 text-muted">
                    {p.newHinge ? hingeLabel(p.newHinge) : '—'}
                  </td>
                  {res.pmInteraction && <td className="py-1 pr-2 text-muted">{h?.axial !== undefined ? h.axial.toFixed(1) : '—'}</td>}
                  {res.pmInteraction && <td className="py-1 pr-2 text-muted">{h?.Mpc !== undefined ? h.Mpc.toFixed(1) : '—'}</td>}
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
