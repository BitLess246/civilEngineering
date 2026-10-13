# Assemble posts.html — every social post on one page; render.mjs shoots each.
import json, os, re
R = os.path.dirname(os.path.abspath(__file__))
CALC = os.path.join(R, '../calculators')
KEYS = ['beam-design', 'foundation', 'retaining-wall', 'bolted-connection', 'slope', 'hydraulic-jump']
allc = json.load(open(f'{CALC}/assets/calc.json'))
tpl = open(f'{CALC}/assets/drawings.html').read()
tools = json.load(open(f'{CALC}/assets/tools.json'))['tools']
core = open(f'{CALC}/src/core.js').read().replace('const W = 1920, H = 1080', 'const W = 1080, H = 1350')
out = open(f'{R}/head.html').read()
for k in KEYS: out += ''.join(m.group(0) for m in re.finditer(r'<template id="d_' + re.escape(k) + r'_\d+">.*?</template>\n', tpl, re.S))
data = {'calc': {k: allc[k] for k in KEYS}, 'posts': {}, 'val': json.load(open(f'{R}/../cap/h/validation.json')),
        'tools': {'total': sum(len(g['tools']) for g in tools), 'groups': len(tools), 'list': [{'g': g['g'], 'n': len(g['tools'])} for g in tools]}}
out += '<script id="data" type="application/json">' + json.dumps(data).replace('</', '<\\/') + '</script>\n'
for js in [core, open(f'{R}/../brandArt.js').read(), open(f'{R}/../brand.js').read(), open(f'{CALC}/src/comp.js').read(), open(f'{R}/posts.js').read()]:
    out += f'<script>\n{js}\n</script>\n'
out += '</body></html>'
open(f'{R}/posts.html', 'w').write(out)
print('built', len(out) // 1024, 'KB')
