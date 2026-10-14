# Tour v3: replay cap/tour3/tape.json as one take, with the narration tied to
# STEPS rather than chapters — each beat in script3.json names the step it
# speaks over (`at`: that step's label), the step waits for the previous beat
# to finish, so a line about "Orthogonal effects" plays while the pointer is
# on that checkbox. Holds pan down over what they read; orbits and the mode
# animation crossfade frame to frame so they play smooth.
#   python3 vo.py (SCRIPT=script3.json AUD=audio3) && python3 build3.py && AUD=audio3 python3 mix.py
import json, os, glob, math
R = os.path.dirname(os.path.abspath(__file__))
SR = os.path.join(R, '..')
CAP = f'{SR}/cap/tour3'
FPS = 30
script = json.load(open(f'{R}/script3.json'))
vo = json.load(open(f'{R}/audio3/vo.json'))
tape = json.load(open(f'{CAP}/tape.json'))
W, H = 1600, 900
FULL = (0.0, 0.0, 1600.0)
GAP = 0.35                                       # air between two beats
MOVE, PRESS, SWAP, FADE, DWELL = 0.75, 0.12, 0.18, 0.2, 0.7
KEY, SCROLL, BUSY = 0.08, 0.075, 1.4
PDF_INSERT = 7.5                                 # the report motion graphic, seconds

def ctr(b): return (b['x'] + b['w'] / 2, b['y'] + b['h'] / 2)
def clampv(x, y, w):
    hh = w * 9 / 16
    return (min(max(x, 0), W - w), min(max(y, 0), H - hh), w)
def view_on(b, w):
    cx, cy = ctr(b); return clampv(cx - w / 2, cy - w * 9 / 32, w)
def view_top(b, w, y):
    cx = b['x'] + b['w'] / 2; return clampv(cx - w / 2, y, w)

chapters = [s for s in script if s.get('n')]
beats = {}                                       # chapter → [(anchor label, beat id)]
for s in chapters:
    beats[s['id']] = [(bt['at'], f"{s['id']}_{k}") for k, bt in enumerate(s['beats'])]

shows, cur, clicks, calls, focus, busy, drags, chap, clips = [], [], [], [], [], [], [], {}, []
t, pos = 0.0, (W * 0.55, H * 0.5)
free = 0.0                                       # when the narrator is free again
pending = {}                                     # chapter → beats not yet placed
pdf_at = None
def show(f, at, fade=0.0): shows.append((round(at, 3), f, fade))
def glide(to, a, b): cur.append((a, b, pos, to))
def beat_for(s):
    """If this step anchors the chapter's next beat, start the voice here."""
    global t, free
    q = pending.get(s['chapter'], [])
    if q and (q[0][0] == s.get('label') or q[0][0] == s['kind']):
        t = max(t, free)
        bid = q.pop(0)[1]
        clips.append({'id': bid, 't0': round(t + 0.1, 3), 'vo': 0})
        free = t + 0.1 + vo[bid] + GAP
