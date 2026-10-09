// ── Zeta — calculators reel. 120 BPM, 30 bars, 60 s. Bars 2 s, beats 0.5 s ──
const D = JSON.parse($('#data').textContent)
const C = D.calc
const ROOT = $('#stage')
const SCENES = []
function scene(a, b, build) {
  const root = h('div', { class: 'layer' }, ROOT)
  const s = { a, b, root, ...build(root) }
  SCENES.push(s); return s
}
function darkGround(root) { h('div', { class: 'ground-dark' }, root); return h('div', { class: 'grid' }, root) }
function paperGround(root) { h('div', { class: 'ground-paper' }, root); return h('div', { class: 'grid-paper' }, root) }
const LOGO = (id) => `<svg id="${id}" viewBox="0 0 64 64" width="64" height="64">
  <rect class="lg-rect" x="1" y="1" width="62" height="62" rx="12" fill="#0f2a4a" stroke="rgba(107,164,220,.35)" stroke-width=".5"/>
  <g stroke="#f2f5f9" stroke-width="4" stroke-linecap="round" fill="none">
    <line class="lg-beam" x1="14" y1="22" x2="50" y2="22"/><line class="lg-c1" x1="18" y1="22" x2="18" y2="50"/><line class="lg-c2" x1="46" y1="22" x2="46" y2="50"/></g>
  <line class="lg-gnd" x1="10" y1="50" x2="54" y2="50" stroke="#7fb3e8" stroke-width="3" stroke-linecap="round"/>
  <circle class="lg-node" cx="32" cy="22" r="3.5" fill="#f2b53a"/></svg>`
function setLine(el, p, L) { el.style.strokeDasharray = `${L} ${L}`; el.style.strokeDashoffset = L * (1 - p) }

// ── camera: keyframes [t, x, y, s, rot?], each leg eased (hold, then snap) ─
function camAt(t, keys) {
  if (t <= keys[0][0]) return [t, keys[0][1], keys[0][2], keys[0][3], 0]
  for (let i = 1; i < keys.length; i++) {
    const [t1] = keys[i]
    if (t <= t1) {
      const a = keys[i - 1], b = keys[i]
      const fn = typeof b[4] === 'function' ? b[4] : (b[5] || E.inOutCubic), p = fn(seg(t, a[0], t1))
      const ra = typeof a[4] === 'number' ? a[4] : 0, rb = typeof b[4] === 'number' ? b[4] : 0
      return [t, lerp(a[1], b[1], p), lerp(a[2], b[2], p), lerp(a[3], b[3], p), lerp(ra, rb, p)]
    }
  }
  const z = keys[keys.length - 1]; return [t, z[1], z[2], z[3], typeof z[4] === 'number' ? z[4] : 0]
}
/** World point (x, y) at scale s centred on screen. */
function cam(el, t, keys) {
  const [, x, y, s, r] = camAt(t, keys)
  el.style.transformOrigin = '0 0'
  el.style.transform = `translate(${W / 2}px, ${H / 2}px) rotate(${r || 0}deg) scale(${s}) translate(${-x}px, ${-y}px)`
}

// ── numbers count up, keeping each token's own decimals and separators ───
function countUp(str, p) {
  if (p >= 1 || /[⌀@→]| in /.test(str)) return str
  return str.replace(/\d[\d,]*(\.\d+)?/g, (m) => {
    const dec = (m.split('.')[1] || '').length, v = parseFloat(m.replace(/,/g, '')) * p
    const s = v.toFixed(dec)
    return m.includes(',') ? Number(s).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : s
  })
}

