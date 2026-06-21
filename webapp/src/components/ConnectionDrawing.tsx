// 2D SVG plan view of a bolt/weld group on the connection plate.
// Coordinate system: origin at bottom-left of plate, Y up.
// SVG has Y inverted (origin top-left) so we flip: svgY = H_px - plateY * scale.

import type { BoltGroupGeom, BoltForce } from '../engine/steelDesign'

const PAD = 36  // px around the plate

function label(x: number, y: number, text: string, color = '#475569', fs = 10, anchor: 'middle' | 'start' | 'end' = 'middle') {
  return <text x={x} y={y} textAnchor={anchor} fill={color} fontSize={fs} fontFamily="monospace">{text}</text>
}

function dimLine(x1: number, y1: number, x2: number, y2: number, text: string, offset: [number, number]) {
  const mx = (x1 + x2) / 2 + offset[0], my = (y1 + y2) / 2 + offset[1]
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="3,2" />
      <text x={mx} y={my} textAnchor="middle" fill="#64748b" fontSize={9} fontFamily="monospace">{text}</text>
    </g>
  )
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
  const DISP_W = 260
  const scale = Math.min((DISP_W - 2 * PAD) / geom.plateW, (DISP_W - 2 * PAD) / geom.plateH)
  const pw = geom.plateW * scale, ph = geom.plateH * scale
  const svgW = pw + 2 * PAD, svgH = ph + 2 * PAD

  const tx = (xmm: number) => PAD + xmm * scale
  const ty = (ymm: number) => PAD + (geom.plateH - ymm) * scale

  const r = (db / 2) * scale

  // load application point in plate coords (from bottom-left)
  const loadX = geom.Cx + ex_load, loadY = geom.Cy + ey_load

  return (
    <div className="print-avoid-break rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
        Connection face — {connType === 'bolt' ? 'bolt layout' : 'weld layout'}
      </h3>
      <svg width={svgW} height={svgH + 16} viewBox={`0 0 ${svgW} ${svgH + 16}`}>
        {/* plate */}
        <rect x={PAD} y={PAD} width={pw} height={ph} fill="#f1f5f9" stroke="#334155" strokeWidth={1.5} rx={1} />

        {/* dimension lines */}
        {dimLine(PAD, svgH, PAD + pw, svgH, `${geom.plateW} mm`, [0, 12])}
        {dimLine(PAD - 18, PAD, PAD - 18, PAD + ph, `${geom.plateH} mm`, [-16, 0])}

        {connType === 'bolt' ? (
          <>
            {/* bolt holes */}
            {geom.bolts.map(b => {
              const bfEntry = boltForces?.find(bf => bf.id === b.id)
              const isCrit = b.id === critical
              const bxPl = b.x + geom.Cx, byPl = b.y + geom.Cy
              const cx = tx(bxPl), cy = ty(byPl)
              const util = bfEntry?.utilShear ?? 0
              const holeColor = isCrit ? '#dc2626' : util > 0.8 ? '#f59e0b' : '#334155'
              return (
                <g key={b.id}>
                  {/* hole */}
                  <circle cx={cx} cy={cy} r={r} fill="white" stroke={holeColor} strokeWidth={isCrit ? 2 : 1} />
                  {/* force arrow proportional to R */}
                  {bfEntry && bfEntry.R > 0.01 && (() => {
                    const sc = 25 / Math.max(...(boltForces?.map(f => f.R) ?? [1]))
                    const dx = bfEntry.Vx * sc, dy = -bfEntry.Vy * sc
                    return <line x1={cx} y1={cy} x2={cx + dx} y2={cy + dy}
                      stroke={isCrit ? '#dc2626' : '#3b82f6'} strokeWidth={1.4}
                      markerEnd="url(#arrow)" />
                  })()}
                  {label(cx, cy - r - 2, b.id, isCrit ? '#dc2626' : '#475569', 9)}
                  {bfEntry && label(cx, cy + r + 9, `${bfEntry.R.toFixed(1)}kN`, isCrit ? '#dc2626' : '#64748b', 8)}
                </g>
              )
            })}
            {/* edge distance labels for first bolt */}
            {geom.bolts.length > 0 && (() => {
              const b0 = { x: geom.bolts[0].x + geom.Cx, y: geom.bolts[0].y + geom.Cy }
              return (
                <>
                  {dimLine(PAD, ty(b0.y), tx(b0.x), ty(b0.y), `ex=${b0.x.toFixed(0)}`, [0, -7])}
                  {dimLine(tx(b0.x), PAD + ph, tx(b0.x), ty(b0.y), `ey=${b0.y.toFixed(0)}`, [18, 0])}
                </>
              )
            })()}
          </>
        ) : (
          <>
            {/* weld lines (two vertical welds on plate edges) */}
            <line x1={PAD + 3} y1={PAD + 4} x2={PAD + 3} y2={PAD + ph - 4} stroke="#f59e0b" strokeWidth={4} />
            <line x1={PAD + pw - 3} y1={PAD + 4} x2={PAD + pw - 3} y2={PAD + ph - 4} stroke="#f59e0b" strokeWidth={4} />
            {label(PAD + pw / 2, PAD + ph / 2, 'Weld', '#d97706', 11)}
            {label(PAD + pw / 2, PAD + ph / 2 + 14, `L = ${geom.plateH.toFixed(0)} mm ea.`, '#d97706', 9)}
          </>
        )}

        {/* load application point & eccentricity */}
        {(() => {
          const lx = tx(loadX), ly = ty(loadY)
          return (
            <g>
              <circle cx={lx} cy={ly} r={4} fill="none" stroke="#16a34a" strokeWidth={1.5} strokeDasharray="3,2" />
              {Vu > 0 && <line x1={lx} y1={ly - 24} x2={lx} y2={ly - 6}
                stroke="#16a34a" strokeWidth={1.5} markerEnd="url(#arrow)" />}
              {Hu !== 0 && <line x1={lx + (Hu > 0 ? -24 : 24)} y1={ly} x2={lx + (Hu > 0 ? -6 : 6)} y2={ly}
                stroke="#16a34a" strokeWidth={1.5} markerEnd="url(#arrow)" />}
              {label(lx + 5, ly - 26, `Vu=${Vu}kN`, '#15803d', 9, 'start')}
            </g>
          )
        })()}

        {/* arrowhead marker */}
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#1d4ed8" />
          </marker>
        </defs>
      </svg>
    </div>
  )
}
