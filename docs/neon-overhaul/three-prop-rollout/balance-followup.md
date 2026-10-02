# Placement regression diagnosis

The first normal-room candidate was not accepted on its unit-test pass alone.
Its 40-seed pro-shopping results fell from 28 wins to 21 on the long route and
22 with shortcuts. All runs terminated, but this was material enough to trace.

## What changed first

Paired baseline/candidate runs for seeds 1–12 logged room times, shop visits,
purchases, inventory, deaths and final outcomes. Six lockstep first-divergence
traces additionally compared input, position, health, cash and nextEntityId.

- Seed 3 first diverged while navigating Candy Cauldron. Both versions bought
  the same items, had the same health/cash/entity counter and recorded a 3.1 s
  visit. The wing finished two ticks earlier in the candidate. Its boss reward
  changed from Virtual Pet to Moon Shoes, and it later died in Mezzanine Office
- Isolating an actual shopping visit showed the mechanism without fighting:
  Cinema Snacks seed 0, part 1, $13 exited at tick 211 versus 215, with the same
  Bubble-Bath purchase at tick 101 and identical final $0/6 HP. Slice Station
  seed 4, part 1, $60 exited at 404 versus 408 with the same four purchases,
  $6 and 6 HP
- The real Navigator found valid detours, but the first slush placement crossed
  upper-right-shelf/exit diagonals and the bakery crossed a diagonal between
  shelf columns. These were avoidable route changes, even without a softlock
- Seeds 1 and 4 first diverged when the monitor clipped the north-side boss
  dodge path. Both still won, but the obstacle was affecting a combat lane

Prop creation does not allocate enemy/entity IDs, and no shared RNG stream is
advanced. The existing luck helper hashes each draw independently. However,
existing snack rolls, item rolls and boss rewards include the global kill tick
(tokens.ts and drops.ts). Small movement changes therefore reroll later healing
and equipment. The balance harness never restores a checkpoint, so checkpoint
persistence cannot explain its result.

An artificial timing-alignment diagnostic restored seed 3's first-wing Virtual
Pet reward but did not restore the entire run: bot navigation memory and later
interactions had already diverged. This control is not a production fix and is
not evidence that the seven lost wins were harmless statistical noise.

## Bounded repair

Only authored coordinates were moved:

- Bakery: front-left gap at (280,335)
- Slush: front-right gap at (680,335)
- Monitor: back-wall gap at (550,60)

Seven new geometry regressions first failed on the original candidate, then
passed: player-sized straight paths between every sampled shelf, arrival and
exit remain clear, as does the Security Office north dodge lane at y100.
The existing 40-seed wanted-spawn check also caught a monitor candidate at y65
clipping a radius-16 shopper at (540,80); y60 gives that spawn 20 px clearance.

The 12 paired shopping seeds were rerun with the front-corner food props and
the initial back-wall monitor y65. All prior wins were retained, seed 3's win
returned, seed 7 gained a win, and nine complete per-wing summaries matched
baseline exactly. The monitor then moved five pixels farther back for the
spawn clearance above. The final full comparison below uses y60 throughout;
it supersedes the intermediate sample.

Final before/after balance: six policies × the same 40 seeded nights,
240 nights per revision / 480 total. Both runs passed; no run stalled.

| Bot policy | Before wins / 40 | Final wins / 40 | Stalls before / final |
| --- | ---: | ---: | ---: |
| naive bot, shopping: none, route: long | 0 | 0 | 0 / 0 |
| dodger bot, shopping: none, route: long | 1 | 1 | 0 / 0 |
| pro bot, shopping: none, route: long | 23 | 23 | 0 / 0 |
| pro bot, shopping: buy, route: long | 28 | 29 | 0 / 0 |
| pro bot, shopping: buy, route: shortcut | 28 | 29 | 0 / 0 |
| expert bot, shopping: buy, route: long | 39 | 39 | 0 / 0 |

The rejected aisle candidate had only 21/40 and 22/40 pro-shopping wins.
After the perimeter repair, both are 29/40 versus 28/40 baseline. The other
four bot outcome counts are identical to baseline. This resolves the measured
regression in this seeded sample; it does not establish that every human
combat or route is unaffected. No compensating balance tuning was made.
Full wing/damage/cash tables are in artifacts/normal-props/balance-before.md
and artifacts/normal-props/balance-after.md.

No health, damage, prices, drops, spawn rates, RNG inputs or bot policy was
changed. Human visual/feel verification remains necessary, and the original
40-seed loss is preserved here instead of being hidden by the later rerun.
