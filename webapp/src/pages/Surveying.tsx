import { useState } from 'react'
import 'katex/dist/katex.min.css'
import { PageHeader } from '../components/calc'
import { LevelingMode } from './SurveyingLevelingMode'
import { TraverseMode } from './SurveyingTraverseMode'
import { CurvesMode } from './SurveyingCurvesMode'
import { EarthworkMode } from './SurveyingEarthworkMode'

// Surveying Toolbox — the shell owns the page header and the mode switch,
// then hands over to one of four board-exam classics:
//   · Leveling  — field-book reduction, page check, misclosure distribution
//   · Traverse  — latitudes/departures, Bowditch, DMD area
//   · Curves    — simple circular curve elements + deflection staking
//   · Earthwork — end-area volumes, prismoidal check, mass haul

type Mode = 'leveling' | 'traverse' | 'curves' | 'earthwork'

const MODES: { id: Mode; label: string; title: string; badges: string[] }[] = [
  { id: 'leveling', label: 'Leveling', title: 'Surveying — Differential Leveling', badges: ['HI · rise & fall', 'Misclosure'] },
  { id: 'traverse', label: 'Traverse', title: 'Surveying — Traverse & Area', badges: ['Bowditch rule', 'DMD area'] },
  { id: 'curves', label: 'Curves', title: 'Surveying — Simple Circular Curve', badges: ['Curve elements', 'Deflection staking'] },
  { id: 'earthwork', label: 'Earthwork', title: 'Surveying — Earthwork & Mass Haul', badges: ['End area', 'Prismoidal check'] },
]

export default function Surveying() {
  const [mode, setMode] = useState<Mode>('leveling')
  const cur = MODES.find((m) => m.id === mode)!

  return (
    <div>
      <PageHeader
        title={cur.title}
        badges={cur.badges}
        actions={
          <div className="flex overflow-hidden rounded-lg border border-hairline-2" role="tablist" aria-label="Surveying calculator mode">
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
      {mode === 'leveling' && <LevelingMode />}
      {mode === 'traverse' && <TraverseMode />}
      {mode === 'curves' && <CurvesMode />}
      {mode === 'earthwork' && <EarthworkMode />}
    </div>
  )
}
