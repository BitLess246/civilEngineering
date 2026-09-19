import { useMemo, useState } from 'react'
import { AccountMenu } from '../components/AccountMenu'
import { Link } from 'react-router-dom'
import { BRAND_MARK, BRAND_TAIL } from '../lib/brand'
import { SIDEBAR_GROUPS, ALL_TOOLS, isGatedRoute } from '../lib/tools'
import { CommandPalette } from '../components/CommandPalette'
import { usePaletteHotkey } from '../lib/usePaletteHotkey'
import { PipelineDiagram } from '../components/PipelineDiagram'
import { WorkedSolutionPreview } from '../components/WorkedSolutionPreview'
import { Storyboard, ReportComparison } from '../components/Storyboard'
import { ModelSpacePreview } from '../components/ModelSpacePreview'
import { useToolPrefs } from '../lib/useToolPrefs'
import { visibleGroups } from '../lib/toolPrefs'
import { useAuth } from '../lib/auth/authContext'

// Home — search-first tool directory on the drawing-sheet workbench theme
// (docs/design/uiux-2026-07/Redesign - Home): dark hero with drafting grid,
// ⌘K search, sample cards, and the full catalog with a sticky discipline rail.

interface Sample { to: string; tag: string; time: string; title: string; desc: string }
const SAMPLES: Sample[] = [
  { to: '/beam-design', tag: 'ACI 318-14', time: '~2 min', title: 'RC Beam — flexure & shear',
    desc: 'Size a 300×500 beam for Mu = 180 kN·m; rebar and stirrup spacing with a worked solution.' },
  { to: '/steel', tag: 'AISC 360-16', time: '~2 min', title: 'Steel Beam — LRFD',
    desc: 'Check a W-shape for §F2 flexure and §G2 shear with live utilization and a 3D section.' },
  { to: '/frame', tag: '2D FEM', time: '~3 min', title: 'Portal Frame — analysis',
    desc: 'Member forces and reactions on a 2D frame by the direct stiffness method.' },
]

const CHIPS = ['RC Beam', 'Isolated Footing', 'Steel W-shape', '3D Model Space', 'Seismic Wizard', 'Retaining Wall', 'Truss', 'Load Combos']
const chipTo: Record<string, string> = {
  'RC Beam': '/beam-design', 'Isolated Footing': '/foundation', 'Steel W-shape': '/steel',
  '3D Model Space': '/model', 'Seismic Wizard': '/seismic-wizard', 'Retaining Wall': '/retaining-wall',
  'Truss': '/truss', 'Load Combos': '/load-combinations',
}

