"""Writes maps/editor-tiles.png: the flat colour tiles Tiled shows while editing.

These tiles never reach the game. The game draws painted ground and placeholder
blocks; Tiled only needs something to click on. Colours follow src/render/placeholder.ts.
Tile ids (0-based, firstgid 1 in the map):
  0 sand  1 road  2 slab  3 yard   (layer "ground", sim deco 0..3)
  4 wall  5 crate                  (layer "walls", sim tiles '#' and 'c')

Usage: python3 tools/editor_tiles.py
"""

from PIL import Image, ImageDraw

T = 24
COLOURS = ['#8f7f5f', '#6f6b62', '#8e8c84', '#7d7563', '#a39780', '#9a7448']

img = Image.new('RGBA', (T * len(COLOURS), T))
d = ImageDraw.Draw(img)
for i, c in enumerate(COLOURS):
    x = i * T
    d.rectangle([x, 0, x + T - 1, T - 1], fill=c)
    if i == 4:  # wall: dark rim so runs of wall read as solid
        d.rectangle([x, 0, x + T - 1, T - 1], outline='#3d382f', width=2)
    if i == 5:  # crate: cross
        d.rectangle([x + 3, 3, x + T - 4, T - 4], outline='#4a3520', width=2)
        d.line([x + 3, 3, x + T - 4, T - 4], fill='#4a3520', width=2)
        d.line([x + 3, T - 4, x + T - 4, 3], fill='#4a3520', width=2)
img.save('maps/editor-tiles.png')
print('wrote maps/editor-tiles.png')
