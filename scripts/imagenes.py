"""Genera las imágenes del sitio a partir de src/assets (correr local, requiere Pillow).
public/img/*.webp  -> para el formulario (máx. 1200 px)
public/pdf/*.jpg   -> miniaturas para el PDF (pdf-lib no lee WebP)
public/og.jpg      -> vista previa de WhatsApp (1200x630, isotipo sobre crema)
"""
import pathlib
from PIL import Image, ImageDraw, ImageFont

R = pathlib.Path(__file__).resolve().parent.parent
SRC, IMG, PDF = R/'src/assets', R/'public/img', R/'public/pdf'
CREMA, CARBON = (246, 242, 236), (56, 58, 52)
IMG.mkdir(parents=True, exist_ok=True); PDF.mkdir(parents=True, exist_ok=True)

for f in sorted(SRC.iterdir()):
    im = Image.open(f)
    web = im.copy(); web.thumbnail((1200, 1200))
    web.save(IMG/f'{f.stem}.webp', 'WEBP', quality=80, method=6)
    if f.suffix == '.png':
        im.save(PDF/f'{f.stem}.png')
    else:
        th = im.convert('RGB'); th.thumbnail((600, 600))
        th.save(PDF/f'{f.stem}.jpg', 'JPEG', quality=82, optimize=True)

og = Image.new('RGB', (1200, 630), CREMA)
iso = Image.open(SRC/'isotipo.png').convert('RGBA')
iso.thumbnail((300, 300))
og.paste(iso, ((1200 - iso.width)//2, 110), iso)
d = ImageDraw.Draw(og)
font = ImageFont.truetype(str(R/'public/fonts/CormorantGaramond-Regular.ttf'), 34)
txt = '   '.join('CANDELA CHICCO'.split(' '))
txt = ' '.join(txt)  # espaciado de letras como en la marca
w = d.textlength(txt, font=font)
d.text(((1200 - w)/2, 110 + iso.height + 40), txt, font=font, fill=CARBON)
og.save(R/'public/og.jpg', 'JPEG', quality=88)
print('ok')
