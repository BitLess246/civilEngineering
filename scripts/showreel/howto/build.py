# Assemble reel_<slug>.html for each how-to reel: the vertical head, the one
# calculator's drawing templates and capture, the shared motion core and brand,
# the calculators reel's component builders, then this timeline.
#   python3 build.py beam footing wall
import json, os, re, sys
R = os.path.dirname(os.path.abspath(__file__))
CALC = os.path.join(R, '../calculators')
cfgs = json.load(open(f'{R}/reels.json'))
allc = json.load(open(f'{CALC}/assets/calc.json'))
tpl = open(f'{CALC}/assets/drawings.html').read()
core = open(f'{CALC}/src/core.js').read().replace('const W = 1920, H = 1080', 'const W = 1080, H = 1920')
assert 'const W = 1080, H = 1920' in core
for slug in sys.argv[1:] or list(cfgs):
    cfg = {**cfgs[slug], 'slug': slug}
    key = cfg['calc']
    out = open(f'{R}/head.html').read()
    out += ''.join(m.group(0) for m in re.finditer(r'<template id="d_' + re.escape(key) + r'_\d+">.*?</template>\n', tpl, re.S))
    data = {'calc': {key: allc[key]}, 'tools': {}, 'cfg': cfg}
    out += '<script id="data" type="application/json">' + json.dumps(data).replace('</', '<\\/') + '</script>\n'
    for js in [core, open(f'{R}/../brandArt.js').read(), open(f'{R}/../brand.js').read(), open(f'{CALC}/src/comp.js').read(),
               open(f'{R}/howto.js').read(), open(f'{R}/main.js').read()]:
        out += f'<script>\n{js}\n</script>\n'
    out += '</body></html>'
    open(f'{R}/reel_{slug}.html', 'w').write(out)
    print('built', slug, len(out) // 1024, 'KB')
