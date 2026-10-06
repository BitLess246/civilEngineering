import 'katex/dist/katex.min.css'
import { PageHeader } from '../components/calc'
import { GeometricSSDMode } from './GeometricDesignSSDMode'

// Stopping sight distance — reaction plus braking distance (AASHTO). A standalone page: it was one mode of a combined page.

export default function SightDistance() {
  return (
    <div>
      <PageHeader title="Stopping Sight Distance" badges={['AASHTO', 'Reaction + braking']} />
      <GeometricSSDMode />
    </div>
  )
}
