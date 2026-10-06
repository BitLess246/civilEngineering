// ─────────────────────────────────────────────────────────────────────────
// Drawings for the plumbing designer, one per tab.
//
//  · PressureBudget — the water-supply sizing IS a pressure budget: the main
//    pressure is spent on the meter, the static lift γw·Z and the residual the
//    far fixture needs, and what is left is all friction may use. Drawn as two
//    bars on one kPa scale, the second showing what the chosen pipe spends.
//  · DwvDiagram — the stack, its vent and the building drain. There is no
//    geometry input behind it, so it is a diagram and says so.
//  · SepticSection — the two-chamber tank in longitudinal section, to one
//    scale, internal dimensions, liquid level marked ▽.
// ─────────────────────────────────────────────────────────────────────────
import { DimBelow, DimSide } from './dims'
import { DrawingFrame } from './DrawingFrame'
import { SurfaceMark } from './hydraulicsSketches'

const INK = '#37526e'
const MUTED = '#6b7a8c'
const FAINT = '#a39d8d'
const SEWAGE = '#e4dcc4'
const PIPE = '#0f4c92'
const OKC = '#2f7d4f'
const BAD = '#b3402a'
const HALO = { paintOrder: 'stroke' as const, stroke: 'var(--sheet, #fff)', strokeWidth: 2.6 }

// ── water supply ──────────────────────────────────────────────────────────

export interface PressureBudgetProps {
  /** All kPa. */
  pMain: number; pMeter: number; pStatic: number; pResidual: number
  /** Friction the chosen pipe spends over the developed length, kPa. */
  friction: number
  pipeLabel: string
}

export function PressureBudget({ pMain, pMeter, pStatic, pResidual, friction, pipeLabel }: PressureBudgetProps) {
  const avail = pMain - pMeter - pStatic - pResidual
  const W = 520, x0 = 20, x1 = W - 20
  const top = Math.max(pMain, pMeter + pStatic + pResidual + Math.max(friction, 0), 1)
  const k = (x1 - x0) / top
  const X = (p: number) => x0 + p * k
  const y1 = 44, y2 = 112, bh = 26
  const segs: { from: number; to: number; fill: string; label: string }[] = [
    { from: 0, to: pMeter, fill: '#d9d4c7', label: `meter ${pMeter.toFixed(1)}` },
    { from: pMeter, to: pMeter + pStatic, fill: '#c9d8e8', label: `static γw·Z ${pStatic.toFixed(1)}` },
    { from: pMeter + pStatic, to: pMeter + pStatic + pResidual, fill: '#e6edc9', label: `residual ${pResidual.toFixed(1)}` },
  ]
  const fStart = pMeter + pStatic + pResidual
  const ticks: number[] = []
  const step = top > 400 ? 100 : top > 150 ? 50 : 25
  for (let p = 0; p <= top + 1e-9; p += step) ticks.push(p)
  const fits = friction <= Math.max(avail, 0) + 1e-9
  const H = y2 + bh + 52

  return (
    <DrawingFrame label="supply pressure budget">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[560px]" style={{ fontFamily: 'Arial, sans-serif' }}>
        <text x={x0} y={y1 - 10} fontSize={9.5} fill={INK} fontWeight={700}>Main pressure {pMain.toFixed(1)} kPa, spent as</text>
        {segs.map((s) => (
          <g key={s.label}>
            <rect x={X(s.from)} y={y1} width={Math.max(0, (s.to - s.from) * k)} height={bh} fill={s.fill} stroke={INK} strokeWidth={0.8} />
          </g>
        ))}
        {avail > 0 && <rect x={X(fStart)} y={y1} width={avail * k} height={bh} fill="none" stroke={INK} strokeWidth={0.8} strokeDasharray="4 3" />}
        {/* segment labels inside when they fit; otherwise under the bar, the
            first from its left end and the friction allowance from its right */}
        {[...segs, { from: fStart, to: fStart + Math.max(avail, 0), label: `left for friction ${avail.toFixed(1)}` }].map((s, i, all) => {
          const w = (s.to - s.from) * k
          if (s.label.length * 5.1 < w - 6) {
            return <text key={i} x={(X(s.from) + X(s.to)) / 2} y={y1 + bh / 2 + 3.5} fontSize={9} fill={INK} textAnchor="middle">{s.label}</text>
          }
          const last = i === all.length - 1
          return <text key={i} x={last ? X(s.to) : X(s.from) + 2} y={y1 + bh + 12} fontSize={8.5} fill={MUTED} textAnchor={last ? 'end' : 'start'} {...HALO}>{s.label}</text>
        })}

        <text x={x0} y={y2 - 10} fontSize={9.5} fill={INK} fontWeight={700}>Friction at {pipeLabel}</text>
        <rect x={X(fStart)} y={y2} width={Math.max(0, friction) * k} height={bh} fill={fits ? OKC : BAD} fillOpacity={0.28} stroke={fits ? OKC : BAD} strokeWidth={1} />
        {/* the budget's right edge carried down, so the bar reads against it */}
        <line x1={X(fStart + Math.max(avail, 0))} y1={y1 + bh} x2={X(fStart + Math.max(avail, 0))} y2={y2 + bh + 4} stroke={fits ? OKC : BAD} strokeWidth={1} strokeDasharray="3 2" />
        {(() => {
          const label = `${friction.toFixed(1)} kPa ${fits ? '≤' : '>'} ${Math.max(avail, 0).toFixed(1)} available`
          const xEnd = X(fStart) + Math.max(0, friction) * k
          const right = xEnd + 5 + label.length * 5.1 < W - 4
          return <text x={right ? xEnd + 5 : X(fStart) - 5} y={y2 + bh / 2 + 3.5} fontSize={9} fill={fits ? OKC : BAD}
            textAnchor={right ? 'start' : 'end'} {...HALO}>{label}</text>
        })()}

        <line x1={x0} y1={H - 30} x2={x1} y2={H - 30} stroke={INK} strokeWidth={0.8} />
        {ticks.map((p) => (
          <g key={p}>
            <line x1={X(p)} y1={H - 30} x2={X(p)} y2={H - 26} stroke={INK} strokeWidth={0.8} />
            <text x={X(p)} y={H - 17} fontSize={8} fill={MUTED} textAnchor="middle">{p}</text>
          </g>
        ))}
        <text x={x1} y={H - 4} fontSize={7.5} fill={FAINT} textAnchor="end">kPa · both bars on one scale</text>
      </svg>
    </DrawingFrame>
  )
}

