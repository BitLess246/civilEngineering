// ─────────────────────────────────────────────────────────────────────────
// StructuralModel → EQUIVALENT PLANE FRAME bridge for the member-end plastic
// hinge engines (`nonlinearFrame` static, `nonlinearFrameDynamic` dynamic).
//
// The hinge engines are plane-frame; a building model is 3D. This condenses it
// the same way `nonlinearModel` condensed the shear building: every frame line
// PARALLEL to the loading direction is COMBINED into one equivalent plane frame.
//
//   • nodes    (x, y, z) → (x, y): the perpendicular coordinate collapses, so
//              all parallel frame lines stack onto one.
//   • members  those mapping to the same (x,y)→(x,y) pair are summed —
//              I_eq = Σ(E_k·I_k)/E_ref and A_eq = Σ(E_k·A_k)/E_ref, so the
//              equivalent member carries the parallel frames' total stiffness.
//              Members whose two ends collapse to the SAME 2D point run purely
//              perpendicular (transverse beams) and are dropped: they add no
//              in-plane stiffness.
//   • Mp       capacities ADD across the combined members (Σ Mp_k).
//   • mass     lumped seismic mass summed onto the collapsed node.
//   • supports a 2D node is supported if any of its 3D nodes is; 'fixed' wins
//              over 'pin'.
//
// EXACT when the parallel frames are identical and deform together (the rigid-
// diaphragm assumption the building is designed under). For an irregular plan
// it is an idealization — the tests pin the resulting elastic period against the
// FULL 3D modal T₁ so the error is measured, not assumed.
//
// Units: geometry m, sections mm/mm², E MPa, Mp kN·m, mass tonnes.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import { buildSeismicMass, jacobiEigen } from './modal'
import { plasticMoment, axialCapacity } from './pushoverModel'
import { shapeByName } from './aiscSections'
import { luFactor, luSolve } from './fem'
import { rayleighCoeffs, type RayleighCoeffs } from './directTimeHistory'
import { assembleFrame, type NLNode, type NLMember, type NLSupport, type NLFrameInput } from './nonlinearFrame'
import type { PmKind } from './pmInteraction'
import { nonlinearFrameDynamic, type NLDynamicResult } from './nonlinearFrameDynamic'
import type { GroundMotion } from './timeHistory'

const E_REF = 200000   // MPa — reference modulus the equivalent sections are expressed at

export interface EquivalentFrame {
  nodes: NLNode[]
  members: NLMember[]
  supports: NLSupport[]
  /** Lumped mass per equivalent node id, tonnes. */
  mass: Record<string, number>
  /** Roof node (highest, then leftmost) — the natural control node. */
  controlNode: string
  /** How many 3D frame lines were combined. */
  framesCombined: number
  /** 3D members dropped as transverse (no in-plane stiffness). */
  transverseDropped: number
}

export interface EquivalentFrameOpts {
  /** Loading direction in plan (default 'x'). */
  dir?: 'x' | 'z'
  /** Tension steel ratio assumed for RC plastic moments (default 0.015). */
  rho?: number
  /** Post-yield hinge stiffness ratio, fraction of EI/L (default 0.02). */
  b?: number
  /** Treat every member as elastic (Mp = ∞) — the linear reference frame. */
  elastic?: boolean
  /** Reduce hinge capacity by P–M interaction (default true). Axial load lowers
   *  the plastic moment; ignoring it is unconservative for columns. */
  pmInteraction?: boolean
}

const key = (a: number, b: number) => `${Math.round(a * 1000)}|${Math.round(b * 1000)}`

/** Section area (mm²) and in-plane second moment (mm⁴) for a model section. */
function sectionAI(sec: { b: number; h: number; material?: string; shape?: string }): { A: number; I: number } {
  if (sec.material === 'steel' && sec.shape) {
    const s = shapeByName(sec.shape)
    // Ix = A·rx² exactly, from the library's area and radius of gyration
    if (s) return { A: s.A, I: s.A * s.rx * s.rx }
  }
  return { A: sec.b * sec.h, I: (sec.b * sec.h ** 3) / 12 }
}

