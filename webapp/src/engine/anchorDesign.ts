// ─────────────────────────────────────────────────────────────────────────
// CAST-IN ANCHORS IN CONCRETE — ACI 318-14 Chapter 17 (NSCP 2015 §417), SI.
//
// A rectangular group of cast-in headed (or hooked) anchors under a factored
// group tension Nua and shear Vua, checked for every failure mode the chapter
// lists, each against its own φ:
//
//   tension  steel §17.4.1        Nsa  = Ase,N·futa                       φ 0.75
//            breakout §17.4.2     Ncbg = ANc/ANco·ψec·ψed·ψc·ψcp·Nb       φ 0.70
//            pullout §17.4.3      Npn  = ψc,P·Np  (8·Abrg·f′c headed)     φ 0.70
//            side-face §17.4.4    Nsb  = 13·ca1·√Abrg·λa·√f′c             φ 0.70
//   shear    steel §17.5.1        Vsa  = 0.6·Ase,V·futa (×0.8 grout pad)  φ 0.65
//            breakout §17.5.2     Vcbg = AVc/AVco·ψed·ψc·ψh·Vb            φ 0.70
//            pryout §17.5.3       Vcpg = kcp·Ncbg                         φ 0.70
//   interaction §17.6             N/φNn + V/φVn ≤ 1.2 (each alone if the other ≤ 0.2)
//
// Concrete is taken CRACKED (ψc,N = ψc,P = 1.0), Condition B (no supplementary
// reinforcement credited) — the conservative reading for a column base. Where
// the anchors sit within 1.5·hef of three or more edges — every pedestal —
// §17.4.2.3 replaces hef with h′ef = max(ca,max/1.5, s/3) throughout. Under
// seismic load §17.2.3.4.4 multiplies the concrete tension modes by 0.75.
// Shear is checked toward the NEAREST edge with the whole Vua on the front row
// (R17.5.2.1, oversized holes) — direction-free and conservative.
//
// Units: mm, N inside; kN at the interface. Pure.
// ─────────────────────────────────────────────────────────────────────────

export type AnchorHead = 'headed' | 'hooked'

export interface AnchorGroupInput {
  /** Anchors per row along x and along y (a 2 × 2 group is four rods). */
  nx: number; ny: number
  /** Centre-to-centre spacing along x and along y, mm. */
  sx: number; sy: number
  /** Edge distances from the outermost anchors to the concrete edges, mm:
   *  [−x, +x, −y, +y]. Infinity where there is no edge. */
  edges: [number, number, number, number]
  /** Effective embedment, mm. */
  hef: number
  /** Rod diameter, mm. */
  da: number
  /** Rod tensile and yield strength, MPa. */
  futa: number; fya: number
  /** Concrete f′c, MPa; member depth in the direction of the embedment, mm. */
  fc: number; ha?: number
  head?: AnchorHead
  /** Hooked anchors: inside length of the hook eh, mm (3da … 4.5da). */
  eh?: number
  /** Factored group tension Nua and shear Vua, kN. */
  Nua: number; Vua: number
  /** Seismic design: concrete tension modes × 0.75 (§17.2.3.4.4). */
  seismic?: boolean
  /** Base plate on a grout pad: steel shear × 0.8 (§17.5.1.3). Default true. */
  groutPad?: boolean
  /** Edge reinforcement for ψc,V (§17.5.2.7): none 1.0, bars ≥ ⌀12 1.2,
   *  bars + ties ≤ 100 mm 1.4. Default 'none'. */
  edgeReinf?: 'none' | 'bars' | 'bars+ties'
  lambdaA?: number
}

export interface AnchorMode { phiN: number; util: number; clause: string }

export interface AnchorGroupResult {
  n: number
  /** The embedment the concrete modes used, mm — h′ef where §17.4.2.3 applies. */
  hefUsed: number
  Ase: number; Abrg: number
  tension: { steel: AnchorMode; breakout: AnchorMode; pullout: AnchorMode; sideFace: AnchorMode | null }
  shear: { steel: AnchorMode; breakout: AnchorMode; pryout: AnchorMode }
  phiNn: number; phiVn: number
  /** §17.6 interaction value (≤ 1.2 passes) and its utilisation against 1.2. */
  interaction: number
  /** The governing utilisation over every mode and the interaction (≤ 1 passes). */
  util: number
  governs: string
  /** §17.7: spacing ≥ 4da, edge ≥ 6da (torqued cast-in). */
  spacingOK: boolean; edgeOK: boolean
  ok: boolean
}

