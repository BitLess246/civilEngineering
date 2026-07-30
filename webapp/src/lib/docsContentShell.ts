// Documentation content — app shell and the two reference pages.
// See `docsModel.ts` for the shape; `docsContent.ts` assembles every group.
import type { DocTool } from './docsModel'

export const SHELL_TOOLS: DocTool[] = [
  {
    id: 'app-shell',
    name: 'Workbench shell — sidebar, search, report controls',
    route: '/',
    group: 'Getting around',
    summary: 'Controls that appear on every page: the tool sidebar, the ⌘K command palette, and the print/report bar.',
    sections: [
      {
        id: 'shell-nav',
        title: 'Navigation',
        body: 'The left sidebar lists every tool grouped by discipline. Group headers show how many tools they hold; long groups collapse behind a "▸ N more" toggle so the list stays scannable.',
        controls: [
          { kind: 'button', name: '▸ N more', what: 'Expands a sidebar discipline to show the tools hidden beyond the first few. Click again to collapse.' },
          { kind: 'button', name: 'Find a tool… ⌘K', what: 'Opens the command palette. Also bound to Ctrl+K (⌘K on macOS) anywhere in the app.' },
          { kind: 'button', name: 'Workbench breadcrumb', what: 'The header path (Workbench / discipline / tool) — each segment links back up.' },
        ],
      },
      {
        id: 'shell-palette',
        title: 'Command palette (⌘K)',
        body: 'A fuzzy finder over the whole tool registry. It matches the tool name, its subtitle and its discipline, so "brace", "punch" or "geo" all find something.',
        controls: [
          { kind: 'field', name: 'Search box', what: 'Type to filter. The list narrows as you type; the query resets each time the palette is opened.' },
          { kind: 'button', name: '↑ / ↓', what: 'Moves the highlighted result. The list scrolls to keep the selection visible.' },
          { kind: 'button', name: 'Enter', what: 'Opens the highlighted tool and closes the palette.' },
          { kind: 'button', name: 'Escape', what: 'Closes the palette without navigating.' },
        ],
      },
      {
        id: 'shell-report',
        title: 'Report controls',
        body: 'Most calculators carry a report bar. It prepares a clean, paginated version of the page for printing or saving as PDF — inputs, worked solution and results, without the app chrome.',
        controls: [
          { kind: 'button', name: '⎙ Export PDF', what: 'Opens the browser print dialogue with a print stylesheet applied. Choose "Save as PDF" to keep a file.' },
          { kind: 'field', name: 'Project / Sheet / Prepared by / Date', what: 'Letterhead fields printed at the head of the calculation sheet. They are presentation only and never affect a calculation.' },
        ],
        notes: [
          'Anything marked `no-print` in the UI (buttons, hints, nav) is removed from the printed sheet.',
          'Model Space force-expands every schedule row while printing, so the report contains the worked solutions that are collapsed on screen.',
        ],
      },
    ],
  },
  {
    id: 'home',
    name: 'Home',
    route: '/',
    group: 'Getting around',
    summary: 'Landing page: a searchable grid of every tool, grouped by discipline.',
    sections: [
      {
        id: 'home-grid',
        title: 'Tool grid',
        controls: [
          { kind: 'field', name: 'Find a tool', what: 'Opens the same command palette as ⌘K.' },
          { kind: 'button', name: 'Tool card', what: 'Opens that tool. Each card shows the tool name and a one-line description of what it computes.' },
        ],
      },
    ],
  },
  {
    id: 'validation',
    name: 'Validation',
    route: '/validation',
    group: 'Reference',
    summary: 'Evidence page: engine results against independent hand calculations, plus the full solver-engine test inventory.',
    basis: 'Closed-form textbook / code-clause results; vitest suite run in CI on every pull request.',
    sections: [
      {
        id: 'validation-benchmarks',
        title: 'Benchmark tables',
        body: 'Each row states a hand calculation and the number the engine produces for the same input. The engine column comes from the same modules the design pages use — not a copy.',
        controls: [
          { kind: 'output', name: 'Manual', what: 'The analytical result, computed from the formula in the Formula column.' },
          { kind: 'output', name: 'Software', what: 'The engine result for the identical input.' },
          { kind: 'output', name: 'Δ', what: 'Percent difference of Software from Manual.' },
          { kind: 'output', name: 'OK', what: 'Green tick when the difference is inside the row tolerance (typically < 0.01 %).' },
          { kind: 'output', name: 'Pass-count chips', what: 'Per-category tallies at the top, evaluated live when the page loads.' },
        ],
      },
      {
        id: 'validation-solver',
        title: 'Solver engine coverage',
        body: 'The benchmarks pin a number; this section lists the tests that assert what a single number cannot — equilibrium, agreement between independent solution paths, convergence order, behaviour at limit points.',
        controls: [
          { kind: 'button', name: 'engine/<module>.ts row', what: 'Expands to show every test case in that module, grouped under its describe block. The chip on the right is the case count.' },
          { kind: 'output', name: 'Group chips', what: 'Module and test counts for Bridge, FEM solver, Dynamics and Nonlinear.' },
        ],
        notes: [
          'The inventory is generated from the test sources, so it cannot drift: adding or renaming a solver test without regenerating fails the suite.',
          'It records which cases exist. CI running the whole suite on every pull request is what establishes that they pass — no per-test result is claimed here.',
          'An "(integration)" tag marks a file that exercises several solvers together and has no engine module of its own.',
        ],
      },
    ],
  },
  {
    id: 'documentation',
    name: 'Documentation',
    route: '/docs',
    group: 'Reference',
    summary: 'This page: every user-facing control in the app, grouped by tool.',
    sections: [
      {
        id: 'docs-usage',
        title: 'Using this page',
        controls: [
          { kind: 'field', name: 'Search', what: 'Filters tools by name, summary, section text and control labels. All words must match.' },
          { kind: 'button', name: 'Sidebar entry', what: 'Jumps to that tool. The URL carries the anchor, so a section can be linked to directly.' },
          { kind: 'button', name: 'Open tool →', what: 'Leaves the docs and opens the tool itself.' },
        ],
        notes: [
          'Control labels are reproduced exactly as they appear in the UI, so searching the docs for a label you can see on screen finds its explanation.',
          'Units follow the project convention: geometry m, section dimensions mm, forces kN, stresses MPa.',
        ],
      },
    ],
  },
  {
    id: 'account',
    name: 'Account — sign in, sign up, password reset',
    route: '/signin',
    group: 'Getting around',
    summary: 'Create an account or sign in. An account unlocks the 3D model space, the design pipeline, reports and the schedule module.',
    basis: 'Supabase email + password authentication.',
    sections: [
      {
        id: 'acct-why',
        title: 'What an account changes',
        body: 'The single-purpose calculators are free to try without one — five runs of each — and an account '
          + 'removes that counter and lets you save projects. It does not unlock a different set of calculators. '
          + 'The heavy, stateful features (3D Model Space, the frame and truss workbenches, the estimating and '
          + 'scheduling modules, the seismic wizard) need an account AND a paid plan. Documentation and the '
          + 'validation page are always open to everyone.',
        notes: [
          'Routes are gated on the session today; the per-plan feature checks are catalogued in lib/plans.ts but are not yet wired into those pages, so a signed-in free account can still reach the project-scale tools. That gap is tracked in HANDOFF.md.',
          'The guest run counter is stored in your browser, so clearing site data resets it. It exists to prompt sign-up on tools that are deliberately free to try — it is not a security boundary, and the features that require an account are gated on the session itself.',
          'If the deployment has no Supabase keys configured, sign-in is unavailable and NOTHING is gated — the app stays fully usable rather than locking behind a form that cannot work.',
        ],
      },
      {
        id: 'acct-signin',
        title: 'Sign in',
        controls: [
          { kind: 'field', name: 'Email', what: 'The address the account was created with. Checked for obvious typos before the request is sent.' },
          { kind: 'field', name: 'Password', what: 'Your password. The Show/Hide control reveals it, since typing a password blind is the usual cause of a failed sign-in.' },
          { kind: 'button', name: 'Sign in', what: 'Signs you in and returns you to the page you were trying to reach, rather than dumping you on the home page.' },
          { kind: 'button', name: 'Forgot your password?', what: 'Sends a reset link to your address.' },
          { kind: 'output', name: 'Error message', what: 'A failed sign-in always reads "Email or password is incorrect", whichever was wrong. That is deliberate: distinguishing them would let anyone test which addresses have accounts.' },
        ],
      },
      {
        id: 'acct-signup',
        title: 'Create an account',
        controls: [
          { kind: 'field', name: 'Name', what: 'Optional display name, stored with the account.' },
          { kind: 'field', name: 'Email', what: 'Where the confirmation link is sent. The account is not usable until that link is opened.' },
          { kind: 'field', name: 'Password', what: 'At least 8 characters. The strength meter is advice, not a gate — a long passphrase of one character class scores well and is accepted, because length matters more than variety.' },
          { kind: 'field', name: 'Confirm password', what: 'Must match; checked as you type rather than on submit.' },
          { kind: 'button', name: 'Create account', what: 'Registers the account and sends the confirmation email.' },
        ],
      },
      {
        id: 'acct-reset',
        title: 'Password reset',
        controls: [
          { kind: 'field', name: 'Email', what: 'The address to send the reset link to.' },
          { kind: 'button', name: 'Send reset link', what: 'Always reports success, whether or not the address has an account — otherwise the form would reveal which addresses are registered.' },
          { kind: 'field', name: 'New password', what: 'Set on the page the emailed link opens. Same 8-character minimum as sign-up.' },
        ],
      },
    ],
  },
  {
    id: 'pricing',
    name: 'Pricing — plans and what each unlocks',
    route: '/pricing',
    group: 'Getting around',
    summary: 'The four tiers, what each includes, and why paid plans are not open for sign-up yet.',
    sections: [
      {
        id: 'pricing-tiers',
        title: 'The tiers',
        body: 'Guest and Free are the same product \u2014 every single-purpose calculator \u2014 and differ only in that '
          + 'Free has an account behind it. Nobody should have to pay to finish a beam check. The paid tiers carry '
          + 'the project-scale tools. Cumulative: a dearer plan never takes anything away, which is asserted by a '
          + 'test rather than left to care when a feature is added.',
        controls: [
          { kind: 'output', name: 'Guest', what: 'No account. Five runs of each single-purpose calculator, plus unlimited access to the documentation and validation pages.' },
          { kind: 'output', name: 'Free', what: 'The same calculators with no trial counter, and up to three saved projects. No payment, no model space.' },
          { kind: 'output', name: 'Pro', what: 'The 3D Model Space up to 400 members and everything built on it \u2014 design pipeline, section optimiser, estimating and take-off, structure reports \u2014 with unlimited saved projects.' },
          { kind: 'output', name: 'Max', what: '\u20b12,999/month or \u20b132,399/year. Everything in Pro with no model-size limit, plus the nonlinear and dynamic solvers (pushover, biaxial pushover, time history) and construction scheduling.' },
        ],
      },
      {
        id: 'pricing-checkout',
        title: 'Why the paid tiers cannot be bought yet',
        body: 'Taking card payments safely needs a server to verify the payment provider\u2019s webhook. A browser '
          + 'cannot do that, because anything checked in the browser can be forged by the person paying. Rather '
          + 'than show a button that looks like it charges a card and does not, Pro and Max are listed so their '
          + 'contents are visible and marked as not open for sign-up. No card details are collected anywhere in '
          + 'this app.',
        notes: [
          'A plan is read from the account\u2019s server-side metadata and can never be granted by the browser — otherwise the paywall would be a suggestion. An unrecognised plan value falls back to the least-privileged tier.',
        ],
      },
    ],
  },
  {
    id: 'legal',
    name: 'Terms, Privacy, Refunds and Contact',
    route: '/terms',
    group: 'Getting around',
    summary: 'The public policy pages: what the service is, how your data is handled, when a payment is refunded, and how to reach a person.',
    sections: [
      {
        id: 'legal-pages',
        title: 'The four pages',
        body: 'Open to everyone, always \u2014 a customer must be able to read the terms and find a way to '
          + 'complain without an account, and a payment provider reviewing the site will not have one either.',
        controls: [
          { kind: 'output', name: 'Terms and Conditions', what: 'What the service is, what an account gets you, how subscriptions renew, and the professional-responsibility clause: the software computes, it does not practise engineering, and every result must be checked before construction use.' },
          { kind: 'output', name: 'Privacy Policy', what: 'What is collected and why, under the Data Privacy Act of 2012 (RA 10173), including your rights as a data subject and how to exercise them. Calculations run in your browser; card details never reach us.' },
          { kind: 'output', name: 'Refund Policy', what: '14 days on a first subscription payment, no reason needed; a surprise renewal refunded if unused; refunds regardless of age when a defect stops you using what you paid for.' },
          { kind: 'output', name: 'Contact', what: 'Business name, registered address, email, phone and support hours, plus what to include in a bug report or a billing question.' },
        ],
        notes: [
          'Every business detail on these pages comes from one file, `lib/siteConfig.ts`. Anything still blank is rendered as a visible red marker and listed in a banner at the top of the page \u2014 an unfinished policy says it is unfinished rather than reading as confident and wrong.',
          'The policies are drafts written for a Philippine software business. They are not legal advice and have not been reviewed by a lawyer.',
        ],
      },
    ],
  },
]
