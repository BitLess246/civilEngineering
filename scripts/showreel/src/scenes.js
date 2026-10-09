// ── Zeta — showreel. 120 BPM, 30 bars, 60 s. Bars are 2 s, beats 0.5 s. ──
const D = JSON.parse($('#data').textContent)
const ROOT = $('#stage')
const SCENES = []
function scene(a, b, build) {
  const root = h('div', { class: 'layer' }, ROOT)
  const s = { a, b, root, ...build(root) }
  SCENES.push(s); return s
}
const tpl = (id) => { const t = $('#' + id); const d = document.createElement('div'); d.innerHTML = t.innerHTML.trim(); return d.firstElementChild }
function darkGround(root) { h('div', { class: 'ground-dark' }, root); return h('div', { class: 'grid' }, root) }
function paperGround(root) { h('div', { class: 'ground-paper' }, root); return h('div', { class: 'grid-paper' }, root) }
const LOGO = (id) => `<svg id="${id}" viewBox="0 0 64 64" width="64" height="64">
  <rect class="lg-rect" x="1" y="1" width="62" height="62" rx="12" fill="#0f2a4a" stroke="rgba(107,164,220,.35)" stroke-width=".5"/>
  <g stroke="#f2f5f9" stroke-width="4" stroke-linecap="round" fill="none">
    <line class="lg-beam" x1="14" y1="22" x2="50" y2="22"/><line class="lg-c1" x1="18" y1="22" x2="18" y2="50"/><line class="lg-c2" x1="46" y1="22" x2="46" y2="50"/></g>
  <line class="lg-gnd" x1="10" y1="50" x2="54" y2="50" stroke="#7fb3e8" stroke-width="3" stroke-linecap="round"/>
  <circle class="lg-node" cx="32" cy="22" r="3.5" fill="#f2b53a"/></svg>`
function setLine(el, p, L) { el.style.strokeDasharray = `${L} ${L}`; el.style.strokeDashoffset = L * (1 - p) }

