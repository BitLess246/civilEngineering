// ─────────────────────────────────────────────────────────────────────────
// Punching shear, isometric — the critical section as the surfaces it is.
//
// `PunchingPlan` draws b₀ as a dashed line and the cone in section; this
// draws both as the solid they slice: the shear planes standing d/2 off each
// column face, d tall, through a see-through slab, with the 45° cone they
// idealise. Each plane is labelled with its length, so b₀ reads off the
// drawing as a sum, and b₀·d — the area Vc acts on — is stated beneath.
//
// Geometry from `lib/punchingIso` (Σ planes asserted = engine b₀).
// ─────────────────────────────────────────────────────────────────────────
import { DrawingFrame } from './DrawingFrame'
import type { ColumnPosition } from '../engine/shear'
import { punchingIsoGeometry } from '../lib/punchingIso'
import { SE, boxEdges, boxFaces, edgeVisible, faceVisible, fitIso, isoPath, sortFaces, type Vec3 } from '../lib/isometric'

const INK = '#37526e', FAINT = '#8a8f98', CRIT = '#c2402a', DIM = '#1f77b4'
const COL_SHADE: Record<string, string> = { '-y': '#9fb1c6', '+x': '#7f95ae' }
const halo = { paintOrder: 'stroke' as const, stroke: 'var(--sheet, #fff)', strokeWidth: 2.6, strokeLinejoin: 'round' as const }

export interface PunchingIsoProps {
  /** Column, mm (c₁ across the plan, c₂ up it — as `PunchingPlan`). */
  c1: number
  c2: number
  /** Effective depth and slab thickness, mm. */
  d: number
  h: number
  position: ColumnPosition
  alphaS: number
}

