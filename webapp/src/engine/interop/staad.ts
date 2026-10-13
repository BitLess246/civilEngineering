// ─────────────────────────────────────────────────────────────────────────
// STAAD.Pro interchange — export a StructuralModel as a `.std` input deck and
// read one back. Pure text ⇄ data; no DOM, no I/O.
//
// Units: the deck is written in UNIT METER KN (lengths m, forces kN, pressures
// kN/m², E kN/m², density kN/m³). On import every UNIT command in the file is
// honoured and converted back to the model's own units (geometry m, sections
// mm, loads kN, kN/m, kPa).
//
// WHAT TRAVELS, AND HOW
//  · Both programs are Y-up, so coordinates go across unchanged.
//  · Section depth h is STAAD's YD (local y), width b is ZD. A rolled steel
//    shape goes out as PRIS AX/IX/IY/IZ/AY/AZ from the SAME `sectionProps` the
//    solver uses, so STAAD analyses the stiffness Zeta analysed. A `*ZETA-SECTION`
//    comment above each property line carries the full section JSON (fc, bars,
//    shape name, timber grade…), which STAAD ignores and the importer restores.
//  · BETA is the local-axis rotation measured from each program's default.
//    Both defaults put a vertical member's local y on global X and a horizontal
//    member's local y on global Y, so BETA = axisRotation − default.
//  · Slabs: with shell elements ON the panels go out as ELEMENT INCIDENCES SHELL
//    with their area loads as ELEMENT LOAD PR GY. With shells OFF, Zeta carries
//    a slab as a LOAD on its edge beams (tributary distribution), not as
//    stiffness; the deck reproduces exactly that — the bridge's tributary
//    trapezoids go out as MEMBER LOAD TRAP GY between `*ZETA-TRIB` markers and
//    the panels themselves ride as `*ZETA-PLATE` comments. A re-import restores
//    the panels and their area loads and skips the expanded trapezoids, so the
//    load is never counted twice.
//  · Loads: one primary case per category, with STAAD's LOADTYPE; LOAD COMB
//    cases are the NSCP §203.3.1 combinations over the categories present.
//
// WHAT DOES NOT, STATED RATHER THAN DROPPED (returned as warnings)
//  · Mesh subdivision (shellSubdiv > 1): STAAD gets the panel corners; mesh it
//    there. Openings are not cut. Rigid floor diaphragm and automatic rigid end
//    zones are Zeta analysis switches with no direct STAAD equivalent.
//  · On import: triangular elements, load generators (FLOOR LOAD, WIND/SEISMIC
//    definitions, REPEAT LOAD), member moments, partial or trapezoidal member
//    loads (approximated by point loads — Zeta's line load is full-length), and
//    member loads in a direction Zeta's gravity line load cannot carry (turned
//    into their simple-span end reactions).
// ─────────────────────────────────────────────────────────────────────────
import type {
  StructuralModel, RectSection, Member, Plate, NodeSupport, ModelLoad, MemberReleases, Node,
} from '../model'
import type { LoadCategory } from '../beamAnalysis'
import { nscpCombos } from '../beamAnalysis'
import { sectionProps, modelToFrame3D } from '../modelBridge'
import { defaultAxisRotation } from '../frame3d'
import { shapeByName, sectionBoundingBox, AISC_SHAPES } from '../aiscSections'
import { GAMMA_C, GAMMA_S, sectionGamma } from '../modelBuilder'

export interface StaadExport { text: string; warnings: string[] }
export interface StaadCombo { id: number; title: string; factors: Record<number, number> }
export interface StaadImport {
  model: StructuralModel
  warnings: string[]
  /** LOAD COMB cases read from the deck. Informational: Zeta re-derives the
   *  NSCP §203 combinations from load categories. */
  combos: StaadCombo[]
}

const CAT_ORDER: LoadCategory[] = ['D', 'L', 'Lr', 'S', 'R', 'W', 'E', 'T']
const LOADTYPE: Record<LoadCategory, string> = {
  D: 'DEAD', L: 'LIVE', Lr: 'ROOF LIVE', S: 'SNOW', R: 'RAIN', W: 'WIND', E: 'SEISMIC', T: 'TEMPERATURE',
}
const CAT_TITLE: Record<LoadCategory, string> = {
  D: 'DEAD', L: 'LIVE', Lr: 'ROOF LIVE', S: 'SNOW', R: 'RAIN', W: 'WIND', E: 'EARTHQUAKE', T: 'TEMPERATURE',
}
const WIDTH = 79   // STAAD's INPUT WIDTH 79 — the narrowest it reads

/** Six significant figures, no trailing zeros, no exponent below 1e-4. */
export function fmt(v: number): string {
  if (!Number.isFinite(v) || Math.abs(v) < 1e-12) return '0'
  const a = Math.abs(v)
  if (a >= 1e-4 && a < 1e7) return String(parseFloat(v.toPrecision(6)))
  return v.toExponential(5).replace(/\.?0+e/, 'e').toUpperCase()
}

/** Compress sorted ints into STAAD list tokens: [1,2,3,5] → ['1','TO','3','5']. */
export function listTokens(nums: number[]): string[] {
  const s = [...new Set(nums)].sort((a, b) => a - b)
  const out: string[] = []
  for (let k = 0; k < s.length;) {
    let e = k
    while (e + 1 < s.length && s[e + 1] === s[e] + 1) e++
    if (e - k >= 2) out.push(String(s[k]), 'TO', String(s[e]))
    else for (let q = k; q <= e; q++) out.push(String(s[q]))
    k = e + 1
  }
  return out
}

/** Lay tokens out ≤ WIDTH per line with STAAD's trailing-hyphen continuation. */
function wrap(tokens: string[]): string[] {
  const lines: string[] = []
  let cur = ''
  for (const t of tokens) {
    if (cur && cur.length + 1 + t.length > WIDTH - 2) { lines.push(cur + ' -'); cur = t }
    else cur = cur ? `${cur} ${t}` : t
  }
  if (cur) lines.push(cur)
  return lines
}

/** `;`-separated records, packed to the line width. */
function packRecords(records: string[]): string[] {
  const lines: string[] = []
  let cur = ''
  for (const r of records) {
    if (cur && cur.length + 2 + r.length > WIDTH) { lines.push(cur); cur = r }
    else cur = cur ? `${cur}; ${r}` : r
  }
  if (cur) lines.push(cur)
  return lines
}

/** Group items by a spec string; emit `<list> <spec>` lines. */
function grouped(groups: Map<string, number[]>): string[] {
  const out: string[] = []
  for (const [spec, ids] of groups) out.push(...wrap([...listTokens(ids), ...spec.split(' ')]))
  return out
}
const push = (m: Map<string, number[]>, k: string, id: number) => {
  const a = m.get(k)
  if (a) a.push(id); else m.set(k, [id])
}

const dirOf = (a: Node, b: Node): [number, number, number] => [b.x - a.x, b.y - a.y, b.z - a.z]

/** Section JSON minus identity — members sharing it share a STAAD property line. */
function sectionTemplate(s: RectSection): string {
  const { id: _id, name: _name, ...rest } = s
  return JSON.stringify(rest)
}

// ─── EXPORT ──────────────────────────────────────────────────────────────

