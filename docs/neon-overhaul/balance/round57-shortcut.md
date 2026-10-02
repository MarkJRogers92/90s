# Staff passage balance, round 57

`BALANCE_NIGHTS=200 BALANCE_BOTS=pro:buy:long,pro:buy:shortcut npm run balance`,
nights 1-200, on the round 57 build. The same `pro` shopper, once taking every
door and once crawling through the staff passage whenever the wing has one
(about half of wings). At 200 nights a win rate is good to about 3.5 points, so
60% against 59% is no difference. Where it shows: skipping into the Lockdown
without the clear-heal (Floor 3 first wing) cost 13 deaths against 9, and
skipping a light fight saved a little health (Floor 3 boss wing 4.1 hp a wing
against 4.6).

### pro bot, shopping: buy, route: long (200 nights)

Nights won 60% (120), died 40% (80), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 200 | 100% | 0 | 0 | 1.1 | 0.6 | elf 0.4, hanger 0.1, bossShot 0.0 | $30 |
| F1b | 200 | 100% | 1 | 0 | 0.9 | 0.7 | hanger 0.3, shopper 0.1, glob 0.1 | $24 |
| F2a | 199 | 89% | 22 | 0 | 0.9 | 2.7 | perfume 1.2, bossShot 0.3, hanger 0.3 | $38 |
| F2b | 177 | 98% | 3 | 0 | 0.9 | 1.3 | shopper 0.5, hanger 0.2, static 0.2 | $25 |
| F3a | 174 | 91% | 15 | 0 | 0.9 | 2.7 | mascot 1.8, shopper 0.3, slam 0.1 | $33 |
| F3b | 159 | 79% | 33 | 0 | 1.0 | 4.6 | mascot 2.6, ownerCharge 0.9, shopper 0.3 | $36 |
| F4a | 126 | 98% | 2 | 0 | 1.0 | 2.5 | mascot 0.8, roofer 0.5, goon 0.4 | $52 |
| F4b | 124 | 97% | 4 | 0 | 1.1 | 2.4 | roofer 0.8, barrage 0.5, mascot 0.4 | $50 |

Deaths: F3b OWNER'S SUITE (29); F2a PORTRAIT STUDIO (15); F3a WALK-IN COOLER (9); F3b LOADING DOCK (3); F4b HELIPAD (3); F2a ELEVATOR BANK (2); F2a MAKEUP COUNTERS (2); F2b CINEMA LOBBY (2).
Killed by: mascot (22), ownerCharge (22), perfume (12), hanger (7), bossShot (4), slam (4), roofer (3), glob (2), shopper (2), mannequin (1), walker (1).

### pro bot, shopping: buy, route: shortcut (200 nights)

Nights won 59% (118), died 41% (82), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 200 | 100% | 0 | 0 | 1.0 | 0.7 | elf 0.4, hanger 0.1, barrage 0.1 | $29 |
| F1b | 200 | 100% | 1 | 0 | 0.9 | 0.7 | hanger 0.4, shopper 0.1, bossShot 0.1 | $23 |
| F2a | 199 | 87% | 25 | 0 | 0.9 | 2.9 | perfume 1.3, shopper 0.4, bossShot 0.4 | $37 |
| F2b | 174 | 99% | 2 | 0 | 0.8 | 1.2 | shopper 0.5, bossShot 0.2, static 0.2 | $25 |
| F3a | 172 | 91% | 15 | 0 | 0.8 | 2.7 | mascot 1.6, shopper 0.3, slam 0.2 | $33 |
| F3b | 157 | 81% | 30 | 0 | 1.0 | 4.1 | mascot 2.5, ownerCharge 0.7, shopper 0.3 | $35 |
| F4a | 127 | 97% | 4 | 0 | 0.9 | 2.2 | mascot 0.9, roofer 0.3, goon 0.2 | $52 |
| F4b | 123 | 96% | 5 | 0 | 1.1 | 2.2 | roofer 0.7, barrage 0.5, mascot 0.4 | $51 |

Deaths: F3b OWNER'S SUITE (27); F2a PORTRAIT STUDIO (14); F3a WALK-IN COOLER (13); F2a FITTING ROOMS (5); F4b HELIPAD (5); F4a ELEVATOR HOUSING (3); F2a MAKEUP COUNTERS (2); F2a MEZZANINE OFFICE (2).
Killed by: mascot (25), ownerCharge (16), perfume (15), bossShot (9), shopper (5), hanger (4), mannequin (2), slam (2), barrage (1), other (1), roofer (1), static (1).
