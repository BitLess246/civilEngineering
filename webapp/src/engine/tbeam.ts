// T-beam / L-beam flexural design — ACI 318-14 / NSCP 2015.
// Units: mm, mm², MPa, kN·m. Positive moment puts the flange in compression.
//
// Effective flange width per ACI Table 6.3.2.1 (NSCP §406.3.2): overhang each
// side ≤ min(8hf, sw/2, ln/8) for interior Ts, ≤ min(6hf, sw/2, ln/12) one
// side for edge (L) beams; isolated Ts must satisfy hf ≥ bw/2, bf ≤ 4bw
// (§6.3.2.2). Flexure follows the classic two-couple split: flange overhang
// couple Asf = 0.85f'c(bf−bw)hf/fy plus a web rectangle for the remainder
// (§22.2); φ from εt (§21.2.2); As,min per §9.6.1.2 (with the 2bw rule when a
// flange is in tension on statically determinate spans).

export type TBeamKind = 'interior' | 'edge' | 'isolated'

export interface TBeamInput {
  kind: TBeamKind
  bw: number; h: number; hf: number   // web width, total depth, flange thickness
  bfGiven?: number                    // flange width; omit to derive from ln/sw
  ln?: number                         // clear span, m (for bf table)
  sw?: number                         // clear web-to-web spacing, m
  cover: number; stirrupDia: number; barDia: number
  fc: number; fy: number
  Mu: number                          // kN·m (+ = flange in compression)
  /** Analyze a given steel area instead of designing. */
  AsGiven?: number
  /** Flange in tension & statically determinate → §9.6.1.2(b) min-steel rule. */
  determinate?: boolean
}

export interface TBeamResult {
  bf: number; bfGovern: string
  d: number; dt: number
  isolatedOK: boolean                 // §6.3.2.2 limits (isolated only)
  MnfPhi: number                      // φ·flange-couple capacity at a = hf, kN·m
  tBehavior: boolean                  // a > hf → true T behaviour
  a: number; c: number; et: number; phi: number
  Asf: number; Asw: number; As: number      // required (design) or given (analyze)
  AsMin: number; minGoverns: boolean
  AsMax: number                       // tension-controlled cap (εt = 0.005)
  bars: number; layers: number[]; sClear: number; sClearMin: number
  phiMn: number                       // capacity at the FINAL As, kN·m
  ok: boolean
  notes: string[]
}

const ES = 200000
export const beta1 = (fc: number) => (fc <= 28 ? 0.85 : Math.max(0.65, 0.85 - (0.05 * (fc - 28)) / 7))

/** Effective flange width, mm — ACI Table 6.3.2.1 / §6.3.2.2. */
export function effectiveFlange(i: TBeamInput): { bf: number; govern: string; isolatedOK: boolean } {
  const lnMm = (i.ln ?? 0) * 1000, swMm = (i.sw ?? 0) * 1000
  if (i.kind === 'isolated') {
    const bf = Math.min(i.bfGiven ?? 4 * i.bw, 4 * i.bw)
    return { bf, govern: 'isolated: bf ≤ 4bw (§6.3.2.2)', isolatedOK: i.hf >= i.bw / 2 && bf <= 4 * i.bw }
  }
  const per = i.kind === 'interior'
    ? [8 * i.hf, swMm > 0 ? swMm / 2 : Infinity, lnMm > 0 ? lnMm / 8 : Infinity]
    : [6 * i.hf, swMm > 0 ? swMm / 2 : Infinity, lnMm > 0 ? lnMm / 12 : Infinity]
  const over = Math.min(...per)
  const labels = i.kind === 'interior' ? ['8hf', 'sw/2', 'ln/8'] : ['6hf', 'sw/2', 'ln/12']
  const govern = labels[per.indexOf(over)]
  const sides = i.kind === 'interior' ? 2 : 1
  let bf = i.bw + sides * (Number.isFinite(over) ? over : 0)
  if (i.bfGiven && i.bfGiven > 0) bf = Math.min(bf, i.bfGiven)
  return { bf, govern: `overhang = ${govern} (Table 6.3.2.1)`, isolatedOK: true }
}

/** φMn of a T section with steel As (positive moment). Returns a possibly
 *  web-penetrating stress block from force equilibrium. */
export function tBeamCapacity(
  i: Pick<TBeamInput, 'bw' | 'hf' | 'fc' | 'fy'>, bf: number, d: number, dt: number, As: number,
): { a: number; c: number; et: number; phi: number; phiMn: number; tBehavior: boolean } {
  const T = As * i.fy
  const Cflange = 0.85 * i.fc * bf * i.hf
  let a: number, Mn: number
  if (T <= Cflange) {
    a = T / (0.85 * i.fc * bf)
    Mn = T * (d - a / 2)
  } else {
    // block into the web: overhangs full at hf, web block depth a
    const Cover = 0.85 * i.fc * (bf - i.bw) * i.hf
    a = (T - Cover) / (0.85 * i.fc * i.bw)
    Mn = Cover * (d - i.hf / 2) + (T - Cover) * (d - a / 2)
  }
  const c = a / beta1(i.fc)
  const et = (0.003 * (dt - c)) / c
  const ety = i.fy / ES
  const phi = et >= 0.005 ? 0.90 : et <= ety ? 0.65 : 0.65 + (0.25 * (et - ety)) / (0.005 - ety)
  return { a, c, et, phi, phiMn: (phi * Mn) / 1e6, tBehavior: a > i.hf }
}

