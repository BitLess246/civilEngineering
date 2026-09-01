import { DimBelow, DimSide } from './dims'
import { sectionFrame } from './sectionLayout'

/** Flanged (T / L) beam cross-section to scale: outline, optional compression
 *  stress block, stirrup + tension-bar layers in the web, and the shared
 *  dimension-line template (bf above, h left, hf right, bw below). Reused by
 *  the standalone T-beam page and the 3D Model Space beam schedule.
 *
 *  `edge` draws the section an EDGE beam actually is: ACI Table 6.3.2.1 gives an
 *  edge beam ONE overhang (bf = bw + min(6hf, sw/2, ln/12)), because there is no
 *  slab on the outside face. Drawing that as a symmetric T — which is what this
 *  did for every kind — showed a shape the code had already ruled out, with the
 *  web floating in the middle of a flange that only exists on one side. The web
 *  is drawn flush with the free edge and the slab runs inboard from it. */
export function TSection({ bf, bw, h, hf, a = 0, aReq = 0, bars = 0, barDia = 0, layers = [], cover = 40, stirrupDia = 10, legs = 2, edge = false }: {
  bf: number; bw: number; h: number; hf: number; a?: number
  /** Block depth the moment requires, when it differs from the delivered `a`. */
  aReq?: number
  bars?: number; barDia?: number; layers?: number[]; cover?: number; stirrupDia?: number; legs?: number
  /** Edge (L) beam — the flange projects on one side only. */
  edge?: boolean
}) {
  // Frame arithmetic lives in `sectionLayout` so it can be tested — the
  // complaint that started this ("too small, area not fully used") is a
  // statement about these numbers and nothing else.
  const { scale: S, W, HT, x0, y0, w, ht } = sectionFrame(bf, h, bars)
  const wf = bw * S, hff = hf * S, A = Math.min(a, h) * S
  // Overhang split: symmetric for an interior/isolated T, all on one side for an
  // L. Everything downstream reads `xw`, so the two shapes share one drawing.
  const xw = x0 + (edge ? 0 : (w - wf) / 2)
  const oL = xw - x0, oR = x0 + w - (xw + wf)
  const inset = (cover + stirrupDia / 2) * S
  const br = Math.max(2.5, (barDia / 2) * S)
  const barRows: { y: number; n: number }[] = []
  layers.forEach((n, li) => {
    barRows.push({ y: y0 + ht - (cover + stirrupDia + barDia / 2 + li * (barDia + 25)) * S, n })
  })
  const bx1 = xw + (cover + stirrupDia + barDia / 2) * S
  const bx2 = xw + wf - (cover + stirrupDia + barDia / 2) * S
  return (
    <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block h-auto max-h-[440px] w-full max-w-[560px]" style={{ fontFamily: 'Arial, sans-serif' }}>
      <path d={`M${x0} ${y0} h${w} v${hff} h${-oR} v${ht - hff} h${-wf} v${-(ht - hff)} h${-oL} z`}
        fill="#eef3f8" stroke="#37526e" strokeWidth="1.6" />
      {a > 0 && (() => {
        const Ar = Math.min(aReq, h) * S
        // Both block labels sit ABOVE their own rule, on the overhang side —
        // the one stretch of the drawing with no web, no stirrup and no
        // dimension line in it. Anchored at x0 they landed on top of the cage
        // for an L, whose web IS the left edge. Clamped so a hairline-shallow
        // block does not push its label out through the top of the section.
        const lx = edge ? x0 + w - 5 : x0 + 5
        const anchor = edge ? 'end' : 'start'
        // Nudge clear of the flange soffit when the label would land on it.
        const raw = y0 + A + 10
        const aLabelY = Math.abs(raw - (y0 + hff)) < 5 ? raw + 7 : raw
        // Room the label has before it runs into the web outline: the overhang
        // it sits over. Below the soffit the label is out over air, and a text
        // wider than the overhang crosses the web line — which is what the long
        // "a = 114  (req 101)" form did on a modest 2:1 flange.
        const room = (edge ? oR : Math.max(oL, oR)) + 6
        const fits = (t: string) => t.length * 4.7 <= room
        // Separate a,req rule whenever the two are far enough apart to draw —
        // and when it IS drawn the value belongs to it alone, so the main label
        // does not carry a parenthetical repeat of the same number.
        const reqRule = aReq > 0 && A - Ar > 4
        const suffix = aReq > 0 && !reqRule && a - aReq > 0.5
          && fits(`a = ${a.toFixed(0)}  (req ${aReq.toFixed(0)})`)
          ? `  (req ${aReq.toFixed(0)})` : ''
        return (
          <g>
            <rect x={x0} y={y0} width={w} height={Math.min(A, hff)} fill="#0f4c92" opacity="0.16" />
            {A > hff && <rect x={xw} y={y0 + hff} width={wf} height={A - hff} fill="#0f4c92" opacity="0.16" />}
            <line x1={x0 - 6} y1={y0 + A} x2={x0 + w + 6} y2={y0 + A} stroke="#0f4c92" strokeWidth="1.2" strokeDasharray="5 3" />
            {/* The block the MOMENT requires, drawn whenever the rounded-up bar
                count has pushed the delivered block clear of it. a,req is the
                quantity that tracks Mu continuously; `a` only moves when a whole
                bar is added, so without this the drawing looks inert as Mu rises. */}
            {reqRule && (
              <g opacity="0.85">
                <line x1={x0 - 6} y1={y0 + Ar} x2={x0 + w + 6} y2={y0 + Ar} stroke="#0f4c92" strokeWidth="0.9" strokeDasharray="2 3" />
                <text x={lx} y={y0 + Math.max(Ar, 10) - 4} fontSize="8" fontFamily="IBM Plex Mono, monospace" fill="#0f4c92"
                  textAnchor={anchor} paintOrder="stroke" stroke="#fff" strokeWidth="2.4">a req = {aReq.toFixed(0)}</text>
              </g>
            )}
            {/* Below its own rule, so it never sits on the a,req label above it —
                and so a flange too thin to hold 8 pt of text (bf 1800 scales the
                slab to a dozen units) puts the label in the clear instead. The
                required depth rides along in the text whenever the separate rule
                is too close to draw, so a,req is never off the drawing. */}
            <text x={lx} y={aLabelY} fontSize="8.5" fontFamily="IBM Plex Mono, monospace" fill="#0f4c92"
              textAnchor={anchor} paintOrder="stroke" stroke="#fff" strokeWidth="2.6">
              a = {a.toFixed(0)}{suffix}
            </text>
          </g>
        )
      })()}
      {/* stirrup in the web */}
      <rect x={xw + inset} y={y0 + hff * 0.35} width={wf - 2 * inset} height={ht - hff * 0.35 - inset}
        rx={Math.max(2, 2 * stirrupDia * S)} fill="none" stroke="#37526e" strokeWidth={Math.max(1, stirrupDia * S)} opacity="0.8" />
      {/* 135° stirrup hooks — the tie is a bent bar with a hook at BOTH ends,
          meeting at the bottom-left (tension) corner. Each free end is a single
          hairline stroke, same weight as the tie: one bends off the bottom leg,
          the other off the left leg, straddling the corner bar into the core.
          Tail ext = max(6ds, 75) mm (ACI 318-14 §425.3.2) */}
      {barRows.length > 0 && (() => {
        const len = Math.max(6 * stirrupDia, 75) * S
        const dx = 1 / Math.SQRT2, dy = -1 / Math.SQRT2      // up-inward into core
        const cy = barRows[0].y                              // corner bar row
        const edgeY = y0 + ht - inset                        // tie bottom leg
        const leftX = xw + inset                             // tie left leg
        const sw = Math.max(1, stirrupDia * S)
        return (
          <g stroke="#37526e" strokeWidth={sw} opacity="0.8" strokeLinecap="round">
            <line x1={bx1} y1={edgeY} x2={bx1 + dx * len} y2={edgeY + dy * len} />
            <line x1={leftX} y1={cy} x2={leftX + dx * len} y2={cy + dy * len} />
          </g>
        )
      })()}
      {/* interior crossties — each added leg (legs − 2) is a C-tie that arcs OVER
          the top bar and UNDER the bottom bar it grips (§25.7.2.3). Before bars. */}
      {legs > 2 && barRows.length > 0 && (() => {
        const nCross = legs - 2, n0 = barRows[0].n
        const yTop = y0 + hff * 0.35 + inset, yBot = barRows[0].y
        const rw = br + (stirrupDia / 2) * S, stub = rw * 1.6, NS = 10
        const sw = Math.max(1, stirrupDia * S)
        return (
          <g stroke="#37526e" strokeWidth={sw} opacity="0.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
            {Array.from({ length: nCross }, (_, k) => {
              const idx = Math.min(n0 - 2, Math.max(1, Math.round(((n0 - 1) * (k + 1)) / (nCross + 1))))
              const xc = n0 <= 1 ? (bx1 + bx2) / 2 : bx1 + ((bx2 - bx1) * idx) / (n0 - 1)
              const hd = xc <= (bx1 + bx2) / 2 ? 1 : -1
              const xo = (o: number) => xc + hd * o
              const pts: [number, number][] = [[xo(rw), yTop + stub]]
              for (let j = 0; j <= NS; j++) { const t = (Math.PI * j) / NS; pts.push([xo(rw * Math.cos(t)), yTop - rw * Math.sin(t)]) }
              pts.push([xo(-rw), yBot])
              for (let j = 0; j <= NS; j++) { const t = Math.PI - (Math.PI * j) / NS; pts.push([xo(rw * Math.cos(t)), yBot + rw * Math.sin(t)]) }
              pts.push([xo(rw), yBot - stub])
              return <polyline key={k} points={pts.map((p) => p.join(',')).join(' ')} />
            })}
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
      {/* Say which section this is, so an L is not read as a T drawn off-centre.
          Top-LEFT and short: the `bf` dimension label is centred just below. */}
      <text x={x0} y={y0 - 26} fontSize="8.5" fontWeight="600" fill="#37526e" textAnchor="start">
        {edge ? 'L-BEAM (EDGE)' : 'T-BEAM'}
      </text>
      {/* dimension lines (shared template) */}
      <DimBelow xA={x0} xB={x0 + w} featY={y0} dY={y0 - 18} label={`bf = ${Math.round(bf)} mm`} />
      <DimBelow xA={xw} xB={xw + wf} featY={y0 + ht + (bars > 0 ? 18 : 4)} dY={y0 + ht + (bars > 0 ? 34 : 20)} label={`bw = ${Math.round(bw)} mm`} />
      <DimSide yA={y0} yB={y0 + ht} featX={x0 > 40 ? xw : x0} dX={Math.min(x0, xw) - 16} label={`h = ${Math.round(h)} mm`} side="left" />
      <DimSide yA={y0} yB={y0 + hff} featX={x0 + w} dX={x0 + w + 16} label={`hf = ${Math.round(hf)}`} side="right" />
    </svg>
  )
}
