# PixelLab handoff: what is done, what is left, how to finish it

**For:** whoever finishes the PixelLab animation work next, whether that's a GPT agent or a
person. It assumes nothing beyond this repository and a PixelLab API key.

**Status:** 4 October 2026, branch `feat/district-attacks`. **Credits left: 32 of 2,000
subscription generations** (check before you start; see section 3).

Read `docs/ANIMATION_HANDOFF.md` sections 1, 2 and 4 first. They cover the sheet format, how the
game picks frames, and how to check and install a sheet. This page covers only the PixelLab
pipeline and the remaining jobs.

## 1. What is done

| Sheet | Character | Status |
|---|---|---|
| `alex-aim`, `alex-dash` | Alex | shipped (PR #56) |
| `spritzer-attack`, `mascot-attack`, `roofer-attack` | | shipped (PR #56) |
| attack sheets for all 7 bosses | santa, glamour-queen, whiskers, zamboni, manager, owner, developer | shipped (PR #57) |
| `shopper-attack` | Bargain Hunter | shipped (PR #59, GPT pilot + Pixel Forge, not PixelLab) |
| `poodle-attack`, `elf-attack`, `goon-attack` | district monsters | **shipped on this branch**, registered, live-checked |
| `walker-hurt`, `elf-hurt` | Mall Walker, Elf | **banked** in `art/pixellab/` (generated, not wired) |
| `spritzer-hurt`, `poodle-hurt`, `goon-hurt` | district monsters | **banked** in `art/pixellab/` |
| `mascot-hurt` | Mascot Brute (132 px canvas) | **banked** in `art/pixellab/` |

"Banked" means the PNG is generated and aligned, but it is **not** in `public/` and the game
doesn't use it yet. Each still needs the V1 wiring in section 4. Don't regenerate it: that wastes
credits.

### Known defects in what exists

- **`goon-attack`:** the hockey stick changes colour between facings (white, brown or black)
  and is missing from frame 0 in some rows. In the SE row the figure is about 9% taller. It is
  usable at game scale, but a person should look at it. Fix it by hand, or with
  `recolor.py` (add a RULES entry), rather than spending credits: a redo follows the same
  character rotations, so it comes back the same.
- **`walker-hurt`:** the north row (row 4) has a **white impact flash baked into frames 1–2**.
  Erase it before wiring, because the game draws its own flash and impact strip.
- **`spritzer-hurt`:** baked effects: sparks under the feet in S frame 1, motion lines in E,
  perfume bottles falling in N. Erase them before wiring.
- **`mascot-hurt`:** a small yellow spark in the E row, frames 0–1. Erase it.
- **`poodle-hurt`:** the collar is red in most facings and teal in N/NE/E. Recolour it to red
  (`recolor.py`), or leave it; it's tiny at game scale.
- **All hurt strips:** `collect` warns "height ×0.90" on some rows. That is the flinch (the head
  snaps back), not a scale drift, so it's expected.

## 2. What is still left (in priority order)

1. **Wire the banked hurt strips** (code only, no credits). Follow `docs/VISUAL_ROADMAP.md`
   **V1**: copy `tests/unit/hanger-reactions.test.ts`, add the kind to `MATERIAL_REACTIONS` in
   `src/game/view/EnemyReactionView.ts`, register the keys, add a `CombatFeedback.onHit`
   branch, and make an impact strip of 6 frames × 48 px in the enemy's material:

   | Kind | Material |
   |---|---|
   | Walker | sweat drops and tracksuit fabric |
   | Elf | glitter |
   | Spritzer | perfume mist |
   | Poodle | pink fur |
   | Goon | ice chips |

   The impact strips are tiny; draw them or generate them with image generation, not
   PixelLab animation.
   - Every one of these kinds has a timed wind-up, so `hurtOutranksAttack` stays false for
     them.
   - Only the Walker could set it to true, because it has no wind-up.
   - The hurt sheets come back on a grown canvas (Walker 100 px, Elf 108 px, and so on). The
     reaction view's `frameSize` must be the sheet's actual frame size, and `feetY` must follow
     the V1 formula for that canvas.
2. *(Mascot hurt is banked; it cost 13. Wire it like the others; its attack keeps priority.)*
3. **Roofer hurt** (`d6eb1ca9-7b67-4f9e-909c-18eac03de22f`): the canvas is about 136 px, so
   about 13–25 credits, so it fits in what is left. Do it next.
4. **Bargain Hunter hurt** (`shopper-hurt`): **no PixelLab character exists** for the Bargain
   Hunter. Its walk sheet came from elsewhere. Draw it with image generation plus Pixel Forge
   (branch `pixel-forge-rig`, `bargain-hunter-finish/`), as was done for its attack, not
   PixelLab.
5. **Spitter hurt:** it has no walk sheet, so build it from its idle strip. Not PixelLab.
6. **Boss hurt strips:** they are 160–216 px, about 32–40 credits each. Don't start these
   without more credits.
7. **`walker-attack` and `static-attack`:** `enemySpriteSheet` names these keys, but
   `attackFrameFor` **never selects** them:
   - The Walker is a contact enemy, with no wind-up.
   - The Static's `blink` is not mapped to any frames.

   Each needs a code change, written test-first, before art is worth generating. Leave them
   unless the owner asks.

## 3. The pipeline

Everything lives in `art/pixellab/`. You need `PIXELLAB_API_KEY` in the environment, and you
must **never print it**.

```bash
# Credits left (subscription "generations")
curl -s -H "Authorization: Bearer $PIXELLAB_API_KEY" https://api.pixellab.ai/v2/balance

python3 -W ignore art/pixellab/animate_characters.py submit  <name> [<name>...]  # queue; writes jobs.json
python3 -W ignore art/pixellab/animate_characters.py topup   <name>              # re-queue directions dropped by 429s
python3 -W ignore art/pixellab/animate_characters.py collect <name>              # wait, download, align, pack the sheet
python3 -W ignore art/pixellab/animate_characters.py redo    <name> <direction> [<direction>...]  # regenerate drifted rows
python3 -W ignore art/pixellab/animate_characters.py publish <name>              # copy losslessly into public/ (after review)
python3 art/pixellab/check_sheet.py art/pixellab/<name>.png public/assets/neon/enemies/<name>.png --frames N
python3 art/pixellab/recolor.py <name>                                            # fix palette drift (rules in the file)
```

**To add a job,** add a tuple to `ANIMATIONS` in `animate_characters.py`:
`(name, character_id, frames, prompt, output path)`. The prompt should open with
"keeps its … exactly as it is;" and then describe the motion in order. Copy the
`poodle-attack` or `elf-hurt` entries.

**Save as you go.** Commit `art/pixellab/jobs.json` after every `submit` or `topup`, and commit
the PNG after every `collect`. If credits or the session run out mid-job, the next session runs
`collect <name>` and picks up the finished directions without paying again.

### Character IDs

| Character | ID | Walk canvas |
|---|---|---|
| Rabid Poodle | `2ea97b6f-6dba-456c-ad71-5ad4b6528780` | 92 |
| Animatronic Elf | `d0c9c0ba-7a72-43c5-8f23-514bf5f6854e` | 92 |
| Hockey Goon | `82aa6f6f-d930-4dc4-bb77-cf54300ae902` | 92 |
| Perfume Spritzer | `cd520aac-8bba-4d2f-a244-96fe2c7af2a5` | 92 |
| Mall Walker | `287ef491-a0c0-4326-a4f6-2b5fd114f5db` | 92 |
| Mascot Brute | `2370b80c-ac64-49c3-8b07-f225c9e23de7` | 128 |
| Roofer | `d6eb1ca9-7b67-4f9e-909c-18eac03de22f` | 136 |
| Alex | `943aa1b2-012d-4991-ad6b-3fbe34635d9c` | |

For the boss IDs, see the boss entries in `ANIMATIONS`. The Bargain Hunter has no PixelLab
character.

### Measured costs (subscription generations)

The cost depends on character size, not on the number of frames:

| Character size | Per direction | Per 8-facing animation |
|---|---|---|
| 92 px | about 1 | about 8–10 |
| 104–108 px | about 1.3 | about 10 |
| 128–132 px | about 1.6–3 | about 13–24 |
| 160–216 px | about 4–5 | about 32–40 |

Directions dropped by a 429 and then topped up are not charged twice.

### Gotchas we already hit

- **429 / concurrency.** PixelLab runs only a few directions at once, and `submit` silently
  queues fewer than 8. Run `topup <name>` (wait about a minute between tries) until `jobs.json`
  has all 8.
- **ZIP 423.** `collect` downloads the character ZIP, which returns 423 while anything on that
  character is still generating. `collect` retries; just let it wait.
- **v3 follows the character, not the prompt.** If the character's own rotations are navy, or
  bigger than the shipped walk sheet, the animation will be too. A redo won't fix that. Use
  `recolor.py` for palette drift and `ACTION_FIGURE_SCALE` in
  `src/game/view/ActorSpriteView.ts` for size drift (`collect` prints the factor).
- **Read the drift warnings.** `collect` compares each row with the walk sheet (feet, height and
  mean colour). An attack lunge or a hurt flinch legitimately changes the height, while a
  colour offset above about 15 is usually real drift. Always look at a 2× preview before
  `publish`.
- **Baked-in effects.** PixelLab sometimes paints a hit flash or motion lines into a frame (the
  `walker-hurt` north row). Erase them, because the game draws its own.
- **Canvas growth.** Action sheets come back on a larger canvas than the walk sheet (92 → 100–108
  px). `collect` grows it evenly and re-registers the feet. The registration test in
  `tests/unit/derived-action-sheets.test.ts` checks this for every registered attack sheet.

## 4. Installing a sheet (attack or hurt)

1. Write the test first: add `[key, file, width, height]` to the registration list in
   `tests/unit/derived-action-sheets.test.ts` (attack sheets), or copy
   `tests/unit/hanger-reactions.test.ts` (hurt). Run it and watch it fail.
2. Run `publish <name>`, then register the key in `src/game/presentation/assets.ts`.
3. Run the unit tests and `npx tsc --noEmit`.
4. Check it live (debug server, then capture):
   ```bash
   VITE_ENABLE_DEBUG_BRIDGE=true npx vite --host 127.0.0.1 --port 4180 --strictPort &
   CHROME=/opt/pw-browsers/chromium node scripts/live-capture-actions.mjs --only poodle,elf,goon --out artifacts/live-qa/<dir>
   fuser -k 4180/tcp
   ```
   The report lists the frames seen during the telegraph (`frames`) and after it (`charge`).
   District monsters spawn from the `mvp-district` fixture:
   - floor 1: elves, in `back_hall`;
   - floor 2: Spritzers;
   - floor 3: Poodles;
   - floor 4: Goons.
5. Update STATUS.md, TEST_EVIDENCE.md and NEXT_SESSION.md. Presentation only: no `src/sim`
   change and no balance run.
