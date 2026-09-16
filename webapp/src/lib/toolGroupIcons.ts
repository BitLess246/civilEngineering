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
    // A beam section with its cage: the first thing drawn on any RC sheet.
    depicts: 'reinforced beam section with four bars and a tie',
    paths: ['M5 4H19V20H5Z', 'M7.5 6.5H16.5V17.5H7.5Z'],
    dots: [
      { cx: 9, cy: 8, r: 1.15 }, { cx: 15, cy: 8, r: 1.15 },
      { cx: 9, cy: 16, r: 1.15 }, { cx: 15, cy: 16, r: 1.15 },
    ],
  },
  Analysis: {
    // Simply supported span with its deflected shape — the whole of first-year
    // structural analysis in one mark.
    depicts: 'simply supported beam, deflected, on triangular supports',
    paths: [
      'M3 8H21',
      'M3 8C7.5 15 16.5 15 21 8',
      'M6 8L3.6 12.2H8.4Z', 'M18 8L15.6 12.2H20.4Z',
      'M2.6 13.6H9.4', 'M14.6 13.6H21.4',
    ],
  },
  Steel: {
    // A W-shape end view. Flanges and web, nothing else — an I is the whole
    // identity of the discipline.
    depicts: 'wide-flange section, end view',
    paths: [
      'M4 4.5H20', 'M4 19.5H20', 'M12 4.5V19.5',
      'M6.5 4.5V6.1H17.5V4.5', 'M6.5 19.5V17.9H17.5V19.5',
    ],
  },
  Foundations: {
    // Column stub on a spread footing, ground hatched below — the section a
    // footing schedule is drawn from.
    depicts: 'column on a spread footing over hatched ground',
    paths: [
      'M10 3V12', 'M14 3V12',
      'M4 12H20V16H4Z',
      'M2.5 18.5H21.5',
      'M4.5 21.5L6.5 18.5', 'M9 21.5L11 18.5', 'M13.5 21.5L15.5 18.5', 'M18 21.5L20 18.5',
    ],
  },
  Geotechnical: {
    // A bore log: strata of different thickness down a hole, which is how the
    // ground is actually known.
    depicts: 'borehole log through three strata',
    paths: [
      'M3 5.5H21', 'M3 11H21', 'M3 16.5H21', 'M3 21H21',
      'M8.5 3V22', 'M15.5 3V22',
      'M3.5 8.2H7', 'M17 8.2H20.5', 'M3.5 13.8H7', 'M17 13.8H20.5',
    ],
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