for i, s in enumerate(tape):
    c = s['chapter']
    if c not in chap:
        if chap:
            p = list(chap)[-1]
            for _, bid in pending.get(p, []): print('WARN unplaced beat', bid)
            t = max(t, free); chap[p][1] = t
        chap[c] = [t, None]; pending[c] = list(beats.get(c, []))
    nxt = tape[i + 1] if i + 1 < len(tape) else None
    k, fr = s['kind'], s['frames']
    beat_for(s)
    if k == 'start':
        show(fr[0]['f'], t); t += 0.5
    elif k in ('click', 'hover'):
        to = ctr(s['box']); a = t; b = t + MOVE
        glide(to, a, b); pos = to
        tc = b + PRESS
        typing = nxt and nxt['kind'] == 'type'
        lab = (f"Type › {s['label']}" if typing else f"Click › {s['label']}") if k == 'click' else s['label']
        calls.append([a + 0.25, None, lab, s.get('note') or ''])
        if k == 'hover':
            show(fr[0]['f'], b - 0.2, FADE)
            focus.append((a, b + s.get('dwell', 2.2), view_on(s['box'], 1100), None))
            t = b + s.get('dwell', 2.2); calls[-1][1] = t; continue
        focus.append((a, tc + 0.6 + (1.2 if s.get('note') else 0), view_on(s['box'], 1100), None))
        clicks.append((tc, to))
        t = tc + SWAP
        for j, f in enumerate(fr):
            if f.get('busy'): show(f['f'], t, FADE); busy.append((t, t + BUSY)); t += BUSY
            else: show(f['f'], t, FADE if j == 0 else 0.35); t += DWELL
        if s.get('note'): t += 1.4
        if s['label'] == 'Generate': pdf_at = t; t += PDF_INSERT
        if not fr: t = tc + 0.15
        calls[-1][1] = None if typing else min(t, tc + 0.9 + (1.6 if s.get('note') else 0))
    elif k == 'type':
        show(fr[0]['f'], t); t += 0.2
        for f in fr[1:]: t += KEY; show(f['f'], t)
        t += 0.35
        calls[-1][1] = t
        focus.append((t - 0.4 - KEY * len(fr), t, view_on(s['box'], 1100), None))
    elif k == 'scroll':
        for f in fr: show(f['f'], t); t += SCROLL
        t += 0.15
    elif k == 'drag':
        p0 = fr[0]['pos']; first = (p0['x'] + 5, p0['y'])
        glide(first, t, t + 0.6); pos = first; t += 0.6
        calls.append([t - 0.3, None, 'Drag › orbit the model', ''])
        d0, dt = t, (0.045 if len(fr) > 50 else 0.09)
        for f in fr:
            to = (f['pos']['x'], f['pos']['y']); glide(to, t, t + dt); pos = to
            show(f['f'], t, dt); t += dt                 # crossfade the whole step: no stutter
        calls[-1][1] = t + 0.3; drags.append((d0, t)); t += 0.4
    elif k == 'anim':
        dt = 2 * (1 / 0.6) / len(fr)                     # two periods, real speed
        for f in fr: show(f['f'], t, dt); t += dt
        for f in fr: show(f['f'], t, dt); t += dt        # and again
    elif k == 'hold':
        show(fr[0]['f'], t, FADE)
        bx, w, dur = s.get('focus'), s.get('w', 900), s.get('dur', 2.6)
        if bx:
            hh = w * 9 / 16
            y0 = bx['y'] - 24; y1 = max(y0, bx['y'] + bx['h'] - hh + 24)
            focus.append((t, t + dur + 0.3, view_top(bx, w, y0), view_top(bx, w, y1)))
        t += dur
p = list(chap)[-1]; t = max(t, free) + 0.6; chap[p][1] = t
REC = t

# ── per-frame plan ──
names = sorted({f for _, f, _ in shows}); idx = {f: i for i, f in enumerate(names)}
shows.sort(key=lambda x: x[0])
n = int(math.ceil(REC * FPS))
ease = lambda u: 4 * u ** 3 if u < 0.5 else 1 - (-2 * u + 2) ** 3 / 2
def frame_at(tt, j0):
    a = b = None; kk = 1.0; j = j0
    while j < len(shows) and shows[j][0] <= tt: j += 1
    if j: a = shows[j - 1][1]; at, _, fade = shows[j - 1]
    if j and fade > 0 and tt < at + fade and j >= 2: b, kk = shows[j - 2][1], (tt - at) / fade
    return a, b, kk, max(0, j - 2)
def cursor_at(tt):
    q = cur[0][2]
    for a, b, p0, p1 in cur:
        if tt < a: break
        u = 1.0 if b <= a else min(1.0, (tt - a) / (b - a)); e = u if b - a < 0.3 else ease(u)
        q = (p0[0] + (p1[0] - p0[0]) * e, p0[1] + (p1[1] - p0[1]) * e)
    return q
tgt = []
for k in range(n):
    tt = k / FPS; v = FULL
    for a, b, v0, v1 in focus:
        if a <= tt <= b:
            if v1 is None: v = v0
            else: u = ease(min(1, max(0, (tt - a - 0.5) / max(0.1, b - a - 0.9)))); v = tuple(v0[c] + (v1[c] - v0[c]) * u for c in range(3))
    tgt.append(v)
def smooth(xs, tau):
    al = 1 - math.exp(-1 / (tau * FPS)); out = list(xs)
    for _ in range(2):
        for r in (range(1, len(out)), range(len(out) - 2, -1, -1)):
            for k in r:
                j = k - 1 if r.step == 1 else k + 1
                out[k] = out[j] + al * (out[k] - out[j])
    return out
