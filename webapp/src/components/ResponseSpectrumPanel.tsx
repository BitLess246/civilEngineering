import type { ResponseSpectrumResult, ModalForce } from '../engine/responseSpectrum'

const f0 = (v: number) => v.toFixed(0)
const f2 = (v: number) => v.toFixed(2)
const f3 = (v: number) => v.toFixed(3)
const pct = (v: number) => `${(v * 100).toFixed(1)}%`

/** Dominant lateral direction of a modal force vector (0=X, 2=Z, -1=mixed/vertical). */
function domDir(mf: ModalForce): 0 | 2 | -1 {
  const vx = mf.baseShear[0], vz = mf.baseShear[2]
  if (vx < 0.01 && vz < 0.01) return -1
  return vx >= vz ? 0 : 2
}

const DIR_COLOR: Record<number, string> = { 0: '#0056b3', 2: '#15803d', [-1]: '#94a3b8' }

// ── Spectrum SVG chart ────────────────────────────────────────────────────────
function SpectrumChart({ result }: { result: ResponseSpectrumResult }) {
  const { Ca, Cv, I, R, Ts } = result.params
  const { modalForces } = result

  const saG = (T: number): number => {
    const plateau = (2.5 * Ca * I) / R
    const velocity = T > 1e-9 ? (Cv * I) / (R * T) : plateau
    const minimum = (0.11 * Ca * I) / R
    return Math.max(minimum, Math.min(plateau, velocity))
  }

  const T1 = modalForces.length > 0 ? modalForces[0].period : 1.0
  const Tmax = Math.max(T1 * 1.6, Ts * 5, 2.0)
  const plateau = (2.5 * Ca * I) / R
  const Ymax = plateau * 1.18

  const VW = 480, VH = 158
  const LEFT = 50, RIGHT = 12, TOP = 10, BOT = 30
  const PW = VW - LEFT - RIGHT, PH = VH - TOP - BOT

  const px = (T: number) => LEFT + Math.min(1, Math.max(0, T / Tmax)) * PW
  const py = (sa: number) => TOP + (1 - Math.min(sa / Ymax, 1)) * PH

  // Build polyline for 1/T decay region (smooth curve from Ts to Tmax)
  const N = 60
  const curvePts: string[] = [[px(0), py(plateau)].join(','), [px(Ts), py(plateau)].join(',')]
  for (let k = 1; k <= N; k++) {
    const T = Ts + ((Tmax - Ts) * k) / N
    curvePts.push([px(T), py(saG(T))].join(','))
  }

  // Y ticks at 0 and plateau
  const yTicks = [0, plateau / 2, plateau]
  // X ticks at 0, 0.5, 1.0, 1.5, … up to Tmax
  const xTicks: number[] = []
  for (let T = 0; T <= Tmax + 0.01; T += 0.5) xTicks.push(parseFloat(T.toFixed(1)))

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ height: VH }} aria-label="Design response spectrum">
      {/* Shaded area under curve */}
      <polygon
        points={[`${px(0)},${py(0)}`, ...curvePts, `${px(Tmax)},${py(0)}`].join(' ')}
        fill="#dbeafe" opacity="0.55" />
      {/* Spectrum curve */}
      <polyline points={curvePts.join(' ')} fill="none" stroke="#0056b3" strokeWidth={1.8} strokeLinejoin="round" />

      {/* Ts dashed vertical */}
      <line x1={px(Ts)} y1={TOP} x2={px(Ts)} y2={TOP + PH} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3,2" />
      <text x={px(Ts) + 2} y={TOP + 10} fontSize={8.5} fill="#b45309">Ts</text>

      {/* Mode markers (up to 10 to keep chart readable) */}
      {modalForces.slice(0, 10).map((mf, i) => {
        const d = domDir(mf)
        const color = DIR_COLOR[d]
        const x = px(mf.period)
        const yDot = py(saG(mf.period))
        return (
          <g key={i}>
            <line x1={x} y1={yDot} x2={x} y2={TOP + PH} stroke={color} strokeWidth={0.9}
              strokeDasharray="2,2" opacity={0.75} />
            <circle cx={x} cy={yDot} r={2.8} fill={color} />
            <text x={x} y={yDot - 4} fontSize={8} fill={color} textAnchor="middle">{i + 1}</text>
          </g>
        )
      })}

      {/* Axes */}
      <line x1={LEFT} y1={TOP} x2={LEFT} y2={TOP + PH} stroke="#64748b" strokeWidth={0.8} />
      <line x1={LEFT} y1={TOP + PH} x2={LEFT + PW} y2={TOP + PH} stroke="#64748b" strokeWidth={0.8} />

      {/* Y axis ticks + labels */}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={LEFT - 3} y1={py(v)} x2={LEFT} y2={py(v)} stroke="#64748b" strokeWidth={0.7} />
          <text x={LEFT - 5} y={py(v) + 3} fontSize={8.5} fill="#64748b" textAnchor="end">{v.toFixed(3)}</text>
        </g>
      ))}
      <text x={11} y={TOP + PH / 2 + 3} fontSize={9} fill="#0056b3" textAnchor="middle"
        transform={`rotate(-90,11,${TOP + PH / 2 + 3})`}>Sa/g</text>

      {/* X axis ticks + labels */}
      {xTicks.filter((T) => T <= Tmax + 0.01).map((T) => (
        <g key={T}>
          <line x1={px(T)} y1={TOP + PH} x2={px(T)} y2={TOP + PH + 3} stroke="#64748b" strokeWidth={0.7} />
          <text x={px(T)} y={TOP + PH + 12} fontSize={8.5} fill="#64748b" textAnchor="middle">{T}</text>
        </g>
      ))}
      <text x={LEFT + PW / 2} y={VH - 2} fontSize={9} fill="#64748b" textAnchor="middle">T (s)</text>

      {/* Legend */}
      <circle cx={LEFT + PW - 70} cy={TOP + 8} r={2.5} fill="#0056b3" />
      <text x={LEFT + PW - 65} y={TOP + 11} fontSize={8} fill="#0056b3">X-dominant</text>
      <circle cx={LEFT + PW - 70} cy={TOP + 20} r={2.5} fill="#15803d" />
      <text x={LEFT + PW - 65} y={TOP + 23} fontSize={8} fill="#15803d">Z-dominant</text>
    </svg>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────
