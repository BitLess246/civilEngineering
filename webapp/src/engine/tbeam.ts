// T-beam / L-beam flexural design — ACI 318-14 / NSCP 2015.
// Units: mm, mm², MPa, kN·m. Positive moment puts the flange in compression.
//
// Effective flange width per ACI Table 6.3.2.1 (NSCP §406.3.2): overhang each
// side ≤ min(8hf, sw/2, ln/8) for interior Ts, ≤ min(6hf, sw/2, ln/12) one
// side for edge (L) beams; isolated Ts must satisfy hf ≥ bw/2, bf ≤ 4bw
// (§6.3.2.2).
//
// DESIGN ORDER — the compression block is the unknown, the steel follows.
// Moment equilibrium fixes how deep the block has to be; force equilibrium then
// says how much steel balances it. So `a` is what grows with Mu (continuously),
// and As is a consequence (§22.2.2.4.1: C = 0.85f'c·A_block, T = As·fy). The
// flange is spent first because it is the widest part of the section: while
// a ≤ hf the section is a plain rectangle of width bf, and only once the block
// has eaten the whole flange does it push into the web, at which point the
// overhangs stay full at hf and the web carries the remainder — the classic
// two-couple split, Asf = 0.85f'c(bf−bw)hf/fy plus a web rectangle.
//
// φ from εt (§21.2.2); As,min per §9.6.1.2 (with the 2bw rule when a flange is
// in tension on statically determinate spans).

import { splitLayers, centroidRise } from './barLayers'
import { beta1 } from './flexure'

export type TBeamKind = 'interior' | 'edge' | 'isolated'

export interface TBeamInput {
  kind: TBeamKind
  bw: number; h: number; hf: number   // web width, total depth, flange thickness
  bfGiven?: number                    // flange width; omit to derive from ln/sw
  ln?: number                         // clear span, m (for bf table)
  sw?: number                         // clear web-to-web spacing, m
  cover: number; stirrupDia: number; barDia: number
  /**
   * Effective depth d, mm — given rather than derived.
   *
   * A textbook problem states d; a drawing states h and the cover. When this
   * is set it pins BOTH the steel centroid (where T acts) and dt (where
   * §21.2.2 measures εt), because d alone cannot say how the bars are
   * arranged — and equating the two is the single-layer reading, which is the
   * conservative one: a smaller dt lowers εt, which lowers φ.
   *
   * The layout↔depth iteration is skipped while this is set; stacking bars no
   * longer moves d, because the caller has already said where the steel is.
   */
  dGiven?: number
  fc: number; fy: number
  /** Nominal maximum aggregate size, mm — §25.2.1's 4/3·d_agg term. Default 20. */
  aggregate?: number
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
  /** Block depth the DEMAND requires, solved from φMn = Mu (0 on analyze runs).
   *  `a` above is the block the PROVIDED bars actually develop, so aReq ≤ a. */
  aReq: number
  /** Block depth at the tension-controlled limit, a = β1·(3/8)dt. */
  aMax: number
  Asf: number; Asw: number; As: number      // required (design) or given (analyze)
  AsMin: number; minGoverns: boolean
  AsMax: number                       // tension-controlled cap (εt = 0.005)
  bars: number; layers: number[]; sClear: number; sClearMin: number
  /** Passes taken by the layout ↔ effective-depth loop (see `designTBeam`). */
  layerIters: number
  phiMn: number                       // capacity at the FINAL As, kN·m
  /** Nominal strength before φ, kN·m — φMn/φ, stated so the worked solution
   *  can show the two separately. */
  Mn: number
  /** Steel stress at equilibrium, MPa, and whether it reached fy. An
   *  over-reinforced section settles below yield and its capacity has to be
   *  solved for — see `tBeamCapacity`. */
  fs: number; fsYields: boolean
  /** Compression block: its area, and its centroid below the top fibre. The
   *  lever arm is d − ȳ. */
  Aconc: number; yBar: number
  /** What assuming yield would have given, when it turned out not to hold. */
  fsTrial?: { a: number; c: number; fs: number }
  ok: boolean
  notes: string[]
}

const ES = 200000
/** §22.2.2.1 — the concrete strain at the extreme compression fibre. */
const ECU = 0.003
const LAYER_CLEAR = 25       // §425.2.2 clear distance between bar layers, mm

