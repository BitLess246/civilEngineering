// ─────────────────────────────────────────────────────────────────────────
// StructuralModel → frame3d bridge. Sections become E/G/A/Iy/Iz/J; supports
// map to fixed/pin; slab AREA loads run through the Phase-3 tributary engine
// and land on the matching edge members as vdl/udl gravity loads (categories
// preserved) — the load path, automated.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection, MemberReleases, MemberConnections, ConnectionKind, Plate, MemberRole } from './model'
import type { F3Node, F3Member, F3Support, F3Load, F3DiaphragmGroup, F3Shell } from './frame3d'
import { rectJ, defaultAxisRotation } from './frame3d'
import { buildDiaphragmGroups } from './diaphragm'
import { autoRigidOffsets } from './rigidEndZones'
import { distributePanel, type AreaLoad } from './tributary'
import type { BeamLoad } from './beamAnalysis'
import { shapeByName, torsionJ } from './aiscSections'
import { deriveWSection, E_STEEL } from './steelDesign'

export interface BridgeResult {
  nodes: F3Node[]
  members: F3Member[]
  supports: F3Support[]
  loads: F3Load[]
  /** Flat-shell elements meshed from slab/wall panels (empty unless shellElements on). */
  shells: F3Shell[]
  /** Edges whose loads could not be attached (no matching member). */
  orphanEdges: string[]
  /** Rigid floor diaphragm groups (one per storey); empty when diaphragm disabled. */
  diaphragmGroups: F3DiaphragmGroup[]
}

/** Concrete shell material for slab/wall panels: E = 4700√fc (NSCP/ACI), ν = 0.2.
 *  fc taken from the model's first concrete section (fallback 28 MPa). */
function plateMaterial(model: StructuralModel): { E: number; nu: number } {
  const fc = model.sections.find((s) => s.material !== 'steel')?.fc ?? 28
  return { E: 4700 * Math.sqrt(Math.max(fc, 1)), nu: 0.2 }
}

/** Triangle area (m²) from three model node ids. */
function triArea(p: [F3Node, F3Node, F3Node]): number {
  const [a, b, c] = p
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z
  const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx
  return 0.5 * Math.hypot(cx, cy, cz)
}

/** Mesh one quad panel into two triangular shells across the c0–c2 diagonal. */
function plateShells(plate: Plate, mat: { E: number; nu: number }): F3Shell[] {
  const [c0, c1, c2, c3] = plate.corners
  return [
    { id: `${plate.id}#0`, nodes: [c0, c1, c2], E: mat.E, nu: mat.nu, t: plate.thickness },
    { id: `${plate.id}#1`, nodes: [c0, c2, c3], E: mat.E, nu: mat.nu, t: plate.thickness },
  ]
}

function sectionProps(s: RectSection) {
  if (s.material === 'steel') return steelSectionProps(s)
  const E = 4700 * Math.sqrt(Math.max(s.fc, 1))
  return {
    E,
    G: E / 2.4,                 // ν = 0.2
    A: s.b * s.h,
    Iz: (s.b * s.h ** 3) / 12,  // gravity bending (depth h vertical)
    Iy: (s.h * s.b ** 3) / 12,
    J: rectJ(s.b, s.h),
  }
}

/** Steel member stiffness from its AISC shape (E = 200 GPa, G = E/2.6, ν = 0.3).
 *  Iz (strong axis) is the section's Ix; Iy is the weak axis. Falls back to the
 *  rectangular bounding box if the shape is unknown. */
