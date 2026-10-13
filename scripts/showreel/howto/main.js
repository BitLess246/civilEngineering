// ── HUD, flash, grain, render loop for the vertical how-to reels ─────────
const HUD = (() => {
  const root = h('div', { class: 'layer', style: { pointerEvents: 'none' } }, ROOT)
  const sv = h('svg', { width: W, height: H, class: 'abs', style: { left: 0, top: 0 } }, root)
  const I = 44, L = 26
  const marks = [[I, I, 1, 1], [W - I, I, -1, 1], [I, H - I, 1, -1], [W - I, H - I, -1, -1]].map(([x, y, sx, sy]) =>
    h('path', { d: `M${x + sx * L},${y} L${x},${y} L${x},${y + sy * L}`, fill: 'none', 'stroke-width': 1.5, stroke: 'currentColor' }, sv))
  const tl = h('div', { class: 'abs mono', style: { left: I + 40 + 'px', top: I + 40 + 'px', fontSize: '20px', display: 'flex', gap: '16px', alignItems: 'center', whiteSpace: 'nowrap' } }, root)
  h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px' } }, tl, LOGO('hud').replace('width="64" height="64"', 'width="28" height="28"') + WORD_SVG(14, 'currentColor'))
  h('span', { style: { opacity: .45 } }, tl, '/')
  const secT = h('span', {}, tl)
  const dots = h('div', { class: 'abs', style: { right: I + 40 + 'px', top: I + 46 + 'px', display: 'flex', gap: '10px' } }, root)
  const dot = [0, 1, 2, 3, 4].map(() => h('span', { style: { width: '34px', height: '6px', borderRadius: '3px', background: 'currentColor', opacity: .25 } }, dots))
  const br = h('div', { class: 'abs mono', style: { left: 0, width: W + 'px', textAlign: 'center', bottom: I + 30 + 'px', fontSize: '20px', textTransform: 'none', letterSpacing: '.1em' } }, root, 'zetastruct.app' + CFG.route)
  const flash = h('div', { class: 'layer', style: { background: '#fff', opacity: 0 } }, ROOT)
  const vig = h('div', { class: 'vignette' }, ROOT)
  const grain = h('div', { class: 'grain' }, ROOT)
  return { root, marks, tl, secT, dot, br, flash, vig, grain }
})()
// [from, to, label] — dark plates are the hook, export, features and end
const PLATES = [[2, 4, 'WHERE'], [4, 8, 'STEP 1 · INPUTS'], [8, 12, 'STEP 2 · DRAWING'], [12, 16, 'STEP 3 · CHECKS'], [16, 20, 'STEP 4 · SOLUTION'], [20, 24, 'STEP 5 · REPORT'], [24, 26, 'FEATURES']]
const DARK = [[0, 2], [20, 30]]
const FLASHES = [[0.0, 0.18], [4.0, 0.1], [8.0, 0.08], [12.0, 0.08], [16.0, 0.08], [20.0, 0.14], [26.0, 0.2], [28.0, 0.22]]
const SHAKES = [[0.0, 10], [4.0, 6], [12.5, 3], [13.5, 3], [14.5, 3], [15.5, 3], [20.5, 7], [26.0, 10], [28.0, 12]]
function hud(t) {
  const on = t >= 2.0 && t < 26.0
  op(HUD.root, on ? ease(t, 2.0, 2.3) * (1 - ease(t, 25.7, 26.0)) : 0)
  const dark = DARK.some(([a, b]) => t >= a && t < b)
  HUD.root.style.color = dark ? '#e8eaed' : INK
  const pl = PLATES.find(([a, b]) => t >= a && t < b)
  HUD.secT.textContent = pl ? scramble(pl[2], seg(t, pl[0], pl[0] + 0.4), pl[0]) : ''
  const step = t < 4 ? -1 : Math.min(4, Math.floor((t - 4) / 4))
  HUD.dot.forEach((d, i) => { d.style.opacity = i < step ? 0.6 : i === step ? 1 : 0.22; d.style.background = i === step ? (dark ? AMBER : BRANDC) : 'currentColor' })
  let f = 0
  for (const [at, a] of FLASHES) if (t >= at) f = Math.max(f, a * Math.exp(-(t - at) * 9))
  HUD.flash.style.opacity = f
  HUD.grain.style.backgroundImage = `url(../calculators/assets/grain_${FRAME % 6}.png)`
  HUD.grain.style.transform = `translate(${Math.floor(hash(FRAME, 1) * 64) - 32}px, ${Math.floor(hash(FRAME, 2) * 64) - 32}px)`
  HUD.vig.style.opacity = dark ? 1 : 0.35
}
window.render = (t) => {
  FRAME = Math.round(t * 60)
  let sx = 0, sy = 0
  for (const [at, a] of SHAKES) if (t >= at && t < at + 0.5) {
    const d = a * Math.exp(-(t - at) * 12)
    sx += d * Math.sin((t - at) * 71); sy += d * Math.cos((t - at) * 53)
  }
  for (const s of SCENES) {
    const on = t >= s.a && t < s.b
    show(s.root, on)
    s.root.style.translate = `${sx}px ${sy}px`
    if (on && s.update) s.update(t)
  }
  hud(t)
}
window.READY = true
