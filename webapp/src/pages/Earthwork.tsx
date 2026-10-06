import 'katex/dist/katex.min.css'
import { PageHeader } from '../components/calc'
import { EarthworkMode } from './SurveyingEarthworkMode'

// Earthwork volumes by average end area with the prismoidal check, and the mass haul. A standalone page: it was one mode of a combined page.

export default function Earthwork() {
  return (
    <div>
      <PageHeader title="Earthwork & Mass Haul" badges={['End area', 'Prismoidal check']} />
      <EarthworkMode />
    </div>
  )
}
