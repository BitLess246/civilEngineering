import { useState } from 'react'
import 'katex/dist/katex.min.css'
import { PageHeader } from '../components/calc'
import { GeometricSSDMode } from './GeometricDesignSSDMode'
import { GeometricCurveMode } from './GeometricDesignCurveMode'
import { GeometricSuperMode } from './GeometricDesignSuperMode'

// Geometric Design — the highway alignment pillar in one shell, three modes:
//   · Stopping sight distance — reaction + braking, grade-aware
//   · Vertical curves — parabolic geometry, sight-distance length checks
//   · Superelevation — e + f = V²/127R balance and minimum radius

type Mode = 'ssd' | 'curve' | 'super'

const MODES: { id: Mode; label: string; title: string; badges: string[] }[] = [
  { id: 'ssd', label: 'Sight distance', title: 'Geometric Design — Stopping Sight Distance', badges: ['AASHTO', 'Reaction + braking'] },
  { id: 'curve', label: 'Vertical curves', title: 'Geometric Design — Vertical Curves', badges: ['Parabola', 'Crest & sag'] },
  { id: 'super', label: 'Superelevation', title: 'Geometric Design — Superelevation & Radius', badges: ['e + f balance', 'Rmin'] },
]

export default function GeometricDesign() {
  const [mode, setMode] = useState<Mode>('ssd')
  const cur = MODES.find((m) => m.id === mode)!

  return (
    <div>
      <PageHeader
        title={cur.title}
        badges={cur.badges}
        actions={
          <div className="flex overflow-hidden rounded-lg border border-hairline-2" role="tablist" aria-label="Geometric design mode">
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
      {mode === 'ssd' && <GeometricSSDMode />}
      {mode === 'curve' && <GeometricCurveMode />}
      {mode === 'super' && <GeometricSuperMode />}
    </div>
  )
}
