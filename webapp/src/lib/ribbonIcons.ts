// ─────────────────────────────────────────────────────────────────────────
// RIBBON ICONS — one drawn mark per Model Space tab.
//
// The ribbon became icon-over-label, which is the point at which a tab's
// picture starts carrying meaning rather than decorating a word. Twelve words
// in a row is a list you read; twelve marks over twelve words is a shape you
// recognise, and after a day of use it is the mark you aim at.
//
// SEPARATE FROM `toolGroupIcons` ON PURPOSE. That set answers "which of the
// eleven tool groups is this", and its own guard asserts it draws nothing the
// sidebar does not have — adding ribbon marks to it would break that test for
// a good reason. Two sets, two coverage guards, one house style: the same
// 24×24 grid, the same `ICON_STROKE`, the same renderer (`DrawnIcon`), so they
// read as one family without either pretending to be the other.
//
// Drawn from the drawing board, like the sidebar's: a portal frame, a UDL, a
// moment diagram, a capacity curve, a title block. Nothing here is a gear or a
// generic document. Geometry only — `d` strings on `currentColor`, so both
// themes inherit for free.
// ─────────────────────────────────────────────────────────────────────────
import type { GroupIcon } from './toolGroupIcons'
import type { Tab } from '../components/modelSpace/tabs'

/**
 * A mark for each tab, keyed by the tab id so the coverage guard can compare
 * against `TAB_GROUPS` + `UTILITY_TABS` and not against a hand-kept list.
 */
export const RIBBON_ICONS: Record<Tab, GroupIcon> = {
  // ── Model ────────────────────────────────────────────────────────────────
  geometry: {
    // A two-storey portal frame on its footings. Nodes and members are
    // literally what this tab edits. The joint dots it started with sat ON the
    // strokes and disappeared into them at 20 px; the frame reads on its own.
    depicts: 'two-storey portal frame on its base line',
    paths: ['M4 21V4', 'M20 21V4', 'M4 4H20', 'M4 12.5H20', 'M2 21H22'],
  },
  properties: {
    // A section with its two dimensions. A section IS b × h before it is
    // anything else, and the dimension lines are what distinguish this from
    // the sidebar's Concrete mark, which is the same rectangle with bars. The
    // lines stand 4 and 6 units off the section: at 1.5 they merged with it.
    depicts: 'rectangular section dimensioned both ways',
    paths: [
      'M4 4H15V17H4Z',
      'M4 21H15', 'M4 19.5V22.5', 'M15 19.5V22.5',
      'M21 4V17', 'M19.5 4H22.5', 'M19.5 17H22.5',
    ],
  },
  supports: {
    // One support, drawn large: the triangle on hatched ground. It began as a
    // pin AND a roller AND the hatch, which at 20 px was two tents on a
    // scribble — three ideas none of which read. The vocabulary is the same;
    // there is just one of it.
    depicts: 'triangular support on hatched ground',
    paths: [
      'M2 5H22',
      'M12 5L5 16H19Z',
      'M3 16H21',
      'M5 20L8 16', 'M10 20L13 16', 'M15 20L18 16',
    ],
  },
  loading: {
    // A UDL on a beam — arrows off a load line, which is how a distributed
    // load is drawn on every sheet. Three arrows at 7 units, not four at 4.5:
    // the tighter set merged into a comb and the heads were lost entirely.
    depicts: 'uniformly distributed load on a beam',
    paths: [
      'M3 3H21',
      'M5 3V16M2.6 13.6L5 16L7.4 13.6',
      'M12 3V16M9.6 13.6L12 16L14.4 13.6',
      'M19 3V16M16.6 13.6L19 16L21.4 13.6',
      'M2 19H22',
    ],
  },

  // ── Analyse ──────────────────────────────────────────────────────────────
  analysis: {
    // A bending-moment diagram off its span, with the peak ordinate called
    // out. The sidebar's Analysis mark is the DEFLECTED shape; this is the
    // diagram the solve produces, which is what the tab hands back.
    //
    // NO HATCH. Five lines at 2.4 units filled in solid, three at 4.8 still
    // read as a trophy — the hatch is short-pitch by nature and a 20 px box
    // cannot hold it. One ordinate at midspan says the same thing (a diagram
    // with a maximum) and survives the size.
    depicts: 'bending-moment diagram with its peak ordinate',
    paths: ['M2 5H22', 'M3 5C8 21 16 21 21 5', 'M12 5V17'],
  },
  modal: {
    // Mode 1 over mode 2: one half-wave against two, each on its own baseline.
    // Drawn over each OTHER they crossed four times and read as a knot, which
    // is the opposite of the thing being shown — that the modes differ.
    depicts: 'first and second mode shapes on their baselines',
    paths: [
      'M2 9H22', 'M3 9C8 1 16 1 21 9',
      'M2 18H22', 'M3 18C6 13 9 13 12 18C15 23 18 23 21 18',
    ],
  },
  pushover: {
    // The capacity curve with the yield knee marked — base shear against roof
    // displacement, the one plot this tab exists to produce.
    depicts: 'capacity curve with its yield knee on axes',
    paths: ['M4 3V20H21', 'M4 20L10 9C13.5 5.5 17 5 21 6'],
    dots: [{ cx: 10, cy: 9, r: 1.7 }],
  },
  nonlinear: {
    // A hysteresis loop on force–displacement axes: energy dissipated in a
    // cycle, and what separates this tab from a linear solve. Drawn across
    // the box — at 11 units of 24 it was a scribble on a cross.
    depicts: 'hysteresis loop on force-displacement axes',
    paths: [
      'M12 2V22', 'M3 12H21',
      // Slanted hard bottom-left to top-right: symmetric control points drew
      // a circle on a cross, which reads as a target, not a loop.
      'M4 19C4 11 7 3 20 5C20 13 17 21 4 19Z',
    ],
  },

  // ── Results ──────────────────────────────────────────────────────────────
  design: {
    // A beam elevation with its top and bottom bars and its stirrups — the
    // detail a design run produces, not a checklist.
    //
    // TWO stirrups, at 8 units. Three at 5 cleared the crowding rule and still
    // crossed both bars into a grid that read as a ruler: the rule catches
    // strokes that MERGE, and four intersections in a 20 px box is a different
    // failure it cannot see. Two leaves the cage legible as a cage.
    depicts: 'beam elevation with stirrups and main bars',
    paths: [
      'M2 5H22V19H2Z',
      'M4 9H20', 'M4 15H20',
      'M8 9V15', 'M16 9V15',
    ],
  },
  plans: {
    // A sheet with its border and title block. A plan set is identified by its
    // title block before anything drawn on it — so that is all there is here;
    // the small drawing inside it collided with the block at this size.
    depicts: 'drawing sheet with border and title block',
    paths: ['M2 3H22V21H2Z', 'M5 6H19V18H5Z', 'M12 18V13H19'],
  },

  // ── Utilities ────────────────────────────────────────────────────────────
  display: {
    // The view cube. This tab changes how the 3D model is drawn, so its mark
    // is the drawn model.
    depicts: 'isometric view cube',
    paths: ['M12 2L21.5 7.5V16.5L12 22L2.5 16.5V7.5Z', 'M2.5 7.5L12 13L21.5 7.5', 'M12 13V22'],
  },
  projects: {
    // Two sheets, the front one with its corner folded. Opening a different
    // model is picking a different set off the stack.
    depicts: 'stack of two sheets, front corner folded',
    paths: ['M4 8H13L17.5 12.5V21H4Z', 'M13 8V12.5H17.5', 'M7.5 4.5H16L20.5 9V18'],
  },
}

