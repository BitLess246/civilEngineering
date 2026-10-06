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
}

export function WorkspacePage(p: WorkspacePageProps) {
  const report = useWorkspaceReport(p.title, p.badges)
  return (
    <Workspace title={p.title} badges={p.badges} intro={p.intro}
      inputs={<InputRail>{report.group}{p.inputs}</InputRail>}
      checks={p.checks}
      document={
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
                    {p.drawing.node}
                  </DocSection>
                )}
                <DocSection num={p.drawing ? 3 : 2} title="Results summary"><ResultsTable rows={p.results} caption={p.resultsCaption} /></DocSection>
              </>
            ),
          },
          { id: 'calc', label: 'Calculations', content: <WorkedSolution steps={p.steps} title={`${p.title} — step by step`} /> },
          { id: 'refs', label: 'References', content: <DocSection num="R" title="Basis of each result"><ReferenceList items={p.references} /></DocSection> },
        ]} />
      }
    />
  )
}
