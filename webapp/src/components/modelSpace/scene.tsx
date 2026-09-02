// ─────────────────────────────────────────────────────────────────────────
// THE 3D SCENE — every mesh the model space draws.
//
// Lifted wholesale out of `pages/ModelSpace.tsx`, which carried 1,100 lines of
// module-scope helpers above a component that is itself several thousand more.
// Nothing here closes over the page's state — they are components that take
// props — so this is exactly a move, and nothing changed on the way.
//
// Units: model space in metres, y up. Sections arrive in mm and are converted
// at the point of use, as they were before.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { SceneText } from '../../components/SceneText'
import { Edges } from '@react-three/drei'
import { surfaceKey, surfaceMaterial, WIRE_OPACITY, type SurfaceStyle } from './viewMode'
import { flightSolid, type PlacedStair } from '../../engine/stairPlacement'
import * as THREE from 'three'
import type { StructuralModel, WoodDeck } from '../../engine/model'
import { type V3 } from '../../engine/frame3d'
import { dashSpans } from '../../engine/dashPattern'
import { memberDiagramRibbon, type DiagramComp } from '../../engine/memberDiagram3d'
import { footingPrism } from '../../engine/footingLayout'
import { shapeByName, effectiveSection } from '../../engine/aiscSections'
import { buildSectionShapes } from '../../lib/sectionShapes3d'
import { ROLE_COLOR, SEL, LOAD_COLOR, levelDrop, DIAG_COLOR, UP, TRIB_COLOR, slabTributaryPolys, type TribKind } from './sceneTokens'

/**
 * The EDGES of the mesh this sits inside, drawn only in wireframe.
 *
 * Nothing in solid or ghost mode — a returned `null` mounts no line geometry at
 * all, rather than a hidden one per member on a model that is thousands of
 * them.
 *
 * The edges carry the shape in wireframe; the face behind them is left at a
 * few per cent (`WIRE_OPACITY`) so a click still picks the member and the eye
 * can still tell which side of a column it is looking at. `threshold` is the
 * angle below which two faces count as one surface: 15° keeps a box to its
 * twelve real edges instead of drawing the triangulation diagonal across every
 * face, which is what a raw `wireframe: true` material would have given.
 */
function WireEdges({ style, color }: { style: SurfaceStyle; color: string }) {
  if (style !== 'wire') return null
  return <Edges threshold={15} color={color} />
}

export function Member3D({ a, b, role, selected, tint = 0, sec, style = 'solid', onPick }: {
  a: THREE.Vector3; b: THREE.Vector3; role: string; selected: boolean
  /** 0–1 utilisation tint (|M| relative to the model max) after analysis. */
  tint?: number
  /** the member's own section, drawn to scale (mm → m). */
  sec?: { b: number; h: number; material?: string }
  /** Solid concrete, ghosted (a cage is being read through it) or wireframe —
   *  see `viewMode`, which decides which of the three this is. */
  style?: SurfaceStyle
  onPick: () => void
}) {
  const { mid, quat, len } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(b, a)
    const len = dir.length()
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize())
    return { mid: new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), quat, len }
  }, [a, b])
  const ty = sec ? sec.h / 1000 : role === 'column' ? 0.3 : 0.22
  const tz = sec ? sec.b / 1000 : role === 'column' ? 0.3 : 0.22
  // the node is the top of a beam, not its centroid — see levelDrop
  const drop = levelDrop(role, ty, a, b)
  const color = useMemo(() => {
    if (selected) return SEL
    const base = new THREE.Color(ROLE_COLOR[role] ?? '#64748b')
    if (sec?.material === 'wood') base.lerp(new THREE.Color('#a86b34'), 0.6)   // timber brown tint
    return tint > 0 ? `#${base.lerp(new THREE.Color('#dc2626'), tint).getHexString()}` : `#${base.getHexString()}`
  }, [selected, role, tint, sec?.material])
  return (
    <mesh position={[mid.x, mid.y - drop, mid.z]} quaternion={quat}
      onClick={(e) => { e.stopPropagation(); onPick() }}>
      <boxGeometry args={[len, ty, tz]} />
      {/* See-through while the cages are shown, and again in wireframe — solid
          concrete hides the steel inside it, which made "show reinforcement
          cages" look like it did nothing at all. The `key` is what makes the
          change work rather than merely look wired: three will not apply a
          transparent false → true change to a material that already exists, so
          the material has to be rebuilt. See modelSpace/viewMode.ts. */}
      <meshStandardMaterial key={surfaceKey(style)} color={color} {...surfaceMaterial(style)} />
      <WireEdges style={style} color={color} />
    </mesh>
  )
}

/** Rigid end-offset arm: a thin purple stub from a node to its (offset) member end. */

