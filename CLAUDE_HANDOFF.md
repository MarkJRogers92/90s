# Claude Opus 5.5 handoff — DEAD MALL whole-game vision

## Why this handoff exists

The user paused this Codex pass because the game still does not look good enough
yet. They want to give the work to Claude Opus 5.5 and see what it can do. This
branch contains a complete, playable Opening Concourse presentation slice and
the visual/test evidence, but it is not the final art direction. The original
Codex slice was intentionally narrow; the user has since broadened Claude's
assignment to review and change any part of the game needed to reach the vision.

Use the pushed branch `codex/presentation-3quarter` as the baseline. The remote
branch existed at `ad0a772` before this handoff; it was an ancestor of the local
work, so the requested update is a fast-forward push. Keep the baseline
unmerged. If you make changes, put them on a separate branch/worktree so the
user can compare Claude's version against this snapshot.

## Project and desired feel

DEAD MALL is a top-down roguelike/action game. *The Binding of Isaac* is a
useful comparison for combat readability and run-based play, but the world
should feel like an enclosed 1980s/1990s American shopping mall—not a generic
dungeon. Take the mall atmosphere from *Chopping Mall* and *Dead Rising*: real
retail spaces, food court/storefront identities, signs, tiled floors, fountains,
fluorescent fixtures, and the strange social life of a mall after hours.

The opening should start relatively bright, vivid, and very 90s/neon-heavy. It
should feel somewhat busy, with a few visible shoppers/staff, not crowded to the
point that combat becomes hard to read. Danger can grow as a run progresses;
the key is that the first impression is recognizably a lively mall before it
becomes threatening.

The user's concrete feedback on the current version: it still does not look
good enough; initially the mall should be relatively busy, with a few people;
the opening should feel relatively bright and very neon/90s-heavy. They left
routine aesthetic choices to the implementation team, so use judgment, but
show the visual result rather than treating a plan as completion.

## What this branch already does

- Keeps `service_corridor` as the stable simulation/save/room-order ID while
  presenting it to the player as **Opening Concourse**.
- Adds a shallow three-quarter mall concourse presentation, storefronts,
  fountain and retail props, Janitor/Hanger pixel actors, four moving civilian
  roles, evacuation behavior, depth/occlusion/effects handling, and a compact
  HUD that sits above the game canvas at 1440×900 and 800×600.
- Adds 27 approved local runtime PNGs, the shared palette, the asset validator,
  provenance, contact sheets, screenshots, the accepted implementation plan,
  and the evidence/report trail.
- Includes active editable Aseprite masters plus the eight source candidate
  exports under `docs/art/presentation-vertical-slice/sources/`. These are not
  loaded by the game. The approved runtime files stay in
  `public/assets/presentation/`.
- Leaves the existing simulation authoritative: combat, economy, collision,
  room sequence, checkpoint/save schema, and other M5 rules are not reworked by
  this presentation pass.

## Evidence and current shortcomings

Read these first:

- [`NEXT_SESSION.md`](NEXT_SESSION.md) — current state and how to launch/play.
- [`STATUS.md`](STATUS.md) — milestone status and acceptance summary.
- [`TEST_EVIDENCE.md`](TEST_EVIDENCE.md) — detailed test and browser proof.
- [`docs/superpowers/plans/2026-09-26-dead-mall-production-presentation-vertical-slice.md`](docs/superpowers/plans/2026-09-26-dead-mall-production-presentation-vertical-slice.md)
  and its linked design spec — scope and implementation constraints.
- [`artifacts/provenance/presentation-vertical-slice.json`](artifacts/provenance/presentation-vertical-slice.json)
  — every approved PNG's source, dimensions, hash, and status.

The older plan, status, and decision notes document the original opening-slice
scope. Use them to understand how this baseline was built, but do not treat
their former “no other room” or “no simulation changes” limits as constraints
on this separate Claude experiment; the user's newer direction below supersedes
those limits. Keep any resulting work separate until the user decides what to
adopt.

Current proof: 27 PNGs pass the shared-palette/binary-alpha validator; typecheck
passes; all 513 unit/integration tests pass; the four-case evidence harness
passes; all 57 Chromium browser tests pass; ten restart/lifecycle cycles remain
stable; the production build passes; and browser evidence saw zero external
HTTP(S) requests. Screenshots are in
[`artifacts/presentation-vertical-slice/`](artifacts/presentation-vertical-slice/).

