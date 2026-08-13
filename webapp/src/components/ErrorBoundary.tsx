// ─────────────────────────────────────────────────────────────────────────
// The last line of defence. View layer.
//
// There was no error boundary anywhere in this app. React 19 unmounts the
// ENTIRE tree on an uncaught render error, and the tree here is
// `StrictMode > BrowserRouter > AuthProvider > App`, so one bad component blanked
// the whole page — sidebar, header, and every route the user might have
// navigated to in order to escape. A white screen with no way out.
//
// WHERE IT SITS MATTERS. Inside `AppShell`, wrapping the routed content only.
// Above the shell it would take the navigation down with the page, which is the
// failure it exists to prevent; below it, per-page, would need fifty copies.
// The fallback keeps the sidebar, so the next click is always available.
//
// IT RESETS ON NAVIGATION. `AppShell` keys it on the location, so moving to
// another page rebuilds the boundary and clears the error. Without that, one
// throw would leave the content area permanently broken even after the user
// navigated somewhere healthy.
//
// It deliberately does NOT report anywhere. There is no error-tracking service
// in this project, and inventing a network call here — in the one component
// that runs when things are already broken — would be the wrong place to add
// one. `console.error` keeps the stack in the place a developer looks.
// ─────────────────────────────────────────────────────────────────────────

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The component stack is the useful half and React does not put it in the
    // Error, so log both.
    console.error('render failed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <main className="mx-auto max-w-2xl px-5 py-16 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
          This page stopped
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Something broke while drawing this page</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
          Your saved work is not affected — everything is stored separately from
          the screen that failed. Try the page again, or go somewhere else and
          come back.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => this.setState({ error: null })}
            className="rounded-md bg-[#0056b3] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0f4c92]">
            Try again
          </button>
          <Link to="/"
            className="rounded-md border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:border-[#0056b3] hover:text-[#0056b3]">
            Go to the tools
          </Link>
        </div>

        {/* The message, not the stack. A stack trace in the UI reads as a crash
            report the user is expected to act on; the stack is in the console
            for whoever can use it. */}
        <p className="mt-6 break-words text-[12px] text-slate-400">{error.message}</p>
      </main>
    )
  }
}
