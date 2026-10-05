/**
 * 2D Floor Plan Canvas — drawing walls, beams, columns, slabs.
 * Uses HTML5 Canvas for performance.
 *
 * Interaction model: columns place on one click (bottom joint at this level's
 * elevation, top joint one storey up); walls/beams complete on the SECOND
 * click; slabs accumulate four corner clicks. Everything snaps to the grid
 * intersection nearest the pointer when one is within tolerance.
 */

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import type { DraftProject, DraftLevel, DraftNode, DraftElement } from '../engine/drafting3d'
import { uid } from '../engine/drafting3d'

interface FloorPlanCanvasProps {
  project: DraftProject
  level: DraftLevel
  activeTool: 'select' | 'wall' | 'beam' | 'column' | 'slab' | 'grid'
  activeSectionId: string
  /** Controlled selection — the page owns it so 2D and 3D stay in sync. */
  selectedIds: string[]
  onProjectChange: (project: DraftProject) => void
  onSelectionChange: (ids: string[]) => void
}

const GRID_SNAP_TOLERANCE = 0.15  // m
const CANVAS_SCALE = 50  // px per meter
const NODE_REUSE_TOL = 0.02  // m — a click reuses an existing joint this close

/** Nearest grid intersection to (x, y) when one is within tolerance. */
function closestGridPoint(x: number, y: number, pts: Array<{ x: number; y: number }>): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null
  let bestDist = Infinity
  for (const gp of pts) {
    const d = Math.hypot(gp.x - x, gp.y - y)
    if (d < bestDist) {
      bestDist = d
      best = gp
    }
  }
  return best && bestDist <= GRID_SNAP_TOLERANCE ? { x: best.x, y: best.y } : null
}