function steelSectionProps(s: RectSection) {
  const E = E_STEEL, G = E / 2.6
  const shape = s.shape ? shapeByName(s.shape) : undefined
  if (!shape) return { E, G, A: s.b * s.h, Iz: (s.b * s.h ** 3) / 12, Iy: (s.h * s.b ** 3) / 12, J: rectJ(s.b, s.h) }
  let Iz: number, Iy: number, J: number
  if (shape.family === 'W' || shape.family === 'WT') {
    const d = deriveWSection(shape)
    Iz = d.Ix; Iy = d.Iy; J = d.J
  } else {
    // generic: I = A·r² about each axis; J from the family-correct formula
    // (thin-wall Σbt³/3 open / Bredt closed) — the polar moment Iz+Iy reads
    // 1–2 orders too STIFF for open shapes (C, L), which is unconservative.
    Iz = shape.A * shape.rx ** 2
    Iy = shape.A * shape.ry ** 2
    J = torsionJ(shape) ?? Iz + Iy
  }
  return { E, G, A: shape.A, Iz, Iy, J }
}

/**
 * Shear walls → equivalent diagonal struts that carry the panel's lateral
 * (in-plane) stiffness. A wall tagged `shearWall` on a beam (i,j) braces the
 * storey BELOW it: the panel is bounded by the beam nodes and the nodes
 * directly beneath them. Its combined shear + cantilever-flexure stiffness
 *   K = [ 1/(G·t·Lw/H) + 1/(3E·I_w/H³) ]⁻¹
 * is reproduced by an X of two pin-like struts (large A, ~0 I) whose axial
 * stiffness, projected horizontally (2·(EA/Ld)·cos²θ), equals K. Derived in the
 * bridge so the walls stay walls and the design pipeline ignores the struts.
 */
function wallStruts(model: StructuralModel, nm: Map<string, F3Node>): F3Member[] {
  const walls = (model.walls ?? []).filter((w) => w.shearWall)
  if (walls.length === 0) return []
  const fcOf = new Map(model.sections.map((s) => [s.id, s.fc]))
  const belowOf = (id: string): F3Node | null => {
    const n = nm.get(id); if (!n) return null
    let best: F3Node | null = null
    for (const q of nm.values()) {
      if (q.id === id || q.y >= n.y - 1e-4) continue
      if (Math.abs(q.x - n.x) < 1e-4 && Math.abs(q.z - n.z) < 1e-4 && (!best || q.y > best.y)) best = q
    }
    return best
  }
  const out: F3Member[] = []
  for (const w of walls) {
    const m = model.members.find((mm) => mm.id === w.member); if (!m) continue
    const a = nm.get(m.i), b = nm.get(m.j); if (!a || !b) continue
    const aD = belowOf(m.i), bD = belowOf(m.j); if (!aD || !bD) continue
    const Lw = Math.hypot(b.x - a.x, b.z - a.z) * 1000      // mm, horizontal panel length
    const H = (a.y - aD.y) * 1000                            // mm, panel height
    if (!(Lw > 0 && H > 0)) continue
    const fc = fcOf.get(m.section) ?? 28
    const E = 4700 * Math.sqrt(Math.max(fc, 1)), G = E / 2.4
    const Kshear = (G * w.thickness * Lw) / H                // N/mm
    const Kflex = (3 * E * (w.thickness * Lw ** 3 / 12)) / H ** 3
    const K = 1 / (1 / Kshear + 1 / Kflex)                   // N/mm ≡ kN/m
    const Ldm = Math.hypot(Lw, H) / 1000                     // m
    const cos = Lw / Math.hypot(Lw, H)
    const Ad = (K * 1000 * Ldm) / (2 * E * cos * cos)        // mm² (matches solver EA=E·A/1000 over L)
    const tiny = Math.max(1, Ad * 1e-6)
    const strut = (id: string, i: string, j: string): F3Member =>
      ({ id, i, j, E, G, A: Ad, Iy: tiny, Iz: tiny, J: tiny })
    out.push(strut(`wallstrut_${w.id}_1`, aD.id, m.j), strut(`wallstrut_${w.id}_2`, bD.id, m.i))
  }
  return out
}

