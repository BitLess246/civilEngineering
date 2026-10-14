# Music bed (synthesised, 100 BPM, D–Bm–G–A) + the narration placed on the
# timeline, ducked under the voice → audio/tour_mix.wav (48 kHz stereo).
#   python3 mix.py   (after vo.py + build.py)
import json, os, wave
import numpy as np
R = os.path.dirname(os.path.abspath(__file__))
SR = 48000
AUD = os.environ.get('AUD', 'audio')
tl = json.load(open(f'{R}/{AUD}/timeline.json'))
T = tl[-1]['t1']
n = int(T * SR)
t = np.arange(n) / SR
rng = np.random.default_rng(7)
BPM = 100; beat = 60 / BPM; bar = 4 * beat
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
CHORDS = [[62, 66, 69, 74], [59, 62, 66, 71], [55, 59, 62, 67], [57, 61, 64, 69]]   # D Bm G A
mus = np.zeros((n, 2))
def add(sig, start, pan=0.0, gain=1.0):
    i = int(start * SR); j = min(n, i + len(sig))
    if i >= n: return
    s = sig[: j - i] * gain
    mus[i:j, 0] += s * (1 - pan) * 0.5 * 2 ** 0.5
    mus[i:j, 1] += s * (1 + pan) * 0.5 * 2 ** 0.5
def keys(f, dur):     # soft electric piano: a few harmonics, exponential decay
    tt = np.arange(int(dur * SR)) / SR
    env = np.exp(-tt * 3.2) * (1 - np.exp(-tt * 300))
    return env * (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(4 * np.pi * f * tt) + 0.12 * np.sin(6 * np.pi * f * tt + 0.3))
def pad(fs, dur):
    tt = np.arange(int(dur * SR)) / SR
    env = np.minimum(1, tt / 0.8) * np.minimum(1, (dur - tt) / 0.8)
    return env * sum(np.sin(2 * np.pi * f * tt + k) + 0.5 * np.sin(2 * np.pi * f * 1.003 * tt) for k, f in enumerate(fs)) / len(fs)
def kick(dur=0.35):
    tt = np.arange(int(dur * SR)) / SR
    return np.sin(2 * np.pi * (48 * tt + 60 * (1 - np.exp(-tt * 30)) / 30)) * np.exp(-tt * 9)
def hat(dur=0.06):
    tt = np.arange(int(dur * SR)) / SR
    x = rng.standard_normal(len(tt)); x = np.diff(np.concatenate([[0], x]))
    return x * np.exp(-tt * 70)
nbars = int(np.ceil(T / bar)) + 1
for b in range(nbars):
    ch = CHORDS[b % 4]; t0 = b * bar
    add(pad([hz(m - 12) for m in ch[:3]], bar + 0.3), t0, 0, 0.16)
    add(keys(hz(ch[0] - 24), bar), t0, 0, 0.22)                       # bass note
    arp = [ch[0], ch[1], ch[2], ch[3], ch[2], ch[1], ch[2], ch[3]]
    for k, m in enumerate(arp):
        add(keys(hz(m + 12), 1.2), t0 + k * beat / 2, 0.3 if k % 2 else -0.3, 0.08)
    if b >= 1:
        for k in range(4):
            if k in (0, 2): add(kick(), t0 + k * beat, 0, 0.35)
            add(hat(), t0 + k * beat + beat / 2, 0.4, 0.05)
# fade the bed in and out
fade = np.minimum(1, t / 1.5) * np.minimum(1, (T - t) / 2.5)
mus *= fade[:, None]
# narration on its segments
vo = np.zeros(n)
for s in tl:
    if s.get('silent'): continue
    clip = np.fromfile(f'{R}/{AUD}/vo_{s["id"]}.f32', dtype=np.float32)
    i = int((s['t0'] + s['vo']) * SR); vo[i:i + len(clip)] += clip[: max(0, n - i)]
vo *= 0.9 / max(1e-6, np.abs(vo).max())
# duck the bed under the voice: 80 ms attack, 400 ms release, −10 dB
g = np.zeros(n); s_ = 0.0; a, r = np.exp(-1 / (0.08 * SR)), np.exp(-1 / (0.4 * SR))
act = np.abs(vo) > 0.01
for k in range(n):
    tgt = 1.0 if act[k] else 0.0
    s_ = a * s_ + (1 - a) * tgt if tgt > s_ else r * s_ + (1 - r) * tgt
    g[k] = s_
mus /= max(1e-6, np.abs(mus).max())
mix = mus * (0.42 * (1 - 0.68 * g))[:, None] + vo[:, None]
mix /= max(1.0, np.abs(mix).max() / 0.97)
with wave.open(f'{R}/{AUD}/tour_mix.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print('mixed', round(T, 2), 's')
