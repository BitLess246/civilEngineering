import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { generateGridModel, removeElements, removeNode, buildGravityLoads, splitSharedSections } from '../engine/modelBuilder'
import type { StructuralModel, Member, Plate, RectSection, ModelLoad, MemberRole } from '../engine/model'
import { distributePanel } from '../engine/tributary'
import { modelToFrame3D } from '../engine/modelBridge'
import { analyzeFrame3D, type F3Analysis } from '../engine/frame3d'
import { designStructure, optimizeStructure, type StructureDesign, type FootingPlan, type OptimizeResult, type LateralCase } from '../engine/pipeline'
import { computeSeismic, driftCheck, type SeismicResult, type DriftRow } from '../engine/seismic'
import { computeWind, type WindResult } from '../engine/wind'
import { solveFrame3D, applyF3Combo } from '../engine/frame3d'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import { beamSectionSolution, columnRowSolution, footingRowSolution, combinedRowSolution } from '../lib/modelSpaceSolutions'
import { Diagram } from '../components/Diagram'
import { BeamSchematic } from '../components/BeamSchematic'
import { ColumnSchematic } from '../components/ColumnSchematic'
import { FootingSchematic } from '../components/FootingSchematic'
import { DimBelow, DimSide } from '../components/dims'
import { Num, Card, ResultCard, Row } from '../components/qty'
import { f1, f2 } from '../lib/format'

const AUTOSAVE_KEY = 'model-space-autosave'

const ROLE_COLOR: Record<string, string> = {
  column: '#475569', beam: '#0056b3', girder: '#0e7490',
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
  sec?: { b: number; h: number }
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
    return tint > 0 ? `#${base.lerp(new THREE.Color('#dc2626'), tint).getHexString()}` : `#${base.getHexString()}`
  }, [selected, role, tint])
  return (
    <mesh position={mid} quaternion={quat}
      onClick={(e) => { e.stopPropagation(); onPick() }}>
      <boxGeometry args={[len, ty, tz]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

function Slab3D({ corners, selected, onPick }: {
  corners: THREE.Vector3[]; selected: boolean; onPick: () => void
}) {
  const { mid, sx, sz } = useMemo(() => {
    const mid = corners.reduce((s, c) => s.add(c.clone()), new THREE.Vector3()).multiplyScalar(0.25)
    const sx = Math.abs(corners[1].x - corners[0].x) || Math.abs(corners[2].x - corners[0].x)
    const sz = Math.abs(corners[3].z - corners[0].z) || Math.abs(corners[2].z - corners[0].z)
    return { mid, sx, sz }
  }, [corners])
  return (
    <mesh position={[mid.x, mid.y + 0.05, mid.z]}
      onClick={(e) => { e.stopPropagation(); onPick() }}>
      <boxGeometry args={[sx * 0.96, 0.1, sz * 0.96]} />
      <meshStandardMaterial color={selected ? SEL : '#7ba6d4'} transparent opacity={selected ? 0.85 : 0.45} />
    </mesh>
  )
}

function Support3D({ p }: { p: THREE.Vector3 }) {
  return (
    <mesh position={[p.x, p.y - 0.22, p.z]}>
      <coneGeometry args={[0.28, 0.45, 4]} />
      <meshStandardMaterial color="#0056b3" />
    </mesh>
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
const TRIB_COLOR = { triangle: '#0e7490', trapezoid: '#0056b3', rect: '#15803d' } as const
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
          <label key={d} className={`inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-0.5 text-xs ${value.includes(d) ? 'border-[#0056b3] bg-blue-50 text-[#0056b3]' : 'border-slate-200 text-slate-500'}`}>
            <input type="checkbox" className="sr-only" checked={value.includes(d)} onChange={() => toggle(d)} />{d}
          </label>
        ))}
      </div>
    </div>
  )
}

