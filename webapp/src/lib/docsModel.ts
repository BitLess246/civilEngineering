// ─────────────────────────────────────────────────────────────────────────
// Structure of the /docs reference. Content lives in `docsContent*.ts`; this
// file only defines the shape and the helpers the page renders with.
//
// Every routed tool must appear exactly once — `docsContent.test.ts` compares
// this catalogue against the router, so a new page cannot ship undocumented and
// a removed one cannot leave a dangling entry.
// ─────────────────────────────────────────────────────────────────────────

/** One thing the user can operate: a field, dropdown, checkbox, button or tab. */
export interface DocControl {
  /** Label exactly as it appears in the UI. */
  name: string
  /** Unit shown beside it, where the UI shows one. */
  unit?: string
  /** What it does, and what changes downstream when you touch it. */
  what: string
  /** Default the page starts with, when there is a meaningful one. */
  default?: string
  /** Control kind — drives the icon/short tag in the table. */
  kind?: 'field' | 'choice' | 'toggle' | 'button' | 'tab' | 'output'
}

export interface DocSection {
  /** Anchor fragment, unique within the tool. */
  id: string
  title: string
  /** Prose intro; supports plain text only (kept deliberately simple). */
  body?: string
  controls?: DocControl[]
  /** Free-standing points that are not a single control. */
  notes?: string[]
}

export interface DocTool {
  /** Anchor id, e.g. `model-space`. */
  id: string
  name: string
  /** Router path, used for the "Open tool" link. */
  route: string
  group: DocGroup
  /** One sentence: what the tool is for. */
  summary: string
  /** Governing code / method the page implements. */
  basis?: string
  sections: DocSection[]
}

export type DocGroup =
  | 'Getting around'
  | 'Analysis & modelling'
  | 'Concrete design'
  | 'Steel & timber'
  | 'Foundations & geotechnical'
  | 'Estimates'
  | 'Planning & scheduling'
  | 'Reference'

export const DOC_GROUPS: DocGroup[] = [
  'Getting around',
  'Analysis & modelling',
  'Concrete design',
  'Steel & timber',
  'Foundations & geotechnical',
  'Estimates',
  'Planning & scheduling',
  'Reference',
]

/** Total documented controls across every tool. */
export const countControls = (tools: DocTool[]): number =>
  tools.reduce((n, t) => n + t.sections.reduce((m, s) => m + (s.controls?.length ?? 0), 0), 0)

/** Case-insensitive match of a tool against a search query. */
export function matchesQuery(t: DocTool, q: string): boolean {
  if (!q.trim()) return true
  const hay = [
    t.name, t.summary, t.basis ?? '', t.route,
    ...t.sections.flatMap((s) => [
      s.title, s.body ?? '', ...(s.notes ?? []),
      ...(s.controls ?? []).flatMap((c) => [c.name, c.what, c.unit ?? '', c.default ?? '']),
    ]),
  ].join(' ').toLowerCase()
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))
}
