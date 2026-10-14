# Pages for the v3 report clip, picked from the PDF the tour downloaded:
# cover + the first page of each section it narrates → cap/tour3/report_pN.jpg,
# and the real page count → report_meta.json.   python3 -I pages3.py
import json, os, re
import pymupdf
R = os.path.dirname(os.path.abspath(__file__))
CAP = os.path.join(R, '..', 'cap', 'tour3')
doc = pymupdf.open(os.path.join(CAP, 'report.pdf'))
WANT = [r'TRACEABILITY', r'worked solution|WORKED SOLUTION', r'FRAMING PLAN', r'MODAL', r'PUSHOVER']
picked, used = [0], {0}
for pat in WANT:
    if pat.startswith('worked'):
        # the section heading can sit at the foot of a schedule page — take the
        # most drawn-on page in the stretch that follows it instead
        h = next(i for i, pg in enumerate(doc) if re.search(r'WORKED SOLUTIONS', pg.get_text()))
        best = max(range(h + 1, min(len(doc), h + 40)), key=lambda i: len(doc[i].get_images()) * 50 + len(doc[i].get_drawings()))
        picked.append(best); used.add(best); continue
    for i, pg in enumerate(doc):
        if i in used: continue
        if re.search(pat, pg.get_text()):
            picked.append(i); used.add(i); break
for f in os.listdir(CAP):
    if f.startswith('report_p') and f.endswith('.jpg'): os.remove(os.path.join(CAP, f))
for k, i in enumerate(picked):
    doc[i].get_pixmap(dpi=120).save(os.path.join(CAP, f'report_p{k + 1}.jpg'), jpg_quality=90)
cover = doc[0].get_text()
verdict = (re.search(r'DESIGN STATUS\s*[—-]\s*([A-Z ]+)', cover) or [None, '?'])[1].strip()
json.dump({'pages': len(doc), 'picked': [i + 1 for i in picked], 'verdict': verdict}, open(os.path.join(CAP, 'report_meta.json'), 'w'))
print('pages', len(doc), 'picked', [i + 1 for i in picked], 'verdict', verdict)
