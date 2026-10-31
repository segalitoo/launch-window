# UI visual language (Phase 6)

The HUD sits on a painted night map and must read at a glance on a phone held sideways.
Every direction below has one owner element with a grammar: its shape changes to say the
state, so the player reads state without reading text. Colour follows the art rule 6 (flat
overlays): amber means "acting now", red means "alarm", nothing else uses them.

States every direction must show: **available**, **active** (a mode is on, a tool is in use),
**used up** (count 0, stays in the kit), **unavailable** (cannot be used now), **selected**
(the operator you command), **down** (operator lost), **alarm** (status line).

## A · Field kit (owner element: the pouch)

The HUD is gear. Panels are olive canvas with a stitched seam. Each backpack item is a pouch
with a flap; each operator card carries a name tape like the one on a uniform.

| State | The pouch says it by |
| --- | --- |
| available | flap closed, khaki |
| active | flap lifted, amber thread |
| used up | flap open, pouch empty and dark, count 0 stencilled |
| selected | name tape lit, the others dim |
| down | name tape crossed out |

Type: condensed uppercase, like stencilled kit labels.

## B · Night optics (owner element: the bracket)

The HUD is what the operator sees through his optics. Panels are smoked glass, almost
transparent, framed by four corner brackets, the same flat-overlay family as the sight
cones and selection rings on the map.

| State | The bracket says it by |
| --- | --- |
| available | four short open corners |
| active | the corners close into a full amber frame |
| used up | corners grey and broken, icon faint |
| selected | corners lit in the operator's colour and the card leans out |
| alarm | the status line's brackets turn red |

Type: a narrow technical sans, small caps, wide letter spacing.

## C · Mission dossier (owner element: the tag)

The HUD is the operation's paperwork. Panels are paper tags with a punched hole; the
operator cards are file cards with a paper clip on the one in command.

| State | The tag says it by |
| --- | --- |
| available | clean tag |
| active | a red pencil ring around it |
| used up | struck through in red pencil |
| selected | a paper clip on the card |
| down | the card stamped across |

Type: typewriter.

## Decision

Ran picked **A · Field kit** (31 Oct 2026). Built: the pouch states, name tapes, the bundled
Barlow Condensed, and a stencil icon set (filled kit silhouettes cut by stencil bridges,
`src/ui/kitIcons.ts`). B and C were removed from the code; `assets/raw/gen/UI-01_compare.jpg`
keeps them.

## Recommendation (before the pick)

**B · Night optics.** It is the quietest over a painted night map, it belongs to the same
family as the overlays the player already reads (cones, rings), and its grammar (open corners
to closed frame) works at 48 px without text. A is the most "commando" but its olive panels
sit heavy on an olive-grey map. C is the most original but bright paper is the loudest thing
on a night screen.
