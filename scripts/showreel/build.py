import json, os, glob, html
R = os.path.dirname(os.path.abspath(__file__))
def rd(p): return open(os.path.join(R, p)).read()
data = {
  'tb': json.load(open(f'{R}/cap/d/tables_before.json')), 'ta': json.load(open(f'{R}/cap/d/tables_after.json')),
  'tools': json.load(open(f'{R}/svg/tools.json')), 'val': json.load(open(f'{R}/cap/h/validation.json')),
  'chrome': json.load(open(f'{R}/svg/chrome.json')), 'sol': json.load(open(f'{R}/cap/d/sol_titles.json')),
  'eq': sorted(os.path.basename(p) for p in glob.glob(f'{R}/assets/eq/eq_*.png')),
}
tpls = ''.join(f'<template id="t_{os.path.basename(p)[:-4]}">{open(p).read()}</template>\n' for p in sorted(glob.glob(f'{R}/assets/*.svg')))
out = rd('src/head.html').replace('</body></html>', '') if '</body>' in rd('src/head.html') else rd('src/head.html')
out += tpls
out += '<script id="data" type="application/json">' + json.dumps(data).replace('</', '<\\/') + '</script>\n'
for js in ['core.js', 'scenes.js', 'scenes2.js', 'scenes3.js', 'main.js']:
    p = f'{R}/src/{js}'
    if os.path.exists(p): out += f'<script>\n{open(p).read()}\n</script>\n'
out += '</body></html>'
open(f'{R}/reel.html', 'w').write(out)
print('built', len(out))
