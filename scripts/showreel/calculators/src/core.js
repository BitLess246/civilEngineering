// ── motion core ──────────────────────────────────────────────────────────
const W = 1920, H = 1080
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lerp = (a, b, t) => a + (b - a) * t
const seg = (t, a, b) => clamp((t - a) / (b - a))
const E = {
  lin: (t) => t,
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
}
/** Damped spring from 0 to 1, `t` seconds after release. */
const spring = (t, f = 2.4, z = 0.38) => {
  if (t <= 0) return 0
  const w = 2 * Math.PI * f, wd = w * Math.sqrt(1 - z * z)
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t))
}
/** Eased 0→1 between a and b. */
const ease = (t, a, b, fn = E.outExpo) => fn(seg(t, a, b))
const B = (bar, beat = 0) => (bar - 1) * 2 + beat * 0.5
let FRAME = 0
const hash = (a, b) => { let x = (a * 374761393 + b * 668265263) | 0; x = (x ^ (x >>> 13)) * 1274126177; return ((x ^ (x >>> 16)) >>> 0) / 4294967295 }

const $ = (sel, root = document) => root.querySelector(sel)
function h(tag, attrs = {}, parent = null, html = null) {
  const svgTags = ['svg', 'g', 'line', 'path', 'circle', 'rect', 'polyline', 'polygon', 'text', 'defs', 'radialGradient', 'linearGradient', 'stop', 'clipPath', 'mask', 'tspan', 'ellipse']
  const el = svgTags.includes(tag) ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
    else if (k === 'text') el.textContent = v
    else el.setAttribute(k, v)
  }
  if (html != null) el.innerHTML = html
  if (parent) parent.appendChild(el)
  return el
}
const css = (el, o) => { for (const k in o) el.style[k] = o[k]; return el }
const tf = (el, s) => { el.style.transform = s }
const op = (el, v) => { el.style.opacity = v; el.style.visibility = v <= 0.001 ? 'hidden' : 'visible' }
const show = (el, on) => { el.style.display = on ? '' : 'none' }

const TYPE_CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·§/—+−=×'
/** Characters resolve left to right; the unresolved ones flicker (deterministic). */
function scramble(str, p, seed = 1) {
  const n = str.length, k = p * (n + 6)
  let out = ''
  for (let i = 0; i < n; i++) {
    const c = str[i]
    if (i < k - 6 || c === ' ') out += c
    else if (i < k) out += TYPE_CH[Math.floor(hash(FRAME * 3 + seed, i) * TYPE_CH.length)]
    else out += ' '
  }
  return out
}
const typed = (str, p) => str.slice(0, Math.round(clamp(p) * str.length))
const fmt = (x, d = 0) => x.toFixed(d)

// ── SVG draw-on: every geometry element strokes in, ordered by position ─
function prepDraw(svg, order = 'xy') {
  const vb = svg.viewBox.baseVal
  const items = []
  for (const e of svg.querySelectorAll('path,line,polyline,polygon,rect,circle,ellipse')) {
    if (e.closest('defs') || e.closest('marker')) continue
    let L = 0, bb = { x: 0, y: 0, width: 0, height: 0 }
    try { L = e.getTotalLength() } catch {}
    try { bb = e.getBBox() } catch {}
    const cs = getComputedStyle(e)
    const dashed = (e.getAttribute('stroke-dasharray') || cs.strokeDasharray) && (cs.strokeDasharray !== 'none')
    const stroked = cs.stroke && cs.stroke !== 'none'
    const nx = (bb.x + bb.width / 2 - vb.x) / (vb.width || 1), ny = (bb.y + bb.height / 2 - vb.y) / (vb.height || 1)
    const k = order === 'xy' ? 0.62 * nx + 0.38 * ny : order === 'x' ? nx : order === 'y' ? ny : order === 'r' ? Math.hypot(nx - 0.5, ny - 0.5) / 0.71 : 0.5
    items.push({ e, L, k: clamp(k), stroked: stroked && !dashed && L > 0 })
    if (stroked && !dashed && L > 0) { e.style.strokeDasharray = `${L} ${L}` }
  }
  const texts = [...svg.querySelectorAll('text')].map((e) => {
    let bb = { x: 0, y: 0, width: 0, height: 0 }; try { bb = e.getBBox() } catch {}
    const nx = (bb.x - vb.x) / (vb.width || 1), ny = (bb.y - vb.y) / (vb.height || 1)
    return { e, k: clamp(order === 'xy' ? 0.62 * nx + 0.38 * ny : order === 'x' ? nx : order === 'y' ? ny : 0.5) }
  })
  return { items, texts }
}
/** p 0→1 sweeps the drawing on; `span` is how much of the sweep each element takes. */
function drawAt(d, p, span = 0.28) {
  for (const it of d.items) {
    const s = E.outCubic(clamp((p - it.k * (1 - span)) / span))
    if (it.stroked) { it.e.style.strokeDashoffset = it.L * (1 - s); it.e.style.fillOpacity = s }
    else it.e.style.opacity = s
  }
  for (const t of d.texts) t.e.style.opacity = E.outCubic(clamp((p - t.k * (1 - span) - span * 0.5) / (span * 0.6)))
}

// jet ramp position of an rgb fill — the band each FE element sits in
const JET = [[0, 0, 143], [0, 0, 255], [0, 128, 255], [0, 255, 255], [128, 255, 128], [255, 255, 0], [255, 128, 0], [255, 0, 0], [128, 0, 0]]
function jetT(fill) {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(fill || '')
  if (!m) return -1
  const c = [+m[1], +m[2], +m[3]]
  if (c[0] === 214 && c[1] === 51) return 1.05
  let best = 0, bd = 1e9
  for (let i = 0; i < 64; i++) {
    const t = i / 63, x = t * 8, k = Math.min(7, Math.floor(x)), f = x - k
    const r = JET[k].map((v, j) => v + (JET[k + 1][j] - v) * f)
    const d = (r[0] - c[0]) ** 2 + (r[1] - c[1]) ** 2 + (r[2] - c[2]) ** 2
    if (d < bd) { bd = d; best = t }
  }
  return best
}

// ── image sequences, cross-faded between frames ───────────────────────────
function seqEl(parent, names, w, hgt, cls = '') {
  const box = h('div', { class: 'abs ' + cls, style: { width: w + 'px', height: hgt + 'px' } }, parent)
  const imgs = names.map((n) => h('img', { src: 'assets/' + n, class: 'seq', style: { width: w + 'px', height: hgt + 'px' } }, box))
  return { box, imgs, set(f) {
    const n = imgs.length, x = clamp(f, 0, n - 1), i = Math.floor(x), a = x - i
    imgs.forEach((im, k) => {
      if (k === i) { im.style.display = 'block'; im.style.opacity = 1 }
      else if (k === i + 1 && a > 0.01) { im.style.display = 'block'; im.style.opacity = a }
      else im.style.display = 'none'
    })
  } }
}
