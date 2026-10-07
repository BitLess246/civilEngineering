# Assemble reel.html: the head, the drawing templates, the captured data, the scene scripts.
import json, os
R = os.path.dirname(os.path.abspath(__file__))
def rd(p): return open(os.path.join(R, p)).read()
data = {'calc': json.load(open(f'{R}/assets/calc.json')), 'tools': json.load(open(f'{R}/assets/tools.json'))}
out = rd('src/head.html').replace('</body></html>', '')
out += rd('assets/drawings.html')
out += '<script id="data" type="application/json">' + json.dumps(data).replace('</', '<\\/') + '</script>\n'
for js in ['core.js', 'comp.js', 's1.js', 's2.js', 's3.js', 's4.js', 's5.js', 'main.js']:
    p = f'{R}/src/{js}'
    if os.path.exists(p): out += f'<script>\n{open(p).read()}\n</script>\n'
out += '</body></html>'
open(f'{R}/reel.html', 'w').write(out)
print('built', len(out) // 1024, 'KB')
