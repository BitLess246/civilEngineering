import type { Key } from 'react'
import type { JSX } from 'react'
import { udlStations } from './udl'
import type { Support, BeamLoad } from '../engine/beamAnalysis'
import { DrawingFrame } from './DrawingFrame'
import { DimBelow } from './dims'
import { loadColor, LOAD_NAME } from '../lib/loadColors'

const BEAM = '#37526e'
const SUP = '#0056b3'

/** Elevation sketch of the analysis model: beam line, support symbols
 *  (pin / roller / fixed / spring) and load glyphs (point, UDL/VDL, moment). */
export function BeamElevation({ L, supports, loads, spans }: {
  L: number; supports: Support[]; loads: BeamLoad[]
  /** Spans laid end to end, each with its own section: dimensioned one by one
   *  and drawn thicker where the section is stiffer (E·I). Omit for one span. */
  spans?: readonly { L: number; E: number; I: number }[]
}): JSX.Element {
  // Distributed loads that overlap along the span are STACKED, one tier per
  // load, each sitting on the one below — drawn at the same height, a live
  // UDL over the same span as the dead one vanished behind it.
  // a tier is its arrows (26) + clear air: the label sits INSIDE the arrows on
  // a halo, so stacked loads no longer need room for a label between them
  const TIER = 34
  const tierOf: number[] = []
  const placed: { a: number; b: number; t: number }[] = []
  loads.forEach((ld, i) => {
    if (ld.type !== 'udl' && ld.type !== 'vdl') { tierOf[i] = 0; return }
    const a = Math.min(ld.x1, ld.x2), b = Math.max(ld.x1, ld.x2)
    let t = 0
    while (placed.some((p) => p.t === t && p.a < b - 1e-9 && a < p.b - 1e-9)) t++
    placed.push({ a, b, t }); tierOf[i] = t
  })
  const tiers = Math.max(1, ...placed.map((p) => p.t + 1))
  const multi = !!spans && spans.length > 1
  let acc = 0
  const spanXs = (spans ?? []).map((s) => { const g = { x0: acc, x1: acc + s.L, E: s.E, I: s.I }; acc += s.L; return g })
  const eiMax = Math.max(1e-9, ...spanXs.map((g) => g.E * g.I))
  const W = 560, H = 156 + (tiers - 1) * TIER + (multi ? 16 : 0)
  const padL = 30, padR = 30
  const bx0 = padL, bx1 = W - padR
  const sx = (x: number) => bx0 + ((bx1 - bx0) * Math.max(0, Math.min(L, x))) / Math.max(L, 1e-9)
  const by = 78 + (tiers - 1) * TIER
  // loads are coloured by category; a key appears once there is more than one
  const cats = [...new Set(loads.map((l) => l.cat))]
  const HALO = { paintOrder: 'stroke' as const, stroke: 'var(--sheet, #fff)', strokeWidth: 3 }

  const supSym = (s: Support, i: number) => {
    const x = sx(s.x)
    if (s.type === 'fixed') {
      const dir = s.x < L / 2 ? -1 : 1
      return (
        <g key={`s${i}`} stroke={SUP} strokeWidth={1.6}>
          <line x1={x} y1={by - 18} x2={x} y2={by + 18} />
          {[-14, -7, 0, 7, 14].map((dy) => (
            <line key={dy} x1={x} y1={by + dy} x2={x + dir * 7} y2={by + dy + 6} strokeWidth={1} />
          ))}
        </g>
      )
    }
    if (s.type === 'spring') {
      const zig = `M ${x} ${by + 2} l 0 4 l 5 3 l -10 5 l 10 5 l -10 5 l 5 3 l 0 4`
      return (
        <g key={`s${i}`} stroke={SUP} strokeWidth={1.4} fill="none">
          <path d={zig} />
          <line x1={x - 9} y1={by + 31} x2={x + 9} y2={by + 31} />
          <text x={x} y={by + 43} fontSize={8} fill={SUP} textAnchor="middle" stroke="none">k={s.k ?? 1000}</text>
        </g>
      )
    }
    return (
      <g key={`s${i}`} stroke={SUP} strokeWidth={1.4} fill="none">
        <path d={`M ${x} ${by + 1} L ${x - 8} ${by + 15} L ${x + 8} ${by + 15} Z`} fill="#fff" />
        {s.type === 'roller'
          ? <g>{[-5, 0, 5].map((dx) => <circle key={dx} cx={x + dx} cy={by + 19} r={2.6} />)}</g>
          : <g>{[-8, -3, 2, 7].map((dx) => <line key={dx} x1={x + dx} y1={by + 15} x2={x + dx - 4} y2={by + 21} strokeWidth={1} />)}</g>}
        <text x={x} y={by + 32} fontSize={8} fill={SUP} textAnchor="middle" stroke="none">{s.type}</text>
      </g>
    )
  }

  // `key` is threaded in because this helper is called inside a .map for the
  // UDL/VDL station arrows — React cannot key an element the caller did not
  // create, and without it every distributed load logged a key warning.
  const arrow = (x: number, y0: number, y1: number, color: string, key?: Key) => (
    <g key={key} stroke={color} strokeWidth={1.4}>
      <line x1={x} y1={y0} x2={x} y2={y1} />
      <path d={`M ${x - 3.5} ${y1 - 6} L ${x} ${y1} L ${x + 3.5} ${y1 - 6}`} fill="none" />
    </g>
  )

  const loadGlyph = (ld: BeamLoad, i: number) => {
    const c = loadColor(ld.cat)
    if (ld.type === 'point') {
      const x = sx(ld.x)
      return (
        <g key={`l${i}`}>
          {arrow(x, by - 44, by - 3, c)}
          <text x={x} y={by - 48} fontSize={8.5} fill={c} textAnchor="middle" {...HALO}>{ld.P} kN ({ld.cat})</text>
        </g>
      )
    }
    if (ld.type === 'moment') {
      const x = sx(ld.x)
      const ccw = ld.M >= 0
      return (
        <g key={`l${i}`} stroke={c} fill="none" strokeWidth={1.4}>
          <path d={`M ${x - 8} ${by - 12} A 9 9 0 1 ${ccw ? 0 : 1} ${x + 8} ${by - 12}`} />
          <path d={ccw ? `M ${x + 8} ${by - 12} l -5 -4 m 5 4 l -6 2` : `M ${x - 8} ${by - 12} l 5 -4 m -5 4 l 6 2`} strokeWidth={1.2} />
          <text x={x} y={by - 26} fontSize={8.5} fill={c} textAnchor="middle" {...HALO}>{ld.M} kN·m ({ld.cat})</text>
        </g>
      )
    }
    const xa = sx(ld.x1), xb = sx(ld.x2)
    const base = by - 3 - tierOf[i] * TIER          // the beam, or the top of the load below
    const h1 = ld.type === 'udl' ? 26 : Math.max(8, 26 * (Math.abs(ld.w1) / Math.max(Math.abs(ld.w1), Math.abs(ld.w2), 1e-9)))
    const h2 = ld.type === 'udl' ? 26 : Math.max(8, 26 * (Math.abs(ld.w2) / Math.max(Math.abs(ld.w1), Math.abs(ld.w2), 1e-9)))
    const stations = udlStations(xb - xa)
    const label = ld.type === 'udl' ? `${ld.w} kN/m (${ld.cat})` : `${ld.w1}→${ld.w2} kN/m (${ld.cat})`
    return (
      <g key={`l${i}`}>
        <line x1={xa} y1={base - 1 - h1} x2={xb} y2={base - 1 - h2} stroke={c} strokeWidth={1.2} />
        {stations.map((t, k) => {
          const x = xa + (xb - xa) * t
          const hh = h1 + (h2 - h1) * t
          return arrow(x, base - 1 - hh, base, c, k)
        })}
        {/* inside the arrows, mid-height of the load at mid-span, on a halo */}
        <text x={(xa + xb) / 2} y={base - 1 - Math.max(16, (h1 + h2) / 2) / 2 + 3} fontSize={8.5} fill={c} textAnchor="middle"
          fontWeight={600} {...HALO}>{label}</text>
      </g>
    )
  }

  return (
    <DrawingFrame label="beam elevation">
      <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
        {multi ? spanXs.map((g, k) => (
          // stroke 3–7 px by relative E·I, so a stiffer span reads as heavier
          <line key={`b${k}`} x1={sx(g.x0)} y1={by} x2={sx(g.x1)} y2={by} stroke={BEAM} strokeLinecap="butt"
            strokeWidth={3 + 4 * Math.cbrt((g.E * g.I) / eiMax)} />
        )) : <line x1={bx0} y1={by} x2={bx1} y2={by} stroke={BEAM} strokeWidth={4} strokeLinecap="round" />}
        {multi && spanXs.slice(1).map((g, k) => (
          <line key={`j${k}`} x1={sx(g.x0)} y1={by - 9} x2={sx(g.x0)} y2={by + 9} stroke={BEAM} strokeWidth={0.8} strokeDasharray="2 2" />
        ))}
        {cats.length > 1 && <g fontSize={8}>
          {cats.map((cat, k) => {
            const x = bx1 - (cats.length - 1 - k) * 74 - 60
            return <g key={cat}>
              <rect x={x} y={8} width={9} height={9} fill={loadColor(cat)} />
              <text x={x + 13} y={16} fill={loadColor(cat)}>{cat} · {LOAD_NAME[cat]}</text>
            </g>
          })}
        </g>}
        {supports.map(supSym)}
        {loads.map(loadGlyph)}
        {/* the span, dimensioned — it used to be two loose labels, "0" and
            "L = 6 m", with nothing between them */}
        {multi ? spanXs.map((g, k) => (
          <g key={`d${k}`}>
            <DimBelow xA={sx(g.x0)} xB={sx(g.x1)} featY={by + 36} dY={by + 54} label={`L${k + 1} = ${+(g.x1 - g.x0).toFixed(3)} m`} />
            <text x={(sx(g.x0) + sx(g.x1)) / 2} y={by + 76} fontSize={8} fill={BEAM} textAnchor="middle">
              E {g.E} MPa · I {g.I.toExponential(2)} mm⁴
            </text>
          </g>
        )) : <DimBelow xA={bx0} xB={bx1} featY={by + 36} dY={by + 54} label={`L = ${L} m`} />}
      </svg>
    </DrawingFrame>
  )
}
