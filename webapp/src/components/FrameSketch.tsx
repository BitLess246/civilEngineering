import type { JSX } from 'react'
import type { FNode, FMember, FSupport, FLoad } from '../engine/frame2d'

const MEM = '#37526e'
const SUP = '#0056b3'
const LOAD = '#dc2626'
const SEL = '#f59e0b'

/** 2D frame elevation: members, node ids, support symbols and load glyphs. */
export function FrameSketch({ nodes, members, supports, loads, selected }: {
  nodes: FNode[]; members: FMember[]; supports: FSupport[]; loads: FLoad[]; selected?: string
}): JSX.Element {
  const W = 560, H = 320
  const pad = 46
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y)
  const minX = Math.min(0, ...xs), maxX = Math.max(1, ...xs)
  const minY = Math.min(0, ...ys), maxY = Math.max(1, ...ys)
  const s = Math.min((W - 2 * pad) / Math.max(maxX - minX, 1e-9), (H - 2 * pad) / Math.max(maxY - minY, 1e-9))
  const sx = (x: number) => pad + (x - minX) * s
  const sy = (y: number) => H - pad - (y - minY) * s
  const nm = new Map(nodes.map((n) => [n.id, n]))

  const mid = (m: FMember) => {
    const a = nm.get(m.i), b = nm.get(m.j)
    if (!a || !b) return null
    return { x1: sx(a.x), y1: sy(a.y), x2: sx(b.x), y2: sy(b.y) }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      {/* members */}
      {members.map((m) => {
        const g = mid(m)
        if (!g) return null
        const cx = (g.x1 + g.x2) / 2, cy = (g.y1 + g.y2) / 2
        const sel = m.id === selected
        return (
          <g key={m.id}>
            <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}
              stroke={sel ? SEL : MEM} strokeWidth={sel ? 5 : 3.5} strokeLinecap="round" />
            <text x={cx + 6} y={cy - 6} fontSize={9} fill={sel ? SEL : MEM} fontWeight={700}>{m.id}</text>
          </g>
        )
      })}

      {/* member loads */}
      {loads.map((ld, k) => {
        if (ld.kind === 'node') {
          const n = nm.get(ld.node)
          if (!n) return null
          const x = sx(n.x), y = sy(n.y)
          return (
            <g key={k} stroke={LOAD} strokeWidth={1.3} fill="none">
              {ld.Fy !== 0 && <g><line x1={x} y1={y - 34} x2={x} y2={y - 6} /><path d={`M ${x - 3} ${y - 12} L ${x} ${y - 6} L ${x + 3} ${y - 12}`} /></g>}
              {ld.Fx !== 0 && <g><line x1={x - 34 * Math.sign(ld.Fx)} y1={y} x2={x - 6 * Math.sign(ld.Fx)} y2={y} /><path d={`M ${x - 12 * Math.sign(ld.Fx)} ${y - 3} L ${x - 6 * Math.sign(ld.Fx)} ${y} L ${x - 12 * Math.sign(ld.Fx)} ${y + 3}`} /></g>}
              <text x={x + 6} y={y - 22} fontSize={8} fill={LOAD} stroke="none">
                {[ld.Fx ? `Fx=${ld.Fx}` : '', ld.Fy ? `Fy=${ld.Fy}` : '', ld.Mz ? `M=${ld.Mz}` : ''].filter(Boolean).join(' ')} ({ld.cat})
              </text>
            </g>
          )
        }
        const m = members.find((q) => q.id === ld.member)
        const g = m ? mid(m) : null
        if (!g) return null
        if (ld.kind === 'member-udl') {
          const nA = 6
          return (
            <g key={k} stroke={LOAD} strokeWidth={1.1}>
              {Array.from({ length: nA + 1 }, (_, i) => {
                const t = i / nA
                const x = g.x1 + (g.x2 - g.x1) * t, y = g.y1 + (g.y2 - g.y1) * t
                return <g key={i}><line x1={x} y1={y - 22} x2={x} y2={y - 4} /><path d={`M ${x - 2.5} ${y - 9} L ${x} ${y - 4} L ${x + 2.5} ${y - 9}`} fill="none" /></g>
              })}
              <text x={(g.x1 + g.x2) / 2} y={(g.y1 + g.y2) / 2 - 26} fontSize={8} fill={LOAD} stroke="none" textAnchor="middle">
                w={ld.w} kN/m ({ld.cat})
              </text>
            </g>
          )
        }
        const m2 = nm.get(m!.i)!, m3 = nm.get(m!.j)!
        const L = Math.hypot(m3.x - m2.x, m3.y - m2.y)
        const t = Math.max(0, Math.min(1, ld.a / Math.max(L, 1e-9)))
        const x = g.x1 + (g.x2 - g.x1) * t, y = g.y1 + (g.y2 - g.y1) * t
        return (
          <g key={k} stroke={LOAD} strokeWidth={1.3} fill="none">
            <line x1={x} y1={y - 30} x2={x} y2={y - 4} />
            <path d={`M ${x - 3} ${y - 10} L ${x} ${y - 4} L ${x + 3} ${y - 10}`} />
            <text x={x + 4} y={y - 20} fontSize={8} fill={LOAD} stroke="none">P={ld.P} ({ld.cat})</text>
          </g>
        )
      })}

      {/* supports */}
      {supports.map((sp, k) => {
        const n = nm.get(sp.node)
        if (!n) return null
        const x = sx(n.x), y = sy(n.y)
        if (sp.type === 'fixed') {
          return (
            <g key={k} stroke={SUP} strokeWidth={1.5}>
              <line x1={x - 12} y1={y + 2} x2={x + 12} y2={y + 2} />
              {[-10, -4, 2, 8].map((dx) => <line key={dx} x1={x + dx} y1={y + 2} x2={x + dx - 5} y2={y + 9} strokeWidth={1} />)}
            </g>
          )
        }
        return (
          <g key={k} stroke={SUP} strokeWidth={1.4} fill="#fff">
            <path d={`M ${x} ${y + 1} L ${x - 8} ${y + 14} L ${x + 8} ${y + 14} Z`} />
            {sp.type === 'roller' && [-5, 0, 5].map((dx) => <circle key={dx} cx={x + dx} cy={y + 18} r={2.4} />)}
          </g>
        )
      })}

      {/* nodes */}
      {nodes.map((n) => (
        <g key={n.id}>
          <circle cx={sx(n.x)} cy={sy(n.y)} r={3.4} fill="#fff" stroke={MEM} strokeWidth={1.6} />
          <text x={sx(n.x) - 6} y={sy(n.y) - 7} fontSize={9} fill={MEM} textAnchor="end">{n.id}</text>
        </g>
      ))}
    </svg>
  )
}