// ── app components, rebuilt from the captures ─────────────────────────────
function field(parent, f, x, y, w = 170) {
  const el = h('div', { class: 'fld abs' + (f.sel ? ' sel' : ''), style: { left: x + 'px', top: y + 'px', width: w + 'px' } }, parent)
  h('div', { class: 'lb' }, el, f.label)
  const bx = h('div', { class: 'bx' }, el)
  const v = h('div', { class: 'v' }, bx)
  const caret = h('span', { style: { display: 'inline-block', width: '1.5px', height: '15px', background: '#0f4c92', marginLeft: '1px' } })
  if (f.unit) h('div', { class: 'u' }, bx, f.unit)
  return { el, bx, v, caret, f, set(p, focus = false) {
    v.textContent = typed(String(f.value ?? ''), p)
    if (focus) v.appendChild(caret)
    bx.style.borderColor = focus ? '#0f4c92' : '#8d8b85'
    bx.style.boxShadow = focus ? '0 0 0 3px rgba(15,76,146,.14)' : 'none'
  } }
}
function rcard(parent, c, x, y, w = 300) {
  const el = h('div', { class: 'rc' + (x == null ? '' : ' abs'), style: x == null ? { width: w + 'px', position: 'relative' } : { left: x + 'px', top: y + 'px', width: w + 'px' } }, parent)
  const top = h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' } }, el)
  const tl = h('div', { style: { minWidth: 0 } }, top)
  h('h3', {}, tl, c.title); h('div', { class: 'sb' }, tl, c.sub)
  const chip = h('span', { class: 'chp' }, top, c.chip || 'RESULT')
  if (/FAIL/.test(c.chip || '')) css(chip, { background: '#fbeeea', borderColor: '#f0cfc7', color: '#c2402a' })
  else if (!/PASS|OK|CLOSES|ADEQUATE|ACCEPT|LOS|PROFIT/.test(c.chip || '')) css(chip, { background: '#e6eef7', borderColor: '#c9d7e8', color: '#0f4c92' })
  let big = null, bar = null, pct = null
  if (c.value) { big = h('div', { class: 'big' }, el); }
  if (c.formula) h('div', { class: 'fm' }, el, c.formula)
  if (c.req) {
    const rq = h('div', { class: 'rq' }, el); h('span', {}, rq, c.req[0]); pct = h('b', {}, rq, c.req[1])
    bar = h('div', {}, h('div', { class: 'tr' }, el))
    if (c.col && !/20, 96, 58/.test(c.col)) { pct.style.color = c.col; bar.style.background = c.col }
  }
  if (c.dl && c.dl.length) { const dl = h('dl', {}, el); for (const [a, b] of c.dl.slice(0, 2)) { const d = h('div', { style: { minWidth: 0 } }, dl); h('dt', {}, d, a); h('dd', {}, d, b) } }
  return { el, chip, big, bar, pct, c, set(p, stamp) {
    if (big) big.innerHTML = countUp(c.value, E.outCubic(clamp(p * 1.25))) + (c.unit ? `<span>${c.unit}</span>` : '')
    if (bar) { bar.style.width = (c.pct ?? 0) * E.outExpo(clamp(p * 1.1 - 0.1)) + '%'; pct.textContent = countUp(c.req[1], E.outCubic(clamp(p * 1.2))) }
    const sp = stamp == null ? 1 : stamp
    chip.style.transform = `scale(${sp <= 0 ? 0 : 1 + 0.9 * (1 - clamp(spring(sp, 3.2, 0.45), 0, 1.2))})`
    chip.style.opacity = sp <= 0 ? 0 : 1
  } }
}
function card(parent, x, y, w, hh, extra = {}) {
  return h('div', { class: 'abs sheetc', style: { left: x + 'px', top: y + 'px', width: w + 'px', height: hh == null ? 'auto' : hh + 'px', ...extra } }, parent)
}
/** A drawing-sheet SVG, cloned from its template and scaled to width w. */
function drawing(parent, id, x, y, w, order = 'xy', crop = null) {
  const t = $('#' + id); const d = document.createElement('div'); d.innerHTML = t.innerHTML.trim()
  const svg = d.firstElementChild
  if (crop) { svg.setAttribute('viewBox', crop.join(' ')); svg.setAttribute('width', crop[2]); svg.setAttribute('height', crop[3]) }
  const vb = svg.viewBox.baseVal, ww = +svg.getAttribute('width'), hh = +svg.getAttribute('height')
  const s = w / ww
  svg.setAttribute('width', w); svg.setAttribute('height', hh * s)
  const box = h('div', { class: 'abs', style: { left: x + 'px', top: y + 'px', width: w + 'px', height: hh * s + 'px' } }, parent)
  box.appendChild(svg)
  let dr = null
  return { box, svg, w, h: hh * s, vb, prep() { if (!dr) dr = prepDraw(svg, order); return dr }, draw(p, span = 0.3) { drawAt(this.prep(), p, span) } }
}
/** A worked-solution equation: KaTeX atoms assemble left to right. */
function eqBox(parent, html, x, y, fs = 19) {
  const el = h('div', { class: 'abs eqb', style: { left: x + 'px', top: y + 'px', fontSize: fs + 'px' } }, parent, `<span class="katex">${html}</span>`)
  const atoms = []
  for (const b of el.querySelectorAll('.base')) for (const a of b.children) if (!a.classList.contains('strut')) atoms.push(a)
  atoms.forEach((a) => { if (getComputedStyle(a).display === 'inline') a.style.display = 'inline-block' })
  return { el, atoms, fit(maxW) { const w = el.offsetWidth; if (w > maxW) el.style.fontSize = fs * maxW / w + 'px'; return this }, set(p, spread = 0.75) {
    const n = atoms.length
    el.style.opacity = clamp(p * 5); el.style.clipPath = `inset(0 ${100 - 100 * E.outExpo(clamp(p * 1.6))}% 0 0 round 9px)`
    atoms.forEach((a, i) => {
      const k = E.outExpo(clamp((p - (i / Math.max(1, n)) * spread) / (1 - spread + 0.0001)))
      a.style.opacity = k; a.style.transform = `translateY(${(1 - k) * 0.7}em)`; a.style.filter = k < 1 ? `blur(${(1 - k) * 4}px)` : ''
    })
  } }
}
/** Section title in the app's input column ("SLOPE GEOMETRY ———"). */
function secTitle(parent, txt, x, y, w) { return h('div', { class: 'abs secT', style: { left: x + 'px', top: y + 'px', width: w + 'px' } }, parent, txt) }
/** A calculator workspace: inputs left, drawing centre, checks right. */
function workspace(parent, key, ox, oy, o = {}) {
  const c = C[key]
  const root = h('div', { class: 'abs ws', style: { left: ox + 'px', top: oy + 'px', width: '1920px', height: '1080px' } }, parent)
  const title = h('div', { class: 'abs', style: { left: '120px', top: '96px', fontSize: '40px', fontWeight: 800, letterSpacing: '-.02em', color: '#0f1b2a', whiteSpace: 'nowrap' } }, root, o.title || c.title)
  const sub = h('div', { class: 'abs mono', style: { left: '124px', top: '154px', fontSize: '12px', color: '#0f4c92' } }, root, o.sub || '')
  const left = card(root, 120, 200, 400, null, { padding: '22px 24px 24px' })
  const fl = (o.fields || c.fields.slice(0, o.nf || 10))
  const fs = [], secs = []
  let yy = 0, last = null
  fl.forEach((f, i) => {
    if (f.sec !== last) { secs.push({ el: secTitle(left, f.sec, 24, 22 + yy, 352), i }); yy += 30; last = f.sec }
    const col = o.twoCol ? i % 2 : 0
    const ff = field(left, f, 24 + (o.twoCol ? col * 182 : 0), 22 + yy, o.twoCol ? 170 : 352)
    fs.push(ff)
    if (!o.twoCol || col === 1 || i === fl.length - 1 || fl[i + 1]?.sec !== f.sec) yy += 62
  })
  left.style.height = yy + 40 + 'px'
  const sheet = card(root, 560, 200, 840, o.sheetH || 640)
  const dr = (o.draw || [c.draw[0].id]).map((id, k) => {
    const meta = Object.values(C).flatMap((x) => x.draw).find((d) => d.id === id)
    const dw = o.dw ? o.dw[k] : Math.min(780, meta.w * Math.min(1.25, 600 / meta.h))
    const g = drawing(sheet, id, o.dx ? o.dx[k] : (840 - dw) / 2, o.dy ? o.dy[k] : 30, dw, o.order || 'xy')
    return g
  })
  const rail = h('div', { class: 'abs', style: { left: '1440px', top: '200px', width: '360px', display: 'flex', flexDirection: 'column', gap: '14px' } }, root)
  const cards = (o.cards || c.cards.slice(0, o.nc || 3)).map((cc) => rcard(rail, cc, null, null, 360))
  return { root, title, sub, left, fs, secs, sheet, dr, cards, rail, c }
}
/** A titled sheet with one drawing — the unit most plates are built from. */
function panel(parent, id, x, y, w, title, sub, o = {}) {
  const meta = Object.values(C).flatMap((c) => c.draw).find((d) => d.id === id)
  const dh = meta.h * w / meta.w
  const head = title ? 78 : 24
  const cd = card(parent, x, y, w + 48, dh + head + 24, { overflow: 'hidden', boxShadow: o.shadow || '0 24px 70px -30px rgba(15,27,42,.4)' })
  if (title) {
    h('div', { class: 'abs', style: { left: '24px', top: '20px', fontSize: '20px', fontWeight: 800, color: '#0f1b2a', whiteSpace: 'nowrap' } }, cd, title)
    h('div', { class: 'abs mono', style: { left: '24px', top: '50px', fontSize: '10.5px', color: '#0f4c92', whiteSpace: 'nowrap' } }, cd, sub || '')
  }
  const d = drawing(cd, id, 24, head, w, o.order || 'xy')
  return { cd, d, w: w + 48, h: dh + head + 24 }
}
/** Spring a panel in from (dx, dy), stroke its drawing on. */
function playPanel(p, t, a, o = {}) {
  const sp = spring(t - a, o.f ?? 2.2, o.z ?? 0.55)
  const k = 1 - clamp(sp, 0, 1.1)
  tf(p.cd, `translate(${k * (o.dx ?? 0)}px, ${k * (o.dy ?? 160)}px) scale(${1 - k * (o.ds ?? 0.06)}) rotate(${k * (o.dr ?? 0)}deg)`)
  op(p.cd, t >= a ? 1 : 0)
  p.d.draw(ease(t, a + (o.d0 ?? 0.0), a + (o.d1 ?? 0.75), E.outCubic), o.span ?? 0.3)
}
const DRAW = (id) => Object.values(C).flatMap((c) => c.draw).find((d) => d.id === id)
/** Interpolate object keyframes [[t, {props}, ease?], ...] — hold, then snap. */
function kf(t, keys) {
  if (t <= keys[0][0]) return { ...keys[0][1] }
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
    const a = keys[i - 1], b = keys[i], p = (b[2] || E.inOutExpo)(seg(t, a[0], b[0]))
    const o = {}; for (const k in b[1]) o[k] = lerp(a[1][k] ?? b[1][k], b[1][k], p); return o
  }
  return { ...keys[keys.length - 1][1] }
}
/** Place a card in depth; further back is darker (light falls off). */
function place3(el, st) {
  el.style.transform = `translate3d(${st.x}px, ${st.y}px, ${st.z || 0}px) rotateY(${st.ry || 0}deg) rotateX(${st.rx || 0}deg) rotateZ(${st.rz || 0}deg) scale(${st.s ?? 1})`
  el.style.opacity = st.o ?? 1; el.style.visibility = (st.o ?? 1) <= 0.001 ? 'hidden' : 'visible'
  const dim = clamp(-(st.z || 0) / 1400, 0, 0.6)
  el.style.filter = dim > 0.01 ? `brightness(${1 - dim})` : ''
}
