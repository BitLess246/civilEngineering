import 'katex/dist/katex.min.css'
import { PageHeader } from '../components/calc'
import { NormalMode } from './OpenChannelNormalMode'

// Open channel normal depth — Manning's equation, uniform flow. Critical depth
// and the hydraulic jump, which shared this page as modes, are their own pages
// now (/critical-depth, /hydraulic-jump).

export default function OpenChannel() {
  return (
    <div>
      <PageHeader title="Open Channel — Normal Depth" badges={['Manning', 'Uniform flow']} />
      <NormalMode />
    </div>
  )
}
