// ─────────────────────────────────────────────────────────────────────────
// INFLUENCE LINES FOR BRIDGE TRUSSES — determinate, simply supported.
//
// A unit load (1 kN, downward) moves along the DECK chord one panel point at
// a time; at every position the whole truss is solved by joint equilibrium
// and the force in every member is recorded. The tabulated force against
// load position IS the member's influence line, and between panel points it
// is linear: a load landing between two floor beams is shared by them in
// inverse proportion to its distance, so the member sees the interpolated
// ordinate (the standard panel-point / floor-beam construction).
//
// GEOMETRY (panel length p = span/panels, depth h):
//   Bottom chord L0…Ln on y = 0; supports: pin at L0, roller at Ln.
//   Pratt / Howe: top chord U1…U(n−1) on y = h, verticals U_i–L_i, one
//     diagonal per interior panel — Pratt's slope down TOWARD midspan
//     (tension diagonals under gravity), Howe's down toward the ENDS
//     (compression diagonals). End panels are the inclined end posts.
//   Warren (with verticals): top nodes over ODD panel points only, top
//     chord U_i–U_(i+2), verticals at those nodes, and one alternating
//     diagonal per panel spanning L_k–U_(k±1) — the end diagonals are the
//     end posts. Verticals are what let a deck (top-loading) bridge land
//     its floor beams.
//   DECK LEVEL: 'through' applies the unit load at the BOTTOM panel points
//     (deck carried by the bottom chord); 'deck' at the TOP nodes, with the
//     two abutment positions x = 0 and x = L added — a load there goes
//     straight into the bearing and stresses nothing.
//
// SIGN CONVENTION: member force > 0 = tension, < 0 = compression.
//
// DETERMINACY is asserted at build time: m + r = 2j with r = 3. Chords carry
// the moment (F ≈ M_panel/h), diagonals the panel shear (F = V/sin θ), so
// the influence lines of the chord members are deck-level-independent while
// verticals (and end posts) differ between through and deck loading.
//
// Units: span, height, positions in m; forces in kN per kN of unit load.
// ─────────────────────────────────────────────────────────────────────────

export type TrussType = 'Pratt' | 'Howe' | 'Warren'
export type DeckLevel = 'through' | 'deck'
export type MemberKind = 'bottom' | 'top' | 'vertical' | 'diagonal' | 'endpost' | 'reaction'

export interface TrussNode { id: string; x: number; y: number; support: 'pin' | 'roller' | null }

export interface TrussMember {
  id: string
  label: string
  /** Node pair, for the drawing and the picker sub-label. */
  nodes: string
  kind: MemberKind
  /** 0-based bottom-panel index the member belongs to. */
  panel: number
  a: string
  b: string
}

/** One place the unit load can stand: a real deck node, or an abutment
 *  position where the load passes straight into the bearing (node = null). */
export interface LoadPosition { id: string; x: number; label: string; node: string | null }

export interface TrussGeom {
  type: TrussType
  deck: DeckLevel
  panels: number
  span: number
  height: number
  nodes: TrussNode[]
  members: TrussMember[]
  loadPositions: LoadPosition[]
  joints: number
  determinate: boolean
}

export interface InfluenceInput {
  type: TrussType
  deck: DeckLevel
  /** Number of bottom-chord panels — even, 4…12. */
  panels: number
  /** Span, m. */
  span: number
  /** Truss depth, m. */
  height: number
}

export interface InfluenceResult {
  geom: TrussGeom
  /** Load positions left → right, m. */
  positions: number[]
  labels: string[]
  /** memberId (and 'RL', 'RR') → ordinate at each position, kN per kN. */
  il: Record<string, number[]>
}

export const MIN_PANELS = 4
export const MAX_PANELS = 12

/** Printable input problems, empty when the geometry is buildable. */
export function validateInput(p: InfluenceInput): string[] {
  const out: string[] = []
  if (!Number.isInteger(p.panels) || p.panels < MIN_PANELS || p.panels > MAX_PANELS || p.panels % 2 !== 0)
    out.push(`Panels must be an even number between ${MIN_PANELS} and ${MAX_PANELS} (got ${p.panels})`)
  if (!(p.span > 0)) out.push(`Span must be greater than zero (got ${p.span})`)
  if (!(p.height > 0)) out.push(`Depth must be greater than zero (got ${p.height})`)
  if (p.span > 0 && p.height > p.span) out.push(`Depth cannot exceed the span (${p.height} > ${p.span})`)
  return out
}

// ── geometry ───────────────────────────────────────────────────────────────

interface Spec { id: string; label: string; nodes: string; kind: MemberKind; panel: number; a: string; b: string }

