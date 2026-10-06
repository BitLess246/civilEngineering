import 'katex/dist/katex.min.css'
import { PageHeader } from '../components/calc'
import { CriticalMode } from './OpenChannelCriticalMode'

// Critical depth, Froude number and specific energy — the control section. A standalone page: it was one mode of a combined page.

export default function CriticalDepth() {
  return (
    <div>
      <PageHeader title="Critical Depth & Specific Energy" badges={['Froude', 'Specific energy']} />
      <CriticalMode />
    </div>
  )
}