export function toStaad(model: StructuralModel): StaadExport {
  const warnings: string[] = []
  const L: string[] = []
  const shells = !!model.shellElements
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]))
  const secById = new Map(model.sections.map((s) => [s.id, s]))

  const jn = new Map<string, number>()
  model.nodes.forEach((n, k) => jn.set(n.id, k + 1))
  const members = model.members.filter((m) => jn.has(m.i) && jn.has(m.j) && secById.has(m.section))
  if (members.length < model.members.length)
    warnings.push(`${model.members.length - members.length} member(s) reference a missing node or section and were left out.`)
  const mn = new Map<string, number>()
  members.forEach((m, k) => mn.set(m.id, k + 1))
  const plates = model.plates.filter((p) => p.corners.every((c) => jn.has(c)))
  const en = new Map<string, number>()
  plates.forEach((p, k) => en.set(p.id, members.length + k + 1))   // STAAD numbers members and elements in one space

  L.push('STAAD SPACE')
  L.push('START JOB INFORMATION')
  L.push(`JOB NAME ${(model.name || 'Zeta model').replace(/[;\r\n]/g, ' ').slice(0, 60)}`)
  L.push('END JOB INFORMATION')
  L.push('* Exported from Zeta. Units: m, kN. Zeta metadata rides in *ZETA- comments,')
  L.push('* which STAAD ignores; they let Zeta read this deck back without loss.')
  L.push(`INPUT WIDTH ${WIDTH}`)
  L.push('UNIT METER KN')

  L.push('JOINT COORDINATES')
  L.push(...packRecords(model.nodes.map((n) => `${jn.get(n.id)} ${fmt(n.x)} ${fmt(n.y)} ${fmt(n.z)}`)))
  if (members.length) {
    L.push('MEMBER INCIDENCES')
    L.push(...packRecords(members.map((m) => `${mn.get(m.id)} ${jn.get(m.i)} ${jn.get(m.j)}`)))
  }

  // Panels: their Zeta-only fields always ride as metadata; geometry goes out
  // as shell elements only when Zeta analyses them as shells.
  for (const p of plates) {
    const { id: _id, corners, ...rest } = p
    L.push(`*ZETA-PLATE ${JSON.stringify({ n: en.get(p.id), c: corners.map((c) => jn.get(c)), ...rest })}`)
  }
  if (shells && plates.length) {
    L.push('ELEMENT INCIDENCES SHELL')
    L.push(...packRecords(plates.map((p) => `${en.get(p.id)} ${p.corners.map((c) => jn.get(c)).join(' ')}`)))
    L.push('ELEMENT PROPERTY')
    const th = new Map<string, number[]>()
    for (const p of plates) push(th, `THICKNESS ${fmt(p.thickness / 1000)}`, en.get(p.id)!)
    L.push(...grouped(th))
    if ((model.shellSubdiv ?? 1) > 1)
      warnings.push(`Shell mesh subdivision ${model.shellSubdiv}×${model.shellSubdiv} is not exported — each panel goes out as one element on its corners; mesh it in STAAD.`)
  } else if (plates.length) {
    warnings.push('Slab panels are analysed in Zeta by tributary distribution (shell elements off), so they go out as member TRAP loads on their edge beams, not as plate elements — the same load path Zeta solved.')
  }
  if (plates.some((p) => p.openings?.length))
    warnings.push('Slab openings are not cut in the STAAD model (kept as Zeta metadata only).')

  // Materials — one per distinct (kind, E).
  interface Mat { name: string; E: number; nu: number; density: number; alpha: number; type: string; strength?: string }
  const mats = new Map<string, Mat>()
  const matOf = (s: RectSection): Mat => {
    const kind = s.material ?? 'concrete'
    const { E } = sectionProps(s)                    // MPa
    const key = `${kind}|${E.toFixed(1)}|${kind === 'steel' ? s.steelFy ?? 248 : ''}`
    let m = mats.get(key)
    if (!m) {
      const k = [...mats.values()].filter((q) => q.type === kind).length
      if (kind === 'steel') m = { name: `STEEL${k ? k + 1 : ''}`, E: E * 1000, nu: 0.3, density: GAMMA_S, alpha: 1.2e-5, type: 'STEEL', strength: `FY ${fmt((s.steelFy ?? 248) * 1000)} FU ${fmt((s.steelFu ?? 400) * 1000)}` }
      else if (kind === 'wood') m = { name: `TIMBER${k + 1}`, E: E * 1000, nu: 0.3, density: sectionGamma(s), alpha: 5e-6, type: 'TIMBER' }
      else {
        const base = `CONC${Math.round(s.fc)}`
        const nm = [...mats.values()].some((q) => q.name === base) ? `${base}_${k + 1}` : base
        m = { name: nm, E: E * 1000, nu: 0.2, density: GAMMA_C, alpha: 1e-5, type: 'CONCRETE', strength: `FCU ${fmt(s.fc * 1000)}` }
      }
      mats.set(key, m)
    }
    return m
  }
  const matMembers = new Map<string, number[]>()
  for (const m of members) push(matMembers, matOf(secById.get(m.section)!).name, mn.get(m.id)!)
  if (shells && plates.length) {
    const fc = model.sections.find((s) => (s.material ?? 'concrete') === 'concrete')?.fc ?? 28
    const pm = matOf({ id: '', name: '', b: 1, h: 1, fc, fy: 0, barDia: 0, tieDia: 0, cover: 0 })
    for (const p of plates) push(matMembers, pm.name, en.get(p.id)!)
  }
  if (mats.size) {
    L.push('DEFINE MATERIAL START')
    for (const m of mats.values()) {
      L.push(`ISOTROPIC ${m.name}`, `E ${fmt(m.E)}`, `POISSON ${fmt(m.nu)}`, `DENSITY ${fmt(m.density)}`,
        `ALPHA ${fmt(m.alpha)}`, `DAMP 0.05`, `TYPE ${m.type}`)
      if (m.strength) L.push(`STRENGTH ${m.strength}`)
    }
    L.push('END DEFINE MATERIAL')
  }

  // Member properties, one line per distinct section template.
  if (members.length) {
    L.push('MEMBER PROPERTY')
    const groups = new Map<string, number[]>()
    for (const m of members) push(groups, sectionTemplate(secById.get(m.section)!), mn.get(m.id)!)
    for (const [tmpl, ids] of groups) {
      const s = JSON.parse(tmpl) as Omit<RectSection, 'id' | 'name'>
      const name = secById.get(members[ids[0] - 1].section)!.name
      L.push(`*ZETA-SECTION ${JSON.stringify({ name, ...s })}`)
      let spec: string
      if (s.material === 'steel' && s.shape && shapeByName(s.shape)) {
        const p = sectionProps(s as RectSection)
        const m2 = 1e-6, m4 = 1e-12
        spec = `PRIS AX ${fmt(p.A * m2)} IX ${fmt(p.J * m4)} IY ${fmt(p.Iy * m4)} IZ ${fmt(p.Iz * m4)} AY ${fmt(p.Asy * m2)} AZ ${fmt(p.Asz * m2)}`
        L.push(`* ${s.shape}`)
      } else spec = `PRIS YD ${fmt(s.h / 1000)} ZD ${fmt(s.b / 1000)}`
      L.push(...wrap([...listTokens(ids), ...spec.split(' ')]))
    }
  }

  // Constants: materials and BETA.
  if (mats.size) {
    L.push('CONSTANTS')
    for (const [name, ids] of matMembers) L.push(...wrap(['MATERIAL', name, 'MEMB', ...listTokens(ids)]))
    const betas = new Map<string, number[]>()
    for (const m of members) {
      if (m.axisRotation === undefined) continue
      const d = dirOf(nodeById.get(m.i)!, nodeById.get(m.j)!)
      const beta = m.axisRotation - defaultAxisRotation(d)
      if (Math.abs(beta) > 1e-9) push(betas, fmt(beta), mn.get(m.id)!)
    }
    for (const [b, ids] of betas) L.push(...wrap(['BETA', b, 'MEMB', ...listTokens(ids)]))
  }

  // Releases: explicit flags plus 'simple' connections (pin = My, Mz free).
  const rel = new Map<string, number[]>()
  for (const m of members) {
    for (const [end, tag] of [['iEnd', 'START'], ['jEnd', 'END']] as const) {
      const f = { ...(m.releases?.[end] ?? {}) }
      if (m.connections?.[end] === 'simple') { f.My = true; f.Mz = true }
      const dofs = (['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'] as const).filter((k) => f[k]).map((k) => k.toUpperCase())
      if (dofs.length) push(rel, `${tag} ${dofs.join(' ')}`, mn.get(m.id)!)
    }
  }
  if (rel.size) { L.push('MEMBER RELEASE'); L.push(...grouped(rel)) }

  const off: string[] = []
  for (const m of members) {
    for (const [end, tag] of [['iEnd', 'START'], ['jEnd', 'END']] as const) {
      const o = m.offsets?.[end]
      if (o && o.some((v) => Math.abs(v) > 1e-12)) off.push(`${mn.get(m.id)} ${tag} ${o.map(fmt).join(' ')}`)
    }
  }
  if (off.length) { L.push('MEMBER OFFSET'); L.push(...off) }

  for (const mode of ['tension-only', 'compression-only'] as const) {
    const ids = members.filter((m) => m.axialMode === mode).map((m) => mn.get(m.id)!)
    if (ids.length) { L.push(mode === 'tension-only' ? 'MEMBER TENSION' : 'MEMBER COMPRESSION'); L.push(...wrap(listTokens(ids))) }
  }

  // Supports.
  const sup = new Map<string, number[]>()
  for (const s of model.supports) {
    const j = jn.get(s.node)
    if (!j) continue
    if (s.fixity === 'fixed') push(sup, 'FIXED', j)
    else if (s.fixity === 'spring') {
      const ks = ([['FX', 'KFX', s.kx], ['FY', 'KFY', s.ky], ['FZ', 'KFZ', s.kz]] as const)
      const freed = ks.filter(([, , k]) => !(k && k > 0)).map(([f]) => f)
      const springs = ks.filter(([, , k]) => k && k > 0).map(([, kf, k]) => `${kf} ${fmt(k!)}`)
      push(sup, ['FIXED', 'BUT', ...freed, 'MX', 'MY', 'MZ', ...springs].join(' '), j)
    } else push(sup, 'PINNED', j)   // the bridge analyses a roller as a pin
  }
  if (model.supports.some((s) => s.fixity === 'roller'))
    warnings.push('Roller supports are written as PINNED — Zeta analyses a roller as a pin, so STAAD solves the same restraint.')
  if (sup.size) { L.push('SUPPORTS'); L.push(...grouped(sup)) }

  if (model.rigidEndZones) warnings.push('Automatic rigid end zones are a Zeta analysis switch; STAAD gets clear spans unless you add MEMBER OFFSETs there.')
  if (model.diaphragm) warnings.push('The rigid floor diaphragm is not exported — define FLOOR DIAPHRAGM in STAAD if you want it.')

  // Loads. Area loads on non-shell panels expand through the bridge's own
  // tributary distribution so STAAD carries Zeta's load path, not a re-guess.
  const trib = new Map<LoadCategory, string[]>()
  if (!shells) {
    const areaOnly: StructuralModel = { ...model, loads: model.loads.filter((l) => l.kind === 'area') }
    if (areaOnly.loads.length) {
      const br = modelToFrame3D(areaOnly, { useShells: false })
      for (const ld of br.loads) {
        if (ld.kind !== 'member-vdl' && ld.kind !== 'member-udl' && ld.kind !== 'member-point') continue
        const m = mn.get(ld.member)
        if (!m) continue
        const list = trib.get(ld.cat) ?? []
        if (ld.kind === 'member-vdl')
          list.push(Math.abs(ld.w1 - ld.w2) < 1e-9
            ? `${m} UNI GY ${fmt(-ld.w1)} ${fmt(ld.x1)} ${fmt(ld.x2)}`
            : `${m} TRAP GY ${fmt(-ld.w1)} ${fmt(-ld.w2)} ${fmt(ld.x1)} ${fmt(ld.x2)}`)
        else if (ld.kind === 'member-udl') list.push(`${m} UNI GY ${fmt(-ld.w)}`)
        else if (ld.kind === 'member-point') list.push(`${m} CON GY ${fmt(-ld.P)} ${fmt(ld.a)}`)
        trib.set(ld.cat, list)
      }
    }
  }

  const cats = CAT_ORDER.filter((c) => model.loads.some((l) => l.cat === c))
  const caseNo = new Map<LoadCategory, number>()
  cats.forEach((c, k) => caseNo.set(c, k + 1))
  const alphaWarn = new Set<string>()
  for (const cat of cats) {
    const lds = model.loads.filter((l) => l.cat === cat)
    L.push(`LOAD ${caseNo.get(cat)} LOADTYPE ${LOADTYPE[cat]} TITLE ${CAT_TITLE[cat]}`)
    const joint = new Map<string, number[]>()
    const memb = new Map<string, number[]>()
    const elem = new Map<string, number[]>()
    const temp = new Map<string, number[]>()
    const meta: string[] = []
    for (const ld of lds) {
      if (ld.kind === 'node') {
        const j = jn.get(ld.node)
        const f = ([['FX', ld.Fx], ['FY', ld.Fy], ['FZ', ld.Fz]] as const).filter(([, v]) => v && Math.abs(v) > 1e-12)
        if (j && f.length) push(joint, f.map(([k, v]) => `${k} ${fmt(v!)}`).join(' '), j)
      } else if (ld.kind === 'member-udl') {
        const m = mn.get(ld.member)
        if (m) push(memb, `UNI GY ${fmt(-ld.w)}`, m)
      } else if (ld.kind === 'member-point') {
        const mm = members.find((q) => q.id === ld.member)
        const m = mm && mn.get(mm.id)
        if (!m) continue
        const a = nodeById.get(mm.i)!, b = nodeById.get(mm.j)!
        push(memb, `CON GY ${fmt(-ld.P)} ${fmt(ld.t * Math.hypot(...dirOf(a, b)))}`, m)
      } else if (ld.kind === 'area') {
        const e = en.get(ld.plate)
        if (!e) continue
        if (shells) push(elem, `PR GY ${fmt(-ld.q)}`, e)
        else meta.push(`*ZETA-AREA ${e} ${fmt(ld.q)}`)
      } else if (ld.kind === 'member-thermal') {
        const m = mn.get(ld.member)
        if (!m) continue
        push(temp, `TEMP ${fmt(ld.deltaT)}`, m)
        const mat = matOf(secById.get(members[m - 1].section)!)
        if (Math.abs(ld.alpha - mat.alpha) > 1e-12) alphaWarn.add(`${fmt(ld.alpha)} vs ${mat.name} ALPHA ${fmt(mat.alpha)}`)
      }
    }
    const tr = trib.get(cat) ?? []
    if (joint.size) { L.push('JOINT LOAD'); L.push(...grouped(joint)) }
    if (memb.size || tr.length) {
      L.push('MEMBER LOAD')
      L.push(...grouped(memb))
      if (tr.length) { L.push(...meta, '*ZETA-TRIB-BEGIN', ...tr, '*ZETA-TRIB-END') }
    } else L.push(...meta)
    if (elem.size) { L.push('ELEMENT LOAD'); L.push(...grouped(elem)) }
    if (temp.size) { L.push('TEMPERATURE LOAD'); L.push(...grouped(temp)) }
  }
  if (alphaWarn.size)
    warnings.push(`STAAD takes the thermal coefficient from the material, not the load: ${[...alphaWarn].join('; ')}.`)

  // NSCP §203.3.1 combinations over the categories present.
  let cn = 101
  const seen = new Set<string>()
  for (const c of nscpCombos(1.0)) {
    const terms = cats.map((cat) => [cat, c.f[cat] ?? 0] as const).filter(([, f]) => f > 0)
    const key = terms.map(([cat, f]) => `${cat}${f}`).join(',')
    if (!terms.length || seen.has(key)) continue
    seen.add(key)
    L.push(`LOAD COMB ${cn++} ${c.name.replace(/[;\r\n]/g, ' ')}`)
    L.push(...wrap(terms.flatMap(([cat, f]) => [String(caseNo.get(cat)), fmt(f)])))
  }

  L.push('PERFORM ANALYSIS PRINT STATICS CHECK')
  L.push('FINISH')
  return { text: L.join('\n') + '\n', warnings }
}

