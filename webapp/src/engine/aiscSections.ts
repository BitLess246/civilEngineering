// ─────────────────────────────────────────────────────────────────────────
// AISC steel shape library (metric values, mm / mm²). A representative,
// extensible set across the common families used in trusses & frames:
//   W (wide flange), C (channel), L (single angle), HSS (rect / square),
//   round HSS / Pipe, WT (structural tee). Single angles can be paired into a
//   back-to-back DOUBLE ANGLE (2L) with a gusset gap.
// Each shape carries gross area A, radii of gyration, and the geometry needed
// to draw an accurate cross-section. Add rows freely — the renderer keys off
// `family` + the geometry fields.
// ─────────────────────────────────────────────────────────────────────────

export type SectionFamily = 'W' | 'C' | 'L' | 'HSS' | 'PIPE' | 'WT'

export interface AiscShape {
  name: string
  family: SectionFamily
  A: number                 // gross area, mm²
  rx: number; ry: number    // radii of gyration, mm
  rz?: number               // minor principal radius (single angles), mm
  xbar?: number             // centroid from the back of leg (angles), mm
  // geometry for rendering, mm
  d?: number; bf?: number; tf?: number; tw?: number   // W / C / WT
  leg1?: number; leg2?: number; t?: number            // L (+ HSS wall t)
  b?: number; h?: number                              // HSS rect/square
  D?: number                                          // round HSS / pipe (+ t)
}

/** Wide-flange (W) shapes. */
const W: AiscShape[] = [
  { name: 'W150x18', family: 'W', A: 2290, rx: 65, ry: 24.9, d: 153, bf: 102, tf: 7.1, tw: 5.8 },
  { name: 'W200x22', family: 'W', A: 2860, rx: 84, ry: 22.3, d: 206, bf: 102, tf: 8.0, tw: 6.2 },
  { name: 'W200x46', family: 'W', A: 5890, rx: 89, ry: 51.8, d: 203, bf: 203, tf: 11.0, tw: 7.2 },
  { name: 'W250x33', family: 'W', A: 4190, rx: 105, ry: 35.0, d: 258, bf: 146, tf: 9.1, tw: 6.1 },
  { name: 'W250x67', family: 'W', A: 8580, rx: 110, ry: 51.1, d: 257, bf: 204, tf: 15.7, tw: 8.9 },
  { name: 'W310x39', family: 'W', A: 4940, rx: 129, ry: 38.4, d: 310, bf: 165, tf: 9.7, tw: 5.8 },
  { name: 'W310x79', family: 'W', A: 10000, rx: 132, ry: 63.9, d: 306, bf: 254, tf: 14.6, tw: 8.8 },
  { name: 'W360x51', family: 'W', A: 6450, rx: 149, ry: 39.6, d: 355, bf: 171, tf: 11.6, tw: 7.2 },
]

/** Channels (C). */
const C: AiscShape[] = [
  { name: 'C150x19.3', family: 'C', A: 2470, rx: 61.0, ry: 17.0, d: 152, bf: 54.8, tf: 8.7, tw: 11.1 },
  { name: 'C200x27.9', family: 'C', A: 3550, rx: 80.0, ry: 19.5, d: 203, bf: 64.0, tf: 9.9, tw: 7.7 },
  { name: 'C250x37', family: 'C', A: 4740, rx: 99.0, ry: 22.0, d: 254, bf: 73.0, tf: 11.0, tw: 9.6 },
  { name: 'C310x45', family: 'C', A: 5690, rx: 122, ry: 24.0, d: 305, bf: 80.5, tf: 12.7, tw: 13.0 },
]

/** Equal-leg single angles (L) — rx = ry (geometric), rz = minor principal. */
const L: AiscShape[] = [
  { name: 'L51x51x6.4', family: 'L', A: 605, rx: 15.6, ry: 15.6, rz: 9.9, xbar: 14.7, leg1: 51, leg2: 51, t: 6.4 },
  { name: 'L64x64x6.4', family: 'L', A: 768, rx: 19.9, ry: 19.9, rz: 12.6, xbar: 17.5, leg1: 64, leg2: 64, t: 6.4 },
  { name: 'L76x76x6.4', family: 'L', A: 929, rx: 23.8, ry: 23.8, rz: 15.1, xbar: 20.6, leg1: 76, leg2: 76, t: 6.4 },
  { name: 'L76x76x9.5', family: 'L', A: 1370, rx: 23.5, ry: 23.5, rz: 14.9, xbar: 21.9, leg1: 76, leg2: 76, t: 9.5 },
  { name: 'L102x102x9.5', family: 'L', A: 1850, rx: 31.8, ry: 31.8, rz: 20.1, xbar: 27.2, leg1: 102, leg2: 102, t: 9.5 },
  { name: 'L102x102x12.7', family: 'L', A: 2420, rx: 31.4, ry: 31.4, rz: 19.9, xbar: 28.4, leg1: 102, leg2: 102, t: 12.7 },
  { name: 'L127x127x12.7', family: 'L', A: 3060, rx: 39.4, ry: 39.4, rz: 24.9, xbar: 34.5, leg1: 127, leg2: 127, t: 12.7 },
  { name: 'L152x152x12.7', family: 'L', A: 3710, rx: 47.5, ry: 47.5, rz: 30.1, xbar: 40.9, leg1: 152, leg2: 152, t: 12.7 },
  { name: 'L152x152x19', family: 'L', A: 5410, rx: 46.9, ry: 46.9, rz: 29.8, xbar: 43.4, leg1: 152, leg2: 152, t: 19.0 },
]

