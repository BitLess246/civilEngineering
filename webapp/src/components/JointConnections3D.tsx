// ─────────────────────────────────────────────────────────────────────────
// 3D rendering of the DESIGNED steel beam-column connections (engine/
// steelConnections designSteelJoints output) — the Tekla-style joint look:
//   · shear tab: the designed plate (t × w × h) welded to the column face,
//     with every designed bolt drawn at its actual layout position
//   · moment connection: the same web tab PLUS flange CJP weld beads and
//     column continuity plates at the beam-flange levels
//   · weak-axis moment (moment-web-plate): horizontal extension plates welded
//     into the column web at both beam-flange levels
// The weld line follows the ENGINE's web/flange face determination: flange
// connections weld at the flange face (d/2), web connections at the web plane
// (tw/2) with the plate extended past the flange tips (bf/2) — matching the
// designed bolt eccentricity and the rigid-end-zone faces.
// Units: engine mm → scene metres.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import * as THREE from 'three'
import { shapeByName } from '../engine/aiscSections'
import type { SteelJoint, BeamBeamJoint, BeamConnection } from '../engine/steelConnections'
import type { StructuralModel } from '../engine/model'
import { levelDrop } from './modelSpace/sceneTokens'
import { connectionLevels, type ConnectionLevels } from '../lib/connectionLevels'

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

/** One beam's connection hardware at a joint. `faceOff` = distance from the
 *  joint node to the plate WELD line along the beam axis (m) — the support
 *  flange face (d/2), or the support web plane (tw/2) for web connections. */
function Connection({ conn, node, beamDir, faceOff, lv, extPlateLen }: {
  conn: BeamConnection
  node: THREE.Vector3
  beamDir: THREE.Vector3          // unit, node → beam span
  faceOff: number
  /** The supported beam's levels and section (lib/connectionLevels). */
  lv: ConnectionLevels
  /** moment-web-plate only: extension-plate run web → past the flange tips, m. */
  extPlateLen?: number
}) {
  const parts = useMemo(() => {
    const ex = beamDir.clone()                                   // along the beam
    const ez = new THREE.Vector3().crossVectors(ex, new THREE.Vector3(0, 1, 0)).normalize() // lateral
    // supporting face, at the beam's WEB CENTRE — the beam hangs below its node
    const F = node.clone().add(ex.clone().multiplyScalar(faceOff)).setY(lv.yc)

    const tab = conn.tab
    const t = tab.t * MM, w = tab.wMm * MM, h = tab.hMm * MM
    const twb = lv.tw              // beam web thickness for plate offset / bolt lengths, m
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
  }, [conn, node, beamDir, faceOff, lv])

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
        <meshStandardMaterial color="#475569" metalness={0.35} roughness={0.5} />
      </mesh>
      {/* full-height fillet weld bead: plate → support face (both sides drawn as one gold strip) */}
      <mesh position={F.clone().add(ex.clone().multiplyScalar(0.006)).add(ez.clone().multiplyScalar(plate.t))} quaternion={boxQuat}>
        <boxGeometry args={[0.012, plate.h, plate.t + 0.012]} />
        <meshStandardMaterial color={BOLT} metalness={0.5} roughness={0.4} />
      </mesh>
      {bolts.map((b) => (
        <Bolt key={b.id} p={b.p.clone().add(ez.clone().multiplyScalar(plate.t / 2))} axis={ez} dia={conn.bolts.dia} len={b.len} />
      ))}
      {/* strong-axis moment connection: flange CJP weld beads at the column face */}
      {conn.connType === 'moment-flange-weld' && conn.flange && (() => {
        // the CJP bead fills the flange end against the support face, full bf
        return [lv.yTopFlange, lv.yBotFlange].map((y) => (
          <mesh key={y} position={F.clone().setY(y).add(ex.clone().multiplyScalar(0.006))} quaternion={boxQuat}>
            <boxGeometry args={[0.012, lv.tf + 0.006, lv.bf]} />
            <meshStandardMaterial color={BOLT} metalness={0.5} roughness={0.4} />
          </mesh>
        ))
      })()}
      {/* weak-axis moment connection: horizontal extension plates welded into the
          column web at both beam-flange levels, running out past the flange tips */}
      {conn.connType === 'moment-web-plate' && conn.flange?.webPlate && extPlateLen && (() => {
        const wp = conn.flange.webPlate
        const tP = wp.tMm * MM, wP = wp.wMm * MM
        // in line with the beam flanges they take the force from
        return [lv.yTopFlange, lv.yBotFlange].map((y) => (
          <mesh key={`wp${y}`}
            position={F.clone().setY(y).add(ex.clone().multiplyScalar(extPlateLen / 2))}
            quaternion={boxQuat}>
            <boxGeometry args={[extPlateLen, tP, wP]} />
            <meshStandardMaterial color={PLATE} metalness={0.3} roughness={0.55} />
          </mesh>
        ))
      })()}
    </group>
  )
}

