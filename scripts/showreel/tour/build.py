# Assemble tour.html: head (1920×1080) + timeline from the voice clips + boxes + the timeline JS.
#   python3 build.py        (after vo.py, and with cap/tour captured)
import json, os, glob
R = os.path.dirname(os.path.abspath(__file__))
SR = os.path.join(R, '..')
script = json.load(open(f'{R}/script.json'))
vo = json.load(open(f'{R}/audio/vo.json'))
LEAD, TAIL = 0.35, 1.0                        # voice starts LEAD into a segment, TAIL of air after it
MIN = {'hook': 3.8, 'title': 5.0, 'end': 4.6}
tl, t = [], 0.0
for s in script:
    d = max(MIN.get(s['id'], 4.4), LEAD + vo[s['id']] + TAIL)
    tl.append({**s, 't0': round(t, 3), 't1': round(t + d, 3), 'vo': LEAD})
    t += d
json.dump(tl, open(f'{R}/audio/timeline.json', 'w'), indent=1)
boxes = json.load(open(f'{SR}/cap/tour/boxes.json'))
pages = sorted(glob.glob(f'{SR}/cap/tour/report_p*.png'))[:4] or sorted(glob.glob(f'{SR}/cap/x/pdf/foundation_p[1245].png'))
pages = [os.path.relpath(p, R) for p in pages]
head = open(f'{SR}/howto/head.html').read().replace('width:1080px;height:1920px', 'width:1920px;height:1080px')
out = head + '<script id="data" type="application/json">' + json.dumps({'tl': tl, 'boxes': boxes, 'pages': pages}).replace('</', '<\\/') + '</script>\n'
core = open(f'{SR}/calculators/src/core.js').read()
for js in [core, open(f'{SR}/brandArt.js').read(), open(f'{SR}/brand.js').read(), open(f'{R}/tour.js').read()]:
    out += f'<script>\n{js}\n</script>\n'
out += '</body></html>'
open(f'{R}/tour.html', 'w').write(out)
print('built', round(t, 2), 's,', len(tl), 'segments, pages', len(pages))
