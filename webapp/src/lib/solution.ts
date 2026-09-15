// Shared worked-solution types. A step is a titled list of lines; each line is
// a KaTeX equation ({tex}), an explanatory sentence ({text}, often citing a
// code clause), or one ITEM of an enumeration ({item}). Rendered by
// <WorkedSolution> on screen and by `pdfKit.solutionSteps` on paper.
//
// `item` exists because a list rendered as running prose is not a list. The
// rebar compliance gate emits ten code checks, and as {text} they printed as
// ten wrapped paragraphs each opening with the same word — a wall on the page
// where the reader needs to count what was checked. The distinction is
// structural, not cosmetic: the producer knows it is enumerating, so it says
// so, and each surface renders an enumeration the way its medium does.
export type SolutionLine = { tex: string } | { text: string } | { item: string }
export interface SolutionStep {
  title: string; lines: SolutionLine[]; note?: string
  /** Code clause shown in the report's margin column (e.g. 'ACI 318-14 §22.2'). */
  clause?: string
  /** Check outcome for the PASS/FAIL chip; omit for informational steps. */
  pass?: boolean
}

/**
 * The readable text of a line, whatever kind it is.
 *
 * Seven call sites had written `'tex' in ln ? ln.tex : ln.text` — a two-way
 * narrow that silently becomes wrong the moment the union grows a third
 * member, which is exactly what adding `item` did. One helper, so the next
 * kind is a one-line change here instead of a compiler sweep.
 */
export const lineText = (ln: SolutionLine): string =>
  'tex' in ln ? ln.tex : 'text' in ln ? ln.text : ln.item

export const sn0 = (v: number) => Math.round(v).toString()
export const sn1 = (v: number) => v.toFixed(1)
export const sn2 = (v: number) => v.toFixed(2)
export const sn3 = (v: number) => v.toFixed(3)
export const sn4 = (v: number) => v.toFixed(4)
