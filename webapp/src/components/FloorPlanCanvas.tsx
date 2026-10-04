/**
 * 2D Floor Plan Canvas — drawing walls, beams, columns, slabs.
 * Uses HTML5 Canvas for performance.
 */

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import type { DraftProject, DraftLevel, DraftNode, DraftElement, GridPoint, RectSection } from '../engine/drafting3d'
import { uid } from '../engine/drafting3d'

interface FloorPlanCanvasProps {
  project: DraftProject
  level: DraftLevel
  activeTool: 'select' | 'wall' | 'beam' | 'column' | 'slab' | 'grid'
  activeSectionId: string
  onProjectChange: (project: DraftProject) => void
  onSelectionChange: (ids: string[]) => void
}

const GRID_SNAP_TOLERANCE = 0.15  // m
const CANVAS_SCALE = 50  // px per meter

export function FloorPlanCanvas({
  project,
  level,
  activeTool,
  activeSectionId,
  onProjectChange,
  onSelectionChange,
}: FloorPlanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null)

  // Get grid points for snapping
  const gridPoints = useMemo(() => {
    const pts = []
    for (const x of level.grids?.x ?? project.gridX) {
      for (const y of level.grids?.y ?? project.gridY) {
        pts.push({ x, y })
      }
    }
    return pts
  }, [level.grids, project.gridX, project.gridY])

  // Snap to grid
  const snapToGrid = (x: number, y: number) => {
    let bestX = x, bestY = y
    let bestDist = Infinity
    for (const gp of gridPoints) {
      const dx = gp.x - x
      const dy = gp.y - y
      const dist = dx * dx + dy * dy
      if (dist < bestDist) {
        bestDist = dist
        bestX = gp.x
        bestY = gp.y
      }
    }
    return Math.sqrt(bestDist) <= GRID_SNAP_TOLERANCE ? { x: bestX, y: bestY } : null
  }

  // Screen to world coordinates
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (sx - rect.left - pan.x) / (zoom * CANVAS_SCALE),
      y: (sy - rect.top - pan.y) / (zoom * CANVAS_SCALE),
    }
  }, [pan, zoom])

  // World to screen coordinates
  const worldToScreen = useCallback((wx: number, wy: number) => {
    return {
      x: wx * zoom * CANVAS_SCALE + pan.x,
      y: wy * zoom * CANVAS_SCALE + pan.y,
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

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Transform
    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom * CANVAS_SCALE, zoom * CANVAS_SCALE)

    // Draw grid
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 0.5 / (zoom * CANVAS_SCALE)
    const gridX = level.grids?.x ?? project.gridX
    const gridY = level.grids?.y ?? project.gridY
    const bounds = { minX: 0, maxX: 15, minY: 0, maxY: 15 }

    for (const x of level.grids?.x ?? project.gridX) {
      ctx.beginPath()
      ctx.moveTo(x, bounds.minY)
      ctx.lineTo(x, bounds.maxY)
      ctx.stroke()
    }
    for (const y of level.grids?.y ?? project.gridY) {
      ctx.beginPath()
      ctx.moveTo(bounds.minX, y)
      ctx.lineTo(bounds.maxX, y)
      ctx.stroke()
    }

    // Draw grid labels
    ctx.fillStyle = '#94a3b8'
    ctx.font = `${10 / (zoom * CANVAS_SCALE)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const x of level.grids?.x ?? project.gridX) {
      ctx.fillText(`${x.toFixed(1)}`, x, -0.5)
    }
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (const y of level.grids?.y ?? project.gridY) {
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
          const nid = el.corners[i]
          const n = level.nodes.get(el.corners[i])
          if (!n) continue
          if (i === 0) ctx.moveTo(n.x, n.y)
          else ctx.lineTo(n.x, n.y)
        }
        ctx.closePath()
        ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(100, 116, 139, 0.05)'
        ctx.fill()
        ctx.stroke()
      } else if (['wall', 'beam', 'column'].includes(el.type)) {
        const n1 = level.nodes.get(el.nodes[0])
        const n2 = level.nodes.get(el.nodes[1])
        if (!n1 || !n2) continue
        ctx.beginPath()
        ctx.moveTo(n1.x, n1.y)
        ctx.lineTo(n2.x, n2.y)
        ctx.stroke()

        // Draw direction arrow for beams
        if (el.type === 'beam' || el.type === 'girder') {
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
          ctx.rect(cx - size/2, cy - size/2, size, size)
          ctx.stroke()
        }
      }
    }

    // Draw nodes
    ctx.fillStyle = '#3b82f6'
    for (const [id, node] of level.nodes) {
      const isSelected = selectedIds.includes(id)
      ctx.beginPath()
      ctx.arc(node.x, node.y, isSelected ? 0.15 : 0.1, 0, Math.PI * 2)
      ctx.fillStyle = isSelected ? '#f59e0b' : '#3b82f6'
      ctx.fill()
    }

    // Draw drawing preview
    if (isDrawing && drawStart) {
      const mouseWorld = screenToWorld(drawStart.x, drawStart.y)
      const snap = snapToGrid(mouseWorld.x, mouseWorld.y)
      if (snap) {
        ctx.setLineDash([0.2, 0.2])
        ctx.strokeStyle = '#3b82f6'
        ctx.lineWidth = 1 / (zoom * CANVAS_SCALE)
        ctx.beginPath()
        ctx.moveTo(drawStart.x, drawStart.y)
        ctx.lineTo(snap.x, snap.y)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // Draw hover snap preview
    if (hoverPoint && !isDrawing) {
      const snap = snapToGrid(hoverPoint.x, hoverPoint.y)
      if (snap) {
        const screen = worldToScreen(snap.x, snap.y)
        ctx.beginPath()
        ctx.arc(screen.x, screen.y, 8 / (zoom * CANVAS_SCALE), 0, Math.PI * 2)
        ctx.strokeStyle = '#3b82f6'
        ctx.lineWidth = 2 / (zoom * CANVAS_SCALE)
        ctx.stroke()
      }
    }

    ctx.restore()
  }, [level, project, pan, zoom, selectedIds, isDrawing, drawStart, hoverPoint])

  // Mouse events
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const world = screenToWorld(sx, sy)
    const snap = snapToGrid(world.x, world.y)

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
        setSelectedIds(e.shiftKey ? [...selectedIds, clickedNode] : [clickedNode])
        onSelectionChange(e.shiftKey ? [...selectedIds, clickedNode] : [clickedNode])
      } else {
        // Check if clicking on an element
        let clickedEl: string | null = null
        for (const [id, el] of level.elements) {
          if (el.type === 'slab' && el.corners) {
            // Point in polygon test
            // Simplified: check if near any corner
            for (const nid of el.corners) {
              const n = level.nodes.get(nid)
              if (n && Math.abs(n.x - world.x) < 0.3 && Math.abs(n.y - world.y) < 0.3) {
                clickedEl = id
                break
              }
            }
          } else if (['wall', 'beam', 'column'].includes(level.elements.get('')?.type ?? '')) {
            // Simplified: check distance to line
          }
        }
        if (clickedEl) {
          setSelectedIds(e.shiftKey ? [...selectedIds, clickedEl] : [clickedEl])
          onSelectionChange(e.shiftKey ? [...selectedIds, clickedEl] : [clickedEl])
        } else {
          setSelectedIds([])
          onSelectionChange([])
        }
      }
      } else if (['wall', 'beam', 'column', 'slab'].includes(activeTool)) {
        const snap = snapToGrid(world.x, world.y) ?? world
        setDrawStart({ x: snap.x, y: snap.y })
        setIsDrawing(true)
      } else if (activeTool === 'grid') {
        // Add grid line
      }
  }, [activeTool, level, selectedIds, onSelectionChange, screenToWorld])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const world = screenToWorld(sx, sy)
    setHoverPoint(world)

    if (isDrawing && drawStart) {
      // Update hover for preview
    }
  }, [screenToWorld, isDrawing, drawStart])

  const handleMouseUp = useCallback(() => {
    if (isDrawing && drawStart) {
      const world = screenToWorld(drawStart.x, drawStart.y)
      const snap = snapToGrid(world.x, world.y) ?? world

      // Create element based on tool
      const newProject = { ...project }
      const newLevel = { ...newProject.levels.get(project.activeLevelId)! }
      const newNodes = new Map(newLevel.nodes)
      const newElements = new Map(newLevel.elements)

      if (activeTool === 'column') {
        const nid = uid('n')
        newNodes.set(nid, { id: nid, x: drawStart.x, y: drawStart.y, z: level.elevation })
        const eid = uid('e')
        newElements.set(eid, {
          id: eid,
          type: 'column',
          nodes: [nid, nid], // columns have same start/end node
          sectionId: activeSectionId,
          role: 'column',
        })
      }

      newLevel.nodes = newNodes
      newLevel.elements = newElements
      newProject.levels.set(project.activeLevelId, newLevel)
      onProjectChange(newProject)
    } else if (activeTool === 'wall' || activeTool === 'beam') {
      // For walls/beams, we need two clicks
    } else if (activeTool === 'slab') {
      // For slabs, we need 4 clicks for corners
    }

    setIsDrawing(false)
    setDrawStart(null)
  }, [activeTool, activeSectionId, level, project, screenToWorld, onProjectChange])

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(z => Math.max(0.1, Math.min(5, z * delta)))
  }, []

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedIds.length > 0) {
        const newProject = { ...project }
        const newLevel = { ...newProject.levels.get(project.activeLevelId)! }
        const newNodes = new Map(newLevel.nodes)
        const newElements = new Map(newLevel.elements)
        for (const id of selectedIds) {
          newElements.delete(id)
        }
        newLevel.elements = newElements
        newProject.levels.set(project.activeLevelId, newLevel)
        onProjectChange(newProject)
        setSelectedIds([])
        onSelectionChange([])
      } else if (e.key === 'Escape') {
        setSelectedIds([])
        onSelectionChange([])
        setIsDrawing(false)
        setDrawStart(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedIds, project, onProjectChange])

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
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onMouseLeave={() => { setHoverPoint(null); setIsDrawing(false); setDrawStart(null) }}
        className="w-full h-full cursor-crosshair"
        style={{ touchAction: 'none' }}
      />
      {/* Toolbar overlay */}
      <div className="absolute top-4 left-4 right-4 flex flex-wrap gap-2 justify-center">
        <div className="flex items-center gap-1 bg-white/90 backdrop-blur rounded-lg p-2 shadow-lg border border-hairline">
          {(['select', 'wall', 'beam', 'column', 'slab', 'grid'] as const).map(tool => (
            <button
              key={tool}
              onClick={() => {
                // tool change would be handled by parent
              }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                activeTool === tool
                  ? "bg-brand text-on-solid"
                  : "text-muted hover:text-ink hover:bg-brand-tint"
              }`}
            >
              {tool.charAt(0).toUpperCase() + tool.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}