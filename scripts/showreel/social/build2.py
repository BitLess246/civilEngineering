# Assemble posts2.html — the Facebook cover and set-2 posts; render2.mjs shoots each.
import json, os, re
R = os.path.dirname(os.path.abspath(__file__))
CALC = os.path.join(R, '../calculators')
KEYS = ['foundation']
allc = json.load(open(f'{CALC}/assets/calc.json'))
tpl = open(f'{CALC}/assets/drawings.html').read()
core = open(f'{CALC}/src/core.js').read().replace('const W = 1920, H = 1080', 'const W = 1080, H = 1350')
out = open(f'{R}/head.html').read()
for k in KEYS: out += ''.join(m.group(0) for m in re.finditer(r'<template id="d_' + re.escape(k) + r'_\d+">.*?</template>\n', tpl, re.S))
data = {'calc': {k: allc[k] for k in KEYS}, 'x': json.load(open(f'{R}/../cap/x/x.json'))}
out += '<script id="data" type="application/json">' + json.dumps(data).replace('</', '<\\/') + '</script>\n'
for js in [core, open(f'{R}/../brandArt.js').read(), open(f'{R}/../brand.js').read(), open(f'{CALC}/src/comp.js').read(), open(f'{R}/set2.js').read()]:
    out += f'<script>\n{js}\n</script>\n'
out += '</body></html>'
open(f'{R}/posts2.html', 'w').write(out)
print('built', len(out) // 1024, 'KB')
