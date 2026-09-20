# DEAD MALL — projection convention

**Decided 2026-09-20.** Authored against by every art asset from here on, so it
is written before the assets rather than inferred from them afterwards.

## The model

3/4 top-down, defined narrowly:

- the world is a **flat 2D plane**, z = 0 at the floor
- sprites are **upright and anchored at their feet**
- draw order is sorted by **world y** (painter's algorithm)
- **not isometric** — no skew, no rotated floor grid. `SOURCE_BRIEF.txt` forbids it
  ("no isometric perspective unless specifically appropriate"), so this is the only
  reading of "3/4 top-down" the brief permits.

```
screen_x = world_x
screen_y = world_y - sprite_height_at_base
anchor   = bottom-centre of the sprite = the world position
```

## What does NOT change

Collision, attack range, line of sight, and every other sim calculation stay in
plain 2D world space. This is the entire payoff of the `AGENTS.md` rule that
`src/sim` must not know about Phaser: projection is a view-layer decision, and
`grep` confirms the sim has no screen-space references.

## Sizes and the vertical budget

| Thing | Size | Why |
|---|---|---|
| internal viewport | **640 × 360** | ×3 = **1920×1080 exactly** |
| floor tile | 32 × 32 | drawn 1:1, no skew |
| wall-normal | 32 wide × **64** tall | two tile-rows of presence |
| wall-low | 32 × 32 | sightline-critical corridors only |

**The viewport was reopened because 960×480 cannot integer-scale to 1080p:** at ×2
it gives 1920×960 and leaves 120px of letterbox; at ×2.25 it fills the screen but
every pixel is unevenly sized. 640×360 × 3 is exact. Pixel art wants integer
scaling, so 640×360 is the correct internal resolution and 960×480 was the
outlier — the three art-bible files were right and the code was not.

At 360 tall, 360 / 32 = **11.25 floor rows** are visible.

## Draw order

Sort the **whole** list once, not layer by layer:

| order | band |
|---|---|
| 1 | floor |
| 2 | floor decals (blood, damage, scuffs) |
| 3 | flat props (pickups, rubble, paper) |
| 4 | upright props, entities, walls — **interleaved, all sorted by world y** |
| 5 | overhead (signage, ceiling, cable runs) |

The critical rule is band 4: entities and walls must be sorted **together**. Sort
them by category and the player gets drawn on top of a wall they are standing
behind, which reads as a bug at exactly the moment the game is trying to be tense.

## Occlusion

Walls occlude, deliberately. In a mall horror game, not being able to see around
a corner is the mechanic.

- default wall height **64**
- use **wall-low (32)** where the player must read enemies across an opening
- **no** transparency/fade system — it is real work, and it deletes the atmosphere
  it is meant to reveal
- darkness does the work instead

## Asset rules (Aseprite)

- export at native size; no scaling, no filtering
- bottom-centre is the anchor — keep transparent margin **above**, never below
- walls: baseboard and floor-contact shadow live in the **bottom** rows, because
  the base is what sits on the floor line
- overlays that should sit on any floor stay **RGBA** with a transparent surround

## What this means for what already exists

| Asset | Verdict |
|---|---|
| `floor-terrazzo / tile-beige / tile-accent / carpet / carpet-damaged` | **correct as-is** — floors are flat and drawn 1:1 |
| `column-32`, `railing-glass-32`, `security-gate-32` | **correct as-is** — RGBA, base-anchored, which is exactly the overlay model |
| `wall-h-32`, `wall-v-32`, `wall-corner-32` | **right orientation, wrong size** — base already at the bottom, lit surface already at the top; they need to grow 32 → 64 tall, not be redesigned |

## The code change, when it lands

Bounded, and it must land **with** the wall rewrite because both touch the same
file:

- `src/main.ts` — 960×480 → 640×360
- `src/game/view/EntityView.ts` — layout constants are hardcoded to 960/480
  (`fillRect(0, 0, 960, 480)`, a 924×444 floor inset 18, a grid running to 942/462);
  these become derived from the viewport rather than literal
- `EntityView.sync` — anchor at feet, and sort the full draw list by world y
- `RunScene` — load textures; there is no loader in the project today

**Nothing breaks:** the repo has no `toHaveScreenshot`, no snapshots and no
pixelmatch, and `src/sim` has zero screen-space references. So this is a
view-layer change only — which is what the sim/render split was built to allow.
