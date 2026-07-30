// Worked solution for a circular RC water tank wall — working-stress design
// to IS 3370 / ACI 350 practice. Mirrors engine/waterTank.ts.
//
// A liquid-retaining wall is designed for SERVICEABILITY, not ultimate
// strength: the wall is sized so the uncracked concrete carries the ring
// tension at a low permissible stress, because a wall that satisfies strength
// but cracks will leak. The sheet says so, since an engineer used to ultimate
// design will otherwise wonder where the load factors went.
import type { CircularTankResult } from '../engine/waterTank'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2, sn3 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })

export interface TankSolutionInput {
  H: number; D: number; t: number; freeboard?: number
  fc: number; sigmaSt?: number; sigmaCt?: number
  cover: number; barDia: number; gammaW?: number
}

/** Lever-arm factor used by the engine's working-stress bending. */
const J = 0.87

export function buildWaterTankSolution(i: TankSolutionInput, r: CircularTankResult): SolutionStep[] {
  const gammaW = i.gammaW ?? 9.81
  const sigmaSt = i.sigmaSt ?? 130
  const sigmaCt = i.sigmaCt ?? 1.3
  const Ec = 4700 * Math.sqrt(Math.max(i.fc, 1))
  const n = 200000 / Ec
  const Ab = (Math.PI / 4) * i.barDia ** 2
  const freeboard = i.freeboard ?? 0.3

  return [
    {
      title: 'Design basis',
      clause: 'IS 3370 / ACI 350 — working stress',
      lines: [
        txt('Liquid-retaining structures are proportioned at SERVICE loads with low permissible stresses, not at factored loads. The governing requirement is that the concrete stays uncracked in tension — a wall that is strong enough but cracks will leak, which is the failure that matters here.'),
        eq(String.raw`\sigma_{st} = ${sn0(sigmaSt)}\ \text{MPa (permissible steel)},\qquad \sigma_{ct} = ${sn2(sigmaCt)}\ \text{MPa (permissible concrete tension)}`),
        eq(String.raw`\gamma_w = ${sn2(gammaW)}\ \text{kN/m}^3,\qquad H = ${sn2(i.H)}\ \text{m},\qquad D = ${sn2(i.D)}\ \text{m},\qquad t = ${sn0(i.t)}\ \text{mm}`),
      ],
    },
    {
      title: 'Hoop tension at the base',
      clause: 'Thin-cylinder theory',
      lines: [
        txt('Water pressure is greatest at the base, and a circular wall resists it by ring tension. Treating the wall as a thin cylinder free to expand gives the upper-bound ring force — a base fixed to the floor slab sheds some of it into cantilever bending, which is covered in the next step.'),
        eq(String.raw`p = \gamma_w H = ${sn2(gammaW)} \times ${sn2(i.H)} = ${sn2(gammaW * i.H)}\ \text{kPa}`),
        eq(String.raw`T = \frac{p D}{2} = \frac{${sn2(gammaW * i.H)} \times ${sn2(i.D)}}{2} = \mathbf{${sn2(r.T)}}\ \text{kN/m}`),
      ],
    },
    {
      title: 'Hoop (ring) reinforcement',
      clause: 'Working stress — σst',
      lines: [
        txt('Ring steel carries the whole hoop tension at the permissible steel stress. It goes on both faces in practice; the area below is the total per metre of wall height.'),
        eq(String.raw`A_{s,hoop} = \frac{T}{\sigma_{st}} = \frac{${sn2(r.T)} \times 10^3}{${sn0(sigmaSt)}} = ${sn0(r.hoopAs)}\ \text{mm}^2\text{/m}`),
        eq(String.raw`A_b = \tfrac{\pi}{4}(${sn0(i.barDia)})^2 = ${sn1(Ab)}\ \text{mm}^2 \Rightarrow s = \frac{1000 A_b}{A_s} \Rightarrow \varnothing${sn0(i.barDia)}@\mathbf{${sn0(r.hoopSpacing)}}\ \text{mm}`),
      ],
    },
    {
      title: 'Base cantilever moment and vertical steel',
      clause: 'Working stress — σst, j = 0.87',
      lines: [
        txt('Where the wall is restrained by the floor slab it spans vertically as a cantilever under the triangular pressure, and needs vertical steel on the water face near the base.'),
        eq(String.raw`M = ${sn2(r.M)}\ \text{kN·m/m}`),
        eq(String.raw`d = t - cover - \tfrac{d_b}{2} = ${sn0(i.t)} - ${sn0(i.cover)} - ${sn1(i.barDia / 2)} = ${sn1(r.d)}\ \text{mm}`),
        eq(String.raw`A_{s,vert} = \frac{M}{\sigma_{st}\,j\,d} = \frac{${sn2(r.M)} \times 10^6}{${sn0(sigmaSt)} \times ${sn2(J)} \times ${sn1(r.d)}} = ${sn0(r.vertAs)}\ \text{mm}^2\text{/m} \Rightarrow \varnothing${sn0(i.barDia)}@\mathbf{${sn0(r.vertSpacing)}}\ \text{mm}`),
      ],
    },
    {
      title: 'Crack control — concrete tensile stress',
      clause: 'IS 3370 §4 (uncracked section)',
      pass: r.thicknessOK,
      lines: [
        txt('The check that actually sizes the wall. The ring tension is shared by the gross concrete area and the transformed steel; if the resulting tensile stress exceeds the permissible value the section cracks and the tank leaks. The remedy is a thicker wall — adding steel barely moves this number.'),
        eq(String.raw`E_c = 4700\sqrt{f'_c} = 4700\sqrt{${sn0(i.fc)}} = ${sn0(Ec)}\ \text{MPa},\qquad n = \frac{E_s}{E_c} = \frac{200000}{${sn0(Ec)}} = ${sn2(n)}`),
        eq(String.raw`f_{ct} = \frac{T}{1000\,t + (n-1)A_{s,hoop}} = \frac{${sn2(r.T)} \times 10^3}{1000(${sn0(i.t)}) + (${sn2(n)}-1)(${sn0(r.hoopAs)})} = ${sn3(r.fct)}\ \text{MPa}`),
        eq(String.raw`${sn3(r.fct)} \;${r.thicknessOK ? '\\le' : '>'}\; \sigma_{ct} = ${sn2(sigmaCt)} \Rightarrow \textbf{${r.thicknessOK ? 'uncracked — OK' : 'CRACKS — thicken the wall'}}`),
      ],
      note: r.thicknessOK ? undefined : 'Increasing the hoop steel will not fix this; the concrete area is what carries the tension.',
    },
    {
      title: 'Freeboard',
      clause: 'Good practice',
      pass: r.freeboardOK,
      lines: [
        txt('Freeboard above the design water level keeps sloshing and overfilling from spilling over the wall. 300 mm is a common minimum for a static tank; a tank subject to seismic sloshing needs more.'),
        eq(String.raw`\text{freeboard} = ${sn2(freeboard)}\ \text{m} \;${r.freeboardOK ? '\\ge' : '<'}\; 0.30\ \text{m} \Rightarrow \textbf{${r.freeboardOK ? 'OK' : 'BELOW RECOMMENDED'}}`),
      ],
    },
  ]
}
