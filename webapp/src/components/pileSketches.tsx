// ─────────────────────────────────────────────────────────────────────────
// Drawings for the pile calculators: the single pile through its layered
// profile with the shaft and end resistances where they act, the p-y
// response down a laterally loaded pile, and the micropile bond zone and
// section. Depths are at one true scale (stated); a force bar or a response
// curve is a second, stated scale with numbered axes.
// ─────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react'
import { DrawingFrame } from './DrawingFrame'
import { HDim, VDim, SurfaceMark, WATER } from './hydraulicsSketches'
import { INK, MUTED, f2 } from '../lib/influenceStyle'
import { niceStep, tickLabel } from '../lib/chartScale'

const mono = 'var(--font-mono, monospace)'
const halo = { paintOrder: 'stroke' as const, stroke: 'var(--sheet)', strokeWidth: 3 }
const RED = 'rgba(200,60,60,0.95)'
const CLAY = 'rgba(120,94,58,0.16)', SAND = 'rgba(190,170,120,0.2)'

function Chart({ label, W, H, children }: { label: string; W: number; H: number; children: ReactNode }) {
  return (
    <DrawingFrame label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>{children}</svg>
    </DrawingFrame>
  )
}

function Arrow({ x1, y1, x2, y2, color = INK, w = 1.8 }: { x1: number; y1: number; x2: number; y2: number; color?: string; w?: number }) {
  const a = Math.atan2(y2 - y1, x2 - x1), h = 9
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2 - 6 * Math.cos(a)} y2={y2 - 6 * Math.sin(a)} stroke={color} strokeWidth={w} />
      <polygon points={`${x2},${y2} ${x2 - h * Math.cos(a - 0.4)},${y2 - h * Math.sin(a - 0.4)} ${x2 - h * Math.cos(a + 0.4)},${y2 - h * Math.sin(a + 0.4)}`} fill={color} />
    </g>
  )
}

/** The pile through its layers at one true depth scale: each layer's
 *  thickness dimensioned, its shaft resistance as a bar beside it, and the
 *  end bearing drawn AT THE TIP where it acts. */
export function PileProfile({ layers, embed, waterTable, Qp, Qult, Qall, FS, segments }: {
  layers: { kind: 'clay' | 'sand'; label: string; from: number; to: number }[]
  embed: number; waterTable: number; Qp: number; Qult: number; Qall: number; FS: number
  segments: { Q: number }[]
}) {
  const W = 680, H = 400
  const top = 52, bottom = H - 70
  const k = (bottom - top) / Math.max(embed, 0.1) // px per m
  const Y = (z: number) => top + z * k
  const x0 = 110, x1 = 380, cx = (x0 + x1) / 2, pw = 18
  const barX = 440, barW = 120, maxQ = Math.max(...segments.map((s) => s.Q), 1)
  return (
    <Chart label="Pile through the soil profile" W={W} H={H}>
      <line x1={x0 - 50} x2={x1 + 10} y1={top} y2={top} stroke={INK} strokeWidth="1.4" />
      <text x={x1 + 6} y={top - 6} textAnchor="end" fontSize="9.5" fill={MUTED} fontFamily={mono}>ground</text>
      {layers.map((l, i) => (
        <g key={i}>
          <rect x={x0} y={Y(l.from)} width={x1 - x0} height={Math.max((l.to - l.from) * k, 2)} fill={l.kind === 'clay' ? CLAY : SAND} stroke={MUTED} strokeWidth="0.7" />
          <text x={x0 + 8} y={Y(l.from) + 14} fontSize="9.5" fill={INK} fontFamily={mono} {...halo}>{l.label}</text>
          {/* thickness chain on the left, each layer between its own boundaries */}
          <line x1={x0} x2={x0 - 30} y1={Y(l.to)} y2={Y(l.to)} stroke={MUTED} strokeWidth="0.8" />
          <VDim x={x0 - 22} a={Y(l.from)} b={Y(l.to)} label={`${f2(l.to - l.from)} m`} color={INK} side="left" />
          {/* the layer's shaft resistance, at a stated force scale */}
          <rect x={barX} y={Y(l.from) + 2} width={Math.max(((segments[i]?.Q ?? 0) / maxQ) * barW, 1)} height={Math.max((l.to - l.from) * k - 4, 3)} fill="rgba(15,76,146,0.55)" />
          <text x={barX + barW + 8} y={(Y(l.from) + Y(l.to)) / 2 + 4} fontSize="9.5" fill={INK} fontFamily={mono}>Qs {f2(segments[i]?.Q ?? 0)} kN</text>
        </g>
      ))}
      <text x={barX} y={top - 8} fontSize="9.5" fill={MUTED} fontFamily={mono}>shaft resistance per layer</text>
      {Number.isFinite(waterTable) && waterTable < embed && <>
        <line x1={x0} x2={x1} y1={Y(waterTable)} y2={Y(waterTable)} stroke={WATER} strokeWidth="1.2" strokeDasharray="7 4" />
        <SurfaceMark x={x1 - 18} y={Y(waterTable)} />
        <text x={x1 - 30} y={Y(waterTable) - 4} textAnchor="end" fontSize="9.5" fill={WATER} fontFamily={mono} {...halo}>WT {f2(waterTable)} m</text>
      </>}
      {/* the pile, its width exaggerated so it reads */}
      <rect x={cx - pw / 2} y={top - 16} width={pw} height={embed * k + 16} fill="rgba(115,109,94,0.4)" stroke={INK} strokeWidth="1.4" />
      {/* end bearing acts upward at the tip */}
      <Arrow x1={cx} y1={Y(embed) + 40} x2={cx} y2={Y(embed) + 2} color={RED} w={2.2} />
      <text x={cx + 10} y={Y(embed) + 30} fontSize="10.5" fontWeight="700" fill={RED} fontFamily={mono} {...halo}>Qp {f2(Qp)} kN</text>
      <text x={x0 - 50} y={H - 12} fontSize="9.5" fill={MUTED} fontFamily={mono}>
        depths to scale (1 px = {f2(1000 / k)} mm), pile width exaggerated · Qult {f2(Qult)} kN, Qall {f2(Qall)} kN at FS {f2(FS)}
      </text>
    </Chart>
  )
}

