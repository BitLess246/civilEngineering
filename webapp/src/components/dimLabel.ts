// Where a `DimSide` label goes — kept out of `dims.tsx` so that file exports
// components only, and testable on its own. Sheet units; 9.5 px Arial.

/** Whether a side dimension's label is set level: a span shorter than its own
 *  label (a flange, a cover) would have rotated text run out past both ticks. */
export const sideLabelLevel = (yA: number, yB: number, label: string) => Math.abs(yB - yA) < label.length * 4.8 + 4

/** How far a `DimSide` label reaches past its dimension line, outward — what a
 *  drawing's viewBox must leave beyond `dX` for the label not to be clipped. */
export const sideLabelReach = (yA: number, yB: number, label: string) =>
  sideLabelLevel(yA, yB, label) ? 8 + label.length * 5.2 : 17
