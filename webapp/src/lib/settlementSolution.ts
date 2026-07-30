// Worked solution for foundation settlement — Boussinesq stress increase,
// Terzaghi one-dimensional consolidation, Schmertmann strain influence.
// Mirrors engine/settlement.ts.
//
// This sheet has NO pass/fail, and that is deliberate. Settlement is a
// PREDICTION, not a code check: there is no capacity to divide by. A 25 mm
// limit is common but it is a project decision, and asserting one on the
// engineer's behalf would be putting words in their mouth. The sheet gives the
// numbers and the assumptions behind them, and leaves the judgement where it
// belongs.
import type { SoilLayer, ConsolidationResult, SchmertmannResult } from '../engine/settlement'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn3 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

/** Readable names for the e–log σ′ branch the engine picked per layer. */
const BRANCH: Record<string, string> = {
  'normally-consolidated': 'virgin, NC',
  recompression: 'recompression only',
  'recompression+virgin': 'recompression then virgin',
  none: 'non-compressible',
}

export interface SettlementSolutionInput {
  q: number; B: number; L: number; Df: number; waterTable: number
  Es: number; nu: number; years: number
  layers: SoilLayer[]
}

export interface SettlementSolutionResult {
  cons: ConsolidationResult
  elastic: number
  schmert: SchmertmannResult
  total: number
  govLayer: number
  t90: number
  Uat: number
  sigma0: number
}

