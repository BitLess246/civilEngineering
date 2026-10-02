// ─────────────────────────────────────────────────────────────────────────
// CLOSED TRAVERSE — closure, Bowditch adjustment, and area by DMD.
//
// Courses are given as horizontal length + direction, accepted as a quadrant
// bearing ("N 45-30 E", "S 12 W") or a whole-circle azimuth in degrees. From
// them the engine computes the classic chain:
//
//   latitude  = L·cos(az)        departure = L·sin(az)
//   linear misclosure e = √(eLat² + eDep²)      precision = e / perimeter
//   Bowditch (compass) rule — corrections shared in proportion to course
//   LENGTH (the transit rule, proportional to |lat|/|dep|, is offered too):
//       C_lat,i = −eLat · L_i / P        C_dep,i = −eDep · L_i / P
//   adjusted coordinates from the given starting point (default 0, 0)
//   area by double-meridian distances — equivalent to the shoelace formula —
//       A = |Σ DMD_i · Lat_i| / 2,  DMD_i = DMD_{i−1} + Dep_{i−1} + Dep_i
//
// Everything is exact plane surveying: no ellipsoid, no grid factor — the
// board-exam world and small-lot practice.
// ─────────────────────────────────────────────────────────────────────────

export interface TraverseCourse {
  /** Course name (AB, BC, …) — free text, display only. */
  name: string
  /** Horizontal distance (m). */
  length: number
  /** Direction: a quadrant bearing like "N 45-30 E" or an azimuth (decimal degrees, 0–360). */
  dir: string
}

export interface TraverseInput {
  courses: TraverseCourse[]
  /** Starting coordinates, x east / y north (m); default 0, 0. */
  x0?: number
  y0?: number
  /** Adjustment rule: 'bowditch' (default) or 'transit'. */
  rule?: 'bowditch' | 'transit'
}

/** Parse "N 45-30 E", "N45°30'E", "S 12 E", or "135.5" (azimuth degrees). */
export function parseDir(raw: string): { az: number; label: string } {
  const s = raw.trim().toUpperCase().replace(/\s+/g, ' ')
  if (s === '') throw new Error('Empty direction.')
  if (/^-?\d+(\.\d+)?°?$/.test(s)) {
    const az = ((parseFloat(s) % 360) + 360) % 360
    return { az: (az * Math.PI) / 180, label: `Az ${az.toFixed(4)}°` }
  }
  // Normalise every separator style — "N 45-30 E", "N45°30'E", "N 45.75 E",
  // "S 12 W" all become "N 45 30 E"-shaped — then match the parts.
  const norm = s.replace(/[°'']/g, ' ').replace(/-/g, ' ')
  const m = norm.match(/^([NS])\s*(\d+(?:\.\d+)?)?(?:\s+(\d+(?:\.\d+)?))?\s*([EW])$/)
  if (!m) throw new Error(`Cannot read direction "${raw}" — use "N 45-30 E" or an azimuth in degrees.`)
  const deg = parseFloat(m[2] ?? '0')
  const min = parseFloat(m[3] ?? '0')
  if (min >= 60) throw new Error(`Minutes ≥ 60 in "${raw}".`)
  const a = deg + min / 60
  const quadDeg = m[1] === 'N'
    ? (m[4] === 'E' ? a : 360 - a)
    : (m[4] === 'E' ? 180 - a : 180 + a)
  const minTxt = min > 0 ? `${(min % 1 ? min.toFixed(2) : min.toString())}′` : ''
  return { az: (quadDeg * Math.PI) / 180, label: `${m[1]} ${deg}°${minTxt} ${m[4]}` }
}

/** Azimuth (radians, clockwise from north) → quadrant bearing label, e.g. "S 36°52.1′ E".
 *  Cardinal ties: az 90 → N 90° E, az 180 → S 0° E, az 270 → N 90° W. */
export function azToBearing(az: number): string {
  const deg = (((az * 180) / Math.PI) % 360 + 360) % 360
  let quad: 'N' | 'S'
  let a: number
  let ew: 'E' | 'W'
  if (deg <= 90) { quad = 'N'; a = deg; ew = 'E' }
  else if (deg <= 180) { quad = 'S'; a = 180 - deg; ew = 'E' }
  else if (deg < 270) { quad = 'S'; a = deg - 180; ew = 'W' }
  else { quad = 'N'; a = 360 - deg; ew = 'W' }
  const d = Math.floor(a + 1e-9)
  const m = (a - d) * 60
  const mTxt = m >= 0.005 ? `${(m % 1 ? m.toFixed(1) : m.toFixed(0))}′` : ''
  return `${quad} ${d}°${mTxt} ${ew}`
}

export interface CourseRow {
  name: string
  length: number
  /** Parsed direction label, e.g. "N 45°30′ E". */
  dirLabel: string
  azDeg: number
  lat: number
  dep: number
  /** Corrections (m) — already signed for display. */
  cLat: number
  cDep: number
  adjLat: number
  adjDep: number
  /** Adjusted length & bearing, recomputed from the corrected lat/dep. */
  adjLength: number
  adjDirLabel: string
  /** Double-meridian distance of the adjusted course (m). */
  dmd: number
  /** DMD × adjusted latitude — one signed double-area term (m²). */
  doubleArea: number
}

