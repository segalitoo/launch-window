# Motion capture clips

Source: CMU Graphics Lab Motion Capture Database, http://mocap.cs.cmu.edu
(created with funding from NSF EIA-0196217). BVH conversion by Bruce Hahne (cgspeed),
taken from the copy at https://github.com/Shriinivas/cmubvh.

Terms (CMU, as quoted in the conversion's README): free for use in research and commercial
projects. The data may be included in a commercially sold product, but must not be resold
as data, even converted. The game ships only rendered frames, never these files.
Credit CMU in the game's credits.

| Clip | CMU description | Used for |
| --- | --- | --- |
| 09_01 | run | run cycle, frames 45 to 137 (one stride, 2.55 m, 0.77 s) |
| 90_18 | RugPullFall | death, frames 75 to 165 (0.75 s, standing to lying still) |
| 81_08 | drag heavy object | drag, frames 992 to 1212 (backward steps, hands low in front; the loop with the closest start and end pose) |

| 02_07 | swordplay | takedown strike, frames 55 to 205 (both hands overhead, hard downward blow; the carbine is placed in the hands) |
| 77_16 | laying down, getting up, careful ready pose | guard knocked out from behind: frames 460 back to 220, played backwards (knees give, kneel, face down) |

Used by `tools/blender/render_unit.py` through `tools/blender/mocap.py`.
