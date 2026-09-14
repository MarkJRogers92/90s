# 90s — M5 MVP run

This repository contains the M0–M5 playable prototype for the 90s game: the
preserved M1 Janitor combat room, the deterministic M2 Interaction Lab, the M3
Shoplifting Loop, the M4 Void the Warranty bench-fusion mode, and the M5 Night
Shift MVP run.

## Run locally

```text
npm install
npm run dev
```

Open `http://127.0.0.1:5173`, then choose:

- **Start shift** for the M1 combat room;
- **Interaction Lab** for the M2 item sandbox;
- **Shoplifting Loop** for the M3 two-store wing;
- **Void the Warranty** for the M4 bench;
- **Night Shift** for the M5 MVP run, or **Continue run** to resume the last
  saved room boundary.

In Night Shift, move with WASD, aim with the pointer, attack with the primary
mouse button, press E to buy an offer, use a door, or open the Bench Warrant
kiosk, press F to steal, press R to recall a fused carrier, and press Escape to
pause. `?seed=12345` replays one specific wing; the run seed is always shown in
the HUD.

## What M5 adds

One short seeded mall wing with a safe entry corridor, two seeded storefronts
drawn from four authored templates, two combat rooms whose doorways stay locked
until they are cleared, and a sealed security office holding the Loss Prevention
Manager boss. The run owns one provenance-bearing inventory of 24 catalogued
items, reuses the M3 shopping and Heat rules, reuses M4 Emitter Mount fusion at
the in-run bench, and writes a versioned local checkpoint at every room
boundary. Winning clears the checkpoint; dying keeps it.

## Continue in the cloud

The milestone is saved locally on branch `codex/m5-mvp` in the linked worktree
`.worktrees/m5-mvp`. It has not been merged to `main`, pushed, published,
deployed, or released. M6 still requires new user authorization.

See `NEXT_SESSION.md`, `STATUS.md`, and `TEST_EVIDENCE.md` for the current
milestone, verification evidence, and the next playtest focus.
