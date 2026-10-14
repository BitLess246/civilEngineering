import { open, clean } from '../lib.mjs'
const { b, p } = await open({ dpr: 1, w: 1600, h: 900 })
const ev = []
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') ev.push(`${m.type()}: ${m.text().slice(0, 300)}`) })
p.on('pageerror', (e) => ev.push('PAGEERROR ' + e.message.slice(0, 400)))
p.on('crash', () => ev.push('CRASH'))
p.on('framenavigated', (f) => { if (f === p.mainFrame()) ev.push('NAV ' + f.url()) })
const tab = (n) => p.getByRole('button', { name: n, exact: true }).first()
const click = async (re, wait = 800) => { await p.getByRole('button', { name: re }).first().click(); await p.waitForTimeout(wait) }
const idle = async () => { await p.waitForTimeout(800); await p.waitForFunction(() => !/⏳/.test(document.body.innerText), null, { timeout: 600000, polling: 1000 }); await p.waitForTimeout(1500) }
const setField = async (re, v) => { const el = p.getByLabel(re).first(); await el.fill(v); await el.press('Tab') }
await p.goto('http://localhost:5192/model', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(7000)
const storeys = process.argv[2] ?? '3.5, 3, 3, 3, 3, 3'
await tab('Geometry').click(); await p.waitForTimeout(600)
await setField(/Bays X/i, '6, 6, 6'); await setField(/Bays Z/i, '6, 6'); await setField(/Storey heights/i, storeys)
await click(/Regenerate grid model/, 4000)
await tab('Design').click(); await p.waitForTimeout(700); await click(/Design structure/, 1500); await idle()
console.log('designed; events so far', ev.length); ev.length = 0
await tab('Display').click(); await p.waitForTimeout(800)
const t0 = Date.now()
await p.getByLabel(/Show reinforcement cages/).check({ timeout: 120000 }).catch((e) => console.log('check err', e.message.split('\n')[0]))
await p.waitForTimeout(8000)
console.log('after cages', ((Date.now() - t0) / 1000).toFixed(1), 's; mem', await p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) + ' MB' : '?').catch(() => 'n/a'))
console.log(ev.join('\n'))
await p.screenshot({ path: 'cap/tour/probe/cages_' + storeys.split(',').length + '.png' }).catch(() => {})
await b.close()
