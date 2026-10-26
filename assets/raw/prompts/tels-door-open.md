# Compound steel door, open (Phase 4)

Tool: Google Flow, project "Special ops", Nano Banana 2.1, 16:9, x4.
Input: `assets/raw/gen/TELSDOOR-01_input.png`, the daylight compound painting cropped around the
steel door at tile (35, 22) (painting px 496,1059 to 1056,1374) and upscaled to 1376 x 774.

Prompt:

> Edit this painting. Open the single steel door in the concrete wall: the door leaf swings inward into the walled compound (away from the viewer, toward the concrete slab), turned about 90 degrees on its hinge and standing open against the inside face of the wall. The doorway becomes an empty opening, and the concrete slab floor inside shows through it. Keep everything else exactly the same: same camera angle, same framing and scale, same painted style, same daylight lighting and shadow direction, same colours, same walls, floodlight mast, ground, stones and markings. Do not add people, text or new objects.

Save as `assets/raw/gen/TELSDOOR-01_out_<1-4>.jpg`.

Results: `TELSDOOR-01_out_1..4.jpg`. Picked #4: the wall ends stay where they are and the doorway reads
open, with the leaf folded back against its frame. #1 to #3 moved the wall ends.
Then: `python3 tools/door_patch.py tels 35 22 496 1059 1056 1374 assets/raw/gen/TELSDOOR-01_input.png assets/raw/gen/TELSDOOR-01_out_4.jpg`
(registration ecc 0.9985, drift p90 0.39 px). In game: `TELSDOOR-01_game.jpg`, closed and open.
