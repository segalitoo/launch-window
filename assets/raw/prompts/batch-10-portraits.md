# Batch 10 · Squad portraits (Phase 6)

Ran, 31 Oct 2026: the squad cards get portraits rendered from the 3D models, painted over.
The plate is `tools/blender/render_portrait.py` (a low-poly blockout through a close camera);
the image model paints over it so the kit, pose and framing stay the model's.
Forbidden: anything that copies the Commandos portraits; text, insignia, flags or unit marks;
a real person's face. The squad wear balaclavas (their game model has no bare face).

Every run attaches two images: first the plate, then the approved yard painting
`assets/raw/gen/SF-01_yard_paint_1_2k.jpg` as the style key. Nano Banana in Flow, 1:1, x4.
Saved as `assets/raw/gen/PORT-01_<unit>_<framing>_<1-4>.jpg`.

Round 1 picks the framing on Yoav only (three options: face, bust, side). Noa and Itai follow
in the picked framing.

## Prompt

```
Paint over the first image as a hand-painted game character portrait, in the exact painting style, brushwork and palette of the second image (a late-1990s isometric stealth game). Keep the first image's framing, camera angle, pose and every piece of kit exactly: {KIT}. Turn the low-poly shapes into real worn gear: canvas, webbing, stitching, scuffs, dust. The face is covered by a balaclava with only the eyes showing, calm and alert. Muted earth tones, low saturation. Neutral daylight from the upper left, soft shadows to the right. Plain flat mid-grey background. No text, no logos, no insignia, no patches, no flags, no badges.
```

KIT per unit:

- yoav: `an olive combat helmet with a night-vision mount on the front, olive ear protectors, an olive balaclava, an olive plate carrier, a short radio whip antenna rising from a small assault pack behind the shoulder, a tan bullpup carbine across the chest, tan gloves`
- noa: `a combat helmet with a tan cloth cover, a radio headset with a boom microphone and no night-vision mount, an olive balaclava, a small hair bun at the back of the neck, an olive plate carrier, a tall radio whip antenna rising from a radio pack behind the shoulder, a black carbine across the chest, tan gloves`
- itai: `an olive combat helmet with a night-vision mount on the front, olive ear protectors, an olive balaclava, an olive plate carrier, a tall heavy rucksack behind the shoulders with the end of a steel breaching bar sticking up behind his head, a black pump shotgun across the chest, tan gloves; a big broad-shouldered man`

## Result, round 1

Ran picked **A · face** (`PORT-01_yoav_face_2.jpg`): the only framing that reads on the card on a
phone (`PORT-01_compare.jpg`). He also asked for a smaller name tape and no health dots (health
now shows as a red bar over the portrait once an operator is hurt).

## Result, round 2

Noa `PORT-01_noa_face_3.jpg` and Itai `PORT-01_itai_face_3.jpg`: their heads match Yoav's size, so the three cards read as one set. In the game: `assets/build/portraits/{shadow,lure,sapper}.jpg`.
