import { describe, it, expect } from 'vitest'
import { toEtabs2k, toEtabs, etabsAngle, etabsDefaultAxes, fmt, q } from './etabs'
import type { StructuralModel, ModelLoad, RectSection, Member, Node } from '../model'
import { generateGridModel, buildGravityLoads } from '../modelBuilder'
import { localAxes, defaultAxisRotation } from '../frame3d'

const RC: RectSection = { id: 's', name: 'B300x500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40, material: 'concrete' }

// ── a reader for exactly what the exporter writes — enough to put the model
//    back together from the text and check it against the source ──
interface Parsed {
  stories: { name: string; elev: number }[]
  points: Map<string, [number, number]>
  lines: Map<string, { kind: string; i: string; j: string; span: number }>
  areas: Map<string, { type: string; pts: string[]; offs: number[] }>
  lineAssign: Map<string, { story: string; section: string; ang: number; release: string }>
  areaAssign: Map<string, { story: string; section: string }>
  sections: Map<string, Record<string, string>>
  shellProps: Set<string>
  patterns: Set<string>
  lineLoads: { name: string; story: string; type: string; lc: string; f: number; rdist?: number }[]
  areaLoads: { name: string; story: string; lc: string; f: number }[]
  pointLoads: { pt: string; story: string; lc: string; F: Record<string, number> }[]
  restraints: Map<string, string>
  combos: Map<string, Record<string, number>>
}
const toks = (line: string) => [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2])
function parse(text: string): Parsed {
  const p: Parsed = { stories: [], points: new Map(), lines: new Map(), areas: new Map(), lineAssign: new Map(), areaAssign: new Map(),
    sections: new Map(), shellProps: new Set(), patterns: new Set(), lineLoads: [], areaLoads: [], pointLoads: [], restraints: new Map(), combos: new Map() }
  const top: { name: string; h?: number; elev?: number }[] = []
  for (const raw of text.split('\n')) {
    const t = toks(raw.trim())
    if (!t.length || t[0].startsWith('$')) continue
    const kv = (k: string) => { const i = t.indexOf(k); return i < 0 ? undefined : t[i + 1] }
    switch (t[0]) {
      case 'STORY': top.push({ name: t[1], h: kv('HEIGHT') ? +kv('HEIGHT')! : undefined, elev: kv('ELEV') ? +kv('ELEV')! : undefined }); break
      case 'POINT': p.points.set(t[1], [+t[2], +t[3]]); break
      case 'LINE': p.lines.set(t[1], { kind: t[2], i: t[3], j: t[4], span: +t[5] }); break
      case 'AREA': { const n = +t[3]; p.areas.set(t[1], { type: t[2], pts: t.slice(4, 4 + n), offs: t.slice(4 + n, 4 + 2 * n).map(Number) }); break }
      case 'LINEASSIGN': p.lineAssign.set(t[1], { story: t[2], section: kv('SECTION')!, ang: +(kv('ANG') ?? 0), release: kv('RELEASE') ?? '' }); break
      case 'AREAASSIGN': p.areaAssign.set(t[1], { story: t[2], section: kv('SECTION')! }); break
      case 'FRAMESECTION': { const r: Record<string, string> = {}; for (let i = 2; i + 1 < t.length; i += 2) r[t[i]] = t[i + 1]; p.sections.set(t[1], r); break }
      case 'SHELLPROP': p.shellProps.add(t[1]); break
      case 'LOADPATTERN': p.patterns.add(t[1]); break
      case 'LINELOAD': p.lineLoads.push({ name: t[1], story: t[2], type: kv('TYPE')!, lc: kv('LC')!, f: +kv('FVAL')!, rdist: kv('RDIST') ? +kv('RDIST')! : undefined }); break
      case 'AREALOAD': p.areaLoads.push({ name: t[1], story: t[2], lc: kv('LC')!, f: +kv('FVAL')! }); break
      case 'POINTLOAD': p.pointLoads.push({ pt: t[1], story: t[2], lc: kv('LC')!, F: Object.fromEntries(['FX', 'FY', 'FZ'].filter((k) => kv(k)).map((k) => [k, +kv(k)!])) }); break
      case 'POINTASSIGN': if (kv('RESTRAINT')) p.restraints.set(`${t[1]}@${t[2]}`, kv('RESTRAINT')!); break
      case 'COMBO': if (t[2] === 'LOADCASE') { const c = p.combos.get(t[1]) ?? {}; c[t[3]] = +t[5]; p.combos.set(t[1], c) } else p.combos.set(t[1], p.combos.get(t[1]) ?? {}); break
    }
  }
  // stories are listed top-down with heights; the base carries its elevation
  const base = top.at(-1)!
  let z = base.elev ?? 0
  p.stories.unshift({ name: base.name, elev: z })
  for (let k = top.length - 2; k >= 0; k--) { z += top[k].h!; p.stories.push({ name: top[k].name, elev: z }) }
  return p
}
/** Back to Zeta coordinates: (X, Y, Z) → (x, y, z) = (X, Z, −Y). */
const zeta = (p: Parsed, pt: string, storyIdx: number) => { const [X, Y] = p.points.get(pt)!; return { x: X, y: p.stories[storyIdx].elev, z: -Y } }
const sIndex = (p: Parsed, name: string) => p.stories.findIndex((s) => s.name === name)
/** The two ends of an exported line, in Zeta coordinates. */
function ends(p: Parsed, name: string) {
  const l = p.lines.get(name)!, s = sIndex(p, p.lineAssign.get(name)!.story)
  return [zeta(p, l.i, s - l.span), zeta(p, l.j, s)]
}
const same = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-6

