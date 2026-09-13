# DEAD MALL design

DEAD MALL is an exploration-first horror-comedy roguelite in a mutating 1997 American mall. The player learns store categories, buys or steals useful junk, and eventually fuses item behaviors while loss prevention becomes inhuman.

The current build is deliberately narrower than the full game: M0-M1 proves one readable top-down Janitor combat room, and M2 adds a separate eight-item interaction lab before shopping.

M2 keeps `src/sim` authoritative. Immutable item definitions compile into a stable loadout; direct attacks, projectiles, Wet/Sticky statuses, surface patches, conductive reactions, and one-pass rewind compose through typed capabilities instead of item-name branches. Phaser and the DOM only render state and submit input or loadout selections.

The authoritative slice documents are:

- `docs/superpowers/specs/2026-09-13-dead-mall-m0-m1-design.md`
- `docs/superpowers/plans/2026-09-13-dead-mall-m0-m1.md`
- `docs/superpowers/specs/2026-09-13-dead-mall-m2-interaction-lab-design.md`
- `docs/superpowers/plans/2026-09-13-dead-mall-m2-interaction-lab.md`
