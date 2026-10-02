import { useState } from 'react'
import 'katex/dist/katex.min.css'
import { PageHeader } from '../components/calc'
import { NormalMode } from './OpenChannelNormalMode'
import { CriticalMode } from './OpenChannelCriticalMode'
import { JumpMode } from './OpenChannelJumpMode'

// Open Channel Flow — the hydraulics pillar in one shell, three modes:
//   · Normal depth — Manning's equation, uniform flow
//   · Critical depth — Froude, specific energy, the control section
//   · Hydraulic jump — sequent depths, energy dissipation

type Mode = 'normal' | 'critical' | 'jump'

const MODES: { id: Mode; label: string; title: string; badges: string[] }[] = [
  { id: 'normal', label: 'Normal depth', title: 'Open Channel — Normal Depth (Manning)', badges: ['Manning', 'Uniform flow'] },
  { id: 'critical', label: 'Critical depth', title: 'Open Channel — Critical Depth & Specific Energy', badges: ['Froude', 'Specific energy'] },
  { id: 'jump', label: 'Hydraulic jump', title: 'Open Channel — Hydraulic Jump', badges: ['Sequent depth', 'Energy loss'] },
]

export default function OpenChannel() {
  const [mode, setMode] = useState<Mode>('normal')
  const cur = MODES.find((m) => m.id === mode)!

  return (
    <div>
      <PageHeader
        title={cur.title}
        badges={cur.badges}
        actions={
          <div className="flex overflow-hidden rounded-lg border border-hairline-2" role="tablist" aria-label="Open channel mode">
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
      {mode === 'normal' && <NormalMode />}
      {mode === 'critical' && <CriticalMode />}
      {mode === 'jump' && <JumpMode />}
    </div>
  )
}
