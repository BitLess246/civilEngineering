// The four panels on the landing page, and the files they need.
//
// Split from the component so `storyboard.test.ts` can assert every `src`
// below actually exists in `public/` WITHOUT importing JSX. A landing page
// showing four broken-image icons is worse than one showing nothing, and the
// only way to be sure is to check.
//
// ── THE CAPTIONS QUOTE REAL NUMBERS ─────────────────────────────────────────
// 21 failed columns, 149% and 159% utilisations, ratio 1.59, peak 0.76,
// 175.0 → 232.1 m³ of concrete, 392 → 413 pages. Every one of those is read
// off the screenshots themselves, which are output from this app. If the
// images are ever replaced, the captions have to be re-read off the new ones —
// a caption that describes the previous screenshot is the kind of small lie
// that costs more trust than it saves effort.

export interface Panel {
  /** Path under `public/`. */
  src: string
  /** Alt text. Describes what is IN the image, for someone who cannot see it. */
  alt: string
  label: string
  caption: string
}

export const PANELS: readonly Panel[] = [
  {
    src: '/demo/story-model.webp',
    alt: 'A three-storey reinforced concrete frame in the 3D model space, with '
      + 'gridlines A to D and 1 to 4, isolated footings, columns, beams and slabs.',
    label: 'The model',
    caption: '3×3 bays, three storeys, gridded and dimensioned. Generated from four numbers.',
  },
  {
    src: '/demo/story-rebar.webp',
    alt: 'Close view of the generated reinforcement: column cages with ties, beam '
      + 'top and bottom bars with stirrups, and footing mats, drawn inside the '
      + 'translucent concrete.',
    label: 'Every bar, placed',
    caption: 'Column cages, beam stirrups and footing mats — detailed from the design, not drawn by hand.',
  },
  {
    src: '/demo/story-failures.webp',
    alt: 'The RC column schedule showing 21 failed columns, with utilisations of '
      + '149%, 122% and 159% and the governing seismic load combination on each row.',
    label: 'It tells you what fails',
    caption: '21 columns over capacity — each with its utilisation and the seismic combination that governed it.',
  },
] as const

// ── The same report, before and after the failures were dealt with ──────────
//
// A PAIR, not two more panels in the grid above. The whole value is in the
// comparison, and a comparison only works when both halves are the same size
// and side by side — an orphaned fifth tile in a three-column grid would show
// the same two images and say nothing.
//
// WHAT CHANGED BETWEEN THEM IS STATED, NOT EXPLAINED. Reading the two pages:
// the summary goes from three FAIL rows to all PASS, the governing column
// ratio from 1.59 to 0.76, concrete from 175.0 to 232.1 m³, and the report
// from 392 to 413 pages. Whether the optimiser or an engineer resized those
// sections is not something these screenshots show, so the captions do not
// claim it. The honest version is the stronger one anyway: the numbers moved,
// and the report tracked them.
export const COMPARISON: readonly Panel[] = [
  {
    src: '/demo/story-report-failed.webp',
    alt: 'Page one of the calculation report with a red CHECK FAILED banner. The '
      + 'design summary table shows RC columns failing at a ratio of 1.59, strong '
      + 'column / weak beam failing, and slabs failing. 175.0 cubic metres of '
      + 'concrete, 392 pages.',
    label: 'Before — CHECK FAILED',
    caption: 'Three checks failing, governing column at 1.59, 175.0 m³ of concrete, 392 pages.',
  },
  {
    src: '/demo/story-report-ok.webp',
    alt: 'Page one of the same calculation report with a green DESIGN OK banner. '
      + 'Every row of the design summary passes, the governing column ratio is '
      + '0.76. 232.1 cubic metres of concrete, 413 pages.',
    label: 'After — DESIGN OK',
    caption: 'Every check passing, governing column at 0.76, 232.1 m³, 413 pages — the same report, re-run.',
  },
] as const
