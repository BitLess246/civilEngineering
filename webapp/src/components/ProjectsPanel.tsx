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
import { useProjects, projectByName, conflictsIn } from '../lib/useProjects'
import { readSession, writeSession, readOpenId, writeOpenId, readSessionDesign } from '../lib/modelSpaceSession'
import { SaveAlert } from './SaveAlert'

const when = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

// No props. The panel reads and writes the page's own session snapshot
// (`lib/modelSpaceSession`), which means it never holds a second copy of the
// sixty design fields Model Space keeps in component state.

const BTN = 'rounded border border-brand-line bg-brand-tint px-2.5 py-1 text-[11.5px] font-semibold text-brand hover:bg-brand-tint disabled:cursor-not-allowed disabled:opacity-50'
const BTN_QUIET = 'rounded border border-field-line px-2 py-1 text-[11px] font-semibold text-faint hover:border-brand hover:text-brand'

export function ProjectsPanel() {
  const api = useProjects()
  const [openId, setOpenId] = useState<string | null>(() => readOpenId())
  // The name field is the SAVE TARGET, not a live rename: it starts as the
  // open project's name (so the default save overwrites it) and from then on
  // it belongs to the engineer. A saved project only ever changes when this
  // form says so.
  const [name, setName] = useState(() => {
    const id = readOpenId()
    const p = id ? api.load(id) : null
    return p?.meta.name ?? ''
  })
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)

  const conflicts = api.report ? conflictsIn(api.report) : []

  const attach = (id: string | null) => {
    setOpenId(id); writeOpenId(id)
    if (id) { const p = api.load(id); if (p) setName(p.meta.name) }
  }

  /** Which saved project this save lands on, if the name is taken. */
  const target = projectByName(api.list, name)

  const saveCurrent = () => {
    const snap = readSession()
    // Results ride along only while the session still holds a valid design:
    // the key is dropped the moment the model is edited or a run fails, so an
    // absent key means the honest thing to save is NO results — not stale
    // ones. Opening a project seeds the key from its own saved results, so a
    // save made right after opening keeps them.
    const design = readSessionDesign()
    const seed = { ...snap, results: design ? { design } : undefined }
    // THE NAME IS THE IDENTITY. Saving over an existing name overwrites that
    // project — that is how the work you opened stays the work you saved;
    // saving under a new name starts a new project and leaves the old one
    // exactly as it was. Overwriting is not a new project, so the plan's
    // create-quota never blocks it.
    if (target) {
      const doc = api.load(target.id)
      if (doc) { api.save(target.id, { ...doc, ...seed }); attach(target.id); return }
    }
    const id = api.create(name.trim() || 'Untitled project', seed)
    if (id) attach(id)
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
    // The saved design seeds the session so a save made before any new run
    // keeps the project's results rather than stripping them.
    writeSession({ model: p.model, inputs: p.inputs, design: p.results?.design ?? null })
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
      <SaveAlert message={api.saveError} onDismiss={api.clearSaveError} />
      {/* ── Save the open model ─────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-faint">Save this project</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="min-w-[180px] flex-1 rounded border border-field-line px-2 py-1 text-[12.5px]"
          />
          <button type="button" onClick={saveCurrent} className={BTN}
            disabled={!target && !api.canCreate.ok}>
            {target ? (target.id === openId ? 'Save changes' : 'Overwrite') : 'Save as new'}
          </button>
          {openId && (
            <button type="button" onClick={() => attach(null)} className={BTN_QUIET}>
              Detach
            </button>
          )}
        </div>
        {target && target.id !== openId && (
          <p className="mt-1.5 text-[11.5px] leading-5 text-faint">
            A project named “{target.name}” already exists — saving overwrites it.
          </p>
        )}
        {!target && !api.canCreate.ok && (
          <p className="mt-1.5 text-[11.5px] leading-5 text-warn">
            🔒 {api.canCreate.message}{' '}
            <Link to="/pricing" className="font-semibold underline">See plans</Link>
          </p>
        )}
        {!readSession().model && (
          <p className="mt-1.5 text-[11.5px] text-faint">
            No model yet — saving now keeps the name and the design inputs, and the
            model joins it the next time you save.
          </p>
        )}
      </div>

      {/* ── The listing ─────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
          Saved projects ({api.list.length})
        </p>
        {api.list.length === 0 ? (
          <p className="mt-2 text-[12px] text-faint">Nothing saved on this browser yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-hairline-2 border-y border-hairline-2">
            {api.list.map((p) => (
              <li key={p.id} className="py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">
                      {p.name}
                      {p.id === openId && <span className="ml-2 rounded bg-brand-tint px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider text-brand">Open</span>}
                    </p>
                    <p className="text-[11px] text-faint">
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
                      className="rounded border border-fail-line px-2 py-1 text-[11px] font-semibold text-fail hover:bg-fail-tint">
                      Delete
                    </button>
                  </div>
                </div>

                {renaming === p.id && (
                  <div className="mt-2 flex gap-1.5">
                    <input value={renameTo} onChange={(e) => setRenameTo(e.target.value)} autoFocus
                      className="flex-1 rounded border border-field-line px-2 py-1 text-[12px]" />
                    <button type="button" className={BTN}
                      onClick={() => { api.rename(p.id, renameTo); setRenaming(null) }}>Save</button>
                    <button type="button" className={BTN_QUIET} onClick={() => setRenaming(null)}>Cancel</button>
                  </div>
                )}

                {/* Deleting asks. A structural model is a day's work and there
                    is no undo — not even a sync will bring it back, because a
                    sync never resurrects what you deleted on purpose. */}
                {confirming === p.id && (
                  <div className="mt-2 rounded border border-fail-line bg-fail-tint px-2.5 py-2">
                    <p className="text-[12px] text-fail">
                      Delete “{p.name}” from this browser? This cannot be undone.
                    </p>
                    <div className="mt-1.5 flex gap-1.5">
                      <button type="button"
                        onClick={() => del(p.id)}
                        className="rounded bg-fail px-2.5 py-1 text-[11.5px] font-semibold text-on-solid hover:bg-fail-hover">
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
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-faint">Your account</p>
        {api.cloud === 'not-configured' && (
          <p className="mt-2 text-[12px] text-faint">
            Sign-in is not set up on this deployment, so projects stay on this browser.
          </p>
        )}
        {api.cloud === 'signed-out' && (
          <p className="mt-2 text-[12px] text-faint">
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
              <span className="text-[11px] text-faint">Manual — nothing uploads on its own.</span>
            </div>
            {api.report && conflicts.length === 0 && (
              <p className="mt-1.5 text-[11.5px] text-faint">
                {summarise(api.report.outcomes.map((o) => o.kind))}
              </p>
            )}
            {api.report?.outcomes.filter((o) => o.kind === 'failed').map((o) => (
              <p key={o.id} className="mt-1.5 text-[11.5px] text-warn">
                ⚠ {o.kind === 'failed' && o.message}
              </p>
            ))}
          </>
        )}
        {api.error && <p className="mt-1.5 text-[11.5px] text-fail">{api.error}</p>}
      </div>

      {/* ── Conflicts ───────────────────────────────────────────────── */}
      {conflicts.length > 0 && (
        <div className="rounded border border-warn-line bg-warn-tint px-3 py-2.5">
          <p className="text-[12.5px] font-semibold text-warn">
            {conflicts.length} project{conflicts.length === 1 ? '' : 's'} changed in two places
          </p>
          <p className="mt-1 text-[11.5px] leading-5 text-warn">
            Nothing has been overwritten. Choose which version to keep — there is no
            field-by-field merge, because deciding which member size is right is yours to make.
          </p>
          <ul className="mt-2 space-y-2">
            {conflicts.map((c) => (
              <li key={c.id} className="rounded border border-warn-line bg-sheet px-2.5 py-2">
                <p className="text-[12px] font-semibold text-ink">{c.local.meta.name}</p>
                <p className="text-[11px] text-faint">
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