export function ResponseSpectrumPanel({
  result, seismicT,
}: {
  result: ResponseSpectrumResult
  /** Approximate period Ct·hn^0.75 from static ELF, for comparison. */
  seismicT?: number
}) {
  const { params, modalForces, srss, cqc, cqcRatio } = result
  const { Ca, Cv, I, R, Ts, staticV, zeta = 0.05 } = params

  const T1 = modalForces[0]?.period ?? null

  // §208.6.4.2 scaling requirement (90% of static V)
  const needsScale = (dir: 0 | 2) => {
    const ratio = cqcRatio[dir]
    return ratio !== null && ratio < 0.9
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-[1.02rem] font-bold text-[#0056b3]">
        Response Spectrum Analysis — NSCP §208.6
      </h2>
      <p className="mb-2 text-[11px] text-slate-400">
        Design spectrum: Sa/g = min(2.5·Ca·I/R, Cv·I/(R·T)) ≥ 0.11·Ca·I/R.
        {' '}Ts = {f3(Ts)} s. CQC combination (ζ = {pct(zeta)}).
        {T1 !== null && seismicT !== undefined && (
          <> T₁ = <span className="font-semibold text-slate-600">{f3(T1)} s</span> (modal) vs{' '}
            T_approx = {f3(seismicT)} s (Ct·h<sub>n</sub><sup>¾</sup>).</>
        )}
      </p>

      {/* Spectrum chart */}
      <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50 p-2">
        <SpectrumChart result={result} />
      </div>

      {/* Parameters row */}
      <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
        {[
          ['Ca', f3(Ca)], ['Cv', f3(Cv)], ['I', f2(I)], ['R', f2(R)],
          ['2.5CaI/R', f3(2.5 * Ca * I / R) + ' g'],
          ['CvI/R (at 1 s)', f3(Cv * I / R) + ' g'],
          ['min', f3(0.11 * Ca * I / R) + ' g'],
        ].map(([k, v]) => (
          <span key={k}><span className="font-semibold text-slate-600">{k}</span> = {v}</span>
        ))}
      </div>

      {/* Modal base shear table */}
      {modalForces.length > 0 && (
        <>
          <h3 className="mb-1 text-[0.82rem] font-semibold text-slate-600">Modal base shear</h3>
          <div className="mb-3 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-1 pr-3 text-left font-semibold">Mode</th>
                  <th className="pb-1 pr-3 text-right font-semibold">T (s)</th>
                  <th className="pb-1 pr-3 text-right font-semibold">Sa/g</th>
                  <th className="pb-1 pr-3 text-right font-semibold">Sa (m/s²)</th>
                  <th className="pb-1 pr-3 text-right font-semibold">V_x (kN)</th>
                  <th className="pb-1 text-right font-semibold">V_z (kN)</th>
                </tr>
              </thead>
              <tbody>
                {modalForces.map((mf) => {
                  const d = domDir(mf)
                  const color = DIR_COLOR[d]
                  return (
                    <tr key={mf.modeIdx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="py-0.5 pr-3 font-mono text-slate-700">
                        {mf.modeIdx}
                        {d !== -1 && (
                          <span className="ml-1 text-[9px]" style={{ color }}>{d === 0 ? 'X' : 'Z'}</span>
                        )}
                      </td>
                      <td className="py-0.5 pr-3 text-right tabular-nums font-semibold text-slate-800">{f3(mf.period)}</td>
                      <td className="py-0.5 pr-3 text-right tabular-nums text-slate-600">{f3(mf.SaG)}</td>
                      <td className="py-0.5 pr-3 text-right tabular-nums text-slate-600">{f2(mf.Sa)}</td>
                      <td className="py-0.5 pr-3 text-right tabular-nums text-slate-700">{f0(mf.baseShear[0])}</td>
                      <td className="py-0.5 text-right tabular-nums text-slate-700">{f0(mf.baseShear[2])}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Combined base shear summary */}
      <h3 className="mb-1 text-[0.82rem] font-semibold text-slate-600">Combined base shear</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="pb-1 pr-4 text-left font-semibold">Method</th>
              <th className="pb-1 pr-4 text-right font-semibold">V_x (kN)</th>
              <th className="pb-1 pr-4 text-right font-semibold">V_z (kN)</th>
              {staticV && <th className="pb-1 pr-4 text-right font-semibold">V_x/V_static</th>}
              {staticV && <th className="pb-1 text-right font-semibold">V_z/V_static</th>}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="py-0.5 pr-4 text-slate-600">SRSS</td>
              <td className="py-0.5 pr-4 text-right tabular-nums text-slate-700">{f0(srss[0])}</td>
              <td className="py-0.5 pr-4 text-right tabular-nums text-slate-700">{f0(srss[2])}</td>
              {staticV && <td className="py-0.5 pr-4" />}
              {staticV && <td className="py-0.5" />}
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-0.5 pr-4 font-semibold text-slate-800">CQC ←</td>
              <td className="py-0.5 pr-4 text-right tabular-nums font-semibold text-slate-900">{f0(cqc[0])}</td>
              <td className="py-0.5 pr-4 text-right tabular-nums font-semibold text-slate-900">{f0(cqc[2])}</td>
              {staticV && (
                <td className={`py-0.5 pr-4 text-right tabular-nums text-xs ${cqcRatio[0] !== null ? (cqcRatio[0]! < 0.9 ? 'text-red-600 font-semibold' : 'text-emerald-600') : 'text-slate-400'}`}>
                  {cqcRatio[0] !== null ? pct(cqcRatio[0]!) : '—'}
                </td>
              )}
              {staticV && (
                <td className={`py-0.5 text-right tabular-nums text-xs ${cqcRatio[2] !== null ? (cqcRatio[2]! < 0.9 ? 'text-red-600 font-semibold' : 'text-emerald-600') : 'text-slate-400'}`}>
                  {cqcRatio[2] !== null ? pct(cqcRatio[2]!) : '—'}
                </td>
              )}
            </tr>
            {staticV && (staticV[0] > 0 || staticV[2] > 0) && (
              <tr>
                <td className="py-0.5 pr-4 text-slate-500">Static (ELF)</td>
                <td className="py-0.5 pr-4 text-right tabular-nums text-slate-500">{f0(staticV[0])}</td>
                <td className="py-0.5 pr-4 text-right tabular-nums text-slate-500">{f0(staticV[2])}</td>
                <td className="py-0.5 pr-4" />
                <td className="py-0.5" />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* §208.6.4.2 scaling warnings */}
      {(needsScale(0) || needsScale(2)) && (
        <p className="mt-2 text-[11px] text-red-600">
          ⚠ §208.6.4.2 — CQC base shear is below 90% of the static V
          {needsScale(0) && cqcRatio[0] !== null && ` (X: scale ×${f2(0.9 / cqcRatio[0]!)})`}
          {needsScale(2) && cqcRatio[2] !== null && ` (Z: scale ×${f2(0.9 / cqcRatio[2]!)})`}.
          {' '}Multiply all modal response quantities by this factor before combining with gravity effects.
        </p>
      )}

      <p className="mt-2 text-[11px] text-slate-400">
        Use CQC base shear (more accurate for closely-spaced modes). SRSS is shown for reference.
        {T1 !== null && seismicT !== undefined && T1 > seismicT && (
          <> T₁ &gt; T_approx — the static ELF base shear is conservative (short-period cap may govern).</>
        )}
      </p>
    </div>
  )
}
