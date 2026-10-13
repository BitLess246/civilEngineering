// Bundle-size budget (PERF-05). Run after `vite build`; fails when a tracked
// asset grows past its gzip budget, and names the asset that did.
//
// Tracked separately, because one total would hide the thing that matters:
//   initial   — what every visitor downloads before first paint (entry JS + CSS
//               linked from dist/index.html)
//   route     — the lazily-loaded chunks a heavy route pulls (Model Space, the
//               solver worker)
//   anyChunk  — a ceiling on every other chunk, so a new dependency dragged
//               into one lazy route still shows up
//
// Budgets are ~15 % over the October 2026 baseline (initial JS 172 kB, CSS
// 15 kB, ModelSpace 205 kB, solverWorker 120 kB, largest chunk 281 kB, all
// gzip). Raising one is a deliberate edit to this file, reviewed like code.
import { readFileSync, readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

const KB = 1024
const BUDGET = {
  initialJs: 200 * KB,
  initialCss: 25 * KB,
  route: { ModelSpace: 240 * KB, solverWorker: 140 * KB },
  anyChunk: 330 * KB,
}

const dist = new URL('../dist/', import.meta.url).pathname
const assets = join(dist, 'assets')
const gz = (f) => gzipSync(readFileSync(join(assets, f))).length
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const initial = [...new Set([...html.matchAll(/assets\/([^"']+\.(?:js|css))/g)].map((m) => m[1]))]
const files = readdirSync(assets).filter((f) => /\.(js|css)$/.test(f))

const rows = []
const check = (label, size, limit) => rows.push({ label, size, limit, ok: size <= limit })

const initJs = initial.filter((f) => f.endsWith('.js')).reduce((s, f) => s + gz(f), 0)
const initCss = initial.filter((f) => f.endsWith('.css')).reduce((s, f) => s + gz(f), 0)
check('initial JS', initJs, BUDGET.initialJs)
check('initial CSS', initCss, BUDGET.initialCss)
for (const [name, limit] of Object.entries(BUDGET.route)) {
  const f = files.find((x) => x.startsWith(`${name}-`) && x.endsWith('.js'))
  if (!f) { rows.push({ label: `${name} (missing)`, size: 0, limit, ok: false }); continue }
  check(`route ${f}`, gz(f), limit)
}
const tracked = new Set(initial)
for (const f of files) if (!tracked.has(f)) {
  const s = gz(f)
  if (s > BUDGET.anyChunk) check(`chunk ${f}`, s, BUDGET.anyChunk)
}
const largest = files.filter((f) => !tracked.has(f)).map((f) => [f, gz(f)]).sort((a, b) => b[1] - a[1])[0]
if (largest) rows.push({ label: `largest lazy chunk ${largest[0]}`, size: largest[1], limit: BUDGET.anyChunk, ok: largest[1] <= BUDGET.anyChunk })

const fmt = (n) => `${(n / KB).toFixed(1)} kB`
for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'OVER'}  ${r.label.padEnd(52)} ${fmt(r.size).padStart(10)} / ${fmt(r.limit)}`)
const over = rows.filter((r) => !r.ok)
if (over.length) {
  console.error(`\nBundle budget exceeded by ${over.length} asset(s): ${over.map((r) => r.label).join(', ')}`)
  process.exit(1)
}
