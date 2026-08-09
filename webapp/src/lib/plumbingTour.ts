// ─────────────────────────────────────────────────────────────────────────
// The walkthrough for the plumbing designer. View-support layer.
//
// Three tabs, and unlike Steel Design's three they are NOT independent: one
// fixture schedule at the top feeds all of them. Water supply sizes from the
// WSFU total, drainage from the DFU total, and the septic tank from the same
// occupancy and counts.
//
// So the order is shallow but real, and it is the reverse of what the layout
// suggests: the tabs are the prominent thing on the page, and the input every
// one of them depends on sits ABOVE the tab bar where it reads like a header.
// A user who lands on Drainage and starts typing pipe slopes is designing for
// whatever fixture counts happened to be left in the form.
//
// Four steps, because that is all it takes. A tour padded out to feel
// substantial is a tour people stop opening.
// ─────────────────────────────────────────────────────────────────────────

import type { Tour, TourStep } from './tour'

export const PLUMBING_STEPS: readonly TourStep[] = [
  {
    id: 'fixtures',
    anchor: 'fixture-schedule',
    title: 'Start with the fixtures — every tab reads them',
    body: 'Set the occupancy and count the fixtures once, here. Supply, drainage and the septic tank all size from this one schedule; nothing on the tabs below overrides it.',
    why: 'Occupancy matters as much as the counts: the same water closet is a different WSFU and DFU in a private dwelling than in a public building.',
  },
  {
    id: 'supply',
    tab: 'supply',
    anchor: 'supply-panel',
    title: 'Water supply',
    body: 'The fixture units convert to a design flow by Hunter’s curve, then the run length, fittings and static lift set the pressure available. The pipe size is the smallest that still delivers the residual pressure at the far fixture.',
  },
  {
    id: 'drainage',
    tab: 'drainage',
    anchor: 'drainage-panel',
    title: 'Sanitary drainage',
    body: 'Drainage fixture units and the slope you can achieve set the pipe size. Sizing here is by table rather than by flow — a drain runs part-full by design, and the table already accounts for it.',
  },
  {
    id: 'septic',
    tab: 'septic',
    anchor: 'septic-panel',
    title: 'Septic tank',
    body: 'Tank volume comes from the same fixture schedule as a daily sewage flow and a retention time. Check the result against your local health-office minimum, which often governs over the computed volume.',
  },
]

export const PLUMBING_TOUR: Tour = {
  id: 'plumbing',
  page: 'pages/PlumbingDesign.tsx',
  steps: PLUMBING_STEPS,
}
