# Claude Opus 5.5 handoff — DEAD MALL opening presentation

## Why this handoff exists

The user paused this Codex pass because the game still does not look good enough
yet. They want to give the work to Claude Opus 5.5 and see what it can do. This
branch contains a complete, playable Opening Concourse presentation slice and
the visual/test evidence—not an approved final art direction or permission to
convert the rest of the mall.

Use the pushed branch `codex/presentation-3quarter` as the baseline. The remote
branch existed at `ad0a772` before this handoff; it was an ancestor of the local
work, so the requested update is a fast-forward push. Keep the baseline
unmerged. If you make changes, put them on a separate branch/worktree so the
user can compare Claude's version against this snapshot.

## Project and desired feel

DEAD MALL is a top-down, room-based action game. *The Binding of Isaac* is the
useful combat/readability comparison, but the visual identity should be an
immediately recognizable enclosed 1980s/1990s shopping mall—closer to the
bright mall-world tone of *Chopping Mall* and *Dead Rising* than to a dark,
generic dungeon. The opening should begin relatively busy, with a few shoppers
and staff present, and feel bright, saturated, neon-heavy, retail-specific, and
playable at a glance. It should not begin as a dark horror scene.

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

Current proof: 27 PNGs pass the shared-palette/binary-alpha validator; typecheck
passes; all 513 unit/integration tests pass; the four-case evidence harness
passes; all 57 Chromium browser tests pass; ten restart/lifecycle cycles remain
stable; the production build passes; and browser evidence saw zero external
HTTP(S) requests. Screenshots are in
[`artifacts/presentation-vertical-slice/`](artifacts/presentation-vertical-slice/).

Important visual concerns are still open: beige terrazzo is the largest field,
so the room is not uniformly neon-heavy; evacuation urgency is subtle in a
still; the HUD's small text may need human readability review; and the Food
Court remains the older gray/olive vector graybox. No human visual-playtest
approval has happened. WebKit/Safari/Windows/physical-device coverage and
physical-device performance are untested.

## Claude's bounded task

Independently inspect the branch and the actual screenshots, then create one
materially stronger *Opening Concourse only* presentation pass. You may improve
the room composition, architecture, storefront identities/signage, floor and
ceiling/light language, palette balance, approved pixel art, and presentation
layout. Aim for a bright, busy-but-readable 80s/90s mall with a few visible
civilians. Make the improvement unmistakable in native-size screenshots, not
just in code or a plan. If a short visual critique/design sketch helps, include
it in the work log before implementing, then continue through a working result.

Keep the original pushed branch intact and work on a separate branch/worktree.
Do not convert the Food Court or any other room. Do not alter authoritative
simulation rules, economy, combat, room order, checkpoint/save schema, or
collision just to improve the screenshot. Preserve gameplay readability for
the Janitor, civilians, pickups, doors, HUD, and enemy telegraphs. Keep assets
local; no remote runtime images or requests. Do not invoke paid PixelLab
generation or any other paid asset generation without asking the user first.
Do not merge, push, publish, deploy, release, or open a PR without a separate
explicit user instruction.

Finish with before/after captures at 1440×900 and 800×600, an exact list of
changed files, concise visual tradeoffs, and relevant focused validation plus
typecheck/build. Preserve the current baseline's full test evidence; rerun the
complete browser suite only if the change meaningfully touches shared gameplay
or browser-tested behavior.

## Ready-to-paste prompt

> Work from the `codex/presentation-3quarter` branch in this repository, but
> preserve it unchanged and make your work on a separate branch/worktree. Read
> `CLAUDE_HANDOFF.md`, `NEXT_SESSION.md`, `STATUS.md`, `TEST_EVIDENCE.md`, the
> presentation plan/spec, and inspect the committed screenshots and source-art
> contact sheets before editing. Improve the Opening Concourse so its first
> impression is unmistakably a bright, busy-but-readable late-80s/90s mall:
> vivid neon/retail colors, strong mall architecture and storefront identity,
> fluorescent/light language, retro floor treatment, and a few visible
> shoppers/staff. Think *Chopping Mall*/*Dead Rising* mall atmosphere with
> *Binding of Isaac* combat readability—not a dark generic dungeon. The current
> version still looks too beige/gray and isn't there yet. Implement a visible
> before/after improvement, with captures at 1440×900 and 800×600. Keep the
> scope to this opening room and presentation layer; preserve M5 simulation,
> save/checkpoint, combat, economy, collision, and room-order behavior. Keep
> gameplay cues and the compact HUD readable, use only local assets, and retain
> the shared palette/asset validation. No paid art generation, other-room
> conversion, merge, PR, push, publish, deploy, or release without asking the
> user. Report changed files, tradeoffs, and verification results when done.