export function designTBeam(i: TBeamInput): TBeamResult {
  const notes: string[] = []
  const { bf, govern, isolatedOK } = effectiveFlange(i)
  const Ab = (Math.PI / 4) * i.barDia ** 2
  const dt = i.h - i.cover - i.stirrupDia - i.barDia / 2
  let d = dt                                  // refined after layering
  const b1 = beta1(i.fc)

  // tension-controlled steel cap (c = 3/8·dt): block may enter the web
  const cTC = (3 / 8) * dt
  const aTC = b1 * cTC
  const CcTC = aTC <= i.hf
    ? 0.85 * i.fc * bf * aTC
    : 0.85 * i.fc * ((bf - i.bw) * i.hf + i.bw * aTC)
  const AsMax = CcTC / i.fy

  // §9.6.1.2: As,min = max(0.25√f'c, 1.4)/fy · bw·d; flange-in-tension
  // determinate spans use bw → min(2bw, bf) (§9.6.1.2(b) via Mu < 0 case).
  const bwMin = i.Mu < 0 && i.determinate ? Math.min(2 * i.bw, bf) : i.bw
  const AsMin = (Math.max(0.25 * Math.sqrt(i.fc), 1.4) / i.fy) * bwMin * d

  // φ·capacity with the block exactly filling the flange — the T/rect switch
  const MnfPhi = (0.90 * 0.85 * i.fc * bf * i.hf * (d - i.hf / 2)) / 1e6

  let As: number, Asf = 0, Asw: number
  const MuAbs = Math.abs(i.Mu)
  if (i.AsGiven && i.AsGiven > 0) {
    As = i.AsGiven
    Asw = As
  } else if (i.Mu < 0) {
    // flange in tension → rectangular web design, b = bw
    const Rn = (MuAbs * 1e6) / (0.9 * i.bw * d * d)
    const disc = 1 - (2 * Rn) / (0.85 * i.fc)
    if (disc <= 0) notes.push('web section inadequate for the hogging moment — enlarge bw/h')
    const rho = disc > 0 ? ((0.85 * i.fc) / i.fy) * (1 - Math.sqrt(disc)) : AsMax / (i.bw * d)
    As = Math.max(rho * i.bw * d, AsMin)
    Asw = As
  } else if (MuAbs * 1e6 <= 0.9 * 0.85 * i.fc * bf * i.hf * (d - i.hf / 2)) {
    // a ≤ hf → rectangular with b = bf
    const Rn = (MuAbs * 1e6) / (0.9 * bf * d * d)
    const rho = ((0.85 * i.fc) / i.fy) * (1 - Math.sqrt(Math.max(0, 1 - (2 * Rn) / (0.85 * i.fc))))
    As = Math.max(rho * bf * d, AsMin)
    Asw = As
  } else {
    // true T: flange-overhang couple + web rectangle for the remainder
    Asf = (0.85 * i.fc * (bf - i.bw) * i.hf) / i.fy
    const Muf = (0.90 * Asf * i.fy * (d - i.hf / 2)) / 1e6
    const Muw = MuAbs - Muf
    const Rn = (Muw * 1e6) / (0.9 * i.bw * d * d)
    const disc = 1 - (2 * Rn) / (0.85 * i.fc)
    if (disc <= 0) notes.push('web remainder exceeds singly-reinforced capacity — enlarge the section')
    const rho = disc > 0 ? ((0.85 * i.fc) / i.fy) * (1 - Math.sqrt(disc)) : 0
    Asw = rho * i.bw * d
    As = Math.max(Asf + Asw, AsMin)
  }
  const minGoverns = !(i.AsGiven && i.AsGiven > 0) && As <= AsMin + 1e-9

  // bar layout in the web: fit per layer with §25.2.1 clear spacing
  const bars = Math.max(2, Math.ceil(As / Ab))
  const sClearMin = Math.max(25, i.barDia)
  const web = i.bw - 2 * (i.cover + i.stirrupDia)
  const perLayer = Math.max(2, Math.floor((web + sClearMin) / (i.barDia + sClearMin)))
  const layers: number[] = []
  for (let left = bars; left > 0; left -= perLayer) layers.push(Math.min(perLayer, left))
  const sClear = layers[0] > 1 ? (web - layers[0] * i.barDia) / (layers[0] - 1) : web
  if (layers.length > 1) {
    // shift d to the group centroid (25 mm clear between layers)
    const pitch = i.barDia + 25
    const n = layers.reduce((s, x) => s + x, 0)
    const yBar = layers.reduce((s, x, k) => s + x * k * pitch, 0) / n
    d = dt - yBar
    notes.push(`${layers.length} bar layers — d reduced to the group centroid`)
  }

  const AsProv = bars * Ab
  const capAs = i.AsGiven && i.AsGiven > 0 ? i.AsGiven : AsProv
  const cap = tBeamCapacity(i, i.Mu < 0 ? i.bw : bf, d, dt, capAs)
  const tcOK = capAs <= AsMax + 1e-9
  if (!tcOK) notes.push('As exceeds the tension-controlled cap (εt < 0.005) — enlarge the section')

  const ok = cap.phiMn + 1e-9 >= MuAbs && tcOK && isolatedOK
    && !notes.some((n) => n.includes('inadequate') || n.includes('exceeds'))

  return {
    bf, bfGovern: govern, d, dt, isolatedOK,
    MnfPhi, tBehavior: cap.tBehavior,
    a: cap.a, c: cap.c, et: cap.et, phi: cap.phi,
    Asf, Asw, As, AsMin, minGoverns, AsMax,
    bars, layers, sClear, sClearMin,
    phiMn: cap.phiMn, ok, notes,
  }
}
