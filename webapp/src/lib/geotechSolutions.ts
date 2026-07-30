// ─────────────────────────────────────────────────────────────────────────
// Worked solutions for the ground-anchorage calculators — soil nail,
// micropile, rock anchor and shotcrete facing.
//
// These read differently from the reinforced-concrete sheets, and deliberately
// so. An RC check ends in "provide this much steel"; a ground-anchorage check
// ends in "the capacity is X, the demand is Y, the margin is X/Y". So each
// sheet derives the capacity in each failure mode, states which one governs,
// and compares the resulting factor of safety against the required one.
//
// Utilisation is reported as FS_required / FS_achieved so it reads ≤ 1 on a
// pass, matching every structural check in the app — see the note in each
// page's report payload.
// ─────────────────────────────────────────────────────────────────────────
import type { SoilNailResult } from '../engine/soilNail'
import type { MicropileResult } from '../engine/micropile'
import type { RockAnchorResult } from '../engine/rockAnchor'
import type { FacingResult } from '../engine/shotcreteFacing'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn3, sn4 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })
const fsOrDash = (v: number) => (Number.isFinite(v) ? sn2(v) : '\\infty')

// ── Soil nail ─────────────────────────────────────────────────────────────
export interface SoilNailSolutionInput {
  z: number; Sh: number; Sv: number
  gamma: number; phiDeg: number; surcharge?: number
  barDia: number; fy: number
  drillDia: number; bondLength: number; qu: number
  FSpullout?: number; FStensile?: number
}

export function buildSoilNailSolution(i: SoilNailSolutionInput, r: SoilNailResult): SolutionStep[] {
  const FSp = i.FSpullout ?? 2.0, FSt = i.FStensile ?? 1.8
  const q = i.surcharge ?? 0
  const sigma = i.gamma * i.z + q
  const Ab = (Math.PI / 4) * i.barDia ** 2
  const bondArea = Math.PI * i.drillDia * i.bondLength

  return [
    {
      title: 'Earth pressure at the nail',
      clause: 'FHWA GEC-7 · Rankine active state',
      lines: [
        txt('The wall is assumed to yield enough to mobilise the active state, so Rankine’s coefficient applies. The vertical stress at the nail depth includes any surcharge carried at the surface.'),
        eq(String.raw`K_a = \tan^2\!\left(45^\circ - \tfrac{\phi}{2}\right) = \tan^2\!\left(45^\circ - \tfrac{${sn1(i.phiDeg)}^\circ}{2}\right) = ${sn3(r.Ka)}`),
        eq(String.raw`\sigma_v = \gamma z + q = ${sn1(i.gamma)}(${sn2(i.z)}) + ${sn1(q)} = ${sn2(sigma)}\ \text{kPa}`),
      ],
    },
    {
      title: 'Nail force demand',
      clause: 'FHWA GEC-7 — tributary area',
      lines: [
        txt('Each nail carries the active thrust over its tributary panel — one horizontal spacing by one vertical spacing. This is the demand every capacity below is compared against.'),
        eq(String.raw`T_{max} = K_a\,\sigma_v\,S_h S_v = ${sn3(r.Ka)}(${sn2(sigma)})(${sn2(i.Sh)})(${sn2(i.Sv)}) = \mathbf{${sn2(r.Tmax)}}\ \text{kN}`),
      ],
    },
    {
      title: 'Bar tensile capacity',
      clause: 'FHWA GEC-7 — FS 1.8 on yield',
      pass: r.tensileOK,
      lines: [
        txt('The nail bar yielding is one of the two failure modes. Capacity is the bar area times its yield strength, and the required margin is applied to the ultimate rather than to a reduced design value.'),
        eq(String.raw`A_b = \tfrac{\pi}{4}d_b^2 = \tfrac{\pi}{4}(${sn0(i.barDia)})^2 = ${sn1(Ab)}\ \text{mm}^2`),
        eq(String.raw`T_n = A_b f_y = ${sn1(Ab)} \times ${sn0(i.fy)} / 10^3 = ${sn2(r.Tn)}\ \text{kN},\qquad T_{all} = \frac{T_n}{${sn1(FSt)}} = ${sn2(r.Tall)}\ \text{kN}`),
        eq(String.raw`FS_{tensile} = \frac{T_n}{T_{max}} = \frac{${sn2(r.Tn)}}{${sn2(r.Tmax)}} = ${fsOrDash(r.fsTensile)} \;${r.tensileOK ? '\\ge' : '<'}\; ${sn1(FSt)} \Rightarrow \textbf{${r.tensileOK ? 'OK' : 'FAILS'}}`),
      ],
    },
    {
      title: 'Grout-to-ground pullout capacity',
      clause: 'FHWA GEC-7 — FS 2.0 on bond',
      pass: r.pulloutOK,
      lines: [
        txt('The second failure mode: the grout column pulling out of the ground. Capacity is the bond stress acting over the cylindrical surface of the drilled length behind the failure surface — so only the bond length beyond the active wedge counts.'),
        eq(String.raw`A_{bond} = \pi\,D_{DH}\,L_b = \pi(${sn3(i.drillDia)})(${sn2(i.bondLength)}) = ${sn3(bondArea)}\ \text{m}^2`),
        eq(String.raw`Q_{ult} = q_u\,\pi D_{DH} L_b = ${sn1(i.qu)} \times ${sn3(bondArea)} = ${sn2(r.Qult)}\ \text{kN},\qquad Q_{all} = \frac{Q_{ult}}{${sn1(FSp)}} = ${sn2(r.Qall)}\ \text{kN}`),
        eq(String.raw`FS_{pullout} = \frac{Q_{ult}}{T_{max}} = \frac{${sn2(r.Qult)}}{${sn2(r.Tmax)}} = ${fsOrDash(r.fsPullout)} \;${r.pulloutOK ? '\\ge' : '<'}\; ${sn1(FSp)} \Rightarrow \textbf{${r.pulloutOK ? 'OK' : 'FAILS'}}`),
        eq(String.raw`L_{b,req} = \frac{FS \cdot T_{max}}{q_u \pi D_{DH}} = ${sn2(r.bondLengthReq)}\ \text{m}`),
      ],
      note: r.bondLengthReq > i.bondLength
        ? `Bond length provided (${sn2(i.bondLength)} m) is less than required — lengthen the nail.`
        : undefined,
    },
  ]
}

