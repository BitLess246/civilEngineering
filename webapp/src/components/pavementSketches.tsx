// ─────────────────────────────────────────────────────────────────────────
// Drawings for the pavement calculators: the flexible layer section, the
// rigid slab at a dowelled transverse joint, and the load-equivalency curves
// of the axle census. Sections are at ONE true scale (stated); every
// thickness is dimensioned between the layer boundaries it measures.
// ─────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react'
import { DrawingFrame } from './DrawingFrame'
import { Axes } from './waterCharts'
import { HDim, VDim } from './hydraulicsSketches'
import { groupLEF, AXLES_IN, P_STD, type AxleKind } from '../engine/axleLoads'
import { INK, MUTED, f2 } from '../lib/influenceStyle'
import { axesMap } from '../lib/chartScale'

const mono = 'var(--font-mono, monospace)'
const halo = { paintOrder: 'stroke' as const, stroke: 'var(--sheet)', strokeWidth: 3 }

function Chart({ label, W, H, children }: { label: string; W: number; H: number; children: ReactNode }) {
  return (
    <DrawingFrame label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>{children}</svg>
    </DrawingFrame>
  )
}

/** Soil hatching: 45° strokes clipped to a band. */
function SoilBand({ id, x, y, w, h }: { id: string; x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <clipPath id={id}><rect x={x} y={y} width={w} height={h} /></clipPath>
      <rect x={x} y={y} width={w} height={h} fill="rgba(115,109,94,0.12)" />
      <g clipPath={`url(#${id})`}>
        {Array.from({ length: Math.ceil((w + h) / 12) }, (_, i) => (
          <line key={i} x1={x + i * 12 - h} y1={y + h} x2={x + i * 12} y2={y} stroke={MUTED} strokeWidth="0.6" />
        ))}
      </g>
    </g>
  )
}

/** The flexible section, surface down to the subgrade, every layer at one
 *  true vertical scale and dimensioned; the layer's SN contribution a·D·m
 *  is written in the layer it belongs to. */
export function FlexibleSection({ rows, MR, SNreq, SNprov }: {
  rows: { name: string; D: number; contribution: number }[]; MR: number; SNreq: number; SNprov: number
}) {
  const W = 680, H = 340
  const x0 = 120, x1 = 470, top = 46
  const total = rows.reduce((t, r) => t + Math.max(r.D, 0), 0)
  const k = Math.min(0.5, 220 / Math.max(total, 1)) // px per mm, one scale
  const fills = ['rgba(31,41,55,0.72)', 'rgba(146,120,80,0.42)', 'rgba(190,178,150,0.42)']
  const bands = rows.map((r, i) => {
    const z0 = rows.slice(0, i).reduce((t, q) => t + Math.max(q.D, 0), 0)
    return { ...r, y: top + z0 * k, h: Math.max(r.D, 0) * k, fill: fills[i % fills.length], dark: i === 0 }
  }).filter((b) => b.h > 0)
  const bottom = top + total * k
  return (
    <Chart label="Flexible pavement section" W={W} H={H}>
      <line x1={x0 - 20} x2={x1 + 20} y1={top} y2={top} stroke={INK} strokeWidth="1.4" />
      <text x={x0 - 24} y={top + 3} textAnchor="end" fontSize="9.5" fill={MUTED} fontFamily={mono}>surface</text>
      {bands.map((b, i) => (
        <g key={b.name}>
          <rect x={x0} y={b.y} width={x1 - x0} height={b.h} fill={b.fill} stroke={INK} strokeWidth="1" />
          <text x={x0 - 8} y={b.y + b.h / 2 + 4} textAnchor="end" fontSize="10.5" fontWeight="700" fill={INK} fontFamily={mono}>{b.name}</text>
          {b.h >= 15 && <text x={(x0 + x1) / 2} y={b.y + b.h / 2 + 4} textAnchor="middle" fontSize="10" fill={b.dark ? '#ffffff' : INK} fontFamily={mono}>a·D·m = {f2(b.contribution)}</text>}
          {/* each boundary carried out to the thickness dimensions */}
          <line x1={x1} x2={x1 + 30} y1={b.y + b.h} y2={b.y + b.h} stroke={MUTED} strokeWidth="0.8" />
          {i === 0 && <line x1={x1} x2={x1 + 130} y1={b.y} y2={b.y} stroke={MUTED} strokeWidth="0.8" />}
          <VDim x={x1 + 22} a={b.y} b={b.y + b.h} label={`D${i + 1} ${Math.round(b.D)} mm`} color={INK} />
        </g>
      ))}
      <line x1={x1 + 30} x2={x1 + 130} y1={bottom} y2={bottom} stroke={MUTED} strokeWidth="0.8" />
      <VDim x={x1 + 124} a={top} b={bottom} label={`${Math.round(total)} mm`} color={INK} />
      <SoilBand id="flex-subgrade" x={x0} y={bottom} w={x1 - x0} h={34} />
      <text x={x0 - 8} y={bottom + 21} textAnchor="end" fontSize="10.5" fontWeight="700" fill={INK} fontFamily={mono}>Subgrade</text>
      <text x={(x0 + x1) / 2} y={bottom + 21} textAnchor="middle" fontSize="10" fill={INK} fontFamily={mono} {...halo}>MR = {f2(MR)} MPa</text>
      <text x={x0 - 100} y={H - 30} fontSize="10" fontWeight="700" fill={SNprov >= SNreq ? INK : 'rgba(200,60,60,0.95)'} fontFamily={mono}>
        SN provided {SNprov.toFixed(3)} {SNprov >= SNreq ? '≥' : '<'} required {SNreq.toFixed(3)}
      </text>
      <text x={x0 - 100} y={H - 14} fontSize="9.5" fill={MUTED} fontFamily={mono}>thicknesses to scale (1 px = {f2(1 / k)} mm); width not to scale</text>
    </Chart>
  )
}

