// ─────────────────────────────────────────────────────────────────────────
// Drawings for the surveying calculators: the leveling profile, the traverse
// polygon, the simple-curve layout and the mass-haul diagram. Each redraws
// from the engine result it is given.
// ─────────────────────────────────────────────────────────────────────────
import type { LevelResult } from '../engine/leveling'
import type { TraverseResult } from '../engine/traverse'
import type { CurveResult } from '../engine/circularCurve'
import { INK, BRAND, FAIL, MUTED, HAIR, f2, f3 } from '../lib/influenceStyle'

// ── profile drawing ───────────────────────────────────────────────────────

export function LevelProfile({ res, startElev }: { res: LevelResult; startElev: number }) {
  const W = 860
  const H = 300
  const padL = 46
  const padR = 18
  const padT = 24
  const padB = 40

  // Turning-point elevations only, IFS shots drawn as ticks off the profile.
  const tps = res.points
  const allElevs = tps.flatMap((p) => [p.elev, ...p.ifs])
  const eMin = Math.min(...allElevs) - 1
  const eMax = Math.max(...allElevs, res.points[0].hi ?? startElev) + 1

  const x = (i: number) => padL + (i / Math.max(tps.length - 1, 1)) * (W - padL - padR)
  const y = (e: number) => padT + ((eMax - e) / Math.max(eMax - eMin, 1e-9)) * (H - padT - padB)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Leveling profile">
      {/* elevation grid */}
      {gridTicks(eMin, eMax, 5).map((e) => (
        <g key={e}>
          <line x1={padL} x2={W - padR} y1={y(e)} y2={y(e)} stroke={HAIR} strokeWidth="1" />
          <text x={padL - 6} y={y(e) + 3.5} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">{f2(e)}</text>
        </g>
      ))}

      {/* HI lines: dashed horizontal at each setup's HI, spanning its two points */}
      {res.points.map((p, i) => {
        if (p.hi === null || p.bs === null) return null
        const x1 = x(i)
        const x2 = x(Math.min(i + 1, res.points.length - 1))
        return <line key={`hi${i}`} x1={x1} x2={x2} y1={y(p.hi)} y2={y(p.hi)} stroke={BRAND} strokeWidth="1" strokeDasharray="4 3" opacity="0.65" />
      })}

      {/* ground profile through the turning points */}
      <polyline
        points={res.points.map((p, i) => `${x(i)},${y(p.elev)}`).join(' ')}
        fill="none" stroke={INK} strokeWidth="2"
      />
      {/* IFS shots as small ticks below/above their row */}
      {res.points.map((p, i) =>
        p.ifs.map((z, k) => (
          <g key={`ifs${i}-${k}`}>
            <circle cx={x(i)} cy={y(z)} r="2.6" fill={BRAND} />
            <text x={x(i) + 5} y={y(z) - 4} fontSize="9" fill={MUTED} fontFamily="var(--font-mono, monospace)">{f2(z)}</text>
          </g>
        )),
      )}

      {/* station marks + names */}
      {res.points.map((p, i) => (
        <g key={`st${i}`}>
          <line x1={x(i)} x2={x(i)} y1={y(p.elev) - 4} y2={y(p.elev) + 4} stroke={INK} strokeWidth="1.5" />
          <circle cx={x(i)} cy={y(p.elev)} r="2.5" fill={INK} />
          <text x={x(i)} y={H - padB + 14} textAnchor="middle" fontSize="9.5" fill={INK} fontFamily="var(--font-mono, monospace)">{p.sta}</text>
          <text x={x(i)} y={y(p.elev) + 16} textAnchor="middle" fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">{f2(p.adj)}</text>
        </g>
      ))}

      {/* misclosure flag on the last point */}
      {res.misclosure !== null && Math.abs(res.misclosure) > 1e-9 && (
        <text x={x(res.points.length - 1)} y={padT - 8} textAnchor="end" fontSize="10" fill={FAIL} fontFamily="var(--font-mono, monospace)">
          ε = {f3(res.misclosure)} m
        </text>
      )}
    </svg>
  )
}

const gridTicks = (lo: number, hi: number, n: number): number[] => {
  const step = (hi - lo) / n
  return Array.from({ length: n + 1 }, (_, i) => lo + i * step)
}

// ── polygon drawing ───────────────────────────────────────────────────────

