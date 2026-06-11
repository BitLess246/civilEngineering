// Shared worked-solution types — a step is a titled list of KaTeX lines with
// an optional plain-text note. Used by the per-tool solution generators and
// rendered by <WorkedSolution>.
export interface SolutionLine { tex: string }
export interface SolutionStep { title: string; lines: SolutionLine[]; note?: string }

export const sn0 = (v: number) => Math.round(v).toString()
export const sn1 = (v: number) => v.toFixed(1)
export const sn2 = (v: number) => v.toFixed(2)
export const sn3 = (v: number) => v.toFixed(3)
export const sn4 = (v: number) => v.toFixed(4)
