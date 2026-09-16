import { useState } from 'react'
import { ResultCard, Row } from './qty'
import type { ShellNode, ShellElem, ElementStress } from '../engine/shell'
import { contourData } from '../lib/shellContour'
import {
  STRESS_KEYS, stressColor, normalise, unitFor, labelFor, type StressKey,
} from '../lib/stressScale'

// The ramp, the domain and the key list all come from `lib/stressScale`, which
// the 3D contour layer also uses. The local copies this replaces were a
// rainbow (perceptually non-uniform, and unreadable under red–green colour
// deficiency) over a linear min→max domain, which put the zero of a signed
// field wherever it happened to land.

interface Props {
  nodes: ShellNode[]
  elems: ShellElem[]
  stresses: ElementStress[]
}

export function ShellContourPanel({ nodes, elems, stresses }: Props) {
  const [key, setKey] = useState<StressKey>('vonMises')
  const { nodal, domain, peak } = contourData(nodes, elems, stresses, key)

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

  const vMin = domain.min, vMax = domain.max
  const norm = (v: number) => normalise(v, domain)
  const maxAbs = Math.max(Math.abs(vMax), Math.abs(vMin))
  const keyLabel = `${labelFor(key)} (${unitFor(key)})`

  return (
    <ResultCard title="Shell stress contour">
      {/* Quantity selector */}
      <div className="col-span-full mb-2">
        <select value={key} onChange={(e) => setKey(e.target.value as StressKey)}
          className="rounded border border-slate-300 bg-sheet px-2 py-1 text-sm text-slate-700">
          {STRESS_KEYS.map(({ key: k, label, unit }) => (
            <option key={k} value={k}>{label} ({unit})</option>
          ))}
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
                fill={stressColor(norm(cv), domain.signed)} stroke="#94a3b8" strokeWidth={0.4} opacity={0.92} />
            )
          })}
          {/* Colour bar */}
          {Array.from({ length: 20 }, (_, i) => {
            const t = i / 19
            const bx = W - 28, bw = 14, bh = (H - padT - padB) / 20
            return (
              <rect key={i} x={bx} y={H - padB - (i + 1) * bh} width={bw} height={bh + 0.5}
                fill={stressColor(t, domain.signed)} />
            )
          })}
          <text x={W - 14} y={padT + 4} fontSize={8} fill="#334155" textAnchor="middle">{vMax.toFixed(0)}</text>
          <text x={W - 14} y={H - padB - 2} fontSize={8} fill="#334155" textAnchor="middle">{vMin.toFixed(0)}</text>
        </svg>
      </div>

      {/* Summary rows */}
      <Row label={`Max |${key}|`} value={`${maxAbs.toFixed(1)} ${key.startsWith('M') ? 'kN·m/m' : 'kN/m²'}`}
        sub={`element ${peak?.id ?? '—'}`} />
      <Row label="Max von Mises" value={`${Math.max(...stresses.map((s) => s.vonMises)).toFixed(1)} kN/m²`} />
      <Row label="Max Mx bending" value={`${Math.max(...stresses.map((s) => Math.abs(s.Mx))).toFixed(3)} kN·m/m`} />
      <Row label="Elements / nodes" value={`${elems.length} / ${nodes.length}`}
        sub={`contour: ${keyLabel}`} />
    </ResultCard>
  )
}
