# Zeta calculators reel — 120 BPM, 30 bars, exactly 60 s. F# minor: F#m | D | A | E.
# Everything is synthesized here; the beat map it writes is what the picture cuts to.
import json, os, numpy as np

SR = 48000
BPM = 120
BEAT = 60 / BPM            # 0.5 s
BAR = 4 * BEAT             # 2 s
DUR = 60.0
N = int(SR * DUR) + SR     # a second of tail
rng = np.random.default_rng(11)

def T(bar, beat=0.0):      # bars and beats are 1-indexed in the score
    return (bar - 1) * BAR + beat * BEAT

L = np.zeros(N); R = np.zeros(N)
send = np.zeros((2, N))    # reverb send
duck_src = np.zeros(N)     # what the sidechain listens to

def place(buf, t, sig, gain=1.0, pan=0.0, rev=0.0):
    i = int(round(t * SR))
    if i >= N: return
    sig = sig[: N - i]
    gl = gain * np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
    gr = gain * np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
    buf[0][i:i + len(sig)] += sig * gl
    buf[1][i:i + len(sig)] += sig * gr
    if rev:
        send[0][i:i + len(sig)] += sig * gl * rev
        send[1][i:i + len(sig)] += sig * gr * rev

def env(n, a, d, curve=4.0):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) * curve / max(d, 1e-4))
    return e

def fftfilt(x, lo=None, hi=None, order=4):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    H = np.ones_like(f)
    if lo: H *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** (2 * order))
    if hi: H *= 1 / np.sqrt(1 + (f / hi) ** (2 * order))
    return np.fft.irfft(X * H, len(x))

def noise(n): return rng.standard_normal(n)

# ── instruments ────────────────────────────────────────────────────────────
def kick(big=False):
    n = int(SR * (0.6 if big else 0.42)); t = np.arange(n) / SR
    f = 46 + 120 * np.exp(-t * 38) + 30 * np.exp(-t * 9)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * (5.5 if big else 7.5))
    click = fftfilt(noise(n), 1800, 9000) * np.exp(-t * 300) * 0.35
    return np.tanh((body + click) * 1.6) * 0.9

def clap():
    n = int(SR * 0.45); t = np.arange(n) / SR
    nz = fftfilt(noise(n), 900, 7000, 2)
    e = np.zeros(n)
    for k, dt in enumerate([0, 0.011, 0.022, 0.034]):
        i = int(dt * SR); e[i:] += np.exp(-(t[: n - i]) * (90 if k < 3 else 16))
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.4
    return (nz * e * 0.5 + tone) * 0.8

def hat(open_=False):
    n = int(SR * (0.32 if open_ else 0.06)); t = np.arange(n) / SR
    nz = fftfilt(noise(n), 7000, 16000, 3)
    return nz * np.exp(-t * (9 if open_ else 70)) * (0.35 if open_ else 0.5)

def tick(f=3200):
    n = int(SR * 0.05); t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 120) * 0.5

def saw(freq, n, fc_env, detune=0.0, harmonics=60):
    t = np.arange(n) / SR; out = np.zeros(n)
    for f0 in ([freq] if not detune else [freq * (1 - detune), freq * (1 + detune)]):
        for k in range(1, harmonics + 1):
            fk = f0 * k
            if fk > 16000: break
            H = 1 / np.sqrt(1 + (fk / fc_env) ** 4)
            out += np.sin(2 * np.pi * fk * t + k * 0.7) / k * H
    return out / (2 if detune else 1)

def bass(freq, dur, bright=1.0):
    n = int(SR * dur); t = np.arange(n) / SR
    fc = 180 + 1400 * bright * np.exp(-t * 14)
    s = saw(freq, n, fc, 0.004, 40) + 0.6 * np.sin(2 * np.pi * freq * t)
    e = np.minimum(1, t / 0.004) * np.exp(-t * 3.5) * np.minimum(1, (dur - t) / 0.01).clip(0)
    return np.tanh(s * e * 1.4) * 0.55

def pluck(freq, dur=0.22, bright=1.0):
    n = int(SR * dur); t = np.arange(n) / SR
    fc = 900 + 4200 * bright * np.exp(-t * 22)
    s = saw(freq, n, fc, 0.003, 30)
    return s * np.exp(-t * 15) * np.minimum(1, t / 0.002) * 0.32

def pad(freqs, dur, fc=1400, att=0.6):
    n = int(SR * dur); t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        out += saw(f, n, fc, 0.006, 24)
    e = np.minimum(1, t / att) * np.minimum(1, (dur - t) / 0.8).clip(0)
    return out * e * 0.09

