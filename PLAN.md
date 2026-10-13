# Launch Window: Build Plan

Snapshot of the live plan, 14 Oct 2026: https://claude.ai/code/artifact/b1c9e4e6-6e2d-4840-bab3-9c96a695f580

## Goal and decisions

Rebuild Launch Window as one finished isometric mission in the style of Commandos 1. At 8 hours a week this is about 18 weeks of work (an estimate ❌).

| Decision | Choice | Why |
| --- | --- | --- |
| View | Isometric 3/4 view, like the original | It is the core of the look. Top-down cannot get there. |
| Art | Mix: painted ground and paint-overs, 3D-rendered characters and props | Painting gives the mood. 3D keeps every sprite consistent in 8 directions. |
| Workflow | Git repo + Claude Code on Ran's Mac | Real art files and many source files outgrow a single page. |
| Time | 8 h a week, as two 4 h sessions | Each session ends with something playable. |
| Scope | One mission, Operation Night Lantern, to full quality | A second mission waits until v1 is done. |
| Toolkit | Full proposal (assumed) | Not confirmed yet. See the toolkit section. |

Ran is the art director. He approves every look gate, retouches key art and playtests. Claude writes the code, the pipeline scripts and the image prompts, and tests each build.

## Target look

We match how the original reads, never what it contains.

- **Camera:** fixed isometric view on 2:1 tiles (64 x 32 px). No rotation.
- **Ground:** painted and textured, with shadows built into the painting.
- **Scale:** small characters, about 40 to 48 px tall at 100% zoom, on a large, detailed map.
- **Palette:** muted earth tones. Painted in neutral daylight, graded to night in the engine.
- **Light:** one light direction for all assets (from the top left).
- **Readability:** sight cones, selection rings and icons draw on top of the art in flat colors.

We never copy maps, sprites, portraits, UI layout, icons, sounds or names.

## Tech stack

| Layer | What it holds | Tool |
| --- | --- | --- |
| Simulation | Grid, pathfinding, sight cones, guard AI, orders, timer. No drawing code. Unit-tested. | TypeScript + Vitest, ported from the prototype |
| Map data | Collision, doors, launchers, patrol routes, spawn points, triggers | Tiled editor, isometric map, read as JSON |
| Rendering | Iso projection, depth order, camera, sprite animation | Phaser 4 (v4.2.1, July 2026) |
| Occlusion | A unit behind a building shows as a colored outline | Custom shader or outline pass |
| UI | Squad panel, inventory, minimap, briefing | DOM over the canvas |
| Build and test | Local builds, a preview link per session | Vite + Vercel |

## Art pipeline

| Asset | How it is made | Tools | Ran | Claude |
| --- | --- | --- | --- | --- |
| Ground | Painted base per area from seamless textures | Higgsfield image model, Photoshop | Paints blends, approves | Prompts, tiling, import |
| Walls and buildings | 3D blocks from the Tiled footprint, rendered in iso, painted over | Blender, image-to-image, Photoshop | Paint-over, approves | Blockout and render scripts |
| Props | Image-to-3D or simple model, rendered in iso | Higgsfield 3D (GLB), Blender | Approves silhouettes | Render script, atlas |
| Operators and guards | 3D model, rigged, animated, 8 directions | Higgsfield 3D, Mixamo, Blender | Approves turnaround and poses | Render and pack scripts |
| Dog | Four-legged rig | Meshy or Tripo rigging, Blender | Approves | Render script |
| Effects | Searchlights, cones, muzzle flash, smoke, explosions | Code, particles, a few sprites | Approves | Builds |
| UI and portraits | Figma panels, image-model portraits with one style guide | Figma, Higgsfield | Designs, retouches | Builds |

Character pipeline:

1. Concept sheet: front, side and back.
2. Image-to-3D model, cleaned in Blender.
3. Mixamo rig and animations: idle, walk, run, crawl, knife, drag, throw, work, hit, death.
4. Blender script renders 8 directions per frame from the fixed iso camera.
5. A filter matches the render to the painted ground.
6. Frames are packed into one atlas.

