// The Code Library's data model — one typed record per code provision.
//
// WHAT A RECORD IS, AND WHAT IT IS NOT. It is Zeta's OWN explanation of a
// requirement, the equation as Zeta's engine evaluates it, and the clause it
// cites. It is not the code text: no paragraph, table or commentary is
// reproduced, because NSCP is a published standard. Every record says how far
// it has been checked (`verification`):
//
//   engine-matched  the equation shown is exactly what Zeta's engine computes,
//                   and a test holds the worked example to the engine's own
//                   output — so the visual and the calculator cannot disagree.
//                   It is NOT a statement that the clause has been read
//                   against an authorized copy of the code.
//   pending-review  explanatory content that no engine path backs yet.
//
// A human verification against the authorized edition is recorded separately
// (`reviewed`), and nothing claims it until someone has done it.
import type { SolutionLine } from '../solution'

export type CodeEdition = 'NSCP 2015'

/** Discipline shelves on the landing page, in display order. */
export type CodeCategory =
  | 'concrete' | 'steel' | 'loads' | 'seismic' | 'foundations' | 'analysis' | 'masonry' | 'timber'

export type Verification = 'engine-matched' | 'pending-review'

/** A clause reference. `aci` is the ACI 318-14 / AISC 360-16 parallel, where one exists. */
export interface CodeRef { edition: CodeEdition; clause: string; topic: string; parallel?: string }

export type VarRole = 'demand' | 'capacity' | 'factor' | 'geometry' | 'material' | 'intermediate'

export interface CodeVariable {
  /** TeX symbol, e.g. `\\phi M_n`. */
  tex: string
  name: string
  unit: string
  role: VarRole
  /** One line on where the value comes from or what it controls. */
  note?: string
}

export interface CodeEquation {
  id: string
  label: string
  tex: string
  /** Keys into the provision's `variables`, in reading order. */
  vars: string[]
  /** When the equation applies — a condition, never a paraphrase of code text. */
  when?: string
  ref: string
}

/** The inputs every RC-beam provision's live example reads, in Zeta's units (mm, MPa, kN, kN·m). */
export interface BeamExampleInput {
  b: number; h: number; cover: number; stirrupDia: number
  nBars: number; barDia: number
  fc: number; fy: number; fyt: number
  Mu: number; Vu: number
  legs: number; s: number
}

export type CheckState = 'pass' | 'limit' | 'fail'

export interface ExampleCheck { label: string; demand: number; capacity: number; unit: string; state: CheckState; ref: string }

/** A provision's live example: the value of every variable, the checks, and the worked lines. */
export interface ExampleResult {
  values: Record<string, number>
  checks: ExampleCheck[]
  lines: SolutionLine[]
}

/** One box of a decision flowchart. */
export interface FlowNode {
  kind: 'start' | 'decision' | 'process' | 'end'
  text: string
  /** Key into the provision's `refs`. */
  ref?: string
  /** Outcome colour for a terminal. */
  state?: CheckState
}

/**
 * A flowchart drawn as a spine: the steps run top to bottom, and a decision may
 * branch OFF the spine to a terminal on the right. `branch.taken` says whether
 * the live example leaves the spine there — so the page can light its path.
 */
export interface FlowStep extends FlowNode {
  branch?: { when: string; to: FlowNode; taken: boolean }
  /** Label on the edge that continues down the spine from a decision. */
  next?: string
}

export interface Flowchart { title: string; steps: FlowStep[] }

/** One stop of the stepped walkthrough: what to say, which diagram layers to show, what to light. */
export interface WalkStep { title: string; text: string; tex?: string; layers: BeamLayer[]; hl?: string }

export interface CalculatorLink { to: string; label: string }

/** Which kind of worked example — and so which inputs and diagrams — a provision uses. */
export type ProvisionFamily = 'rc-beam' | 'steel' | 'loads' | 'punching' | 'footing-shear'

/** A rolled steel member checked under AISC 360-16 (NSCP 2015 Chapter 5). Units: mm, MPa, m, kN, kN·m. */
export interface SteelExampleInput {
  /** AISC designation, e.g. 'W460x74' (W-shapes only). */
  shape: string
  Fy: number
  /** Unbraced length for lateral–torsional buckling, m. */
  Lb: number
  Cb: number
  Mu: number
  Vu: number
  /** Column length and effective-length factors about x and y. */
  L: number; Kx: number; Ky: number
  Pu: number
}

/**
 * A column bearing on a slab or a footing, checked for two-way shear. Units:
 * mm, MPa, kN, kPa. `qu` is the factored soil pressure under a footing — zero
 * for a slab, where nothing pushes back inside the critical section.
 */
export interface PunchingExampleInput {
  c1: number; c2: number; h: number; d: number
  fc: number; lambda: number
  position: 'interior' | 'edge' | 'corner'
  Pu: number; qu: number
}

/**
 * A spread footing checked for one-way (beam) shear in one direction. `L` is
 * its plan length in the direction the shear acts, `B` the width the section
 * crosses (a square pad: B = L), `c` the column's dimension along L. Units:
 * m for the plan, mm for the section, MPa, kPa.
 */
