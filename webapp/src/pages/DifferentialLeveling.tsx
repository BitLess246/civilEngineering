import 'katex/dist/katex.min.css'
import { PageHeader } from '../components/calc'
import { LevelingMode } from './SurveyingLevelingMode'

// Differential leveling — height of instrument / rise & fall with misclosure. A standalone page: it was one mode of a combined page.

export default function DifferentialLeveling() {
  return (
    <div>
      <PageHeader title="Differential Leveling" badges={['HI · rise & fall', 'Misclosure']} />
      <LevelingMode />
    </div>
  )
}
