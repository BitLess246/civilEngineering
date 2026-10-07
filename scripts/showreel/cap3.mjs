import { open, clean } from './lib.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
const OUT = 'cap/s'; mkdirSync(OUT, { recursive: true })
const { b, p } = await open({ dpr: 2 })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const step = async (name, fn) => { const t = Date.now(); try { await fn(); log('OK', name, ((Date.now() - t) / 1000).toFixed(0) + 's') } catch (e) { log('FAIL', name, e.message.split('\n')[0]) } }
await p.goto((process.env.APP || 'http://localhost:5192') + '/model', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(3000)
for (let k = 0; k < 20 && !(await p.evaluate(() => !!sessionStorage.getItem('model-space-autosave'))); k++) {
  if (k === 5) await p.getByRole('button', { name: /Regenerate grid model/i }).first().click().catch(() => {})
  await p.waitForTimeout(700)
}
await p.evaluate((HEAVY) => {
  const m = JSON.parse(sessionStorage.getItem('model-space-autosave'))
  const role = new Map(m.members.map((x) => [x.section, x.role]))
  m.sections = m.sections.map((s) => ({ ...s, material: 'steel', steelFy: 345, steelFu: 448, shape: role.get(s.id) === 'column' ? 'W310x79' : role.get(s.id) === 'girder' ? 'W360x51' : 'W310x38.7' }))
  // a secondary beam framing into the first girder's web at mid-span
  const g = m.members.find((x) => x.role === 'girder')
  const ni = m.nodes.find((n) => n.id === g.i), nj = m.nodes.find((n) => n.id === g.j)
  const mid = { id: 'gmid', x: (ni.x + nj.x) / 2, y: ni.y, z: (ni.z + nj.z) / 2 }
  const dz = Math.abs(nj.x - ni.x) > Math.abs(nj.z - ni.z)
  const far = { id: 'gfar', x: mid.x + (dz ? 0 : 3), y: ni.y, z: mid.z + (dz ? 3 : 0) }
  m.nodes.push(mid, far)
  m.members = m.members.filter((x) => x.id !== g.id)
  m.members.push({ ...g, id: g.id + 'a', j: 'gmid' }, { ...g, id: g.id + 'b', i: 'gmid' })
  const bs = m.sections.find((s) => role.get(s.id) === 'beam')
  m.members.push({ id: 'sbx', i: 'gmid', j: 'gfar', role: 'beam', section: bs.id })
  m.supports.push({ node: 'gfar', fixity: 'pin' })
  m.loads = m.loads.flatMap((l) => l.member === g.id ? [{ ...l, member: g.id + 'a' }, { ...l, member: g.id + 'b' }] : [l])
  m.loads.push({ kind: 'member-point', member: 'sbx', t: 0.5, P: 40, cat: 'D' })
  // an HSS diagonal: from the support under one end of a first-storey beam to its other end
  const ys = [...new Set(m.nodes.map((n) => n.y))].sort((a, b) => a - b)
  const bm = m.members.find((x) => x.role === 'beam' && m.nodes.find((n) => n.id === x.i).y === ys[1])
  const bi = m.nodes.find((n) => n.id === bm.i), bj = m.nodes.find((n) => n.id === bm.j)
  const base = m.nodes.find((n) => n.y === ys[0] && Math.abs(n.x - bi.x) < 1e-6 && Math.abs(n.z - bi.z) < 1e-6)
  m.sections.push({ id: 'BRS', name: 'HSS127x127x6.4', material: 'steel', steelFy: 345, steelFu: 427, shape: 'HSS127x127x6.4', b: 127, h: 127, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 })
  m.members.push({ id: 'BR1', i: base.id, j: bj.id, role: 'brace', section: 'BRS' })
  console.log('INPUT KEYS brace ' + base.id + ' -> ' + bj.id + ' along ' + bm.id)
  if (HEAVY) m.loads = m.loads.map((l) => ({ ...l, ...(l.q != null ? { q: l.q * 5 } : {}), ...(l.w != null ? { w: l.w * 5 } : {}), ...(l.P != null ? { P: l.P * 5 } : {}) }))
  sessionStorage.setItem('model-space-autosave', JSON.stringify(m))
  const inp = JSON.parse(sessionStorage.getItem('model-space-inputs') ?? '{}'); inp.material = 'steel'
  console.log('INPUT KEYS ' + Object.keys(inp).join(',') + ' LOADKINDS ' + [...new Set(m.loads.map((l) => l.kind + ':' + Object.keys(l).join('/')))].join(' '))
  if (HEAVY) { for (const k of Object.keys(inp)) if (/^q[DL]$|^qd$|^ql$|SDL|LL/i.test(k) && typeof inp[k] === 'number') inp[k] *= 5 }
  sessionStorage.setItem('model-space-inputs', JSON.stringify(inp))
}, true)

await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(5000); await clean(p)
const idle = async (t = 1200000) => { await p.waitForTimeout(800); await p.waitForFunction(() => !/⏳/.test(document.body.innerText), null, { timeout: t, polling: 1000 }); await p.waitForTimeout(1500) }
await step('design', async () => {
  await p.getByRole('button', { name: /^Design$/ }).first().click(); await p.waitForTimeout(1200)
  await p.getByRole('button', { name: /Design structure/ }).first().click(); await idle()
  await clean(p)
  await p.screenshot({ path: `${OUT}/full_design.png` })
  const c = await p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
  await p.screenshot({ path: `${OUT}/canvas_steel.png`, clip: c })
})
const grab = async (heading, rowText, name) => {
  const h = p.locator('h3', { hasText: heading }).first()
  await h.scrollIntoViewIfNeeded()
  const rows = h.locator('xpath=following::tbody[1]/tr')
  const n = await rows.count(); let target = rows.first()
  if (rowText) for (let i = 0; i < n; i++) { const t = await rows.nth(i).innerText(); if (rowText.test(t.replace(/\s+/g, ' '))) { target = rows.nth(i); break } }
  log(name, 'row:', (await target.innerText()).replace(/\s+/g, ' ').slice(0, 160))
  await target.click(); await p.waitForTimeout(4000)
  const svgs = await p.evaluate(() => [...document.querySelectorAll('td[colspan] svg')].filter((s) => s.getBoundingClientRect().width > 150).map((s) => ({ aria: s.getAttribute('aria-label'), w: s.getBoundingClientRect().width, svg: s.outerHTML })))
  log(name, 'svgs', svgs.length, svgs.map((s) => (s.aria ?? '') + ':' + s.svg.length).join(' '))
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(svgs))
  const sched = await p.evaluate((hd) => { const h = [...document.querySelectorAll('h3')].find((x) => x.textContent.includes(hd)); const t = h?.parentElement.querySelector('table'); return t ? { head: [...t.querySelectorAll('thead th')].map((x) => x.innerText.trim()), rows: [...t.querySelectorAll('tbody > tr')].filter((r) => r.children.length >= 3).slice(0, 20).map((r) => [...r.children].map((c) => c.innerText.trim().replace(/\s+/g, ' '))) } : null }, heading)
  writeFileSync(`${OUT}/${name}_table.json`, JSON.stringify(sched))
  await target.click(); await p.waitForTimeout(800)
}
await step('conn', () => grab('Steel connection schedule', /moment|shear/i, 'conn'))
await step('brace', () => grab('Steel brace schedule', null, 'brace'))
await step('base', () => grab('Base-plate schedule', null, 'base'))
await b.close()
