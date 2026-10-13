# Prototype notes

`launch-window.html` is the original single-file prototype (Oct 2026). Open it in a browser to play.
It is read-only reference. Port its logic into `src/sim/`; do not edit it.

## World

- Grid: 46 x 30 tiles, 24 px per tile in the prototype. The sim should work in tile units.
- Tile codes: `#` wall, `B` building, `c` crate, `D` locked door, `d` open door, `G` generator, `L` launcher, `T` searchlight tower, `.` ground.
- All of `# B c D G L T` block movement and sight.
- Pathfinding: 8-direction A*, no corner cutting, then greedy smoothing with a 7 px clearance check.
- Line of sight: grid ray cast (DDA) against sight-blocking tiles.
- Map layout, guards and objects: see `newGame()` in the prototype.

## Squad

| Operator | Speed (px/s) | Notes |
| --- | --- | --- |
| Yoav, Shadow | 84 | Knife takedown within 1.15 tiles if the guard does not see him. Drags bodies. |
| Noa, Lure | 72 | Decoy: range 8 tiles, guards within 7 tiles hear it, 4 charges. Throw takes 0.35 s, flight 0.6 s. |
| Itai, Sapper | 60 | Door 2 s, generator 2.5 s, launcher 3.5 s. Picks the interaction spot with the shortest walk. |

- Crawl: speed x 0.45. Dragging a body: speed x 0.55, cannot crawl.
- HP 3 each. Losing any operator fails the mission.

## Guards

- Sight cone: 70 degrees, 6.5 tiles long. Near zone = inner 50%. Cone is 15% longer during an alarm.
- Suspicion per second: near zone 3.2, far zone 1.1, far zone while crawling 0. Decay 0.45 per second. At 1.0 the alarm starts.
- During an alarm, any visible operator is spotted at once.
- Speeds (px/s): patrol 40, investigate 62, return 46, combat 74.
- Post guards sweep their facing with a sine wave. One post guard spins.
- Investigate: walk to the noise, then search for 3.5 s, sweeping +/- 0.85 rad, then return. If the walk is longer than 30 tiles, search in place.
- Shooting: first shot 0.9 s after combat starts (0.7 s if already alerted), then every 1.25 s, 1 damage, always hits.
- A guard who sees a downed guard raises the alarm (once per body).

## Searchlights

- 9 tiles long, 20 degrees wide, sweep between two angles. They see crawling operators too.
- Suspicion 1.6 per second. Cutting the generator turns them off for good.

## Alarm and timer

- Countdown 8:00. During an alarm it runs at double speed.
- Alarm ends 18 s after no guard or light sees any operator. Guards then return to their posts.
- The prototype pauses the game when an alarm starts, so the player can react.
- All three launchers rigged: the countdown stops. Win when all three operators stand in the LZ.

## Verified scenarios (headless browser, Oct 2026)

Port these as tests.

1. An operator 1 tile in front of a post guard triggers the alarm within 0.6 s.
2. Yoav ordered to take down a post guard from behind succeeds, no alarm.
3. Yoav picks up a body, and it follows him as he moves.
4. A decoy near the yard guard puts him in "investigate", and he returns to his post later.
5. Itai, crawling, breaches the yard gate from outside without an alarm.
6. Scripted run: breach yard gate, decoy into the yard corner, take down the yard guard, hide the body, cut power. Zero alarms.
7. Continued: ambush the south patrol from behind the crates, breach the compound door, decoy the spinning guard, take him down, rig TEL-3.
8. Forcing all launchers rigged with all operators in the LZ ends in a win.
9. Letting the timer reach 0 ends in "launch" (loss).

## Known gaps

- No clean run through TEL-1 and TEL-2 verified yet. Difficulty there is untuned.
- Units pass through each other and through guards.
- Guards always hit. No cover system.
- No save, no load, no sound.
