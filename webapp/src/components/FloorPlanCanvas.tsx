/**
 * 2D Floor Plan Canvas — drawing walls, beams, columns, slabs and ceilings,
 * placing Revit-style wall-hosted doors & windows. Uses HTML5 Canvas.
 *
 * Interaction model (pointer events — ONE code path for mouse, touch, pen):
 *  - Columns place on a tap. Walls/beams complete on the second tap, or by
 *    PRESS-DRAG-RELEASE — the natural gesture on a phone. Every drawn end
 *    AUTO-CONNECTS: inside the snap radius an existing joint wins over the
 *    grid (green ring), so members weld to the model Revit-style.
 *  - Slabs and ceilings accumulate four corner taps — each corner snaps to
 *    joints first, so panels close onto the structure around them.
 *  - Doors/windows tap onto the wall nearest the pointer (host within
 *    WALL_HOST_TOLERANCE), previewed live as the pointer moves.
 *  - SELECT mode: drag an element or joint to MOVE it (drag & drop — the
 *    grabbed point snaps to the grid, neighbours sharing its joints follow;
 *    dropping a joint ON another joint welds them — every reference is
 *    rewritten, true auto-connect); drag empty space to pan the sheet.
 *  - Two fingers pinch-zoom + pan in ANY tool; the wheel zooms about the
 *    cursor. Wall bands draw at true thickness so openings read as gaps.
 */

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import type { DraftProject, DraftLevel, DraftNode, DraftElement } from '../engine/drafting3d'
import {
  uid,
  WALL_HOST_TOLERANCE,
  projectOnWall,
  clampOpeningAt,
  openingSpan,
  createWallOpening,
  deleteDraftElements,
  mergeDraftNodes,
  mergeCoincidentNodes,
  withColumnPartners,
  canMergeDraftNodes,
  nearestDraftNode,
  doorSwing,
  resolveFinishMaterial,
  DEFAULT_DOOR,
  DEFAULT_WINDOW,
} from '../engine/drafting3d'
import { CANVAS_SCALE, nextPinchView, anchoredZoom } from '../lib/planCanvasView'

export type PlanTool = 'select' | 'wall' | 'beam' | 'column' | 'slab' | 'door' | 'window' | 'ceiling' | 'grid'

interface FloorPlanCanvasProps {
  project: DraftProject
  level: DraftLevel
  activeTool: PlanTool
  activeSectionId: string
  /** Finish material applied to NEW slabs/ceilings (Revit type selector). */
  activeMaterialId: string
  /** Controlled selection — the page owns it so 2D and 3D stay in sync. */
  selectedIds: string[]
  onProjectChange: (project: DraftProject) => void
  onSelectionChange: (ids: string[]) => void
}

const GRID_SNAP_TOLERANCE = 0.15  // m
const NODE_REUSE_TOL = 0.02  // m — a tap reuses an existing joint this close
/** Node auto-connect: a drawn end or dragged joint snaps onto an existing
 *  joint inside this radius — 14 screen px (fingers are fat), floored at
 *  0.2 m so a far-zoomed-out plan still welds. Joints outrank the grid. */
const NODE_SNAP_PX = 14
const NODE_SNAP_MIN_M = 0.2
/** Screen px a press-drag must cover before release commits a wall/beam. */
const DRAW_COMMIT_PX = 8
/** Screen px a select-drag must cover before it counts as a move, not a tap. */
const MOVE_START_PX = 5

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

/** Gesture bookkeeping lives in a ref (no re-renders); the previews it paints
 *  (node moves, opening slides) live in state so `render` sees them. */
type Gesture =
  | { mode: 'idle' }
  | { mode: 'draw'; wasDrawing: boolean; startScreen: { x: number; y: number }; movedPx: number }
  | { mode: 'move'; startWorld: { x: number; y: number }; startScreen: { x: number; y: number }; primary: string; orig: Array<{ id: string; x: number; y: number; z: number }>; movedPx: number }
  | { mode: 'moveOpening'; id: string; startScreen: { x: number; y: number }; movedPx: number }
  | { mode: 'pan'; startScreen: { x: number; y: number }; startPan: { x: number; y: number } }
  | { mode: 'pinch'; base: { dist: number; zoom: number; centroid: { x: number; y: number }; pan: { x: number; y: number } } }

