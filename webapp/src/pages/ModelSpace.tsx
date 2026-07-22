import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import { generateGridModel, removeElements, removeNode, buildGravityLoads, splitSharedSections } from '../engine/modelBuilder'
import type { StructuralModel, Member, Plate, RectSection, ModelLoad, MemberRole, MemberReleases, NodeSupport, SupportFixity, WoodDeck } from '../engine/model'
import { distributePanel } from '../engine/tributary'
import { type F3Analysis, type F3MemberResult, type V3 } from '../engine/frame3d'
import { memberDiagramRibbon, diagramScale, type DiagramComp } from '../engine/memberDiagram3d'
import { validateMesh, hasMeshErrors } from '../engine/meshValidation'
import { type ModalResult } from '../engine/modal'
import { computeResponseSpectrum, rsaEquivalentLoads, type ResponseSpectrumResult, type RsaLateralResult } from '../engine/responseSpectrum'
import { type StructureDesign, type FootingPlan, type OptimizeResult, type LateralCase } from '../engine/pipeline'
import type { SteelJoint } from '../engine/steelConnections'
import { estimateTakeoff, costBill, type PriceList } from '../engine/takeoff'
import { footingLayout } from '../engine/footingLayout'
import { type ShellNode, type ShellElem, type ElementStress } from '../engine/shell'
import { solveModelShells, designModelSlabsFE, type SlabFEScheduleRow } from '../engine/shellModel'
import { useSolver } from '../lib/useSolver'
import type { SolveProgress } from '../engine/progress'
import { TABLE_204_1, TABLE_204_2, sdlItemKPa, sdlTotal, type SdlItem } from '../engine/deadLoads'
import { TABLE_205_1, TABLE_206 } from '../engine/liveLoads'
import type { ConcreteClass } from '../engine/quantities'
import { computeSeismic, buildECases, type SeismicResult, type DriftRow } from '../engine/seismic'
import { columnKFactors, type ColumnK } from '../engine/effectiveLength'
import { freqFromDeflection, dg11Walking, DG11_OCCUPANCY } from '../engine/floorVibration'
import { buildSeismicMass, GRAVITY } from '../engine/modal'
import { autoRigidOffsets } from '../engine/rigidEndZones'
import { computeWind, computeCladding, type WindResult, type WindEnclosure, type CladdingResult } from '../engine/wind'
import { LetterheadCard, type LetterheadState } from '../components/calc'
import { JointConnections3D } from '../components/JointConnections3D'
import { ConnectionDetail2D } from '../components/ConnectionDetail2D'
import { connectionRowSolution } from '../lib/connectionSolution'
import { WorkedSolution } from '../components/WorkedSolution'
import { ConstructionSchedule } from '../components/ConstructionSchedule'
import { beamSectionSolution, columnRowSolution, footingRowSolution, combinedRowSolution,
  woodBeamRowSolution, woodColumnRowSolution, woodSlabRowSolution } from '../lib/modelSpaceSolutions'
import { Diagram } from '../components/Diagram'
import { MemberForcesTable } from '../components/MemberForcesTable'
import { ReactionsPanel } from '../components/ReactionsPanel'
import { DisplacementTable } from '../components/DisplacementTable'
import { ValidationPanel } from '../components/ValidationPanel'
import { ModalPanel } from '../components/ModalPanel'
import { ResponseSpectrumPanel } from '../components/ResponseSpectrumPanel'
import { PushoverPanel } from '../components/PushoverPanel'
import type { PushoverModelResult } from '../engine/pushoverModel'
import { TimeHistoryPanel } from '../components/TimeHistoryPanel'
import { ShellContourPanel } from '../components/ShellContourPanel'
import { RecordedSpectrumPanel } from '../components/RecordedSpectrumPanel'
import { elasticResponseSpectrum, nscp208DesignCurve, type AccelSpectrum, type DesignSpectrumPoint } from '../engine/accelSpectrum'
import { parseAccelerogram } from '../engine/accelerogram'
import type { TimeHistoryModelResult, GroundMotionKind, CsvAccelerogramOpts } from '../engine/timeHistoryModel'
import { BeamSchematic } from '../components/BeamSchematic'
import { TSection } from '../components/TSection'
import { ColumnSchematic } from '../components/ColumnSchematic'
import { FootingSchematic } from '../components/FootingSchematic'
import { DimBelow, DimSide } from '../components/dims'
import { HintButton, SeismicHint, WindHint } from '../components/LoadHints'
import { Num, Pick, Row } from '../components/qty'
import { FitView } from '../components/FitView'
import { shapeByName, shapesOf, effectiveSection, sectionBoundingBox, FAMILIES, type SectionFamily } from '../engine/aiscSections'
import { WOOD_SPECIES, speciesList, gradesOf, resolveWoodSpecies, type WoodSpecies } from '../engine/woodDesign'
import { MaterialLibrary } from '../components/MaterialLibrary'
import { loadCustomMaterials, saveCustomMaterials, type CustomMaterial } from '../lib/materialLibrary'
import { buildSectionShapes } from '../lib/sectionShapes3d'
import { SectionShape } from '../components/SectionShape'
import { f0, f1, f2 } from '../lib/format'

/** A sensible default timber deck (DFL No.2 joists 50×200 @ 400, 25 mm plank). */
const DEFAULT_DECK: WoodDeck = {
  joistSpecies: 'DFL-2', joistKind: 'sawn', joistB: 50, joistD: 200, joistSpacing: 400,
  joistSupport: 'simple', deckMaterial: 'plank', deckThickness: 25, deckSupport: 'continuous',
}

const AUTOSAVE_KEY = 'model-space-autosave'
const INPUTS_KEY = 'model-space-inputs'


/** The design inputs persisted alongside the autosaved model so a reload keeps
 *  the Geometry/Properties/Loading/etc. fields consistent with the 3D model
 *  (soil, seismic, wind & γc aren't part of the model, so they'd otherwise reset
 *  to defaults while the model stays loaded). */
function loadInputs(): Record<string, unknown> {
  try { const raw = sessionStorage.getItem(INPUTS_KEY); return raw ? JSON.parse(raw) as Record<string, unknown> : {} }
  catch { return {} }
}

const ROLE_COLOR: Record<string, string> = {
  column: '#475569', beam: '#0f4c92', girder: '#0e7490',
}
const SEL = '#f59e0b'

// Load-diagram colours by NSCP category (dead, live, wind, seismic, …).
const LOAD_COLOR: Record<string, string> = {
  D: '#64748b', L: '#15803d', Lr: '#15803d', S: '#0891b2', R: '#0891b2', W: '#0ea5e9', E: '#7c3aed',
}

const parseList = (s: string): number[] =>
  s.split(/[, ]+/).map(parseFloat).filter((v) => Number.isFinite(v) && v > 0)

/** Distributed load along a member derived from the shear, w ≈ −dV/dx
 *  (central difference; one-sided at the ends so a UDL reads flat). */
const loadFromShear = (xs: number[], Vy: number[]): number[] =>
  xs.map((_, i) => {
    const lo = Math.max(0, i - 1), hi = Math.min(xs.length - 1, i + 1)
    const dx = xs[hi] - xs[lo]
    return dx !== 0 ? -(Vy[hi] - Vy[lo]) / dx : 0
  })

