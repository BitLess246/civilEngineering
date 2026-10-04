/**
 * 3D Drafting Viewport — real-time 3D view of the floor plan.
 * Uses react-three-fiber with components from ModelSpace.
 */

import { useMemo, useRef, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { DraftProject, DraftLevel, DraftNode, DraftElement } from '../engine/drafting3d'
import { MemberStick3D, Nodes3D, Member3D, Slab3D, GridBubbles3D } from '../components/modelSpace/scene'

interface Drafting3DViewportProps {
  project: DraftProject
  level: DraftLevel
  selectedIds: string[]
  style?: React.CSSProperties
}

export function Drafting3DViewport({ project, level, selectedIds, style }: Drafting3DViewportProps) {
  const sceneRef = useRef<THREE.Group>(null)

  // Build node positions
  const nodePos = useMemo(() => {
    const pos = new Map<string, THREE.Vector3>()
    for (const [id, node] of level.nodes) {
      pos.set(id, new THREE.Vector3(node.x, node.y, node.z))
    }
    return pos
  }, [level.nodes])

  // Build elements for 3D rendering
  const elements3D = useMemo(() => {
    const items: Array<{
      id: string
      type: string
      a: THREE.Vector3
      b: THREE.Vector3
      role: string
      selected: boolean
      section?: { b: number; h: number; material?: string }
      corners?: THREE.Vector3[]
    }> = []

    for (const [id, el] of level.elements) {
      if (el.type === 'slab' && el.corners) {
        const corners = el.corners
          .map(nid => level.nodes.get(nid))
          .filter((n): n is { x: number; y: number; z: number } => n !== undefined)
          .map(n => new THREE.Vector3(n.x, n.y, n.z))
        if (corners.length === 4) {
          // Add slab
        }
        continue
      }

      const [nid1, nid2] = el.nodes
      const n1 = level.nodes.get(nid1)
      const n2 = level.nodes.get(nid2)
      if (!n1 || !n2) continue

      const a = new THREE.Vector3(n1.x, n1.y, n1.z)
      const b = new THREE.Vector3(n2.x, n2.y, n2.z)

      items.push({
        id,
        type: 'member',
        a,
        b,
        role: el.type,
        selected: false,
        section: undefined,
      })
    }
    return items
  }, [level.elements, level.nodes])

  return (
    <div style={{ ...style, width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        ref={sceneRef}
        camera={{ position: [8, 10, 8], fov: 45 }}
        style={{ width: '100%', height: '100%' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0xffffff, 1)
          gl.shadowMap.enabled = true
        }}
      >
        <ambientLight color="#ffffff" intensity={0.8} />
        <directionalLight position={[10, 20, 10]} intensity={1} castShadow />
        <GridBubbles3D />
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={2}
          maxDistance={50}
        />
        {/* Render members */}
        {/* Members would be rendered here */}
      </Canvas>
      <div className="absolute bottom-4 left-4 text-xs text-muted bg-white/80 backdrop-blur px-2 py-1 rounded">
        3D Viewport — Orbit: LMB, Pan: RMB, Zoom: Scroll
      </div>
    </div>
  )
}

export function Drafting3DViewportWrapper({ project, level, selectedIds }: Drafting3DViewportProps) {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: '400px' }}>
      <Drafting3DViewport project={project} level={level} selectedIds={selectedIds} />
    </div>
  )
}