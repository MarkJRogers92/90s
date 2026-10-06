# Handoff to GPT: drawn hurt strips for DEAD MALL (2026-10-04)

For an agent with GPT image generation (in ChatGPT, Codex or similar) picking up the work a Claude
Code cloud session did. Read `AGENTS.md` first (the repo rules), then `STATUS.md` and
`NEXT_SESSION.md` (newest entry at the top), then this file. Branch:
`claude/pixel-forge-image-generation-go3b0z`, pushed, no pull request opened.

> **Update 2026-10-05: `main` moved on; this file's state sections are partly superseded.**
> GPT picked this work up from `70c4061` and merged it as PR #69 (the **shipped strip is now main's
> corrected one**, west row replaced, other seven rows identical to the candidate). Also on main: #68
> (a refused Images API call is reported clearly and the job stays runnable), #70 (source-pinned
> consistency checks and a review-only west recoil fixture), #71 and #72 (the damaged vending machine).
> Read `art/enemy-reactions/shopper-hurt/README.md` on main for the current art. `convert_gpt_hurt.py` and
> `gpt-sheet-raw.png` here are the provenance of `original-candidate.png` (the pre-correction sheet),
> not of the shipped strip. The live flinch now has a reproducible check, the dev-only `mvp-hunter-hurt`
> fixture (a real ranged hit during `pursue`) and `tests/browser/hunter-hurt-review.spec.ts`; per main's
> README that browser run was pending. **It was run from this branch on 2026-10-06 and passed**: the west
> flinch is seen live (see `TEST_EVIDENCE.md`); the other seven facings were not captured live.

## 1. What was done

The Bargain Hunter's flinch is now a **drawn** 4-frame × 8-facing strip instead of the walk frame
squashed and stretched (roadmap V1, `docs/VISUAL_ROADMAP.md`). Presentation only; no `src/sim`
change, no balance change.

| Commit | What |
|---|---|
| `899ffe3` | The drawn strip and everything around it: art folder, build script, tests, live-capture fix, docs |
| `7fc7d25` | `tools/pixel-forge/scripts/cloud-gpt-setup.sh`: one-command Codex setup for cloud sessions |
| `bb270f3` | `restore`: lets a cloud session restore a login the owner stored as an environment secret |

- **Art:** `art/enemy-reactions/shopper-hurt/` has the raw GPT sheet, `job-spec.json` (the Pixel Forge
  job), `convert_gpt_hurt.py` and the converted `shopper-hurt.png`. **Read its README** for the
  provenance and the open review items. It ships as `public/assets/neon/enemies/shopper-hurt.png`.
- **Build:** `art/enemy-reactions/materials/build_material_reactions.py` copies that sheet (the
  `DRAWN` table) so a rebuild keeps it. The build is deterministic: it rewrote all 34 strips and only
  this one differed from what was committed.
- **Tests:** `tests/unit/shopper-hurt-art.test.ts` (18 tests, written first, 17 failed first) and
  `tests/support/png.ts` (reads sprite pixels in tests).
- **Capture script:** `scripts/live-capture.mjs --attack` now aims along the line to the target. Before,
  it pointed a few pixels from Alex for an enemy standing on him and never connected.

## 2. What was verified, and what was not

Verified (see `TEST_EVIDENCE.md`, top entry):
- Full unit suite 1,938 of 1,938 (181 files); `npx tsc --noEmit` and `npm run build` pass.
- `art/pixellab/check_sheet.py` reports 0 px registration error in all eight facings.
- Live (debug build, Chromium): the new sheet is served and loads, 0 console errors, two mop hits
  landed on the Bargain Hunter.

**Not verified. Do not claim these:**
- **The flinch itself was never seen on screen.** A mop hit lands while the hunter is in its own
  telegraph, charge or recover, and an attack pose outranks a flinch by design
  (`flinchOutranksAttack`). The flinch only shows while it walks (`pursue`). A ranged weapon from a
  distance, or a fixture that holds it in `pursue`, would show it. Kiting with the bot died first.
- **The art is review-only.** Pixel Forge and `check_sheet.py` check format and registration, not
  drawing quality. Review items (in the README): figures a little stockier and more shaded than the
  walk figure; the east row's bag side unchecked; chest mark a brown stain, not the walk art's
  checkered patch; the walk sheet's own bags differ (cream in SW/SE, none in W/E).
- The browser suite was not rerun (art swap and a dev script only).

## 3. Next work, most useful first

1. **Look at the Bargain Hunter strip in motion and fix what's wrong** (a person, or a live frame).
2. **The remaining derived hurt strips**, most-seen first. All are 4 frames × 8 facings, rows in
   `ACTOR_DIRECTION_ORDER` (south, southwest, west, northwest, north, northeast, east, southeast):

   | Kind | Hurt sheet today | Frame | Notes |
   |---|---|---|---|
   | Spitter | 256×512 | 64 px | derived from its idle strip (no walk sheet) |
   | Manager | 384×768 | 96 px | |
   | Owner | 512×1024 | 128 px | |
   | Developer | 720×1440 | 180 px | |
   | Santa, Glamour Queen, Mr Whiskers, Zamboni | 640×1280 | 160 px | |
   | LP Manager | 256×512 | 64 px | |

   Bosses flinch over 2/2/2/1 ticks (`NATIVE` in `src/game/view/EnemyReactionView.ts`). To move a kind
   from derived to drawn: add it to `DRAWN` in the build script, drop it from `DERIVED`, copy the
   Bargain Hunter's test and folder layout. `convert_gpt_hurt.py` is **specific to the 96 px Bargain
   Hunter** (frame size, the southeast bag fix): generalise it, don't reuse it blindly.
