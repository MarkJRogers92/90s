# Handoff — the portrait art, and getting it into the game

Written 2026-09-22 at commit `acd077e`. **Read `AGENTS.md`, `STATUS.md` and
`NEXT_SESSION.md` first** — this file covers one workstream, not the whole repo,
and `AGENTS.md` is the authority on how to work here. Where the two disagree,
`AGENTS.md` wins.

---

## 1. Where everything is

| | |
|---|---|
| Game repo | `~/Documents/Github Code/90s` |
| **Work in this worktree** | `.worktrees/pixellab-aseprite-proof/` — branch `codex/pixellab-aseprite-proof` |
| Art scratch tree | `~/deadmall-art` — **a separate, NON-git directory** |
| Art versioned copy | `docs/art/` inside this worktree |
| Art production docs | `docs/art/README.md`, `docs/art/tools/` |

`codex/pixellab-aseprite-proof` is pushed and clean at `acd077e` (verified
against the remote: 0 unpushed). There are 6 other worktrees for milestones
M2–M5; this worktree is the art + in-game-art branch.

Toolchain: node v24.20.0, npm 11.19.0. No CI — the gates are run by hand.

---

## 2. Run it and see the art working

```sh
cd "$HOME/Documents/Github Code/90s/.worktrees/pixellab-aseprite-proof"
npm install
npm run dev            # http://127.0.0.1:5173
```

On the title screen choose **Night Shift**. The art that already works:

- **Boss portrait.** Use the dev fixture to jump straight to it:
  `http://127.0.0.1:5173/?fixture=mvp-boss-entry&seed=5150`. The run HUD shows
  the Loss Prevention Manager's face, and its expression tracks the boss's own
  phase (telegraph → `angry`, backup summoned → `determined`, below 34% health →
  `hurt`, else `neutral`).

- **Portrait asset viewer (dev only).** In the same run press **`P`**; arrow
  keys cycle character and expression. This is an *asset viewer*, not a feature —
  it exists so the eight archetypes can be judged at the size they'd be drawn.
  It is gated behind `import.meta.env.DEV && VITE_ENABLE_DEBUG_BRIDGE === 'true'`
  and creates its own DOM and stylesheet, so **nothing of it ships**.

Other dev fixtures: `mvp-bench`, `mvp-boss-win`, `mvp-storefront`.

### The gates — all four must be green before you commit

```sh
npm run typecheck                      # tsc --noEmit
npm test                               # vitest, 532 tests
npm run test:browser                   # playwright, 64 tests
python3 docs/art/tools/validate_runtime_tree.py public/assets --quiet
                                       # expect: PASS — 70 files, binary alpha and on-palette
```

`npm run build` runs `tsc --noEmit && vite build`, which is why a test that
imports `node:fs` typechecks under vitest and still **breaks the build**:
`tsconfig` compiles `tests/` with `lib: ["ES2022","DOM"]` and no Node types.
Check which layer you are writing for before reaching for a Node API.

---

## 3. What is already done

**The art is finished, validated and in the game's asset tree.**

- `public/assets/portraits/` — 8 detailed portraits at 160×160, transparent, and
  8 expression sheets at 576×96 (six 96×96 frames each). The originals in the art
  tree are opaque plates; the backdrop was cut to alpha 0 by a **border flood
  fill**, not a colour match, because the stranger's coat and the corrupted
  human's skin are greys near the backdrop colour and a global match would punch
  holes in them.
- `src/game/portraits.ts` — the catalogue. URLs are derived from
  `PORTRAIT_KINDS`, so a kind cannot be added without its art.
- `src/game/ui/PortraitPanel.ts` — the dev viewer described above.
- `artifacts/provenance/` — 16 records in the schema set by
  `bench-warrant-kiosk.json`. Two honest gaps, recorded in the files rather than
  guessed: the detailed portraits predate this pass and **no job id or prompt
  could be recovered for them**, so those fields are `null`; and an expression
  sheet is a composite of six jobs, so `jobId` is null and a `jobs` array carries
  all six.
- Tests: `tests/unit/portraits.test.ts` (catalogue integrity) and
  `tests/browser/portraits.spec.ts` (a real browser fetches and decodes every
  asset at its declared size, and proves the alpha is genuinely cut out).

**Provenance of the eight portraits:** `create_image_pixen`, text-to-image,
160×160, 1 generation each — recorded in the project's own probe notes.

---

## 4. What is NOT done — and this is the actual work

### 4a. The archetypes have no gameplay home yet (DECISION NEEDED FIRST)

The eight subjects are **mall archetypes** — teenager, employee, security guard,
store manager, stranger, survivor, vendor, corrupted human. Nothing in the game
draws them except the boss, which uses `security-guard`. There is **no dialogue
system, no NPC to attach a portrait to, and no player portrait** (the protagonist
is Alex, and the archetypes are not him).

Options, with the hook each would hang on:

| option | hook that already exists | cost |
|---|---|---|
| **Store clerk portrait** | `StoreDefinition` already has `id` and `name`, and the M3 wing authors real stores (`homestyle`, `future`). The HUD already has the offers panel. Use `?fixture=mvp-storefront`. | **Smallest** — the mapping data exists; this is mostly a DOM panel plus a per-store archetype mapping |
| NPC / dialogue | none | Largest — a dialogue system is a new subsystem |
| Enemy inspect | `EnemyKind` is `hanger \| spitter \| lp_manager` — all creatures, none human | Poor fit; the archetypes don't map |