export function PunchingIso({ c1, c2, d, h, position, alphaS }: PunchingIsoProps) {
  const g = punchingIsoGeometry(c1, c2, d, h, position)
  if (!g) return null
  const W = 360, view = SE
  const corners = (lo: Vec3, hi: Vec3) => boxFaces(lo, hi).flatMap((f) => f.pts)
  const fit = fitIso([...corners(g.slab.lo, g.slab.hi), ...corners(g.column.lo, g.column.hi)], 18, 34, W - 36, 240, view)
  const { p } = fit
  const P = (pts: Vec3[]) => isoPath(pts.map(p))
  const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
  const ctr = (pts: Vec3[]) => pts.reduce<Vec3>((s, q) => [s[0] + q[0] / pts.length, s[1] + q[1] / pts.length, s[2] + q[2] / pts.length], [0, 0, 0])

  const slabEdges = boxEdges(g.slab.lo, g.slab.hi)
  const colFaces = sortFaces(boxFaces(g.column.lo, g.column.hi), view).filter((f) => faceVisible(f.n, view) && f.key !== '+z')
  const coneFaces = sortFaces(g.coneFaces, view)
  const planes = sortFaces(g.planes, view)
  const back = planes.filter((q) => !faceVisible(q.n, view)), front = planes.filter((q) => faceVisible(q.n, view))
  const slabTop = boxFaces(g.slab.lo, g.slab.hi).find((f) => f.key === '+z')!

  // d, measured up the plane corner nearest the viewer (south-east)
  const se = g.planes.find((q) => q.side === 'east')!.pts[0]
  const [ax, ay] = p(se), [, by] = p([se[0], se[1], d])
  const dimX = ax + 14
  const coneAt = p(g.cone[0].to)
  // d/2 on the soffit, column face → section, off the south-west column corner
  const e0 = p([-c1 / 2, -c2 / 2, 0]), e1 = p([-c1 / 2, -c2 / 2 - d / 2, 0])
  const yText = fit.box.y + fit.box.h + 22
  const H = yText + 46
  const lens = g.planes.map((q) => Math.round(q.len))

  return (
    <DrawingFrame label="punching shear isometric">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full" style={{ fontFamily: 'Arial, sans-serif' }}
        role="img" aria-label={`Isometric of the punching shear critical section: ${g.planes.length} shear planes, b0 ${Math.round(g.b0)} mm`}>
        <text x={18} y={16} fontSize={9} fontWeight={700} fill={INK}>ISOMETRIC — the shear planes, d/2 off each face</text>

        {/* the slab's far edges, seen through it */}
        {slabEdges.filter((e) => !edgeVisible(e, view)).map((e, k) => (
          <path key={`h${k}`} d={P([e.a, e.b])} stroke={FAINT} strokeWidth={0.7} strokeDasharray="3 2" fill="none" />
        ))}

        {/* the column below the slab, its top hidden in the soffit */}
        {colFaces.map((f) => <path key={f.key} d={P(f.pts)} fill={COL_SHADE[f.key] ?? INK} stroke={INK} strokeWidth={0.7} />)}

        {/* shear planes behind the column's axis, then the cone, then the near planes */}
        {back.map((q) => <path key={q.side} d={P(q.pts)} fill={CRIT} fillOpacity={0.12} stroke={CRIT} strokeWidth={0.9} strokeDasharray="4 2" />)}
        {coneFaces.map((f) => <path key={`c${f.side}`} d={P(f.pts)} fill={CRIT} fillOpacity={faceVisible(f.n, view) ? 0.08 : 0}
          stroke={CRIT} strokeWidth={0.9} strokeDasharray="5 3" strokeLinejoin="round" />)}
        {front.map((q) => <path key={q.side} d={P(q.pts)} fill={CRIT} fillOpacity={0.24} stroke={CRIT} strokeWidth={1.4} />)}

        {/* the slab: a faint top, its near edges, its free edges heavy */}
        <path d={P(slabTop.pts)} fill="#eef3f8" fillOpacity={0.35} stroke="none" />
        {slabEdges.filter((e) => edgeVisible(e, view)).map((e, k) => (
          <path key={`v${k}`} d={P([e.a, e.b])} stroke={INK} strokeWidth={0.9} fill="none" />
        ))}
        {g.freeEdges.map((e) => {
          const [mx, my] = p(mid(e.a, e.b))
          return <g key={e.side}>
            <path d={P([e.a, e.b])} stroke={INK} strokeWidth={2.4} fill="none" />
            <text x={mx} y={my - 5} fontSize={8} fill={FAINT} textAnchor="middle" {...halo}>free edge</text>
          </g>
        })}

        {/* each plane's length — b₀ is their sum */}
        {planes.map((q) => {
          const [x, y] = p(ctr(q.pts))
          return <text key={`l${q.side}`} x={x} y={y + 3} fontSize={8} fill={CRIT} textAnchor="middle" fontWeight={faceVisible(q.n, view) ? 700 : 400} {...halo}>{Math.round(q.len)}</text>
        })}

        <text x={coneAt[0] + 4} y={coneAt[1] - 6} fontSize={8} fill={CRIT} {...halo}>≈45° cone</text>

        <g stroke={DIM} strokeWidth={0.8}>
          <line x1={ax + 3} y1={ay} x2={dimX + 4} y2={ay} />
          <line x1={ax + 3} y1={by} x2={dimX + 4} y2={by} />
          <line x1={dimX} y1={ay} x2={dimX} y2={by} />
          {[ay, by].map((y) => <line key={y} x1={dimX - 3} y1={y + 3} x2={dimX + 3} y2={y - 3} strokeWidth={1.2} />)}
        </g>
        <text x={dimX + 6} y={(ay + by) / 2 + 3} fontSize={8} fill={DIM} {...halo}>d = {Math.round(d)}</text>
        <path d={isoPath([e0, e1], false)} stroke={DIM} strokeWidth={1.4} />
        <text x={e1[0] - 5} y={e1[1] + 9} fontSize={8} fill={DIM} textAnchor="end" {...halo}>d/2</text>

        <text x={W / 2} y={yText} fontSize={8} fill={CRIT} textAnchor="middle" fontWeight={700}>
          {position} column · {g.planes.length} shear planes · αs = {alphaS}
        </text>
        <text x={W / 2} y={yText + 13} fontSize={8} fill={CRIT} textAnchor="middle">
          b₀ = {lens.join(' + ')} = {Math.round(g.b0).toLocaleString()} mm
        </text>
        <text x={W / 2} y={yText + 26} fontSize={8} fill={CRIT} textAnchor="middle">
          b₀·d = {Math.round(g.b0).toLocaleString()} × {Math.round(d)} = {(g.area / 1e6).toFixed(3)} m² — the area Vc acts on
        </text>
        <text x={W / 2} y={yText + 39} fontSize={8} fill={FAINT} textAnchor="middle">
          The planes idealise the 45° cone (§22.6.4.1); a free edge has none.
        </text>
      </svg>
    </DrawingFrame>
  )
}
