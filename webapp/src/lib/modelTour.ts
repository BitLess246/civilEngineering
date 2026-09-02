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
// Pushover and Nonlinear are SKIPPED: advanced analyses, not steps on the path
// to a designed structure, and walking a beginner through a pushover before
// they have a static solve is how a walkthrough becomes something people close.
//
// MODAL IS NOT SKIPPED, for one reason: its mode-shape animation is started by
// clicking a ROW in the results table, and nothing on screen suggests the rows
// are clickable. A control that cannot be found by looking is precisely what a
// walkthrough is for. The same goes for the results sub-tabs (Schedules /
// BOQ / Construction Schedule), which only appear once a design exists and by
// then are a long way down the page.
//
// The tour also needs something to POINT AT. On a first visit every panel here
// is empty, so `ModelSpace` gives the guide a demo grid on open and clears it
// on close — see the `useTour` hooks there.
// ─────────────────────────────────────────────────────────────────────────

import type { Tour, TourStep } from './tour'

export const MODEL_STEPS: readonly TourStep[] = [
  {
    id: 'start',
    tab: 'geometry',
    anchor: 'tab-bar',
    title: 'The tabs are a sequence, not a menu',
    body: 'Three labelled groups, worked left to right: MODEL builds the frame, ANALYSE solves it, RESULTS is where the design and the drawings are read. Each group needs the one before it.',
    why: 'Past the divider on the right, Display and Projects are in no group because they are not steps — one changes how the model is drawn, the other opens a different model, and both apply at whatever stage you are at. Within ANALYSE, only Analysis is a step: Modal, Pushover and Nonlinear are extra analyses, so skip them until a static solve works. Esc leaves the guide at any point.',
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
    id: 'modal',
    tab: 'modal',
    anchor: 'modal-panel',
    title: 'Modal — and the mode shape you have to click for',
    body: 'Run the modal analysis, then CLICK A MODE ROW in the results table. The 3D canvas animates that mode as a purple skeleton, and it keeps animating while you work on other tabs.',
    why: 'Nothing on screen says the rows are clickable, which is why it is worth saying here. Check the mass participation reaches 90% (NSCP §208.5.5) before trusting a response-spectrum run.',
  },
  {
    id: 'design',
    tab: 'design',
    anchor: 'design-button',
    title: 'Design the structure — after the analysis, not before',
    body: 'The pipeline takes the governing combination and sizes slabs, beams, columns and footings, each with a utilisation and a code clause. It consumes analysis results, so it has nothing to work from until the previous step has run.',
  },
  {
    id: 'results-tabs',
    tab: 'design',
    anchor: 'results-tabs',
    title: 'The results have three tabs of their own',
    body: 'Under the design: Schedules (bar-by-bar), Bill of Quantities (materials and cost) and Construction Schedule. They are easy to miss — the page is long by the time they appear.',
    why: 'The bill’s concrete mix class follows the design f′c, and says so; override it there if the specification differs.',
  },
  {
    id: 'plans',
    tab: 'plans',
    anchor: 'plans-panel',
    title: 'Take the drawings and the take-off',
    body: 'Framing and foundation plans, footing details and the bill of quantities are generated from the model and the design — not redrawn. Every sheet exports to SVG.',
  },
  {
    id: 'display',
    tab: 'display',
    anchor: 'display-panel',
    title: 'What the viewport draws is set on its own tab',
    body: 'Load arrows, force diagrams along each member, and — once the structure is designed — footings at their real size, steel connections and the bar cages themselves. Each toggle carries its own colour key.',
    why: 'The toggles stay on whatever you switch to afterwards: what the 3D view is drawing is not a property of which tab is open. Display is last in the ribbon because it is not a step — it applies at whatever stage you are at.',
  },
  {
    id: 'io',
    anchor: 'io-menu',
    title: 'Save the model before you close the tab',
    body: 'Import / Export writes the whole model to a JSON file and reads it back. The autosave only survives the browser session — it is not a saved project.',
  },
]

export const MODEL_TOUR: Tour = {
  id: 'model-space',
  page: 'pages/ModelSpace.tsx',
  steps: MODEL_STEPS,
}