/** The PCC slab at a dowelled transverse joint, in elevation along the
 *  traffic direction, at ONE true scale both ways: slab thickness D
 *  dimensioned, the dowel at mid-depth across the joint. Base and subgrade
 *  are shown for context only (their thickness is not designed here). */
export function RigidJoint({ D }: { D: number }) {
  const W = 680, H = 300
  const k = Math.min(0.36, 110 / Math.max(D, 1)) // px per mm
  const half = 700 // slab shown each side of the joint, mm
  const cx = W / 2 - 60, y0 = 70
  const t = D * k, xL = cx - half * k, xR = cx + half * k, gap = 4
  const dowelL = 450 * k, dowelT = Math.max((D / 8) * k, 2.5) // ⌀ ≈ D/8 rule of thumb
  const base = 26
  return (
    <Chart label="Rigid pavement joint" W={W} H={H}>
      {/* the two slabs either side of the sawn joint */}
      <rect x={xL} y={y0} width={cx - gap / 2 - xL} height={t} fill="rgba(15,76,146,0.14)" stroke={INK} strokeWidth="1.4" />
      <rect x={cx + gap / 2} y={y0} width={xR - cx - gap / 2} height={t} fill="rgba(15,76,146,0.14)" stroke={INK} strokeWidth="1.4" />
      <rect x={cx - dowelL / 2} y={y0 + t / 2 - dowelT / 2} width={dowelL} height={dowelT} fill={INK} />
      <text x={cx} y={y0 - 10} textAnchor="middle" fontSize="10" fontWeight="700" fill={INK} fontFamily={mono} {...halo}>transverse joint</text>
      <line x1={cx} x2={cx} y1={y0 - 6} y2={y0} stroke={INK} strokeWidth="1" />
      <text x={cx + dowelL / 2 + 8} y={y0 + t / 2 + 4} fontSize="9.5" fill={INK} fontFamily={mono} {...halo}>dowel at D/2, 450 mm long</text>
      {/* the dowel length dimensioned below the slab */}
      <line x1={cx - dowelL / 2} x2={cx - dowelL / 2} y1={y0 + t / 2 + dowelT / 2} y2={y0 + t + base + 52} stroke={MUTED} strokeWidth="0.7" strokeDasharray="3 2" />
      <line x1={cx + dowelL / 2} x2={cx + dowelL / 2} y1={y0 + t / 2 + dowelT / 2} y2={y0 + t + base + 52} stroke={MUTED} strokeWidth="0.7" strokeDasharray="3 2" />
      <HDim y={y0 + t + base + 48} a={cx - dowelL / 2} b={cx + dowelL / 2} label="450 mm" />
      {/* slab thickness */}
      <line x1={xR} x2={xR + 30} y1={y0} y2={y0} stroke={MUTED} strokeWidth="0.8" />
      <line x1={xR} x2={xR + 30} y1={y0 + t} y2={y0 + t} stroke={MUTED} strokeWidth="0.8" />
      <VDim x={xR + 22} a={y0} b={y0 + t} label={`D = ${f2(D)} mm`} color={INK} />
      {/* base and subgrade, context only */}
      <rect x={xL} y={y0 + t} width={xR - xL} height={base} fill="rgba(146,120,80,0.3)" stroke={MUTED} strokeWidth="0.9" />
      <text x={xL + 8} y={y0 + t + 17} fontSize="9.5" fill={INK} fontFamily={mono}>granular base</text>
      <SoilBand id="rigid-subgrade" x={xL} y={y0 + t + base} w={xR - xL} h={22} />
      <text x={xL + 8} y={y0 + t + base + 15} fontSize="9.5" fill={INK} fontFamily={mono} {...halo}>subgrade (k)</text>
      <text x={24} y={H - 14} fontSize="9.5" fill={MUTED} fontFamily={mono}>slab and dowel to scale (1 px = {f2(1 / k)} mm) · base and subgrade not designed here · dowel ⌀ ≈ D/8 rule of thumb</text>
    </Chart>
  )
}

