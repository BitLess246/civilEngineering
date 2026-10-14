# The continuous tour: replay cap/tour2/tape.json as ONE unbroken screen
# recording. Every interaction gets real time — the cursor glides to the box of
# the button that was actually clicked, presses, the page changes under it —
# and the plan is resolved here, per video frame, so tour2.js only paints it.
#   SCRIPT=script2.json AUD=audio2 python3 vo.py && python3 build2.py
import json, os, glob, math
R = os.path.dirname(os.path.abspath(__file__))
SR = os.path.join(R, '..')
CAP = f'{SR}/cap/tour2'
FPS = 30
script = json.load(open(f'{R}/script2.json'))
vo = json.load(open(f'{R}/audio2/vo.json'))
tape = json.load(open(f'{CAP}/tape.json'))
W, H = 1600, 900                                # the captured viewport, css px
FULL = (0.0, 0.0, 1600.0)
LEAD, TAIL = 0.35, 0.9
MOVE, PRESS, SWAP, FADE, DWELL = 0.75, 0.12, 0.18, 0.2, 0.75
KEY, SCROLL, ORBIT, HOLD, BUSY = 0.085, 0.11, 0.13, 1.4, 1.5

def ctr(b): return (b['x'] + b['w'] / 2, b['y'] + b['h'] / 2)
def view_on(b, w):
    """A camera [x, y, w] centred on box b, w css px wide, kept inside the frame."""
    cx, cy = ctr(b); hh = w * 9 / 16
    return (min(max(cx - w / 2, 0), W - w), min(max(cy - hh / 2, 0), H - hh), w)

# ── walk the tape on one clock ──
shows, cur, clicks, calls, focus, busy, drags, chap = [], [], [], [], [], [], [], {}
t, pos = 0.0, (W * 0.55, H * 0.5)
def show(f, at, fade=0.0): shows.append((round(at, 3), f, fade))
def glide(to, a, b): cur.append(('g', a, b, pos, to))
def label_of(s, nxt):
    if nxt and nxt['kind'] == 'type': return f"Type › {s['label']}"
    return f"Click › {s['label']}"
steps = tape
for i, s in enumerate(steps):
    c = s['chapter']
    if c not in chap:
        if chap:                                 # close the previous chapter: stretch it to its line
            p = list(chap)[-1]; need = LEAD + vo[p] + TAIL + (3.2 if p == 'c10' else 0)
            t = max(t, chap[p][0] + need); chap[p][1] = t
        chap[c] = [t, None]
    nxt = steps[i + 1] if i + 1 < len(steps) else None
    k, fr = s['kind'], s['frames']
    if k == 'start':
        show(fr[0]['f'], t); t += 0.6
    elif k in ('click', 'hover'):
        to = ctr(s['box']); a = t; b = t + MOVE
        glide(to, a, b); pos = to
        tc = b + PRESS
        lab = label_of(s, nxt) if k == 'click' else f"Hover › {s['label']}"
        span_end = tc + 0.9 if not (nxt and nxt['kind'] == 'type') else None
        calls.append([a + 0.25, span_end, lab, s['box']])
        focus.append((a, tc + 0.5, view_on(s['box'], 1180)))
        if k == 'hover':
            show(fr[0]['f'], b, FADE); t = b + 1.4; calls[-1][1] = t; continue
        clicks.append((tc, to))
        t = tc + SWAP
        for j, f in enumerate(fr):
            if f.get('busy'):
                show(f['f'], t, FADE); busy.append((t, t + BUSY)); t += BUSY
            else:
                show(f['f'], t, FADE if j == 0 else 0.35); t += DWELL
        if not fr: t = tc + 0.15
    elif k == 'type':
        show(fr[0]['f'], t); t += 0.25
        for f in fr[1:]: t += KEY; show(f['f'], t)
        t += 0.4
        calls[-1][1] = t                          # the click before it owns the callout
        focus.append((t - 0.4 - KEY * len(fr), t, view_on(s['box'], 1180)))
    elif k == 'scroll':
        for f in fr: show(f['f'], t); t += SCROLL
        t += 0.2
    elif k == 'drag':
        p0 = fr[0]['pos']; first = (p0['x'] + 9, p0['y'])
        glide(first, t, t + 0.6); pos = first; t += 0.6
        calls.append([t - 0.3, None, 'Drag › orbit the model', {'x': first[0] - 1, 'y': first[1] - 1, 'w': 2, 'h': 2}])
        d0 = t
        for f in fr:
            to = (f['pos']['x'], f['pos']['y']); glide(to, t, t + ORBIT); pos = to
            show(f['f'], t + ORBIT * 0.5); t += ORBIT
        calls[-1][1] = t + 0.3; drags.append((d0, t)); t += 0.5
    elif k == 'hold':
        show(fr[0]['f'], t, FADE)
        m = s.get('marks') or {}
        bx = m.get('chip') or m.get('heading')
        if bx: focus.append((t + 0.2, t + HOLD + 1.2, view_on(bx, 1000)))
        t += HOLD
p = list(chap)[-1]; t = max(t, chap[p][0] + LEAD + vo[p] + TAIL); chap[p][1] = t
REC = t

# ── the frame plan ──
names = sorted({f for _, f, _ in shows})
idx = {f: i for i, f in enumerate(names)}
shows.sort(key=lambda x: x[0])
n = int(math.ceil(REC * FPS))
def frame_at(tt):
    a = b = None; kk = 1.0
    for at, f, fade in shows:
        if at > tt: break
        if fade > 0 and tt < at + fade: b, kk = a, (tt - at) / fade
        else: b = None
        a = f
    return a, b, kk
