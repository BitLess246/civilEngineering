// ─────────────────────────────────────────────────────────────────────────
// The walkthrough for the 3D Model Space. View-support layer.
//
// Eleven tabs, and the dependency chain behind them is the steepest in the
// app. The tab bar shows them as equals; they are not:
//
//     geometry → properties → supports → LOADING → analysis → design → plans
//
// Two places a first-time user stalls, and both get their own step:
//
//   • "DESIGN STRUCTURE" NEEDS AN ANALYSIS FIRST. The design pipeline consumes
//     member forces; with none it has nothing to check. The button is
//     reachable from the moment a model exists, so the order has to be said.
//   • THE "SUPPORTS" TAB IS NOT WHERE SUPPORTS ARE. It holds allowable
//     bearing and founding depth for footing DESIGN; the base restraints are
//     the "Sup" column of the Nodes table over on Geometry. Both steps say so
//     explicitly, because the tab label points the wrong way and a model with
//     no restraints does not give a wrong answer — it does not solve at all.
//
// The three tabs the tour SKIPS — Modal, Pushover, Nonlinear — are advanced
// analyses, not steps on the path to a designed structure. Walking a beginner
// through a pushover before they have a static solve is how a walkthrough
// becomes something people close.
// ─────────────────────────────────────────────────────────────────────────

import type { Tour, TourStep } from './tour'

export const MODEL_STEPS: readonly TourStep[] = [
  {
    id: 'start',
    tab: 'geometry',
    anchor: 'tab-bar',
    title: 'The tabs are a sequence, not a menu',
    body: 'Geometry → Properties → Supports → Loading → Analysis → Design. Each tab needs the ones before it, so they are worked left to right.',
    why: 'Modal, Pushover and Nonlinear are extra analyses rather than steps — skip them until a static solve works. Esc leaves the guide at any point.',
  },
  {
    id: 'grid',
    tab: 'geometry',
    anchor: 'generate-grid',
    title: 'Start from a grid',
    body: 'Set the bay widths, the number of storeys and the storey height, then generate. That gives you a complete framed model — nodes, columns, beams and slabs — to edit, rather than a blank canvas.',
    why: 'The base restraints come with it, in the “Sup” column of the Nodes table below. A model with none does not give a wrong answer — it does not solve at all, because an unrestrained structure has a singular stiffness matrix.',
  },
  {
    id: 'sections',
    tab: 'properties',
    anchor: 'properties-panel',
    title: 'Give the members sections and materials',
    body: 'Assign concrete or steel sections to each member family. The section drives stiffness, so the analysis results move with it — this is not just a drawing property.',
  },
  {
    id: 'supports',
    tab: 'supports',
    anchor: 'supports-panel',
    title: 'Set what the ground can carry',
    body: 'Allowable bearing, founding depth and the soil unit weight. These size the footings in the design step, not the frame analysis — the net bearing is q_a less the overburden removed.',
    why: 'Base RESTRAINTS are a different thing and live in the Nodes table on the Geometry tab, under “Sup”.',
  },
  {
    id: 'loads',
    tab: 'loading',
    anchor: 'loading-panel',
    title: 'Apply the loads',
    body: 'Self-weight, superimposed dead and live load by occupancy, then wind and seismic if they govern. NSCP load combinations are applied over one factorisation, so you do not build them by hand.',
  },
  {
    id: 'analyse',
    tab: 'analysis',
    anchor: 'analysis-panel',
    title: 'Run the analysis',
    body: 'Choose the options that apply — P-Δ, cracked sections, shear deformation — and solve. Displacements, member forces and reactions come back for every combination.',
    why: 'Cracked sections (ACI §6.6.3.1.1) are on by default here and off at the API level, so closed-form benchmarks stay gross-section.',
  },
  {
    id: 'design',
    tab: 'design',
    anchor: 'design-button',
    title: 'Design the structure — after the analysis, not before',
    body: 'The pipeline takes the governing combination and sizes slabs, beams, columns and footings, each with a utilisation and a code clause. It consumes analysis results, so it has nothing to work from until the previous step has run.',
  },
  {
    id: 'plans',
    tab: 'plans',
    anchor: 'plans-panel',
    title: 'Take the drawings and the take-off',
    body: 'Framing and foundation plans, footing details and the bill of quantities are generated from the model and the design — not redrawn. Every sheet exports to SVG.',
  },
]

export const MODEL_TOUR: Tour = {
  id: 'model-space',
  page: 'pages/ModelSpace.tsx',
  steps: MODEL_STEPS,
}
