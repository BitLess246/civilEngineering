// ─────────────────────────────────────────────────────────────────────────
// Micropile — structural & geotechnical axial capacity (FHWA-NHI-05-039).
// A small-diameter drilled, grouted, reinforced pile. Allowable-stress design:
//   Structural compression  Pc,allow = 0.40·f′c·Agrout + 0.47·(Fy,bar·Abar + Fy,cas·Acas)
//   Structural tension       Pt,allow = 0.55·(Fy,bar·Abar + Fy,cas·Acas)   (grout: no tension)
//   Geotechnical bond        Qg = π·Dbond·Lbond·αbond ,  allow = Qg / FS
// where αbond = grout-to-ground ultimate bond strength (kPa), Dbond the bond-zone
// (drill) diameter, Lbond the bonded length. Governing axial allowable is the
// smaller of the structural and geotechnical values.
// Units: Ø/areas mm·mm²; f′c/Fy MPa; αbond kPa; lengths m; capacity kN.
// ─────────────────────────────────────────────────────────────────────────

const area = (dia: number) => (Math.PI / 4) * dia * dia      // mm²

export interface MicropileSection {
  barDia: number; fyBar: number               // reinforcing bar
  groutDia: number; fcGrout: number           // grout column (drill ID), MPa
  casingOD?: number; casingID?: number; fyCasing?: number   // optional steel casing
}

export interface MicropileAreas { Abar: number; Acasing: number; Agrout: number }

/** Component areas (mm²): bar, casing (OD²−ID² ring), and net grout. */
export function micropileAreas(s: MicropileSection): MicropileAreas {
  const Abar = area(s.barDia)
  const Acasing = s.casingOD && s.casingID ? area(s.casingOD) - area(s.casingID) : 0
  const Agrout = Math.max(area(s.groutDia) - Abar - Acasing, 0)
  return { Abar, Acasing, Agrout }
}

/** Allowable structural axial capacity (kN), compression or tension (FHWA ASD). */
export function micropileStructural(s: MicropileSection, mode: 'compression' | 'tension'): number {
  const { Abar, Acasing, Agrout } = micropileAreas(s)
  const fyCas = s.fyCasing ?? 248
  const steel = s.fyBar * Abar + fyCas * Acasing
  const P = mode === 'compression'
    ? 0.40 * s.fcGrout * Agrout + 0.47 * steel
    : 0.55 * steel                                  // grout carries no tension
  return P / 1000                                   // N → kN
}

/** Geotechnical grout-ground bond capacity: ultimate and allowable (kN). */
export function micropileBond(p: { bondDia: number; bondLength: number; alphaBond: number; FS?: number }): { Qult: number; Qall: number } {
  const Qult = Math.PI * p.bondDia * p.bondLength * p.alphaBond    // kN (m·m·kPa)
  return { Qult, Qall: Qult / (p.FS ?? 2.0) }
}

/** Bonded length (m) needed so the allowable bond carries the demand P. */
export function requiredBondLength(p: { P: number; bondDia: number; alphaBond: number; FS?: number }): number {
  const denom = Math.PI * p.bondDia * p.alphaBond
  return denom > 0 ? (p.P * (p.FS ?? 2.0)) / denom : Infinity
}

export interface MicropileResult {
  areas: MicropileAreas
  structural: number          // allowable structural, kN
  Qult: number; Qbond: number // bond ultimate & allowable, kN
  allowable: number           // governing min(structural, bond), kN
  governs: 'structural' | 'bond'
  fs: number                  // governing allowable / demand
  bondLengthReq: number       // m, for the bond FS at demand
  ok: boolean
}

/** Design a micropile: governing allowable vs the axial demand P (kN). */
export function designMicropile(p: {
  section: MicropileSection; mode: 'compression' | 'tension';
  bondDia: number; bondLength: number; alphaBond: number; FS?: number; P: number;
}): MicropileResult {
  const structural = micropileStructural(p.section, p.mode)
  const { Qult, Qall } = micropileBond({ bondDia: p.bondDia, bondLength: p.bondLength, alphaBond: p.alphaBond, FS: p.FS })
  const allowable = Math.min(structural, Qall)
  const governs = structural <= Qall ? 'structural' : 'bond'
  return {
    areas: micropileAreas(p.section),
    structural, Qult, Qbond: Qall, allowable, governs,
    fs: p.P > 0 ? allowable / p.P : Infinity,
    bondLengthReq: requiredBondLength({ P: p.P, bondDia: p.bondDia, alphaBond: p.alphaBond, FS: p.FS }),
    ok: allowable >= p.P,
  }
}