export function TraversePlot({ res }: { res: TraverseResult }) {
  const W = 640
  const H = 480
  const pad = 52

  const xs = res.vertices.map((v) => v.x)
  const ys = res.vertices.map((v) => v.y)
  const xMin = Math.min(...xs); const xMax = Math.max(...xs)
  const yMin = Math.min(...ys); const yMax = Math.max(...ys)
  const spanX = Math.max(xMax - xMin, 1e-6)
  const spanY = Math.max(yMax - yMin, 1e-6)
  const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY)
  const cx = (x: number) => pad + (x - xMin) * scale + ((W - 2 * pad) - spanX * scale) / 2
  const cy = (y: number) => H - pad - (y - yMin) * scale - ((H - 2 * pad) - spanY * scale) / 2

  // plot north arrow direction (x east → screen right, y north → screen up)
  const verts = res.vertices
  // course labels sit outside the figure: offset from each midpoint away
  // from the centroid, so they never strike through their own line
  const gx = verts.slice(0, res.n).reduce((t, v) => t + cx(v.x), 0) / res.n
  const gy = verts.slice(0, res.n).reduce((t, v) => t + cy(v.y), 0) / res.n
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Adjusted traverse polygon">
      {/* grid */}
      <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke={HAIR} />
      <line x1={pad} x2={pad} y1={pad} y2={H - pad} stroke={HAIR} />
      <text x={W - pad} y={H - pad + 16} textAnchor="end" fontSize="10" fill={MUTED}>E (m)</text>
      <text x={pad - 8} y={pad - 14} fontSize="10" fill={MUTED}>N (m)</text>

      {/* polygon */}
      <polygon
        points={verts.slice(0, res.n).map((v) => `${cx(v.x)},${cy(v.y)}`).join(' ')}
        fill="rgba(15,76,146,0.06)" stroke={INK} strokeWidth="1.8"
      />
      {/* courses with names */}
      {res.rows.map((r, i) => {
        const a = verts[i]
        const b = verts[i + 1]
        const mx = (cx(a.x) + cx(b.x)) / 2
        const my = (cy(a.y) + cy(b.y)) / 2
        // unit normal of the segment, turned to face away from the centroid
        const sx = cx(b.x) - cx(a.x), sy = cy(b.y) - cy(a.y), len = Math.hypot(sx, sy) || 1
        let nx = -sy / len, ny = sx / len
        if (nx * (mx - gx) + ny * (my - gy) < 0) { nx = -nx; ny = -ny }
        const lx = mx + nx * 12, ly = my + ny * 12 + (ny > 0.35 ? 8 : ny < -0.35 ? -2 : 3.5)
        return (
          <g key={i}>
            <text x={lx} y={ly} textAnchor={Math.abs(nx) < 0.35 ? 'middle' : nx > 0 ? 'start' : 'end'} fontSize="10" fill={BRAND} fontFamily="var(--font-mono, monospace)"
              paintOrder="stroke" stroke="var(--sheet)" strokeWidth={3}>
              {r.name} · {f2(r.adjLength)} m
            </text>
          </g>
        )
      })}
      {/* vertices */}
      {verts.slice(0, res.n).map((v, i) => (
        <g key={i}>
          <circle cx={cx(v.x)} cy={cy(v.y)} r="3" fill={INK} />
          <text x={cx(v.x) + 7} y={cy(v.y) - 6} fontSize="11" fontWeight="700" fill={INK} fontFamily="var(--font-mono, monospace)">{v.name}</text>
        </g>
      ))}
      {/* north arrow */}
      <g transform={`translate(${W - 34}, ${pad + 14})`}>
        <line x1="0" y1="18" x2="0" y2="0" stroke={BRAND} strokeWidth="1.6" />
        <polygon points="0,-4 3.4,4 -3.4,4" fill={BRAND} />
        <text x="0" y="30" textAnchor="middle" fontSize="10" fill={BRAND}>N</text>
      </g>
      {/* area stamp */}
      <text x={pad} y={H - 8} fontSize="11" fill={MUTED} fontFamily="var(--font-mono, monospace)">
        A = {f3(res.areaM2)} m² = {f3(res.areaHa)} ha
      </text>
      {res.linear > 1e-9 && (
        <text x={W - pad} y={H - 8} textAnchor="end" fontSize="10" fill={FAIL} fontFamily="var(--font-mono, monospace)">
          misclosure {f3(res.linear)} m → {res.rule === 'bowditch' ? 'Bowditch' : 'transit'} adjusted
        </text>
      )}
    </svg>
  )
}

// ── curve figure ──────────────────────────────────────────────────────────

/** The curve drawn to scale on its tangents. The tangent triangle sets the
 *  scale so the curve fills the sheet whatever Δ is; the radii run to the
 *  centre O when it fits on the sheet and are drawn as stubs pointing at it
 *  when it does not (a flat curve's centre is far below its PI). */
