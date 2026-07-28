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
]
