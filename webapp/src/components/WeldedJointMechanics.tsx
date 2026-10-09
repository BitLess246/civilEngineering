// ─────────────────────────────────────────────────────────────────────────
// The eccentric weld group as it is BUILT — and what the check is checking.
//
// Elevation: a W column's flange face, the bracket plate lapped on it, and
// the fillet welds along the segments the page lists, drawn on the outside
// of the plate edge at their leg size. Inset: a section through one fillet,
// with the throat — the plane a fillet weld actually fails on.
//
// Overlays, one chip each, from the engine's own result:
//   Weld stress   every weld coloured by force per unit length along it
//                 (`weldForceAt` — the solver's own formula), on the FEA
//                 spectrum, scaled 0 → available, so red means at capacity
//   Forces        the resultant per-length vector at each weld end
//   Load & C      the load, the centroid, ex / ey and the torsion T
//   Throat        the inset section: legs w, throat 0.707w, the shear plane
//
// Geometry mm, y UP (the engine's convention), one scale for the elevation.
// ─────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import type { WeldSegment, WeldConnResult } from '../engine/weldedConnection'
import { weldForceAt } from '../engine/weldedConnection'
import type { AiscShape } from '../engine/aiscSections'
import { stressColor } from '../lib/stressScale'
import { maxFilletAlongEdge, flangeTipSpan } from '../lib/connectionMechanics'
import { DrawingFrame } from './DrawingFrame'

const INK = '#1e293b', NOTE = '#475569'
const STEEL_FILL = '#d5dbe3', STEEL_DARK = '#9aa6b4', PLATE = '#b9c7d8'
const WELD = '#334155', CRIT = '#dc2626', LOAD = '#16a34a', CENT = '#0e7490', SHEAR = '#c2410c'

type Overlay = 'stress' | 'forces' | 'load' | 'throat'
const CHIPS: [Overlay, string][] = [
  ['stress', 'Weld stress'], ['forces', 'Forces at weld ends'], ['load', 'Load, centroid & T'], ['throat', 'Throat (shear plane)'],
]

export interface WeldedJointMechanicsProps {
  segs: WeldSegment[]
  r: WeldConnResult
  size: number
  FEXX: number
  px: number; py: number
  P: number; angleDeg: number
  Plabel: string
  /** 'φ' or 'Ω' wording for the available strength. */
  availLabel: string
  column: AiscShape
  /** Bracket plate thickness, mm — drawing and the §J2.2b size limit. */
  tPlate: number
}

