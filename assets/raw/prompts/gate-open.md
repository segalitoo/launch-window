# Yard gate, open (Phase 2)

Tool: Google Flow, project "Special ops", Nano Banana 2.1, 16:9, x4.
Input: `assets/raw/gen/GATE-01_input.png`, the daylight yard painting cropped around the gate
(painting px 231,300 to 791,615) and upscaled to 1376 x 774.

Prompt:

> Edit this painting. Open the double metal gate in the concrete wall: both gate leaves swing
> inward into the walled yard (toward the generator), turned about 90 degrees on their hinges at
> the two wall ends, standing open flat against the inside faces of the wall. The gateway becomes
> an empty opening, and the yard floor shows through it. Keep everything else exactly the same:
> same camera angle, same framing and scale, same painted style, same daylight lighting and shadow
> direction, same colours, same walls, generator, ground, stones and stains. Do not add people,
> text or new objects.

Results: `GATE-01_out_1..4.jpeg`. Picked #3: both leaves swing inward and the gateway reads open.
#1 and #4 swing the left leaf out onto the sand; #2 leaves the right leaf outside.
Then: `python3 tools/door_patch.py yard 16 27 231 300 791 615 assets/raw/gen/GATE-01_input.png assets/raw/gen/GATE-01_out_3.jpeg`