// ── drainage ──────────────────────────────────────────────────────────────

export interface DwvDiagramProps {
  drainMm: number; ventMm: number; slopePct: number; dfu: number; wcCount: number
}

export function DwvDiagram({ drainMm, ventMm, slopePct, dfu, wcCount }: DwvDiagramProps) {
  const W = 460, H = 250
  const sx = 110                         // stack centreline
  const roof = 46, floor2 = 104, floor1 = 160
  const drainY0 = 196, drainX1 = 400
  const fall = 14                        // drawn fall — a diagram, not the true slope
  return (
    <DrawingFrame label="drainage and vent diagram">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[500px]" style={{ fontFamily: 'Arial, sans-serif' }}>
        {/* roof and floors */}
        <line x1={40} y1={roof} x2={300} y2={roof} stroke={INK} strokeWidth={1.4} />
        {[floor2, floor1].map((y) => <line key={y} x1={40} y1={y} x2={300} y2={y} stroke={INK} strokeWidth={0.9} strokeDasharray="6 3" />)}
        <text x={300} y={roof - 5} fontSize={8} fill={MUTED} textAnchor="end">roof</text>

        {/* vent through the roof, the soil stack, fixture branches into it */}
        <line x1={sx} y1={roof - 22} x2={sx} y2={floor2} stroke={PIPE} strokeWidth={2} strokeDasharray="5 3" />
        <line x1={sx} y1={floor2} x2={sx} y2={drainY0} stroke={PIPE} strokeWidth={3.2} />
        {[floor2, floor1].map((y) => (
          <g key={y}>
            <line x1={sx} y1={y - 6} x2={sx + 90} y2={y - 10} stroke={PIPE} strokeWidth={2} />
            <rect x={sx + 90} y={y - 26} width={22} height={16} fill="var(--sheet, #fff)" stroke={INK} strokeWidth={1} rx={3} />
          </g>
        ))}
        {/* building drain to the sewer, falling */}
        <line x1={sx} y1={drainY0} x2={drainX1} y2={drainY0 + fall} stroke={PIPE} strokeWidth={3.2} />
        <path d={`M${drainX1} ${drainY0 + fall} l12 0 m-4 -4 l4 4 l-4 4`} fill="none" stroke={PIPE} strokeWidth={1.4} />
        <text x={drainX1 + 14} y={drainY0 + fall + 14} fontSize={8.5} fill={MUTED} textAnchor="end">to sewer</text>
        {/* slope triangle on the drain */}
        {(() => {
          const xa = 250, ya = drainY0 + fall * ((xa - sx) / (drainX1 - sx))
          const xb = 330, yb = drainY0 + fall * ((xb - sx) / (drainX1 - sx))
          return <g>
            <path d={`M${xa} ${ya - 10} L${xb} ${ya - 10} L${xb} ${yb - 10}`} fill="none" stroke={INK} strokeWidth={0.8} />
            <text x={(xa + xb) / 2} y={ya - 14} fontSize={8.5} fill={INK} textAnchor="middle">1 000</text>
            <text x={xb + 4} y={(ya + yb) / 2 - 8} fontSize={8.5} fill={INK}>{Math.round(slopePct * 10)}</text>
          </g>
        })()}

        {/* callouts */}
        <g fontSize={9}>
          <line x1={sx} y1={roof - 12} x2={sx + 24} y2={roof - 24} stroke={MUTED} strokeWidth={0.7} />
          <text x={sx + 27} y={roof - 25} fill={PIPE} {...HALO}>vent ⌀{Math.round(ventMm)}</text>
          <line x1={sx} y1={(floor1 + drainY0) / 2} x2={sx - 24} y2={(floor1 + drainY0) / 2 + 8} stroke={MUTED} strokeWidth={0.7} />
          <text x={sx - 27} y={(floor1 + drainY0) / 2 + 12} fill={PIPE} textAnchor="end" {...HALO}>stack ⌀{Math.round(drainMm)}</text>
          <text x={(sx + drainX1) / 2} y={drainY0 + fall + 20} fill={PIPE} textAnchor="middle" {...HALO}>
            building drain ⌀{Math.round(drainMm)} at {slopePct}%
          </text>
          <text x={sx + 118} y={floor2 - 14} fill={MUTED}>fixtures</text>
        </g>
        <text x={W / 2} y={H - 6} fontSize={7.5} fill={FAINT} textAnchor="middle">
          diagram — not to scale · {Math.round(dfu)} DFU{wcCount ? ` · ${wcCount} water closet${wcCount > 1 ? 's' : ''}` : ''} · slope triangle in mm per 1 000 mm
        </text>
      </svg>
    </DrawingFrame>
  )
}

