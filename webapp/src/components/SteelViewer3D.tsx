// Three.js/R3F 3D scenes for the Steel Design page.
// Three sub-components: BeamViewer3D, ColumnViewer3D, ConnectionViewer3D.
// All share a common canvas wrapper with OrbitControls + FitView.

import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import { FitView } from './FitView'
import type { AiscShape } from '../engine/aiscSections'
import { effectiveSection } from '../engine/aiscSections'
import { buildSectionShapes } from '../lib/sectionShapes3d'
import type { BoltGroupGeom } from '../engine/steelDesign'

// ─── shared helpers ────────────────────────────────────────────────────────

function wShape(s: AiscShape): THREE.Shape[] {
  return buildSectionShapes(effectiveSection(s, false))
}

function ExtrudedSection({ shapes, length, color = '#6b7280', metalness = 0.3 }: {
  shapes: THREE.Shape[]; length: number; color?: string; metalness?: number
}) {
  return (
    <>
      {shapes.map((sh, i) => (
        <mesh key={i}>
          <extrudeGeometry args={[sh, { depth: length, bevelEnabled: false, steps: 1 }]} />
          <meshStandardMaterial color={color} metalness={metalness} roughness={0.55} />
        </mesh>
      ))}
    </>
  )
}

function Arrow({ from, to, color = '#16a34a', r = 0.04, headR = 0.10, headH = 0.25 }: {
  from: [number,number,number]; to: [number,number,number]; color?: string; r?: number; headR?: number; headH?: number
}) {
  const vf = new THREE.Vector3(...from), vt = new THREE.Vector3(...to)
  const dir = new THREE.Vector3().subVectors(vt, vf)
  const len = dir.length()
  const mid = vf.clone().add(vt).multiplyScalar(0.5)
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  return (
    <group position={[mid.x, mid.y, mid.z]} quaternion={quat}>
      <mesh position={[0, -(len / 2 - (headH + r) / 2), 0]}>
        <cylinderGeometry args={[r, r, len - headH, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, len / 2 - headH / 2, 0]}>
        <coneGeometry args={[headR, headH, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  )
}

function CanvasWrap({ children, box }: { children: React.ReactNode; box: { min:[number,number,number]; max:[number,number,number] } }) {
  return (
    <div className="no-print h-72 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
      <Canvas camera={{ fov: 45, near: 0.01, far: 500 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />
        <directionalLight position={[-5, -3, -5]} intensity={0.4} />
        <OrbitControls makeDefault enableDamping={false} />
        <FitView box={box} dir={[1.2, 0.9, 1.5]} margin={1.4} />
        {children}
      </Canvas>
    </div>
  )
}

// ─── Beam 3D ───────────────────────────────────────────────────────────────

function DistLoad({ span, w, step = 0.6, scale = 0.5 }: {
  span: number; w: number; step?: number; scale?: number
}) {
  const h = Math.min(0.9, 0.2 + Math.abs(w) * scale)
  const positions: number[] = []
  for (let z = 0.1; z < span - 0.05; z += step) positions.push(z)
  return (
    <>
      {positions.map((z, i) => (
        <Arrow key={i} from={[0, h * 0.85, z]} to={[0, 0.05, z]} color="#16a34a" r={0.025} headR={0.07} headH={0.18} />
      ))}
      <mesh position={[0, h + 0.02, span / 2]}>
        <boxGeometry args={[0.04, 0.04, span - 0.2]} />
        <meshStandardMaterial color="#16a34a" />
      </mesh>
    </>
  )
}

function PinSupport3D({ pos }: { pos: [number,number,number] }) {
  return (
    <group position={pos}>
      <mesh position={[0, -0.12, 0]}><coneGeometry args={[0.18, 0.28, 4]} /><meshStandardMaterial color="#0056b3" /></mesh>
      <mesh position={[0, -0.28, 0]}><boxGeometry args={[0.36, 0.04, 0.06]} /><meshStandardMaterial color="#0056b3" /></mesh>
    </group>
  )
}

function RollerSupport3D({ pos }: { pos: [number,number,number] }) {
  return (
    <group position={pos}>
      <mesh position={[0, -0.12, 0]}><coneGeometry args={[0.18, 0.28, 4]} /><meshStandardMaterial color="#0056b3" /></mesh>
      <mesh position={[0, -0.32, 0]}><cylinderGeometry args={[0.18, 0.18, 0.05, 16]} /><meshStandardMaterial color="#0056b3" /></mesh>
    </group>
  )
}

export function BeamViewer3D({ shape, span, wDead, wLive }: {
  shape: AiscShape; span: number; wDead: number; wLive: number
}) {
  const shapes = useMemo(() => wShape(shape), [shape])
  const d = (shape.d ?? 250) / 1000 / 2
  const bf = (shape.bf ?? 150) / 1000 / 2
  const box = useMemo<{ min:[number,number,number]; max:[number,number,number] }>(() => ({
    min: [-bf * 2, -d * 2 - 0.4, -0.3],
    max: [ bf * 2, d * 2 + 1.2, span + 0.3],
  }), [bf, d, span])

  return (
    <CanvasWrap box={box}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <ExtrudedSection shapes={shapes} length={span} color="#8b9fc1" />
      </group>
      <DistLoad span={span} w={wDead + wLive} />
      <PinSupport3D pos={[0, -d, 0]} />
      <RollerSupport3D pos={[0, -d, span]} />
      <Text position={[bf + 0.15, 0, span / 2]} rotation={[0, -Math.PI / 2, 0]} fontSize={0.18} color="#e2e8f0" anchorX="center">
        {shape.name}
      </Text>
    </CanvasWrap>
  )
}

// ─── Column 3D ─────────────────────────────────────────────────────────────

export function ColumnViewer3D({ shape, L, Pu, Mux }: {
  shape: AiscShape; L: number; Pu: number; Mux: number
}) {
  const shapes = useMemo(() => wShape(shape), [shape])
  const d = (shape.d ?? 250) / 1000 / 2
  const bf = (shape.bf ?? 150) / 1000 / 2

  const box = useMemo<{ min:[number,number,number]; max:[number,number,number] }>(() => ({
    min: [-bf * 3, -0.4, -bf * 3],
    max: [ bf * 3, L + 1.2, bf * 3],
  }), [bf, L])

  return (
    <CanvasWrap box={box}>
      {/* column extrudes along Y — rotate section from XY to XZ plane */}
      <group rotation={[0, 0, 0]} position={[-d, 0, -bf]}>
        <group rotation={[Math.PI / 2, 0, 0]}>
          <ExtrudedSection shapes={shapes} length={L} color="#8b9fc1" />
        </group>
      </group>
      {/* axial load arrow */}
      {Pu > 0 && <Arrow from={[0, L + 0.9, 0]} to={[0, L + 0.05, 0]} color="#dc2626" headR={0.13} headH={0.3} />}
      {/* moment arrow: horizontal arrow at top */}
      {Mux > 0 && <Arrow from={[-0.6, L + 0.1, 0]} to={[0.1, L + 0.1, 0]} color="#f59e0b" headR={0.10} headH={0.22} />}
      {/* fixed base */}
      <mesh position={[0, -0.03, 0]}><boxGeometry args={[0.8, 0.06, 0.5]} /><meshStandardMaterial color="#0056b3" /></mesh>
      <Text position={[bf + 0.35, L / 2, 0]} rotation={[0, 0, 0]} fontSize={0.18} color="#e2e8f0" anchorX="center">
        {shape.name}
      </Text>
    </CanvasWrap>
  )
}

// ─── Connection 3D ─────────────────────────────────────────────────────────

export function ConnectionViewer3D({ geom, db, t_plate, critical }: {
  geom: BoltGroupGeom; db: number; t_plate: number; critical: string
}) {
  const W = geom.plateW / 1000, H = geom.plateH / 1000, T = t_plate / 1000
  const dbm = db / 1000

  const box = useMemo<{ min:[number,number,number]; max:[number,number,number] }>(() => ({
    min: [-W * 0.8, -0.1, -0.6],
    max: [ W * 0.8 + 0.3, H + 0.1, 0.6],
  }), [W, H])

  return (
    <CanvasWrap box={box}>
      {/* shear tab plate */}
      <mesh position={[W / 2, H / 2, 0]}>
        <boxGeometry args={[W, H, T]} />
        <meshStandardMaterial color="#a1a1aa" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* bolts */}
      {geom.bolts.map(b => {
        const bx = (b.x + geom.Cx) / 1000
        const by = (b.y + geom.Cy) / 1000
        const isCrit = b.id === critical
        return (
          <group key={b.id} position={[bx, by, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[dbm / 2, dbm / 2, 0.4, 12]} />
              <meshStandardMaterial color={isCrit ? '#f59e0b' : '#d4a017'} metalness={0.7} roughness={0.3} />
            </mesh>
            <Text position={[dbm * 0.8, dbm * 0.8, 0.05]} fontSize={0.018} color={isCrit ? '#fbbf24' : '#e2e8f0'}>
              {b.id}
            </Text>
          </group>
        )
      })}
      {/* beam web stub (connected member) */}
      <mesh position={[W + 0.06, H / 2, 0]}>
        <boxGeometry args={[0.12, H * 1.3, 0.008]} />
        <meshStandardMaterial color="#6b7280" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* load arrow */}
      <Arrow from={[W + 0.14, H * 1.1, 0]} to={[W + 0.14, H * 0.2, 0]} color="#16a34a" r={0.012} headR={0.035} headH={0.08} />
    </CanvasWrap>
  )
}
