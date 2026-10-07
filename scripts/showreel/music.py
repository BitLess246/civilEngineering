# Zeta showreel score — 120 BPM, 30 bars, exactly 60 s. A minor: Am | F | C | G.
# Everything is synthesized here; the beat map it writes is what the picture cuts to.
import json, numpy as np
import os
os.makedirs("audio", exist_ok=True)

SR = 48000
BPM = 120
BEAT = 60 / BPM            # 0.5 s
BAR = 4 * BEAT             # 2 s
DUR = 60.0
N = int(SR * DUR) + SR     # a second of tail
rng = np.random.default_rng(7)

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
CH = {  # bass root (MIDI), chord tones for pads/arps (MIDI)
    'Am': (33, [57, 60, 64, 69]), 'F': (29, [53, 57, 60, 65]), 'C': (36, [55, 60, 64, 67]), 'G': (31, [55, 59, 62, 67]),
}
PROG = ['Am', 'F', 'C', 'G']
def chord(bar): return PROG[(bar - 1) % 4]

# ── arrangement ────────────────────────────────────────────────────────────
# energy per bar: which parts play
SECTIONS = [
    # (first bar, last bar, name)
    (1, 2, 'open'), (3, 4, 'title'), (5, 8, 'geometry'), (9, 12, 'analysis'),
    (13, 13, 'break'), (14, 17, 'design'), (18, 20, 'steel'), (21, 24, 'drawings'),
    (25, 27, 'breadth'), (28, 28, 'lift'), (29, 30, 'end'),
]
def sec(bar):
    for a, b, n in SECTIONS:
        if a <= bar <= b: return n
    return 'end'

kicks, snares, hats_t, impacts = [], [], [], []
drums = [np.zeros(N), np.zeros(N)]
music = [np.zeros(N), np.zeros(N)]
fx = [np.zeros(N), np.zeros(N)]

