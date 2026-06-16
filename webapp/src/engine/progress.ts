// Progress reporting for the off-thread solvers. The analysis / design /
// optimise routines call an optional ProgressFn as they work; the worker
// forwards each tick to the main thread so the UI can show what is computing.
export interface SolveProgress {
  phase: string                 // e.g. 'Analyzing load cases', 'Optimizing'
  current?: number              // step index (1-based) when a count is known
  total?: number                // total steps when known → determinate bar
  detail?: string               // free text, e.g. the load-case or element name
}
export type ProgressFn = (p: SolveProgress) => void