/** Square & rectangular HSS. */
const HSS: AiscShape[] = [
  { name: 'HSS76x76x6.4', family: 'HSS', A: 1600, rx: 28.2, ry: 28.2, b: 76, h: 76, t: 6.4 },
  { name: 'HSS102x102x6.4', family: 'HSS', A: 2230, rx: 38.6, ry: 38.6, b: 102, h: 102, t: 6.4 },
  { name: 'HSS102x102x9.5', family: 'HSS', A: 3160, rx: 37.5, ry: 37.5, b: 102, h: 102, t: 9.5 },
  { name: 'HSS127x127x6.4', family: 'HSS', A: 2860, rx: 48.9, ry: 48.9, b: 127, h: 127, t: 6.4 },
  { name: 'HSS152x152x9.5', family: 'HSS', A: 4920, rx: 57.6, ry: 57.6, b: 152, h: 152, t: 9.5 },
  { name: 'HSS152x102x6.4', family: 'HSS', A: 2860, rx: 53.0, ry: 38.0, b: 102, h: 152, t: 6.4 },
  { name: 'HSS203x102x6.4', family: 'HSS', A: 3550, rx: 68.0, ry: 39.0, b: 102, h: 203, t: 6.4 },
]

/** Round HSS / standard pipe. */
const PIPE: AiscShape[] = [
  { name: 'PIPE 3 STD', family: 'PIPE', A: 1390, rx: 29.5, ry: 29.5, D: 88.9, t: 5.5 },
  { name: 'PIPE 4 STD', family: 'PIPE', A: 2010, rx: 38.4, ry: 38.4, D: 114.3, t: 6.0 },
  { name: 'PIPE 5 STD', family: 'PIPE', A: 2700, rx: 47.8, ry: 47.8, D: 141.3, t: 6.6 },
  { name: 'PIPE 6 STD', family: 'PIPE', A: 3470, rx: 57.2, ry: 57.2, D: 168.3, t: 7.1 },
  { name: 'HSS114x6.4', family: 'PIPE', A: 2150, rx: 38.0, ry: 38.0, D: 114, t: 6.4 },
]

/** Structural tees (WT). */
const WT: AiscShape[] = [
  { name: 'WT100x10.5', family: 'WT', A: 1340, rx: 27.5, ry: 23.0, d: 103, bf: 102, tf: 7.1, tw: 5.8 },
  { name: 'WT155x26', family: 'WT', A: 3310, rx: 43.0, ry: 38.0, d: 157, bf: 153, tf: 10.9, tw: 7.1 },
  { name: 'WT180x29.5', family: 'WT', A: 3760, rx: 50.0, ry: 38.4, d: 181, bf: 153, tf: 11.6, tw: 7.5 },
]

export const AISC_SHAPES: AiscShape[] = [...W, ...C, ...L, ...HSS, ...PIPE, ...WT]
export const FAMILIES: { id: SectionFamily; label: string }[] = [
  { id: 'W', label: 'W — Wide flange' },
  { id: 'C', label: 'C — Channel' },
  { id: 'L', label: 'L — Angle' },
  { id: 'HSS', label: 'HSS — Rect/Square tube' },
  { id: 'PIPE', label: 'Pipe / Round HSS' },
  { id: 'WT', label: 'WT — Tee' },
]

export const shapesOf = (family: SectionFamily) => AISC_SHAPES.filter((s) => s.family === family)
export const shapeByName = (name: string) => AISC_SHAPES.find((s) => s.name === name)

/** Effective section actually used by a member: a single shape, or — for angles
 *  — a back-to-back DOUBLE ANGLE (2L) with a gusset gap. */
export interface EffectiveSection {
  label: string
  family: SectionFamily
  A: number                 // mm²
  rmin: number              // governing radius of gyration, mm
  rx: number; ry: number
  double: boolean
  base: AiscShape
  gap?: number              // mm (2L)
}

/** Back-to-back double angle: A doubles; rx unchanged; ry grows by the
 *  parallel-axis shift of each leg's centroid across the gap. */
export function doubleAngle(angle: AiscShape, gap = 10): EffectiveSection {
  const xbar = angle.xbar ?? 0
  const ry2 = Math.sqrt(angle.ry * angle.ry + (xbar + gap / 2) ** 2)
  const rx2 = angle.rx
  return {
    label: `2L ${angle.name.replace(/^L/, '')} (gap ${gap})`,
    family: 'L', A: 2 * angle.A, rx: rx2, ry: ry2, rmin: Math.min(rx2, ry2),
    double: true, base: angle, gap,
  }
}

/** Resolve a chosen shape (optionally doubled) into the effective section. */
export function effectiveSection(shape: AiscShape, double = false, gap = 10): EffectiveSection {
  if (double && shape.family === 'L') return doubleAngle(shape, gap)
  const rmin = shape.family === 'L' ? Math.min(shape.rz ?? shape.rx, shape.rx) : Math.min(shape.rx, shape.ry)
  return { label: shape.name, family: shape.family, A: shape.A, rx: shape.rx, ry: shape.ry, rmin, double: false, base: shape }
}