// ─── IMPORT ──────────────────────────────────────────────────────────────

const LEN: Record<string, number> = {
  INCHES: 0.0254, INCH: 0.0254, INC: 0.0254, IN: 0.0254, FEET: 0.3048, FOOT: 0.3048, FT: 0.3048, FEE: 0.3048,
  CM: 0.01, CMS: 0.01, METER: 1, METERS: 1, METRE: 1, MET: 1, M: 1, MMS: 0.001, MM: 0.001, MILLIMETER: 0.001,
  KM: 1000, DME: 0.1,
}
const FORCE: Record<string, number> = {
  KN: 1, KNS: 1, KILONEWTON: 1, NEWTON: 0.001, NEWTONS: 0.001, NEW: 0.001, N: 0.001, MNS: 1000, MN: 1000,
  KIP: 4.4482216, KIPS: 4.4482216, POUND: 0.0044482216, POUNDS: 0.0044482216, LBS: 0.0044482216, LB: 0.0044482216,
  MTON: 9.80665, MTONS: 9.80665, KG: 0.00980665, KGS: 0.00980665, DNS: 0.01,
}

/** Imperial → metric W depth series (catalogue names are metric). */
const W_SERIES: Record<string, string> = {
  4: '100', 5: '130', 6: '150', 8: '200', 10: '250', 12: '310', 14: '360', 16: '410', 18: '460',
  21: '530', 24: '610', 27: '690', 30: '760', 33: '840', 36: '920', 40: '1000', 44: '1100',
}

/** Resolve a STAAD steel-table name to a catalogue shape: the metric name as
 *  written, or an imperial W (W12X26) by depth series and mass (lb/ft·1.48816). */
export function resolveSteelName(raw: string) {
  const name = raw.toUpperCase().replace(/^ST\s*/, '')
  const direct = shapeByName(name.replace(/X/g, 'x')) ?? shapeByName(name)
  if (direct) return direct
  const w = /^W(\d+)X([\d.]+)$/.exec(name)
  if (w && W_SERIES[w[1]]) {
    const kg = parseFloat(w[2]) * 1.48816
    let best: (typeof AISC_SHAPES)[number] | undefined, err = Infinity
    for (const s of AISC_SHAPES) {
      if (s.family !== 'W' || !s.name.startsWith(`W${W_SERIES[w[1]]}x`)) continue
      const e = Math.abs(parseFloat(s.name.split('x')[1]) / kg - 1)
      if (e < err) { err = e; best = s }
    }
    if (best && err < 0.03) return best
  }
  return undefined
}