cam = [smooth([v[c] for v in tgt], 0.3) for c in range(3)]
plan, j0 = [], 0
for k in range(n):
    tt = k / FPS
    a, b, kk, j0 = frame_at(tt, j0)
    x, y = cursor_at(tt)
    press = any(c[0] <= tt < c[0] + 0.14 for c in clicks) or any(a0 <= tt <= b0 for a0, b0 in drags)
    rip = next(((round(tt - c[0], 3), c[1]) for c in clicks if 0 <= tt - c[0] < 0.6), None)
    call = next((ci for ci, cl in enumerate(calls) if cl[1] is not None and cl[0] <= tt <= cl[1] + 0.25), -1)
    callk = 0 if call < 0 else min(1, (tt - calls[call][0]) / 0.2, (calls[call][1] + 0.25 - tt) / 0.25)
    bz = max([min(1, (tt - a0) / 0.2, (b0 - tt) / 0.2) for a0, b0 in busy if a0 <= tt <= b0] or [0])
    plan.append([idx[a], -1 if b is None else idx[b], round(kk, 3), round(cam[0][k], 1), round(cam[1][k], 1), round(cam[2][k], 1),
                 round(x, 1), round(y, 1), 1 if press else 0, -1 if not rip else rip[0], -1 if not rip else round(rip[1][0], 1),
                 -1 if not rip else round(rip[1][1], 1), call, round(max(0, callk), 3), round(bz, 3)])

# ── bookends + chapters on the video clock ──
MIN = {'hook': 3.8, 'title': 4.6, 'end': 4.6}
tl, T, T0 = [], 0.0, 0.0
for s in script:
    if s.get('n'):
        a, b = chap[s['id']]; tl.append({k: v for k, v in s.items() if k != 'beats'} | {'t0': round(T0 + a, 3), 't1': round(T0 + b, 3)}); continue
    d = max(MIN[s['id']], 0.35 + vo[s['id']] + 0.9)
    if s['id'] == 'end': T = T0 + REC
    tl.append({**s, 't0': round(T, 3), 't1': round(T + d, 3)}); clips.append({'id': s['id'], 't0': round(T + 0.35, 3), 'vo': 0}); T += d
    if s['id'] == 'title': T0 = T
for c in clips:
    if c['id'] not in ('hook', 'title', 'end'): c['t0'] = round(c['t0'] + T0, 3)
clips.sort(key=lambda c: c['t0']); clips.append({'id': '_end', 't0': tl[-1]['t1'], 't1': tl[-1]['t1'], 'vo': 0, 'silent': True})
for c in clips: c.setdefault('t1', c['t0'])
json.dump(clips, open(f'{R}/audio3/timeline.json', 'w'), indent=1)
cage = [s for s in tape if s['chapter'] == 'c13' and s['kind'] == 'drag']
data = {'tl': tl, 'T0': T0, 'REC': REC, 'fps': FPS, 'names': [f'../cap/tour3/{f}' for f in names], 'plan': plan,
        'calls': [[c[2], c[3]] for c in calls], 'pages': [os.path.relpath(p, R) for p in sorted(glob.glob(f'{CAP}/report_p*.jpg'))],
        'pdfAt': pdf_at, 'pdfDur': PDF_INSERT, 'pdfPages': json.load(open(f'{CAP}/report_meta.json'))['pages'],
        'hookSeq': [f'../cap/tour3/{f["f"]}' for s in cage for f in s['frames']],
        'hero': f"../cap/tour3/{[s for s in tape if s['chapter'] == 'c01' and s['kind'] == 'click'][-1]['frames'][-1]['f']}",
        'endShot': f"../cap/tour3/{cage[0]['frames'][len(cage[0]['frames']) // 2]['f']}" if cage else None}
head = open(f'{SR}/howto/head.html').read().replace('width:1080px;height:1920px', 'width:1920px;height:1080px')
out = head + '<script id="data" type="application/json">' + json.dumps(data, separators=(',', ':')).replace('</', '<\\/') + '</script>\n'
for js in [open(f'{SR}/calculators/src/core.js').read(), open(f'{SR}/brandArt.js').read(), open(f'{SR}/brand.js').read(), open(f'{R}/tour3.js').read()]:
    out += f'<script>\n{js}\n</script>\n'
open(f'{R}/tour3.html', 'w').write(out + '</body></html>')
print('built', round(tl[-1]['t1'], 2), 's; recording', round(REC, 2), 's,', n, 'frames,', len(names), 'stills,', len(calls), 'callouts')
for s in tl: print(f"  {s['id']:6} {s['t0']:7.2f} → {s['t1']:7.2f}")
