# contact sheet of stills: python3 sheet.py out.png t1 t2 ...
import sys
from PIL import Image, ImageDraw
out, ts = sys.argv[1], sys.argv[2:]
cols = 3 if len(ts) > 4 else 2; tw = 640; th = 360
S = Image.new('RGB', (cols * tw, ((len(ts) + cols - 1) // cols) * th), 'black')
for i, t in enumerate(ts):
    im = Image.open(f'frames/s_{float(t):.2f}.png').convert('RGB').resize((tw, th), Image.LANCZOS)
    ImageDraw.Draw(im).text((8, 6), t, fill=(255, 60, 60))
    S.paste(im, ((i % cols) * tw, (i // cols) * th))
S.save(out)
