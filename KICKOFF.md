# Session 1 kickoff

Paste the prompt below into Claude Code, opened in this repo.

---

Read CLAUDE.md, PLAN.md and prototype/NOTES.md first.

**Goal:** Start Phase 0. Set up the project and port the prototype's game logic into a tested, Phaser-free simulation. Then prove the isometric projection with a flat placeholder view.

**Context:** `prototype/launch-window.html` is a working top-down game. Its logic is correct and tested by hand. We keep its behavior and change only the structure and the view.

**Tasks:**

1. Scaffold Vite + TypeScript (strict) + Phaser 4.2.x + Vitest. Pin exact versions. Target Node 22. Add `npm run dev`, `npm test`, `npm run build`, and update the Commands list in CLAUDE.md.
2. Port the sim into `src/sim/`, split by concern: grid and map build, pathfinding (A* plus path smoothing), vision (ray cast, line of sight, near and far zones), guard AI, squad orders, mission (objectives, timer, alarm, win and lose), seeded RNG. Same constants and same behavior as the prototype. Work in tile units.
3. Write Vitest tests for every verified scenario in `prototype/NOTES.md`.
4. Build a flat isometric placeholder in `src/render/`: diamonds for ground, raised blocks for walls and buildings, circles for units, cones projected to iso. Clicking the map moves the selected unit. Pan and zoom work.
5. Add what Vercel needs to build the project. Ran links the repo in Vercel.
6. Tick the finished boxes in PLAN.md.

**Done when:** tests pass, the build passes, the whole map shows in iso, a unit walks a path around walls, and you have checked screenshots at 1280 x 800 and 390 x 844.

**Forbidden:** no real art yet, no new mechanics, no changes to tuning values, no Phaser imports in `src/sim/`.

**Before you start:** list your assumptions and any questions, then wait for my OK.

---

Session 2 (next): the style frame for Gate A. A still of the generator yard at final quality and a concept sheet for Yoav.