/**
 * Condense a 3D model to one equivalent plane frame along `dir`. Returns null
 * when the model has no members that lie in the loading plane.
 */
export function equivalentPlaneFrame(model: StructuralModel, opts: EquivalentFrameOpts = {}): EquivalentFrame | null {
  const dir = opts.dir ?? 'x'
  const planX = (n: { x: number; z: number }) => (dir === 'x' ? n.x : n.z)
  const perp = (n: { x: number; z: number }) => (dir === 'x' ? n.z : n.x)

  const nm = new Map(model.nodes.map((n) => [n.id, n]))
  const secOf = new Map(model.sections.map((s) => [s.id, s]))
  const massByNode = buildSeismicMass(model)

  // 3D node → 2D key
  const keyOf = new Map<string, string>()
  const nodes2 = new Map<string, NLNode>()
  const mass2: Record<string, number> = {}
  const perpSet = new Set<number>()
  for (const n of model.nodes) {
    const k = key(planX(n), n.y)
    keyOf.set(n.id, k)
    if (!nodes2.has(k)) nodes2.set(k, { id: k, x: planX(n), y: n.y })
    mass2[k] = (mass2[k] ?? 0) + (massByNode.get(n.id) ?? 0)
    perpSet.add(Math.round(perp(n) * 1000))
  }

  // members → combined equivalent members
  interface Acc { i: string; j: string; EA: number; EI: number; Mp: number; Pcap: number; steel: boolean; n: number }
  const acc = new Map<string, Acc>()
  let transverseDropped = 0
  for (const m of model.members) {
    const a = nm.get(m.i), b = nm.get(m.j)
    if (!a || !b) continue
    const ka = keyOf.get(m.i)!, kb = keyOf.get(m.j)!
    if (ka === kb) { transverseDropped++; continue }     // purely perpendicular
    const sec = secOf.get(m.section)
    if (!sec) continue
    const { A, I } = sectionAI(sec)
    const E = sec.material === 'steel' ? 200000 : 4700 * Math.sqrt(Math.max(sec.fc, 1))
    const Mp = plasticMoment(sec, opts.rho ?? 0.015)
    const Pcap = axialCapacity(sec)                    // Py (steel) or Pn0 (concrete)
    const steel = sec.material === 'steel'
    const id = ka < kb ? `${ka}~${kb}` : `${kb}~${ka}`
    const cur = acc.get(id)
    // capacities ADD across the combined parallel frames, same as stiffness
    if (cur) { cur.EA += E * A; cur.EI += E * I; cur.Mp += Mp; cur.Pcap += Pcap; cur.n++ }
    else acc.set(id, { i: ka, j: kb, EA: E * A, EI: E * I, Mp, Pcap, steel, n: 1 })
  }
  if (acc.size === 0) return null

  const pm = opts.pmInteraction !== false && !opts.elastic
  const members: NLMember[] = [...acc].map(([id, v]) => ({
    id, i: v.i, j: v.j, E: E_REF,
    A: v.EA / E_REF, I: v.EI / E_REF,
    Mp: opts.elastic ? Infinity : v.Mp,
    b: opts.b ?? 0.02,
    ...(pm ? { Pcap: v.Pcap, pmKind: v.steel ? ('steel-strong' as PmKind) : ('concrete' as PmKind) } : {}),
  }))

  // supports: any 3D support at a collapsed node; 'fixed' wins
  const sup = new Map<string, 'pin' | 'fixed'>()
  for (const s of model.supports) {
    const k = keyOf.get(s.node)
    if (!k) continue
    const t = s.fixity === 'fixed' ? 'fixed' : 'pin'
    if (sup.get(k) !== 'fixed') sup.set(k, t)
  }
  if (sup.size === 0) return null

  const used = new Set<string>()
  for (const m of members) { used.add(m.i); used.add(m.j) }
  const nodes = [...nodes2.values()].filter((n) => used.has(n.id))
  const mass: Record<string, number> = {}
  for (const n of nodes) if (mass2[n.id] > 0) mass[n.id] = mass2[n.id]

  const roof = nodes.reduce((best, n) => (n.y > best.y || (n.y === best.y && n.x < best.x) ? n : best), nodes[0])
  return {
    nodes, members,
    supports: [...sup].filter(([k]) => used.has(k)).map(([node, type]) => ({ node, type })),
    mass, controlNode: roof.id,
    framesCombined: perpSet.size, transverseDropped,
  }
}