Important visual concerns are still open: beige terrazzo is the largest field,
so the room is not uniformly neon-heavy; evacuation urgency is subtle in a
still; the HUD's small text may need human readability review; and the Food
Court remains the older gray/olive vector graybox. The previous slice left the
Food Court untouched; it may be changed in Claude's experiment if that helps
make the whole game feel like the intended mall. No human visual-playtest
approval has happened. WebKit/Safari/Windows/physical-device coverage and
physical-device performance are untested.

## Claude's task and scope

Independently review the whole repository and the actual running game—not just
the opening-room screenshots. Identify what is keeping the current game from
realizing the vision, then make a cohesive, playable improvement. The opening
room is an important first impression, not a hard scope boundary. You may
change art, room layouts, presentation, UI, gameplay systems, simulation rules,
architecture, or the rendering/engine approach when that change is genuinely
needed to deliver the intended game. Existing implementation choices are not
untouchable; avoid unrelated changes and explain consequential tradeoffs.

Keep the original pushed branch unchanged and work on a separate branch or
worktree so the user can compare versions. Make judgment calls without waiting
for routine aesthetic choices, but do not mistake a design document or plan
for the finished work: leave a substantial, playable result and show it. If a
large migration seems necessary, validate the need and deliver the result in
clear checkpoints rather than stopping at a proposal.

Keep the work within the initial vision: a top-down roguelike/action game with
Isaac-like combat legibility set in a distinctive 80s/90s mall, drawing on
*Chopping Mall* and *Dead Rising*. The first impression should be bright,
neon-heavy, retail-specific, and have a few people around. Preserve the
readability and responsiveness that make the action playable. Later rooms may
develop their own mood; do not flatten the whole game into one palette.

Use local assets and keep the game self-contained. Do not invoke paid PixelLab
generation or other paid asset generation without asking the user. Do not add
remote runtime images/services. Do not push, merge, open a PR, publish, deploy,
or release without separate explicit user instruction.

Finish with a concise account of the diagnosis, the meaningful changes, and
why they serve the vision. Include before/after captures at 1440×900 and
800×600, an exact list of changed files, tradeoffs, and relevant validation.
If you change shared simulation, saves, or architecture, update/add tests and
run the broader checks needed to establish that the playable flow still works.

## Ready-to-paste prompt

> Review the whole DEAD MALL repository from the `codex/presentation-3quarter`
> branch, but leave that branch unchanged and make your work on a separate
> branch/worktree. Read `CLAUDE_HANDOFF.md`, `NEXT_SESSION.md`, `STATUS.md`,
> `TEST_EVIDENCE.md`, and the relevant design/plan docs; inspect the running game,
> committed screenshots, and source-art contact sheets. Diagnose what is
> actually holding the game back, then implement a cohesive, playable
> improvement. You may change any part of the game—including room content,
> presentation, UI, gameplay/simulation systems, architecture, or engine—if it
> is genuinely needed to fulfill the original vision. Don't constrain yourself
> to the Opening Concourse or treat today's implementation choices as
> untouchable, but avoid unrelated features/refactors and explain major
> tradeoffs.
>
> The vision: a top-down roguelike/action game with *The Binding of Isaac* as a
> combat-readability/run-structure comparison, set in an unmistakable late-80s/
> 90s shopping mall inspired by *Chopping Mall* and *Dead Rising*. The first
> impression should be relatively busy, bright, vivid, neon-heavy, and
> retail-specific, with a few shoppers/staff visible. It should not start as a
> dark generic dungeon; the mood may intensify later. Preserve responsive,
> readable action. Use local assets and keep runtime self-contained. Do not use
> paid art generation or remote runtime services/assets without asking me.
>
> Keep the current branch as the comparison baseline. Do not push, merge, open
> a PR, publish, deploy, or release without my separate approval. Deliver a
> working result, before/after captures at 1440×900 and 800×600, changed-file
> list, tradeoffs, and tests/build appropriate to the changes. If you change
> shared gameplay, saves, or architecture, update and run the relevant broader
> validation before reporting completion.