export function CurveFigure({ el }: { el: CurveResult['el'] }) {
  const W = 640
  const pad = 40
  const h = el.deltaRad / 2
  const mono = 'var(--font-mono, monospace)'
  // tangent triangle: half-width T·cos h, rise T·sin h (screen y down)
  const k = Math.min((W - 2 * pad - 80) / (2 * el.T * Math.cos(h)), 300 / Math.max(el.T * Math.sin(h), 1e-9))
  const piX = W / 2, piY = pad + 10
  const pcX = piX - el.T * k * Math.cos(h), pcY = piY + el.T * k * Math.sin(h)
  const ptX = piX + el.T * k * Math.cos(h), ptY = pcY
  const Rk = el.R * k
  const oY = piY + (el.R / Math.cos(h)) * k     // centre, on the bisector below the PI
  const midY = piY + el.E * k                     // mid-curve point
  const full = oY <= 460                          // can the centre sit on the sheet?
  const stub = Math.min(Rk, 120)
  // unit vectors PC→O and PT→O
  const ux = (piX - pcX) / Rk, uy = (oY - pcY) / Rk
  const H = Math.round((full ? oY + 34 : pcY + stub * uy + 46))
  const path = `M ${pcX} ${pcY} A ${Rk} ${Rk} 0 0 1 ${ptX} ${ptY}`
  const halo = { paintOrder: 'stroke' as const, stroke: 'var(--sheet)', strokeWidth: 3 }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Circular curve layout">
      {/* radii toward the centre */}
      <line x1={pcX} y1={pcY} x2={pcX + ux * (full ? Rk : stub)} y2={pcY + uy * (full ? Rk : stub)} stroke={MUTED} strokeWidth="1" strokeDasharray="5 4" />
      <line x1={ptX} y1={ptY} x2={ptX - ux * (full ? Rk : stub)} y2={ptY + uy * (full ? Rk : stub)} stroke={MUTED} strokeWidth="1" strokeDasharray="5 4" />
      {full ? (
        <>
          <circle cx={piX} cy={oY} r="3" fill={INK} />
          <text x={piX} y={oY + 18} textAnchor="middle" fontSize="11" fontWeight="700" fill={INK} fontFamily={mono}>O</text>
          <text x={piX + 8} y={oY - 10} fontSize="10" fill={INK} fontFamily={mono}>Δ = {f2(el.deltaDeg)}°</text>
        </>
      ) : (
        <text x={piX} y={pcY + stub * uy + 18} textAnchor="middle" fontSize="10" fill={MUTED} fontFamily={mono}>radii continue to the centre O, {f2(el.R / Math.cos(h) - el.T * Math.sin(h))} m below the chord</text>
      )}
      <text x={pcX + ux * stub * 0.55 - 8} y={pcY + uy * stub * 0.55} textAnchor="end" fontSize="10" fill={MUTED} fontFamily={mono} {...halo}>R = {f2(el.R)} m</text>
      {/* tangents, long chord, bisector */}
      <line x1={pcX} y1={pcY} x2={piX} y2={piY} stroke={INK} strokeWidth="1.6" />
      <line x1={piX} y1={piY} x2={ptX} y2={ptY} stroke={INK} strokeWidth="1.6" />
      <line x1={pcX} y1={pcY} x2={ptX} y2={ptY} stroke={BRAND} strokeWidth="1.1" strokeDasharray="6 3" />
      <line x1={piX} y1={piY} x2={piX} y2={pcY} stroke={HAIR} strokeWidth="1" strokeDasharray="3 3" />
      <path d={path} fill="none" stroke={BRAND} strokeWidth="2.6" />
      {/* points */}
      <circle cx={piX} cy={piY} r="3.2" fill={INK} />
      <circle cx={pcX} cy={pcY} r="3.2" fill={BRAND} />
      <circle cx={ptX} cy={ptY} r="3.2" fill={BRAND} />
      <circle cx={piX} cy={midY} r="2.6" fill={MUTED} />
      <text x={piX} y={piY - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill={INK} fontFamily={mono}>PI</text>
      <text x={pcX - 8} y={pcY + 4} textAnchor="end" fontSize="11" fontWeight="700" fill={BRAND} fontFamily={mono}>PC</text>
      <text x={ptX + 8} y={ptY + 4} fontSize="11" fontWeight="700" fill={BRAND} fontFamily={mono}>PT</text>
      {/* element labels, each clear of the lines it names */}
      <text x={(piX + pcX) / 2 - 6} y={(piY + pcY) / 2 - 6} textAnchor="end" fontSize="10" fill={INK} fontFamily={mono} {...halo}>T = {f3(el.T)} m</text>
      <text x={(piX + ptX) / 2 + 6} y={(piY + ptY) / 2 - 6} fontSize="10" fill={INK} fontFamily={mono} {...halo}>T</text>
      <text x={piX + 8} y={(piY + midY) / 2 + 4} fontSize="10" fill={MUTED} fontFamily={mono} {...halo}>E = {f3(el.E)} m</text>
      <text x={piX + 8} y={(midY + pcY) / 2 + 4} fontSize="10" fill={MUTED} fontFamily={mono} {...halo}>M = {f3(el.M)} m</text>
      <text x={(pcX + ptX) / 2 + (ptX - pcX) / 4} y={pcY + 16} textAnchor="middle" fontSize="10" fill={BRAND} fontFamily={mono} {...halo}>LC = {f3(el.LC)} m</text>
      <text x={(pcX + ptX) / 2 - (ptX - pcX) / 4} y={pcY - 8} textAnchor="middle" fontSize="10" fill={BRAND} fontFamily={mono} {...halo}>L = {f3(el.L)} m</text>
    </svg>
  )
}
