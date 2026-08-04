// Worked solution for a cantilever retaining wall.
// Mirrors engine/retainingWall.ts: symbolic equation, substituted numbers,
// result with unit, clause reference. Values come from the engine result, so
// the sheet and the verdict cannot disagree.
//
// The sheet is deliberately explicit about WHICH LOAD LEVEL each step is at.
// Stability runs on service loads (the factor of safety is the margin);
// member design runs on factored loads (§5.3.1(e) U = 1.2D + 1.6L + 1.6H).
// Mixing the two is the single most common error in a wall calculation, so
// each step says which it is using.
import type { RetainingWallInput, RetainingWallResult, SlabCantilever } from '../engine/retainingWall'
import { LF } from '../engine/retainingWall'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn3, sn4 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

export function buildRetainingWallSolution(
  i: RetainingWallInput, r: RetainingWallResult,
): SolutionStep[] {
  const gc = i.gamma_c ?? 23.6
  const hs = i.Hs / 1000, tb = i.tb / 1000, ts = i.ts / 1000
  const bt = i.bt / 1000, bh = i.bh / 1000
  const sqfc = Math.sqrt(Math.max(i.fc, 1))
  const qavg = r.sumV / r.B
  const qavgU = r.sumVu / r.B

  const steps: SolutionStep[] = [
    {
      title: 'Geometry and Rankine active coefficient',
      clause: 'Rankine (1857) · NSCP 2015 §307',
      lines: [
        txt('The retained height for earth pressure is measured from the TOP OF THE WALL to the BOTTOM of the base slab: the wedge pushes on the whole back face of the structure, base included, not just on the stem.'),
        eq(String.raw`B = b_t + t_s + b_h = ${sn2(bt)} + ${sn2(ts)} + ${sn2(bh)} = ${sn3(r.B)}\ \text{m}`),
        eq(String.raw`H = H_s + t_b = ${sn2(hs)} + ${sn2(tb)} = ${sn3(r.H)}\ \text{m}`),
        eq(String.raw`K_a = \tan^2\!\left(45^\circ - \tfrac{\phi}{2}\right) = \tan^2\!\left(45^\circ - \tfrac{${sn1(i.phi_deg)}^\circ}{2}\right) = ${sn4(r.Ka)}`),
      ],
      note: 'Rankine assumes a vertical, frictionless back face and a level backfill. A sloping backfill or wall friction needs Coulomb theory instead.',
    },
    {
      title: 'Lateral thrust and overturning moment — SERVICE loads',
      clause: 'Rankine · moments about the toe',
      lines: [
        txt('The soil pressure grows linearly with depth, so its resultant is a triangle acting at H/3 above the base. A uniform surcharge adds a RECTANGULAR pressure block, whose resultant sits at mid-height — the two act at different heights and cannot be added before taking moments.'),
        eq(String.raw`P_a = \tfrac{1}{2}K_a\gamma_s H^2 = \tfrac{1}{2}(${sn4(r.Ka)})(${sn1(i.gamma_s)})(${sn3(r.H)})^2 = ${sn2(r.Pa)}\ \text{kN/m}`),
        eq(String.raw`P_q = K_a\,q\,H = (${sn4(r.Ka)})(${sn1(i.q_sur)})(${sn3(r.H)}) = ${sn2(r.Pq)}\ \text{kN/m}`),
        eq(String.raw`F_h = P_a + P_q = ${sn2(r.Fh)}\ \text{kN/m}`),
        eq(String.raw`M_O = P_a\frac{H}{3} + P_q\frac{H}{2} = ${sn2(r.Pa)}\left(\frac{${sn3(r.H)}}{3}\right) + ${sn2(r.Pq)}\left(\frac{${sn3(r.H)}}{2}\right) = ${sn2(r.MO)}\ \text{kN·m/m}`),
      ],
    },
    {
      title: 'Vertical loads and restoring moment — SERVICE loads',
      clause: 'NSCP 2015 §307 · statics, arms from the toe',
      lines: [
        txt('The soil sitting ON THE HEEL is what makes a cantilever wall work: it is usually the largest single restoring force, and it acts at the longest lever arm. The wall is stabilised mostly by the backfill it retains.'),
        eq(String.raw`W_{stem} = \gamma_c t_s H_s = ${sn1(gc)}(${sn2(ts)})(${sn2(hs)}) = ${sn2(r.W_stem)}\ \text{kN/m} \quad @\ \bar{x} = ${sn3(r.arm_stem)}\ \text{m}`),
        eq(String.raw`W_{base} = \gamma_c B t_b = ${sn1(gc)}(${sn3(r.B)})(${sn2(tb)}) = ${sn2(r.W_base)}\ \text{kN/m} \quad @\ \bar{x} = ${sn3(r.arm_base)}\ \text{m}`),
        eq(String.raw`W_{soil} = \gamma_s b_h H_s = ${sn1(i.gamma_s)}(${sn2(bh)})(${sn2(hs)}) = ${sn2(r.W_soil)}\ \text{kN/m} \quad @\ \bar{x} = ${sn3(r.arm_soil)}\ \text{m}`),
        ...(r.W_sur > 1e-9 ? [eq(String.raw`W_{sur} = q\,b_h = ${sn1(i.q_sur)}(${sn2(bh)}) = ${sn2(r.W_sur)}\ \text{kN/m} \quad @\ \bar{x} = ${sn3(r.arm_sur)}\ \text{m}`)] : []),
        eq(String.raw`\Sigma V = ${sn2(r.sumV)}\ \text{kN/m}, \qquad M_R = \Sigma W\bar{x} = ${sn2(r.MR)}\ \text{kN·m/m}`),
      ],
    },
    {
      title: 'Factor of safety against overturning',
      clause: 'NSCP 2015 §307 — FS ≥ 2.0',
      pass: r.stableOT,
      lines: [
        txt('Taken about the toe, the front bottom edge of the base — the point the wall would rotate about if it tipped forward.'),
        eq(String.raw`FS_{OT} = \frac{M_R}{M_O} = \frac{${sn2(r.MR)}}{${sn2(r.MO)}} = ${sn2(r.FS_OT)} \;${r.stableOT ? '\\ge' : '<'}\; 2.0`),
      ],
      note: r.stableOT ? undefined : 'Lengthen the heel — it adds both weight and lever arm, and is far more effective than thickening the stem.',
    },
    {
      title: 'Factor of safety against sliding',
      clause: 'NSCP 2015 §307 — FS ≥ 1.5',
      pass: r.stableSL,
      lines: [
        txt('Friction on the underside of the base resists the horizontal thrust. Passive resistance in front of the toe is NEGLECTED: that soil can be excavated for services, scoured, or simply never compacted, and counting on it is how walls move.'),
        eq(String.raw`F_{res} = \mu\,\Sigma V = ${sn2(i.mu)}(${sn2(r.sumV)}) = ${sn2(i.mu * r.sumV)}\ \text{kN/m}`),
        eq(String.raw`FS_{SL} = \frac{\mu\,\Sigma V}{F_h} = \frac{${sn2(i.mu * r.sumV)}}{${sn2(r.Fh)}} = ${sn2(r.FS_SL)} \;${r.stableSL ? '\\ge' : '<'}\; 1.5`),
      ],
      note: r.stableSL ? undefined : 'Add a shear key under the base, or widen the base to pick up more vertical load — increasing μ is not a design decision.',
    },
    {
      title: 'Bearing pressure under the base — SERVICE loads',
      clause: 'NSCP 2015 §405 · middle-third rule',
      pass: r.bearingOK && r.tensionOK,
      lines: [
        txt('The resultant of ΣV and Fh crosses the base at x̄ from the toe. Its offset from the base centre is the eccentricity, and while that stays inside the middle third (e ≤ B/6) the whole base stays in compression.'),
        eq(String.raw`\bar{x} = \frac{M_R - M_O}{\Sigma V} = \frac{${sn2(r.MR)} - ${sn2(r.MO)}}{${sn2(r.sumV)}} = ${sn3(r.xbar)}\ \text{m}`),
        eq(String.raw`e = \frac{B}{2} - \bar{x} = ${sn3(r.B / 2)} - ${sn3(r.xbar)} = ${sn3(r.e)}\ \text{m} \;${Math.abs(r.e) <= r.B / 6 ? '\\le' : '>'}\; \frac{B}{6} = ${sn3(r.B / 6)}\ \text{m}`),
        eq(String.raw`q_{max,min} = \frac{\Sigma V}{B}\left(1 \pm \frac{6e}{B}\right) = ${sn2(qavg)}\left(1 \pm \frac{6(${sn3(r.e)})}{${sn3(r.B)}}\right)`),
        eq(String.raw`q_{max} = ${sn2(r.q_max)}\ \text{kPa} \;${r.bearingOK ? '\\le' : '>'}\; q_a = ${sn1(i.qa)}\ \text{kPa}, \qquad q_{min} = ${sn2(r.q_min)}\ \text{kPa}`),
      ],
      note: r.tensionOK
        ? 'q_min ≥ 0 — the base bears over its full width.'
        : 'q_min < 0 means the heel wants to LIFT. Soil cannot pull, so the real pressure block shortens and q_max rises above the value above. Lengthen the heel.',
    },
    {
      title: 'Switch to FACTORED loads for member design',
      clause: 'ACI 318-14 §5.3.1(e) · NSCP 2015 §405.3.1',
      lines: [
        txt('Everything above is a service-load stability check, where the factor of safety carries the margin. The stem, toe and heel are STRENGTH checks against φMn and φVc, so from here on the loads are factored: U = 1.2D + 1.6L + 1.6H, with H the lateral earth pressure and the surcharge carried as live load.'),
        eq(String.raw`\Sigma V_u = ${sn1(LF.D)}\,(W_{stem}+W_{base}+W_{soil}) + ${sn1(LF.L)}\,W_{sur} = ${sn2(r.sumVu)}\ \text{kN/m}`),
        eq(String.raw`M_{Ou} = ${sn1(LF.H)}\,P_a\frac{H}{3} + ${sn1(LF.L)}\,P_q\frac{H}{2} = ${sn2(r.MOu)}\ \text{kN·m/m}, \qquad M_{Ru} = ${sn2(r.MRu)}\ \text{kN·m/m}`),
        eq(String.raw`\bar{x}_u = \frac{M_{Ru} - M_{Ou}}{\Sigma V_u} = ${sn3(r.xbar_u)}\ \text{m}, \qquad e_u = ${sn3(r.B / 2 - r.xbar_u)}\ \text{m}`),
        r.uplift_u
          ? eq(String.raw`e_u > \frac{B}{6} \Rightarrow \text{triangular block over } 3\bar{x}_u = ${sn3(3 * r.xbar_u)}\ \text{m}: \quad q_{u,toe} = \frac{2\Sigma V_u}{3\bar{x}_u} = ${sn2(r.qu_toe)}\ \text{kPa},\ q_{u,heel} = 0`)
          : eq(String.raw`q_{u} = \frac{\Sigma V_u}{B}\left(1 \pm \frac{6e_u}{B}\right) = ${sn2(qavgU)}\left(1 \pm \frac{6(${sn3(r.B / 2 - r.xbar_u)})}{${sn3(r.B)}}\right) \Rightarrow q_{u,toe} = ${sn2(r.qu_toe)},\ q_{u,heel} = ${sn2(r.qu_heel)}\ \text{kPa}`),
      ],
      note: r.uplift_u
        ? 'The factored resultant falls outside the middle third, so the pressure block is a triangle bearing on only part of the base. Using the trapezoid formula here would report a negative pressure at the heel and understate the toe.'
        : undefined,
    },
    {
      title: 'Stem — shear at the base',
      clause: 'ACI 318-14 §22.5.5.1',
      pass: r.shearOK,
      lines: [
        txt('The stem is a vertical cantilever fixed at the top of the base slab, so only the pressure over the STEM height Hs bends it — the wedge acting on the base slab below is carried straight into the footing.'),
        eq(String.raw`d = t_s - c_c - \tfrac{d_b}{2} = ${sn0(i.ts)} - ${sn0(i.cover)} - \tfrac{${sn0(i.barDia)}}{2} = ${sn1(r.d_stem)}\ \text{mm}`),
        eq(String.raw`V_u = ${sn1(LF.H)}P_{a,stem} + ${sn1(LF.L)}P_{q,stem} = ${sn1(LF.H)}(${sn2(r.Pa_stem)}) + ${sn1(LF.L)}(${sn2(r.Pq_stem)}) = ${sn2(r.Vu_stem)}\ \text{kN/m}`),
        eq(String.raw`\phi V_c = \phi\,\frac{\lambda\sqrt{f'_c}}{6}\,b\,d = 0.75\frac{${sn3(sqfc)}}{6}(1000)(${sn1(r.d_stem)})\times10^{-3} = ${sn2(r.Vc_stem)}\ \text{kN/m}`),
        eq(String.raw`V_u = ${sn2(r.Vu_stem)} \;${r.shearOK ? '\\le' : '>'}\; \phi V_c = ${sn2(r.Vc_stem)}\ \text{kN/m}`),
      ],
      note: r.shearOK ? undefined : 'Thicken the stem at the base. Stirrups in a wall stem are impractical, so shear is a thickness decision.',
    },
    {
      title: 'Stem — flexure and vertical steel',
      clause: "ACI 318-14 §22.2 · §9.6.1.2 · §11.7.2.1",
      lines: [
        txt('The bars go on the EARTH FACE of the stem — that is the tension face, because the soil pushes the wall away from the fill. Putting them on the exposed face is a total loss of capacity, and is the classic detailing error on this member.'),
        eq(String.raw`M_u = ${sn1(LF.H)}P_{a,stem}\frac{H_s}{3} + ${sn1(LF.L)}P_{q,stem}\frac{H_s}{2} = ${sn2(r.Mu_stem)}\ \text{kN·m/m}`),
        eq(String.raw`R_n = \frac{M_u}{\phi b d^2} = \frac{${sn2(r.Mu_stem)}\times10^6}{0.9(1000)(${sn1(r.d_stem)})^2} = ${sn4((r.Mu_stem * 1e6 / 0.9) / (1000 * r.d_stem * r.d_stem))}\ \text{MPa}`),
        eq(String.raw`\rho = \frac{0.85f'_c}{f_y}\left(1 - \sqrt{1 - \frac{2R_n}{0.85f'_c}}\right) \Rightarrow A_s = ${sn1(r.As_stem)}\ \text{mm}^2\text{/m}`),
        eq(String.raw`A_{s,min} = \max\!\left(\frac{0.25\sqrt{f'_c}}{f_y}, \frac{1.4}{f_y}\right)b\,d = ${sn1(r.As_min)}\ \text{mm}^2\text{/m}`),
        eq(String.raw`A_{s,design} = \max(${sn1(r.As_stem)},\ ${sn1(r.As_min)}) = \mathbf{${sn1(r.As_design)}}\ \text{mm}^2\text{/m}`),
        eq(String.raw`s = \frac{A_b \times 1000}{A_{s,design}} \Rightarrow \text{adopt } \varnothing${sn0(i.barDia)}\ @\ \mathbf{${sn0(r.s_stem)}}\ \text{mm} \;\;(A_{s,prov} = ${sn1(r.As_stem_prov)}\ \text{mm}^2\text{/m},\ s_{max} = ${sn0(r.s_stem_max)}\ \text{mm})`),
      ],
      note: r.As_min > r.As_stem
        ? 'Minimum steel governs — the stem is thicker than flexure alone demands, which is normal for a wall sized by shear and stiffness.'
        : undefined,
    },
    cantileverStep(
      'Toe — upward bearing pressure',
      'ACI 318-14 §22.5.1.1 (shear at d) · §7.6.1.1',
      r.toe,
      [
        txt('The toe is a cantilever bending UPWARD under the bearing pressure, so its steel goes in the BOTTOM of the base slab. The self-weight of the toe and any soil over it relieve the pressure and are neglected here — conservative, and it avoids applying a load factor to a favourable action.'),
        txt('Because the bearing reaction puts the toe into compression at the support, §22.5.1.1 allows the shear critical section to be taken at d from the face of the stem.'),
      ],
      i,
    ),
    cantileverStep(
      'Heel — downward backfill, less the pressure below',
      'ACI 318-14 §7.6.1.1 · shear at the face',
      r.heel,
      [
        txt('The heel carries the full weight of the backfill above it plus its own weight, less whatever the soil pushes back up. It bends DOWNWARD, so its steel goes in the TOP of the base slab — the opposite face from the toe, which is why a base slab needs two mats.'),
        txt('Here the load acts away from the support, so the §22.5.1.1 relief does not apply and the shear critical section stays at the face of the stem.'),
        eq(String.raw`w_{down} = ${sn1(LF.D)}\gamma_c t_b + ${sn1(LF.D)}\gamma_s H_s + ${sn1(LF.L)}q = ${sn1(LF.D)}(${sn1(gc)})(${sn2(tb)}) + ${sn1(LF.D)}(${sn1(i.gamma_s)})(${sn2(hs)}) + ${sn1(LF.L)}(${sn1(i.q_sur)}) = ${sn2(LF.D * gc * tb + LF.D * i.gamma_s * hs + LF.L * i.q_sur)}\ \text{kPa}`),
      ],
      i,
    ),
    {
      title: 'Detailing steel',
      clause: 'ACI 318-14 §11.6.1 · §24.4.3.2 · §24.4.3.3',
      lines: [
        txt('Beyond the flexural steel, a wall needs distributed reinforcement in both directions to control shrinkage and temperature cracking, and to spread any local load. None of it comes from a strength calculation — these are minimum ratios on the GROSS section.'),
        eq(String.raw`\text{Stem, horizontal: } A_{st} = 0.0020\,b\,t_s = 0.0020(1000)(${sn0(i.ts)}) = ${sn1(r.As_horiz)}\ \text{mm}^2\text{/m} \Rightarrow \varnothing${sn0(i.barDia)}\ @\ ${sn0(r.s_horiz)}\ \text{mm}`),
        eq(String.raw`\text{Stem, vertical front face: } A_{sl} = 0.0012\,b\,t_s = ${sn1(r.As_stem_front)}\ \text{mm}^2\text{/m}`),
        eq(String.raw`\text{Base slab: } A_{s,temp} = \rho\,b\,t_b = ${sn4(i.fy >= 420 ? 0.0018 : 0.0020)}(1000)(${sn0(i.tb)}) = ${sn1(r.As_temp_base)}\ \text{mm}^2\text{/m} \Rightarrow \varnothing${sn0(i.barDiaBase ?? i.barDia)}\ @\ ${sn0(r.s_temp_base)}\ \text{mm}`),
      ],
      note: `§24.4.3.2 gives ρ = 0.0018 for Grade 420 and above and 0.0020 below it; fy = ${sn0(i.fy)} MPa takes ${i.fy >= 420 ? '0.0018' : '0.0020'}.`,
    },
  ]

  return steps
}