## Toolkit and enemies

| Operator | Tool | Solves | State |
| --- | --- | --- | --- |
| Yoav, Shadow | Knife takedown | A lone guard with his back turned | Built |
| Yoav, Shadow | Drag body | A body in a patrol's view | Built |
| Yoav, Shadow | Tie up | Downed guards wake after 60 s unless tied | New |
| Yoav, Shadow | Hiding spots | Bushes and dark corners | New |
| Yoav, Shadow | Silenced pistol, 3 rounds | A guard he cannot reach | New |
| Noa, Lure | Noise decoy | Pull guards off a path | Built |
| Noa, Lure | Binoculars | Show one guard's full patrol route | New |
| Noa, Lure | Smoke grenade | Block all sight in an area for 8 s | New |
| Noa, Lure | Captured uniform | Walk past regular guards | New |
| Itai, Sapper | Breach door, cut power, plant charge | Locked routes, searchlights, the objective | Built |
| Itai, Sapper | Wire cutters | Cut a new hole in the outer fence | New |
| Itai, Sapper | Tripwire | Takes out the next guard who walks through | New |
| Itai, Sapper | Remote charge | A loud diversion far from the team | New |

| Enemy | Behavior | Counter |
| --- | --- | --- |
| Guard | Patrols or stands post | Everything above |
| Officer | Sees through the uniform, calls nearby guards | Knife from behind, pistol |
| Dog | Smells operators in a circle, even crawling or disguised | Smoke, tripwire, pistol |
| Camera | Fixed sweep, needs power | Cut power, smoke |

## Roadmap

| Phase | Hours | Dates (estimate ❌) | Gate |
| --- | --- | --- | --- |
| 0 · Setup, style frame | 8 | Oct 19 to Oct 25 | A: look approved |
| 1 · Engine port | 16 | Oct 26 to Nov 8 | |
| 2 · Vertical slice | 16 | Nov 9 to Nov 22 | B: slice feels right |
| 3 · Toolkit, enemies | 32 | Nov 23 to Dec 20 | |
| 4 · Map art | 32 | Dec 21 to Jan 17 | |
| 5 · Character art | 16 | Jan 18 to Jan 31 | |
| 6 · UI | 8 | Feb 1 to Feb 7 | |
| 7 · Audio, polish | 16 | Feb 8 to Feb 21 | C: release candidate |

About 144 hours. Re-plan at each gate.

## Phase checklists

### Phase 0. Setup and style frame (8 h)

