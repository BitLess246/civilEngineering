import { useState } from 'react'
import type { F3Analysis } from '../engine/frame3d'

// Nodal displacements live in the solved vector d as [ux,uy,uz,θx,θy,θz] per
// node at d[6·i + dof], where i is the node's position in model order.
// Translations are metres (→ mm here); rotations are radians (→ mrad).
interface DispRow {
  id: string
  y: number
  ux: number; uy: number; uz: number   // mm
  rx: number; ry: number; rz: number   // mrad
}

const mm = (v: number) => (v * 1000).toFixed(2)       // m → mm
const mr = (v: number) => (v * 1000).toFixed(3)       // rad → mrad

function rowFrom(id: string, y: number, d: number[], i: number): DispRow {
  return {
    id, y,
    ux: d[6 * i], uy: d[6 * i + 1], uz: d[6 * i + 2],
    rx: d[6 * i + 3], ry: d[6 * i + 4], rz: d[6 * i + 5],
  }
}

const pickExtreme = (a: number, b: number) => (Math.abs(b) > Math.abs(a) ? b : a)

export function DisplacementTable({
  analysis,
  nodes,
}: {
  analysis: F3Analysis
  nodes: { id: string; y: number }[]
}) {
  const validCombos = analysis.perCombo.map((run, i) => ({ run, i })).filter(({ run }) => !!run.result)
  const [active, setActive] = useState<'envelope' | number>('envelope')

  // Stable display order: by elevation then id (reads floor-by-floor), but the
  // d-vector index is the original model order, so carry it through.
  const indexed = nodes.map((n, i) => ({ ...n, i }))
  const ordered = [...indexed].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id))

  function buildEnvelope(): DispRow[] {
    return ordered.map((n) => {
      const acc: DispRow = { id: n.id, y: n.y, ux: 0, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 }
      for (const { run } of validCombos) {
        const r = rowFrom(n.id, n.y, run.result!.d, n.i)
        acc.ux = pickExtreme(acc.ux, r.ux); acc.uy = pickExtreme(acc.uy, r.uy); acc.uz = pickExtreme(acc.uz, r.uz)
        acc.rx = pickExtreme(acc.rx, r.rx); acc.ry = pickExtreme(acc.ry, r.ry); acc.rz = pickExtreme(acc.rz, r.rz)
      }
      return acc
    })
  }

  function buildCombo(idx: number): DispRow[] {
    const res = analysis.perCombo[idx].result
    if (!res) return []
    return ordered.map((n) => rowFrom(n.id, n.y, res.d, n.i))
  }

  const rows = active === 'envelope' ? buildEnvelope() : buildCombo(active)

  const gmax = rows.reduce(
    (a, r) => ({
      ux: Math.max(a.ux, Math.abs(r.ux)), uy: Math.max(a.uy, Math.abs(r.uy)), uz: Math.max(a.uz, Math.abs(r.uz)),
      rx: Math.max(a.rx, Math.abs(r.rx)), ry: Math.max(a.ry, Math.abs(r.ry)), rz: Math.max(a.rz, Math.abs(r.rz)),
    }),
    { ux: 0, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 }
  )

  const tabCls = (on: boolean) =>
    `rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
      on ? 'bg-[#0056b3] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-[1.02rem] font-bold text-[#0056b3]">Nodal Displacements</h2>
      <p className="mb-3 text-[11px] text-slate-500">Translations in mm, rotations in mrad. Envelope shows the signed extreme across combinations.</p>

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
              <th className="pb-1.5 pr-3 text-left font-semibold">Node</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">Elev (m)</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">ux (mm)</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">uy (mm)</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">uz (mm)</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">θx (mrad)</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">θy (mrad)</th>
              <th className="pb-1.5 text-right font-semibold">θz (mrad)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="py-1 pr-3 font-mono text-slate-700">{r.id}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-500">{r.y.toFixed(2)}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-800">{mm(r.ux)}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-800">{mm(r.uy)}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-800">{mm(r.uz)}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-800">{mr(r.rx)}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-800">{mr(r.ry)}</td>
                <td className="py-1 text-right tabular-nums text-slate-800">{mr(r.rz)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
              <td className="py-1.5 pr-3 text-slate-700" colSpan={2}>MAX |·|</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-[#0056b3]">{mm(gmax.ux)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-[#0056b3]">{mm(gmax.uy)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-[#0056b3]">{mm(gmax.uz)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-[#0056b3]">{mr(gmax.rx)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-[#0056b3]">{mr(gmax.ry)}</td>
              <td className="py-1.5 text-right tabular-nums text-[#0056b3]">{mr(gmax.rz)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