/** `NLFrameInput` for the equivalent frame (no loads — set them per analysis). */
export function frameInputOf(eq: EquivalentFrame): NLFrameInput {
  return {
    nodes: eq.nodes, members: eq.members, supports: eq.supports,
    loads: [], controlNode: eq.controlNode, controlDir: 'x',
  }
}

/**
 * Fundamental elastic period of the equivalent frame, s. Uses the flexibility
 * form on the massive translational DOFs (same technique as `modal.ts`), which
 * sidesteps the singular lumped-mass matrix.
 */
export function equivalentFramePeriod(eq: EquivalentFrame): number {
  const asm = assembleFrame(frameInputOf(eq))
  if (!asm) return 0
  const { nf, Kbeam, fpos, nodeIdx, hingeContrib } = asm
  const { Kh } = hingeContrib(new Array(nf).fill(0))
  const K = Kbeam.map((r, i) => r.map((v, j) => v + Kh[i][j]))
  const lu = luFactor(K)
  if (!lu) return 0

  // massive horizontal DOFs only (the lateral modes we care about)
  const md: { p: number; m: number }[] = []
  for (const [id, m] of Object.entries(eq.mass)) {
    const ni = nodeIdx.get(id)
    if (ni === undefined || !(m > 0)) continue
    const p = fpos.get(ni * 3)          // u
    if (p !== undefined) md.push({ p, m })
  }
  if (md.length === 0) return 0

  const q = md.length
  const F: number[][] = Array.from({ length: q }, () => new Array(q).fill(0))
  const e = new Array(nf).fill(0)
  for (let b = 0; b < q; b++) {
    e.fill(0); e[md[b].p] = 1
    const x = luSolve(lu, e)
    for (let a = 0; a < q; a++) F[a][b] = x[md[a].p]
  }
  const sm = md.map((d) => Math.sqrt(d.m))
  const A = Array.from({ length: q }, (_, a) =>
    Array.from({ length: q }, (_, b) => 0.5 * (F[a][b] + F[b][a]) * sm[a] * sm[b]))
  const { values } = jacobiEigen(A)
  const mu = Math.max(...values.filter((v) => v > 1e-300))
  return mu > 0 ? 2 * Math.PI * Math.sqrt(mu) : 0
}

export interface NonlinearFrameModelOpts extends EquivalentFrameOpts {
  /** Damping ratio at the two Rayleigh anchors (default 0.05). */
  zeta?: number
}

export interface NonlinearFrameModelResult {
  frame: EquivalentFrame
  /** Fundamental elastic period of the equivalent frame, s. */
  period: number
  rayleigh: RayleighCoeffs
  response: NLDynamicResult
}

/**
 * Run a nonlinear time history with distributed member-end hinges on the
 * equivalent plane frame condensed from `model`. Returns null when the model
 * cannot be condensed or the record is empty.
 */
export function runNonlinearFrameModel(
  model: StructuralModel, gm: GroundMotion, opts: NonlinearFrameModelOpts = {},
): NonlinearFrameModelResult | null {
  if (gm.ag.length === 0) return null
  const dir = gm.dir === 2 ? 'z' : 'x'
  const frame = equivalentPlaneFrame(model, { ...opts, dir })
  if (!frame) return null
  const period = equivalentFramePeriod(frame)
  if (!(period > 0)) return null

  const w1 = (2 * Math.PI) / period
  const zeta = opts.zeta ?? 0.05
  const rayleigh = rayleighCoeffs(w1, zeta, 3 * w1, zeta)

  const response = nonlinearFrameDynamic({
    ...frameInputOf(frame), mass: frame.mass, rayleigh,
    ag: gm.ag, dt: gm.dt, dir: 'x',
  })
  return response ? { frame, period, rayleigh, response } : null
}
