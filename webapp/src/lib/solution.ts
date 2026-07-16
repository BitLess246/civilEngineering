// Shared worked-solution types. A step is a titled list of lines; each line is
// either a KaTeX equation ({tex}) or an explanatory sentence ({text}, often
// citing a code clause). Rendered by <WorkedSolution>.
export type SolutionLine = { tex: string } | { text: string }
export interface SolutionStep {
  title: string; lines: SolutionLine[]; note?: string
  /** Code clause shown in the report's margin column (e.g. 'ACI 318-14 §22.2'). */
  clause?: string
  /** Check outcome for the PASS/FAIL chip; omit for informational steps. */
  pass?: boolean
}

export const sn0 = (v: number) => Math.round(v).toString()
export const sn1 = (v: number) => v.toFixed(1)
export const sn2 = (v: number) => v.toFixed(2)
export const sn3 = (v: number) => v.toFixed(3)
export const sn4 = (v: number) => v.toFixed(4)
