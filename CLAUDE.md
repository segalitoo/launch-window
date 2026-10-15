# Launch Window

An isometric stealth-tactics game for the browser, in the style of Commandos 1 (1998).
Three Israeli commandos sabotage missile launchers at a fictional Iranian base before a launch countdown ends.
All content is original.

## Working with Ran

Ran is the owner and art director. He is a senior designer who also builds software.

- Write in plain English, CEFR B2. Short sentences, no filler, no em dashes.
- Short or vague request: first rewrite it as a full prompt (goal, context, output, what is forbidden). Show it, explain what you added and why, and wait for his OK.
- Complex task: list your assumptions, ask the questions that raise your confidence, and confirm the goal and output before you build.
- Explain the reasoning behind technical and design decisions.
- Never say something works until you have run it. Test first, then report.
- Find problems yourself before Ran points them out. Do not repeat a mistake inside a session.
- End answers on complex tasks with: Confidence (0.0 to 1.0), key caveats and biases. Mark any uncertain data point with ❌.

## Source of truth

| File | Role |
| --- | --- |
| `PLAN.md` | Phases, checklists, decisions. Tick boxes as work is done. |
| `prototype/launch-window.html` | The working top-down prototype. Open it in a browser to play. Port logic from here. |
| `prototype/NOTES.md` | Every mechanic and tuning value in the prototype, plus verified test scenarios. |
| `KICKOFF.md` | The first prompt for Session 1. |

Live build (main): https://launch-window-segalitoo-8173s-projects.vercel.app. Every pushed branch gets a Vercel preview link.

The live plan is a Claude doc: https://claude.ai/code/artifact/b1c9e4e6-6e2d-4840-bab3-9c96a695f580
`PLAN.md` is a snapshot of it. If they differ, ask Ran which one is current.

## Locked decisions

- View: isometric, 2:1 tiles (64 x 32 px), fixed camera, no rotation.
- Art: painted ground and paint-overs, plus 3D-rendered characters and props.
- Stack: TypeScript (strict), Phaser 4 (4.2.x), Vite, Vitest, Tiled for map data, Vercel preview links.
- Time: 8 hours a week, as two 4-hour sessions.
- Scope: one mission, Operation Night Lantern, to full quality. New ideas go to the backlog in `PLAN.md`.

## Architecture rules