export function WeldedJointMechanics(p: WeldedJointMechanicsProps) {
  const [on, setOn] = useState<Set<Overlay>>(new Set(['stress', 'load', 'throat']))
  const toggle = (o: Overlay) => setOn((s) => { const n = new Set(s); if (n.has(o)) n.delete(o); else n.add(o); return n })
  const { segs, r } = p
  if (segs.length === 0 || r.Lw <= 0) return <p className="text-sm text-muted">Add a weld segment to draw the joint.</p>

  // ── what is welded to what ─────────────────────────────────────────────
  // Welds on two vertical lines are the FLANGE TIPS of the column: the plate
  // is lapped across the flange face and each fillet runs from a flange edge
  // onto the plate. Then the flange is exactly as wide as the lines are apart,
  // the fillet sits OUTSIDE the flange, and the part whose edge carries it
  // (the §J2.2b limit) is the flange. Any other pattern is drawn as welds
  // along the edges of the plate itself, lapped on the flange face.
  const xs = segs.flatMap((s) => [s.x1, s.x2]), ys = segs.flatMap((s) => [s.y1, s.y2])
  const sx0 = Math.min(...xs), sx1 = Math.max(...xs), sy0 = Math.min(...ys), sy1 = Math.max(...ys)
  const tipSpan = flangeTipSpan(segs)
  const tips = tipSpan != null
  const wDraw = Math.max(p.size, 0)
  const cbf = tips ? tipSpan : Math.max(p.column.bf ?? 250, sx1 - sx0 + 60)
  const cMid = (sx0 + sx1) / 2
  const cX0 = cMid - cbf / 2, cX1 = cMid + cbf / 2
  // the plate: across the welds (past the flange tips by the fillet and a
  // margin when it is lapped across the flange) and out to the load
  const lap = tips ? wDraw + 20 : 0
  const plX0 = Math.min(sx0 - lap, p.px - 30), plX1 = Math.max(sx1 + lap, p.px + 30)
  const plY0 = Math.min(sy0 - (tips ? 25 : 0), p.py - 30), plY1 = Math.max(sy1 + (tips ? 25 : 0), p.py + 30)
  const cY0 = plY0 - 70, cY1 = plY1 + 70

  const EW = 470, EH = 400
  const xMin = Math.min(cX0, plX0) - 20, xMax = Math.max(cX1, plX1) + 70
  const s = Math.min(EW / (xMax - xMin), EH / (cY1 - cY0))
  const ox = 20 - xMin * s, oy = 40 + cY1 * s
  const X = (x: number) => ox + x * s, Y = (y: number) => oy - y * s
  // fillets point AWAY from the part whose edge they run along
  const pcx = tips ? cMid : (plX0 + plX1) / 2, pcy = tips ? (sy0 + sy1) / 2 : (plY0 + plY1) / 2

  // ── the inset ──────────────────────────────────────────────────────────
  const IX = 20 + EW + 70, IW = 240
  const totalW = IX + IW + 30
  const elevBottom = Y(cY0)
  const lines = readout(p, on)
  const readY = Math.max(elevBottom, 300) + 26
  const totalH = readY + lines.length * 15 + 10

  const N = 16
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Show on the drawing">
        {CHIPS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => toggle(k)} aria-pressed={on.has(k)}
            className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium ${
              on.has(k) ? 'border-brand bg-brand text-on-solid' : 'border-field-line bg-field text-ink hover:border-brand-hover'}`}>
            {label}
          </button>
        ))}
      </div>
      <DrawingFrame label="welded bracket">
        <svg viewBox={`0 0 ${totalW} ${totalH}`} className="mx-auto block h-auto w-full" style={{ fontFamily: 'Arial, sans-serif' }}>
          <defs>
            <marker id="wjm-l" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 z" fill={LOAD} /></marker>
            <marker id="wjm-f" markerWidth="7" markerHeight="7" refX="6" refY="2.5" orient="auto"><path d="M0 0 L6 2.5 L0 5 z" fill={WELD} /></marker>
            <marker id="wjm-c" markerWidth="7" markerHeight="7" refX="6" refY="2.5" orient="auto"><path d="M0 0 L6 2.5 L0 5 z" fill={CRIT} /></marker>
            <marker id="wjm-t" markerWidth="7" markerHeight="7" refX="6" refY="2.5" orient="auto"><path d="M0 0 L6 2.5 L0 5 z" fill={CENT} /></marker>
          </defs>
          <text x={20} y={20} fontSize={11} fontWeight={700} fill={INK}>ELEVATION — bracket plate welded to a column flange</text>

          {/* column flange face, web behind it on the centreline */}
          <rect x={X(cX0)} y={Y(cY1)} width={cbf * s} height={(cY1 - cY0) * s} fill={STEEL_FILL} stroke={INK} strokeWidth={0.9} />
          <line x1={X(cMid)} y1={Y(cY1)} x2={X(cMid)} y2={Y(cY0)} stroke={STEEL_DARK} strokeWidth={1} strokeDasharray="8 4" />
          <text x={X(cX0) + 4} y={Y(cY0) - 6} fontSize={9.5} fill={NOTE}>{p.column.name} flange · bf {Math.round(p.column.bf ?? cbf)}{tips ? ` (drawn ${Math.round(cbf)}, the weld spacing)` : ''}</text>

          {/* the bracket plate — lapped across the flange (seen through, so the
              flange tips and their welds behind it read) or on its face */}
          <rect x={X(plX0)} y={Y(plY1)} width={(plX1 - plX0) * s} height={(plY1 - plY0) * s} fill={PLATE} fillOpacity={tips ? 0.45 : 0.94} stroke={INK} strokeWidth={1.2} />
          {tips && <>
            <line x1={X(cX0)} y1={Y(plY1)} x2={X(cX0)} y2={Y(plY0)} stroke={INK} strokeWidth={0.9} strokeDasharray="5 3" />
            <line x1={X(cX1)} y1={Y(plY1)} x2={X(cX1)} y2={Y(plY0)} stroke={INK} strokeWidth={0.9} strokeDasharray="5 3" />
            <text x={X(cMid)} y={Y(plY1) - 6} fontSize={9} fill={NOTE} textAnchor="middle">flange tips {Math.round(cbf)} apart (behind the plate)</text>
          </>}
          <text x={X(plX1) - 4} y={Y(plY0) - 6} fontSize={9.5} fill={NOTE} textAnchor="end">PL {Math.round(plX1 - plX0)}×{Math.round(plY1 - plY0)}×{p.tPlate}</text>

          {/* the welds: a fillet of leg w on the outside of each segment */}
          {segs.map((g) => {
            const dx = g.x2 - g.x1, dy = g.y2 - g.y1, L = Math.hypot(dx, dy) || 1
            let nx = -dy / L, ny = dx / L
            const mx = (g.x1 + g.x2) / 2, my = (g.y1 + g.y2) / 2
            if ((mx - pcx) * nx + (my - pcy) * ny < 0) { nx = -nx; ny = -ny }
            const wPx = Math.max(4, wDraw * s)
            const quads = Array.from({ length: N }, (_, k) => {
              const a = k / N, b = (k + 1) / N
              const ax = g.x1 + dx * a, ay = g.y1 + dy * a, bx = g.x1 + dx * b, by = g.y1 + dy * b
              const f = weldForceAt(r, (ax + bx) / 2, (ay + by) / 2).f
              const col = on.has('stress') ? stressColor(Math.min(1, f / Math.max(r.capacityPerLen, 1e-9)), false) : WELD
              const pts = [[X(ax), Y(ay)], [X(bx), Y(by)], [X(bx) + nx * wPx, Y(by) - ny * wPx], [X(ax) + nx * wPx, Y(ay) - ny * wPx]]
              return <polygon key={k} points={pts.map((q) => q.join(',')).join(' ')} fill={col} stroke={col} strokeWidth={0.4} />
            })
            return (
              <g key={g.id}>
                {quads}
                <text x={X(mx) + nx * (wPx + 10)} y={Y(my) - ny * (wPx + 10) + 3} fontSize={10} fill={INK} fontWeight={700} textAnchor="middle">{g.id}</text>
              </g>
            )
          })}

          {/* forces at the weld ends */}
          {on.has('forces') && r.points.map((q, k) => {
            const crit = k === r.criticalIndex
            const L = 14 + 34 * (q.f / Math.max(r.fMax, 1e-9))
            const u = Math.hypot(q.fx, q.fy) || 1
            return (
              <g key={k}>
                <line x1={X(q.x)} y1={Y(q.y)} x2={X(q.x) + (q.fx / u) * L} y2={Y(q.y) - (q.fy / u) * L}
                  stroke={crit ? CRIT : WELD} strokeWidth={1.6} markerEnd={`url(#${crit ? 'wjm-c' : 'wjm-f'})`} />
                {crit && <text x={X(q.x) + (q.fx / u) * L + 4} y={Y(q.y) - (q.fy / u) * L} fontSize={9.5} fill={CRIT} fontWeight={700}>f max {q.f.toFixed(0)} N/mm</text>}
              </g>
            )
          })}

          {/* the load, the centroid, the eccentricities, the torsion */}
          {on.has('load') && (() => {
            const a = (p.angleDeg * Math.PI) / 180
            const L = 56
            const T = r.T
            const rC = 22
            return (
              <g>
                <line x1={X(p.px)} y1={Y(p.py)} x2={X(p.px) + Math.cos(a) * L} y2={Y(p.py) - Math.sin(a) * L} stroke={LOAD} strokeWidth={2.2} markerEnd="url(#wjm-l)" />
                <circle cx={X(p.px)} cy={Y(p.py)} r={3} fill={LOAD} />
                <text x={X(p.px) + Math.cos(a) * L + 6} y={Y(p.py) - Math.sin(a) * L} fontSize={10} fill={LOAD} fontWeight={700}>{p.Plabel} {p.P.toFixed(0)} kN</text>
                <circle cx={X(r.Cx)} cy={Y(r.Cy)} r={5} fill="none" stroke={CENT} strokeWidth={1.4} />
                <line x1={X(r.Cx) - 8} y1={Y(r.Cy)} x2={X(r.Cx) + 8} y2={Y(r.Cy)} stroke={CENT} strokeWidth={1} />
                <line x1={X(r.Cx)} y1={Y(r.Cy) - 8} x2={X(r.Cx)} y2={Y(r.Cy) + 8} stroke={CENT} strokeWidth={1} />
                <text x={X(r.Cx) + 7} y={Y(r.Cy) - 8} fontSize={10} fill={CENT} fontWeight={700}>C</text>
                <line x1={X(r.Cx)} y1={Y(r.Cy)} x2={X(p.px)} y2={Y(r.Cy)} stroke={CENT} strokeWidth={0.8} strokeDasharray="4 3" />
                <text x={(X(r.Cx) + X(p.px)) / 2} y={Y(r.Cy) + 12} fontSize={9.5} fill={CENT} textAnchor="middle">ex {r.ex.toFixed(0)}</text>
                {Math.abs(r.ey) > 1 && <>
                  <line x1={X(p.px)} y1={Y(r.Cy)} x2={X(p.px)} y2={Y(p.py)} stroke={CENT} strokeWidth={0.8} strokeDasharray="4 3" />
                  <text x={X(p.px) + 4} y={(Y(r.Cy) + Y(p.py)) / 2} fontSize={9.5} fill={CENT}>ey {r.ey.toFixed(0)}</text>
                </>}
                {Math.abs(T) > 1e-6 && (() => {
                  const ccw = T > 0
                  const a0 = ccw ? -0.6 : 0.6, a1 = ccw ? 3.6 : -3.6
                  const P0 = [X(r.Cx) + rC * Math.cos(a0), Y(r.Cy) - rC * Math.sin(a0)]
                  const P1 = [X(r.Cx) + rC * Math.cos(a1), Y(r.Cy) - rC * Math.sin(a1)]
                  return <>
                    <path d={`M${P0[0]} ${P0[1]} A${rC} ${rC} 0 1 ${ccw ? 0 : 1} ${P1[0]} ${P1[1]}`} fill="none" stroke={CENT} strokeWidth={1.3} markerEnd="url(#wjm-t)" />
                    <text x={X(r.Cx) - rC - 4} y={Y(r.Cy) - rC} fontSize={9.5} fill={CENT} textAnchor="end">T {(T / 1000).toFixed(1)} kN·m</text>
                  </>
                })()}
              </g>
            )
          })()}

          {/* the colour key */}
          {on.has('stress') && (() => {
            const kx = X(xMax) - 14, ky0 = Y(cY1) + 10, kh = 150
            return (
              <g>
                {Array.from({ length: 24 }, (_, k) => (
                  <rect key={k} x={kx} y={ky0 + kh - ((k + 1) / 24) * kh} width={10} height={kh / 24 + 0.5} fill={stressColor((k + 0.5) / 24, false)} />
                ))}
                <text x={kx - 3} y={ky0 + 4} fontSize={8.5} fill={NOTE} textAnchor="end">{r.capacityPerLen.toFixed(0)} N/mm (available)</text>
                <text x={kx - 3} y={ky0 + kh} fontSize={8.5} fill={NOTE} textAnchor="end">0</text>
              </g>
            )
          })()}

          {/* the throat inset */}
          {on.has('throat') && (() => {
            const w = Math.max(p.size, 1), tp = Math.max(p.tPlate, 1), tf = Math.max(p.column.tf ?? 14, 1)
            const span = Math.max(3 * w, tp + w) * 1.6
            const k = Math.min((IW - 40) / (span * 2), 150 / (tp + tf + w))
            const ix0 = IX + IW / 2, iy0 = 80 + (tp + w * 0.6) * k     // root of the fillet, page
            const PX = (x: number) => ix0 + x * k, PY = (y: number) => iy0 - y * k
            const leg = w                               // the leg as designed — never trimmed to fit
            const edgeLabel = tips ? 'flange (edge carries the weld)' : 'plate (edge carries the weld)'
            const faceLabel = tips ? 'bracket plate (face)' : 'column flange (face)'
            const tEdge = tips ? tf : tp, tFace = tips ? tp : tf
            const th = 0.7071 * leg
            return (
              <g>
                <text x={IX} y={20} fontSize={11} fontWeight={700} fill={INK}>SECTION THROUGH A FILLET</text>
                <text x={IX} y={33} fontSize={9} fill={NOTE}>across a weld line · enlarged</text>
                <rect x={PX(-span)} y={PY(0)} width={2 * span * k} height={tFace * k} fill={tips ? PLATE : STEEL_FILL} stroke={INK} strokeWidth={0.9} />
                <text x={PX(span) - 3} y={PY(-tFace) - 3} fontSize={8.5} fill={NOTE} textAnchor="end">{faceLabel} {Math.round(tFace)}</text>
                <rect x={PX(0)} y={PY(tEdge)} width={span * k} height={tEdge * k} fill={tips ? STEEL_FILL : PLATE} stroke={INK} strokeWidth={0.9} />
                <text x={PX(span) - 3} y={PY(tEdge) - 4} fontSize={8.5} fill={NOTE} textAnchor="end">{edgeLabel} {Math.round(tEdge)}</text>
                <polygon points={`${PX(0)},${PY(0)} ${PX(-leg)},${PY(0)} ${PX(0)},${PY(leg)}`} fill={WELD} fillOpacity={0.85} stroke={INK} strokeWidth={0.8} />
                <line x1={PX(0)} y1={PY(0)} x2={PX(-leg / 2)} y2={PY(leg / 2)} stroke={SHEAR} strokeWidth={2.4} strokeDasharray="4 2" />
                <text x={PX(-leg / 2) - 6} y={PY(leg / 2) - 6} fontSize={9.5} fill={SHEAR} fontWeight={700} textAnchor="end">throat {th.toFixed(2)}</text>
                <text x={PX(-leg / 2)} y={PY(0) + 12} fontSize={9} fill={NOTE} textAnchor="middle">w {p.size}</text>
                <text x={PX(0) + 4} y={PY(leg / 2) + 3} fontSize={9} fill={NOTE}>w</text>
                <text x={IX} y={PY(-(tips ? tp : tf)) + 26} fontSize={9.5} fill={SHEAR}>shear plane: 0.707w × 1 mm per mm of weld</text>
                <text x={IX} y={PY(-(tips ? tp : tf)) + 40} fontSize={9.5} fill={SHEAR}>Rn = 0.60·F_EXX·0.707w = {(0.6 * p.FEXX * 0.7071 * p.size).toFixed(0)} N/mm</text>
              </g>
            )
          })()}

          {lines.map((l, k) => (
            <text key={k} x={20} y={readY + k * 15} fontSize={10} fill={l.color} fontWeight={l.bold ? 700 : 400}>{l.text}</text>
          ))}
        </svg>
      </DrawingFrame>
    </div>
  )
}

