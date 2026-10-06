import 'katex/dist/katex.min.css'
import { PageHeader } from '../components/calc'
import { CurvesMode } from './SurveyingCurvesMode'

// Simple circular curve — elements and deflection-angle staking. A standalone page: it was one mode of a combined page.

export default function SimpleCurve() {
  return (
    <div>
      <PageHeader title="Simple Circular Curve" badges={['Curve elements', 'Deflection staking']} />
      <CurvesMode />
    </div>
  )
}
