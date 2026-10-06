import 'katex/dist/katex.min.css'
import { PageHeader } from '../components/calc'
import { JumpMode } from './OpenChannelJumpMode'

// Hydraulic jump — sequent depths and the energy it dissipates. A standalone page: it was one mode of a combined page.

export default function HydraulicJump() {
  return (
    <div>
      <PageHeader title="Hydraulic Jump" badges={['Sequent depth', 'Energy loss']} />
      <JumpMode />
    </div>
  )
}