export function FloorPlanCanvas({
  project,
  level,
  activeTool,
  activeSectionId,
  activeMaterialId,
  selectedIds,
  onProjectChange,
  onSelectionChange,
}: FloorPlanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // View offset (pan is a translate; the 40 px margin keeps origin labels on
  // screen) and zoom — BOTH mutable now: drag-empty-space pans, pinch/wheel
  // zooms.
  const [pan, setPan] = useState({ x: 64, y: 48 })  // room for the axis labels
  const [zoom, setZoom] = useState(1)
  // The multi-click tool currently drawing (null = idle). Tagging the sequence
  // with its tool makes a mid-draw tool switch self-correcting: the next tap
  // simply starts the new tool's sequence, no effect needed to reset state.
  const [drawingTool, setDrawingTool] = useState<null | 'wall' | 'beam' | 'slab' | 'ceiling'>(null)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [slabPts, setSlabPts] = useState<string[]>([])
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null)
  // Drag-&-drop previews: moved joints (node id → plan position) and the
  // sliding opening (element id → new centre distance along its host).
  const [nodePreview, setNodePreview] = useState<Map<string, { x: number; y: number }> | null>(null)
  const [openingPreview, setOpeningPreview] = useState<{ id: string; at: number } | null>(null)
  // The joint a dragged joint would WELD into on release (auto-connect).
  const [moveSnapTarget, setMoveSnapTarget] = useState<string | null>(null)
  const gestureRef = useRef<Gesture>({ mode: 'idle' })
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  // Mirror of the current view for the native (non-React) wheel listener —
  // synced in an effect (refs may not be written during render).
  const viewRef = useRef({ zoom: 1, pan: { x: 40, y: 40 } })
  useEffect(() => {
    viewRef.current = { zoom, pan }
  }, [zoom, pan])

  // Grid points for snapping
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

  const sectionsById = useMemo(() => project.sections, [project.sections])

  /** Nodes as currently painted — the level's joints with any drag preview
   *  overlaid. Every read (render AND hit-test) goes through this so a drag
   *  preview is pickable exactly where it appears. */
  const nodesView = useMemo(() => {
    if (!nodePreview || nodePreview.size === 0) return level.nodes
    const m = new Map(level.nodes)
    for (const [id, p] of nodePreview) {
      const n = m.get(id)
      if (n) m.set(id, { ...n, x: p.x, y: p.y })
    }
    return m
  }, [level.nodes, nodePreview])

  /** Auto-connect radius in world metres — 14 screen px, floored. */
  const nodeSnapTolerance = useCallback(
    () => Math.max(NODE_SNAP_MIN_M, NODE_SNAP_PX / (zoom * CANVAS_SCALE)),
    [zoom],
  )

  /** Universal snap for anything drawn or dragged: an existing joint FIRST
   *  (Revit-style auto-connect — a wall ends ON the joint it touches), then
   *  a grid intersection, else the raw point. `z` restricts candidates to
   *  one storey (defaults to the level floor, so a wall end never welds to
   *  a column-top joint a storey up); `exclude` keeps a moving selection
   *  from snapping onto its own joints. */
  const snapPoint = useCallback(
    (world: { x: number; y: number }, opts: { z?: number; exclude?: ReadonlySet<string> } = {})
      : { x: number; y: number; nodeId: string | null } => {
      const node = nearestDraftNode(nodesView, world.x, world.y, nodeSnapTolerance(), {
        z: opts.z ?? level.elevation,
        zTolerance: 0.01,
        exclude: opts.exclude,
      })
      if (node) return { x: node.x, y: node.y, nodeId: node.id }
      const g = snapToGrid(world.x, world.y)
      return g ? { x: g.x, y: g.y, nodeId: null } : { x: world.x, y: world.y, nodeId: null }
    },
    [nodesView, nodeSnapTolerance, snapToGrid, level.elevation],
  )

  /** Effective `at` of an opening while it is being slid along its wall. */
  const openingAt = useCallback((el: DraftElement): number | undefined => {
    if (openingPreview && openingPreview.id === el.id) return openingPreview.at
    return el.at
  }, [openingPreview])

  // Screen to world coordinates
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (sx - rect.left - pan.x) / (zoom * CANVAS_SCALE),
      y: (sy - rect.top - pan.y) / (zoom * CANVAS_SCALE),
    }
  }, [pan, zoom])

  /** Pick radius in world metres — a floor of ~10 screen px so fingers can
   *  land on thin lines at any zoom. */
  const pickRadius = useCallback(
    () => Math.max(0.15, 10 / (zoom * CANVAS_SCALE)),
    [zoom],
  )

  /** The wall under a plan point, within host tolerance, with its projection. */
  const nearestWall = useCallback((world: { x: number; y: number }) => {
    let best: { el: DraftElement; t: number; length: number; dist: number } | null = null
    for (const el of level.elements.values()) {
      if (el.type !== 'wall') continue
      const proj = projectOnWall(el, nodesView, world)
      if (!proj) continue
      const perp = Math.hypot(world.x - proj.point.x, world.y - proj.point.y)
      if (perp > WALL_HOST_TOLERANCE) continue
      if (proj.t < -0.1 || proj.t > proj.length + 0.1) continue  // past the ends
      if (!best || perp < best.dist) best = { el, t: proj.t, length: proj.length, dist: perp }
    }
    return best
  }, [level.elements, nodesView])

  /** Priority hit test: joints, then wall-hosted components (small targets
   *  must not be shadowed by their host wall), then lines, then panels. */
  const pickAt = useCallback((world: { x: number; y: number }): { kind: 'node' | 'element'; id: string } | null => {
    const r = pickRadius()
    for (const [id, node] of nodesView) {
      if (Math.abs(node.x - world.x) < Math.max(0.2, r) && Math.abs(node.y - world.y) < Math.max(0.2, r)) {
        return { kind: 'node', id }
      }
    }
    for (const [id, el] of level.elements) {
      if (el.type !== 'door' && el.type !== 'window') continue
      const span = openingSpan({ ...el, at: openingAt(el) }, level, nodesView)
      if (!span) continue
      if (distToSegment(world.x, world.y, span.p1.x, span.p1.y, span.p2.x, span.p2.y) < r) {
        return { kind: 'element', id }
      }
    }
    for (const [id, el] of level.elements) {
      if (el.type === 'slab' || el.type === 'ceiling') {
        const verts = (el.corners ?? [])
          .map(cid => nodesView.get(cid))
          .filter((n): n is DraftNode => n !== undefined)
        if (verts.length === 4 && pointInPoly(world, verts)) return { kind: 'element', id }
      } else if (el.type !== 'door' && el.type !== 'window') {
        const n1 = nodesView.get(el.nodes[0])
        const n2 = nodesView.get(el.nodes[1])
        if (n1 && n2 && distToSegment(world.x, world.y, n1.x, n1.y, n2.x, n2.y) < r) {
          return { kind: 'element', id }
        }
      }
    }
    return null
  }, [level, nodesView, openingAt, pickRadius])

  // --- Render ---------------------------------------------------------------

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * window.devicePixelRatio
    canvas.height = rect.height * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

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
      ctx.beginPath(); ctx.moveTo(x, minY); ctx.lineTo(x, maxY); ctx.stroke()
    }
    for (const y of ys) {
      ctx.beginPath(); ctx.moveTo(minX, y); ctx.lineTo(maxX, y); ctx.stroke()
    }

    ctx.fillStyle = '#94a3b8'
    ctx.font = `${10 / (zoom * CANVAS_SCALE)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    // axis labels a fixed 14 px off the grid's near edge — a metre offset
    // grew and shrank with zoom and pushed the Y labels off the canvas
    const px = 1 / (zoom * CANVAS_SCALE)
    const xLab = Math.min(0, ...ys) - 14 * px
    const yLab = Math.min(0, ...xs) - 14 * px
    ctx.textBaseline = 'bottom'
    for (const x of xs) ctx.fillText(`${x.toFixed(1)}`, x, xLab)
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (const y of ys) ctx.fillText(`${y.toFixed(1)}`, yLab, y)

    /** Band corners of a wall: the two centreline ends offset ± half
     *  thickness perpendicular to the run. */
    const bandOf = (n1: DraftNode, n2: DraftNode, thickness: number) => {
      const dx = n2.x - n1.x, dy = n2.y - n1.y
      const len = Math.hypot(dx, dy) || 1
      const px = -dy / len * thickness / 2, py = dx / len * thickness / 2
      return [
        { x: n1.x + px, y: n1.y + py }, { x: n2.x + px, y: n2.y + py },
        { x: n2.x - px, y: n2.y - py }, { x: n1.x - px, y: n1.y - py },
      ]
    }
    const wallThickness = (el: DraftElement) =>
      ((sectionsById.get(el.sectionId)?.h ?? 200) / 1000)  // mm → m

    // Ceilings first (they sit ABOVE slabs visually — dashed finish planes)
    for (const [id, el] of level.elements) {
      if (el.type !== 'ceiling' || !el.corners) continue
      const verts = el.corners.map(cid => nodesView.get(cid)).filter((n): n is DraftNode => n !== undefined)
      if (verts.length !== 4) continue
      const isSelected = selectedIds.includes(id)
      const mat = resolveFinishMaterial(el.materialId)
      ctx.beginPath()
      verts.forEach((v, i) => (i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)))
      ctx.closePath()
      ctx.globalAlpha = 0.3
      ctx.fillStyle = isSelected ? '#3b82f6' : mat.color
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.setLineDash([0.18, 0.12])
      ctx.strokeStyle = isSelected ? '#3b82f6' : '#64748b'
      ctx.lineWidth = 1.5 / (zoom * CANVAS_SCALE)
      ctx.stroke()
      ctx.setLineDash([])
      // diagonal cross + label — the architectural "ceiling" mark
      ctx.beginPath()
      ctx.moveTo(verts[0].x, verts[0].y); ctx.lineTo(verts[2].x, verts[2].y)
      ctx.moveTo(verts[1].x, verts[1].y); ctx.lineTo(verts[3].x, verts[3].y)
      ctx.globalAlpha = 0.45
      ctx.stroke()
      ctx.globalAlpha = 1
      const cx = verts.reduce((s, v) => s + v.x, 0) / 4
      const cy = verts.reduce((s, v) => s + v.y, 0) / 4
      ctx.fillStyle = isSelected ? '#3b82f6' : '#475569'
      ctx.font = `${0.28}px monospace`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('CEILING', cx, cy - 0.16)
      ctx.font = `${0.22}px monospace`
      ctx.fillText(mat.name, cx, cy + 0.16)
    }

    // Slabs — filled with their finish material's tint
    for (const [id, el] of level.elements) {
      if (el.type !== 'slab' || !el.corners) continue
      const verts = el.corners.map(cid => nodesView.get(cid)).filter((n): n is DraftNode => n !== undefined)
      if (verts.length !== 4) continue
      const isSelected = selectedIds.includes(id)
      ctx.beginPath()
      verts.forEach((v, i) => (i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)))
      ctx.closePath()
      ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.3)' : resolveFinishMaterial(el.materialId).color
      ctx.globalAlpha = isSelected ? 1 : 0.35
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = isSelected ? '#3b82f6' : '#64748b'
      ctx.lineWidth = (isSelected ? 3 : 1.5) / (zoom * CANVAS_SCALE)
      ctx.stroke()
    }

    // Beams & columns (thin line elements under the wall bands)
    for (const [id, el] of level.elements) {
      if (el.type !== 'beam' && el.type !== 'column') continue
      const n1 = nodesView.get(el.nodes[0])
      const n2 = nodesView.get(el.nodes[1])
      if (!n1 || !n2) continue
      const isSelected = selectedIds.includes(id)
      ctx.strokeStyle = isSelected ? '#3b82f6' : el.type === 'beam' ? '#475569' : '#7c3aed'
      ctx.lineWidth = (isSelected ? 3 : 1.5) / (zoom * CANVAS_SCALE)
      ctx.beginPath()
      ctx.moveTo(n1.x, n1.y); ctx.lineTo(n2.x, n2.y)
      ctx.stroke()

      if (el.type === 'beam') {
        const mx = (n1.x + n2.x) / 2, my = (n1.y + n2.y) / 2
        const angle = Math.atan2(n2.y - n1.y, n2.x - n1.x)
        const size = 0.3
        ctx.beginPath()
        ctx.moveTo(mx + size * Math.cos(angle - Math.PI / 6), my + size * Math.sin(angle - Math.PI / 6))
        ctx.lineTo(mx, my)
        ctx.lineTo(mx + size * Math.cos(angle + Math.PI / 6), my + size * Math.sin(angle + Math.PI / 6))
        ctx.stroke()
      } else {
        const cx = (n1.x + n2.x) / 2, cy = (n1.y + n2.y) / 2
        const size = 0.4
        ctx.beginPath()
        ctx.rect(cx - size / 2, cy - size / 2, size, size)
        ctx.stroke()
      }
    }

    // Walls at true thickness (double-line bands) — openings cut gaps after
    for (const [id, el] of level.elements) {
      if (el.type !== 'wall') continue
      const n1 = nodesView.get(el.nodes[0])
      const n2 = nodesView.get(el.nodes[1])
      if (!n1 || !n2) continue
      const isSelected = selectedIds.includes(id)
      const band = bandOf(n1, n2, wallThickness(el))
      ctx.beginPath()
      band.forEach((v, i) => (i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)))
      ctx.closePath()
      ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.25)' : '#cbd5e1'
      ctx.fill()
      ctx.strokeStyle = isSelected ? '#3b82f6' : '#475569'
      ctx.lineWidth = (isSelected ? 2.5 : 1.2) / (zoom * CANVAS_SCALE)
      ctx.stroke()
    }

    // Doors & windows — gap in the band, then the standard symbol
    for (const [id, el] of level.elements) {
      if (el.type !== 'door' && el.type !== 'window') continue
      const span = openingSpan({ ...el, at: openingAt(el) }, level, nodesView)
      if (!span) continue
      const host = el.hostId ? level.elements.get(el.hostId) : undefined
      if (!host) continue
      const h1 = nodesView.get(host.nodes[0])
      const h2 = nodesView.get(host.nodes[1])
      if (!h1 || !h2) continue
      const t = wallThickness(host)
      const isSelected = selectedIds.includes(id)
      const dx = span.p2.x - span.p1.x, dy = span.p2.y - span.p1.y
      const len = Math.hypot(dx, dy) || 1
      const px = -dy / len * (t / 2 + 0.015), py = dx / len * (t / 2 + 0.015)

      // 1) white-out the wall band across the opening
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(span.p1.x + px, span.p1.y + py)
      ctx.lineTo(span.p2.x + px, span.p2.y + py)
      ctx.lineTo(span.p2.x - px, span.p2.y - py)
      ctx.lineTo(span.p1.x - px, span.p1.y - py)
      ctx.closePath()
      ctx.fill()

      if (el.type === 'window') {
        // Frame rectangle across the band + centre glazing line
        ctx.strokeStyle = isSelected ? '#3b82f6' : '#334155'
        ctx.lineWidth = 1.2 / (zoom * CANVAS_SCALE)
        ctx.beginPath()
        ctx.moveTo(span.p1.x + px, span.p1.y + py); ctx.lineTo(span.p2.x + px, span.p2.y + py)
        ctx.lineTo(span.p2.x - px, span.p2.y - py); ctx.lineTo(span.p1.x - px, span.p1.y - py)
        ctx.closePath(); ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(span.p1.x, span.p1.y); ctx.lineTo(span.p2.x, span.p2.y)
        ctx.stroke()
      } else {
        // Door: leaf from the hinge + quarter-circle swing arc
        const { hinge, inward } = doorSwing(el.swing)
        const wallUx = dx / len, wallUy = dy / len
        const nx = -wallUy * (inward ? 1 : -1), ny = wallUx * (inward ? 1 : -1)
        const H = hinge === 'left' ? span.p1 : span.p2
        const J = hinge === 'left' ? span.p2 : span.p1
        const L = { x: H.x + nx * el.width!, y: H.y + ny * el.width! }
        ctx.strokeStyle = isSelected ? '#3b82f6' : '#1e293b'
        ctx.lineWidth = 1.4 / (zoom * CANVAS_SCALE)
        ctx.beginPath()
        ctx.moveTo(H.x, H.y); ctx.lineTo(L.x, L.y)
        ctx.stroke()
        // minor arc jamb → leaf tip, stepped manually (canvas arc sweep is
        // orientation-tricky under the flipped y axis)
        const a0 = Math.atan2(J.y - H.y, J.x - H.x)
        const a1 = Math.atan2(L.y - H.y, L.x - H.x)
        let sweep = a1 - a0
        while (sweep > Math.PI) sweep -= 2 * Math.PI
        while (sweep < -Math.PI) sweep += 2 * Math.PI
        ctx.setLineDash([0.08, 0.08])
        ctx.beginPath()
        const STEPS = 12
        for (let i = 0; i <= STEPS; i++) {
          const a = a0 + sweep * (i / STEPS)
          const ax = H.x + el.width! * Math.cos(a), ay = H.y + el.width! * Math.sin(a)
          if (i === 0) ctx.moveTo(ax, ay)
          else ctx.lineTo(ax, ay)
        }
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // Nodes
    for (const [id, node] of nodesView) {
      const isSelected = selectedIds.includes(id)
      ctx.beginPath()
      ctx.arc(node.x, node.y, isSelected ? 0.15 : 0.1, 0, Math.PI * 2)
      ctx.fillStyle = isSelected ? '#f59e0b' : '#3b82f6'
      ctx.fill()
    }

    // Rubber band: walls/beams run start → pointer; slabs/ceilings trace the
    // placed corners so far. Endpoints are WORLD coordinates here, snapped
    // through snapPoint so the preview shows exactly what commit will draw.
    const hoverSnapInfo = hoverPoint ? snapPoint(hoverPoint) : null
    const hoverSnap = hoverSnapInfo ? { x: hoverSnapInfo.x, y: hoverSnapInfo.y } : null
    if ((drawingTool === 'wall' || drawingTool === 'beam') && drawStart && hoverSnap) {
      ctx.setLineDash([0.2, 0.2])
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 1 / (zoom * CANVAS_SCALE)
      ctx.beginPath()
      ctx.moveTo(drawStart.x, drawStart.y)
      ctx.lineTo(hoverSnap.x, hoverSnap.y)
      ctx.stroke()
      ctx.setLineDash([])
    }
    if ((drawingTool === 'slab' || drawingTool === 'ceiling') && hoverSnap) {
      const chain: Array<{ x: number; y: number }> = [
        drawStart ?? { x: hoverSnap.x, y: hoverSnap.y },
        ...slabPts.map(pid => nodesView.get(pid)).filter((n): n is DraftNode => n !== undefined),
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

    /** Green ring — Revit's "this end will weld to this joint" indicator. */
    const snapRing = (x: number, y: number) => {
      ctx.beginPath()
      ctx.arc(x, y, 0.18, 0, Math.PI * 2)
      ctx.strokeStyle = '#10b981'
      ctx.lineWidth = 2.5 / (zoom * CANVAS_SCALE)
      ctx.stroke()
    }
    if (hoverSnapInfo?.nodeId) {
      const tn = nodesView.get(hoverSnapInfo.nodeId)
      if (tn) snapRing(tn.x, tn.y)
    }
    if (moveSnapTarget) {
      const tn = nodesView.get(moveSnapTarget)
      if (tn) snapRing(tn.x, tn.y)
    }

    // Door/window ghost: the wall that would host the tap, with the clamped
    // symbol drawn faintly where it would land.
    if ((activeTool === 'door' || activeTool === 'window') && hoverPoint) {
      const near = nearestWall(hoverPoint)
      if (near) {
        const dims = activeTool === 'door' ? DEFAULT_DOOR.width : DEFAULT_WINDOW.width
        const t = clampOpeningAt(near.t, dims, near.length)
        const h1 = nodesView.get(near.el.nodes[0])!
        const h2 = nodesView.get(near.el.nodes[1])!
        const proj = projectOnWall(near.el, nodesView, { x: h1.x, y: h1.y })!
        const cx = h1.x + t * proj.ux, cy = h1.y + t * proj.uy
        const band = bandOf(h1, h2, wallThickness(near.el))
        ctx.globalAlpha = 0.35
        ctx.fillStyle = '#93c5fd'
        ctx.beginPath()
        band.forEach((v, i) => (i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)))
        ctx.closePath(); ctx.fill()
        ctx.globalAlpha = 0.9
        ctx.setLineDash([0.12, 0.1])
        ctx.strokeStyle = '#2563eb'
        ctx.lineWidth = 1.4 / (zoom * CANVAS_SCALE)
        const half = dims / 2
        ctx.beginPath()
        ctx.moveTo(cx - half * proj.ux, cy - half * proj.uy)
        ctx.lineTo(cx + half * proj.ux, cy + half * proj.uy)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1
      }
    }

    // Hover snap ring — green on a joint (auto-connect), blue on the grid
    if (hoverPoint && !drawingTool && activeTool !== 'door' && activeTool !== 'window') {
      const info = snapPoint(hoverPoint)
      if (info.nodeId) {
        snapRing(info.x, info.y)
      } else if (info.x !== hoverPoint.x || info.y !== hoverPoint.y) {
        ctx.beginPath()
        ctx.arc(info.x, info.y, 0.12, 0, Math.PI * 2)
        ctx.strokeStyle = '#3b82f6'
        ctx.lineWidth = 2 / (zoom * CANVAS_SCALE)
        ctx.stroke()
      }
    }

    ctx.restore()
  }, [level, project, pan, zoom, selectedIds, drawingTool, drawStart, slabPts, hoverPoint, snapPoint,
      nodesView, openingAt, activeTool, nearestWall, sectionsById, moveSnapTarget])
  // Draw on every state change and on window resize
  useEffect(() => {
    render()
    window.addEventListener('resize', render)
    return () => window.removeEventListener('resize', render)
  }, [render])

  // --- Pointer interaction ---------------------------------------------------

  const cancelDrawState = useCallback(() => {
    setDrawingTool(null)
    setDrawStart(null)
    setSlabPts([])
  }, [])

  /** Place the door/window the pointer is hovering onto its nearest wall. */
  const placeOpening = useCallback((world: { x: number; y: number }) => {
    const near = nearestWall(world)
    if (!near) return
    const opening = createWallOpening(activeTool === 'door' ? 'door' : 'window', near.el.id, near.t, level)
    if (!opening) return
    const edit = withEditableLevel(project, level)
    edit.elements.set(opening.id, opening)
    onProjectChange(edit.project)
    onSelectionChange([opening.id])
  }, [activeTool, level, nearestWall, onProjectChange, onSelectionChange, project])

  /** One tap of the slab/ceiling corner sequence (existing semantics — every
   *  tap commits its joint first so the next tap's find-or-create sees it).
   *  Corners snap to existing joints first — panels close onto the structure. */
  const panelCornerTap = useCallback((world: { x: number; y: number }) => {
    const kind = activeTool === 'ceiling' ? 'ceiling' : 'slab'
    const snap = snapPoint(world)
    const edit = withEditableLevel(project, level)
    const pid = findOrCreateNode(edit.nodes, snap.x, snap.y, level.elevation)
    if (drawingTool !== kind) {
      onProjectChange(edit.project)
      setDrawStart({ x: snap.x, y: snap.y })
      setSlabPts([pid])
      setDrawingTool(kind)
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
            type: kind,
            nodes: [pts[0], pts[1]],
            sectionId: activeSectionId,
            role: kind,
            corners: [pts[0], pts[1], pts[2], pts[3]],
            materialId: activeMaterialId,
          })
          onProjectChange(edit.project)
        }
        cancelDrawState()
      }
    }
  }, [activeMaterialId, activeSectionId, activeTool, cancelDrawState, drawingTool, level, onProjectChange, project, slabPts, snapPoint])

  /** Commit a wall/beam from drawStart to the current snapped point. Both
   *  ends went through snapPoint, so an end near an existing joint REUSES
   *  that joint (find-or-create sees it at distance 0) — members weld. */
  const commitLineElement = useCallback((world: { x: number; y: number }) => {
    if (!drawStart) return
    const snap = snapPoint(world)
    const edit = withEditableLevel(project, level)
    const ni = findOrCreateNode(edit.nodes, drawStart.x, drawStart.y, level.elevation)
    const nj = findOrCreateNode(edit.nodes, snap.x, snap.y, level.elevation)
    if (ni !== nj && activeTool === drawingTool) {
      const eid = uid('e')
      edit.elements.set(eid, {
        id: eid,
        type: activeTool as 'wall' | 'beam',
        nodes: [ni, nj],
        sectionId: activeSectionId,
        role: activeTool as 'wall' | 'beam',
      })
      onProjectChange(edit.project)
    }
    cancelDrawState()
  }, [activeSectionId, activeTool, cancelDrawState, drawStart, drawingTool, level, onProjectChange, project, snapPoint])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    // Second finger down → pinch zoom/pan takes over everything else.
    if (pointersRef.current.size === 2) {
      const [p1, p2] = [...pointersRef.current.values()]
      gestureRef.current = {
        mode: 'pinch',
        base: {
          dist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
          zoom,
          centroid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
          pan,
        },
      }
      // A pinch is never a draw/move: drop the previews, keep the taps done.
      setNodePreview(null)
      setOpeningPreview(null)
      setMoveSnapTarget(null)
      if (drawingTool === 'wall' || drawingTool === 'beam') cancelDrawState()
      return
    }
    if (pointersRef.current.size > 2) return

    const world = screenToWorld(e.clientX, e.clientY)
    // Every new gesture starts with a clean weld target.
    setMoveSnapTarget(null)

    if (activeTool === 'select') {
      const hit = pickAt(world)
      if (!hit) {
        onSelectionChange([])
        gestureRef.current = { mode: 'pan', startScreen: { x: e.clientX, y: e.clientY }, startPan: pan }
        return
      }
      onSelectionChange([hit.id])
      if (hit.kind === 'node') {
        const n = nodesView.get(hit.id)
        if (n) {
          // a column's two joints travel together — dragging only its base
          // used to lean the column across the storey
          const orig = withColumnPartners(level, [hit.id])
            .map(id => nodesView.get(id))
            .filter((m): m is DraftNode => m !== undefined)
            .map(m => ({ id: m.id, x: m.x, y: m.y, z: m.z }))
          gestureRef.current = {
            mode: 'move', startWorld: world, startScreen: { x: e.clientX, y: e.clientY }, primary: hit.id,
            orig, movedPx: 0,
          }
        }
      } else {
        const el = level.elements.get(hit.id)
        if (!el) return
        if (el.type === 'door' || el.type === 'window') {
          gestureRef.current = { mode: 'moveOpening', id: hit.id, startScreen: { x: e.clientX, y: e.clientY }, movedPx: 0 }
        } else {
          const refs = withColumnPartners(level, el.corners ? [...el.corners] : [...el.nodes])
          const orig = refs
            .map(id => ({ id, n: nodesView.get(id) }))
            .filter((o): o is { id: string; n: DraftNode } => o.n !== undefined)
            .map(o => ({ id: o.id, x: o.n.x, y: o.n.y, z: o.n.z }))
          // the grabbed joint is the snap anchor — nearest of the referenced
          let primary = orig[0]?.id ?? ''
          let bestD = Infinity
          for (const o of orig) {
            const d = Math.hypot(o.x - world.x, o.y - world.y)
            if (d < bestD) { bestD = d; primary = o.id }
          }
          gestureRef.current = {
            mode: 'move', startWorld: world, startScreen: { x: e.clientX, y: e.clientY },
            primary, orig, movedPx: 0,
          }
        }
      }
      return
    }

    if (activeTool === 'column') {
      // The base snaps to the nearest existing joint first — a column dropped
      // on a corner RISES FROM that corner, not from a new joint beside it.
      const snap = snapPoint(world)
      const edit = withEditableLevel(project, level)
      const bottom = findOrCreateNode(edit.nodes, snap.x, snap.y, level.elevation)
      const top = findOrCreateNode(edit.nodes, snap.x, snap.y, level.elevation + level.height)
      const eid = uid('e')
      edit.elements.set(eid, {
        id: eid, type: 'column', nodes: [bottom, top], sectionId: activeSectionId, role: 'column',
      })
      onProjectChange(edit.project)
      return
    }

    if (activeTool === 'grid') {
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
      return
    }

    if (activeTool === 'door' || activeTool === 'window') {
      placeOpening(world)
      return
    }

    if (activeTool === 'slab' || activeTool === 'ceiling') {
      panelCornerTap(world)
      gestureRef.current = { mode: 'draw', wasDrawing: false, startScreen: { x: e.clientX, y: e.clientY }, movedPx: 0 }
      return
    }

    // wall | beam — the press STARTS the gesture; release decides tap-tap vs
    // press-drag-release (DRAW_COMMIT_PX). The start snaps to a joint first
    // (auto-connect) so drawing FROM an existing joint reuses it.
    const wasDrawing = drawingTool === activeTool
    if (!wasDrawing) {
      const snap = snapPoint(world)
      setDrawStart({ x: snap.x, y: snap.y })
      setDrawingTool(activeTool as 'wall' | 'beam')
    }
    gestureRef.current = { mode: 'draw', wasDrawing, startScreen: { x: e.clientX, y: e.clientY }, movedPx: 0 }
  }, [activeSectionId, activeTool, cancelDrawState, drawingTool, level, nodesView, onProjectChange,
      onSelectionChange, pan, panelCornerTap, pickAt, placeOpening, project, screenToWorld, snapPoint, zoom])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const tracked = pointersRef.current.get(e.pointerId)
    if (tracked) {
      tracked.x = e.clientX
      tracked.y = e.clientY
    }
    const g = gestureRef.current

    if (g.mode === 'pinch' && pointersRef.current.size >= 2) {
      const [p1, p2] = [...pointersRef.current.values()]
      const view = nextPinchView(g.base, Math.hypot(p2.x - p1.x, p2.y - p1.y), {
        x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2,
      })
      setZoom(view.zoom)
      setPan(view.pan)
      return
    }

    setHoverPoint(screenToWorld(e.clientX, e.clientY))

    if (g.mode === 'pan') {
      setPan({ x: g.startPan.x + (e.clientX - g.startScreen.x), y: g.startPan.y + (e.clientY - g.startScreen.y) })
      return
    }

    if (g.mode === 'draw') {
      g.movedPx = Math.max(g.movedPx, Math.hypot(e.clientX - g.startScreen.x, e.clientY - g.startScreen.y))
      return
    }

    if (g.mode === 'move') {
      g.movedPx = Math.max(g.movedPx, Math.hypot(e.clientX - g.startScreen.x, e.clientY - g.startScreen.y))
      if (g.movedPx < MOVE_START_PX) return
      const world = screenToWorld(e.clientX, e.clientY)
      let dx = world.x - g.startWorld.x
      let dy = world.y - g.startWorld.y
      // the grabbed joint is the anchor: it snaps to an existing JOINT first
      // (auto-connect — dropping it onto another joint welds them on release,
      // guarded so no element spanning both can collapse), else to the grid;
      // the rest of the selection follows by the same delta so relative
      // geometry survives
      const anchor = g.orig.find(o => o.id === g.primary)
      if (anchor) {
        const ax = anchor.x + dx
        const ay = anchor.y + dy
        const target = nearestDraftNode(nodesView, ax, ay, nodeSnapTolerance(), {
          z: anchor.z, zTolerance: 0.01, exclude: new Set(g.orig.map(o => o.id)),
        })
        if (target && canMergeDraftNodes(level, g.primary, target.id)) {
          dx = target.x - anchor.x
          dy = target.y - anchor.y
          setMoveSnapTarget(target.id)
        } else {
          setMoveSnapTarget(null)
          const snapped = snapToGrid(ax, ay)
          if (snapped) { dx = snapped.x - anchor.x; dy = snapped.y - anchor.y }
        }
      }
      const next = new Map<string, { x: number; y: number }>()
      for (const o of g.orig) next.set(o.id, { x: o.x + dx, y: o.y + dy })
      setNodePreview(next)
      return
    }

    if (g.mode === 'moveOpening') {
      g.movedPx = Math.max(g.movedPx, Math.hypot(e.clientX - g.startScreen.x, e.clientY - g.startScreen.y))
      if (g.movedPx < MOVE_START_PX) return
      const world = screenToWorld(e.clientX, e.clientY)
      const el = level.elements.get(g.id)
      if (!el?.hostId) return
      const host = level.elements.get(el.hostId)
      if (!host) return
      const proj = projectOnWall(host, nodesView, world)
      if (!proj || el.width === undefined) return
      setOpeningPreview({ id: g.id, at: clampOpeningAt(proj.t, el.width, proj.length) })
    }
  }, [level, nodesView, nodeSnapTolerance, screenToWorld, snapToGrid])

  const endGesture = useCallback((e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    pointersRef.current.delete(e.pointerId)
    const g = gestureRef.current

    if (g.mode === 'pinch') {
      if (pointersRef.current.size < 2) gestureRef.current = { mode: 'idle' }
      return
    }

    if (cancelled) {
      gestureRef.current = { mode: 'idle' }
      setNodePreview(null)
      setOpeningPreview(null)
      setMoveSnapTarget(null)
      return
    }

    if (g.mode === 'draw') {
      const world = screenToWorld(e.clientX, e.clientY)
      if (activeTool === 'slab' || activeTool === 'ceiling') {
        // taps already committed their corner on pointerdown; nothing more
        gestureRef.current = { mode: 'idle' }
        return
      }
      if (g.wasDrawing || g.movedPx > DRAW_COMMIT_PX) {
        // tap-tap second tap, or a press-drag-release stroke — commit
        commitLineElement(world)
      }
      // else: first tap of a tap-tap sequence — wait for the next press
      gestureRef.current = { mode: 'idle' }
      return
    }

    if (g.mode === 'move' && nodePreview && nodePreview.size > 0) {
      const edit = withEditableLevel(project, level)
      for (const [id, p] of nodePreview) {
        const n = edit.nodes.get(id)
        if (n) edit.nodes.set(id, { ...n, x: p.x, y: p.y })
      }
      let next = edit.project
      if (moveSnapTarget && moveSnapTarget !== g.primary) {
        // the drag ended ON another joint: WELD — every reference to the
        // dropped joint (member ends, panel corners, hosted components) is
        // rewritten to the target, so the model is truly connected, not just
        // two dots at the same spot
        const edited: DraftLevel = { ...level, nodes: edit.nodes, elements: edit.elements }
        const merged = mergeDraftNodes(edited, new Map([[g.primary, moveSnapTarget]]))
        const levels = new Map(next.levels)
        levels.set(level.id, merged)
        next = { ...next, levels }
        // the dropped joint no longer exists — keep the survivor selected
        onSelectionChange([moveSnapTarget])
      }
      // the move may have brought other joints onto existing ones (a column's
      // top following its base onto another column): weld those too
      const moved = next.levels.get(level.id)
      if (moved) {
        const welded = mergeCoincidentNodes(moved)
        if (welded !== moved) {
          const levels = new Map(next.levels)
          levels.set(level.id, welded)
          next = { ...next, levels }
        }
      }
      onProjectChange(next)
      setNodePreview(null)
      setMoveSnapTarget(null)
      gestureRef.current = { mode: 'idle' }
      return
    }

    if (g.mode === 'moveOpening' && openingPreview) {
      const el = level.elements.get(openingPreview.id)
      if (el) {
        const edit = withEditableLevel(project, level)
        const next = { ...el, at: openingPreview.at }
        edit.elements.set(next.id, next)
        onProjectChange(edit.project)
      }
      setOpeningPreview(null)
      gestureRef.current = { mode: 'idle' }
      return
    }

    gestureRef.current = { mode: 'idle' }
  }, [activeTool, commitLineElement, level, moveSnapTarget, nodePreview, onProjectChange,
      onSelectionChange, openingPreview, project, screenToWorld])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    endGesture(e, false)
  }, [endGesture])

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    endGesture(e, true)
  }, [endGesture])

  // Zoom: a native non-passive listener (React binds wheel passively at the
  // root), now anchored at the cursor — the point under it stays put.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = c.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      const next = anchoredZoom(viewRef.current, { x: sx, y: sy }, factor)
      setZoom(next.zoom)
      setPan(next.pan)
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
  }, [])

  // Keyboard shortcuts: Delete removes elements (walls cascade to their
  // hosted doors/windows, orphan joints are swept); Escape clears.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // keys typed into a field (an opening's width, a level name) belong to
      // the field — Delete there used to delete the selected element
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName))) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault()
        const next = deleteDraftElements(level, selectedIds)
        const levels = new Map(project.levels)
        levels.set(level.id, next)
        onProjectChange({ ...project, levels })
        onSelectionChange([])
      } else if (e.key === 'Escape') {
        onSelectionChange([])
        cancelDrawState()
        setNodePreview(null)
        setOpeningPreview(null)
        setMoveSnapTarget(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedIds, project, level, onProjectChange, onSelectionChange, cancelDrawState])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-white"
      style={{ touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={() => setHoverPoint(null)}
        className="w-full h-full cursor-crosshair"
        style={{ touchAction: 'none' }}
      />
    </div>
  )
}
