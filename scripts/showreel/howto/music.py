# Zeta how-to reels — 120 BPM, 15 bars, exactly 30 s.  python3 music.py <beam|footing|wall>
# The calculators reel's instruments (copied, not imported — that file is a
# script), a new arrangement for the how-to structure, one key per reel.
import json, os, sys, numpy as np
SLUG = sys.argv[1]
KEY = {'beam': 0, 'footing': 3, 'wall': -2}[SLUG]      # F#m, Am, Em
SR = 48000
BPM = 120
BEAT = 60 / BPM            # 0.5 s
BAR = 4 * BEAT             # 2 s
DUR = 30.0
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
def hz(m): return 440 * 2 ** ((m - 69 + KEY) / 12)
CH = {'i': (30, [54, 57, 61, 66]), 'VI': (26, [50, 54, 57, 62]), 'III': (33, [52, 57, 61, 64]), 'VII': (28, [52, 56, 59, 64])}
PROG = ['i', 'VI', 'III', 'VII']
def chord(bar): return PROG[(bar - 1) % 4]
# hook | where | step1 x2 | step2 x2 | step3 x2 | step4 x2 | step5 x2 | features | end x2
SECTIONS = [(1, 1, 'hook'), (2, 2, 'where'), (3, 4, 'step'), (5, 6, 'step'), (7, 8, 'pass'), (9, 10, 'step'),
            (11, 12, 'step'), (13, 13, 'feat'), (14, 15, 'end')]
def sec(bar):
    for a, b, n in SECTIONS:
        if a <= bar <= b: return n
    return 'end'
def lead(freq, dur):
    n = int(SR * dur); t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(1, t / 0.25)
    ph = 2 * np.pi * np.cumsum(freq * vib) / SR
    s = np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)
    e = np.minimum(1, t / 0.015) * np.exp(-t * 1.6) * np.minimum(1, (dur - t) / 0.05).clip(0)
    return s * e * 0.16

kicks, snares, impacts = [], [], []
drums = [np.zeros(N), np.zeros(N)]; music = [np.zeros(N), np.zeros(N)]; fx = [np.zeros(N), np.zeros(N)]
FULL = ('step', 'pass', 'feat')
for bar in range(1, 16):
    s = sec(bar); root, tones = CH[chord(bar)]; full = s in FULL
    if s == 'hook':
        for bt in (0, 2.5, 3, 3.5):
            place(drums, T(bar, bt), kick(bt == 0), 0.9 if bt == 0 else 0.45); kicks.append(T(bar, bt))
    elif s == 'where':
        for bt in range(4):
            place(drums, T(bar, bt), kick(), 0.85); kicks.append(T(bar, bt)); duck_src[int(T(bar, bt) * SR)] = 1
    elif full:
        for bt in range(4):
            place(drums, T(bar, bt), kick(), 1.0); kicks.append(T(bar, bt)); duck_src[int(T(bar, bt) * SR)] = 1
    elif s == 'end' and bar == 14:
        place(drums, T(bar, 0), kick(True), 1.0); kicks.append(T(bar, 0))
    if full or s == 'where':
        for bt in (1, 3):
            place(drums, T(bar, bt), clap(), 0.72 if s != 'pass' else 0.82, 0.0, 0.25); snares.append(T(bar, bt))
    if full or s == 'where':
        for k in range(16):
            off = k % 4 == 2
            acc = (0.5 if off else 0.2 + 0.15 * ((k * 5) % 3 == 0)) * (1.12 if s == 'pass' else 1)
            place(drums, T(bar, k / 4), hat(open_=off and s != 'where'), acc, 0.25 if k % 2 else -0.2)
    if full:
        pat = {0: 0, 3: 12, 4: 0, 6: 0, 8: 7, 10: 12, 11: 0, 14: 10}
        for k, iv in pat.items():
            place(music, T(bar, k / 4) + 0.01, bass(hz(root + 12 + iv), 0.2, 0.55 + 0.4 * (s == 'pass')), 0.75)
    g = {'hook': 0.9, 'where': 0.9, 'end': 1.1}.get(s, 0.5)
    fcp = {'hook': 900, 'where': 1300, 'end': 1800}.get(s, 1300)
    place(music, T(bar), pad([hz(m) for m in tones] + [hz(tones[0] - 12)], BAR + 0.6, fcp), g, 0, 0.6)
    if full:
        seq = [0, 3, 1]
        for k in range(16):
            m = tones[seq[(bar * 16 + k) % 3]] + (12 if s == 'pass' and k % 8 >= 4 else 0)
            pan = -0.5 if k % 2 else 0.5; pl = pluck(hz(m), 0.2, 0.45 + 0.55 * (k % 4 == 0))
            place(music, T(bar, k / 4), pl, 0.45, pan, 0.35); place(music, T(bar, k / 4) + 3 * BEAT / 4, pl, 0.18, -pan, 0.3)
    if s == 'pass':
        for bt, ti, d in [(0, 2, 1.0), (1.5, 0, 0.5), (2, 1, 1.0), (3.5, 3, 0.5)]:
            place(music, T(bar, bt), lead(hz(tones[ti] + 12), d * BEAT * 1.9), 0.75, 0.1, 0.5)
        for bt in (1.5, 3.5): place(music, T(bar, bt), stab([hz(m) for m in tones[:3]]), 0.7, 0, 0.3)
