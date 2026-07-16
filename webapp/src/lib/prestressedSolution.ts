// Worked solution for the prestressed beam engine (engine/prestressedBeam.ts).
import type { PrestressedInput, PrestressedResult } from '../engine/prestressedBeam'
import { type SolutionStep, type SolutionLine, sn0, sn1, sn2 } from './solution'

const txt = (text: string): SolutionLine => ({ text })
const eq = (tex: string): SolutionLine => ({ tex })
const f = (v: number) => sn1(v)

export function buildPrestressedSolution(i: PrestressedInput, r: PrestressedResult): SolutionStep[] {
  return [
    {
      title: 'Section properties & moments',
      clause: 'simple span',
      lines: [
        eq(String.raw`A = ${sn0(r.A)}\ \text{mm}^2,\quad I = ${sn0(r.I / 1e6)}\times 10^6\ \text{mm}^4,\quad S_t = ${sn0(r.St / 1e3)}\times 10^3,\ S_b = ${sn0(r.Sb / 1e3)}\times 10^3\ \text{mm}^3`),
        eq(String.raw`w_{sw} = ${sn2(r.wSW)}\ \text{kN/m} \Rightarrow M_{sw} = ${f(r.Msw)},\ M_{serv} = ${f(r.Mserv)},\ M_u = ${f(r.Mu)}\ \text{kN·m}`),
      ],
    },
    {
      title: 'Prestress losses (PCI: ES + CR + SH + RE)',
      clause: 'PCI handbook',
      lines: [
        txt(`Jacking at ${sn0(i.fpj ?? 0.74 * i.fpu)} MPa. Elastic shortening from fcir at the strand cg (fixed-point on Pi); creep 2.0(Ep/Ec)(fcir − fcds); shrinkage with V/S and RH; low-relaxation RE.`),
        eq(String.raw`ES = ${f(r.ES)},\quad CR = ${f(r.CR)},\quad SH = ${f(r.SH)},\quad RE = ${f(r.RE)}\ \text{MPa}`),
        eq(String.raw`f_{se} = ${f(r.fse)}\ \text{MPa}\ (${f(r.lossPct)}\%\ \text{loss}),\qquad P_i = ${f(r.Pi)},\ P_e = ${f(r.Pe)}\ \text{kN}`),
      ],
    },
    {
      title: 'Stresses at transfer (Pi + self-weight)',
      clause: 'ACI 318-14 §24.5.3',
      pass: r.transferOK,
      lines: [
        eq(String.raw`\sigma = \tfrac{P_i}{A} \mp \tfrac{P_i e}{S} \pm \tfrac{M_{sw}}{S}:\quad \sigma_{top} = ${f(r.transfer.top)},\ \sigma_{bot} = ${f(r.transfer.bot)}\ \text{MPa}`),
        eq(String.raw`\text{limits: } +${f(r.limTransferC)}\ (0.60 f'_{ci})\ /\ -${f(r.limTransferT)}\ (0.25\sqrt{f'_{ci}})\ ${r.transferOK ? '\\checkmark' : '\\times'}`),
      ],
    },
    {
      title: `Stresses at service (Pe + total) — class ${i.klass ?? 'U'}`,
      clause: 'ACI 318-14 §24.5.4',
      pass: r.serviceOK,
      lines: [
        eq(String.raw`\sigma_{top} = ${f(r.service.top)},\quad \sigma_{bot} = ${f(r.service.bot)}\ \text{MPa}`),
        eq(String.raw`\text{limits: } +${f(r.limServiceC)}\ (0.60 f'_c)\ /\ -${Number.isFinite(r.limServiceT) ? f(r.limServiceT) : '\\infty'}\ (0.62\sqrt{f'_c},\ \text{class U})\ ${r.serviceOK ? '\\checkmark' : '\\times'}`),
      ],
    },
    {
      title: 'Flexural strength',
      clause: 'ACI 318-14 §20.3.2.3.1',
      pass: r.strengthOK,
      lines: [
        eq(String.raw`f_{ps} = f_{pu}\left(1 - \tfrac{\gamma_p}{\beta_1}\rho_p\tfrac{f_{pu}}{f'_c}\right) = ${f(r.fps)}\ \text{MPa},\quad a = ${f(r.a)}\ \text{mm},\ \phi = ${sn2(r.phi)}`),
        eq(String.raw`\phi M_n = \phi A_{ps} f_{ps}(d_p - \tfrac{a}{2}) = ${f(r.phiMn)}\ \text{kN·m}\ ${r.strengthOK ? '\\ge' : '<'}\ M_u = ${f(r.Mu)}\ ${r.strengthOK ? '\\checkmark' : '\\times'}`),
      ],
    },
    {
      title: 'Cracking-moment guard',
      clause: 'ACI 318-14 §9.6.2.1',
      pass: r.crackingOK,
      lines: [
        eq(String.raw`M_{cr} = (f_r + \tfrac{P_e}{A} + \tfrac{P_e e}{S_b})S_b = ${f(r.Mcr)}\ \text{kN·m};\quad \phi M_n = ${f(r.phiMn)}\ ${r.crackingOK ? '\\ge' : '<'}\ 1.2 M_{cr} = ${f(1.2 * r.Mcr)}\ ${r.crackingOK ? '\\checkmark' : '\\times'}`),
      ],
    },
    {
      title: 'Concrete shear Vci / Vcw',
      clause: 'ACI 318-14 §22.5.8.3',
      lines: [
        eq(String.raw`V_{ci} = ${f(r.Vci)},\quad V_{cw} = ${f(r.Vcw)}\ \text{kN} \Rightarrow V_c = ${f(r.Vc)}\ \text{kN}`),
        txt(`${r.shearNote}. Vu at the critical section = ${f(r.Vu)} kN — stirrups per §9.7.6.2.2 where φVc is exceeded.`),
      ],
    },
    {
      title: 'Camber & deflection (midspan, elastic)',
      clause: 'serviceability',
      lines: [
        eq(String.raw`\Delta_{p} = \tfrac{P_e e L^2}{8 E_c I} = ${f(r.camber)}\ \text{mm}\uparrow,\quad \Delta_{w} = \tfrac{5 w L^4}{384 E_c I} = ${f(r.deltaLoad)}\ \text{mm}\downarrow \Rightarrow \Delta_{net} = ${f(r.deltaNet)}\ \text{mm}`),
      ],
      note: r.notes.join(' · ') || undefined,
    },
  ]
}