// β1 comes from `flexure` — the ACI Table 22.2.2.4.3 form, which is a FLAT 0.65
// for f′c ≥ 55 MPa, not the sloped row clamped at 0.65. This module kept its own
// `max(0.65, slope)` copy, which returns 0.657 at 55 MPa: the wrong table row,
// and a `c = a/β1` about 1% short with it.
export { beta1 }

/**
 * Depth of the equivalent stress block that makes φMn = Mu for a compression
 * zone of constant width `b` — ACI 318-14 §22.2.2.4.1.
 *
 *   φ·0.85f'c·b·a·(d − a/2) = Mu   ⇒   a² − 2da + 2Mu/(φ·0.85f'c·b) = 0
 *   ⇒   a = d − √( d² − 2Mu/(φ·0.85f'c·b) )        (the smaller root)
 *
 * This is the first thing the design solves: `a` is the primary unknown, and
 * As = 0.85f'c·b·a/fy falls out of C = T afterwards. Algebraically the same
 * number the Rn/ρ route gives — a = d(1 − √(1 − 2Rn/0.85f'c)) — but stated as
 * the block depth it is, so the growth of the compression zone is visible.
 *
 * Returns null when the radicand goes negative: no singly-reinforced block of
 * that width can reach the moment, however much steel is added.
 *
 * Units: Mu kN·m, b and d mm, f'c MPa → mm.
 */
export function blockDepth(Mu: number, b: number, d: number, fc: number, phi = 0.90): number | null {
  const disc = d * d - (2 * Mu * 1e6) / (phi * 0.85 * fc * b)
  return disc > 0 ? d - Math.sqrt(disc) : null
}

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

/** The positive root of A·c² + B·c − D = 0 (A > 0, D > 0), which is the only
 *  one a neutral axis can be. */
const posRoot = (A: number, B: number, D: number) =>
  (-B + Math.sqrt(B * B + 4 * A * D)) / (2 * A)

export interface TBeamCapacity {
  a: number; c: number; et: number; phi: number; phiMn: number; tBehavior: boolean
  /** Stress in the tension steel at equilibrium, MPa — `fy` when it yields. */
  fs: number
  /** Did the steel reach fy? False ⇒ the section is over-reinforced and the
   *  capacity was solved with fs < fy (see `tBeamCapacity`). */
  fsYields: boolean
  /** Centroid of the COMPRESSION AREA below the top fibre, mm — Varignon over
   *  the flange rectangle and the web strip. The lever arm is d − ȳ. */
  yBar: number
  /** Area of the compression block, mm² — bf·a, or bf·hf + (a − hf)bw. */
  Aconc: number
  /** Nominal strength before φ, kN·m. */
  Mn: number
  /** The block the YIELD assumption gave, present only when that assumption
   *  failed — the line the worked solution writes and then crosses out. */
  trial?: { a: number; c: number; fs: number }
}

/**
 * φMn of a T section with steel As.
 *
 * THE STEEL DOES NOT ALWAYS YIELD, and that is the whole of this function.
 * Equilibrium is C(c) = T(c) with
 *
 *     C(c) = 0.85f'c · A_block(a = β1 c)        (rises with c)
 *     T(c) = As · fs,   fs = min(fy, Es·εcu·(d − c)/c)   (falls with c)
 *
 * so there is exactly one root. Assuming fs = fy and stopping — which is what
 * this did — solves a DIFFERENT equation whenever the section is
 * over-reinforced, and hands back a c too deep and an Mn too large. On the
 * worked section below (bf 800, hf 100, bw 300, d 435, f'c 28, fy 345) at
 * As = 9000 mm² it returned c = 315.5 mm and φMn = 672.3 kN·m against a true
 * 282.8 mm and 649.0 — 3.6% UNCONSERVATIVE, in the direction that matters.
 *
 * When the yield assumption fails, fs = Es·εcu(d − c)/c goes back into
 * equilibrium and the result is a quadratic in c, exact in one step — no
 * iteration:
 *
 *   block inside the flange:  0.85f'c·bf·β1·c² + K·c − K·d = 0
 *   block into the web:       0.85f'c·β1·bw·c² + [0.85f'c·hf(bf − bw) + K]·c − K·d = 0
 *                             with K = Es·εcu·As
 *
 * Both have A > 0 and D = K·d > 0, so the positive root always exists and is
 * strictly less than d — the steel is always in tension.
 *
 * `d` is the depth to the steel CENTROID, where the resultant T acts, so fs is
 * measured there. `dt` is the extreme layer, where §21.2.2 measures εt for φ.
 * They differ only for a stacked cage.
 */
