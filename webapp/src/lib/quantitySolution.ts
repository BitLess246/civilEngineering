// Worked solutions for the material-takeoff estimators — mirrors
// engine/quantities.ts so the steps match the result panels.
import type {
  SlabInput, SlabResult, ChbInput, ChbResult, ColumnInput, ColumnResult,
  BeamInput, BeamResult, BoxCulvertInput, BoxCulvertResult, BarTakeoff, TieTakeoff, TieWire,
} from '../engine/quantities'
import { type SolutionStep, sn2, sn3 } from './solution'

const materialsStep = (volExpr: string, m: { volume: number; cement: number; sand: number; gravel: number; factor: number }): SolutionStep => ({
  title: 'Concrete materials',
  lines: [
    { tex: `\\text{Cement} = \\lceil V \\cdot f \\rceil = \\lceil ${sn2(m.volume)}\\times ${m.factor} \\rceil = ${m.cement}\\ \\text{bags}` },
    { tex: `\\text{Sand} = V\\times 0.5 = ${sn2(m.sand)}\\ \\text{m}^3,\\quad \\text{Gravel} = V\\times 1.0 = ${sn2(m.gravel)}\\ \\text{m}^3` },
  ],
  note: `Mix factor f = ${m.factor} bags/m³. ${volExpr}`,
})

const barStep = (title: string, netExpr: string, b: BarTakeoff): SolutionStep => ({
  title,
  lines: [
    { tex: `L_{net} = ${netExpr} = ${sn2(b.netLength)}\\ \\text{m}` },
    { tex: `n = \\lceil L_{net} / (6 - splice) \\rceil = ${b.pieces}\\ \\text{pcs of 6 m}` },
    { tex: `W = n \\cdot 6 \\cdot \\tfrac{\\pi}{4}d_b^2 \\cdot 7850 = ${sn2(b.weight)}\\ \\text{kg}\\ (\\varnothing${b.diaMm})` },
  ],
})

const tieStep = (title: string, t: TieTakeoff): SolutionStep => ({
  title,
  lines: [
    { tex: `\\text{cuts}/6m = \\lfloor 6/\\ell \\rfloor = ${t.cutsPer6m},\\quad \\text{total} = ${t.totalCuts}` },
    { tex: `n = \\lceil ${t.totalCuts}/${t.cutsPer6m} \\rceil = ${t.pieces}\\ \\text{pcs},\\quad W = ${sn2(t.weight)}\\ \\text{kg}\\ (\\varnothing${t.diaMm})` },
  ],
})

const tieWireStep = (w: TieWire): SolutionStep => ({
  title: 'G.I. tie wire',
  lines: [
    { tex: `L = \\ell_{cut}\\cdot ${w.intersections}\\ \\text{intersections} = ${sn2(w.netLength)}\\ \\text{m}` },
    { tex: `\\text{rolls} = \\lceil L/2385 \\rceil = ${w.rolls}` },
  ],
})

export function slabSolution(i: SlabInput, r: SlabResult): SolutionStep[] {
  const volExpr = `V = ${sn2(i.slabArea)}\\times ${sn3(i.thickness)}\\times ${i.numStructures} = ${sn2(r.volume)}\\ \\text{m}^3`
  return [
    { title: 'Concrete volume', lines: [{ tex: volExpr }] },
    materialsStep('', r.materials),
    barStep('Main steel — long span', `${sn2(i.longSpanLength)}\\times ${i.numLongPieces}\\times ${i.numStructures}`, r.longSteel),
    barStep('Main steel — short span', `${sn2(i.shortSpanLength)}\\times ${i.numShortPieces}\\times ${i.numStructures}`, r.shortSteel),
    { title: 'Total steel weight', lines: [{ tex: `W = ${sn2(r.longSteel.weight)} + ${sn2(r.shortSteel.weight)} = ${sn2(r.totalSteelWeight)}\\ \\text{kg}` }] },
    tieWireStep(r.tieWire),
  ]
}