function grid(): StructuralModel {
  const m = generateGridModel({ baysX: [6, 5], baysZ: [4], storeyH: [3.5, 3], section: RC })
  m.loads = buildGravityLoads(m, 1.5, 2.4)
  return m
}

describe('fmt and names', () => {
  it('writes six significant figures and no exponent in the normal range', () => {
    expect(fmt(24855578.06)).toBe('24855600')
    expect(fmt(0.5)).toBe('0.5')
    expect(fmt(-1e-14)).toBe('0')
  })
  it('never lets a double quote through into a quoted name', () => {
    expect(q('W14"x90\n')).toBe(`"W14'x90"`)
  })
  it("writes names as plain ASCII — the app's 400×400 is ETABS's 400x400", () => {
    expect(q('400×400')).toBe('"400x400"')
    expect(q('Ground — Level')).toBe('"Ground _ Level"')
  })
})

describe('axes: Y-up to Z-up as a proper rotation', () => {
  it('maps up to up and keeps the frame right-handed', () => {
    toEtabs([0, 1, 0]).forEach((v, k) => expect(v).toBeCloseTo([0, 0, 1][k], 12))
    const X = toEtabs([1, 0, 0]), Y = toEtabs([0, 0, -1]), Z = toEtabs([0, 1, 0])
    // X × Y = Z after the map, so no member or plate comes out mirrored
    ;[X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]].forEach((v, k) => expect(v).toBeCloseTo(Z[k], 12))
  })
  it('ETABS defaults: a column has local 2 on +X, a beam has local 2 up', () => {
    expect(etabsDefaultAxes([0, 0, 0], [0, 0, 3])[1]).toEqual([1, 0, 0])
    const [, e2] = etabsDefaultAxes([0, 0, 0], [6, 0, 0])
    expect(e2[2]).toBeCloseTo(1, 12)
  })
})

