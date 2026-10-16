// Code Library — the NSCP 2015 §208 static lateral-force procedure: the design
// base shear V = Cs·W and the force Ft concentrated at the roof.
//
// Every number is the Seismic Wizard's and the Model Space seismic
// generator's: `nscpSeismicParams` reads Z, Na/Nv, Ca/Cv, I and R off the
// tables, `baseShearCoeff` applies equations 208-8 to 208-11, and the roof
// force is `computeSeismic`'s own rule (Ft = 0.07TV ≤ 0.25V above 0.7 s).
// `seismic.test.ts` holds the example to the engine, to a hand calculation,
// and to `computeSeismic` on a modelled frame. The prose is Zeta's own; no
// table or code text is reproduced. Units: s, kN.
import { nscpSeismicParams, baseShearCoeff, STRUCTURAL_SYSTEMS } from '../../engine/nscpSeismic'
import type { CodeRef, ExampleResult, Flowchart, SeismicExampleInput, SeismicProvision } from './types'

const ED = 'NSCP 2015' as const
const ref = (clause: string, topic: string, parallel?: string): CodeRef => ({ edition: ED, clause, topic, parallel })
const n1 = (v: number) => v.toFixed(1)
const n3 = (v: number) => v.toFixed(3)
const n4 = (v: number) => v.toFixed(4)

export const SYSTEM_NAMES: readonly string[] = STRUCTURAL_SYSTEMS.map((s) => s.name)

/** The Seismic Wizard's defaults, with a 10 000 kN building. */
export const DEFAULT_SEISMIC: SeismicExampleInput = {
  zone: '4', soil: 'SD', source: 'B', distance: 10, occupancy: 'standard',
  system: STRUCTURAL_SYSTEMS[0].name, T: 0.5, W: 10000,
}

const GOVERNS: Record<string, string> = {
  basic: 'eq. 208-8, Cv·I/(R·T)',
  'max-cap': 'the cap of eq. 208-9, 2.5·Ca·I/R',
  'min-floor': 'the floor of eq. 208-10, 0.11·Ca·I',
  'zone4-floor': 'the Zone 4 floor of eq. 208-11, 0.8·Z·Nv·I/R',
}

/** The base shear from the engine. Null for an impossible input. */
export function seismicExample(i: SeismicExampleInput) {
  const sys = STRUCTURAL_SYSTEMS.find((s) => s.name === i.system)
  if (!sys || !(i.T > 0) || !(i.W > 0)) return null
  const zone = i.zone === '4' ? 4 : 2
  const p = nscpSeismicParams({ zone, soil: i.soil, occupancy: i.occupancy, R: sys.R, source: i.source, distanceKm: i.distance })
  const c = baseShearCoeff({ Ca: p.Ca, Cv: p.Cv, I: p.I, R: p.R, T: i.T, Z: p.Z, Nv: p.Nv })
  const V = c.Cs * i.W
  // the roof force, as computeSeismic applies it
  const Ft = i.T > 0.7 ? Math.min(0.07 * i.T * V, 0.25 * V) : 0
  return { sys, p, c, V, Ft }
}

const outOfScope = (why: string): ExampleResult => ({ values: {}, checks: [], lines: [{ text: why }] })

