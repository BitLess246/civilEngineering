/**
 * 3D Drafting Viewport — real-time 3D view of the floor plan.
 *
 * Runs the SAME draftToStructuralModel conversion the ModelSpace export uses,
 * then renders the result with the ModelSpace scene parts — so what you see
 * here is exactly what you get on export, and the grid bubbles read the model
 * joints the way ModelSpace's do. Coordinates: the model is y-up (x = plan X,
 * z = plan Y), which draftToStructuralModel already produces.
 *
 * Revit-style architecture rides along: wall-hosted doors & windows render as
 * panels set INTO their wall (they follow it when it moves), ceilings hang at
 * the storey top in their finish colour, and slabs tint by their material.
 * Doors/windows/ceilings are NOT in the structural model — the viewport reads
 * them from the draft levels directly, which is also why selection works.
 *
 * Walls render as the ARCHITECTURAL SOLID (Wall3D's solid mode): opaque, at
 * their real thickness, click-to-pick. The conversion still idealises each
 * wall as a carrying member at its top — that is how the frame export carries
 * the wall's self-weight — but this viewport HIDES those members: in a
 * drafting view a beam box capping every wall is idealisation noise, not
 * building. ModelSpace keeps them; that is the structural reading.
 */

import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { DraftProject, DraftLevel, DraftElement } from '../engine/drafting3d'
import type { RectSection } from '../engine/model'
import { draftToStructuralModel, clampOpeningAt, resolveFinishMaterial, projectOnWall } from '../engine/drafting3d'
import { Member3D, Nodes3D, Slab3D, Wall3D, GridBubbles3D } from './modelSpace/scene'

const DOOR_COLOR = '#8b5e3c'      // timber leaf
const FRAME_COLOR = '#f1f5f9'     // painted frame
const GLASS_COLOR = '#a8d4e8'     // glazing tint
const SEL_COLOR = '#f59e0b'

interface Drafting3DViewportProps {
  project: DraftProject
  selectedIds: string[]
  /** Clicking a member or panel in 3D reports its draft id (selection sync). */
  onSelect?: (id: string) => void
  style?: React.CSSProperties
}

/** Draft plan point → model world position (x, z, y) — the SAME swap the
 *  export applies, so panels land exactly on the walls they host in. */
function worldOf(x: number, yPlan: number, zElev: number): THREE.Vector3 {
  return new THREE.Vector3(x, zElev, yPlan)
}

/** One wall-hosted door or window: a frame box plus the leaf/glazing panel,
 *  centred on the host wall's plane at the opening's clamped position. The
 *  frame is deeper than its host wall — a casing proud of the solid wall on
 *  both faces, the way a real frame reads — since the wall itself no longer
 *  hides anything. */
function Opening3D({ el, level, sections, selected, onPick }: {
  el: DraftElement
  level: DraftLevel
  sections: Map<string, RectSection>
  selected: boolean
  onPick: () => void
}) {
  const geo = useMemo(() => {
    if (!el.hostId || el.at === undefined || el.width === undefined || el.height === undefined) return null
    const host = level.elements.get(el.hostId)
    if (!host || host.type !== 'wall') return null
    const a = level.nodes.get(host.nodes[0])
    const b = level.nodes.get(host.nodes[1])
    if (!a || !b) return null
    const proj = projectOnWall(host, level.nodes, { x: a.x, y: a.y })
    if (!proj) return null
    const t = clampOpeningAt(el.at, el.width, proj.length)
    const cx = a.x + t * proj.ux
    const cy = a.y + t * proj.uy
    const sill = el.sill ?? 0
    const centre = worldOf(cx, cy, a.z + sill + el.height / 2)
    // rotation mapping +X onto the wall's plan direction in model coords
    const rotationY = Math.atan2(-(b.y - a.y), b.x - a.x)
    // the host wall's thickness (section h) sets the frame's depth — the
    // casing must clear the solid wall to be seen at all
    const sec = sections.get(host.sectionId)
    const wallT = sec ? sec.h / 1000 : 0.2
    return { centre, rotationY, width: el.width, height: el.height, kind: el.type, frameT: Math.max(0.12, wallT + 0.04) }
  }, [el, level, sections])

  if (!geo) return null
  const panelT = 0.06   // leaf/glazing thickness, m
  const tint = selected ? SEL_COLOR : geo.kind === 'door' ? DOOR_COLOR : GLASS_COLOR
  return (
    <group position={geo.centre} rotation={[0, geo.rotationY, 0]} onClick={(e) => { e.stopPropagation(); onPick() }}>
      {/* frame: a slightly larger, shallower box behind the panel */}
      <mesh>
        <boxGeometry args={[geo.width + 0.08, geo.height + 0.08, geo.frameT]} />
        <meshStandardMaterial color={selected ? SEL_COLOR : FRAME_COLOR} />
      </mesh>
      <mesh position={[0, 0, geo.frameT / 2 + panelT / 2 + 0.001]}>
        <boxGeometry args={[geo.width, geo.height, panelT]} />
        <meshStandardMaterial
          color={tint}
          transparent={geo.kind === 'window'}
          opacity={geo.kind === 'window' ? 0.75 : 1}
          roughness={geo.kind === 'door' ? 0.7 : 0.2}
        />
      </mesh>
    </group>
  )
}

