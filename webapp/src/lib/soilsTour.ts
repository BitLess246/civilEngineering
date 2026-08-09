// ─────────────────────────────────────────────────────────────────────────
// The guided walkthrough for /soils, as DATA. Layer: view-support.
//
// The soil-investigation page is the widest form in the app — nine tabs, and a
// dependency order that is obvious once you know it and invisible before:
//
//     borehole → layer → SAMPLE → laboratory test → classification → report
//
// The step that hides is the sample. Laboratory tests are booked against a
// SAMPLE, not a layer, so a user who logs strata and goes straight to the
// Laboratory tab finds it empty with nothing on that tab to fix it — the
// control they need is two tabs back, under Profile. That is the walkthrough's
// reason for existing, and why the sample step spends the most words.
//
// THE STEPS ARE DATA, NOT JSX — see `tour.ts` for the shared shape and for
// which pages earn a walkthrough at all.
// ─────────────────────────────────────────────────────────────────────────

import type { Tour, TourStep } from './tour'

export const SOILS_STEPS: readonly TourStep[] = [
  {
    id: 'start',
    // No tab: the header sits above the tab panels and is always on screen.
    anchor: 'header-actions',
    title: 'An investigation is built in one order',
    body: 'Borehole → strata → sample → laboratory test → classification → report. Each step needs the one before it, so the tabs are worked left to right rather than picked at random.',
    why: 'You can leave at any point with Esc; nothing here changes your data.',
  },
  {
    id: 'meta',
    tab: 'overview',
    anchor: 'meta-card',
    title: 'Name the investigation',
    body: 'Give it a reference and a project name. These print on every page of the report and on the cover.',
  },
  {
    id: 'borehole',
    tab: 'boreholes',
    anchor: 'add-borehole',
    title: 'Add a borehole',
    body: 'Add the hole, then set the depth it was drilled to and the depth to groundwater. Every layer, sample and blow count hangs off a hole.',
    why: 'The termination depth is used to check that nothing is logged below the bottom of the hole.',
  },
  {
    id: 'layers',
    tab: 'profile',
    anchor: 'add-layer',
    title: 'Log the strata',
    body: 'Add one layer per stratum, top and base depth first. Leave the USCS symbol blank — classifying a sample later fills it in for you.',
    why: 'A guessed symbol is worse than a blank one: the report distinguishes “not classified” from “classified as”.',
  },
  {
    id: 'sample',
    tab: 'profile',
    anchor: 'add-sample',
    title: 'Add a sample — this is the step that catches people',
    body: 'Laboratory tests are booked against a SAMPLE, not a layer, so nothing can be tested until one exists. Add it here, on the Profile tab, and set its depth and type.',
    why: 'A split-spoon is driven and its fabric is destroyed — index tests only. Consolidation and triaxial need a Shelby tube or another undisturbed sample.',
  },
  {
    id: 'sample-layer',
    tab: 'profile',
    anchor: 'samples-table',
    title: 'Attribute the sample to a layer',
    body: 'The Layer column defaults from the sample’s depth. Keep it set — it is what lets a classification be pushed back onto the stratum.',
  },
  {
    id: 'spt',
    tab: 'spt',
    anchor: 'spt-panel',
    title: 'Enter the blow counts',
    body: 'Record all three 150 mm increments per test. N₆₀ and (N₁)₆₀ are corrected from them for hammer energy, hole diameter, sampler and rod length.',
    why: 'Storing all three increments is what makes the seating drive discardable and the correction re-derivable.',
  },
  {
    id: 'lab',
    tab: 'lab',
    anchor: 'lab-panel',
    title: 'Book a laboratory test',
    body: 'Each sample gets an “+ add a test…” picker. Choose a test, then type the readings the apparatus gave — masses, dial gauges, times — and the result computes as you go.',
    why: 'Measurements are stored, results are computed. That is what lets a corrected method re-derive every past result.',
  },
  {
    id: 'classify',
    tab: 'lab',
    anchor: 'lab-panel',
    title: 'Classify, and apply the symbol',
    body: 'A sieve plus Atterberg limits gives a USCS symbol, an AASHTO group and — with a hydrometer — a USDA texture. Use the button on the classification card to apply the symbol to the layer.',
  },
  {
    id: 'parameters',
    tab: 'parameters',
    anchor: 'parameters-panel',
    title: 'Check the design parameters',
    body: 'Each parameter shows whether it was MEASURED in the laboratory, DERIVED, CORRELATED from field testing, or ASSUMED. A measurement always beats a correlation.',
  },
  {
    id: 'report',
    anchor: 'report-button',
    title: 'Generate the report',
    body: 'The PDF assembles all 22 sections. Sections with nothing behind them are still printed, saying what would be needed — so a reader can tell “no liquefaction risk” from “never assessed”.',
  },
]

export const SOILS_TOUR: Tour = {
  id: 'soil-investigation',
  page: 'pages/SoilInvestigation.tsx',
  steps: SOILS_STEPS,
}
