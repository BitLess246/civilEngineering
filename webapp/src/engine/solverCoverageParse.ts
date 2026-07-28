// ─────────────────────────────────────────────────────────────────────────
// Which engine modules count as SOLVERS, and how their test names are read.
//
// Shared by the generator (`scripts/genSolverCoverage.mjs`, which does the file
// I/O) and by `solverCoverage.test.ts` (which re-parses to prove the committed
// manifest is current). One implementation, so the page and the guard can never
// disagree about what a test file contains.
//
// "Solver engine" = a module that COMPUTES A STRUCTURAL RESPONSE — assembles
// and solves equilibrium, an eigenproblem, or a time/path integration — plus
// the bridge that builds their input. Design checks (L6/L7), load generation
// (L4), geotech (L8) and quantities (L9) are excluded on purpose: those are
// covered by the hand-calc benchmarks in `validation.ts`, on the same page.
// ─────────────────────────────────────────────────────────────────────────

export type SolverGroup = 'Bridge' | 'FEM solver' | 'Dynamics' | 'Nonlinear'

export interface SolverModuleSpec {
  /** Engine module — `engine/<module>.ts`, tested by `<module>.test.ts`. */
  module: string
  group: SolverGroup
  /** What the module solves. */
  title: string
  /** Set when the file exercises SEVERAL solvers together and so has no engine
   *  module of its own. */
  integration?: boolean
}

/** Declaration order is the order shown on the /validation page. */
export const SOLVER_MODULES: SolverModuleSpec[] = [
  // ── L2: model → solver input ──
  { module: 'modelBridge', group: 'Bridge', title: 'StructuralModel → solver input' },
  { module: 'rigidEndZones', group: 'Bridge', title: 'Rigid end zones / member offsets' },
  { module: 'diaphragm', group: 'Bridge', title: 'Rigid floor diaphragm constraints' },
  // ── L3: the FEM solvers themselves ──
  { module: 'fem', group: 'FEM solver', title: 'Linear-algebra core (LU factor / solve)' },
  { module: 'frame2d', group: 'FEM solver', title: 'Plane frame' },
  { module: 'frame3d', group: 'FEM solver', title: '12-DOF space frame' },
  { module: 'shell', group: 'FEM solver', title: 'CST + DKT flat shell' },
  { module: 'frame3dShell', group: 'FEM solver', title: 'Frame ↔ shell coupling', integration: true },
  { module: 'shellModel', group: 'FEM solver', title: 'Shell meshing from the model' },
  // ── L5: dynamics, spectra and stability ──
  { module: 'modal', group: 'Dynamics', title: 'Eigenvalue / mode extraction' },
  { module: 'responseSpectrum', group: 'Dynamics', title: 'SRSS / CQC response spectrum' },
  { module: 'accelSpectrum', group: 'Dynamics', title: 'Elastic response spectra' },
  { module: 'accelerogram', group: 'Dynamics', title: 'Ground-motion records' },
  { module: 'timeHistory', group: 'Dynamics', title: 'Newmark SDOF / modal integration' },
  { module: 'timeHistoryModel', group: 'Dynamics', title: 'Model-level modal time history' },
  { module: 'directTimeHistory', group: 'Dynamics', title: 'Direct MDOF Newmark, Rayleigh damping' },
  { module: 'buckling', group: 'Dynamics', title: 'Linearized buckling' },
  // ── nonlinear path following ──
  { module: 'hysteresis', group: 'Nonlinear', title: 'Bilinear kinematic hysteresis' },
  { module: 'smoothHinge', group: 'Nonlinear', title: 'Smooth (C^∞) hinge backbone' },
  { module: 'biaxialHinge', group: 'Nonlinear', title: 'Biaxial (P–My–Mz) hinge constitutive law' },
  { module: 'pushover', group: 'Nonlinear', title: 'Event-to-event pushover' },
  { module: 'pushoverModel', group: 'Nonlinear', title: 'Model-level pushover' },
  { module: 'nonlinearFrame', group: 'Nonlinear', title: 'Member-end plastic hinges (static)' },
  { module: 'nonlinearFrameDynamic', group: 'Nonlinear', title: 'Member-end plastic hinges (dynamic)' },
  { module: 'nonlinearFrameModel', group: 'Nonlinear', title: 'Equivalent plane-frame bridge' },
  { module: 'nonlinearModel', group: 'Nonlinear', title: 'Shear-building reduction' },
  { module: 'nonlinearTimeHistory', group: 'Nonlinear', title: 'Newmark + Newton-Raphson' },
  { module: 'arcLength', group: 'Nonlinear', title: 'Arc-length (Riks/Crisfield) continuation' },
  { module: 'axialOnly', group: 'Nonlinear', title: 'Tension/compression-only active set' },
]

export interface ParsedTest { suite: string; name: string }

const unescapeName = (s: string) => s.replace(/\\(['"\\])/g, '$1')

/**
 * Pull `describe` / `it` names out of a test source.
 *
 * The suite writes one call per line with a quoted literal, so a line-wise scan
 * is exact. It also fails LOUDLY — a file that stops matching parses to zero
 * tests, which `solverCoverage.test.ts` rejects — rather than silently
 * under-reporting coverage on the page.
 */
export function parseTests(src: string): ParsedTest[] {
  const out: ParsedTest[] = []
  let suite = ''
  for (const line of src.split('\n')) {
    const d = line.match(/^\s*describe\((['"])((?:\\.|(?!\1).)*)\1/)
    if (d) { suite = unescapeName(d[2]); continue }
    const i = line.match(/^\s*it\((['"])((?:\\.|(?!\1).)*)\1/)
    if (i) out.push({ suite, name: unescapeName(i[2]) })
  }
  return out
}
