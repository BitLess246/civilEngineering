# Score exported calculator PDFs for content that did not survive the export:
#   pipe   — a table flattened to "a | b | c" text instead of drawn as a table
#   mashed — text whose line breaks were lost ("…RESULT1.2D + 1.6L…": a lower-
#            case letter or digit running straight into a capital/digit run)
#   transcript — the whole-page text dump fallback was used
#   generic — an untitled "Rendered table data" block
#   python3 -I score.py <pdfDir>   → prints a table, writes <pdfDir>/_score.json
import json, os, re, sys
import pymupdf
d = sys.argv[1]
MASH = re.compile(r'[a-z\)%][A-Z][a-z]|[a-z]\d+\.\d+[A-Za-z]|\d[a-z]{2,}\d')
rows = []
for f in sorted(os.listdir(d)):
    if not f.endswith('.pdf'): continue
    doc = pymupdf.open(os.path.join(d, f))
    text = '\n'.join(pg.get_text() for pg in doc)
    extra = text.split('ADDITIONAL SCHEDULES')[1] if 'ADDITIONAL SCHEDULES' in text else ''
    extra = extra.split('REFERENCES & CODE BASIS')[0].split('CODE SCOPE & REVIEW')[0]
    lines = [l for l in extra.split('\n') if l.strip()]
    r = {
        'pdf': f, 'pages': len(doc),
        'pipe': sum(1 for l in lines if l.count(' | ') >= 1),
        'mashed': sum(1 for l in lines if len(MASH.findall(l)) >= 2),
        'transcript': int('Rendered calculator content transcript' in text),
        'generic': text.count('Rendered table data'),
    }
    r['bad'] = int(r['pipe'] > 0 or r['mashed'] > 0 or r['transcript'] > 0)
    rows.append(r)
json.dump(rows, open(os.path.join(d, '_score.json'), 'w'), indent=1)
bad = [r for r in rows if r['bad']]
print(f"{len(rows)} PDFs · {len(bad)} with flattened or run-together content")
print(f"{'pdf':40} pages pipe mashed transcript generic")
for r in rows: print(f"{r['pdf'][:40]:40} {r['pages']:5} {r['pipe']:4} {r['mashed']:6} {r['transcript']:10} {r['generic']:7}")
