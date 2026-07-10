// 2D SVG plan view of a bolt/weld group on the connection plate.
// Coordinate system: origin at bottom-left of plate, Y up.
// SVG has Y inverted (origin top-left) so we flip: svgY = H_px - plateY * scale.
//
// The drawing is SELF-SUFFICIENT: the display plate is derived from the
// actual (absolute) bolt positions plus an edge margin, so custom layouts
// (boltGeomFromPositions — whose plateW/H are bolt extents with no origin)
// render correctly; a grid geometry whose declared plate already covers the
// bolts keeps its own plate. The canvas always includes the load point.

import type { BoltGroupGeom, BoltForce } from '../engine/steelDesign'
import { DimBelow, DimSide } from './dims'

const EDGE = 40   // display edge margin around the outermost bolts, mm

function label(x: number, y: number, text: string, color = '#475569', fs = 10, anchor: 'middle' | 'start' | 'end' = 'middle') {
  return <text x={x} y={y} textAnchor={anchor} fill={color} fontSize={fs} fontFamily="monospace"
    paintOrder="stroke" stroke="#fff" strokeWidth={2.4}>{text}</text>
}

export function ConnectionDrawing({ geom, db, boltForces, critical, Vu, Hu, ex_load, ey_load, connType = 'bolt' }: {
  geom: BoltGroupGeom
  db: number
  boltForces?: BoltForce[]
  critical?: string
  Vu: number; Hu: number
  ex_load: number; ey_load: number
  connType?: 'bolt' | 'weld'
}) {
  // absolute bolt positions (plate coords, bottom-left origin, Y up)
  const abs = geom.bolts.map((b) => ({ id: b.id, x: b.x + geom.Cx, y: b.y + geom.Cy }))
  const loadX = geom.Cx + ex_load, loadY = geom.Cy + ey_load

  // display plate: the declared plate when it already covers every bolt
  // (grid geometries), else bolt bounds + EDGE margin (custom layouts)
  const bx0 = Math.min(...abs.map((b) => b.x)), bx1 = Math.max(...abs.map((b) => b.x))
  const by0 = Math.min(...abs.map((b) => b.y)), by1 = Math.max(...abs.map((b) => b.y))
  const declaredCovers = abs.length > 0 && bx0 >= 0 && by0 >= 0 && bx1 <= geom.plateW && by1 <= geom.plateH
  const px0 = declaredCovers ? 0 : bx0 - EDGE
  const py0 = declaredCovers ? 0 : by0 - EDGE
  const px1 = declaredCovers ? geom.plateW : bx1 + EDGE
  const py1 = declaredCovers ? geom.plateH : by1 + EDGE
  const pw_mm = Math.max(px1 - px0, 1), ph_mm = Math.max(py1 - py0, 1)

  // canvas covers plate ∪ load point (in plate coords), plus dim/label room
  const vx0 = Math.min(px0, loadX) - 10, vx1 = Math.max(px1, loadX) + 10
  const vy0 = Math.min(py0, loadY) - 10, vy1 = Math.max(py1, loadY) + 10

  const DISP_W = 340
  const PAD_L = 64, PAD_R = 24, PAD_T = 40, PAD_B = 44
  const scale = Math.min((DISP_W - PAD_L - PAD_R) / (vx1 - vx0), (DISP_W - PAD_T - PAD_B) / (vy1 - vy0))
  const svgW = (vx1 - vx0) * scale + PAD_L + PAD_R
  const svgH = (vy1 - vy0) * scale + PAD_T + PAD_B

  const tx = (xmm: number) => PAD_L + (xmm - vx0) * scale
  const ty = (ymm: number) => PAD_T + (vy1 - ymm) * scale

  const r = Math.max((db / 2) * scale, 3)
  const X0 = tx(px0), X1 = tx(px1), Y0 = ty(py1), Y1 = ty(py0)   // plate rect in px (Y0 = top)

  return (
    <div className="print-avoid-break rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
        Connection face — {connType === 'bolt' ? 'bolt layout' : 'weld layout'}
      </h3>
      <svg width="100%" style={{ maxWidth: svgW * 1.15 }} viewBox={`0 0 ${svgW} ${svgH}`} className="h-auto">
        {/* plate */}
        <rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} fill="#f1f5f9" stroke="#334155" strokeWidth={1.5} rx={1} />

        {/* plate dimensions — shared architectural-tick primitives */}
        <DimBelow xA={X0} xB={X1} featY={Y1} dY={Y1 + 22} label={`${Math.round(pw_mm)} mm`} />
        <DimSide yA={Y0} yB={Y1} featX={X0} dX={X0 - 26} label={`${Math.round(ph_mm)} mm`} side="left" />

        {connType === 'bolt' ? (
          <>
            {abs.map((b) => {
              const bfEntry = boltForces?.find((bf) => bf.id === b.id)
              const isCrit = b.id === critical
              const cx = tx(b.x), cy = ty(b.y)
              const util = bfEntry?.utilShear ?? 0
              const holeColor = isCrit ? '#dc2626' : util > 0.8 ? '#f59e0b' : '#334155'
              return (
                <g key={b.id}>
                  <circle cx={cx} cy={cy} r={r} fill="white" stroke={holeColor} strokeWidth={isCrit ? 2 : 1} />
                  <line x1={cx - r - 2} y1={cy} x2={cx + r + 2} y2={cy} stroke={holeColor} strokeWidth={0.6} />
                  <line x1={cx} y1={cy - r - 2} x2={cx} y2={cy + r + 2} stroke={holeColor} strokeWidth={0.6} />
                  {bfEntry && bfEntry.R > 0.01 && (() => {
                    const sc = 22 / Math.max(...(boltForces?.map((f) => f.R) ?? [1]))
                    const dx = bfEntry.Vx * sc, dy = -bfEntry.Vy * sc
                    return <line x1={cx} y1={cy} x2={cx + dx} y2={cy + dy}
                      stroke={isCrit ? '#dc2626' : '#3b82f6'} strokeWidth={1.4} markerEnd="url(#arrow)" />
                  })()}
                  {/* id top-left of the hole, force bottom-right — no stacking collisions */}
                  {label(cx - r - 3, cy - r - 1, b.id, isCrit ? '#dc2626' : '#475569', 9, 'end')}
                  {bfEntry && label(cx + r + 3, cy + r + 8, `${bfEntry.R.toFixed(1)}kN`, isCrit ? '#dc2626' : '#64748b', 8, 'start')}
                </g>
              )
            })}
          </>
        ) : (
          <>
            {/* weld lines (two vertical welds on plate edges) */}
            <line x1={X0 + 3} y1={Y0 + 4} x2={X0 + 3} y2={Y1 - 4} stroke="#f59e0b" strokeWidth={4} />
            <line x1={X1 - 3} y1={Y0 + 4} x2={X1 - 3} y2={Y1 - 4} stroke="#f59e0b" strokeWidth={4} />
            {label((X0 + X1) / 2, (Y0 + Y1) / 2, 'Weld', '#d97706', 11)}
            {label((X0 + X1) / 2, (Y0 + Y1) / 2 + 14, `L = ${Math.round(ph_mm)} mm ea.`, '#d97706', 9)}
          </>
        )}

        {/* centroid mark */}
        <g stroke="#059669" strokeWidth={1}>
          <circle cx={tx(geom.Cx)} cy={ty(geom.Cy)} r={3.5} fill="none" />
          <line x1={tx(geom.Cx) - 7} y1={ty(geom.Cy)} x2={tx(geom.Cx) + 7} y2={ty(geom.Cy)} />
          <line x1={tx(geom.Cx)} y1={ty(geom.Cy) - 7} x2={tx(geom.Cx)} y2={ty(geom.Cy) + 7} />
        </g>

        {/* load application point, eccentricity trace & force arrows */}
        {(() => {
          const lx = tx(loadX), ly = ty(loadY)
          // keep the label inside the canvas: grow leftwards when the load
          // point sits on the right half of the drawing
          const onRight = loadX > (vx0 + vx1) / 2
          return (
            <g>
              <line x1={tx(geom.Cx)} y1={ty(geom.Cy)} x2={lx} y2={ly} stroke="#16a34a" strokeWidth={0.8} strokeDasharray="4,3" />
              <circle cx={lx} cy={ly} r={4} fill="none" stroke="#16a34a" strokeWidth={1.5} strokeDasharray="3,2" />
              {Vu !== 0 && <line x1={lx} y1={ly - 22} x2={lx} y2={ly - 6}
                stroke="#16a34a" strokeWidth={1.5} markerEnd="url(#arrow)" />}
              {Hu !== 0 && <line x1={lx + (Hu > 0 ? -22 : 22)} y1={ly} x2={lx + (Hu > 0 ? -6 : 6)} y2={ly}
                stroke="#16a34a" strokeWidth={1.5} markerEnd="url(#arrow)" />}
              {label(onRight ? lx - 7 : lx + 7, ly - 24, `P @ (${Math.round(loadX)}, ${Math.round(loadY)})`, '#15803d', 8.5, onRight ? 'end' : 'start')}
            </g>
          )
        })()}

        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#1d4ed8" />
          </marker>
        </defs>
      </svg>
    </div>
  )
}
