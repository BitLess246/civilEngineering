// ─────────────────────────────────────────────────────────────────────────
// Worked steps for the material estimates (engine/quantities.ts). Each
// builder restates one take-off rule with the numbers the engine used, so the
// page's Calculations tab and the PDF show how every quantity was reached.
// Units as the engine: m, m², m³; bar diameters mm; steel kg.
// ─────────────────────────────────────────────────────────────────────────
import {
  BAR_LENGTH, STEEL_DENSITY, TIE_WIRE_ROLL,
  type BarTakeoff, type ConcreteClass, type ConcreteMaterials, type TieTakeoff, type TieWire,
} from '../engine/quantities'
import { sn2, sn3, type SolutionStep } from './solution'
import type { ResultRow } from '../components/workspace'

const n0 = (v: number) => Math.round(v).toString()

/** Concrete volume and its cement / sand / gravel, from a volume expression. */
export function concreteStep(volumeTex: string, m: ConcreteMaterials, klass: ConcreteClass): SolutionStep {
  return {
    title: 'Concrete and materials',
    lines: [
      { tex: `V = ${volumeTex} = ${sn3(m.volume)}\\ \\text{m}^3` },
      { text: `Class ${klass === 'custom' ? 'custom' : klass} mix: ${m.factor} bags of cement, 0.5 m³ sand and 1.0 m³ gravel per m³ of concrete.` },
      { tex: `\\text{cement} = \\lceil ${sn3(m.volume)} \\times ${m.factor} \\rceil = ${m.cement}\\ \\text{bags}` },
      { tex: `\\text{sand} = 0.5 \\times ${sn3(m.volume)} = ${sn3(m.sand)}\\ \\text{m}^3,\\quad \\text{gravel} = 1.0 \\times ${sn3(m.volume)} = ${sn3(m.gravel)}\\ \\text{m}^3` },
    ],
  }
}

/** Steel weight of `pieces` commercial bars. */
const weightTex = (pieces: number, diaMm: number, weight: number) =>
  `W = ${pieces} \\times ${BAR_LENGTH} \\times \\tfrac{\\pi}{4}(${diaMm / 1000})^2 \\times ${STEEL_DENSITY} = ${sn2(weight)}\\ \\text{kg}`

/** Main bars bought in 6 m lengths, each lapped by the splice length. */
export function barStep(title: string, netTex: string, t: BarTakeoff, spliceLength: number): SolutionStep {
  return {
    title,
    lines: [
      { tex: `L_{net} = ${netTex} = ${sn2(t.netLength)}\\ \\text{m}` },
      { tex: `L_{usable} = ${BAR_LENGTH} - ${sn2(spliceLength)} = ${sn2(t.splice)}\\ \\text{m per bar}` },
      { tex: `n = \\lceil ${sn2(t.netLength)} / ${sn2(t.splice)} \\rceil = ${t.pieces}\\ \\text{bars of } ${BAR_LENGTH}\\ \\text{m, ⌀}${t.diaMm}` },
      { tex: weightTex(t.pieces, t.diaMm, t.weight) },
    ],
    note: t.splice <= 0 ? 'The splice is as long as a commercial bar — no usable length is left, so nothing could be counted.' : undefined,
  }
}

/** Ties or stirrups cut from 6 m bars, whole cuts only. */
export function tieStep(title: string, lengthPerSet: number, noSets: number, numStructures: number, t: TieTakeoff): SolutionStep {
  return {
    title,
    lines: [
      { tex: `\\text{cuts per bar} = \\lfloor ${BAR_LENGTH} / ${sn2(lengthPerSet)} \\rfloor = ${t.cutsPer6m}` },
      { tex: `\\text{cuts} = ${n0(noSets)} \\times ${n0(numStructures)} = ${t.totalCuts}` },
      { tex: `n = \\lceil ${t.totalCuts} / ${t.cutsPer6m} \\rceil = ${t.pieces}\\ \\text{bars, ⌀}${t.diaMm}` },
      { tex: weightTex(t.pieces, t.diaMm, t.weight) },
    ],
    note: t.cutsPer6m === 0 ? `A ${sn2(lengthPerSet)} m tie does not fit in a ${BAR_LENGTH} m bar, so none could be counted.` : undefined,
  }
}

/** Tie wire: one cut per bar crossing, bought in rolls. */
export function tieWireStep(intersectionsTex: string, lengthPerCut: number, numStructures: number, w: TieWire): SolutionStep {
  return {
    title: 'Tie wire',
    lines: [
      { tex: `\\text{crossings} = ${intersectionsTex} = ${w.intersections}` },
      { tex: `L = ${sn2(lengthPerCut)} \\times ${w.intersections} \\times ${n0(numStructures)} = ${sn2(w.netLength)}\\ \\text{m}` },
      { tex: `\\text{rolls} = \\lceil ${sn2(w.netLength)} / ${TIE_WIRE_ROLL} \\rceil = ${w.rolls}` },
    ],
  }
}

/** The concrete block every estimate's results table opens with. */
export function concreteRows(m: ConcreteMaterials): ResultRow[] {
  return [
    { check: 'Concrete volume', basis: 'net volume', demand: `${sn2(m.volume)} m³`, status: 'info' },
    { check: 'Cement', basis: `⌈V × ${m.factor}⌉`, demand: `${m.cement} bags`, status: 'info' },
    { check: 'Sand', basis: '0.5 × V', demand: `${sn2(m.sand)} m³`, status: 'info' },
    { check: 'Gravel', basis: '1.0 × V', demand: `${sn2(m.gravel)} m³`, status: 'info' },
  ]
}

/** One results row for a commercial-bar take-off. */
export function barRow(label: string, t: { pieces: number; weight: number; netLength: number }, diaMm: number): ResultRow {
  return { check: `${label} ⌀${diaMm}`, basis: `${sn2(t.netLength)} m net`, demand: `${sn2(t.weight)} kg`, limit: `${t.pieces} × ${BAR_LENGTH} m`, status: 'info' }
}

/** Status for a steel take-off that could not be counted (a cut longer than
 *  the stock bar, or a splice that eats the whole bar). */
export const takeoffStatus = (ok: boolean) => (ok ? 'info' as const : 'warn' as const)
