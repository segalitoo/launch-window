# Prompt batch 01: style frame and Yoav concept

Session 2, for Gate A. Look B (Moonlit steel), walls 2.0 m.
Run each prompt in Nano Banana. Save each result in `assets/raw/gen/` under the file name given.
If a result is weak, run the same prompt again and add `_2`, `_3` to the name. Send me all of them, good and bad.

General settings:
- Use the highest output resolution Nano Banana offers.
- Aspect ratio 16:9 for SF prompts (same as the attached image). 3:2 for CH prompts.
- One prompt per new chat, so earlier images do not leak in.

---

## SF-01 · Generator yard, painted (main style frame)

Attach: `assets/raw/blockout/yard_B_plate_16x9.png`
Save as: `assets/raw/gen/SF-01_yard_paint.png`

```
Repaint this 3D blockout render as a finished, hand-painted environment for an isometric stealth-tactics PC game from the late 1990s, painted at high detail.

Keep the composition exactly the same: the camera angle, every wall, the steel gate, the generator, the crates, the building on the right, their positions, sizes and outlines. Do not move, add or remove any structure. Keep the light direction: sun from the upper left, shadows falling to the right.

Surfaces:
- Ground outside the walls: pale grey-khaki desert sand and gravel, small stones, tyre tracks, dry scrub patches, subtle wind ripples.
- Ground inside the walled yard: compacted dirt over cracked concrete, oil stains under the generator.
- Walls: weathered cast concrete in cool grey, formwork lines, chipped edges, dust and rain streaks, darker at the base.
- Generator: olive-green industrial diesel generator with a radiator grille, exhaust pipe, fuel tank, control box, warning stickers without readable text.
- Gate: grey painted steel double gate with rust at the edges.
- Crates: worn wooden ammunition crates with rope handles, no markings.
- Building: flat-roofed concrete block building, roof with a few vents and a small water tank.

Palette: muted neutral grey-khaki and cool concrete, low saturation, neutral daylight, soft sky fill. No warm sunset light, no night, no fog.

Style: detailed digital painting with visible but controlled brushwork, crisp readable shapes at small scale, clean edges between objects, like a painted backdrop for a classic isometric tactics game. No people, no vehicles, no text, no logos, no flags, no UI.
```

## SF-02 · Same, more painterly (variant for comparison)

Attach: `assets/raw/blockout/yard_B_plate_16x9.png`
Save as: `assets/raw/gen/SF-02_yard_paint_loose.png`

```
Turn this 3D blockout render into a painted environment for an isometric tactics game, in the style of a gouache matte painting: looser brushwork, painted texture on every surface, hand-made feel, but still crisp at the edges of walls and objects.

Keep the composition exactly the same: the camera angle, every wall, the steel gate, the generator, the crates and the building, their positions, sizes and outlines. Do not move, add or remove anything. Sun from the upper left, shadows to the right.

Surfaces: grey-khaki desert gravel outside, compacted dirt and cracked concrete inside the walled yard, weathered grey concrete walls with stains, an olive-green diesel generator, a grey steel gate, worn wooden crates, a flat-roofed concrete building.

Palette: muted, cool, neutral daylight, low saturation. No people, no text, no logos, no flags, no UI, no night, no fog.
```

---

## CH-01 · Yoav, character turnaround

Attach: nothing.
Save as: `assets/raw/gen/CH-01_yoav_turnaround.png`

```
Character turnaround sheet for an original video game character: front view, side view (facing left) and back view, standing side by side in a neutral relaxed A-pose, full body, same height and scale in all three views, orthographic, on a plain flat mid-grey background with no shadows on the ground. Neutral even studio daylight.

The character: Yoav, call sign "Shadow", a lean special forces infiltrator in his early thirties, 180 cm, wiry build. Night desert raid gear, light and quiet: a dark knit watch cap, a short dark beard, camouflage face paint in dark olive, a slim low-profile plate carrier with a few pouches, a combat knife in a sheath on the left chest, a compact pistol in a thigh holster, fingerless gloves, a small assault pack, desert combat trousers with knee pads, worn tan boots.

Colours: muted olive, khaki and dark brown, no bright colours, no national flags, no unit patches, no insignia, no readable text, no logos.

Style: clean concept art, clear silhouette, readable shapes that would still read at 45 pixels tall, consistent proportions across the three views, semi-realistic, not cartoon, not anime.
```

## CH-02 · Yoav, silhouette variant

Attach: nothing.
Save as: `assets/raw/gen/CH-02_yoav_turnaround_hood.png`

```
Character turnaround sheet for an original video game character: front view, side view (facing left) and back view, side by side, full body, same height and scale in all three views, orthographic, neutral relaxed A-pose, plain flat mid-grey background, even neutral daylight.

The character: Yoav, call sign "Shadow", a lean special forces infiltrator, 180 cm, wiry build. Distinct silhouette: a dark scarf worn as a hood and face wrap that leaves the eyes visible, a slim chest rig instead of body armour, a combat knife in a sheath across the lower back, a compact pistol in a thigh holster, a coiled rope with a small grappling hook on the pack, desert combat trousers, light tan boots.

Colours: muted olive, dusty khaki, charcoal. No bright colours, no national flags, no unit patches, no insignia, no readable text, no logos.

Style: clean concept art, strong readable silhouette that works at 45 pixels tall, consistent proportions in all three views, semi-realistic, not cartoon, not anime.
```

---

## What I do with the results

- SF: I check that the painted image still matches the blockout (walls, gate and generator in the same place, to within a few pixels), then grade it to night in the engine style and put it into the game at the right spot on the iso grid. You then paint over the strongest one for the final style frame.
- CH: you pick one silhouette. It becomes the reference for the 3D model, and I render a 45 px version through the game camera to check that it still reads at game scale.
