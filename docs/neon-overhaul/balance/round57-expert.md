# Expert bot against the pro bot, round 57 follow-up

`BALANCE_NIGHTS=100 BALANCE_BOTS=pro:buy,expert:buy npm run balance` on the build
with elite traits (nights 1-100). The expert plays like the `pro` shopper but
scores sixteen headings against every charge lane, slam, shot and burst fuse at
once (`tests/balance/danger.ts`). It exists to answer one question: are the
`pro` bot's worst spots the game's, or the bot's?

What it showed:

- **The Mall Owner's Suite was the bot.** `pro` clears it 82% of the time and
  loses 4.5 health; the expert clears it 100% (97 of 97) and loses 0.6. A
  replay of the fight with the starting mop showed `pro` losing exactly 4
  health every time, two ways: it backed off along the Owner's locked charge
  lane, and it stepped out of a tray's way while two Mascot lanes crossed it.
  Both are a 28 px sidestep for a bot that looks at everything. Mascot damage
  fell from 2.6 to nothing. The Owner is fair and dodgeable; a good player
  takes about half a heart.
- **The finale is the hardest boss for a good dodger.** The Helipad costs the
  expert 2.0 health a wing against 0.6 in the Owner's Suite, which is round
  42's goal ("the finale is the hardest fight"). The earlier "the Developer is
  easier than the Owner" was also the bot.
- **The Volatile burst is fair if you can see it, and a real tax if you cannot.**
  Before it modelled fuses the expert lost 0.7 health a Floor 1 wing to bursts
  (as `pro` does, 0.8; the round 56 baseline lost 0.6 in total). With the fuse
  in its model the burst damage is zero across 100 nights.
- **What is left is mostly unmodelled hazards.** The expert's remaining health
  goes to Glamour Row's perfume clouds (1.5 a wing in Floor 2's first wing, 3
  deaths) and the Roofers' tar (1.0 in the finale, 0.5 on Floor 4's first wing),
  and Floor 4's first wing kills 4 in 100. The bot cannot see clouds or landing
  rings, so these are the next leads, and the next thing to model before
  trusting them.
- `pro` and `dodger` almost never kill a lone Mascot Brute in the open (2 of 24
  duels in 40 s): they dodge forever. The expert kills it in 5.7 s without
  being hit (24 of 24); the naive bot kills it in 4.4 s and takes 2.2 charges.

Duels (`tests/balance/duel.ts`, 24 each: 8 bearings by 3 distances, in an empty
room, spawns pulled inside the playfield): hits per duel, Mascot Brute / Bargain
Hunter: naive 2.17 / 1.67, dodger 0.04 / 0.00, pro 0.17 / 0.00, expert 0.00 / 0.00.

### pro bot, shopping: buy, route: long (100 nights)

Nights won 67% (67), died 33% (33), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.1 | 1.5 | burst 0.8, elf 0.3, hanger 0.2 | $28 |
| F1b | 100 | 98% | 2 | 0 | 1.0 | 1.1 | hanger 0.4, burst 0.2, glob 0.1 | $23 |
| F2a | 98 | 94% | 6 | 0 | 0.9 | 3.2 | perfume 1.3, burst 0.5, bossShot 0.4 | $37 |
| F2b | 92 | 99% | 1 | 0 | 0.9 | 1.6 | shopper 0.5, burst 0.3, static 0.3 | $31 |
| F3a | 91 | 96% | 4 | 0 | 0.9 | 2.7 | mascot 1.3, burst 0.4, shopper 0.2 | $38 |
| F3b | 87 | 82% | 16 | 0 | 1.0 | 4.5 | mascot 2.6, ownerCharge 0.8, bossShot 0.3 | $37 |
| F4a | 71 | 99% | 1 | 0 | 1.0 | 3.1 | mascot 0.8, goon 0.5, burst 0.5 | $47 |
| F4b | 70 | 96% | 3 | 0 | 1.1 | 2.5 | roofer 0.6, barrage 0.5, bossShot 0.5 | $52 |

Deaths: F3b OWNER'S SUITE (12); F2a PORTRAIT STUDIO (4); F3a FREEZER AISLE (2); F3b ARCADE (2); F3b LOADING DOCK (2); F4b HELIPAD (2); F1b BACK HALL (1); F1b FOOD COURT (1).
Killed by: ownerCharge (10), hanger (5), mascot (4), bossShot (3), perfume (3), shopper (3), mannequin (2), barrage (1), glob (1), slam (1).

### expert bot, shopping: buy, route: long (100 nights)

Nights won 92% (92), died 8% (8), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.0 | 0.8 | elf 0.5, hanger 0.2, barrage 0.0 | $31 |
| F1b | 100 | 100% | 0 | 0 | 0.9 | 0.7 | hanger 0.5, mannequin 0.1, other 0.0 | $21 |
| F2a | 100 | 97% | 3 | 0 | 0.8 | 2.2 | perfume 1.5, hanger 0.3, static 0.3 | $33 |
| F2b | 97 | 100% | 0 | 0 | 0.8 | 0.7 | hanger 0.3, static 0.3, bossShot 0.1 | $25 |
| F3a | 97 | 100% | 0 | 0 | 0.8 | 0.6 | hanger 0.2, static 0.2, slam 0.1 | $39 |
| F3b | 97 | 100% | 0 | 0 | 0.9 | 0.6 | hanger 0.2, static 0.2, bossShot 0.1 | $48 |
| F4a | 97 | 96% | 4 | 0 | 0.9 | 1.4 | roofer 0.5, goon 0.3, hanger 0.2 | $44 |
| F4b | 93 | 99% | 1 | 0 | 1.0 | 2.0 | roofer 1.0, bossShot 0.3, barrage 0.3 | $45 |

Deaths: F2a PORTRAIT STUDIO (2); F2a FITTING ROOMS (1); F4a DUCT MAZE (1); F4a GRAVEL YARD (1); F4a PENALTY BOX (1); F4a ZAMBONI GARAGE (1); F4b WATER TOWER (1).
Killed by: perfume (3), hanger (2), goon (1), roofer (1), slam (1).

