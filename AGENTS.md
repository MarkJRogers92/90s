# DEAD MALL repository instructions

Read STATUS.md and NEXT_SESSION.md first, then only the design/plan sections needed for the current task.

- Keep gameplay rules in src/sim; Phaser renders and collects input but does not own damage, movement, economy, or state transitions.
- Write a meaningful failing test before production behavior, observe the intended failure, implement minimally, then run targeted adjacent checks.
- Preserve the M0-M1 scope until its browser and build gate is complete. Do not add M2 systems early.
- Keep runtime content local. No telemetry, accounts, backend, analytics, cloud service, or external runtime calls.
- Do not push, deploy, publish, or create releases without explicit authorization.
- Update STATUS.md, TEST_EVIDENCE.md, and NEXT_SESSION.md with real evidence at checkpoints.