// ── Right-panel tabs ────────────────────────────────────────────────────────
type Tab = 'geometry' | 'properties' | 'supports' | 'loading' | 'analysis' | 'design'
const TABS: { id: Tab; label: string }[] = [
  { id: 'geometry', label: 'Geometry' },
  { id: 'properties', label: 'Properties' },
  { id: 'supports', label: 'Supports' },
  { id: 'loading', label: 'Loading' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'design', label: 'Design' },
]
function TabBtn({ id, label, active, onClick }: { id: Tab; label: string; active: boolean; onClick: (t: Tab) => void }) {
  return (
    <button type="button" onClick={() => onClick(id)}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${active ? 'bg-[#0056b3] text-white shadow-sm' : 'text-slate-600 hover:bg-blue-50'}`}>
      {label}
    </button>
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
      <text x={x0} y={13} fontSize={11} fontWeight={700} fill="#0056b3">ELEVATION — rebar{sm > 0 ? ` (stirrups @${Math.round(sm * 1000)})` : ''}</text>
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
function ColumnElevation({ Lh, b, bars, tieSpacing }: { Lh: number; b: number; bars: number; tieSpacing: number }): ReactNode {
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
      <text x={12} y={14} fontSize={11} fontWeight={700} fill="#0056b3">ELEVATION — {bars}⌀ · ties @{Math.round(tieSpacing)}</text>
      <rect x={x0} y={y0} width={colW} height={availH} fill="#fff" stroke="#37526e" strokeWidth={1.4} />
      <line x1={x0 + 6} y1={y0} x2={x0 + 6} y2={y1} stroke="#dc2626" strokeWidth={1.6} />
      <line x1={x1 - 6} y1={y0} x2={x1 - 6} y2={y1} stroke="#dc2626" strokeWidth={1.6} />
      {Array.from({ length: n + 1 }, (_, k) => {
        const y = y0 + (availH * k) / n
        return <line key={k} x1={x0 + 3} y1={y} x2={x1 - 3} y2={y} stroke="#94a3b8" strokeWidth={0.7} />
      })}
      <DimSide yA={y0} yB={y1} featX={x0} dX={x0 - 14} label={`H = ${Lh} m`} side="left" />
      <DimBelow xA={x0} xB={x1} featY={y1} dY={dimY} label={`b = ${b}`} />
    </svg>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function ModelSpace() {
  const [baysX, setBaysX] = useState('6, 6')
  const [baysZ, setBaysZ] = useState('5')
  const [storeyH, setStoreyH] = useState('3.5, 3')
  // Per-role initial sizes (column ≥ girder ≥ beam to start the hierarchy satisfied).
  const [colB, setColB] = useState(400); const [colH, setColH] = useState(400)
  const [girB, setGirB] = useState(300); const [girH, setGirH] = useState(500)
  const [beaB, setBeaB] = useState(250); const [beaH, setBeaH] = useState(450)
  const [fc, setFc] = useState(28)
  const [qD, setQD] = useState(4.8); const [qL, setQL] = useState(2.4)
  // Soil (for the footing stage of the design pipeline)
  const [qa, setQa] = useState(200); const [Hf, setHf] = useState(1.5)
  // Seismic (NSCP 208 static lateral force)
  const [Ca, setCa] = useState(0.44); const [Cv, setCv] = useState(0.64)
  const [Rw, setRw] = useState(8.5); const [Ie, setIe] = useState(1.0)
  const [Zf, setZf] = useState(0.4); const [Nv, setNv] = useState(1.0)   // Zone factor + near-source (208-11)
  const [eDirs, setEDirs] = useState<string[]>(['+X', '-X', '+Z', '-Z'])  // directional E cases to envelope
  const [seis, setSeis] = useState<SeismicResult | null>(null)
  const [drift, setDrift] = useState<DriftRow[] | null>(null)
  // Wind (NSCP 207B directional procedure, MWFRS)
  const [Vw, setVw] = useState(50); const [expo, setExpo] = useState<'B' | 'C' | 'D'>('C')
  const [Kzt, setKzt] = useState(1.0)
  const [wDirs, setWDirs] = useState<string[]>(['+X', '-X', '+Z', '-Z'])  // directional W cases
  const [wind, setWind] = useState<WindResult | null>(null)
  const [eCases, setECases] = useState<LateralCase[]>([])
  const [wCases, setWCases] = useState<LateralCase[]>([])
  // Analysis options: f₁ live-load factor (§203.3.1) and P-Δ second order
  const [assembly, setAssembly] = useState(false)
  const [pDelta, setPDelta] = useState(false)
  const [showLoads, setShowLoads] = useState(true)   // load-diagram overlay

  const [model, setModel] = useState<StructuralModel | null>(() => {
    try {
      const raw = sessionStorage.getItem(AUTOSAVE_KEY)
      // migrate pre-per-member models so each member owns its section
      return raw ? splitSharedSections(JSON.parse(raw) as StructuralModel) : null
    } catch { return null }
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<F3Analysis | null>(null)
  const [design, setDesign] = useState<StructureDesign | null>(null)
  const [opt, setOpt] = useState<OptimizeResult | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)   // open schedule-row solution
  const [tab, setTab] = useState<Tab>('geometry')                 // right-panel tab
  const [orphans, setOrphans] = useState(0)
  // footing plan: base node → '' (isolated) or partner node id (combined)
  const [planSel, setPlanSel] = useState<Record<string, string>>({})
  // frame-editor add-member picks
  const [newI, setNewI] = useState(''); const [newJ, setNewJ] = useState('')
  const [newRole, setNewRole] = useState<MemberRole>('beam')
  const fileRef = useRef<HTMLInputElement>(null)

  const save = (m: StructuralModel | null) => {
    setModel(m)
    setAnalysis(null)             // geometry changed — results are stale
    setDesign(null)
    setOpt(null)
    setExpanded(null)
    setDrift(null)
    try {
      if (m) sessionStorage.setItem(AUTOSAVE_KEY, JSON.stringify(m))
      else sessionStorage.removeItem(AUTOSAVE_KEY)
    } catch { /* quota — ignore */ }
  }

  // §203.3.1: f₁ = 1.0 for assembly/garage or live load > 4.8 kPa, else 0.5.
  const fLive = assembly || qL > 4.8 ? 1.0 : 0.5
  const lateral = [...eCases, ...wCases]
  const anaOpts = { f1: fLive, pDelta, lateral }

  const analyze = () => {
    if (!model) return
    const br = modelToFrame3D(model)
    setOrphans(br.orphanEdges.length)
    setAnalysis(analyzeFrame3D(br.nodes, br.members, br.supports, br.loads, anaOpts))
    // Storey drift from the E-only elastic solution (NSCP 208.5.10), along the
    // primary committed direction.
    if (seis) {
      const eOnly = applyF3Combo(br.loads, { E: 1 })
      const sol = eOnly.length ? solveFrame3D(br.nodes, br.members, br.supports, eOnly, { pDelta }) : null
      const driftAxis = (eDirs[0] ?? '+X').includes('X') ? 'x' : 'z'
      setDrift(sol ? driftCheck(model, br.nodes, sol.d, Rw, seis.T, driftAxis) : null)
    } else setDrift(null)
  }

  // Re-sign / re-axis a base node-load set into a directional case.
  const dirCase = (base: ModelLoad[], kind: 'E' | 'W', d: string): LateralCase => {
    const axis = d.includes('X') ? 'Fx' : 'Fz'
    const sign = d.startsWith('-') ? -1 : 1
    return {
      name: `${kind}${d}`, kind,
      loads: base.map((l) => {
        const mag = Math.abs((l as { Fx?: number }).Fx ?? 0) || Math.abs((l as { Fz?: number }).Fz ?? 0)
        return { kind: 'node', node: (l as { node: string }).node, [axis]: sign * mag, cat: kind }
      }),
    }
  }

  const generateE = () => {
    if (!model) return
    // base magnitude is direction-independent (storey force per node), so one
    // solve gives every ±X/±Z case.
    const r = computeSeismic(model, { Ca, Cv, I: Ie, R: Rw, Z: Zf, Nv, dir: 'x' })
    if (!r) return
    setSeis(r)
    setECases(eDirs.map((d) => dirCase(r.loads, 'E', d)))
    // commit the primary direction for the load-diagram overlay + drift check
    const primary = dirCase(r.loads, 'E', eDirs[0] ?? '+X')
    save({ ...model, loads: [...model.loads.filter((l) => !(l.cat === 'E' && l.kind === 'node')), ...primary.loads] })
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
    save({ ...model, loads: [...model.loads.filter((l) => !(l.cat === 'W' && l.kind === 'node')), ...primary.loads] })
  }

  const soil = { qAllow: qa, gammaSoil: 18, gammaConc: 24, H: Hf }
  const footingPlan = (): FootingPlan => {
    const plan: FootingPlan = {}
    for (const [node, partner] of Object.entries(planSel)) {
      if (partner) plan[node] = { type: 'combined', with: partner }
    }
    return plan
  }

  const runPipeline = () => {
    if (!model) return
    setOpt(null)
    setDesign(designStructure(model, soil, footingPlan(), anaOpts))
  }

  const optimize = () => {
    if (!model) return
    const r = optimizeStructure(model, soil, footingPlan(), 30, anaOpts)
    if (!r) return
    // adopt the optimised per-member sections
    save(r.model)
    setOpt(r)
    setDesign(r.design)
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
  const updLoad = (idx: number, v: number) => {
    if (!model || !Number.isFinite(v)) return
    save({
      ...model,
      loads: model.loads.map((l, i) => {
        if (i !== idx) return l
        if (l.kind === 'area') return { ...l, q: v }
        if (l.kind === 'member-udl') return { ...l, w: v }
        if (l.kind === 'member-point') return { ...l, P: v }
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
    save({ ...model, loads: buildGravityLoads(model, qD, qL) })
  }

  const gov = analysis ? analysis.perCombo[analysis.govIdx] : null
  const govRes = gov?.result ?? null
  const memForce = useMemo(() => {
    const map = new Map<string, { Mmax: number; Vmax: number; Nmax: number }>()
    govRes?.members.forEach((m) => map.set(m.id, { Mmax: m.Mmax, Vmax: m.Vmax, Nmax: m.Nmax }))
    return map
  }, [govRes])

  const generate = () => {
    const mat = { fc, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
    const role = (b: number, h: number, id: string): RectSection => ({ id, name: `${b}×${h}`, b, h, ...mat })
    const m = generateGridModel({
      baysX: parseList(baysX), baysZ: parseList(baysZ), storeyH: parseList(storeyH),
      column: role(colB, colH, 'COL'), girder: role(girB, girH, 'GIR'), beam: role(beaB, beaH, 'BEA'),
    })
    // gravity loads: member self-weight (D), slab self-weight + SDL (D), LL (L)
    m.loads = buildGravityLoads(m, qD, qL)
    setSelected(null)
    setSeis(null)
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

  const selMember: Member | undefined = model?.members.find((m) => m.id === selected)
  const selPlate: Plate | undefined = model?.plates.find((p) => p.id === selected)

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

  const btn = (color: string) =>
    `rounded-lg bg-gradient-to-br ${color} px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-40`

  return (
    <div className="mx-auto max-w-[1700px] p-4">
      {/* ── Header + toolbar ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#0056b3]">3D Model Space</h1>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <button type="button" onClick={download} disabled={!model}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-[#0056b3] hover:border-[#0056b3] hover:bg-blue-50 disabled:opacity-40">
            ⤓ Save JSON
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-[#0056b3] hover:border-[#0056b3] hover:bg-blue-50">
            ⤒ Load JSON
          </button>
          <input ref={fileRef} type="file" accept=".json" className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }} />
          <ReportControls title="Structure Design Report" />
        </div>
      </div>

      {/* ── Main split: sticky 3D (60%) | tabbed controls (40%) ── */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr] lg:items-start">
        {/* LEFT — sticky 3D viewport */}
        <div className="no-print lg:sticky lg:top-4">
          <div className="h-[80vh] min-h-[460px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {model ? (
              <Canvas camera={{ position: [14, 11, 14], fov: 45 }} onPointerMissed={() => setSelected(null)}>
                <color attach="background" args={['#f8fafc']} />
                <ambientLight intensity={0.85} />
                <directionalLight position={[12, 18, 8]} intensity={0.9} />
                <gridHelper args={[40, 40, '#cbd5e1', '#e2e8f0']} />
                {model.members.map((m) => {
                  const a = nodePos.get(m.i), bb = nodePos.get(m.j)
                  if (!a || !bb) return null
                  const tint = govRes && govRes.Mmax > 1e-9
                    ? (memForce.get(m.id)?.Mmax ?? 0) / govRes.Mmax : 0
                  return <Member3D key={m.id} a={a} b={bb} role={m.role} tint={tint * 0.85}
                    sec={sectionFor(m.id)} selected={m.id === selected} onPick={() => setSelected(m.id)} />
                })}
                {model.plates.map((p) => {
                  const cs = p.corners.map((c) => nodePos.get(c))
                  if (cs.some((c) => !c)) return null
                  return <Slab3D key={p.id} corners={cs as THREE.Vector3[]}
                    selected={p.id === selected} onPick={() => setSelected(p.id)} />
                })}
                {model.supports.map((s) => {
                  const p = nodePos.get(s.node)
                  return p ? <Support3D key={s.node} p={p} /> : null
                })}
                {showLoads && <Loads3D model={model} nodePos={nodePos} />}
                <OrbitControls makeDefault target={[6, 3, 2.5]} />
              </Canvas>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Set the grid and hit “Generate model”.
              </div>
            )}
          </div>
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
        </div>

        {/* RIGHT — tabbed controls */}
        <div className="no-print space-y-4">
          <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {TABS.map((t) => <TabBtn key={t.id} id={t.id} label={t.label} active={tab === t.id} onClick={setTab} />)}
          </div>

          {/* ── GEOMETRY ── */}
          {tab === 'geometry' && (
            <div className="space-y-4">
              <Card title="Column grid">
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
                  <button type="button" onClick={generate} className={btn('from-[#0056b3] to-[#003f86]')}>⚙ Generate model</button>
                </div>
              </Card>

              {model && (
                <ResultCard title="Model">
                  <Row label="Nodes / members" value={`${model.nodes.length} / ${model.members.length}`}
                    sub={`${model.members.filter((m) => m.role === 'column').length} col · ${model.members.filter((m) => m.role !== 'column').length} bm`} />
                  <Row label="Slabs / loads" value={`${model.plates.length} / ${model.loads.length}`} />
                  <Row label="Storeys" value={`${model.storeys.length}`}
                    sub={model.storeys.map((s) => `${s.elevation} m`).join(' · ')} />
                </ResultCard>
              )}

              {model && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[1.02rem] font-bold text-[#0056b3]">Nodes</h3>
                    <button type="button" onClick={addNode}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-[#0056b3] hover:border-[#0056b3] hover:bg-blue-50">+ Add node</button>
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
                  <p className="mt-1 text-[11px] text-slate-400">Coordinates in m (y = up). Removing a node also removes everything attached to it.</p>
                </div>
              )}

              {model && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Beams &amp; columns</h3>
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
                          <th className="py-1" />
                        </tr>
                      </thead>
                      <tbody>
                        {model.members.map((m) => {
                          const ms = sectionFor(m.id)
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
                    <span className="text-slate-400">→</span>
                    <select value={newJ} onChange={(e) => setNewJ(e.target.value)} className="max-w-[5.5rem] rounded border border-slate-200 px-1 py-0.5">
                      <option value="">node j…</option>
                      {model.nodes.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
                    </select>
                    <button type="button" onClick={addMember} disabled={!newI || !newJ || newI === newJ}
                      className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-[#0056b3] hover:border-[#0056b3] hover:bg-blue-50 disabled:opacity-40">+ Add member</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PROPERTIES ── */}
          {tab === 'properties' && (
            <div className="space-y-4">
              <Card title="Initial member sizes (mm)">
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
                <Num label="f′c" unit="MPa" value={fc} onChange={setFc} />
              </Card>
              <p className="text-[11px] text-slate-400">
                Per-member b×h are editable in the Geometry → Beams &amp; columns table; these are the defaults
                used when you generate a new grid. Material (f′c, fy = 415, ⌀20 bars) is shared.
              </p>
            </div>
          )}

          {/* ── SUPPORTS ── */}
          {tab === 'supports' && (
            <div className="space-y-4">
              <Card title="Soil (footing design)">
                <Num label="Soil qa" unit="kPa" value={qa} onChange={setQa} />
                <Num label="Footing depth H" unit="m" value={Hf} onChange={setHf} />
                <p className="col-span-full text-[11px] text-slate-400">
                  Base supports are toggled per node in the Geometry → Nodes table (“Sup” column).
                </p>
              </Card>
              {model && model.supports.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Footing plan</h3>
                  <p className="mb-2 text-xs text-slate-500">
                    Each base support gets an isolated square footing by default — pick a partner node to design the
                    pair as one combined footing instead (close columns / property-line situations).
                  </p>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                    {model.supports.map((s) => {
                      const partner = planSel[s.node] ?? ''
                      const takenBy = Object.entries(planSel).find(([n, p]) => p === s.node && n !== s.node)?.[0]
                      return (
                        <label key={s.node} className="flex items-center gap-2 text-xs">
                          <span className="w-16 font-medium">{s.node}</span>
                          {takenBy ? (
                            <span className="text-slate-400">combined with {takenBy}</span>
                          ) : (
                            <select value={partner}
                              onChange={(e) => setPlanSel((p) => ({ ...p, [s.node]: e.target.value }))}
                              className="flex-1 rounded border border-slate-200 px-1 py-0.5">
                              <option value="">isolated</option>
                              {model.supports.filter((o) => o.node !== s.node && !planSel[o.node])
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
            <div className="space-y-4">
              <Card title="Slab loads">
                <Num label="SDL (superimposed)" unit="kPa" value={qD} onChange={setQD} />
                <Num label="Live load" unit="kPa" value={qL} onChange={setQL} />
              </Card>

              {model && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[1.02rem] font-bold text-[#0056b3]">Loads</h3>
                    <button type="button" onClick={rebuildGravity}
                      title="Regenerate dead (member self-weight + slab self-weight + SDL) and live loads from the inputs; keeps E loads"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-[#0056b3] hover:border-[#0056b3] hover:bg-blue-50">↻ Rebuild D + L</button>
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
                          const val = l.kind === 'area' ? l.q : l.kind === 'member-udl' ? l.w : l.kind === 'member-point' ? l.P : null
                          const unit = l.kind === 'area' ? 'kPa' : l.kind === 'member-udl' ? 'kN/m' : 'kN'
                          return (
                            <tr key={idx} className="border-t border-slate-100">
                              <td className={`py-0.5 pr-2 font-semibold ${l.cat === 'D' ? 'text-slate-600' : l.cat === 'L' ? 'text-emerald-700' : 'text-purple-700'}`}>{l.cat}</td>
                              <td className="py-0.5 pr-2">{l.kind === 'node' ? '·' : l.kind === 'area' ? '▦' : '—'} {target}</td>
                              <td className="py-0.5 pr-1 whitespace-nowrap">
                                {val !== null ? (
                                  <>
                                    <input type="number" step="0.1" value={val}
                                      onChange={(e) => updLoad(idx, parseFloat(e.target.value))}
                                      className="w-16 rounded border border-slate-200 px-1 py-0.5" /> {unit}
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
                  <p className="mt-1 text-[11px] text-slate-400">
                    Dead = self-weight (members from b×h, slabs from t, γc = 24 kN/m³) + the SDL input; live = the LL
                    input. “Rebuild” regenerates both after you edit the frame.
                  </p>
                </div>
              )}

              <Card title="Seismic — NSCP 208 static force">
                <Num label="Ca" value={Ca} onChange={setCa} />
                <Num label="Cv" value={Cv} onChange={setCv} />
                <Num label="R" value={Rw} onChange={setRw} />
                <Num label="I" value={Ie} onChange={setIe} />
                <Num label="Z (zone)" value={Zf} onChange={setZf} />
                <Num label="Nv (near-source)" value={Nv} onChange={setNv} />
                <DirPicker value={eDirs} onChange={setEDirs} />
                <div className="col-span-full">
                  <button type="button" onClick={generateE} disabled={!model || eDirs.length === 0}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-[#0056b3] hover:border-[#0056b3] hover:bg-blue-50 disabled:opacity-40">⚡ Generate E cases</button>
                  {seis && (
                    <p className="mt-1 text-xs text-slate-500">
                      T = {seis.T.toFixed(3)} s · W = {f1(seis.W)} kN · V = {f1(seis.V)} kN
                      {seis.V === seis.Vmax ? ' (2.5CaIW/R cap governs)'
                        : seis.Vsrc > 0 && seis.V === seis.Vsrc ? ' (Zone-4 0.8ZNvIW/R floor governs)'
                          : seis.V === seis.Vmin ? ' (0.11CaIW floor governs)' : ''}
                      {seis.Ft > 0 ? ` · Ft = ${f1(seis.Ft)} kN` : ''} — {eCases.length} cat-E case{eCases.length === 1 ? '' : 's'} ({eDirs.join(', ') || 'none'}).
                      {Zf >= 0.4 ? ` Zone-4 floor = ${f1(seis.Vsrc)} kN.` : ' (Zone-4 floor off: Z < 0.4)'}
                    </p>
                  )}
                </div>
              </Card>

              <Card title="Wind — NSCP 207B MWFRS (directional)">
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
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-[#0056b3] hover:border-[#0056b3] hover:bg-blue-50 disabled:opacity-40">🌬 Generate W cases</button>
                  {wind && (
                    <p className="mt-1 text-xs text-slate-500">
                      qh = {f2(wind.qh)} kPa · B×L = {f1(wind.B)}×{f1(wind.L)} m (L/B {f2(wind.LB)}) ·
                      Cp,lee {f2(wind.CpLee)} · base shear V = {f1(wind.baseShear)} kN — {wCases.length} cat-W
                      case{wCases.length === 1 ? '' : 's'} ({wDirs.join(', ') || 'none'}). Windward Cp = 0.8, G = {wind.G}, Kd = {wind.Kd}.
                    </p>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* ── ANALYSIS ── */}
          {tab === 'analysis' && (
            <div className="space-y-4">
              <Card title="Analysis options">
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={assembly} onChange={(e) => setAssembly(e.target.checked)} />
                  <span>Public assembly / garage (f₁ = 1.0)</span>
                </label>
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={pDelta} onChange={(e) => setPDelta(e.target.checked)} />
                  <span>P-Δ second-order analysis</span>
                </label>
                <p className="col-span-full text-[11px] text-slate-500">
                  §203.3.1 live-load factor f₁ = <b>{fLive.toFixed(1)}</b>
                  {fLive === 1 ? (assembly ? ' (assembly/garage)' : ' (Lo > 4.8 kPa)') : ' (ordinary occupancy)'}.
                  {pDelta ? ' Frame solved with the geometric-stiffness P-Δ iteration.' : ' First-order (linear) frame solve.'}
                </p>
                <div className="col-span-full">
                  <button type="button" onClick={analyze} disabled={!model} className={btn('from-[#0e7490] to-[#155e75]')}>▶ Analyze (3D FEM)</button>
                </div>
              </Card>

              {gov && govRes && (
                <ResultCard title={`Analysis — ${gov.combo.name} governs`}>
                  <Row label="ΣRy (gravity)" value={`${f1(govRes.reactions.reduce((s, q) => s + q.F[1], 0))} kN`} />
                  <Row label="Extremes" value={`M ${f1(govRes.Mmax)} kN·m`}
                    sub={`V ${f1(govRes.Vmax)} · N ${f1(govRes.Nmax)} kN`} />
                  {orphans > 0 && <Row alert label="⚠ Orphan edges" value={`${orphans}`} sub="slab edges with no member" />}
                  <p className="mt-1 text-[11px] text-slate-400">Members tinted red by |M| relative to the model max. Click one for its diagrams.</p>
                </ResultCard>
              )}

              {drift && seis && (
                <ResultCard title={`Storey drift — ${(eDirs[0] ?? '+X').replace(/[+-]/, '')} (ΔM = 0.7·R·Δs)`}>
                  {drift.map((row) => (
                    <Row key={row.elevation} alert={!row.ok}
                      label={`Level ${f1(row.elevation)} m`}
                      value={`ΔM = ${row.dM.toFixed(1)} mm ${row.ok ? '✓' : '✗'}`}
                      sub={`Δs ${row.ds.toFixed(2)} · limit ${row.limit.toFixed(0)} mm`} />
                  ))}
                  <p className="mt-1 text-[11px] text-slate-400">
                    Limit {seis.T < 0.7 ? '0.025' : '0.020'}·hs (T {seis.T < 0.7 ? '<' : '≥'} 0.7 s) — NSCP 208.5.10.
                  </p>
                </ResultCard>
              )}

              {selMember && model && (
                <ResultCard title={`Member — ${selMember.id}`}>
                  <Row label="Role" value={selMember.role} />
                  <Row label="Length" value={`${f2(memberLen)} m`} />
                  <Row label="Section" value={sectionFor(selMember.id)?.name ?? selMember.section} />
                  {(() => {
                    const mr = govRes?.members.find((m) => m.id === selMember.id)
                    if (!mr) return null
                    return (
                      <div className="mt-2 space-y-2">
                        <Row label="Forces (governing)" value={`M ${f1(mr.Mmax)} kN·m`}
                          sub={`V ${f1(mr.Vmax)} · N ${f1(mr.Nmax)} kN`} />
                        <Diagram xs={mr.xs} ys={mr.Mz} title="Mz" unit="kN·m" color="#d62728" decimals={1} />
                        <Diagram xs={mr.xs} ys={mr.Vy} title="Vy" unit="kN" color="#1f77b4" decimals={1} />
                        <Diagram xs={mr.xs} ys={mr.N} title="N (+tension)" unit="kN" color="#7c3aed" decimals={1} />
                      </div>
                    )
                  })()}
                  <button type="button" onClick={() => { save(removeElements(model, new Set([selMember.id]))); setSelected(null) }}
                    className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50">Delete member</button>
                </ResultCard>
              )}

              {selPlate && plateInfo && model && (
                <ResultCard title={`Slab — ${selPlate.id}`}>
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
                </ResultCard>
              )}
            </div>
          )}

          {/* ── DESIGN ── */}
          {tab === 'design' && (
            <div className="space-y-4">
              <Card title="Design & optimise">
                <div className="col-span-full flex flex-wrap gap-2">
                  <button type="button" onClick={runPipeline} disabled={!model} className={btn('from-[#15803d] to-[#166534]')}>🏗 Design structure</button>
                  <button type="button" onClick={optimize} disabled={!model} className={btn('from-[#b45309] to-[#92400e]')}
                    title="Grow each failing member's own section until nothing fails, then trim back">🏁 Optimize design</button>
                </div>
                <p className="col-span-full text-[11px] text-slate-500">
                  The full schedules (beam/girder, column, footing) render below, each the full width of the page.
                  Click any schedule row for its step-by-step solution and plan/elevation drawings.
                </p>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* ── Optimisation log (full width) ── */}
      {opt && (() => {
        const sizesFor = (role: MemberRole) => {
          const ids = new Set(opt.model.members.filter((m) => m.role === role).map((m) => m.section))
          return [...new Set(opt.model.sections.filter((s) => ids.has(s.id)).map((s) => s.name))].join(', ') || '—'
        }
        return (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-1 text-[1.02rem] font-bold text-[#0056b3]">
              Optimization — {opt.converged
                ? `converged in ${opt.steps.length} step${opt.steps.length === 1 ? '' : 's'}`
                : 'did NOT converge (iteration cap hit — check spans/loads)'}
            </h3>
            <p className="mb-2 text-xs text-slate-500">
              Final sizes — <b>columns</b> {sizesFor('column')} · <b>girders</b> {sizesFor('girder')} · <b>beams</b> {sizesFor('beam')}
            </p>
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
      {design && (
        <div className="mt-6 space-y-6">
          <h2 className="text-xl font-extrabold tracking-tight text-[#0056b3]">
            Structure design — {design.govName} governs
            <span className="ml-3 text-sm font-normal text-slate-500">
              concrete ≈ {f1(design.totals.concrete)} m³ ({f1(design.totals.concreteMembers)} members + {f1(design.totals.concreteSlabs)} slabs)
            </span>
          </h2>
          <p className="-mt-3 text-xs text-slate-500">
            Envelope of <b>{design.cases.length}</b> load case{design.cases.length === 1 ? '' : 's'} (NSCP combinations × lateral directions).
            Each element is designed for its own governing case, shown in the “Case” column.
            <span className="no-print"> Click any row to expand its solution + plan/elevation drawings.</span>
          </p>

          {/* Beam & girder schedule */}
          <div className="print-avoid-break overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Beam & girder schedule</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wide text-slate-500">
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
                  const open = expanded === key
                  const sec = sectionFor(bm.id)
                  return [
                    <tr key={key} onClick={() => setExpanded(open ? null : key)}
                      className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${bad ? 'bg-red-50 text-red-700' : ''}`}>
                      <td className="py-1 pr-2 font-medium">{k === 0 ? `${open ? '▾' : '▸'} ${bm.id} (${bm.role} ${sec?.name ?? ''}, ${f1(bm.L)} m)` : ''}</td>
                      <td className="py-1 pr-2">{s.label}{s.hogging ? ' (hog)' : ''}</td>
                      <td className="py-1 pr-2 text-right">{f1(Math.abs(s.Mu))}</td>
                      <td className="py-1 pr-2 text-right">{f1(s.Vu)}</td>
                      <td className="py-1 pr-2">{d.mode}</td>
                      <td className="py-1 pr-2">{d.bars}⌀{sec?.barDia}{d.layers.length > 1 ? ` (${d.layers.join('+')})` : ''}{s.hogging ? ' top' : ''}</td>
                      <td className="py-1 pr-2">{d.sAdopt > 0 ? `@${Math.round(d.sAdopt)}` : d.region === 'none' ? 'none' : '⚠'}</td>
                      <td className="py-1 text-slate-400">{k === 0 ? bm.gov : ''}</td>
                    </tr>,
                    open && model && sec && (
                      <tr key={`${key}:sol`}>
                        <td colSpan={8} className="bg-slate-50/60 px-2 pb-2">
                          {bm.diag && (
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
                            <WorkedSolution steps={beamSectionSolution(sec, s)} title={`${bm.id} · ${s.label} — worked solution`} />
                            <div className="space-y-3 self-start rounded-lg border border-slate-200 bg-white p-3">
                              <BeamRebarElevation L={bm.L} h={sec.h} sections={bm.sections} />
                              <div className="border-t border-slate-100 pt-2">
                                <p className="mb-1 text-[11px] font-semibold text-[#0056b3]">SECTION — {s.label}</p>
                                <BeamSchematic b={sec.b} h={sec.h} cover={sec.cover} barDia={sec.barDia} stirrupDia={sec.tieDia}
                                  bars={d.bars} d={d.d} dPrime={d.comprLayers.length > 0 ? d.dPrime : undefined}
                                  layers={d.layers} comprLayers={d.comprLayers} comprBars={d.comprBars} comprBarDia={16}
                                  naDepth={d.cNA} flexOK={d.flexOK} hogging={s.hogging} />
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ),
                  ]
                }))}
              </tbody>
            </table>
          </div>

          {/* Column schedule (full width) */}
          <div className="print-avoid-break overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Column schedule</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wide text-slate-500">
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
                  const key = `col:${c.id}`, open = expanded === key
                  const cs = sectionFor(c.id)
                  return [
                    <tr key={key} onClick={() => setExpanded(open ? null : key)}
                      className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${c.ok ? '' : 'bg-red-50 text-red-700'}`}>
                      <td className="py-1 pr-2 font-medium">{open ? '▾' : '▸'} {c.id}</td>
                      <td className="py-1 pr-2">{cs?.name}</td>
                      <td className="py-1 pr-2 text-right">{f1(c.Pu)}</td>
                      <td className="py-1 pr-2 text-right">{f1(c.Mu)}</td>
                      <td className="py-1 pr-2">{c.bars}⌀{cs?.barDia} · ties @{Math.round(c.tieSpacing)}</td>
                      <td className="py-1 pr-2 text-right">{(c.util * 100).toFixed(0)}%</td>
                      <td className="py-1 text-slate-400">{c.gov}</td>
                    </tr>,
                    open && model && cs && (
                      <tr key={`${key}:sol`}>
                        <td colSpan={7} className="bg-slate-50/60 px-2 pb-2">
                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.7fr_1fr]">
                            <WorkedSolution steps={columnRowSolution(cs, c)} title={`${c.id} — worked solution`} />
                            <div className="space-y-3 self-start rounded-lg border border-slate-200 bg-white p-3">
                              <ColumnElevation Lh={c.L} b={cs.b} bars={c.bars} tieSpacing={c.tieSpacing} />
                              <div className="border-t border-slate-100 pt-2">
                                <p className="mb-1 text-[11px] font-semibold text-[#0056b3]">SECTION</p>
                                <ColumnSchematic shape="tied" b={cs.b} h={cs.h} cover={cs.cover}
                                  barDia={cs.barDia} tieDia={cs.tieDia} bars={c.bars} tieSpacing={c.tieSpacing} />
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>

          {/* Footing schedule (full width) */}
          <div className="print-avoid-break overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Footing schedule</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wide text-slate-500">
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
                  const key = `ftg:${f.node}`, open = expanded === key
                  const cs = colSectionAt(f.node)
                  return [
                    <tr key={key} onClick={() => setExpanded(open ? null : key)}
                      className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${f.ok ? '' : 'bg-red-50 text-red-700'}`}>
                      <td className="py-1 pr-2 font-medium">{open ? '▾' : '▸'} {f.node}</td>
                      <td className="py-1 pr-2 text-right">{f1(f.P)} / {f1(f.Pu)}</td>
                      <td className="py-1 pr-2">B = {f2(f.design.B)} m</td>
                      <td className="py-1 pr-2">{Math.round(f.design.Dc)} mm</td>
                      <td className="py-1 pr-2">{f.design.bars}⌀{cs?.barDia} @ {Math.round(f.design.barSpacing)} e.w.</td>
                      <td className="py-1 text-slate-400">{f.gov}</td>
                    </tr>,
                    open && model && (
                      <tr key={`${key}:sol`}>
                        <td colSpan={6} className="bg-slate-50/60 px-2 pb-2">
                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.7fr_1fr]">
                            <WorkedSolution steps={footingRowSolution(cs ?? model.sections[0], soil, f)} title={`Footing ${f.node} — worked solution`} />
                            <div className="rounded-lg border border-slate-200 bg-white p-3">
                              <FootingSchematic Bx={f.design.B} By={f.design.B} Dc={f.design.Dc}
                                columnWidth={cs ? Math.min(cs.b, cs.h) : 400} H={Hf} />
                            </div>
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
          {design.combined.length > 0 && (
            <div className="print-avoid-break overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Combined footing schedule</h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-500">
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
                    const key = `comb:${c.nodes.join('-')}`, open = expanded === key
                    return [
                      <tr key={key} onClick={() => setExpanded(open ? null : key)}
                        className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${c.ok ? '' : 'bg-red-50 text-red-700'}`}>
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
              <p className="mt-1 text-[11px] text-slate-400">
                Column loads split from D-only / L-only frame solves. Click a row for the full worked solution.
              </p>
            </div>
          )}

          <p className="text-xs text-slate-400">
            Pipeline: slab area loads → tributary line loads → 3D frame FEM (governing NSCP combo) → beam/girder
            critical sections (SRRB/DRRB) → column P–M → base reactions → isolated footings. Open any standalone
            page for the full worked solution of a given element.
          </p>
        </div>
      )}
    </div>
  )
}
