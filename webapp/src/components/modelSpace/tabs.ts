// ─────────────────────────────────────────────────────────────────────────
// THE TABS — what the ribbon shows, in the order it shows them.
//
// The page's one statement of that order. A guard test reads the source order
// of the `tab === '…'` blocks in `pages/ModelSpace.tsx` and requires the two to
// agree, so this is the half of that pair which is data rather than markup.
// ─────────────────────────────────────────────────────────────────────────

/** Multi-select of lateral directions to envelope (+X/−X/+Z/−Z). */
export const LAT_DIRS = ['+X', '-X', '+Z', '-Z']

// ── Right-panel tabs ────────────────────────────────────────────────────────
export type Tab = 'geometry' | 'properties' | 'supports' | 'loading' | 'analysis' | 'modal' | 'pushover' | 'nonlinear' | 'design' | 'plans' | 'projects' | 'display'
/**
 * The ribbon, in groups.
 *
 * Twelve tabs in one undifferentiated row is a list to be read rather than a
 * shape to be recognised, and it hides the one thing about this page that is
 * worth knowing before anything else: the tabs are a SEQUENCE. Three groups say
 * what the sequence is — build a model, solve it, design from the results —
 * each of which needs the one before it.
 *
 * Display and Projects are in neither: one changes how the model is drawn and
 * the other opens a different model altogether, and both apply at whatever
 * stage you are at. They sit past a divider on the right rather than
 * interrupting the order, which is also why the guide can say "left to right"
 * and be telling the truth.
 *
 * A group is a flex container of its own, so a narrow ribbon wraps between
 * GROUPS rather than splitting one across two lines.
 *
 * DRAWN AS AN OFFICE RIBBON, which is where the group labels earn their keep.
 * Each group is a block of icon-over-label commands with its own name UNDER
 * them and a hairline rule between blocks — the shape every engineer already
 * reads in AutoCAD, Revit and ETABS. The label used to sit to the LEFT of its
 * tabs, which made it one more thing in the row rather than the row's heading,
 * and left the three groups distinguished by gap alone.
 */
export const TAB_GROUPS: { label: string; tabs: { id: Tab; label: string }[] }[] = [
  {
    label: 'Model',
    tabs: [
      { id: 'geometry', label: 'Geometry' },
      { id: 'properties', label: 'Properties' },
      { id: 'supports', label: 'Supports' },
      { id: 'loading', label: 'Loading' },
    ],
  },
  {
    label: 'Analyse',
    tabs: [
      { id: 'analysis', label: 'Analysis' },
      { id: 'modal', label: 'Modal' },
      { id: 'pushover', label: 'Pushover' },
      { id: 'nonlinear', label: 'Nonlinear' },
    ],
  },
  {
    // "Results" rather than "Design", which would have put the word twice in a
    // row over the tab of the same name — the label and the tab under it read
    // as a stutter, which is visible the moment the ribbon is rendered. Both
    // tabs here are where what came out is read: the schedules, and the sheets.
    label: 'Results',
    tabs: [
      { id: 'design', label: 'Design' },
      { id: 'plans', label: 'Plans' },
    ],
  },
]
/** Neither a step nor in sequence — see `TAB_GROUPS`. */
export const UTILITY_TABS: { id: Tab; label: string }[] = [
  { id: 'display', label: 'Display' },
  { id: 'projects', label: 'Projects' },
]