// ── 3D primitives ─────────────────────────────────────────────────────────
function Member3D({ a, b, role, selected, tint = 0, sec, onPick }: {
  a: THREE.Vector3; b: THREE.Vector3; role: string; selected: boolean
  /** 0–1 utilisation tint (|M| relative to the model max) after analysis. */
  tint?: number
  /** the member's own section, drawn to scale (mm → m). */
  sec?: { b: number; h: number; material?: string }
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
  const color = useMemo(() => {
    if (selected) return SEL
    const base = new THREE.Color(ROLE_COLOR[role] ?? '#64748b')
    if (sec?.material === 'wood') base.lerp(new THREE.Color('#a86b34'), 0.6)   // timber brown tint
    return tint > 0 ? `#${base.lerp(new THREE.Color('#dc2626'), tint).getHexString()}` : `#${base.getHexString()}`
  }, [selected, role, tint, sec?.material])
  return (
    <mesh position={mid} quaternion={quat}
      onClick={(e) => { e.stopPropagation(); onPick() }}>
      <boxGeometry args={[len, ty, tz]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

/** Rigid end-offset arm: a thin purple stub from a node to its (offset) member end. */
function RigidArm3D({ a, b }: { a: THREE.Vector3; b: THREE.Vector3 }) {
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

/** Steel member drawn as its true AISC cross-section, extruded along the member
 *  axis (i→j). The profile is built in the local XY plane then oriented so its
 *  extrude (+Z) runs along the member and its strong axis (depth d) stays
 *  vertical for beams/girders. Falls back to the box Member3D if the shape is
 *  unknown. */
function MemberSteel3D({ a, b, role, shapeName, selected, tint = 0, axisRotation, onPick }: {
  a: THREE.Vector3; b: THREE.Vector3; role: string; shapeName: string
  selected: boolean; tint?: number
  /** Explicit local-axis rotation (°). Absent ⇒ the role default (columns 90). */
  axisRotation?: number
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
    return { shapes, quat, pos: a.clone(), len }
  }, [a, b, shapeName, role, axisRotation])

  const color = useMemo(() => {
    if (selected) return SEL
    const base = new THREE.Color('#64748b')   // steel grey
    return tint > 0 ? `#${base.lerp(new THREE.Color('#dc2626'), tint).getHexString()}` : `#${base.getHexString()}`
  }, [selected, tint])

  if (shapes.length === 0) {
    return <Member3D a={a} b={b} role={role} selected={selected} tint={tint} onPick={onPick} />
  }
  return (
    <group position={pos} quaternion={quat} onClick={(e) => { e.stopPropagation(); onPick() }}>
      {shapes.map((sh, i) => (
        <mesh key={i}>
          <extrudeGeometry args={[sh, { depth: len, bevelEnabled: false, steps: 1 }]} />
          <meshStandardMaterial color={color} metalness={0.35} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

function Slab3D({ corners, selected, shell, deck, onPick }: {
  corners: THREE.Vector3[]; selected: boolean; shell?: boolean; deck?: WoodDeck; onPick: () => void
}) {
  const { mid, sx, sz } = useMemo(() => {
    const mid = corners.reduce((s, c) => s.add(c.clone()), new THREE.Vector3()).multiplyScalar(0.25)
    const sx = Math.abs(corners[1].x - corners[0].x) || Math.abs(corners[2].x - corners[0].x)
    const sz = Math.abs(corners[3].z - corners[0].z) || Math.abs(corners[2].z - corners[0].z)
    return { mid, sx, sz }
  }, [corners])

  // Timber deck: joist lines spanning the shorter edge, repeated at the joist
  // spacing along the longer edge (matching the woodSlab design), drawn just
  // above a faint wood-tinted panel so the deck-on-joist framing is visible.
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
      pts.push(b.x, b.y + 0.11, b.z, e.x, e.y + 0.11, e.z)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [deck, shell, corners])

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
        <mesh position={[mid.x, mid.y + 0.05, mid.z]}>
          <boxGeometry args={[sx * 0.96, 0.06, sz * 0.96]} />
          <meshStandardMaterial color={selected ? SEL : '#c8a06a'} transparent opacity={selected ? 0.6 : 0.3} />
        </mesh>
        <lineSegments geometry={deckGeo}>
          <lineBasicMaterial color={selected ? SEL : '#7a4a1e'} />
        </lineSegments>
      </group>
    )
  }

  return (
    <mesh position={[mid.x, mid.y + 0.05, mid.z]}
      onClick={(e) => { e.stopPropagation(); onPick() }}>
      <boxGeometry args={[sx * 0.96, 0.1, sz * 0.96]} />
      <meshStandardMaterial color={selected ? SEL : '#7ba6d4'} transparent opacity={selected ? 0.85 : 0.45} />
    </mesh>
  )
}

/** Live solver-progress card: phase, detail, and a determinate (current/total)
 *  or indeterminate bar. Renders nothing when idle. */
function SolverProgress({ p }: { p: SolveProgress | null }) {
  if (!p) return null
  const pct = p.total && p.current ? Math.min(100, Math.round((p.current / p.total) * 100)) : null
  return (
    <div className="col-span-full rounded-lg border border-[#0f4c92]/30 bg-blue-50/60 p-2.5">
      <div className="flex items-center justify-between text-[11px] font-semibold text-[#0f4c92]">
        <span>⏳ {p.phase}</span>
        <span className="tabular-nums text-slate-500">
          {p.total && p.current ? `${p.current} / ${p.total}` : ''}{pct !== null ? ` · ${pct}%` : ''}
        </span>
      </div>
      {p.detail && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-600">
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#0f4c92] opacity-70" />
          <span className="truncate font-mono">{p.detail}</span>
        </div>
      )}
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
        {pct !== null
          ? <div className="h-full rounded-full bg-[#0f4c92] transition-all duration-150" style={{ width: `${pct}%` }} />
          : <div className="h-full w-1/3 animate-pulse rounded-full bg-[#0f4c92]" />}
      </div>
    </div>
  )
}

function Support3D({ p }: { p: THREE.Vector3 }) {
  return (
    <mesh position={[p.x, p.y - 0.22, p.z]}>
      <coneGeometry args={[0.28, 0.45, 4]} />
      <meshStandardMaterial color="#0f4c92" />
    </mesh>
  )
}

/** A labelled bubble (white disc + ring + letter/number) lying flat on the floor
 *  at the end of a grid line, ETABS-style. */
function AxisBubble({ x, y, z, r, label }: { x: number; y: number; z: number; r: number; label: string }) {
  return (
    <group position={[x, y + 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh><circleGeometry args={[r, 40]} /><meshBasicMaterial color="#ffffff" /></mesh>
      <mesh position={[0, 0, 0.001]}><ringGeometry args={[r * 0.94, r, 40]} /><meshBasicMaterial color="#475569" /></mesh>
      <Text position={[0, 0, 0.004]} fontSize={r * 0.95} color="#1e293b" anchorX="center" anchorY="middle">{label}</Text>
    </group>
  )
}

/** ETABS-style plan grid on the floor: column lines (A, B, …) parallel to Z and
 *  rows (1, 2, …) parallel to X, derived from the unique node coordinates. Bubbles
 *  sit 3 m off the top (letters) and left (numbers) edges only; a dimension line 2 m
 *  off each edge — with 45° architectural ticks and the bay spacing (m) sitting above
 *  the line — reports the bay widths. Flat on the base plane (1 m = one floor square). */
function GridBubbles3D({ model }: { model: StructuralModel }) {
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
        <Text key={`dx${i}`} position={[d.mid, g.y0 + 0.03, g.zDim - tOff]} rotation={[-Math.PI / 2, 0, 0]}
          fontSize={dimFont} color="#475569" anchorX="center" anchorY="middle">{`${d.val.toFixed(2)} m`}</Text>
      ))}
      {/* bay dimensions down the left (Z), text above the line */}
      {g.zDims.map((d, i) => (
        <Text key={`dz${i}`} position={[g.xDim - tOff, g.y0 + 0.03, d.mid]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}
          fontSize={dimFont} color="#475569" anchorX="center" anchorY="middle">{`${d.val.toFixed(2)} m`}</Text>
      ))}
    </group>
  )
}

/** A designed footing drawn to ACTUAL plan size below grade, so overlapping
 *  footprints are visible. bx/bz = plan dimensions (m), dc = depth (m), angle =
 *  plan rotation about Y (combined footings follow the column axis). Overlapping
 *  footings are tinted red. */
function Footing3D({ cx, cz, bx, bz, dc, angle = 0, overlap = false, label }: {
  cx: number; cz: number; bx: number; bz: number; dc: number; angle?: number; overlap?: boolean; label?: string
}) {
  return (
    <group position={[cx, -dc / 2, cz]} rotation={[0, -angle, 0]}>
      <mesh>
        <boxGeometry args={[bx, dc, bz]} />
        <meshStandardMaterial color={overlap ? '#dc2626' : '#b45309'} transparent opacity={overlap ? 0.6 : 0.45} />
      </mesh>
      {label && (
        <Text position={[0, dc / 2 + 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.32}
          color={overlap ? '#991b1b' : '#7c2d12'} anchorX="center" anchorY="middle" outlineWidth={0.012} outlineColor="#ffffff">
          {label}
        </Text>
      )}
    </group>
  )
}

/** Wall panel between the beam nodes (tA,tB) and the nodes below (bA,bB).
 *  Shear walls show the equivalent X-strut; gravity walls are a plain panel. */
function Wall3D({ tA, tB, bA, bB, shear }: { tA: THREE.Vector3; tB: THREE.Vector3; bA: THREE.Vector3; bB: THREE.Vector3; shear: boolean }) {
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

/** Animated mode-shape skeleton. Lines are updated imperatively in useFrame
 *  (no re-render per frame) to show sinusoidal oscillation of the given mode. */
function ModeShapePlayer({ shape, nodePos, members, amp }: {
  shape: Record<string, [number, number, number]>
  nodePos: Map<string, THREE.Vector3>
  members: { id: string; i: string; j: string }[]
  amp: number
}) {
  const ampRef = useRef(amp)
  ampRef.current = amp
  const shapeRef = useRef(shape)
  shapeRef.current = shape

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
      pos.needsUpdate = true
    }
  })

  return <primitive object={group} />
}

// ── Member force diagrams (BMD / SFD / axial / torsion) ─────────────────────
const DIAG_COLOR: Record<DiagramComp, string> = {
  Mz: '#d62728', My: '#ea580c', Vy: '#1f77b4', Vz: '#0e7490', N: '#7c3aed', T: '#b45309',
}
const DIAG_LABEL: Record<DiagramComp, string> = {
  Mz: 'Mz', My: 'My', Vy: 'Vy', Vz: 'Vz', N: 'N', T: 'T',
}

/** Inline 3D internal-force diagram drawn directly on one member. */
function MemberForceDiagram3D({ a, b, xs, ys, comp, scale }: {
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
const UP = new THREE.Vector3(0, 1, 0)
/** A single force arrow with its head at `tip`, drawn back along −`dir`. */
function Arrow({ tip, dir, len, color }: { tip: THREE.Vector3; dir: THREE.Vector3; len: number; color: string }) {
  const helper = useMemo(() => {
    const d = dir.clone().normalize()
    const origin = tip.clone().addScaledVector(d, -len)        // tail, so the head sits at `tip`
    return new THREE.ArrowHelper(d, origin, len, new THREE.Color(color).getHex(),
      Math.min(0.35, len * 0.4), Math.min(0.2, len * 0.22))
  }, [tip, dir, len, color])
  return <primitive object={helper} />
}

// Colours for the tributary footprint by shape (= which beam carries it).
const TRIB_COLOR = { triangle: '#0e7490', trapezoid: '#0f4c92', rect: '#15803d' } as const
type TribKind = keyof typeof TRIB_COLOR

/** Tributary footprint of a slab on its edge beams: 45° triangles (short
 *  edges) + trapezoids (long edges) for two-way panels, or two rectangles for
 *  one-way (long/short ≥ 2). Returned as filled polygons just above the slab. */
function slabTributaryPolys(c: THREE.Vector3[]): { pts: THREE.Vector3[]; kind: TribKind }[] {
  const O = c[0]
  const e1 = c[1].clone().sub(c[0]), e3 = c[3].clone().sub(c[0])
  const d1 = e1.length(), d3 = e3.length()
  const longAlong1 = d1 >= d3
  const U = (longAlong1 ? e1 : e3).clone().normalize()
  const V = (longAlong1 ? e3 : e1).clone().normalize()
  const L = Math.max(d1, d3), S = Math.min(d1, d3)
  const lift = new THREE.Vector3(0, 0.13, 0)
  const P = (u: number, v: number) => O.clone().addScaledVector(U, u).addScaledVector(V, v).add(lift)
  if (L / Math.max(S, 1e-9) >= 2) {
    const h = S / 2   // one-way: split between the two long edges
    return [
      { kind: 'rect', pts: [P(0, 0), P(L, 0), P(L, h), P(0, h)] },
      { kind: 'rect', pts: [P(0, h), P(L, h), P(L, S), P(0, S)] },
    ]
  }
  const m = S / 2     // two-way: 45° tributary
  return [
    { kind: 'triangle', pts: [P(0, 0), P(0, S), P(m, m)] },
    { kind: 'triangle', pts: [P(L, 0), P(L - m, m), P(L, S)] },
    { kind: 'trapezoid', pts: [P(0, 0), P(L, 0), P(L - m, m), P(m, m)] },
    { kind: 'trapezoid', pts: [P(0, S), P(m, m), P(L - m, m), P(L, S)] },
  ]
}

function TribPoly({ pts, kind }: { pts: THREE.Vector3[]; kind: TribKind }) {
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
function Loads3D({ model, nodePos }: { model: StructuralModel; nodePos: Map<string, THREE.Vector3> }) {
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

const LAT_DIRS = ['+X', '-X', '+Z', '-Z']
/** Multi-select of lateral directions to envelope (+X/−X/+Z/−Z). */
function DirPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (d: string) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d])
  return (
    <div className="col-span-full flex flex-col text-sm">
      <span className="mb-1 font-medium text-slate-600">Directions to envelope</span>
      <div className="flex gap-1.5">
        {LAT_DIRS.map((d) => (
          <label key={d} className={`inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-0.5 text-xs ${value.includes(d) ? 'border-[#0f4c92] bg-blue-50 text-[#0f4c92]' : 'border-slate-200 text-slate-500'}`}>
            <input type="checkbox" className="sr-only" checked={value.includes(d)} onChange={() => toggle(d)} />{d}
          </label>
        ))}
      </div>
    </div>
  )
}

// ── Right-panel tabs ────────────────────────────────────────────────────────
type Tab = 'geometry' | 'properties' | 'supports' | 'loading' | 'analysis' | 'modal' | 'pushover' | 'design'
const TABS: { id: Tab; label: string }[] = [
  { id: 'geometry', label: 'Geometry' },
  { id: 'properties', label: 'Properties' },
  { id: 'supports', label: 'Supports' },
  { id: 'loading', label: 'Loading' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'modal', label: 'Modal' },
  { id: 'pushover', label: 'Pushover' },
  { id: 'design', label: 'Design' },
]
/** Flat panel section (3D Model Space mockup): uppercase mini-title, no card
 *  chrome — hairline separation comes from the parent's divide-y. */
function Sec({ title, hint, grid = true, children }: {
  title: ReactNode; hint?: ReactNode; grid?: boolean; children: ReactNode
}) {
  return (
    <section className="py-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#a39d8d]">{title}</p>
        {hint && <span className="text-[10.5px] text-[#a39d8d]">{hint}</span>}
      </div>
      {grid ? <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">{children}</div> : children}
    </section>
  )
}
function TabBtn({ id, label, active, onClick }: { id: Tab; label: string; active: boolean; onClick: (t: Tab) => void }) {
  return (
    <button type="button" onClick={() => onClick(id)}
      className={`rounded-[5px] px-2.5 py-[5px] text-[11.5px] font-semibold transition ${active ? 'bg-[#0f4c92] text-white' : 'text-[#5c6675] hover:bg-[#eaf1f9] hover:text-[#0f1b2a]'}`}>
      {label}
    </button>
  )
}

/** Pass/fail pill for a schedule title — "all passed" (green) or "n failed"
 *  (red). `items` are the rows, `ok` maps a row to its verdict. */
function SchedChip<T>({ items, ok }: { items: T[]; ok: (r: T) => boolean }) {
  const failed = items.reduce((n, r) => n + (ok(r) ? 0 : 1), 0)
  const good = failed === 0
  return (
    <span className={`ml-2 inline-block rounded px-1.5 py-px align-middle font-mono text-[10px] font-semibold ${
      good ? 'bg-[#ddefe3] text-[#14603a]' : 'bg-[#fbeeea] text-[#c2402a]'}`}>
      {good ? 'all passed' : `${failed} failed`}
    </span>
  )
}

// ── Element drawings for the schedule accordions ─────────────────────────────
/** Rebar elevation of a beam/girder: outline, stirrup ticks, top steel over the
 *  hogging ends and bottom steel over the sagging mid-span. */
function BeamRebarElevation({ L, h, sections }: {
  L: number; h: number; sections: { x: number; hogging: boolean; design: { bars: number; sAdopt: number } }[]
}): ReactNode {
  // viewBox width matches BeamSchematic (330) so text renders the same size.
  const W = 330, padL = 44, padR = 18, top = 22, bh = 62
  const x0 = padL, x1 = W - padR, yTop = top, yBot = top + bh
  const dimY = yBot + 22, H = dimY + 14
  const sx = (x: number) => x0 + (x1 - x0) * (L > 0 ? Math.max(0, Math.min(1, x / L)) : 0)
  const sList = sections.map((s) => s.design.sAdopt).filter((v) => v > 0)
  const sm = sList.length ? Math.min(...sList) / 1000 : 0
  const nStir = sm > 0 ? Math.min(40, Math.max(2, Math.round(L / sm))) : 0
  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <text x={x0} y={13} fontSize={11} fontWeight={700} fill="#0f4c92">ELEVATION — rebar{sm > 0 ? ` (stirrups @${Math.round(sm * 1000)})` : ''}</text>
      <rect x={x0} y={yTop} width={x1 - x0} height={bh} fill="#fff" stroke="#37526e" strokeWidth={1.4} />
      {Array.from({ length: nStir + 1 }, (_, k) => {
        const x = sx((L * k) / Math.max(nStir, 1))
        return <line key={k} x1={x} y1={yTop + 4} x2={x} y2={yBot - 4} stroke="#94a3b8" strokeWidth={0.7} />
      })}
      {sections.map((s, i) => {
        const y = s.hogging ? yTop + 7 : yBot - 7
        const c = sx(s.x), half = (x1 - x0) * (s.hogging ? 0.16 : 0.3)
        const xa = Math.max(x0 + 3, c - half), xb = Math.min(x1 - 3, c + half)
        return (
          <g key={i}>
            <line x1={xa} y1={y} x2={xb} y2={y} stroke="#dc2626" strokeWidth={2} />
            <text x={(xa + xb) / 2} y={s.hogging ? y - 3 : y + 9} fontSize={8.5} fill="#dc2626" textAnchor="middle">
              {s.design.bars}⌀ {s.hogging ? 'top' : 'bot'}
            </text>
          </g>
        )
      })}
      <DimBelow xA={x0} xB={x1} featY={yBot} dY={dimY} label={`L = ${L} m`} />
      <DimSide yA={yTop} yB={yBot} featX={x0} dX={x0 - 16} label={`h = ${h}`} side="left" />
    </svg>
  )
}

/** Rebar elevation of a column, drawn to scale (height ∝ Lh, width ∝ b), with
 *  longitudinal bars, ties at spacing and dimension lines. viewBox width
 *  matches ColumnSchematic (320) so its text matches the section below it. */
function ColumnElevation({ Lh, b, barDia, tieDia, bars, tieSpacing }: { Lh: number; b: number; barDia: number; tieDia: number; bars: number; tieSpacing: number }): ReactNode {
  const W = 320, top = 24, availH = 230
  const scl = availH / Math.max(Lh, 0.5)                 // px per metre
  const colW = Math.max(30, (b / 1000) * scl)            // to scale with height
  const cx = W * 0.46, x0 = cx - colW / 2, x1 = cx + colW / 2, y0 = top, y1 = top + availH
  const dimY = y1 + 20, H = dimY + 16
  const sm = tieSpacing / 1000
  const n = sm > 0 ? Math.min(40, Math.max(2, Math.round(Lh / sm))) : 0
  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <text x={12} y={14} fontSize={11} fontWeight={700} fill="#0f4c92">ELEVATION — {bars}⌀{barDia} · ties ⌀{tieDia} @{Math.round(tieSpacing)} mm</text>
      <rect x={x0} y={y0} width={colW} height={availH} fill="#fff" stroke="#37526e" strokeWidth={1.4} />
      <line x1={x0 + 6} y1={y0} x2={x0 + 6} y2={y1} stroke="#dc2626" strokeWidth={1.6} />
      <line x1={x1 - 6} y1={y0} x2={x1 - 6} y2={y1} stroke="#dc2626" strokeWidth={1.6} />
      {Array.from({ length: n + 1 }, (_, k) => {
        const y = y0 + (availH * k) / n
        return <line key={k} x1={x0 + 3} y1={y} x2={x1 - 3} y2={y} stroke="#94a3b8" strokeWidth={0.7} />
      })}
      <DimSide yA={y0} yB={y1} featX={x0} dX={x0 - 14} label={`H = ${Lh} m`} side="left" />
      <DimBelow xA={x0} xB={x1} featY={y1} dY={dimY} label={`b = ${b} mm`} />
    </svg>
  )
}

/** W-shape cross-section SVG: top flange + web + bottom flange, scaled to fit
 *  a fixed viewbox so all dimensions are labelled. d/bf/tf/tw all in mm. */
function WShapeSection({ shape, d, bf, tf, tw }: { shape: string; d: number; bf: number; tf: number; tw: number }): ReactNode {
  const VW = 200, VH = 200
  const pad = 28          // room for labels
  const scale = Math.min((VW - pad * 2) / bf, (VH - pad * 2) / d)
  const sw = bf * scale   // scaled width
  const sh = d * scale    // scaled height
  const stf = tf * scale  // flange thickness
  const stw = tw * scale  // web thickness
  const x0 = (VW - sw) / 2, y0 = (VH - sh) / 2
  const webX = (VW - stw) / 2
  const textStyle = { fontSize: 9, fontFamily: 'Arial, sans-serif', fill: '#334155' }
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} xmlns="http://www.w3.org/2000/svg"
      style={{ width: 200, height: 200 }}>
      {/* label */}
      <text x={VW / 2} y={10} textAnchor="middle" fontSize={10} fontWeight={700} fill="#0f4c92" fontFamily="Arial, sans-serif">{shape}</text>
      {/* top flange */}
      <rect x={x0} y={y0} width={sw} height={stf} fill="#bfdbfe" stroke="#0f4c92" strokeWidth={0.8} />
      {/* web */}
      <rect x={webX} y={y0 + stf} width={stw} height={sh - 2 * stf} fill="#dbeafe" stroke="#0f4c92" strokeWidth={0.8} />
      {/* bottom flange */}
      <rect x={x0} y={y0 + sh - stf} width={sw} height={stf} fill="#bfdbfe" stroke="#0f4c92" strokeWidth={0.8} />
      {/* bf dim arrow */}
      <line x1={x0} y1={VH - 10} x2={x0 + sw} y2={VH - 10} stroke="#64748b" strokeWidth={0.8} markerStart="url(#arr)" markerEnd="url(#arr)" />
      <text x={VW / 2} y={VH - 2} textAnchor="middle" {...textStyle}>bf={Math.round(bf)} mm</text>
      {/* d dim arrow */}
      <line x1={VW - 10} y1={y0} x2={VW - 10} y2={y0 + sh} stroke="#64748b" strokeWidth={0.8} />
      <text x={VW - 2} y={(y0 + y0 + sh) / 2} textAnchor="middle" {...textStyle} transform={`rotate(-90,${VW - 2},${(y0 + y0 + sh) / 2})`}>d={Math.round(d)} mm</text>
      {/* tf label */}
      <text x={x0 - 2} y={y0 + stf / 2 + 3} textAnchor="end" {...textStyle}>tf={tf.toFixed(1)} mm</text>
      {/* tw label */}
      <text x={webX - 2} y={(VH) / 2 + 3} textAnchor="end" {...textStyle}>tw={tw.toFixed(1)} mm</text>
      {/* arrow marker def */}
      <defs>
        <marker id="arr" markerWidth={4} markerHeight={4} refX={2} refY={2} orient="auto">
          <path d="M4,0 L0,2 L4,4" fill="none" stroke="#64748b" strokeWidth={0.8} />
        </marker>
      </defs>
    </svg>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function ModelSpace() {
  // design inputs restored from the last session (so they match the autosaved
  // 3D model after a reload), with the factory defaults as fallback.
  const [si] = useState(loadInputs)
  const n = (k: string, d: number) => (typeof si[k] === 'number' ? si[k] as number : d)
  const s = (k: string, d: string) => (typeof si[k] === 'string' ? si[k] as string : d)
  const b = (k: string, d: boolean) => (typeof si[k] === 'boolean' ? si[k] as boolean : d)

  const [baysX, setBaysX] = useState(s('baysX', '6, 6'))
  const [baysZ, setBaysZ] = useState(s('baysZ', '5'))
  const [storeyH, setStoreyH] = useState(s('storeyH', '3.5, 3'))
  // Per-role initial sizes (column ≥ girder ≥ beam to start the hierarchy satisfied).
  const [colB, setColB] = useState(n('colB', 400)); const [colH, setColH] = useState(n('colH', 400))
  const [girB, setGirB] = useState(n('girB', 300)); const [girH, setGirH] = useState(n('girH', 500))
  const [beaB, setBeaB] = useState(n('beaB', 250)); const [beaH, setBeaH] = useState(n('beaH', 450))
  // Concrete & reinforcement (shared material applied to every generated section)
  const [fc, setFc] = useState(n('fc', 28)); const [fy, setFy] = useState(n('fy', 415))
  const [barDia, setBarDia] = useState(n('barDia', 20)); const [tieDia, setTieDia] = useState(n('tieDia', 10))
  const [cover, setCover] = useState(n('cover', 40)); const [slabThk, setSlabThk] = useState(n('slabThk', 150))
  // Prestressing (applied to beam/girder sections as RectSection.ps)
  const [psOn, setPsOn] = useState(false)
  const [psAps, setPsAps] = useState(600); const [psFpu, setPsFpu] = useState(1860)
  const [psE, setPsE] = useState(150); const [psFci, setPsFci] = useState(24)
  const [gammaC, setGammaC] = useState(n('gammaC', 24))            // concrete unit weight, kN/m³
  // Material: 'concrete' (RC), 'steel' (AISC W-shapes) or 'wood' (timber) for the frame members.
  const [material, setMaterial] = useState<'concrete' | 'steel' | 'wood'>((si.material as 'concrete' | 'steel' | 'wood') ?? 'concrete')
  // Timber (wood frame): species/grade, sawn vs glulam, wet service.
  // Timber material as separate species + grade (migrating any legacy composite id).
  const legacyWood = WOOD_SPECIES[s('woodSpecies', 'DFL-2')]
  const [woodSpeciesId, setWoodSpeciesId] = useState(s('woodSpeciesId', legacyWood?.species ?? 'DFL'))
  const [woodGrade, setWoodGrade] = useState(s('woodGrade', legacyWood?.grade ?? '2'))
  const [woodWet, setWoodWet] = useState(b('woodWet', false))
  const woodSel: WoodSpecies = resolveWoodSpecies(woodSpeciesId, woodGrade) ?? gradesOf(woodSpeciesId)[0] ?? WOOD_SPECIES['DFL-2']
  // Timber material source: built-in library vs a user-defined custom material.
  const [matSource, setMatSource] = useState<'library' | 'custom'>((s('matSource', 'library')) as 'library' | 'custom')
  const [customId, setCustomId] = useState(s('customId', ''))
  const [customMaterials, setCustomMaterials] = useState<CustomMaterial[]>(() => loadCustomMaterials())
  const customAsSpecies = (cm: CustomMaterial): WoodSpecies =>
    ({ id: cm.id, label: cm.name, kind: cm.kind, ref: cm.ref, species: cm.id, speciesLabel: cm.name, grade: 'custom', gradeLabel: 'Custom', origin: 'custom' })
  const selectedCustom = customMaterials.find((m) => m.id === customId)
  const activeWood: WoodSpecies = matSource === 'custom' && selectedCustom ? customAsSpecies(selectedCustom) : woodSel
  const woodKind = activeWood.kind
  const [colFam, setColFam] = useState<SectionFamily>((s('colFam', 'W')) as SectionFamily)
  const [girFam, setGirFam] = useState<SectionFamily>((s('girFam', 'W')) as SectionFamily)
  const [beaFam, setBeaFam] = useState<SectionFamily>((s('beaFam', 'W')) as SectionFamily)
  const [colShape, setColShape] = useState(s('colShape', 'W310x79'))
  const [girShape, setGirShape] = useState(s('girShape', 'W360x51'))
  const [beaShape, setBeaShape] = useState(s('beaShape', 'W310x38.7'))
  const [steelFy, setSteelFy] = useState(n('steelFy', 345)); const [steelFu, setSteelFu] = useState(n('steelFu', 448))
  const [qD, setQD] = useState(n('qD', 4.8)); const [qL, setQL] = useState(n('qL', 2.4))
  // Soil (for the footing stage of the design pipeline)
  const [qa, setQa] = useState(n('qa', 200)); const [Hf, setHf] = useState(n('Hf', 1.5))
  const [gammaSoil, setGammaSoil] = useState(n('gammaSoil', 18))      // soil unit weight (overburden), kN/m³
  // Seismic (NSCP 208 static lateral force)
  const [Ca, setCa] = useState(n('Ca', 0.44)); const [Cv, setCv] = useState(n('Cv', 0.64))
  const [Rw, setRw] = useState(n('Rw', 8.5)); const [Ie, setIe] = useState(n('Ie', 1.0))
  const [Zf, setZf] = useState(n('Zf', 0.4)); const [Nv, setNv] = useState(n('Nv', 1.0))   // Zone factor + near-source (208-11)
  const [eDirs, setEDirs] = useState<string[]>((si.eDirs as string[]) ?? ['+X', '-X', '+Z', '-Z'])  // directional E cases to envelope
  // §208 static results per axis (they differ when Method-B periods differ per axis)
  const [seisXZ, setSeisXZ] = useState<{ x: SeismicResult; z: SeismicResult } | null>(null)
  const [methodB, setMethodB] = useState(b('methodB', true))          // §208.5.2.2 analytical period (needs a modal run)
  const [accTor, setAccTor] = useState(b('accTor', true))             // §208.7.2.7 accidental torsion ±5% E-case variants
  const [orth30, setOrth30] = useState(b('orth30', false))           // §208.8.1 orthogonal 100%+30% E cases
  const [evOn, setEvOn] = useState(b('evOn', true))                   // §208.4.1 vertical component Ev = 0.5·Ca·I·D
  const [rsaRegular, setRsaRegular] = useState(b('rsaRegular', true)) // §208.6.4.2 floors: 0.9·V_B & 0.8·V_A vs 1.0·V_B
  const [rsaGen, setRsaGen] = useState<{ x: RsaLateralResult; z: RsaLateralResult } | null>(null)   // RSA-derived E cases
  const [drift, setDrift] = useState<DriftRow[] | null>(null)
  // Wind (NSCP 207B directional procedure, MWFRS)
  const [Vw, setVw] = useState(n('Vw', 50)); const [expo, setExpo] = useState<'B' | 'C' | 'D'>((si.expo as 'B' | 'C' | 'D') ?? 'C')
  const [Kzt, setKzt] = useState(n('Kzt', 1.0))
  const [wDirs, setWDirs] = useState<string[]>((si.wDirs as string[]) ?? ['+X', '-X', '+Z', '-Z'])  // directional W cases
  const [wind, setWind] = useState<WindResult | null>(null)
  const [ccArea, setCcArea] = useState(1.0)   // C&C effective wind area, m²
  const [ccEncl, setCcEncl] = useState<WindEnclosure>('enclosed')
  const [cladding, setCladding] = useState<CladdingResult | null>(null)
  const [eCases, setECases] = useState<LateralCase[]>([])
  const [wCases, setWCases] = useState<LateralCase[]>([])
  // Analysis options: f₁ live-load factor (§203.3.1) and P-Δ second order
  const [assembly, setAssembly] = useState(b('assembly', false))
  const [pDelta, setPDelta] = useState(b('pDelta', false))
  const [cracked, setCracked] = useState(b('cracked', true))       // ACI §6.6.3.1.1 cracked EI (0.35/0.70 Ig)
  const [shearDef, setShearDef] = useState(b('shearDef', true))    // Timoshenko shear deformation (deep girders / squat columns)
  const [allAround, setAllAround] = useState(b('allAround', true)) // column P–M bars on all four faces
  const [tBeamOn, setTBeamOn] = useState(b('tBeamOn', true))       // §6.3.2 flanged sagging design
  const [tryBars, setTryBars] = useState(b('tryBars', true))        // let design/optimize pick bar Ø from a ladder
  const [showLoads, setShowLoads] = useState(true)   // load-diagram overlay
  const [showFootings, setShowFootings] = useState(true)   // designed footing footprints
  const [showConns, setShowConns] = useState(true)         // designed steel joint hardware

  const [model, setModel] = useState<StructuralModel | null>(() => {
    try {
      const raw = sessionStorage.getItem(AUTOSAVE_KEY)
      // migrate pre-per-member models so each member owns its section
      return raw ? splitSharedSections(JSON.parse(raw) as StructuralModel) : null
    } catch { return null }
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<F3Analysis | null>(null)
  const [modal, setModal] = useState<ModalResult | null>(null)
  const [modeShapeIdx, setModeShapeIdx] = useState<number | null>(null)
  const [modeAmp, setModeAmp] = useState(1.5)
  const [forceDiag, setForceDiag] = useState<DiagramComp | null>(null)   // inline 3D BMD/SFD overlay
  const [forceDiagScale, setForceDiagScale] = useState(1)                // user offset multiplier
  // Thermal load inputs
  const [thMember, setThMember] = useState('')
  const [thDeltaT, setThDeltaT] = useState(30)
  const [thAlphaKey, setThAlphaKey] = useState<'steel' | 'concrete' | 'custom'>('steel')
  const [thAlphaCustom, setThAlphaCustom] = useState(12e-6)
  const thAlpha = thAlphaKey === 'steel' ? 11.7e-6 : thAlphaKey === 'concrete' ? 10e-6 : thAlphaCustom
  // AISC DG11 floor-vibration check (0 = use the value auto-suggested from analysis)
  const [dg11OccId, setDg11OccId] = useState('office')
  const [dg11DeflMm, setDg11DeflMm] = useState(0)
  const [dg11W, setDg11W] = useState(0)
  const [rsa, setRsa] = useState<ResponseSpectrumResult | null>(null)
  const [nModes, setNModes] = useState(12)
  // Pushover (nonlinear static) inputs + result
  const [poDir, setPoDir] = useState<'x' | 'z'>('x')
  const [poPattern, setPoPattern] = useState<'triangular' | 'uniform'>('triangular')
  const [poRho, setPoRho] = useState(1.5)        // concrete tension-steel ratio, %
  const [poMpScale, setPoMpScale] = useState(1)
  const [poPM, setPoPM] = useState(false)        // apply P–M interaction at hinges
  const [poPDelta, setPoPDelta] = useState(false) // include second-order P-Δ (gravity)
  const [po, setPo] = useState<PushoverModelResult | null>(null)
  // Time-history (modal Newmark-β) inputs + result
  const [thKind, setThKind] = useState<GroundMotionKind>('rampedSine')
  const [thDir, setThDir] = useState<'x' | 'z'>('x')
  const [thPga, setThPga] = useState(0.3)        // g
  const [thFreq, setThFreq] = useState(2)        // Hz
  const [thDur, setThDur] = useState(10)         // s
  const [thZeta, setThZeta] = useState(5)        // %
  const [shellStress, setShellStress] = useState<{ nodes: ShellNode[]; elems: ShellElem[]; stresses: ElementStress[] } | null>(null)
  const [slabFE, setSlabFE] = useState<SlabFEScheduleRow[] | null>(null)
  const [recSpec, setRecSpec] = useState<{ spec: AccelSpectrum; design: DesignSpectrumPoint[]; name: string } | null>(null)
  const [shellSubdiv, setShellSubdiv] = useState(4)   // n×n triangulation per plate
  const [thCsv, setThCsv] = useState<{ text: string; name: string; npts: number } | null>(null)
  const [thCsvUnits, setThCsvUnits] = useState<'g' | 'ms2'>('g')
  const [thCsvDt, setThCsvDt] = useState(0.02)  // s, for one-column CSV
  const [th, setTh] = useState<TimeHistoryModelResult | null>(null)
  const [design, setDesign] = useState<StructureDesign | null>(null)
  const [opt, setOpt] = useState<OptimizeResult | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)   // open schedule-row solution
  const [report] = useState<'' | 'schedules' | 'drawings' | 'solutions' | 'full' | 'sol-only' | 'draw-only'>('')  // consolidated report template (interactive on screen; PDF carries everything)
  const [resultsTab, setResultsTab] = useState<'schedules' | 'boq' | 'schedule'>('schedules')  // results section tab
  const [modelImg, setModelImg] = useState<string | null>(null)   // 3D snapshot for the PDF report
  const [lh, setLh] = useState<LetterheadState>({ project: '', sheet: '', preparedBy: '' })
  const [exporting, setExporting] = useState(false)               // PDF build in flight
  const [ioMenu, setIoMenu] = useState(false)                     // Import/Export dropdown
  const [concreteClass, setConcreteClass] = useState<ConcreteClass>((si.concreteClass as ConcreteClass) ?? 'A')   // mix class for the take-off
  const [prices, setPrices] = useState<PriceList>((si.prices as PriceList) ?? {   // unit prices for the costed bill (PHP)
    cementBag: 260, sandM3: 1500, gravelM3: 1600, steelKg: 65, tieWireRoll: 2500, plywoodSheet: 700, lumberM: 25, structuralSteelKg: 120, timberBdFt: 55,
  })
  const [sdlDraft, setSdlDraft] = useState<SdlItem[]>([])          // NSCP-204 SDL composition being built
  const [sdlMatId, setSdlMatId] = useState(TABLE_204_2[0].id)      // 204-2 material add-row
  const [sdlMatT, setSdlMatT] = useState(50)                       // 204-2 thickness, mm
  const [liveOccId, setLiveOccId] = useState('')                   // NSCP 205-1 occupancy ('' = default LL)
  const [tab, setTab] = useState<Tab>('geometry')                 // right-panel tab
  const [orphans, setOrphans] = useState(0)
  // footing plan: base node → '' (isolated) or partner node id (combined)
  const [planSel, setPlanSel] = useState<Record<string, string>>((si.planSel as Record<string, string>) ?? {})
  // frame-editor add-member picks
  const [newI, setNewI] = useState(''); const [newJ, setNewJ] = useState('')
  const [newRole, setNewRole] = useState<MemberRole>('beam')
  // wall-add form
  const [wallMember, setWallMember] = useState(''); const [wallH, setWallH] = useState(3)
  const [wallT, setWallT] = useState(150); const [wallShear, setWallShear] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls>>(null)
  const { busy, run, progress } = useSolver()   // off-thread FEM/design/optimise

  // Hold Shift to PAN with a left-drag (otherwise left-drag orbits); right-drag
  // pans too. Toggles the OrbitControls left-button mode on Shift down/up.
  useEffect(() => {
    const setPan = (on: boolean) => (e: KeyboardEvent) => {
      if (e.key !== 'Shift') return
      const c = controlsRef.current
      if (c) c.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
    }
    const down = setPan(true), up = setPan(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // Persist the design inputs so a reload restores them alongside the autosaved
  // model (keeps the Geometry/Properties tabs + report inputs in sync with it).
  useEffect(() => {
    try {
      sessionStorage.setItem(INPUTS_KEY, JSON.stringify({
        baysX, baysZ, storeyH, colB, colH, girB, girH, beaB, beaH,
        fc, fy, barDia, tieDia, cover, slabThk, gammaC, qD, qL,
        qa, Hf, gammaSoil, Ca, Cv, Rw, Ie, Zf, Nv, eDirs, methodB, accTor, orth30, evOn, rsaRegular,
        Vw, expo, Kzt, wDirs, assembly, pDelta, cracked, shearDef, tryBars,
        concreteClass, prices, planSel,
        material, colFam, girFam, beaFam, colShape, girShape, beaShape, steelFy, steelFu,
        woodSpeciesId, woodGrade, woodWet, matSource, customId,
      }))
    } catch { /* quota — ignore */ }
  }, [baysX, baysZ, storeyH, colB, colH, girB, girH, beaB, beaH,
    fc, fy, barDia, tieDia, cover, slabThk, gammaC, qD, qL,
    qa, Hf, gammaSoil, Ca, Cv, Rw, Ie, Zf, Nv, eDirs, methodB, accTor, orth30, evOn, rsaRegular,
    Vw, expo, Kzt, wDirs, assembly, pDelta, cracked, shearDef, tryBars,
    concreteClass, prices, planSel,
    material, colFam, girFam, beaFam, colShape, girShape, beaShape, steelFy, steelFu,
    woodSpeciesId, woodGrade, woodWet, matSource, customId])

  const save = (m: StructuralModel | null) => {
    setModel(m)
    setAnalysis(null)             // geometry changed — results are stale
    setModal(null)
    setRsa(null)
    setDesign(null)
    setOpt(null)
    setExpanded(null)
    setDrift(null)
    try {
      if (m) sessionStorage.setItem(AUTOSAVE_KEY, JSON.stringify(m))
      else sessionStorage.removeItem(AUTOSAVE_KEY)
    } catch { /* quota — ignore */ }
  }

  /** save() for node-load-only edits (E/W case generation): mass and stiffness
   *  are untouched, so the modal result — which Method B and the RSA E-cases
   *  need on the NEXT generate click — stays valid and is kept. */
  const saveKeepModal = (m: StructuralModel) => {
    setModel(m)
    setAnalysis(null)
    setDesign(null)
    setOpt(null)
    setExpanded(null)
    setDrift(null)
    try { sessionStorage.setItem(AUTOSAVE_KEY, JSON.stringify(m)) } catch { /* quota — ignore */ }
  }

  // §203.3.1: f₁ = 1.0 for assembly/garage or live load > 4.8 kPa, else 0.5.
  const fLive = assembly || qL > 4.8 ? 1.0 : 0.5
  // Primary lateral axis (headline §208 summary + drift check direction).
  const primAxis: 'x' | 'z' = (eDirs[0] ?? '+X').includes('X') ? 'x' : 'z'
  const seis = seisXZ?.[primAxis] ?? null
  const lateral = [...eCases, ...wCases]
  // Infer seismic lateral system from R for column tie-detailing.
  // Only applies when E loads are present (user clicked "Generate E cases").
  const hasELoads = model?.loads.some((l) => l.cat === 'E') ?? false
  const seismicSystem: 'gravity' | 'imf' | 'smf' = hasELoads ? (Rw >= 8 ? 'smf' : Rw >= 5 ? 'imf' : 'gravity') : 'gravity'
  // §208.4.1 vertical seismic component folded into the E-combo D factors.
  const anaOpts = { f1: fLive, pDelta, lateral, seismicSystem, crackedSections: cracked, shearDeformation: shearDef, Ev: evOn ? 0.5 * Ca * Ie : undefined, colLayout: (allAround ? 'all-around' as const : 'two-face' as const), tBeamAction: tBeamOn }

  const analyze = () => {
    if (!model || busy || meshErrors) return   // §1 fail-fast: don't solve a singular mesh
    // 3D FEM + storey drift run in the worker so the UI stays responsive.
    run('analyze', {
      model, opts: anaOpts, drift: { hasSeis: !!seis, T: seis?.T ?? 0, R: Rw, axis: primAxis, pDelta }, crackedSections: cracked, shearDeformation: shearDef,
    }).then((r) => {
      const res = r as { analysis: F3Analysis | null; orphans: number; drift: DriftRow[] | null }
      setOrphans(res.orphans)
      setAnalysis(res.analysis)
      setDrift(res.drift)
    }).catch((e) => console.error('analyze failed', e))
  }

  const runModal = () => {
    if (!model || busy || meshErrors) return
    setModeShapeIdx(null)    // stale shape from prior run
    run('modal', { model, nModes }).then((r) => {
      const m = (r as { modal: ModalResult | null }).modal
      setModal(m)
      if (m && m.modes.length > 0) {
        setRsa(computeResponseSpectrum(m, {
          Ca, Cv, I: Ie, R: Rw,
          staticV: seisXZ ? [seisXZ.x.V, 0, seisXZ.z.V] : undefined,
        }))
      } else {
        setRsa(null)
      }
    }).catch((e) => console.error('modal failed', e))
  }

  const runPushover = () => {
    if (!model || busy || meshErrors) return
    run('pushover', {
      model,
      opts: { dir: poDir === 'x' ? 0 : 2, pattern: poPattern, rho: poRho / 100, mpScale: poMpScale, pmInteraction: poPM, pDelta: poPDelta },
    }).then((r) => setPo((r as { pushover: PushoverModelResult | null }).pushover))
      .catch((e) => console.error('pushover failed', e))
  }

  const runTimeHistory = () => {
    if (!model || busy || meshErrors) return
    const dir: 0 | 2 = thDir === 'x' ? 0 : 2
    const csvOpts: CsvAccelerogramOpts | undefined = thCsv
      ? { text: thCsv.text, dt: thCsvDt, units: thCsvUnits, dir }
      : undefined
    run('timeHistory', {
      model,
      opts: csvOpts
        ? { csv: csvOpts, zeta: thZeta / 100, nModes }
        : { spec: { kind: thKind, dt: 0.02, duration: thDur, pga: thPga * GRAVITY, freq: thFreq, dir }, zeta: thZeta / 100, nModes },
    }).then((r) => setTh((r as { timeHistory: TimeHistoryModelResult | null }).timeHistory))
      .catch((e) => console.error('time-history failed', e))
  }

  // Elastic response spectrum from the uploaded accelerogram, overlaid on the
  // NSCP 208 design spectrum (C8). Parses the same CSV used by the time-history.
  const runResponseSpectrum = () => {
    if (!thCsv) return
    const parsed = parseAccelerogram(thCsv.text, { dt: thCsvDt, units: thCsvUnits })
    if (!parsed) { setRecSpec(null); return }
    const spec = elasticResponseSpectrum(parsed.ag, parsed.dt, { zeta: thZeta / 100 })
    if (!spec) { setRecSpec(null); return }
    const design = nscp208DesignCurve(spec.points.map((p) => p.T), Ca, Cv, Ie, Rw)
    setRecSpec({ spec, design, name: thCsv.name })
  }

  const runShellStress = () => {
    if (!model || !model.shellElements || model.plates.length === 0) return
    // Mesh + solve the model's shell plates under the SERVICE area-load field for
    // display (subdivision, conforming edges and corner-id reuse handled by the
    // shared shellModel bridge). Pass nothing for D/L factors → unfactored stress.
    const solved = solveModelShells(model, { subdiv: shellSubdiv })
    if (!solved) { setShellStress(null); return }
    setShellStress({ nodes: solved.nodes, elems: solved.elems, stresses: solved.stresses })
  }

  const runSlabFE = () => {
    if (!model || !model.shellElements || model.plates.length === 0) return
    // Factored (1.2D + 1.6L) shell moment field → Wood-Armer slab reinforcement.
    const out = designModelSlabsFE(model, { subdiv: shellSubdiv })
    setSlabFE(out ? out.rows : null)
  }

  // Re-sign / re-axis a base node-load set into a directional case. The base
  // value's sign is preserved (RSA storey-force patterns can locally reverse),
  // so '−' cases are the exact mirror of '+' cases.
  const dirCase = (base: ModelLoad[], kind: 'E' | 'W', d: string): LateralCase => {
    const axis = d.includes('X') ? 'Fx' : 'Fz'
    const sign = d.startsWith('-') ? -1 : 1
    return {
      name: `${kind}${d}`, kind,
      loads: base.map((l) => {
        const v = (l as { Fx?: number }).Fx ?? (l as { Fz?: number }).Fz ?? 0
        return { kind: 'node', node: (l as { node: string }).node, [axis]: sign * v, cat: kind }
      }),
    }
  }

  /** §208.5.2.2 Method-B period per axis: the modal period of the mode with the
   *  largest effective-mass share in that direction (the fundamental
   *  translational mode). undefined when no modal result is available. */
  const fundamentalT = (axis: 'x' | 'z'): number | undefined => {
    if (!modal || modal.modes.length === 0) return undefined
    const d = axis === 'x' ? 0 : 2
    const best = modal.modes.reduce((a, m) => (m.effMassRatio[d] > a.effMassRatio[d] ? m : a))
    return best.effMassRatio[d] > 0 ? best.period : undefined
  }

  /** Swap the model's cat-E node loads for the primary direction's case and
   *  refresh the derived state shared by both E-generation paths. The engine
   *  builder expands dirs × ±0.3·perpendicular (§208.8.1) × ⟳/⟲ accidental
   *  torsion (§208.7.2.7) per the toggles. */
  const commitECases = (rx: SeismicResult, rz: SeismicResult, baseOf: (axis: 'x' | 'z') => ModelLoad[]) => {
    if (!model) return
    setSeisXZ({ x: rx, z: rz })
    setECases(buildECases(model, baseOf('x'), baseOf('z'), { dirs: eDirs, torsion: accTor, orth30 }))
    // commit the primary direction (untorsioned pattern) for the load-diagram
    // overlay + drift check
    const primary = dirCase(baseOf(primAxis), 'E', eDirs[0] ?? '+X')
    saveKeepModal({ ...model, loads: [...model.loads.filter((l) => !(l.cat === 'E' && l.kind === 'node')), ...primary.loads] })
  }

  const generateE = () => {
    if (!model) return
    // one solve per axis: distribution is direction-independent, but with a
    // Method-B period V (and so every Fx) can differ between X and Z.
    const base = { Ca, Cv, I: Ie, R: Rw, Z: Zf, Nv, gammaC }
    const rx = computeSeismic(model, { ...base, dir: 'x' as const, Tb: methodB ? fundamentalT('x') : undefined })
    const rz = computeSeismic(model, { ...base, dir: 'z' as const, Tb: methodB ? fundamentalT('z') : undefined })
    if (!rx || !rz) return
    setRsaGen(null)   // static pattern replaces any RSA-derived cases
    commitECases(rx, rz, (axis) => (axis === 'x' ? rx : rz).loads)
  }

  /** §208.6.4 dynamic path: RSA storey forces (CQC), scaled to the §208.6.4.2
   *  static-base-shear floor, become the cat-E cases the design envelopes. */
  const generateRsaE = () => {
    if (!model || !modal || modal.modes.length === 0) return
    const base = { Ca, Cv, I: Ie, R: Rw, Z: Zf, Nv, gammaC }
    const gen = (axis: 'x' | 'z') => {
      const vA = computeSeismic(model, { ...base, dir: axis })                            // Method-A static V
      const vB = computeSeismic(model, { ...base, dir: axis, Tb: fundamentalT(axis) })    // Method-B static V (§208.6.4.2)
      if (!vA || !vB) return null
      // regular: ≥ 90% of V(T_B), and never below 80% of V(T_A); irregular: 100% of V(T_B)
      const Vfloor = rsaRegular ? Math.max(0.9 * vB.V, 0.8 * vA.V) : vB.V
      const rsa = rsaEquivalentLoads(model, modal, { Ca, Cv, I: Ie, R: Rw, dir: axis, combine: 'cqc', Vfloor })
      return rsa ? { stat: vB, rsa } : null
    }
    const gx = gen('x'), gz = gen('z')
    if (!gx || !gz) return
    setRsaGen({ x: gx.rsa, z: gz.rsa })
    commitECases(gx.stat, gz.stat, (axis) => (axis === 'x' ? gx : gz).rsa.loads)
  }

  const generateW = () => {
    if (!model) return
    // wind magnitude IS axis-dependent (B, L differ), so solve each axis used.
    const needX = wDirs.some((d) => d.includes('X')), needZ = wDirs.some((d) => d.includes('Z'))
    const rx = needX ? computeWind(model, { V: Vw, exposure: expo, Kzt, dir: 'x' }) : null
    const rz = needZ ? computeWind(model, { V: Vw, exposure: expo, Kzt, dir: 'z' }) : null
    const primaryRes = rx ?? rz
    if (!primaryRes) return
    setWind(primaryRes)
    setWCases(wDirs.map((d) => {
      const base = (d.includes('X') ? rx : rz)?.loads ?? []
      return dirCase(base, 'W', d)
    }))
    const primary = dirCase(primaryRes.loads, 'W', wDirs[0] ?? '+X')
    saveKeepModal({ ...model, loads: [...model.loads.filter((l) => !(l.cat === 'W' && l.kind === 'node')), ...primary.loads] })
  }

  const runCladding = () => {
    if (!model) return
    setCladding(computeCladding(model, { V: Vw, exposure: expo, Kzt, dir: 'x', area: ccArea, enclosure: ccEncl }))
  }

  const soil = { qAllow: qa, gammaSoil, gammaConc: gammaC, H: Hf }
  const footingPlan = (): FootingPlan => {
    const plan: FootingPlan = {}
    for (const [node, partner] of Object.entries(planSel)) {
      if (partner) plan[node] = { type: 'combined', with: partner }
    }
    return plan
  }

  /** Apply the current Properties material (f′c, fy, ⌀, ties, cover) to every
   *  section and refresh the gravity loads with the current SDL/LL and γc — so
   *  Design/Optimize reflect Properties edits without regenerating the grid. */
  const applyMaterial = (m: StructuralModel): StructuralModel => {
    const sections = m.sections.map((s) => ({ ...s, fc, fy, barDia, tieDia, cover }))
    const withMat = { ...m, sections }
    return { ...withMat, loads: buildGravityLoads(withMat, qD, qL, gammaC) }
  }

  // ── NSCP-204 SDL composer ──
  const toggleSdl204_1 = (c: typeof TABLE_204_1[number]) =>
    setSdlDraft((d) => d.some((x) => x.id === c.id)
      ? d.filter((x) => x.id !== c.id)
      : [...d, { id: c.id, kind: '204-1', label: c.label, kPa: c.kPa }])
  const addSdl204_2 = () => {
    const mtl = TABLE_204_2.find((x) => x.id === sdlMatId); if (!mtl || !(sdlMatT > 0)) return
    setSdlDraft((d) => [...d, { id: `${mtl.id}@${sdlMatT}`, kind: '204-2', label: `${mtl.label} (${sdlMatT} mm)`, gamma: mtl.gamma, thicknessMm: sdlMatT }])
  }
  const removeSdlItem = (idx: number) => setSdlDraft((d) => d.filter((_, i) => i !== idx))
  const commitPlates = (plates: Plate[]) => {
    const m2 = { ...model!, plates }
    save({ ...m2, loads: buildGravityLoads(m2, qD, qL, gammaC) })
  }
  /** Write the composed SDL to all slabs (or just the selected plate). */
  const applySdl = (toAll: boolean) => {
    if (!model) return
    const items = sdlDraft.length ? sdlDraft : undefined
    commitPlates(model.plates.map((p) =>
      p.role !== 'wall' && (toAll || p.id === selected) ? { ...p, sdlItems: items } : p))
  }
  // ── NSCP 205-1 live load (per slab) ──
  const occById = (id: string) => [...TABLE_205_1, ...TABLE_206].find((o) => o.id === id)
  const liveOf = (id: string) => { const o = occById(id); return o ? { id: o.id, label: o.label, kPa: o.kPa } : undefined }
  const applyLive = (toAll: boolean) => {
    if (!model) return
    const live = liveOf(liveOccId)
    commitPlates(model.plates.map((p) =>
      p.role !== 'wall' && (toAll || p.id === selected) ? { ...p, live } : p))
  }
  // ── Persistent per-panel editor row actions ──
  const setSlabSdl = (plateId: string, clear: boolean) => {
    if (!model) return
    const items = clear ? undefined : (sdlDraft.length ? sdlDraft : undefined)
    commitPlates(model.plates.map((p) => (p.id === plateId ? { ...p, sdlItems: items } : p)))
  }
  const setSlabLive = (plateId: string, occId: string) => {
    if (!model) return
    commitPlates(model.plates.map((p) => (p.id === plateId ? { ...p, live: liveOf(occId) } : p)))
  }
  // ── Timber deck (wood slab) per panel ──
  const setPlateDeck = (plateId: string, deck: WoodDeck | undefined) => {
    if (!model) return
    commitPlates(model.plates.map((p) => {
      if (p.id !== plateId) return p
      if (deck) return { ...p, deck }
      const rest = { ...p }; delete rest.deck; return rest
    }))
  }
  /** Patch fields of the selected plate's deck (leaves others intact). */
  const patchDeck = (plateId: string, patch: Partial<WoodDeck>) => {
    if (!model) return
    commitPlates(model.plates.map((p) => (p.id === plateId && p.deck ? { ...p, deck: { ...p.deck, ...patch } } : p)))
  }

  const runPipeline = () => {
    if (!model || busy || meshErrors) return
    setOpt(null)
    // material is applied on the main thread (cheap); the FEM + bar selection +
    // designStructure run in the worker so the page never freezes.
    run('design', {
      model: applyMaterial(model), soil, plan: footingPlan(), opts: anaOpts, tryBars,
    }).then((r) => {
      const res = r as { model: StructuralModel; design: StructureDesign | null }
      save(res.model)
      setDesign(res.design)
      requestAnimationFrame(captureModel)   // refresh the printable 3D snapshot
    }).catch((e) => console.error('design failed', e))
  }

  const optimize = () => {
    if (!model || busy || meshErrors) return
    run('optimize', {
      model: applyMaterial(model), soil, plan: footingPlan(), opts: anaOpts, tryBars, maxIter: 30,
    }).then((raw) => {
      const r = raw as OptimizeResult | null
      if (!r) return
      save(r.model)        // adopt the optimised per-member sections
      setOpt(r)
      setDesign(r.design)
      requestAnimationFrame(captureModel)
    }).catch((e) => console.error('optimize failed', e))
  }

  /** Snapshot the live 3D canvas as a PNG for the PDF report's first page. */
  const captureModel = () => {
    const c = document.querySelector('canvas') as HTMLCanvasElement | null
    if (!c) return
    try { setModelImg(c.toDataURL('image/png')) } catch { /* tainted / no context — skip */ }
  }

  /** Project & design inputs — shown in the schedules block and printed as
   *  §2 of the PDF calculation report. */
  const reportProps = (d: StructureDesign): [string, string][] => {
    const distinct = (role: MemberRole) => {
      const ids = new Set((model?.members ?? []).filter((m) => m.role === role).map((m) => m.section))
      return [...new Set((model?.sections ?? []).filter((s) => ids.has(s.id)).map((s) => s.name))].join(', ') || '—'
    }
    const slabT = [...new Set((model?.plates ?? []).filter((p) => p.role !== 'wall').map((p) => p.thickness))].join(', ')
    const barsUsed = [...new Set((model?.sections ?? []).filter((s) => s.material !== 'steel').map((s) => s.barDia))].sort((a, b) => a - b)
    const hasConcreteMems = d.beams.length > 0 || d.columns.length > 0
    const hasSteelMems    = d.steelBeams.length > 0 || d.steelColumns.length > 0
    const hasWoodMems     = d.woodBeams.length > 0 || d.woodColumns.length > 0
    const woodGrades      = [...new Set([...d.woodBeams, ...d.woodColumns].map((r) => r.species))]
      .map((id) => WOOD_SPECIES[id]?.label ?? id).join(', ')
    const slabSdls = [...new Set((model?.plates ?? []).filter((p) => p.role !== 'wall')
      .map((p) => (p.sdlItems && p.sdlItems.length ? sdlTotal(p.sdlItems) : qD)))].sort((a, b) => a - b)
    return [
      ['Column grid', `bays X ${baysX} m · bays Z ${baysZ} m · storeys ${storeyH} m`],
      ...(hasConcreteMems ? [['RC material', `f′c ${fc} MPa · fy ${fy} MPa · main ⌀${barsUsed.join('/⌀') || barDia} · ties ⌀${tieDia} · cover ${cover} mm`]] as [string, string][] : []),
      ...(hasSteelMems    ? [['Steel grade',  `Fy ${steelFy} MPa · Fu ${steelFu} MPa (AISC W-shapes)`]] as [string, string][] : []),
      ...(hasWoodMems     ? [['Timber grade', `${woodGrades}${woodWet ? ' · wet service' : ''} (NDS §3 / NSCP §6)`]] as [string, string][] : []),
      ['Columns', distinct('column')],
      ['Girders', distinct('girder')],
      ['Beams', distinct('beam')],
      ['Slabs', `t = ${slabT || '—'} mm · SDL ${slabSdls.map((v) => v.toFixed(2)).join(' / ')} kPa`],
      ['Loads', `default SDL ${qD} kPa · LL ${qL} kPa · γc ${gammaC} kN/m³`],
      ['Soil / footing', `qa ${qa} kPa · γsoil ${gammaSoil} kN/m³ · depth H ${Hf} m`],
      ['Seismic (NSCP 208)', `Ca ${Ca} · Cv ${Cv} · R ${Rw} · I ${Ie} · Z ${Zf} · Nv ${Nv}`],
      ['Wind (NSCP 207B)', `V ${Vw} m/s · exposure ${expo} · Kzt ${Kzt}`],
      ['Model', `${model?.nodes.length ?? 0} nodes · ${model?.members.length ?? 0} members · ${model?.plates.length ?? 0} slabs · ${(model?.walls ?? []).length} walls · ${model?.supports.length ?? 0} supports`],
      ['Governing case', d.govName],
      ['Concrete', `${f1(d.totals.concrete)} m³ (${f1(d.totals.concreteMembers)} members + ${f1(d.totals.concreteSlabs)} slabs)`],
      ...(d.totals.steelKg > 0
        ? [['Structural steel', `${f1(d.totals.steelKg)} kg (${f2(d.totals.steelKg / 1000)} t)`] as [string, string]]
        : []),
      ...(d.totals.woodVolume > 0
        ? [['Timber', `${f2(d.totals.woodVolume)} m³`] as [string, string]]
        : []),
    ]
  }

  /** Direct PDF export — grabs a fresh 3D snapshot, assembles the report
   *  payload and lazy-loads the jsPDF renderer (fonts stay out of the main
   *  bundle). Replaces the old print-the-page path. */
  const exportPdf = async () => {
    if (!model || !design || exporting) return
    setExporting(true)
    try {
      let img = modelImg
      const c = document.querySelector('canvas') as HTMLCanvasElement | null
      if (c) { try { img = c.toDataURL('image/png') } catch { /* tainted — keep the last snapshot */ } }
      const [{ buildModelReport }, { generateModelPdf }] = await Promise.all([
        import('../lib/modelReport'), import('../lib/modelPdf'),
      ])
      const badges = ['NSCP 2015', 'ACI 318-14',
        ...(design.steelBeams.length || design.steelColumns.length ? ['AISC 360-16'] : []),
        ...(design.woodBeams.length || design.woodColumns.length ? ['NDS §3 / NSCP §6'] : [])]
      await generateModelPdf({
        lh, modelImg: img, badges,
        report: buildModelReport(model, design, reportProps(design), soil),
        fileName: `structure-report${lh.sheet ? '-' + lh.sheet.split('·')[0].trim() : ''}.pdf`,
      })
    } catch (e) {
      console.error('PDF export failed', e)
    } finally { setExporting(false) }
  }

  // ── Frame-editor helpers (all immutable via save) ──
  const updNode = (id: string, k: 'x' | 'y' | 'z', v: number) => {
    if (!model || !Number.isFinite(v)) return
    save({ ...model, nodes: model.nodes.map((n) => (n.id === id ? { ...n, [k]: v } : n)) })
  }
  const addNode = () => {
    if (!model) return
    let k = model.nodes.length
    while (model.nodes.some((n) => n.id === `n${k}`)) k++
    save({ ...model, nodes: [...model.nodes, { id: `n${k}`, x: 0, y: 0, z: 0 }] })
  }
  const toggleSupport = (id: string) => {
    if (!model) return
    const has = model.supports.some((s) => s.node === id)
    save({
      ...model,
      supports: has ? model.supports.filter((s) => s.node !== id)
        : [...model.supports, { node: id, fixity: 'fixed' as const }],
    })
  }
  const updSupport = (nodeId: string, patch: Partial<NodeSupport>) => {
    if (!model) return
    save({ ...model, supports: model.supports.map((s) => (s.node === nodeId ? { ...s, ...patch } : s)) })
  }
  const updMember = (id: string, patch: Partial<Member>) => {
    if (!model) return
    save({ ...model, members: model.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
  }
  const sectionFor = (memberId: string): RectSection | undefined => {
    const m = model?.members.find((x) => x.id === memberId)
    return m ? model?.sections.find((s) => s.id === m.section) : undefined
  }
  const colSectionAt = (node: string): RectSection | undefined => {
    const c = model?.members.find((m) => m.role === 'column' && (m.i === node || m.j === node))
    return c ? sectionFor(c.id) : undefined
  }
  const updMemberSize = (memberId: string, k: 'b' | 'h', v: number) => {
    if (!model || !Number.isFinite(v)) return
    const mm = model.members.find((x) => x.id === memberId); if (!mm) return
    save({
      ...model,
      sections: model.sections.map((s) => (s.id === mm.section
        ? { ...s, [k]: v, name: k === 'b' ? `${v}×${s.h}` : `${s.b}×${v}` } : s)),
    })
  }
  const addMember = () => {
    if (!model || !newI || !newJ || newI === newJ) return
    // no second member on a node pair that already has one
    if (model.members.some((m) => (m.i === newI && m.j === newJ) || (m.i === newJ && m.j === newI))) return
    let k = model.members.length
    while (model.members.some((m) => m.id === `m${k}`)) k++
    const id = `m${k}`
    const tmpl = model.sections[0] ?? { b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 } as RectSection
    save({
      ...model,
      sections: [...model.sections, { ...tmpl, id, name: `${tmpl.b}×${tmpl.h}` }],
      members: [...model.members, { id, i: newI, j: newJ, role: newRole, section: id }],
    })
  }
  const updPlateThickness = (id: string, t: number) => {
    if (!model || !Number.isFinite(t)) return
    const m2 = { ...model, plates: model.plates.map((p) => (p.id === id ? { ...p, thickness: t } : p)) }
    save({ ...m2, loads: buildGravityLoads(m2, qD, qL, gammaC) })
  }
  const addWall = () => {
    if (!model || !wallMember) return
    if ((model.walls ?? []).some((w) => w.member === wallMember)) return   // one wall per member
    let k = model.walls?.length ?? 0
    while ((model.walls ?? []).some((w) => w.id === `w${k}`)) k++
    const walls = [...(model.walls ?? []), { id: `w${k}`, member: wallMember, height: wallH, thickness: wallT, shearWall: wallShear }]
    const m2 = { ...model, walls }
    save({ ...m2, loads: buildGravityLoads(m2, qD, qL, gammaC) })
  }
  const removeWall = (id: string) => {
    if (!model) return
    const m2 = { ...model, walls: (model.walls ?? []).filter((w) => w.id !== id) }
    save({ ...m2, loads: buildGravityLoads(m2, qD, qL, gammaC) })
  }
  const updLoad = (idx: number, v: number) => {
    if (!model || !Number.isFinite(v)) return
    save({
      ...model,
      loads: model.loads.map((l, i) => {
        if (i !== idx) return l
        if (l.kind === 'area') return { ...l, q: v }
        if (l.kind === 'member-udl') return { ...l, w: v }
        if (l.kind === 'member-point') return { ...l, P: v }
        if (l.kind === 'member-thermal') return { ...l, deltaT: v }
        return l
      }),
    })
  }
  const delLoad = (idx: number) => {
    if (!model) return
    save({ ...model, loads: model.loads.filter((_, i) => i !== idx) })
  }
  const rebuildGravity = () => {
    if (!model) return
    // self-weight + SDL (D) and LL (L) regenerated; E loads survive untouched
    save({ ...model, loads: buildGravityLoads(model, qD, qL, gammaC) })
  }

  // material take-off / BOM-BOQ for the current design + mix class
  const takeoff = useMemo(
    () => (design && model ? estimateTakeoff(model, design, { concreteClass }) : null),
    [design, model, concreteClass],
  )
  const bill = useMemo(() => (takeoff ? costBill(takeoff, prices) : null), [takeoff, prices])
  const peso = (v: number) => `₱${v.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

  const gov = analysis ? analysis.perCombo[analysis.govIdx] : null
  const govRes = gov?.result ?? null
  const memForce = useMemo(() => {
    const map = new Map<string, { Mmax: number; Vmax: number; Nmax: number }>()
    govRes?.members.forEach((m) => map.set(m.id, { Mmax: m.Mmax, Vmax: m.Vmax, Nmax: m.Nmax }))
    return map
  }, [govRes])

  const generate = (matOverride?: 'concrete' | 'steel' | 'wood', woodOverride?: { sel?: WoodSpecies; wet?: boolean }) => {
    const mat = { fc, fy, barDia, tieDia, cover }
    const role = (b: number, h: number, id: string): RectSection => ({ id, name: `${b}×${h}`, b, h, ...mat })
    // steel role: bounding box b = bf, h = d from the chosen AISC shape, tagged
    // material/shape so the bridge, design pipeline and 3D extrusion pick it up.
    const steelRole = (shapeName: string, id: string): RectSection => {
      const sh = shapeByName(shapeName)
      const { b, h } = sh ? sectionBoundingBox(sh) : { b: 200, h: 300 }
      return { id, name: shapeName, b, h, ...mat, material: 'steel', shape: shapeName, steelFy, steelFu }
    }
    // wood role: solid-rectangle b × d tagged with the resolved timber material —
    // both the library id and the reference values travel with the section so
    // the bridge (E), pipeline (NDS §3 design) and take-off pick it up. Fresh
    // selection passed via woodOverride to avoid a same-tick stale-state read.
    const wsel = woodOverride?.sel ?? activeWood
    const wet = woodOverride?.wet ?? woodWet
    const woodRole = (b: number, h: number, id: string): RectSection =>
      ({ id, name: `${b}×${h}`, b, h, ...mat, material: 'wood',
         woodSpecies: wsel.id, woodGrade: wsel.grade, woodRef: wsel.ref, woodKind: wsel.kind, woodWet: wet })
    const chosen = matOverride ?? material
    const steel = chosen === 'steel', wood = chosen === 'wood'
    const m = generateGridModel({
      baysX: parseList(baysX), baysZ: parseList(baysZ), storeyH: parseList(storeyH),
      column: steel ? steelRole(colShape, 'COL') : wood ? woodRole(colB, colH, 'COL') : role(colB, colH, 'COL'),
      girder: steel ? steelRole(girShape, 'GIR') : wood ? woodRole(girB, girH, 'GIR') : role(girB, girH, 'GIR'),
      beam: steel ? steelRole(beaShape, 'BEA') : wood ? woodRole(beaB, beaH, 'BEA') : role(beaB, beaH, 'BEA'),
      slabThickness: slabThk,
    })
    // Wood frame → the floor slabs are timber decks too: give every floor panel a
    // default deck-on-joist (joists in the chosen species) so it designs as a
    // wood slab. Concrete/steel frames keep RC slabs.
    if (wood) m.plates = m.plates.map((p) => p.role === 'wall' ? p
      : { ...p, deck: { ...DEFAULT_DECK, joistSpecies: wsel.id, joistKind: wsel.kind, wet } })
    // gravity loads: member self-weight (D), slab self-weight + SDL (D), LL (L)
    m.loads = buildGravityLoads(m, qD, qL, gammaC)
    setSelected(null)
    setSeisXZ(null)
    setRsaGen(null)
    setWind(null)
    setECases([])
    setWCases([])
    setPlanSel({})
    save(m)
  }

  const nodePos = useMemo(() => {
    const map = new Map<string, THREE.Vector3>()
    model?.nodes.forEach((n) => map.set(n.id, new THREE.Vector3(n.x, n.y, n.z)))
    return map
  }, [model])
  // auto rigid end-zone offsets (ETABS-style) for rendering the joint zones
  const autoOff = useMemo(
    () => (model?.rigidEndZones ? autoRigidOffsets(model, model.rigidZoneFactor ?? 0.5) : null),
    [model])
  // VISUAL face offsets (factor 1 = the full support face, independent of the
  // analysis rigid-zone setting), for BOTH materials: a beam is drawn to the
  // face of the member it lands on (steel: the tab/weld bridges the gap;
  // concrete: the joint block belongs to the column pour), and a column whose
  // stack ends extends UP to the top of the deepest framing beam.
  const faceOff = useMemo(() => (model ? autoRigidOffsets(model, 1) : null), [model])
  // model bounds → zoom-to-extents on load / after generate
  const modelBox = useMemo(() => {
    if (!model || model.nodes.length === 0) return null
    const xs = model.nodes.map((n) => n.x), ys = model.nodes.map((n) => n.y), zs = model.nodes.map((n) => n.z)
    return { min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)] as [number, number, number], max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)] as [number, number, number] }
  }, [model])

  // Auto-scale for the inline 3D force diagram: the model-wide peak |ordinate| of
  // the chosen component maps to ~10% of the model's largest dimension (× user mult).
  const forceDiagInfo = useMemo(() => {
    if (!forceDiag || !govRes || !modelBox) return null
    const byId = new Map<string, F3MemberResult>(govRes.members.map((m) => [m.id, m]))
    let maxAbs = 0
    for (const m of govRes.members) for (const v of m[forceDiag]) maxAbs = Math.max(maxAbs, Math.abs(v))
    const span = Math.max(modelBox.max[0] - modelBox.min[0], modelBox.max[1] - modelBox.min[1], modelBox.max[2] - modelBox.min[2], 1)
    const scale = diagramScale(maxAbs, span * 0.1 * forceDiagScale)
    return { byId, scale, maxAbs }
  }, [forceDiag, forceDiagScale, govRes, modelBox])

  const selMember: Member | undefined = model?.members.find((m) => m.id === selected)
  const selPlate: Plate | undefined = model?.plates.find((p) => p.id === selected)

  // Alignment-chart K-factors per column (AISC Commentary C-C2), keyed by member.
  const columnKs = useMemo(() => {
    if (!model) return new Map<string, ColumnK>()
    return new Map(columnKFactors(model).map((k) => [k.memberId, k]))
  }, [model])

  // DG11 auto-suggestions from the analysis: the worst floor vertical deflection
  // (Δ for fn) and the dead weight supported by that floor's storey (W).
  const dg11Suggest = useMemo(() => {
    if (!model || !govRes) return null
    const supports = new Set(model.supports.map((s) => s.node))
    let worst = 0, worstY = 0
    model.nodes.forEach((n, k) => {
      if (supports.has(n.id) || n.y <= 1e-6) return       // skip bases & ground
      const uy = Math.abs(govRes.d[6 * k + 1])            // vertical deflection, m
      if (uy > worst) { worst = uy; worstY = n.y }
    })
    if (worst <= 0) return null
    const mass = buildSeismicMass(model)                  // tonnes per node (dead)
    let storeyT = 0
    for (const n of model.nodes) if (Math.abs(n.y - worstY) < 1e-3) storeyT += mass.get(n.id) ?? 0
    return { deflMm: worst * 1000, W: storeyT * GRAVITY } // mm, kN
  }, [model, govRes])

  // immediate grid-neighbour base supports (share an x- or z-line and are the
  // nearest column either side, nothing between) — the only sensible partners
  // for a combined footing.
  const adjacentBases = (nodeA: string): Set<string> => {
    const out = new Set<string>()
    const A = nodePos.get(nodeA); if (!A || !model) return out
    const others = model.supports.map((s) => s.node).filter((id) => id !== nodeA && nodePos.has(id))
    for (const [axis, other] of [['x', 'z'], ['z', 'x']] as const) {
      const onLine = others.filter((id) => Math.abs(nodePos.get(id)![axis] - A[axis]) < 1e-4)
      for (const dir of [1, -1]) {
        let best: string | null = null, bestD = Infinity
        for (const id of onLine) {
          const d = (nodePos.get(id)![other] - A[other]) * dir
          if (d > 1e-4 && d < bestD) { bestD = d; best = id }
        }
        if (best) out.add(best)
      }
    }
    return out
  }

  // human-readable label for the currently-selected element (shown on the 3D view)
  const selInfo: { kind: string; id: string; extra?: string } | null = !selected ? null
    : selMember ? { kind: selMember.role, id: selMember.id, extra: sectionFor(selMember.id)?.name }
      : selPlate ? { kind: selPlate.role, id: selPlate.id, extra: `t = ${selPlate.thickness} mm` }
        : model?.nodes.some((nn) => nn.id === selected) ? { kind: 'node', id: selected }
          : { kind: 'element', id: selected }

  const plateInfo = useMemo(() => {
    if (!selPlate || !model) return null
    const c = selPlate.corners.map((id) => nodePos.get(id)!)
    const lx = Math.abs(c[1].x - c[0].x) || Math.abs(c[2].x - c[0].x)
    const lz = Math.abs(c[3].z - c[0].z) || Math.abs(c[2].z - c[0].z)
    const areaLoads = model.loads
      .filter((l) => l.kind === 'area' && l.plate === selPlate.id)
      .map((l) => ({ q: (l as { q: number }).q, cat: l.cat }))
    const trib = areaLoads.length ? distributePanel(lx, lz, areaLoads) : null
    return { lx, lz, areaLoads, trib }
  }, [selPlate, model, nodePos])

  const memberLen = selMember
    ? nodePos.get(selMember.i)!.distanceTo(nodePos.get(selMember.j)!)
    : 0

  // Pre-analysis mesh diagnostics (§1) — drives the validation panel and the
  // fail-fast guard on the Analyze button.
  const meshIssues = useMemo(() => (model ? validateMesh(model) : []), [model])
  const meshErrors = hasMeshErrors(meshIssues)

  // Member-length lookup (m) for the statics self-check in the reactions panel.
  const memberLenById = useMemo(() => {
    const map = new Map<string, number>()
    model?.members.forEach((mm) => {
      const a = nodePos.get(mm.i), b = nodePos.get(mm.j)
      if (a && b) map.set(mm.id, a.distanceTo(b))
    })
    return (id: string) => map.get(id) ?? 0
  }, [model, nodePos])

  const download = () => {
    if (!model) return
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${model.name.replace(/\s+/g, '-')}.model.json`; a.click()
    URL.revokeObjectURL(url)
  }
  const upload = async (f: File) => {
    try {
      const m = JSON.parse(await f.text()) as StructuralModel
      if (m.version !== 1 || !Array.isArray(m.nodes)) throw new Error('not a model file')
      setSelected(null)
      save(splitSharedSections(m))   // migrate shared-section models to per-member
    } catch { alert('Could not read that file as a structural model (.model.json).') }
  }

  // Panel action button (mockup "Regenerate grid model" style — flat light blue).
  const btn =
    'rounded-md border border-[#cddcf0] bg-[#eaf1f9] px-4 py-2 text-[12px] font-semibold text-[#0f4c92] transition hover:bg-[#dce9f7] disabled:opacity-40'

  // Model name for the workspace header: bays × storeys from the live model.
  const modelName = model
    ? `${globalThis.Math.max(1, [...new Set(model.nodes.map((n) => n.x))].length - 1)}×${globalThis.Math.max(1, [...new Set(model.nodes.map((n) => n.z))].length - 1)} Bay · ${[...new Set(model.storeys.map((q) => q.elevation))].length} Storey${[...new Set(model.storeys.map((q) => q.elevation))].length === 1 ? '' : 's'}`
    : '3D Model Space'

  return (
    <div className="mx-auto max-w-[1700px] p-4">
      {/* ── Workspace header (docs/design/uiux-2026-07) ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h1 className="text-[21px] font-extrabold tracking-tight text-[#0f1b2a]">{modelName}</h1>
          {model && <span className="rounded border border-[#cddcf0] bg-[#eaf1f9] px-1.5 py-px font-mono text-[10px] font-medium text-[#0f4c92]">autosaved</span>}
        </div>
        <div className="no-print ml-auto flex flex-wrap items-center gap-2">
          {/* Import / Export dropdown (mockup header: one combined button) */}
          <div className="relative" onMouseLeave={() => setIoMenu(false)}>
            <button type="button" onClick={() => setIoMenu((v) => !v)}
              className="rounded-md border border-[#d6d3c9] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#3d4a5c] hover:border-[#0f4c92] hover:text-[#0f4c92]">
              Import / Export ▾
            </button>
            {ioMenu && (
              <div className="absolute right-0 top-full z-30 w-44 overflow-hidden rounded-md border border-[#e3e1da] bg-white py-1 shadow-lg">
                <button type="button" disabled={!model} onClick={() => { setIoMenu(false); download() }}
                  className="block w-full px-3.5 py-2 text-left text-[12.5px] font-semibold text-[#3d4a5c] hover:bg-[#eaf1f9] hover:text-[#0f4c92] disabled:opacity-40">
                  ⬇ Export model JSON
                </button>
                <button type="button" onClick={() => { setIoMenu(false); fileRef.current?.click() }}
                  className="block w-full px-3.5 py-2 text-left text-[12.5px] font-semibold text-[#3d4a5c] hover:bg-[#eaf1f9] hover:text-[#0f4c92]">
                  ⬆ Import model JSON…
                </button>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".json" className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }} />
          <button type="button" onClick={analyze} disabled={!model || !!busy || meshErrors}
            className="rounded-md bg-[#1a7f4b] px-4 py-2 text-[12.5px] font-bold text-white hover:bg-[#14603a] disabled:opacity-40">
            ▶ Analyze
          </button>
          <button type="button" onClick={runPipeline} disabled={!model || !!busy || meshErrors}
            className="rounded-md bg-[#0f4c92] px-4 py-2 text-[12.5px] font-bold text-white hover:bg-[#0d3f78] disabled:opacity-40">
            Design all
          </button>
          <button type="button" onClick={() => void exportPdf()} disabled={!design || exporting}
            title={design ? 'Download the calculation report as a PDF' : 'Run “Design all” first'}
            className="rounded-md border border-[#0f4c92] bg-white px-3.5 py-2 text-[12.5px] font-bold text-[#0f4c92] hover:bg-[#eaf1f9] disabled:opacity-40">
            {exporting ? '⏳ Building PDF…' : '⎙ Export PDF'}
          </button>
        </div>
      </div>

      {/* ── Main split: sticky 3D (60%) | tabbed controls (40%) ── */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr] lg:items-start">
        {/* LEFT — sticky 3D viewport */}
        <div className="no-print lg:sticky lg:top-4">
          <div className="relative h-[80vh] min-h-[460px] overflow-hidden rounded-lg border border-[#e3e1da] bg-[#0f1b2a]">
            {model ? (
              <Canvas camera={{ position: [14, 11, 14], fov: 45 }} gl={{ preserveDrawingBuffer: true }} onPointerMissed={() => setSelected(null)}>
                {/* Local boundary: drei <Text> suspends while troika fetches its
                    font-resolver data — without this, the suspension bubbles to the
                    route-level <Suspense> and React hides the WHOLE page (blank page
                    after "Design all" on networks that block cdn.jsdelivr.net). */}
                <Suspense fallback={null}>
                <color attach="background" args={['#f8fafc']} />
                <ambientLight intensity={0.85} />
                <directionalLight position={[12, 18, 8]} intensity={0.9} />
                <FitView box={modelBox} dir={[1, 0.8, 1]} />
                <gridHelper args={[40, 40, '#e2e8f0', '#eef2f7']} />
                <GridBubbles3D model={model} />
                {model.members.map((m) => {
                  const a = nodePos.get(m.i), bb = nodePos.get(m.j)
                  if (!a || !bb) return null
                  const tint = govRes && govRes.Mmax > 1e-9
                    ? (memForce.get(m.id)?.Mmax ?? 0) / govRes.Mmax : 0
                  const sec = sectionFor(m.id)
                  const manI = m.offsets?.iEnd, manJ = m.offsets?.jEnd
                  const v3 = (v: [number, number, number]) => new THREE.Vector3(v[0], v[1], v[2])
                  // PHYSICAL members, both materials: a beam ends AT the support
                  // face (steel: the tab/weld bridges the gap; concrete: the joint
                  // block belongs to the column pour), and a column whose stack
                  // ends extends UP past the joint to the top of the deepest
                  // framing beam. Intermediate columns keep meeting at the node,
                  // so the storey above fills the joint block.
                  const fo = faceOff?.get(m.id)
                  let aV = a, bV = bb
                  if (m.role === 'column') {
                    const contAt = (nid: string) => model.members.some((o) => o.id !== m.id && o.role === 'column' && (o.i === nid || o.j === nid))
                    aV = manI ? a.clone().add(v3(manI)) : (fo?.offI && !contAt(m.i) ? a.clone().sub(v3(fo.offI)) : a)
                    bV = manJ ? bb.clone().add(v3(manJ)) : (fo?.offJ && !contAt(m.j) ? bb.clone().sub(v3(fo.offJ)) : bb)
                  } else {
                    aV = manI ? a.clone().add(v3(manI)) : (fo?.offI ? a.clone().add(v3(fo.offI)) : a)
                    bV = manJ ? bb.clone().add(v3(manJ)) : (fo?.offJ ? bb.clone().add(v3(fo.offJ)) : bb)
                  }
                  const memberEl = sec?.material === 'steel' && sec.shape
                    ? <MemberSteel3D a={aV} b={bV} role={m.role} shapeName={sec.shape} axisRotation={m.axisRotation}
                        tint={tint * 0.85} selected={m.id === selected} onPick={() => setSelected(m.id)} />
                    : <Member3D a={aV} b={bV} role={m.role} tint={tint * 0.85}
                        sec={sec} selected={m.id === selected} onPick={() => setSelected(m.id)} />
                  return (
                    <group key={m.id}>
                      {memberEl}
                      {manI && <RigidArm3D a={a} b={aV} />}
                      {manJ && <RigidArm3D a={bb} b={bV} />}
                    </group>
                  )
                })}
                {model.plates.map((p) => {
                  const cs = p.corners.map((c) => nodePos.get(c))
                  if (cs.some((c) => !c)) return null
                  return <Slab3D key={p.id} corners={cs as THREE.Vector3[]} shell={model.shellElements} deck={p.deck}
                    selected={p.id === selected} onPick={() => setSelected(p.id)} />
                })}
                {model.supports.map((s) => {
                  const p = nodePos.get(s.node)
                  return p ? <Support3D key={s.node} p={p} /> : null
                })}
                {showConns && design && (design.joints.length > 0 || design.beamJoints.length > 0) && (
                  <JointConnections3D joints={design.joints} beamJoints={design.beamJoints} model={model} nodePos={nodePos} />
                )}
                {showFootings && design && (() => {
                  const xz = new Map([...nodePos].map(([id, p]) => [id, { x: p.x, z: p.z }]))
                  const { items, overlaps } = footingLayout(
                    design.footings.map((f) => ({ node: f.node, B: f.design.B, Dc: f.design.Dc })),
                    design.combined.map((cf) => ({ nodes: cf.nodes, Bx: cf.design.Bx, By: cf.design.By, Dc: cf.design.Dc, trapezoid: cf.design.shape.startsWith('Trap') })),
                    xz,
                  )
                  return <group>{items.map((f) => (
                    <Footing3D key={f.key} cx={f.cx} cz={f.cz} bx={f.bx} bz={f.bz} dc={f.dc} angle={f.angle} overlap={overlaps.has(f.key)} label={f.label} />
                  ))}</group>
                })()}
                {(model.walls ?? []).map((w) => {
                  const m = model.members.find((mm) => mm.id === w.member)
                  const tA = m && nodePos.get(m.i), tB = m && nodePos.get(m.j)
                  if (!tA || !tB) return null
                  const below = (p: THREE.Vector3) => {
                    let best: THREE.Vector3 | null = null
                    for (const n of model.nodes) {
                      const q = nodePos.get(n.id)!
                      if (Math.abs(q.x - p.x) < 1e-4 && Math.abs(q.z - p.z) < 1e-4 && q.y < p.y - 1e-4 && (!best || q.y > best.y)) best = q
                    }
                    return best
                  }
                  const bA = below(tA), bB = below(tB)
                  if (!bA || !bB) return null
                  return <Wall3D key={w.id} tA={tA} tB={tB} bA={bA} bB={bB} shear={w.shearWall} />
                })}
                {showLoads && <Loads3D model={model} nodePos={nodePos} />}
                {forceDiag && forceDiagInfo && forceDiagInfo.scale > 0 && model.members.map((m) => {
                  const mr = forceDiagInfo.byId.get(m.id)
                  const a = nodePos.get(m.i), bb = nodePos.get(m.j)
                  if (!mr || !a || !bb) return null
                  return <MemberForceDiagram3D key={`fd-${m.id}`}
                    a={[a.x, a.y, a.z]} b={[bb.x, bb.y, bb.z]}
                    xs={mr.xs} ys={mr[forceDiag]} comp={forceDiag} scale={forceDiagInfo.scale} />
                })}
                {modal && modeShapeIdx !== null && modal.modes[modeShapeIdx] && (
                  <ModeShapePlayer
                    shape={modal.modes[modeShapeIdx].shape}
                    nodePos={nodePos}
                    members={model.members}
                    amp={modeAmp}
                  />
                )}
                <OrbitControls ref={controlsRef} makeDefault enablePan target={[6, 3, 2.5]} />
                </Suspense>
              </Canvas>
            ) : (
              <div className="flex h-full items-center justify-center font-mono text-sm text-[#7d8ea3]">
                Set the grid and hit “Generate model”.
              </div>
            )}
            {model && selInfo && (
              <div className="no-print absolute left-3 top-11 flex items-center gap-2 rounded-md border border-[#0f4c92]/30 bg-white/95 px-2.5 py-1 text-xs shadow-sm backdrop-blur">
                <span className="font-semibold text-[#0f4c92]">▣ {selInfo.kind} {selInfo.id}</span>
                {selInfo.extra && <span className="text-slate-500">{selInfo.extra}</span>}
                <button type="button" onClick={() => setSelected(null)} className="ml-0.5 text-slate-500 hover:text-red-500" title="Deselect">✕</button>
              </div>
            )}
            {model && (
              <div className="no-print pointer-events-none absolute left-3 top-3 rounded border border-white/15 bg-[#0f1b2a]/80 px-2 py-1 font-mono text-[10px] text-[#9db0c5]">
                orbit: drag · pan: ⇧drag · zoom: scroll
              </div>
            )}
          </div>
          {design && (design.joints.length > 0 || design.beamJoints.length > 0) && (
            <label className="no-print mt-2 flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={showConns} onChange={(e) => setShowConns(e.target.checked)} />
              Show designed steel connections
              <span className="ml-1 inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: '#334155' }} />plates</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: '#d4a017' }} />bolts / welds</span>
            </label>
          )}
          {design && (
            <label className="no-print mt-2 flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={showFootings} onChange={(e) => setShowFootings(e.target.checked)} />
              Show designed footings to scale
              <span className="ml-1 inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: '#b45309' }} />ok</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: '#dc2626' }} />overlap</span>
            </label>
          )}
          <label className="no-print mt-2 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={showLoads} onChange={(e) => setShowLoads(e.target.checked)} />
            Show load diagrams on the model
            {showLoads && model && model.loads.length > 0 && (
              <span className="ml-2 flex flex-wrap gap-x-2 gap-y-0.5">
                {[...new Set(model.loads.map((l) => l.cat))].map((cat) => (
                  <span key={cat} className="inline-flex items-center gap-1">
                    <span className="inline-block h-2 w-3 rounded-sm" style={{ background: LOAD_COLOR[cat] ?? '#64748b' }} />{cat}
                  </span>
                ))}
              </span>
            )}
          </label>
          {govRes && (
            <div className="no-print mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
              <span className="font-medium">Force diagram:</span>
              <button type="button" onClick={() => setForceDiag(null)}
                className={`rounded px-1.5 py-0.5 font-semibold ${forceDiag === null ? 'bg-slate-200 text-slate-700' : 'text-slate-500 hover:text-slate-600'}`}>off</button>
              {(['N', 'Vy', 'Vz', 'My', 'Mz', 'T'] as DiagramComp[]).map((c) => (
                <button key={c} type="button" onClick={() => setForceDiag(c)}
                  title={`Draw ${c} on every member (governing combo)`}
                  className="rounded px-1.5 py-0.5 font-semibold transition"
                  style={forceDiag === c
                    ? { background: DIAG_COLOR[c], color: '#fff' }
                    : { color: DIAG_COLOR[c] }}>
                  {DIAG_LABEL[c]}
                </button>
              ))}
              {forceDiag && (
                <label className="ml-1 inline-flex items-center gap-1">
                  <span className="text-slate-500">scale</span>
                  <input type="range" min={0.3} max={3} step={0.1} value={forceDiagScale}
                    onChange={(e) => setForceDiagScale(Number(e.target.value))} className="h-1 w-20" />
                </label>
              )}
            </div>
          )}
        </div>

        {/* RIGHT — tabbed controls: one flat panel, hairline-separated sections (mockup) */}
        <div className="no-print overflow-hidden rounded-lg border border-[#e3e1da] bg-white">
          <div className="flex flex-wrap gap-0.5 border-b border-[#eeece5] px-3 py-2.5">
            {TABS.map((t) => <TabBtn key={t.id} id={t.id} label={t.label} active={tab === t.id} onClick={setTab} />)}
          </div>

          {/* ── GEOMETRY ── */}
          {tab === 'geometry' && (
            <div className="divide-y divide-[#eeece5] px-4 py-1">
              <Sec title="Column grid">
                <label className="flex flex-col text-sm">
                  <span className="mb-1 font-medium text-slate-600">Bays X (m, comma-sep)</span>
                  <input value={baysX} onChange={(e) => setBaysX(e.target.value)}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5" />
                </label>
                <label className="flex flex-col text-sm">
                  <span className="mb-1 font-medium text-slate-600">Bays Z (m)</span>
                  <input value={baysZ} onChange={(e) => setBaysZ(e.target.value)}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5" />
                </label>
                <label className="flex flex-col text-sm">
                  <span className="mb-1 font-medium text-slate-600">Storey heights (m)</span>
                  <input value={storeyH} onChange={(e) => setStoreyH(e.target.value)}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5" />
                </label>
                <div className="col-span-full">
                  <button type="button" onClick={() => generate()} className={`w-full ${btn}`}>Regenerate grid model</button>
                </div>
              </Sec>

              {model && (
                <Sec grid={false} title="Model">
                  <Row label="Nodes / members" value={`${model.nodes.length} / ${model.members.length}`}
                    sub={`${model.members.filter((m) => m.role === 'column').length} col · ${model.members.filter((m) => m.role !== 'column').length} bm`} />
                  <Row label="Slabs / loads" value={`${model.plates.length} / ${model.loads.length}`} />
                  <Row label="Storeys" value={`${model.storeys.length}`}
                    sub={model.storeys.map((s) => `${s.elevation} m`).join(' · ')} />
                </Sec>
              )}

              {model && (
                <div className="py-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[10px] font-bold uppercase tracking-[.12em] text-[#a39d8d]">Nodes</h3>
                    <button type="button" onClick={addNode}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50">+ Add node</button>
                  </div>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="text-left uppercase tracking-wide text-slate-500">
                          <th className="py-1 pr-2 font-semibold">Id</th>
                          <th className="py-1 pr-1 font-semibold">x</th>
                          <th className="py-1 pr-1 font-semibold">y</th>
                          <th className="py-1 pr-1 font-semibold">z</th>
                          <th className="py-1 pr-1 font-semibold" title="Fixed base support">Sup</th>
                          <th className="py-1" />
                        </tr>
                      </thead>
                      <tbody>
                        {model.nodes.map((n) => (
                          <tr key={n.id} className="border-t border-slate-100">
                            <td className="py-0.5 pr-2 font-medium">{n.id}</td>
                            {(['x', 'y', 'z'] as const).map((k) => (
                              <td key={k} className="py-0.5 pr-1">
                                <input type="number" step="0.5" value={n[k]}
                                  onChange={(e) => updNode(n.id, k, parseFloat(e.target.value))}
                                  className="w-14 rounded border border-slate-200 px-1 py-0.5" />
                              </td>
                            ))}
                            <td className="py-0.5 pr-1 text-center">
                              <input type="checkbox" checked={model.supports.some((s) => s.node === n.id)}
                                onChange={() => toggleSupport(n.id)} />
                            </td>
                            <td className="py-0.5 text-right">
                              <button type="button" onClick={() => { save(removeNode(model, n.id)); if (selected) setSelected(null) }}
                                className="rounded px-1.5 text-red-500 hover:bg-red-50" title="Remove node + attached members/plates/loads">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">Coordinates in m (y = up). Removing a node also removes everything attached to it.</p>
                </div>
              )}

              {model && (
                <div className="py-3.5">
                  <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#a39d8d]">Beams &amp; columns</h3>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="text-left uppercase tracking-wide text-slate-500">
                          <th className="py-1 pr-2 font-semibold">Id</th>
                          <th className="py-1 pr-1 font-semibold">Role</th>
                          <th className="py-1 pr-1 font-semibold">b</th>
                          <th className="py-1 pr-1 font-semibold">h</th>
                          <th className="py-1 pr-1 font-semibold">i</th>
                          <th className="py-1 pr-1 font-semibold">j</th>
                          <th className="py-1 pr-1 font-semibold" title="clear span (centreline length minus rigid end zones)">Lc</th>
                          <th className="py-1" />
                        </tr>
                      </thead>
                      <tbody>
                        {model.members.map((m) => {
                          const ms = sectionFor(m.id)
                          const pa = nodePos.get(m.i), pb = nodePos.get(m.j)
                          const Lfull = pa && pb ? pa.distanceTo(pb) : 0
                          const eI = m.offsets?.iEnd ?? autoOff?.get(m.id)?.offI
                          const eJ = m.offsets?.jEnd ?? autoOff?.get(m.id)?.offJ
                          const Lc = Math.max(Lfull - (eI ? Math.hypot(...eI) : 0) - (eJ ? Math.hypot(...eJ) : 0), 0)
                          const trimmed = Lc < Lfull - 1e-6
                          return (
                            <tr key={m.id} className={`border-t border-slate-100 ${m.id === selected ? 'bg-amber-50' : ''}`}>
                              <td className="py-0.5 pr-2 font-medium cursor-pointer" onClick={() => setSelected(m.id)}>{m.id}</td>
                              <td className="py-0.5 pr-1">
                                <select value={m.role} onChange={(e) => updMember(m.id, { role: e.target.value as MemberRole })}
                                  className="rounded border border-slate-200 px-1 py-0.5">
                                  <option value="beam">beam</option><option value="girder">girder</option>
                                  <option value="column">column</option><option value="brace">brace</option>
                                </select>
                              </td>
                              {(['b', 'h'] as const).map((k) => (
                                <td key={k} className="py-0.5 pr-1">
                                  <input type="number" step="50" value={ms?.[k] ?? 0}
                                    onChange={(e) => updMemberSize(m.id, k, parseFloat(e.target.value))}
                                    className="w-12 rounded border border-slate-200 px-1 py-0.5" />
                                </td>
                              ))}
                              {(['i', 'j'] as const).map((end) => (
                                <td key={end} className="py-0.5 pr-1">
                                  <select value={m[end]} onChange={(e) => updMember(m.id, { [end]: e.target.value })}
                                    className="max-w-[5rem] rounded border border-slate-200 px-1 py-0.5">
                                    {model.nodes.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
                                  </select>
                                </td>
                              ))}
                              <td className={`py-0.5 pr-1 tabular-nums ${trimmed ? 'font-semibold text-violet-700' : 'text-slate-500'}`}
                                title={trimmed ? `full ${Lfull.toFixed(2)} m` : 'no rigid end zone'}>
                                {Lc.toFixed(2)}
                              </td>
                              <td className="py-0.5 text-right">
                                <button type="button" onClick={() => { save(removeElements(model, new Set([m.id]))); if (selected === m.id) setSelected(null) }}
                                  className="rounded px-1.5 text-red-500 hover:bg-red-50">✕</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2 text-xs">
                    <select value={newRole} onChange={(e) => setNewRole(e.target.value as MemberRole)}
                      className="rounded border border-slate-200 px-1 py-0.5">
                      <option value="beam">beam</option><option value="girder">girder</option>
                      <option value="column">column</option><option value="brace">brace</option>
                    </select>
                    <select value={newI} onChange={(e) => setNewI(e.target.value)} className="max-w-[5.5rem] rounded border border-slate-200 px-1 py-0.5">
                      <option value="">node i…</option>
                      {model.nodes.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
                    </select>
                    <span className="text-slate-500">→</span>
                    <select value={newJ} onChange={(e) => setNewJ(e.target.value)} className="max-w-[5.5rem] rounded border border-slate-200 px-1 py-0.5">
                      <option value="">node j…</option>
                      {model.nodes.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
                    </select>
                    {(() => {
                      const dup = !!newI && !!newJ && model.members.some((m) => (m.i === newI && m.j === newJ) || (m.i === newJ && m.j === newI))
                      return (
                        <button type="button" onClick={addMember} disabled={!newI || !newJ || newI === newJ || dup}
                          title={dup ? 'A member already connects these two nodes' : undefined}
                          className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50 disabled:opacity-40">
                          {dup ? 'Member exists' : '+ Add member'}
                        </button>
                      )
                    })()}
                  </div>
                  {/* End releases panel — shown when a member is selected */}
                  {(() => {
                    const sel = model.members.find((m) => m.id === selected)
                    if (!sel) return null
                    const rel: MemberReleases = sel.releases ?? {}
                    const dofs = ['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'] as const
                    const updRel = (end: 'iEnd' | 'jEnd', dof: typeof dofs[number], v: boolean) => {
                      const cur = rel[end] ?? {}
                      updMember(sel.id, { releases: { ...rel, [end]: { ...cur, [dof]: v } } })
                    }
                    return (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs">
                        <p className="mb-1.5 font-semibold text-amber-800">End releases — {sel.id}</p>
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                              <th className="pr-2">End</th>
                              {dofs.map((d) => <th key={d} className="pr-1 text-center">{d}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {(['iEnd', 'jEnd'] as const).map((end) => (
                              <tr key={end}>
                                <td className="pr-2 font-medium text-slate-700">{end === 'iEnd' ? 'i' : 'j'}</td>
                                {dofs.map((dof) => (
                                  <td key={dof} className="pr-1 text-center">
                                    <input type="checkbox"
                                      checked={(rel[end] as Record<string, boolean> | undefined)?.[dof] ?? false}
                                      onChange={(e) => updRel(end, dof, e.target.checked)} />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="mt-1 text-[10px] text-slate-500">Check to release (zero force/moment). Mz = in-plane bending; My = out-of-plane. Click a member row to select.</p>
                      </div>
                    )
                  })()}
                  {/* Rigid end offsets — shown when a member is selected */}
                  {(() => {
                    const sel = model.members.find((m) => m.id === selected)
                    if (!sel) return null
                    const off = sel.offsets ?? {}
                    const axes = ['x', 'y', 'z'] as const
                    const updOff = (end: 'iEnd' | 'jEnd', ax: 0 | 1 | 2, v: number) => {
                      const cur: [number, number, number] = [...(off[end] ?? [0, 0, 0])] as [number, number, number]
                      cur[ax] = Number.isFinite(v) ? v : 0
                      const next = { ...off, [end]: cur }
                      // drop a zero vector so it doesn't linger in the model
                      if (next.iEnd && next.iEnd.every((c) => c === 0)) delete next.iEnd
                      if (next.jEnd && next.jEnd.every((c) => c === 0)) delete next.jEnd
                      updMember(sel.id, { offsets: Object.keys(next).length ? next : undefined })
                    }
                    return (
                      <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50 p-2 text-xs">
                        <p className="mb-1.5 font-semibold text-violet-800">Rigid end offsets (m) — {sel.id}</p>
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                              <th className="pr-2">End</th>
                              {axes.map((a) => <th key={a} className="pr-1 text-center">{a}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {(['iEnd', 'jEnd'] as const).map((end) => (
                              <tr key={end}>
                                <td className="pr-2 font-medium text-slate-700">{end === 'iEnd' ? 'i' : 'j'}</td>
                                {axes.map((_, ax) => (
                                  <td key={ax} className="pr-1">
                                    <input type="number" step="0.05" value={(off[end] ?? [0, 0, 0])[ax]}
                                      onChange={(e) => updOff(end, ax as 0 | 1 | 2, parseFloat(e.target.value))}
                                      className="w-14 rounded border border-violet-200 px-1 py-0.5 text-right" />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="mt-1 text-[10px] text-slate-500">Vector node→member-end (global m). The flexible member spans end→end; node↔end is a rigid arm (purple).</p>
                        <label className="mt-2 flex items-center gap-2 border-t border-violet-200 pt-2 text-[11px] text-slate-700">
                          <span>Auto rigid-zone factor override</span>
                          <input type="number" min={0} max={1} step={0.1}
                            value={sel.rigidZoneFactor ?? ''} placeholder="model"
                            onChange={(e) => {
                              const v = parseFloat(e.target.value)
                              updMember(sel.id, { rigidZoneFactor: Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined })
                            }}
                            className="w-16 rounded border border-violet-200 px-1 py-0.5 text-right" />
                          <span className="text-[10px] text-slate-500">blank = model factor · 0 = no zone for this member (needs Auto rigid end zones on)</span>
                        </label>
                        <label className="mt-2 flex items-center gap-2 border-t border-violet-200 pt-2 text-[11px] text-slate-700">
                          <span>Local axis rotation θ (°)</span>
                          <input type="number" step={15}
                            value={sel.axisRotation ?? ''} placeholder="auto"
                            onChange={(e) => {
                              const v = parseFloat(e.target.value)
                              updMember(sel.id, { axisRotation: Number.isFinite(v) ? v : undefined })
                            }}
                            className="w-16 rounded border border-violet-200 px-1 py-0.5 text-right" />
                          <span className="text-[10px] text-slate-500">ETABS local-axis angle about the member axis. Blank = default (vertical members 90° — depth d on global X); orients section stiffness, rigid zones and the drawn shape.</span>
                        </label>
                        {(sel.role === 'beam' || sel.role === 'girder') && (
                          <label className="mt-2 flex items-center gap-2 border-t border-violet-200 pt-2 text-[11px] text-slate-700">
                            <span>Lb unbraced length (m)</span>
                            <input type="number" min={0} step={0.1}
                              value={sel.Lb ?? ''} placeholder="full span"
                              onChange={(e) => {
                                const v = parseFloat(e.target.value)
                                updMember(sel.id, { Lb: Number.isFinite(v) && v > 0 ? v : undefined })
                              }}
                              className="w-16 rounded border border-violet-200 px-1 py-0.5 text-right" />
                            <span className="text-[10px] text-slate-500">§F2 LTB brace spacing — blank = full member length (conservative)</span>
                          </label>
                        )}
                        <div className="mt-2 border-t border-violet-200 pt-2">
                          <p className="mb-1 text-[11px] font-semibold text-violet-800">End connections — {sel.id}</p>
                          <div className="flex flex-wrap gap-3">
                            {(['iEnd', 'jEnd'] as const).map((end) => (
                              <label key={end} className="flex items-center gap-1.5 text-[11px] text-slate-700">
                                <span>{end === 'iEnd' ? 'i' : 'j'}-end</span>
                                <select value={sel.connections?.[end] ?? 'fixed'}
                                  onChange={(e) => {
                                    const k = e.target.value as 'simple' | 'moment' | 'fixed'
                                    const next = { ...(sel.connections ?? {}), [end]: k }
                                    updMember(sel.id, { connections: next })
                                  }}
                                  className="rounded border border-violet-200 px-1 py-0.5">
                                  <option value="fixed">Continuous</option>
                                  <option value="simple">Simple (pin)</option>
                                  <option value="moment">Moment (rigid)</option>
                                </select>
                              </label>
                            ))}
                          </div>
                          <span className="mt-1 block text-[10px] text-slate-500">Simple = shear-only pin (releases My, Mz — the connection hinge); Moment = rigid; drives both analysis and steel connection design.</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* ── Plates (slabs) ── */}
              {model && (
                <div className="py-3.5">
                  <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#a39d8d]">Slabs / plates</h3>
                  {model.plates.filter((p) => p.role !== 'wall').length === 0 ? (
                    <p className="text-xs text-slate-500">No slabs — generate a grid or add members forming closed panels.</p>
                  ) : (
                    <div className="max-h-60 overflow-auto">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="text-left uppercase tracking-wide text-slate-500">
                            <th className="py-1 pr-2 font-semibold">Slab</th>
                            <th className="py-1 pr-2 font-semibold">Corners</th>
                            <th className="py-1 pr-1 font-semibold">t (mm)</th>
                            <th className="py-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {model.plates.filter((p) => p.role !== 'wall').map((p) => (
                            <tr key={p.id} className={`border-t border-slate-100 ${p.id === selected ? 'bg-amber-50' : ''}`}>
                              <td className="py-0.5 pr-2 font-medium cursor-pointer" onClick={() => setSelected(p.id)}>{p.id}</td>
                              <td className="py-0.5 pr-2 text-slate-500">{p.corners.join(', ')}</td>
                              <td className="py-0.5 pr-1">
                                <input type="number" step="10" value={p.thickness}
                                  onChange={(e) => updPlateThickness(p.id, parseFloat(e.target.value))}
                                  className="w-16 rounded border border-slate-200 px-1 py-0.5" />
                              </td>
                              <td className="py-0.5 text-right">
                                <button type="button" onClick={() => { save(removeElements(model, new Set([p.id]))); if (selected === p.id) setSelected(null) }}
                                  className="rounded px-1.5 text-red-500 hover:bg-red-50">✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-slate-500">Thickness drives slab self-weight (t·γc) → tributary line loads on the edge beams.</p>
                </div>
              )}

              {/* ── Walls ── */}
              {model && (
                <div className="py-3.5">
                  <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#a39d8d]">Walls (on beams)</h3>
                  {(model.walls ?? []).length > 0 && (
                    <div className="mb-2 max-h-48 overflow-auto">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="text-left uppercase tracking-wide text-slate-500">
                            <th className="py-1 pr-2 font-semibold">On</th>
                            <th className="py-1 pr-1 font-semibold">h (m)</th>
                            <th className="py-1 pr-1 font-semibold">t (mm)</th>
                            <th className="py-1 pr-1 font-semibold">w (kN/m)</th>
                            <th className="py-1 pr-1 font-semibold">Type</th>
                            <th className="py-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {(model.walls ?? []).map((w) => (
                            <tr key={w.id} className="border-t border-slate-100">
                              <td className="py-0.5 pr-2 font-medium">{w.member}</td>
                              <td className="py-0.5 pr-1">{f1(w.height)}</td>
                              <td className="py-0.5 pr-1">{w.thickness}</td>
                              <td className="py-0.5 pr-1">{f1((w.thickness / 1000) * w.height * 24)}</td>
                              <td className="py-0.5 pr-1">{w.shearWall ? <span className="font-semibold text-purple-700">shear</span> : 'gravity'}</td>
                              <td className="py-0.5 text-right">
                                <button type="button" onClick={() => removeWall(w.id)} className="rounded px-1.5 text-red-500 hover:bg-red-50">✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2 text-xs">
                    <select value={wallMember} onChange={(e) => setWallMember(e.target.value)} className="max-w-[6rem] rounded border border-slate-200 px-1 py-0.5">
                      <option value="">on beam…</option>
                      {model.members.filter((m) => m.role === 'beam' || m.role === 'girder').map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                    </select>
                    <label className="inline-flex items-center gap-1">h <input type="number" step="0.5" value={wallH} onChange={(e) => setWallH(parseFloat(e.target.value) || 0)} className="w-12 rounded border border-slate-200 px-1 py-0.5" /></label>
                    <label className="inline-flex items-center gap-1">t <input type="number" step="10" value={wallT} onChange={(e) => setWallT(parseFloat(e.target.value) || 0)} className="w-14 rounded border border-slate-200 px-1 py-0.5" /></label>
                    <label className="inline-flex items-center gap-1"><input type="checkbox" checked={wallShear} onChange={(e) => setWallShear(e.target.checked)} /> shear wall</label>
                    {(() => {
                      const dup = !!wallMember && (model.walls ?? []).some((w) => w.member === wallMember)
                      return (
                        <button type="button" onClick={addWall} disabled={!wallMember || dup}
                          title={dup ? 'This beam already carries a wall' : undefined}
                          className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50 disabled:opacity-40">
                          {dup ? 'Wall exists' : '+ Add wall'}
                        </button>
                      )
                    })()}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">A wall adds its self-weight (t·h·γc) as a line load on the chosen beam. A “shear wall” also braces the storey below it — modelled as an equivalent X of diagonal struts (shear + flexure stiffness) so it carries seismic/wind in the analysis.</p>
                </div>
              )}
            </div>
          )}

          {/* ── PROPERTIES ── */}
          {tab === 'properties' && (
            <div className="divide-y divide-[#eeece5] px-4 py-1">
              <Sec title="Frame material">
                <Pick label="Members" value={material} onChange={(v) => {
                  const next = v as 'concrete' | 'steel' | 'wood'
                  setMaterial(next)
                  if (model) generate(next)          // auto-regenerate grid with new frame material
                }}
                  options={[['concrete', 'Reinforced concrete'], ['steel', 'Structural steel (AISC W)'], ['wood', 'Timber (wood frame)']]} />
                <p className="col-span-full -mt-1 text-[11px] text-slate-500">
                  {material === 'steel'
                    ? 'Members become AISC W-shapes designed to AISC 360-16 LRFD (§F flexure, §G shear, §E/§H1 columns); base plates per §J8. Slabs/footings stay reinforced concrete.'
                    : material === 'wood'
                      ? 'Members become solid-rectangular timber designed to NDS §3 / NSCP §6 (LRFD via Appendix N). Floor slabs become timber deck-on-joist floors (wood slab); footings stay reinforced concrete.'
                      : 'Members are reinforced concrete designed to NSCP 2015 / ACI 318-14.'}
                </p>
              </Sec>
              {material === 'steel' ? (
                <Sec title="Steel sections (AISC)">
                  <Pick label="Column family" value={colFam} onChange={(v) => { const f = v as SectionFamily; setColFam(f); setColShape(shapesOf(f)[0].name) }}
                    options={FAMILIES.map((f) => [f.id, f.label])} />
                  <Pick label="Column shape" value={colShape} onChange={setColShape}
                    options={shapesOf(colFam).map((sh) => [sh.name, sh.name])} />
                  <Pick label="Girder family" value={girFam} onChange={(v) => { const f = v as SectionFamily; setGirFam(f); setGirShape(shapesOf(f)[0].name) }}
                    options={FAMILIES.map((f) => [f.id, f.label])} />
                  <Pick label="Girder shape" value={girShape} onChange={setGirShape}
                    options={shapesOf(girFam).map((sh) => [sh.name, sh.name])} />
                  <Pick label="Beam family" value={beaFam} onChange={(v) => { const f = v as SectionFamily; setBeaFam(f); setBeaShape(shapesOf(f)[0].name) }}
                    options={FAMILIES.map((f) => [f.id, f.label])} />
                  <Pick label="Beam shape" value={beaShape} onChange={setBeaShape}
                    options={shapesOf(beaFam).map((sh) => [sh.name, sh.name])} />
                  <Num label="Steel Fy" unit="MPa" value={steelFy} onChange={setSteelFy} step="5" />
                  <Num label="Steel Fu" unit="MPa" value={steelFu} onChange={setSteelFu} step="5" />
                  <Num label="Slab thickness" unit="mm" value={slabThk} onChange={setSlabThk} />
                  <p className="col-span-full text-[11px] text-slate-500">
                    All AISC families (W/C/L/HSS/Pipe/WT) — analysis & 3D extrusion use the true section.
                    HSS/angles suit braces. Auto-design covers W/WT flexure + axial for any family; detailed
                    HSS/angle/channel flexure checks are not yet automated. Concrete f′c is still used for base-plate bearing.
                  </p>
                </Sec>
              ) : material === 'wood' ? (
                <Sec title="Timber (wood frame)">
                  <Pick label="Material source" value={matSource} onChange={(v) => {
                    const src = v as 'library' | 'custom'; setMatSource(src)
                    if (model) generate('wood', { sel: src === 'custom' && selectedCustom ? customAsSpecies(selectedCustom) : woodSel })
                  }} options={[['library', 'Built-in library'], ['custom', 'Custom material']]} />
                  {matSource === 'library' ? (
                    <>
                      <Pick label="Species" value={woodSpeciesId} onChange={(v) => {
                        const g = gradesOf(v)[0]?.grade ?? '2'
                        setWoodSpeciesId(v); setWoodGrade(g)
                        if (model) generate('wood', { sel: resolveWoodSpecies(v, g) })
                      }} options={speciesList().map((sp) => [sp.species, sp.label])} />
                      <Pick label="Grade" value={woodGrade} onChange={(v) => {
                        setWoodGrade(v)
                        if (model) generate('wood', { sel: resolveWoodSpecies(woodSpeciesId, v) })
                      }} options={gradesOf(woodSpeciesId).map((g) => [g.grade, g.gradeLabel])} />
                    </>
                  ) : (
                    <MaterialLibrary materials={customMaterials} selectedId={customId}
                      onSelect={(id, cm) => {
                        setCustomId(id)
                        if (model) generate('wood', { sel: cm ? customAsSpecies(cm) : woodSel })
                      }}
                      onChange={(list) => { setCustomMaterials(list); saveCustomMaterials(list) }} />
                  )}
                  <label className="col-span-full flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={woodWet}
                      onChange={(e) => { setWoodWet(e.target.checked); if (model) generate('wood', { wet: e.target.checked }) }} />
                    Wet service — MC &gt; 19% sawn / 16% glulam (applies C<sub>M</sub>)
                  </label>
                  <p className="col-span-full -mb-1 text-[11px] text-slate-500">
                    Solid rectangular b × d members. Each starts from its role size and grows independently
                    when optimised; columns are kept ≥ girders ≥ beams in width.
                  </p>
                  <Num label="Column b" unit="mm" value={colB} onChange={setColB} />
                  <Num label="Column d" unit="mm" value={colH} onChange={setColH} />
                  <Num label="Girder b" unit="mm" value={girB} onChange={setGirB} />
                  <Num label="Girder d" unit="mm" value={girH} onChange={setGirH} />
                  <Num label="Beam b" unit="mm" value={beaB} onChange={setBeaB} />
                  <Num label="Beam d" unit="mm" value={beaH} onChange={setBeaH} />
                  <Num label="Slab thickness" unit="mm" value={slabThk} onChange={setSlabThk} />
                  <p className="col-span-full text-[11px] text-slate-500">
                    Designed to NDS §3 / NSCP §6: reference values ({woodKind === 'glulam' ? 'glulam' : 'sawn'}, {activeWood.origin})
                    adjusted by C<sub>D</sub>/C<sub>M</sub>/C<sub>F</sub>/C<sub>V</sub>, beam stability C<sub>L</sub> and column
                    stability C<sub>P</sub>; factored demands checked LRFD (Appendix N, K<sub>F</sub>·φ·λ). Floor slabs become timber decks; footings stay reinforced concrete.
                  </p>
                </Sec>
              ) : (
                <Sec title="Initial member sizes (mm)">
                  <p className="col-span-full -mb-1 text-[11px] text-slate-500">
                    Each member starts from its role size and grows independently when optimised;
                    columns are kept ≥ girders ≥ beams in width (strong-column / weak-beam).
                  </p>
                  <Num label="Column b" unit="mm" value={colB} onChange={setColB} />
                  <Num label="Column h" unit="mm" value={colH} onChange={setColH} />
                  <Num label="Girder b" unit="mm" value={girB} onChange={setGirB} />
                  <Num label="Girder h" unit="mm" value={girH} onChange={setGirH} />
                  <Num label="Beam b" unit="mm" value={beaB} onChange={setBeaB} />
                  <Num label="Beam h" unit="mm" value={beaH} onChange={setBeaH} />
                  <Num label="Slab thickness" unit="mm" value={slabThk} onChange={setSlabThk} />
                </Sec>
              )}
              <Sec title="Concrete & reinforcement">
                <p className="col-span-full -mb-1 text-[11px] text-slate-500">
                  Shared material applied to every section when you generate the grid. f′c drives Ec and the
                  flexural/shear capacities; fy the steel; ⌀ and cover the bar layout and effective depth.
                  {material === 'steel' && ' (Used for slabs, footings and base-plate bearing.)'}
                  {material === 'wood' && ' (Used for the concrete slabs and footings of the timber frame.)'}
                </p>
                <Num label="Concrete f′c" unit="MPa" value={fc} onChange={setFc} step="0.5" />
                <Num label="Steel fy" unit="MPa" value={fy} onChange={setFy} step="5" />
                <Pick label="Main bar ⌀ (mm)" value={String(barDia)} onChange={(v) => setBarDia(+v)}
                  options={[['12', '⌀12'], ['16', '⌀16'], ['20', '⌀20'], ['25', '⌀25'], ['28', '⌀28'], ['32', '⌀32'], ['36', '⌀36']]} />
                <Pick label="Tie / stirrup ⌀ (mm)" value={String(tieDia)} onChange={(v) => setTieDia(+v)}
                  options={[['10', '⌀10'], ['12', '⌀12'], ['16', '⌀16']]} />
                <Num label="Clear cover" unit="mm" value={cover} onChange={setCover} step="5" />
                <Num label="Concrete unit wt γc" unit="kN/m³" value={gammaC} onChange={setGammaC} step="0.5" />
              </Sec>
              <Sec title="Beam design method" hint="flanged / rectangular">
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={tBeamOn} onChange={(e) => setTBeamOn(e.target.checked)} />
                  <span>Design beams as T-beams — §6.3.2 flange from the adjoining slabs for sagging sections (when a ≤ hf). Off = plain rectangular web.</span>
                </label>
                <p className="col-span-full text-[11px] text-slate-500">
                  Sagging sections that get flange action are tagged “T bf=…” in the schedule and drawn as a T-section.
                </p>
              </Sec>
              <Sec title="Prestressing — beams & girders" hint="§24.5 · PCI losses">
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={psOn} onChange={(e) => setPsOn(e.target.checked)} />
                  <span>Check beam/girder members as pretensioned bonded (beside the RC design)</span>
                </label>
                {psOn && (<>
                  <Num label="Aps" unit="mm²" value={psAps} onChange={setPsAps} />
                  <Num label="fpu" unit="MPa" value={psFpu} onChange={setPsFpu} />
                  <Num label="Eccentricity e" unit="mm" value={psE} onChange={setPsE} />
                  <Num label="f'ci (transfer)" unit="MPa" value={psFci} onChange={setPsFci} />
                </>)}
                <div className="col-span-full">
                  <button type="button" disabled={!model}
                    onClick={() => model && save({
                      ...model,
                      sections: model.sections.map((sc) => {
                        const isBeamSec = model.members.some((mm) => mm.section === sc.id && mm.role !== 'column')
                        if (!isBeamSec || sc.material === 'steel') return sc
                        if (!psOn) { const { ps: _drop, ...rest } = sc; return rest }
                        return { ...sc, ps: { Aps: psAps, fpu: psFpu, e: psE, fci: psFci } }
                      }),
                    })}
                    className={`w-full ${btn}`}>
                    {psOn ? 'Apply prestressing to beam sections' : 'Clear prestressing from beam sections'}
                  </button>
                </div>
                <p className="col-span-full text-[11px] text-slate-500">
                  The pipeline back-derives equivalent gravity UDLs from the D/L solves (w = 8M/L²) and runs the
                  full prestressed engine per member — losses, transfer/service stresses, fps/φMn, 1.2Mcr.
                </p>
              </Sec>
              <p className="text-[11px] text-slate-500">
                Per-member b×h are editable in the Geometry → Beams &amp; columns table; slab thickness per panel
                in Geometry → Slabs. f′c, fy, ⌀, cover and slab thickness are applied when you generate a new grid;
                γc feeds self-weight (members + slabs) and seismic mass — change it, then “Rebuild D + L” (Loading)
                or regenerate. Bar Ø here is the starting size — the design/optimise engines may pick another when
                “try alternative bar sizes” is on (Analysis).
              </p>
            </div>
          )}

          {/* ── SUPPORTS ── */}
          {tab === 'supports' && (
            <div className="divide-y divide-[#eeece5] px-4 py-1">
              <Sec title="Soil (footing design)">
                <Num label="Soil qa" unit="kPa" value={qa} onChange={setQa} />
                <Num label="Footing depth H" unit="m" value={Hf} onChange={setHf} />
                <Num label="Soil unit wt γsoil" unit="kN/m³" value={gammaSoil} onChange={setGammaSoil} step="0.5" />
                <p className="col-span-full text-[11px] text-slate-500">
                  Base supports are toggled per node in the Geometry → Nodes table (“Sup” column).
                  qa is the allowable bearing; γsoil is the overburden weight deducted for the net bearing
                  (q_net = qa − γsoil·Ds − γc·Dc). Applied on the next Design / Optimize.
                </p>
              </Sec>
              {model && model.supports.length > 0 && (
                <div className="py-3.5">
                  <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#a39d8d]">Support fixity</h3>
                  <p className="mb-2 text-xs text-slate-500">
                    Fixed = all 6 DOFs clamped. Pin = 3 translations free to rotate. Spring = translational springs (kN/m).
                  </p>
                  <div className="overflow-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="text-left uppercase tracking-wide text-slate-500">
                          <th className="py-1 pr-2 font-semibold">Node</th>
                          <th className="py-1 pr-2 font-semibold">Fixity</th>
                          <th className="py-1 pr-1 font-semibold">kx (kN/m)</th>
                          <th className="py-1 pr-1 font-semibold">ky (kN/m)</th>
                          <th className="py-1 font-semibold">kz (kN/m)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {model.supports.map((s) => (
                          <tr key={s.node} className="border-t border-slate-100">
                            <td className="py-0.5 pr-2 font-medium">{s.node}</td>
                            <td className="py-0.5 pr-2">
                              <select value={s.fixity}
                                onChange={(e) => updSupport(s.node, { fixity: e.target.value as SupportFixity })}
                                className="rounded border border-slate-200 px-1 py-0.5">
                                <option value="fixed">fixed</option>
                                <option value="pin">pin</option>
                                <option value="spring">spring</option>
                              </select>
                            </td>
                            {(['kx', 'ky', 'kz'] as const).map((k) => (
                              <td key={k} className="py-0.5 pr-1">
                                {s.fixity === 'spring' ? (
                                  <input type="number" step="100" value={s[k] ?? 0}
                                    onChange={(e) => updSupport(s.node, { [k]: parseFloat(e.target.value) || 0 })}
                                    className="w-20 rounded border border-slate-200 px-1 py-0.5" />
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {model && model.supports.length > 0 && (
                <div className="py-3.5">
                  <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#a39d8d]">Footing plan</h3>
                  <p className="mb-2 text-xs text-slate-500">
                    Each base support gets an isolated square footing by default — pick a partner node to design the
                    pair as one combined footing instead (close columns / property-line situations).
                  </p>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                    {model.supports.map((s) => {
                      const partner = planSel[s.node] ?? ''
                      const takenBy = Object.entries(planSel).find(([n, p]) => p === s.node && n !== s.node)?.[0]
                      const adj = adjacentBases(s.node)            // only neighbours can be combined
                      return (
                        <label key={s.node} className="flex items-center gap-2 text-xs">
                          <span className="w-16 font-medium">{s.node}</span>
                          {takenBy ? (
                            <span className="text-slate-500">combined with {takenBy}</span>
                          ) : (
                            <select value={partner}
                              onChange={(e) => setPlanSel((p) => ({ ...p, [s.node]: e.target.value }))}
                              className="flex-1 rounded border border-slate-200 px-1 py-0.5">
                              <option value="">isolated</option>
                              {model.supports.filter((o) => o.node !== s.node && !planSel[o.node] && adj.has(o.node))
                                .map((o) => <option key={o.node} value={o.node}>combine with {o.node}</option>)}
                            </select>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── LOADING ── */}
          {tab === 'loading' && (
            <div className="divide-y divide-[#eeece5] px-4 py-1">
              <Sec title="Slab loads">
                <Num label="Default SDL" unit="kPa" value={qD} onChange={setQD} />
                <Num label="Live load" unit="kPa" value={qL} onChange={setQL} />
                <p className="col-span-full text-[11px] text-slate-500">
                  “Default SDL” applies to any slab without a composed NSCP-204 SDL below. Live load is shared.
                </p>
              </Sec>

              {/* NSCP 204 superimposed-dead-load composer (per slab) */}
              <div className="py-3.5">
                <h3 className="mb-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#a39d8d]">Superimposed dead load — NSCP 204</h3>
                <p className="mb-2 text-[11px] text-slate-500">
                  Build the SDL from finishes/ceilings/partitions (Table 204-1, kPa) and material layers
                  (Table 204-2, γ × thickness). Then apply it to every slab, or to the slab selected in the 3D view.
                </p>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {/* Table 204-1 components */}
                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-slate-600">Table 204-1 — components (kPa)</p>
                    <div className="max-h-44 space-y-0.5 overflow-auto pr-1">
                      {TABLE_204_1.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-[11px]">
                          <input type="checkbox" checked={sdlDraft.some((x) => x.id === c.id)} onChange={() => toggleSdl204_1(c)} />
                          <span className="flex-1">{c.label}</span>
                          <span className="text-slate-500">{c.kPa.toFixed(2)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {/* Table 204-2 material layers + the running composition */}
                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-slate-600">Table 204-2 — material layer (γ × t)</p>
                    <div className="flex flex-wrap items-end gap-2">
                      <select value={sdlMatId} onChange={(e) => setSdlMatId(e.target.value)}
                        className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs">
                        {TABLE_204_2.map((mtl) => <option key={mtl.id} value={mtl.id}>{mtl.label} ({mtl.gamma})</option>)}
                      </select>
                      <input type="number" value={sdlMatT} onChange={(e) => setSdlMatT(parseFloat(e.target.value))}
                        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs" /> <span className="text-[11px] text-slate-500">mm</span>
                      <button type="button" onClick={addSdl204_2}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50">+ Add</button>
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {sdlDraft.length === 0 && <p className="text-[11px] text-slate-500">No components selected.</p>}
                      {sdlDraft.map((it, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          <span className="flex-1">{it.label}</span>
                          <span className="text-slate-500">{sdlItemKPa(it).toFixed(2)} kPa</span>
                          <button type="button" onClick={() => removeSdlItem(i)} className="rounded px-1 text-red-500 hover:bg-red-50">✕</button>
                        </div>
                      ))}
                      <div className="mt-1 border-t border-slate-100 pt-1 text-[11px] font-semibold">
                        Composed SDL = <span className="text-[#0f4c92]">{sdlTotal(sdlDraft).toFixed(2)} kPa</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => applySdl(true)} disabled={!model}
                    className="rounded-md bg-[#0f4c92] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Apply to all slabs</button>
                  <button type="button" onClick={() => applySdl(false)} disabled={!selPlate || selPlate.role === 'wall'}
                    className="rounded-md border border-[#0f4c92] px-3 py-1.5 text-xs font-semibold text-[#0f4c92] disabled:opacity-40"
                    title="Select a slab panel in the 3D view first">
                    Apply to selected slab{selPlate && selPlate.role !== 'wall' ? ` (${selPlate.id})` : ''}
                  </button>
                  <span className="text-[11px] text-slate-500">Empty composition clears a slab back to the default SDL.</span>
                </div>
              </div>

              {/* NSCP 205-1 / 206 live-load occupancy (per slab) */}
              <div className="py-3.5">
                <h3 className="mb-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#a39d8d]">Live load — NSCP 205 / 206</h3>
                <p className="mb-2 text-[11px] text-slate-500">
                  Pick the occupancy (Table 205-1) or other minimum load (§206); its uniform live load overrides the
                  default LL for the chosen slabs.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <select value={liveOccId} onChange={(e) => setLiveOccId(e.target.value)}
                    className="min-w-[16rem] flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs">
                    <option value="">— default LL ({qL} kPa) —</option>
                    {['Residential', 'Office', 'School', 'Assembly', 'Mercantile', 'Storage', 'Institutional', 'Parking'].map((g) => (
                      <optgroup key={g} label={`205-1 · ${g}`}>
                        {TABLE_205_1.filter((o) => o.group === g).map((o) => <option key={o.id} value={o.id}>{o.label} — {o.kPa} kPa</option>)}
                      </optgroup>
                    ))}
                    <optgroup label="§206 · other minimum loads">
                      {TABLE_206.map((o) => <option key={o.id} value={o.id}>{o.label} — {o.kPa} kPa</option>)}
                    </optgroup>
                  </select>
                  <button type="button" onClick={() => applyLive(true)} disabled={!model}
                    className="rounded-md bg-[#0f4c92] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Apply to all slabs</button>
                  <button type="button" onClick={() => applyLive(false)} disabled={!selPlate || selPlate.role === 'wall'}
                    className="rounded-md border border-[#0f4c92] px-3 py-1.5 text-xs font-semibold text-[#0f4c92] disabled:opacity-40">
                    Apply to selected{selPlate && selPlate.role !== 'wall' ? ` (${selPlate.id})` : ''}
                  </button>
                </div>
              </div>

              {/* Persistent per-panel editor — every slab's SDL & live load */}
              {model && model.plates.filter((p) => p.role !== 'wall').length > 0 && (
                <div className="py-3.5">
                  <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#a39d8d]">Per-panel loads</h3>
                  <div className="max-h-64 overflow-auto">
                    <table className="w-full border-collapse text-[11px]">
                      <thead>
                        <tr className="text-left uppercase tracking-wide text-slate-500">
                          <th className="py-1 pr-2 font-semibold">Slab</th>
                          <th className="py-1 pr-2 text-right font-semibold">SDL</th>
                          <th className="py-1 pr-2 font-semibold">SDL source</th>
                          <th className="py-1 pr-2 text-right font-semibold">LL</th>
                          <th className="py-1 pr-2 font-semibold">Occupancy (205-1 / 206)</th>
                          <th className="py-1 pr-2 font-semibold">Deck</th>
                          <th className="py-1 font-semibold" />
                        </tr>
                      </thead>
                      <tbody>
                        {model.plates.filter((p) => p.role !== 'wall').map((p) => {
                          const composed = !!(p.sdlItems && p.sdlItems.length > 0)
                          return (
                            <tr key={p.id} className={`border-t border-slate-100 ${selected === p.id ? 'bg-blue-50/60' : ''}`}>
                              <td className="py-0.5 pr-2 font-medium cursor-pointer hover:text-[#0f4c92]" onClick={() => setSelected(p.id)}>{p.id}</td>
                              <td className="py-0.5 pr-2 text-right">{(composed ? sdlTotal(p.sdlItems) : qD).toFixed(2)}</td>
                              <td className="py-0.5 pr-2 text-slate-500">{composed ? `204 (${p.sdlItems!.length})` : 'default'}</td>
                              <td className="py-0.5 pr-2 text-right">{(p.live ? p.live.kPa : qL).toFixed(2)}</td>
                              <td className="py-0.5 pr-2">
                                <select value={p.live?.id ?? ''} onChange={(e) => setSlabLive(p.id, e.target.value)}
                                  className="w-full rounded border border-slate-200 px-1 py-0.5 text-[11px]">
                                  <option value="">default ({qL})</option>
                                  {[...TABLE_205_1, ...TABLE_206].map((o) => <option key={o.id} value={o.id}>{o.label} — {o.kPa}</option>)}
                                </select>
                              </td>
                              <td className="py-0.5 pr-2">
                                <button type="button" onClick={() => setPlateDeck(p.id, p.deck ? undefined : DEFAULT_DECK)}
                                  title={p.deck ? 'Remove the timber deck (revert to RC slab)' : 'Make this a timber deck-on-joist floor (wood slab)'}
                                  className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${p.deck ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'text-[#0f4c92] hover:bg-blue-50'}`}>
                                  {p.deck ? 'timber ✓' : '+ timber'}
                                </button>
                              </td>
                              <td className="py-0.5 whitespace-nowrap text-right">
                                <button type="button" onClick={() => setSlabSdl(p.id, false)} title="Apply the composed SDL above to this slab"
                                  className="rounded px-1.5 text-[#0f4c92] hover:bg-blue-50">set SDL</button>
                                <button type="button" onClick={() => setSlabSdl(p.id, true)} title="Clear to default SDL"
                                  className="rounded px-1.5 text-red-500 hover:bg-red-50">clear</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    “set SDL” writes the composition built above to that panel; the occupancy dropdown sets its NSCP-205 live load.
                    “+ timber” turns a panel into a timber deck-on-joist floor (designed by the wood-slab engine, reported like RC). Click a slab id to select it in 3D.
                  </p>
                  {selPlate && selPlate.role !== 'wall' && selPlate.deck && (() => {
                    const d = selPlate.deck!
                    const gopts = gradesOf(d.joistSpecies?.split('-')[0] ?? 'DFL')
                    return (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                        <h4 className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-amber-700">Timber deck — {selPlate.id} (NDS §3 / NSCP §6)</h4>
                        <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                          <label className="flex flex-col">Species
                            <select value={d.joistSpecies?.split('-')[0] ?? 'DFL'} onChange={(e) => { const sp = e.target.value; const g = gradesOf(sp); patchDeck(selPlate.id, { joistSpecies: g.length ? g[0].id : `${sp}-2`, joistKind: g[0]?.kind ?? 'sawn' }) }}
                              className="mt-0.5 rounded border border-slate-300 px-1 py-0.5">
                              {speciesList().map((s) => <option key={s.species} value={s.species}>{s.label}</option>)}
                            </select>
                          </label>
                          <label className="flex flex-col">Grade
                            <select value={d.joistSpecies ?? ''} onChange={(e) => patchDeck(selPlate.id, { joistSpecies: e.target.value })}
                              className="mt-0.5 rounded border border-slate-300 px-1 py-0.5">
                              {gopts.map((g) => <option key={g.id} value={g.id}>{g.gradeLabel}</option>)}
                            </select>
                          </label>
                          <label className="flex flex-col">Joist b (mm)
                            <input type="number" value={d.joistB} onChange={(e) => patchDeck(selPlate.id, { joistB: +e.target.value || 0 })} className="mt-0.5 rounded border border-slate-300 px-1 py-0.5" />
                          </label>
                          <label className="flex flex-col">Joist d (mm)
                            <input type="number" value={d.joistD} onChange={(e) => patchDeck(selPlate.id, { joistD: +e.target.value || 0 })} className="mt-0.5 rounded border border-slate-300 px-1 py-0.5" />
                          </label>
                          <label className="flex flex-col">Spacing (mm)
                            <input type="number" value={d.joistSpacing} onChange={(e) => patchDeck(selPlate.id, { joistSpacing: +e.target.value || 0 })} className="mt-0.5 rounded border border-slate-300 px-1 py-0.5" />
                          </label>
                          <label className="flex flex-col">Deck
                            <select value={d.deckMaterial} onChange={(e) => patchDeck(selPlate.id, { deckMaterial: e.target.value as WoodDeck['deckMaterial'], deckWidth: e.target.value === 'bamboo-slat' ? 50 : 140 })}
                              className="mt-0.5 rounded border border-slate-300 px-1 py-0.5">
                              <option value="plank">Plank</option>
                              <option value="bamboo-slat">Bamboo slat</option>
                            </select>
                          </label>
                          <label className="flex flex-col">Deck t (mm)
                            <input type="number" value={d.deckThickness} onChange={(e) => patchDeck(selPlate.id, { deckThickness: +e.target.value || 0 })} className="mt-0.5 rounded border border-slate-300 px-1 py-0.5" />
                          </label>
                          <label className="flex flex-col">Joist support
                            <select value={d.joistSupport ?? 'simple'} onChange={(e) => patchDeck(selPlate.id, { joistSupport: e.target.value as WoodDeck['joistSupport'] })}
                              className="mt-0.5 rounded border border-slate-300 px-1 py-0.5">
                              <option value="simple">Simple</option>
                              <option value="continuous">Continuous</option>
                            </select>
                          </label>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {model && (
                <div className="py-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[10px] font-bold uppercase tracking-[.12em] text-[#a39d8d]">Loads</h3>
                    <button type="button" onClick={rebuildGravity}
                      title="Regenerate dead (member self-weight + slab self-weight + SDL) and live loads from the inputs; keeps E loads"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50">↻ Rebuild D + L</button>
                  </div>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="text-left uppercase tracking-wide text-slate-500">
                          <th className="py-1 pr-2 font-semibold">Cat</th>
                          <th className="py-1 pr-2 font-semibold">Target</th>
                          <th className="py-1 pr-1 font-semibold">Value</th>
                          <th className="py-1" />
                        </tr>
                      </thead>
                      <tbody>
                        {model.loads.map((l: ModelLoad, idx) => {
                          const target = l.kind === 'node' ? l.node : l.kind === 'area' ? l.plate : l.member
                          const val = l.kind === 'area' ? l.q : l.kind === 'member-udl' ? l.w : l.kind === 'member-point' ? l.P : l.kind === 'member-thermal' ? l.deltaT : null
                          const unit = l.kind === 'area' ? 'kPa' : l.kind === 'member-udl' ? 'kN/m' : l.kind === 'member-thermal' ? '°C' : 'kN'
                          return (
                            <tr key={idx} className="border-t border-slate-100">
                              <td className={`py-0.5 pr-2 font-semibold ${l.cat === 'D' ? 'text-slate-600' : l.cat === 'L' ? 'text-emerald-700' : l.cat === 'T' ? 'text-amber-600' : 'text-purple-700'}`}>{l.cat}</td>
                              <td className="py-0.5 pr-2">{l.kind === 'node' ? '·' : l.kind === 'area' ? '▦' : l.kind === 'member-thermal' ? '🌡' : '—'} {target}</td>
                              <td className="py-0.5 pr-1 whitespace-nowrap">
                                {val !== null ? (
                                  <>
                                    <input type="number" step="0.1" value={val}
                                      onChange={(e) => updLoad(idx, parseFloat(e.target.value))}
                                      className="w-16 rounded border border-slate-200 px-1 py-0.5" /> {unit}
                                    {l.kind === 'member-thermal' && <span className="ml-1 text-slate-500">(α = {(l.alpha * 1e6).toFixed(1)}×10⁻⁶)</span>}
                                  </>
                                ) : (
                                  <span className="text-slate-500">
                                    {l.kind === 'node' ? ['Fx' as const, 'Fy' as const, 'Fz' as const]
                                      .filter((k) => (l[k] ?? 0) !== 0).map((k) => `${k}=${f1(l[k]!)}`).join(' ') + ' kN' : ''}
                                  </span>
                                )}
                              </td>
                              <td className="py-0.5 text-right">
                                <button type="button" onClick={() => delLoad(idx)}
                                  className="rounded px-1.5 text-red-500 hover:bg-red-50">✕</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Dead = self-weight (members from b×h, slabs from t, γc = 24 kN/m³) + the SDL input; live = the LL
                    input. “Rebuild” regenerates both after you edit the frame.
                  </p>
                </div>
              )}

              {model && (
                <Sec title="Thermal / temperature loads">
                  <label className="flex flex-col text-sm">
                    <span className="mb-1 font-medium text-slate-600">Member</span>
                    <select value={thMember} onChange={(e) => setThMember(e.target.value)}
                      className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0f4c92] focus:outline-none">
                      <option value="">— select member —</option>
                      {model.members.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                    </select>
                  </label>
                  <Num label="Temperature change ΔT" unit="°C" value={thDeltaT} onChange={setThDeltaT} step="5"
                    hint="+ve = heating (expansion); −ve = cooling (contraction)" />
                  <label className="flex flex-col text-sm">
                    <span className="mb-1 font-medium text-slate-600">Expansion coeff. α</span>
                    <select value={thAlphaKey} onChange={(e) => setThAlphaKey(e.target.value as 'steel' | 'concrete' | 'custom')}
                      className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0f4c92] focus:outline-none">
                      <option value="steel">Steel — 11.7×10⁻⁶ /°C (AISC)</option>
                      <option value="concrete">Concrete — 10×10⁻⁶ /°C (ACI 318)</option>
                      <option value="custom">Custom</option>
                    </select>
                    {thAlphaKey === 'custom' && (
                      <input type="number" step="1e-7" value={thAlphaCustom}
                        onChange={(e) => setThAlphaCustom(parseFloat(e.target.value))}
                        className="mt-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0f4c92] focus:outline-none focus:ring-1 focus:ring-[#0f4c92]" />
                    )}
                  </label>
                  <div className="col-span-full">
                    <button type="button"
                      disabled={!thMember || !Number.isFinite(thDeltaT) || !Number.isFinite(thAlpha) || thAlpha <= 0}
                      onClick={() => {
                        if (!model || !thMember) return
                        save({ ...model, loads: [...model.loads, { kind: 'member-thermal', member: thMember, deltaT: thDeltaT, alpha: thAlpha, cat: 'T' }] })
                      }}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50 disabled:opacity-40">
                      + Add thermal load
                    </button>
                  </div>
                  <p className="col-span-full text-[10px] text-slate-500">
                    Equivalent axial force P_T = EA·α·ΔT applied as self-equilibrating end forces (AISC 360-16 Commentary §C2). Treated as dead load (D) in NSCP 2015 combinations. Thermal effects appear in the member N diagram after Analyze.
                  </p>
                </Sec>
              )}

              <Sec title="Seismic — NSCP 208 static force">
                <div className="col-span-full -mt-1 flex justify-end">
                  <HintButton title="Seismic input guide — NSCP 208"><SeismicHint /></HintButton>
                </div>
                <Num label="Ca" value={Ca} onChange={setCa} />
                <Num label="Cv" value={Cv} onChange={setCv} />
                <Num label="R" value={Rw} onChange={setRw} />
                <Num label="I" value={Ie} onChange={setIe} />
                <Num label="Z (zone)" value={Zf} onChange={setZf} />
                <Num label="Nv (near-source)" value={Nv} onChange={setNv} />
                <DirPicker value={eDirs} onChange={setEDirs} />
                <label className="col-span-full flex items-start gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={methodB} onChange={(e) => setMethodB(e.target.checked)} className="mt-0.5" />
                  <span>
                    Method-B period (§208.5.2.2) — use the modal fundamental period per axis, capped at {Zf >= 0.4 ? '1.3' : '1.4'}·Ta.
                    {!modal && <span className="text-slate-500"> No modal result yet — run Modal (Dynamics) first, else Method A is used.</span>}
                  </span>
                </label>
                <label className="col-span-full flex items-start gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={accTor} onChange={(e) => setAccTor(e.target.checked)} className="mt-0.5" />
                  <span>
                    Accidental torsion ±5% (§208.7.2.7) — each E case splits into ⟳/⟲ variants carrying a ±0.05·L⊥ storey torque
                    (a mass-weighted force couple about the level&apos;s mass centroid), enveloped by Design/Optimize.
                  </span>
                </label>
                <label className="col-span-full flex items-start gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={orth30} onChange={(e) => setOrth30(e.target.checked)} className="mt-0.5" />
                  <span>
                    Orthogonal effects 100%+30% (§208.8.1) — every E case also carries ±30% of the perpendicular direction.
                    Required for corner columns / elements common to two intersecting lateral systems; doubles the case count.
                  </span>
                </label>
                <label className="col-span-full flex items-start gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={evOn} onChange={(e) => setEvOn(e.target.checked)} className="mt-0.5" />
                  <span>
                    Vertical component Ev = 0.5·Ca·I·D (§208.4.1) — E combos become {(1.2 + 0.5 * Ca * Ie).toFixed(2)}D + 1.0E + f₁L + 0.2S
                    and {(0.9 - 0.5 * Ca * Ie).toFixed(2)}D + 1.0E (uplift).
                  </span>
                </label>
                <div className="col-span-full">
                  <button type="button" onClick={generateE} disabled={!model || eDirs.length === 0}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50 disabled:opacity-40">⚡ Generate E cases</button>
                  {seis && (() => {
                    const other = seisXZ ? seisXZ[primAxis === 'x' ? 'z' : 'x'] : null
                    const twoAxis = !!other && (Math.abs(other.V - seis.V) > 1e-6 || Math.abs(other.T - seis.T) > 1e-9)
                    const sx = seisXZ?.x, sz = seisXZ?.z
                    return (
                    <div className="mt-1 space-y-1">
                      <p className="text-xs text-slate-500">
                        {twoAxis ? `${primAxis.toUpperCase()}: ` : ''}T = {seis.T.toFixed(3)} s{seis.Tmethod === 'B' ? ` (Method B, Ta = ${seis.Ta.toFixed(3)} s)` : ''} · W = {f1(seis.W)} kN · V = {f1(seis.V)} kN
                        {seis.V === seis.Vmax ? ' (2.5CaIW/R cap governs)'
                          : seis.Vsrc > 0 && seis.V === seis.Vsrc ? ' (Zone-4 0.8ZNvIW/R floor governs)'
                            : seis.V === seis.Vmin ? ' (0.11CaIW floor governs)' : ''}
                        {seis.Ft > 0 ? ` · Ft = ${f1(seis.Ft)} kN` : ''} — {eCases.length} cat-E case{eCases.length === 1 ? '' : 's'} ({eDirs.join(', ') || 'none'}).
                        {Zf >= 0.4 ? ` Zone-4 floor = ${f1(seis.Vsrc)} kN.` : ' (Zone-4 floor off: Z < 0.4)'}
                      </p>
                      {twoAxis && other && (
                        <p className="text-xs text-slate-500">
                          {primAxis === 'x' ? 'Z' : 'X'}: T = {other.T.toFixed(3)} s{other.Tmethod === 'B' ? ` (Method B, Ta = ${other.Ta.toFixed(3)} s)` : ''} · V = {f1(other.V)} kN{other.Ft > 0 ? ` · Ft = ${f1(other.Ft)} kN` : ''}
                        </p>
                      )}
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="text-left uppercase tracking-wide text-slate-500">
                            <th className="py-0.5 pr-2 font-semibold">Level (m)</th>
                            <th className="py-0.5 pr-2 text-right font-semibold">wx (kN)</th>
                            {twoAxis ? (
                              <>
                                <th className="py-0.5 pr-2 text-right font-semibold">F·X (kN)</th>
                                <th className="py-0.5 pr-2 text-right font-semibold">F·Z (kN)</th>
                              </>
                            ) : <th className="py-0.5 pr-2 text-right font-semibold">Fx (kN)</th>}
                            <th className="py-0.5 text-right font-semibold">Nodes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {seis.storeys.map((s, i) => (
                            <tr key={s.elevation} className="border-t border-slate-100">
                              <td className="py-0.5 pr-2">{f1(s.elevation)}</td>
                              <td className="py-0.5 pr-2 text-right">{f1(s.wx)}</td>
                              {twoAxis && sx && sz ? (
                                <>
                                  <td className="py-0.5 pr-2 text-right font-medium text-[#7c3aed]">{f1(sx.storeys[i]?.Fx ?? 0)}</td>
                                  <td className="py-0.5 pr-2 text-right font-medium text-[#7c3aed]">{f1(sz.storeys[i]?.Fx ?? 0)}</td>
                                </>
                              ) : <td className="py-0.5 pr-2 text-right font-medium text-[#7c3aed]">{f1(s.Fx)}</td>}
                              <td className="py-0.5 text-right text-slate-500">{s.nodes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-[10px] text-slate-500">
                        System: <b>{seismicSystem.toUpperCase()}</b> (R = {Rw}) — column tie detailing uses {seismicSystem === 'smf' ? 'NSCP §418.7.5 SMF confinement' : seismicSystem === 'imf' ? 'NSCP §418.4.3 IMF hinge zone' : '§425.7.2 gravity ties only'}.
                      </p>
                    </div>
                    )
                  })()}
                </div>
                <div className="col-span-full border-t border-slate-100 pt-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={generateRsaE}
                      disabled={!model || eDirs.length === 0 || !modal || modal.modes.length === 0}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-[#7c3aed] hover:border-[#7c3aed] hover:bg-purple-50 disabled:opacity-40">〜 Generate E cases — RSA (§208.6.4)</button>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input type="checkbox" checked={rsaRegular} onChange={(e) => setRsaRegular(e.target.checked)} />
                      <span>regular structure — 0.9·V(T_B) &amp; 0.8·V(T_A) floors (unticked: irregular, 100%·V)</span>
                    </label>
                  </div>
                  {(!modal || modal.modes.length === 0) && (
                    <p className="mt-1 text-[10px] text-slate-500">Needs a Modal run (Dynamics) — the CQC storey shears are combined from the mode shapes, then scaled to the §208.6.4.2 static floor and enveloped by Design/Optimize like any E case.</p>
                  )}
                  {rsaGen && (
                    <div className="mt-1 space-y-1">
                      {(['x', 'z'] as const).map((ax) => {
                        const g = rsaGen[ax]
                        return (
                          <p key={ax} className="text-xs text-slate-500">
                            {ax.toUpperCase()}: V<sub>CQC</sub> = {f1(g.Vdyn)} kN · §208.6.4.2 floor = {f1(g.Vfloor)} kN → scale ×{g.scale.toFixed(3)} · mass participation {Math.round(g.massRatio * 100)}%
                            {g.massRatio < 0.9 && <span className="font-semibold text-amber-600"> — below 90% (§208.6.4.1): raise the mode count in Dynamics</span>}
                          </p>
                        )
                      })}
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="text-left uppercase tracking-wide text-slate-500">
                            <th className="py-0.5 pr-2 font-semibold">Level (m)</th>
                            <th className="py-0.5 pr-2 text-right font-semibold">F·X (kN)</th>
                            <th className="py-0.5 pr-2 text-right font-semibold">V·X (kN)</th>
                            <th className="py-0.5 pr-2 text-right font-semibold">F·Z (kN)</th>
                            <th className="py-0.5 text-right font-semibold">V·Z (kN)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rsaGen.x.storeys.map((s, i) => (
                            <tr key={s.elevation} className="border-t border-slate-100">
                              <td className="py-0.5 pr-2">{f1(s.elevation)}</td>
                              <td className="py-0.5 pr-2 text-right font-medium text-[#7c3aed]">{f1(s.F)}</td>
                              <td className="py-0.5 pr-2 text-right">{f1(s.V)}</td>
                              <td className="py-0.5 pr-2 text-right font-medium text-[#7c3aed]">{f1(rsaGen.z.storeys[i]?.F ?? 0)}</td>
                              <td className="py-0.5 text-right">{f1(rsaGen.z.storeys[i]?.V ?? 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-[10px] text-slate-500">
                        Storey forces back-difference the CQC storey-shear diagram, scaled so the base shear meets the §208.6.4.2 floor, split to the level&apos;s nodes ∝ seismic mass. They replace the static pattern in the cat-E cases enveloped by Analyze/Design/Optimize.
                      </p>
                    </div>
                  )}
                </div>
              </Sec>

              <Sec title="Wind — NSCP 207B MWFRS (directional)">
                <div className="col-span-full -mt-1 flex justify-end">
                  <HintButton title="Wind input guide — NSCP 207"><WindHint /></HintButton>
                </div>
                <Num label="V (basic speed)" unit="m/s" value={Vw} onChange={setVw} />
                <Num label="Kzt (topographic)" value={Kzt} onChange={setKzt} />
                <label className="flex flex-col text-sm">
                  <span className="mb-1 font-medium text-slate-600">Exposure</span>
                  <select value={expo} onChange={(e) => setExpo(e.target.value as 'B' | 'C' | 'D')}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5">
                    <option value="B">B (suburban)</option>
                    <option value="C">C (open)</option>
                    <option value="D">D (flat/coastal)</option>
                  </select>
                </label>
                <DirPicker value={wDirs} onChange={setWDirs} />
                <div className="col-span-full">
                  <button type="button" onClick={generateW} disabled={!model || wDirs.length === 0}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50 disabled:opacity-40">🌬 Generate W cases</button>
                  {wind && (
                    <p className="mt-1 text-xs text-slate-500">
                      qh = {f2(wind.qh)} kPa · B×L = {f1(wind.B)}×{f1(wind.L)} m (L/B {f2(wind.LB)}) ·
                      Cp,lee {f2(wind.CpLee)} · base shear V = {f1(wind.baseShear)} kN — {wCases.length} cat-W
                      case{wCases.length === 1 ? '' : 's'} ({wDirs.join(', ') || 'none'}). Windward Cp = 0.8, G = {wind.G}, Kd = {wind.Kd}.
                    </p>
                  )}
                </div>
              </Sec>

              <Sec title="Wind — NSCP 207E.4 Components & Cladding (walls)">
                <p className="col-span-full text-[11px] text-slate-500">
                  Local wall cladding/curtain-wall pressures p = qh·[(GCp) − (GCpi)] at the mean roof
                  height. GCp by zone &amp; effective wind area (Fig 207E.4-1); GCpi from the enclosure
                  (±0.18 enclosed, ±0.55 partially enclosed). Uses the V, Kzt &amp; exposure above.
                </p>
                <Num label="Effective wind area" unit="m²" value={ccArea} step="0.5"
                  onChange={(v) => setCcArea(Math.max(0.1, v))} hint="0.93–46.5 m² band" />
                <label className="flex flex-col text-sm">
                  <span className="mb-1 font-medium text-slate-600">Enclosure</span>
                  <select value={ccEncl} onChange={(e) => setCcEncl(e.target.value as WindEnclosure)}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5">
                    <option value="enclosed">Enclosed (±0.18)</option>
                    <option value="partially">Partially enclosed (±0.55)</option>
                    <option value="open">Open (0)</option>
                  </select>
                </label>
                <div className="col-span-full">
                  <button type="button" onClick={runCladding} disabled={!model}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50 disabled:opacity-40">▦ Compute C&amp;C wall pressures</button>
                  {cladding && (
                    <table className="mt-2 w-full text-left text-xs">
                      <thead className="text-slate-500">
                        <tr className="border-b border-slate-200">
                          <th className="py-1 pr-2">Zone</th><th className="py-1 pr-2">GCp (+ / −)</th>
                          <th className="py-1 pr-2">p⁺ (inward)</th><th className="py-1 pr-2">p⁻ (suction)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {([['4 — interior', cladding.zone4], ['5 — corner', cladding.zone5]] as [string, CladdingResult['zone4']][]).map(([lbl, zone]) => (
                          <tr key={zone.zone} className="border-b border-slate-100">
                            <td className="py-1 pr-2 font-medium">Zone {lbl}</td>
                            <td className="py-1 pr-2 font-mono">{f2(zone.GCpPos)} / {f2(zone.GCpNeg)}</td>
                            <td className="py-1 pr-2 font-mono">{f2(zone.pPos)} kPa</td>
                            <td className="py-1 pr-2 font-mono text-red-600">{f2(zone.pNeg)} kPa</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {cladding && (
                    <p className="mt-1 text-[10px] text-slate-500">
                      qh = {f2(cladding.qh)} kPa at h = {f1(cladding.h)} m · |GCpi| = {cladding.GCpi} · A = {f1(cladding.area)} m².
                      Corner zone 5 governs cladding suction. Roof C&amp;C and h &gt; 18.3 m (§207E.5) out of scope.
                    </p>
                  )}
                </div>
              </Sec>
            </div>
          )}

          {/* ── ANALYSIS ── */}
          {tab === 'analysis' && (
            <div className="divide-y divide-[#eeece5] px-4 py-1">
              <Sec title="Analysis options">
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={assembly} onChange={(e) => setAssembly(e.target.checked)} />
                  <span>Public assembly / garage (f₁ = 1.0)</span>
                </label>
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={pDelta} onChange={(e) => setPDelta(e.target.checked)} />
                  <span>P-Δ second-order analysis</span>
                </label>
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={cracked} onChange={(e) => setCracked(e.target.checked)} />
                  <span>Cracked sections — ACI §6.6.3.1.1 (0.35Ig beams, 0.70Ig columns; concrete only)</span>
                </label>
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={shearDef} onChange={(e) => setShearDef(e.target.checked)} />
                  <span>Shear deformation (Timoshenko) — Φ = 12EI/(G·As·L²); softens deep girders &amp; squat columns</span>
                </label>
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={allAround} onChange={(e) => setAllAround(e.target.checked)} />
                  <span>Column bars on all four faces — P–M strain-compatibility layers (real cage; lower Mb)</span>
                </label>
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={!model} checked={model?.diaphragm ?? false}
                    onChange={(e) => model && save({ ...model, diaphragm: e.target.checked })} />
                  <span>Rigid floor diaphragm (ties in-plane lateral DOFs per storey)</span>
                </label>
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={!model} checked={model?.rigidEndZones ?? false}
                    onChange={(e) => model && save({ ...model, rigidEndZones: e.target.checked })} />
                  <span>Auto rigid end zones (ETABS-style end length offsets from connectivity)</span>
                </label>
                {model?.rigidEndZones && (
                  <label className="col-span-full flex items-center gap-2 pl-6 text-sm">
                    <span className="text-slate-600">Rigid-zone factor (0–1)</span>
                    <input type="number" min={0} max={1} step={0.1} value={model.rigidZoneFactor ?? 0.5}
                      onChange={(e) => model && save({ ...model, rigidZoneFactor: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })}
                      className="w-20 rounded border border-slate-300 px-2 py-1" />
                    <span className="text-[11px] text-slate-500">auto offsets = factor × ½·(connecting member depth) at each joint</span>
                  </label>
                )}
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={!model} checked={model?.shellElements ?? false}
                    onChange={(e) => model && save({ ...model, shellElements: e.target.checked })} />
                  <span>Shell elements (slab/wall panels as CST+DKT finite elements, not load sources)</span>
                </label>
                {model?.shellElements && (
                  <p className="col-span-full pl-6 text-[11px] text-slate-500">
                    Each panel meshes to two triangles on its corner nodes; area loads lump to those nodes.
                    Analysis-path feature — the NSCP design pipeline keeps the tributary load model.
                  </p>
                )}
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={tryBars} onChange={(e) => setTryBars(e.target.checked)} />
                  <span>Try alternative bar sizes (Design / Optimize pick ⌀16–⌀32 beams, ⌀20–⌀32 columns)</span>
                </label>
                <p className="col-span-full text-[11px] text-slate-500">
                  §203.3.1 live-load factor f₁ = <b>{fLive.toFixed(1)}</b>
                  {fLive === 1 ? (assembly ? ' (assembly/garage)' : ' (Lo > 4.8 kPa)') : ' (ordinary occupancy)'}.
                  {pDelta ? ' Frame solved with the geometric-stiffness P-Δ iteration.' : ' First-order (linear) frame solve.'}
                </p>
                <div className="col-span-full">
                  <button type="button" onClick={analyze} disabled={!model || !!busy || meshErrors} className={btn}>
                    {busy === 'analyze' ? '⏳ Analyzing…' : '▶ Analyze (3D FEM)'}
                  </button>
                  {meshErrors && <p className="mt-1 text-[11px] font-medium text-red-600">Resolve the mesh errors below to enable analysis.</p>}
                </div>
                {busy === 'analyze' && <SolverProgress p={progress} />}
              </Sec>

              {model && <ValidationPanel issues={meshIssues} />}

              {gov && govRes && (
                <Sec grid={false} title={`Analysis — ${gov.combo.name} governs`}>
                  <Row label="ΣRy (gravity)" value={`${f1(govRes.reactions.reduce((s, q) => s + q.F[1], 0))} kN`} />
                  <Row label="Extremes" value={`M ${f1(govRes.Mmax)} kN·m`}
                    sub={`V ${f1(govRes.Vmax)} · N ${f1(govRes.Nmax)} kN`} />
                  {orphans > 0 && <Row alert label="⚠ Orphan edges" value={`${orphans}`} sub="slab edges with no member" />}
                  <p className="mt-1 text-[11px] text-slate-500">Members tinted red by |M| relative to the model max. Click one for its diagrams.</p>
                </Sec>
              )}

              {analysis && model && (
                <MemberForcesTable analysis={analysis} members={model.members} sectionFor={sectionFor} />
              )}

              {analysis && model && (
                <ReactionsPanel analysis={analysis} memberLen={memberLenById} />
              )}

              {analysis && model && (
                <DisplacementTable analysis={analysis} nodes={model.nodes} />
              )}

              {model?.shellElements && model.plates.length > 0 && (
                <Sec title="Shell plate stress (CST membrane + DKT bending)">
                  <p className="col-span-full text-[11px] text-slate-500">
                    Recovers per-element membrane stresses (σx, σy, τxy, von Mises) and bending
                    moments (Mx, My, Mxy) from the shell FEM. Uses E = 25 000 MPa, ν = 0.2 for
                    all plates. Area loads are applied as uniform pressure.
                  </p>
                  <Num label="Mesh subdivision n×n" value={shellSubdiv} step="1"
                    onChange={(v) => setShellSubdiv(Math.max(1, Math.min(12, Math.round(v) || 1)))}
                    hint="1–12 cells per side" />
                  <p className="col-span-full text-[11px] text-slate-500">
                    Each quad is split into {shellSubdiv}×{shellSubdiv} cells (2·{shellSubdiv}² triangles); finer meshes
                    reduce the stiffness overestimate of coarse 2-triangle plates. Edges shared by adjacent plates stay conforming.
                  </p>
                  <div className="col-span-full flex flex-wrap gap-2">
                    <button type="button" onClick={runShellStress} disabled={!model || !!busy}
                      className={btn}>
                      ⬡ Recover shell stresses
                    </button>
                    <button type="button" onClick={runSlabFE} disabled={!model || !!busy}
                      className={btn}>
                      ▦ Design slab steel (Wood-Armer)
                    </button>
                  </div>
                  <p className="col-span-full text-[11px] text-slate-500">
                    Wood-Armer (1968) converts the factored (1.2D + 1.6L) shell moment field (Mx, My, Mxy) into
                    orthogonal design moments for the bottom (sagging) and top (hogging) faces, then sizes the x/y
                    reinforcement per metre to NSCP 2015 / ACI 318-14 (φ = 0.90, ⌀12 @ 20 mm cover, fc 28, fy 415).
                  </p>
                </Sec>
              )}
              {shellStress && (
                <ShellContourPanel nodes={shellStress.nodes} elems={shellStress.elems} stresses={shellStress.stresses} />
              )}
              {slabFE && slabFE.length > 0 && (
                <Sec grid={false} title="Slab reinforcement — Wood-Armer (shell FE, factored)">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-500">
                        <tr className="border-b border-slate-200">
                          <th className="py-1 pr-2">Slab</th><th className="py-1 pr-2">t (mm)</th>
                          <th className="py-1 pr-2">Face / dir</th><th className="py-1 pr-2">M* (kN·m/m)</th>
                          <th className="py-1 pr-2">As (mm²/m)</th><th className="py-1 pr-2">Bars ⌀12</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slabFE.flatMap((r) => {
                          const d = r.design
                          const rows: [string, number, typeof d.bottomX][] = [
                            ['Bottom · x', d.moments.mxBottom, d.bottomX],
                            ['Bottom · y', d.moments.myBottom, d.bottomY],
                            ['Top · x', d.moments.mxTop, d.topX],
                            ['Top · y', d.moments.myTop, d.topY],
                          ]
                          return rows.map(([lbl, m, s], i) => (
                            <tr key={`${r.plate}-${lbl}`} className="border-b border-slate-100">
                              {i === 0 && <td className="py-1 pr-2 font-medium align-top" rowSpan={4}>{r.plate}</td>}
                              {i === 0 && <td className="py-1 pr-2 align-top" rowSpan={4}>{r.thickness}</td>}
                              <td className="py-1 pr-2">{lbl}</td>
                              <td className="py-1 pr-2 font-mono">{m.toFixed(1)}</td>
                              <td className="py-1 pr-2 font-mono">{s.As.toFixed(0)}{s.usedMin ? ' (min)' : ''}</td>
                              <td className="py-1 pr-2 font-mono">⌀12 @ {s.spacing.toFixed(0)} mm</td>
                            </tr>
                          ))
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">
                    Envelope of the per-element Wood-Armer design moments over each panel. As includes the
                    shrinkage/temperature minimum (ρ_min); spacing capped at min(3t, 450) mm. d = t − cover − 1.5⌀.
                  </p>
                </Sec>
              )}

              {drift && seis && (
                <Sec grid={false} title={`Storey drift — ${(eDirs[0] ?? '+X').replace(/[+-]/, '')} (ΔM = 0.7·R·Δs)`}>
                  {drift.map((row) => (
                    <Row key={row.elevation} alert={!row.ok}
                      label={`Level ${f1(row.elevation)} m`}
                      value={`ΔM = ${row.dM.toFixed(1)} mm ${row.ok ? '✓' : '✗'}`}
                      sub={`Δs ${row.ds.toFixed(2)} · limit ${row.limit.toFixed(0)} mm`} />
                  ))}
                  <p className="mt-1 text-[11px] text-slate-500">
                    Limit {seis.T < 0.7 ? '0.025' : '0.020'}·hs (T {seis.T < 0.7 ? '<' : '≥'} 0.7 s) — NSCP 208.5.10.
                  </p>
                </Sec>
              )}

              {selMember && model && (
                <Sec grid={false} title={`Member — ${selMember.id}`}>
                  <Row label="Role" value={selMember.role} />
                  <Row label="Length" value={`${f2(memberLen)} m`} />
                  <Row label="Section" value={sectionFor(selMember.id)?.name ?? selMember.section} />
                  {(() => {
                    const mr = govRes?.members.find((m) => m.id === selMember.id)
                    if (!mr) return null
                    return (
                      <div className="mt-2 space-y-2">
                        <Row label="Forces (governing)" value={`M ${f1(mr.Mmax)} kN·m`}
                          sub={`V ${f1(mr.Vmax)} · N ${f1(mr.Nmax)} · T ${f1(mr.Tmax)} kN`} />
                        <Diagram xs={mr.xs} ys={mr.Mz} title="Mz — strong-axis moment" unit="kN·m" color="#d62728" decimals={1} />
                        <Diagram xs={mr.xs} ys={mr.My} title="My — weak-axis moment" unit="kN·m" color="#ea580c" decimals={1} />
                        <Diagram xs={mr.xs} ys={mr.Vy} title="Vy — shear (x′-y′)" unit="kN" color="#1f77b4" decimals={1} />
                        <Diagram xs={mr.xs} ys={mr.Vz} title="Vz — shear (x′-z′)" unit="kN" color="#0e7490" decimals={1} />
                        <Diagram xs={mr.xs} ys={mr.N} title="N — axial (+tension)" unit="kN" color="#7c3aed" decimals={1} />
                        <Diagram xs={mr.xs} ys={mr.T} title="T — torsion" unit="kN·m" color="#b45309" decimals={1} />
                      </div>
                    )
                  })()}
                  {selMember.role === 'column' && columnKs.get(selMember.id) && (() => {
                    const k = columnKs.get(selMember.id)!
                    return (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
                        <p className="mb-1 text-[11px] font-semibold text-[#0f4c92]">Effective length K — AISC alignment chart (C-C2)</p>
                        <Row label="K — X-sway" value={`sway ${f2(k.Kx.sway)} · braced ${f2(k.Kx.braced)}`}
                          sub={`G: ${f2(k.Gi.x)} (i) · ${f2(k.Gj.x)} (j)`} />
                        <Row label="K — Z-sway" value={`sway ${f2(k.Kz.sway)} · braced ${f2(k.Kz.braced)}`}
                          sub={`G: ${f2(k.Gi.z)} (i) · ${f2(k.Gj.z)} (j)`} />
                        <p className="mt-1 text-[10px] text-slate-500">
                          G = Σ(EI/L)<sub>col</sub> / Σ(EI/L)<sub>beam</sub> at each joint; fixed base G = 1.0, pinned/no-beam G = 10.
                        </p>
                      </div>
                    )
                  })()}
                  <button type="button" onClick={() => { save(removeElements(model, new Set([selMember.id]))); setSelected(null) }}
                    className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50">Delete member</button>
                </Sec>
              )}

              {selPlate && plateInfo && model && (
                <Sec grid={false} title={`Slab — ${selPlate.id}`}>
                  <Row label="Panel" value={`${f2(plateInfo.lx)} × ${f2(plateInfo.lz)} m`}
                    sub={`t = ${selPlate.thickness} mm`} />
                  {plateInfo.areaLoads.map((l, i) => (
                    <Row key={i} label={`q (${l.cat})`} value={`${f2(l.q)} kPa`} />
                  ))}
                  {plateInfo.trib && (
                    <Row label="Tributary" value={plateInfo.trib.behaviour}
                      sub={`peak ${f1(plateInfo.trib.edges[0].peak)} kN/m on long edges`} />
                  )}
                  <button type="button" onClick={() => { save(removeElements(model, new Set([selPlate.id]))); setSelected(null) }}
                    className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50">Delete slab</button>
                </Sec>
              )}
            </div>
          )}

          {/* ── MODAL ── */}
          {tab === 'modal' && (
            <div className="divide-y divide-[#eeece5] px-4 py-1">
              <Sec title="Modal analysis options">
                <label className="flex flex-col text-sm">
                  <span className="mb-1 font-medium text-slate-600">Number of modes</span>
                  <input type="number" min={1} max={50} step={1} value={nModes}
                    onChange={(e) => setNModes(Math.max(1, Math.min(50, Math.round(parseFloat(e.target.value) || 1))))}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0f4c92] focus:outline-none focus:ring-1 focus:ring-[#0f4c92]" />
                </label>
                <p className="col-span-full text-[11px] text-slate-500">
                  Lumped-mass free vibration ([K]−ω²[M]). Mass from member &amp; slab self-weight (dead). Request enough
                  modes to accumulate ≥90% of the lateral mass (NSCP 208.5.5).
                </p>
                <div className="col-span-full">
                  <button type="button" onClick={runModal} disabled={!model || !!busy || meshErrors} className={btn}>
                    {busy === 'modal' ? '⏳ Solving modes…' : '〰 Run modal analysis'}
                  </button>
                  {meshErrors && <p className="mt-1 text-[11px] font-medium text-red-600">Resolve the mesh errors in the Analysis tab to enable modal analysis.</p>}
                </div>
                {busy === 'modal' && <SolverProgress p={progress} />}
              </Sec>

              {model && <ValidationPanel issues={meshIssues} />}

              {modal && modal.modes.length > 0 && (
                <ModalPanel result={modal} selectedMode={modeShapeIdx} onSelectMode={setModeShapeIdx} />
              )}
              {modal && modeShapeIdx !== null && modal.modes[modeShapeIdx] && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[10px] font-bold uppercase tracking-[.12em] text-[#a39d8d]">
                      Mode {modeShapeIdx + 1} shape — T = {modal.modes[modeShapeIdx].period.toFixed(3)} s
                    </h3>
                    <button type="button" onClick={() => setModeShapeIdx(null)}
                      className="rounded px-2 py-0.5 text-xs font-semibold text-violet-500 hover:bg-violet-100">✕ Close</button>
                  </div>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-violet-700">Visual amplitude: {modeAmp.toFixed(1)} m</span>
                    <input type="range" min={0.3} max={5} step={0.1} value={modeAmp}
                      onChange={(e) => setModeAmp(parseFloat(e.target.value))}
                      className="accent-violet-600" />
                  </label>
                  <p className="mt-1.5 text-[11px] text-violet-500">
                    Purple skeleton oscillates in the 3D canvas (visual only — not structural displacement).
                    Switch to any other tab; the animation continues while the panel is visible.
                  </p>
                </div>
              )}
              {modal && modal.modes.length === 0 && (
                <Sec grid={false} title="Modal analysis">
                  <p className="text-sm text-slate-600">No modes found — the model has no lumped mass (add members/slabs with self-weight).</p>
                </Sec>
              )}
              {rsa && <ResponseSpectrumPanel result={rsa} seismicT={seis?.T} />}

              <Sec title="Time-history — modal Newmark-β (linear)">
                {/* CSV accelerogram upload */}
                <div className="col-span-full">
                  <p className="mb-1 text-[11px] font-medium text-slate-600">Real accelerogram (CSV / PEER AT2)</p>
                  {thCsv ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-teal-50 px-2 py-0.5 text-[11px] text-teal-700">
                        {thCsv.name} — {thCsv.npts} pts
                      </span>
                      <button type="button" onClick={() => setThCsv(null)}
                        className="text-[11px] text-slate-500 hover:text-red-500">✕ clear</button>
                    </div>
                  ) : (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path d="M8 2v8M5 7l3-3 3 3M2 12h12" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Upload CSV / AT2
                      <input type="file" accept=".csv,.txt,.at2,.acc" className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          f.text().then((text) => {
                            // Quick sample count (non-comment, non-empty lines with at least one number)
                            const npts = text.split('\n').filter((l) => {
                              const t = l.trim()
                              return t && !/^[#%!]/.test(t) && /[\d.\-]/.test(t) && !isNaN(parseFloat(t.split(/[\s,;]+/)[0]))
                            }).length
                            setThCsv({ text, name: f.name, npts })
                          })
                          e.target.value = ''
                        }}
                      />
                    </label>
                  )}
                </div>
                {/* CSV units + dt override (only shown when a file is loaded) */}
                {thCsv && (
                  <>
                    <Pick label="CSV units" value={thCsvUnits} onChange={setThCsvUnits}
                      options={[['g', 'g (×9.81 m/s²)'], ['ms2', 'm/s²']]} />
                    <Num label="Δt (one-column)" unit="s" value={thCsvDt} onChange={setThCsvDt} step="0.01" />
                  </>
                )}
                {/* Synthetic motion params (shown when no CSV) */}
                {!thCsv && (
                  <>
                    <Pick label="Ground motion" value={thKind} onChange={setThKind}
                      options={[['rampedSine', 'Ramped sine (transient)'], ['pulse', 'Single pulse'], ['harmonic', 'Steady harmonic']]} />
                    <Num label="Peak ground accel" unit="g" value={thPga} onChange={setThPga} step="0.05" />
                    <Num label="Frequency" unit="Hz" value={thFreq} onChange={setThFreq} step="0.5" />
                    <Num label="Duration" unit="s" value={thDur} onChange={setThDur} step="1" />
                  </>
                )}
                <Pick label="Direction" value={thDir} onChange={setThDir} options={[['x', '+X'], ['z', '+Z']]} />
                <Num label="Damping ζ" unit="%" value={thZeta} onChange={setThZeta} step="1" />
                <p className="col-span-full text-[11px] text-slate-500">
                  Modal superposition: each mode is an SDOF integrated by Newmark-β (β=¼, γ=½). Upload a real
                  record (two-column t/ag, one-column with Δt, or PEER AT2) or use the built-in synthetic motion.
                </p>
                <div className="col-span-full flex flex-wrap gap-2">
                  <button type="button" onClick={runTimeHistory} disabled={!model || !!busy || meshErrors} className={btn}>
                    {busy === 'timeHistory' ? '⏳ Integrating…' : '∿ Run time-history'}
                  </button>
                  {thCsv && (
                    <button type="button" onClick={runResponseSpectrum} className={btn}>
                      ⌁ Response spectrum
                    </button>
                  )}
                </div>
                {thCsv && (
                  <p className="col-span-full text-[11px] text-slate-500">
                    The response spectrum integrates an SDOF oscillator per period (Newmark-β, ζ = {thZeta}%) over the
                    uploaded record, then overlays it on the NSCP 208 design spectrum (Ca {Ca}, Cv {Cv}, I {Ie}, R {Rw}).
                  </p>
                )}
                {busy === 'timeHistory' && <SolverProgress p={progress} />}
              </Sec>
              {th && <TimeHistoryPanel res={th} dirLabel={thDir === 'x' ? '+X' : '+Z'} />}
              {recSpec && <RecordedSpectrumPanel spec={recSpec.spec} design={recSpec.design} recordName={recSpec.name} />}

              {(() => {
                const occ = DG11_OCCUPANCY.find((o) => o.id === dg11OccId) ?? DG11_OCCUPANCY[0]
                const deflMm = dg11DeflMm > 0 ? dg11DeflMm : (dg11Suggest?.deflMm ?? 0)
                const W = dg11W > 0 ? dg11W : (dg11Suggest?.W ?? 0)
                const fn = freqFromDeflection(deflMm / 1000)
                const res = dg11Walking({ fn, W, beta: occ.beta, Po: occ.Po, aoLimit: occ.aoLimit })
                const has = deflMm > 0 && W > 0
                return (
                  <Sec title="Floor vibration — AISC Design Guide 11 (walking)">
                    <Pick label="Occupancy" value={dg11OccId} onChange={setDg11OccId}
                      options={DG11_OCCUPANCY.map((o) => [o.id, o.label])} />
                    <Num label="Floor deflection Δ" unit="mm" value={dg11DeflMm} onChange={setDg11DeflMm} step="0.1"
                      hint={dg11Suggest ? `analysis suggests ${dg11Suggest.deflMm.toFixed(1)} (0 = use it)` : 'run Analyze to auto-suggest'} />
                    <Num label="Supported weight W" unit="kN" value={dg11W} onChange={setDg11W} step="10"
                      hint={dg11Suggest ? `storey dead ≈ ${dg11Suggest.W.toFixed(0)} (0 = use it)` : 'effective panel weight'} />
                    <p className="col-span-full text-[11px] text-slate-500">
                      fn = 0.18·√(g/Δ); aₚ/g = Po·e^(−0.35 fn)/(β·W) ≤ aₒ/g. Po = {occ.Po} kN, β = {occ.beta}, aₒ/g = {(occ.aoLimit * 100).toFixed(1)}% (DG11 Table 4.1).
                    </p>
                    {has ? (
                      <div className="col-span-full mt-1 space-y-1">
                        <Row label="Fundamental frequency fₙ" value={`${fn.toFixed(2)} Hz`}
                          sub={fn > 9 ? 'high-frequency floor — Eq. 4.1 is conservative' : 'low-frequency floor'} />
                        <Row label="Peak acceleration aₚ/g" value={`${(res.apOverG * 100).toFixed(2)}%`}
                          sub={`limit aₒ/g = ${(res.aoLimit * 100).toFixed(1)}%`} />
                        <Row alert={!res.ok} label={res.ok ? '✓ Satisfactory' : '✗ Exceeds tolerance'}
                          value={`ratio ${res.ratio.toFixed(2)}`} sub={res.ok ? 'aₚ ≤ aₒ' : 'stiffen framing, add damping/mass, or relax occupancy'} />
                      </div>
                    ) : (
                      <p className="col-span-full text-[11px] text-amber-600">Enter Δ and W (or run Analyze for auto-suggestions) to evaluate.</p>
                    )}
                  </Sec>
                )
              })()}
            </div>
          )}

          {/* ── PUSHOVER ── */}
          {tab === 'pushover' && (
            <div className="divide-y divide-[#eeece5] px-4 py-1">
              <Sec title="Pushover — nonlinear static (plastic hinges)">
                <Pick label="Push direction" value={poDir} onChange={setPoDir}
                  options={[['x', '+X'], ['z', '+Z']]} />
                <Pick label="Lateral pattern" value={poPattern} onChange={setPoPattern}
                  options={[['triangular', 'Inverted triangle (mass×h)'], ['uniform', 'Uniform (mass)']]} />
                <Num label="Concrete ρ (tension)" unit="%" value={poRho} onChange={setPoRho} step="0.1"
                  hint="assumed steel ratio for Mp (concrete only)" />
                <Num label="Mp scale" value={poMpScale} onChange={setPoMpScale} step="0.1"
                  hint="multiplier on every member capacity" />
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={!model} checked={poPM}
                    onChange={(e) => setPoPM(e.target.checked)} />
                  <span>P–M interaction (reduce plastic moment Mpc(P) at each hinge)</span>
                </label>
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={!model} checked={poPDelta}
                    onChange={(e) => setPoPDelta(e.target.checked)} />
                  <span>P-Δ second order (gravity geometric stiffness softens the capacity curve)</span>
                </label>
                <p className="col-span-full text-[11px] text-slate-500">
                  Event-to-event concentrated plastic hinges (a hinge = a member-end moment release).
                  Capacity curve = base shear vs roof displacement; pushes to a 4% drift target or a collapse
                  mechanism. Mp: steel Fy·Zx; concrete ρ·b·d²·fy·(1−0.59ρfy/f′c).
                  {' '}P–M interaction (opt-in): hinges yield at the reduced Mpc(P) — steel AISC App. 1
                  (1.18Mp(1−P/Py) major, 1.19Mp(1−(P/Py)²) minor); concrete ACI §22.4 linear chord Mp(1−P/Pn0).
                  {' '}P-Δ (opt-in): a constant geometric stiffness from the gravity weight (mass×g) softens the
                  lateral tangent — drift is amplified, hinges form earlier, and the collapse base shear drops.
                </p>
                <div className="col-span-full">
                  <button type="button" onClick={runPushover} disabled={!model || !!busy || meshErrors} className={btn}>
                    {busy === 'pushover' ? '⏳ Pushing…' : '⤧ Run pushover'}
                  </button>
                  {meshErrors && <p className="mt-1 text-[11px] font-medium text-red-600">Resolve the mesh errors in the Analysis tab to enable pushover.</p>}
                </div>
                {busy === 'pushover' && <SolverProgress p={progress} />}
              </Sec>

              {model && <ValidationPanel issues={meshIssues} />}

              {po && po.result.curve.length > 1 && (
                <PushoverPanel res={po} dirLabel={poDir === 'x' ? '+X' : '+Z'} />
              )}
              {po && po.result.curve.length <= 1 && (
                <Sec grid={false} title="Pushover">
                  <p className="text-sm text-slate-600">
                    No yield events — the model has no hingeable members or no lateral mass to push.
                    Assign sections and ensure the frame carries self-weight.
                  </p>
                </Sec>
              )}
            </div>
          )}

          {/* ── DESIGN ── */}
          {tab === 'design' && (
            <div className="divide-y divide-[#eeece5] px-4 py-1">
              <Sec title="Design & optimise">
                <div className="col-span-full flex flex-wrap gap-2">
                  <button type="button" onClick={runPipeline} disabled={!model || !!busy || meshErrors} className={btn}>
                    {busy === 'design' ? '⏳ Designing…' : '🏗 Design structure'}
                  </button>
                  <button type="button" onClick={optimize} disabled={!model || !!busy || meshErrors} className={btn}
                    title="Grow each failing member's own section until nothing fails, then trim back">
                    {busy === 'optimize' ? '⏳ Optimizing…' : '🏁 Optimize design'}
                  </button>
                </div>
                {meshErrors && (
                  <p className="col-span-full text-[11px] font-medium text-red-600">
                    Mesh has errors — fix them in the Analysis tab before designing.
                  </p>
                )}
                {busy && <SolverProgress p={progress} />}
                {busy && (
                  <p className="col-span-full text-[11px] font-medium text-[#0f4c92]">
                    Running in the background — the page stays responsive; results appear when ready.
                  </p>
                )}
                <p className="col-span-full text-[11px] text-slate-500">
                  The full schedules (beam/girder, column, footing) render below, each the full width of the page.
                  Click any schedule row for its step-by-step solution and plan/elevation drawings.
                </p>
              </Sec>
            </div>
          )}
        </div>
      </div>

      {/* ── Optimisation log (full width) ── */}
      {opt && (() => {
        const sizesFor = (role: MemberRole) => {
          const ids = new Set(opt.model.members.filter((m) => m.role === role).map((m) => m.section))
          return [...new Set(opt.model.sections.filter((s) => ids.has(s.id) && s.material !== 'steel').map((s) => s.name))].join(', ') || '—'
        }
        const steelColShapes  = [...new Set(opt.design.steelColumns.map((c) => c.shape))].join(', ')
        const steelBeamShapes = [...new Set(opt.design.steelBeams.map((b) => b.shape))].join(', ')
        const hasSteelCols    = opt.design.steelColumns.length > 0
        const hasSteelBeams   = opt.design.steelBeams.length > 0
        const steelOK         = opt.design.steelBeams.every((b) => b.ok) && opt.design.steelColumns.every((c) => c.ok)
        const steelKg         = opt.design.totals.steelKg
        return (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-1 text-[1.02rem] font-bold text-[#0f4c92]">
              Optimization — {opt.converged
                ? `converged in ${opt.steps.length} step${opt.steps.length === 1 ? '' : 's'}`
                : 'did NOT converge'}
            </h3>
            {!opt.converged && (
              <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                {opt.stopReason ?? 'iteration cap hit — check spans/loads'}
              </p>
            )}
            <div className="mb-2 space-y-0.5 text-xs text-slate-500">
              <p>Concrete — <b>columns</b> {sizesFor('column')} · <b>girders</b> {sizesFor('girder')} · <b>beams</b> {sizesFor('beam')}</p>
              {(hasSteelBeams || hasSteelCols) && (
                <p>
                  {'Structural steel — '}
                  {[
                    hasSteelCols  ? `columns: ${steelColShapes}` : '',
                    hasSteelBeams ? `beams/girders: ${steelBeamShapes}` : '',
                  ].filter(Boolean).join(' · ')}
                  {` · ${(steelKg / 1000).toFixed(2)} t · `}
                  <span className={steelOK ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                    {steelOK ? '✓ all steel OK' : '✗ steel check fails'}
                  </span>
                </p>
              )}
            </div>
            <table className="w-auto border-collapse text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-4 font-semibold">Step</th>
                  <th className="py-1 pr-4 text-right font-semibold">Members grown</th>
                  <th className="py-1 pr-4 text-right font-semibold">Failing</th>
                  <th className="py-1 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {opt.steps.map((s, i) => (
                  <tr key={i} className={`border-t border-slate-100 ${s.ok ? '' : 'bg-red-50 text-red-700'}`}>
                    <td className="py-0.5 pr-4">{i + 1}</td>
                    <td className="py-0.5 pr-4 text-right">{s.grown || '—'}</td>
                    <td className="py-0.5 pr-4 text-right">{s.fails}</td>
                    <td className="py-0.5">{s.ok ? '✓ all pass' : '✗ grow failing'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })()}

      {/* ── Schedules (full width, stacked) ── */}
      {design && (() => {
        // consolidated-report templates expand every row, filtering content
        const reportOpen = report !== '' && report !== 'schedules'
        const wantSol = report === '' || report === 'full' || report === 'solutions' || report === 'sol-only'
        const wantDraw = report === '' || report === 'full' || report === 'drawings' || report === 'draw-only'
        const tablesHidden = report === 'sol-only' || report === 'draw-only'   // *-only: no schedule tables
        const props = reportProps(design)
        return (
        <div className={`mt-6 space-y-6 ${tablesHidden ? 'report-no-tables' : ''}`}>
          {/* PAGE 1 — header + 3D model snapshot */}
          <h2 className="text-xl font-extrabold tracking-tight text-[#0f4c92]">
            Structure design — {design.govName} governs
            <span className="ml-3 text-sm font-normal text-slate-500">
              concrete ≈ {f1(design.totals.concrete)} m³ ({f1(design.totals.concreteMembers)} members + {f1(design.totals.concreteSlabs)} slabs)
              {design.totals.steelKg > 0 && ` · steel ${(design.totals.steelKg / 1000).toFixed(2)} t`}
            </span>
          </h2>
          {design.pDeltaIssues.length > 0 && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-bold">⚠ P-Δ did not converge for {design.pDeltaIssues.length} load case(s) — forces from these runs are unreliable (possible elastic instability).</p>
              <ul className="mt-1 list-inside list-disc">
                {design.pDeltaIssues.map((n) => <li key={n}><span className="font-mono">{n}</span></li>)}
              </ul>
            </div>
          )}
          {design.unchecked.length > 0 && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-bold">⚠ {design.unchecked.length} member(s) could NOT be design-checked — the result is not a passing design.</p>
              <ul className="mt-1 list-inside list-disc">
                {design.unchecked.map((u) => (
                  <li key={u.id}><span className="font-mono">{u.id}</span> ({u.role}, {u.shape}) — {u.reason}</li>
                ))}
              </ul>
            </div>
          )}
          <LetterheadCard lh={lh} onChange={(p) => setLh((s) => ({ ...s, ...p }))} />
          {/* Results tabs — Schedules · Bill of Quantities · Construction Schedule */}
          <div className="no-print flex flex-wrap items-center gap-1.5 border-b border-slate-200">
            {([['schedules', 'Schedules'], ['boq', 'Bill of Quantities'], ['schedule', 'Construction Schedule']] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setResultsTab(id)}
                className={`rounded-t-md px-3.5 py-2 text-[13px] font-semibold ${resultsTab === id ? 'border-b-2 border-[#0f4c92] text-[#0f4c92]' : 'text-slate-500 hover:text-[#0f4c92]'}`}>
                {label}
              </button>
            ))}
            <button type="button" onClick={() => void exportPdf()} disabled={exporting}
              className="mb-1 ml-auto rounded-md bg-[#0f4c92] px-4 py-2 text-[12.5px] font-bold text-white hover:bg-[#0d3f78] disabled:opacity-40">
              {exporting ? '⏳ Building PDF…' : '⎙ Export PDF report'}
            </button>
          </div>

          {resultsTab === 'schedules' && (<>
          <p className="text-xs text-slate-500">
            Envelope of <b>{design.cases.length}</b> load case{design.cases.length === 1 ? '' : 's'} (NSCP combinations × lateral directions).
            Each element is designed for its own governing case, shown in the “Case” column. Click any row for its worked solution.
          </p>

          {/* PAGE 2+ — project & design inputs (every template) */}
          <div className="break-before-page rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Project &amp; design inputs</h3>
            <table className="w-full border-collapse text-xs">
              <tbody>
                {props.map(([k, v]) => (
                  <tr key={k} className="border-t border-slate-100">
                    <td className="w-44 py-1 pr-3 font-semibold text-slate-600">{k}</td>
                    <td className="py-1 text-slate-700">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Beam & girder schedule — RC only */}
          {design.beams.length > 0 && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">RC beam & girder schedule<SchedChip items={design.beams} ok={(b) => b.ok} /></h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-2 font-semibold">Member</th>
                  <th className="py-1 pr-2 font-semibold">Section</th>
                  <th className="py-1 pr-2 text-right font-semibold">Mu (kN·m)</th>
                  <th className="py-1 pr-2 text-right font-semibold">Vu (kN)</th>
                  <th className="py-1 pr-2 font-semibold">Mode</th>
                  <th className="py-1 pr-2 font-semibold">Tension</th>
                  <th className="py-1 pr-2 font-semibold">Stirrups</th>
                  <th className="py-1 font-semibold">Case</th>
                </tr>
              </thead>
              <tbody>
                {design.beams.flatMap((bm) => bm.sections.flatMap((s, k) => {
                  const d = s.design
                  const bad = !(d.flexOK && d.comprEffective && d.comprNAOK && d.region !== 'inadequate')
                  const key = `beam:${bm.id}:${k}`
                  const open = expanded === key || reportOpen
                  const sec = sectionFor(bm.id)
                  return [
                    <tr key={key} onClick={() => setExpanded(expanded === key ? null : key)}
                      className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${bad ? 'bg-red-50 text-red-700' : ''}`}>
                      <td className="py-1 pr-2 font-medium">{k === 0 ? `${open ? '▾' : '▸'} ${bm.id} (${bm.role} ${sec?.name ?? ''}, ${f1(bm.L)} m)` : ''}</td>
                      <td className="py-1 pr-2">{s.label}{s.hogging ? ' (hog)' : s.bf ? ` · T bf=${Math.round(s.bf)}` : ''}</td>
                      <td className="py-1 pr-2 text-right">{f1(Math.abs(s.Mu))}</td>
                      <td className="py-1 pr-2 text-right">{f1(s.Vu)}</td>
                      <td className="py-1 pr-2">{d.mode}</td>
                      <td className="py-1 pr-2">{d.bars}⌀{sec?.barDia}{d.layers.length > 1 ? ` (${d.layers.join('+')})` : ''}{s.hogging ? ' top' : ''}</td>
                      <td className="py-1 pr-2">{d.sAdopt > 0 ? `${d.legs}L@${Math.round(d.sAdopt)}` : d.region === 'none' ? 'none' : '⚠'}</td>
                      <td className="py-1 text-slate-500">{k === 0 ? bm.gov : ''}</td>
                    </tr>,
                    open && model && sec && (
                      <tr key={`${key}:sol`}>
                        <td colSpan={8} className="bg-slate-50/60 px-2 pb-2">
                          {wantDraw && bm.diag && (
                            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                              <Diagram xs={bm.diag.xs} ys={loadFromShear(bm.diag.xs, bm.diag.Vy)} title="LOAD w (≈ −dV/dx)" unit="kN/m"
                                color="#475569" vlines={[{ x: s.x, label: s.label.split(' ')[0] }]} />
                              <Diagram xs={bm.diag.xs} ys={bm.diag.Vy} title="SHEAR Vy" unit="kN"
                                color="#1f77b4" vlines={[{ x: s.x, label: s.label.split(' ')[0] }]} />
                              <Diagram xs={bm.diag.xs} ys={bm.diag.Mz} title="MOMENT Mz (+sag)" unit="kN·m"
                                color="#d62728" vlines={[{ x: s.x, label: s.label.split(' ')[0] }]} />
                            </div>
                          )}
                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.7fr_1fr]">
                            {wantSol && <WorkedSolution steps={beamSectionSolution(sec, s)} title={`${bm.id} · ${s.label} — worked solution`} />}
                            {wantDraw && (
                            <div className="space-y-3 self-start rounded-lg border border-slate-200 bg-white p-3">
                              <BeamRebarElevation L={bm.L} h={sec.h} sections={bm.sections} />
                              <div className="border-t border-slate-100 pt-2">
                                <p className="mb-1 text-[11px] font-semibold text-[#0f4c92]">SECTION — {s.label}{s.bf ? ' (T-beam)' : ''}</p>
                                {s.bf && s.hf ? (
                                  <TSection bf={s.bf} bw={sec.b} h={sec.h} hf={s.hf}
                                    a={(d.bars * (Math.PI / 4) * sec.barDia ** 2 * sec.fy) / (0.85 * sec.fc * s.bf)}
                                    bars={d.bars} barDia={sec.barDia} layers={d.layers} cover={sec.cover} stirrupDia={sec.tieDia} legs={d.legs} />
                                ) : (
                                  <BeamSchematic b={sec.b} h={sec.h} cover={sec.cover} barDia={sec.barDia} stirrupDia={sec.tieDia}
                                    bars={d.bars} d={d.d} dPrime={d.comprLayers.length > 0 ? d.dPrime : undefined}
                                    layers={d.layers} comprLayers={d.comprLayers} comprBars={d.comprBars} comprBarDia={16}
                                    naDepth={d.cNA} flexOK={d.flexOK} hogging={s.hogging} />
                                )}
                              </div>
                            </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ),
                  ]
                }))}
              </tbody>
            </table>
          </div>}

          {/* Prestressed member checks */}
          {design.prestressed.length > 0 && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Prestressed member checks (§24.5 · PCI)<SchedChip items={design.prestressed} ok={(pr) => pr.ok} /></h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-2 font-semibold">Member</th>
                  <th className="py-1 pr-2 text-right font-semibold">Loss %</th>
                  <th className="py-1 pr-2 text-right font-semibold">fse (MPa)</th>
                  <th className="py-1 pr-2 font-semibold">Transfer</th>
                  <th className="py-1 pr-2 font-semibold">Service</th>
                  <th className="py-1 pr-2 text-right font-semibold">φMn / Mu</th>
                  <th className="py-1 pr-2 font-semibold">1.2Mcr</th>
                  <th className="py-1 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {design.prestressed.map((pr) => (
                  <tr key={pr.id} className={`border-t border-slate-100 ${pr.ok ? '' : 'bg-red-50 text-red-700'}`}>
                    <td className="py-1 pr-2 font-medium">{pr.id} ({f1(pr.L)} m)</td>
                    <td className="py-1 pr-2 text-right">{pr.design.lossPct.toFixed(1)}</td>
                    <td className="py-1 pr-2 text-right">{f1(pr.design.fse)}</td>
                    <td className="py-1 pr-2">{pr.design.transferOK ? '✓' : '✗'}</td>
                    <td className="py-1 pr-2">{pr.design.serviceOK ? '✓' : '✗'}</td>
                    <td className="py-1 pr-2 text-right">{f1(pr.design.phiMn)} / {f1(pr.design.Mu)}</td>
                    <td className="py-1 pr-2">{pr.design.crackingOK ? '✓' : '✗'}</td>
                    <td className="py-1">{pr.ok ? '✓ OK' : '✗ FAILS'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}

          {/* Column schedule (full width) — RC only */}
          {design.columns.length > 0 && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">RC column schedule<SchedChip items={design.columns} ok={(c) => c.ok} /></h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-2 font-semibold">Column</th>
                  <th className="py-1 pr-2 font-semibold">Section</th>
                  <th className="py-1 pr-2 text-right font-semibold">Pu (kN)</th>
                  <th className="py-1 pr-2 text-right font-semibold">Mu</th>
                  <th className="py-1 pr-2 font-semibold">Bars</th>
                  <th className="py-1 pr-2 text-right font-semibold">Util</th>
                  <th className="py-1 font-semibold">Case</th>
                </tr>
              </thead>
              <tbody>
                {design.columns.flatMap((c) => {
                  const key = `col:${c.id}`, open = expanded === key || reportOpen
                  const cs = sectionFor(c.id)
                  return [
                    <tr key={key} onClick={() => setExpanded(expanded === key ? null : key)}
                      className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${c.ok ? '' : 'bg-red-50 text-red-700'}`}>
                      <td className="py-1 pr-2 font-medium">{open ? '▾' : '▸'} {c.id}</td>
                      <td className="py-1 pr-2">{cs?.name}</td>
                      <td className="py-1 pr-2 text-right">{f1(c.Pu)}</td>
                      <td className="py-1 pr-2 text-right">{f1(c.Mu)}</td>
                      <td className="py-1 pr-2">{c.bars}⌀{cs?.barDia} · ties @{Math.round(c.tieSpacingFinal)}{c.seismicSConf !== undefined ? ' ✱' : ''}</td>
                      <td className="py-1 pr-2 text-right">{(c.util * 100).toFixed(0)}%</td>
                      <td className="py-1 text-slate-500">{c.gov}</td>
                    </tr>,
                    open && model && cs && (
                      <tr key={`${key}:sol`}>
                        <td colSpan={7} className="bg-slate-50/60 px-2 pb-2">
                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.7fr_1fr]">
                            {wantSol && <WorkedSolution steps={columnRowSolution(cs, c)} title={`${c.id} — worked solution`} />}
                            {wantDraw && (
                            <div className="space-y-3 self-start rounded-lg border border-slate-200 bg-white p-3">
                              <ColumnElevation Lh={c.L} b={cs.b} barDia={cs.barDia} tieDia={cs.tieDia} bars={c.bars} tieSpacing={c.tieSpacingFinal} />
                              <div className="border-t border-slate-100 pt-2">
                                <p className="mb-1 text-[11px] font-semibold text-[#0f4c92]">SECTION</p>
                                <ColumnSchematic shape="tied" b={cs.b} h={cs.h} cover={cs.cover}
                                  barDia={cs.barDia} tieDia={cs.tieDia} bars={c.bars} tieSpacing={c.tieSpacingFinal} />
                              </div>
                              {c.seismicSConf !== undefined && (
                                <div className="border-t border-slate-100 pt-2 text-[11px] text-slate-600">
                                  <p className="mb-0.5 font-semibold text-[#0f4c92]">Seismic confinement ({seismicSystem.toUpperCase()})</p>
                                  <p>Confinement zone ℓo = {Math.round(c.seismicLoZone!)} mm</p>
                                  <p>Ties within ℓo @ {Math.round(c.seismicSConf)} mm <span className="text-slate-500">({c.tieSpacingLabel})</span></p>
                                  {c.seismicSOut !== undefined && c.seismicSOut !== c.tieSpacing && (
                                    <p>Ties outside ℓo @ {Math.round(c.seismicSOut)} mm</p>
                                  )}
                                  <p className="mt-0.5 text-slate-500">✱ Seismic controls over §425.7.2 gravity tie spacing ({Math.round(c.tieSpacing)} mm)</p>
                                </div>
                              )}
                            </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>}

          {/* Strong-column/weak-beam joint check — NSCP §418.7.3.2 (SMF only) */}
          {design.scwb.length > 0 && report !== 'draw-only' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Strong-column / weak-beam — NSCP §418.7.3.2<SchedChip items={design.scwb} ok={(j) => j.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Joint</th>
                    <th className="py-1 pr-2 text-right font-semibold">ΣMnc (kN·m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">ΣMnb (kN·m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">Ratio</th>
                    <th className="py-1 pr-2 text-right font-semibold">≥ 6/5</th>
                    <th className="py-1 font-semibold">Cols / Beams</th>
                  </tr>
                </thead>
                <tbody>
                  {design.scwb.map((j) => (
                    <tr key={j.node} className="border-t border-slate-100">
                      <td className="py-1 pr-2 font-medium">{j.node}</td>
                      <td className="py-1 pr-2 text-right font-mono">{f1(j.sumMnc)}</td>
                      <td className="py-1 pr-2 text-right font-mono">{f1(j.sumMnb)}</td>
                      <td className="py-1 pr-2 text-right font-mono">{Number.isFinite(j.ratio) ? j.ratio.toFixed(2) : '∞'}</td>
                      <td className={`py-1 pr-2 text-right font-semibold ${j.ok ? 'text-emerald-600' : 'text-red-600'}`}>{j.ok ? '✓' : '✗'}</td>
                      <td className="py-1 text-slate-500">{j.nCols} / {j.nBeams}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] text-slate-500">
                ΣMnc ≥ (6/5)·ΣMnb at each beam-column joint (§418.7.3.2). Column Mnc is taken at the design axial Pu;
                beam Mnb from the heaviest designed tension steel. Failing joints need larger columns or lighter beams.
                {design.scwb.every((j) => j.ok) ? ' All joints satisfy the requirement.' : ' ✗ One or more joints fail.'}
              </p>
            </div>
          )}

          {/* Slab schedule (full width) — two-way DDM */}
          {design.slabs.length > 0 && report !== 'draw-only' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Slab schedule (two-way DDM)<SchedChip items={design.slabs} ok={(x) => x.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Panel</th>
                    <th className="py-1 pr-2 font-semibold">lx × ly (m)</th>
                    <th className="py-1 pr-2 font-semibold">h (mm)</th>
                    <th className="py-1 pr-2 font-semibold">Behaviour</th>
                    <th className="py-1 pr-2 text-right font-semibold">Mo,x / Mo,y (kN·m)</th>
                    <th className="py-1 font-semibold">DDM</th>
                  </tr>
                </thead>
                <tbody>
                  {design.slabs.flatMap((sl) => {
                    const key = `slab:${sl.plate}`, open = expanded === key || (reportOpen && wantSol)
                    const dd = sl.design
                    return [
                      <tr key={key} onClick={() => setExpanded(expanded === key ? null : key)}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${dd.applicable ? '' : 'bg-amber-50 text-amber-800'}`}>
                        <td className="py-1 pr-2 font-medium">{open ? '▾' : '▸'} {sl.plate}</td>
                        <td className="py-1 pr-2">{f1(sl.lx)} × {f1(sl.ly)}</td>
                        <td className="py-1 pr-2">{Math.round(dd.h)}{dd.h < dd.hmin ? ` (< ${Math.round(dd.hmin)} min)` : ''}</td>
                        <td className="py-1 pr-2">{dd.twoWay ? 'two-way' : 'one-way'}</td>
                        <td className="py-1 pr-2 text-right">{f1(dd.x.Mo)} / {f1(dd.y.Mo)}</td>
                        <td className="py-1">{dd.applicable ? (dd.deflection.totalOK ? '✓' : '⚠ defl') : '⚠ check'}</td>
                      </tr>,
                      open && (
                        <tr key={`${key}:sol`}>
                          <td colSpan={6} className="bg-slate-50/60 px-3 pb-3">
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                              {[dd.x, dd.y].map((dr) => (
                                <div key={dr.dir}>
                                  <p className="mb-1 mt-2 text-[12px] font-bold text-[#0f4c92]">
                                    {dr.dir.toUpperCase()}-direction — ℓ1 = {f1(dr.l1)} m, ℓn = {f1(dr.ln)} m, Mo = {f1(dr.Mo)} kN·m
                                  </p>
                                  <table className="w-full border-collapse text-[11px]">
                                    <thead>
                                      <tr className="text-left text-slate-500">
                                        <th className="py-0.5 pr-2">Location</th>
                                        <th className="py-0.5 pr-2 text-right">M (kN·m)</th>
                                        <th className="py-0.5 pr-2">Column strip</th>
                                        <th className="py-0.5">Middle strip</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {dr.locations.map((loc, li) => (
                                        <tr key={li} className="border-t border-slate-100">
                                          <td className="py-0.5 pr-2">{loc.name} <span className="text-slate-500">({loc.coeff.toFixed(2)})</span></td>
                                          <td className="py-0.5 pr-2 text-right">{f1(loc.M)}</td>
                                          <td className="py-0.5 pr-2">⌀12 @ {Math.round(loc.column.spacing)}{loc.column.usedMin ? ' (min)' : ''}</td>
                                          <td className="py-0.5">{loc.middle.b > 1 ? `⌀12 @ ${Math.round(loc.middle.spacing)}${loc.middle.usedMin ? ' (min)' : ''}` : '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ))}
                            </div>
                            {/* Deflection (Branson Ie + crossing-strip) */}
                            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
                              <p className="mb-1 text-[12px] font-bold text-[#0f4c92]">Deflection (NSCP §424.2)</p>
                              <table className="w-full border-collapse text-[11px]">
                                <tbody>
                                  <tr className="border-t border-slate-100">
                                    <td className="py-0.5 pr-2 text-slate-500">Immediate (D+L)</td>
                                    <td className="py-0.5 pr-2 text-right">{dd.deflection.immediate.toFixed(1)} mm</td>
                                    <td className="py-0.5 pr-2 text-slate-500">{dd.deflection.cracked ? 'section cracked (Ie < Ig)' : 'uncracked (Ie = Ig)'}</td>
                                  </tr>
                                  <tr className="border-t border-slate-100">
                                    <td className="py-0.5 pr-2 text-slate-500">Immediate live</td>
                                    <td className="py-0.5 pr-2 text-right">{dd.deflection.immLive.toFixed(1)} mm</td>
                                    <td className={`py-0.5 pr-2 ${dd.deflection.liveOK ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      ≤ ℓn/360 = {dd.deflection.limitLive.toFixed(1)} mm {dd.deflection.liveOK ? '✓' : '✗'}
                                    </td>
                                  </tr>
                                  <tr className="border-t border-slate-100">
                                    <td className="py-0.5 pr-2 text-slate-500">Long-term + live (λΔ = {dd.deflection.lambdaDelta.toFixed(1)})</td>
                                    <td className="py-0.5 pr-2 text-right">{dd.deflection.total.toFixed(1)} mm</td>
                                    <td className={`py-0.5 pr-2 ${dd.deflection.totalOK ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      ≤ ℓn/240 = {dd.deflection.limitTotal.toFixed(1)} mm {dd.deflection.totalOK ? '✓' : '✗'}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            {dd.notes.length > 0 && (
                              <ul className="mt-2 list-disc pl-5 text-[11px] text-slate-500">
                                {dd.notes.map((n, ni) => <li key={ni}>{n}</li>)}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                NSCP §408.10 Direct Design Method: Mo = wu·ℓ2·ℓn²/8 split into negative/positive then column/middle
                strips (αf neglected → conservative slab steel). Column-strip width = 2·min(0.25ℓ1, 0.25ℓ2).
                Deflection per §424.2 (Branson Ie + crossing-strip; λΔ = 2.0).
              </p>
            </div>
          )}

          {/* Shear-wall schedule (full width) — in-plane reinforcement */}
          {design.walls.length > 0 && report !== 'draw-only' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Shear-wall schedule (in-plane)<SchedChip items={design.walls} ok={(w) => w.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Wall</th>
                    <th className="py-1 pr-2 font-semibold">ℓw × hw (m)</th>
                    <th className="py-1 pr-2 font-semibold">t (mm)</th>
                    <th className="py-1 pr-2 font-semibold">hw/ℓw</th>
                    <th className="py-1 pr-2 text-right font-semibold">Vu / φVn (kN)</th>
                    <th className="py-1 pr-2 font-semibold">Horiz ρt</th>
                    <th className="py-1 pr-2 font-semibold">Vert ρℓ</th>
                    <th className="py-1 font-semibold">OK</th>
                  </tr>
                </thead>
                <tbody>
                  {design.walls.flatMap((wl) => {
                    const key = `wall:${wl.id}`, open = expanded === key || (reportOpen && wantSol)
                    const wd = wl.design
                    const curt = wd.twoCurtains ? '2 curtains' : '1 curtain'
                    return [
                      <tr key={key} onClick={() => setExpanded(expanded === key ? null : key)}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${wl.ok ? '' : 'bg-rose-50 text-rose-700'}`}>
                        <td className="py-1 pr-2 font-medium">{open ? '▾' : '▸'} {wl.id} <span className="text-slate-500">({wl.member})</span></td>
                        <td className="py-1 pr-2">{f1(wl.lw)} × {f1(wl.hw)}</td>
                        <td className="py-1 pr-2">{Math.round(wl.thickness)}</td>
                        <td className="py-1 pr-2">{wd.aspect.toFixed(2)}</td>
                        <td className="py-1 pr-2 text-right">{f1(wl.Vu)} / {f1(wd.phiVn)}</td>
                        <td className="py-1 pr-2">⌀12 @ {Math.round(wd.horiz.spacing)}{wd.horiz.usedMin ? ' (min)' : ''}</td>
                        <td className="py-1 pr-2">⌀12 @ {Math.round(wd.vert.spacing)}{wd.vert.usedMin ? ' (min)' : ''}</td>
                        <td className="py-1">{wl.ok ? '✓' : '✗'}</td>
                      </tr>,
                      open && (
                        <tr key={`${key}:sol`}>
                          <td colSpan={8} className="bg-slate-50/60 px-3 pb-3">
                            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-3">
                              <div><span className="text-slate-500">Acv</span> = {Math.round(wd.Acv)} mm²</div>
                              <div><span className="text-slate-500">αc</span> = {wd.alphaC.toFixed(2)}</div>
                              <div><span className="text-slate-500">Curtains</span>: {curt}</div>
                              <div><span className="text-slate-500">Vn cap (0.83·Acv√fc)</span> = {f1(wd.VnCap)} kN</div>
                              <div><span className="text-slate-500">ρt req</span> = {wd.horiz.rhoReq.toFixed(4)}</div>
                              <div><span className="text-slate-500">s,max</span> = {Math.round(wd.sMax)} mm</div>
                              <div><span className="text-slate-500">Boundary elements</span>: {wd.boundaryElement ? 'required' : 'not indicated'}</div>
                              <div><span className="text-slate-500">Governing case</span>: {wl.gov || '—'}</div>
                            </div>
                            {wd.notes.length > 0 && (
                              <ul className="mt-2 list-disc pl-5 text-[11px] text-slate-500">
                                {wd.notes.map((n, ni) => <li key={ni}>{n}</li>)}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                NSCP §418.10: Vn = Acv(αc·λ√f′c + ρt·fy), φ = 0.75, capped at 0.83·Acv·√f′c. In-plane shear from the
                enveloped strut forces; distributed web steel ρt, ρℓ ≥ 0.0025. Flexural boundary reinforcement designed separately.
              </p>
            </div>
          )}

          {/* Steel beam schedule (full width) — only when steel members exist */}
          {/* Timber beam / girder schedule */}
          {design.woodBeams.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Timber beam / girder schedule — NDS §3.3/§3.4 (NSCP §6, LRFD)<SchedChip items={design.woodBeams} ok={(b) => b.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Beam</th>
                    <th className="py-1 pr-2 font-semibold">b×d (mm)</th>
                    <th className="py-1 pr-2 font-semibold">Grade</th>
                    <th className="py-1 pr-2 text-right font-semibold">Mu (kN·m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">F′b (MPa)</th>
                    <th className="py-1 pr-2 text-right font-semibold">CL</th>
                    <th className="py-1 pr-2 text-right font-semibold">util M</th>
                    <th className="py-1 pr-2 text-right font-semibold">util V</th>
                    <th className="py-1 font-semibold">Case</th>
                  </tr>
                </thead>
                <tbody>
                  {design.woodBeams.flatMap((b) => {
                    const key = `wbeam:${b.id}`, open = expanded === key || reportOpen
                    return [
                      <tr key={key} onClick={() => setExpanded(expanded === key ? null : key)}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${b.ok ? '' : 'bg-red-50 text-red-700'}`}>
                        <td className="py-1 pr-2 font-medium">{open ? '▾' : '▸'} {b.id}</td>
                        <td className="py-1 pr-2 font-mono">{b.b}×{b.d}</td>
                        <td className="py-1 pr-2" title={WOOD_SPECIES[b.species]?.label ?? b.species}>{b.species}{b.kind === 'glulam' ? ' (GL)' : ''}</td>
                        <td className="py-1 pr-2 text-right">{f1(b.Mu)}</td>
                        <td className="py-1 pr-2 text-right">{b.FbPrime.toFixed(2)}</td>
                        <td className="py-1 pr-2 text-right">{b.CL.toFixed(2)}</td>
                        <td className={`py-1 pr-2 text-right font-semibold ${b.utilM > 1 ? 'text-red-600' : b.utilM > 0.9 ? 'text-amber-600' : 'text-green-700'}`}>{(b.utilM * 100).toFixed(0)}%</td>
                        <td className={`py-1 pr-2 text-right font-semibold ${b.utilV > 1 ? 'text-red-600' : b.utilV > 0.9 ? 'text-amber-600' : 'text-green-700'}`}>{(b.utilV * 100).toFixed(0)}%</td>
                        <td className="py-1 text-[11px] text-slate-500">{b.gov}</td>
                      </tr>,
                      open && wantSol && (
                        <tr key={`${key}:sol`}>
                          <td colSpan={9} className="bg-slate-50/60 px-2 pb-2">
                            <WorkedSolution steps={woodBeamRowSolution(b)} title={`${b.id} — worked solution`} />
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                fb = M/S ≤ F′b (§3.3, beam stability CL §3.3.3); fv = 1.5V/A ≤ F′v (§3.4). Reference values adjusted by
                CD→λ, CM, CF/CV and converted to LRFD via Appendix N (KF·φ·λ). le auto per §3.3.3.
              </p>
            </div>
          )}
          {/* Timber column schedule */}
          {design.woodColumns.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Timber column schedule — NDS §3.7 + §3.9 (NSCP §6, LRFD)<SchedChip items={design.woodColumns} ok={(c) => c.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Column</th>
                    <th className="py-1 pr-2 font-semibold">b×d (mm)</th>
                    <th className="py-1 pr-2 font-semibold">Grade</th>
                    <th className="py-1 pr-2 text-right font-semibold">Pu (kN)</th>
                    <th className="py-1 pr-2 text-right font-semibold">Mu (kN·m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">F′c (MPa)</th>
                    <th className="py-1 pr-2 text-right font-semibold">CP</th>
                    <th className="py-1 pr-2 text-right font-semibold">le/d</th>
                    <th className="py-1 pr-2 text-right font-semibold">Ratio</th>
                    <th className="py-1 font-semibold">Case</th>
                  </tr>
                </thead>
                <tbody>
                  {design.woodColumns.flatMap((c) => {
                    const key = `wcol:${c.id}`, open = expanded === key || reportOpen
                    return [
                      <tr key={key} onClick={() => setExpanded(expanded === key ? null : key)}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${c.ok ? '' : 'bg-red-50 text-red-700'}`}>
                        <td className="py-1 pr-2 font-medium">{open ? '▾' : '▸'} {c.id}</td>
                        <td className="py-1 pr-2 font-mono">{c.b}×{c.d}</td>
                        <td className="py-1 pr-2" title={WOOD_SPECIES[c.species]?.label ?? c.species}>{c.species}{c.kind === 'glulam' ? ' (GL)' : ''}</td>
                        <td className="py-1 pr-2 text-right">{f1(c.Pu)}</td>
                        <td className="py-1 pr-2 text-right">{f1(c.Mu)}</td>
                        <td className="py-1 pr-2 text-right">{c.FcPrime.toFixed(2)}</td>
                        <td className="py-1 pr-2 text-right">{c.CP.toFixed(2)}</td>
                        <td className="py-1 pr-2 text-right">{c.slenderness.toFixed(0)}</td>
                        <td className={`py-1 pr-2 text-right font-semibold ${c.ratio > 1 ? 'text-red-600' : c.ratio > 0.9 ? 'text-amber-600' : 'text-green-700'}`}>{(c.ratio * 100).toFixed(0)}%</td>
                        <td className="py-1 text-[11px] text-slate-500">{c.gov}</td>
                      </tr>,
                      open && wantSol && (
                        <tr key={`${key}:sol`}>
                          <td colSpan={10} className="bg-slate-50/60 px-2 pb-2">
                            <WorkedSolution steps={woodColumnRowSolution(c)} title={`${c.id} — worked solution`} />
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                fc = P/A ≤ F′c with column stability CP (§3.7.1, governing plane le/d); beam-column members add the §3.9.2
                interaction (fc/F′c)² + fb/[F′b(1 − fc/FcE)]. Ratio = governing of the two.
              </p>
            </div>
          )}
          {design.steelBeams.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Steel beam / girder schedule — AISC 360-16 LRFD<SchedChip items={design.steelBeams} ok={(b) => b.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Member</th>
                    <th className="py-1 pr-2 font-semibold">Shape</th>
                    <th className="py-1 pr-2 text-right font-semibold">Mu (kN·m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">φMn</th>
                    <th className="py-1 pr-2 font-semibold">LTB</th>
                    <th className="py-1 pr-2 text-right font-semibold">Vu (kN)</th>
                    <th className="py-1 pr-2 text-right font-semibold">φVn</th>
                    <th className="py-1 pr-2 text-right font-semibold">δ est.</th>
                    <th className="py-1 pr-2 text-right font-semibold">Util</th>
                    <th className="py-1 font-semibold">Case</th>
                  </tr>
                </thead>
                <tbody>
                  {design.steelBeams.flatMap((b) => {
                    const key = `beam-${b.id}`
                    const open = expanded === key
                    const util = Math.max(b.utilM, b.utilV, b.deflLim > 0 ? b.defl / b.deflLim : 0)
                    const rows = [
                      <tr key={b.id}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50 ${b.ok ? '' : 'bg-red-50 text-red-700'}`}
                        onClick={() => setExpanded(open ? null : key)}>
                        <td className="py-1 pr-2 font-medium">{b.id} <span className="text-slate-500">{open ? '▲' : '▼'}</span></td>
                        <td className="py-1 pr-2 font-mono">{b.shape}</td>
                        <td className="py-1 pr-2 text-right">{f1(b.Mu)}</td>
                        <td className="py-1 pr-2 text-right">{f1(b.phiMn)}</td>
                        <td className="py-1 pr-2">{b.ltbZone}</td>
                        <td className="py-1 pr-2 text-right">{f1(b.Vu)}</td>
                        <td className="py-1 pr-2 text-right">{f1(b.phiVn)}</td>
                        <td className={`py-1 pr-2 text-right font-mono ${b.deflOK ? 'text-slate-700' : 'text-red-600 font-semibold'}`}>{b.defl.toFixed(1)}</td>
                        <td className={`py-1 pr-2 text-right font-semibold ${util > 1 ? 'text-red-600' : util > 0.9 ? 'text-amber-600' : 'text-green-700'}`}>{(util * 100).toFixed(0)}%</td>
                        <td className="py-1 text-[11px] text-slate-500">{b.gov}</td>
                      </tr>,
                    ]
                    if (open) rows.push(
                      <tr key={`${b.id}-sol`}>
                        <td colSpan={10} className="bg-slate-50 px-4 py-3">
                          <div className="flex flex-wrap gap-6">
                            {/* W-shape cross-section drawing */}
                            <div className="shrink-0">
                              <WShapeSection shape={b.shape} d={b.d} bf={b.bf} tf={b.tf} tw={b.tw} />
                            </div>
                            {/* Section properties */}
                            <div className="min-w-[160px]">
                              <p className="mb-1 text-[11px] font-bold text-slate-600 uppercase tracking-wide">Section properties</p>
                              <table className="text-[11px] leading-5">
                                <tbody>
                                  {[['d', `${b.d.toFixed(1)} mm`], ['bf', `${b.bf.toFixed(1)} mm`], ['tf', `${b.tf.toFixed(1)} mm`], ['tw', `${b.tw.toFixed(1)} mm`],
                                    ['Ix', `${(b.Ix / 1e6).toFixed(1)} ×10⁶ mm⁴`], ['Sx', `${(b.Sx / 1e3).toFixed(0)} ×10³ mm³`],
                                    ['Zx', `${(b.Zx / 1e3).toFixed(0)} ×10³ mm³`], ['Iy', `${(b.Iy / 1e6).toFixed(1)} ×10⁶ mm⁴`], ['ry', `${b.ry.toFixed(1)} mm`],
                                  ].map(([lbl, val]) => (
                                    <tr key={lbl}><td className="pr-3 text-slate-500">{lbl}</td><td className="font-mono">{val}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* §F2 Flexure check */}
                            <div className="min-w-[200px]">
                              <p className="mb-1 text-[11px] font-bold text-slate-600 uppercase tracking-wide">§F2 Flexure</p>
                              <table className="text-[11px] leading-5">
                                <tbody>
                                  {[
                                    ['Mp = Fy·Zx', `${f1(b.Mp / 1e6)} kN·m`],
                                    ['Lp', `${(b.Lp / 1000).toFixed(2)} m`],
                                    ['Lr', `${(b.Lr / 1000).toFixed(2)} m`],
                                    ['Lb', `${(b.Lb / 1000).toFixed(2)} m`],
                                    ['LTB zone', b.ltbZone],
                                    ['Mn', `${f1(b.Mn / 1e6)} kN·m`],
                                    ['φMn (φ=0.9)', `${f1(b.phiMn)} kN·m`],
                                    ['Mu', `${f1(b.Mu)} kN·m`],
                                    ['Util (M)', `${(b.utilM * 100).toFixed(1)}%`],
                                    ['Compact flange?', b.compactFlange ? `✓  λf=${b.lambdaF.toFixed(1)} ≤ λpf=${b.lambdaPF.toFixed(1)}` : `✗  λf=${b.lambdaF.toFixed(1)} > λpf=${b.lambdaPF.toFixed(1)}`],
                                    ['Compact web?', b.compactWeb ? `✓  λw=${b.lambdaW.toFixed(1)} ≤ λpw=${b.lambdaPW.toFixed(1)}` : `✗  λw=${b.lambdaW.toFixed(1)} > λpw=${b.lambdaPW.toFixed(1)}`],
                                  ].map(([lbl, val]) => (
                                    <tr key={lbl}><td className="pr-3 text-slate-500">{lbl}</td><td className="font-mono">{val}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* §G2.1 Shear check */}
                            <div className="min-w-[180px]">
                              <p className="mb-1 text-[11px] font-bold text-slate-600 uppercase tracking-wide">§G2.1 Shear</p>
                              <table className="text-[11px] leading-5">
                                <tbody>
                                  {[
                                    ['Aw = d·tw', `${(b.Aw).toFixed(0)} mm²`],
                                    ['h/tw', `${b.hwTw.toFixed(1)}`],
                                    ['Cv1', `${b.Cv1.toFixed(3)}`],
                                    ['φV (φ=1.0)', b.phiV.toFixed(2)],
                                    ['φVn', `${f1(b.phiVn)} kN`],
                                    ['Vu', `${f1(b.Vu)} kN`],
                                    ['Util (V)', `${(b.utilV * 100).toFixed(1)}%`],
                                  ].map(([lbl, val]) => (
                                    <tr key={lbl}><td className="pr-3 text-slate-500">{lbl}</td><td className="font-mono">{val}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* §L2 Serviceability — deflection */}
                            <div className="min-w-[180px]">
                              <p className="mb-1 text-[11px] font-bold text-slate-600 uppercase tracking-wide">§L2 Serviceability</p>
                              <table className="text-[11px] leading-5">
                                <tbody>
                                  {[
                                    ['δ est. (SS bound)', `${b.defl.toFixed(1)} mm`],
                                    ['L/240 limit', `${b.deflLim.toFixed(1)} mm`],
                                    ['δ / limit', `${b.deflLim > 0 ? ((b.defl / b.deflLim) * 100).toFixed(1) : '—'}%`],
                                    ['OK?', b.deflOK ? '✓ Pass' : '✗ Fail'],
                                  ].map(([lbl, val]) => (
                                    <tr key={lbl}><td className="pr-3 text-slate-500">{lbl}</td><td className={`font-mono ${lbl === 'OK?' && !b.deflOK ? 'text-red-600 font-bold' : ''}`}>{val}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          <p className="mt-2 text-[10px] text-slate-500">Lb = member brace spacing (set per-member in Geometry → Properties; blank = full length, conservative). Cb = 1.0. φ = 0.9 (flexure), 1.0 (shear, doubly-symmetric I). δ est. = 5Mu·L²/(48·E·Ix), SS bound vs L/240.</p>
                        </td>
                      </tr>
                    )
                    return rows
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                §F2 flexure (Lb = full member length, conservative; Cb = 1.0), §G2.1 shear, §L2 serviceability (δ est. = 5Mu·L²/48EI vs L/240). δ est. column shows estimated midspan deflection (mm) — red if &gt; L/240. Util = max(Mu/φMn, Vu/φVn, δ/lim). Click a row to expand.
              </p>
            </div>
          )}

          {/* Steel column schedule (full width) */}
          {design.steelColumns.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Steel column schedule — AISC §E3 + §H1-1<SchedChip items={design.steelColumns} ok={(c) => c.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Column</th>
                    <th className="py-1 pr-2 font-semibold">Shape</th>
                    <th className="py-1 pr-2 text-right font-semibold">Pu (kN)</th>
                    <th className="py-1 pr-2 text-right font-semibold">φPn</th>
                    <th className="py-1 pr-2 text-right font-semibold">Mu (kN·m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">KL/r</th>
                    <th className="py-1 pr-2 font-semibold">Eq.</th>
                    <th className="py-1 pr-2 text-right font-semibold">Ratio</th>
                    <th className="py-1 font-semibold">Case</th>
                  </tr>
                </thead>
                <tbody>
                  {design.steelColumns.flatMap((c) => {
                    const key = `col-${c.id}`
                    const open = expanded === key
                    const E_STEEL = 200000
                    const rows = [
                      <tr key={c.id}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50 ${c.ok ? '' : 'bg-red-50 text-red-700'}`}
                        onClick={() => setExpanded(open ? null : key)}>
                        <td className="py-1 pr-2 font-medium">{c.id} <span className="text-slate-500">{open ? '▲' : '▼'}</span></td>
                        <td className="py-1 pr-2 font-mono">{c.shape}</td>
                        <td className="py-1 pr-2 text-right">{f1(c.Pu)}</td>
                        <td className="py-1 pr-2 text-right">{f1(c.phiPn)}</td>
                        <td className="py-1 pr-2 text-right">{f1(c.Mu)}</td>
                        <td className="py-1 pr-2 text-right">{c.slenderness.toFixed(0)}</td>
                        <td className="py-1 pr-2">{c.equation}</td>
                        <td className={`py-1 pr-2 text-right font-semibold ${c.ratio > 1 ? 'text-red-600' : c.ratio > 0.9 ? 'text-amber-600' : 'text-green-700'}`}>{(c.ratio * 100).toFixed(0)}%</td>
                        <td className="py-1 text-[11px] text-slate-500">{c.gov}</td>
                      </tr>,
                    ]
                    if (open) rows.push(
                      <tr key={`${c.id}-sol`}>
                        <td colSpan={9} className="bg-slate-50 px-4 py-3">
                          <div className="flex flex-wrap gap-6">
                            {/* cross-section drawing — W/WT as flanged section, others via the universal drawer */}
                            <div className="shrink-0">
                              {(() => {
                                const sh = shapeByName(c.shape)
                                if (sh && sh.family !== 'W' && sh.family !== 'WT') return <SectionShape sec={effectiveSection(sh, false)} />
                                return <WShapeSection shape={c.shape} d={c.d} bf={c.bf} tf={c.tf} tw={c.tw} />
                              })()}
                            </div>
                            {/* Section properties */}
                            <div className="min-w-[160px]">
                              <p className="mb-1 text-[11px] font-bold text-slate-600 uppercase tracking-wide">Section properties</p>
                              <table className="text-[11px] leading-5">
                                <tbody>
                                  {[['d', `${c.d.toFixed(1)} mm`], ['bf', `${c.bf.toFixed(1)} mm`], ['tf', `${c.tf.toFixed(1)} mm`], ['tw', `${c.tw.toFixed(1)} mm`],
                                    ['A', `${c.A.toFixed(0)} mm²`], ['rx', `${c.rx.toFixed(1)} mm`], ['ry', `${c.ry.toFixed(1)} mm`],
                                  ].map(([lbl, val]) => (
                                    <tr key={lbl}><td className="pr-3 text-slate-500">{lbl}</td><td className="font-mono">{val}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* §E3 Axial check */}
                            <div className="min-w-[210px]">
                              <p className="mb-1 text-[11px] font-bold text-slate-600 uppercase tracking-wide">§E3 Axial compression</p>
                              <table className="text-[11px] leading-5">
                                <tbody>
                                  {[
                                    ['KLx/rx', c.slendernessX.toFixed(1)],
                                    ['KLy/ry', c.slendernessY.toFixed(1)],
                                    ['Governing KL/r', c.slenderness.toFixed(1)],
                                    ['Fe = π²E/(KL/r)²', `${c.Fe.toFixed(1)} MPa`],
                                    ['4.71√(E/Fy)', `${(4.71 * Math.sqrt(E_STEEL / (c.Fcr > 0 ? c.Pu / (c.phiPn / 0.9 / c.A || 1) : 345))).toFixed(1)}`],
                                    ['Fcr', `${c.Fcr.toFixed(1)} MPa`],
                                    ['φPn (φ=0.9)', `${f1(c.phiPn)} kN`],
                                    ['Pu', `${f1(c.Pu)} kN`],
                                    ['Pu/φPn', `${(c.Pu / (c.phiPn || 1) * 100).toFixed(1)}%`],
                                  ].map(([lbl, val]) => (
                                    <tr key={lbl}><td className="pr-3 text-slate-500">{lbl}</td><td className="font-mono">{val}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* §H1-1 Combined */}
                            <div className="min-w-[180px]">
                              <p className="mb-1 text-[11px] font-bold text-slate-600 uppercase tracking-wide">§H1-1 Combined</p>
                              <table className="text-[11px] leading-5">
                                <tbody>
                                  {[
                                    ['Pu/φPn', `${(c.Pu / (c.phiPn || 1)).toFixed(3)}`],
                                    ['Mu', `${f1(c.Mu)} kN·m`],
                                    ['φMn', `${f1(c.phiMn)} kN·m`],
                                    ['Equation', c.equation],
                                    ['Interaction ratio', `${(c.ratio * 100).toFixed(1)}%`],
                                    ['Status', c.ok ? '✓ OK' : '✗ NG'],
                                  ].map(([lbl, val]) => (
                                    <tr key={lbl}><td className="pr-3 text-slate-500">{lbl}</td><td className={`font-mono ${lbl === 'Status' ? (c.ok ? 'text-green-700' : 'text-red-600') : ''}`}>{val}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          <p className="mt-2 text-[10px] text-slate-500">K = 1.0 (conservative). §E3: 4.71√(E/Fy) threshold. §H1-1a when Pu/φPn ≥ 0.2, else §H1-1b.</p>
                        </td>
                      </tr>
                    )
                    return rows
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                §E3 axial buckling (governing KL/r, K = 1.0), §H1-1 combined axial + flexure. Ratio ≤ 100% passes. Click a row to expand the worked solution.
              </p>
            </div>
          )}

          {/* Base-plate schedule (full width) */}
          {design.basePlates.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Base-plate schedule — AISC §J8 / Design Guide 1<SchedChip items={design.basePlates} ok={(pl) => pl.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Node</th>
                    <th className="py-1 pr-2 font-semibold">Column</th>
                    <th className="py-1 pr-2 text-right font-semibold">Pu (kN)</th>
                    <th className="py-1 pr-2 text-right font-semibold">Tu (kN)</th>
                    <th className="py-1 pr-2 font-semibold">Plate B×N×t (mm)</th>
                    <th className="py-1 pr-2 text-right font-semibold">Bearing</th>
                    <th className="py-1 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {design.basePlates.map((p) => (
                    <tr key={p.node} className={`sched-row border-t border-slate-100 ${p.ok ? '' : 'bg-red-50 text-red-700'}`}>
                      <td className="py-1 pr-2 font-medium">{p.node}</td>
                      <td className="py-1 pr-2">{p.shape}</td>
                      <td className="py-1 pr-2 text-right">{f1(p.Pu)}</td>
                      <td className="py-1 pr-2 text-right">{p.Tu > 0 ? f1(p.Tu) : '—'}</td>
                      <td className="py-1 pr-2">{f1(p.design.B)} × {f1(p.design.N)} × {p.tAdopt}</td>
                      <td className="py-1 pr-2 text-right">{(p.design.bearingUtil * 100).toFixed(0)}%</td>
                      <td className="py-1">{p.ok ? '✓ OK' : '✗ check'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                Bearing §J8: φc·0.85f′c·√(A2/A1), φc = 0.65. Plate thickness from cantilever bending
                t = ℓ√(2fp/(0.9Fy)); ℓ = max(m, n, n′). Uplift sizes anchor rods (φt·0.75·Fu).
                Adopted t rounded to plate stock.
              </p>
            </div>
          )}

          {/* Timber deck slab schedule — NDS §3 / NSCP §6 */}
          {design.woodSlabs.length > 0 && report !== 'draw-only' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Timber deck slab schedule — NDS §3 / NSCP §6<SchedChip items={design.woodSlabs} ok={(s) => s.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Panel</th>
                    <th className="py-1 pr-2 text-right font-semibold">Span (m)</th>
                    <th className="py-1 pr-2 font-semibold">Species</th>
                    <th className="py-1 pr-2 font-semibold">Joists</th>
                    <th className="py-1 pr-2 text-right font-semibold">Deck t</th>
                    <th className="py-1 pr-2 text-right font-semibold">Deck util</th>
                    <th className="py-1 pr-2 text-right font-semibold">Joist util</th>
                    <th className="py-1 pr-2 text-right font-semibold">Bd·ft</th>
                    <th className="py-1 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {design.woodSlabs.flatMap((s) => {
                    const key = `wslab:${s.plate}`, open = expanded === key || reportOpen
                    const t = s.design.takeoff
                    return [
                      <tr key={key} onClick={() => setExpanded(expanded === key ? null : key)}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${s.ok ? '' : 'bg-red-50 text-red-700'}`}>
                        <td className="py-1 pr-2 font-medium">{open ? '▾' : '▸'} {s.plate}</td>
                        <td className="py-1 pr-2 text-right">{f2(s.design.joist.span)}</td>
                        <td className="py-1 pr-2">{s.species}</td>
                        <td className="py-1 pr-2">{t.joistCount}·{f0(s.design.joist.b)}×{f0(s.design.joist.d)}</td>
                        <td className="py-1 pr-2 text-right">{f0(s.design.deck.d)}</td>
                        <td className="py-1 pr-2 text-right">{(s.design.deck.ratio * 100).toFixed(0)}%</td>
                        <td className="py-1 pr-2 text-right">{(s.design.joist.ratio * 100).toFixed(0)}%</td>
                        <td className="py-1 pr-2 text-right">{f0(t.joistBoardFeet + t.deckBoardFeet)}</td>
                        <td className="py-1 text-slate-500">{s.ok ? '✓ OK' : '✗ check'}</td>
                      </tr>,
                      open && wantSol && (
                        <tr key={`${key}:sol`}>
                          <td colSpan={9} className="bg-slate-50/60 px-2 pb-2">
                            <WorkedSolution steps={woodSlabRowSolution(s)} title={`${s.plate} — worked solution`} />
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">Deck-on-joist: the deck board spans the joist spacing, the joist spans the panel; bending + shear + service deflection (L/360 live, L/240 total). Board feet by size. Click a row for the worked solution.</p>
            </div>
          )}

          {/* Steel connection schedule — only for steel frames */}
          {(design.joints.length > 0 || design.beamJoints.length > 0) && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Steel connection schedule — AISC SCM<SchedChip items={[...design.joints.flatMap((j) => j.connections), ...design.beamJoints.flatMap((j) => j.connections)]} ok={(cn) => cn.ok} /></h3>
              <p className="mb-2 text-[11px] text-slate-500">
                Columns oriented with depth <em>d</em> in X (flanges face ±X); X-direction girders land on the column <strong>flange</strong> face (strong-axis moment connection), Z-direction beams land on the column <strong>web</strong> face (shear tab). Bolts: M20 A325 single-shear (φRₙ = 116.5 kN/bolt). Welds: E70XX fillet, both sides of plate.
              </p>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Node</th>
                    <th className="py-1 pr-2 font-semibold">Col. shape</th>
                    <th className="py-1 pr-2 font-semibold">Beam</th>
                    <th className="py-1 pr-2 font-semibold">Dir</th>
                    <th className="py-1 pr-2 font-semibold">Connects (col → beam)</th>
                    <th className="py-1 pr-2 font-semibold">Type</th>
                    <th className="py-1 pr-2 text-right font-semibold">Vu (kN)</th>
                    <th className="py-1 pr-2 text-right font-semibold">Mu (kN·m)</th>
                    <th className="py-1 pr-2 font-semibold">Bolts</th>
                    <th className="py-1 pr-2 font-semibold">Plate t×h</th>
                    <th className="py-1 pr-2 font-semibold">Weld</th>
                    <th className="py-1 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(design.joints as SteelJoint[]).flatMap((j) =>
                    j.connections.flatMap((c, ci) => {
                      const key = `conn:${j.nodeId}:${c.beamId}`
                      const open = expanded === key || reportOpen
                      const beamShapeName = model?.sections.find((sx) => sx.id === model.members.find((mm) => mm.id === c.beamId)?.section)?.shape
                      return [(
                      <tr key={`${j.nodeId}-${c.beamId}`} onClick={() => setExpanded(expanded === key ? null : key)}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${c.ok ? '' : 'bg-red-50 text-red-700'}`}>
                        <td className={`py-1 pr-2 align-top ${ci === 0 ? 'font-medium' : 'text-slate-300'}`}>
                          {open ? '▾' : '▸'} {j.nodeId}
                          {ci === 0 && <div className="text-[10px] text-slate-500">{j.strongAxisDir.toUpperCase()}-axis</div>}
                        </td>
                        <td className={`py-1 pr-2 font-mono align-top ${ci === 0 ? '' : 'text-slate-300'}`}>{j.columnShape}</td>
                        <td className="py-1 pr-2 font-medium">{c.beamId}</td>
                        <td className="py-1 pr-2 uppercase">{c.spanDir}</td>
                        <td className="py-1 pr-2 text-[11px]">
                          <span className={c.faceType === 'flange' ? 'font-semibold text-blue-700' : 'text-slate-600'}>col {c.faceType}</span>
                          <span className="text-slate-500"> → beam {c.beamElement}</span>
                        </td>
                        <td className="py-1 pr-2 text-[11px]">
                          {c.connType === 'moment-flange-weld' ? 'Moment (CJP flange)'
                            : c.connType === 'moment-web-plate' ? 'Moment (web ext. plates)' : 'Shear tab'}
                          <div className="text-[10px] text-slate-500">{c.pinned ? 'pin — releases Mz' : 'rigid'}</div>
                        </td>
                        <td className="py-1 pr-2 text-right">{f1(c.Vu)}</td>
                        <td className="py-1 pr-2 text-right">{f1(c.Mu)}</td>
                        <td className="py-1 pr-2 text-[11px]">
                          {c.bolts.n} × M{c.bolts.dia} A325 <span className="text-[10px] text-slate-500">(single shear)</span>
                          <div className="text-[10px] text-slate-500">R={f1(c.bolts.Rmax)}/{f1(c.bolts.phiRnKn)} kN/bolt · e={Math.round(c.bolts.ecc)}mm</div>
                        </td>
                        <td className="py-1 pr-2 text-[11px]">{c.tab.t}×{Math.round(c.tab.hMm)} mm</td>
                        <td className="py-1 pr-2 text-[11px]">
                          {c.tab.weldSizeMm}mm E70
                          {c.flange && <span className="ml-1 text-blue-600">{c.flange.webPlate ? '+ ext. plates' : '+ CJP flg'}</span>}
                        </td>
                        <td className="py-1 text-[11px]">
                          <span className={c.ok ? 'text-green-700' : 'text-red-600'}>{c.ok ? '✓ OK' : '✗ NG'}</span>
                          {c.flange && (
                            <div className="text-[10px] text-slate-500">Tf={f1(c.flange.Tf)} kN</div>
                          )}
                        </td>
                      </tr>
                      ),
                      open && (
                        <tr key={`${key}:detail`}>
                          <td colSpan={12} className="bg-slate-50/60 px-2 pb-2">
                            <div className="grid w-full grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                              <ConnectionDetail2D conn={c} hostShape={j.columnShape} hostKind="column" faceType={c.faceType} beamShape={beamShapeName} />
                              {wantSol && <WorkedSolution steps={connectionRowSolution(c, { kind: 'column', shape: j.columnShape, faceType: c.faceType })} title={`Connection ${j.nodeId} · ${c.beamId} — worked solution`} />}
                            </div>
                          </td>
                        </tr>
                      ),
                      ]
                    })
                  )}
                  {design.beamJoints.flatMap((bj) =>
                    bj.connections.flatMap((c, ci) => {
                      const key = `conn:${bj.nodeId}:${c.beamId}`
                      const open = expanded === key || reportOpen
                      const beamShapeName = model?.sections.find((sx) => sx.id === model.members.find((mm) => mm.id === c.beamId)?.section)?.shape
                      return [(
                      <tr key={`bb-${bj.nodeId}-${c.beamId}`} onClick={() => setExpanded(expanded === key ? null : key)}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${c.ok ? '' : 'bg-red-50 text-red-700'}`}>
                        <td className={`py-1 pr-2 align-top ${ci === 0 ? 'font-medium' : 'text-slate-300'}`}>
                          {open ? '▾' : '▸'} {bj.nodeId}
                          {ci === 0 && <div className="text-[10px] text-slate-500">beam-to-beam</div>}
                        </td>
                        <td className={`py-1 pr-2 font-mono align-top ${ci === 0 ? '' : 'text-slate-300'}`}>
                          {bj.girderShape}
                          {ci === 0 && <div className="text-[10px] text-slate-500">girder {bj.girderId}</div>}
                        </td>
                        <td className="py-1 pr-2 font-medium">{c.beamId}</td>
                        <td className="py-1 pr-2 uppercase">{c.spanDir}</td>
                        <td className="py-1 pr-2 text-[11px]">
                          <span className="text-slate-600">girder web</span>
                          <span className="text-slate-500"> → beam web{c.cope ? ` (coped ${c.cope.lengthMm}×${c.cope.depthMm})` : ''}</span>
                        </td>
                        <td className="py-1 pr-2 text-[11px]">
                          Fin plate
                          <div className="text-[10px] text-slate-500">pin — releases Mz</div>
                        </td>
                        <td className="py-1 pr-2 text-right">{f1(c.Vu)}</td>
                        <td className="py-1 pr-2 text-right">—</td>
                        <td className="py-1 pr-2 text-[11px]">
                          {c.bolts.n} × M{c.bolts.dia} A325 <span className="text-[10px] text-slate-500">(single shear)</span>
                          <div className="text-[10px] text-slate-500">R={f1(c.bolts.Rmax)}/{f1(c.bolts.phiRnKn)} kN/bolt · e={Math.round(c.bolts.ecc)}mm</div>
                        </td>
                        <td className="py-1 pr-2 text-[11px]">{c.tab.t}×{Math.round(c.tab.hMm)} mm</td>
                        <td className="py-1 pr-2 text-[11px]">{c.tab.weldSizeMm}mm E70</td>
                        <td className="py-1 text-[11px]">
                          <span className={c.ok ? 'text-green-700' : 'text-red-600'}>{c.ok ? '✓ OK' : '✗ NG'}</span>
                        </td>
                      </tr>
                      ),
                      open && (
                        <tr key={`${key}:detail`}>
                          <td colSpan={12} className="bg-slate-50/60 px-2 pb-2">
                            <div className="grid w-full grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                              <ConnectionDetail2D conn={c} hostShape={bj.girderShape} hostKind="girder" faceType="web" beamShape={beamShapeName} />
                              {wantSol && <WorkedSolution steps={connectionRowSolution(c, { kind: 'girder', shape: bj.girderShape })} title={`Connection ${bj.nodeId} · ${c.beamId} — worked solution`} />}
                            </div>
                          </td>
                        </tr>
                      ),
                      ]
                    })
                  )}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                Shear tab: A36 plate (Fy=248, Fu=400 MPa), M20 A325 bolts @ 75 mm pitch, 40 mm edge. Plate shear yielding φ=1.0 (§J4.2).
                Moment connection: CJP groove weld at beam flanges, φFu·A_flange (§J2.6). Weld = E70XX fillet both sides of shear tab.
                Beam-to-beam: fin plate welded to the girder web, supported-beam top flange coped to clear the girder flange (SCM Pt 9/10).
              </p>
            </div>
          )}

          {/* Footing schedule (full width) */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Footing schedule<SchedChip items={design.footings} ok={(f) => f.ok} /></h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-2 font-semibold">Node</th>
                  <th className="py-1 pr-2 text-right font-semibold">P / Pu (kN)</th>
                  <th className="py-1 pr-2 font-semibold">Plan</th>
                  <th className="py-1 pr-2 font-semibold">Dc</th>
                  <th className="py-1 pr-2 font-semibold">Steel</th>
                  <th className="py-1 font-semibold">Case</th>
                </tr>
              </thead>
              <tbody>
                {design.footings.flatMap((f) => {
                  const key = `ftg:${f.node}`, open = expanded === key || reportOpen
                  const cs = colSectionAt(f.node)
                  return [
                    <tr key={key} onClick={() => setExpanded(expanded === key ? null : key)}
                      className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${f.ok ? '' : 'bg-red-50 text-red-700'}`}>
                      <td className="py-1 pr-2 font-medium">{open ? '▾' : '▸'} {f.node}</td>
                      <td className="py-1 pr-2 text-right">{f1(f.P)} / {f1(f.Pu)}</td>
                      <td className="py-1 pr-2">B = {f2(f.design.B)} m</td>
                      <td className="py-1 pr-2">{Math.round(f.design.Dc)} mm</td>
                      <td className="py-1 pr-2">{f.design.bars}⌀{cs?.barDia} @ {Math.round(f.design.barSpacing)} e.w.</td>
                      <td className="py-1 text-slate-500">{f.gov}</td>
                    </tr>,
                    open && model && (
                      <tr key={`${key}:sol`}>
                        <td colSpan={6} className="bg-slate-50/60 px-2 pb-2">
                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.7fr_1fr]">
                            {wantSol && <WorkedSolution steps={footingRowSolution(cs ?? model.sections[0], soil, f)} title={`Footing ${f.node} — worked solution`} />}
                            {wantDraw && (
                            <div className="rounded-lg border border-slate-200 bg-white p-3">
                              <FootingSchematic Bx={f.design.B} By={f.design.B} Dc={f.design.Dc}
                                columnWidth={cs ? Math.min(cs.b, cs.h) : 400} H={Hf} />
                            </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>

          {/* Combined footing schedule (full width) */}
          {design.combined.length > 0 && report !== 'draw-only' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Combined footing schedule<SchedChip items={design.combined} ok={(c) => c.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Nodes</th>
                    <th className="py-1 pr-2 text-right font-semibold">Spacing</th>
                    <th className="py-1 pr-2 text-right font-semibold">DL / LL (kN)</th>
                    <th className="py-1 pr-2 font-semibold">Shape</th>
                    <th className="py-1 pr-2 font-semibold">Plan</th>
                    <th className="py-1 font-semibold">Dc</th>
                  </tr>
                </thead>
                <tbody>
                  {design.combined.flatMap((c) => {
                    const key = `comb:${c.nodes.join('-')}`, open = expanded === key || (reportOpen && wantSol)
                    return [
                      <tr key={key} onClick={() => setExpanded(expanded === key ? null : key)}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${c.ok ? '' : 'bg-red-50 text-red-700'}`}>
                        <td className="py-1 pr-2 font-medium">{open ? '▾' : '▸'} {c.nodes[0]} + {c.nodes[1]}</td>
                        <td className="py-1 pr-2 text-right">{f2(c.spacing)} m</td>
                        <td className="py-1 pr-2 text-right">{f1(c.dl1)}/{f1(c.ll1)} · {f1(c.dl2)}/{f1(c.ll2)}</td>
                        <td className="py-1 pr-2">{c.design.shape}</td>
                        <td className="py-1 pr-2">{f2(c.design.Bx)} × {f2(c.design.By)} m</td>
                        <td className="py-1">{Math.round(c.design.Dc)} mm</td>
                      </tr>,
                      open && model && (
                        <tr key={`${key}:sol`}>
                          <td colSpan={6} className="bg-slate-50/60 px-2 pb-2">
                            <WorkedSolution steps={combinedRowSolution(colSectionAt(c.nodes[0]) ?? model.sections[0], colSectionAt(c.nodes[1]) ?? model.sections[0], soil, c)} title={`Combined footing ${c.nodes.join(' + ')} — worked solution`} />
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                Column loads split from D-only / L-only frame solves. Click a row for the full worked solution.
              </p>
            </div>
          )}

          <p className="text-xs text-slate-500">
            Pipeline: slab area loads → tributary line loads → 3D frame FEM (governing NSCP combo) → beam/girder
            critical sections (SRRB/DRRB) → column P–M → base reactions → isolated footings. Open any standalone
            page for the full worked solution of a given element.
          </p>
          </>)}

          {resultsTab === 'schedule' && model && <ConstructionSchedule model={model} design={design} />}
        </div>
        )
      })()}

      {/* ── Material take-off — BOM / BOQ (full width) ── */}
      {design && takeoff && resultsTab === 'boq' && (
        <div className="mt-6 space-y-4 break-before-page">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-extrabold tracking-tight text-[#0f4c92]">
              Material take-off — Bill of Quantities &amp; Materials
            </h2>
            <label className="no-print flex items-center gap-2 text-sm">
              <span className="font-medium text-slate-600">Concrete class</span>
              <select value={concreteClass} onChange={(e) => setConcreteClass(e.target.value as ConcreteClass)}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                <option value="AA">AA (12 bags/m³)</option>
                <option value="A">A (9)</option>
                <option value="B">B (7.5)</option>
                <option value="C">C (6)</option>
              </select>
            </label>
          </div>

          {/* BOM summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              takeoff.totalConcreteM3 > 0 && ['Concrete', `${f2(takeoff.totalConcreteM3)} m³`],
              takeoff.totalConcreteM3 > 0 && ['Cement', `${takeoff.concrete.cement} bags`],
              takeoff.totalConcreteM3 > 0 && ['Sand', `${f2(takeoff.concrete.sand)} m³`],
              takeoff.totalConcreteM3 > 0 && ['Gravel', `${f2(takeoff.concrete.gravel)} m³`],
              takeoff.totalSteelPurchasedKg > 0 && ['Rebar (bought)', `${f1(takeoff.totalSteelPurchasedKg)} kg`],
              takeoff.tieWire.rolls > 0 && ['Tie wire', `${takeoff.tieWire.rolls} roll${takeoff.tieWire.rolls === 1 ? '' : 's'}`],
              takeoff.structuralSteelKg > 0 && ['Structural steel', `${(takeoff.structuralSteelKg / 1000).toFixed(2)} t`],
              takeoff.timberM3 > 0 && ['Timber', `${f2(takeoff.timberM3)} m³`],
              takeoff.timberM3 > 0 && ['Timber (bd·ft)', `${f0(takeoff.timberBoardFeet)}`],
            ].filter(Boolean as unknown as (v: unknown) => v is [string, string]).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-slate-200 bg-white p-2 text-center shadow-sm">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{k}</div>
                <div className="text-sm font-bold text-[#0f4c92]">{v}</div>
              </div>
            ))}
          </div>

          {/* Priced Bill of Materials — unit prices make it an actual Bill */}
          {bill && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[1.02rem] font-bold text-[#0f4c92]">Bill of Materials (priced)</h3>
                <span className="text-sm font-bold text-[#0f4c92]">Grand total: {peso(bill.total)}</span>
              </div>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Material</th>
                    <th className="py-1 pr-2 text-right font-semibold">Qty</th>
                    <th className="py-1 pr-2 font-semibold">Unit</th>
                    <th className="py-1 pr-2 text-right font-semibold">Unit price (₱)</th>
                    <th className="py-1 text-right font-semibold">Amount (₱)</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.rows.map((r) => {
                    const key = r.priceKey
                    const pv = key ? (prices[key] ?? r.unitPrice) : r.unitPrice
                    return (
                      <tr key={r.item} className="border-t border-slate-100">
                        <td className="py-0.5 pr-2">{r.item}</td>
                        <td className="py-0.5 pr-2 text-right">{f2(r.qty)}</td>
                        <td className="py-0.5 pr-2 text-slate-500">{r.unit}</td>
                        <td className="py-0.5 pr-2 text-right">
                          {key ? (
                            <>
                              <input type="number" value={pv}
                                onChange={(e) => setPrices((p) => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
                                className="no-print w-24 rounded border border-slate-200 px-1 py-0.5 text-right" />
                              <span className="print-only">{pv.toLocaleString('en-PH')}</span>
                            </>
                          ) : pv.toLocaleString('en-PH')}
                        </td>
                        <td className="py-0.5 text-right font-medium">{peso(r.amount)}</td>
                      </tr>
                    )
                  })}
                  <tr className="border-t border-slate-200 font-bold text-[#0f4c92]">
                    <td className="py-1 pr-2" colSpan={4}>Grand total</td>
                    <td className="py-1 text-right">{peso(bill.total)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                Edit the unit prices to your local rates (PHP). Steel priced on the purchased (6 m-bar) weight incl. lap/waste;
                concrete via cement/sand/gravel; timber per board foot. Labour, hauling and contingencies not included.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* BOQ */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Bill of Quantities (by element)</h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Item</th>
                    <th className="py-1 pr-2 text-right font-semibold">Qty</th>
                    <th className="py-1 font-semibold">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {takeoff.boq.map((r) => (
                    <tr key={r.item} className="border-t border-slate-100">
                      <td className="py-0.5 pr-2">{r.item}</td>
                      <td className="py-0.5 pr-2 text-right">{f2(r.qty)}</td>
                      <td className="py-0.5 text-slate-500">{r.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Steel by diameter (BOM) — 6 m commercial bars with lap + waste */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Reinforcement by bar Ø (6 m bars)</h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Bar</th>
                    <th className="py-1 pr-2 text-right font-semibold">Net (m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">6 m pcs</th>
                    <th className="py-1 pr-2 text-right font-semibold">Waste (m)</th>
                    <th className="py-1 text-right font-semibold">Weight (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {takeoff.steelByDia.map((d) => (
                    <tr key={d.dia} className="border-t border-slate-100">
                      <td className="py-0.5 pr-2 font-medium">⌀{d.dia}</td>
                      <td className="py-0.5 pr-2 text-right">{f1(d.netLengthM)}</td>
                      <td className="py-0.5 pr-2 text-right">{d.pieces6m}</td>
                      <td className="py-0.5 pr-2 text-right">{f1(d.wasteM)}</td>
                      <td className="py-0.5 text-right">{f1(d.weightKg)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 font-semibold">
                    <td className="py-1 pr-2">Total</td>
                    <td />
                    <td className="py-1 text-right">{takeoff.steelByDia.reduce((s, d) => s + d.pieces6m, 0)}</td>
                    <td />
                    <td className="py-1 text-right">{f1(takeoff.totalSteelPurchasedKg)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                Continuous bars spliced (usable 6 − 0.30 m lap); stirrups/ties nested (cuts per 6 m). Fabricated net
                {' '}{f1(takeoff.totalSteelNetKg)} kg → bought {f1(takeoff.totalSteelPurchasedKg)} kg.
                Class {concreteClass}: {takeoff.concrete.factor} cement bags/m³ · sand 0.5, gravel 1.0 m³/m³ (NSCP mix).
              </p>
            </div>
          </div>

          {/* Structural steel by shape — only when W-shapes are present */}
          {takeoff.structuralSteelKg > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Structural steel by shape</h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Shape</th>
                    <th className="py-1 pr-2 text-right font-semibold">Unit wt (kg/m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">Length (m)</th>
                    <th className="py-1 text-right font-semibold">Mass (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {takeoff.steelByShape.sort((a, b) => a.shape.localeCompare(b.shape)).map((s) => (
                    <tr key={s.shape} className="border-t border-slate-100">
                      <td className="py-0.5 pr-2 font-medium">{s.shape}</td>
                      <td className="py-0.5 pr-2 text-right">{f1(s.kgPerM)}</td>
                      <td className="py-0.5 pr-2 text-right">{f1(s.L)}</td>
                      <td className="py-0.5 text-right">{Math.round(s.kg)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 font-semibold">
                    <td className="py-1 pr-2">Total</td>
                    <td className="py-1 pr-2" />
                    <td className="py-1 pr-2 text-right">{f1(takeoff.steelByShape.reduce((s, r) => s + r.L, 0))}</td>
                    <td className="py-1 text-right">{Math.round(takeoff.structuralSteelKg)} kg ({(takeoff.structuralSteelKg / 1000).toFixed(2)} t)</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">Net mass: ρ = 7 850 kg/m³ · A (mm²) × L (m). Connections, base plates and field splices not included.</p>
            </div>
          )}

          {/* Timber by section size — only when a wood frame is present */}
          {takeoff.timberM3 > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Timber by size</h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Size (mm)</th>
                    <th className="py-1 pr-2 font-semibold">Species</th>
                    <th className="py-1 pr-2 font-semibold">Kind</th>
                    <th className="py-1 pr-2 text-right font-semibold">Pcs</th>
                    <th className="py-1 pr-2 text-right font-semibold">Length (m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">Volume (m³)</th>
                    <th className="py-1 text-right font-semibold">Board feet</th>
                  </tr>
                </thead>
                <tbody>
                  {[...takeoff.timberBySize].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                    <tr key={`${s.name}-${s.species}-${s.kind}`} className="border-t border-slate-100">
                      <td className="py-0.5 pr-2 font-medium">{s.name}</td>
                      <td className="py-0.5 pr-2" title={WOOD_SPECIES[s.species]?.label ?? s.species}>{s.species}</td>
                      <td className="py-0.5 pr-2">{s.kind}</td>
                      <td className="py-0.5 pr-2 text-right">{s.count}</td>
                      <td className="py-0.5 pr-2 text-right">{f1(s.L)}</td>
                      <td className="py-0.5 pr-2 text-right">{f2(s.m3)}</td>
                      <td className="py-0.5 text-right">{f0(s.boardFeet)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 font-semibold">
                    <td className="py-1 pr-2">Total</td>
                    <td className="py-1 pr-2" colSpan={3} />
                    <td className="py-1 pr-2 text-right">{f1(takeoff.timberBySize.reduce((s, r) => s + r.L, 0))}</td>
                    <td className="py-1 pr-2 text-right">{f2(takeoff.timberM3)}</td>
                    <td className="py-1 text-right">{f0(takeoff.timberBoardFeet)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">Solid-rectangle volume b×h×L; board feet = m³ × 423.776 (1 bd·ft = 1/12 ft³). Priced per board foot in the Bill of Materials. Connections and wastage/off-cuts not included.</p>
            </div>
          )}

          {/* Formwork + tie wire */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Formwork</h3>
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {[
                    ['Contact area', `${f1(takeoff.formwork.areaM2)} m²`],
                    [`Plywood (${takeoff.formwork.sheetM2.toFixed(2)} m²/sheet, ${takeoff.formwork.uses} uses)`, `${takeoff.formwork.plywoodSheets} sheets`],
                    ['Lumber (studs / walers / braces)', `${f1(takeoff.formwork.lumberM)} lin·m`],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-t border-slate-100">
                      <td className="py-1 pr-2 text-slate-600">{k}</td>
                      <td className="py-1 text-right font-semibold">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Tie wire (#16 G.I.)</h3>
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {[
                    ['Bar intersections', `${takeoff.tieWire.intersections}`],
                    ['Net length (0.30 m / tie)', `${f1(takeoff.tieWire.netM)} m`],
                    ['Rolls (2385 m / roll)', `${takeoff.tieWire.rolls}`],
                    ['Weight', `${f1(takeoff.tieWire.weightKg)} kg`],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-t border-slate-100">
                      <td className="py-1 pr-2 text-slate-600">{k}</td>
                      <td className="py-1 text-right font-semibold">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detailed cut list */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Reinforcement cut list</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-2 font-semibold">Element</th>
                  <th className="py-1 pr-2 font-semibold">Mark</th>
                  <th className="py-1 pr-2 text-right font-semibold">Bar</th>
                  <th className="py-1 pr-2 text-right font-semibold">No.</th>
                  <th className="py-1 pr-2 text-right font-semibold">Cut (m)</th>
                  <th className="py-1 pr-2 text-right font-semibold">Total (m)</th>
                  <th className="py-1 text-right font-semibold">kg</th>
                </tr>
              </thead>
              <tbody>
                {takeoff.cutList.map((c, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-0.5 pr-2">{c.element}</td>
                    <td className="py-0.5 pr-2">{c.mark}</td>
                    <td className="py-0.5 pr-2 text-right">⌀{c.dia}</td>
                    <td className="py-0.5 pr-2 text-right">{c.count}</td>
                    <td className="py-0.5 pr-2 text-right">{f2(c.cutLengthM)}</td>
                    <td className="py-0.5 pr-2 text-right">{f1(c.totalM)}</td>
                    <td className="py-0.5 text-right">{f1(c.weightKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-slate-500">
              Cut lengths include a 40·d_b lap/anchorage allowance on straight bars and a 2·max(6·d_t, 75 mm) hook
              allowance on stirrups/ties. {takeoff.slabSteelDDM ? 'Slab steel follows the DDM column/middle-strip layout: +M bottom bars span-long, −M top bars cut off 0.3·ℓn over supports.' : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
