# DEAD MALL design

DEAD MALL is an exploration-first horror-comedy roguelite in a mutating 1997 American mall. The player learns store categories, buys or steals useful junk, and eventually fuses item behaviors while loss prevention becomes inhuman.

The current build is deliberately narrower than the full game: M0-M1 proves one readable top-down Janitor combat room, M2 adds a separate eight-item interaction lab before shopping, M3 adds a deterministic two-store shoplifting wing, and M4 adds a separate Void the Warranty bench-fusion mode.

M2-M4 keep `src/sim` authoritative. Immutable item definitions compile into a stable loadout; direct attacks, projectiles, Wet/Sticky statuses, surface patches, conductive reactions, and one-pass rewind compose through typed capabilities instead of item-name branches. M3 keeps shopping, economy, provenance, security, and transition rules renderer-independent under `src/sim/shop`. M4 keeps bench fusion rules, including the shared Emitter Mount rule, renderer-independent under `src/sim/bench` and `src/sim/fusion`. Phaser and the DOM only render state and submit input or loadout selections.

The authoritative slice documents are:

- `docs/superpowers/specs/2026-09-13-dead-mall-m0-m1-design.md`
- `docs/superpowers/plans/2026-09-13-dead-mall-m0-m1.md`
- `docs/superpowers/specs/2026-09-13-dead-mall-m2-interaction-lab-design.md`
- `docs/superpowers/plans/2026-09-13-dead-mall-m2-interaction-lab.md`
- `docs/superpowers/specs/2026-09-13-dead-mall-m3-shoplifting-loop-design.md`
- `docs/superpowers/plans/2026-09-13-dead-mall-m3-shoplifting-loop.md`
- `docs/superpowers/specs/2026-09-13-dead-mall-m4-void-the-warranty-design.md`
- `docs/superpowers/plans/2026-09-13-dead-mall-m4-void-the-warranty.md`
