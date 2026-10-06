import 'katex/dist/katex.min.css'
import { PageHeader } from '../components/calc'
import { GeometricSuperMode } from './GeometricDesignSuperMode'

// Superelevation and minimum radius — the e + f balance. A standalone page: it was one mode of a combined page.

export default function Superelevation() {
  return (
    <div>
      <PageHeader title="Superelevation & Radius" badges={['e + f balance', 'Rmin']} />
      <GeometricSuperMode />
    </div>
  )
}
