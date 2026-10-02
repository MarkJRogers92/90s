# DEAD MALL repository instructions

Read STATUS.md and NEXT_SESSION.md first, then only the design/plan sections needed for the current task.

- Keep gameplay rules in src/sim; Phaser renders and collects input but does not own damage, movement, economy, or state transitions.
- Write a meaningful failing test before production behavior, observe the intended failure, implement minimally, then run targeted adjacent checks.
- Scope follows the owner's current ask, not the old milestone gates: M0-M5 are done and Night Shift has grown through many rounds (STATUS.md, docs/neon-overhaul/README.md). Build what the owner asks for, inside the original game vision, and ask before starting something large they did not request (a new mode, a rewrite).
- Before and after a balance change (health, damage, prices, drops, spawns), run `npm run balance` (the bot playtester in tests/balance) and say what moved; a human playtest log still outranks it.
- Keep runtime content local. No telemetry, accounts, backend, analytics, cloud service, or external runtime calls.
- Do not push, deploy, publish, or create releases without explicit authorization.
- Update STATUS.md, TEST_EVIDENCE.md, and NEXT_SESSION.md with real evidence at checkpoints.