for start, length, top in [(T(1, 2), BEAT * 2, 8000), (T(6, 2), BEAT * 2, 7000), (T(12, 2), BEAT * 2, 7500), (T(13), BAR, 11000)]:
    place(fx, start, riser(length, top), 0.75, 0, 0.4)
for t0, big in [(T(1), 0.8), (T(3), 0.9), (T(14), 1.2)]:
    place(fx, t0, impact(big), 0.85, 0, 0.5); impacts.append(t0)
for t0 in [T(5), T(7), T(9), T(11), T(13)]:
    place(fx, t0 - 0.5, whoosh(0.5), 0.55, 0, 0.2); place(fx, t0, sub_drop(0.8), 0.3)
place(fx, T(15), sub_drop(1.6), 0.45)
def click():
    n = int(SR * 0.04); t = np.arange(n) / SR
    return (fftfilt(noise(n), 2500, 9000, 2) * np.exp(-t * 260) * 0.6 + np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 180) * 0.3)
def chime(f0=1318.5):
    n = int(SR * 0.9); t = np.arange(n) / SR
    return sum(np.sin(2 * np.pi * f0 * m * t) * np.exp(-t * (5 + 3 * m)) / m for m in (1, 2.01, 3.02)) * 0.22
# typing on the fields (bars 3–4), PASS chimes on the bar-7/8 snares, the button click (bar 11)
for k in range(12): place(fx, 4.25 + k * 0.29, click(), 0.45, 0.15 * (-1) ** k)
for t0, f in [(12.5, 1108.7), (13.5, 1479.98), (14.5, 1108.7), (15.5, 1864.7)]: place(fx, t0, chime(f * 2 ** (KEY / 12)), 0.4, 0, 0.5)
place(fx, 20.5, click(), 0.8, 0)
place(fx, 27.1, chime(1479.98 * 2 ** (KEY / 12)), 0.32, 0, 0.7)
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
fade = np.ones(mix.shape[1]); fs = int(SR * 28.8); fe = int(SR * 30.0)
fade[fs:fe] = np.linspace(1, 0, fe - fs) ** 2
mix *= fade
mix *= 0.97 / max(1.0, np.abs(mix).max())
pcm = (mix.T * 32767).astype(np.int16)
import wave
os.makedirs('audio', exist_ok=True)
with wave.open(f'audio/{SLUG}.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
json.dump({'bpm': BPM, 'beat': BEAT, 'bar': BAR, 'sections': SECTIONS, 'kicks': kicks, 'snares': snares,
           'impacts': impacts}, open(f'audio/{SLUG}.json', 'w'))
print('ok', len(kicks), len(snares), impacts)