/** Undefined rather than a throw for an unknown tab — the ribbon renders a
 *  spacer, so a missing mark costs alignment and not the page. The coverage
 *  guard is what makes that case unreachable. */
export const ribbonIcon = (tab: string): GroupIcon | undefined =>
  RIBBON_ICONS[tab as Tab]

/**
 * The ribbon's ACTION marks — the File block, which is not tabs.
 *
 * Undo, redo, the PDF and the walkthrough were `↶ ↷ ⎙` and a word: typed
 * glyphs, in the same ribbon that has just been made to draw everything else.
 * A text glyph is a different typeface on every platform, carries no stroke
 * weight of its own, and cannot line up with a set drawn on a 24×24 grid —
 * which is the rule `toolGroupIcons` states and its test enforces, applied
 * here to the four controls that were exempt only because they were not tabs.
 *
 * Keyed separately from `RIBBON_ICONS` because the coverage guard there is
 * derived from `TAB_GROUPS`: an action in that map would read as a tab with
 * no panel behind it.
 */
export const ACTION_ICONS: Record<string, GroupIcon> = {
  undo: {
    // The arrow that turns back on itself. Not a clock: this steps the edit
    // history, it does not restore a point in time.
    depicts: 'arrow curving back on itself, anticlockwise',
    // A cubic, not an arc. `A rx ry rot laf sf x y` names only its ENDPOINT,
    // so the bulge is invisible to the legibility check and the mark measured
    // 10 units wide against its real 15. A `C` states its control points, and
    // they bound the curve.
    paths: ['M3 8H14C20 8 20 19 14 19H7', 'M7.5 3.5L3 8L7.5 12.5'],
  },
  redo: {
    depicts: 'arrow curving back on itself, clockwise',
    paths: ['M21 8H10C4 8 4 19 10 19H17', 'M16.5 3.5L21 8L16.5 12.5'],
  },
  pdf: {
    // A sheet with its corner folded and an arrow off it: the calculation
    // report coming OUT of the app, which is what the button does. A printer
    // would say the wrong thing — nothing here is sent to one.
    depicts: 'report sheet with a folded corner and a download arrow',
    paths: ['M4 2H14L20 8V22H4Z', 'M14 2V8H20', 'M12 11V18M9 15L12 18L15 15'],
  },
  guide: {
    // A signpost. The walkthrough is directions through a page whose whole
    // difficulty is knowing which way round it goes.
    depicts: 'two-armed signpost',
    paths: ['M12 3V21', 'M12 5H19L21 7.5L19 10H12Z', 'M12 12H5L3 14.5L5 17H12Z'],
  },
}

/** As `ribbonIcon`, for the File block. */
export const actionIcon = (id: string): GroupIcon | undefined => ACTION_ICONS[id]
