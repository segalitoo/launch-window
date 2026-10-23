# Batch 05 · Desert approach and LZ (Phase 4, area 2)

Two plates cover the area, north and south, overlapping by 2 tiles:
`assets/raw/blockout/desert_n_B_plate_16x9.png` (tiles x 0-11, y 0-15) and
`assets/raw/blockout/desert_s_B_plate_16x9.png` (tiles x 0-11, y 14-29).

Every run attaches two images: the plate (first) and the approved yard painting
`assets/raw/gen/SF-01_yard_paint_1_2k.jpg` as the style key (Ran, Phase 4: one style for every area).
Nano Banana 2.1 in Flow, 16:9, x4. Three options (A, B, C), each run on both plates so the halves match.
Save as `assets/raw/gen/DESERT-01<option>_<n|s>_<1-4>.jpg`.

Rules every option keeps (CLAUDE.md art rules): the geometry of the plate exactly; sun from the upper
left; neutral daylight (the engine grades to night); the scrub clumps stay where they are and stay
clumps (they are hiding spots in the game); the round pad stays a round landing pad; nothing new that
looks solid where the plate is open ground (a player would think it blocks).

## Shared body

```
Repaint the first image, a 3D blockout render, as a finished hand-painted environment for an isometric stealth-tactics PC game from the late 1990s, at high detail. Match the painting style, brushwork, palette and light of the second image exactly: it is the approved style key, from the same game and the same camera.

Keep the composition of the first image exactly the same: the camera angle, every wall, the fence, the building, the crates, the road, the scrub clumps and the round landing pad, with their positions, sizes and outlines. Do not move, add or remove any structure. Keep the light direction: sun from the upper left, shadows falling to the right.

Surfaces:
- The darker straight band is a dirt road: packed earth with two worn tyre tracks and loose gravel at its edges.
- The green clumps are low desert scrub bushes, dense and dry, olive and grey-green, each clump clearly one mass of bushes.
- The round grey pad is a weathered concrete helicopter landing pad with a faded painted ring, sand drifted over its edge.
- Walls: weathered cast concrete in cool grey, as in the second image.
- Chain-link fence on posts: thin grey wire mesh you can see through.
{OPTION}

Palette: muted neutral grey-khaki and cool concrete, low saturation, neutral daylight, soft sky fill, as in the second image. No warm sunset light, no night, no fog.

Style: the same detailed digital painting as the second image, visible but controlled brushwork, crisp readable shapes at small scale. No people, no vehicles, no text, no logos, no flags, no UI.
```

## Options ({OPTION} line)

- **A · Gravel plain:** `- Open ground: pale grey-khaki desert sand and gravel, small stones, faint tyre tracks, sparse tufts of dry grass, as in the second image.`
- **B · Scrub and wadi:** `- Open ground: pale grey-khaki gravel desert crossed by a shallow dry stream bed with rounded pebbles, scattered low flat rocks lying flush with the ground and small dry grass tufts, no bushes besides the scrub clumps.`
- **C · Wind-blown sand:** `- Open ground: pale grey-khaki sand with soft wind ripples and low drifts piled against the walls and the scrub, a few half-buried stones, very little vegetation besides the scrub clumps.`

## Result

Ran picked **A · Gravel plain** (23 Oct 2026): `DESERT-02A_n_3_2k.jpg` (north) and
`DESERT-02A_s_2_2k.jpg` (south), built as `assets/build/desert_n` and `desert_s`:
`python3 tools/cut_occluders.py desert_n assets/raw/blockout/desert_n_B_plate.json assets/raw/blockout/desert_n_B_plate_id.png assets/raw/gen/DESERT-02A_n_3_2k.jpg --fade 0 0 0 0`
`python3 tools/cut_occluders.py desert_s assets/raw/blockout/desert_s_B_plate.json assets/raw/blockout/desert_s_B_plate_id.png assets/raw/gen/DESERT-02A_s_2_2k.jpg --fade 0 1 0 0`