ease = lambda u: 4 * u ** 3 if u < 0.5 else 1 - (-2 * u + 2) ** 3 / 2
def cursor_at(tt):
    q = cur[0][3]
    for kind, a, b, p0, p1 in cur:
        if tt < a: break
        u = 1.0 if b <= a else min(1.0, (tt - a) / (b - a))
        e = u if b - a < 0.3 else ease(u)
        q = (p0[0] + (p1[0] - p0[0]) * e, p0[1] + (p1[1] - p0[1]) * e)
    return q
# camera: the latest active focus, else full frame — then zero-phase smoothing
tgt = []
for k in range(n):
    tt = k / FPS; v = FULL
    for a, b, vv in focus:
        if a <= tt <= b: v = vv
    tgt.append(v)
def smooth(xs, tau):
    al = 1 - math.exp(-1 / (tau * FPS)); out = list(xs)
    for _ in range(2):
        for r in (range(1, len(out)), range(len(out) - 2, -1, -1)):
            for k in r:
                j = k - 1 if r.step == 1 else k + 1
                out[k] = out[j] + al * (out[k] - out[j])
    return out
cam = [smooth([v[c] for v in tgt], 0.32) for c in range(3)]
plan = []
for k in range(n):
    tt = k / FPS
    a, b, kk = frame_at(tt)
    x, y = cursor_at(tt)
    press = any(c[0] <= tt < c[0] + 0.14 for c in clicks) or any(a0 <= tt <= b0 for a0, b0 in drags)
    rip = next(((round(tt - c[0], 3), c[1]) for c in clicks if 0 <= tt - c[0] < 0.6), None)
    call = next((ci for ci, cl in enumerate(calls) if cl[0] <= tt <= cl[1] + 0.25), -1)
    callk = 0 if call < 0 else min(1, (tt - calls[call][0]) / 0.2, (calls[call][1] + 0.25 - tt) / 0.25)
    bz = max([min(1, (tt - a0) / 0.2, (b0 - tt) / 0.2) for a0, b0 in busy if a0 <= tt <= b0] or [0])
    plan.append([idx[a], -1 if b is None else idx[b], round(kk, 3),
                 round(cam[0][k], 1), round(cam[1][k], 1), round(cam[2][k], 1),
                 round(x, 1), round(y, 1), 1 if press else 0,
                 -1 if not rip else rip[0], -1 if not rip else round(rip[1][0], 1), -1 if not rip else round(rip[1][1], 1),
                 call, round(max(0, callk), 3), round(bz, 3)])

# ── the bookends + chapters on the video clock ──
MIN = {'hook': 3.8, 'title': 4.6, 'end': 4.6}
tl, T = [], 0.0
for s in script:
    if s['id'] in chap:
        a, b = chap[s['id']]
        tl.append({**s, 't0': round(T0 + a, 3), 't1': round(T0 + b, 3), 'vo': LEAD}); continue
    d = max(MIN[s['id']], LEAD + vo[s['id']] + TAIL)
    if s['id'] == 'end': T = T0 + REC
    tl.append({**s, 't0': round(T, 3), 't1': round(T + d, 3), 'vo': LEAD}); T += d
    if s['id'] == 'title': T0 = T
json.dump(tl, open(f'{R}/audio2/timeline.json', 'w'), indent=1)
pages = sorted(glob.glob(f'{CAP}/report_p*.jpg'))
tc10 = next(c[0] for c in clicks if chap['c10'][0] <= c[0] <= chap['c10'][1] and c[0] > chap['c10'][0] + 1)
data = {'tl': tl, 'T0': T0, 'REC': REC, 'fps': FPS, 'names': [f'../cap/tour2/{f}' for f in names], 'plan': plan,
        'calls': [c[2] for c in calls], 'pages': [os.path.relpath(p, R) for p in pages], 'c10click': tc10,
        'hookSeq': [f'../cap/tour2/{f["f"]}' for s in tape if s['kind'] == 'drag' and s['chapter'] == 'c08' for f in s['frames']],
        'hero': f"../cap/tour2/{[s for s in tape if s['chapter'] == 'c01' and s['kind'] == 'click'][-1]['frames'][-1]['f']}",
        'endShot': f"../cap/tour2/{[s for s in tape if s['chapter'] == 'c08' and s['kind'] == 'drag'][-1]['frames'][-1]['f']}"}
head = open(f'{SR}/howto/head.html').read().replace('width:1080px;height:1920px', 'width:1920px;height:1080px')
out = head + '<script id="data" type="application/json">' + json.dumps(data, separators=(',', ':')).replace('</', '<\\/') + '</script>\n'
for js in [open(f'{SR}/calculators/src/core.js').read(), open(f'{SR}/brandArt.js').read(), open(f'{SR}/brand.js').read(), open(f'{R}/tour2.js').read()]:
    out += f'<script>\n{js}\n</script>\n'
open(f'{R}/tour2.html', 'w').write(out + '</body></html>')
print('built', round(tl[-1]['t1'], 2), 's; recording', round(REC, 2), 's,', n, 'frames,', len(names), 'stills,', len(calls), 'callouts')
for s in tl: print(f"  {s['id']:6} {s['t0']:7.2f} → {s['t1']:7.2f}  vo {vo[s['id']]:.2f}")
