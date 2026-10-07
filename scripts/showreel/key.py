import sys, glob, numpy as np
import os
os.makedirs("key", exist_ok=True)
from PIL import Image
BG = np.array([248, 250, 252], float)
def key(path, lo=20, ramp=50):
    a = np.asarray(Image.open(path).convert('RGB')).astype(float)
    a[:130] = BG                                  # the title badge
    d = np.sqrt(((a - BG) ** 2).sum(-1))
    al = np.clip((d - lo) / ramp, 0, 1)
    al = al ** 0.85
    rgb = np.where(al[..., None] > 1e-3, (a - (1 - al[..., None]) * BG) / np.maximum(al[..., None], 1e-3), 0)
    return np.dstack([np.clip(rgb, 0, 255), al * 255]).astype(np.uint8), al
groups = {'orbit': sorted(glob.glob('cap/m/orbit_*.png')), 'exag': sorted(glob.glob('cap/m/exag_*.png')), 'single': ['cap/m/canvas_stress.png', 'cap/m/canvas_disp.png']}
for g, files in groups.items():
    outs = [key(f) for f in files]
    m = np.zeros(outs[0][1].shape, bool)
    for _, al in outs: m |= al > 0.05
    ys, xs = np.where(m); y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    pad = 20; y0 = max(0, y0 - pad); x0 = max(0, x0 - pad); y1 += pad; x1 += pad
    print(g, x0, y0, x1, y1)
    for f, (img, _) in zip(files, outs):
        name = f.split('/')[-1].replace('.png', '')
        Image.fromarray(img[y0:y1, x0:x1]).save(f'key/{name}.png', optimize=False)