/** Rigid end-offset arm: a thin purple stub from a node to its (offset) member end. */
export function RigidArm3D({ a, b }: { a: THREE.Vector3; b: THREE.Vector3 }) {
  const { mid, quat, len } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(b, a)
    const len = dir.length()
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(1, 0, 0), len > 1e-9 ? dir.clone().normalize() : new THREE.Vector3(1, 0, 0))
    return { mid: new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), quat, len }
  }, [a, b])
  if (len < 1e-6) return null
  return (
    <mesh position={mid} quaternion={quat}>
      <boxGeometry args={[len, 0.06, 0.06]} />
      <meshStandardMaterial color="#9333ea" />
    </mesh>
  )
}

/** Overlay for a tension/compression-only member that DROPPED OUT of the
 *  governing combo's active set — a dashed red sleeve along the member axis.
 *  Drawn on top of the member so its geometry and section stay readable. */

/** Overlay for a tension/compression-only member that DROPPED OUT of the
 *  governing combo's active set — a dashed red sleeve along the member axis.
 *  Drawn on top of the member so its geometry and section stay readable. */
export function SlackMember3D({ a, b }: { a: THREE.Vector3; b: THREE.Vector3 }) {
  const { segs, dash, quat } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(b, a)
    const len = dir.length()
    const q = len > 1e-9
      ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize())
      : new THREE.Quaternion()
    const pat = dashSpans(len)
    return { segs: pat.t.map((t) => a.clone().lerp(b, t)), dash: pat.dash, quat: q }
  }, [a, b])
  return (
    <group>
      {segs.map((p, i) => (
        <mesh key={i} position={p} quaternion={quat}>
          <boxGeometry args={[dash, 0.1, 0.1]} />
          <meshStandardMaterial color="#dc2626" transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  )
}

/** Steel member drawn as its true AISC cross-section, extruded along the member
 *  axis (i→j). The profile is built in the local XY plane then oriented so its
 *  extrude (+Z) runs along the member and its strong axis (depth d) stays
 *  vertical for beams/girders. Falls back to the box Member3D if the shape is
 *  unknown. */

/** Steel member drawn as its true AISC cross-section, extruded along the member
 *  axis (i→j). The profile is built in the local XY plane then oriented so its
 *  extrude (+Z) runs along the member and its strong axis (depth d) stays
 *  vertical for beams/girders. Falls back to the box Member3D if the shape is
 *  unknown. */
export function MemberSteel3D({ a, b, role, shapeName, selected, tint = 0, axisRotation, style = 'solid', onPick }: {
  a: THREE.Vector3; b: THREE.Vector3; role: string; shapeName: string
  selected: boolean; tint?: number
  /** Explicit local-axis rotation (°). Absent ⇒ the role default (columns 90). */
  axisRotation?: number
  /** See `viewMode`. A steel section wireframes to its own profile outline,
   *  which is the one drawing where the shape is still readable end-on. */
  style?: SurfaceStyle
  onPick: () => void
}) {
  const { shapes, quat, pos, len } = useMemo(() => {
    const shape = shapeByName(shapeName)
    const dir = new THREE.Vector3().subVectors(b, a)
    const len = dir.length()
    const shapes = shape ? buildSectionShapes(effectiveSection(shape, false)) : []
    // orient local +Z (extrude dir) onto the member axis; group placed at node i
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize())
    // For columns (primarily vertical), pre-rotate the section 90° around local Z
    // so the depth d aligns with global X and the flanges face ±X — the 90°
    // axisRotation default the analysis now shares.
    if (role === 'column') {
      const rPre = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2)
      quat.multiply(rPre)
    }
    // explicit axisRotation: rotate by the difference from the role default
    // (engine +θ turns depth y′ toward z′ = −rotation about the extrude axis here)
    const d0 = role === 'column' ? 90 : 0
    const extra = (axisRotation ?? d0) - d0
    if (extra) quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (-extra * Math.PI) / 180))
    // a beam's node line is its TOP, so the section hangs below it — see levelDrop
    const d = shape ? (effectiveSection(shape, false).base.d ?? 0) / 1000 : 0
    const pos = a.clone()
    pos.y -= levelDrop(role, d, a, b)
    return { shapes, quat, pos, len }
  }, [a, b, shapeName, role, axisRotation])

  const color = useMemo(() => {
    if (selected) return SEL
    const base = new THREE.Color('#64748b')   // steel grey
    return tint > 0 ? `#${base.lerp(new THREE.Color('#dc2626'), tint).getHexString()}` : `#${base.getHexString()}`
  }, [selected, tint])

  if (shapes.length === 0) {
    return <Member3D a={a} b={b} role={role} selected={selected} tint={tint} style={style} onPick={onPick} />
  }
  return (
    <group position={pos} quaternion={quat} onClick={(e) => { e.stopPropagation(); onPick() }}>
      {shapes.map((sh, i) => (
        <mesh key={i}>
          <extrudeGeometry args={[sh, { depth: len, bevelEnabled: false, steps: 1 }]} />
          <meshStandardMaterial key={surfaceKey(style)} color={color} metalness={0.35} roughness={0.5}
            {...surfaceMaterial(style)} />
          <WireEdges style={style} color={color} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * Thickness to draw a panel at when the plate has not been given one, m. Only a
 * fallback — every plate in the model carries `thickness`.
 */
const SLAB_FALLBACK_T = 0.125

export function Slab3D({ corners, thickness, selected, shell, deck, style = 'solid', onPick }: {
  corners: THREE.Vector3[]; thickness?: number
  selected: boolean; shell?: boolean; deck?: WoodDeck
  /** See `viewMode`. A floor is the largest thing in the model and the one
   *  that hides most of what is under it, so it wireframes with the rest. */
  style?: SurfaceStyle
  onPick: () => void
}) {
  // The node line of a floor is the TOP of the beams framing into it — see
  // `levelDrop` — so it is the top of the SLAB too: a floor is one surface, and
  // the beams hang under it. Drawn from the node UPWARD, the panel stood a
  // whole slab thickness proud of the beams it sits on, and the cage — which
  // `slabCage` builds downward from the same level, correctly — hung below the
  // concrete it belongs to. So the box hangs below the node, at the plate's own
  // thickness rather than a fixed 100 mm.
  const thick = Math.max(0.02, thickness ?? SLAB_FALLBACK_T)
  const { mid, sx, sz } = useMemo(() => {
    const mid = corners.reduce((s, c) => s.add(c.clone()), new THREE.Vector3()).multiplyScalar(0.25)
    const sx = Math.abs(corners[1].x - corners[0].x) || Math.abs(corners[2].x - corners[0].x)
    const sz = Math.abs(corners[3].z - corners[0].z) || Math.abs(corners[2].z - corners[0].z)
    return { mid, sx, sz }
  }, [corners])

  // Timber deck: joist lines spanning the shorter edge, repeated at the joist
  // spacing along the longer edge (matching the woodSlab design), drawn just
  // UNDER the faint wood-tinted deck panel — which is where a joist is, and the
  // only place it stays visible now the panel hangs below the node line.
  const deckGeo = useMemo(() => {
    if (!deck || shell || corners.length < 4) return null
    const [c0, c1, , c3] = corners
    const eA = c1.clone().sub(c0), eB = c3.clone().sub(c0)
    const spanVec = eA.length() <= eB.length() ? eA : eB     // joists span the shorter edge
    const repVec = eA.length() <= eB.length() ? eB : eA      // repeat along the longer edge
    const repLen = repVec.length()
    const spacing = Math.max(0.05, deck.joistSpacing / 1000)
    const n = Math.max(2, Math.floor(repLen / spacing) + 1)
    const pts: number[] = []
    for (let i = 0; i < n; i++) {
      const t = Math.min(1, (i * spacing) / repLen)
      const b = c0.clone().add(repVec.clone().multiplyScalar(t))
      const e = b.clone().add(spanVec)
      pts.push(b.x, b.y - thick - 0.01, b.z, e.x, e.y - thick - 0.01, e.z)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [deck, shell, corners, thick])

  // Shell mode: draw the real triangulated panel (two triangles on the c0–c2
  // diagonal, the exact mesh the solver assembles) — works for any orientation,
  // including vertical wall panels — tinted teal and overlaid with the diagonal.
  const shellGeo = useMemo(() => {
    if (!shell || corners.length < 4) return null
    const [c0, c1, c2, c3] = corners
    const fill = new THREE.BufferGeometry()
    fill.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      c0.x, c0.y, c0.z, c1.x, c1.y, c1.z, c2.x, c2.y, c2.z,
      c0.x, c0.y, c0.z, c2.x, c2.y, c2.z, c3.x, c3.y, c3.z,
    ]), 3))
    fill.computeVertexNormals()
    const diag = new THREE.BufferGeometry()
    diag.setAttribute('position', new THREE.BufferAttribute(new Float32Array([c0.x, c0.y, c0.z, c2.x, c2.y, c2.z]), 3))
    return { fill, diag }
  }, [shell, corners])

  if (shellGeo) {
    return (
      <group onClick={(e) => { e.stopPropagation(); onPick() }}>
        <mesh geometry={shellGeo.fill}>
          <meshStandardMaterial color={selected ? SEL : '#14b8a6'} transparent opacity={selected ? 0.75 : 0.4}
            side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <primitive object={new THREE.Line(shellGeo.diag, new THREE.LineBasicMaterial({ color: selected ? SEL : '#0f766e' }))} />
      </group>
    )
  }

  if (deckGeo) {
    return (
      <group onClick={(e) => { e.stopPropagation(); onPick() }}>
        <mesh position={[mid.x, mid.y - thick / 2, mid.z]}>
          <boxGeometry args={[sx * 0.96, thick, sz * 0.96]} />
          <meshStandardMaterial key={surfaceKey(style)} color={selected ? SEL : '#c8a06a'}
            transparent opacity={style === 'wire' ? WIRE_OPACITY : selected ? 0.6 : 0.3}
            depthWrite={style === 'solid'} />
          <WireEdges style={style} color={selected ? SEL : '#7a4a1e'} />
        </mesh>
        <lineSegments geometry={deckGeo}>
          <lineBasicMaterial color={selected ? SEL : '#7a4a1e'} />
        </lineSegments>
      </group>
    )
  }

  return (
    <mesh position={[mid.x, mid.y - thick / 2, mid.z]}
      onClick={(e) => { e.stopPropagation(); onPick() }}>
      <boxGeometry args={[sx * 0.96, thick, sz * 0.96]} />
      <meshStandardMaterial key={surfaceKey(style)} color={selected ? SEL : '#7ba6d4'}
        transparent opacity={style === 'wire' ? WIRE_OPACITY : selected ? 0.85 : 0.45}
        depthWrite={style === 'solid'} />
      <WireEdges style={style} color={selected ? SEL : '#4a7fb5'} />
    </mesh>
  )
}

/** Live solver-progress card: phase, detail, and a determinate (current/total)
 *  or indeterminate bar. Renders nothing when idle. */

export function Support3D({ p }: { p: THREE.Vector3 }) {
  return (
    <mesh position={[p.x, p.y - 0.22, p.z]}>
      <coneGeometry args={[0.28, 0.45, 4]} />
      <meshStandardMaterial color="#0f4c92" />
    </mesh>
  )
}

/** A labelled bubble (white disc + ring + letter/number) lying flat on the floor
 *  at the end of a grid line, ETABS-style. */

/** A labelled bubble (white disc + ring + letter/number) lying flat on the floor
 *  at the end of a grid line, ETABS-style. */
export function AxisBubble({ x, y, z, r, label }: { x: number; y: number; z: number; r: number; label: string }) {
  return (
    <group position={[x, y + 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh><circleGeometry args={[r, 40]} /><meshBasicMaterial color="#ffffff" /></mesh>
      <mesh position={[0, 0, 0.001]}><ringGeometry args={[r * 0.94, r, 40]} /><meshBasicMaterial color="#475569" /></mesh>
      <SceneText position={[0, 0, 0.004]} fontSize={r * 0.95} color="#1e293b" anchorX="center" anchorY="middle">{label}</SceneText>
    </group>
  )
}

/** ETABS-style plan grid on the floor: column lines (A, B, …) parallel to Z and
 *  rows (1, 2, …) parallel to X, derived from the unique node coordinates. Bubbles
 *  sit 3 m off the top (letters) and left (numbers) edges only; a dimension line 2 m
 *  off each edge — with 45° architectural ticks and the bay spacing (m) sitting above
 *  the line — reports the bay widths. Flat on the base plane (1 m = one floor square). */

/** ETABS-style plan grid on the floor: column lines (A, B, …) parallel to Z and
 *  rows (1, 2, …) parallel to X, derived from the unique node coordinates. Bubbles
 *  sit 3 m off the top (letters) and left (numbers) edges only; a dimension line 2 m
 *  off each edge — with 45° architectural ticks and the bay spacing (m) sitting above
 *  the line — reports the bay widths. Flat on the base plane (1 m = one floor square). */
export function GridBubbles3D({ model }: { model: StructuralModel }) {
  const g = useMemo(() => {
    if (!model.nodes.length) return null
    const uniq = (vals: number[]) => {
      const out: number[] = []
      for (const v of [...vals].sort((a, b) => a - b))
        if (!out.length || Math.abs(v - out[out.length - 1]) > 0.05) out.push(v)
      return out
    }
    const xs = uniq(model.nodes.map((n) => n.x))
    const zs = uniq(model.nodes.map((n) => n.z))
    if (xs.length < 2 && zs.length < 2) return null
    const y0 = Math.min(...model.nodes.map((n) => n.y))
    const x0 = xs[0], x1 = xs[xs.length - 1], z0 = zs[0], z1 = zs[zs.length - 1]
    const r = Math.max(0.5, Math.max(x1 - x0, z1 - z0, 1) * 0.035)      // bubble radius
    const BUB = 3, DIM = 2, pad = r                                     // metres out from the grid edge
    // main grid lines — reach the bubble on the labelled side, a touch past on the far side
    const gpts: number[] = []
    for (const x of xs) gpts.push(x, y0, z0 - BUB + r, x, y0, z1 + pad) // column lines ‖ Z
    for (const z of zs) gpts.push(x0 - BUB + r, y0, z, x1 + pad, y0, z) // rows ‖ X
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(gpts, 3))
    // dimension lines + 45° architectural ticks, 2 m off the top and left edges
    const zDim = z0 - DIM, xDim = x0 - DIM, s = r * 0.3
    const dpts: number[] = []
    if (xs.length > 1) {
      dpts.push(x0, y0, zDim, x1, y0, zDim)
      for (const x of xs) dpts.push(x - s, y0, zDim - s, x + s, y0, zDim + s)  // 45° slash tick
    }
    if (zs.length > 1) {
      dpts.push(xDim, y0, z0, xDim, y0, z1)
      for (const z of zs) dpts.push(xDim - s, y0, z - s, xDim + s, y0, z + s)  // 45° slash tick
    }
    const dimGeo = new THREE.BufferGeometry()
    dimGeo.setAttribute('position', new THREE.Float32BufferAttribute(dpts, 3))
    const xDims = xs.slice(1).map((x, i) => ({ mid: (xs[i] + x) / 2, val: x - xs[i] }))
    const zDims = zs.slice(1).map((z, i) => ({ mid: (zs[i] + z) / 2, val: z - zs[i] }))
    return { xs, zs, y0, x0, z0, r, BUB, zDim, xDim, geo, dimGeo, xDims, zDims }
  }, [model])
  if (!g) return null
  const dimFont = g.r * 0.72, tOff = 0.3                                // text 0.3 m above the line (→ 2.3 m out)
  return (
    <group>
      <lineSegments geometry={g.geo}>
        <lineBasicMaterial color="#64748b" transparent opacity={0.5} />
      </lineSegments>
      <lineSegments geometry={g.dimGeo}>
        <lineBasicMaterial color="#64748b" transparent opacity={0.8} />
      </lineSegments>
      {/* column-line bubbles (A, B, …) — top edge only, 3 m out */}
      {g.xs.map((x, i) => (
        <AxisBubble key={`col${i}`} x={x} y={g.y0} z={g.z0 - g.BUB} r={g.r} label={String.fromCharCode(65 + i)} />
      ))}
      {/* row bubbles (1, 2, …) — left edge only, 3 m out */}
      {g.zs.map((z, i) => (
        <AxisBubble key={`row${i}`} x={g.x0 - g.BUB} y={g.y0} z={z} r={g.r} label={String(i + 1)} />
      ))}
      {/* bay dimensions across the top (X), text above the line */}
      {g.xDims.map((d, i) => (
        <SceneText key={`dx${i}`} position={[d.mid, g.y0 + 0.03, g.zDim - tOff]} rotation={[-Math.PI / 2, 0, 0]}
          fontSize={dimFont} color="#475569" anchorX="center" anchorY="middle">{`${d.val.toFixed(2)} m`}</SceneText>
      ))}
      {/* bay dimensions down the left (Z), text above the line */}
      {g.zDims.map((d, i) => (
        <SceneText key={`dz${i}`} position={[g.xDim - tOff, g.y0 + 0.03, d.mid]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}
          fontSize={dimFont} color="#475569" anchorX="center" anchorY="middle">{`${d.val.toFixed(2)} m`}</SceneText>
      ))}
    </group>
  )
}

/** A designed footing drawn to ACTUAL plan size below grade, so overlapping
 *  footprints are visible. bx/bz = plan dimensions (m), dc = depth (m), angle =
 *  plan rotation about Y (combined footings follow the column axis). Overlapping
 *  footings are tinted red. */

/** A designed footing drawn to ACTUAL plan size below grade, so overlapping
 *  footprints are visible. bx/bz = plan dimensions (m), dc = depth (m), angle =
 *  plan rotation about Y (combined footings follow the column axis). Overlapping
 *  footings are tinted red. */
export function Footing3D({ cx, cz, bx, bz, bz1, bz2, dc, yTop = 0, angle = 0, overlap = false, label, style = 'solid' }: {
  cx: number; cz: number; bx: number; bz: number; bz1?: number; bz2?: number
  dc: number
  /** See `viewMode`. */
  style?: SurfaceStyle
  /** Level of the pad's TOP, m. Below grade by the pedestal the column runs
   *  down through — the pad was drawn with its top pinned to y = 0, so a pad
   *  founded 1.5 m down appeared at the surface with nothing under the column. */
  yTop?: number
  angle?: number; overlap?: boolean; label?: string
}) {
  // A tapered pad is drawn tapered. Boxing it on the mean width puts the plan
  // edge in the wrong place at BOTH ends — which is the whole difference
  // between a trapezoidal footing and a rectangular one.
  const w1 = bz1 ?? bz, w2 = bz2 ?? bz
  const geom = useMemo(() => {
    if (Math.abs(w1 - w2) < 1e-6) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(footingPrism(bx, w1, w2, dc), 3))
    g.computeVertexNormals()
    return g
  }, [bx, w1, w2, dc])
  return (
    <group position={[cx, yTop - dc / 2, cz]} rotation={[0, -angle, 0]}>
      <mesh geometry={geom ?? undefined}>
        {!geom && <boxGeometry args={[bx, dc, bz]} />}
        <meshStandardMaterial key={surfaceKey(style)} color={overlap ? '#dc2626' : '#b45309'}
          transparent opacity={style === 'wire' ? WIRE_OPACITY : overlap ? 0.6 : 0.45}
          depthWrite={style === 'solid'} side={THREE.DoubleSide} />
        <WireEdges style={style} color={overlap ? '#991b1b' : '#7c2d12'} />
      </mesh>
      {label && (
        <SceneText position={[0, dc / 2 + 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.32}
          color={overlap ? '#991b1b' : '#7c2d12'} anchorX="center" anchorY="middle" outlineWidth={0.012} outlineColor="#ffffff">
          {label}
        </SceneText>
      )}
    </group>
  )
}

/** Wall panel between the beam nodes (tA,tB) and the nodes below (bA,bB).
 *  Shear walls show the equivalent X-strut; gravity walls are a plain panel. */

/** Wall panel between the beam nodes (tA,tB) and the nodes below (bA,bB).
 *  Shear walls show the equivalent X-strut; gravity walls are a plain panel. */
export function Wall3D({ tA, tB, bA, bB, shear }: { tA: THREE.Vector3; tB: THREE.Vector3; bA: THREE.Vector3; bB: THREE.Vector3; shear: boolean }) {
  const { fill, x1, x2 } = useMemo(() => {
    const pos = [bA, bB, tB, bA, tB, tA].flatMap((p) => [p.x, p.y, p.z])
    const fill = new THREE.BufferGeometry()
    fill.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return {
      fill,
      x1: new THREE.BufferGeometry().setFromPoints([bA, tB]),
      x2: new THREE.BufferGeometry().setFromPoints([bB, tA]),
    }
  }, [tA, tB, bA, bB])
  const color = shear ? '#7c3aed' : '#94a3b8'
  return (
    <group>
      <mesh geometry={fill}>
        <meshBasicMaterial color={color} transparent opacity={shear ? 0.22 : 0.14} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {shear && <>
        <primitive object={new THREE.Line(x1, new THREE.LineBasicMaterial({ color }))} />
        <primitive object={new THREE.Line(x2, new THREE.LineBasicMaterial({ color }))} />
      </>}
    </group>
  )
}

/**
 * One stair flight: the waist as an inclined slab, the treads as boxes on top.
 *
 * Drawn from `placeStair` — the same geometry the loads and the schedule are
 * built on, so the picture cannot show a stair the calculation does not have.
 * Translucent like the walls, because the flight is NOT in the analysis: it is
 * load on the two members it bears on, not stiffness in the frame.
 */

/**
 * One stair flight: the waist as an inclined slab, the treads as boxes on top.
 *
 * Drawn from `placeStair` — the same geometry the loads and the schedule are
 * built on, so the picture cannot show a stair the calculation does not have.
 * Translucent like the walls, because the flight is NOT in the analysis: it is
 * load on the two members it bears on, not stiffness in the frame.
 */
export function Stair3D({ p, style = 'solid' }: { p: PlacedStair; style?: SurfaceStyle }) {
  const geo = useMemo(() => {
    // The solid is worked out in `stairPlacement` — including the waist being
    // measured NORMAL to the soffit — so it can be checked without a renderer.
    const solid = flightSolid(p)
    const v = (a: readonly [number, number, number]) => new THREE.Vector3(a[0], a[1], a[2])
    const pos: number[] = []
    const quad = (...q: THREE.Vector3[]) => {
      for (const k of [0, 1, 2, 0, 2, 3]) pos.push(q[k].x, q[k].y, q[k].z)
    }
    const prism = (topQ: readonly [number, number, number][], botQ: readonly [number, number, number][]) => {
      const T = topQ.map(v), B = botQ.map(v)
      quad(...T)
      quad(B[3], B[2], B[1], B[0])
      for (let i = 0; i < 4; i++) quad(T[i], B[i], B[(i + 1) % 4], T[(i + 1) % 4])
    }
    prism(solid.top, solid.bottom)
    // The landings are the same slab, so they are the same geometry — a flight
    // that breaks on a beam is one piece of concrete with a flat bit at the end,
    // not a flight with something else stuck to it.
    for (const l of solid.landings) prism(l.top, l.bottom)
    const waist = new THREE.BufferGeometry()
    waist.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    waist.computeVertexNormals()

    // Treads: dead load sitting on the waist, not structure — which is why
    // they are separate geometry rather than part of the slab.
    const runDir = v(p.runDir), widthDir = v(p.widthDir)
    const basis = new THREE.Matrix4().makeBasis(runDir, new THREE.Vector3(0, 1, 0), widthDir)
    const steps = solid.steps.map((st) => {
      const box = new THREE.BoxGeometry(st.run, st.rise, st.width)
      box.applyMatrix4(basis)
      box.translate(
        st.at[0] + (runDir.x * st.run) / 2, st.at[1] + st.rise / 2, st.at[2] + (runDir.z * st.run) / 2,
      )
      return box
    })
    return { waist, steps }
  }, [p])
  return (
    <group>
      <mesh geometry={geo.waist}>
        <meshStandardMaterial key={surfaceKey(style)} color="#94a3b8"
          transparent opacity={style === 'wire' ? WIRE_OPACITY : 0.5}
          depthWrite={style === 'solid'} side={THREE.DoubleSide} roughness={0.8} />
        <WireEdges style={style} color="#64748b" />
      </mesh>
      {geo.steps.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial key={surfaceKey(style)} color="#cbd5e1"
            transparent opacity={style === 'wire' ? WIRE_OPACITY : 0.42}
            depthWrite={style === 'solid'} roughness={0.9} />
          <WireEdges style={style} color="#94a3b8" />
        </mesh>
      ))}
    </group>
  )
}

/** Animated mode-shape skeleton. Lines are updated imperatively in useFrame
 *  (no re-render per frame) to show sinusoidal oscillation of the given mode. */

/** Animated mode-shape skeleton. Lines are updated imperatively in useFrame
 *  (no re-render per frame) to show sinusoidal oscillation of the given mode. */
export function ModeShapePlayer({ shape, nodePos, members, amp }: {
  shape: Record<string, [number, number, number]>
  nodePos: Map<string, THREE.Vector3>
  members: { id: string; i: string; j: string }[]
  amp: number
}) {
  // Latest-value refs so `useFrame` reads the current amp/shape without the
  // animation restarting on every prop change. Written after commit — assigning
  // during render would make the render impure.
  const ampRef = useRef(amp)
  const shapeRef = useRef(shape)
  useEffect(() => { ampRef.current = amp; shapeRef.current = shape }, [amp, shape])

  const { group, lineGeos } = useMemo(() => {
    const g = new THREE.Group()
    const geos: { i: string; j: string; geo: THREE.BufferGeometry }[] = []
    for (const m of members) {
      const aO = nodePos.get(m.i), bO = nodePos.get(m.j)
      if (!aO || !bO) continue
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(
        new Float32Array([aO.x, aO.y, aO.z, bO.x, bO.y, bO.z]), 3))
      g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#7c3aed' })))
      geos.push({ i: m.i, j: m.j, geo })
    }
    return { group: g, lineGeos: geos }
  }, [members, nodePos])

  // Writes straight into the GPU buffers each frame. The geometries are
  // three.js objects owned by the renderer, not React state — re-rendering 60×
  // a second to animate a mode shape is exactly what this avoids.
  // eslint-disable-next-line react-hooks/immutability
  useFrame(({ clock }) => {
    const scale = ampRef.current * Math.sin(clock.elapsedTime * Math.PI * 1.2)
    const sh = shapeRef.current
    for (const { i, j, geo } of lineGeos) {
      const aO = nodePos.get(i), bO = nodePos.get(j)
      if (!aO || !bO) continue
      const da = sh[i], db = sh[j]
      const pos = geo.attributes.position as THREE.BufferAttribute
      pos.setXYZ(0, aO.x + (da?.[0] ?? 0) * scale, aO.y + (da?.[1] ?? 0) * scale, aO.z + (da?.[2] ?? 0) * scale)
      pos.setXYZ(1, bO.x + (db?.[0] ?? 0) * scale, bO.y + (db?.[1] ?? 0) * scale, bO.z + (db?.[2] ?? 0) * scale)
      // eslint-disable-next-line react-hooks/immutability
      pos.needsUpdate = true
    }
  })

  return <primitive object={group} />
}