describe('toEtabs2k — the grid model, put back together from the text', () => {
  const m = grid()
  const { text, warnings } = toEtabs2k(m)
  const p = parse(text)

  it('one story per floor level, named from the model, base at the lowest', () => {
    expect(p.stories.map((s) => s.elev)).toEqual([0, 3.5, 6.5])
    expect(p.stories[0].name).toBe('Base')
  })

  it('one plan point per column line, shared by every story', () => {
    expect(p.points.size).toBe(3 * 2)
  })

  it('every node lands back exactly where it was', () => {
    const placed: { x: number; y: number; z: number }[] = []
    for (const name of p.lines.keys()) placed.push(...ends(p, name))
    for (const n of m.nodes) expect(placed.some((q) => same(q, n)), n.id).toBe(true)
  })

  it('every member comes back between its own two nodes, as the right kind of line', () => {
    const nm = new Map(m.nodes.map((n) => [n.id, n]))
    expect(p.lines.size).toBe(m.members.length)
    for (const mem of m.members) {
      const a = nm.get(mem.i)!, b = nm.get(mem.j)!
      const hit = [...p.lines.keys()].find((name) => { const [u, v] = ends(p, name); return (same(u, a) && same(v, b)) || (same(u, b) && same(v, a)) })
      expect(hit, mem.id).toBeDefined()
      expect(p.lines.get(hit!)!.kind).toBe(mem.role === 'column' ? 'COLUMN' : 'BEAM')
    }
  })

  it('every reference resolves: points, sections, slab properties, load patterns', () => {
    for (const l of p.lines.values()) { expect(p.points.has(l.i)).toBe(true); expect(p.points.has(l.j)).toBe(true) }
    for (const a of p.lineAssign.values()) expect(p.sections.has(a.section)).toBe(true)
    for (const a of p.areaAssign.values()) expect(p.shellProps.has(a.section)).toBe(true)
    for (const l of [...p.lineLoads, ...p.areaLoads]) expect(p.patterns.has(l.lc)).toBe(true)
    for (const c of p.combos.values()) for (const lc of Object.keys(c)) expect(p.patterns.has(lc)).toBe(true)
  })

  it('identical sections share one definition', () => {
    const m2 = grid()
    m2.sections = m2.sections.map((s, k) => ({ ...s, id: `x${k}` }))
    m2.sections.push({ ...m2.sections[0], id: 'dup', name: 'dup' })
    m2.members[0] = { ...m2.members[0], section: 'dup' }
    const p2 = parse(toEtabs2k(m2).text)
    expect(p2.sections.size).toBe(new Set(m2.sections.filter((s) => s.id !== 'dup').map((s) => JSON.stringify({ ...s, id: 0, name: 0 }))).size)
  })

  it('a concrete beam is a concrete rectangle, depth on D', () => {
    const s = [...p.sections.values()].find((x) => x.D === '0.5')!
    expect(s.SHAPE).toBe('Concrete Rectangular')
    expect(+s.D).toBe(0.5); expect(+s.B).toBe(0.3)
  })

  it('default orientation needs no ANG: the grid generator and ETABS agree', () => {
    for (const a of p.lineAssign.values()) expect(a.ang).toBe(0)
  })

  it('the slabs are floors on their own story, membranes because Zeta carries them as load', () => {
    expect(p.areas.size).toBe(m.plates.length)
    for (const a of p.areas.values()) { expect(a.type).toBe('FLOOR'); expect(a.offs.every((o) => o === 0)).toBe(true) }
    expect(text).toMatch(/MODELINGTYPE "Membrane"/)
    expect(warnings.some((w) => /MEMBRANE/.test(w))).toBe(true)
  })

  it('fixed bases come out fully restrained', () => {
    expect(p.restraints.size).toBe(m.supports.length)
    for (const r of p.restraints.values()) expect(r).toBe('UX UY UZ RX RY RZ')
  })

  it('the exported loads total Zeta\'s, category by category', () => {
    const nm = new Map(m.nodes.map((n) => [n.id, n]))
    const len = (id: string) => { const q = m.members.find((x) => x.id === id)!, a = nm.get(q.i)!, b = nm.get(q.j)!; return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) }
    const area = (pid: string) => {
      const [a, b, c] = m.plates.find((x) => x.id === pid)!.corners.map((i) => nm.get(i)!)
      return Math.hypot(b.x - a.x, b.z - a.z) * Math.hypot(c.x - b.x, c.z - b.z)
    }
    const want: Record<string, number> = {}
    const add = (l: ModelLoad, F: number) => { want[l.cat] = (want[l.cat] ?? 0) + F }
    for (const l of m.loads) {
      if (l.kind === 'area') add(l, l.q * area(l.plate))
      else if (l.kind === 'member-udl') add(l, l.w * len(l.member))
    }
    const got: Record<string, number> = {}
    const lcCat: Record<string, string> = { DEAD: 'D', LIVE: 'L' }
    for (const l of p.lineLoads) { const [u, v] = ends(p, l.name); got[lcCat[l.lc]] = (got[lcCat[l.lc]] ?? 0) + l.f * Math.hypot(v.x - u.x, v.y - u.y, v.z - u.z) }
    for (const l of p.areaLoads) {
      const a = p.areas.get(l.name)!, s = sIndex(p, l.story)
      const [c0, c1, c2] = a.pts.map((pt, k) => zeta(p, pt, s - a.offs[k]))
      got[lcCat[l.lc]] = (got[lcCat[l.lc]] ?? 0) + l.f * Math.hypot(c1.x - c0.x, c1.z - c0.z) * Math.hypot(c2.x - c1.x, c2.z - c1.z)
    }
    for (const cat of Object.keys(want)) expect(got[cat], cat).toBeCloseTo(want[cat], 6)
  })

  it('self-weight is not added a second time', () => {
    expect(text).toMatch(/LOADPATTERN\s+"DEAD"\s+TYPE\s+"Dead"\s+SELFWEIGHT\s+0/)
  })

  it('the NSCP combinations over D and L, each a Linear Add of patterns that exist', () => {
    expect(p.combos.get('1.4D')).toEqual({ DEAD: 1.4 })
    expect(p.combos.get('1.2D + 1.6L + 0.5(Lr|S|R)')).toEqual({ DEAD: 1.2, LIVE: 1.6 })
  })
})

