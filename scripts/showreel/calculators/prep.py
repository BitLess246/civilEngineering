# Calculator captures → the reel's data: fields, cards, worked-solution KaTeX,
# drawing SVGs as templates, and KaTeX's stylesheet with its fonts inlined.
import base64, glob, json, os, re
import numpy as np
from PIL import Image
KX = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../webapp/node_modules/katex/dist/')
os.makedirs('assets', exist_ok=True)
css = open(KX + 'katex.min.css').read()
def font(m):
    name = m.group(1)
    data = base64.b64encode(open(KX + 'fonts/' + name + '.woff2', 'rb').read()).decode()
    return f'src:url(data:font/woff2;base64,{data}) format("woff2")'
css = re.sub(r'src:url\(fonts/([A-Za-z0-9_-]+)\.woff2\) format\("woff2"\)(,url\([^)]+\) format\("[a-z]+"\))*', font, css)
open('assets/katex.css', 'w').write(css)
import unicodedata, html as H
def isMath(tok): return tok and all(0x1D400 <= ord(ch) <= 0x1D7FF or ch in "′″" for ch in tok)
def clean(label):
    """KaTeX labels arrive as MathML + HTML text; rebuild them as base<sub>rest</sub>′."""
    if '\n' not in label: return H.escape(label)
    parts = label.split('\n'); pre, i = (('', 0) if isMath(parts[0]) else (parts[0], 1)); math = []
    while i < len(parts) and isMath(parts[i]): math.append(parts[i]); i += 1
    n = len(math); plain = parts[i:i + n]; rest = parts[i + n:]
    sym = unicodedata.normalize('NFKC', ''.join(math))
    primes = ''.join(c for c in sym if c in "′″"); core = ''.join(c for c in sym if c not in "′″")
    tail = (plain[-1][1:] if plain and len(plain[-1]) > 1 else '') + ''.join(rest)
    tail = tail.replace('\t', '').replace('​', '')
    out = H.escape(pre) + '<i>' + H.escape(core[:1]) + '</i>' + (f'<sub>{H.escape(core[1:])}</sub>' if len(core) > 1 else '') + primes
    return out + H.escape(tail)
calc, tpls = {}, []
for f in sorted(glob.glob('cap/calc/*.json')):
    d = json.load(open(f)); slug = os.path.basename(f)[:-5]
    for i, dr in enumerate(d['drawings']):
        tpls.append((f'd_{slug}_{i}', dr['svg']))
    for f_ in d['fields']: f_['label'] = clean(f_['label'])
    calc[slug] = {'title': d['title'], 'desc': d.get('desc', ''), 'fields': d['fields'], 'cards': d['cards'],
                  'draw': [{'id': f'd_{slug}_{i}', 'w': x['w'], 'h': x['h']} for i, x in enumerate(d['drawings'])],
                  'steps': d['steps'], 'solTitle': d.get('solTitle', '')}
json.dump(calc, open('assets/calc.json', 'w'))
with open('assets/drawings.html', 'w') as o:
    for k, s in tpls: o.write(f'<template id="{k}">{s}</template>\n')
# the tool catalogue, from the sidebar: "CONCRETE 12" headings, tools under them
side = json.load(open('cap/side.json'))
groups, cur, icons = [], None, {}
for x in side:
    m = re.match(r'^([A-Z &]+) (\d+)$', x['t'])
    if m:
        cur = {'g': m.group(1), 'n': int(m.group(2)), 'tools': []}; groups.append(cur)
        if x.get('svg'): icons[m.group(1).split(' ')[0]] = x['svg']
    elif cur and not x['t'].startswith('Find'): cur['tools'].append(re.sub(r' SIGN IN$', '', x['t']))
json.dump({'tools': groups, 'icons': icons}, open('assets/tools.json', 'w'))
# film grain tiles
rng = np.random.default_rng(3)
for k in range(6):
    Image.fromarray(rng.normal(128, 40, (256, 256)).clip(0, 255).astype(np.uint8), 'L').save(f'assets/grain_{k}.png')
print('calcs', len(calc), 'drawings', len(tpls), 'katex css', len(css) // 1024, 'KB', 'tools', sum(len(g['tools']) for g in groups), 'in', len(groups), 'groups')