const isNum = (t: string | undefined) => t !== undefined && /^[-+]?(\d+\.?\d*|\.\d+)(E[-+]?\d+)?$/i.test(t)
const kw = (t: string | undefined, word: string) => !!t && t.length >= Math.min(4, word.length) && word.startsWith(t)

interface Rec { t: string[]; raw: string; meta?: string }

/** Comment stripping, hyphen continuation and `;` record splitting. */
function records(text: string): Rec[] {
  const out: Rec[] = []
  let carry = ''
  for (const line0 of text.split(/\r?\n/)) {
    const line = line0.trim()
    if (!line) continue
    if (line.startsWith('*')) {
      if (line.startsWith('*ZETA-')) out.push({ t: [], raw: line, meta: line.slice(1) })
      continue
    }
    const body = line
    if (/(^|\s)-$/.test(body)) { carry += body.slice(0, -1) + ' '; continue }
    const full = carry + body
    carry = ''
    for (const r of full.split(';')) {
      const raw = r.trim()
      if (raw) out.push({ t: raw.toUpperCase().split(/\s+/), raw })
    }
  }
  if (carry.trim()) out.push({ t: carry.trim().toUpperCase().split(/\s+/), raw: carry.trim() })
  return out
}

/** Read a STAAD list (n, n TO m [BY k], ALL) from t[i]; returns ids and next index. */
function readList(t: string[], i: number, all: () => number[]): [number[], number] {
  const ids: number[] = []
  if (t[i] === 'LIST') i++
  if (t[i] === 'ALL') return [all(), i + 1]
  while (i < t.length && isNum(t[i]) && Number.isInteger(+t[i])) {
    const a = +t[i]
    if (t[i + 1] === 'TO' && isNum(t[i + 2])) {
      const b = +t[i + 2]
      let step = 1, nx = i + 3
      if (t[nx] === 'BY' && isNum(t[nx + 1])) { step = Math.max(1, +t[nx + 1]); nx += 2 }
      for (let k = a; k <= b; k += step) ids.push(k)
      i = nx
    } else { ids.push(a); i++ }
  }
  return [ids, i]
}

type Prop =
  | { kind: 'pris'; yd: number; zd?: number }                       // m
  | { kind: 'props'; ax: number; iz: number; iy?: number }          // m², m⁴
  | { kind: 'table'; name: string }
/** STAAD's built-in materials (kN, m), for decks that name one without DEFINE MATERIAL. */
const BUILTIN_MAT: Record<string, StaadMat> = {
  STEEL: { E: 2.05e8, nu: 0.3, density: 76.8195, alpha: 1.2e-5, type: 'STEEL' },
  CONCRETE: { E: 2.17185e7, nu: 0.17, density: 23.5616, alpha: 1e-5, type: 'CONCRETE' },
}
interface StaadMat { E?: number; nu?: number; density?: number; alpha?: number; type?: string; fcu?: number; fy?: number; fu?: number }

