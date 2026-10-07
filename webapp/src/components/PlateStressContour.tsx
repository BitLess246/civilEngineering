// ─────────────────────────────────────────────────────────────────────────
// A connection plate's von Mises field (`engine/connectionPlateFE`): the
// plate as meshed, each element in the band of its corner-averaged nodal
// stress on a 0 → Fy scale, the part above Fy in its own colour; holes,
// welded edges and the applied forces drawn over it.
//
// The ramp is the FEA spectrum `lib/stressScale` paints every other contour
// in — fixed data colours, the same in every theme.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { tabPlateFE, gussetPlateFE, type ConnectionPlateFE } from '../engine/connectionPlateFE'
import type { BeamConnection } from '../engine/steelConnections'
import type { SteelBraceScheduleRow } from '../engine/pipeline'
import { stressColor, bandCenter, rampSwatches, DEFAULT_BANDS } from '../lib/stressScale'

/** Above Fy: outside the ramp, so a yielded region never reads as "high". */
const OVER = 'rgb(214,51,214)'
const BANDS = DEFAULT_BANDS

export function PlateStressContour({ plate, title, flipY = true }: {
  plate: ConnectionPlateFE
  title: string
  /** The plate's y runs UP (true: tab, gusset rising from its beam) or down. */
  flipY?: boolean
}) {
  const { fe, Fy } = plate
  // the ramp spans 0 → Fy, the yielded part in its own colour; a plate that
  // never reaches Fy spans 0 → its own peak, or its field would read as one blue
  const top = fe.maxVm >= Fy ? Fy : Math.max(fe.maxVm, 1e-9)
  const view = useMemo(() => {
    const xs = fe.nodes.map((p) => p[0]), ys = fe.nodes.map((p) => p[1])
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const span = Math.max(x1 - x0, y1 - y0)
    const pad = span * 0.12
    const Y = (y: number) => (flipY ? y1 + y0 - y : y)
    const polys = fe.elems.map((e) => {
      const v = e.nodes.reduce((s, k) => s + fe.nodalVm[k], 0) / e.nodes.length
      const fill = v > Fy ? OVER : stressColor(bandCenter(v / top, BANDS), false)
      return { pts: e.nodes.map((k) => `${fe.nodes[k][0].toFixed(2)},${Y(fe.nodes[k][1]).toFixed(2)}`).join(' '), fill }
    })
    const fmax = Math.max(1, ...plate.forces.map((f) => Math.hypot(f.Fx, f.Fy)))
    const arrows = plate.forces.map((f) => {
      const L = (span * 0.14 * Math.hypot(f.Fx, f.Fy)) / fmax
      const m = Math.hypot(f.Fx, f.Fy) || 1
      const dx = (f.Fx / m) * L, dy = (-(flipY ? 1 : -1) * f.Fy / m) * L
      return { x: f.at[0], y: Y(f.at[1]), dx, dy }
    })
    return { x0: x0 - pad, y0: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad, Y, polys, arrows, span }
  }, [fe, Fy, top, flipY, plate.forces])
  const s = view.span / 200
  const peak = fe.maxVm
  const swatches = rampSwatches(BANDS, false, BANDS)

  return (
    // no DrawingFrame: the field carries no in-figure text to keep legible —
    // its readings are the HTML beside it — so it may scale freely
    <figure className="rounded-lg border border-hairline bg-sheet p-2">
        <div className="mb-1 text-[12px] font-semibold text-ink">{title} — von Mises stress, linear elastic FE</div>
        <div className="mb-1 text-[11px] text-muted">{plate.kind === 'tab'
          ? 'Welded along its left edge (hatched); each bolt bears down on its hole with Vu/n, so the tab works as a cantilever from its weld.'
          : 'Welded along its frame edges (hatched); the brace force enters along the two slot welds, half on each.'}</div>
        <svg viewBox={`${view.x0} ${view.y0} ${view.w} ${view.h}`} className="h-auto w-full max-w-[640px]" role="img"
          aria-label={`${title}: peak von Mises ${peak.toFixed(0)} MPa against Fy ${Fy} MPa`}>
          <defs>
            <marker id="pfe-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
          </defs>
          <g className="text-ink">
            {view.polys.map((p, i) => <polygon key={i} points={p.pts} fill={p.fill} stroke={p.fill} strokeWidth={s * 0.15} />)}
            <polygon points={plate.outline.map((p) => `${p[0]},${view.Y(p[1])}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={s * 1.2} />
            {plate.holes.map((h, i) => <circle key={i} cx={h.x} cy={view.Y(h.y)} r={h.d / 2} fill="none" stroke="currentColor" strokeWidth={s * 0.8} />)}
            {plate.welds.map(([a, b], i) => (
              <line key={i} x1={a[0]} y1={view.Y(a[1])} x2={b[0]} y2={view.Y(b[1])} stroke="currentColor" strokeWidth={s * 4} strokeDasharray={`${s * 3} ${s * 1.5}`} />
            ))}
            {view.arrows.map((a, i) => (
              <line key={i} x1={a.x - a.dx} y1={a.y - a.dy} x2={a.x} y2={a.y} stroke="currentColor" strokeWidth={s * 1.1} markerEnd="url(#pfe-arrow)" />
            ))}
            <circle cx={fe.maxAt[0]} cy={view.Y(fe.maxAt[1])} r={s * 3} fill="none" stroke="currentColor" strokeWidth={s * 1} />
          </g>
        </svg>
        <div className="mt-1 flex flex-wrap items-end gap-4">
          <div>
            <div className="flex h-3 w-48 overflow-hidden rounded-sm border border-hairline">
              {swatches.map((c, i) => <div key={i} className="h-full flex-1" style={{ background: c }} />)}
              {top === Fy && <div className="h-full w-4" style={{ background: OVER }} />}
            </div>
            <div className="mt-0.5 flex w-48 justify-between text-[10px] tabular-nums text-muted">
              <span>0</span><span>{(top / 2).toFixed(top < 10 ? 1 : 0)}</span><span>{top === Fy ? `Fy ${Fy}` : top.toFixed(top < 10 ? 1 : 0)} MPa</span>
            </div>
            {top === Fy && <div className="text-[10px] text-muted">magenta: above Fy</div>}
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 text-[11px] tabular-nums text-ink-2">
            <dt className="text-muted">peak σvm</dt>
            <dd>{peak.toFixed(0)} MPa ({((peak / Fy) * 100).toFixed(0)}% Fy) — circled{plate.peakAtHole ? ', at a bolt hole: bearing, checked by §J3.10' : ''}</dd>
            <dt className="text-muted">{plate.holes.length ? 'clear of holes, weld ends' : 'clear of weld ends'}</dt>
            <dd>{plate.peakAway.toFixed(plate.peakAway < 10 ? 1 : 0)} MPa ({((plate.peakAway / Fy) * 100).toFixed(0)}% Fy)</dd>
            <dt className="text-muted">mean σvm</dt><dd>{fe.meanVm.toFixed(fe.meanVm < 10 ? 1 : 0)} MPa</dd>
            <dt className="text-muted">area above Fy</dt><dd>{(fe.yieldFrac * 100).toFixed(1)}%</dd>
            <dt className="text-muted">mesh</dt><dd>{fe.elems.length} elements, t = {plate.t} mm</dd>
          </dl>
        </div>
    </figure>
  )
}

/** The shear tab of a designed connection. A solve is ~0.3 s, so the page
 *  mounts this only for a row the reader opened, never for every row a bulk
 *  report expands. */
export function TabStressContour({ conn }: { conn: BeamConnection }) {
  const plate = useMemo(() => tabPlateFE(conn), [conn])
  if (!plate) return null
  return <PlateStressContour plate={plate} title={`Tab PL ${conn.tab.t} × ${Math.round(conn.tab.hMm)} — ${conn.beamId}`} />
}

/** Both gussets of a designed brace. */
export function GussetStressContours({ row }: { row: SteelBraceScheduleRow }) {
  const plates = useMemo(() => row.ends.map((e) => ({ e, plate: gussetPlateFE(e.design, e.frame) })), [row])
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {plates.map(({ e, plate }) => plate && (
        // the gusset's own y runs away from its beam: up off a base or a
        // lower beam, down from a beam it hangs under — as the detail draws it
        <PlateStressContour key={e.node} plate={plate} title={`Gusset PL ${e.design.tg} at ${e.node}`} flipY={!e.frame.upper} />
      ))}
    </div>
  )
}
