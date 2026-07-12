// Free-form truss editor: edit the node coordinates, members, supports and
// loaded joints of a TrussModel directly. Emits a new model on every change so
// the page re-solves, re-designs and re-takes-off live. Deleting a node also
// drops any member / support / load that referenced it. Load magnitudes are
// driven by the page's Dead / Live joint-load fields — the load list here just
// selects WHICH joints are loaded (consistent with the parametric generator).
import type { TrussModel, TNode, TMember, ChordKind } from '../engine/truss'

const KINDS: ChordKind[] = ['top', 'bottom', 'vertical', 'diagonal']

const numCls = 'w-16 rounded border border-slate-300 px-1 py-0.5 text-right text-xs'
const selCls = 'rounded border border-slate-300 px-1 py-0.5 text-xs'
const delBtn = 'rounded px-1.5 text-red-500 hover:bg-red-50'
const addBtn = 'mt-1 rounded-md border border-[#0056b3]/40 bg-[#0056b3]/5 px-2 py-0.5 text-xs font-semibold text-[#0056b3] hover:bg-[#0056b3]/10'

export function TrussEditor({ model, onChange, onReset }: {
  model: TrussModel; onChange: (m: TrussModel) => void; onReset: () => void
}) {
  const ids = model.nodes.map((n) => n.id)
  const set = (patch: Partial<TrussModel>) => onChange({ ...model, ...patch })
  const fresh = (prefix: string, used: string[]) => { let k = used.length; while (used.includes(`${prefix}${k}`)) k++; return `${prefix}${k}` }

  // nodes
  const editNode = (i: number, p: Partial<TNode>) => set({ nodes: model.nodes.map((n, k) => (k === i ? { ...n, ...p } : n)) })
  const addNode = () => set({ nodes: [...model.nodes, { id: fresh('n', ids), x: 0, y: 0 }] })
  const delNode = (id: string) => set({
    nodes: model.nodes.filter((n) => n.id !== id),
    members: model.members.filter((m) => m.i !== id && m.j !== id),
    supports: model.supports.filter((s) => s.node !== id),
    loads: model.loads.filter((l) => l.node !== id),
  })
  // members
  const editMember = (i: number, p: Partial<TMember>) => set({ members: model.members.map((m, k) => (k === i ? { ...m, ...p } : m)) })
  const addMember = () => set({ members: [...model.members, { id: fresh('m', model.members.map((m) => m.id)), i: ids[0] ?? '', j: ids[1] ?? ids[0] ?? '', kind: 'diagonal' }] })
  const delMember = (i: number) => set({ members: model.members.filter((_, k) => k !== i) })
  // supports
  const editSupport = (i: number, p: Partial<{ node: string; ux: boolean; uy: boolean }>) => set({ supports: model.supports.map((s, k) => (k === i ? { ...s, ...p } : s)) })
  const addSupport = () => set({ supports: [...model.supports, { node: ids[0] ?? '', ux: true, uy: true }] })
  const delSupport = (i: number) => set({ supports: model.supports.filter((_, k) => k !== i) })
  // loaded joints (magnitude from the page's Dead/Live fields → marker fy = −1)
  const addLoad = () => set({ loads: [...model.loads, { node: ids[0] ?? '', fx: 0, fy: -1 }] })
  const editLoad = (i: number, node: string) => set({ loads: model.loads.map((l, k) => (k === i ? { ...l, node } : l)) })
  const delLoad = (i: number) => set({ loads: model.loads.filter((_, k) => k !== i) })

  const nodePick = (value: string, onPick: (v: string) => void) => (
    <select className={selCls} value={value} onChange={(e) => onPick(e.target.value)}>
      {ids.map((id) => <option key={id} value={id}>{id}</option>)}
    </select>
  )

  return (
    <fieldset className="no-print rounded-xl border border-amber-300 bg-amber-50/40 p-4 shadow-sm">
      <legend className="flex items-center gap-2 px-2 text-[1.02rem] font-bold text-[#0056b3]">
        ✎ Free-form editor
        <button type="button" onClick={onReset} className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">↺ Back to parametric</button>
      </legend>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Nodes */}
        <div>
          <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Nodes (m)</h4>
          <div className="max-h-48 overflow-y-auto pr-1">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-slate-500"><th className="pr-2">id</th><th className="pr-2">x</th><th className="pr-2">y</th><th /></tr></thead>
              <tbody>
                {model.nodes.map((n, i) => (
                  <tr key={n.id}>
                    <td className="pr-2 font-medium">{n.id}</td>
                    <td className="pr-2"><input type="number" step="0.25" className={numCls} value={n.x} onChange={(e) => editNode(i, { x: Number(e.target.value) })} /></td>
                    <td className="pr-2"><input type="number" step="0.25" className={numCls} value={n.y} onChange={(e) => editNode(i, { y: Number(e.target.value) })} /></td>
                    <td><button type="button" className={delBtn} onClick={() => delNode(n.id)} title="delete node">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className={addBtn} onClick={addNode}>+ node</button>
        </div>

        {/* Members */}
        <div>
          <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Members</h4>
          <div className="max-h-48 overflow-y-auto pr-1">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-slate-500"><th className="pr-2">id</th><th className="pr-2">i</th><th className="pr-2">j</th><th className="pr-2">kind</th><th /></tr></thead>
              <tbody>
                {model.members.map((m, i) => (
                  <tr key={m.id}>
                    <td className="pr-2 font-medium">{m.id}</td>
                    <td className="pr-2">{nodePick(m.i, (v) => editMember(i, { i: v }))}</td>
                    <td className="pr-2">{nodePick(m.j, (v) => editMember(i, { j: v }))}</td>
                    <td className="pr-2">
                      <select className={selCls} value={m.kind} onChange={(e) => editMember(i, { kind: e.target.value as ChordKind })}>
                        {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </td>
                    <td><button type="button" className={delBtn} onClick={() => delMember(i)} title="delete member">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className={addBtn} onClick={addMember}>+ member</button>
        </div>

        {/* Supports */}
        <div>
          <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Supports</h4>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-500"><th className="pr-2">node</th><th className="pr-2">ux</th><th className="pr-2">uy</th><th /></tr></thead>
            <tbody>
              {model.supports.map((s, i) => (
                <tr key={i}>
                  <td className="pr-2">{nodePick(s.node, (v) => editSupport(i, { node: v }))}</td>
                  <td className="pr-2"><input type="checkbox" checked={s.ux} onChange={(e) => editSupport(i, { ux: e.target.checked })} /></td>
                  <td className="pr-2"><input type="checkbox" checked={s.uy} onChange={(e) => editSupport(i, { uy: e.target.checked })} /></td>
                  <td><button type="button" className={delBtn} onClick={() => delSupport(i)} title="delete support">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className={addBtn} onClick={addSupport}>+ support</button>
        </div>

        {/* Loaded joints */}
        <div>
          <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Loaded joints</h4>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-500"><th className="pr-2">node</th><th /></tr></thead>
            <tbody>
              {model.loads.map((l, i) => (
                <tr key={i}>
                  <td className="pr-2">{nodePick(l.node, (v) => editLoad(i, v))}</td>
                  <td><button type="button" className={delBtn} onClick={() => delLoad(i)} title="delete load">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className={addBtn} onClick={addLoad}>+ loaded joint</button>
          <p className="mt-1 text-[10px] text-slate-500">Magnitudes come from the Dead / Live joint-load fields above.</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Pin = both ux &amp; uy; roller = uy only. Keep the truss statically stable (m + r = 2j) — the analysis card flags an
        unstable layout. Switch back to parametric anytime; your edits are discarded.
      </p>
    </fieldset>
  )
}