- [x] Repo, CLAUDE.md, Vite + Phaser 4 + TypeScript, Vercel preview (https://launch-window-segalitoo-8173s-projects.vercel.app)
- [x] Port the prototype's logic into src/sim with unit tests
- [x] Mood board of about 10 references, for mood only (original generated tiles: assets/raw/moodboard/MOODBOARD.png)
- [x] Style frame: one still of the generator yard at final quality (SF-01 #1, approved as is; board: assets/raw/gen/GATE-A_board.png)
- [x] Yoav concept sheet: front, side, back (CH-03 #1; Noa CH-05 #3 and Itai CH-06 #2 too)
- [x] Gate A: Ran approves palette, light direction and character scale (approved 14 Oct 2026)

### Phase 1. Engine port (16 h)

- [ ] Iso projection and camera: pan, pinch, zoom (placeholder done in Session 1; pinch not yet tested on a real phone)
- [ ] Mission map rebuilt in Tiled and loaded into the sim grid
- [ ] Depth sorting for units, props and buildings
- [ ] Outline for units hidden behind buildings
- [ ] Sight cones and searchlights drawn in iso
- [ ] All prototype mechanics work with placeholder art
- [ ] Preview plays on iPhone

### Phase 2. Vertical slice (16 h)

- [ ] Generator yard at final art: ground, walls, gate, generator, crates
- [ ] Night grade and light layer: lamp glow, searchlight beam
- [ ] Yoav: model, rig, 10 animations in 8 directions, one atlas
- [ ] Guard: idle, walk, death
- [ ] Gate B: does it feel like Commandos? If not, fix the pipeline before scaling it

### Phase 3. Toolkit and enemies (32 h)

- [ ] Yoav: tie up, hiding spots, silenced pistol
- [ ] Noa: binoculars, smoke, captured uniform
- [ ] Itai: wire cutters, tripwire, remote charge
- [ ] Officer, dog, camera
- [ ] Backpack inventory panel, placeholder art
- [ ] A small test map per tool, then rebalance the main mission and timer

### Phase 4. Map art, area by area (32 h)

- [ ] Five remaining areas, in the build order below

### Phase 5. Characters and enemies art (16 h)

- [ ] Noa and Itai, full animation sets
- [ ] Guard full set, officer, dog

### Phase 6. UI (8 h)

- [ ] Squad panel with portraits, backpack, minimap
- [ ] Briefing screen with a painted mission map

### Phase 7. Audio and polish (16 h)

- [ ] Footsteps per surface, alarm siren, Hebrew team radio
- [ ] Phone performance pass: atlas sizes, frame rate
- [ ] Playtests with 3 people, final balance
- [ ] Gate C: release candidate

## Map art build order

Every area passes five layers in order: ground, structures, props, night light, effects.

| # | Area | Main assets | Phase | Status |
| --- | --- | --- | --- | --- |
| 1 | Generator yard | Yard walls, gate door, generator, crates | 2 | Not started |
| 2 | Desert approach and LZ | Sand, scrub, rocks, road, helipad | 4 | Not started |
| 3 | Perimeter wall and main gate | Wall run, gate, gate posts | 4 | Not started |
| 4 | Courtyard | Barracks, motor pool, crates, searchlight tower | 4 | Not started |
| 5 | South strip | Wall side, second tower, crate stack | 4 | Not started |
| 6 | Launch compound | Concrete slab, inner walls, steel door, 3 launcher trucks | 4 | Not started |

## How a session runs

1. **Brief (10 min):** pick the next unchecked items. Claude restates goal, assumptions and done criteria.
2. **Build (about 3 h):** Claude Code works in the repo. Art jobs run while code is written.
3. **Test (20 min):** unit tests, screenshots at desktop and phone size.
4. **Preview (5 min):** push the branch, get a Vercel preview link.
5. **Review (20 min):** Ran plays the preview, comments, ticks the checklist.

## Risks

| Risk | Effect | Fallback |
| --- | --- | --- |
| Generated art drifts in style | The map looks like a collage | Fixed prompts, palette and light rule. Paint-overs. 3D for anything that repeats. |
| Depth sorting and hiding behind buildings | Units pop in front of walls | Solve it in Phase 1 with placeholder blocks |
| Image-to-3D models are messy | Bad silhouettes, broken rigs | Simple low-poly Blender models instead |
| Scope creep | v1 never ships | One mission only. Ideas go to the backlog. |
| Phone performance | Low frame rate on iPhone | Test from Phase 1. Atlas max 2048 px. |
| Estimates are guesses | The 18 weeks slip | Re-plan at each gate. Cut Phase 7 polish first. |
| Real-world conflict theme | Store review problems if published | Fictional base and units, no civilians. Check store rules first. |

## First session

Ran prepares:

- [x] Create the GitHub repo `launch-window`
- [ ] Install Claude Code (desktop app Code tab, or the terminal CLI), Blender, Tiled and Node 22 (all installed except Node 22; Node 24 works locally)
- [ ] Make sure Higgsfield has credits for about 40 image generations and 5 3D models
- [ ] Collect about 10 mood references: night desert bases, isometric strategy games, military gear

Claude does in Session 1: see `KICKOFF.md`.

## Backlog

New ideas go here, not into the current phase.
