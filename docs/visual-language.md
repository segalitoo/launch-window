# Visual language (draft for Gate A)

Status: draft, Session 2. Look B (Moonlit steel) chosen by Ran. Walls 2.0 m.
Compare sheet: `assets/raw/blockout/yard_looks_compare.png`.

Each element has one job. No two elements do the same job.

## 1. Camera (fixed, never varies)
- Orthographic, 60 degrees from vertical, 45 degrees around. Exact 2:1 ground diamonds, 64 x 32 px per tile at 100% zoom.
- Every asset is rendered or painted through this camera. `tools/blender/render_iso.py` owns it.

## 2. Scale (fixed)
- One sim tile = 1.6 m.
- A 1.8 m figure is about 44 px tall at 100% zoom (target 40 to 48).
- Walls 2.0 m (about 49 px), just taller than a standing figure, so they read as cover. Doors 1.9 m. Crates 1.2 m. Buildings 3.2 m.
- Decided in Session 2: 2.4 m hid too much floor and made cones seem to cross walls.

## 3. Light (fixed, one direction for everything)
- Sun from the screen's top left: ground direction west with a little south, 48 degrees up.
- Shadows fall to the right and slightly down on screen.
- Top faces brightest, the left visible face dim, the right visible face darkest.

## 4. Ground (varies by area, says "what surface is this")
- Painted, never flat tiles. One painted image per area, from seamless textures.
- Surfaces: sand (outside), compacted yard floor, road, concrete slab.
- Shadows are painted into the ground.

## 5. Structures and props (vary, say "what is this object")
- 3D blockout from the map data, rendered through the camera, then painted over.
- Look B palette: grey-khaki sand and gravel, cool grey concrete, olive machinery, worn wood. Low saturation, neutral daylight.
- No saturated colour on structures: saturation belongs to the readability layer.

## 6. Night (one grade for the whole mission)
- Art is painted in neutral daylight. The engine multiplies it by a night tint, then multiplies in a light layer.
- `tools/grade_night.py` previews the same steps.
- Look B tint: (0.36, 0.43, 0.60), "moonlit". The first, darker tint (0.24, 0.30, 0.44) hid the painted detail. Measured on SF-01 #1: ring 5.3:1, amber cone 6.3:1.
- Lamp pools: about 4 tiles across.

## 6b. Units at night (Session 2 test)
- At 44 px under the environment's night grade, every Yoav concept almost vanished into the ground. Camouflage works too well.
- Rule (approved by Ran): units get a lighter grade than the environment, (0.62, 0.68, 0.82) against (0.36, 0.43, 0.60). Test: `assets/raw/gen/CH_unit_grade_test.png`.
- Add a subtle cool rim light from the top left in the character render. A painted rim at full strength looked like a white outline.
- Keep one light value on each operator (tan trousers did this job in the test), so the figure separates from the blue ground.

## 6c. Squad look (Ran, Session 2)
- The squad reads as Israeli soldiers: solid olive drab uniform, top and trousers the same olive. Knee pads.
- Kit: high-cut olive helmet with a night vision mount and headset, or a knit cap with headset for the stealth role; olive balaclava; slim olive plate carrier or chest rig.
- Coyote tan accents only: gloves, a few pouches, the carbine, boots. These are the figure's light values at night.
- No flags, unit patches or insignia. The unit is fictional.
- Decided: Yoav = CH-03 #1 (`assets/raw/gen/CH-03_yoav_idf_helmet_1.jpg`). Every operator wears a helmet (Ran: Israeli soldiers always do), so the three must differ by other means. See "Telling the squad apart".
- Real photos are mood references only and are never attached to an image prompt (CLAUDE.md content rules). Prompts: `assets/raw/prompts/batch-02.md`.

## 7. Lamp light (varies, says "this spot is lit")
- Warm pools from lamps on the light layer. The only warm light at night.
- The pools are visual only for now. Sight rules do not change (no new mechanics).

## 8. Readability layer (fixed, says "this is gameplay")
- Flat colours drawn over the art: amber guard cones, red during an alarm, squad colours for rings and outlines.
- Measured on the night grades (WCAG contrast, 2:1 would fail):
  - A: ring 6.4:1, amber 6.2:1. B: ring 6.9:1, amber 6.6:1. C: ring 4.4:1, amber 4.5:1.
  - The cone fill at its current alpha is only about 1.6:1 over the floor in every look. Phase 1: raise the fill or add an edge line at night.

## Words
- **Look**: the daylight palette of the painted art (A, B or C).
- **Grade**: the night tint the engine applies to all art.
- **Light layer**: lamp pools multiplied over the graded art.
- **Overlay**: the readability layer (rule 8).

## Open questions
1. Does Nano Banana keep the blockout's geometry when painting over it? First test: `assets/raw/prompts/batch-01.md`.
2. Yoav's silhouette: watch cap (CH-01) or hood and face wrap (CH-02).
