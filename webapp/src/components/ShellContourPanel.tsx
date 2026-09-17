import { useEffect, useMemo, useRef, useState } from 'react'
import { ResultCard, Row } from './qty'
import type { ShellNode, ShellElem, ElementStress } from '../engine/shell'
import { contourData } from '../lib/shellContour'
import {
  STRESS_KEYS, stressColorRGB, normalise, unitFor, labelFor,
  rampSwatches, rampTicks, DEFAULT_BANDS, bandCenter, type StressKey,
} from '../lib/stressScale'
import { groupPlates, projectNode, barycentric, type PlateGroup } from './modelSpace/contour'

interface Props {
  nodes: ShellNode[]
  elems: ShellElem[]
  stresses: ElementStress[]
  /** The load combination the field was solved for (labelled on the card). */
  caseName?: string
  /** 'frame' = recovered from the full frame analysis (real load path);
   *  'standalone' = isolated shell mesh solve. */
  source?: 'frame' | 'standalone'
}

const BANDS = DEFAULT_BANDS

export function ShellContourPanel({ nodes, elems, stresses, caseName, source }: Props) {
  // Default vmSurf: the surface von Mises (membrane ± bending fibre). The
  // membrane-only vonMises reads ~0 on the commonest model in the app — a
  // gravity slab is bending-dominated and the CST membrane carries none of it.
  const [key, setKey] = useState<StressKey>('vmSurf')

  // Nodal field + the SAME domain the 3D contour layer paints — one scale,
  // from `lib/stressScale`, so the tile and the model cannot disagree.
  const { nodal, domain, peak } = useMemo(
    () => contourData(nodes, elems, stresses, key),
    [nodes, elems, stresses, key],
  )

  const plates = useMemo(() => groupPlates(nodes, elems), [nodes, elems])
  const swatches = rampSwatches(BANDS, domain.signed, BANDS)
  const ticks = rampTicks(domain, 5)

  return (
    <ResultCard title="Shell stress contour">
      <div className="col-span-full mb-1 flex flex-wrap items-center gap-2">
        <select value={key} onChange={(e) => setKey(e.target.value as StressKey)}
          className="rounded border border-field-line bg-sheet px-2 py-1 text-sm text-ink-2">
          {STRESS_KEYS.map(({ key: k, label, unit }) => (
            <option key={k} value={k}>{label} ({unit})</option>
          ))}
        </select>
        {caseName && <span className="rounded bg-field px-2 py-0.5 text-[11px] text-ink-2">{caseName}</span>}
        {source && <span className="text-[11px] text-faint">{source === 'frame' ? 'from the frame solve' : 'isolated shell solve'}</span>}
      </div>

      {/* One tile per panel — walls no longer fold onto slabs, storeys no longer stack */}
      <div className="col-span-full mb-2 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {plates.map((g) => (
          <PlateTile key={g.id} g={g} nodal={nodal} domain={domain} />
        ))}
      </div>

      {/* Legend: the same band colours the tiles rasterise, low → high */}
      <div className="col-span-full mb-3">
        <div className="flex h-3 w-44 overflow-hidden rounded-sm border border-hairline">
          {swatches.map((c, i) => <div key={i} className="h-full flex-1" style={{ background: c }} />)}
        </div>
        <div className="mt-0.5 flex w-44 justify-between text-[10px] tabular-nums text-muted">
          {ticks.map((t, i) => <span key={i}>{t}</span>)}
        </div>
        <span className="mt-0.5 block text-[11px] text-faint">{labelFor(key)} ({unitFor(key)})</span>
      </div>

      <Row label={`Max |${labelFor(key)}|`} value={`${Math.abs(peak?.value ?? 0).toFixed(1)} ${unitFor(key)}`}
        sub={peak ? `element ${peak.id}` : '—'} />
      <Row label="Max surface von Mises" value={`${Math.max(0, ...stresses.map((s) => s.vmSurf)).toFixed(1)} kN/m²`}
        sub="membrane ± bending fibre" />
      <Row label="Max Mx bending" value={`${Math.max(0, ...stresses.map((s) => Math.abs(s.Mx))).toFixed(3)} kN·m/m`} />
      <Row label="Elements / nodes" value={`${elems.length} / ${nodes.length}`}
        sub={`${plates.length} panel${plates.length === 1 ? '' : 's'}`} />
    </ResultCard>
  )
}

