// ─────────────────────────────────────────────────────────────────────────
// 3D rendering of the DESIGNED steel beam-column connections (engine/
// steelConnections designSteelJoints output) — the Tekla-style joint look:
//   · shear tab: the designed plate (t × w × h) welded to the column face,
//     with every designed bolt drawn at its actual layout position
//   · moment connection: the same web tab PLUS flange CJP weld beads and
//     column continuity plates at the beam-flange levels
// Geometry follows the app's drawn orientation (column depth d along global X,
// flanges facing ±X): X-beams land on the flange face at d/2, Z-beams on the
// flange-tip plane at bf/2 — the same faces the rigid end zones use.
// Units: engine mm → scene metres.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import * as THREE from 'three'
import { shapeByName } from '../engine/aiscSections'
import type { SteelJoint, BeamConnection } from '../engine/steelConnections'
import type { StructuralModel } from '../engine/model'

const PLATE = '#334155'   // dark slate plates (tabs, continuity)
const BOLT = '#d4a017'    // gold bolts / weld beads
const MM = 1 / 1000

function Bolt({ p, axis, dia, len }: { p: THREE.Vector3; axis: THREE.Vector3; dia: number; len: number }) {
  const quat = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize()),
    [axis],
  )
  const r = (dia / 2) * MM
  return (
    <group position={p} quaternion={quat}>
      <mesh>
        <cylinderGeometry args={[r, r, len, 10]} />
        <meshStandardMaterial color={BOLT} metalness={0.55} roughness={0.35} />
      </mesh>
      {[len / 2, -len / 2].map((o, i) => (
        <mesh key={i} position={[0, o, 0]}>
          <cylinderGeometry args={[r * 1.8, r * 1.8, 0.008, 6]} />
          <meshStandardMaterial color={BOLT} metalness={0.55} roughness={0.35} />
        </mesh>
      ))}
    </group>
  )
}

/** One beam's connection hardware at a joint. */
function Connection({ conn, node, beamDir, col }: {
  conn: BeamConnection
  node: THREE.Vector3
  beamDir: THREE.Vector3          // unit, node → beam span
  col: { d: number; bf: number; tf: number }   // column dims, m
}) {
  const parts = useMemo(() => {
    const ex = beamDir.clone()                                   // along the beam
    const ez = new THREE.Vector3().crossVectors(ex, new THREE.Vector3(0, 1, 0)).normalize() // lateral
    const alongX = Math.abs(ex.x) >= Math.abs(ex.z)
    // face the beam lands on, per the drawn orientation (d → global X)
    const faceOff = alongX ? col.d / 2 : col.bf / 2
    const F = node.clone().add(ex.clone().multiplyScalar(faceOff))   // column face @ beam CL

    const tab = conn.tab
    const t = tab.t * MM, w = tab.wMm * MM, h = tab.hMm * MM
    const twb = 0.008              // nominal beam web thickness for bolt lengths, m
    const plateCtr = F.clone()
      .add(ex.clone().multiplyScalar(w / 2))
      .add(ez.clone().multiplyScalar(twb / 2 + t / 2))

    const bolts = conn.bolts.locations.map((b) => ({
      id: b.id,
      p: F.clone()
        .add(ex.clone().multiplyScalar(b.x * MM))
        .add(new THREE.Vector3(0, b.y * MM - h / 2, 0)),
      len: t + twb + 0.02,
    }))

    return { ex, ez, F, plate: { ctr: plateCtr, t, w, h }, bolts }
  }, [conn, node, beamDir, col])

  const { ex, ez, F, plate, bolts } = parts
  // orient a unit box so local X→ex, Y→up, Z→ez (right-handed by construction)
  const boxQuat = useMemo(() => {
    const m = new THREE.Matrix4().makeBasis(ex, new THREE.Vector3(0, 1, 0), ez)
    return new THREE.Quaternion().setFromRotationMatrix(m)
  }, [ex, ez])

  return (
    <group>
      {/* shear tab plate (every connection has one — moment conns tab the web too) */}
      <mesh position={plate.ctr} quaternion={boxQuat}>
        <boxGeometry args={[plate.w, plate.h, plate.t]} />
        <meshStandardMaterial color={PLATE} metalness={0.3} roughness={0.55} />
      </mesh>
      {bolts.map((b) => (
        <Bolt key={b.id} p={b.p.clone().add(ez.clone().multiplyScalar(plate.t / 2))} axis={ez} dia={conn.bolts.dia} len={b.len} />
      ))}
      {/* moment connection: flange CJP weld beads at the column face */}
      {conn.connType === 'moment-flange-weld' && conn.flange && (() => {
        const dB = plate.h + 0.16   // ≈ beam depth proxy from tab height (tab ≈ web depth)
        return [1, -1].map((s) => (
          <mesh key={s} position={F.clone().add(new THREE.Vector3(0, (s * dB) / 2, 0)).add(ex.clone().multiplyScalar(0.012))} quaternion={boxQuat}>
            <boxGeometry args={[0.025, 0.02, Math.max(0.12, plate.w * 0.9)]} />
            <meshStandardMaterial color={BOLT} metalness={0.5} roughness={0.4} />
          </mesh>
        ))
      })()}
    </group>
  )
}

export function JointConnections3D({ joints, model, nodePos }: {
  joints: SteelJoint[]
  model: StructuralModel
  nodePos: Map<string, THREE.Vector3>
}) {
  const memMap = useMemo(() => new Map(model.members.map((m) => [m.id, m])), [model])
  const secMap = useMemo(() => new Map(model.sections.map((s) => [s.id, s])), [model])

  return (
    <group>
      {joints.map((j) => {
        const P = nodePos.get(j.nodeId)
        const colShape = shapeByName(j.columnShape)
        if (!P || !colShape) return null
        const col = { d: (colShape.d ?? 300) * MM, bf: (colShape.bf ?? 300) * MM, tf: (colShape.tf ?? 15) * MM }

        // continuity plates once per joint when ANY moment connection lands here
        const momentConns = j.connections.filter((c) => c.connType === 'moment-flange-weld')
        const contPlates = momentConns.length > 0 ? (() => {
          const c0 = momentConns[0]
          const dB = c0.tab.hMm * MM + 0.16
          return [1, -1].map((s) => (
            <mesh key={`cp${s}`} position={P.clone().add(new THREE.Vector3(0, (s * (dB - 0.02)) / 2, 0))}>
              <boxGeometry args={[Math.max(0.05, col.d - 2 * col.tf), 0.016, col.bf - 0.004]} />
              <meshStandardMaterial color={PLATE} metalness={0.3} roughness={0.55} />
            </mesh>
          ))
        })() : null

        return (
          <group key={j.nodeId}>
            {contPlates}
            {j.connections.map((c) => {
              const mem = memMap.get(c.beamId)
              if (!mem) return null
              const otherId = mem.i === j.nodeId ? mem.j : mem.i
              const Q = nodePos.get(otherId)
              if (!Q) return null
              const dir = Q.clone().sub(P)
              if (dir.lengthSq() < 1e-9) return null
              const sec = secMap.get(mem.section)
              if (sec?.material !== 'steel') return null
              return <Connection key={c.beamId} conn={c} node={P} beamDir={dir.normalize()} col={col} />
            })}
          </group>
        )
      })}
    </group>
  )
}
