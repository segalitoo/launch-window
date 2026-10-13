# Visual language (draft for Gate A)

Status: draft, Session 2. The palette waits for Ran's pick of look A, B or C.
Compare sheet: `assets/raw/blockout/yard_looks_compare.png`.

Each element has one job. No two elements do the same job.

## 1. Camera (fixed, never varies)
- Orthographic, 60 degrees from vertical, 45 degrees around. Exact 2:1 ground diamonds, 64 x 32 px per tile at 100% zoom.
- Every asset is rendered or painted through this camera. `tools/blender/render_iso.py` owns it.

## 2. Scale (fixed)
- One sim tile = 1.6 m.
- A 1.8 m figure is about 44 px tall at 100% zoom (target 40 to 48).
- Walls 2.4 m (about 59 px). Doors 2.2 m. Crates 1.2 m.
- To check: does a 2.4 m wall hide too much floor behind it? See "Open questions".

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
- Muted earth tones. No saturated colour on structures: saturation belongs to the readability layer.

## 6. Night (one grade for the whole mission)
- Art is painted in neutral daylight. The engine multiplies it by a night tint, then multiplies in a light layer.
- `tools/grade_night.py` previews the same steps.

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
1. Which look: A, B or C.
2. Wall height: 2.4 m hides the floor right behind a wall, and ground-level cones appear to cross walls. Lower walls (1.8 to 2 m) or keep them and rely on the hidden-unit outline.