const bottomId = (i: number) => `L${i}`
const topId = (i: number) => `U${i}`

/** Node-pair reflection used to pair each member with its mirror image. */
function reflectedNode(id: string, n: number): string {
  const m = /^([LU])(\d+)$/.exec(id)
  if (!m) return id
  return `${m[1]}${n - Number(m[2])}`
}

/** Build the parametric truss. Throws on an invalid or indeterminate shape. */
export function buildTruss(p: InfluenceInput): TrussGeom {
  const problems = validateInput(p)
  if (problems.length) throw new Error(problems[0])

  const n = p.panels
  const pp = p.span / n
  const h = p.height
  const specs: Spec[] = []
  const node = (id: string, x: number, y: number, support: TrussNode['support'] = null) =>
    ({ id, x, y, support })

  const nodes: TrussNode[] = []
  for (let i = 0; i <= n; i++) nodes.push(node(bottomId(i), i * pp, 0, i === 0 ? 'pin' : i === n ? 'roller' : null))

  const diag = (panel: number, a: string, b: string) =>
    specs.push({ id: `D${panel}`, label: `D${panel}`, nodes: `${a}–${b}`, kind: 'diagonal', panel, a, b })

  if (p.type === 'Pratt' || p.type === 'Howe') {
    for (let i = 1; i <= n - 1; i++) nodes.push(node(topId(i), i * pp, h))
    for (let i = 0; i < n; i++)
      specs.push({ id: `L${i}-L${i + 1}`, label: `L${i}–L${i + 1}`, nodes: `L${i}–L${i + 1}`, kind: 'bottom', panel: i, a: bottomId(i), b: bottomId(i + 1) })
    for (let i = 1; i <= n - 2; i++)
      specs.push({ id: `U${i}-U${i + 1}`, label: `U${i}–U${i + 1}`, nodes: `U${i}–U${i + 1}`, kind: 'top', panel: i - 1, a: topId(i), b: topId(i + 1) })
    for (let i = 1; i <= n - 1; i++)
      specs.push({ id: `V${i}`, label: `V${i}`, nodes: `U${i}–L${i}`, kind: 'vertical', panel: i - 1, a: topId(i), b: bottomId(i) })
    specs.push({ id: 'EP-L', label: 'EP-L', nodes: 'L0–U1', kind: 'endpost', panel: 0, a: bottomId(0), b: topId(1) })
    specs.push({ id: 'EP-R', label: 'EP-R', nodes: `L${n}–U${n - 1}`, kind: 'endpost', panel: n - 1, a: bottomId(n), b: topId(n - 1) })
    if (p.type === 'Pratt') {
      // left half slopes down toward midspan, right half mirrors it
      for (let i = 1; i <= n / 2 - 1; i++) diag(i, topId(i), bottomId(i + 1))
      for (let i = n / 2 + 1; i <= n - 1; i++) diag(i - 1, topId(i), bottomId(i - 1))
    } else {
      // Howe: down toward the ends
      for (let i = 2; i <= n / 2; i++) diag(i - 1, topId(i), bottomId(i - 1))
      for (let i = n / 2; i <= n - 2; i++) diag(i, topId(i), bottomId(i + 1))
    }
  } else {
    // Warren with verticals: top nodes over odd panel points only
    for (let i = 1; i <= n - 1; i += 2) nodes.push(node(topId(i), i * pp, h))
    for (let i = 0; i < n; i++)
      specs.push({ id: `L${i}-L${i + 1}`, label: `L${i}–L${i + 1}`, nodes: `L${i}–L${i + 1}`, kind: 'bottom', panel: i, a: bottomId(i), b: bottomId(i + 1) })
    for (let i = 1; i <= n - 3; i += 2)
      specs.push({ id: `U${i}-U${i + 2}`, label: `U${i}–U${i + 2}`, nodes: `U${i}–U${i + 2}`, kind: 'top', panel: i, a: topId(i), b: topId(i + 2) })
    for (let i = 1; i <= n - 1; i += 2)
      specs.push({ id: `V${i}`, label: `V${i}`, nodes: `U${i}–L${i}`, kind: 'vertical', panel: i - 1, a: topId(i), b: bottomId(i) })
    for (let k = 0; k < n; k++) {
      const [a, b] = k % 2 === 0 ? [bottomId(k), topId(k + 1)] : [topId(k), bottomId(k + 1)]
      diag(k, a, b)
    }
  }

  // Deck-level load positions. Through: every bottom panel point (the two
  // supports included — a load there is borne directly and stresses nothing).
  // Deck: the top nodes, bracketed by the two abutment positions.
  const loadPositions: LoadPosition[] = []
  if (p.deck === 'through') {
    for (let i = 0; i <= n; i++)
      loadPositions.push({ id: bottomId(i), x: i * pp, label: bottomId(i), node: bottomId(i) })
  } else {
    loadPositions.push({ id: 'ABUT-L', x: 0, label: 'Abut. L', node: null })
    for (const nd of nodes.filter((nd) => nd.y > 0)) loadPositions.push({ id: nd.id, x: nd.x, label: nd.id, node: nd.id })
    loadPositions.push({ id: 'ABUT-R', x: p.span, label: 'Abut. R', node: null })
  }

  const members: TrussMember[] = specs
  const geom: TrussGeom = {
    type: p.type, deck: p.deck, panels: n, span: p.span, height: h,
    nodes, members: members as TrussMember[], loadPositions,
    joints: nodes.length,
    determinate: false,
  }
  // m + r = 2j — the builder's own proof the shape is a determinate truss.
  const det = geom.members.length + 3 === 2 * geom.joints
  if (!det) throw new Error(`Built ${p.type} truss is indeterminate (m+r = ${geom.members.length + 3}, 2j = ${2 * geom.joints})`)
  geom.determinate = true
  return geom
}