def stab(freqs, dur=0.16):
    n = int(SR * dur); t = np.arange(n) / SR
    out = sum(saw(f, n, 2600 * np.exp(-t * 9) + 500, 0.005, 30) for f in freqs)
    return out * np.exp(-t * 11) * 0.16

def riser(dur, top=9000):
    n = int(SR * dur); t = np.arange(n) / SR; x = t / dur
    nz = noise(n)
    # rising band: blend progressively higher-passed noise
    lo = fftfilt(nz, 300, 1500, 2); mid = fftfilt(nz, 1500, 5000, 2); hi = fftfilt(nz, 5000, top, 2)
    s = lo * (1 - x) ** 2 + mid * np.sin(np.pi * x) + hi * x ** 2
    f = 220 * 2 ** (3 * x ** 1.6); tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25 * x ** 2
    return (s * 0.35 + tone) * x ** 1.5

def impact(big=1.0):
    n = int(SR * 3.2); t = np.arange(n) / SR
    f = 32 + 60 * np.exp(-t * 12)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6) * 1.0
    nz = fftfilt(noise(n), 60, 3500, 2) * np.exp(-t * 7) * 0.5
    return np.tanh((boom + nz) * 1.3) * 0.8 * big

def whoosh(dur=0.5):
    n = int(SR * dur); t = np.arange(n) / SR; x = t / dur
    nz = fftfilt(noise(n), 800, 9000, 2)
    return nz * x ** 3 * 0.35

def sub_drop(dur=1.2):
    n = int(SR * dur); t = np.arange(n) / SR
    f = 90 * np.exp(-t * 2.5) + 28
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2) * 0.8

# ── harmony ────────────────────────────────────────────────────────────────
def hz(m): return 440 * 2 ** ((m - 69) / 12)
CH = {
    'F#m': (30, [54, 57, 61, 66]), 'D': (26, [50, 54, 57, 62]), 'A': (33, [52, 57, 61, 64]), 'E': (28, [52, 56, 59, 64]),
    'Bm': (35, [54, 59, 62, 66]),
}
PROG = ['F#m', 'D', 'A', 'E']
def chord(bar): return PROG[(bar - 1) % 4]

SECTIONS = [
    (1, 2, 'open'), (3, 4, 'title'), (5, 7, 'concrete'), (8, 9, 'steel'), (10, 12, 'geo'),
    (13, 13, 'break'), (14, 16, 'water'), (17, 19, 'roads'), (20, 22, 'work'), (23, 25, 'pass'),
    (26, 27, 'tools'), (28, 28, 'lift'), (29, 30, 'end'),
]
def sec(bar):
    for a, b, n in SECTIONS:
        if a <= bar <= b: return n
    return 'end'

kicks, snares, hats_t, impacts = [], [], [], []
drums = [np.zeros(N), np.zeros(N)]
music = [np.zeros(N), np.zeros(N)]
fx = [np.zeros(N), np.zeros(N)]
FULL = ('concrete', 'steel', 'geo', 'water', 'roads', 'pass', 'tools')
HALF = ('work',)

def rim():
    n = int(SR * 0.12); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 820 * t) * np.exp(-t * 60) * 0.5 + fftfilt(noise(n), 2000, 8000, 2) * np.exp(-t * 90) * 0.35)

def lead(freq, dur):
    n = int(SR * dur); t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(1, t / 0.25)
    ph = 2 * np.pi * np.cumsum(freq * vib) / SR
    s = np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)
    e = np.minimum(1, t / 0.015) * np.exp(-t * 1.6) * np.minimum(1, (dur - t) / 0.05).clip(0)
    return s * e * 0.16