/** Deflection, moment and soil reaction down a laterally loaded pile: three
 *  panels on one numbered depth axis, each with its own numbered axis; the
 *  head deflection and the maximum moment are marked where they occur. */
export function PyPanels({ stations, L, yHead, Mmax, zMmax }: {
  stations: { z: number; y: number; moment: number; p: number }[]; L: number; yHead: number; Mmax: number; zMmax: number
}) {
  const W = 680, H = 400
  const top = 62, bottom = H - 34, axX = 58, gap = 36
  const pw = (W - axX - 20 - 2 * gap) / 3
  const Y = (z: number) => top + (z / Math.max(L, 1e-9)) * (bottom - top)
  const zs = niceStep(L, 6)
  const zt: number[] = []
  for (let z = 0; z <= L + 1e-9; z += zs) zt.push(z)
  const panels = [
    { key: 'y' as const, title: 'deflection y (mm)', color: WATER },
    { key: 'moment' as const, title: 'moment M (kN·m)', color: INK },
    { key: 'p' as const, title: 'soil reaction p (kN/m)', color: 'rgba(120,94,58,0.95)' },
  ]
  return (
    <Chart label="p-y response down the pile" W={W} H={H}>
      {/* the shared depth axis */}
      <line x1={axX} x2={axX} y1={top} y2={bottom} stroke={INK} strokeWidth="1.1" />
      {zt.map((z) => (
        <g key={z}>
          <line x1={axX - 4} x2={axX} y1={Y(z)} y2={Y(z)} stroke={INK} strokeWidth="1" />
          <text x={axX - 7} y={Y(z) + 3.5} textAnchor="end" fontSize="9.5" fill={MUTED} fontFamily={mono}>{tickLabel(z, zs)}</text>
        </g>
      ))}
      <text x={axX - 40} y={top - 34} fontSize="10" fill={MUTED} fontFamily={mono}>z (m)</text>
      {panels.map((pn, i) => {
        const m = Math.max(...stations.map((s) => Math.abs(s[pn.key])), 1e-9)
        const st = niceStep(m, 2), lim = Math.ceil(m / st) * st
        const x0 = axX + 10 + i * (pw + gap), cx = x0 + pw / 2
        const X = (v: number) => cx + (v / lim) * (pw / 2)
        const ticks = [-lim, -lim / 2, 0, lim / 2, lim]
        const d = stations.map((s, j) => `${j ? 'L' : 'M'}${X(s[pn.key]).toFixed(1)},${Y(s.z).toFixed(1)}`).join(' ')
        return (
          <g key={pn.key}>
            <text x={cx} y={top - 34} textAnchor="middle" fontSize="10" fontWeight="700" fill={INK} fontFamily={mono}>{pn.title}</text>
            <line x1={x0} x2={x0 + pw} y1={top} y2={top} stroke={INK} strokeWidth="1" />
            {ticks.map((v) => (
              <g key={v}>
                <line x1={X(v)} x2={X(v)} y1={top - 4} y2={top} stroke={INK} strokeWidth="1" />
                {Math.abs(v) !== lim / 2 && <text x={X(v)} y={top - 9} textAnchor="middle" fontSize="9" fill={MUTED} fontFamily={mono}>{tickLabel(v, st)}</text>}
              </g>
            ))}
            {zt.slice(1).map((z) => <line key={z} x1={x0} x2={x0 + pw} y1={Y(z)} y2={Y(z)} stroke="var(--hairline, #e5e2da)" strokeWidth="0.6" />)}
            <line x1={cx} x2={cx} y1={top} y2={bottom} stroke={MUTED} strokeWidth="0.8" />
            <path d={d} fill="none" stroke={pn.color} strokeWidth="2" />
            {pn.key === 'y' && <text x={X(stations[0]?.y ?? 0) + (yHead >= 0 ? 6 : -6)} y={top + 14} textAnchor={yHead >= 0 ? 'start' : 'end'} fontSize="9.5" fontWeight="700" fill={INK} fontFamily={mono} {...halo}>{f2(yHead)} mm</text>}
            {pn.key === 'moment' && (() => {
              const sAt = stations.reduce((b, s) => (Math.abs(s.moment) > Math.abs(b.moment) ? s : b), stations[0])
              return sAt ? <>
                <circle cx={X(sAt.moment)} cy={Y(zMmax)} r="3.5" fill={RED} />
                <text x={X(sAt.moment) + (sAt.moment >= 0 ? -6 : 6)} y={Y(zMmax) + 16} textAnchor={sAt.moment >= 0 ? 'end' : 'start'} fontSize="9.5" fontWeight="700" fill={RED} fontFamily={mono} {...halo}>Mmax {f2(Mmax)} at {f2(zMmax)} m</text>
              </> : null
            })()}
          </g>
        )
      })}
    </Chart>
  )
}

