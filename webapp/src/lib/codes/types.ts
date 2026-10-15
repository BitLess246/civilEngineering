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

export interface CalculatorLink { to: string; label: string }

export interface Provision {
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
  diagram: 'rc-beam-flexure' | 'rc-beam-shear'
  calculators: CalculatorLink[]
  related: string[]
  verification: Verification
  /** Who checked it against an authorized copy, and when — absent until done. */
  reviewed?: { by: string; on: string }
  /** Search words beyond the title and summary. */
  keywords: string[]
  evaluate: (i: BeamExampleInput) => ExampleResult
}

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