for bar in range(1, 31):
    s = sec(bar); c = chord(bar); root, tones = CH[c]
    full = s in ('geometry', 'analysis', 'design', 'steel', 'drawings', 'breadth')
    # kicks
    if s == 'open':
        if bar == 2:
            for bt in (0, 2):
                place(drums, T(bar, bt), kick(), 0.55); kicks.append(T(bar, bt))
    elif s == 'title':
        for bt in range(4):
            place(drums, T(bar, bt), kick(), 0.95); kicks.append(T(bar, bt))
    elif full:
        for bt in range(4):
            place(drums, T(bar, bt), kick(), 1.0); kicks.append(T(bar, bt))
            duck_src[int(T(bar, bt) * SR)] = 1
    elif s == 'end':
        if bar == 29:
            place(drums, T(bar, 0), kick(True), 1.0); kicks.append(T(bar, 0))
    # duck markers for title too
    if s == 'title':
        for bt in range(4): duck_src[int(T(bar, bt) * SR)] = 1
    # claps on 2 and 4
    if full or (s == 'title' and bar == 4):
        for bt in (1, 3):
            place(drums, T(bar, bt), clap(), 0.7, 0.0, 0.25); snares.append(T(bar, bt))
    # hats
    if s in ('open',) and bar >= 1:
        for k in range(16):
            if k % 2 == 1: place(drums, T(bar, k / 4), hat(), 0.18 + 0.12 * (bar - 1), 0.3)
    if full or s == 'title':
        for k in range(16):
            off = k % 4 == 2
            g = 0.55 if off else 0.3
            if s in ('breadth',): g *= 1.15
            place(drums, T(bar, k / 4), hat(open_=off and s != 'title'), g, 0.25 if k % 2 else -0.2)
            hats_t.append(T(bar, k / 4))
    # bass: 8ths with octave pops
    if full or s == 'title':
        pat = [0, 0, 12, 0, 0, 12, 0, 7] if s != 'title' else [0, None, 0, None, 0, None, 0, None]
        for k, iv in enumerate(pat):
            if iv is None: continue
            bright = 0.6 + 0.4 * (s in ('design', 'breadth'))
            place(music, T(bar, k / 2) + 0.01, bass(hz(root + 12 + iv), 0.24, bright), 0.75)
    # pads
    if s in ('open', 'title', 'break', 'lift', 'end') or full:
        g = {'open': 0.8, 'title': 0.9, 'break': 0.9, 'lift': 0.8, 'end': 1.1}.get(s, 0.55)
        fcp = {'open': 700 + 400 * (bar - 1), 'break': 1600, 'lift': 2200, 'end': 1800}.get(s, 1300)
        place(music, T(bar), pad([hz(m) for m in tones] + [hz(tones[0] - 12)], BAR + 0.6, fcp), g, 0, 0.6)
    # plucked arpeggio, 16ths, with a 3/16 echo
    if s in ('geometry', 'analysis', 'design', 'steel', 'drawings', 'breadth', 'break'):
        seq = [0, 2, 1, 3, 2, 1, 3, 2]
        for k in range(16 if s != 'break' else 8):
            m = tones[seq[k % 8]] + (12 if (k // 8) % 2 and s in ('design', 'breadth') else 0)
            t0 = T(bar, k / 4 if s != 'break' else k / 2)
            br = 0.5 + 0.5 * ((k % 4) == 0)
            pan = -0.45 if k % 2 else 0.45
            pl = pluck(hz(m), 0.2, br)
            place(music, t0, pl, 0.55 if s != 'break' else 0.3, pan, 0.35)
            place(music, t0 + 3 * BEAT / 4, pl, 0.22, -pan, 0.3)
    # chord stabs on the off-beats at peak
    if s in ('design', 'breadth'):
        for bt in (0.5, 1.5, 2.5, 3.5):
            if s == 'design' and bt not in (1.5, 3.5): continue
            place(music, T(bar, bt), stab([hz(m) for m in tones[:3]]), 0.9, 0, 0.3)

# risers and impacts at the section seams
for start, length, top in [(T(2), BAR, 9000), (T(12, 2), BEAT * 2, 7000), (T(13), BAR, 10000), (T(20, 2), BEAT * 2, 7000),
                           (T(24, 2), BEAT * 2, 8000), (T(28), BAR, 11000)]:
    place(fx, start, riser(length, top), 0.75, 0, 0.4)
for t0, big in [(T(3), 1.0), (T(14), 0.9), (T(29), 1.25)]:
    place(fx, t0, impact(big), 0.9, 0, 0.5); impacts.append(t0)
for t0 in [T(5), T(9), T(18), T(21), T(25)]:
    place(fx, t0 - 0.5, whoosh(0.5), 0.6, 0, 0.2)
    place(fx, t0, sub_drop(0.8), 0.35)
# end card: one last soft hit on bar 30 beat 1, the pad rings out
place(fx, T(30), sub_drop(1.6), 0.5)
place(music, T(30), stab([hz(m) for m in CH['Am'][1]]), 0.8, 0, 0.8)

# ── UI accents, on the picture's own events ────────────────────────────────
def click():
    n = int(SR * 0.04); t = np.arange(n) / SR
    return (fftfilt(noise(n), 2500, 9000, 2) * np.exp(-t * 260) * 0.6 + np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 180) * 0.3)
def thud():
    n = int(SR * 0.3); t = np.arange(n) / SR
    return np.sin(2 * np.pi * (70 + 80 * np.exp(-t * 30)) * t) * np.exp(-t * 14) * 0.9 + fftfilt(noise(n), 200, 2000, 2) * np.exp(-t * 40) * 0.3
def chime(f0=1318.5):
    n = int(SR * 0.9); t = np.arange(n) / SR
    return sum(np.sin(2 * np.pi * f0 * m * t) * np.exp(-t * (5 + 3 * m)) / m for m in (1, 2.01, 3.02)) * 0.22
for t0 in (11.0, 25.75): place(fx, t0, click(), 0.8, 0.1)
place(fx, 26.55, chime(1318.5), 0.7, 0, 0.5); place(fx, 26.55, chime(1760.0), 0.4, 0.3, 0.5)
place(fx, 31.75, thud(), 0.5); place(fx, 45.25, thud(), 0.7)
place(fx, 57.1, chime(1760.0), 0.35, 0, 0.7); place(fx, 57.22, chime(2217.5), 0.25, -0.2, 0.7)
for k, t0 in enumerate([10.25, 10.32, 10.39, 10.47, 10.54, 10.62, 10.69, 10.76]): place(fx, t0, tick(3400 + 300 * (k % 3)), 0.18, 0.2)

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
with wave.open('audio/score.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
json.dump({'bpm': BPM, 'beat': BEAT, 'bar': BAR, 'sections': SECTIONS, 'kicks': kicks, 'snares': snares,
           'impacts': impacts}, open('audio/beatmap.json', 'w'))
print('ok', len(kicks), len(snares), impacts)
