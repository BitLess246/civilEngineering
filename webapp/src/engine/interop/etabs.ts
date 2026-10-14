// ─────────────────────────────────────────────────────────────────────────
// ETABS interchange — export a StructuralModel as an `.e2k` text model.
// Pure text from data; no DOM, no I/O. (Import is the next phase.)
//
// Units: the file declares UNITS "KN" "M" "C" — lengths m, forces kN,
// line loads kN/m, area loads kN/m², E and strengths kN/m², unit weight kN/m³.
//
// WHAT TRAVELS, AND HOW
//  · AXES. Zeta is Y-up, ETABS Z-up. A node (x, y, z) goes out as
//    (X, Y, Z) = (x, −z, y): a proper rotation, so handedness — and with it
//    every cross product and local-axis sense — is preserved.
//  · STOREYS. ETABS places every object on a story. Each distinct node
//    elevation becomes one, so every node sits exactly on a story level and
//    nothing needs a vertical point offset. Names come from the model's own
//    storeys where an elevation matches one; the lowest level is "Base".
//  · POINTS are plan positions: one label per distinct (X, Y). A node is that
//    label on its story — the way ETABS itself numbers points.
//  · FRAMES. A line between two storeys goes out as a COLUMN (role column) or
//    a BRACE (anything else), written bottom-up with its story span; a line on
//    one story is a BEAM. A raking column is a COLUMN with two plan labels.
//  · LOCAL AXES. Section depth h is ETABS's D, measured along local 2. The
//    exported ANG is computed from geometry, not assumed: Zeta's actual depth
//    vector y′ (its own `localAxes` at the resolved rotation) is measured
//    against ETABS's DEFAULT local 2/3 for the line as written — +X for a
//    vertical line, otherwise the upward direction in the vertical plane
//    through the line. So a raking column, a member drawn top-down, and a
//    rotated beam all land with the section the model analysed.
//  · RELEASES map local-for-local once the axes agree: Fx→P, Fy→V2, Fz→V3,
//    Mx→T, My→M2, Mz→M3; a 'simple' end releases M2 and M3.
//  · SLABS AND WALLS go out as FLOOR / PANEL area objects. With shell elements
//    off, Zeta carries a slab as LOAD on its edge beams (tributary), so the
//    slab property is a MEMBRANE: ETABS then distributes the area load to the
//    beams by its own two-way rule instead of giving the slab stiffness. With
//    shells on, it is a thin shell, as Zeta analyses it.
//  · LOADS. One load pattern per category, SELFWEIGHT 0: Zeta's dead case
//    already carries member and slab self-weight as explicit loads, so ETABS
//    gets the same total rather than twice it. Combinations are the NSCP
//    §203.3.1 set over the categories present, as Linear Add combos.
//
// WHAT DOES NOT, STATED RATHER THAN DROPPED (returned as warnings)
//  · Member end offsets, rigid end zones, tension/compression-only members,
//    spring supports' stiffnesses, temperature loads, slab openings, the shell
//    mesh subdivision, and the mass source. Each has an ETABS equivalent the
//    engineer sets there; none is guessed into a syntax we cannot check.
//
// NOT CHECKED AGAINST ETABS ITSELF. The format follows the .e2k files ETABS
// writes (v18+), but no ETABS licence was available to open the output. The
// tests check what can be checked without one: every node, member and plate
// is placed back exactly, every reference resolves, the section depth lies
// where Zeta put it, and the exported loads total Zeta's per category.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection, Member, Node, Plate } from '../model'
import type { LoadCategory } from '../beamAnalysis'
import { nscpCombos } from '../beamAnalysis'
import { sectionProps } from '../modelBridge'
import { defaultAxisRotation, localAxes } from '../frame3d'
import { shapeByName } from '../aiscSections'
import { GAMMA_C, GAMMA_S, sectionGamma } from '../modelBuilder'

export interface EtabsExport { text: string; warnings: string[] }

type V3 = [number, number, number]
const CAT_ORDER: LoadCategory[] = ['D', 'L', 'Lr', 'S', 'R', 'W', 'E', 'T']
/** ETABS load-pattern names and types. ETABS has no Rain pattern type. */
const PATTERN: Record<LoadCategory, [string, string]> = {
  D: ['DEAD', 'Dead'], L: ['LIVE', 'Live'], Lr: ['ROOF LIVE', 'Roof Live'], S: ['SNOW', 'Snow'],
  R: ['RAIN', 'Other'], W: ['WIND', 'Wind'], E: ['EARTHQUAKE', 'Seismic'], T: ['TEMPERATURE', 'Other'],
}

