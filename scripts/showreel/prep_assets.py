# Turn the raw captures (cap/, svg/, key/) into the reel's assets/ folder.
# Run after cap1–cap4 and key.py, before duotone.py and build.py.
import base64, glob, json, os, re
import numpy as np
from PIL import Image

os.makedirs('assets/eq', exist_ok=True)

# fonts, inlined so the capture pages and the reel never reach a font CDN
css = open('fonts/fonts.css').read()
inline = re.sub(r"url\(([0-9]+\.woff2)\)",
                lambda m: 'url(data:font/woff2;base64,' + base64.b64encode(open('fonts/' + m.group(1), 'rb').read()).decode() + ')', css)
open('fonts/inline.css', 'w').write(inline)

# the tool catalogue, from the sidebar captured in cap1
side = json.load(open('svg/chrome.json'))['side']
groups, cur = [], None
for s in side:
    t = s['t']; m = re.match(r'^([A-Z &]+) (\d+)$', t)
    if m: cur = {'g': m.group(1), 'n': int(m.group(2)), 'tools': []}; groups.append(cur)
    elif cur and not t.startswith('Find'): cur['tools'].append(re.sub(r' SIGN IN$', '', t))
json.dump(groups, open('svg/tools.json', 'w'))
print('tools', sum(len(g['tools']) for g in groups), 'in', len(groups), 'groups')

# keyed 3D frames: clear the canvas card's own border, downscale to 1300 px
for f in sorted(glob.glob('key/orbit_*.png') + glob.glob('key/exag_*.png') + ['key/canvas_stress.png', 'key/canvas_disp.png']):
    a = np.asarray(Image.open(f)).copy()
    a[:, :14, 3] = 0; a[:, -14:, 3] = 0; a[-14:, :, 3] = 0
    im = Image.fromarray(a)
    im.resize((1300, round(im.height * 1300 / im.width)), Image.LANCZOS).save('assets/' + os.path.basename(f))

# the worked solution, cut into its equation boxes
im = Image.open('cap/d/sol_00.png').convert('RGB'); a = np.asarray(im).astype(int)
bg = a[330, 200]
m = np.abs(a - bg).sum(-1) <= 3
rows = m[:, 80:1340].mean(1) > 0.6
runs, start = [], None
for y, v in enumerate(rows):
    if v and start is None: start = y
    if not v and start is not None:
        if y - start > 40: runs.append((start, y))
        start = None
for k, (y0, y1) in enumerate(runs):
    xs = np.where(m[y0:y1].mean(0) > 0.6)[0]
    im.crop((xs.min() - 2, y0 - 4, xs.max() + 3, y1 + 4)).save(f'assets/eq/eq_{k:02d}.png')
print('equations', len(runs))

# the drawings and FE plates, as the app's own SVG
pl = json.load(open('cap/d/plans.json'))
for i, name in [(1, 'plan_framing'), (6, 'plan_foundation'), (7, 'plan_elevA'), (22, 'plan_elev1'), (60, 'plan_cutting'), (0, 'plan_notes')]:
    open(f'assets/{name}.svg', 'w').write(pl[i]['svg'])
c = json.load(open('cap/s/conn.json')); b = json.load(open('cap/s/brace.json')); bp = json.load(open('cap/s/base.json'))
for name, s in [('det_mf1', c[0]), ('det_mech', c[1]), ('fe_tab', c[2]), ('det_gusset_base', b[0]), ('det_gusset_corner', b[1]),
                ('fe_gusset1', b[2]), ('fe_gusset2', b[3]), ('det_base', bp[0])]:
    open(f'assets/{name}.svg', 'w').write(s['svg'])
open('assets/spectrum.svg', 'w').write(json.load(open('svg/modal.json'))[0])

# film grain tiles
rng = np.random.default_rng(3)
for k in range(6):
    Image.fromarray(rng.normal(128, 40, (256, 256)).clip(0, 255).astype(np.uint8), 'L').save(f'assets/grain_{k}.png')
print('assets ready')