/** Mirror-image member id (reactions pair RL ↔ RR); null when self-mirrored. */
export function mirrorOf(geom: TrussGeom, id: string): string | null {
  if (id === 'RL') return 'RR'
  if (id === 'RR') return 'RL'
  const m = geom.members.find((mm) => mm.id === id)
  if (!m) return null
  const [a, b] = m.nodes.split('–')
  const refl = `${reflectedNode(a, geom.panels)}–${reflectedNode(b, geom.panels)}`
  const hit = geom.members.find((mm) => mm.nodes === refl || mm.nodes.split('–').reverse().join('–') === refl)
  if (!hit || hit.id === id) return null
  return hit.id
}

// ── the solver ─────────────────────────────────────────────────────────────

/** Dense Gaussian elimination with partial pivoting; throws on a singular
 *  system (an unstable shape can only get here through a builder bug). */
function solveLinear(A: number[][], b: number[]): number[] {
  const N = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < N; col++) {
    let piv = col
    for (let r = col + 1; r < N; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
    if (Math.abs(M[piv][col]) < 1e-10) throw new Error('Singular system — the truss is unstable')
    if (piv !== col) { const t = M[piv]; M[piv] = M[col]; M[col] = t }
    const d = M[col][col]
    for (let r = col + 1; r < N; r++) {
      const f = M[r][col] / d
      if (f === 0) continue
      for (let c = col; c <= N; c++) M[r][c] -= f * M[col][c]
    }
  }
  const x = new Array<number>(N).fill(0)
  for (let r = N - 1; r >= 0; r--) {
    let s = M[r][N]
    for (let c = r + 1; c < N; c++) s -= M[r][c] * x[c]
    x[r] = s / M[r][r]
  }
  return x
}

const byId = (geom: TrussGeom, id: string) => geom.nodes.find((nd) => nd.id === id)!

/**
 * Member forces (tension positive, kN) for 1 kN down at `loadNode`,
 * by joint equilibrium: at every joint ΣFx = 0 and ΣFy = 0, with the pin
 * contributing Hx and RL and the roller RR as three extra unknowns.
 */
export function solveUnitLoad(geom: TrussGeom, loadNode: string): Record<string, number> {
  const m = geom.members.length
  const N = m + 3                                   // member forces, Hx, RL, RR
  const A: number[][] = []
  const b: number[] = []
  const unit = (from: string, to: string) => {
    const pa = byId(geom, from), pb = byId(geom, to)
    const dx = pb.x - pa.x, dy = pb.y - pa.y
    const len = Math.hypot(dx, dy) || 1
    return [dx / len, dy / len]
  }
  for (const nd of geom.nodes) {
    const fx = new Array<number>(N).fill(0)
    const fy = new Array<number>(N).fill(0)
    geom.members.forEach((mem, j) => {
      const [ux, uy] = unit(mem.a, mem.b)
      if (mem.a === nd.id) { fx[j] += ux; fy[j] += uy }   // tension pulls a toward b
      if (mem.b === nd.id) { fx[j] -= ux; fy[j] -= uy }
    })
    if (nd.support === 'pin') { fx[m] = 1; fy[m + 1] = 1 }
    if (nd.support === 'roller') fy[m + 2] = 1
    let load = 0
    if (nd.id === loadNode) load = 1
    A.push(fx, fy)
    b.push(0, load)                                  // ΣF = 0 → member/reaction terms balance the load
  }
  const x = solveLinear(A, b)
  const out: Record<string, number> = {}
  geom.members.forEach((mem, j) => { out[mem.id] = x[j] })
  out.RL = x[m + 1]
  out.RR = x[m + 2]
  return out
}