/** Six significant figures, no trailing zeros. */
export function fmt(v: number): string {
  if (!Number.isFinite(v) || Math.abs(v) < 1e-12) return '0'
  const a = Math.abs(v)
  if (a >= 1e-4 && a < 1e9) return String(parseFloat(v.toPrecision(6)))
  return v.toExponential(5).replace(/\.?0+e/, 'e').toUpperCase()
}
/** A quoted e2k name: no double quotes inside, no line breaks. */
/** An e2k name: plain ASCII (the file is read as ANSI), no double quotes, one line. */
export const clean = (s: string) => s.replace(/×/g, 'x').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/"/g, "'").replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7e]/g, '_').trim()
export const q = (s: string) => `"${clean(s)}"`

/** Zeta (x, y-up, z) → ETABS (X, Y, Z-up). */
export const toEtabs = (v: V3): V3 => [v[0], -v[2], v[1]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: V3): V3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l] }

/** ETABS's default local axes for a line from A to B, in ETABS coordinates:
 *  a vertical line has local 2 on +X; any other has local 1–2 vertical with
 *  2 pointing up. "Vertical" is within 10⁻³ rad, ETABS's own tolerance. */
export function etabsDefaultAxes(A: V3, B: V3): [V3, V3, V3] {
  const e1 = unit(sub(B, A))
  let e2: V3
  if (Math.abs(e1[2]) > Math.cos(1e-3)) e2 = [1, 0, 0]
  else { const up: V3 = [0, 0, 1], p = dot(up, e1); e2 = unit([up[0] - p * e1[0], up[1] - p * e1[1], up[2] - p * e1[2]]) }
  return [e1, e2, cross(e1, e2)]
}

/** ETABS local-axis angle (deg) that puts local 2 on Zeta's section depth y′. */
export function etabsAngle(m: Member, a: Node, b: Node, etabsFromA: boolean): number {
  const d: V3 = [b.x - a.x, b.y - a.y, b.z - a.z]
  const yp = toEtabs(localAxes(d, defaultAxisRotation(d, m.axisRotation, m.role))[1])
  const A = toEtabs([a.x, a.y, a.z]), B = toEtabs([b.x, b.y, b.z])
  const [, e2, e3] = etabsFromA ? etabsDefaultAxes(A, B) : etabsDefaultAxes(B, A)
  let ang = (Math.atan2(dot(yp, e3), dot(yp, e2)) * 180) / Math.PI
  // A rectangle, a W shape, a tube: all symmetric about local 2, so ±180° is
  // the same section. Keep the angle in (−90°, 90°].
  while (ang <= -90) ang += 180
  while (ang > 90) ang -= 180
  return Math.abs(ang) < 1e-7 ? 0 : ang
}

// ─── EXPORT ──────────────────────────────────────────────────────────────