3. **Death strips** for kinds still on the generic blood death, and the `walker-attack` /
   `static-attack` sheets (each needs a code change first; see `docs/PIXELLAB_HANDOFF.md` §2).
4. The other open items in `docs/VISUAL_ROADMAP.md` (check each item's status there first).

## 4. How to generate

You may have a native image tool, which is the path Pixel Forge was built for
(`tools/pixel-forge/docs/GPT_IMAGE_PAIR.md`, "Native caller workflow"): `begin`, then `dispatch`,
then you call your own image tool with the returned prompt and reference paths, then `accept`.
**That path was not run in this session**, so treat it as documented, not proven. What was run
(from Claude, through the Codex bridge, `tools/pixel-forge/docs/CODEX_NATIVE_BRIDGE.md`, field notes at
the end) taught these things, which apply to any route:

- **Spell the character out in the job prompt.** The references were right and the first result was
  still a healthy man instead of the undead shopper: the orchestrator rewrote the short prompt in
  its own words (`revised_prompt` in the receipt) and dropped the traits. Name every identifying
  trait and put the don'ts in `constraints`.
- **Inspect the mockup before the sheet.** Correct it before spending the sheet stage.
- **The sheet comes back off-grid.** A 4 × 8 request returned 887 × 1774 px (2.31× the game's scale,
  soft edges). Pixel Forge rejects that and its `normalize` needs a whole-number grid. Convert it
  locally; `art/enemy-reactions/shopper-hurt/convert_gpt_hurt.py` is a worked example (area
  downscale, hard alpha, register each facing row like `check_sheet.py`, keep every frame inside its
  cell). Then run `python3 art/pixellab/check_sheet.py <sheet> public/assets/neon/enemies/<kind>-hurt.png
  --frames 4` **without `--fix`** (it writes into `public/`) and compare each facing with the walk sheet.
- **A job allows at most 3 follow-ups** (`forge/image_pair.py`). Chain a new job from the best accepted
  image for more.
- **Never interrupt a `run`.** The turn starts within seconds; an interrupted one leaves the job
  `in_flight` and it cannot be reissued. Start a new job under a new `revision`.
- **Pixel Forge can't import a gridless sheet for you**, and `max_followups` and the facing names
  (`south-west`, hyphenated) are validated: copy `job-spec.json`.

## 5. Rules that bit, from `AGENTS.md`

- Write a failing test before behaviour, watch it fail, then implement. For art, pin the format,
  registration and the property that distinguishes drawn from derived (see the Bargain Hunter test).
- Keep gameplay in `src/sim`; this work is presentation only. Run `npm run balance` only for balance changes.
- Update `STATUS.md`, `TEST_EVIDENCE.md` and `NEXT_SESSION.md` with real results, including what
  was *not* seen. Say plainly when something is review-only.
- **Do not push, deploy or open a pull request without the owner's say-so.** (The owner's stop hook
  asked for the push of this branch, which is why it is pushed.)
- No telemetry, accounts or runtime calls to external services; generation is dev-time only.

## 6. Environment facts (this repo's Claude Code cloud environment)

- Generation through a ChatGPT plan needs `auth.openai.com` and `chatgpt.com` in the environment's
  allowed domains (already added). The Images API route (`api.openai.com`, key in `OPENAI_API_KEY`)
  is a separate billed balance and returned `credit_balance_exhausted`: nothing is billed until credits
  are added.
- `bash tools/pixel-forge/scripts/cloud-gpt-setup.sh setup | login | status | models | restore` rebuilds
  the Codex and Forge setup in a new container. **The owner has not yet stored a login** as the
  environment secret `PIXEL_FORGE_CODEX_AUTH_B64` (it needs their own computer; steps are in the
  bridge doc, "Keeping the login"). Until then a new session needs the owner to enter a one-time code
  from `login`.
- Run Forge from its own venv (`setup` makes one); installing its requirements globally upgrades `mcp`
  and breaks `claude-agent-sdk`.
- Live capture: `VITE_ENABLE_DEBUG_BRIDGE=true npx vite --host 127.0.0.1 --port 4180 --strictPort`, then
  `CHROME=/opt/pw-browsers/chromium node scripts/live-capture.mjs --fixture mvp-floor-two-hunter
  --attack --target shopper --out artifacts/live-qa/<name>/run`.

## 7. Open decisions for the owner

- Whether the Bargain Hunter strip is good enough to keep, once seen in motion.
- Whether to store the Codex login as an environment secret (and accept that it can go stale).
- Whether to open a pull request for this branch.
