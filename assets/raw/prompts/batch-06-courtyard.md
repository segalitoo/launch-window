# Batch 06 · Courtyard (Phase 4, area 4, with the north perimeter wall)

Ran, 23 Oct 2026: the perimeter wall is painted with its neighbours, not as its own area. The west
wall and main gate came with the desert; the courtyard takes the north wall above it.

One plate: `assets/raw/blockout/court_B_plate_16x9.png` (tiles x 12-26, y 0-20, one tile of margin).

Every run attaches three images: the plate (first), the approved yard painting
`assets/raw/gen/SF-01_yard_paint_1_2k.jpg` (second) and the approved desert painting
`assets/raw/gen/DESERT-02A_n_3_2k.jpg` (third), so the courtyard matches both neighbours.
Nano Banana 2.1 in Flow, 16:9, x4. Three options (A, B, C).
Save as `assets/raw/gen/COURT-01<option>_<1-4>.jpg`.

Rules every option keeps: the geometry of the plate exactly; sun from the upper left; neutral daylight
(the engine grades to night); the scrub clumps stay clumps (hiding spots); nothing new that looks solid
where the plate is open ground.

## Shared body

```
Repaint the first image, a 3D blockout render, as a finished hand-painted environment for an isometric stealth-tactics PC game from the late 1990s, at high detail. Match the painting style, brushwork, palette and light of the second and third images exactly: they are approved paintings from the same game and the same camera, and this area lies between them.

Keep the composition of the first image exactly the same: the camera angle, every wall, building, roof, the thin floodlight mast, the generator, the missile trucks, the crates, the fence, the road and the scrub clumps, with their positions, sizes and outlines. Do not move, add or remove any structure. Keep the light direction: sun from the upper left, shadows falling to the right.

Surfaces:
- Walls: weathered cast concrete in cool grey, as in the second image.
- The two flat-roofed buildings are a barracks (the long one) and a motor pool workshop: concrete walls, flat roofs of tarred sheet with vents and a few patched panels, seen from above.
- The thin mast is a floodlight mast: a steel pole with a small lamp head.
- The darker straight band is the dirt road from the third image, continuing into the base.
- The green clumps are low desert scrub bushes, as in the third image.
{OPTION}

Palette: muted neutral grey-khaki and cool concrete, low saturation, neutral daylight, soft sky fill, as in the second and third images. No warm sunset light, no night, no fog.

Style: the same detailed digital painting as the second and third images, visible but controlled brushwork, crisp readable shapes at small scale. No people, no vehicles besides the missile trucks, no text, no logos, no flags, no UI.
```

## Options ({OPTION} line)

- **A · Packed earth:** `- Open ground inside the walls: packed grey-khaki earth and fine gravel, worn tyre tracks along the road, scattered small stones, as in the third image.`
- **B · Concrete aprons:** `- Open ground inside the walls: packed grey-khaki earth, with flat cracked concrete aprons in front of the two buildings, oil stains and tyre marks on the concrete.`
- **C · Swept military yard:** `- Open ground inside the walls: raked pale gravel kept clean, a narrow line of whitewashed edge stones lying flush along the road, faint boot and tyre marks.`

## Result

Ran picked **B · Concrete aprons** (23 Oct 2026): `COURT-01B_3_2k.jpg`, built as `assets/build/court`:
`python3 tools/cut_occluders.py court assets/raw/blockout/court_B_plate.json assets/raw/blockout/court_B_plate_id.png assets/raw/gen/COURT-01B_3_2k.jpg --fade 1 0 0 0`
