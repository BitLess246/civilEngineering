// Worked solutions for the three calculators split out of the old combined
// "Geotechnical toolkit" page: lateral earth pressure, shallow-foundation
// bearing capacity, and infinite-slope stability.
//
// Every value comes from the engine result, so the sheet and the number on
// the card cannot disagree.
import type { GeneralBearingInput, GeneralBearingResult } from '../engine/bearingGeneral'
import { BEARING_METHOD_LABEL } from '../engine/bearingGeneral'
import type { EarthThrust } from '../engine/geotech'
import type { CoulombThrust, SeismicThrust } from '../engine/coulomb'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn3 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

// ── Lateral earth pressure ────────────────────────────────────────────────

export interface EarthPressureInput {
  gamma: number; H: number; phiDeg: number; surcharge: number
  /** Coulomb only — 0 for all three reduces Coulomb exactly to Rankine. */
  deltaDeg: number; thetaDeg: number; betaDeg: number
  kh: number; kv: number
}

export function buildEarthPressureSolution(
  i: EarthPressureInput,
  rankineA: EarthThrust, rankineP: EarthThrust,
  coulombA: CoulombThrust | null, coulombP: CoulombThrust | null,
  seismic: SeismicThrust | null,
): SolutionStep[] {
  const steps: SolutionStep[] = [
    {
      title: 'Rankine active pressure',
      clause: 'Rankine (1857) · NSCP 2015 §307',
      lines: [
        txt('Rankine assumes a SMOOTH, vertical wall face and a level backfill. Those three assumptions are what make the coefficient a function of φ alone — the moment any of them fails, the answer belongs to Coulomb instead.'),
        eq(String.raw`K_a = \tan^2\!\left(45^\circ - \tfrac{\phi}{2}\right) = \tan^2\!\left(45^\circ - \tfrac{${sn1(i.phiDeg)}^\circ}{2}\right) = ${sn3(rankineA.K)}`),
        eq(String.raw`P_a = \tfrac{1}{2}K_a\gamma H^2 + K_a q H = \tfrac{1}{2}(${sn3(rankineA.K)})(${sn1(i.gamma)})(${sn2(i.H)})^2 + (${sn3(rankineA.K)})(${sn1(i.surcharge)})(${sn2(i.H)}) = ${sn2(rankineA.P)}\ \text{kN/m}`),
        eq(String.raw`\sigma_{a,base} = K_a(\gamma H + q) = ${sn2(rankineA.basePressure)}\ \text{kPa}`),
        eq(String.raw`\bar{y} = \frac{P_{soil}(H/3) + P_q(H/2)}{P_a} = ${sn3(rankineA.lineOfAction)}\ \text{m above the base}`),
      ],
      note: 'The soil part is triangular and acts at H/3; the surcharge part is rectangular and acts at H/2. They cannot be added before taking moments — the line of action above is the weighted average.',
    },
    {
      title: 'Rankine passive resistance',
      clause: 'Rankine (1857)',
      lines: [
        txt('Passive resistance is what the soil in FRONT of a wall offers as the wall pushes into it. It is an order of magnitude larger than the active thrust, and routinely discounted or ignored in design because the soil that supplies it can be excavated for services, scoured, or simply never compacted.'),
        eq(String.raw`K_p = \tan^2\!\left(45^\circ + \tfrac{\phi}{2}\right) = ${sn3(rankineP.K)} = \frac{1}{K_a}`),
        eq(String.raw`P_p = \tfrac{1}{2}K_p\gamma H^2 = ${sn2(rankineP.P)}\ \text{kN/m at } \tfrac{H}{3} = ${sn3(rankineP.lineOfAction)}\ \text{m}`),
      ],
      note: `Kp/Ka = ${sn1(rankineP.K / Math.max(rankineA.K, 1e-9))} — mobilising passive resistance also needs far more wall movement than active, so the two are not developed at the same time.`,
    },
  ]

  if (coulombA) {
    const plain = i.deltaDeg === 0 && i.thetaDeg === 0 && i.betaDeg === 0
    steps.push({
      title: 'Coulomb active thrust — wall friction and geometry',
      clause: 'Coulomb (1776)',
      lines: [
        txt('Coulomb carries the three things Rankine cannot: friction δ on the back of the wall, a back face inclined at θ from vertical, and a backfill sloping at β. Wall friction tilts the thrust off horizontal, which is why the vertical component below is not zero — and that component helps resist both sliding and overturning.'),
        eq(String.raw`\delta = ${sn1(i.deltaDeg)}^\circ,\quad \theta = ${sn1(i.thetaDeg)}^\circ,\quad \beta = ${sn1(i.betaDeg)}^\circ`),
        eq(String.raw`K_a = ${sn3(coulombA.K)}\quad\text{(Rankine: } ${sn3(rankineA.K)}\text{)}`),
        eq(String.raw`P_a = ${sn2(coulombA.P)}\ \text{kN/m at } ${sn1(coulombA.inclinationDeg)}^\circ \text{ from horizontal}`),
        eq(String.raw`P_{a,h} = ${sn2(coulombA.horizontal)}\ \text{kN/m},\qquad P_{a,v} = ${sn2(coulombA.vertical)}\ \text{kN/m}`),
        ...(coulombP ? [eq(String.raw`K_p = ${sn3(coulombP.K)},\qquad P_p = ${sn2(coulombP.P)}\ \text{kN/m}`)] : []),
      ],
      note: plain
        ? 'With δ = θ = β = 0 the Coulomb coefficient reduces EXACTLY to Rankine — which is how you know the formula is transcribed correctly. Set a wall friction to see them separate.'
        : 'Coulomb passive is UNCONSERVATIVE at high δ: its plane failure surface is a poor model of the curved surface that actually forms, and it can overestimate Kp substantially.',
    })
  }

  if (seismic) {
    steps.push({
      title: 'Mononobe–Okabe seismic increment',
      clause: 'Mononobe–Okabe · NSCP 2015 §208',
      lines: [
        txt('The pseudo-static method rotates the whole problem by the seismic inertia angle ψ and re-runs Coulomb on the rotated geometry. The increment over the static case does NOT act at H/3 — it acts higher up, which is what makes the overturning moment grow faster than the thrust does.'),
        eq(String.raw`\psi = \arctan\!\left(\frac{k_h}{1-k_v}\right) = \arctan\!\left(\frac{${sn2(i.kh)}}{1-${sn2(i.kv)}}\right) = ${sn2(seismic.psiDeg)}^\circ`),
        eq(String.raw`K_{ae} = ${sn3(seismic.K)},\qquad P_{ae} = ${sn2(seismic.P)}\ \text{kN/m}`),
        eq(String.raw`\Delta P_{ae} = P_{ae} - P_a = ${sn2(seismic.P)} - ${sn2(seismic.staticP)} = ${sn2(seismic.increment)}\ \text{kN/m at } ${sn2(seismic.incrementLineOfAction)}\ \text{m}`),
        eq(String.raw`\bar{y}_{combined} = ${sn3(seismic.lineOfAction)}\ \text{m above the base}`),
      ],
      note: `The increment is ${sn0((seismic.increment / Math.max(seismic.staticP, 1e-9)) * 100)}% of the static thrust but acts far higher, so its effect on overturning is larger than that figure suggests.`,
    })
  }

  return steps
}

