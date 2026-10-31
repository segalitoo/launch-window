# Fences, cut (Phase 4 leftover, done in Phase 6)

When Itai cuts a fence tile, the sim opens it, but the painting still showed the mesh. One edit
per fence run removes the mesh; tools/fence_patch.py splits it into one patch per fence tile,
so cutting one tile opens only that gap (the engine paints a tile's patch in when it is cut, the
same path as the door patches).

Tool: Google Flow, project "Special ops", Nano Banana 2.1, 16:9, x4.
Inputs: `assets/raw/gen/FENCE-01_desert_s_input.png` (desert_s painting px 1288,532 to 1832,838;
fence tiles x 10, y 16 to 19) and `FENCE-01_south_input.png` (south painting px 395,468 to
1109,870; fence tiles y 27, x 27 to 33), both upscaled to 1376 x 774.

Prompt:

> Edit this painting. Remove the chain-link mesh and the barbed wire from the fence, and the
> mesh's shadow on the ground, so the ground shows through between the fence posts. Keep every
> metal fence post standing exactly where it is. Keep everything else exactly the same: same
> camera angle, same framing and scale, same painted style, same daylight lighting and shadow
> direction, same colours, same walls, crates, ground, stones and stains. Do not add people,
> text or new objects.

Results: `FENCE-01_<area>_out_<1-4>.jpg`.

## Result

Picked `FENCE-01_desert_s_out_1.jpg` (posts with their angled tops kept; #3 kept the top rail,
which would hang across a cut gap) and `FENCE-01_south_out_1.jpg` (clean posts and shadows).
Registration ECC 0.997 for both. Built with:
`python3 tools/fence_patch.py desert_s 1288 532 1832 838 assets/raw/gen/FENCE-01_desert_s_input.png assets/raw/gen/FENCE-01_desert_s_out_1.jpg 10,16 10,17 10,18 10,19`
`python3 tools/fence_patch.py south 395 468 1109 870 assets/raw/gen/FENCE-01_south_input.png assets/raw/gen/FENCE-01_south_out_1.jpg 27,27 28,27 29,27 30,27 31,27 32,27 33,27`
