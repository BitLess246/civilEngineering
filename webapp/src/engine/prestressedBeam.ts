// Prestressed (pretensioned, bonded) beam engine — ACI 318-14 / NSCP 2015
// with PCI-handbook loss estimates. Units: mm, mm², MPa, kN, kN·m, m.
//
// Pipeline: section properties → prestress losses (ES + CR + SH + RE) →
// extreme-fibre stresses at TRANSFER (Pi + self-weight) vs §24.5.3 limits and
// at SERVICE (Pe + total moment) vs the §24.5.4 class-U/T/C tension bounds →
// flexural strength with fps per §20.3.2.3.1 (bonded, γp table) → φMn vs Mu
// and the §9.6.2.1 φMn ≥ 1.2Mcr guard → Vci/Vcw web/flexure shear (§22.5.8.3)
// → midspan camber/deflection. Rectangular or direct (A, I, yt, yb) sections.

export interface PrestressedInput {
  // section: rectangular b×h OR direct properties
  b?: number; h: number
  A?: number; I?: number; yt?: number; yb?: number   // mm², mm⁴, mm
  span: number                    // m, simple span
  fc: number; fci: number         // MPa (28-day / at transfer)
  // tendons (pretensioned, bonded)
  Aps: number                     // mm²
  fpu: number; fpy?: number       // MPa (fpy default 0.9fpu low-relaxation)
  fpj?: number                    // jacking/initial stress (default 0.74fpu)
  e: number                       // midspan tendon eccentricity below centroid, mm
  Ep?: number                     // MPa, default 196500
  // loads (unfactored, kN/m) — self-weight auto from A·γc
  wSDL: number; wLL: number
  gammaC?: number                 // kN/m³, default 24
  RH?: number                     // ambient relative humidity %, default 75
  VS?: number                     // volume/surface ratio mm, default 38
  /** Serviceability class per §24.5.2 (default 'U'). */
  klass?: 'U' | 'T' | 'C'
}

export interface FibreStress { top: number; bot: number }   // MPa, +compression
export interface PrestressedResult {
  A: number; I: number; yt: number; yb: number; St: number; Sb: number
  wSW: number                     // kN/m
  Msw: number; Msdl: number; Mll: number; Mserv: number; Mu: number   // kN·m
  // losses (MPa on the tendon)
  fpi: number; ES: number; CR: number; SH: number; RE: number
  lossTotal: number; lossPct: number
  fse: number; Pi: number; Pe: number         // MPa, kN, kN
  // stresses (+compression, MPa)
  transfer: FibreStress; service: FibreStress
  limTransferC: number; limTransferT: number  // 0.60f'ci / 0.25√f'ci
  limServiceC: number; limServiceT: number    // 0.60f'c / class tension bound
  transferOK: boolean; serviceOK: boolean
  // strength
  rhoP: number; fps: number; a: number; c: number; dp: number
  phi: number; phiMn: number; strengthOK: boolean
  fr: number; Mcr: number; crackingOK: boolean   // φMn ≥ 1.2Mcr
  // shear at the critical section (h/2 → use d/2 from face ≈ dp/2 practical)
  Vu: number; Vci: number; Vcw: number; Vc: number; shearNote: string
  // deflection, mm (+down)
  camber: number; deltaLoad: number; deltaNet: number
  ok: boolean
  notes: string[]
}

const beta1 = (fc: number) => (fc <= 28 ? 0.85 : Math.max(0.65, 0.85 - (0.05 * (fc - 28)) / 7))

