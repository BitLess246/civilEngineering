# Real Model Space exports → data for set2: the workbook's sheet names and two
# sheets' first rows, the STAAD deck's opening lines. → ../cap/x/x.json
import json, os, openpyxl
X = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../cap/x')
wb = openpyxl.load_workbook(f'{X}/model.xlsx', read_only=True)
def rows(name, n):
    out = []
    for r in wb[name].iter_rows(values_only=True):
        out.append(['' if v is None else v for v in r]); 
        if len(out) > n: break
    return out
summ = {r[0]: r[1] for r in rows('Summary', 12) if r and r[0]}
std = open(f'{X}/model.std').read().splitlines()
mi = std.index('MEMBER INCIDENCES')
json.dump({'sheets': wb.sheetnames, 'summary': summ, 'reactions': rows('Support reactions', 13), 'cols': rows('RC columns', 9),
           'std': {'head': std[:12], 'members': std[mi:mi + 6], 'lines': len(std), 'tail': [l for l in std if l.startswith(('DEFINE', 'CONSTANTS', 'SUPPORTS', 'LOAD', 'PERFORM', 'FINISH'))][:8]}},
          open(f'{X}/x.json', 'w'), default=str)
print('sheets', len(wb.sheetnames), 'std lines', len(std))