/** One panel's contour, rasterised with per-pixel barycentric blending of the
 *  three corner values — continuous across element edges (a shared edge
 *  interpolates the same two node colours on both sides), unlike the flat
 *  per-element fills this replaces. Values snap to band centres, so the
 *  boundaries between colour bands ARE the iso-lines. */
function PlateTile({ g, nodal, domain }: {
  g: PlateGroup; nodal: Map<string, number>; domain: ReturnType<typeof contourData>['domain']
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  // 2D geometry for this panel, fitted to a fixed tile box (equal aspect).
  const tile = useMemo(() => {
    const W = 220, H = 160, pad = 6
    const uvs = new Map<string, [number, number]>()
    for (const n of g.nodes) uvs.set(n.id, projectNode(n, g))
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity
    for (const [u, v] of uvs.values()) {
      if (u < uMin) uMin = u
      if (u > uMax) uMax = u
      if (v < vMin) vMin = v
      if (v > vMax) vMax = v
    }
    if (!Number.isFinite(uMin)) return null
    const spanU = uMax - uMin || 1, spanV = vMax - vMin || 1
    const s = Math.min((W - 2 * pad) / spanU, (H - 2 * pad) / spanV)
    const ox = (W - spanU * s) / 2, oy = (H - spanV * s) / 2
    const px = new Map<string, [number, number]>()
    for (const [id, [u, v]] of uvs) px.set(id, [ox + (u - uMin) * s, H - (oy + (v - vMin) * s)])
    return { W, H, px }
  }, [g])

  useEffect(() => {
    const cv = ref.current
    if (!cv || !tile) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = tile.W * dpr
    cv.height = tile.H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, tile.W, tile.H)
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, tile.W, tile.H)

    const img = ctx.createImageData(tile.W, tile.H)
    const data = img.data
    for (const e of g.elems) {
      const ids = e.nodes
      const p = ids.map((id) => tile.px.get(id)).filter(Boolean) as [number, number][]
      if (p.length !== 3) continue
      const c = ids.map((id) => nodal.get(id) ?? 0)
      const xs = [p[0][0], p[1][0], p[2][0]], ys = [p[0][1], p[1][1], p[2][1]]
      const x0 = Math.max(0, Math.floor(Math.min(...xs)))
      const x1 = Math.min(tile.W - 1, Math.ceil(Math.max(...xs)))
      const y0 = Math.max(0, Math.floor(Math.min(...ys)))
      const y1 = Math.min(tile.H - 1, Math.ceil(Math.max(...ys)))
      for (let py = y0; py <= y1; py++) {
        for (let pxI = x0; pxI <= x1; pxI++) {
          const w = barycentric([pxI + 0.5, py + 0.5], p[0], p[1], p[2])
          if (!w) continue
          const val = w[0] * c[0] + w[1] * c[1] + w[2] * c[2]
          const [r, gg, b] = stressColorRGB(bandCenter(normalise(val, domain), BANDS), domain.signed)
          const o = (py * tile.W + pxI) * 4
          data[o] = r * 255; data[o + 1] = gg * 255; data[o + 2] = b * 255; data[o + 3] = 255
        }
      }
    }
    ctx.putImageData(img, 0, 0)

    // Mesh edges on top, faint — the element grid stays readable.
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)'
    ctx.lineWidth = 0.5
    for (const e of g.elems) {
      const p = e.nodes.map((id) => tile.px.get(id)).filter(Boolean) as [number, number][]
      if (p.length !== 3) continue
      ctx.beginPath()
      ctx.moveTo(p[0][0], p[0][1])
      ctx.lineTo(p[1][0], p[1][1])
      ctx.lineTo(p[2][0], p[2][1])
      ctx.closePath()
      ctx.stroke()
    }
  }, [g, nodal, domain, tile])

  if (!tile) return null
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-sheet-2">
      <canvas ref={ref} style={{ width: '100%', height: 'auto', display: 'block' }} />
      <div className="border-t border-hairline px-2 py-1 text-[11px] text-muted">
        {g.id} · {g.elems.length} elem
      </div>
    </div>
  )
}
