// Floating calculation helper — one button + panel, mounted in AppShell so it
// is on every tool page. Scoped Q&A over free upstream models with
// navigate-and-prefill calculator actions (Phase 1).
//
// What it will NOT do, by construction: the scope lives server-side
// (`ai-chat` builds its own system prompt and drops client `system`
// messages), the model list is the free allowlist only, and actions resolve
// their display names through ALL_TOOLS — a route the app does not have can
// never be offered, because it has no name here.
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ALL_TOOLS } from '../../lib/tools'
import {
  FREE_MODELS, DEFAULT_FREE_MODEL,
} from '../../../../supabase/functions/_shared/aiAssistant'
import {
  chatWithAssistant, assistantToken, assistantFailureMessage,
  type AssistantChatMessage, type AssistantAction,
} from '../../lib/ai/assistantClient'
import { savePendingCalculatorInputs } from '../../lib/ai/pendingAction'
import { getClient } from '../../lib/auth/authClient'

interface ChatMessage extends AssistantChatMessage {
  actions?: AssistantAction[]
}

const HINT = 'Ask about a calculator — e.g. "which tool sizes a footing?", or give numbers: "D=120, L=80 on load combinations".'

function ActionCard({ action, onOpen }: { action: AssistantAction; onOpen: (a: AssistantAction) => void }) {
  const tool = ALL_TOOLS.find((t) => t.to === action.route)
  // No name in the catalog ⇒ no card. The server already drops unknown routes;
  // this is the second lock on the same door.
  if (!tool) return null
  return (
    <div className="mt-2 rounded-md border border-brand-line bg-brand-tint px-2.5 py-2">
      {action.note && <p className="text-xs text-ink-2">{action.note}</p>}
      <button type="button" onClick={() => onOpen(action)}
        className="mt-1.5 inline-flex min-h-[32px] items-center rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-on-solid hover:opacity-90">
        Open {tool.name} →
      </button>
    </div>
  )
}

export function AiAssistantWidget() {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [model, setModel] = useState<string>(DEFAULT_FREE_MODEL)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const toggle = () => {
    setOpen((v) => {
      if (!v) requestAnimationFrame(() => inputRef.current?.focus())
      return !v
    })
  }

  const openAction = (a: AssistantAction) => {
    savePendingCalculatorInputs(a.route, a.inputs)
    setOpen(false)
    nav(a.route)
  }

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || busy) return
    const userMsg: ChatMessage = { role: 'user', content }
    const history: AssistantChatMessage[] = [...messages, userMsg].map(
      ({ role, content: c }): AssistantChatMessage => ({ role, content: c }),
    )
    setMessages((m) => [...m, userMsg])
    setDraft('')
    setBusy(true)
    setError(null)
    const client = getClient()
    // getClient is null only when Supabase is unconfigured — chatWithAssistant
    // maps a null token to 'not-configured', so pass a shim client through and
    // let the one mapping speak for both cases.
    const result = await chatWithAssistant(
      client ?? { functions: { invoke: async () => ({ data: null, error: { context: { status: 503 } } }) } },
      client ? await assistantToken() : null,
      { model, messages: history.slice(-20) },
    )
    setBusy(false)
    if (!result.ok) {
      setError(assistantFailureMessage(result.reason))
      return
    }
    const reply = result.reply.trim()
    setMessages((m) => [
      ...m,
      {
        role: 'assistant',
        content: reply || (result.actions.length > 0 ? 'I filled in what you gave — open the calculator to run it:' : '…'),
        actions: result.actions.length > 0 ? result.actions : undefined,
      },
    ])
  }

  return (
    <div className="no-print">
      <button type="button" onClick={toggle}
        aria-expanded={open} aria-controls="ai-assistant-panel"
        title="Ask the calculation helper"
        className="fixed bottom-5 right-5 z-[70] flex h-12 w-12 items-center justify-center rounded-full bg-brand text-on-solid shadow-xl hover:opacity-90">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-3-.4-4.2-1L3 20l1.1-5.2A8.5 8.5 0 1 1 21 11.5Z" />
        </svg>
        <span className="sr-only">Ask the calculation helper</span>
      </button>

      {open && (
        <section id="ai-assistant-panel" role="dialog" aria-label="Calculation helper"
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
          className="fixed bottom-[76px] right-4 z-[70] flex max-h-[70vh] w-[min(92vw,380px)] flex-col overflow-hidden rounded-xl border border-hairline bg-sheet shadow-2xl">
          <header className="flex flex-none items-center gap-2 border-b border-hairline-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink">Calculation helper</p>
              <p className="truncate text-[11px] text-faint">Free models · answers only about this app's tools</p>
            </div>
            <label className="flex flex-none items-center gap-1 text-[11px] text-faint">
              <span className="sr-only">Model</span>
              <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model"
                className="h-7 max-w-[150px] rounded-md border border-field-line bg-field px-1 text-[11px] text-muted">
                {FREE_MODELS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close helper"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-muted hover:bg-brand-tint hover:text-brand">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
            </button>
          </header>

          <div className="min-h-[120px] flex-1 overflow-y-auto px-3 py-2" aria-live="polite">
            {messages.length === 0 && (
              <p className="mt-1 text-xs leading-relaxed text-muted">{HINT}</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`mb-2 max-w-full ${m.role === 'user' ? 'ml-8 text-right' : 'mr-4'}`}>
                <p className={`inline-block whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-[13px] leading-relaxed ${
                  m.role === 'user' ? 'bg-brand text-on-solid' : 'bg-sheet-2 text-ink-2'}`}>
                  {m.content}
                </p>
                {m.actions?.map((a) => (
                  <ActionCard key={a.route} action={a} onOpen={openAction} />
                ))}
              </div>
            ))}
            {busy && <p className="text-xs text-faint">Thinking…</p>}
            {error && <p className="mt-1 text-xs font-medium text-fail">{error}</p>}
          </div>

          <form className="flex flex-none gap-2 border-t border-hairline-2 p-2"
            onSubmit={(e) => { e.preventDefault(); void send(draft) }}>
            <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about a calculator…" aria-label="Ask about a calculator"
              className="h-9 min-w-0 flex-1 rounded-md border border-field-line bg-field px-2.5 text-[13px] text-ink placeholder:text-faint" />
            <button type="submit" disabled={busy || !draft.trim()}
              className="h-9 flex-none rounded-md bg-brand px-3 text-[13px] font-semibold text-on-solid disabled:opacity-50">
              Send
            </button>
          </form>
        </section>
      )}
    </div>
  )
}