/** Map a BeamLoad (x from edge start) onto a member that may run either way. */
function edgeLoadToMember(ld: BeamLoad, memberId: string, sameDir: boolean, L: number): F3Load | null {
  if (ld.type === 'udl') {
    const [x1, x2] = sameDir ? [ld.x1, ld.x2] : [L - ld.x2, L - ld.x1]
    return { kind: 'member-vdl', member: memberId, x1, x2, w1: ld.w, w2: ld.w, cat: ld.cat }
  }
  if (ld.type === 'vdl') {
    if (sameDir) return { kind: 'member-vdl', member: memberId, x1: ld.x1, x2: ld.x2, w1: ld.w1, w2: ld.w2, cat: ld.cat }
    return { kind: 'member-vdl', member: memberId, x1: L - ld.x2, x2: L - ld.x1, w1: ld.w2, w2: ld.w1, cat: ld.cat }
  }
  if (ld.type === 'point') return { kind: 'member-point', member: memberId, a: sameDir ? ld.x : L - ld.x, P: ld.P, cat: ld.cat }
  return null
}

/** A 'simple' (shear-only) connection pins the end: release the bending moments. */
function connEnd(kind?: ConnectionKind): MemberReleases['iEnd'] {
  return kind === 'simple' ? { My: true, Mz: true } : undefined
}

/** Combine explicit releases with the connection-type-implied releases (union:
 *  either source releasing a DOF releases it). A 'simple' connection therefore
 *  turns the member end into a pin, matching the connection's real behaviour. */
export function effectiveReleases(m: { releases?: MemberReleases; connections?: MemberConnections }): MemberReleases {
  const merge = (a?: MemberReleases['iEnd'], b?: MemberReleases['iEnd']): MemberReleases['iEnd'] | undefined => {
    if (!a && !b) return undefined
    return {
      Fx: a?.Fx || b?.Fx, Fy: a?.Fy || b?.Fy, Fz: a?.Fz || b?.Fz,
      Mx: a?.Mx || b?.Mx, My: a?.My || b?.My, Mz: a?.Mz || b?.Mz,
    }
  }
  const iEnd = merge(m.releases?.iEnd, connEnd(m.connections?.iEnd))
  const jEnd = merge(m.releases?.jEnd, connEnd(m.connections?.jEnd))
  return { ...(iEnd ? { iEnd } : {}), ...(jEnd ? { jEnd } : {}) }
}

/** Map MemberReleases flags to F3Member relI / relJ arrays. */
function releaseFlags(rel: MemberReleases | undefined): Pick<F3Member, 'relI' | 'relJ'> {
  if (!rel) return {}
  const toArr = (end?: MemberReleases['iEnd']): [boolean, boolean, boolean, boolean, boolean, boolean] | undefined =>
    end ? [end.Fx ?? false, end.Fy ?? false, end.Fz ?? false, end.Mx ?? false, end.My ?? false, end.Mz ?? false] : undefined
  const relI = toArr(rel.iEnd)
  const relJ = toArr(rel.jEnd)
  return { ...(relI ? { relI } : {}), ...(relJ ? { relJ } : {}) }
}

/** Bridge options. `useShells` defaults to the model's `shellElements` flag; the
 *  design / modal / buckling paths pass `false` to keep the classic tributary
 *  edge-load model (shells are an analysis-path feature in this phase). */
/** ACI 318-14 Table 6.6.3.1.1(a) — cracked flexural stiffness for factored-load
 *  analysis: beams 0.35Ig, columns 0.70Ig (braces treated as compression
 *  members → 0.70). Axial area stays 1.0Ag; J is left gross (torsional cracking
 *  is a separate §22.7 concern). Concrete members only — steel is uncracked. */
const CRACKED_I: Record<MemberRole, number> = { beam: 0.35, girder: 0.35, column: 0.70, brace: 0.70 }

export interface BridgeOpts {
  useShells?: boolean
  /** Apply ACI §6.6.3.1.1 cracked-section I-modifiers to concrete members.
   *  Off by default at the API level so closed-form benchmarks stay anchored
   *  to gross-section theory; the Model Space UI enables it by default. */
  crackedSections?: boolean
}

