// Code Library — NSCP 2015 §203.3 strength-design load combinations.
//
// The combinations are the engine's own table (`calcLoadCombinations`,
// engine/loadCombinations — the one the Load Combinations calculator runs),
// so the page cannot list a factor the calculator does not use. The prose is
// Zeta's own; the combination text is the standard algebra, not code wording.
// Units: whatever one consistent unit the load effects are entered in.
import { calcLoadCombinations } from '../../engine/loadCombinations'
import type { CodeRef, LoadExampleInput, LoadsProvision } from './types'

const ED = 'NSCP 2015' as const
const ref = (clause: string, topic: string, parallel?: string): CodeRef => ({ edition: ED, clause, topic, parallel })
const n1 = (v: number) => v.toFixed(1)

export const DEFAULT_LOADS: LoadExampleInput = { D: 100, L: 60, Lr: 10, W: 40, E: 50 }

const combos: LoadsProvision = {
  family: 'loads',
  defaults: DEFAULT_LOADS,
  fields: [
    { key: 'D', label: 'D', min: 0 }, { key: 'L', label: 'L', min: 0 }, { key: 'Lr', label: 'Lr', min: 0 },
    { key: 'W', label: 'W', min: 0 }, { key: 'E', label: 'E', min: 0 },
  ],
  id: 'load-combinations',
  title: 'Strength-design load combinations',
  category: 'loads',
  component: 'All members',
  summary: 'A member is designed for the worst of a set of factored combinations of the service load effects. Each combination pairs the load that is at its largest with the others at their likely companion values, and each load is scaled by a factor that reflects how uncertain it is. Wind and earthquake act in either direction, so they enter with both signs, and the 0.9D combinations check the case where gravity helps resist uplift or overturning.',
  why: 'The loads on a building never all peak together, and some are far better known than others. Factored combinations give every member the same reliability under the most demanding plausible pairing, without assuming the impossible case of everything at its maximum at once.',
  mistakes: [
    'Designing for only 1.2D + 1.6L and missing a wind or earthquake combination that governs a column or a connection.',
    'Dropping the 0.9D combinations — they govern uplift, overturning and the tension side of a reversing member.',
    'Adding a load effect with the wrong sign: W and E reverse, and a combination must be checked both ways.',
  ],
  refs: {
    combos: ref('§203.3.1', 'Basic combinations for strength design', 'ASCE 7-10 §2.3.2'),
  },
  variables: {
    D: { tex: 'D', name: 'Dead load effect', unit: 'any', role: 'demand' },
    L: { tex: 'L', name: 'Floor live load effect', unit: 'any', role: 'demand' },
    Lr: { tex: 'L_r', name: 'Roof live load effect', unit: 'any', role: 'demand' },
    W: { tex: 'W', name: 'Wind load effect (both directions)', unit: 'any', role: 'demand' },
    E: { tex: 'E', name: 'Earthquake load effect (both directions)', unit: 'any', role: 'demand' },
    U: { tex: 'U', name: 'Governing (largest) factored effect', unit: 'any', role: 'capacity' },
    Umin: { tex: 'U_{\\min}', name: 'Smallest factored effect — the uplift / reversal case', unit: 'any', role: 'capacity' },
  },
  equations: [
    { id: '1', label: 'Dead load alone', tex: 'U = 1.4D', vars: ['U', 'D'], ref: 'combos' },
    { id: '2', label: 'Live load at its maximum', tex: 'U = 1.2D + 1.6L + 0.5L_r', vars: ['U', 'D', 'L', 'Lr'], ref: 'combos' },
    { id: '3', label: 'Roof live at its maximum', tex: 'U = 1.2D + 1.6L_r + (1.0L \\text{ or } 0.5W)', vars: ['U', 'D', 'Lr', 'L', 'W'], ref: 'combos' },
    { id: '4', label: 'Wind at its maximum', tex: 'U = 1.2D \\pm 1.0W + 1.0L + 0.5L_r', vars: ['U', 'D', 'W', 'L', 'Lr'], ref: 'combos' },
    { id: '5', label: 'Earthquake at its maximum', tex: 'U = 1.2D \\pm 1.0E + 1.0L', vars: ['U', 'D', 'E', 'L'], ref: 'combos' },
    { id: '6', label: 'Gravity resisting wind or earthquake', tex: 'U = 0.9D \\pm 1.0W \\quad\\text{or}\\quad 0.9D \\pm 1.0E', vars: ['U', 'D', 'W', 'E'], ref: 'combos' },
  ],
  diagram: 'load-combos',
  calculators: [{ to: '/load-combinations', label: 'Open Load Combinations' }],
  related: [],
  verification: 'engine-matched',
  keywords: ['load combination', 'LRFD', 'factored load', '1.2D', '1.6L', '0.9D', 'wind', 'earthquake', 'strength design', '203'],
  evaluate(i) {
    const r = calcLoadCombinations(i)
    return {
      values: { ...i, U: r.maxCombo.value, Umin: r.minCombo.value },
      checks: [],
      lines: [
        ...r.combos.map((c) => ({ tex: `\\text{(${c.id})}\\ ${c.label.replace(/−/g, '-').replace(/Lr/g, 'L_r')} = ${n1(c.value)}` })),
        { text: `Governing (largest): (${r.maxCombo.id}) ${r.maxCombo.label} = ${n1(r.maxCombo.value)}. Smallest — the uplift / reversal case: (${r.minCombo.id}) = ${n1(r.minCombo.value)}.` },
        { text: 'Combination 3a and the wind/earthquake rows use 1.0L — the factor for assembly areas, garages and live loads over 4.8 kPa, and the conservative choice elsewhere (NSCP allows 0.5L for other occupancies).' },
      ],
    }
  },
}

export const LOADS_PROVISIONS: LoadsProvision[] = [combos]