/** Load equivalency against the group load, one curve per axle type
 *  present (a tandem spreads its load over two axles, so it sits on its own
 *  curve), each census row on its own curve, and the 80 kN / 1 ESAL
 *  standard marked. */
export function LefCurves({ exponent, rows }: {
  exponent: number; rows: { name: string; kind: AxleKind; loadK: number; lef: number }[]
}) {
  const W = 680, H = 350 + 16 * rows.length
  const box = { x0: 70, x1: W - 150, top: 52, base: 290 }
  const pMax = Math.max(200, ...rows.map((r) => r.loadK)) * 1.1
  const yMax = Math.max(2, ...rows.map((r) => r.lef)) * 1.35
  const { X, Y } = axesMap(box, pMax, yMax)
  const kinds = (Object.keys(AXLES_IN) as AxleKind[]).filter((kd) => rows.some((r) => r.kind === kd))
  const curve = (kd: AxleKind) => Array.from({ length: 81 }, (_, i) => (i / 80) * pMax)
    .filter((p) => p > 0).map((p) => ({ p, v: groupLEF(p, kd, exponent) }))
  // label each curve at its right end, or where it leaves the top of the plot
  const endOf = (kd: AxleKind) => { const c = curve(kd); return c.find((q) => q.v > yMax * 0.97) ?? c[c.length - 1] }
  const red = 'rgba(200,60,60,0.95)'
  return (
    <Chart label="Load equivalency curves" W={W} H={H}>
      <clipPath id="lef-plot"><rect x={box.x0} y={box.top} width={box.x1 - box.x0} height={box.base - box.top} /></clipPath>
      <Axes box={box} xMax={pMax} yMax={yMax} xLabel="group load P (kN)" yLabel="LEF (ESAL per group)" />
      <line x1={X(P_STD)} x2={X(P_STD)} y1={box.base} y2={Y(1)} stroke={MUTED} strokeWidth="0.9" strokeDasharray="4 3" />
      <line x1={box.x0} x2={X(P_STD)} y1={Y(1)} y2={Y(1)} stroke={MUTED} strokeWidth="0.9" strokeDasharray="4 3" />
      <text x={X(P_STD) + 5} y={Y(1) + 14} fontSize="9.5" fill={MUTED} fontFamily={mono} {...halo}>80 kN</text>
      <text x={box.x0 + 5} y={Y(1) - 5} fontSize="9.5" fill={MUTED} fontFamily={mono} {...halo}>1 ESAL</text>
      <g clipPath="url(#lef-plot)">
        {kinds.map((kd) => (
          <polyline key={kd} points={curve(kd).map((q) => `${X(q.p).toFixed(2)},${Y(q.v).toFixed(2)}`).join(' ')} fill="none"
            stroke={INK} strokeWidth={kd === 'single' ? 2 : 1.6} strokeDasharray={kd === 'single' ? undefined : kd === 'tandem' ? '7 3' : '2 3'} />
        ))}
      </g>
      {kinds.map((kd) => {
        const e = endOf(kd)
        return <text key={kd} x={X(e.p) + 6} y={Math.max(Y(e.v), box.top + 4) + 4} fontSize="10" fill={INK} fontFamily={mono} {...halo}>{kd}</text>
      })}
      {/* each census row numbered on its curve, named in the key below */}
      {rows.map((r, i) => (
        <g key={i}>
          <circle cx={X(r.loadK)} cy={Y(r.lef)} r="4" fill={red} />
          <text x={X(r.loadK) - 7} y={Y(r.lef) - 7} textAnchor="end" fontSize="10" fontWeight="700" fill={red} fontFamily={mono} {...halo}>{i + 1}</text>
          <text x={box.x0} y={box.base + 52 + i * 16} fontSize="9.5" fill={INK} fontFamily={mono}>
            <tspan fontWeight="700" fill={red}>{i + 1}</tspan>  {r.name} · {r.kind} · {f2(r.loadK)} kN · LEF {f2(r.lef)}
          </text>
        </g>
      ))}
      <text x={box.x0 + 8} y={box.top - 26} fontSize="9.5" fill={MUTED} fontFamily={mono}>LEF = n (P / n / 80)^{f2(exponent)} for an n-axle group</text>
    </Chart>
  )
}
