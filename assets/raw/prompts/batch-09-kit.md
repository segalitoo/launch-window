# Batch 09 · Rucksacks and tools for the HUD (Phase 6)

Ran, 31 Oct 2026: the inventory looks like a military rucksack, one per operator, standing in the
right rail; the selected operator's tools are painted items strapped on top of it. Tools stay buttons.
Forbidden: anything that copies the Commandos backpack screen; text in the art.

Every run attaches the approved yard painting `assets/raw/gen/SF-01_yard_paint_1_2k.jpg` as the
style key. Nano Banana 2.1 in Flow, 16:9, x4. Saved as `assets/raw/gen/KIT-01_packs_<1-4>.jpg` and
`KIT-01_tools_<1-4>.jpg`. Items are painted on a plain flat grey ground so a script can cut them out.

## Packs

```
A hand-painted game inventory illustration in the exact painting style, brushwork and palette of the attached image (a late-1990s isometric stealth game). Three military rucksacks standing upright side by side, evenly spaced, each fully visible with space around it, seen from the front and slightly above. Left: a small light assault pack, olive drab canvas, one front pouch, compression straps. Middle: a slim recon pack in faded khaki-olive, two side pouches, a rolled foam mat strapped under the lid. Right: a large heavy sapper rucksack in dark olive, an external frame, a big front pocket, coiled cord clipped to the side. Worn military canvas and webbing, buckles, stitching, dust; muted earth tones, low saturation. Neutral daylight from the upper left, soft shadows falling to the right on the packs themselves. Plain flat light grey background (#cfcfcf), no floor, no cast shadow on the background, no props, no people, no text, no logos, no insignia, no flags.
```

## Tools

```
A hand-painted game item sheet in the exact painting style, brushwork and palette of the attached image (a late-1990s isometric stealth game). Eight separate field items laid out in a neat grid of four columns and two rows, evenly spaced, each fully visible with clear space around it, seen from slightly above, all at a similar size. Top row, left to right: a coil of dark green nylon rope with a loose end; a fist-sized grey stone; a cylindrical olive smoke grenade with a ring pull; a pair of olive military binoculars. Bottom row, left to right: an enemy soldier's tan uniform shirt folded with a peaked cap on top; a small spool of thin wire with two metal tent pegs; a block of plastic explosive in olive wrap with a small radio receiver and a short antenna; a hand-held remote detonator, a black box with a red button and an antenna. Worn, used, realistic military gear, muted earth tones, low saturation. Neutral daylight from the upper left, soft shadows on the items themselves. Plain flat light grey background (#cfcfcf), no table, no cast shadow on the background, no people, no text, no labels, no logos.
```

## Result

Picked `KIT-01_packs_3.jpg` (clear silhouettes, three sizes) and `KIT-01_tools_2.jpg` (every item reads; the cap has no insignia). Cut with `tools/cut_items.py` into `assets/build/kit/`. In the HUD each tool sits on a light canvas patch so dark kit (rope, detonator) reads on the olive pack.
