// ─────────────────────────────────────────────────────────────────────────
// The Projects tab in Model Space: save, open, rename, delete, and sync.
//
// Self-contained on purpose. Model Space is already ~4,500 lines; folding a
// listing, a rename field, a delete confirm and a conflict resolver into it
// would have made the page harder to read for the sake of avoiding one import.
// The page hands over two things — the model and the design inputs — and gets
// back a callback when the engineer opens something.
//
// The two rules that shape this panel:
//   • DELETE ASKS. A structural model is a day's work and there is no undo.
//   • CONFLICTS ARE THE ENGINEER'S TO SETTLE. The panel shows both sides and
//     the two buttons; it never picks. See `useProjects.resolve`.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useProjects, conflictsIn } from '../lib/useProjects'
import { readSession, writeSession, readOpenId, writeOpenId } from '../lib/modelSpaceSession'

const when = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

// No props. The panel reads and writes the page's own session snapshot
// (`lib/modelSpaceSession`), which means it never holds a second copy of the
// sixty design fields Model Space keeps in component state.

const BTN = 'rounded border border-[#cddcf0] bg-[#eaf1f9] px-2.5 py-1 text-[11.5px] font-semibold text-[#0f4c92] hover:bg-[#dbe8f5] disabled:cursor-not-allowed disabled:opacity-50'
const BTN_QUIET = 'rounded border border-[#d6d3c9] px-2 py-1 text-[11px] font-semibold text-[#5b5648] hover:border-[#0056b3] hover:text-[#0056b3]'