const PHI_STEEL_N = 0.75, PHI_STEEL_V = 0.65, PHI_CONC = 0.70

/** Thread pitch, mm — ISO coarse, and UNC for the inch rods (25 ≈ 1″, 8 tpi). */
const PITCH: Record<number, number> = { 12: 1.75, 16: 2, 20: 2.5, 22: 2.5, 24: 3, 25: 3.175, 27: 3, 30: 3.5, 32: 3.5, 36: 4 }
/** Effective (tensile stress) area of a threaded rod, mm²: π/4·(d − 0.9382p)². */
export const anchorAse = (da: number): number => {
  const p = PITCH[da] ?? da / 8
  return (Math.PI / 4) * (da - 0.9382 * p) ** 2
}
/** Bearing area of a heavy hex nut, mm²: hexagon across flats 1.625·da less the rod. */
export const heavyHexAbrg = (da: number): number => {
  const F = 1.625 * da
  return (Math.sqrt(3) / 2) * F * F - (Math.PI / 4) * da * da
}

export function checkAnchorGroup(i: AnchorGroupInput): AnchorGroupResult {
  const n = i.nx * i.ny
  const lam = i.lambdaA ?? 1
  const sqfc = Math.sqrt(i.fc)
  const head = i.head ?? 'headed'
  const futa = Math.min(i.futa, 1.9 * i.fya, 860)
  const Ase = anchorAse(i.da)
  const Abrg = heavyHexAbrg(i.da)
  const Lx = (i.nx - 1) * i.sx, Ly = (i.ny - 1) * i.sy
  const [cxm, cxp, cym, cyp] = i.edges
  const seis = i.seismic ? 0.75 : 1
  const Nua = Math.max(0, i.Nua) * 1000, Vua = Math.max(0, i.Vua) * 1000

  // ── §17.4.2.3: three or more edges inside 1.5·hef → h′ef ──
  const near = i.edges.filter((c) => c < 1.5 * i.hef).length
  const caMax = Math.max(...i.edges.filter(Number.isFinite))
  const h = near >= 3 ? Math.min(i.hef, Math.max(caMax / 1.5, Math.max(i.sx, i.sy) / 3)) : i.hef

  // ── tension ──
  const steelN = n * Ase * futa
  const ANc = (Math.min(cxm, 1.5 * h) + Lx + Math.min(cxp, 1.5 * h)) * (Math.min(cym, 1.5 * h) + Ly + Math.min(cyp, 1.5 * h))
  const ANco = 9 * h * h
  const Nb = h >= 280 && h <= 635 ? 3.9 * lam * sqfc * h ** (5 / 3) : 10 * lam * sqfc * h ** 1.5   // §17.4.2.2
  const caMin = Math.min(...i.edges)
  const psiEdN = caMin >= 1.5 * h ? 1 : 0.7 + (0.3 * caMin) / (1.5 * h)
  const Ncbg = (Math.min(ANc, n * ANco) / ANco) * psiEdN * 1.0 * 1.0 * Nb
  const Np = head === 'headed' ? 8 * Abrg * i.fc : 0.9 * i.fc * Math.min(Math.max(i.eh ?? 4.5 * i.da, 3 * i.da), 4.5 * i.da) * i.da
  const pullout = n * Np   // ψc,P = 1.0 cracked
  // side-face blowout (headed, deep anchors near an edge): the row along the
  // nearest edge, with its share of the tension
  let side: AnchorMode | null = null
  if (head === 'headed') {
    const rows: { ca1: number; ca2: number; s: number; k: number }[] = [
      { ca1: cxm, ca2: Math.min(cym, cyp), s: i.sy, k: i.ny }, { ca1: cxp, ca2: Math.min(cym, cyp), s: i.sy, k: i.ny },
      { ca1: cym, ca2: Math.min(cxm, cxp), s: i.sx, k: i.nx }, { ca1: cyp, ca2: Math.min(cxm, cxp), s: i.sx, k: i.nx },
    ]
    for (const r of rows) {
      if (!(i.hef > 2.5 * r.ca1)) continue
      let Nsb = 13 * r.ca1 * Math.sqrt(Abrg) * lam * sqfc
      if (r.ca2 < 3 * r.ca1) Nsb *= (1 + Math.min(3, Math.max(1, r.ca2 / r.ca1))) / 4
      const grp = r.k > 1 && r.s < 6 * r.ca1 ? (1 + r.s / (6 * r.ca1)) * Nsb : r.k * Nsb
      // as a capacity for the whole group's tension: the row carries k/n of it
      const cap = PHI_CONC * seis * grp * (n / r.k)
      const m: AnchorMode = { phiN: cap / 1000, util: Nua > 0 ? Nua / cap : 0, clause: '§17.4.4' }
      if (!side || m.util > side.util) side = m
    }
  }
  const mode = (cap: number, phi: number, demand: number, clause: string): AnchorMode =>
    ({ phiN: (phi * cap) / 1000, util: demand > 0 ? demand / (phi * cap) : 0, clause })
  const tSteel = mode(steelN, PHI_STEEL_N, Nua, '§17.4.1')
  const tBreak = mode(Ncbg, PHI_CONC * seis, Nua, '§17.4.2')
  const tPull = mode(pullout, PHI_CONC * seis, Nua, '§17.4.3')

  // ── shear, toward the nearest edge, the whole of it on the front row ──
  const steelV = n * 0.6 * Ase * futa * ((i.groutPad ?? true) ? 0.8 : 1)
  const ca1 = caMin
  const alongX = ca1 === cxm || ca1 === cxp            // the edge is perpendicular to x
  const ca2a = alongX ? cym : cxm, ca2b = alongX ? cyp : cxp
  const sPerp = alongX ? Ly : Lx
  const ha = i.ha ?? Infinity
  const AVc = (Math.min(ca2a, 1.5 * ca1) + sPerp + Math.min(ca2b, 1.5 * ca1)) * Math.min(ha, 1.5 * ca1)
  const AVco = 4.5 * ca1 * ca1
  const le = Math.min(i.hef, 8 * i.da)
  const Vb = Math.min(0.6 * (le / i.da) ** 0.2 * Math.sqrt(i.da) * lam * sqfc * ca1 ** 1.5, 3.7 * lam * sqfc * ca1 ** 1.5)
  const ca2 = Math.min(ca2a, ca2b)
  const psiEdV = ca2 >= 1.5 * ca1 ? 1 : 0.7 + (0.3 * ca2) / (1.5 * ca1)
  const psiCV = i.edgeReinf === 'bars+ties' ? 1.4 : i.edgeReinf === 'bars' ? 1.2 : 1.0
  const psiHV = ha < 1.5 * ca1 ? Math.max(1, Math.sqrt((1.5 * ca1) / ha)) : 1
  const Vcbg = (AVc / AVco) * psiEdV * psiCV * psiHV * Vb
  const kcp = h < 65 ? 1 : 2
  const vSteel = mode(steelV, PHI_STEEL_V, Vua, '§17.5.1')
  const vBreak = mode(Vcbg, PHI_CONC, Vua, '§17.5.2')
  const vPry = mode(kcp * Ncbg, PHI_CONC, Vua, '§17.5.3')

  const phiNn = Math.min(tSteel.phiN, tBreak.phiN, tPull.phiN, side ? side.phiN : Infinity)
  const phiVn = Math.min(vSteel.phiN, vBreak.phiN, vPry.phiN)
  const rN = Nua / 1000 / phiNn, rV = Vua / 1000 / phiVn
  // §17.6: each alone when the other is ≤ 20 % of its strength, else the sum ≤ 1.2
  const interaction = rV <= 0.2 ? rN : rN <= 0.2 ? rV : rN + rV
  const interUtil = rV <= 0.2 || rN <= 0.2 ? interaction : interaction / 1.2
  const modes: [string, number][] = [
    ['steel tension §17.4.1', tSteel.util], ['concrete breakout §17.4.2', tBreak.util], ['pullout §17.4.3', tPull.util],
    ...(side ? [['side-face blowout §17.4.4', side.util] as [string, number]] : []),
    ['steel shear §17.5.1', vSteel.util], ['shear breakout §17.5.2', vBreak.util], ['pryout §17.5.3', vPry.util],
    ['N–V interaction §17.6', interUtil],
  ]
  const [governs, util] = modes.reduce((a, b) => (b[1] > a[1] ? b : a))
  const spacingOK = (i.nx < 2 || i.sx >= 4 * i.da) && (i.ny < 2 || i.sy >= 4 * i.da)
  const edgeOK = caMin >= 6 * i.da
  return {
    n, hefUsed: h, Ase, Abrg,
    tension: { steel: tSteel, breakout: tBreak, pullout: tPull, sideFace: side },
    shear: { steel: vSteel, breakout: vBreak, pryout: vPry },
    phiNn, phiVn, interaction, util, governs, spacingOK, edgeOK,
    ok: util <= 1 + 1e-9 && spacingOK && edgeOK,
  }
}