export function tBeamCapacity(
  i: Pick<TBeamInput, 'bw' | 'hf' | 'fc' | 'fy'>, bf: number, d: number, dt: number, As: number,
): TBeamCapacity {
  const b1 = beta1(i.fc)
  const k = 0.85 * i.fc
  const Cover = k * (bf - i.bw) * i.hf      // the overhangs, fully stressed
  const Cflange = k * bf * i.hf             // the whole flange, fully stressed

  /** Block depth that carries a compressive force T, mm. */
  const depthFor = (T: number) => T <= Cflange
    ? T / (k * bf)
    : i.hf + (T - Cflange) / (k * i.bw)

  // ── steps 2–4: assume the steel yields, and find the block that balances it
  let fs = i.fy
  let a = depthFor(As * i.fy)
  let c = a / b1

  // ── step 5: the stress check the assumption has to survive
  const fsElastic = (cc: number) => (ES * ECU * (d - cc)) / cc
  const fsYields = fsElastic(c) >= i.fy
  const trial = { a, c, fs: fsElastic(c) }
  if (!fsYields) {
    // ── step 6: it did not, so re-solve with fs on the strain diagram.
    const K = ES * ECU * As
    // Try the flange-only branch; if its own block leaves the flange it was the
    // wrong branch, and the web one is the answer. C(c) is monotone, so no
    // third possibility exists.
    c = posRoot(k * bf * b1, K, K * d)
    if (b1 * c > i.hf) c = posRoot(k * b1 * i.bw, Cover + K, K * d)
    a = b1 * c
    fs = fsElastic(c)
  }

  // Mn as the two couples the block really is: the overhangs at full stress
  // over hf, and the web strip. Identical to T(d − ȳ) by construction — the
  // test asserts they agree, which is what makes ȳ safe to print.
  const T = As * fs
  const Mn = a <= i.hf
    ? T * (d - a / 2)
    : Cover * (d - i.hf / 2) + (T - Cover) * (d - a / 2)

  const Aconc = a <= i.hf ? bf * a : bf * i.hf + (a - i.hf) * i.bw
  const yBar = a <= i.hf
    ? a / 2
    : (bf * i.hf * (i.hf / 2) + (a - i.hf) * i.bw * (i.hf + (a - i.hf) / 2)) / Aconc

  const et = (ECU * (dt - c)) / c
  const ety = i.fy / ES
  const phi = et >= 0.005 ? 0.90 : et <= ety ? 0.65 : 0.65 + (0.25 * (et - ety)) / (0.005 - ety)
  return {
    a, c, et, phi, phiMn: (phi * Mn) / 1e6, tBehavior: a > i.hf,
    fs, fsYields, yBar, Aconc, Mn: Mn / 1e6,
    ...(fsYields ? {} : { trial }),
  }
}

