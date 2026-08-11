// Three.js/R3F 3D scenes for the Steel Design page.
// Three sub-components: BeamViewer3D, ColumnViewer3D, ConnectionViewer3D.
// All share a common canvas wrapper with OrbitControls + FitView.

import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { SceneText } from './SceneText'
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
      {/* The shaft runs from the tail to the base of the head: centred at
          −headH/2 it spans −len/2 … len/2 − headH, which is exactly where the
          cone starts. The old centre, −(len/2 − (headH+r)/2), put its TOP at
          y = r/2 — the middle of the arrow — so every arrow longer than about
          twice its head was drawn as a stick and a detached cone with a gap
          between them. Short arrows hid it; the connection's reaction arrow
          did not. */}
      <mesh position={[0, -headH / 2, 0]}>
        <cylinderGeometry args={[r, r, Math.max(len - headH, 1e-4), 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, len / 2 - headH / 2, 0]}>
        <coneGeometry args={[headR, headH, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  )
}

function CanvasWrap({ children, box, dir = [1.2, 0.9, 1.5] }: {
  children: React.ReactNode; box: { min:[number,number,number]; max:[number,number,number] }
  /** Where the camera sits relative to the model. A member reads best at three
   *  quarters; a bolt PATTERN reads best nearly face-on, or the pitch and gauge
   *  it exists to show are foreshortened into a line. */
  dir?: [number,number,number]
}) {
  return (
    <div className="no-print h-80 w-full overflow-hidden rounded-lg border border-[#e3e1da] bg-white">
      <Canvas camera={{ fov: 45, near: 0.01, far: 500 }}>
        {/* The Canvas paints its own background, so the wrapper's colour never
            showed through — the viewport has to be told, not the div. */}
        <color attach="background" args={['#ffffff']} />
        {/* Lighting rebalanced for a white ground: on the old dark background
            an ambient of 0.5 read as "lit", and against white the same member
            came out flat and washed. */}
        <ambientLight intensity={1.05} />
        <directionalLight position={[5, 10, 5]} intensity={1.05} castShadow />
        <directionalLight position={[-5, -3, -5]} intensity={0.35} />
        {/* Fill from the camera side. Without it the face TOWARDS the viewer is
            lit only by ambient, so a thin plate viewed face-on (the connection)
            came out several stops darker than the same steel on the beam, which
            is seen at three quarters. */}
        <directionalLight position={[2, 2, 8]} intensity={0.5} />
        <OrbitControls makeDefault enableDamping={false} />
        {/* 1.4 was compensating for the old fit's over-estimate; with a fit
            that actually measures the extents, 1.08 is the breathing room. */}
        <FitView box={box} dir={dir} margin={1.08} />
        {children}
      </Canvas>
    </div>
  )
}

// ─── Beam 3D ───────────────────────────────────────────────────────────────

function DistLoad({ span, w, top, step = 0.6, scale = 0.5 }: {
  span: number; w: number; /** y of the top flange, so arrows land ON the beam */ top: number
  step?: number; scale?: number
}) {
  const h = top + Math.min(0.9, 0.2 + Math.abs(w) * scale)
  const positions: number[] = []
  for (let z = 0.1; z < span - 0.05; z += step) positions.push(z)
  return (
    <>
      {positions.map((z, i) => (
        <Arrow key={i} from={[0, h, z]} to={[0, top + 0.02, z]} color="#16a34a" r={0.025} headR={0.07} headH={0.18} />
      ))}
      <mesh position={[0, h + 0.02, span / 2]}>
        <boxGeometry args={[0.04, 0.04, span - 0.2]} />
        <meshStandardMaterial color="#16a34a" />
      </mesh>
      {/* An unlabelled load is a decoration: 4 kN/m and 40 kN/m draw the same
          picture, because the arrow height saturates at 0.9 m. Set above the
          spine rather than across it, and turned to face the default camera
          instead of edge-on to it. */}
      <SceneText position={[0, h + 0.26, span / 2]} rotation={[0, Math.PI / 2, 0]}
        fontSize={0.22} color="#15803d" anchorX="center">
        {`w = ${w.toFixed(1)} kN/m`}
      </SceneText>
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
      {/* NO ROTATION. `ExtrudedSection` already extrudes along +Z, which is the
          span direction the supports (z = 0 and z = span), the UDL and the
          section label all use. The old −90° about X stood the member UP along
          Y, so the beam ran vertically out of a scene whose supports and loads
          ran horizontally — the member appeared as a thin line off to one side
          while everything else pointed elsewhere. (The COLUMN view rotates by
          +90° on purpose: a column should stand up.) */}
      <ExtrudedSection shapes={shapes} length={span} color="#8b9fc1" />
      <DistLoad span={span} w={wDead + wLive} top={d} />
      <PinSupport3D pos={[0, -d, 0]} />
      <RollerSupport3D pos={[0, -d, span]} />
      {/* +π/2 about Y turns the label's +Z face towards +X, which is where the
          default camera is. At −π/2 it faced away and read mirrored. */}
      <SceneText position={[bf + 0.05, -d - 0.30, span / 2]} rotation={[0, Math.PI / 2, 0]}
        fontSize={0.2} color="#0f1b2a" anchorX="center">
        {/* No U+00B7 separator, and kN-m rather than kN·m: the bundled scene
            font (sceneFont.ts) does not cover the middle dot, and troika drops
            the whole label rather than one glyph. */}
        {`${shape.name}   -   L = ${span.toFixed(2)} m`}
      </SceneText>
    </CanvasWrap>
  )
}