/** Influence lines for every member plus both reactions. */
export function influenceLines(p: InfluenceInput): InfluenceResult {
  const geom = buildTruss(p)
  const positions = geom.loadPositions.map((lp) => lp.x)
  const labels = geom.loadPositions.map((lp) => lp.label)
  const ids = geom.members.map((mm) => mm.id).concat(['RL', 'RR'])
  const il: Record<string, number[]> = {}
  for (const id of ids) il[id] = new Array<number>(geom.loadPositions.length).fill(0)
  for (let k = 0; k < geom.loadPositions.length; k++) {
    const lp = geom.loadPositions[k]
    if (lp.node === null) continue                   // abutment: straight into the bearing
    const f = solveUnitLoad(geom, lp.node)
    for (const id of ids) il[id][k] = f[id] ?? 0
  }
  // Reactions are simply-supported statics at every position — abutments
  // included, where a load goes into a bearing and the members see nothing.
  il.RL = positions.map((x) => (p.span - x) / p.span)
  il.RR = positions.map((x) => x / p.span)
  return { geom, positions, labels, il }
}

// ── reading the lines ──────────────────────────────────────────────────────

/** Ordinate at an arbitrary x — linear between panel points (floor-beam sharing). */
export function ilAt(res: InfluenceResult, id: string, x: number): number {
  const v = res.il[id]
  const xs = res.positions
  if (x <= xs[0]) return v[0]
  if (x >= xs[xs.length - 1]) return v[v.length - 1]
  for (let k = 1; k < xs.length; k++) {
    if (x <= xs[k]) {
      const t = (x - xs[k - 1]) / (xs[k] - xs[k - 1])
      return v[k - 1] + t * (v[k] - v[k - 1])
    }
  }
  return v[v.length - 1]
}

/** Exact ∫ IL dx over [a, b]: the line is piecewise linear, so the integral
 *  is a sum of trapezoids. This is the force a uniform load w over [a, b]
 *  produces (× w), valid across zero crossings. */
export function ilArea(res: InfluenceResult, id: string, a: number, b: number): number {
  const lo = Math.min(a, b), hi = Math.max(a, b)
  const xs = res.positions
  if (hi <= xs[0] || lo >= xs[xs.length - 1]) return 0
  const at = (x: number) => ilAt(res, id, x)
  let sum = 0
  let x0 = Math.max(lo, xs[0])
  for (let k = 1; k < xs.length; k++) {
    if (xs[k] <= x0) continue
    const x1 = Math.min(hi, xs[k])
    if (x1 > x0) { sum += (at(x0) + at(x1)) / 2 * (x1 - x0); x0 = x1 }
    if (x0 >= hi) break
  }
  return sum
}

/** Peak ordinate and where it occurs — panel points are the only candidates,
 *  the line is linear between them. */
export function ilExtremes(res: InfluenceResult, id: string): { max: number; maxX: number; min: number; minX: number } {
  const v = res.il[id]
  let max = -Infinity, maxX = res.positions[0], min = Infinity, minX = res.positions[0]
  v.forEach((o, k) => {
    if (o > max) { max = o; maxX = res.positions[k] }
    if (o < min) { min = o; minX = res.positions[k] }
  })
  return { max, maxX, min, minX }
}

/** Ordered picker groups: reactions first, then chords, posts, diagonals, verticals. */
export function memberGroups(geom: TrussGeom): { kind: MemberKind | 'reaction'; title: string; ids: string[] }[] {
  const pick = (kind: MemberKind) => geom.members.filter((mm) => mm.kind === kind).map((mm) => mm.id)
  const groups: { kind: MemberKind | 'reaction'; title: string; ids: string[] }[] = [
    { kind: 'reaction', title: 'Reactions', ids: ['RL', 'RR'] },
    { kind: 'bottom', title: 'Bottom chord', ids: pick('bottom') },
    { kind: 'top', title: 'Top chord', ids: pick('top') },
    { kind: 'endpost', title: 'End posts', ids: pick('endpost') },
    { kind: 'diagonal', title: 'Diagonals', ids: pick('diagonal') },
    { kind: 'vertical', title: 'Verticals', ids: pick('vertical') },
  ]
  return groups.filter((g) => g.ids.length > 0)
}

export const memberById = (geom: TrussGeom, id: string): TrussMember | undefined =>
  geom.members.find((mm) => mm.id === id)

export const KIND_NAME: Record<MemberKind | 'reaction', string> = {
  reaction: 'reaction',
  bottom: 'bottom chord',
  top: 'top chord',
  vertical: 'vertical',
  diagonal: 'diagonal',
  endpost: 'end post',
}
