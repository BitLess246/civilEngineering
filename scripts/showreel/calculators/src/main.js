// ── persistent overlays: HUD, flash, vignette, grain ──────────────────────
const HUD = (() => {
  const root = h('div', { class: 'layer', style: { pointerEvents: 'none' } }, ROOT)
  const sv = h('svg', { width: W, height: H, class: 'abs', style: { left: 0, top: 0 } }, root)
  const I = 44, L = 22
  const marks = [[I, I, 1, 1], [W - I, I, -1, 1], [I, H - I, 1, -1], [W - I, H - I, -1, -1]].map(([x, y, sx, sy]) =>
    h('path', { d: `M${x + sx * L},${y} L${x},${y} L${x},${y + sy * L}`, fill: 'none', 'stroke-width': 1.5, stroke: 'currentColor' }, sv))
  const tl = h('div', { class: 'abs mono', style: { left: I + 34 + 'px', top: I - 7 + 'px', fontSize: '15px', display: 'flex', gap: '14px', alignItems: 'center', whiteSpace: 'nowrap' } }, root)
  const word = h('span', { style: { fontFamily: 'Archivo', fontWeight: 900, letterSpacing: '.14em', fontSize: '15px' } }, tl, 'ZETA')
  const sep = h('span', { style: { opacity: .45 } }, tl, '/')
  const secN = h('span', { style: { color: 'var(--hudAccent)' } }, tl)
  const secT = h('span', {}, tl)
  const tr = h('div', { class: 'abs mono', style: { right: I + 34 + 'px', top: I - 7 + 'px', fontSize: '15px', whiteSpace: 'nowrap' } }, root)
  const bl = h('div', { class: 'abs mono', style: { left: I + 34 + 'px', bottom: I - 9 + 'px', fontSize: '13px', opacity: .7, whiteSpace: 'nowrap' } }, root, 'NSCP 2015 · ACI 318-14 · AISC 360-16')
  const br = h('div', { class: 'abs mono', style: { right: I + 34 + 'px', bottom: I - 9 + 'px', fontSize: '13px', whiteSpace: 'nowrap' } }, root, 'ZETASTRUCT.APP')
  const bar = h('div', { class: 'abs', style: { left: '420px', right: '420px', bottom: I - 2 + 'px', height: '1px', background: 'currentColor', opacity: .22 } }, root)
  const fill = h('div', { class: 'abs', style: { left: '420px', bottom: I - 2 + 'px', height: '1px', background: 'var(--hudAccent)' } }, root)
  const flash = h('div', { class: 'layer', style: { background: '#fff', opacity: 0 } }, ROOT)
  const vig = h('div', { class: 'vignette' }, ROOT)
  const grain = h('div', { class: 'grain' }, ROOT)
  return { root, marks, tl, secN, secT, tr, bl, br, bar, fill, flash, vig, grain }
})()
const SECTIONS = [
  [8, 14, '01', 'CONCRETE'], [14, 18, '02', 'STEEL'], [18, 24, '03', 'GEOTECHNICAL'], [26, 32, '04', 'WATER'],
  [32, 38, '05', 'ROADS · SURVEY · ECONOMY'], [38, 44, '06', 'THE WORK, SHOWN'], [44, 50, '07', 'EVERY CHECK'], [50, 54, '08', '108 TOOLS'],
]
const LIGHT = [[8, 13.9], [18, 24], [26, 38], [38, 44]]
const FLASHES = [[4.0, 0.22], [26.0, 0.3], [56.0, 0.3], [8.0, 0.06], [14.0, 0.08], [20.0, 0.1], [32.0, 0.06], [44.0, 0.1], [50.0, 0.06]]
function hud(t) {
  const on = t >= 4.2 && t < 54.6 && !(t >= 24 && t < 26)
  const inP = ease(t, 4.25, 4.9), outP = ease(t, 54.2, 54.6, E.inCubic)
  op(HUD.root, on ? inP * (1 - outP) : 0)
  const light = LIGHT.some(([a, b]) => t >= a && t < b)
  HUD.root.style.color = light ? '#0f1b2a' : '#e8eaed'
  HUD.root.style.setProperty('--hudAccent', light ? '#0f4c92' : '#f2b53a')
  HUD.marks.forEach((m, i) => { const p = ease(t, 4.25 + i * 0.06, 4.8 + i * 0.06); m.style.opacity = p })
  const sec = SECTIONS.find(([a, b]) => t >= a && t < b)
  if (sec) {
    const p = seg(t, sec[0], sec[0] + 0.45)
    HUD.secN.textContent = sec[2]
    HUD.secT.textContent = scramble(sec[3], p, +sec[2])
  } else { HUD.secN.textContent = ''; HUD.secT.textContent = '' }
  const fr = Math.floor(t * 30) % 30, ss = Math.floor(t) % 60
  HUD.tr.textContent = `TC 00:00:${String(ss).padStart(2, '0')}:${String(fr).padStart(2, '0')}`
  HUD.fill.style.width = (W - 840) * clamp(t / 60) + 'px'
  // flashes on the impacts
  let f = 0
  for (const [at, a] of FLASHES) if (t >= at) f = Math.max(f, a * Math.exp(-(t - at) * 9))
  HUD.flash.style.opacity = f
  // grain: a fresh tile and offset every frame
  HUD.grain.style.backgroundImage = `url(assets/grain_${FRAME % 6}.png)`
  HUD.grain.style.transform = `translate(${Math.floor(hash(FRAME, 1) * 64) - 32}px, ${Math.floor(hash(FRAME, 2) * 64) - 32}px)`
  HUD.vig.style.opacity = light ? 0.35 : 1
}
const SHAKES = [[4.0, 14], [26.0, 12], [56.0, 16], [20.0, 6], [2.0, 7], [14.0, 4], [44.0, 6], [36.0, 4]]
window.render = (t) => {
  FRAME = Math.round(t * 60)
  let sx = 0, sy = 0, rz = 0
  for (const [at, a] of SHAKES) if (t >= at && t < at + 0.6) {
    const d = a * Math.exp(-(t - at) * 11)
    sx += d * Math.sin((t - at) * 71); sy += d * Math.cos((t - at) * 53); rz += d * 0.018 * Math.sin((t - at) * 61)
  }
  for (const s of SCENES) s.root.style.translate = `${sx}px ${sy}px`
  for (const s of SCENES) s.root.style.rotate = `${rz}deg`
  for (const s of SCENES) {
    const on = t >= s.a && t < s.b
    show(s.root, on)
    if (on && s.update) s.update(t)
  }
  hud(t)
}
window.READY = true