describe('local axes, measured — not assumed', () => {
  const node = (id: string, x: number, y: number, z: number): Node => ({ id, x, y, z })
  const mem = (role: Member['role'], axisRotation?: number): Member => ({ id: 'm', i: 'a', j: 'b', section: 's', role, ...(axisRotation === undefined ? {} : { axisRotation }) }) as Member
  /** The angle must turn ETABS's default local 2 onto Zeta's depth axis y′. */
  function lands(m: Member, a: Node, b: Node, fromA = true) {
    const ang = etabsAngle(m, a, b, fromA)
    const d: [number, number, number] = [b.x - a.x, b.y - a.y, b.z - a.z]
    const yp = toEtabs(localAxes(d, defaultAxisRotation(d, m.axisRotation, m.role))[1])
    const A = toEtabs([a.x, a.y, a.z]), B = toEtabs([b.x, b.y, b.z])
    const [, e2, e3] = fromA ? etabsDefaultAxes(A, B) : etabsDefaultAxes(B, A)
    const r = (ang * Math.PI) / 180
    const local2 = e2.map((v, k) => v * Math.cos(r) + e3[k] * Math.sin(r))
    return Math.abs(local2.reduce((s, v, k) => s + v * yp[k], 0))   // |cos| between them
  }

  it('a default column: depth on X in both programs, ANG 0', () => {
    expect(etabsAngle(mem('column'), node('a', 0, 0, 0), node('b', 0, 3, 0), true)).toBe(0)
  })
  it('a column turned to put its depth on Z: ANG 90', () => {
    expect(Math.abs(etabsAngle(mem('column', 0), node('a', 0, 0, 0), node('b', 0, 3, 0), true))).toBeCloseTo(90, 9)
  })
  it('a beam rotated 30°: ANG 30', () => {
    expect(etabsAngle(mem('beam', 30), node('a', 0, 3, 0), node('b', 6, 3, 0), true)).toBeCloseTo(30, 9)
  })
  it('lands the depth on y′ for raking columns, braces, and members drawn top-down', () => {
    const cases: [Member, Node, Node, boolean][] = [
      [mem('column'), node('a', 0, 0, 0), node('b', 0.8, 3.5, -0.4), true],
      [mem('column', 25), node('a', 0, 0, 0), node('b', 0.8, 3.5, 0), true],
      [mem('brace'), node('a', 0, 0, 0), node('b', 6, 3.5, 4), true],
      [mem('column'), node('a', 0, 3, 0), node('b', 0, 0, 0), false],      // drawn top-down, written bottom-up
      [mem('beam', -40), node('a', 6, 3, 0), node('b', 0, 3, 4), true],
    ]
    for (const [m, a, b, f] of cases) expect(lands(m, a, b, f)).toBeCloseTo(1, 9)
  })
})

