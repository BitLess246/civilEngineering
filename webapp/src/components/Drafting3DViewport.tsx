/**
 * 3D Drafting Viewport — real-time 3D view of the floor plan.
 *
 * Runs the SAME draftToStructuralModel conversion the ModelSpace export uses,
 * then renders the result with the ModelSpace scene parts — so what you see
 * here is exactly what you get on export, and the grid bubbles read the model
 * joints the way ModelSpace's do. Coordinates: the model is y-up (x = plan X,
 * z = plan Y), which draftToStructuralModel already produces.
 */

import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { DraftProject } from '../engine/drafting3d'
import { draftToStructuralModel } from '../engine/drafting3d'
import { Member3D, Nodes3D, Slab3D, Wall3D, GridBubbles3D } from './modelSpace/scene'

interface Drafting3DViewportProps {
  project: DraftProject
  selectedIds: string[]
  /** Clicking a member or panel in 3D reports its draft id (selection sync). */
  onSelect?: (id: string) => void
  style?: React.CSSProperties
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

  return (
    <div style={{ ...style, width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [8, 10, 8], fov: 45 }}
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
        {/* Members — solid, drawn to their section, amber when selected */}
        {model.members.map((m) => {
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
        {/* Slab panels hang below the node line, thickness to scale */}
        {model.plates.map((p) => {
          const corners = p.corners.map(c => nodePos.get(c)).filter((v): v is THREE.Vector3 => v !== undefined)
          if (corners.length !== 4) return null
          return (
            <Slab3D
              key={p.id}
              corners={corners}
              thickness={p.thickness / 1000}
              selected={selectedIds.includes(p.id)}
              onPick={() => onSelect?.(p.id)}
            />
          )
        })}
        {/* Walls hang one full storey below their carrying member's node line —
            exactly the storey the drafted wall closes */}
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
            />
          )
        })}
        <Nodes3D nodePos={nodePos} />
      </Canvas>
      <div className="absolute bottom-4 left-4 text-xs text-muted bg-white/80 backdrop-blur px-2 py-1 rounded">
        3D Viewport — Orbit: LMB, Pan: RMB, Zoom: Scroll
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