// ─── Column 3D ─────────────────────────────────────────────────────────────

export function ColumnViewer3D({ shape, L, Pu, Mux }: {
  shape: AiscShape; L: number; Pu: number; Mux: number
}) {
  const shapes = useMemo(() => wShape(shape), [shape])
  const bf = (shape.bf ?? 150) / 1000 / 2

  // Wide enough for the annotations, not just the steel: the moment couple
  // reaches ±0.75 m and the section label runs off to the right, and anything
  // outside the box is what the fit crops.
  const box = useMemo<{ min:[number,number,number]; max:[number,number,number] }>(() => ({
    min: [-1.1, -0.4, -Math.max(bf * 2, 0.4)],
    max: [ bf + 2.1, L + 1.35, Math.max(bf * 2, 0.4)],
  }), [bf, L])

  return (
    <CanvasWrap box={box}>
      {/* `ExtrudedSection` extrudes along +Z, so the column has to be stood up
          by −90° about X (+Z → +Y). The old +90° sent it to −Y: the member hung
          BELOW the ground plane while the base plate, the load arrows and the
          label all sat above it, which is why the scene read as an empty box
          with a stub at the bottom. No lateral offset either — the profiles
          from `buildSectionShapes` are already centred on the member axis, so
          the old [-d, 0, -bf] shifted the column off its own arrows. */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {/* Spun a further 90° in its own plane so the section DEPTH lies in the
            X–Y plane, which is the plane the Mux couple below is drawn in. Left
            unspun, the picture showed a column bent about its weak axis while
            the numbers beside it were a strong-axis check. */}
        <group rotation={[0, 0, Math.PI / 2]}>
          <ExtrudedSection shapes={shapes} length={L} color="#8b9fc1" />
        </group>
      </group>

      {/* Axial load, with its magnitude — an arrow alone says "compression",
          not "how much". */}
      {Pu > 0 && (
        <>
          <Arrow from={[0, L + 0.9, 0]} to={[0, L + 0.05, 0]} color="#dc2626" headR={0.13} headH={0.3} />
          <SceneText position={[0.28, L + 0.75, 0]} fontSize={0.2} color="#b91c1c" anchorX="left">
            {`Pu = ${Pu.toFixed(0)} kN`}
          </SceneText>
        </>
      )}

      {/* End moment. Drawn as a COUPLE — two opposed arrows a lever apart —
          because a single straight arrow reads as a transverse point load,
          which is a different thing entirely. */}
      {Mux > 0 && (
        <>
          <Arrow from={[-0.75, L + 0.20, 0]} to={[-0.05, L + 0.20, 0]} color="#f59e0b" r={0.03} headR={0.10} headH={0.22} />
          <Arrow from={[ 0.75, L - 0.05, 0]} to={[ 0.05, L - 0.05, 0]} color="#f59e0b" r={0.03} headR={0.10} headH={0.22} />
          {/* Below the couple, not above it: above, the text ran straight
              through the Pu arrow and its label. */}
          <SceneText position={[-1.05, L - 0.32, 0]} fontSize={0.2} color="#b45309" anchorX="left">
            {`Mux = ${Mux.toFixed(0)} kN-m`}
          </SceneText>
        </>
      )}

      {/* fixed base */}
      <mesh position={[0, -0.03, 0]}><boxGeometry args={[0.8, 0.06, 0.5]} /><meshStandardMaterial color="#0056b3" /></mesh>
      <SceneText position={[bf + 0.45, L / 2, 0]} fontSize={0.2} color="#0f1b2a" anchorX="left">
        {`${shape.name}   L = ${L.toFixed(2)} m`}
      </SceneText>
    </CanvasWrap>
  )
}

// ─── Connection 3D ─────────────────────────────────────────────────────────

export function ConnectionViewer3D({ geom, db, t_plate, critical }: {
  geom: BoltGroupGeom; db: number; t_plate: number; critical: string
}) {
  const W = geom.plateW / 1000, H = geom.plateH / 1000, T = t_plate / 1000
  const dbm = db / 1000

  // The plate spans x = 0…W (it is drawn from its own left edge), the stub and
  // the reaction arrow reach beyond it, and the bolts stick out ±(grip/2+head)
  // in z. The old box started at −0.8W, which framed a strip of empty air to
  // the left of the connection and pushed the connection itself off-centre.
  const box = useMemo<{ min:[number,number,number]; max:[number,number,number] }>(() => ({
    min: [-0.06, -0.05, -0.09],
    max: [ W + 0.30, H * 1.58, 0.09],
  }), [W, H])

  return (
    // Nearly face-on: the pitch and gauge are the whole content of this view.
    <CanvasWrap box={box} dir={[0.5, 0.32, 1]}>
      {/* shear tab plate */}
      <mesh position={[W / 2, H / 2, 0]}>
        <boxGeometry args={[W, H, T]} />
        {/* Low metalness on purpose: there is no environment map in this scene,
            and a metalness of 0.5+ has nothing to reflect, so it resolves to
            near-black. The plate was rendering as a dark slab for that reason
            alone. */}
        <meshStandardMaterial color="#cfd4dc" metalness={0} roughness={0.6} />
      </mesh>
      {/* Bolts. A bare shank through the plate is not a bolt — it reads as a
          pin, and the grip length is invisible. Each is drawn as head + shank
          + nut, hexagonal (6-sided cylinders) and sized to the usual 1.5·db
          across flats, so the fastener is recognisable at a glance and the two
          plies it clamps are legible. */}
      {geom.bolts.map(b => {
        const bx = (b.x + geom.Cx) / 1000
        const by = (b.y + geom.Cy) / 1000
        const isCrit = b.id === critical
        const grip = T + 0.008 + 0.004          // shear tab + web stub + a little slack
        const hexR = dbm * 0.85, hexH = dbm * 0.65
        const col = isCrit ? '#f59e0b' : '#c8a33a'
        return (
          <group key={b.id} position={[bx, by, 0]}>
            {/* shank through the grip */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[dbm / 2, dbm / 2, grip + hexH, 14]} />
              <meshStandardMaterial color={col} metalness={0.25} roughness={0.4} />
            </mesh>
            {/* head, on the plate side; nut on the far side */}
            <mesh position={[0, 0, -(grip / 2 + hexH / 2)]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[hexR, hexR, hexH, 6]} />
              <meshStandardMaterial color={col} metalness={0.25} roughness={0.35} />
            </mesh>
            <mesh position={[0, 0, grip / 2 + hexH / 2]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[hexR, hexR, hexH, 6]} />
              <meshStandardMaterial color={col} metalness={0.25} roughness={0.35} />
            </mesh>
            {/* In front of the tab (+z, where the camera is) — behind it the
                mark was occluded by the very plate it annotates. */}
            <SceneText position={[-hexR - 0.008, 0, grip / 2 + hexH + 0.006]} fontSize={0.022}
              anchorX="right" color={isCrit ? '#b45309' : '#5c6675'}>
              {b.id}
            </SceneText>
          </group>
        )
      })}
      {/* Beam web stub (the connected member). Offset to sit BESIDE the tab,
          the way a web laps a shear tab rather than sharing its mid-plane —
          and TRANSLUCENT, because the drawing exists to show the bolt group
          and an opaque web laps straight over it. */}
      <mesh position={[W + 0.05, H / 2, T / 2 + 0.004]}>
        <boxGeometry args={[0.14, H * 1.35, 0.008]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.35} roughness={0.5}
          transparent opacity={0.3} depthWrite={false} />
      </mesh>
      {/* Reaction on the supported beam. It belongs OUT on the stub, clear of
          the bolt group — drawn over the plate it looked like a load applied to
          the tab itself, and it hid the bolts it was meant to be loading. */}
      <Arrow from={[W + 0.175, H * 1.5, T / 2 + 0.012]} to={[W + 0.175, H * 0.5, T / 2 + 0.012]}
        color="#16a34a" r={0.007} headR={0.021} headH={0.05} />
      <SceneText position={[W + 0.195, H * 1.22, T / 2 + 0.012]} fontSize={0.024} color="#15803d" anchorX="left">
        Vu
      </SceneText>
    </CanvasWrap>
  )
}