const baseShear: SeismicProvision = {
  family: 'seismic',
  defaults: DEFAULT_SEISMIC,
  fields: [
    { key: 'zone', label: 'Seismic zone', options: ['4', '2'] },
    { key: 'soil', label: 'Soil profile', options: ['SA', 'SB', 'SC', 'SD', 'SE'] },
    { key: 'source', label: 'Seismic source type (Zone 4)', options: ['A', 'B', 'C'] },
    { key: 'distance', label: 'Distance to source', unit: 'km', min: 0, max: 100 },
    { key: 'occupancy', label: 'Occupancy', options: ['standard', 'special', 'essential', 'hazardous'] },
    { key: 'system', label: 'Structural system', options: SYSTEM_NAMES },
    { key: 'T', label: 'Period T', unit: 's', min: 0.05, max: 10, step: '0.01' },
    { key: 'W', label: 'Seismic weight W', unit: 'kN', min: 1, max: 1e7 },
  ],
  id: 'nscp-static-base-shear',
  title: 'Static design base shear',
  category: 'seismic',
  component: 'Building',
  summary: 'The static procedure replaces the earthquake with one horizontal force at the base, V = Cs·W, shared up the height of the building. Cs falls with the period T — a stiff building feels more of the ground shaking than a flexible one — and is reduced by R, the credit a ductile system earns for yielding without collapse. It is capped for very short periods, where the shaking stops rising, and never taken below two floors: a minimum for every building and, in Zone 4, one that depends on how close the nearest fault is. For a period above 0.7 s part of V is applied at the roof as Ft, standing in for the higher modes.',
  why: 'A design earthquake is a dynamic event, but most buildings can be designed for an equivalent static load if that load is calibrated to the shaking the site can see, the period of the building and how much it can deform inelastically. The caps and floors are there because the simple 1/T curve is unreliable at its two ends.',
  mistakes: [
    'Using a period from analysis without the limit: an analytical T may not exceed the empirical one by more than 30 % in Zone 4 (40 % elsewhere) — a stiffer-than-modelled building feels more force.',
    'Missing the Zone 4 floor 0.8·Z·Nv·I/R, which governs long-period buildings near an active fault.',
    'Taking W as the dead load of the floors alone — the seismic weight includes the walls, partitions and permanent equipment.',
    'Using the R of the system you wish you had: R is the credit for the detailing the drawings actually call for.',
  ],
  refs: {
    site: ref('§208.4', 'Zone Z, soil profile, Ca and Cv (Tables 208-7, 208-8), near-source Na and Nv (Tables 208-4, 208-5)'),
    imp: ref('§208.4.2', 'Occupancy category and importance factor I (Table 208-1)'),
    sys: ref('§208.4.6', 'Structural systems and R (Table 208-11)'),
    v: ref('§208.5.2.1', 'Design base shear, eqs. 208-8 to 208-11', 'UBC-97 §1630.2.1'),
    t: ref('§208.5.2.2', 'Structure period — Method A and the Method B limit', 'UBC-97 §1630.2.2'),
    ft: ref('§208.5.5', 'Vertical distribution of force; the top force Ft', 'UBC-97 §1630.5'),
  },
  variables: {
    Z: { tex: 'Z', name: 'Seismic zone factor', unit: '—', role: 'factor' },
    Na: { tex: 'N_a', name: 'Near-source factor on Ca (Zone 4)', unit: '—', role: 'factor' },
    Nv: { tex: 'N_v', name: 'Near-source factor on Cv (Zone 4)', unit: '—', role: 'factor' },
    Ca: { tex: 'C_a', name: 'Seismic coefficient — the short-period plateau', unit: '—', role: 'factor' },
    Cv: { tex: 'C_v', name: 'Seismic coefficient — the velocity-controlled branch', unit: '—', role: 'factor' },
    I: { tex: 'I', name: 'Importance factor', unit: '—', role: 'factor' },
    R: { tex: 'R', name: 'Response modification for the system', unit: '—', role: 'factor' },
    T: { tex: 'T', name: 'Fundamental period of the building', unit: 's', role: 'geometry' },
    W: { tex: 'W', name: 'Total seismic dead load', unit: 'kN', role: 'demand' },
    Csraw: { tex: 'C_{v}I/RT', name: 'Basic coefficient, eq. 208-8', unit: '—', role: 'intermediate' },
    Csmax: { tex: '2.5C_aI/R', name: 'Cap, eq. 208-9', unit: '—', role: 'intermediate' },
    Csmin: { tex: '0.11C_aI', name: 'Floor, eq. 208-10', unit: '—', role: 'intermediate' },
    Cszone4: { tex: '0.8ZN_vI/R', name: 'Zone 4 floor, eq. 208-11', unit: '—', role: 'intermediate' },
    Cs: { tex: 'C_s', name: 'Design base-shear coefficient V/W', unit: '—', role: 'capacity' },
    V: { tex: 'V', name: 'Design base shear', unit: 'kN', role: 'capacity' },
    Ft: { tex: 'F_t', name: 'Force at the roof, for the higher modes', unit: 'kN', role: 'capacity' },
  },
  equations: [
    { id: 'ta', label: 'Period, Method A', tex: 'T = C_t\\,h_n^{3/4},\\quad C_t = 0.0731\\ \\text{(RC frames, m)}', vars: ['T'], when: 'no analytical period is used', ref: 't' },
    { id: 'basic', label: 'Basic base shear', tex: 'V = \\dfrac{C_vI}{RT}\\,W', vars: ['V', 'Cv', 'I', 'R', 'T', 'W', 'Csraw'], ref: 'v' },
    { id: 'cap', label: 'Need not exceed', tex: 'V \\le \\dfrac{2.5\\,C_aI}{R}\\,W', vars: ['Csmax', 'Ca', 'I', 'R'], ref: 'v' },
    { id: 'floor', label: 'Shall not be less than', tex: 'V \\ge 0.11\\,C_aI\\,W', vars: ['Csmin', 'Ca', 'I'], ref: 'v' },
    { id: 'z4', label: 'Zone 4, also not less than', tex: 'V \\ge \\dfrac{0.8\\,ZN_vI}{R}\\,W', vars: ['Cszone4', 'Z', 'Nv', 'I', 'R'], when: 'Zone 4', ref: 'v' },
    { id: 'ft', label: 'Roof force', tex: 'F_t = 0.07\\,TV \\le 0.25\\,V', vars: ['Ft', 'T', 'V'], when: 'T > 0.7 s (else Ft = 0)', ref: 'ft' },
  ],
  diagram: 'seismic-cs',
  calculators: [{ to: '/seismic-wizard', label: 'Open Seismic Wizard' }],
  related: ['load-combinations'],
  verification: 'engine-matched',
  keywords: ['seismic', 'earthquake', 'base shear', 'static lateral force', 'Ca', 'Cv', 'R', 'importance', 'zone 4', 'near source', 'Na', 'Nv', 'period', '208', 'Ft'],
  evaluate(i) {
    const r = seismicExample(i)
    if (!r) return outOfScope('Choose a structural system and enter a positive period and seismic weight.')
    const { p, c, V, Ft } = r
    return {
      values: { Z: p.Z, Na: p.Na, Nv: p.Nv, Ca: p.Ca, Cv: p.Cv, I: p.I, R: p.R, T: i.T, W: i.W, Csraw: c.Csraw, Csmax: c.Csmax, Csmin: c.Csmin, Cszone4: c.Cszone4, Cs: c.Cs, V, Ft },
      checks: [],
      lines: [
        { text: `Zone ${i.zone}, soil ${i.soil}${i.zone === '4' ? `, source ${i.source} at ${i.distance} km (Na = ${p.Na.toFixed(2)}, Nv = ${p.Nv.toFixed(2)})` : ''}: Z = ${p.Z}, Ca = ${n3(p.Ca)}, Cv = ${n3(p.Cv)}. ${i.occupancy[0].toUpperCase() + i.occupancy.slice(1)} occupancy: I = ${p.I}. ${r.sys.name}: R = ${p.R}.` },
        { tex: `\\dfrac{C_vI}{RT} = \\dfrac{${n3(p.Cv)}(${p.I})}{${p.R}(${i.T})} = ${n4(c.Csraw)},\\qquad \\dfrac{2.5C_aI}{R} = ${n4(c.Csmax)}` },
        { tex: `0.11C_aI = ${n4(c.Csmin)}${p.Z >= 0.4 ? `,\\qquad \\dfrac{0.8ZN_vI}{R} = ${n4(c.Cszone4)}` : ''}` },
        { text: `Cs = ${n4(c.Cs)}, set by ${GOVERNS[c.governs]}.` },
        { tex: `V = C_sW = ${n4(c.Cs)}(${n1(i.W)}) = ${n1(V)}\\ \\text{kN}` },
        { text: i.T > 0.7
          ? `T = ${i.T} s > 0.7 s, so Ft = 0.07TV = ${n1(0.07 * i.T * V)} kN${Ft < 0.07 * i.T * V ? `, capped at 0.25V = ${n1(Ft)} kN` : ''} acts at the roof; the rest, V − Ft = ${n1(V - Ft)} kN, is shared up the height in proportion to w·h.`
          : `T = ${i.T} s ≤ 0.7 s, so Ft = 0 and the whole of V is shared up the height in proportion to w·h.` },
      ],
    }
  },
  flow(i): Flowchart {
    const r = seismicExample(i)
    const c = r?.c
    return {
      title: 'Which limit sets Cs?',
      steps: [
        { kind: 'start', text: r ? `Ca ${n3(r.p.Ca)} · Cv ${n3(r.p.Cv)} · I ${r.p.I} · R ${r.p.R} · T ${i.T} s` : 'Site, occupancy, system and period', ref: 'site' },
        { kind: 'process', text: `Basic: Cv·I/(R·T) = ${c ? n4(c.Csraw) : '—'}`, ref: 'v' },
        { kind: 'decision', text: `Above the cap 2.5Ca·I/R = ${c ? n4(c.Csmax) : '—'} ?`, ref: 'v', next: 'No',
          branch: { when: 'Yes', taken: !!c && c.governs === 'max-cap', to: { kind: 'end', text: 'Short period: the cap governs', state: 'limit' } } },
        { kind: 'decision', text: `Below a floor?  (0.11Ca·I = ${c ? n4(c.Csmin) : '—'}${r && r.p.Z >= 0.4 ? `, Zone 4 ${c ? n4(c.Cszone4) : '—'}` : ''})`, ref: 'v', next: 'No',
          branch: { when: 'Yes', taken: !!c && (c.governs === 'min-floor' || c.governs === 'zone4-floor'), to: { kind: 'end', text: c?.governs === 'zone4-floor' ? 'Long period near a fault: the Zone 4 floor governs' : 'Long period: the minimum governs', state: 'limit' } } },
        { kind: 'end', text: `The basic value governs: Cs = ${c ? n4(c.Cs) : '—'}`, ref: 'v', state: 'pass' },
      ],
    }
  },
}

export const SEISMIC_PROVISIONS: SeismicProvision[] = [baseShear]