- `src/sim/` is pure game logic. No Phaser, no DOM, no `window`. It must run in Node for tests.
- The sim uses a fixed timestep `update(dt)` and a seeded RNG. Same inputs give the same result.
- The sim works on a top-down tile grid. Isometric exists only in `src/render/`.
- Projection for 64 x 32 tiles: `screenX = (x - y) * 32`, `screenY = (x + y) * 16`, where x and y are in tiles.
- Depth order: split structures into 1-tile pieces and sort every object by its centre (`x + y`), then by height. For 1-tile pieces and small units this matches what the eye expects wherever sprites overlap. (Changed in Phase 1: the old front-corner rule hid a unit standing just south of a wall's corner.)
- Painted areas: the painting is one ground image; each blocking tile's part of it is cut out as an occluder sprite (mask from the Blender ID pass) and depth-sorted with the units.
- A unit hidden behind a structure is drawn as a colored outline. The player must never lose a unit.
- `src/render/` reads sim state and sends commands. It never changes sim state directly.
- `src/ui/` is DOM over the canvas: squad panel, inventory, minimap, briefing.
- Tiled maps (`maps/*.tmj`) hold data only: collision, doors, launchers, routes, spawns, triggers. Ground art is painted images, not Tiled tiles.

## Folder layout

```
src/sim/        pure game logic + tests
src/render/     Phaser scenes, iso projection, depth sort
src/ui/         DOM panels
maps/           Tiled files
assets/raw/     sources: .blend, .psd, prompts (large files, see .gitignore)
assets/build/   atlases and images the game loads
tools/          Blender render script, atlas packer
prototype/      the original single-file prototype, read-only
```

## Art style rules

1. Camera: fixed isometric view on 2:1 tiles. No rotation.
2. Ground: painted and textured, shadows built into the painting. Never flat tiles.
3. Scale: characters about 40 to 48 px tall at 100% zoom, on a large detailed map.
4. Palette: muted earth tones. Paint in neutral daylight, grade to night in the engine.
5. Light: one direction for every asset, from the top left. Shadows fall to the bottom right.
6. Readability: sight cones, selection rings and icons draw on top of the art in flat colors.

## Content rules

- Never copy Commandos maps, sprites, portraits, UI layout, icons, sounds or names.
- Reference screenshots are for mood only. Never trace them or use them as image prompts.
- The base and all units are fictional. No civilians.

## Commands

Keep this list current. Node 22 (`.nvmrc`); Vercel builds with Node 22.

- `npm run dev` start the dev server (http://localhost:5173)
- `npm test` run all tests once (Vitest)
- `npm run test:watch` run tests in watch mode
- `npm run build` type-check the app, type-check `src/sim` without DOM types, then build to `dist/`
- `npm run preview` serve the production build
- Motion library: `/motion.html` on the dev server or any preview link shows every unit animation and interaction at game speed, under the night grade, with its source (motion capture clip or formula). Review animation changes there.
- Edit the map: open `maps/night-lantern.tmj` in Tiled. Layers and object types are listed at the top of `src/sim/tiled.ts`. Save, and the dev server reloads it; `npm test` catches a broken map with a clear message.
- `~/Downloads/Tiled.app/Contents/MacOS/tmxrasterizer maps/night-lantern.tmj /tmp/map.png` draw the map as Tiled sees it, without opening Tiled (Tiled 1.12.2 lives in ~/Downloads)
- `python3 tools/editor_tiles.py` rebuild `maps/editor-tiles.png` (tile 6 = fence, Phase 3), the colour squares Tiled shows (never used in the game)
- `node tools/export-map.mjs` export the sim map to `assets/raw/blockout/map.json` for Blender
- `/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/render_iso.py -- --map assets/raw/blockout/map.json --out assets/raw/blockout --name yard --region 11 20 25 30 --look B` render a map region through the iso camera (see the file header)
- `/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/render_unit.py -- --unit yoav --out assets/raw/units/yoav` build, rig and render a unit (10 animations in 8 directions, 424 frames; about 3 min). The final drawn look (D3, `--look outline_pop`) is the default; `--look render` gives the plain render. After a run, check that `meta.json` is new: Blender sometimes crashes on launch without writing anything (docs/lessons.md)
- `/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/render_takedown.py -- --yoav assets/raw/units/yoav --guard assets/raw/units/guard` render the knife takedown pair (both units in one scene, IK contact); run after render_unit.py for both units
- `python3 tools/pack_unit.py yoav` trim and pack the rendered frames into `assets/build/units/yoav-N.png` pages and `yoav.json` (Phaser multi-atlas)
- `python3 tools/grade_night.py assets/raw/blockout/yard_B_day.png --hud` preview the engine's night grade and the overlay
- `python3 tools/door_patch.py yard 16 27 231 300 791 615 <crop.png> <edited.jpg>` turn an image-model edit of a door (opened) into an RGBA patch the engine paints in when the sim opens that door (see the file header and `assets/raw/prompts/gate-open.md`)
- `python3 tools/check_align.py <plate.png> <painted.jpg>` measure how far a painting drifted from its blockout, and write a red-edge overlay
- `python3 tools/import_paint.py <plate.json> <painted.jpg>` put a painting back on the iso grid (writes `_day.png` and a sidecar)
- `node tools/proto-check/build.mjs <dir>` build an instrumented prototype copy for timing cross-checks (see the file header)

## Definition of done for a session

1. `npm test` and `npm run build` pass.
2. Screenshots checked at 1280 x 800 and 390 x 844.
3. Work is on a branch `session/NN-short-name`, pushed, with a Vercel preview link.
4. `PLAN.md` checkboxes are updated.
5. A short summary for Ran: what changed, what to playtest, what is next.
