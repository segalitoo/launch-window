# Batch 07 · Launch compound (Phase 4, area 6, with the north-east and east perimeter walls)

One plate: `assets/raw/blockout/tels_B_plate_16x9.png` (tiles x 26-45, y 0-23, one tile of margin).

Every run attaches three images: the plate (first), the approved yard painting
`assets/raw/gen/SF-01_yard_paint_1_2k.jpg` (second) and the approved courtyard painting
`assets/raw/gen/COURT-01B_3_2k.jpg` (third), its west neighbour.
Nano Banana 2.1 in Flow, 16:9, x4. Three options (A, B, C).
Save as `assets/raw/gen/TELS-01<option>_<1-4>.jpg`.

Rules every option keeps: the geometry of the plate exactly; sun from the upper left; neutral daylight
(the engine grades to night); the scrub clump stays a clump (a hiding spot); nothing new that looks
solid where the plate is open ground.

## Shared body

```
Repaint the first image, a 3D blockout render, as a finished hand-painted environment for an isometric stealth-tactics PC game from the late 1990s, at high detail. Match the painting style, brushwork, palette and light of the second and third images exactly: they are approved paintings from the same game and the same camera, and the third one is this area's neighbour.

Keep the composition of the first image exactly the same: the camera angle, every wall, building, the floodlight masts, the three missile launcher trucks, the crates, the fence and the scrub clump, with their positions, sizes and outlines. Do not move, add or remove any structure. Keep the light direction: sun from the upper left, shadows falling to the right.

Surfaces:
- Walls: weathered cast concrete in cool grey, as in the second and third images.
- The three green vehicles are military missile launcher trucks: olive drab, each with a long pale missile lying in its cradle, seen from above, detailed but matte.
- The thin masts are floodlight masts: a steel pole with a small lamp head.
- The green clump is low desert scrub, as in the third image.
- Outside the inner walls: packed grey-khaki earth, as in the third image.
{OPTION}

Palette: muted neutral grey-khaki and cool concrete, low saturation, neutral daylight, soft sky fill, as in the second and third images. No warm sunset light, no night, no fog.

Style: the same detailed digital painting as the second and third images, visible but controlled brushwork, crisp readable shapes at small scale. No people, no other vehicles, no text, no logos, no flags, no UI.
```

## Options ({OPTION} line)

- **A · Concrete slab:** `- The grey floor inside the inner walls: a weathered concrete slab in large square panels with dark expansion joints, oil stains under the trucks and faded yellow lines marking a bay for each truck.`
- **B · Blast-scarred tarmac:** `- The grey floor inside the inner walls: dark worn tarmac with old soot scorch marks behind each truck, patched repairs and grit along the walls.`
- **C · Dusty pad:** `- The grey floor inside the inner walls: pale concrete half covered by wind-blown sand drifted against the walls, tyre tracks in the dust between the trucks.`

## Result

Ran picked **A · Concrete slab** (23 Oct 2026): `TELS-01A_4_2k.jpg`, built as `assets/build/tels`:
`python3 tools/cut_occluders.py tels assets/raw/blockout/tels_B_plate.json assets/raw/blockout/tels_B_plate_id.png assets/raw/gen/TELS-01A_4_2k.jpg --fade 1 0 0 0`