export function designPrestressed(i: PrestressedInput): PrestressedResult {
  const notes: string[] = []
  const Ep = i.Ep ?? 196500
  const gammaC = i.gammaC ?? 24
  // ── section properties ──
  const rect = !(i.A && i.I && i.yt && i.yb)
  const A = rect ? (i.b ?? 300) * i.h : i.A!
  const I = rect ? ((i.b ?? 300) * i.h ** 3) / 12 : i.I!
  const yt = rect ? i.h / 2 : i.yt!
  const yb = rect ? i.h / 2 : i.yb!
  const St = I / yt, Sb = I / yb

  // ── moments (simple span) ──
  const L = i.span
  const wSW = (A / 1e6) * gammaC
  const M = (w: number) => (w * L * L) / 8
  const Msw = M(wSW), Msdl = M(i.wSDL), Mll = M(i.wLL)
  const Mserv = Msw + Msdl + Mll
  const Mu = M(1.2 * (wSW + i.wSDL) + 1.6 * i.wLL)

  // ── losses (PCI general method, low-relaxation strand) ──
  const fpy = i.fpy ?? 0.9 * i.fpu
  const fpj = i.fpj ?? 0.74 * i.fpu
  const Eci = 4700 * Math.sqrt(i.fci)
  const Ec = 4700 * Math.sqrt(i.fc)
  // elastic shortening: fcir at the cgs under Pi — fixed-point on
  // Pi = (fpj − ES(Pi))·Aps (converges in a few passes)
  let Pi = (0.9 * fpj * i.Aps) / 1000
  let ES = 0
  const fcir = () => (Pi * 1000) / A + (Pi * 1000 * i.e * i.e) / I - (Msw * 1e6 * i.e) / I
  for (let k = 0; k < 12; k++) {
    ES = (Ep / Eci) * fcir()
    Pi = ((fpj - ES) * i.Aps) / 1000
  }
  const fpi = fpj - ES
  // creep: CR = 2.0(Ep/Ec)(fcir − fcds), fcds from superimposed dead load
  const fcds = (Msdl * 1e6 * i.e) / I
  const CR = Math.max(0, 2.0 * (Ep / Ec) * (fcir() - fcds))
  // shrinkage: SH = 8.2e-6·Ep(1 − 0.06·V/S/25.4·? ) — PCI (SI): 8.2e-6·Ksh·Ep(1−0.0236·V/S[in])·(100−RH)
  const VSin = (i.VS ?? 38) / 25.4
  const SH = 8.2e-6 * Ep * (1 - 0.06 * VSin) * (100 - (i.RH ?? 75))
  // relaxation (low-relaxation): RE = [Kre − J(SH+CR+ES)]·C ≈ 35 MPa class → use
  // Kre = 35 MPa, J = 0.04, C ≈ 1 for fpj/fpu = 0.74
  const RE = Math.max(0, 35 - 0.04 * (SH + CR + ES))
  const lossTotal = ES + CR + SH + RE
  const fse = fpj - lossTotal
  const lossPct = (lossTotal / fpj) * 100
  if (fse > 0.8 * fpy) notes.push('fse exceeds 0.80fpy — check the jacking stress')
  const Pe = (fse * i.Aps) / 1000

  // ── fibre stresses (+compression) ──
  const sigma = (P: number, Mext: number): FibreStress => ({
    top: (P * 1000) / A - (P * 1000 * i.e) / St + (Mext * 1e6) / St,
    bot: (P * 1000) / A + (P * 1000 * i.e) / Sb - (Mext * 1e6) / Sb,
  })
  const transfer = sigma(Pi, Msw)
  const service = sigma(Pe, Mserv)
  const limTransferC = 0.60 * i.fci
  const limTransferT = 0.25 * Math.sqrt(i.fci)        // §24.5.3.2 (midspan)
  const limServiceC = 0.60 * i.fc                     // §24.5.4.1 total load
  const limServiceT = (i.klass ?? 'U') === 'U' ? 0.62 * Math.sqrt(i.fc)
    : (i.klass === 'T' ? 1.0 * Math.sqrt(i.fc) : Infinity)
  const okF = (s: FibreStress, limC: number, limT: number) =>
    s.top <= limC + 1e-9 && s.bot <= limC + 1e-9 && s.top >= -limT - 1e-9 && s.bot >= -limT - 1e-9
  const transferOK = okF(transfer, limTransferC, limTransferT)
  const serviceOK = okF(service, limServiceC, limServiceT)

  // ── flexural strength (bonded, §20.3.2.3.1) ──
  const dp = yt + i.e
  const b = i.b ?? A / i.h
  const rhoP = i.Aps / (b * dp)
  const gp = fpy / i.fpu >= 0.9 ? 0.28 : fpy / i.fpu >= 0.85 ? 0.40 : 0.55
  const b1 = beta1(i.fc)
  const fps = i.fpu * (1 - (gp / b1) * (rhoP * i.fpu) / i.fc)
  const a = (i.Aps * fps) / (0.85 * i.fc * b)
  const c = a / b1
  const et = (0.003 * (dp - c)) / c
  const phi = et >= 0.005 ? 0.90 : et <= 0.002 ? 0.65 : 0.65 + (0.25 * (et - 0.002)) / 0.003
  const phiMn = (phi * i.Aps * fps * (dp - a / 2)) / 1e6
  const strengthOK = phiMn + 1e-9 >= Mu
  // cracking moment (bottom fibre): Mcr = (fr + Pe/A + Pe·e/Sb)·Sb
  const fr = 0.62 * Math.sqrt(i.fc)
  const Mcr = ((fr + (Pe * 1000) / A + (Pe * 1000 * i.e) / Sb) * Sb) / 1e6
  const crackingOK = phiMn + 1e-9 >= 1.2 * Mcr
  if (!crackingOK) notes.push('φMn < 1.2Mcr (§9.6.2.1) — add strands or bonded steel')

  // ── shear at x = h/2 from support (§22.5.8.3) ──
  const x = Math.max(i.h / 1000 / 2, 0.05)
  const wu = 1.2 * (wSW + i.wSDL) + 1.6 * i.wLL
  const Vu = wu * (L / 2 - x)
  const MuX = (wu * x * (L - x)) / 2
  const VuX = Vu
  const bw = b
  // Vci = 0.05λ√f'c·bw·dp + Vd + Vi·Mcre/Mmax  (≥ 0.17√f'c·bw·dp)
  const wd = wSW + i.wSDL
  const Vd = wd * (L / 2 - x)
  const Md = (wd * x * (L - x)) / 2
  const fpe = (Pe * 1000) / A + (Pe * 1000 * i.e) / Sb
  const fd = (Md * 1e6) / Sb
  const Mcre = (Sb * (0.5 * Math.sqrt(i.fc) + fpe - fd)) / 1e6
  const Vi = VuX - Vd
  const Mmax = MuX - Md
  const dpv = Math.max(dp, 0.8 * i.h)
  let Vci = (0.05 * Math.sqrt(i.fc) * bw * dpv) / 1000 + Vd + (Mmax > 1e-9 ? (Vi * Mcre) / Mmax : Infinity)
  Vci = Math.max(Vci, (0.17 * Math.sqrt(i.fc) * bw * dpv) / 1000)
  // Vcw = (0.29λ√f'c + 0.3fpc)·bw·dp
  const fpc = (Pe * 1000) / A
  const Vcw = ((0.29 * Math.sqrt(i.fc) + 0.3 * fpc) * bw * dpv) / 1000
  const Vc = Math.min(Vci, Vcw)
  const shearNote = Vci <= Vcw ? 'Vci governs (flexure-shear)' : 'Vcw governs (web-shear)'

  // ── deflection (midspan): camber up from Pe·e, load down ──
  const EcI = Ec * I   // N·mm²
  const camber = (Pe * 1000 * i.e * (L * 1000) ** 2) / (8 * EcI)
  const deltaLoad = (5 * (wSW + i.wSDL + i.wLL) * (L * 1000) ** 4) / (384 * EcI * 1000)
  const deltaNet = deltaLoad - camber

  const ok = transferOK && serviceOK && strengthOK && crackingOK
  return {
    A, I, yt, yb, St, Sb, wSW, Msw, Msdl, Mll, Mserv, Mu,
    fpi, ES, CR, SH, RE, lossTotal, lossPct, fse, Pi, Pe,
    transfer, service, limTransferC, limTransferT, limServiceC, limServiceT, transferOK, serviceOK,
    rhoP, fps, a, c, dp, phi, phiMn, strengthOK, fr, Mcr, crackingOK,
    Vu: VuX, Vci, Vcw, Vc, shearNote,
    camber, deltaLoad, deltaNet, ok, notes,
  }
}