// ── Member force diagrams (BMD / SFD / axial / torsion) ─────────────────────

export function MemberForceDiagram3D({ a, b, xs, ys, comp, scale }: {
  a: V3; b: V3; xs: number[]; ys: number[]; comp: DiagramComp; scale: number
}) {
  const { fillGeo, curveGeo } = useMemo(() => {
    const r = memberDiagramRibbon(a, b, xs, ys, comp, scale)
    const fillGeo = new THREE.BufferGeometry()
    fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(r.fill, 3))
    const curveGeo = new THREE.BufferGeometry().setFromPoints(
      r.curve.map((p) => new THREE.Vector3(p[0], p[1], p[2])))
    return { fillGeo, curveGeo }
  }, [a, b, xs, ys, comp, scale])
  const color = DIAG_COLOR[comp]
  return (
    <group>
      <mesh geometry={fillGeo}>
        <meshBasicMaterial color={color} transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <primitive object={new THREE.Line(curveGeo, new THREE.LineBasicMaterial({ color }))} />
    </group>
  )
}

// ── Load glyphs ─────────────────────────────────────────────────────────────

export function Arrow({ tip, dir, len, color }: { tip: THREE.Vector3; dir: THREE.Vector3; len: number; color: string }) {
  const helper = useMemo(() => {
    const d = dir.clone().normalize()
    const origin = tip.clone().addScaledVector(d, -len)        // tail, so the head sits at `tip`
    return new THREE.ArrowHelper(d, origin, len, new THREE.Color(color).getHex(),
      Math.min(0.35, len * 0.4), Math.min(0.2, len * 0.22))
  }, [tip, dir, len, color])
  return <primitive object={helper} />
}