export interface TraverseResult {
  rows: CourseRow[]
  perimeter: number
  /** Closure errors (m), sign as measured: eLat = ΣLat, eDep = ΣDep.
   *  Corrections handed out are the NEGATIVE of these. */
  eLat: number
  eDep: number
  /** Linear misclosure √(eLat²+eDep²) (m). */
  linear: number
  /** Precision expressed as one part in N (0 when perfectly closed). */
  precisionN: number
  /** Adjusted vertices, starting vertex first (n + 1 entries; last = first). */
  vertices: { name: string; x: number; y: number }[]
  /** Area from the DMD chain (m²) and hectares. */
  areaM2: number
  areaHa: number
  rule: 'bowditch' | 'transit'
  n: number
}

interface Parsed { name: string; length: number; az: number; dirLabel: string; lat: number; dep: number }

/** Reduce a closed traverse: closure → Bowditch/transit adjustment → DMD area. */
export function solveTraverse(input: TraverseInput): TraverseResult {
  const courses = input.courses
  if (courses.length < 3) throw new Error('A closed traverse needs at least three courses.')
  const rule = input.rule ?? 'bowditch'

  const parsed: Parsed[] = []
  for (const c of courses) {
    if (!(c.length > 0)) throw new Error(`Course ${c.name || '(unnamed)'} has a non-positive length.`)
    const d = parseDir(c.dir)
    parsed.push({
      name: c.name, length: c.length, az: d.az, dirLabel: d.label,
      lat: c.length * Math.cos(d.az), dep: c.length * Math.sin(d.az),
    })
  }

  const latSum = parsed.reduce((s, r) => s + r.lat, 0)
  const depSum = parsed.reduce((s, r) => s + r.dep, 0)
  // Closure errors as the textbooks define them — the raw chain sums, sign
  // included. The adjusted chain must sum to zero, so every course receives
  // the NEGATIVE share of these.
  const eLat = latSum
  const eDep = depSum
  const perimeter = parsed.reduce((s, r) => s + r.length, 0)
  const linear = Math.hypot(eLat, eDep)
  const precisionN = linear > 1e-12 ? perimeter / linear : 0

  const sumAbsLat = parsed.reduce((s, r) => s + Math.abs(r.lat), 0)
  const sumAbsDep = parsed.reduce((s, r) => s + Math.abs(r.dep), 0)

  const out: CourseRow[] = parsed.map((r) => {
    const cLat = rule === 'bowditch'
      ? -(eLat * r.length) / perimeter
      : -(eLat * Math.abs(r.lat)) / sumAbsLat
    const cDep = rule === 'bowditch'
      ? -(eDep * r.length) / perimeter
      : -(eDep * Math.abs(r.dep)) / sumAbsDep
    const adjLat = r.lat + cLat
    const adjDep = r.dep + cDep
    return {
      name: r.name, length: r.length, dirLabel: r.dirLabel,
      azDeg: (r.az * 180) / Math.PI,
      lat: r.lat, dep: r.dep, cLat, cDep, adjLat, adjDep,
      adjLength: Math.hypot(adjLat, adjDep),
      adjDirLabel: azToBearing(Math.atan2(adjDep, adjLat)),
      dmd: 0, doubleArea: 0,
    }
  })

  // Adjusted coordinates, x east / y north, from the given starting vertex.
  const x0 = input.x0 ?? 0
  const y0 = input.y0 ?? 0
  const vertices = [{ name: 'A', x: x0, y: y0 }]
  for (let i = 0; i < out.length; i++) {
    const v = vertices[i]
    vertices.push({ name: vertexName(i + 1), x: v.x + out[i].adjDep, y: v.y + out[i].adjLat })
  }

  // DMD + double area on the ADJUSTED values:
  //   DMD_1 = Dep_1 ;  DMD_i = DMD_{i−1} + Dep_{i−1} + Dep_i
  let dmd = out[0].adjDep
  out[0].dmd = dmd
  for (let i = 1; i < out.length; i++) {
    dmd = dmd + out[i - 1].adjDep + out[i].adjDep
    out[i].dmd = dmd
  }
  let doubleArea = 0
  for (const r of out) {
    r.doubleArea = r.dmd * r.adjLat
    doubleArea += r.doubleArea
  }

  // The adjustment rule must zero the chain exactly — audit, never trust.
  const latAdj = out.reduce((s, r) => s + r.adjLat, 0)
  const depAdj = out.reduce((s, r) => s + r.adjDep, 0)
  if (Math.abs(latAdj) > 1e-7 || Math.abs(depAdj) > 1e-7) {
    throw new Error('Adjustment did not close the traverse — internal error.')
  }

  const areaM2 = Math.abs(doubleArea) / 2
  return {
    rows: out, perimeter, eLat, eDep, linear, precisionN, vertices,
    areaM2, areaHa: areaM2 / 10000, rule, n: out.length,
  }
}

const vertexName = (i: number) => String.fromCharCode(65 + (i % 26))