for bar in range(1, 31):
    s = sec(bar); c = chord(bar); root, tones = CH[c]
    full = s in FULL
    # kicks: four on the floor in the full sections, half time in 'work'
    if s == 'open' and bar == 2:
        for bt in (0, 1.5, 2, 3.5):
            place(drums, T(bar, bt), kick(), 0.5); kicks.append(T(bar, bt))
    elif s == 'title' or full:
        for bt in range(4):
            place(drums, T(bar, bt), kick(), 1.0 if full else 0.92); kicks.append(T(bar, bt))
            duck_src[int(T(bar, bt) * SR)] = 1
        if s == 'pass' and bar % 2 == 0:
            place(drums, T(bar, 3.75), kick(), 0.55); kicks.append(T(bar, 3.75))
    elif s in HALF:
        for bt in (0, 2.5):
            place(drums, T(bar, bt), kick(), 0.95); kicks.append(T(bar, bt)); duck_src[int(T(bar, bt) * SR)] = 1
    elif s == 'end' and bar == 29:
        place(drums, T(bar, 0), kick(True), 1.0); kicks.append(T(bar, 0))
    # snares
    if full or (s == 'title' and bar == 4):
        for bt in (1, 3):
            place(drums, T(bar, bt), clap(), 0.72, 0.0, 0.25); snares.append(T(bar, bt))
    if s in HALF:
        place(drums, T(bar, 2), clap(), 0.8, 0, 0.35); snares.append(T(bar, 2))
        for bt in (0.75, 1.75, 3.25):
            place(drums, T(bar, bt), rim(), 0.35, 0.3 if bt != 1.75 else -0.3, 0.2)
    # hats: 16ths, open on the off-beat, a shuffle of accents
    if s == 'open':
        for k in range(16):
            if k % 2 == 1: place(drums, T(bar, k / 4), hat(), 0.15 + 0.12 * (bar - 1), 0.3)
    if full or s in ('title',) + HALF:
        for k in range(16):
            off = k % 4 == 2
            acc = (0.55 if off else 0.22 + 0.16 * ((k * 5) % 3 == 0))
            if s in HALF: acc *= 0.7
            if s in ('pass', 'tools'): acc *= 1.12
            place(drums, T(bar, k / 4), hat(open_=off and s not in ('title',) + HALF), acc, 0.25 if k % 2 else -0.2)
            hats_t.append(T(bar, k / 4))
    # bass: syncopated 16ths in the full sections, long notes in 'work'
    if full or s == 'title':
        pat = {0: 0, 3: 12, 4: 0, 6: 0, 8: 7, 10: 12, 11: 0, 14: 10} if s != 'title' else {0: 0, 4: 0, 8: 0, 12: 0}
        for k, iv in pat.items():
            bright = 0.55 + 0.45 * (s in ('pass', 'tools', 'water'))
            place(music, T(bar, k / 4) + 0.01, bass(hz(root + 12 + iv), 0.2, bright), 0.75)
    if s in HALF:
        place(music, T(bar), bass(hz(root + 12), 1.4, 0.35), 0.8)
        place(music, T(bar, 3), bass(hz(root + 12 + 7), 0.4, 0.4), 0.6)
    # pads
    if s in ('open', 'title', 'break', 'lift', 'end', 'work') or full:
        g = {'open': 0.8, 'title': 0.9, 'break': 1.0, 'lift': 0.8, 'end': 1.1, 'work': 0.95}.get(s, 0.5)
        fcp = {'open': 600 + 450 * (bar - 1), 'break': 1700, 'lift': 2300, 'end': 1800, 'work': 1100}.get(s, 1300)
        place(music, T(bar), pad([hz(m) for m in tones] + [hz(tones[0] - 12)], BAR + 0.6, fcp), g, 0, 0.6)
    # the arp: a 3-against-4 figure (period 3 over 16ths) — it re-aligns every 3 bars
    if s in FULL + ('break',):
        seq = [0, 3, 1]
        for k in range(16 if s != 'break' else 8):
            kk = (bar * 16 + k) if s != 'break' else k
            m = tones[seq[kk % 3]] + (12 if s in ('pass', 'water', 'tools') and k % 8 >= 4 else 0)
            t0 = T(bar, k / 4 if s != 'break' else k / 2)
            br = 0.45 + 0.55 * ((k % 4) == 0)
            pan = -0.5 if k % 2 else 0.5
            pl = pluck(hz(m), 0.2, br)
            place(music, t0, pl, 0.5 if s != 'break' else 0.32, pan, 0.35)
            place(music, t0 + 3 * BEAT / 4, pl, 0.2, -pan, 0.3)
    # a lead line in 'work' and 'pass' — the hook
    if s in ('work', 'pass'):
        hook = [(0, 2, 1.0), (1.5, 0, 0.5), (2, 1, 1.0), (3.5, 3, 0.5)]
        for bt, ti, d in hook:
            m = tones[ti] + 12
            place(music, T(bar, bt), lead(hz(m), d * BEAT * 1.9), 0.9 if s == 'work' else 0.7, 0.1, 0.5)
    # stabs on the and-of-2 and and-of-4 at peak
    if s in ('pass', 'tools', 'water'):
        for bt in ((1.5, 3.5) if s != 'pass' else (0.5, 1.5, 2.75, 3.5)):
            place(music, T(bar, bt), stab([hz(m) for m in tones[:3]]), 0.85, 0, 0.3)