// ── Micropile ─────────────────────────────────────────────────────────────
export interface MicropileSolutionInput {
  mode: 'compression' | 'tension'
  barDia: number; fyBar: number; groutDia: number; fcGrout: number
  casing: boolean; casingOD: number; casingID: number; fyCasing: number
  bondDia: number; bondLength: number; alphaBond: number; FS?: number; P: number
}

export function buildMicropileSolution(i: MicropileSolutionInput, r: MicropileResult): SolutionStep[] {
  const FS = i.FS ?? 2.0
  const bondArea = Math.PI * i.bondDia * i.bondLength
  const a = r.areas as unknown as Record<string, number>

  return [
    {
      title: 'Cross-section areas',
      clause: 'FHWA-NHI-05-039 §5',
      lines: [
        txt(`A micropile carries load through a steel bar, the grout annulus, and — where fitted — a permanent casing. In ${i.mode} the contributions differ: grout is counted in compression but not in tension, where the steel alone carries the load.`),
        eq(String.raw`\text{bar } \varnothing${sn0(i.barDia)}:\ A_{bar} = \tfrac{\pi}{4}(${sn0(i.barDia)})^2 = ${sn1((Math.PI / 4) * i.barDia ** 2)}\ \text{mm}^2`),
        eq(String.raw`\text{grout } \varnothing${sn0(i.groutDia)}:\ A_{grout} = ${sn0(a.grout ?? 0)}\ \text{mm}^2${i.casing ? String.raw`,\quad \text{casing } ${sn0(i.casingOD)}/${sn0(i.casingID)}:\ A_{casing} = ${sn0(a.casing ?? 0)}\ \text{mm}^2` : ''}`),
      ],
    },
    {
      title: 'Structural capacity',
      clause: 'FHWA-NHI-05-039 §5.5',
      lines: [
        txt(i.mode === 'compression'
          ? 'In compression the allowable load combines the grout at 0.4f′c with the steel at 0.47fy — the low factors are what keeps a micropile serviceable rather than merely un-failed.'
          : 'In tension the grout is assumed cracked and contributes nothing; the steel alone carries the load at 0.55fy.'),
        eq(String.raw`P_{c,allow} = ${sn2(r.structural)}\ \text{kN}\quad(\text{${i.mode}})`),
      ],
    },
    {
      title: 'Grout-to-ground bond capacity',
      clause: 'FHWA-NHI-05-039 §5.6',
      lines: [
        txt('Bond capacity is the grout-to-ground strength over the cylindrical bond surface. αbond comes from the ground type and the drilling method, and is the single most uncertain number in a micropile design — which is why the safety factor sits on it.'),
        eq(String.raw`A_{bond} = \pi D_b L_b = \pi(${sn3(i.bondDia)})(${sn2(i.bondLength)}) = ${sn3(bondArea)}\ \text{m}^2`),
        eq(String.raw`Q_{ult} = \alpha_{bond}\,\pi D_b L_b = ${sn1(i.alphaBond)} \times ${sn3(bondArea)} = ${sn2(r.Qult)}\ \text{kN}`),
        eq(String.raw`Q_{allow} = \frac{Q_{ult}}{${sn1(FS)}} = ${sn2(r.Qbond)}\ \text{kN}`),
      ],
    },
    {
      title: 'Governing capacity and margin',
      clause: 'FHWA-NHI-05-039 §5',
      pass: r.ok,
      lines: [
        txt('The lower of the two governs. If bond governs, a longer bond zone helps; if structural governs, a longer pile does nothing and the section must change.'),
        eq(String.raw`P_{allow} = \min(P_{c,allow},\ Q_{allow}) = \min(${sn2(r.structural)},\ ${sn2(r.Qbond)}) = \mathbf{${sn2(r.allowable)}}\ \text{kN}\quad(\text{${r.governs} governs})`),
        eq(String.raw`FS = \frac{P_{allow}}{P} = \frac{${sn2(r.allowable)}}{${sn2(i.P)}} = ${fsOrDash(r.fs)} \;${r.ok ? '\\ge' : '<'}\; 1.0 \Rightarrow \textbf{${r.ok ? 'OK' : 'FAILS'}}`),
        eq(String.raw`L_{b,req} = ${sn2(r.bondLengthReq)}\ \text{m}\quad(\text{provided } ${sn2(i.bondLength)}\ \text{m})`),
      ],
      note: r.governs === 'bond'
        ? 'Bond governs — extending the bond zone raises capacity.'
        : 'Structural capacity governs — a longer pile will not help; increase the bar or add casing.',
    },
  ]
}