interface Line { text: string; color: string; bold?: boolean }
function readout(p: WeldedJointMechanicsProps, on: Set<Overlay>): Line[] {
  const r = p.r
  const L: Line[] = []
  if (on.has('stress') || on.has('forces')) {
    const c = r.points[r.criticalIndex]
    L.push({ text: `Peak force per length f max = ${r.fMax.toFixed(0)} N/mm at (${c.x}, ${c.y}) vs ${p.availLabel} ${r.capacityPerLen.toFixed(0)} N/mm — ${(r.fMax / Math.max(r.capacityPerLen, 1e-9) * 100).toFixed(0)} % used. The colour runs 0 → available, so red is at capacity.`, color: r.ok ? NOTE : CRIT, bold: true })
  }
  const span = flangeTipSpan(p.segs)
  if (span != null) {
    L.push({ text: `Welds on the flange tips: the plate is lapped across the ${p.column.name} flange and each fillet runs from a flange edge onto the plate.`, color: NOTE })
    if (Math.abs((p.column.bf ?? span) - span) > 2) L.push({ text: `The weld lines are ${span} mm apart but the ${p.column.name} flange is ${p.column.bf} mm wide — the welds must sit on its tips: pick a column with bf ≈ ${span}, or move the lines.`, color: CRIT, bold: true })
  }
  if (on.has('load')) {
    L.push({ text: `Lw = ${r.Lw.toFixed(0)} mm, centroid C (${r.Cx.toFixed(1)}, ${r.Cy.toFixed(1)}); ex ${r.ex.toFixed(1)}, ey ${r.ey.toFixed(1)} mm → T = Py·ex − Px·ey = ${(r.T / 1000).toFixed(2)} kN·m about C.`, color: CENT })
  }
  if (on.has('throat')) {
    L.push({ text: `A fillet fails on its THROAT, the shortest plane through the root: 0.707 × ${p.size} = ${r.throat.toFixed(2)} mm (§J2.2a). Strength per mm = 0.60·F_EXX·throat (§J2.4).`, color: SHEAR, bold: true })
    const tips = flangeTipSpan(p.segs) != null
    const tEdge = tips ? (p.column.tf ?? 14) : p.tPlate
    const wMax = maxFilletAlongEdge(tEdge)
    if (p.size > wMax) L.push({ text: `§J2.2b: along a ${tEdge} mm ${tips ? 'flange tip' : 'plate edge'} the fillet may be at most ${wMax} mm — ${p.size} mm is oversize.`, color: CRIT, bold: true })
  }
  return L
}
