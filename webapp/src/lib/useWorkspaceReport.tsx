import { ReportGroup } from '../components/workspace'
import { PrintLetterhead, type CalcReportData } from '../components/ReportControls'
import { useReportLetterhead } from './reportLetterhead'

/** Letterhead state, the "Project & report" input group and the print header,
 *  for a page on the workspace layout (components/workspace.tsx). */
export function useWorkspaceReport(title: string, badges: string[], report?: CalcReportData) {
  const { lh, setLh, today, print } = useReportLetterhead(title)
  return {
    lh, today,
    group: <ReportGroup lh={lh} onChange={setLh} onPrint={print} title={title} badges={badges} report={report} />,
    printHeader: <PrintLetterhead title={title} badges={badges} lh={lh} today={today} />,
  }
}