// ── Rock anchor ───────────────────────────────────────────────────────────
export interface RockAnchorSolutionInput {
  fpu: number; Aps: number
  holeDia: number; bondLength: number; tauUlt: number; FS?: number; T: number
}

export function buildRockAnchorSolution(i: RockAnchorSolutionInput, r: RockAnchorResult): SolutionStep[] {
  const FS = i.FS ?? 2.0
  const bondArea = Math.PI * i.holeDia * i.bondLength

  return [
    {
      title: 'Tendon capacity',
      clause: 'PTI DC35.1 §6',
      pass: r.tendonOK,
      lines: [
        txt('GUTS is the guaranteed ultimate tensile strength of the strand or bar. A permanent anchor is designed at 60% of it, which leaves room for the proof load without yielding the tendon.'),
        eq(String.raw`GUTS = f_{pu} A_{ps} = ${sn0(i.fpu)} \times ${sn0(i.Aps)} / 10^3 = ${sn2(r.GUTS)}\ \text{kN}`),
        eq(String.raw`T_d = 0.60\,GUTS = ${sn2(r.Td)}\ \text{kN} \;${r.tendonOK ? '\\ge' : '<'}\; T = ${sn2(i.T)}\ \text{kN}`),
      ],
    },
    {
      title: 'Ground bond capacity',
      clause: 'PTI DC35.1 §6.4',
      pass: r.bondOK,
      lines: [
        txt('The grout-to-rock bond over the cylindrical bond length. τult depends on rock type and roughness and is normally confirmed by a sacrificial test anchor before production work.'),
        eq(String.raw`A_{bond} = \pi D_h L_b = \pi(${sn3(i.holeDia)})(${sn2(i.bondLength)}) = ${sn3(bondArea)}\ \text{m}^2`),
        eq(String.raw`Q_{ult} = \tau_{ult}\,\pi D_h L_b = ${sn1(i.tauUlt)} \times ${sn3(bondArea)} = ${sn2(r.Qult)}\ \text{kN}`),
        eq(String.raw`Q_{all} = \frac{Q_{ult}}{${sn1(FS)}} = ${sn2(r.Qall)}\ \text{kN} \;${r.bondOK ? '\\ge' : '<'}\; T = ${sn2(i.T)}\ \text{kN}`),
        eq(String.raw`L_{b,req} = ${sn2(r.bondLengthReq)}\ \text{m}\quad(\text{provided } ${sn2(i.bondLength)}\ \text{m})`),
      ],
    },
    {
      title: 'Governing capacity and test load',
      clause: 'PTI DC35.1 §8 (testing)',
      pass: r.ok,
      lines: [
        txt('The lower of tendon and bond governs. Every production anchor is proof-loaded to the lesser of 1.33× the design load and 80% of GUTS — enough to demonstrate the bond, not enough to damage the tendon.'),
        eq(String.raw`T_{allow} = \min(T_d,\ Q_{all}) = \min(${sn2(r.Td)},\ ${sn2(r.Qall)}) = \mathbf{${sn2(r.allowable)}}\ \text{kN}\quad(\text{${r.governs} governs})`),
        eq(String.raw`FS = \frac{T_{allow}}{T} = \frac{${sn2(r.allowable)}}{${sn2(i.T)}} = ${fsOrDash(r.fs)} \;${r.ok ? '\\ge' : '<'}\; 1.0`),
        eq(String.raw`T_{test} = \min(1.33T,\ 0.80\,GUTS) = \min(${sn2(1.33 * i.T)},\ ${sn2(0.8 * r.GUTS)}) = \mathbf{${sn2(r.testLoad)}}\ \text{kN}`),
      ],
    },
  ]
}