export function buildSettlementSolution(
  i: SettlementSolutionInput, r: SettlementSolutionResult,
): SolutionStep[] {
  const totalDepth = i.layers.reduce((a, l) => a + l.H, 0)
  const gov = r.cons.layers[r.govLayer]
  const govSoil = i.layers[r.govLayer]

  const steps: SolutionStep[] = [
    {
      title: 'Foundation and profile',
      clause: 'Terzaghi / Boussinesq — elastic half-space',
      lines: [
        txt('Settlement has two parts that occur on different timescales: an immediate elastic distortion as the load is applied, and a slow consolidation as pore water drains from the clay. They are computed separately and added.'),
        eq(String.raw`q = ${sn1(i.q)}\ \text{kPa},\qquad B \times L = ${sn2(i.B)} \times ${sn2(i.L)}\ \text{m},\qquad D_f = ${sn2(i.Df)}\ \text{m}`),
        eq(String.raw`\text{water table } ${Number.isFinite(i.waterTable) ? `\\text{at } ${sn2(i.waterTable)}\\ \\text{m}` : '\\text{not encountered (dry profile)}'},\qquad \text{profile } ${sn2(totalDepth)}\ \text{m in } ${i.layers.length}\ \text{layers}`),
        eq(String.raw`\sigma'_0 \text{ at founding level} = ${sn2(r.sigma0)}\ \text{kPa}`),
      ],
    },
    {
      title: 'Immediate (elastic) settlement',
      clause: 'Elastic half-space — Steinbrenner influence',
      lines: [
        txt('The immediate component treats the soil as an elastic half-space. It occurs essentially as the load is applied, so it is usually taken up during construction and rarely damages finishes.'),
        eq(String.raw`E_s = ${sn0(i.Es)}\ \text{kPa},\qquad \nu = ${sn2(i.nu)}`),
        eq(String.raw`S_e = \frac{qB(1-\nu^2)}{E_s}I_s = \mathbf{${sn2(r.elastic)}}\ \text{mm}`),
      ],
    },
    {
      title: 'Stress increase with depth',
      clause: 'Boussinesq — rectangular loaded area',
      lines: [
        txt('The stress from the footing spreads and decays with depth. Each clay layer is sliced and the Boussinesq increase evaluated at the mid-height of every slice, which matters because Δσ falls off sharply and a single mid-layer value over-predicts a thick stratum.'),
        eq(String.raw`\Delta\sigma_z = q\,I_\sigma\!\left(\tfrac{B}{2z},\ \tfrac{L}{2z}\right)\quad\text{(four-corner superposition beneath the footing centre)}`),
        ...r.cons.layers.map((L, k) => eq(
          String.raw`\text{layer ${k + 1} @ } z_{mid} = ${sn2(L.zMid)}\ \text{m}: \Delta\sigma = ${sn2(L.dSigma)}\ \text{kPa},\ \sigma'_0 = ${sn2(L.sigma0)}\ \text{kPa},\ \sigma'_p = ${sn2(L.sigmaP)}\ \text{kPa}`,
        )),
      ],
    },
    {
      title: 'Primary consolidation',
      clause: 'Terzaghi 1-D consolidation',
      lines: [
        txt('Each layer compresses on the recompression line up to its preconsolidation pressure and on the virgin line beyond it — a layer whose final stress crosses σ′p uses both branches, which is why an overconsolidated crust is not charged virgin compression it will never see.'),
        ...r.cons.layers.map((L, k) => eq(
          String.raw`\text{layer ${k + 1} (${BRANCH[L.branch]}): } S_c = ${sn2(L.settlement)}\ \text{mm}`,
        )),
        ...(govSoil ? [eq(
          String.raw`\text{governs — layer ${r.govLayer + 1}: } C_c = ${sn3(govSoil.Cc ?? 0)},\ C_r = ${sn3(govSoil.Cr ?? (govSoil.Cc ?? 0) / 6)},\ e_0 = ${sn3(govSoil.e0 ?? 0)},\ H = ${sn2(govSoil.H)}\ \text{m}`,
        )] : []),
        eq(String.raw`S_c = \sum \frac{H}{1+e_0}\left[C_r\log\frac{\sigma'_p}{\sigma'_0} + C_c\log\frac{\sigma'_0+\Delta\sigma}{\sigma'_p}\right] = \mathbf{${sn2(r.cons.total)}}\ \text{mm}`),
        eq(String.raw`S_{total} = S_e + S_c = ${sn2(r.elastic)} + ${sn2(r.cons.total)} = \mathbf{${sn2(r.total)}}\ \text{mm}`),
      ],
    },
    {
      title: 'Rate of consolidation',
      clause: 'Terzaghi — time factor Tv',
      lines: [
        txt('How long the consolidation takes depends on the square of the drainage path, so a layer draining both faces consolidates four times faster than the same layer draining one. This is why the governing layer for magnitude is not always the one that governs the programme.'),
        ...(gov && Number.isFinite(r.t90) ? [eq(
          String.raw`t_{90} \text{ (layer ${r.govLayer + 1})} = \frac{T_{90} H_{dr}^2}{c_v} = ${sn2(r.t90)}\ \text{years}`,
        )] : [txt('The governing layer has no finite t₉₀ with the given cv.')]),
        eq(String.raw`U(t = ${sn0(i.years)}\ \text{y}) = ${sn1(r.Uat * 100)}\%\quad\Rightarrow\quad S(t) \approx ${sn2(r.Uat * r.cons.total)}\ \text{mm of the primary settlement}`),
      ],
    },
    {
      title: 'Schmertmann check',
      clause: 'Schmertmann strain-influence method',
      lines: [
        txt('An independent estimate for granular soils, using the strain-influence diagram rather than consolidation theory. C₁ corrects for embedment depth and C₂ for creep — the two together are why a Schmertmann figure grows with time even in sand.'),
        eq(String.raw`C_1 = 1 - 0.5\frac{\sigma'_0}{\Delta p} = ${sn3(r.schmert.C1)},\qquad C_2 = 1 + 0.2\log_{10}\frac{t}{0.1} = ${sn3(r.schmert.C2)}`),
        eq(String.raw`I_{zp} = ${sn3(r.schmert.Izp)},\qquad z_{influence} = ${sn2(r.schmert.zInfluence)}\ \text{m}`),
        eq(String.raw`S = C_1 C_2 \Delta p \sum\frac{I_z}{E_s}\Delta z = \mathbf{${sn2(r.schmert.settlement)}}\ \text{mm at } ${sn0(i.years)}\ \text{years}`),
      ],
      note: 'An independent method on different assumptions — compare it with the consolidation figure rather than adding the two.',
    },
    {
      title: 'What this does and does not tell you',
      clause: 'Skempton & MacDonald (1956) — tolerable settlement',
      lines: [
        txt('This sheet PREDICTS a movement; it does not check one. There is no capacity to divide by and therefore no pass or fail. Whether the predicted settlement is acceptable depends on the structure, its finishes, its services and — usually more critically than the total — the DIFFERENTIAL settlement between footings, which a single-footing calculation cannot give you.'),
        txt('Common serviceability yardsticks are 25 mm total and an angular distortion of 1/500 for framed buildings, but those are project decisions, not code limits, and they are the engineer’s to set.'),
      ],
    },
  ]

  return steps
}
