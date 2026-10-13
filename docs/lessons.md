# Lessons (Launch Window)

Project-specific lessons. General rules go to `~/.claude/lessons/creative-projects.md`.

## Session 2: style frame and squad (14 Oct 2026)

- **Paint over a blockout, then measure the drift.** Nano Banana kept the Blender blockout's geometry within 0.3 px at game scale. `tools/check_align.py` (phase correlation plus a red-edge overlay) proves it in seconds. An affine fit (ECC) chased painted texture and reported false drift; plain shift measurement plus the overlay was the honest check.
- **Grade tuned on flat blockouts is too dark for painted art.** The first night tint hid all painted detail. Re-check the grade on the first painting.
- **Test characters at game scale, under the grade, early.** Every concept nearly vanished at 44 px on the night ground. Fix: units get a lighter grade than the environment; keep one light value on each figure (tan accents).
- **Tell same-uniform characters apart by silhouette above the shoulders** (antenna, ladder, breaching bar), checked as flat black shapes at game scale. Helmets alone make them identical.
- **Real photos are mood only.** Describe the kit in words; attach only our own generated art (an approved sheet) to keep one style across a set.
- **Flow automation:** the page images are the 1K originals when the tile is scrolled into view; fetching off-screen tiles gives previews. Scroll each tile into view, then fetch. The viewer's download menu gives the 2K upscale.
