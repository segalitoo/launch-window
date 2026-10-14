# Lessons (Launch Window)

Project-specific lessons. General rules go to `~/.claude/lessons/creative-projects.md`.

## Session 2: style frame and squad (14 Oct 2026)

- **Paint over a blockout, then measure the drift.** Nano Banana kept the Blender blockout's geometry within 0.3 px at game scale. `tools/check_align.py` (phase correlation plus a red-edge overlay) proves it in seconds. An affine fit (ECC) chased painted texture and reported false drift; plain shift measurement plus the overlay was the honest check.
- **Grade tuned on flat blockouts is too dark for painted art.** The first night tint hid all painted detail. Re-check the grade on the first painting.
- **Test characters at game scale, under the grade, early.** Every concept nearly vanished at 44 px on the night ground. Fix: units get a lighter grade than the environment; keep one light value on each figure (tan accents).
- **Tell same-uniform characters apart by silhouette above the shoulders** (antenna, ladder, breaching bar), checked as flat black shapes at game scale. Helmets alone make them identical.
- **Real photos are mood only.** Describe the kit in words; attach only our own generated art (an approved sheet) to keep one style across a set.
- **Flow automation:** the page images are the 1K originals when the tile is scrolled into view; fetching off-screen tiles gives previews. Scroll each tile into view, then fetch. The viewer's download menu gives the 2K upscale.

## Session 5: Yoav in the engine (14 Oct 2026)

- **The sim's move speed is a run.** Yoav moves 3.5 tiles/s (5.6 m/s). A walk cycle at that speed flickers at about 33 fps. Normal moves play the run (1.6 tiles per cycle); dragging a body plays the walk (0.85 tiles per cycle). Tie the frame to distance walked, not time, so the feet never slide.
- **Measure render brightness against the approved concept.** The first render was about 25% darker than the concept and nearly vanished at night. Lifting the albedo and a slightly harder sun for units only brought it within 10%.
- **Freeze the pose on pause.** Choosing the frame from "moved this frame" snapped units to idle when paused. Use "has a path" for moving, and distance for the frame.
- **Silhouette only when most of the unit is covered.** A full squad-colour silhouette over a unit whose boots alone are behind a low wall turned him into a green blob. Show it when 2 of 3 sample points (boots, belt, helmet) are hidden.
- **Before saying a visual element is fixed, find every place that draws it.** The unit ring was drawn twice: my new ground ring, and a Phase 1 selection ring on the overlay. I fixed one, reported it fixed, and Ran still saw a ring on top of Yoav. Grep for the shape (`strokeEllipse`) and check the screenshot with the unit selected and moving.
- **Combat crawl bends the knee sideways.** In a prone pose, a forward-axis knee bend lifts the foot into the air. Measure joint heights in Blender instead of judging from one camera angle: two views disagreed until the numbers settled it.
- **Trim unit frames before packing.** 424 frames at 192 x 144 would need several 2048 pages; trimmed to their visible pixels they fit one page (2043 x 1181). Phaser's multi-atlas restores the trim, so the anchor still holds.

## Session 5b: motion (14 Oct 2026)

- **Interactions are pairs.** A takedown drawn as two separate animations never lines up. Pose both rigs in one Blender scene on one timeline, use IK to pin contact points (hands on the head and waist, feet on the ground), render each unit with the other hidden, and make the sim place them the same way the animation does.
- **Measure contact, don't eyeball it.** Printing hand-to-target distances and foot heights per frame found the floating legs and the overlapping bodies at once; stills hid them.
- **The art scale makes the prototype's speeds look fast.** At 1.6 m per tile, Yoav's run is 5.6 m/s and a patrol walk 2.7 m/s, about twice real life, so feet-locked cycles play twice as fast. Decide speeds with the motion library's pace switch.
- **Ran's direction on the takedown:** a commando knife, not a swung weapon. Left hand over the mouth from behind, knife into the side at the waist, lowered to the ground.

- Blender 5.2 headless sometimes crashes on its first launch while compiling GPU (Metal) kernels, and writes no frames and no error you would grep for (an NSException at the end of the log). Hit three times in Phase 2. After every render, check that `meta.json` exists and the frame count is right; on a miss, run it again (a loop of up to 3 tries is enough).
