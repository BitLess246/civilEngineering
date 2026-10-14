// Which analysis option breaks the statics check? One fresh frame per option set.
import { open } from '../lib.mjs'
const sets = JSON.parse(process.argv[2] || '[[]]')
const { b, p } = await open({ dpr: 1, w: 1600, h: 900 })
p.setDefaultTimeout(180000)
const tab = (n) => p.getByRole('button', { name: n, exact: true }).first()
const btn = (re) => p.getByRole('button', { name: re }).first()
const lab = (re) => p.locator('label', { hasText: re }).first()
const idle = async () => { await p.waitForTimeout(600); await p.waitForFunction(() => !/⏳/.test(document.body.innerText), null, { timeout: 900000, polling: 800 }); await p.waitForTimeout(1200) }
await p.goto('http://localhost:5192/model', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(7000)
await tab('Geometry').click(); await p.waitForTimeout(500)
for (const [re, v] of [[/Bays X/i, '5, 5, 5'], [/Bays Z/i, '5, 5'], [/Storey heights/i, '3.5, 3, 3, 3']]) { const el = p.getByLabel(re).first(); await el.fill(v); await el.press('Tab') }
await btn(/Regenerate grid model/).click(); await p.waitForTimeout(4000)
await tab('Loading').click(); await p.waitForTimeout(800)
if (process.env.EW) { await btn(/Generate E cases$/).click(); await p.waitForTimeout(2500); await btn(/Generate W cases/).click(); await p.waitForTimeout(2500) }
await tab('Analysis').click(); await p.waitForTimeout(800)
const OPTS = { pd: /P-Δ second-order analysis/, rd: /Rigid floor diaphragm/, rz: /Auto rigid end zones/ }
let on = new Set()
for (const set of sets) {
  for (const k of Object.keys(OPTS)) { const want = set.includes(k); if (want !== on.has(k)) { await lab(OPTS[k]).click(); await p.waitForTimeout(400); want ? on.add(k) : on.delete(k) } }
  await btn(/Analyze \(3D FEM\)/).click(); await idle()
  const r = await p.evaluate(() => { const m = document.body.innerText.match(/Equilibrium[^\n]*\n?[^\n]*/); const t = [...document.querySelectorAll('table')].find((t) => /ΣApplied/.test(t.innerText)); return (m ? m[0] : 'no-flag') + ' | ' + (t ? t.innerText.replace(/\s+/g, ' ').slice(0, 220) : '') })
  console.log(JSON.stringify(set), '→', r)
}
await b.close()
