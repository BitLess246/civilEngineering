# script3.tmpl.json → script3.json with the numbers the capture actually showed
# (failure counts read off the schedule chips, page count off the PDF), so the
# narration can't claim more than the app did.   python3 fill3.py ECASES
import json, os, sys, re
R = os.path.dirname(os.path.abspath(__file__))
CAP = os.path.join(R, '..', 'cap', 'tour3')
tape = json.load(open(f'{CAP}/tape.json'))
meta = json.load(open(f'{CAP}/report_meta.json'))
ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split()
TENS = 'twenty thirty forty fifty sixty seventy eighty ninety'.split()
def words(n):
    if n < 20: return ONES[n]
    if n < 100: return TENS[n // 10 - 2] + ('' if n % 10 == 0 else '-' + ONES[n % 10])
    h, r = divmod(n, 100)
    return ONES[h] + ' hundred' + ('' if r == 0 else ' and ' + words(r))
fails = next(s for s in tape if s.get('label') == 'failures').get('failText', [])
after = next(s for s in tape if s.get('label') == 'all passed').get('failText', [])
parts = []
for f in fails:
    kind, n = re.match(r'(.*?):\s*(\d+)', f).groups()
    noun = {'RC column schedule': 'columns', 'RC beam & girder schedule': 'beams', 'Slab schedule': 'slabs', 'Footing schedule': 'footings'}.get(kind, 'members')
    parts.append(f'{words(int(n))} {noun}')
FAIL = (' and '.join(parts).capitalize() + ' fail, and each one shows its ratio.') if parts else 'Every member passes on the first try.'
PASS = 'Every member passes.' if not after else f'{len(after)} schedules still flag failures.'
fill = {'{FAIL}': FAIL, '{PASS}': PASS, '{PAGES}': words(meta['pages']).capitalize(), '{ECASES}': words(int(sys.argv[1])).capitalize()}
text = open(f'{R}/script3.tmpl.json').read()
for k, v in fill.items(): text = text.replace(k, v)
assert not re.search(r'\{[A-Z]+\}', text), 'unfilled placeholder'
open(f'{R}/script3.json', 'w').write(text)
for k, v in fill.items(): print(k, '→', v)