// Colours for the tributary footprint by shape (= which beam carries it).

export function TribPoly({ pts, kind }: { pts: THREE.Vector3[]; kind: TribKind }) {
  const { fill, line } = useMemo(() => {
    const pos: number[] = []
    for (let k = 1; k < pts.length - 1; k++)
      pos.push(pts[0].x, pts[0].y, pts[0].z, pts[k].x, pts[k].y, pts[k].z, pts[k + 1].x, pts[k + 1].y, pts[k + 1].z)
    const fill = new THREE.BufferGeometry()
    fill.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    const line = new THREE.BufferGeometry().setFromPoints([...pts, pts[0]])
    return { fill, line }
  }, [pts])
  const color = TRIB_COLOR[kind]
  return (
    <group>
      <mesh geometry={fill}>
        <meshBasicMaterial color={color} transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <primitive object={new THREE.Line(line, new THREE.LineBasicMaterial({ color }))} />
    </group>
  )
}

/** Loading diagrams drawn on the elements: member UDL (a bar of arrows), member
 *  point loads, slab tributary footprints (triangle/trapezoid/rectangle) and
 *  node loads (E/W). */

/** Loading diagrams drawn on the elements: member UDL (a bar of arrows), member
 *  point loads, slab tributary footprints (triangle/trapezoid/rectangle) and
 *  node loads (E/W). */