export function chbSolution(i: ChbInput, r: ChbResult): SolutionStep[] {
  return [
    { title: 'Net wall area', lines: [{ tex: `A = ${sn2(i.wallArea)} - ${sn2(i.holeArea)} = ${sn2(r.netArea)}\\ \\text{m}^2` }] },
    { title: 'Number of blocks', lines: [{ tex: `n = \\lceil A\\times 12.5 \\rceil = ${r.pieces}\\ \\text{pcs}\\ (${i.size}")` }] },
    {
      title: 'Mortar', lines: [
        { tex: `\\text{Cement} = \\lceil ${sn2(r.netArea)}\\times f_c \\rceil = ${r.mortar.cement}\\ \\text{bags}` },
        { tex: `\\text{Sand} = ${sn2(r.netArea)}\\times f_s = ${sn3(r.mortar.sand)}\\ \\text{m}^3` },
      ],
    },
    {
      title: 'Plaster', lines: [
        { tex: `\\text{Cement} = \\lceil ${sn2(r.netArea)}\\times 0.3 \\rceil = ${r.plaster.cement}\\ \\text{bags},\\quad \\text{Sand} = ${sn2(r.netArea)}\\times 0.025 = ${sn3(r.plaster.sand)}\\ \\text{m}^3` },
      ],
    },
    { title: 'Totals', lines: [{ tex: `\\text{Cement} = ${r.totalCement}\\ \\text{bags},\\quad \\text{Sand} = ${sn3(r.totalSand)}\\ \\text{m}^3` }] },
  ]
}

export function columnSolution(i: ColumnInput, r: ColumnResult): SolutionStep[] {
  const volExpr = `V = ${sn2(i.length)}\\times ${sn2(i.width)}\\times ${sn2(i.height)}\\times ${i.numStructures} = ${sn2(r.volume)}\\ \\text{m}^3`
  return [
    { title: 'Concrete volume', lines: [{ tex: volExpr }] },
    materialsStep('', r.materials),
    barStep('Vertical bars', `${sn2(i.barLengthPerPiece)}\\times ${i.numBars}\\times ${i.numStructures}`, r.mainSteel),
    tieStep('Lateral ties', r.lateralTies),
    tieWireStep(r.tieWire),
  ]
}

export function beamQtySolution(i: BeamInput, r: BeamResult): SolutionStep[] {
  const volExpr = `V = ${sn2(i.length)}\\times ${sn2(i.width)}\\times ${sn2(i.height)}\\times ${i.numStructures} = ${sn2(r.volume)}\\ \\text{m}^3`
  const barSteps = r.mainBars.map((b) =>
    barStep(`Main steel — ${b.label}`, `${sn2(b.takeoff.netLength / i.numStructures)}\\times ${i.numStructures}`, b.takeoff))
  return [
    { title: 'Concrete volume', lines: [{ tex: volExpr }] },
    materialsStep('', r.materials),
    ...barSteps,
    { title: 'Total main steel', lines: [{ tex: `W = ${sn2(r.totalMainWeight)}\\ \\text{kg}` }] },
    tieStep('Stirrups', r.stirrups),
    tieWireStep(r.tieWire),
  ]
}

export function boxCulvertSolution(i: BoxCulvertInput, r: BoxCulvertResult): SolutionStep[] {
  return [
    { title: 'Net section & volume', lines: [
      { tex: `A = ${sn2(i.grossArea)} - ${sn2(i.holeArea)} = ${sn2(r.netArea)}\\ \\text{m}^2` },
      { tex: `V = A\\times L = ${sn2(r.netArea)}\\times ${sn2(i.length)} = ${sn2(r.volume)}\\ \\text{m}^3` },
    ] },
    materialsStep('', r.materials),
    barStep('Longitudinal — top', `${sn2(i.length)}\\times ${i.numLongTop}`, r.longTop),
    barStep('Longitudinal — U bars', `${sn2(i.length)}\\times ${i.numLongU}`, r.longU),
    { title: 'Reinforcing rings (RSB)', lines: [
      { tex: `n_{RSB} = \\lceil L/s \\rceil + 1 = \\lceil ${sn2(i.length)}/${sn2(i.rsbSpacing)} \\rceil + 1 = ${r.rsb.count}` },
      { tex: `\\text{Top: } ${r.rsb.top.pieces}\\ \\text{pcs}, ${sn2(r.rsb.top.weight)}\\ \\text{kg};\\quad \\text{U: } ${r.rsb.u.pieces}\\ \\text{pcs}, ${sn2(r.rsb.u.weight)}\\ \\text{kg}` },
    ] },
    tieWireStep(r.tieWire),
  ]
}
