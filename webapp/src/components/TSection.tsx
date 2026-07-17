import { DimBelow, DimSide } from './dims'

/** Flanged (T / L) beam cross-section to scale: outline, optional compression
 *  stress block, stirrup + tension-bar layers in the web, and the shared
 *  dimension-line template (bf above, h left, hf right, bw below). Reused by
 *  the standalone T-beam page and the 3D Model Space beam schedule. */
export function TSection({ bf, bw, h, hf, a = 0, bars = 0, barDia = 0, layers = [], cover = 40, stirrupDia = 10 }: {
  bf: number; bw: number; h: number; hf: number; a?: number
  bars?: number; barDia?: number; layers?: number[]; cover?: number; stirrupDia?: number
}) {
  const W = 340, HT = 285
  const availW = 210, availH = 200
  const S = Math.min(availW / bf, availH / h)
  const w = bf * S, ht = h * S, wf = bw * S, hff = hf * S, A = Math.min(a, h) * S
  const x0 = (W - w) / 2, y0 = 40
  const xw = x0 + (w - wf) / 2
  const inset = (cover + stirrupDia / 2) * S
  const br = Math.max(2.5, (barDia / 2) * S)
  const barRows: { y: number; n: number }[] = []
  layers.forEach((n, li) => {
    barRows.push({ y: y0 + ht - (cover + stirrupDia + barDia / 2 + li * (barDia + 25)) * S, n })
  })
  const bx1 = xw + (cover + stirrupDia + barDia / 2) * S
  const bx2 = xw + wf - (cover + stirrupDia + barDia / 2) * S
  return (
    <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block w-full max-w-[360px]" style={{ fontFamily: 'Arial, sans-serif' }}>
      <path d={`M${x0} ${y0} h${w} v${hff} h${-(w - wf) / 2} v${ht - hff} h${-wf} v${-(ht - hff)} h${-(w - wf) / 2} z`}
        fill="#eef3f8" stroke="#37526e" strokeWidth="1.6" />
      {a > 0 && <>
        <rect x={x0} y={y0} width={w} height={Math.min(A, hff)} fill="#0f4c92" opacity="0.16" />
        {A > hff && <rect x={xw} y={y0 + hff} width={wf} height={A - hff} fill="#0f4c92" opacity="0.16" />}
        <line x1={x0 - 6} y1={y0 + A} x2={x0 + w + 6} y2={y0 + A} stroke="#0f4c92" strokeWidth="1.2" strokeDasharray="5 3" />
        <text x={x0 + w - 4} y={y0 + A + 11} fontSize="8.5" fontFamily="IBM Plex Mono, monospace" fill="#0f4c92" textAnchor="end">a = {a.toFixed(0)}</text>
      </>}
      {/* stirrup in the web */}
      <rect x={xw + inset} y={y0 + hff * 0.35} width={wf - 2 * inset} height={ht - hff * 0.35 - inset}
        rx={Math.max(2, 2 * stirrupDia * S)} fill="none" stroke="#37526e" strokeWidth={Math.max(1, stirrupDia * S)} opacity="0.8" />
      {/* 135° stirrup hooks — start at the bottom corner bars (tension side) and
          turn 45° into the core, ext = max(6ds, 75) mm (ACI 318-14 §425.3.2) */}
      {barRows.length > 0 && (() => {
        const hk = (Math.max(6 * stirrupDia, 75) * S) / Math.SQRT2
        const sw = Math.max(1, stirrupDia * S)
        const hy = barRows[0].y
        return (
          <g stroke="#37526e" strokeWidth={sw} opacity="0.8" strokeLinecap="round">
            <line x1={bx1} y1={hy} x2={bx1 + hk} y2={hy - hk} />
            <line x1={bx2} y1={hy} x2={bx2 - hk} y2={hy - hk} />
          </g>
        )
      })()}
      {/* tension bars */}
      {barRows.map((row, li) => Array.from({ length: row.n }, (_, i) => (
        <circle key={`${li}-${i}`} r={br} fill="#37526e"
          cx={row.n === 1 ? (bx1 + bx2) / 2 : bx1 + ((bx2 - bx1) * i) / (row.n - 1)} cy={row.y} />
      )))}
      {bars > 0 && (
        <text x={W / 2} y={y0 + ht + 14} fontSize="8.5" fill="#37526e" textAnchor="middle">
          {bars} ⌀{barDia} mm · stirrup ⌀{stirrupDia}
        </text>
      )}
      {/* dimension lines (shared template) */}
      <DimBelow xA={x0} xB={x0 + w} featY={y0} dY={y0 - 18} label={`bf = ${Math.round(bf)} mm`} />
      <DimBelow xA={xw} xB={xw + wf} featY={y0 + ht + (bars > 0 ? 18 : 4)} dY={y0 + ht + (bars > 0 ? 34 : 20)} label={`bw = ${Math.round(bw)} mm`} />
      <DimSide yA={y0} yB={y0 + ht} featX={x0 > 40 ? x0 + (w - wf) / 2 : x0} dX={Math.min(x0, xw) - 16} label={`h = ${Math.round(h)} mm`} side="left" />
      <DimSide yA={y0} yB={y0 + hff} featX={x0 + w} dX={x0 + w + 16} label={`hf = ${Math.round(hf)}`} side="right" />
    </svg>
  )
}
