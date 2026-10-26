# Batch 08 · South strip (Phase 4, area 5, with the south perimeter wall)

One plate: `assets/raw/blockout/south_B_plate_16x9.png` (tiles x 23-45, y 20-29, one tile of margin).

Every run attaches three images: the plate (first), the approved yard painting
`assets/raw/gen/SF-01_yard_paint_1_2k.jpg` (second) and the approved compound painting
`assets/raw/gen/TELS-01A_4_2k.jpg` (third), its north neighbour.
Nano Banana 2.1 in Flow, 16:9, x4. Three options (A, B, C).
Save as `assets/raw/gen/SOUTH-01<option>_<1-4>.jpg`.

Rules every option keeps: the geometry of the plate exactly; sun from the upper left; neutral daylight
(the engine grades to night); the scrub clumps stay clumps (hiding spots); nothing new that looks
solid where the plate is open ground.

## Shared body

```
Repaint the first image, a 3D blockout render, as a finished hand-painted environment for an isometric stealth-tactics PC game from the late 1990s, at high detail. Match the painting style, brushwork, palette and light of the second and third images exactly: they are approved paintings from the same game and the same camera, and the third one is this area's neighbour.

Keep the composition of the first image exactly the same: the camera angle, every wall, the chain-link fence section, the floodlight mast, the generator, the missile launcher trucks, the crates and the scrub clumps, with their positions, sizes and outlines. Do not move, add or remove any structure. Keep the light direction: sun from the upper left, shadows falling to the right.

Surfaces:
- Walls: weathered cast concrete in cool grey, as in the second and third images.
- The fence section is thin grey chain-link wire mesh on posts, see-through.
- The thin mast is a floodlight mast: a steel pole with a small lamp head.
- The green vehicles are olive military missile launcher trucks, as in the third image; the grey floor around them is the concrete slab of the third image.
- The green clumps are low desert scrub, as in the third image.
{OPTION}

Palette: muted neutral grey-khaki and cool concrete, low saturation, neutral daylight, soft sky fill, as in the second and third images. No warm sunset light, no night, no fog.

Style: the same detailed digital painting as the second and third images, visible but controlled brushwork, crisp readable shapes at small scale. No people, no other vehicles, no text, no logos, no flags, no UI.
```

## Options ({OPTION} line)

- **A · Packed earth:** `- Open ground: packed grey-khaki earth and fine gravel inside and outside the wall, scattered small stones, as in the third image.`
- **B · Patrol track:** `- Open ground: packed grey-khaki earth, with a worn patrol track of two tyre ruts running along the inside of the south wall, and pale gravel desert outside the wall.`
- **C · Drifted sand:** `- Open ground: packed grey-khaki earth inside the wall; outside the wall, pale desert sand with soft wind ripples and low drifts piled against the outer face of the wall.`

## Result

Ran picked **A · Packed earth** (26 Oct 2026): `SOUTH-01A_3_2k.jpg`, built as `assets/build/south`:
`python3 tools/cut_occluders.py south assets/raw/blockout/south_B_plate.json assets/raw/blockout/south_B_plate_id.png assets/raw/gen/SOUTH-01A_3_2k.jpg --fade 0 1 0 0`
The compound's mask was redone to fade over it: `python3 tools/cut_occluders.py tels --mask-only --fade 1 0 0 1`