**Recommendation: the store clerk.** It is the only option where the game already
has the identity to key on, and a store's clerk is a real thing a 90s mall
simulation would have.

Note the precedent set by the boss portrait when you build it: the expression is
derived from the **simulation's own authoritative state**, reading the same
fields the HUD text reads, so the face cannot disagree with the text beside it.
Keep that property — a portrait is a conspicuous way to break an invariant.

### 4b. Follow `AGENTS.md`: failing test first

The repo's rule is a meaningful failing test *before* production behaviour,
observe the intended failure, then implement minimally. The boss portrait is a
usable model: a unit test for the pure mapping (table-driven, including
precedence) and a browser test that asserts **consistency** rather than a
hard-coded value — a fixed expectation would only pass while the encounter
behaved identically, whereas the phase depends on live combat.

### 4c. Nothing needs regenerating — do not re-roll the portraits

An audit reported five portrait defects. Four do not survive measurement:
the store-manager has **zero** subject pixels on either side edge; the survivor
has 1 and 0 with a 4px top gap and an intact crown; the corrupted-human's 16
colours is a deliberate desaturated design; and the stranger's eyes **are**
visible under the brim. Only the employee's blank nametag was real, and it is
lettered.

A re-roll of the two style-divergent portraits was then **tried and rejected**:
both came back harsher and colder, and with **dithered backdrops** the cut-out
step cannot consume (border-band colours 41 and 44 against 15 and 10). The
structural reason matters more than the result — the eight were generated
together with matched settings, so re-rolling a *single* member cannot make it
more consistent with the other seven. If a uniform replacement set is ever
wanted it has to be all eight at once (~248 generations), swapping a coherent,
shipped, provenance-carrying set for an aesthetic nobody has seen.

---

## 5. Traps that will cost you time

1. **The palette exists twice, and they disagreed.** `deadmall-global.gpl` is
   authoritative (**105**, 21 ramps × 5). `deadmall-global.json` was stale at 95
   and is what `validate_runtime_asset.py` and the ad-hoc scripts default to —
   which made me report **13 perfectly good shipped assets as off-palette**. All
   thirteen were legitimate neon users. The `.json` is now regenerated from the
   `.gpl`; if you touch the palette, keep the two in step, and note that
   **ramp order is load-bearing** (`ramp()` in `pixeldraw.py`, `RAMP_ALIASES`,
   and `HUE_RAMPS` in `snap_palette.py` all address ramps positionally, so ramps
   are only ever appended).
2. **`~/deadmall-art` is not a git repo and drifts.** The copy into `docs/art/`
   is **manual** and has stranded files three times (283, then 84). Re-sync is
   additive — never `--delete` — and the only check that catches drift is:
   ```sh
   rsync -rcni --exclude='.DS_Store' ~/deadmall-art/ \
     "$HOME/Documents/Github Code/90s/.worktrees/pixellab-aseprite-proof/docs/art/" \
     | grep -E '^[<>ch*]'
   ```
   Empty output = in step. **`-i` is required**; plain `-rcn` prints nothing even
   when files differ, which reads as success on a tree that is not in step. A
   clean `git status` in the worktree proves nothing about the scratch tree.
   *Automating this is a good first chore — it is the one failure that cannot be
   undone.*
3. **PixelLab base64 truncates in transit.** Above roughly 4k characters the
   argument is cut **silently** and the server reports *"broken data stream"*. A
   160×160 PNG (~5.5k) cannot be sent at all; a 96×96 palette-indexed one
   (~2.6k) can. This is why there is no img2img route at portrait size, and why
   the expression tiles were made from a 96px base.
4. **PixelLab is unreachable on the LAN here.** The gateway
   `192.168.1.254` geo-IP-filters Ireland, and `api.pixellab.ai` is on AWS
   eu-west-1. Port 443 drops silently; port 80 returns an injected block page.
   A hotspot (`172.20.10.1`) bypasses it. Generation needs that.
5. **Tier 1 caps 8 concurrent PixelLab jobs**, and each Pro Flash create spawns a
   companion job, so the cap bites at ~4 creates. Refused calls error before
   queueing and are not charged.
6. **An owned `source_image_id` is only valid after its base job has finished**;
   referencing it earlier fails with "Image … not found". Burned three tiles once.
7. **`[hidden]` loses to a class that declares `display`.** Any `display` on the
   class out-specifies the user-agent `display: none`, leaving the element
   permanently visible. The boss portrait's container is a plain block for that
   reason; the stylesheet says so.

---

## 6. Conventions you must not break

From `AGENTS.md`, repeated because they bite:

- Gameplay rules live in `src/sim`; Phaser renders and collects input but owns no
  damage, movement, economy or state transitions.
- **Keep runtime content local** — no telemetry, accounts, backend, analytics,
  cloud service or external runtime calls.
- **Do not push, deploy, publish or create releases without explicit
  authorization.**
- Update `STATUS.md`, `TEST_EVIDENCE.md` and `NEXT_SESSION.md` with real evidence
  at checkpoints. This file is a workstream note, not a substitute for those.

---

## 7. If you only do one thing

Build the **store clerk portrait**, failing test first. It is the only next step
where the game already holds the identity to key a portrait on, it reuses the
pattern the boss portrait established, and it turns 8 validated-but-unused
assets into something a player actually sees.