export function fromStaad(text: string, opts?: { name?: string }): StaadImport {
  const warnings = new Set<string>()
  const warn = (s: string) => warnings.add(s)
  let name = opts?.name || 'STAAD import'   // a JOB NAME or STAAD SPACE title overrides
  let lf = 1, ff = 1                                   // → m, kN

  const joints = new Map<number, Node>()
  const membs = new Map<number, [number, number]>()
  const elems = new Map<number, number[]>()
  const thick = new Map<number, number>()             // m
  const props = new Map<number, Prop>()
  const propMeta = new Map<number, Omit<RectSection, 'id'>>()
  const mats = new Map<string, StaadMat>()
  const matOf = new Map<number, string>()
  const beta = new Map<number, number>()
  const releases = new Map<number, MemberReleases>()
  const offsets = new Map<number, { iEnd?: [number, number, number]; jEnd?: [number, number, number] }>()
  const axial = new Map<number, 'tension-only' | 'compression-only'>()
  const supports = new Map<number, NodeSupport>()
  const plateMeta = new Map<number, { c?: number[] } & Partial<Plate>>()
  const combos: StaadCombo[] = []

  // load cases: raw Zeta loads keyed on STAAD numbers, category resolved at the end
  interface Case { id: string; cat: LoadCategory; loads: ModelLoad[] }
  const cases: Case[] = []
  const refs = new Map<string, ModelLoad[]>()
  let cur: ModelLoad[] | null = null
  const catSeen = new Map<LoadCategory, string[]>()

  const allMembers = () => [...membs.keys()]
  const allElems = () => [...elems.keys()]
  const allJoints = () => [...joints.keys()]
  const mLen = (m: number) => {
    const ij = membs.get(m), a = ij && joints.get(ij[0]), b = ij && joints.get(ij[1])
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) : 0
  }
  const vertical = (m: number) => {
    const ij = membs.get(m)!, a = joints.get(ij[0])!, b = joints.get(ij[1])!
    const Lm = mLen(m)
    return Lm > 0 && Math.abs(b.y - a.y) / Lm > 0.999
  }
  const horizontal = (m: number) => {
    const ij = membs.get(m)!, a = joints.get(ij[0])!, b = joints.get(ij[1])!
    const Lm = mLen(m)
    return Lm > 0 && Math.abs(b.y - a.y) / Lm < 1e-6
  }

  let block = ''
  let pendingSection: Omit<RectSection, 'id'> | null = null
  let inTrib = false
  let job = false, refDef = false
  let combo: StaadCombo | null = null
  let curMat: StaadMat | null = null

  const mId = (m: number) => `M${m}`
  const pId = (e: number) => `P${e}`

  /** Gravity member load w(x) from x1→x2 (m), kN/m positive DOWN. */
  const lineLoad = (m: number, w1: number, w2: number, x1: number, x2: number) => {
    const Lm = mLen(m)
    if (!cur || Lm <= 0) return
    x1 = Math.max(0, Math.min(Lm, x1)); x2 = Math.max(x1, Math.min(Lm, x2))
    if (x2 - x1 < 1e-9) return
    if (x1 < 1e-6 * Lm && x2 > Lm * (1 - 1e-6) && Math.abs(w1 - w2) < 1e-9 * Math.max(1, Math.abs(w1))) {
      cur.push({ kind: 'member-udl', member: mId(m), w: w1, cat: 'D' })
      return
    }
    // Zeta's line load is full-length: a partial or varying one becomes ten
    // point loads, each the exact resultant of its slice at that slice's centroid.
    warn('Partial or trapezoidal member loads are approximated by ten point loads each (exact resultant per slice) — Zeta line loads are full-length uniform.')
    const n = 10, d = (x2 - x1) / n
    for (let k = 0; k < n; k++) {
      const a = x1 + k * d, b = a + d
      const wa = w1 + (w2 - w1) * (a - x1) / (x2 - x1), wb = w1 + (w2 - w1) * (b - x1) / (x2 - x1)
      const P = (wa + wb) / 2 * d
      if (Math.abs(P) < 1e-12) continue
      const xc = Math.abs(wa + wb) > 1e-12 ? a + d * (wa + 2 * wb) / (3 * (wa + wb)) : (a + b) / 2
      cur.push({ kind: 'member-point', member: mId(m), t: xc / Lm, P, cat: 'D' })
    }
  }
  /** A member force Zeta can't carry as a gravity load → its simple-span end reactions. */
  const asEndForces = (m: number, F: [number, number, number], x: number) => {
    const Lm = mLen(m), ij = membs.get(m)
    if (!cur || !ij || Lm <= 0) return
    const r = Math.max(0, Math.min(1, x / Lm))
    for (const [node, share] of [[ij[0], 1 - r], [ij[1], r]] as const) {
      if (share < 1e-12) continue
      cur.push({ kind: 'node', node: `N${node}`, Fx: F[0] * share, Fy: F[1] * share, Fz: F[2] * share, cat: 'D' })
    }
    warn('Member loads acting along GX/GZ (or local axes of non-horizontal members) are applied as their simple-span end reactions at the joints.')
  }

  const sectionArea = (m: number): number => {   // m²
    const p = props.get(m)
    if (!p) return 0
    if (p.kind === 'pris') return p.zd !== undefined ? p.yd * p.zd : Math.PI * p.yd ** 2 / 4
    if (p.kind === 'props') return p.ax
    return (resolveSteelName(p.name)?.A ?? 0) / 1e6
  }
  const densityOf = (id: number, steelish: boolean) => {
    const mt = matOf.get(id), d = mt ? mats.get(mt)?.density : undefined
    return d ?? (steelish ? GAMMA_S : GAMMA_C)
  }

  for (const r of records(text)) {
    const t = r.t
    if (r.meta) {
      const sp = r.meta.indexOf(' ')
      const tag = sp < 0 ? r.meta : r.meta.slice(0, sp), body = sp < 0 ? '' : r.meta.slice(sp + 1)
      try {
        if (tag === 'ZETA-SECTION') pendingSection = JSON.parse(body)
        else if (tag === 'ZETA-PLATE') { const p = JSON.parse(body); plateMeta.set(p.n, p) }
        else if (tag === 'ZETA-TRIB-BEGIN') inTrib = true
        else if (tag === 'ZETA-TRIB-END') inTrib = false
        else if (tag === 'ZETA-AREA' && cur) {
          const [e, q] = body.split(/\s+/).map(Number)
          cur.push({ kind: 'area', plate: pId(e), q, cat: 'D' })
        }
      } catch { warn('A *ZETA- metadata line could not be read and was ignored.') }
      continue
    }
    const t0 = t[0], t1 = t[1]
    if (job) { if (t0 === 'END' && kw(t[1], 'JOB')) job = false; else if (t0 === 'JOB' && t1 === 'NAME') name = r.raw.slice(r.raw.toUpperCase().indexOf('NAME') + 4).trim() || name; continue }

    // ── data records for the open block ──
    const data = isNum(t0) || t0 === 'ALL' || t0 === 'LIST'
    if (data || (block === 'refload' && /^R\d+$/.test(t0)) || (block === 'comb' && isNum(t0))) {
      switch (block) {
        case 'joints': {
          if (t.length >= 4) joints.set(+t[0], { id: `N${+t[0]}`, x: +t[1] * lf, y: +t[2] * lf, z: +t[3] * lf })
          break
        }
        case 'members': if (t.length >= 3) membs.set(+t[0], [+t[1], +t[2]]); break
        case 'elements': {
          const ns = t.slice(1).filter(isNum).map(Number)
          if (ns.length >= 3) elems.set(+t[0], ns.slice(0, 4))
          break
        }
        case 'eprop': {
          const [ids, i] = readList(t, 0, allElems)
          if (kw(t[i], 'THICKNESS') || t[i] === 'TH') for (const e of ids) thick.set(e, +t[i + 1] * lf)
          break
        }
        case 'mprop': {
          const [ids, i] = readList(t, 0, allMembers)
          let p: Prop | null = null
          if (kw(t[i], 'PRISMATIC')) {
            const v = (k: string) => { const q = t.indexOf(k, i); return q > 0 && isNum(t[q + 1]) ? +t[q + 1] : undefined }
            const yd = v('YD'), zd = v('ZD'), ax = v('AX'), iz = v('IZ'), iy = v('IY')
            if (yd !== undefined) p = { kind: 'pris', yd: yd * lf, zd: zd !== undefined ? zd * lf : undefined }
            else if (ax !== undefined && iz !== undefined) p = { kind: 'props', ax: ax * lf ** 2, iz: iz * lf ** 4, iy: iy !== undefined ? iy * lf ** 4 : undefined }
          } else if (t[i] === 'TA' || kw(t[i], 'TABLE')) {
            const q = t.findIndex((x, k) => k > i && x !== 'ST' && x !== 'D' && x !== 'T' && x !== 'LD' && x !== 'SD')
            if (q > 0) p = { kind: 'table', name: t[q] }
            if (t.slice(i).some((x) => ['D', 'T', 'LD', 'SD', 'BA', 'FR', 'TC', 'BC'].includes(x)) && t[i + 1] !== 'ST')
              warn('Double/built-up steel table specs (D, T, LD, SD …) are read as the single shape.')
          }
          if (!p) { warn(`Unsupported MEMBER PROPERTY spec "${r.raw.slice(0, 60)}" — those members were left without a section.`); break }
          for (const m of ids) { props.set(m, p); if (pendingSection) propMeta.set(m, pendingSection) }
          pendingSection = null
          break
        }
        case 'supports': {
          const [ids, i] = readList(t, 0, allJoints)
          let s: Omit<NodeSupport, 'node'> | null = null
          if (kw(t[i], 'PINNED')) s = { fixity: 'pin' }
          else if (kw(t[i], 'FIXED')) {
            if (t[i + 1] !== 'BUT') s = { fixity: 'fixed' }
            else {
              const rest = t.slice(i + 2)
              const kv = (k: string) => { const q = rest.indexOf(k); return q >= 0 && isNum(rest[q + 1]) ? +rest[q + 1] * ff / lf : undefined }
              const kx = kv('KFX'), ky = kv('KFY'), kz = kv('KFZ')
              const rot = ['MX', 'MY', 'MZ'].every((d) => rest.includes(d))
              const tr = ['FX', 'FY', 'FZ'].filter((d) => rest.includes(d))
              if (kx !== undefined || ky !== undefined || kz !== undefined || tr.length) {
                s = { fixity: 'spring', kx: kx ?? (rest.includes('FX') ? 0 : 1e9), ky: ky ?? (rest.includes('FY') ? 0 : 1e9), kz: kz ?? (rest.includes('FZ') ? 0 : 1e9) }
                if (!rot) warn('Spring supports with fixed rotations are read as translational springs (rotations free), which is how Zeta models a spring.')
              } else if (rot) s = { fixity: 'pin' }
              else { s = { fixity: 'fixed' }; warn('A FIXED BUT support releasing only some rotations was read as FIXED.') }
            }
          } else if (kw(t[i], 'ENFORCED')) { s = { fixity: 'fixed' }; warn('ENFORCED supports were read as FIXED (support displacements are not imported).') }
          if (s) for (const j of ids) supports.set(j, { node: `N${j}`, ...s })
          break
        }
        case 'release': {
          const [ids, i] = readList(t, 0, allMembers)
          const ends = t[i] === 'START' ? ['iEnd'] : t[i] === 'END' ? ['jEnd'] : t[i] === 'BOTH' ? ['iEnd', 'jEnd'] : []
          const dofs = t.slice(i + 1).filter((d) => ['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'].includes(d))
          if (t.slice(i + 1).some((d) => /^KM|^MP$/.test(d))) warn('Partial moment releases (MP/KMX…) were read as full releases.')
          for (const m of ids) {
            const rr = releases.get(m) ?? {}
            for (const e of ends as ('iEnd' | 'jEnd')[]) {
              const f = { ...(rr[e] ?? {}) }
              for (const d of dofs) f[(d[0] + d[1].toLowerCase()) as 'Fx'] = true
              rr[e] = f
            }
            releases.set(m, rr)
          }
          break
        }
        case 'offset': {
          const [ids, i] = readList(t, 0, allMembers)
          const v = t.slice(i + 1, i + 4).filter(isNum).map((x) => +x * lf)
          if (t.includes('LOCAL')) warn('LOCAL member offsets were read as global.')
          while (v.length < 3) v.push(0)
          for (const m of ids) {
            const o = offsets.get(m) ?? {}
            if (t[i] === 'START') o.iEnd = v as [number, number, number]; else if (t[i] === 'END') o.jEnd = v as [number, number, number]
            offsets.set(m, o)
          }
          break
        }
        case 'tension': case 'compression': {
          const [ids] = readList(t, 0, allMembers)
          for (const m of ids) axial.set(m, block === 'tension' ? 'tension-only' : 'compression-only')
          break
        }
        case 'truss': {
          const [ids] = readList(t, 0, allMembers)
          for (const m of ids) releases.set(m, { iEnd: { Mx: true, My: true, Mz: true }, jEnd: { My: true, Mz: true } })
          break
        }
        case 'jointload': {
          if (!cur) break
          const [ids, i] = readList(t, 0, allJoints)
          const v = (k: string) => { const q = t.indexOf(k, i); return q > 0 && isNum(t[q + 1]) ? +t[q + 1] * ff : 0 }
          const F = [v('FX'), v('FY'), v('FZ')]
          if (['MX', 'MY', 'MZ'].some((k) => t.includes(k))) warn('Joint moments are not imported (Zeta joint loads are forces).')
          if (F.every((x) => x === 0)) break
          for (const j of ids) cur.push({ kind: 'node', node: `N${j}`, Fx: F[0], Fy: F[1], Fz: F[2], cat: 'D' })
          break
        }
        case 'memberload': {
          if (!cur || inTrib) break
          const [ids, i] = readList(t, 0, allMembers)
          const type = t[i], dir = t[i + 1]
          const nums = t.slice(i + 2).filter(isNum).map(Number)
          if (!['UNI', 'CON', 'TRAP', 'LIN', 'UMOM', 'CMOM'].includes(type)) { warn(`Member load type "${type}" is not imported.`); break }
          if (type === 'UMOM' || type === 'CMOM') { warn('Member moments (UMOM/CMOM) are not imported.'); break }
          if (type === 'LIN') { warn('LIN member loads are not imported.'); break }
          for (const m of ids) {
            const Lm = mLen(m)
            const gravityAxis = dir === 'GY' || dir === 'PY' || (dir === 'Y' && horizontal(m) && !(beta.get(m)))
            const gvec = (v: number): [number, number, number] =>
              dir === 'GX' || dir === 'PX' ? [v, 0, 0] : dir === 'GZ' || dir === 'PZ' ? [0, 0, v] : [0, v, 0]
            if (dir === 'X' || dir === 'Z' || (dir === 'Y' && !gravityAxis)) warn('Member loads in local axes are applied in the matching global direction; check members that are not horizontal.')
            if (type === 'UNI') {
              const w = nums[0] * ff / lf, d1 = nums[1] !== undefined ? nums[1] * lf : 0, d2 = nums[2] !== undefined ? nums[2] * lf : Lm
              if (gravityAxis || dir === 'Y') lineLoad(m, -w, -w, d1, d2)
              else asEndForces(m, gvec(w * (d2 - d1)), (d1 + d2) / 2)
            } else if (type === 'CON') {
              const P = nums[0] * ff, d = nums[1] !== undefined ? nums[1] * lf : Lm / 2
              if (gravityAxis || dir === 'Y') cur.push({ kind: 'member-point', member: mId(m), t: Lm > 0 ? Math.max(0, Math.min(1, d / Lm)) : 0.5, P: -P, cat: 'D' })
              else asEndForces(m, gvec(P), d)
            } else {   // TRAP
              const w1 = nums[0] * ff / lf, w2 = (nums[1] ?? nums[0]) * ff / lf
              const d1 = nums[2] !== undefined ? nums[2] * lf : 0, d2 = nums[3] !== undefined ? nums[3] * lf : Lm
              if (gravityAxis || dir === 'Y') lineLoad(m, -w1, -w2, d1, d2)
              else asEndForces(m, gvec((w1 + w2) / 2 * (d2 - d1)), d1 + (d2 - d1) * (w1 + 2 * w2) / (3 * (w1 + w2) || 1))
            }
          }
          break
        }
        case 'elementload': {
          if (!cur) break
          const [ids, i] = readList(t, 0, allElems)
          if (t[i] !== 'PR') { warn(`Element load "${t[i]}" is not imported (only PR pressure).`); break }
          const explicit = ['GX', 'GY', 'GZ', 'LOCALX', 'LOCALY', 'LOCALZ'].includes(t[i + 1])
          const dir = explicit ? t[i + 1] : 'LOCALZ'
          const q = +t[explicit ? i + 2 : i + 1] * ff / lf ** 2
          if (t.slice(i).filter(isNum).length > 1) warn('Concentrated or patch element pressures (PR with x1 y1 x2 y2) are read as uniform over the element.')
          if (dir === 'GX' || dir === 'GZ' || dir === 'LOCALX' || dir === 'LOCALY') { warn('Element pressures that are not gravity (GX/GZ/local in-plane) are not imported.'); break }
          for (const e of ids) {
            const ns = elems.get(e)
            if (!ns || ns.length !== 4) continue
            let qd: number
            if (dir === 'GY') qd = -q
            else {
              const [a, b, c] = ns.map((n) => joints.get(n)!)
              const u = dirOf(a, b), v = dirOf(a, c)
              const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
              const ny = n[1] / (Math.hypot(...n) || 1)
              if (Math.abs(ny) < 0.5) { warn('Local pressures on non-horizontal elements (walls) are not imported.'); continue }
              qd = -q * ny   // q along local z (= incidence normal); its downward component
            }
            cur.push({ kind: 'area', plate: pId(e), q: qd, cat: 'D' })
          }
          break
        }
        case 'temperature': {
          if (!cur) break
          const [ids, i] = readList(t, 0, allMembers)
          if (t[i] !== 'TEMP' && t[i] !== 'TEMPERATURE') { warn('Strain and gradient temperature loads are not imported.'); break }
          const dT = +t[i + 1]
          if (t.slice(i + 2).some(isNum)) warn('Temperature gradients across the section are not imported (uniform ΔT only).')
          for (const m of ids) {
            if (!membs.has(m)) continue
            const mt = matOf.get(m), alpha = (mt ? mats.get(mt)?.alpha : undefined) ?? 1e-5
            cur.push({ kind: 'member-thermal', member: mId(m), deltaT: dT, alpha, cat: 'T' })
          }
          break
        }
        case 'refload': {
          for (let k = 0; k + 1 < t.length; k += 2) {
            const src = refs.get(t[k]), f = +t[k + 1]
            if (!src || !cur) { warn(`Reference load ${t[k]} is not defined.`); continue }
            for (const ld of src) cur.push(scaleLoad(ld, f))
          }
          break
        }
        case 'comb': {
          if (!combo) break
          for (let k = 0; k + 1 < t.length; k += 2) if (isNum(t[k]) && isNum(t[k + 1])) combo.factors[+t[k]] = +t[k + 1]
          break
        }
        default: break
      }
      continue
    }

    // ── material definition block ──
    if (block === 'material') {
      if (t0 === 'END') { block = ''; continue }
      if (t0 === 'ISOTROPIC') { curMat = {}; mats.set(t1, curMat); continue }
      if (curMat) {
        if (t0 === 'E' && isNum(t1)) curMat.E = +t1 * ff / lf ** 2
        else if (kw(t0, 'POISSON')) curMat.nu = +t1
        else if (kw(t0, 'DENSITY')) curMat.density = +t1 * ff / lf ** 3
        else if (t0 === 'ALPHA') curMat.alpha = +t1
        else if (t0 === 'TYPE') curMat.type = t1
        else if (kw(t0, 'STRENGTH')) {
          const v = (k: string) => { const q = t.indexOf(k); return q > 0 && isNum(t[q + 1]) ? +t[q + 1] * ff / lf ** 2 / 1000 : undefined }
          curMat.fcu = v('FCU') ?? curMat.fcu; curMat.fy = v('FY') ?? curMat.fy; curMat.fu = v('FU') ?? curMat.fu
        }
        continue
      }
    }
    if (block === 'constants') {
      if (kw(t0, 'MATERIAL') && t1) {
        const j = t[2] === 'MEMB' || t[2] === 'MEMBER' ? 3 : 2
        const [ids] = readList(t, j, () => [...allMembers(), ...allElems()])
        for (const m of ids) matOf.set(m, t1)
        if (!mats.has(t1) && BUILTIN_MAT[t1]) mats.set(t1, { ...BUILTIN_MAT[t1] })
        continue
      }
      if (t0 === 'BETA' && isNum(t1)) {
        const j = t[2] === 'MEMB' || t[2] === 'MEMBER' ? 3 : 2
        const [ids] = readList(t, j, allMembers)
        for (const m of ids) beta.set(m, +t1)
        continue
      }
      if (['E', 'DENSITY', 'DEN', 'POISSON', 'POI', 'ALPHA', 'G', 'DAMP', 'CDAMP'].includes(t0)) {
        if (t1 && !isNum(t1)) {   // old-style `E CONCRETE ALL`: a built-in material by name
          const j = t[2] === 'MEMB' || t[2] === 'MEMBER' ? 3 : 2
          const [ids] = readList(t, j, () => [...allMembers(), ...allElems()])
          for (const m of ids) if (!matOf.has(m)) matOf.set(m, t1)
          if (!mats.has(t1) && BUILTIN_MAT[t1]) mats.set(t1, { ...BUILTIN_MAT[t1] })
          continue
        }
        if (t0 !== 'DAMP' && t0 !== 'CDAMP') warn('CONSTANTS E/DENSITY/POISSON overrides are not imported; materials come from DEFINE MATERIAL / the material name.')
        continue
      }
    }
    if (block === 'material' || block === 'constants') block = ''

    // ── commands ──
    if (t0 === 'STAAD') { if (t.length > 2) name = r.raw.split(/\s+/).slice(2).join(' ') || name; continue }
    if (t0 === 'START' && kw(t1, 'JOB')) { job = true; continue }
    if (t0 === 'UNIT') {
      for (const x of t.slice(1)) { if (LEN[x] !== undefined) lf = LEN[x]; else if (FORCE[x] !== undefined) ff = FORCE[x] }
      continue
    }
    if (kw(t0, 'JOINT') && kw(t1, 'COORDINATES')) { block = 'joints'; if (t.includes('CYLINDRICAL')) warn('Cylindrical joint coordinates are not supported.'); continue }
    if (kw(t0, 'MEMBER') && kw(t1, 'INCIDENCES')) { block = 'members'; continue }
    if (kw(t0, 'ELEMENT') && kw(t1, 'INCIDENCES')) { block = 'elements'; if (t.includes('SOLID')) warn('Solid elements are not supported.'); continue }
    if (kw(t0, 'ELEMENT') && kw(t1, 'PROPERTY')) { block = 'eprop'; continue }
    if (kw(t0, 'MEMBER') && kw(t1, 'PROPERTY')) { block = 'mprop'; continue }
    if (t0 === 'DEFINE' && kw(t1, 'MATERIAL')) { block = 'material'; continue }
    if (kw(t0, 'CONSTANTS')) { block = 'constants'; continue }
    if (kw(t0, 'SUPPORTS')) { block = 'supports'; continue }
    if (kw(t0, 'MEMBER') && kw(t1, 'RELEASE')) { block = 'release'; continue }
    if (kw(t0, 'MEMBER') && kw(t1, 'OFFSET')) { block = 'offset'; continue }
    if (kw(t0, 'MEMBER') && kw(t1, 'TENSION')) { block = 'tension'; tail(t, 2); continue }
    if (kw(t0, 'MEMBER') && kw(t1, 'COMPRESSION')) { block = 'compression'; tail(t, 2); continue }
    if (kw(t0, 'MEMBER') && kw(t1, 'TRUSS')) { block = 'truss'; tail(t, 2); continue }
    if (kw(t0, 'MEMBER') && (kw(t1, 'CABLE') || kw(t1, 'CRACKED'))) { warn(`MEMBER ${t1} specs are not imported.`); block = ''; continue }
    if (t0 === 'DEFINE' && kw(t1, 'REFERENCE')) { refDef = true; block = ''; continue }
    if (t0 === 'END' && t1 === 'DEFINE' && kw(t[2], 'REFERENCE')) { refDef = false; cur = null; block = ''; continue }
    if (t0 === 'DEFINE') { warn(`DEFINE ${t1} (load generator) is not imported.`); block = 'skip'; continue }
    if (t0 === 'END' && t1 === 'DEFINE') { block = ''; continue }
    if ((t0 === 'LOAD' || t0 === 'LOADING') && kw(t1, 'COMBINATION')) {
      combo = { id: +t[2], title: r.raw.split(/\s+/).slice(3).join(' '), factors: {} }
      combos.push(combo); cur = null; block = 'comb'; continue
    }
    if ((t0 === 'LOAD' || t0 === 'LOADING') && t1 && (isNum(t1) || /^R\d+$/.test(t1))) {
      const ltIdx = t.indexOf('LOADTYPE'), tiIdx = t.indexOf('TITLE')
      const lt = ltIdx > 0 ? t.slice(ltIdx + 1, tiIdx > ltIdx ? tiIdx : undefined).join(' ') : ''
      const title = tiIdx > 0 ? r.raw.split(/\s+/).slice(tiIdx + 1).join(' ') : r.raw.split(/\s+/).slice(2).join(' ')
      cur = []
      if (refDef || /^R\d+$/.test(t1)) refs.set(t1, cur)
      else {
        const cat = categoryOf(lt, title)
        if (!cat.known) warn(`Load case ${t1}${title ? ` "${title}"` : ''} has no recognisable LOADTYPE — read as ${cat.cat}.`)
        cases.push({ id: t1, cat: cat.cat, loads: cur })
        catSeen.set(cat.cat, [...(catSeen.get(cat.cat) ?? []), t1])
      }
      block = 'load'; inTrib = false; continue
    }
    if (t0 === 'LOAD' && t1 === 'LIST') continue
    if (cur && kw(t0, 'JOINT') && kw(t1, 'LOAD')) { block = 'jointload'; continue }
    if (cur && kw(t0, 'MEMBER') && kw(t1, 'LOAD')) { block = 'memberload'; continue }
    if (cur && kw(t0, 'ELEMENT') && (kw(t1, 'LOAD') || kw(t1, 'PRESSURE'))) { block = 'elementload'; continue }
    if (cur && kw(t0, 'TEMPERATURE') && kw(t1, 'LOAD')) { block = 'temperature'; continue }
    if (cur && t0 === 'REFERENCE' && kw(t1, 'LOAD')) { block = 'refload'; continue }
    if (cur && kw(t0, 'SELFWEIGHT')) {
      const axis = ['X', 'Y', 'Z'].includes(t1) ? t1 : 'Y'
      const f = isNum(t[2]) ? +t[2] : isNum(t1) ? +t1 : -1
      const li = t.indexOf('LIST')
      const ids = li > 0 ? readList(t, li, allMembers)[0] : [...allMembers(), ...allElems()]
      if (axis !== 'Y') { warn('Self weight along X or Z is not imported.'); continue }
      for (const id of ids) {
        if (membs.has(id)) {
          const steelish = isSteelMat(mats.get(matOf.get(id) ?? ''), matOf.get(id), props.get(id))
          const w = -f * sectionArea(id) * densityOf(id, steelish)
          if (w) cur.push({ kind: 'member-udl', member: mId(id), w, cat: 'D', sw: true })
        } else if (elems.has(id) && thick.has(id)) {
          const q = -f * thick.get(id)! * densityOf(id, false)
          if (q) cur.push({ kind: 'area', plate: pId(id), q, cat: 'D' })
        }
      }
      block = 'load'
      continue
    }
    if (cur && (kw(t0, 'FLOOR') || kw(t0, 'ONEWAY') || kw(t0, 'AREA') || kw(t0, 'WIND') || kw(t0, 'REPEAT') || t0 === 'SPECTRUM' || t0 === 'TIME')) {
      warn(`${t0} ${t1 ?? ''} loads are generated by STAAD at analysis time and are not imported — re-apply them in Zeta.`.replace(/\s+loads/, ' loads'))
      block = 'skip'; continue
    }
    if (['PERFORM', 'PRINT', 'PDELTA', 'CHANGE', 'PARAMETER', 'PARAMETERS', 'CHECK', 'SELECT', 'FINISH', 'INPUT', 'PAGE', 'SET',
      'CODE', 'DESIGN', 'END', 'MEMBER', 'LOAD', 'JOINT', 'ELEMENT', 'NOTE', 'SECTION', 'STEEL', 'CONCRETE', 'START', 'ANALYSIS', 'LOADING', 'CALCULATE'].includes(t0)) {
      if (t0 === 'FINISH') break
      if (t0 === 'START' || kw(t0, 'PARAMETER') || t0 === 'DESIGN' || t0 === 'CODE' || t0 === 'CHECK' || t0 === 'SELECT') block = 'skip'
      continue
    }
    if (block !== 'skip') warn(`STAAD command "${t.slice(0, 2).join(' ')}" is not imported.`)
  }

  function tail(t: string[], i: number) {
    if (i < t.length) {
      const [ids] = readList(t, i, allMembers)
      for (const m of ids) {
        if (block === 'truss') releases.set(m, { iEnd: { Mx: true, My: true, Mz: true }, jEnd: { My: true, Mz: true } })
        else axial.set(m, block === 'tension' ? 'tension-only' : 'compression-only')
      }
    }
  }

  // ── assemble ──
  const nodes = [...joints.values()]
  const sections: RectSection[] = []
  const members: Member[] = []
  let unresolvedSteel = 0, noProp = 0
  for (const [m, [i, j]] of membs) {
    if (!joints.has(i) || !joints.has(j)) { warn(`Member ${m} references a missing joint and was skipped.`); continue }
    const id = mId(m)
    const sec = buildSection(id, m)
    if (!sec) noProp++
    sections.push(sec ?? defaultConcrete(id, 300, 300))
    const a = joints.get(i)!, b = joints.get(j)!
    const d = dirOf(a, b), Lm = Math.hypot(...d)
    const role: Member['role'] = vertical(m) ? 'column' : Lm > 0 && Math.abs(d[1]) / Lm < 0.02 ? 'beam' : 'brace'
    const mem: Member = { id, i: a.id, j: b.id, role, section: id }
    const bt = beta.get(m)
    if (bt) mem.axisRotation = defaultAxisRotation(d) + bt
    const rr = releases.get(m)
    if (rr) mem.releases = rr
    const of = offsets.get(m)
    if (of) mem.offsets = of
    const ax = axial.get(m)
    if (ax) mem.axialMode = ax
    members.push(mem)
  }
  if (noProp) warn(`${noProp} member(s) had no readable MEMBER PROPERTY and were given a 300×300 concrete placeholder section.`)
  if (unresolvedSteel) warn(`${unresolvedSteel} steel table name(s) are not in Zeta's AISC catalogue — those members carry a placeholder steel section; reassign them.`)

  function isSteelMat(mt: StaadMat | undefined, nameKey: string | undefined, p: Prop | undefined): boolean {
    if (p?.kind === 'table') return true
    if (mt?.type) return mt.type === 'STEEL'
    if (mt?.E) return mt.E > 1.5e8
    return !!nameKey && nameKey.startsWith('STEEL')
  }
  function defaultConcrete(id: string, b: number, h: number, fc = 28): RectSection {
    return { id, name: `${Math.round(b)}×${Math.round(h)}`, b, h, fc, fy: 415, barDia: 20, tieDia: 10, cover: 40, material: 'concrete' }
  }
  function buildSection(id: string, m: number): RectSection | null {
    const meta = propMeta.get(m)
    if (meta) return { ...(meta as RectSection), id, name: meta.name ?? id }
    const p = props.get(m)
    if (!p) return null
    const mk = matOf.get(m), mt = mk ? mats.get(mk) : undefined
    const steel = isSteelMat(mt, mk, p)
    const timber = !steel && (mt?.type === 'TIMBER' || mt?.type === 'WOOD' || (!!mt?.E && !mt.type && mt.E < 1.6e7 && !mk?.startsWith('CONC')))
    const fc = mt?.fcu ?? (mt?.E && !steel && !timber ? (mt.E / 1000 / 4700) ** 2 : 28)
    if (p.kind === 'table') {
      const s = resolveSteelName(p.name)
      if (!s) { unresolvedSteel++; return { ...defaultConcrete(id, 200, 400), name: p.name, material: 'steel', steelFy: mt?.fy ?? 248, steelFu: mt?.fu ?? 400 } }
      const bb = sectionBoundingBox(s)
      return { id, name: s.name, b: bb.b, h: bb.h, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40, material: 'steel', shape: s.name, steelFy: mt?.fy ?? 248, steelFu: mt?.fu ?? 400 }
    }
    let b: number, h: number
    if (p.kind === 'pris') {
      h = p.yd * 1000
      if (p.zd !== undefined) b = p.zd * 1000
      else { b = h * Math.sqrt(Math.PI) / 2; h = b; warn('Circular PRIS sections (YD only) were read as the square of equal area.') }
    } else {
      h = Math.sqrt(12 * p.iz / p.ax) * 1000
      b = p.ax * 1e6 / h
      warn('Sections given by properties (PRIS AX/IZ) were read as the rectangle of equal area and strong-axis I — the weak-axis and torsional stiffness will differ.')
    }
    if (steel) return { ...defaultConcrete(id, b, h), material: 'steel', steelFy: mt?.fy ?? 248, steelFu: mt?.fu ?? 400 }
    if (timber) return { ...defaultConcrete(id, b, h), material: 'wood' }
    return defaultConcrete(id, b, h, Math.round(fc * 100) / 100)
  }

  // plates: STAAD elements, enriched by *ZETA-PLATE metadata; metadata alone
  // (a tributary-mode Zeta export) restores the panel without an element
  const plates: Plate[] = []
  let triangles = 0
  const plateNums = new Set<number>([...elems.keys(), ...plateMeta.keys()])
  for (const e of plateNums) {
    const ns = elems.get(e) ?? plateMeta.get(e)?.c
    if (!ns) continue
    if (ns.length !== 4) { triangles++; continue }
    if (!ns.every((n) => joints.has(n))) continue
    const meta = plateMeta.get(e)
    const [a, b, c] = ns.map((n) => joints.get(n)!)
    const u = dirOf(a, b), v = dirOf(a, c)
    const nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const wall = Math.abs(nrm[1]) / (Math.hypot(...nrm) || 1) < 0.5
    const { n: _n, c: _c, ...rest } = (meta ?? {}) as { n?: number; c?: number[] } & Partial<Plate>
    plates.push({
      role: wall ? 'wall' : 'slab',
      thickness: thick.has(e) ? thick.get(e)! * 1000 : 150,
      ...rest,
      id: pId(e),
      corners: ns.map((n) => `N${n}`) as [string, string, string, string],
    })
  }
  if (triangles) warn(`${triangles} triangular element(s) were skipped — Zeta panels are quadrilaterals.`)
  if ([...elems.keys()].some((e) => !thick.has(e) && !plateMeta.get(e)?.thickness)) warn('Some elements had no THICKNESS and were given 150 mm.')
  const plateIds = new Set(plates.map((p) => p.id))

  // loads: stamp each case's category; drop loads on things that didn't come across
  const memberIds = new Set(members.map((m) => m.id)), nodeIds = new Set(nodes.map((n) => n.id))
  const loads: ModelLoad[] = []
  for (const c of cases) {
    for (const ld of c.loads) {
      const ok = ld.kind === 'node' ? nodeIds.has(ld.node) : ld.kind === 'area' ? plateIds.has(ld.plate) : memberIds.has(ld.member)
      if (ok) loads.push({ ...ld, cat: ld.kind === 'member-thermal' ? 'T' : c.cat } as ModelLoad)
    }
  }
  for (const [cat, ids] of catSeen)
    if (ids.length > 1) warn(`Load cases ${ids.join(', ')} are all ${CAT_TITLE[cat]} and were merged into one Zeta ${cat} category — split directional cases (e.g. wind X/Z) by hand if they must stay separate.`)
  if (combos.length) warn(`${combos.length} LOAD COMB case(s) were read but not imported: Zeta builds the NSCP §203 combinations from the load categories.`)

  // storeys: every level carrying horizontal framing above the lowest joint
  const minY = nodes.length ? Math.min(...nodes.map((n) => n.y)) : 0
  const levels = new Set<number>()
  for (const m of members) {
    if (m.role !== 'beam') continue
    const y = joints.get(+m.i.slice(1))!.y
    if (y > minY + 1e-6) levels.add(Math.round(y * 1e6) / 1e6)
  }
  const storeys = [...levels].sort((a, b) => a - b).map((y, k) => ({ id: `st${k + 1}`, name: `Level ${k + 1}`, elevation: y }))

  const model: StructuralModel = {
    version: 1, name, nodes, sections, members, plates, walls: [],
    supports: [...supports.values()].filter((s) => nodeIds.has(s.node)),
    loads, storeys,
  }
  if (elems.size) model.shellElements = true
  return { model, warnings: [...warnings], combos }
}