describe('the cases a grid generator does not make', () => {
  it('a raking column is a COLUMN between two plan points, a story apart', () => {
    const m = grid()
    const col = m.members.find((x) => x.role === 'column')!
    const top = m.nodes.find((n) => n.id === col.j)!
    top.x += 0.6
    const p = parse(toEtabs2k(m).text)
    const raking = [...p.lines.values()].filter((l) => l.kind === 'COLUMN' && l.i !== l.j)
    expect(raking.length).toBeGreaterThan(0)
    expect(raking.every((l) => l.span === 1)).toBe(true)
  })

  it('a simple end releases M2 and M3 at that end only; a swapped member swaps I and J', () => {
    const m = grid()
    const beam = m.members.find((x) => x.role !== 'column')!
    beam.connections = { iEnd: 'simple' }
    const col = m.members.find((x) => x.role === 'column')!
    ;[col.i, col.j] = [col.j, col.i]                       // drawn top-down
    col.releases = { iEnd: { Mz: true } }                  // Zeta's i is now the TOP
    const p = parse(toEtabs2k(m).text)
    const rel = [...p.lineAssign.values()].map((a) => a.release).filter(Boolean)
    expect(rel).toContain('M2I M3I')
    expect(rel).toContain('M3J')                           // the top is ETABS's J
  })

  it('a wall panel spans its story down to the one below', () => {
    const m = grid()
    const [a, b] = [m.nodes.find((n) => n.y === 0)!, m.nodes.find((n) => n.y === 0 && n.id !== m.nodes.find((k) => k.y === 0)!.id && n.z === m.nodes.find((k) => k.y === 0)!.z)!]
    const up = (n: Node) => m.nodes.find((k) => k.x === n.x && k.z === n.z && Math.abs(k.y - 3.5) < 1e-9)!
    m.plates.push({ id: 'w1', corners: [a.id, b.id, up(b).id, up(a).id], role: 'wall', thickness: 200 })
    const p = parse(toEtabs2k(m).text)
    const w = [...p.areas.entries()].find(([n]) => n.startsWith('W'))!
    expect(w[1].type).toBe('PANEL')
    expect(w[1].offs.sort()).toEqual([0, 0, 1, 1])
    expect(p.areaAssign.get(w[0])!.section).toBe('WALL200')
  })

  it('node loads turn with the axes: Zeta +Y up is ETABS +Z, Zeta +Z is ETABS −Y', () => {
    const m = grid()
    const n = m.nodes.find((k) => k.y > 6)!
    m.loads.push({ kind: 'node', node: n.id, Fx: 10, Fy: -20, Fz: 5, cat: 'W' })
    const p = parse(toEtabs2k(m).text)
    const pl = p.pointLoads.find((l) => l.lc === 'WIND')!
    expect(pl.F).toEqual({ FX: 10, FY: -5, FZ: -20 })
  })

  it('states what it does not carry, rather than dropping it', () => {
    const m = grid()
    m.rigidEndZones = true
    m.members[0].axialMode = 'tension-only'
    m.supports[0] = { ...m.supports[0], fixity: 'spring', kx: 5000, ky: 0, kz: 0 }
    const { text, warnings } = toEtabs2k(m)
    expect(warnings.some((w) => /rigid end zones/.test(w))).toBe(true)
    expect(warnings.some((w) => /Tension-only/.test(w))).toBe(true)
    expect(warnings.some((w) => /point springs/.test(w))).toBe(true)
    // the sprung X direction is left free, the rest held
    expect(text).toMatch(/RESTRAINT "UY UZ RX RY RZ"/)
  })
})