export function ProjectsPanel() {
  const api = useProjects()
  const [openId, setOpenId] = useState<string | null>(() => readOpenId())
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)

  const conflicts = api.report ? conflictsIn(api.report) : []

  const attach = (id: string | null) => { setOpenId(id); writeOpenId(id) }

  const saveCurrent = () => {
    const snap = readSession()
    if (openId) {
      const existing = api.load(openId)
      if (existing) { api.save(openId, { ...existing, ...snap }); return }
    }
    const id = api.create(name.trim() || 'Untitled project', snap)
    if (id) { attach(id); setName('') }
  }

  /**
   * Opening writes the project into the session the page reads at mount and
   * reloads. See `lib/modelSpaceSession` for why this beats calling sixty
   * setters — in short, the setter list would be a third copy of the design
   * inputs and would miss whichever field was added last.
   */
  const open = (id: string) => {
    const p = api.load(id)
    if (!p) return
    writeSession({ model: p.model, inputs: p.inputs })
    writeOpenId(id)
    window.location.reload()
  }

  const del = (id: string) => {
    api.remove(id)
    if (openId === id) attach(null)
    setConfirming(null)
  }

  return (
    <div className="space-y-4 p-4">
      {/* ── Save the open model ─────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7a7568]">Save this project</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={openId ? (api.load(openId)?.meta.name ?? '') : name}
            onChange={(e) => (openId ? api.rename(openId, e.target.value) : setName(e.target.value))}
            placeholder="Project name"
            className="min-w-[180px] flex-1 rounded border border-[#d6d3c9] px-2 py-1 text-[12.5px]"
          />
          <button type="button" onClick={saveCurrent} className={BTN}
            disabled={!openId && !api.canCreate.ok}>
            {openId ? 'Save changes' : 'Save as new'}
          </button>
          {openId && (
            <button type="button" onClick={() => attach(null)} className={BTN_QUIET}>
              Detach
            </button>
          )}
        </div>
        {!openId && !api.canCreate.ok && (
          <p className="mt-1.5 text-[11.5px] leading-5 text-amber-800">
            🔒 {api.canCreate.message}{' '}
            <Link to="/pricing" className="font-semibold underline">See plans</Link>
          </p>
        )}
        {!readSession().model && (
          <p className="mt-1.5 text-[11.5px] text-[#7a7568]">
            No model yet — saving now keeps the name and the design inputs, and the
            model joins it the next time you save.
          </p>
        )}
      </div>

      {/* ── The listing ─────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7a7568]">
          Saved projects ({api.list.length})
        </p>
        {api.list.length === 0 ? (
          <p className="mt-2 text-[12px] text-[#7a7568]">Nothing saved on this browser yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[#eeece5] border-y border-[#eeece5]">
            {api.list.map((p) => (
              <li key={p.id} className="py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[#0f1b2a]">
                      {p.name}
                      {p.id === openId && <span className="ml-2 rounded bg-[#eaf1f9] px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider text-[#0f4c92]">Open</span>}
                    </p>
                    <p className="text-[11px] text-[#7a7568]">
                      {p.memberCount} member{p.memberCount === 1 ? '' : 's'} · {p.nodeCount} node{p.nodeCount === 1 ? '' : 's'} · saved {when(p.updatedAt)}
                      {p.client && ` · ${p.client}`}
                    </p>
                  </div>
                  <div className="flex flex-none gap-1.5">
                    <button type="button" onClick={() => open(p.id)} className={BTN_QUIET}>Open</button>
                    <button type="button" className={BTN_QUIET}
                      onClick={() => { setRenaming(p.id); setRenameTo(p.name) }}>Rename</button>
                    <button type="button"
                      onClick={() => setConfirming(p.id)}
                      className="rounded border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50">
                      Delete
                    </button>
                  </div>
                </div>

                {renaming === p.id && (
                  <div className="mt-2 flex gap-1.5">
                    <input value={renameTo} onChange={(e) => setRenameTo(e.target.value)} autoFocus
                      className="flex-1 rounded border border-[#d6d3c9] px-2 py-1 text-[12px]" />
                    <button type="button" className={BTN}
                      onClick={() => { api.rename(p.id, renameTo); setRenaming(null) }}>Save</button>
                    <button type="button" className={BTN_QUIET} onClick={() => setRenaming(null)}>Cancel</button>
                  </div>
                )}

                {/* Deleting asks. A structural model is a day's work and there
                    is no undo — not even a sync will bring it back, because a
                    sync never resurrects what you deleted on purpose. */}
                {confirming === p.id && (
                  <div className="mt-2 rounded border border-red-200 bg-red-50 px-2.5 py-2">
                    <p className="text-[12px] text-red-900">
                      Delete “{p.name}” from this browser? This cannot be undone.
                    </p>
                    <div className="mt-1.5 flex gap-1.5">
                      <button type="button"
                        onClick={() => del(p.id)}
                        className="rounded bg-red-600 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-red-700">
                        Delete it
                      </button>
                      <button type="button" className={BTN_QUIET} onClick={() => setConfirming(null)}>Keep it</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Cloud ───────────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7a7568]">Your account</p>
        {api.cloud === 'not-configured' && (
          <p className="mt-2 text-[12px] text-[#7a7568]">
            Sign-in is not set up on this deployment, so projects stay on this browser.
          </p>
        )}
        {api.cloud === 'signed-out' && (
          <p className="mt-2 text-[12px] text-[#7a7568]">
            <Link to="/signin" className="font-semibold underline">Sign in</Link> to keep projects
            on your account and open them on another machine.
          </p>
        )}
        {api.cloud === 'ready' && (
          <>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={() => void api.sync()} disabled={api.busy} className={BTN}>
                {api.busy ? 'Syncing…' : 'Sync with my account'}
              </button>
              <span className="text-[11px] text-[#7a7568]">Manual — nothing uploads on its own.</span>
            </div>
            {api.report && conflicts.length === 0 && (
              <p className="mt-1.5 text-[11.5px] text-[#7a7568]">
                {summarise(api.report.outcomes.map((o) => o.kind))}
              </p>
            )}
            {api.report?.outcomes.filter((o) => o.kind === 'failed').map((o) => (
              <p key={o.id} className="mt-1.5 text-[11.5px] text-amber-800">
                ⚠ {o.kind === 'failed' && o.message}
              </p>
            ))}
          </>
        )}
        {api.error && <p className="mt-1.5 text-[11.5px] text-red-700">{api.error}</p>}
      </div>

      {/* ── Conflicts ───────────────────────────────────────────────── */}
      {conflicts.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-[12.5px] font-semibold text-amber-900">
            {conflicts.length} project{conflicts.length === 1 ? '' : 's'} changed in two places
          </p>
          <p className="mt-1 text-[11.5px] leading-5 text-amber-900">
            Nothing has been overwritten. Choose which version to keep — there is no
            field-by-field merge, because deciding which member size is right is yours to make.
          </p>
          <ul className="mt-2 space-y-2">
            {conflicts.map((c) => (
              <li key={c.id} className="rounded border border-amber-200 bg-white px-2.5 py-2">
                <p className="text-[12px] font-semibold text-[#0f1b2a]">{c.local.meta.name}</p>
                <p className="text-[11px] text-[#7a7568]">
                  This browser: saved {when(c.local.meta.updatedAt)}, {c.local.model?.members.length ?? 0} members ·
                  {' '}Your account: saved {when(c.remote.updatedAt)}, {c.remote.project.model?.members.length ?? 0} members
                </p>
                <div className="mt-1.5 flex gap-1.5">
                  <button type="button" className={BTN_QUIET}
                    onClick={() => void api.resolve(c.id, 'local')}>Keep this browser’s</button>
                  <button type="button" className={BTN_QUIET}
                    onClick={() => void api.resolve(c.id, 'remote')}>Keep my account’s</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** "2 uploaded, 1 downloaded" — or plain reassurance when nothing moved. */
function summarise(kinds: string[]): string {
  const n = (k: string) => kinds.filter((x) => x === k).length
  const parts = [
    n('uploaded') && `${n('uploaded')} uploaded`,
    n('downloaded') && `${n('downloaded')} downloaded`,
  ].filter(Boolean) as string[]
  return parts.length ? `Synced — ${parts.join(', ')}.` : 'Synced — everything was already up to date.'
}
