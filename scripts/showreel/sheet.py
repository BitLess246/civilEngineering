import sys, glob
from PIL import Image, ImageDraw
files = sys.argv[2:]; out = sys.argv[1]
ims = [Image.open(f).convert('RGB').resize((640, 360)) for f in files]
cols = 3; rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * 644, rows * 380), (40, 40, 40))
d = ImageDraw.Draw(S)
for k, (im, f) in enumerate(zip(ims, files)):
    x, y = (k % cols) * 644, (k // cols) * 380
    S.paste(im, (x, y)); d.text((x + 6, y + 362), f.split('/')[-1], fill=(255, 255, 255))
S.save(out)
