// ─────────────────────────────────────────────────────────────────────────
// SIDEBAR GROUP ICONS — drawn from the drawing board, not from an app-icon set.
//
// These exist because the sidebar collapses to a 60 px rail, where the icon is
// the ONLY thing identifying a group. That makes them navigation, not
// decoration, and it rules out the two cheap answers: an emoji (which is a
// different typeface on every platform and carries no stroke weight of its
// own) and a generic library glyph (a gear for "geotechnical" tells a civil
// engineer nothing).
//
// Each is the thing itself, in the vocabulary of a structural drawing: a
// section with its bars, a W-shape end view, a footing on hatched ground, a
// bore log, an accelerogram trace. One 24×24 grid, one stroke weight, round
// caps and joins throughout, so eleven marks read as one set — which is what
// makes an icon RAIL legible rather than a row of unrelated pictures.
//
// Geometry only: paths are `d` strings, `stroke="currentColor"`, `fill="none"`,
// so the rail's own colour tokens carry them and both themes inherit for free.
// ─────────────────────────────────────────────────────────────────────────

/** One drawn mark: `d` paths, plus dots for the elements no stroke describes. */
export interface GroupIcon {
  /** Stroked paths on the 24×24 grid. */
  paths: string[]
  /** Filled circles — reinforcing bars, mostly, which are points not outlines. */
  dots?: { cx: number; cy: number; r: number }[]
  /** What the mark depicts, for the title/tooltip and for anyone reading this
   *  file later wondering why "Estimates" is a folding rule. */
  depicts: string
}

export const ICON_VIEWBOX = '0 0 24 24'
/** One weight for the whole set. A rail of mixed stroke widths reads as
 *  icons borrowed from three places, which is exactly what it would be. */
export const ICON_STROKE = 1.6

