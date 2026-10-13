"""Builds the mood board from the chosen tiles in assets/raw/moodboard/.
Every tile is an original generated image (Nano Banana in Google Flow, prompts in
assets/raw/prompts/batch-04-moodboard.md) and stands for one layer of the final art.

Usage: python3 tools/moodboard.py   -> assets/raw/moodboard/MOODBOARD.png
"""
from PIL import Image, ImageDraw, ImageFont

D = "assets/raw/moodboard"
F = "/System/Library/Fonts/Helvetica.ttc"
PICKS = [
    ("MB-01_1", "Ground", "Moonlit gravel and sand"),
    ("MB-02_4", "Ground", "Yard floor under a lamp"),
    ("MB-03_2", "Structures", "Concrete wall, lamp pool"),
    ("MB-04_4", "Structures", "Steel gate"),
    ("MB-05_2", "Props", "Generator yard"),
    ("MB-06_2", "Props", "Launcher under a net"),
    ("MB-07_3", "Night light", "Searchlight sweep"),
    ("MB-08_1", "Night light", "The base from above"),
    ("MB-09_1", "Effects", "Smoke in lamp light"),
    ("MB-10_4", "Squad", "Three operators at the wall"),
]
W, H, PAD, COLS = 440, 246, 22, 5
INK, MUTED, BG = (236, 228, 211), (141, 152, 155), (18, 20, 21)

rows = (len(PICKS) + COLS - 1) // COLS
head = 150
board = Image.new("RGB", (PAD + COLS * (W + PAD), head + rows * (H + 64) + PAD), BG)
d = ImageDraw.Draw(board)
d.text((PAD, 28), "Launch Window  ·  Mood board", font=ImageFont.truetype(F, 40), fill=INK)
d.text((PAD, 84), "Night desert base, moonlit blue with warm lamp light, seen from the game's high angle.", font=ImageFont.truetype(F, 18), fill=MUTED)
d.text((PAD, 110), "Original generated images. Each tile stands for one layer of the final art.", font=ImageFont.truetype(F, 18), fill=MUTED)
for k, (name, layer, line) in enumerate(PICKS):
    c, r = k % COLS, k // COLS
    x, y = PAD + c * (W + PAD), head + r * (H + 64)
    board.paste(Image.open(f"{D}/{name}.jpg").convert("RGB").resize((W, H), Image.LANCZOS), (x, y))
    d.text((x, y + H + 8), layer, font=ImageFont.truetype(F, 18), fill=INK)
    d.text((x, y + H + 32), line, font=ImageFont.truetype(F, 15), fill=MUTED)
board.save(f"{D}/MOODBOARD.png")
print("wrote", f"{D}/MOODBOARD.png", board.size)