/** One base-slab cantilever, as a step. Toe and heel differ only in their
 *  narrative and their critical section, so the arithmetic is shared. */
function cantileverStep(
  title: string, clause: string, c: SlabCantilever, intro: SolutionLine[],
  i: RetainingWallInput,
): SolutionStep {
  const dbBase = i.barDiaBase ?? i.barDia
  const govMin = c.As_min >= c.As - 1e-9
  return {
    title,
    clause,
    pass: c.shearOK,
    lines: [
      ...intro,
      eq(String.raw`d = t_b - c_c - \tfrac{d_b}{2} = ${sn0(i.tb)} - ${sn0(i.coverBase ?? 75)} - \tfrac{${sn0(dbBase)}}{2} = ${sn1(c.d)}\ \text{mm}`),
      eq(String.raw`M_u = \int_0^{L} w(u)\,u\,du = ${sn2(c.Mu)}\ \text{kN·m/m} \qquad (L = ${sn2(c.L)}\ \text{m})`),
      eq(String.raw`V_u = \int_0^{L - ${sn3(c.xv)}} w(u)\,du = ${sn2(c.Vu)}\ \text{kN/m} \;${c.shearOK ? '\\le' : '>'}\; \phi V_c = ${sn2(c.phiVc)}\ \text{kN/m}`),
      eq(String.raw`A_s = ${Number.isFinite(c.As) ? sn1(c.As) : '\\text{section too shallow}'}\ \text{mm}^2\text{/m}, \qquad A_{s,min} = \rho\,b\,t_b = ${sn1(c.As_min)}\ \text{mm}^2\text{/m}`),
      eq(String.raw`A_{s,design} = ${sn1(c.As_design)}\ \text{mm}^2\text{/m} \Rightarrow \text{adopt } \varnothing${sn0(dbBase)}\ @\ \mathbf{${sn0(c.spacing)}}\ \text{mm} \;\;(A_{s,prov} = ${sn1(c.As_prov)},\ s_{max} = ${sn0(c.spacingMax)}\ \text{mm})`),
    ],
    note: !c.shearOK
      ? 'Shear fails — thicken the base slab. A base slab is not normally stirruped, so this is a depth decision.'
      : govMin
        ? `Minimum steel governs (§7.6.1.1 → §24.4.3.2, ρ·Ag on the gross ${sn0(i.tb)} mm section, not the beam formula on b·d).`
        : undefined,
  }
}

/** Bars actually required, as a one-line schedule note for the drawing. */
export function retainingWallBarNote(i: RetainingWallInput, r: RetainingWallResult): {
  stem: string; toe: string; heel: string; temp: string
} {
  const db = i.barDia, dbB = i.barDiaBase ?? i.barDia
  return {
    stem: `⌀${db} @ ${Math.round(r.s_stem)}`,
    toe: `⌀${dbB} @ ${Math.round(r.toe.spacing)}`,
    heel: `⌀${dbB} @ ${Math.round(r.heel.spacing)}`,
    temp: `⌀${dbB} @ ${Math.round(r.s_temp_base)}`,
  }
}
