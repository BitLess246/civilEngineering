import glob, numpy as np
from PIL import Image
JET = np.array([[0,0,143],[0,0,255],[0,128,255],[0,255,255],[128,255,128],[255,255,0],[255,128,0],[255,0,0],[128,0,0]], float)
ts = np.linspace(0, 1, 64); x = ts * 8; k = np.minimum(7, np.floor(x).astype(int)); f = (x - k)[:, None]
RAMP = JET[k] + (JET[k + 1] - JET[k]) * f
# brand duotone: deep navy → drafting blue → rail accent → paper white
STOPS = np.array([[22, 48, 82], [15, 76, 146], [107, 164, 220], [242, 245, 249]], float)
def duo(t):
    x = np.clip(t, 0, 1) * 3; i = np.minimum(2, np.floor(x).astype(int)); fr = (x - i)[..., None]
    return STOPS[i] + (STOPS[i + 1] - STOPS[i]) * fr
for p in sorted(glob.glob('assets/exag_*.png')) + ['assets/canvas_disp.png']:
    a = np.asarray(Image.open(p).convert('RGBA')).astype(float)
    rgb = a[..., :3]; mx = rgb.max(-1); mn = rgb.min(-1); sat = (mx - mn) / np.maximum(mx, 1)
    m = (sat > 0.42) & (a[..., 3] > 10)
    px = rgb[m]
    d = ((px[:, None, :] - RAMP[None, :, :]) ** 2).sum(-1)
    t = ts[d.argmin(1)]
    shade = mx[m] / 255.0
    new = duo(t) * (0.55 + 0.45 * shade)[:, None]
    out = a.copy(); out[..., :3][m] = new
    Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(p.replace('assets/', 'assets/duo_'))
    print(p, m.mean().round(3))