// ── Bearing capacity ──────────────────────────────────────────────────────

export function buildBearingSolution(
  i: GeneralBearingInput, r: GeneralBearingResult,
): SolutionStep[] {
  const strip = !Number.isFinite(i.L ?? Infinity)
  const cTerm = i.c * r.Nc * r.sc * r.dc * r.ic
  const qTerm = r.surcharge * r.Nq * r.sq * r.dq * r.iq
  const gTerm = 0.5 * r.gammaEffective * r.effectiveB * r.Ngamma * r.sgamma * r.dgamma * r.igamma
  const FS = i.FS ?? 3

  return [
    {
      title: 'Bearing-capacity factors',
      clause: `Prandtl/Reissner · ${BEARING_METHOD_LABEL[r.method]}`,
      lines: [
        txt('Nq and Nc are Prandtl/Reissner in every one of the three methods — they do not differ. Only Nγ differs, along with the shape and depth factors, which is exactly why a bearing pressure quoted without naming its method is not reproducible.'),
        eq(String.raw`N_q = e^{\pi\tan\phi}\tan^2\!\left(45^\circ + \tfrac{\phi}{2}\right) = ${sn2(r.Nq)}`),
        eq(String.raw`N_c = (N_q - 1)\cot\phi = ${sn2(r.Nc)}`),
        eq(String.raw`N_\gamma = ${sn2(r.Ngamma)}\quad(\text{${BEARING_METHOD_LABEL[r.method]}})`),
      ],
    },
    {
      title: 'Shape, depth and inclination factors',
      clause: `${BEARING_METHOD_LABEL[r.method]} · Meyerhof effective area`,
      lines: [
        txt('Shape factors correct a strip solution for a rectangular or square footing. Depth factors credit the shear strength of the soil ABOVE founding level, which the basic equation ignores. Inclination factors penalise a resultant that is not vertical.'),
        eq(String.raw`s_c = ${sn3(r.sc)},\quad s_q = ${sn3(r.sq)},\quad s_\gamma = ${sn3(r.sgamma)}`),
        eq(String.raw`d_c = ${sn3(r.dc)},\quad d_q = ${sn3(r.dq)},\quad d_\gamma = ${sn3(r.dgamma)}`),
        eq(String.raw`i_c = ${sn3(r.ic)},\quad i_q = ${sn3(r.iq)},\quad i_\gamma = ${sn3(r.igamma)}`),
        eq(String.raw`B' = B - 2e_B = ${sn2(i.B)} - 2(${sn2(i.eB ?? 0)}) = ${sn3(r.effectiveB)}\ \text{m}${strip ? '' : `,\\quad L' = ${sn3(r.effectiveL)}\\ \\text{m}`}`),
      ],
      note: (i.eB ?? 0) > 0
        ? "Eccentricity is handled by Meyerhof's effective area: the footing is replaced by a smaller one centred under the load, and B′ — not B — goes into the Nγ term."
        : undefined,
    },
    {
      title: 'Overburden and the water table',
      clause: 'Terzaghi effective stress · Prandtl surcharge term',
      lines: [
        txt('The surcharge q is the EFFECTIVE overburden at founding level, and the γ in the Nγ term is the unit weight of the soil within the failure wedge below the footing. Water reduces both, which is why a rising water table can halve a bearing capacity without anything else changing.'),
        eq(String.raw`q = ${sn2(r.surcharge)}\ \text{kPa at } D_f = ${sn2(i.Df)}\ \text{m}`),
        eq(String.raw`\gamma_{\text{in } N_\gamma\text{ term}} = ${sn2(r.gammaEffective)}\ \text{kN/m}^3`),
      ],
      note: i.waterTable === undefined
        ? 'No water table entered — both terms use the moist unit weight.'
        : `Water table at ${sn2(i.waterTable)} m below ground.`,
    },
    {
      title: 'Ultimate and allowable capacity',
      clause: `${BEARING_METHOD_LABEL[r.method]}`,
      lines: [
        txt('Three terms, and they are not equal partners: the cohesion term dominates in clay, the surcharge term grows with founding depth, and the Nγ term is the only one that depends on the footing WIDTH — which is why widening a footing on sand helps and widening one on soft clay barely does.'),
        eq(String.raw`q_u = c N_c s_c d_c i_c + q N_q s_q d_q i_q + \tfrac{1}{2}\gamma' B' N_\gamma s_\gamma d_\gamma i_\gamma`),
        eq(String.raw`q_u = ${sn2(cTerm)} + ${sn2(qTerm)} + ${sn2(gTerm)} = ${sn2(r.qult)}\ \text{kPa}`),
        eq(String.raw`q_{net} = q_u - q = ${sn2(r.qult)} - ${sn2(r.surcharge)} = ${sn2(r.qnet)}\ \text{kPa}`),
        eq(String.raw`q_{allow,net} = \frac{q_{net}}{FS} = \frac{${sn2(r.qnet)}}{${sn1(FS)}} = \mathbf{${sn2(r.qallowNet)}}\ \text{kPa}`),
        eq(String.raw`q_{allow,gross} = q_{allow,net} + q = ${sn2(r.qallowGross)}\ \text{kPa}`),
      ],
      note: 'Compare a footing pressure against the NET allowable: the soil already carried the overburden before the footing arrived, so only the increase is new load. Using the gross figure against a net pressure double-counts it.',
    },
  ]
}

// ── Infinite slope ────────────────────────────────────────────────────────

export interface InfiniteSlopeInput {
  c: number; phiDeg: number; gamma: number; z: number; betaDeg: number
  seepage: boolean; gammaSat: number; gammaW?: number
}

export function buildInfiniteSlopeSolution(i: InfiniteSlopeInput, FS: number): SolutionStep[] {
  const rad = (d: number) => (d * Math.PI) / 180
  const beta = rad(i.betaDeg)
  const cosB = Math.cos(beta), sinB = Math.sin(beta)
  const gW = i.gammaW ?? 9.81
  const gDrive = i.seepage ? i.gammaSat : i.gamma
  const gNormal = i.seepage ? i.gammaSat - gW : i.gamma
  const driving = gDrive * i.z * sinB * cosB
  const resisting = i.c + gNormal * i.z * cosB * cosB * Math.tan(rad(i.phiDeg))

  return [
    {
      title: 'When the infinite-slope model applies',
      clause: 'Taylor (1948) · limit equilibrium',
      lines: [
        txt('An infinite slope is one where the failure surface is PLANAR and parallel to the ground, at a depth small compared with the length of the slope. That is a good model of a shallow soil mantle over rock or a firm stratum; it is a poor model of a cut or embankment of finite height, where the surface curves and the method of slices is needed instead.'),
        eq(String.raw`\beta = ${sn1(i.betaDeg)}^\circ,\quad z = ${sn2(i.z)}\ \text{m},\quad c = ${sn1(i.c)}\ \text{kPa},\quad \phi = ${sn1(i.phiDeg)}^\circ,\quad \gamma = ${sn1(i.gamma)}\ \text{kN/m}^3`),
      ],
      note: 'Because every slice is identical, the side forces cancel exactly — which is why this one has a closed form and the method of slices does not.',
    },
    {
      title: i.seepage ? 'Driving and resisting stress — with seepage' : 'Driving and resisting stress — dry',
      clause: 'Taylor · limit equilibrium on a plane at depth z',
      lines: [
        i.seepage
          ? txt('Seepage parallel to the slope with the water table at the surface is the worst ordinary case. The pore pressure cuts the EFFECTIVE normal stress — so the resisting term uses the buoyant weight γ′ = γsat − γw — while the driving weight is still the full saturated weight. Both changes push the same way, which is why a slope that stands dry can fail in a storm.')
          : txt('Dry, the same unit weight appears on both sides. The depth z then cancels out of a cohesionless slope entirely, leaving FS = tanφ / tanβ — a slope angle limit that has nothing to do with how thick the soil is.'),
        eq(String.raw`\tau_{driving} = \gamma z \sin\beta\cos\beta = (${sn2(gDrive)})(${sn2(i.z)})\sin${sn1(i.betaDeg)}^\circ\cos${sn1(i.betaDeg)}^\circ = ${sn2(driving)}\ \text{kPa}`),
        eq(String.raw`\tau_{resisting} = c + \gamma_n z \cos^2\!\beta\tan\phi = ${sn1(i.c)} + (${sn2(gNormal)})(${sn2(i.z)})\cos^2${sn1(i.betaDeg)}^\circ\tan${sn1(i.phiDeg)}^\circ = ${sn2(resisting)}\ \text{kPa}`),
        ...(i.seepage
          ? [eq(String.raw`\gamma' = \gamma_{sat} - \gamma_w = ${sn2(i.gammaSat)} - ${sn2(gW)} = ${sn2(gNormal)}\ \text{kN/m}^3`)]
          : []),
      ],
    },
    {
      title: 'Factor of safety',
      clause: 'Taylor · FS ≥ 1.5 for a permanent slope',
      pass: FS >= 1.5,
      lines: [
        txt('The factor of safety is the ratio of the shear the soil can supply to the shear the slope demands, both on the same plane at depth z. A permanent slope is normally required to reach 1.5; a temporary one during construction is often accepted lower, with the exposure time stated.'),
        eq(String.raw`\tau_{resisting} = ${sn2(resisting)}\ \text{kPa},\qquad \tau_{driving} = ${sn2(driving)}\ \text{kPa}`),
        eq(String.raw`FS = \frac{\tau_{resisting}}{\tau_{driving}} = \frac{${sn2(resisting)}}{${sn2(driving)}} = \mathbf{${sn2(FS)}}`),
        ...(i.c === 0 && !i.seepage
          ? [eq(String.raw`\text{cohesionless and dry} \Rightarrow FS = \frac{\tan\phi}{\tan\beta} = \frac{\tan${sn1(i.phiDeg)}^\circ}{\tan${sn1(i.betaDeg)}^\circ} = ${sn2(Math.tan(rad(i.phiDeg)) / Math.tan(beta))}`)]
          : []),
      ],
      note: FS >= 1.5
        ? 'Adequate for a permanent slope. Check the FINITE-slope case as well if the slope has a defined crest and toe — a circular surface can be more critical than a planar one.'
        : FS >= 1
          ? 'Marginal. The slope stands, but with no reserve against a wetter-than-assumed season or a small surcharge at the crest.'
          : 'Unstable as modelled. Flatten the slope, drain it, or retain it.',
    },
  ]
}
