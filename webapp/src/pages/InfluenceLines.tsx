import { useState } from 'react'
// Every page that renders worked-solution math carries its own KaTeX stylesheet
// — it stays out of the pages that never show an equation.
import 'katex/dist/katex.min.css'
import { PageHeader } from '../components/calc'
import { TrussMode } from './InfluenceTrussMode'
import { BeamMode } from './InfluenceBeamMode'

// Influence Lines — the shell owns the page header and the mode switch, then
// hands over to one of the two calculators:
//   · Bridge truss — every member of a determinate Pratt/Howe/Warren truss
//     under a unit load walking the deck (InfluenceTrussMode).
//   · Continuous beam — reactions, section shears/moments and hinge shears of
//     a determinate hinged (Gerber) beam, with the lane-load placement
//     machinery that answers the classic board-exam questions
//     (InfluenceBeamMode).

type Mode = 'truss' | 'beam'

const MODES: { id: Mode; label: string; title: string; badges: string[] }[] = [
  { id: 'truss', label: 'Bridge truss', title: 'Influence Lines — Bridge Truss', badges: ['Simply supported', 'Unit-load method'] },
  { id: 'beam', label: 'Continuous beam', title: 'Influence Lines — Continuous Beam', badges: ['Gerber beams', 'Unit-load method'] },
]

export default function InfluenceLines() {
  const [mode, setMode] = useState<Mode>('truss')
  const cur = MODES.find((m) => m.id === mode)!

  return (
    <div>
      <PageHeader
        title={cur.title}
        badges={cur.badges}
        actions={
          <div className="flex overflow-hidden rounded-lg border border-hairline-2" role="tablist" aria-label="Influence-lines calculator mode">
            {MODES.map((m) => (
              <button key={m.id} type="button" role="tab" aria-selected={mode === m.id}
                onClick={() => setMode(m.id)}
                className={`px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  mode === m.id ? 'bg-brand-tint text-brand' : 'text-muted hover:bg-brand-tint/40'}`}>
                {m.label}
              </button>
            ))}
          </div>
        }
      />
      {mode === 'truss' ? <TrussMode /> : <BeamMode />}
    </div>
  )
}