// ════════════════════════════════════════════════════════════════════════
// A · OPEN (0–4) and B · TITLE (4–8) share the logo
// ════════════════════════════════════════════════════════════════════════
const A = scene(0, 6, (root) => {
  const grid = darkGround(root)
  const sv = h('svg', { width: W, height: H, class: 'abs', style: { left: 0, top: 0 } }, root)
  const hx = h('line', { x1: 0, y1: H / 2, x2: W, y2: H / 2, stroke: 'rgba(232,234,237,.55)', 'stroke-width': 1 }, sv)
  const vx = h('line', { x1: W / 2, y1: 0, x2: W / 2, y2: H, stroke: 'rgba(232,234,237,.55)', 'stroke-width': 1 }, sv)
  const ticks = h('g', {}, sv)
  for (let i = -12; i <= 12; i++) if (i) {
    h('line', { x1: W / 2 + i * 80, y1: H / 2 - (i % 4 ? 5 : 11), x2: W / 2 + i * 80, y2: H / 2 + (i % 4 ? 5 : 11), stroke: 'rgba(232,234,237,.5)', 'stroke-width': 1, 'data-i': i }, ticks)
  }
  const coord = h('div', { class: 'abs mono', style: { left: W / 2 + 18 + 'px', top: H / 2 + 14 + 'px', fontSize: '13px', color: '#9eb0c5' } }, root)
  const coord2 = h('div', { class: 'abs mono', style: { left: W / 2 + 18 + 'px', top: H / 2 - 32 + 'px', fontSize: '13px', color: '#6ba4dc' } }, root)
  const logoBox = h('div', { class: 'abs', style: { left: '0px', top: '0px', width: '400px', height: '400px' } }, root, LOGO('lgA'))
  const lg = $('#lgA', logoBox); lg.setAttribute('width', 400); lg.setAttribute('height', 400)
  const ring = h('div', { class: 'abs', style: { left: W / 2 - 300 + 'px', top: H / 2 - 300 + 'px', width: '600px', height: '600px', borderRadius: '50%', border: '1.5px solid rgba(242,181,58,.9)' } }, root)
  const ring2 = h('div', { class: 'abs', style: { left: W / 2 - 300 + 'px', top: H / 2 - 300 + 'px', width: '600px', height: '600px', borderRadius: '50%', border: '1px solid rgba(232,234,237,.6)' } }, root)
  // wordmark + codes
  const word = h('div', { class: 'abs disp', style: { left: '0px', top: '0px', fontSize: '210px', fontWeight: 900, letterSpacing: '.04em', color: '#f2f5f9', whiteSpace: 'nowrap', overflow: 'hidden', height: '200px', lineHeight: '200px' } }, root)
  const letters = [...'ZETA'].map((c) => h('span', { style: { display: 'inline-block' } }, word, c))
  const codes = h('div', { class: 'abs mono', style: { fontSize: '20px', color: '#9eb0c5', whiteSpace: 'pre', letterSpacing: '.22em' } }, root)
  const rule = h('div', { class: 'abs', style: { height: '1px', background: 'rgba(158,176,197,.5)' } }, root)
  return { grid, hx, vx, ticks, coord, coord2, logoBox, lg, ring, ring2, word, letters, codes, rule }
})
A.update = (t) => {
  const s = A
  // crosshair: grows from the centre on the downbeat
  const g = ease(t, 0, 0.9), gv = ease(t, 0.12, 1.0)
  s.hx.setAttribute('x1', W / 2 - g * W / 2); s.hx.setAttribute('x2', W / 2 + g * W / 2)
  s.vx.setAttribute('y1', H / 2 - gv * H / 2); s.vx.setAttribute('y2', H / 2 + gv * H / 2)
  const collapse = ease(t, 1.9, 2.25, E.inOutCubic)
  op(s.hx, 1 - collapse); op(s.vx, 1 - collapse)
  for (const tk of s.ticks.children) {
    const i = +tk.getAttribute('data-i'); const at = 0.35 + Math.abs(i) * 0.035
    op(tk, ease(t, at, at + 0.25) * (1 - collapse))
  }
  op(s.grid, ease(t, 0.25, 1.6, E.outCubic) * 0.9)
  tf(s.grid, `scale(${lerp(1.08, 1, ease(t, 0, 4, E.outCubic))})`)
  s.coord.textContent = t < 2.1 ? scramble('GRID A–1 · EL ±0.000', seg(t, 0.55, 1.35), 3) : ''
  s.coord2.textContent = t < 2.1 ? scramble('X 0.000  Z 0.000', seg(t, 0.9, 1.6), 9) : ''
  op(s.coord, 1 - collapse); op(s.coord2, 1 - collapse)

  // the logo, built stroke by stroke: beam, columns, ground, plate, node
  const lb = s.lg
  const beam = ease(t, 2.0, 2.45), c1 = spring(t - 2.4, 2.2, 0.45), c2 = spring(t - 2.52, 2.2, 0.45), gnd = ease(t, 2.95, 3.35)
  setLine($('.lg-beam', lb), beam, 36); setLine($('.lg-c1', lb), clamp(c1, 0, 1.08), 28); setLine($('.lg-c2', lb), clamp(c2, 0, 1.08), 28)
  setLine($('.lg-gnd', lb), gnd, 44)
  const rp = ease(t, 3.45, 3.95, (x) => E.outBack(x, 1.4))
  const rect = $('.lg-rect', lb); rect.style.transformOrigin = '32px 32px'; rect.style.transform = `scale(${rp})`; op(rect, rp > 0 ? 1 : 0)
  const nodeIn = t >= 4.0
  const node = $('.lg-node', lb); node.style.transformOrigin = '32px 22px'
  node.style.transform = `scale(${nodeIn ? 1 + 1.6 * Math.exp(-(t - 4) * 9) : (t > 3.6 ? 0.25 : 0)})`
  lb.style.filter = nodeIn ? '' : ''
  node.style.filter = `drop-shadow(0 0 ${nodeIn ? 3 + 6 * Math.exp(-(t - 4) * 3) : 1}px rgba(242,181,58,${nodeIn ? 0.95 : 0.6}))`

  // the lockup: impact at 4.0, logo steps left at 4.25, wordmark rises
  const imp = t >= 4 ? 1 + 0.18 * Math.exp(-(t - 4) * 10) * Math.cos((t - 4) * 30) : 1
  const slide = ease(t, 4.22, 4.75)
  const size = lerp(400, 230, slide)
  const cx = W / 2 + lerp(0, -385, slide), cy = H / 2 + lerp(0, -40, slide)
  const pre = t < 4 ? lerp(0.86, 1, ease(t, 2, 4, E.outCubic)) : imp
  css(s.logoBox, { left: cx - size / 2 + 'px', top: cy - size / 2 + 'px', width: size + 'px', height: size + 'px' })
  s.lg.setAttribute('width', size); s.lg.setAttribute('height', size)
  tf(s.logoBox, `scale(${pre})`)
  // shockwaves
  const r1 = seg(t, 4.0, 4.9), r2 = seg(t, 4.08, 5.3)
  tf(s.ring, `scale(${0.05 + E.outExpo(r1) * 1.6})`); op(s.ring, t >= 4 ? (1 - r1) * 0.9 : 0)
  tf(s.ring2, `scale(${0.05 + E.outExpo(r2) * 2.4})`); op(s.ring2, t >= 4.08 ? (1 - r2) * 0.5 : 0)
  // wordmark
  css(s.word, { left: cx + 150 + 'px', top: cy - 102 + 'px' })
  s.letters.forEach((l, i) => {
    const p = ease(t, 4.32 + i * 0.05, 4.9 + i * 0.05)
    tf(l, `translateY(${(1 - p) * 210}px)`)
  })
  s.word.style.letterSpacing = lerp(0.18, 0.04, ease(t, 4.3, 5.2)) + 'em'
  css(s.codes, { left: cx + 158 + 'px', top: cy + 128 + 'px' })
  s.codes.textContent = scramble('NSCP 2015  ·  ACI 318-14  ·  AISC 360-16', seg(t, 5.0, 5.9), 21)
  css(s.rule, { left: cx + 158 + 'px', top: cy + 112 + 'px', width: 760 * ease(t, 4.85, 5.45) + 'px' })
  // pre-cut anticipation, then everything leaves on the downbeat
  const ant = ease(t, 5.6, 6.0, E.inCubic)
  tf(s.root.firstChild, '')
  s.root.style.transform = `scale(${1 + 0.035 * ease(t, 4.0, 6.0, E.outCubic) - 0.02 * ant})`
}