// ── septic tank ───────────────────────────────────────────────────────────

export interface SepticSectionProps {
  /** Internal dimensions, m. */
  length: number; inletLength: number; outletLength: number
  liquidDepth: number; totalHeight: number; width: number
}

export function SepticSection({ length, inletLength, outletLength, liquidDepth, totalHeight, width }: SepticSectionProps) {
  const L = Math.max(length, 0.1), Ht = Math.max(totalHeight, liquidDepth, 0.1)
  const k = Math.min(360 / L, 150 / Ht)
  const wall = 0.15 * k                  // drawn wall band — internal dimensions govern
  const ML = wall + 52, MT = 30
  const X = (x: number) => ML + x * k
  const Y = (z: number) => MT + (Ht - z) * k   // z up from the floor
  const xR = X(L)
  const yFloor = Y(0), ySoffit = Y(Ht), yLiq = Y(liquidDepth)
  const yIn = yLiq - 0.075 * k           // inlet invert 75 mm above the outlet's
  const xPart = X(inletLength)
  const W = Math.max(xR + wall + 78, 300)
  const dim1 = yFloor + wall + 22, dim2 = dim1 + 22
  const H = dim2 + 40
  const mh = 0.508 * k                   // 508 mm manholes
  const stub = 10

  return (
    <DrawingFrame label="septic tank section">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[540px]" style={{ fontFamily: 'Arial, sans-serif' }}>
        {/* liquid — one ▽ in the digestive chamber; the level is common to both */}
        <rect x={X(0)} y={yLiq} width={L * k} height={yFloor - yLiq} fill={SEWAGE} />
        <line x1={X(0)} y1={yLiq} x2={xR} y2={yLiq} stroke={MUTED} strokeWidth={0.8} />
        <SurfaceMark x={X(inletLength * 0.62)} y={yLiq} />

        {/* walls, floor, cover slab — a band, internal faces are the dimensioned lines */}
        <path d={`M${X(0) - wall} ${ySoffit - wall} H${xR + wall} V${yFloor + wall} H${X(0) - wall} Z M${X(0)} ${ySoffit} V${yFloor} H${xR} V${ySoffit} Z`}
          fill="#d6dbe1" fillRule="evenodd" stroke={INK} strokeWidth={1.1} />
        {/* manhole openings over each chamber */}
        {[X(inletLength * 0.5), (xPart + xR) / 2].map((cx) => (
          <rect key={cx} x={cx - mh / 2} y={ySoffit - wall} width={mh} height={wall} fill="var(--sheet, #fff)" stroke={INK} strokeWidth={1} />
        ))}
        {/* partition wall with the transfer opening below the scum, above the sludge */}
        <rect x={xPart - wall / 3} y={ySoffit} width={wall * 2 / 3} height={Y(liquidDepth * 0.65) - ySoffit} fill="#d6dbe1" stroke={INK} strokeWidth={1} />
        <rect x={xPart - wall / 3} y={Y(liquidDepth * 0.35)} width={wall * 2 / 3} height={yFloor - Y(liquidDepth * 0.35)} fill="#d6dbe1" stroke={INK} strokeWidth={1} />

        {/* inlet and outlet sanitary tees, stubbed off just outside the walls */}
        {(() => {
          const teeDown = (x: number, y: number) => `M${x} ${y} V${Y(liquidDepth * 0.7)}`
          const xi = X(0) + 0.15 * k, xo = xR - 0.15 * k
          return <>
            <g stroke={PIPE} strokeWidth={2.4} fill="none">
              <path d={`M${X(0) - wall - stub} ${yIn} H${xi}`} />
              <path d={teeDown(xi, yIn - 8)} />
              <path d={`M${xo} ${yLiq} H${xR + wall + stub}`} />
              <path d={teeDown(xo, yLiq - 8)} />
            </g>
            <g fontSize={8.5} fill={PIPE}>
              <text x={xi + 5} y={yIn - 5} {...HALO}>inlet</text>
              <text x={xR + wall + 2} y={yLiq - 6} {...HALO}>outlet</text>
            </g>
          </>
        })()}
        <g fontSize={9} fill={INK} textAnchor="middle">
          <text x={X(inletLength * 0.5)} y={(yLiq + yFloor) / 2 + 3} {...HALO}>digestive · 2/3</text>
          <text x={(xPart + xR) / 2} y={(yLiq + yFloor) / 2 + 3} {...HALO}>{xR - xPart > 70 ? 'leaching · 1/3' : '1/3'}</text>
        </g>

        {/* chain along the floor, then the overall length */}
        <DimBelow xA={X(0)} xB={xPart} featY={yFloor + wall} dY={dim1} label={`${inletLength.toFixed(2)} m`} />
        <DimBelow xA={xPart} xB={xR} featY={yFloor + wall} dY={dim1} label={`${outletLength.toFixed(2)} m`} flipNarrow />
        <DimBelow xA={X(0)} xB={xR} featY={dim1} dY={dim2} label={`L = ${length.toFixed(2)} m`} />
        {/* liquid depth and freeboard chained on the left, clear of the outlet;
            the height overall on the right, past the outlet stub */}
        <DimSide yA={yLiq} yB={yFloor} featX={X(0) - wall} dX={X(0) - wall - 22} label={`${liquidDepth.toFixed(2)}`} side="left" />
        <DimSide yA={ySoffit} yB={yLiq} featX={X(0) - wall} dX={X(0) - wall - 22} label={`${(Ht - liquidDepth).toFixed(2)}`} side="left" />
        <DimSide yA={ySoffit} yB={yFloor} featX={xR + wall} dX={xR + wall + 44} label={`H = ${Ht.toFixed(2)} m`} side="right" />

        <g fontSize={7.5} fill={FAINT} textAnchor="middle">
          <text x={W / 2} y={H - 16}>longitudinal section · one scale · internal dimensions, m</text>
          <text x={W / 2} y={H - 6}>plan width {width.toFixed(2)} m · two 508 mm manholes</text>
        </g>
      </svg>
    </DrawingFrame>
  )
}
