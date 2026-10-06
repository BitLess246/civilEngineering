import 'katex/dist/katex.min.css'
import { PageHeader } from '../components/calc'
import { GeometricCurveMode } from './GeometricDesignCurveMode'

// Parabolic vertical curves — crest and sag. A standalone page: it was one mode of a combined page.

export default function VerticalCurves() {
  return (
    <div>
      <PageHeader title="Vertical Curves" badges={['Parabola', 'Crest & sag']} />
      <GeometricCurveMode />
    </div>
  )
}