export function Loads3D({ model, nodePos }: { model: StructuralModel; nodePos: Map<string, THREE.Vector3> }) {
  const DOWN = useMemo(() => new THREE.Vector3(0, -1, 0), [])
  // per-type magnitude maxima for gentle length scaling
  const max = { udl: 1e-9, point: 1e-9, area: 1e-9, node: 1e-9 }
  for (const l of model.loads) {
    if (l.kind === 'member-udl') max.udl = Math.max(max.udl, Math.abs(l.w))
    else if (l.kind === 'member-point') max.point = Math.max(max.point, Math.abs(l.P))
    else if (l.kind === 'area') max.area = Math.max(max.area, Math.abs(l.q))
    else if (l.kind === 'node') max.node = Math.max(max.node, Math.hypot(l.Fx ?? 0, l.Fy ?? 0, l.Fz ?? 0))
  }
  const lenOf = (mag: number, m: number) => 0.5 + 0.7 * Math.min(1, mag / m)   // 0.5–1.2 m

  const glyphs: ReactNode[] = []

  // slab tributary footprints — once per loaded plate (not per area load)
  const loadedPlates = new Set(model.loads.filter((l) => l.kind === 'area').map((l) => (l as { plate: string }).plate))
  for (const pid of loadedPlates) {
    const p = model.plates.find((pp) => pp.id === pid)
    const cs = p?.corners.map((c) => nodePos.get(c))
    if (!cs || cs.some((c) => !c)) continue
    slabTributaryPolys(cs as THREE.Vector3[]).forEach((poly, k) =>
      glyphs.push(<TribPoly key={`trib-${pid}-${k}`} pts={poly.pts} kind={poly.kind} />))
  }

  for (let i = 0; i < model.loads.length; i++) {
    const l = model.loads[i]
    const color = LOAD_COLOR[l.cat] ?? '#64748b'
    if (l.kind === 'member-udl') {
      const m = model.members.find((mm) => mm.id === l.member)
      const a = m && nodePos.get(m.i), b = m && nodePos.get(m.j)
      if (!a || !b) continue
      const len = lenOf(Math.abs(l.w), max.udl)
      const n = Math.max(2, Math.min(7, Math.round(a.distanceTo(b) / 0.8)))
      for (let k = 0; k <= n; k++) {
        const tip = a.clone().lerp(b, k / n)
        glyphs.push(<Arrow key={`u${i}-${k}`} tip={tip} dir={DOWN} len={len} color={color} />)
      }
      // bar joining the arrow tails
      const barA = a.clone().addScaledVector(UP, len), barB = b.clone().addScaledVector(UP, len)
      const geo = new THREE.BufferGeometry().setFromPoints([barA, barB])
      glyphs.push(<primitive key={`ub${i}`} object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color }))} />)
    } else if (l.kind === 'member-point') {
      const m = model.members.find((mm) => mm.id === l.member)
      const a = m && nodePos.get(m.i), b = m && nodePos.get(m.j)
      if (!a || !b) continue
      const tip = a.clone().lerp(b, Math.max(0, Math.min(1, l.t)))
      glyphs.push(<Arrow key={`p${i}`} tip={tip} dir={DOWN} len={lenOf(Math.abs(l.P), max.point)} color={color} />)
    } else if (l.kind === 'node') {
      const pos = nodePos.get(l.node)
      const dir = new THREE.Vector3(l.Fx ?? 0, l.Fy ?? 0, l.Fz ?? 0)
      if (!pos || dir.length() < 1e-9) continue
      glyphs.push(<Arrow key={`n${i}`} tip={pos.clone()} dir={dir} len={lenOf(dir.length(), max.node)} color={color} />)
    }
  }
  return <group>{glyphs}</group>
}