export function toEtabs2k(model: StructuralModel): EtabsExport {
  const warnings: string[] = []
  const L: string[] = []
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]))
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const members = model.members.filter((m) => nodeById.has(m.i) && nodeById.has(m.j) && secById.has(m.section))
  if (members.length < model.members.length)
    warnings.push(`${model.members.length - members.length} member(s) reference a missing node or section and were left out.`)
  const plates = model.plates.filter((p) => p.corners.every((c) => nodeById.has(c)))

  // ── storeys: every distinct node elevation, mm-snapped ──
  const key = (v: number) => Math.round(v * 1000)
  const elevs = [...new Set(model.nodes.map((n) => key(n.y)))].sort((a, b) => a - b).map((k) => k / 1000)
  const storyIdx = new Map(elevs.map((e, i) => [key(e), i]))
  const used = new Set<string>()
  const storyName = elevs.map((e, i) => {
    if (i === 0) { used.add('Base'); return 'Base' }
    const own = model.storeys.find((s) => Math.abs(s.elevation - e) < 1e-3)?.name
    const named = own ? clean(own) : undefined
    let nm = named && !used.has(named) && named !== 'Base' ? named : `L${fmt(e)}`
    for (let k = 2; used.has(nm); k++) nm = `${named ?? `L${fmt(e)}`}_${k}`
    used.add(nm)
    return nm
  })
  const sIdx = (n: Node) => storyIdx.get(key(n.y))!
  if (elevs.length > Math.max(model.storeys.length, 1) + 1)
    warnings.push(`${elevs.length - 1} ETABS stories were created — one per distinct node elevation (the model names ${model.storeys.length}). Intermediate levels come from nodes between floors; merge them in ETABS if they are not floors.`)

  // ── plan points: one label per distinct (X, Y) ──
  const pkey = (n: Node) => { const [X, Y] = toEtabs([n.x, n.y, n.z]); return `${Math.round(X * 1e6)}|${Math.round(Y * 1e6)}` }
  const ptLabel = new Map<string, string>()
  const ptXY: [string, number, number][] = []
  for (const n of model.nodes) {
    const k = pkey(n)
    if (ptLabel.has(k)) continue
    const [X, Y] = toEtabs([n.x, n.y, n.z])
    const lab = String(ptLabel.size + 1)
    ptLabel.set(k, lab); ptXY.push([lab, X, Y])
  }
  const pl = (n: Node) => ptLabel.get(pkey(n))!

  L.push('$ File exported from Zeta (zetastruct.app)')
  L.push('$ Units: kN, m, C. Section depth D lies along local 2; ANG is the local-2 angle.')
  L.push('', '$ PROGRAM INFORMATION', '  PROGRAM  "ETABS"  VERSION "18.0.0"')
  L.push('', '$ CONTROLS', '  UNITS  "KN"  "M"  "C"', `  TITLE2  ${q(model.name || 'Zeta model')}`)

  L.push('', '$ STORIES - IN SEQUENCE FROM TOP')
  for (let i = elevs.length - 1; i >= 1; i--)
    L.push(`  STORY ${q(storyName[i])}  HEIGHT ${fmt(elevs[i] - elevs[i - 1])}  MASTERSTORY "Yes"`)
  L.push(`  STORY "Base"  ELEV ${fmt(elevs[0] ?? 0)}`)

  // ── materials: one per distinct (kind, E, strength) ──
  interface Mat { name: string; type: string; E: number; nu: number; w: number; alpha: number; strength: string }
  const mats = new Map<string, Mat>()
  const matOf = (s: RectSection): Mat => {
    const kind = s.material ?? 'concrete'
    const { E } = sectionProps(s)                                  // MPa
    const k = `${kind}|${E.toFixed(1)}|${kind === 'steel' ? s.steelFy ?? 248 : kind === 'concrete' ? s.fc : ''}`
    let m = mats.get(k)
    if (!m) {
      const n = [...mats.values()].filter((x) => x.type.startsWith(kind === 'steel' ? 'Steel' : kind === 'wood' ? 'Other' : 'Concrete')).length
      const sfx = n ? `_${n + 1}` : ''
      if (kind === 'steel') m = { name: `STEEL${Math.round(s.steelFy ?? 248)}${sfx}`, type: 'Steel', E: E * 1000, nu: 0.3, w: GAMMA_S, alpha: 1.17e-5,
        strength: `FY ${fmt((s.steelFy ?? 248) * 1000)}  FU ${fmt((s.steelFu ?? 400) * 1000)}` }
      else if (kind === 'wood') m = { name: `TIMBER${sfx || ''}`, type: 'Other', E: E * 1000, nu: 0.3, w: sectionGamma(s), alpha: 5e-6, strength: '' }
      else m = { name: `C${Math.round(s.fc)}${sfx}`, type: 'Concrete', E: E * 1000, nu: 0.2, w: GAMMA_C, alpha: 9.9e-6, strength: `FC ${fmt(s.fc * 1000)}` }
      mats.set(k, m)
    }
    return m
  }
  // One frame section per distinct section TEMPLATE: members whose sections
  // differ only in id/name share a definition, as they do in the STAAD deck.
  const tmpl = (s: RectSection) => { const { id: _i, name: _n, ...rest } = s; return JSON.stringify(rest) }
  const byTmpl = new Map<string, RectSection>()
  for (const m of members) { const s = secById.get(m.section)!; if (!byTmpl.has(tmpl(s))) byTmpl.set(tmpl(s), s) }
  const usedSecs = [...byTmpl.values()]
  usedSecs.forEach(matOf)
  const fcSlab = model.sections.find((s) => (s.material ?? 'concrete') === 'concrete')?.fc ?? 28
  const slabMat = plates.length ? matOf({ id: '', name: '', b: 1, h: 1, fc: fcSlab, fy: 0, barDia: 0, tieDia: 0, cover: 0 }) : null

  L.push('', '$ MATERIAL PROPERTIES')
  for (const m of mats.values()) {
    L.push(`  MATERIAL  ${q(m.name)}  TYPE ${q(m.type)}  WEIGHTPERVOLUME ${fmt(m.w)}`)
    L.push(`  MATERIAL  ${q(m.name)}  SYMTYPE "Isotropic"  E ${fmt(m.E)}  U ${fmt(m.nu)}  A ${fmt(m.alpha)}`)
    if (m.strength) L.push(`  MATERIAL  ${q(m.name)}  ${m.strength}`)
  }

  // ── frame sections, one per section used ──
  const secName = new Map<string, string>()
  const taken = new Set<string>()
  const generalSteel: string[] = []
  L.push('', '$ FRAME SECTIONS')
  for (const s of usedSecs) {
    const base = clean(s.name || s.id) || clean(s.id) || 'SEC'
    let nm = base
    for (let k = 2; taken.has(nm); k++) nm = `${base}_${k}`
    taken.add(nm); secName.set(tmpl(s), nm)
    const mat = q(matOf(s).name)
    const shape = s.material === 'steel' && s.shape ? shapeByName(s.shape) : undefined
    if (shape && shape.family === 'W' && shape.d && shape.bf && shape.tf && shape.tw) {
      const mm = (v: number) => fmt(v / 1000)
      L.push(`  FRAMESECTION  ${q(nm)}  MATERIAL ${mat}  SHAPE "I/Wide Flange"  D ${mm(shape.d)}  B ${mm(shape.bf)}  TF ${mm(shape.tf)}  TW ${mm(shape.tw)}  BB ${mm(shape.bf)}  TFB ${mm(shape.tf)}`)
    } else if (s.material === 'steel' && s.shape) {
      // Not a W: carry the stiffness Zeta analysed, as a general property set.
      const p = sectionProps(s), m2 = 1e-6, m4 = 1e-12
      generalSteel.push(s.shape)
      L.push(`  FRAMESECTION  ${q(nm)}  MATERIAL ${mat}  SHAPE "General"  D ${fmt(s.h / 1000)}  B ${fmt(s.b / 1000)}  AREA ${fmt(p.A * m2)}  AS2 ${fmt(p.Asy * m2)}  AS3 ${fmt(p.Asz * m2)}  I33 ${fmt(p.Iz * m4)}  I22 ${fmt(p.Iy * m4)}  TORSION ${fmt(p.J * m4)}`)
    } else if ((s.material ?? 'concrete') === 'concrete') {
      L.push(`  FRAMESECTION  ${q(nm)}  MATERIAL ${mat}  SHAPE "Concrete Rectangular"  D ${fmt(s.h / 1000)}  B ${fmt(s.b / 1000)}`)
    } else {
      L.push(`  FRAMESECTION  ${q(nm)}  MATERIAL ${mat}  SHAPE "Rectangular"  D ${fmt(s.h / 1000)}  B ${fmt(s.b / 1000)}`)
    }
  }
  if (generalSteel.length)
    warnings.push(`${[...new Set(generalSteel)].join(', ')}: not wide-flange, so exported as "General" sections carrying Zeta's A, I, J and shear areas — reassign the catalogue shape in ETABS for steel design.`)
  if (usedSecs.some((s) => (s.material ?? 'concrete') === 'concrete'))
    warnings.push('Concrete sections go out as geometry and material only. Rebar layout and cover are not transferred — ETABS designs its own reinforcement.')

  // ── slab and wall properties: one per (role, thickness) ──
  const shells = !!model.shellElements
  const shellProp = new Map<string, string>()
  if (plates.length && slabMat) {
    L.push('', '$ SLAB PROPERTIES')
    for (const p of plates.filter((x) => x.role !== 'wall')) {
      const k = `S${p.thickness}`
      if (shellProp.has(k)) continue
      const nm = `SLAB${Math.round(p.thickness)}`
      shellProp.set(k, nm)
      L.push(`  SHELLPROP  ${q(nm)}  PROPTYPE  "Slab"  MATERIAL ${q(slabMat.name)}  MODELINGTYPE ${shells ? '"ShellThin"' : '"Membrane"'}  SLABTYPE "Slab"  SLABTHICKNESS ${fmt(p.thickness / 1000)}`)
    }
    const walls = plates.filter((x) => x.role === 'wall')
    if (walls.length) {
      L.push('', '$ WALL PROPERTIES')
      for (const p of walls) {
        const k = `W${p.thickness}`
        if (shellProp.has(k)) continue
        const nm = `WALL${Math.round(p.thickness)}`
        shellProp.set(k, nm)
        L.push(`  SHELLPROP  ${q(nm)}  PROPTYPE  "Wall"  MATERIAL ${q(slabMat.name)}  MODELINGTYPE "ShellThin"  WALLTHICKNESS ${fmt(p.thickness / 1000)}`)
      }
    }
    if (!shells) warnings.push('Slabs go out as MEMBRANE floors: Zeta carried them as tributary load on the beams (shell elements off), and a membrane is ETABS\'s equivalent — it distributes the area load to the frame by its own two-way rule rather than giving the slab bending stiffness.')
    if ((model.shellSubdiv ?? 1) > 1) warnings.push(`Shell mesh subdivision ${model.shellSubdiv}×${model.shellSubdiv} is not exported — set the auto-mesh on the floors in ETABS.`)
    if (plates.some((p) => p.openings?.length)) warnings.push('Slab openings are not exported — draw them as opening areas in ETABS.')
  }

  // ── points ──
  L.push('', '$ POINT COORDINATES')
  for (const [lab, X, Y] of ptXY) L.push(`  POINT ${q(lab)}  ${fmt(X)}  ${fmt(Y)}`)

  // ── lines: name, kind, bottom-up order, story ──
  interface Line { m: Member; name: string; kind: 'COLUMN' | 'BEAM' | 'BRACE'; a: Node; b: Node; swapped: boolean; story: number; span: number }
  const lines: Line[] = []
  const count = { COLUMN: 0, BEAM: 0, BRACE: 0 }
  for (const m of members) {
    let a = nodeById.get(m.i)!, b = nodeById.get(m.j)!, swapped = false
    const span = Math.abs(sIdx(b) - sIdx(a))
    if (span > 0 && sIdx(a) > sIdx(b)) { [a, b] = [b, a]; swapped = true }
    const kind = span === 0 ? 'BEAM' : m.role === 'column' ? 'COLUMN' : 'BRACE'
    count[kind]++
    lines.push({ m, name: `${kind === 'COLUMN' ? 'C' : kind === 'BEAM' ? 'B' : 'D'}${count[kind]}`, kind, a, b, swapped, story: sIdx(b), span })
  }
  L.push('', '$ LINE CONNECTIVITIES')
  for (const l of lines) L.push(`  LINE  ${q(l.name)}  ${l.kind}  ${q(pl(l.a))}  ${q(pl(l.b))}  ${l.span}`)

  // ── areas: corners with their story offset below the area's own story ──
  interface Area { p: Plate; name: string; story: number; corners: Node[] }
  const areas: Area[] = []
  let nf = 0, nw = 0
  for (const p of plates) {
    const cs = p.corners.map((c) => nodeById.get(c)!)
    const story = Math.max(...cs.map(sIdx))
    const flat = cs.every((n) => sIdx(n) === story)
    areas.push({ p, name: flat ? `F${++nf}` : `W${++nw}`, story, corners: cs })
  }
  if (areas.length) {
    L.push('', '$ AREA CONNECTIVITIES')
    for (const a of areas) {
      const type = a.corners.every((n) => sIdx(n) === a.story) ? 'FLOOR' : 'PANEL'
      L.push(`  AREA  ${q(a.name)}  ${type}  4  ${a.corners.map((n) => q(pl(n))).join('  ')}  ${a.corners.map((n) => a.story - sIdx(n)).join('  ')}`)
    }
  }

  // ── point assigns: supports (and the rigid diaphragm) ──
  L.push('', '$ POINT ASSIGNS')
  const springs: string[] = []
  for (const s of model.supports) {
    const n = nodeById.get(s.node)
    if (!n) continue
    let r: string
    if (s.fixity === 'fixed') r = 'UX UY UZ RX RY RZ'
    else if (s.fixity === 'spring') {
      // Zeta kx, ky(up), kz → ETABS UX, UZ, UY. A sprung direction is left free.
      const held = ([['UX', s.kx], ['UY', s.kz], ['UZ', s.ky]] as const).filter(([, k]) => !(k && k > 0)).map(([d]) => d)
      r = [...held, 'RX', 'RY', 'RZ'].join(' ')
      springs.push(`${pl(n)}@${storyName[sIdx(n)]} (kx ${fmt(s.kx ?? 0)}, ky ${fmt(s.ky ?? 0)}, kz ${fmt(s.kz ?? 0)} kN/m)`)
    } else r = 'UX UY UZ'                                          // the bridge analyses a roller as a pin
    L.push(`  POINTASSIGN  ${q(pl(n))}  ${q(storyName[sIdx(n)])}  RESTRAINT ${q(r)}`)
  }
  if (springs.length) warnings.push(`Spring supports go out with their sprung directions free and rotations held; add point springs in ETABS: ${springs.join('; ')}.`)
  if (model.supports.some((s) => s.fixity === 'roller')) warnings.push('Roller supports are written as pins (UX UY UZ) — Zeta analyses a roller as a pin, so ETABS solves the same restraint.')
  if (model.diaphragm) {
    L.splice(L.indexOf('$ POINT ASSIGNS'), 0, '$ DIAPHRAGM NAMES', '  DIAPHRAGM "D1"  TYPE RIGID', '')
    const seen = new Set<string>()
    for (const n of model.nodes) {
      const k = `${pl(n)}|${sIdx(n)}`
      if (sIdx(n) === 0 || seen.has(k)) continue
      seen.add(k)
      L.push(`  POINTASSIGN  ${q(pl(n))}  ${q(storyName[sIdx(n)])}  DIAPH "D1"`)
    }
  }

  // ── line assigns: section, angle, releases ──
  L.push('', '$ LINE ASSIGNS')
  const relKeys = [['Fx', 'P'], ['Fy', 'V2'], ['Fz', 'V3'], ['Mx', 'T'], ['My', 'M2'], ['Mz', 'M3']] as const
  for (const l of lines) {
    const m = l.m
    const ang = etabsAngle(m, nodeById.get(m.i)!, nodeById.get(m.j)!, !l.swapped)
    const rel: string[] = []
    for (const [end, zetaEnd] of [['I', l.swapped ? 'jEnd' : 'iEnd'], ['J', l.swapped ? 'iEnd' : 'jEnd']] as const) {
      const f = { ...(m.releases?.[zetaEnd] ?? {}) }
      if (m.connections?.[zetaEnd] === 'simple') { f.My = true; f.Mz = true }
      for (const [k, e] of relKeys) if (f[k]) rel.push(`${e}${end}`)
    }
    L.push(`  LINEASSIGN  ${q(l.name)}  ${q(storyName[l.story])}  SECTION ${q(secName.get(tmpl(secById.get(m.section)!))!)}${ang ? `  ANG ${fmt(ang)}` : ''}${rel.length ? `  RELEASE ${q(rel.join(' '))}` : ''}`)
  }
  if (members.some((m) => [m.offsets?.iEnd, m.offsets?.jEnd].some((o) => o?.some((v: number) => Math.abs(v) > 1e-12))))
    warnings.push('Member end offsets are not exported — set end length offsets or insertion points in ETABS.')
  if (model.rigidEndZones) warnings.push('Automatic rigid end zones are a Zeta analysis switch; turn on ETABS\'s automatic end length offsets (rigid-zone factor) to match.')
  if (members.some((m) => m.axialMode && m.axialMode !== 'both'))
    warnings.push('Tension-only / compression-only members are exported as ordinary frames — set their tension/compression limits in ETABS.')

  // ── area assigns ──
  if (areas.length) {
    L.push('', '$ AREA ASSIGNS')
    for (const a of areas) L.push(`  AREAASSIGN  ${q(a.name)}  ${q(storyName[a.story])}  SECTION ${q(shellProp.get(`${a.p.role === 'wall' ? 'W' : 'S'}${a.p.thickness}`)!)}`)
  }

  // ── load patterns and cases ──
  const cats = CAT_ORDER.filter((c) => model.loads.some((l) => l.cat === c))
  L.push('', '$ LOAD PATTERNS')
  for (const c of cats) L.push(`  LOADPATTERN  ${q(PATTERN[c][0])}  TYPE  ${q(PATTERN[c][1])}  SELFWEIGHT  0`)
  L.push('', '$ LOAD CASES')
  for (const c of cats) {
    L.push(`  LOADCASE  ${q(PATTERN[c][0])}  TYPE  "Linear Static"  INITCOND  "PRESET"`)
    L.push(`  LOADCASE  ${q(PATTERN[c][0])}  LOADPAT  ${q(PATTERN[c][0])}  SF  1`)
  }
  if (cats.includes('D')) warnings.push('Load patterns carry SELFWEIGHT 0: Zeta\'s dead case already holds member and slab self-weight as explicit loads, so ETABS gets the same total. Set the mass source (e.g. from loads, D + 0.25L) in ETABS before a modal or seismic run.')

  // ── loads ──
  const lineOf = new Map(lines.map((l) => [l.m.id, l]))
  const areaOf = new Map(areas.map((a) => [a.p.id, a]))
  const pt: string[] = [], ln: string[] = [], ar: string[] = []
  let thermal = 0
  for (const ld of model.loads) {
    const lc = q(PATTERN[ld.cat][0])
    if (ld.kind === 'node') {
      const n = nodeById.get(ld.node)
      if (!n) continue
      const [FX, FY, FZ] = toEtabs([ld.Fx ?? 0, ld.Fy ?? 0, ld.Fz ?? 0])
      const f = ([['FX', FX], ['FY', FY], ['FZ', FZ]] as const).filter(([, v]) => Math.abs(v) > 1e-12)
      if (f.length) pt.push(`  POINTLOAD  ${q(pl(n))}  ${q(storyName[sIdx(n)])}  TYPE "FORCE"  LC ${lc}  ${f.map(([k, v]) => `${k} ${fmt(v)}`).join('  ')}`)
    } else if (ld.kind === 'member-udl') {
      const l = lineOf.get(ld.member)
      if (l) ln.push(`  LINELOAD  ${q(l.name)}  ${q(storyName[l.story])}  TYPE "UNIFF"  DIR "GRAV"  LC ${lc}  FVAL ${fmt(ld.w)}`)
    } else if (ld.kind === 'member-point') {
      const l = lineOf.get(ld.member)
      if (l) ln.push(`  LINELOAD  ${q(l.name)}  ${q(storyName[l.story])}  TYPE "POINTF"  DIR "GRAV"  LC ${lc}  FVAL ${fmt(ld.P)}  RDIST ${fmt(l.swapped ? 1 - ld.t : ld.t)}`)
    } else if (ld.kind === 'area') {
      const a = areaOf.get(ld.plate)
      if (a) ar.push(`  AREALOAD  ${q(a.name)}  ${q(storyName[a.story])}  TYPE "UNIFF"  DIR "GRAV"  LC ${lc}  FVAL ${fmt(ld.q)}`)
    } else if (ld.kind === 'member-thermal') thermal++
  }
  if (pt.length) L.push('', '$ POINT OBJECT LOADS', ...pt)
  if (ln.length) L.push('', '$ FRAME OBJECT LOADS', ...ln)
  if (ar.length) L.push('', '$ SHELL OBJECT LOADS', ...ar)
  if (thermal) warnings.push(`${thermal} temperature load(s) are not exported — apply them as frame temperature loads in ETABS.`)

  // ── NSCP §203.3.1 combinations over the categories present ──
  const combos: string[] = []
  const seen = new Set<string>()
  for (const c of nscpCombos(1.0)) {
    const terms = cats.map((cat) => [cat, c.f[cat] ?? 0] as const).filter(([, f]) => f > 0)
    const k = terms.map(([cat, f]) => `${cat}${f}`).join(',')
    if (!terms.length || seen.has(k)) continue
    seen.add(k)
    const nm = q(c.name)
    combos.push(`  COMBO ${nm}  TYPE "Linear Add"`)
    for (const [cat, f] of terms) combos.push(`  COMBO ${nm}  LOADCASE ${q(PATTERN[cat][0])}  SF ${fmt(f)}`)
  }
  if (combos.length) L.push('', '$ LOAD COMBINATIONS', ...combos)

  L.push('', '$ END OF MODEL FILE', '')
  return { text: L.join('\n'), warnings }
}
