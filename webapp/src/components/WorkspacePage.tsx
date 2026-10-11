// ─────────────────────────────────────────────────────────────────────────
// One standalone calculator on the workspace layout (components/workspace.tsx),
// assembled from data: the page supplies its input groups, its check cards,
// the input echo, the drawing, the result rows, the worked steps and the
// references; this lays them out the same way on every page.
// ─────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react'
import 'katex/dist/katex.min.css'
import { WorkedSolution } from './WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import {
  Workspace, InputRail, DocPanel, DocSection, KeyValueGrid, ResultsTable, ReferenceList,
  ReportTitleBlock, type KeyValue, type ResultRow,
} from './workspace'
import { useWorkspaceReport } from '../lib/useWorkspaceReport'
import type { CalcReportData } from './ReportControls'

export interface WorkspacePageProps {
  title: string
  badges: string[]
  intro: ReactNode
  /** `InputGroup`s — the Project & report group is added above them. */
  inputs: ReactNode
  /** `CheckCard`s. */
  checks: ReactNode
  summary: KeyValue[]
  drawing?: { title: string; node: ReactNode }
  results: ResultRow[]
  resultsCaption?: ReactNode
  steps: SolutionStep[]
  references: { topic: string; basis: ReactNode; source: string }[]
  /** Page-level controls beside the title (a mode toggle). */
  actions?: ReactNode
  /** Further numbered sections on the drawing sheet, after the results —
   *  a schedule, a serviceability table, a bar ranking. */
  extraSections?: { title: string; node: ReactNode }[]
  /** The structured PDF payload; without it Export prints the page. */
  report?: CalcReportData
}

export function WorkspacePage(p: WorkspacePageProps) {
  const derivedOk = p.results.length > 0 && p.results.every((r) => r.status !== 'fail')
  const derivedGoverning = [...p.results]
    .sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1))[0]
  const structuredReport: CalcReportData = {
    docCode: p.report?.docCode ?? 'CALC-01',
    ok: p.report?.ok ?? derivedOk,
    governing: p.report?.governing ?? (derivedGoverning
      ? `${derivedGoverning.check}: ${derivedGoverning.demand}${derivedGoverning.limit ? ` / limit ${derivedGoverning.limit}` : ''}`
      : 'No evaluated result rows supplied; review the included inputs and calculation details.'),
    ...p.report,
    data: [...(p.report?.data ?? []), ...p.summary.map((item) => [item.label, item.value] as [string, string])],
    resultRows: p.results,
    steps: p.report?.steps ?? p.steps,
    assumptions: [...(p.report?.assumptions ?? []), ...(typeof p.intro === 'string' ? [p.intro] : [])],
    references: p.report?.references ?? p.references.map((ref) => ({
      topic: ref.topic,
      basis: typeof ref.basis === 'string' ? ref.basis : 'See calculator reference notes',
      source: ref.source,
    })),
    details: [
      ...(p.report?.details ?? []),
      ...(p.extraSections ?? []).filter((item) => typeof item.node === 'string').map((item) => ({ title: item.title, text: String(item.node) })),
    ],
  }
  const resultsNum = p.drawing ? 3 : 2
  const report = useWorkspaceReport(p.title, p.badges, structuredReport)
  return (
    <div data-pdf-calc-root>
    <Workspace title={p.title} badges={p.badges} intro={p.intro} actions={p.actions}
      inputs={<InputRail>{report.group}{p.inputs}</InputRail>}
      checks={p.checks}
      document={
        <div data-pdf-report-root>
        <DocPanel tabs={[
          {
            id: 'sheet', label: 'Drawing sheet', content: (
              <>
                {report.printHeader}
                <ReportTitleBlock title={p.title} lh={report.lh} today={report.today} />
                <DocSection num={1} title="Input summary"><KeyValueGrid items={p.summary} /></DocSection>
                {p.drawing && (
                  <DocSection num={2} title={p.drawing.title} card
                    aside={<span className="no-print rounded-full border border-ok-line bg-ok-tint px-2 py-0.5 text-[10px] font-bold text-ok">LIVE</span>}>
                    <div data-pdf-drawing>{p.drawing.node}</div>
                  </DocSection>
                )}
                <DocSection num={resultsNum} title="Results summary"><ResultsTable rows={p.results} caption={p.resultsCaption} /></DocSection>
                {p.extraSections?.map((x, i) => (
                  <DocSection key={x.title} num={resultsNum + 1 + i} title={x.title}><div data-pdf-detail={x.title}>{x.node}</div></DocSection>
                ))}
              </>
            ),
          },
          { id: 'calc', label: 'Calculations', content: <WorkedSolution steps={p.steps} title={`${p.title} — step by step`} /> },
          { id: 'refs', label: 'References', content: <DocSection num="R" title="Basis of each result"><div data-pdf-detail="Reference notes"><ReferenceList items={p.references} /></div></DocSection> },
        ]} />
        </div>
      }
    />
    </div>
  )
}