export const GROUP_ICONS: Record<string, GroupIcon> = {
  Concrete: {
    // A beam section with its bars: the first thing drawn on any RC sheet.
    //
    // TALLER THAN IT IS WIDE, which is the difference between an RC section
    // and a die showing four. A square box with four dots in it is exactly
    // what the previous attempt drew, and the render showed it — the geometry
    // was legible and the SUBJECT was wrong. A beam section is 300×500; making
    // the mark 14×20 says so before anything else does.
    //
    // No tie, and that is a size decision. The section, a tie inside it AND
    // four bars inside that is three nested things in a 22 px square; rendered
    // at 22, 15 and 88 side by side, the tie and the bars merged into one
    // thick edge at both shipping sizes and only the 88 px study showed the
    // cage. The bars are the identity, so they get the room.
    depicts: 'reinforced beam section with four bars',
    paths: ['M5 2H19V22H5Z'],
    dots: [
      { cx: 9.5, cy: 6.5, r: 1.8 }, { cx: 14.5, cy: 6.5, r: 1.8 },
      { cx: 9.5, cy: 17.5, r: 1.8 }, { cx: 14.5, cy: 17.5, r: 1.8 },
    ],
  },
  Analysis: {
    // A CANTILEVER and its deflected shape, off a hatched support face.
    //
    // Three attempts, and the third is a different structure for a reason
    // worth recording. A simply supported span was the obvious choice and it
    // cannot be drawn at 15 px: its deflected curve MEETS the straight beam at
    // both ends, so the two strokes enclose an area, and the mark reads as a
    // container. Deepen the sag to separate them and it is a bucket; shallow
    // it to look like a real deflection and the two strokes merge, which is
    // what the first version did (1.4 units apart — the worst mark in the app,
    // a bowtie at 22 px). Adding end ticks to break the bucket added handles
    // to it instead.
    //
    // A cantilever has no second bearing, so the shape never closes: a
    // straight beam and a curve leaving it, which is unambiguous at every
    // size. It is also the statics self-check this repo's own solver tests
    // are anchored on, δ = PL³/3EI.
    depicts: 'cantilever and its deflected shape off a hatched support',
    paths: [
      'M4 2V22',
      'M1.5 4.5L4 2', 'M1.5 9.5L4 7', 'M1.5 14.5L4 12', 'M1.5 19.5L4 17',
      'M4 7H21',
      'M4 7C12 7 16 11 21 18',
    ],
  },
  Steel: {
    // A W-shape end view. Flanges and web, nothing else — an I is the whole
    // identity of the discipline.
    //
    // Three strokes, not five. The flange RETURNS were 1.6 units off the
    // flange face, so at 22 px each flange drew as one thick bar and the
    // detail they were there to show was the first thing lost. A flange is a
    // line at this size.
    depicts: 'wide-flange section, end view',
    paths: ['M3 4H21', 'M3 20H21', 'M12 4V20'],
  },
  Foundations: {
    // Column stub on a spread footing, ground hatched below — the section a
    // footing schedule is drawn from. The ground line was 2.5 units under the
    // pad and merged with it; it is 3.5 now, and the hatch is at 5.
    depicts: 'column on a spread footing over hatched ground',
    paths: [
      'M10 3V12', 'M14 3V12',
      'M4 12H20V16H4Z',
      'M2.5 19.5H21.5',
      'M4 22.5L6.5 19.5', 'M9 22.5L11.5 19.5', 'M14 22.5L16.5 19.5', 'M19 22.5L21.5 19.5',
    ],
  },
  Geotechnical: {
    // A bore log: strata of different thickness down a hole, which is how the
    // ground is actually known.
    //
    // A CLOSED COLUMN, not a grid. The hole's two walls used to run past the
    // strata boundaries top and bottom, so four horizontals crossing two
    // verticals drew a window — legible, and the wrong picture. Closing the
    // column makes the boundaries read as strata IN something. The uneven
    // spacing (5, 5, 8) is the whole point of a log and is why the bands are
    // not thirds.
    //
    // The version before this also carried strata ticks either side of the
    // hole, 2.7–2.8 units off the boundaries they annotated: eight crowded
    // pairs, the most of any mark, and it filled the log in solid.
    depicts: 'borehole log through three strata',
    paths: ['M5 3H19V21H5Z', 'M5 8H19', 'M5 13H19'],
  },
  'Seismic & Loads': {
    // An accelerogram over its baseline — the record a time-history runs on.
    depicts: 'ground-motion trace on a baseline',
    paths: [
      'M2.5 12H21.5',
      'M3 12L5.6 6.6L8 17L10.6 4L13.2 19L15.7 10.6L18.1 15.2L20.5 12',
    ],
  },
  Timber: {
    // Log end: rings and the radial check that opens as it dries. Grain, not
    // a generic tree.
    depicts: 'log end — growth rings and a drying check',
    paths: [
      'M12 3.2A8.8 8.8 0 1 0 12 20.8A8.8 8.8 0 1 0 12 3.2Z',
      'M12 6.4A5.6 5.6 0 1 0 12 17.6A5.6 5.6 0 1 0 12 6.4Z',
      'M12 9.6A2.4 2.4 0 1 0 12 14.4A2.4 2.4 0 1 0 12 9.6Z',
      'M12 3.2V9.6',
    ],
  },
  'Plumbing & Sanitary': {
    // A flanged elbow — the fitting a run is sized around.
    depicts: 'flanged pipe elbow',
    paths: [
      'M5 8.5H12.5A6 6 0 0 1 18.5 14.5V21',
      'M5 15.5H12.5A1 1 0 0 0 13.5 14.5V8.5',
      'M4 6.8V17.2',
      'M15.6 21.5H21.4',
    ],
  },
  Planning: {
    // Gantt bars against a time axis — a programme, not a calendar.
    depicts: 'Gantt bars against a time axis',
    paths: ['M3 4.5V20.5H21', 'M6 7.5H15', 'M9 12H20', 'M6.5 16.5H14'],
  },
  Estimates: {
    // A folding rule, opened. Take-off is measuring before it is arithmetic,
    // and a calculator would say the wrong half of that.
    depicts: 'folding rule, opened',
    paths: [
      'M2.6 14.2L9.8 7L14.4 11.6L7.2 18.8Z',
      'M14.4 11.6L21.4 4.6L16.8 3L12 7.8',
      'M11 8.6L12.4 10', 'M8.9 10.7L10.3 12.1', 'M6.8 12.8L8.2 14.2',
    ],
  },
  Reference: {
    // An open codebook — NSCP / ACI / AISC are the thing behind every number
    // this toolkit prints.
    depicts: 'open code book',
    paths: [
      'M12 6.4V19.4',
      'M12 6.4C10.2 5 7.6 4.4 3.5 4.6V17.4C7.6 17.2 10.2 17.8 12 19.2',
      'M12 6.4C13.8 5 16.4 4.4 20.5 4.6V17.4C16.4 17.2 13.8 17.8 12 19.2',
    ],
  },
}

/** Does every group in the catalog have a mark? The rail is unusable without
 *  one, so this is asked in a test rather than discovered at 60 px. */
export const iconFor = (label: string): GroupIcon | undefined => GROUP_ICONS[label]