/** A ceiling: the finish plane at the storey top, in its material colour.
 *  Architectural only — never part of the exported frame. */
function Ceiling3D({ el, level, selected, onPick }: {
  el: DraftElement
  level: DraftLevel
  selected: boolean
  onPick: () => void
}) {
  const geo = useMemo(() => {
    if (!el.corners) return null
    const pts = el.corners.map(cid => level.nodes.get(cid)).filter((n): n is NonNullable<typeof n> => !!n)
    if (pts.length !== 4) return null
    const mid = pts.reduce((s, p) => s.add(new THREE.Vector3(p.x, 0, p.y)), new THREE.Vector3()).multiplyScalar(0.25)
    const sx = Math.max(
      Math.abs(pts[1].x - pts[0].x), Math.abs(pts[2].x - pts[0].x),
      Math.abs(pts[1].x - pts[3].x), Math.abs(pts[2].x - pts[3].x),
    )
    const sz = Math.max(
      Math.abs(pts[1].z - pts[0].z), Math.abs(pts[2].z - pts[0].z),
      Math.abs(pts[1].z - pts[3].z), Math.abs(pts[2].z - pts[3].z),
    )
    // the ceiling plane sits just under the storey top (the soffit it finishes)
    const y = level.elevation + level.height - 0.03
    // Ceiling finishes are near-white by nature — on the white backdrop the
    // fill alone washes out, so the plane carries a visible edge outline too.
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, 0.04, sz))
    return { centre: new THREE.Vector3(mid.x, y, mid.z), sx, sz, edges }
  }, [el, level])

  if (!geo) return null
  const mat = resolveFinishMaterial(el.materialId)
  return (
    <group position={geo.centre}>
      <mesh onClick={(e) => { e.stopPropagation(); onPick() }}>
        <boxGeometry args={[geo.sx, 0.04, geo.sz]} />
        <meshStandardMaterial
          color={selected ? SEL_COLOR : mat.color}
          transparent opacity={selected ? 0.8 : 0.55}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments geometry={geo.edges}>
        <lineBasicMaterial color={selected ? SEL_COLOR : '#64748b'} />
      </lineSegments>
    </group>
  )
}