export default function Home({ onAuth }: { onAuth: (mode: 'login' | 'signup') => void }) {
  const [palette, setPalette] = useState(false)
  usePaletteHotkey(setPalette)
  const prefs = useToolPrefs()
  const { user, loading } = useAuth()

  // The DIRECTORY is trimmed to the disciplines this browser chose; the hero
  // still advertises the whole catalog, because that count is a claim about the
  // product, not about this reader's sidebar. Numbering and anchors are derived
  // AFTER the filter, so a trimmed directory reads 01, 02, 03 rather than
  // skipping the numbers of hidden groups.
  // Single label source: SIDEBAR_GROUPS owns the names — no presentational
  // renames here, so sidebar, palette, breadcrumb and directory agree.
  const groups = useMemo(() => visibleGroups(SIDEBAR_GROUPS, prefs).map((g, i) => ({
    heading: g.label,
    anchor: `dir-${i}`,
    tools: g.tools,
  })), [prefs])
  const toolCount = ALL_TOOLS.length
  const shownCount = useMemo(() => groups.reduce((n, g) => n + g.tools.length, 0), [groups])
  const trimmed = shownCount < toolCount

  const searchBox = (big: boolean) => (
    <button type="button" onClick={() => setPalette(true)}
      className={`flex items-center gap-2.5 rounded-lg border border-white/20 bg-sheet/[.07] text-left transition-colors hover:border-rail-accent ${big ? 'w-full px-4 py-3 sm:flex-1' : 'w-full min-w-0 max-w-[340px] rounded-md px-2.5 py-1.5'}`}>
      <svg className="flex-none text-rail-muted" viewBox="0 0 24 24" width={big ? 16 : 13} height={big ? 16 : 13} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
      {/* The examples are the point of the long label — they teach what the
          palette accepts — but at 390px they wrapped it to four lines and
          pushed the row 60px tall. Below `sm` the prompt alone; the examples
          come back where there is a line to hold them. */}
      <span className={`min-w-0 flex-1 truncate text-rail-muted ${big ? 'text-sm' : 'text-xs'}`}>
        {big ? (
          <>
            <span className="sm:hidden">Search {toolCount} tools…</span>
            <span className="hidden sm:inline">Search {toolCount} tools — try “footing”, “W-shape”, “seismic”…</span>
          </>
        ) : 'Find a tool…'}
      </span>
      <span className="hidden flex-none rounded border border-white/15 px-1 py-px font-mono text-[10px] text-rail-muted sm:inline">⌘K</span>
    </button>
  )

  return (
    <div className="min-h-screen bg-paper">
      <a href="#content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-3 focus-visible:top-3 focus-visible:z-[100] focus-visible:rounded-md focus-visible:bg-brand focus-visible:px-3.5 focus-visible:py-2 focus-visible:text-[13px] focus-visible:font-semibold focus-visible:text-on-solid">
        Skip to content
      </a>
      {/* Top bar */}
      <nav className="no-print sticky top-0 z-50 border-b border-white/10 bg-rail">
        <div className="mx-auto flex h-[52px] max-w-[1200px] items-center gap-5 px-6">
          <Link to="/" className="flex min-h-[24px] items-baseline gap-2 py-1">
            <span className="text-[15px] font-extrabold tracking-[.14em] text-rail-ink">{BRAND_MARK}</span>
            <span className="text-[9px] font-semibold uppercase tracking-[.22em] text-rail-muted">{BRAND_TAIL}</span>
          </Link>
          {/* SEARCH IS THE NAV. Wordmark-left + four inline links + a control
              on the right is the most-recognised generated-nav fingerprint,
              and it was carrying four destinations while the ⌘K palette — the
              thing this product is actually navigated with — sat shrunk in the
              corner. The pill moves inline and becomes the primary object;
              Docs and Validation come out, because both are already ENTRIES IN
              THAT PALETTE (the Reference group) and both are in the footer, so
              nothing became less reachable. What stays is the one link the
              palette cannot serve — the directory anchor on this page — and
              Plans, which is a commercial destination and does not belong
              behind a search box. */}
          <div className="ml-auto flex min-w-0 items-center gap-2.5">
            <div className="hidden min-w-0 flex-1 sm:block">{searchBox(false)}</div>
            <a href="#tools" className="hidden whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-rail-muted hover:bg-sheet/5 hover:text-rail-ink md:inline-block">Tools</a>
            <Link to="/pricing" className="hidden whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-rail-muted hover:bg-sheet/5 hover:text-rail-ink md:inline-block">Plans</Link>
            <AccountMenu dark />
          </div>
        </div>
      </nav>

      {/* Home renders OUTSIDE AppShell (App.tsx), so it carries its own main
          landmark and its own skip link. Without one, axe reported every
          section of this page as content outside any landmark. */}
      <main id="content">
      {/* Hero on a drafting grid */}
      <section className="border-b border-hairline bg-rail [background-image:linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.045)_1px,transparent_1px)] [background-size:32px_32px]">
        <div className="mx-auto max-w-[1200px] px-6 pb-14 pt-16">
          <p className="font-mono text-[11px] font-medium tracking-[.2em] text-rail-accent">NSCP 2015 · ACI 318-14 · AISC 360-16</p>
          <h1 className="mt-3.5 max-w-[720px] text-4xl font-extrabold leading-[1.04] tracking-tight text-rail-ink sm:text-[52px]">The structural workbench for Philippine practice.</h1>
          <p className="mt-4 max-w-[600px] text-base leading-relaxed text-rail-muted">{toolCount} code-checked calculators, 3D analysis and quantity take-off on a typed engine — every result traced to its clause, every report ready to sign.</p>
          <div className="mt-7 flex max-w-[640px] flex-col items-stretch gap-2.5 sm:flex-row sm:items-center">
            {searchBox(true)}
            <Link to="/model" className="whitespace-nowrap rounded-lg bg-brand px-5 py-3.5 text-center text-sm font-bold text-on-solid hover:bg-brand-hover">Open workbench</Link>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <Link key={c} to={chipTo[c] ?? '#'}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-rail-muted hover:border-rail-accent hover:bg-brand-hover/35 hover:text-on-solid">{c}</Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── What the app does, in three registers ───────────────────────────
          This replaced a 5.6 MB screen recording. The video's caption was doing
          the real work — explaining the SEQUENCE — so the caption became a
          diagram, the claim it made became a real worked solution, and the
          "watch me use it" became an invitation to use it. Under 10 KB, no
          playback, and it reads on mobile data. */}
      <section className="mx-auto max-w-[1200px] px-6 pt-9">
        <h2 className="text-[19px] font-extrabold tracking-tight">Model to signed report, in one place</h2>
        <p className="mt-1.5 max-w-[760px] text-[13.5px] leading-relaxed text-muted">
          Generate the geometry, build the NSCP §208 seismic and §207B wind cases, analyse,
          design every member, then take the schedules, the quantities and the report out the
          other end.
        </p>
        <div className="mt-5">
          <PipelineDiagram />
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-6 pt-10">
        {/* Single column: a mono label sharing a row with its heading is the
            templated-editorial tell (hallmark gate 54). Caption under the
            heading, same column — it reads as the heading’s own subtitle
            rather than as a decorative tag pinned beside it. */}
        <div className="mb-3.5 flex flex-col gap-0.5">
          <h2 className="text-[19px] font-extrabold tracking-tight">Every number, defensible</h2>
          <span className="font-mono text-[11px] text-faint">one schedule row, opened</span>
        </div>
        <WorkedSolutionPreview />
      </section>

      <section className="mx-auto max-w-[1200px] px-6 pt-10">
        {/* Single column: a mono label sharing a row with its heading is the
            templated-editorial tell (hallmark gate 54). Caption under the
            heading, same column — it reads as the heading’s own subtitle
            rather than as a decorative tag pinned beside it. */}
        <div className="mb-3.5 flex flex-col gap-0.5">
          <h2 className="text-[19px] font-extrabold tracking-tight">What it looks like doing the work</h2>
          <span className="font-mono text-[11px] text-faint">real output · not mockups</span>
        </div>
        <Storyboard />
      </section>

      <section className="mx-auto max-w-[1200px] px-6 pt-10">
        {/* Single column: a mono label sharing a row with its heading is the
            templated-editorial tell (hallmark gate 54). Caption under the
            heading, same column — it reads as the heading’s own subtitle
            rather than as a decorative tag pinned beside it. */}
        <div className="mb-3.5 flex flex-col gap-0.5">
          <h2 className="text-[19px] font-extrabold tracking-tight">It resizes what failed, then re-issues</h2>
          <span className="font-mono text-[11px] text-faint">the same report, twice</span>
        </div>
        <ReportComparison />
      </section>

      {/* ── Rather than watch a demo, run one ───────────────────────────────
          The card used to ADVERTISE the walkthrough with a button; it now
          embeds the workbench itself — a scaled-down iframe of this very page
          at /model?embed=1, next to the model page's own copy. The preview
          lets exactly two things be touched — the walkthrough (the Guide
          button in its ribbon) and the 3D viewport — so the CTA that used to
          live here is gone: the section no longer asks you to go run it, it
          IS running, and going is one click on the viewport's Guide. */}
      <section className="mx-auto max-w-[1200px] px-6 pt-10">
        {/* NO OUTER CARD. `ModelSpacePreview` already draws itself as a framed
            object (rounded-lg + border-hairline), so wrapping it in a second
            card of the same border token nested one frame inside another for
            no semantic reason. One containment layer, and it is the inner one —
            the preview is the thing being framed. */}
        <div className="grid items-center gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
          <div className="min-w-[260px]">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-[19px] font-extrabold tracking-tight">3D Model Space</h2>
              <span className="rounded border border-brand-line bg-brand-tint px-1.5 py-px font-mono text-[10px] font-semibold tracking-wide text-brand">BIM-lite viewer</span>
              <span className="rounded bg-rail px-1.5 py-px font-mono text-[10px] font-bold uppercase tracking-[.14em] text-rail-ink" title="Scaled-down live preview — only the viewport and Guide respond">Preview</span>
            </div>
            {/* The model page's own copy, duplicated alongside its viewport:
                the name it draws in the corner, the directory's one-line sub,
                the guide's opening description of the tab sequence, and the
                viewport's own navigation hint. */}
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted">
              The tabs are a sequence, not a menu. Three labelled groups, worked left to right:
              MODEL builds the frame, ANALYSE solves it, RESULTS is where the design and the
              drawings are read. Each group needs the one before it — geometry, properties,
              supports, loading, analysis, design.
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-faint">
              This is the workbench itself, live and scaled down — it builds a demo frame on open
              and keeps it off the record. Grab the model to orbit it, or press Guide in the
              ribbon for the walkthrough. Everything else in the picture is scenery.
            </p>
            <p className="mt-3 font-mono text-[11px] text-faint">orbit: drag · pan: ⇧drag · zoom: scroll</p>
          </div>
          <ModelSpacePreview />
        </div>
      </section>

      {/* Sample cards — A LEAD AND TWO, NOT THREE EQUAL THIRDS.
          Three equal cards across the full width is the most-emitted feature
          rhythm there is, and it says all three samples are equally the place
          to start. They are not: the RC beam is the one most readers came for.
          It takes the wide column and carries its description; the other two
          stack beside it as a shorter list. Same three destinations, a
          hierarchy instead of a row. */}
      <section className="mx-auto max-w-[1200px] px-6 pb-2 pt-9">
        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Link to={SAMPLES[0].to}
            className="flex flex-col rounded-lg border border-hairline bg-sheet p-5 transition-[border-color,box-shadow] hover:border-brand-hover hover:shadow-[0_2px_10px_rgba(15,27,42,.07)] sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="rounded border border-brand-line bg-brand-tint px-1.5 py-px font-mono text-[10px] font-semibold tracking-wide text-brand">{SAMPLES[0].tag}</span>
              <span className="font-mono text-[10px] text-faint">{SAMPLES[0].time}</span>
            </div>
            <span className="mt-3 text-[19px] font-bold leading-tight text-ink">{SAMPLES[0].title}</span>
            <span className="mt-2 max-w-[46ch] text-[13px] leading-relaxed text-muted">{SAMPLES[0].desc}</span>
            <span className="mt-auto pt-4 text-xs font-bold text-brand">Run this example →</span>
          </Link>
          <div className="flex flex-col gap-3.5">
            {SAMPLES.slice(1).map((s) => (
              <Link key={s.to} to={s.to}
                className="flex flex-1 flex-col rounded-lg border border-hairline bg-sheet p-5 transition-[border-color,box-shadow] hover:border-brand-hover hover:shadow-[0_2px_10px_rgba(15,27,42,.07)]">
                <div className="flex items-center gap-2.5">
                  <span className="rounded border border-brand-line bg-brand-tint px-1.5 py-px font-mono text-[10px] font-semibold tracking-wide text-brand">{s.tag}</span>
                  <span className="font-mono text-[10px] text-faint">{s.time}</span>
                </div>
                <span className="mt-2.5 text-[15px] font-bold text-ink">{s.title}</span>
                <span className="mt-auto pt-3 text-xs font-bold text-brand">Run this example →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Tool directory with sticky rail */}
      <section id="tools" className="mx-auto max-w-[1200px] px-6 pb-16 pt-9">
        <div className="mb-4 flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
          <h2 className="text-[19px] font-extrabold tracking-tight">Tool directory</h2>
          <span className="font-mono text-[11px] text-faint">{shownCount} tools · {groups.length} disciplines</span>
          {/* SAY SO WHEN THE LIST IS TRIMMED. A directory quietly missing the
              geotechnical tools is indistinguishable from an app that never had
              them, and "where did they go?" is a support mail rather than a
              click. The count above is the shown count for the same reason —
              claiming 52 above a list of 21 would be the tell that something is
              wrong without saying what. */}
          {trimmed && (
            <span className="font-mono text-[11px] text-faint">
              · {toolCount - shownCount} hidden by your preferences —{' '}
              <Link to="/profile" className="text-brand underline">change</Link>
            </span>
          )}
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          {/* Mobile gets a horizontal discipline strip instead of nothing:
              search answers names, browsing answers "what exists". */}
          <div className="sticky top-[72px] flex flex-row gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {groups.map((g) => (
              <a key={g.anchor} href={`#${g.anchor}`}
                className="flex flex-none items-center justify-between gap-3 rounded-md px-2.5 py-[7px] text-[12.5px] font-semibold text-muted hover:bg-hairline-2 hover:text-ink lg:flex-auto">
                {g.heading}
                <span className="font-mono text-[10px] text-faint">{String(g.tools.length).padStart(2, '0')}</span>
              </a>
            ))}
          </div>
          <div className="flex flex-col gap-6">
            {groups.map((g) => (
              <div key={g.anchor} id={g.anchor} className="scroll-mt-16">
                {/* The 01/02/03 prefix is gone. It was POSITIONAL, not ordinal —
                    Concrete does not come "before" Steel, and the numbers moved
                    whenever a discipline was hidden by preferences. A number
                    beside a heading is also gate 54's tell. The rule stays: it
                    is a divider, not a label. */}
                <div className="mb-2.5 flex items-baseline gap-2.5">
                  <h3 className="text-[13px] font-bold uppercase tracking-wider text-ink-2">{g.heading}</h3>
                  <div className="h-px flex-1 bg-hairline" />
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {g.tools.map((t) => (
                    <Link key={t.to + t.name} to={t.to}
                      className="flex flex-col rounded-lg border border-hairline bg-sheet px-4 py-3.5 transition-colors hover:border-brand-hover">
                      <span className="flex items-center gap-2 text-[13.5px] font-bold text-ink">{t.name}
                        {isGatedRoute(t.to) && (
                          <span className="rounded border border-hairline px-1 py-px font-mono text-[9px] font-semibold uppercase tracking-wider text-muted"
                            title="Needs an account — sign in to open">Sign in</span>
                        )}
                      </span>
                      <span className="mt-0.5 font-mono text-[10.5px] text-faint">{t.sub}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-rail">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-5 px-6 py-10 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-extrabold text-rail-ink">Every calculation, code-referenced.</h2>
            <p className="mt-1 text-[13px] text-rail-muted">Clause citations on every worked step. Validated against hand calcs — <Link to="/validation" className="text-rail-accent underline underline-offset-2 decoration-rail-accent/40 hover:decoration-rail-accent">see the validation suite</Link>.</p>
          </div>
          {/* The ask depends on who is reading. A member has no account left
              to create, so the button becomes the workbench link — the same
              destination the hero offers. While the session lookup runs there
              is no button at all: offering account creation to someone who
              turns out to be signed in is the exact flash AccountMenu exists
              to prevent, and a wrong button on the marketing page is worse
              than a one-frame gap before the right one. */}
          {!loading && (user ? (
            <Link to="/model" className="whitespace-nowrap rounded-md bg-brand px-5 py-3 text-[13px] font-bold text-on-solid hover:bg-brand-hover">Open the workbench</Link>
          ) : (
            <button onClick={() => onAuth('signup')}
              className="whitespace-nowrap rounded-md bg-brand px-5 py-3 text-[13px] font-bold text-on-solid hover:bg-brand-hover">Create free account</button>
          ))}
        </div>
      </section>

      </main>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  )
}