function scaleLoad(ld: ModelLoad, f: number): ModelLoad {
  switch (ld.kind) {
    case 'node': return { ...ld, Fx: (ld.Fx ?? 0) * f, Fy: (ld.Fy ?? 0) * f, Fz: (ld.Fz ?? 0) * f }
    case 'member-point': return { ...ld, P: ld.P * f }
    case 'member-udl': return { ...ld, w: ld.w * f }
    case 'area': return { ...ld, q: ld.q * f }
    case 'member-thermal': return { ...ld, deltaT: ld.deltaT * f }
  }
}

/** STAAD LOADTYPE (or, failing that, the title) → Zeta load category. */
function categoryOf(loadtype: string, title: string): { cat: LoadCategory; known: boolean } {
  const lt = loadtype.toUpperCase()
  if (lt.startsWith('DEAD') || lt.startsWith('FLUIDS') || lt.startsWith('SOIL')) return { cat: 'D', known: true }
  if (lt.startsWith('ROOF LIVE')) return { cat: 'Lr', known: true }
  if (lt.startsWith('LIVE')) return { cat: 'L', known: true }
  if (lt.startsWith('WIND')) return { cat: 'W', known: true }
  if (lt.startsWith('SEISMIC') || lt.startsWith('ACCIDENTAL')) return { cat: 'E', known: true }
  if (lt.startsWith('SNOW')) return { cat: 'S', known: true }
  if (lt.startsWith('RAIN')) return { cat: 'R', known: true }
  if (lt.startsWith('TEMPERATURE') || lt.startsWith('SELF STRESS')) return { cat: 'T', known: true }
  const ti = title.toUpperCase()
  if (/\bROOF\s*LIVE\b|\bLR\b/.test(ti)) return { cat: 'Lr', known: true }
  if (/\bLIVE\b|\bLL\b/.test(ti)) return { cat: 'L', known: true }
  if (/\bWIND\b|\bWL\b|\bW[XZ]\b/.test(ti)) return { cat: 'W', known: true }
  if (/\bSEISMIC\b|\bEARTHQUAKE\b|\bEQ[XZ]?\b/.test(ti)) return { cat: 'E', known: true }
  if (/\bDEAD\b|\bDL\b|\bSELF\b|\bSDL\b/.test(ti)) return { cat: 'D', known: true }
  if (/\bTEMP/.test(ti)) return { cat: 'T', known: true }
  return { cat: 'D', known: false }
}
