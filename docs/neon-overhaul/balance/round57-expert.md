# Expert bot against the pro bot, round 57 follow-up

`BALANCE_NIGHTS=100 BALANCE_BOTS=pro:buy,expert:buy npm run balance` on the build
with elite traits (nights 1-100). The expert plays like the `pro` shopper but
scores sixteen headings against every charge lane, slam, shot, burst fuse, lob
and tar bucket at once, and walks slower through tar and perfume
(`tests/balance/danger.ts`). It exists to answer one question: are the `pro`
bot's worst spots the game's, or the bot's? Each time the answer was the bot's,
and each correction below overturned something I had written the step before.

What it showed, in the order it was learned:

1. **The Mall Owner's Suite was the bot.** `pro` clears it 82% of the time and
   loses 4.5 health; an expert that sees lanes, slams and shots clears it 100%
   and loses 0.6. A replay with the starting mop showed `pro` losing exactly 4
   health every time: it backed off along the Owner's locked charge lane, and it
   stepped out of a tray's way while two Mascot lanes crossed it.
2. **The Volatile burst is fair if you can see it.** Before it modelled fuses the
   expert lost 0.7 health a Floor 1 wing to bursts (as `pro` does, 0.8; the
   round 56 baseline lost 0.6 in total). With the fuse in its model: zero.
3. **"The Helipad is the hardest boss" was the bot too.** That expert's 2.0 health
   in the finale (and 1.5 a wing from Glamour Row's perfume, 3 deaths) was the
   Roofers' tar, the Developer's barrage and the Spritzer's clouds, which it
   could not see. Alone, a Roofer or a Spritzer never hit any dodging bot (they
   walk at the monster, and that carries them off the locked spot by accident).
   What cost health was being **busy**: with two bruisers on the janitor, `pro`
   and the expert were hit by 96 of 96 lobs, because a bot swinging at something
   else stands on the ring that is about to go off. A trace of 323 real hits
   from fresh landings agreed: only 12% happened while slowed in tar or perfume;
   most came in the "approach" branch with two to four monsters alive, over half
   with no step in the previous 8 ticks. Once the lob is in the model the same
   fight is dodged 96 of 96 times, and the finale costs 0.4.
4. **A bot that sees everything finds this game easy.** The final expert wins
   97% of nights (the `pro` 67%) and no wing costs it more than 0.8 health: the
   boss wings cost 0.4 to 0.6 each. Its three deaths were all hanger crowds. The
   30-point gap between `pro` and `expert` is attention: every hazard in this
   game is dodgeable if you are looking at it. Where a human sits between those
   two is the open question, and it is about reaction time, not about whether a
   monster can be dodged.
5. `pro` and `dodger` almost never kill a lone Mascot Brute in the open (2 of 24
   duels in 40 s): they dodge forever. The expert kills it in 5.7 s without
   being hit (24 of 24); the naive bot kills it in 4.4 s and takes 2.2 charges.

How much time each hazard gives. This is arithmetic on the game's constants
(walking is 3.5 px a tick, a dash is 126 px in 12 ticks with the janitor
invulnerable), not a measurement: the wind-up, minus the ticks it takes to walk
clear from the worst place to be standing.

| hazard | wind-up | walk clear | slack |
|---|---|---|---|
| Perfume Spritzer's spritz | 30 | 13 (46 px) | **17 (0.28 s)** |
| Volatile elite's fuse | 36 | 13 (to 86 px, from 40 px) | 23 |
| Owner's charge | 36 | 11 (38 px off the lane) | 25 |
| Bargain Hunter's charge | 34 | 8 (26 px off the lane) | 26 |
| Owner's slam | 36 | 9 (to 72 px, from 40 px) | 27 |
| Mascot Brute's charge | 46 | 8 (28 px off the lane) | 38 |
| Roofer's bucket | 54 | 11 (36 px) | 43 |

A player has to notice the ring, decide, and start moving before the slack runs
out. The Spritzer's 0.28 s is shorter than a typical reaction to something
appearing on screen (0.25-0.4 s); a dash covers it, but only with the cooldown
ready. The next step is to give the expert a reaction delay and measure the hit
rate against it for each hazard: that is how to tell which wind-ups are fair to a
human without waiting for one.

Duels (`tests/balance/duel.ts`, an empty room, spawns pulled inside the
playfield): hits per duel against a lone monster, 24 each (8 bearings by 3
distances), Mascot Brute / Bargain Hunter: naive 2.17 / 1.67, dodger 0.04 / 0.00,
pro 0.17 / 0.00, expert 0.00 / 0.00. Against a lone Roofer or Spritzer: naive 0.83,
every dodging bot 0.00. Crowded (a lobber and two bruisers, 96 throws each):
lob hits `pro` 96, expert 96 before the lobs were modelled, 0 after.

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

Nights won 97% (97), died 3% (3), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.0 | 0.8 | elf 0.5, hanger 0.2, barrage 0.0 | $31 |
| F1b | 100 | 100% | 0 | 0 | 0.9 | 0.6 | hanger 0.5, mannequin 0.1, other 0.0 | $21 |
| F2a | 100 | 98% | 2 | 0 | 0.8 | 0.8 | hanger 0.3, static 0.3, bossShot 0.1 | $28 |
| F2b | 98 | 100% | 0 | 0 | 0.8 | 0.5 | static 0.2, hanger 0.2, mannequin 0.1 | $23 |
| F3a | 98 | 100% | 0 | 0 | 0.8 | 0.8 | static 0.2, hanger 0.2, slam 0.1 | $36 |
| F3b | 98 | 100% | 0 | 0 | 0.9 | 0.4 | static 0.2, hanger 0.1, mascot 0.1 | $46 |
| F4a | 98 | 99% | 1 | 0 | 0.9 | 0.7 | static 0.2, goon 0.2, hanger 0.2 | $53 |
| F4b | 97 | 100% | 0 | 0 | 0.9 | 0.4 | static 0.2, bossShot 0.1, hanger 0.1 | $39 |

Deaths: F2a ELEVATOR BANK (1); F2a FITTING ROOMS (1); F4a GRAVEL YARD (1).
Killed by: hanger (3).