export function designTBeam(i: TBeamInput): TBeamResult {
  const notes: string[] = []
  const { bf, govern, isolatedOK } = effectiveFlange(i)
  const Ab = (Math.PI / 4) * i.barDia ** 2
  const dFixed = !!(i.dGiven && i.dGiven > 0)
  const dt = dFixed ? (i.dGiven as number) : i.h - i.cover - i.stirrupDia - i.barDia / 2
  const b1 = beta1(i.fc)

  // tension-controlled steel cap (c = 3/8·dt): block may enter the web. Anchored
  // on dt, the EXTREME layer, so it does not move as the group centroid does.
  const cTC = (3 / 8) * dt
  const aTC = b1 * cTC
  const CcTC = aTC <= i.hf
    ? 0.85 * i.fc * bf * aTC
    : 0.85 * i.fc * ((bf - i.bw) * i.hf + i.bw * aTC)
  const AsMax = CcTC / i.fy

  // §9.6.1.2: As,min = max(0.25√f'c, 1.4)/fy · bw·d; flange-in-tension
  // determinate spans use bw → min(2bw, bf) (§9.6.1.2(b) via Mu < 0 case).
  const bwMin = i.Mu < 0 && i.determinate ? Math.min(2 * i.bw, bf) : i.bw

  // §407.7.1 / ACI 318-14 §25.2.1 — clear spacing ≥ max(db, 25 mm, 4/3·d_agg);
  // bars per layer that fit: n·db + (n−1)·s_min ≤ bw − 2(cover + ds).
  const dAgg = i.aggregate ?? 20
  const sClearMin = Math.max(i.barDia, 25, (4 / 3) * dAgg)
  const web = i.bw - 2 * (i.cover + i.stirrupDia)
  const perLayer = Math.max(2, Math.floor((web + sClearMin) / (i.barDia + sClearMin)))
  const pitch = i.barDia + LAYER_CLEAR       // layer-to-layer centroid distance

  const MuAbs = Math.abs(i.Mu)
  const analyze = !!(i.AsGiven && i.AsGiven > 0)

  // ── Iterate layout → Varignon d → redesign, until the arrangement stops
  //    changing — the SAME loop `designBeam` runs on the rectangular section.
  //
  // Stacking bars raises the group centroid, which lowers d, which raises the
  // steel the moment demands, which can add another bar. Solving once at d = dt
  // and then dropping d after layout — which is what this engine did — hands
  // back a cage sized for a lever arm the cage itself destroyed. It showed up as
  // designs reporting `phiMn < Mu` while providing MORE steel than the As they
  // had just computed: e.g. bf 1200 / hf 100 / Mu 1900 came back 8836 mm² over a
  // required 8153 and still only φMn = 1733 kN·m, because d had quietly fallen
  // 89 mm to the centroid of five layers.
  //
  // The map d ↦ d_next is monotone: a deeper d needs less steel, hence fewer
  // bars and a shallower stack, hence a deeper d_next. Starting from d = dt (the
  // largest d the section can offer) the sequence therefore only ever falls, and
  // the bar count is an integer, so it settles. The one thing that breaks that
  // monotonicity is the section running out of singly-reinforced capacity: As
  // collapses to the cap and the stack springs back up, which oscillates
  // forever. That case is not a convergence problem — it is a failed design, so
  // it is reported as one and the loop stops.
  let d = dt
  let As = 0, Asf = 0, Asw = 0, AsMin = 0, aReq = 0
  let bars = 0
  let layers: number[] = [0]
  let layerIters = 0
  let converged = false
  let inadequate: string | null = null

  for (let iter = 0; iter < 12; iter++) {
    layerIters = iter + 1
    Asf = 0
    aReq = 0
    inadequate = null
    AsMin = (Math.max(0.25 * Math.sqrt(i.fc), 1.4) / i.fy) * bwMin * d

    // ── The block first, the steel second. Each branch differs only in which
    //    concrete area supplies C; every one of them solves `a` from the moment
    //    and then reads As off C = T = 0.85f'c·A_block.
    const steelFor = (b: number, a: number) => (0.85 * i.fc * b * a) / i.fy

    if (analyze) {
      As = i.AsGiven as number
      Asw = As
    } else if (i.Mu < 0) {
      // Flange in TENSION: the compression zone is the web rectangle, b = bw.
      const aw = blockDepth(MuAbs, i.bw, d, i.fc)
      if (aw === null) {
        inadequate = 'web section inadequate for the hogging moment — enlarge bw/h'
        aReq = aTC
        As = Math.max(AsMax, AsMin)
      } else {
        aReq = aw
        As = Math.max(steelFor(i.bw, aReq), AsMin)
      }
      Asw = As
    } else {
      // Sagging: try the whole flange width first. The block only leaves the
      // flange when the flange can no longer supply C at the depth the moment
      // needs — i.e. when this root comes back deeper than hf (or not at all).
      const af = blockDepth(MuAbs, bf, d, i.fc)
      if (af !== null && af <= i.hf) {
        aReq = af
        As = Math.max(steelFor(bf, aReq), AsMin)
        Asw = As
      } else {
        // True T. The overhangs are now spent — full stress over their whole
        // depth hf — so they contribute a fixed couple and the web block carries
        // whatever moment is left.
        Asf = (0.85 * i.fc * (bf - i.bw) * i.hf) / i.fy
        const Muf = (0.90 * Asf * i.fy * (d - i.hf / 2)) / 1e6
        const aw = blockDepth(MuAbs - Muf, i.bw, d, i.fc)
        if (aw === null) {
          // The web cannot carry the remainder singly reinforced. Report the most
          // steel the section may legally hold rather than the meaningless small
          // number the collapsed radicand gives — Asf alone, which read as a
          // *lighter* cage the worse the overload got.
          inadequate = 'web remainder exceeds singly-reinforced capacity — enlarge the section'
          Asw = Math.max(0, AsMax - Asf)
          aReq = aTC
        } else {
          aReq = aw
          Asw = steelFor(i.bw, aReq)
        }
        As = Math.max(Asf + Asw, AsMin)
      }
    }

    // `splitLayers` — the SAME rule the rectangular-beam engine uses — pairs a
    // lone bar in the upper layer. This engine used to stack them greedily, so a
    // T-beam could be detailed with one bar sitting alone with nothing to tie to
    // on either side. The pairing bumps the count, so `bars` (not the strength
    // demand) is what As-provided must be computed from.
    const split = splitLayers(Math.max(2, Math.ceil(As / Ab)), perLayer)
    const newLayers = split.layers
    const dNew = dFixed ? dt : dt - centroidRise(newLayers, pitch)
    const same = newLayers.length === layers.length && newLayers.every((k, j) => k === layers[j])
    bars = split.bars
    layers = newLayers

    // Divergence guard: each added layer lowers d, which demands more steel,
    // which adds layers. If the stack keeps growing, the web cannot take it.
    if (newLayers.length > 6 || dNew <= i.cover + i.stirrupDia + i.barDia) {
      inadequate = 'bar group is too deep for the web — the section is inadequate; enlarge bw/h'
      d = dNew
      converged = true          // reported through the note, not as non-convergence
      break
    }
    if (inadequate) { d = dNew; converged = true; break }

    if (same && Math.abs(dNew - d) < 1e-9) { converged = true; break }
    d = dNew
  }

  if (inadequate) notes.push(inadequate)
  if (!converged) notes.push('bar layout did not settle in 12 passes — check the reported capacity')
  const minGoverns = !analyze && As <= AsMin + 1e-9
  const sClear = layers[0] > 1 ? (web - layers[0] * i.barDia) / (layers[0] - 1) : web
  // Only when the layout is what SET d. With `dGiven` the caller has already
  // said where the steel is, so the stack moves nothing and the note read
  // "d reduced to the group centroid (435.0 → 435.0 mm)".
  if (layers.length > 1 && !dFixed) {
    notes.push(`${layers.length} bar layers — d reduced to the group centroid (${dt.toFixed(1)} → ${d.toFixed(1)} mm)`)
  }
  if (dFixed) notes.push(`d = ${dt.toFixed(1)} mm taken as given (dt = d, single-layer reading)`)

  // φ·capacity with the block exactly filling the flange — the T/rect switch
  const MnfPhi = (0.90 * 0.85 * i.fc * bf * i.hf * (d - i.hf / 2)) / 1e6

  const AsProv = bars * Ab
  const capAs = analyze ? (i.AsGiven as number) : AsProv
  const cap = tBeamCapacity(i, i.Mu < 0 ? i.bw : bf, d, dt, capAs)
  const tcOK = capAs <= AsMax + 1e-9
  if (!tcOK) notes.push('As exceeds the tension-controlled cap (εt < 0.005) — enlarge the section')

  const ok = cap.phiMn + 1e-9 >= MuAbs && tcOK && isolatedOK
    && !notes.some((n) => n.includes('inadequate') || n.includes('exceeds'))

  return {
    bf, bfGovern: govern, d, dt, isolatedOK,
    // Hogging puts the flange in TENSION — the compression zone is the web
    // rectangle and there is no T action to report. `tBeamCapacity` is handed
    // bf = bw there, so its own `a > hf` test is comparing the web block depth
    // against a flange thickness that plays no part; a deep enough hogging
    // block was flagged "true T" on that accident alone.
    MnfPhi, tBehavior: i.Mu < 0 ? false : cap.tBehavior,
    a: cap.a, c: cap.c, et: cap.et, phi: cap.phi, aReq, aMax: aTC,
    Asf, Asw, As, AsMin, minGoverns, AsMax,
    bars, layers, sClear, sClearMin, layerIters,
    phiMn: cap.phiMn, Mn: cap.Mn,
    fs: cap.fs, fsYields: cap.fsYields, Aconc: cap.Aconc, yBar: cap.yBar,
    ...(cap.trial ? { fsTrial: cap.trial } : {}),
    ok, notes,
  }
}