export interface FootingShearInput {
  B: number; L: number; c: number; h: number; d: number
  fc: number; lambda: number; qu: number
}

/** Service load effects to be combined, in any one consistent unit. */
export interface LoadExampleInput { D: number; L: number; Lr: number; W: number; E: number }

/** One "Try it" input the provision page renders. A field with `options` is a picker. */
export interface InputField<I> {
  key: keyof I & string
  label: string
  unit?: string
  min?: number; max?: number; step?: string
  options?: readonly string[]
}

export type DiagramKind =
  | 'rc-beam-flexure' | 'rc-beam-shear'
  | 'steel-ltb-curve' | 'steel-shear-web' | 'steel-column-curve'
  | 'load-combos'
  | 'punching-perimeter'
  | 'footing-one-way'

interface ProvisionBase {
  id: string
  title: string
  category: CodeCategory
  /** The structural component the provision is about (filter chip). */
  component: string
  /** Zeta's own one-paragraph statement of what the requirement does. */
  summary: string
  /** Why the check exists — the behaviour it guards against. */
  why: string
  /** Mistakes that show up in practice. */
  mistakes: string[]
  refs: Record<string, CodeRef>
  variables: Record<string, CodeVariable>
  equations: CodeEquation[]
  /** Which interactive diagram the page shows. */
  diagram: DiagramKind
  calculators: CalculatorLink[]
  related: string[]
  verification: Verification
  /** Who checked it against an authorized copy, and when — absent until done. */
  reviewed?: { by: string; on: string }
  /** Search words beyond the title and summary. */
  keywords: string[]
}

export interface ProvisionOf<F extends ProvisionFamily, I extends object> extends ProvisionBase {
  family: F
  /** The example the page opens with. */
  defaults: I
  /** The inputs the page offers, in order. */
  fields: InputField<I>[]
  evaluate: (i: I) => ExampleResult
  /** The decision procedure, evaluated for the live example. */
  flow?: (i: I) => Flowchart
  /** The diagram built up one idea at a time. */
  walk?: (i: I) => WalkStep[]
}

export type RcBeamProvision = ProvisionOf<'rc-beam', BeamExampleInput>
export type SteelProvision = ProvisionOf<'steel', SteelExampleInput>
export type LoadsProvision = ProvisionOf<'loads', LoadExampleInput>
export type PunchingProvision = ProvisionOf<'punching', PunchingExampleInput>
export type FootingShearProvision = ProvisionOf<'footing-shear', FootingShearInput>
export type Provision = RcBeamProvision | SteelProvision | LoadsProvision | PunchingProvision | FootingShearProvision

// The provision's own input type travels with it, but a caller holding the
// UNION cannot name it. These run a provision on an input the page built from
// that same provision's `defaults` and `fields` — the one place the family is
// erased, so nothing else needs a cast.
type Loose = ProvisionOf<ProvisionFamily, object>
export const runProvision = (p: Provision, i?: object): ExampleResult => (p as unknown as Loose).evaluate(i ?? p.defaults)
export const flowOf = (p: Provision, i: object): Flowchart | undefined => (p as unknown as Loose).flow?.(i)
export const walkOf = (p: Provision, i: object): WalkStep[] => (p as unknown as Loose).walk?.(i) ?? []

export const CATEGORY_LABEL: Record<CodeCategory, string> = {
  concrete: 'Reinforced concrete',
  steel: 'Structural steel',
  loads: 'Loads & combinations',
  seismic: 'Seismic design',
  foundations: 'Foundations',
  analysis: 'Structural analysis',
  masonry: 'Masonry',
  timber: 'Timber',
}

/** State of a demand/capacity pair: within 0.5 % of the limit counts as AT it. */
export function checkState(demand: number, capacity: number): CheckState {
  if (!(capacity > 0)) return demand > 0 ? 'fail' : 'pass'
  const r = demand / capacity
  return r > 1.005 ? 'fail' : r >= 0.995 ? 'limit' : 'pass'
}

/** Toggleable layers of the RC beam flexure diagram. */
export type BeamLayer = 'stirrup' | 'bars' | 'na' | 'block' | 'strain' | 'forces'
export const BEAM_LAYERS: { id: BeamLayer; label: string }[] = [
  { id: 'stirrup', label: 'Stirrup' },
  { id: 'bars', label: 'Tension bars' },
  { id: 'na', label: 'Neutral axis' },
  { id: 'block', label: 'Compression block' },
  { id: 'strain', label: 'Strain' },
  { id: 'forces', label: 'C–T couple' },
]

/**
 * Where the live example goes through a flowchart: the last step it reaches,
 * and whether it leaves the spine there by that step's branch. A chart with no
 * taken branch runs to its final step.
 */
export function flowPath(f: Flowchart): { last: number; branched: boolean } {
  const k = f.steps.findIndex((s) => s.branch?.taken)
  return k >= 0 ? { last: k, branched: true } : { last: f.steps.length - 1, branched: false }
}