// ════════════════════════════════════════════════════════════════════════
// B · HEADLINE (6–8): the real tagline, one beat a line
// ════════════════════════════════════════════════════════════════════════
const HB = scene(6, 8.3, (root) => {
  darkGround(root)
  const box = h('div', { class: 'abs', style: { left: '170px', top: '0px' } }, root)
  const lines = ['The structural', 'workbench for', 'Philippine', 'practice'].map((txt, i) =>
    h('div', { class: 'disp', style: { fontSize: '168px', color: i === 1 ? '#6ba4dc' : '#f2f5f9', whiteSpace: 'nowrap', height: '160px', lineHeight: '150px', overflow: 'hidden', paddingBottom: '40px', marginBottom: '-40px', boxSizing: 'content-box' } }, box,
      `<span style="display:inline-block">${txt}</span>`))
  const dot = h('div', { class: 'abs', style: { width: '30px', height: '30px', borderRadius: '50%', background: '#f2b53a' } }, root)
  const tag = h('div', { class: 'abs mono', style: { left: '176px', top: '0px', fontSize: '15px', color: '#9eb0c5' } }, root)
  return { box, lines, dot, tag }
})
HB.update = (t) => {
  const s = HB
  const at = [5.9, 6.5, 7.0, 7.5]
  const shown = at.filter((a) => t >= a).length
  // the block re-centres on what is shown — a spring per new line
  let y = 0
  for (let i = 0; i < at.length; i++) {
    const p = spring(t - at[i], 2.6, 0.55)
    y += clamp(p, 0, 1.2) * 160
  }
  const top = H / 2 - y / 2
  const exit = ease(t, 7.85, 8.15, E.inExpo)
  css(s.box, { top: top + 'px' })
  tf(s.box, `translateX(${-exit * 1400}px) skewX(${exit * -8}deg)`)
  s.box.style.filter = `blur(${exit * 14}px)`
  s.lines.forEach((l, i) => {
    const p = ease(t, at[i], at[i] + 0.42)
    const sp = l.firstChild
    tf(sp, `translateY(${(1 - p) * 170}px)`)
    op(l, t >= at[i] ? 1 : 0)
    l.style.filter = `blur(${(1 - ease(t, at[i], at[i] + 0.25)) * 10}px)`
  })
  // the full stop is the signal: amber, and it carries into the next scene
  const sp3 = s.lines[3].firstChild
  const dx = 170 + sp3.offsetWidth + 10, dy = top + 3 * 160 + 106
  const go = ease(t, 7.82, 8.25, E.inOutCubic)
  const fx = lerp(dx, W / 2 - 15, go), fy = lerp(dy, H / 2 + 260 - 15, go)
  css(s.dot, { left: fx + 'px', top: fy + 'px' })
  const dp = spring(t - 7.62, 3, 0.4)
  tf(s.dot, `scale(${t < 7.62 ? 0 : dp * (1 - 0.6 * go)})`)
  s.dot.style.boxShadow = `0 0 ${18 + 30 * Math.exp(-(t - 7.62) * 3)}px rgba(242,181,58,.75), 0 0 80px rgba(242,181,58,.25)`
  s.tag.textContent = scramble('NSCP 2015 · ACI 318-14 · AISC 360-16 — 108 CODE-CHECKED CALCULATORS', seg(t, 6.1, 7.4), 5)
  css(s.tag, { top: top - 46 + 'px' }); op(s.tag, 1 - exit)
}