// ── Shotcrete facing ──────────────────────────────────────────────────────
export interface FacingSolutionInput {
  SH: number; SV: number; hc: number; cover: number
  AsVert: number; AsHoriz: number; fc: number; fy: number
  bearingPlate: number; CF?: number; nailHeadForce: number
}

export function buildFacingSolution(i: FacingSolutionInput, r: FacingResult): SolutionStep[] {
  const CF = i.CF ?? 2.0
  return [
    {
      title: 'Facing section',
      clause: 'FHWA GEC-7 §6',
      lines: [
        txt('The facing spans between nail heads in both directions, so it is checked as a two-way panel. Effective depth is taken to the single reinforcement layer at mid-thickness of a thin facing.'),
        eq(String.raw`h_c = ${sn0(i.hc)}\ \text{mm},\quad cover = ${sn0(i.cover)}\ \text{mm} \Rightarrow d = ${sn1(r.d)}\ \text{mm}`),
        eq(String.raw`S_H \times S_V = ${sn2(i.SH)} \times ${sn2(i.SV)}\ \text{m},\qquad CF = ${sn2(CF)}`),
      ],
    },
    {
      title: 'Flexural strength of the panel',
      clause: 'FHWA GEC-7 §6.4',
      lines: [
        txt('Nominal moment per metre in each direction, converted to a nail-head force by the yield-line factor CF. The weaker direction governs — a panel reinforced generously one way and sparsely the other is only as strong as the sparse way.'),
        eq(String.raw`m_{vert} = ${sn2(r.mVert)}\ \text{kN·m/m},\qquad m_{horiz} = ${sn2(r.mHoriz)}\ \text{kN·m/m}`),
        eq(String.raw`R_{FF,vert} = ${sn2(r.RffVert)}\ \text{kN},\qquad R_{FF,horiz} = ${sn2(r.RffHoriz)}\ \text{kN}`),
        eq(String.raw`R_{FF} = \min(R_{FF,vert},\ R_{FF,horiz}) = ${sn2(r.Rff)}\ \text{kN}`),
      ],
    },
    {
      title: 'Punching strength at the nail head',
      clause: 'FHWA GEC-7 §6.5',
      lines: [
        txt('The second failure mode: the nail head punching a cone through the facing. It depends on the bearing-plate size and the facing thickness, not on the reinforcement — so more steel does not fix a punching failure.'),
        eq(String.raw`R_{FP} = ${sn2(r.Rfp)}\ \text{kN}\quad(\text{bearing plate } ${sn2(i.bearingPlate)}\ \text{m},\ h_c = ${sn0(i.hc)}\ \text{mm})`),
      ],
    },
    {
      title: 'Governing strength and margin',
      clause: 'FHWA GEC-7 §6',
      pass: r.ok,
      lines: [
        txt('The lower of flexure and punching governs the facing.'),
        eq(String.raw`R_F = \min(R_{FF},\ R_{FP}) = \min(${sn2(r.Rff)},\ ${sn2(r.Rfp)}) = \mathbf{${sn2(r.strength)}}\ \text{kN}\quad(\text{${r.governs} governs})`),
        eq(String.raw`FS = \frac{R_F}{T_{head}} = \frac{${sn2(r.strength)}}{${sn2(i.nailHeadForce)}} = ${fsOrDash(r.fs)} \;${r.ok ? '\\ge' : '<'}\; 1.0 \Rightarrow \textbf{${r.ok ? 'OK' : 'FAILS'}}`),
      ],
      note: r.governs === 'punching'
        ? 'Punching governs — a larger bearing plate or a thicker facing helps; more reinforcement does not.'
        : 'Flexure governs — additional reinforcement in the weaker direction raises capacity.',
    },
  ]
}

/** Shared re-export so pages can import one symbol set. */
export { sn0, sn1, sn2, sn3, sn4 }