export function modelToFrame3D(model: StructuralModel, opts?: BridgeOpts): BridgeResult {
  const useShells = opts?.useShells ?? !!model.shellElements
  const nodes: F3Node[] = model.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z }))
  const nm = new Map(nodes.map((n) => [n.id, n]))
  const secById = new Map(model.sections.map((s) => [s.id, sectionProps(s)]))
  const fallback = sectionProps(model.sections[0] ?? { id: '', name: '', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 })

  // Automatic rigid end zones from connectivity (ETABS-style); manual member
  // offsets always win over the auto value, per end.
  const auto = model.rigidEndZones ? autoRigidOffsets(model, model.rigidZoneFactor ?? 0.5) : null
  const members: F3Member[] = model.members.map((m) => {
    const a = auto?.get(m.id)
    const offI = m.offsets?.iEnd ?? a?.offI
    const offJ = m.offsets?.jEnd ?? a?.offJ
    // local-axis rotation: explicit wins; verticals default to 90° so the
    // analysis strong-axis orientation matches the drawn one (depth d → X)
    const ni = nm.get(m.i), nj = nm.get(m.j)
    const rot = ni && nj ? defaultAxisRotation([nj.x - ni.x, nj.y - ni.y, nj.z - ni.z], m.axisRotation) : (m.axisRotation ?? 0)
    const props = secById.get(m.section) ?? fallback
    const ck = opts?.crackedSections && model.sections.find((s) => s.id === m.section)?.material !== 'steel'
      ? CRACKED_I[m.role] : 1
    return {
      id: m.id, i: m.i, j: m.j, ...props, Iz: props.Iz * ck, Iy: props.Iy * ck,
      ...releaseFlags(effectiveReleases(m)),
      ...(offI ? { offI } : {}),
      ...(offJ ? { offJ } : {}),
      ...(rot ? { rot } : {}),
    }
  })
  // shear walls → equivalent diagonal struts (lateral stiffness only)
  members.push(...wallStruts(model, nm))
  const memberByPair = new Map<string, { id: string; i: string; j: string }>()
  for (const m of model.members) {
    memberByPair.set(`${m.i}|${m.j}`, m)
    memberByPair.set(`${m.j}|${m.i}`, m)
  }

  const supports: F3Support[] = model.supports.map((s) => {
    if (s.fixity === 'spring') return { node: s.node, fixity: 'spring', kx: s.kx, ky: s.ky, kz: s.kz }
    return { node: s.node, fixity: s.fixity === 'fixed' ? 'fixed' : 'pin' }
  })

  // Optional: mesh slab/wall panels into flat-shell elements (two triangles per
  // panel on its corner nodes). Panels handled as shells carry their area loads
  // through the shell — the tributary edge-load path is skipped for them below.
  const shells: F3Shell[] = []
  const shellPlateIds = new Set<string>()
  if (useShells) {
    const mat = plateMaterial(model)
    for (const plate of model.plates) {
      const c = plate.corners.map((id) => nm.get(id))
      if (c.some((q) => !q)) continue
      const [c0, c1, c2, c3] = c as F3Node[]
      if (triArea([c0, c1, c2]) + triArea([c0, c2, c3]) < 1e-9) continue   // degenerate
      shells.push(...plateShells(plate, mat))
      shellPlateIds.add(plate.id)
    }
  }

  const loads: F3Load[] = []
  const orphanEdges: string[] = []

  // direct loads
  for (const ld of model.loads) {
    if (ld.kind === 'node') loads.push({ kind: 'node', node: ld.node, Fx: ld.Fx, Fy: ld.Fy, Fz: ld.Fz, cat: ld.cat })
    else if (ld.kind === 'member-udl') loads.push({ kind: 'member-udl', member: ld.member, w: ld.w, cat: ld.cat })
    else if (ld.kind === 'member-point') {
      const m = model.members.find((q) => q.id === ld.member)
      if (!m) continue
      const a = nm.get(m.i)!, b = nm.get(m.j)!
      const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
      loads.push({ kind: 'member-point', member: ld.member, a: ld.t * L, P: ld.P, cat: ld.cat })
    } else if (ld.kind === 'member-thermal') {
      const m = model.members.find((q) => q.id === ld.member)
      if (!m) continue
      const sec = model.sections.find((s) => s.id === m.section)
      if (!sec) continue
      const { E, A } = sectionProps(sec)   // E in MPa (N/mm²), A in mm²
      const PT = (E * A * ld.alpha * ld.deltaT) / 1000   // N → kN (frame3d expects PT in kN)
      loads.push({ kind: 'member-thermal', member: ld.member, PT, cat: ld.cat })
    }
  }

  // slab area loads → tributary → edge members
  for (const plate of model.plates) {
    const areaLoads: AreaLoad[] = model.loads
      .filter((l) => l.kind === 'area' && l.plate === plate.id)
      .map((l) => ({ q: (l as { q: number }).q, cat: l.cat }))
    if (areaLoads.length === 0) continue

    const c = plate.corners.map((id) => nm.get(id))
    if (c.some((q) => !q)) continue
    const [c0, c1, c2, c3] = c as F3Node[]

    // Shell panel: lump each gravity area load to the corner nodes (−Y), split
    // per triangle (q·A_tri/3 to each of its three nodes). Avoids double-count
    // with the shell stiffness (no tributary edge loads for this panel).
    if (shellPlateIds.has(plate.id)) {
      const A0 = triArea([c0, c1, c2]), A1 = triArea([c0, c2, c3])
      for (const al of areaLoads) {
        const f0 = (al.q * A0) / 3, f1 = (al.q * A1) / 3
        const add = (id: string, f: number) => loads.push({ kind: 'node', node: id, Fy: -f, cat: al.cat })
        add(c0.id, f0); add(c1.id, f0); add(c2.id, f0)
        add(c0.id, f1); add(c2.id, f1); add(c3.id, f1)
      }
      continue
    }

    const lxSpan = Math.hypot(c1.x - c0.x, c1.y - c0.y, c1.z - c0.z)   // edge c0→c1 (and c3→c2)
    const lzSpan = Math.hypot(c3.x - c0.x, c3.y - c0.y, c3.z - c0.z)   // edge c0→c3 (and c1→c2)
    const trib = distributePanel(lxSpan, lzSpan, areaLoads)

    // pair the panel's long/short tributary edges with the actual corner edges
    const xEdges: [F3Node, F3Node][] = [[c0, c1], [c3, c2]]
    const zEdges: [F3Node, F3Node][] = [[c0, c3], [c1, c2]]
    const longEdges = lxSpan >= lzSpan ? xEdges : zEdges
    const shortEdges = lxSpan >= lzSpan ? zEdges : xEdges
    const assign: [EdgePair: [F3Node, F3Node], kind: 'long' | 'short'][] = [
      [longEdges[0], 'long'], [longEdges[1], 'long'],
      [shortEdges[0], 'short'], [shortEdges[1], 'short'],
    ]

    let li = 0, si = 0
    for (const [[a, b], kind] of assign) {
      const trEdge = kind === 'long'
        ? trib.edges.filter((e) => e.kind === 'long')[li++]
        : trib.edges.filter((e) => e.kind === 'short')[si++]
      if (!trEdge || trEdge.loads.length === 0) continue
      const m = memberByPair.get(`${a.id}|${b.id}`)
      if (!m) { orphanEdges.push(`${plate.id}:${a.id}-${b.id}`); continue }
      const sameDir = m.i === a.id
      const L = trEdge.length
      for (const ld of trEdge.loads) {
        const f3 = edgeLoadToMember(ld, m.id, sameDir, L)
        if (f3) loads.push(f3)
      }
    }
  }

  const diaphragmGroups = model.diaphragm ? buildDiaphragmGroups(model) : []
  return { nodes, members, supports, loads, shells, orphanEdges, diaphragmGroups }
}
