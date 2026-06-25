import { ResultCard, Row } from './qty'
import type { TimeHistoryModelResult } from '../engine/timeHistoryModel'

/** A signed time series on a shared time axis (zero line centred). */
function TimeChart({ t, y, color, yLabel, yScale = 1 }: {
  t: number[]; y: number[]; color: string; yLabel: string; yScale?: number
}) {
  const W = 460, H = 170, padL = 56, padR = 12, padT = 10, padB = 28
  const x0 = padL, x1 = W - padR, yMid = (H - padB + padT) / 2
  const tMax = Math.max(t[t.length - 1] ?? 1, 1e-9)
  const yAbs = Math.max(...y.map((v) => Math.abs(v * yScale)), 1e-9)
  const sx = (v: number) => x0 + (x1 - x0) * (v / tMax)
  const sy = (v: number) => yMid - (H - padB - padT) / 2 * ((v * yScale) / yAbs)
  const pts = y.map((v, i) => `${sx(t[i]).toFixed(1)},${sy(v).toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      {/* zero line + frame */}
      <line x1={x0} y1={yMid} x2={x1} y2={yMid} stroke="#cbd5e1" strokeWidth={1} />
      <line x1={x0} y1={padT} x2={x0} y2={H - padB} stroke="#475569" strokeWidth={1} />
      <line x1={x0} y1={H - padB} x2={x1} y2={H - padB} stroke="#475569" strokeWidth={1} />
      {/* y extremes */}
      <text x={x0 - 5} y={padT + 8} fontSize={9} fill="#64748b" textAnchor="end">{(yAbs).toFixed(yAbs < 10 ? 1 : 0)}</text>
      <text x={x0 - 5} y={H - padB} fontSize={9} fill="#64748b" textAnchor="end">{(-yAbs).toFixed(yAbs < 10 ? 1 : 0)}</text>
      {/* time ticks */}
      {[0, 0.5, 1].map((f) => (
        <text key={f} x={sx(tMax * f)} y={H - padB + 12} fontSize={9} fill="#64748b" textAnchor="middle">{(tMax * f).toFixed(1)}s</text>
      ))}
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.4} />
      <text x={12} y={yMid} fontSize={9} fill="#334155" textAnchor="middle" fontWeight={700}
        transform={`rotate(-90 12 ${yMid})`}>{yLabel}</text>
    </svg>
  )
}

export function TimeHistoryPanel({ res, dirLabel }: { res: TimeHistoryModelResult; dirLabel: string }) {
  const r = res.result
  const t = r.t
  const roof = r.nodeHistory ? r.nodeHistory.u.map((u) => u[r.dir]) : []
  const T1 = r.modal[0]?.period ?? 0

  return (
    <ResultCard title={`Time-history — ground motion ${dirLabel}`}>
      <div className="mb-1 text-[11px] font-semibold text-slate-500">Base shear V(t)</div>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
        <TimeChart t={t} y={r.baseShear} color="#0056b3" yLabel="V (kN)" />
      </div>
      {roof.length > 0 && (
        <>
          <div className="mb-1 text-[11px] font-semibold text-slate-500">Roof displacement Δ(t) — node {res.controlNode}</div>
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <TimeChart t={t} y={roof} color="#ea580c" yLabel="Δ (mm)" yScale={1000} />
          </div>
        </>
      )}
      <Row label="Peak base shear" value={`${r.peakBaseShear.toFixed(1)} kN`} />
      <Row label="Peak roof displacement" value={`${(Math.abs(res.peakRoof) * 1000).toFixed(1)} mm`}
        sub={`node ${res.controlNode}`} />
      <Row label="Fundamental period T₁" value={`${T1.toFixed(3)} s`}
        sub={`${r.modal.length} modes, PGA ${(res.pga / 9.81).toFixed(2)} g`} />
      <Row label="Peak total displacement" value={`${(r.peakNodeDisp * 1000).toFixed(1)} mm`}
        sub={r.peakNode ? `at ${r.peakNode}` : ''} />
    </ResultCard>
  )
}
