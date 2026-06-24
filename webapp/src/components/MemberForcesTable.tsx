import { useState } from 'react'
import type { F3Analysis, F3MemberResult } from '../engine/frame3d'
import type { Member, RectSection } from '../engine/model'

interface ForceRow {
  id: string
  role: string
  section: string
  N: number; Vy: number; Vz: number; T: number; My: number; Mz: number
}

function memberMaxima(mr: F3MemberResult) {
  return {
    N:  mr.Nmax,
    Vy: Math.max(...mr.Vy.map(Math.abs)),
    Vz: Math.max(...mr.Vz.map(Math.abs)),
    T:  mr.Tmax,
    My: Math.max(...mr.My.map(Math.abs)),
    Mz: Math.max(...mr.Mz.map(Math.abs)),
  }
}

const f1 = (v: number) => v.toFixed(1)

const ROLE_ORDER: Record<string, number> = { column: 0, brace: 1, girder: 2, beam: 3 }

export function MemberForcesTable({
  analysis,
  members,
  sectionFor,
}: {
  analysis: F3Analysis
  members: Member[]
  sectionFor: (id: string) => RectSection | undefined
}) {
  const validCombos = analysis.perCombo.map((run, i) => ({ run, i })).filter(({ run }) => !!run.result)
  const [active, setActive] = useState<'envelope' | number>('envelope')

  const allMemberIds = validCombos[0]?.run.result!.members.map((m) => m.id) ?? []

  const roleOrder = (id: string) => {
    const mem = members.find((m) => m.id === id)
    return ROLE_ORDER[mem?.role ?? ''] ?? 99
  }
  const sortedIds = [...allMemberIds].sort((a, b) => roleOrder(a) - roleOrder(b) || a.localeCompare(b))

  function buildEnvelope(): ForceRow[] {
    return sortedIds.map((id) => {
      const mem = members.find((m) => m.id === id)
      const env = { N: 0, Vy: 0, Vz: 0, T: 0, My: 0, Mz: 0 }
      for (const { run } of validCombos) {
        const mr = run.result!.members.find((m) => m.id === id)
        if (!mr) continue
        const mx = memberMaxima(mr)
        env.N  = Math.max(env.N,  mx.N)
        env.Vy = Math.max(env.Vy, mx.Vy)
        env.Vz = Math.max(env.Vz, mx.Vz)
        env.T  = Math.max(env.T,  mx.T)
        env.My = Math.max(env.My, mx.My)
        env.Mz = Math.max(env.Mz, mx.Mz)
      }
      return { id, role: mem?.role ?? '—', section: sectionFor(id)?.name ?? mem?.section ?? '—', ...env }
    })
  }

  function buildCombo(idx: number): ForceRow[] {
    const res = analysis.perCombo[idx].result
    if (!res) return []
    const byId = new Map(res.members.map((mr) => [mr.id, mr]))
    return sortedIds.flatMap((id) => {
      const mr = byId.get(id)
      if (!mr) return []
      const mem = members.find((m) => m.id === id)
      return [{ id, role: mem?.role ?? '—', section: sectionFor(id)?.name ?? mem?.section ?? '—', ...memberMaxima(mr) }]
    })
  }

  const rows = active === 'envelope' ? buildEnvelope() : buildCombo(active)

  const globalMax = rows.reduce(
    (acc, r) => ({
      N:  Math.max(acc.N,  r.N),
      Vy: Math.max(acc.Vy, r.Vy),
      Vz: Math.max(acc.Vz, r.Vz),
      T:  Math.max(acc.T,  r.T),
      My: Math.max(acc.My, r.My),
      Mz: Math.max(acc.Mz, r.Mz),
    }),
    { N: 0, Vy: 0, Vz: 0, T: 0, My: 0, Mz: 0 }
  )

  const tabCls = (on: boolean) =>
    `rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
      on ? 'bg-[#0056b3] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-[1.02rem] font-bold text-[#0056b3]">Member Forces (max absolute per member)</h2>

      <div className="mb-3 flex flex-wrap gap-1">
        <button type="button" onClick={() => setActive('envelope')} className={tabCls(active === 'envelope')}>
          Envelope
        </button>
        {validCombos.map(({ run, i }) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            className={`${tabCls(active === i)} ${i === analysis.govIdx ? 'ring-1 ring-[#0056b3] ring-offset-1' : ''}`}
          >
            {run.combo.name}{i === analysis.govIdx ? ' ★' : ''}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="pb-1.5 pr-3 text-left font-semibold">Member</th>
              <th className="pb-1.5 pr-3 text-left font-semibold">Role</th>
              <th className="pb-1.5 pr-3 text-left font-semibold">Section</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">N (kN)</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">Vy (kN)</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">Vz (kN)</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">T (kN·m)</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">My (kN·m)</th>
              <th className="pb-1.5 text-right font-semibold">Mz (kN·m)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="py-1 pr-3 font-mono text-slate-700">{r.id}</td>
                <td className="py-1 pr-3 capitalize text-slate-500">{r.role}</td>
                <td className="py-1 pr-3 text-slate-500">{r.section}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-800">{f1(r.N)}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-800">{f1(r.Vy)}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-800">{f1(r.Vz)}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-800">{f1(r.T)}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-800">{f1(r.My)}</td>
                <td className="py-1 text-right tabular-nums text-slate-800">{f1(r.Mz)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
              <td className="py-1.5 pr-3 text-slate-700" colSpan={3}>MAX</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-[#0056b3]">{f1(globalMax.N)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-[#0056b3]">{f1(globalMax.Vy)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-[#0056b3]">{f1(globalMax.Vz)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-[#0056b3]">{f1(globalMax.T)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-[#0056b3]">{f1(globalMax.My)}</td>
              <td className="py-1.5 text-right tabular-nums text-[#0056b3]">{f1(globalMax.Mz)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
