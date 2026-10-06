import 'katex/dist/katex.min.css'
import { PageHeader } from '../components/calc'
import { TraverseMode } from './SurveyingTraverseMode'

// Closed traverse — balancing (Bowditch / transit) and DMD area. A standalone page: it was one mode of a combined page.

export default function Traverse() {
  return (
    <div>
      <PageHeader title="Traverse & Area" badges={['Bowditch rule', 'DMD area']} />
      <TraverseMode />
    </div>
  )
}
