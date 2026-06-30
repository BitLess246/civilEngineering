// ─────────────────────────────────────────────────────────────────────────
// NSCP 2015 §208 seismic-parameter lookup — the tables an engineer reads off by
// hand to feed the static base-shear procedure. Drives the Seismic Wizard.
//   Zone Z          : Zone 2 → 0.20, Zone 4 → 0.40           (§208.4.4.1)
//   Near-source Na,Nv: Tables 208-4 / 208-5 (Zone 4 only)
//   Seismic coeff Ca : Table 208-7,  Cv : Table 208-8 (× Na/Nv in Zone 4)
//   Importance I     : Table 208-1
//   System R         : Table 208-11
//   Base shear coeff : Cs = V/W = Cv·I/(R·T), 2.5Ca·I/R ≥ Cs ≥ 0.11Ca·I,
//                      Zone-4 floor 0.8·Z·Nv·I/R              (208-8…208-11)
// ─────────────────────────────────────────────────────────────────────────

export type SoilProfile = 'SA' | 'SB' | 'SC' | 'SD' | 'SE'
export type SeismicSource = 'A' | 'B' | 'C'
export type SeismicZone = 2 | 4
export type Occupancy = 'essential' | 'hazardous' | 'special' | 'standard'

/** Piecewise-linear interpolation of v at x over ascending knots xs→vs (clamped). */
function interp(x: number, xs: number[], vs: number[]): number {
  if (x <= xs[0]) return vs[0]
  if (x >= xs[xs.length - 1]) return vs[vs.length - 1]
  for (let i = 1; i < xs.length; i++)
    if (x <= xs[i]) return vs[i - 1] + ((vs[i] - vs[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1])
  return vs[vs.length - 1]
}

// Table 208-4 (Na) and 208-5 (Nv): knots at the listed closest-distance values.
const NA_DIST = [2, 5, 10]
const NA: Record<SeismicSource, number[]> = { A: [1.5, 1.2, 1.0], B: [1.3, 1.0, 1.0], C: [1.0, 1.0, 1.0] }
const NV_DIST = [2, 5, 10, 15]
const NV: Record<SeismicSource, number[]> = { A: [2.0, 1.6, 1.2, 1.0], B: [1.6, 1.2, 1.0, 1.0], C: [1.0, 1.0, 1.0, 1.0] }

/** Near-source factors Na, Nv (Zone 4) for a source type and closest distance (km). */
export function nearSourceFactors(source: SeismicSource, distanceKm: number): { Na: number; Nv: number } {
  return { Na: interp(distanceKm, NA_DIST, NA[source]), Nv: interp(distanceKm, NV_DIST, NV[source]) }
}

// Table 208-7 (Ca) / 208-8 (Cv) base values by soil & zone (pre near-source factor).
const CA: Record<SoilProfile, Record<SeismicZone, number>> = {
  SA: { 2: 0.16, 4: 0.32 }, SB: { 2: 0.20, 4: 0.40 }, SC: { 2: 0.24, 4: 0.40 },
  SD: { 2: 0.28, 4: 0.44 }, SE: { 2: 0.34, 4: 0.36 },
}
const CV: Record<SoilProfile, Record<SeismicZone, number>> = {
  SA: { 2: 0.16, 4: 0.32 }, SB: { 2: 0.20, 4: 0.40 }, SC: { 2: 0.32, 4: 0.56 },
  SD: { 2: 0.40, 4: 0.64 }, SE: { 2: 0.64, 4: 0.96 },
}

/** Seismic coefficients Ca, Cv (× Na/Nv in Zone 4). */
export function seismicCoefficients(zone: SeismicZone, soil: SoilProfile, Na = 1, Nv = 1): { Ca: number; Cv: number } {
  const f = zone === 4 ? { na: Na, nv: Nv } : { na: 1, nv: 1 }
  return { Ca: CA[soil][zone] * f.na, Cv: CV[soil][zone] * f.nv }
}

/** Importance factor I, Table 208-1. */
export function importanceFactor(o: Occupancy): number {
  return o === 'essential' || o === 'hazardous' ? 1.5 : o === 'special' ? 1.25 : 1.0
}

/** Common lateral-force-resisting systems and their R (Table 208-11). */
export interface StructuralSystem { id: string; name: string; R: number; omega0: number }
export const STRUCTURAL_SYSTEMS: StructuralSystem[] = [
  { id: 'smrf-concrete', name: 'Special RC moment frame (SMRF)', R: 8.5, omega0: 2.8 },
  { id: 'smf-steel', name: 'Special steel moment frame (SMF)', R: 8.0, omega0: 3.0 },
  { id: 'imrf-concrete', name: 'Intermediate RC moment frame (IMRF)', R: 5.5, omega0: 2.8 },
  { id: 'omrf-concrete', name: 'Ordinary RC moment frame (OMRF)', R: 3.5, omega0: 2.8 },
  { id: 'omf-steel', name: 'Ordinary steel moment frame (OMF)', R: 4.5, omega0: 3.0 },
  { id: 'dual-smrf-wall', name: 'Dual: SMRF + special RC shear walls', R: 8.5, omega0: 2.8 },
  { id: 'bf-special-wall', name: 'Building frame: special RC shear walls', R: 5.5, omega0: 2.8 },
  { id: 'bearing-special-wall', name: 'Bearing wall: special RC shear walls', R: 4.5, omega0: 2.8 },
  { id: 'bearing-ordinary-wall', name: 'Bearing wall: ordinary RC shear walls', R: 4.5, omega0: 2.8 },
  { id: 'braced-steel', name: 'Building frame: special steel braced frame', R: 6.0, omega0: 2.2 },
]

export interface NscpSeismicParams {
  Z: number; Na: number; Nv: number; Ca: number; Cv: number; I: number; R: number
}

/** Resolve all NSCP 208 parameters from the wizard selections. */
export function nscpSeismicParams(p: {
  zone: SeismicZone; soil: SoilProfile; occupancy: Occupancy; R: number;
  source?: SeismicSource; distanceKm?: number;
}): NscpSeismicParams {
  const Z = p.zone === 4 ? 0.4 : 0.2
  const { Na, Nv } = p.zone === 4 ? nearSourceFactors(p.source ?? 'C', p.distanceKm ?? 10) : { Na: 1, Nv: 1 }
  const { Ca, Cv } = seismicCoefficients(p.zone, p.soil, Na, Nv)
  return { Z, Na, Nv, Ca, Cv, I: importanceFactor(p.occupancy), R: p.R }
}

export interface BaseShearCoeff {
  Csraw: number; Csmax: number; Csmin: number; Cszone4: number
  Cs: number; governs: 'basic' | 'max-cap' | 'min-floor' | 'zone4-floor'
}

/** Design base-shear coefficient Cs = V/W for a fundamental period T (§208.5.2.1). */
export function baseShearCoeff(p: { Ca: number; Cv: number; I: number; R: number; T: number; Z: number; Nv: number }): BaseShearCoeff {
  const Csraw = (p.Cv * p.I) / (p.R * p.T)
  const Csmax = (2.5 * p.Ca * p.I) / p.R
  const Csmin = 0.11 * p.Ca * p.I
  const Cszone4 = p.Z >= 0.4 ? (0.8 * p.Z * p.Nv * p.I) / p.R : 0
  const capped = Math.min(Csraw, Csmax)
  const Cs = Math.max(Csmin, Cszone4, capped)
  const governs = Cs === Cszone4 && Cszone4 > 0 ? 'zone4-floor'
    : Cs === Csmin ? 'min-floor'
      : capped === Csmax ? 'max-cap' : 'basic'
  return { Csraw, Csmax, Csmin, Cszone4, Cs, governs }
}