/** Distance from a point to a line segment — the pick test for drawn lines. */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-9) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Ray-cast point-in-polygon — the pick test for slab panels. */
function pointInPoly(p: { x: number; y: number }, verts: Array<{ x: number; y: number }>): boolean {
  let inside = false
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x, yi = verts[i].y, xj = verts[j].x, yj = verts[j].y
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Reuse an existing joint within NODE_REUSE_TOL of (x, y, z), else create one. */
function findOrCreateNode(nodes: Map<string, DraftNode>, x: number, y: number, z: number): string {
  for (const n of nodes.values()) {
    if (Math.abs(n.x - x) < NODE_REUSE_TOL && Math.abs(n.y - y) < NODE_REUSE_TOL && Math.abs(n.z - z) < NODE_REUSE_TOL) return n.id
  }
  const id = uid('n')
  nodes.set(id, { id, x, y, z })
  return id
}

/** Clone project + level with fresh Maps so the next edit never mutates props. */
function withEditableLevel(project: DraftProject, level: DraftLevel): {
  project: DraftProject
  nodes: Map<string, DraftNode>
  elements: Map<string, DraftElement>
} {
  const nodes = new Map(level.nodes)
  const elements = new Map(level.elements)
  const levels = new Map(project.levels)
  levels.set(level.id, { ...level, nodes, elements })
  return { project: { ...project, levels }, nodes, elements }
}

export function FloorPlanCanvas({
  project,
  level,
  activeTool,
  activeSectionId,
  selectedIds,
  onProjectChange,
  onSelectionChange,
}: FloorPlanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Fixed margin so the grid labels just outside the world origin stay on
  // screen (pan is a view offset; panning itself is not implemented).
  const [pan] = useState({ x: 40, y: 40 })
  const [zoom, setZoom] = useState(1)
  // The multi-click tool currently drawing (null = idle). Tagging the sequence
  // with its tool makes a mid-draw tool switch self-correcting: the next click
  // simply starts the new tool's sequence, no effect needed to reset state.
  const [drawingTool, setDrawingTool] = useState<null | 'wall' | 'beam' | 'slab'>(null)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [slabPts, setSlabPts] = useState<string[]>([])
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null)

  // Get grid points for snapping
  const gridPoints = useMemo(() => {
    const pts: Array<{ x: number; y: number }> = []
    for (const x of level.grids?.x ?? project.gridX) {
      for (const y of level.grids?.y ?? project.gridY) {
        pts.push({ x, y })
      }
    }
    return pts
  }, [level.grids, project.gridX, project.gridY])

  const snapToGrid = useCallback(
    (x: number, y: number) => closestGridPoint(x, y, gridPoints),
    [gridPoints],
  )

  // Screen to world coordinates
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (sx - rect.left - pan.x) / (zoom * CANVAS_SCALE),
      y: (sy - rect.top - pan.y) / (zoom * CANVAS_SCALE),
    }
  }, [pan, zoom])

  // Render function
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * window.devicePixelRatio
    canvas.height = rect.height * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    // Clear (device-pixel extents cover the CSS viewport after the dpr scale)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Transform to world space (metres)
    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom * CANVAS_SCALE, zoom * CANVAS_SCALE)

    // Grid — drawn a bay past each end so added lines stay visible
    const xs = level.grids?.x ?? project.gridX
    const ys = level.grids?.y ?? project.gridY
    const minX = (xs.length ? Math.min(0, ...xs) : 0) - 3
    const maxX = (xs.length ? Math.max(0, ...xs) : 15) + 3
    const minY = (ys.length ? Math.min(0, ...ys) : 0) - 3
    const maxY = (ys.length ? Math.max(0, ...ys) : 15) + 3

    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 0.5 / (zoom * CANVAS_SCALE)
    for (const x of xs) {
      ctx.beginPath()
      ctx.moveTo(x, minY)
      ctx.lineTo(x, maxY)
      ctx.stroke()
    }
    for (const y of ys) {
      ctx.beginPath()
      ctx.moveTo(minX, y)
      ctx.lineTo(maxX, y)
      ctx.stroke()
    }

    // Draw grid labels
    ctx.fillStyle = '#94a3b8'
    ctx.font = `${10 / (zoom * CANVAS_SCALE)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const x of xs) {
      ctx.fillText(`${x.toFixed(1)}`, x, -0.5)
    }
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (const y of ys) {
      ctx.fillText(`${y.toFixed(1)}`, -0.5, y)
    }

    // Draw elements
    for (const [id, el] of level.elements) {
      const isSelected = selectedIds.includes(id)
      ctx.strokeStyle = isSelected ? '#3b82f6' : '#64748b'
      ctx.lineWidth = isSelected ? 3 / (zoom * CANVAS_SCALE) : 1.5 / (zoom * CANVAS_SCALE)

      if (el.type === 'slab' && el.corners) {
        ctx.beginPath()
        for (let i = 0; i < 4; i++) {
          const n = level.nodes.get(el.corners[i])
          if (!n) continue
          if (i === 0) ctx.moveTo(n.x, n.y)
          else ctx.lineTo(n.x, n.y)
        }
        ctx.closePath()
        ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(100, 116, 139, 0.05)'
        ctx.fill()
        ctx.stroke()
      } else {
        const n1 = level.nodes.get(el.nodes[0])
        const n2 = level.nodes.get(el.nodes[1])
        if (!n1 || !n2) continue
        ctx.beginPath()
        ctx.moveTo(n1.x, n1.y)
        ctx.lineTo(n2.x, n2.y)
        ctx.stroke()

        // Flow arrow along beams
        if (el.type === 'beam') {
          const mx = (n1.x + n2.x) / 2
          const my = (n1.y + n2.y) / 2
          const angle = Math.atan2(n2.y - n1.y, n2.x - n1.x)
          const size = 0.3
          ctx.beginPath()
          ctx.moveTo(mx + size * Math.cos(angle - Math.PI / 6), my + size * Math.sin(angle - Math.PI / 6))
          ctx.lineTo(mx, my)
          ctx.lineTo(mx + size * Math.cos(angle + Math.PI / 6), my + size * Math.sin(angle + Math.PI / 6))
          ctx.stroke()
        }

        // Column marker
        if (el.type === 'column') {
          const cx = (n1.x + n2.x) / 2
          const cy = (n1.y + n2.y) / 2
          const size = 0.4
          ctx.beginPath()
          ctx.rect(cx - size / 2, cy - size / 2, size, size)
          ctx.stroke()
        }
      }
    }

    // Draw nodes
    for (const [id, node] of level.nodes) {
      const isSelected = selectedIds.includes(id)
      ctx.beginPath()
      ctx.arc(node.x, node.y, isSelected ? 0.15 : 0.1, 0, Math.PI * 2)
      ctx.fillStyle = isSelected ? '#f59e0b' : '#3b82f6'
      ctx.fill()
    }

    // Rubber band: walls/beams run start → pointer; slabs trace the placed
    // corners so far. Both endpoints are WORLD coordinates here — the ctx is
    // already inside the world transform.
    const hoverSnap = hoverPoint ? snapToGrid(hoverPoint.x, hoverPoint.y) ?? hoverPoint : null
    if (drawingTool && drawingTool !== 'slab' && drawStart && hoverSnap) {
      ctx.setLineDash([0.2, 0.2])
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 1 / (zoom * CANVAS_SCALE)
      ctx.beginPath()
      ctx.moveTo(drawStart.x, drawStart.y)
      ctx.lineTo(hoverSnap.x, hoverSnap.y)
      ctx.stroke()
      ctx.setLineDash([])
    }
    if (drawingTool === 'slab' && hoverSnap) {
      const chain: Array<{ x: number; y: number }> = [
        drawStart ?? { x: hoverSnap.x, y: hoverSnap.y },
        ...slabPts.map(pid => level.nodes.get(pid)).filter((n): n is DraftNode => n !== undefined),
        { x: hoverSnap.x, y: hoverSnap.y },
      ]
      ctx.setLineDash([0.2, 0.2])
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 1 / (zoom * CANVAS_SCALE)
      ctx.beginPath()
      chain.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Hover snap ring, drawn in world units at the snapped point
    if (hoverPoint && !drawingTool) {
      const snap = snapToGrid(hoverPoint.x, hoverPoint.y)
      if (snap) {
        ctx.beginPath()
        ctx.arc(snap.x, snap.y, 0.12, 0, Math.PI * 2)
        ctx.strokeStyle = '#3b82f6'
        ctx.lineWidth = 2 / (zoom * CANVAS_SCALE)
        ctx.stroke()
      }
    }

    ctx.restore()
  }, [level, project, pan, zoom, selectedIds, drawingTool, drawStart, slabPts, hoverPoint, snapToGrid])

  // Draw on every state change and on window resize
  useEffect(() => {
    render()
    window.addEventListener('resize', render)
    return () => window.removeEventListener('resize', render)
  }, [render])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // screenToWorld does its own getBoundingClientRect math — raw client
    // coords go in, world coords come out (subtracting rect here TOO was the
    // old double-offset bug that threw every click off by the canvas origin).
    const world = screenToWorld(e.clientX, e.clientY)

    if (activeTool === 'select') {
      // Check if clicking on a node
      let clickedNode: string | null = null
      for (const [id, node] of level.nodes) {
        if (Math.abs(node.x - world.x) < 0.2 && Math.abs(node.y - world.y) < 0.2) {
          clickedNode = id
          break
        }
      }
      if (clickedNode) {
        onSelectionChange(e.shiftKey ? [...selectedIds, clickedNode] : [clickedNode])
        return
      }
      // Element pick: slabs by point-in-polygon, everything else by distance
      // to its node-to-node line
      let clickedEl: string | null = null
      for (const [id, el] of level.elements) {
        if (el.type === 'slab' && el.corners) {
          const verts = el.corners
            .map(cid => level.nodes.get(cid))
            .filter((n): n is DraftNode => n !== undefined)
          if (verts.length === 4 && pointInPoly(world, verts)) {
            clickedEl = id
            break
          }
        } else {
          const n1 = level.nodes.get(el.nodes[0])
          const n2 = level.nodes.get(el.nodes[1])
          if (n1 && n2 && distToSegment(world.x, world.y, n1.x, n1.y, n2.x, n2.y) < 0.15) {
            clickedEl = id
            break
          }
        }
      }
      onSelectionChange(clickedEl ? (e.shiftKey ? [...selectedIds, clickedEl] : [clickedEl]) : [])
    } else if (activeTool === 'column') {
      // One click: bottom joint at this level, top joint one storey up
      const snap = snapToGrid(world.x, world.y) ?? world
      const edit = withEditableLevel(project, level)
      const bottom = findOrCreateNode(edit.nodes, snap.x, snap.y, level.elevation)
      const top = findOrCreateNode(edit.nodes, snap.x, snap.y, level.elevation + level.height)
      const eid = uid('e')
      edit.elements.set(eid, {
        id: eid,
        type: 'column',
        nodes: [bottom, top],
        sectionId: activeSectionId,
        role: 'column',
      })
      onProjectChange(edit.project)
    } else if (activeTool === 'grid') {
      // Add grid lines through the clicked coordinates (deduped, ordered)
      const gx = [...(level.grids?.x ?? project.gridX)]
      const gy = [...(level.grids?.y ?? project.gridY)]
      const rx = Math.round(world.x * 10) / 10
      const ry = Math.round(world.y * 10) / 10
      if (!gx.some(v => Math.abs(v - rx) < 0.05)) gx.push(rx)
      if (!gy.some(v => Math.abs(v - ry) < 0.05)) gy.push(ry)
      gx.sort((a, b) => a - b)
      gy.sort((a, b) => a - b)
      const levels = new Map(project.levels)
      levels.set(level.id, { ...level, grids: { x: gx, y: gy } })
      onProjectChange({ ...project, gridX: gx, gridY: gy, levels })
    } else if (activeTool === 'slab') {
      // Four clicks place the corners; the panel closes on the fourth. Every
      // click commits its joint first — the next click's find-or-create has
      // to see it, or corners pile up as duplicate coincident nodes.
      const snap = snapToGrid(world.x, world.y) ?? world
      const edit = withEditableLevel(project, level)
      const pid = findOrCreateNode(edit.nodes, snap.x, snap.y, level.elevation)
      if (drawingTool !== 'slab') {
        onProjectChange(edit.project)
        setDrawStart(snap)
        setSlabPts([pid])
        setDrawingTool('slab')
      } else {
        const pts = [...slabPts, pid]
        if (pts.length < 4) {
          onProjectChange(edit.project)
          setSlabPts(pts)
        } else {
          if (new Set(pts).size === 4) {
            const eid = uid('e')
            edit.elements.set(eid, {
              id: eid,
              type: 'slab',
              nodes: [pts[0], pts[1]],
              sectionId: activeSectionId,
              role: 'slab',
              corners: [pts[0], pts[1], pts[2], pts[3]],
            })
            onProjectChange(edit.project)
          }
          setDrawingTool(null)
          setDrawStart(null)
          setSlabPts([])
        }
      }
    } else {
      // wall | beam — second click completes the element
      const snap = snapToGrid(world.x, world.y) ?? world
      if (drawingTool !== activeTool) {
        setDrawStart(snap)
        setDrawingTool(activeTool)
      } else {
        const edit = withEditableLevel(project, level)
        const ni = findOrCreateNode(edit.nodes, drawStart?.x ?? snap.x, drawStart?.y ?? snap.y, level.elevation)
        const nj = findOrCreateNode(edit.nodes, snap.x, snap.y, level.elevation)
        if (ni !== nj) {
          const eid = uid('e')
          edit.elements.set(eid, {
            id: eid,
            type: activeTool,
            nodes: [ni, nj],
            sectionId: activeSectionId,
            role: activeTool,
          })
          onProjectChange(edit.project)
        }
        setDrawingTool(null)
        setDrawStart(null)
      }
    }
  }, [activeTool, level, project, selectedIds, drawingTool, drawStart, slabPts, activeSectionId, screenToWorld, snapToGrid, onSelectionChange, onProjectChange])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setHoverPoint(screenToWorld(e.clientX, e.clientY))
  }, [screenToWorld])

  // Zoom: a native non-passive listener, because React binds wheel passively
  // at the root and preventDefault inside onWheel only earns a console error.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setZoom(z => Math.max(0.1, Math.min(5, z * delta)))
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedIds.length > 0) {
        const edit = withEditableLevel(project, level)
        for (const id of selectedIds) {
          edit.elements.delete(id)
        }
        // Drop nodes no surviving element references (lines' endpoints, slab corners)
        const referenced = new Set<string>()
        for (const el of edit.elements.values()) {
          if (el.corners) for (const c of el.corners) referenced.add(c)
          else {
            referenced.add(el.nodes[0])
            referenced.add(el.nodes[1])
          }
        }
        for (const nid of [...edit.nodes.keys()]) {
          if (!referenced.has(nid)) edit.nodes.delete(nid)
        }
        onProjectChange(edit.project)
        onSelectionChange([])
      } else if (e.key === 'Escape') {
        onSelectionChange([])
        setDrawingTool(null)
        setDrawStart(null)
        setSlabPts([])
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedIds, project, level, onProjectChange, onSelectionChange])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-white"
      style={{ touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHoverPoint(null); setDrawingTool(null); setDrawStart(null); setSlabPts([]) }}
        className="w-full h-full cursor-crosshair"
        style={{ touchAction: 'none' }}
      />
    </div>
  )
}