export function JointConnections3D({ joints, beamJoints = [], model, nodePos }: {
  joints: SteelJoint[]
  /** Beam-to-beam fin plates (beams framing into a girder web). */
  beamJoints?: BeamBeamJoint[]
  model: StructuralModel
  nodePos: Map<string, THREE.Vector3>
}) {
  const memMap = useMemo(() => new Map(model.members.map((m) => [m.id, m])), [model])
  const secMap = useMemo(() => new Map(model.sections.map((s) => [s.id, s])), [model])

  /** The supported beam's levels at this node — the same drop it is drawn with. */
  const levelsOf = (nodeId: string, c: BeamConnection): ConnectionLevels | null => {
    const P = nodePos.get(nodeId), mem = memMap.get(c.beamId)
    if (!P || !mem) return null
    const Q = nodePos.get(mem.i === nodeId ? mem.j : mem.i)
    const sec = secMap.get(mem.section)
    const shape = sec?.shape ? shapeByName(sec.shape) : undefined
    if (!Q) return null
    return connectionLevels(P.y, shape, levelDrop(mem.role, (shape?.d ?? 300) * MM, P, Q))
  }

  const renderConn = (nodeId: string, c: BeamConnection, faceOff: number, extPlateLen?: number) => {
    const P = nodePos.get(nodeId)
    const mem = memMap.get(c.beamId)
    if (!P || !mem) return null
    const otherId = mem.i === nodeId ? mem.j : mem.i
    const Q = nodePos.get(otherId)
    if (!Q) return null
    const dir = Q.clone().sub(P)
    if (dir.lengthSq() < 1e-9) return null
    const sec = secMap.get(mem.section)
    if (sec?.material !== 'steel') return null
    const lv = levelsOf(nodeId, c)
    if (!lv) return null
    return <Connection key={c.beamId} conn={c} node={P} beamDir={dir.normalize()} faceOff={faceOff} lv={lv} extPlateLen={extPlateLen} />
  }

  return (
    <group>
      {/* beam-to-beam fin plates: face = the girder WEB plane (tw/2) */}
      {beamJoints.map((bj) => {
        const gMem = memMap.get(bj.girderId)
        const gShape = shapeByName(bj.girderShape)
        const tw = ((gShape?.tw ?? 8) / 2 + 1) * MM
        if (!gMem) return null
        return <group key={`bb-${bj.nodeId}`}>{bj.connections.map((c) => renderConn(bj.nodeId, c, tw))}</group>
      })}
      {joints.map((j) => {
        const P = nodePos.get(j.nodeId)
        const colShape = shapeByName(j.columnShape)
        if (!P || !colShape) return null
        const col = { d: (colShape.d ?? 300) * MM, bf: (colShape.bf ?? 300) * MM, tf: (colShape.tf ?? 15) * MM, tw: (colShape.tw ?? 10) * MM }

        // continuity plates once per joint when a STRONG-axis moment connection
        // lands here (weak-axis conns bring their own extension plates)
        const momentConns = j.connections.filter((c) => c.connType === 'moment-flange-weld')
        // continuity plates line up with the flanges of the beam they stiffen
        const lv0 = momentConns.length > 0 ? levelsOf(j.nodeId, momentConns[0]!) : null
        const contPlates = lv0 ? (() => {
          return [lv0.yTopFlange, lv0.yBotFlange].map((y) => (
            <mesh key={`cp${y}`} position={P.clone().setY(y)}>
              <boxGeometry args={[Math.max(0.05, col.d - 2 * col.tf), 0.016, col.bf - 0.004]} />
              <meshStandardMaterial color={PLATE} metalness={0.3} roughness={0.55} />
            </mesh>
          ))
        })() : null

        return (
          <group key={j.nodeId}>
            {contPlates}
            {j.connections.map((c) => {
              // weld line per the ENGINE's face determination: a FLANGE conn
              // welds at the flange face (d/2); a WEB conn welds at the web
              // plane (tw/2) — the plate itself runs past the flange tips
              // (bf/2), matching the designed eccentricity.
              const faceOff = c.faceType === 'flange' ? col.d / 2 : col.tw / 2
              const extLen = c.connType === 'moment-web-plate' ? col.bf / 2 - col.tw / 2 + 0.04 : undefined
              return renderConn(j.nodeId, c, faceOff, extLen)
            })}
          </group>
        )
      })}
    </group>
  )
}
