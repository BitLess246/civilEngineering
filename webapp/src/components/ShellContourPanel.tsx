import { useState } from 'react'
import { ResultCard, Row } from './qty'
import type { ShellNode, ShellElem, ElementStress } from '../engine/shell'
import { shellNodalContour } from '../engine/shell'

type StressKey = 'vonMises' | 'sigmaX' | 'sigmaY' | 'tauXY' | 'sigma1' | 'sigma2' | 'Mx' | 'My' | 'Mxy'
const KEYS: [StressKey, string][] = [
  ['vonMises', 'Von Mises σvm (kN/m²)'],
  ['sigmaX',  'σx (kN/m²)'],
  ['sigmaY',  'σy (kN/m²)'],
  ['tauXY',   'τxy (kN/m²)'],
  ['sigma1',  'σ₁ principal (kN/m²)'],
  ['sigma2',  'σ₂ principal (kN/m²)'],
  ['Mx',      'Mx (kN·m/m)'],
  ['My',      'My (kN·m/m)'],
  ['Mxy',     'Mxy (kN·m/m)'],
]

// ── Colour map: blue (low) → cyan → green → yellow → red (high) ──────────────
function heatColor(t: number): string {
  const c = Math.max(0, Math.min(1, t))
  const r = Math.round(255 * Math.min(1, 2 * c))
  const g = Math.round(255 * Math.min(1, 2 * (1 - Math.abs(c - 0.5))))
  const b = Math.round(255 * Math.max(0, 1 - 2 * c))
  return `rgb(${r},${g},${b})`
}

interface Props {
  nodes: ShellNode[]
  elems: ShellElem[]
  stresses: ElementStress[]
}

export function ShellContourPanel({ nodes, elems, stresses }: Props) {
  const [key, setKey] = useState<StressKey>('vonMises')
  const nodal = shellNodalContour(nodes, elems, stresses, key)

  // ── Build projected 2D geometry (use global x,z as the 2D plane if mostly horizontal,
  //    or x,y otherwise — pick the two axes with the most spread). ───────────────────
  const W = 460, H = 300, padL = 10, padR = 10, padT = 10, padB = 10
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y), zs = nodes.map((n) => n.z)
  const spanX = Math.max(...xs) - Math.min(...xs)
  const spanY = Math.max(...ys) - Math.min(...ys)
  const spanZ = Math.max(...zs) - Math.min(...zs)
  // Pick the two axes with largest span
  const axes = (['x', 'y', 'z'] as const).map((a, i) => ({ a, s: [spanX, spanY, spanZ][i] }))
    .sort((a, b) => b.s - a.s)
  const ax0 = axes[0].a, ax1 = axes[1].a
  const coord = (n: ShellNode): [number, number] => [n[ax0], n[ax1]]

  const px = nodes.map((n) => coord(n)[0]), py = nodes.map((n) => coord(n)[1])
  const [pxMin, pxMax] = [Math.min(...px), Math.max(...px)]
  const [pyMin, pyMax] = [Math.min(...py), Math.max(...py)]
  const rangeX = pxMax - pxMin || 1, rangeY = pyMax - pyMin || 1
  const scale = Math.min((W - padL - padR) / rangeX, (H - padT - padB) / rangeY)
  const offX = padL + ((W - padL - padR) - rangeX * scale) / 2
  const offY = padT + ((H - padT - padB) - rangeY * scale) / 2
  const sx = (v: number) => offX + (v - pxMin) * scale
  const sy = (v: number) => offY + (rangeY - (v - pyMin)) * scale   // flip Y

  const nodeXY = new Map(nodes.map((n) => [n.id, [sx(coord(n)[0]), sy(coord(n)[1])] as [number, number]]))

  // Min/max of nodal contour (for scaling colours)
  const vals = [...nodal.values()]
  const vMin = Math.min(...vals), vMax = Math.max(...vals)
  const vRange = vMax - vMin || 1
  const norm = (v: number) => (v - vMin) / vRange

  const maxAbs = Math.max(Math.abs(vMax), Math.abs(vMin))
  const peakElem = stresses.reduce((a, b) => {
    const av = Math.abs(a[key] as number), bv = Math.abs(b[key] as number)
    return bv > av ? b : a
  }, stresses[0])

  const keyLabel = KEYS.find(([k]) => k === key)?.[1] ?? key

  return (
    <ResultCard title="Shell stress contour">
      {/* Quantity selector */}
      <div className="col-span-full mb-2">
        <select value={key} onChange={(e) => setKey(e.target.value as StressKey)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700">
          {KEYS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>

      {/* SVG contour */}
      <div className="col-span-full mb-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto' }}>
          {elems.map((e) => {
            const pts = e.nodes.map((id) => {
              const [x, y] = nodeXY.get(id)!
              return `${x.toFixed(1)},${y.toFixed(1)}`
            }).join(' ')
            // Colour by element centroid value (average of its 3 node values)
            const cv = e.nodes.reduce((s, id) => s + (nodal.get(id) ?? 0), 0) / 3
            return (
              <polygon key={e.id} points={pts}
                fill={heatColor(norm(cv))} stroke="#94a3b8" strokeWidth={0.4} opacity={0.92} />
            )
          })}
          {/* Colour bar */}
          {Array.from({ length: 20 }, (_, i) => {
            const t = i / 19
            const bx = W - 28, bw = 14, bh = (H - padT - padB) / 20
            return (
              <rect key={i} x={bx} y={H - padB - (i + 1) * bh} width={bw} height={bh + 0.5}
                fill={heatColor(t)} />
            )
          })}
          <text x={W - 14} y={padT + 4} fontSize={8} fill="#334155" textAnchor="middle">{vMax.toFixed(0)}</text>
          <text x={W - 14} y={H - padB - 2} fontSize={8} fill="#334155" textAnchor="middle">{vMin.toFixed(0)}</text>
        </svg>
      </div>

      {/* Summary rows */}
      <Row label={`Max |${key}|`} value={`${maxAbs.toFixed(1)} ${key.startsWith('M') ? 'kN·m/m' : 'kN/m²'}`}
        sub={`element ${peakElem?.id ?? '—'}`} />
      <Row label="Max von Mises" value={`${Math.max(...stresses.map((s) => s.vonMises)).toFixed(1)} kN/m²`} />
      <Row label="Max Mx bending" value={`${Math.max(...stresses.map((s) => Math.abs(s.Mx))).toFixed(3)} kN·m/m`} />
      <Row label="Elements / nodes" value={`${elems.length} / ${nodes.length}`}
        sub={`contour: ${keyLabel}`} />
    </ResultCard>
  )
}
