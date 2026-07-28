// The complete /docs catalogue. Split across files by group so each stays
// readable; `docsContent.test.ts` checks it against the router so no tool can
// ship undocumented.
import type { DocTool } from './docsModel'
import { SHELL_TOOLS } from './docsContentShell'
import { MODEL_TOOLS } from './docsContentModel'
import { ANALYSIS_TOOLS } from './docsContentAnalysis'
import { DESIGN_TOOLS } from './docsContentDesign'
import { SITE_TOOLS } from './docsContentSite'

export const DOC_TOOLS: DocTool[] = [
  ...SHELL_TOOLS,
  ...MODEL_TOOLS,
  ...ANALYSIS_TOOLS,
  ...DESIGN_TOOLS,
  ...SITE_TOOLS,
]

/**
 * Routes intentionally documented under another entry rather than on their own.
 * Keeping this explicit means the coverage test still fails for a genuinely new
 * page — it only passes for routes deliberately folded into a parent.
 */
export const DOC_ROUTE_ALIASES: Record<string, string> = {
  // the five estimators share one page in the docs
  '/estimate/beam': 'estimates',
  '/estimate/column': 'estimates',
  '/estimate/chb': 'estimates',
  '/estimate/box-culvert': 'estimates',
  // the scheduler's sub-views are documented as tabs of the Schedule entry
  '/schedule/gantt': 'schedule',
  '/schedule/network': 'schedule',
  '/schedule/dashboard': 'schedule',
  '/schedule/resources': 'schedule',
  '/schedule/reports': 'schedule',
  '/schedule/daily': 'schedule',
}