# risers into the seams, impacts on the three big downbeats
for start, length, top in [(T(2), BAR, 9000), (T(9, 2), BEAT * 2, 7000), (T(13), BAR, 10500), (T(19, 2), BEAT * 2, 7000),
                           (T(22, 2), BEAT * 2, 8000), (T(25, 2), BEAT * 2, 8000), (T(28), BAR, 11500)]:
    place(fx, start, riser(length, top), 0.75, 0, 0.4)
for t0, big in [(T(3), 1.0), (T(14), 0.95), (T(29), 1.25)]:
    place(fx, t0, impact(big), 0.9, 0, 0.5); impacts.append(t0)
for t0 in [T(5), T(8), T(10), T(17), T(20), T(23), T(26)]:
    place(fx, t0 - 0.5, whoosh(0.5), 0.6, 0, 0.2)
    place(fx, t0, sub_drop(0.8), 0.35)
place(fx, T(30), sub_drop(1.6), 0.5)
place(music, T(30), stab([hz(m) for m in CH['F#m'][1]]), 0.8, 0, 0.8)

def click():
    n = int(SR * 0.04); t = np.arange(n) / SR
    return (fftfilt(noise(n), 2500, 9000, 2) * np.exp(-t * 260) * 0.6 + np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 180) * 0.3)
def chime(f0=1318.5):
    n = int(SR * 0.9); t = np.arange(n) / SR
    return sum(np.sin(2 * np.pi * f0 * m * t) * np.exp(-t * (5 + 3 * m)) / m for m in (1, 2.01, 3.02)) * 0.22
# typing in the open field; the search box near the end
for t0 in (0.75, 1.25, 1.5): place(fx, t0, click(), 0.7, 0.1)
for k in range(5): place(fx, 51.0 + k * 0.125, click(), 0.55, 0.15)
# PASS chips chime as they stamp (a quiet bell, pitched to the key)
for t0, f in [(9.75, 1108.7), (20.0, 1479.98), (45.0, 1108.7), (47.0, 1479.98)]: place(fx, t0, chime(f), 0.45, 0, 0.5)
place(fx, 57.1, chime(1479.98), 0.35, 0, 0.7); place(fx, 57.22, chime(1864.7), 0.25, -0.2, 0.7)
for k in range(10): place(fx, 18.6 + k * 0.125, tick(3000 + 250 * (k % 4)), 0.16, 0.2 * (-1) ** k)

# ── sidechain: pads/bass/music ducked by the kick ─────────────────────────
k_env = np.ones(N); idx = np.where(duck_src > 0)[0]
shape = 1 - 0.65 * np.exp(-np.arange(int(SR * 0.35)) / SR * 9)
for i in idx:
    seg = shape[: N - i]; k_env[i:i + len(seg)] = np.minimum(k_env[i:i + len(seg)], seg)
for ch in music: ch *= k_env

# ── reverb: decorrelated exponentially decaying noise, by FFT convolution ──
def conv(x, ir):
    n = len(x) + len(ir); nfft = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[: len(x)]
irn = int(SR * 2.4); t_ir = np.arange(irn) / SR
irs = [fftfilt(noise(irn), 200, 7000, 1) * np.exp(-t_ir * 3.0) * 0.012 for _ in range(2)]
wet = [conv(send[c], irs[c]) for c in range(2)]

mix = [drums[c] * 0.9 + music[c] * 0.85 + fx[c] * 0.8 + wet[c] for c in range(2)]
mix = np.array(mix)
# master: level so the body of the track sits with headroom, then a soft knee
# above 0.75 only — peaks are rounded, the groove keeps its transients
mix = mix[:, : int(SR * DUR)]
ref = np.percentile(np.abs(mix), 99.7)
mix *= 0.62 / ref
thr = 0.75
a = np.abs(mix); over = a > thr
mix[over] = np.sign(mix[over]) * (thr + (1 - thr) * np.tanh((a[over] - thr) / (1 - thr)))
fade = np.ones(mix.shape[1]); fs = int(SR * 58.6); fe = int(SR * 60.0)
fade[fs:fe] = np.linspace(1, 0, fe - fs) ** 2
mix *= fade
mix *= 0.97 / max(1.0, np.abs(mix).max())
pcm = (mix.T * 32767).astype(np.int16)
import wave
os.makedirs('audio', exist_ok=True)
with wave.open('audio/score.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
json.dump({'bpm': BPM, 'beat': BEAT, 'bar': BAR, 'sections': SECTIONS, 'kicks': kicks, 'snares': snares,
           'impacts': impacts}, open('audio/beatmap.json', 'w'))
print('ok', len(kicks), len(snares), impacts)
