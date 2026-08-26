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
  {
    src: '/demo/story-report.webp',
    alt: 'Page one of the exported PDF calculation report: letterhead, a DESIGN OK '
      + 'banner, the 3D model figure, and a design summary table with every check '
      + 'passing at a peak utilisation of 0.76.',
    label: 'The deliverable',
    caption: 'Every check passing at 0.76, with the model, the summary and 400-plus pages of workings behind it.',
  },
] as const