/** The micropile: an elevation of the bonded zone (its length and diameter
 *  dimensioned, the load at the head) beside the cross-section at true
 *  scale — bar, grout and casing. The free length above the bond zone is not
 *  designed here and is drawn broken. */
export function MicropileDrawing({ barDia, groutDia, casing, casingOD, casingID, bondDia, bondLength, mode, P }: {
  barDia: number; groutDia: number; casing: boolean; casingOD: number; casingID: number
  bondDia: number; bondLength: number; mode: 'compression' | 'tension'; P: number
}) {
  const W = 680, H = 440
  // elevation: bond zone to its own length scale
  const top = 104, kb = 230 / Math.max(bondLength, 0.5), ex = 170
  const bondTop = top + 50, bondBot = bondTop + bondLength * kb
  const dPx = Math.max(bondDia * kb, 14) // bond diameter, at least visible
  const shaft = Math.max((groutDia / 1000) * kb, 8)
  // section: true scale, mm
  const sx = 520, sy = 230, outer = casing ? Math.max(casingOD, groutDia) : groutDia
  const ks = 150 / Math.max(outer, 1) // px per mm
  const up = mode === 'tension'
  return (
    <Chart label="Micropile bond zone and section" W={W} H={H}>
      {/* elevation */}
      <text x={ex} y={24} textAnchor="middle" fontSize="10" fontWeight="700" fill={INK} fontFamily={mono}>ELEVATION</text>
      <rect x={ex - shaft / 2} y={top} width={shaft} height={bondTop - top} fill="rgba(115,109,94,0.3)" stroke={INK} strokeWidth="1.2" />
      {/* break line: the free length is not designed here */}
      <path d={`M ${ex - shaft} ${top + 22} l ${shaft / 2} -6 l ${shaft / 2} 12 l ${shaft / 2} -6 l ${shaft / 2} 0`} fill="none" stroke={INK} strokeWidth="1.1" />
      <text x={ex + shaft + 8} y={top + 26} fontSize="9.5" fill={MUTED} fontFamily={mono}>free length (not designed here)</text>
      <rect x={ex - dPx / 2} y={bondTop} width={dPx} height={bondBot - bondTop} fill="rgba(146,120,80,0.32)" stroke={INK} strokeWidth="1.3" />
      <line x1={ex} x2={ex} y1={top} y2={bondBot - 4} stroke={INK} strokeWidth="2" />
      <Arrow x1={ex} y1={up ? top + 2 : top - 50} x2={ex} y2={up ? top - 50 : top - 2} color={RED} w={2.2} />
      <text x={ex + 10} y={top - 26} fontSize="10.5" fontWeight="700" fill={RED} fontFamily={mono} {...halo}>P {f2(P)} kN ({mode})</text>
      <line x1={ex - dPx / 2} x2={ex - dPx / 2 - 40} y1={bondTop} y2={bondTop} stroke={MUTED} strokeWidth="0.8" />
      <line x1={ex - dPx / 2} x2={ex - dPx / 2 - 40} y1={bondBot} y2={bondBot} stroke={MUTED} strokeWidth="0.8" />
      <VDim x={ex - dPx / 2 - 32} a={bondTop} b={bondBot} label={`Lb ${f2(bondLength)} m`} color={INK} side="left" />
      <line x1={ex - dPx / 2} x2={ex - dPx / 2} y1={bondBot + 4} y2={bondBot + 30} stroke={MUTED} strokeWidth="0.8" />
      <line x1={ex + dPx / 2} x2={ex + dPx / 2} y1={bondBot + 4} y2={bondBot + 30} stroke={MUTED} strokeWidth="0.8" />
      <HDim y={bondBot + 24} a={ex - dPx / 2} b={ex + dPx / 2} label={`Db ${f2(bondDia * 1000)} mm`} />
      <text x={ex + dPx / 2 + 10} y={(bondTop + bondBot) / 2} fontSize="9.5" fill={INK} fontFamily={mono} {...halo}>grout-to-ground bond</text>
      <text x={ex + dPx / 2 + 10} y={(bondTop + bondBot) / 2 + 13} fontSize="9.5" fill={MUTED} fontFamily={mono}>length 1 px = {f2(1000 / kb)} mm, ⌀ exaggerated</text>
      {/* section, true scale */}
      <text x={sx} y={24} textAnchor="middle" fontSize="10" fontWeight="700" fill={INK} fontFamily={mono}>SECTION</text>
      {casing && <>
        <circle cx={sx} cy={sy} r={(casingOD / 2) * ks} fill="rgba(31,41,55,0.55)" stroke={INK} strokeWidth="1.2" />
        <circle cx={sx} cy={sy} r={(casingID / 2) * ks} fill="var(--sheet)" stroke={INK} strokeWidth="0.8" />
      </>}
      <circle cx={sx} cy={sy} r={((casing ? Math.min(casingID, groutDia) : groutDia) / 2) * ks} fill="rgba(115,109,94,0.3)" stroke={INK} strokeWidth="1.1" />
      <circle cx={sx} cy={sy} r={(barDia / 2) * ks} fill={INK} />
      {/* diameters, each between extension lines from its own circle */}
      {(() => {
        const rows = [
          { d: barDia, label: `bar ⌀${f2(barDia)}` },
          { d: casing ? Math.min(casingID, groutDia) : groutDia, label: `grout ⌀${f2(groutDia)}` },
          ...(casing ? [{ d: casingOD, label: `casing ${f2(casingOD)}/${f2(casingID)}` }] : []),
        ]
        return rows.map((r, i) => {
          const yy = sy + (outer / 2) * ks + 26 + i * 26, a = sx - (r.d / 2) * ks, b = sx + (r.d / 2) * ks
          return <g key={i}>
            <line x1={a} x2={a} y1={sy} y2={yy + 4} stroke={MUTED} strokeWidth="0.6" strokeDasharray="2 2" />
            <line x1={b} x2={b} y1={sy} y2={yy + 4} stroke={MUTED} strokeWidth="0.6" strokeDasharray="2 2" />
            <HDim y={yy} a={a} b={b} label={`${r.label} mm`} />
          </g>
        })
      })()}
      <text x={sx} y={H - 12} textAnchor="middle" fontSize="9.5" fill={MUTED} fontFamily={mono}>section to scale (1 px = {f2(1 / ks)} mm)</text>
    </Chart>
  )
}