export function Drafting3DViewport({ project, selectedIds, onSelect, style }: Drafting3DViewportProps) {
  const model = useMemo(() => draftToStructuralModel(project), [project])

  const nodePos = useMemo(() => {
    const pos = new Map<string, THREE.Vector3>()
    for (const n of model.nodes) pos.set(n.id, new THREE.Vector3(n.x, n.y, n.z))
    return pos
  }, [model])

  const sectionOf = useMemo(() => {
    const byId = new Map(project.sections)
    return (id: string) => {
      const s = byId.get(id)
      return s ? { b: s.b, h: s.h, material: s.material } : undefined
    }
  }, [project.sections])

  /** Draft element id → its finish material tint (slabs) and the level each
   *  element lives on (openings/ceilings resolve their geometry per level). */
  const levelsList = useMemo(() => Array.from(project.levels.values()), [project])

  /** Members that exist only to CARRY a wall (the exported frame's self-weight
   *  path) — hidden here, drawn by the wall itself instead. */
  const wallMemberIds = useMemo(() => new Set((model.walls ?? []).map(w => w.member)), [model])

  const slabTint = useMemo(() => {
    const tints = new Map<string, string>()
    for (const lvl of levelsList) {
      for (const el of lvl.elements.values()) {
        if (el.type === 'slab' && el.materialId) tints.set(el.id, resolveFinishMaterial(el.materialId).color)
      }
    }
    return tints
  }, [levelsList])

  return (
    <div style={{ ...style, width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [13, 13, 13], fov: 45, far: 200 }}
        style={{ width: '100%', height: '100%' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0xffffff, 1)
          gl.shadowMap.enabled = true
        }}
      >
        <ambientLight color="#ffffff" intensity={0.8} />
        <directionalLight position={[10, 20, 10]} intensity={1} castShadow />
        <GridBubbles3D model={model} />
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={2}
          maxDistance={50}
        />
        {/* Members — solid, drawn to their section, amber when selected.
            EXCEPT the walls' carrying members: each wall exports a beam at its
            top (the self-weight path), and drawing it caps every wall with a
            beam box. The wall below renders as the solid; the idealisation
            stays in the export where it belongs. */}
        {model.members.map((m) => {
          if (wallMemberIds.has(m.id)) return null
          const a = nodePos.get(m.i)
          const b = nodePos.get(m.j)
          if (!a || !b) return null
          return (
            <Member3D
              key={m.id}
              a={a}
              b={b}
              role={m.role}
              selected={selectedIds.includes(m.id)}
              sec={sectionOf(m.section)}
              onPick={() => onSelect?.(m.id)}
            />
          )
        })}
        {/* Slab panels hang below the node line, thickness to scale, tinted
            by their finish material */}
        {model.plates.map((p) => {
          const corners = p.corners.map(c => nodePos.get(c)).filter((v): v is THREE.Vector3 => v !== undefined)
          if (corners.length !== 4) return null
          return (
            <Slab3D
              key={p.id}
              corners={corners}
              thickness={p.thickness / 1000}
              selected={selectedIds.includes(p.id)}
              color={slabTint.get(p.id)}
              onPick={() => onSelect?.(p.id)}
            />
          )
        })}
        {/* Walls hang one full storey below their carrying member's node line —
            exactly the storey the drafted wall closes — and render as the
            architectural solid: opaque, real thickness, click selects the wall */}
        {(model.walls ?? []).map((w) => {
          const m = model.members.find(mm => mm.id === w.member)
          const tA = m && nodePos.get(m.i)
          const tB = m && nodePos.get(m.j)
          if (!tA || !tB) return null
          const drop = new THREE.Vector3(0, -w.height, 0)
          return (
            <Wall3D
              key={w.id}
              tA={tA}
              tB={tB}
              bA={tA.clone().add(drop)}
              bB={tB.clone().add(drop)}
              shear={w.shearWall}
              solid
              thicknessM={w.thickness / 1000}
              selected={selectedIds.includes(w.id)}
              onPick={() => onSelect?.(w.id)}
            />
          )
        })}
        {/* Doors & windows — read from the draft levels, hosted on their walls */}
        {levelsList.map(lvl =>
          Array.from(lvl.elements.values())
            .filter(el => el.type === 'door' || el.type === 'window')
            .map(el => (
              <Opening3D
                key={el.id}
                el={el}
                level={lvl}
                sections={project.sections}
                selected={selectedIds.includes(el.id)}
                onPick={() => onSelect?.(el.id)}
              />
            )),
        )}
        {/* Ceilings — finish planes at each storey top */}
        {levelsList.map(lvl =>
          Array.from(lvl.elements.values())
            .filter(el => el.type === 'ceiling')
            .map(el => (
              <Ceiling3D
                key={el.id}
                el={el}
                level={lvl}
                selected={selectedIds.includes(el.id)}
                onPick={() => onSelect?.(el.id)}
              />
            )),
        )}
        <Nodes3D nodePos={nodePos} />
      </Canvas>
      <div className="absolute bottom-4 left-4 text-xs text-muted bg-white/80 backdrop-blur px-2 py-1 rounded">
        3D Viewport — Orbit: LMB, Pan: RMB, Zoom: Scroll · one finger orbits on touch
      </div>
    </div>
  )
}

export function Drafting3DViewportWrapper({ project, selectedIds, onSelect }: Drafting3DViewportProps) {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: '400px' }}>
      <Drafting3DViewport project={project} selectedIds={selectedIds} onSelect={onSelect} />
    </div>
  )
}
