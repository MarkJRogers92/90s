# Round 59 balance: rooms as named, then a difficulty tune

`BALANCE_NIGHTS=100 npm run balance` on `origin/main` (6d3f90d), on the round-59 layouts alone, with the health/full-strength tune, and with the elite bump (final). Shopping pro bot, nights won: 59% (main) -> 68% (layouts: the new cover helps a careful player) -> 64% (tune) -> 56% (final). Expert: 88 -> 92 -> 90 -> 95 (noise is about +/-5 at 100 nights). Floor 1 still costs the bots about 1-2 health a wing; a human playtest log should drive the next tune.

## r59-before

## Balance report

### naive bot, shopping: none, route: long (100 nights)

Nights won 1% (1), died 99% (99), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 14% | 86 | 0 | 0.6 | 9.5 | hanger 3.2, glob 3.0, elf 2.0 | $44 |
| F1b | 14 | 57% | 6 | 0 | 0.5 | 5.9 | glob 2.4, hanger 1.9, slam 0.7 | $70 |
| F2a | 8 | 75% | 2 | 0 | 0.6 | 6.8 | shopper 1.9, perfume 1.6, bossShot 1.0 | $101 |
| F2b | 6 | 50% | 3 | 0 | 0.6 | 8.2 | slam 2.0, glob 1.8, shopper 1.7 | $112 |
| F3a | 3 | 67% | 1 | 0 | 0.5 | 5.7 | poodle 2.0, mascot 1.3, shopper 1.0 | $148 |
| F3b | 2 | 50% | 1 | 0 | 0.6 | 8.5 | bossShot 2.0, mascot 2.0, ownerCharge 2.0 | $224 |
| F4a | 1 | 100% | 0 | 0 | 0.6 | 10.0 | goon 6.0, slam 2.0, bossShot 1.0 | $283 |
| F4b | 1 | 100% | 0 | 0 | 0.7 | 6.0 | bossShot 2.0, glob 2.0, roofer 2.0 | $324 |

Deaths: F1a FREIGHT HALL (25); F1a CUSTOMER SERVICE (20); F1a TOY STOCKROOM (17); F1a SANTA'S WORKSHOP (15); F1a KIOSK ALLEY (5); F1a CAROUSEL COURT (4); F1b BACK HALL (3); F2b MANAGEMENT SUITE (3).
Killed by: glob (37), hanger (22), elf (20), mannequin (6), burst (3), shopper (3), slam (3), walker (2), other (1), perfume (1), poodle (1).

### dodger bot, shopping: none, route: long (100 nights)

Nights won 1% (1), died 99% (99), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 55% | 45 | 0 | 0.8 | 7.4 | hanger 4.2, glob 1.8, mannequin 0.5 | $55 |
| F1b | 55 | 60% | 22 | 0 | 0.7 | 6.4 | hanger 2.8, glob 1.7, bossShot 1.2 | $82 |
| F2a | 33 | 94% | 2 | 0 | 0.7 | 3.8 | bossShot 1.0, glob 0.8, perfume 0.6 | $115 |
| F2b | 31 | 97% | 1 | 0 | 0.7 | 5.1 | bossShot 2.6, glob 0.9, shopper 0.6 | $140 |
| F3a | 30 | 87% | 4 | 0 | 0.7 | 5.0 | mascot 2.2, glob 0.6, bossShot 0.4 | $163 |
| F3b | 26 | 42% | 15 | 0 | 0.8 | 7.2 | bossShot 2.3, mascot 2.2, ownerCharge 1.2 | $201 |
| F4a | 11 | 18% | 9 | 0 | 0.8 | 8.9 | goon 2.7, bossShot 1.7, slam 0.9 | $239 |
| F4b | 2 | 50% | 1 | 0 | 0.9 | 7.5 | bossShot 4.0, hanger 1.5, burst 0.5 | $322 |

Deaths: F1a CUSTOMER SERVICE (22); F1a FREIGHT HALL (14); F1b SECURITY OFFICE (14); F3b OWNER'S SUITE (13); F1b BACK HALL (8); F4a PENALTY BOX (8); F1a KIOSK ALLEY (4); F1a TOY STOCKROOM (3).
Killed by: hanger (27), bossShot (25), glob (22), mascot (6), burst (4), goon (4), ownerCharge (3), elf (2), walker (2), mannequin (1), perfume (1), shopper (1), slam (1).

### pro bot, shopping: none, route: long (100 nights)

Nights won 60% (60), died 40% (40), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.0 | 1.8 | burst 0.8, elf 0.5, hanger 0.4 | $62 |
| F1b | 100 | 100% | 0 | 0 | 0.9 | 1.1 | hanger 0.5, burst 0.2, shopper 0.1 | $87 |
| F2a | 100 | 87% | 13 | 0 | 0.9 | 3.8 | perfume 1.6, shopper 0.5, burst 0.5 | $117 |
| F2b | 87 | 99% | 1 | 0 | 0.8 | 1.8 | shopper 0.5, bossShot 0.3, static 0.3 | $146 |
| F3a | 86 | 91% | 8 | 0 | 0.8 | 2.8 | mascot 1.4, burst 0.4, hanger 0.2 | $178 |
| F3b | 78 | 83% | 13 | 0 | 0.9 | 4.6 | mascot 2.6, ownerCharge 1.0, bossShot 0.3 | $216 |
| F4a | 65 | 95% | 3 | 0 | 0.9 | 3.7 | goon 1.1, mascot 0.7, burst 0.5 | $267 |
| F4b | 62 | 97% | 2 | 0 | 1.0 | 2.7 | roofer 0.9, bossShot 0.4, barrage 0.4 | $323 |

Deaths: F3b OWNER'S SUITE (10); F2a PORTRAIT STUDIO (9); F3a WALK-IN COOLER (5); F3b ARCADE (3); F3a KENNEL ROW (2); F4a ELEVATOR HOUSING (2); F4b HELIPAD (2); F2a ELEVATOR BANK (1).
Killed by: mascot (10), ownerCharge (10), perfume (9), bossShot (3), burst (3), shopper (3), roofer (1), slam (1).

### pro bot, shopping: buy, route: long (100 nights)

Nights won 59% (59), died 41% (41), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.1 | 1.5 | burst 0.8, elf 0.3, hanger 0.2 | $28 |
| F1b | 100 | 98% | 2 | 0 | 1.0 | 1.1 | hanger 0.4, burst 0.2, glob 0.1 | $23 |
| F2a | 98 | 92% | 8 | 0 | 0.9 | 3.3 | perfume 1.3, burst 0.4, hanger 0.4 | $32 |
| F2b | 90 | 92% | 7 | 0 | 0.9 | 2.1 | shopper 0.6, hanger 0.5, bossShot 0.3 | $27 |
| F3a | 83 | 90% | 8 | 0 | 0.9 | 2.9 | mascot 1.6, burst 0.3, shopper 0.2 | $33 |
| F3b | 75 | 81% | 14 | 0 | 1.0 | 3.6 | mascot 1.8, ownerCharge 0.6, bossShot 0.4 | $38 |
| F4a | 61 | 97% | 2 | 0 | 1.0 | 2.7 | mascot 0.7, burst 0.5, roofer 0.4 | $45 |
| F4b | 59 | 100% | 0 | 0 | 1.1 | 2.5 | roofer 0.7, barrage 0.6, mascot 0.3 | $51 |

Deaths: F3b OWNER'S SUITE (12); F3a WALK-IN COOLER (5); F2a PORTRAIT STUDIO (3); F2b CINEMA LOBBY (3); F2a MEZZANINE OFFICE (2); F2b MANAGEMENT SUITE (2); F2b PARKING STAIRWELL (2); F1b BACK HALL (1).
Killed by: mascot (12), hanger (10), ownerCharge (6), bossShot (4), perfume (3), mannequin (2), shopper (2), glob (1), slam (1).

### pro bot, shopping: buy, route: shortcut (100 nights)

Nights won 59% (59), died 41% (41), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.0 | 1.4 | burst 0.7, elf 0.3, hanger 0.2 | $26 |
| F1b | 100 | 100% | 0 | 0 | 0.9 | 0.7 | hanger 0.3, shopper 0.1, glob 0.1 | $22 |
| F2a | 100 | 88% | 12 | 0 | 0.8 | 3.2 | perfume 1.5, bossShot 0.4, burst 0.4 | $35 |
| F2b | 88 | 98% | 2 | 0 | 0.8 | 1.3 | shopper 0.3, bossShot 0.3, burst 0.2 | $24 |
| F3a | 86 | 88% | 10 | 0 | 0.8 | 3.0 | mascot 1.7, burst 0.4, slam 0.2 | $34 |
| F3b | 76 | 89% | 8 | 0 | 1.0 | 3.8 | mascot 2.1, ownerCharge 0.7, bossShot 0.3 | $40 |
| F4a | 68 | 93% | 5 | 0 | 0.9 | 2.9 | mascot 0.8, burst 0.5, goon 0.4 | $42 |
| F4b | 63 | 94% | 4 | 0 | 1.1 | 2.6 | roofer 0.7, barrage 0.5, bossShot 0.4 | $53 |

Deaths: F3a WALK-IN COOLER (7); F3b OWNER'S SUITE (6); F2a FITTING ROOMS (4); F2a PORTRAIT STUDIO (4); F4a ELEVATOR HOUSING (4); F4b HELIPAD (4); F2a MEZZANINE OFFICE (3); F3a KENNEL ROW (2).
Killed by: mascot (14), hanger (7), perfume (5), ownerCharge (4), bossShot (3), roofer (2), shopper (2), slam (2), barrage (1), burst (1).

### expert bot, shopping: buy, route: long (100 nights)

Nights won 88% (88), died 12% (12), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.0 | 0.9 | elf 0.5, hanger 0.3, walker 0.1 | $31 |
| F1b | 100 | 100% | 0 | 0 | 0.9 | 0.5 | hanger 0.4, mannequin 0.0, glob 0.0 | $21 |
| F2a | 100 | 98% | 2 | 0 | 0.8 | 1.0 | hanger 0.4, static 0.3, mannequin 0.1 | $37 |
| F2b | 98 | 95% | 5 | 0 | 0.8 | 0.8 | hanger 0.3, walker 0.2, static 0.2 | $28 |
| F3a | 93 | 99% | 1 | 0 | 0.8 | 0.8 | hanger 0.4, static 0.2, poodle 0.1 | $39 |
| F3b | 92 | 98% | 2 | 0 | 0.9 | 0.6 | hanger 0.3, mannequin 0.2, static 0.1 | $42 |
| F4a | 90 | 98% | 2 | 0 | 0.9 | 0.8 | goon 0.3, hanger 0.2, static 0.2 | $40 |
| F4b | 88 | 100% | 0 | 0 | 1.0 | 0.3 | hanger 0.1, static 0.1, other 0.0 | $52 |

Deaths: F2b CINEMA LOBBY (3); F2b PARKING STAIRWELL (2); F3b LOADING DOCK (2); F2a FITTING ROOMS (1); F2a GALLERY WALK (1); F3a WALK-IN COOLER (1); F4a ELEVATOR HOUSING (1); F4a ZAMBONI GARAGE (1).
Killed by: walker (5), hanger (4), goon (1), mannequin (1), mascot (1).


## r59-after

## Balance report

### naive bot, shopping: none, route: long (100 nights)

Nights won 0% (0), died 100% (100), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 15% | 85 | 0 | 0.6 | 9.8 | hanger 3.6, glob 2.9, elf 2.0 | $45 |
| F1b | 15 | 67% | 5 | 0 | 0.5 | 5.5 | glob 1.9, hanger 1.7, slam 0.7 | $70 |
| F2a | 10 | 80% | 2 | 0 | 0.6 | 6.3 | shopper 2.1, perfume 1.3, bossShot 1.0 | $97 |
| F2b | 8 | 50% | 4 | 0 | 0.6 | 7.8 | slam 2.3, glob 1.8, bossShot 1.1 | $117 |
| F3a | 4 | 75% | 1 | 0 | 0.6 | 8.0 | mascot 3.0, shopper 1.8, glob 1.5 | $153 |
| F3b | 3 | 33% | 2 | 0 | 0.6 | 9.0 | bossShot 2.0, ownerCharge 2.0, slam 2.0 | $181 |
| F4a | 1 | 0% | 1 | 0 | 0.6 | 11.0 | goon 6.0, other 2.0, slam 2.0 | $250 |

Deaths: F1a CUSTOMER SERVICE (24); F1a FREIGHT HALL (22); F1a TOY STOCKROOM (17); F1a SANTA'S WORKSHOP (15); F1a CAROUSEL COURT (4); F1a KIOSK ALLEY (3); F2b MANAGEMENT SUITE (3); F1b BACK HALL (2).
Killed by: glob (39), hanger (23), elf (20), mannequin (6), slam (4), shopper (2), walker (2), bossShot (1), burst (1), other (1), perfume (1).

### dodger bot, shopping: none, route: long (100 nights)

Nights won 1% (1), died 99% (99), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 64% | 36 | 0 | 0.8 | 7.5 | hanger 4.4, glob 1.6, elf 0.5 | $56 |
| F1b | 64 | 67% | 21 | 0 | 0.7 | 6.7 | hanger 3.0, glob 1.6, bossShot 1.4 | $78 |
| F2a | 43 | 84% | 7 | 0 | 0.7 | 4.8 | bossShot 1.3, glob 0.7, hanger 0.7 | $102 |
| F2b | 36 | 89% | 4 | 0 | 0.7 | 5.6 | bossShot 3.0, glob 1.1, shopper 0.4 | $119 |
| F3a | 32 | 91% | 3 | 0 | 0.8 | 5.2 | mascot 2.3, slam 0.6, glob 0.5 | $152 |
| F3b | 29 | 34% | 19 | 0 | 0.8 | 7.9 | bossShot 2.9, mascot 2.9, ownerCharge 1.0 | $184 |
| F4a | 10 | 60% | 4 | 0 | 0.8 | 5.8 | goon 2.3, slam 0.8, bossShot 0.7 | $251 |
| F4b | 6 | 17% | 5 | 0 | 0.8 | 8.8 | bossShot 5.0, glob 1.2, mascot 0.7 | $297 |

Deaths: F1a CUSTOMER SERVICE (24); F3b OWNER'S SUITE (18); F1b SECURITY OFFICE (15); F1a FREIGHT HALL (6); F1b BACK HALL (6); F2a PORTRAIT STUDIO (5); F4b HELIPAD (5); F2b MANAGEMENT SUITE (4).
Killed by: bossShot (32), hanger (28), glob (13), mascot (9), burst (3), goon (3), elf (2), other (2), slam (2), walker (2), mannequin (1), perfume (1), shopper (1).

### pro bot, shopping: none, route: long (100 nights)

Nights won 66% (66), died 34% (34), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.0 | 1.9 | burst 0.8, elf 0.5, hanger 0.3 | $62 |
| F1b | 100 | 100% | 0 | 0 | 0.9 | 1.2 | hanger 0.7, burst 0.2, shopper 0.1 | $86 |
| F2a | 100 | 87% | 13 | 0 | 0.9 | 3.8 | perfume 1.6, hanger 0.5, burst 0.4 | $116 |
| F2b | 87 | 97% | 3 | 0 | 0.8 | 2.7 | bossShot 1.0, shopper 0.5, static 0.3 | $149 |
| F3a | 84 | 94% | 5 | 0 | 0.8 | 3.5 | mascot 1.8, burst 0.5, shopper 0.3 | $183 |
| F3b | 79 | 87% | 10 | 0 | 0.9 | 4.8 | mascot 3.0, ownerCharge 0.7, shopper 0.3 | $225 |
| F4a | 69 | 99% | 1 | 0 | 0.8 | 3.5 | goon 1.0, mascot 0.6, burst 0.6 | $267 |
| F4b | 68 | 97% | 2 | 0 | 1.0 | 2.8 | roofer 1.0, barrage 0.5, bossShot 0.3 | $321 |

Deaths: F2a PORTRAIT STUDIO (10); F3b OWNER'S SUITE (9); F2b MANAGEMENT SUITE (3); F2a ELEVATOR BANK (2); F3a KENNEL ROW (2); F4b WATER TOWER (2); F2a MEZZANINE OFFICE (1); F3a FREEZER AISLE (1).
Killed by: perfume (10), mascot (8), ownerCharge (6), hanger (3), shopper (3), bossShot (1), mannequin (1), roofer (1), slam (1).

### pro bot, shopping: buy, route: long (100 nights)

Nights won 68% (68), died 32% (32), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.1 | 1.6 | burst 0.8, elf 0.3, hanger 0.3 | $28 |
| F1b | 100 | 99% | 1 | 0 | 1.0 | 1.2 | hanger 0.4, burst 0.3, shopper 0.1 | $23 |
| F2a | 99 | 90% | 10 | 0 | 0.9 | 3.4 | perfume 1.5, shopper 0.5, burst 0.4 | $32 |
| F2b | 89 | 92% | 7 | 0 | 0.9 | 2.8 | bossShot 1.0, shopper 0.5, static 0.3 | $31 |
| F3a | 82 | 95% | 4 | 0 | 0.9 | 3.3 | mascot 1.8, burst 0.6, hanger 0.2 | $38 |
| F3b | 78 | 88% | 9 | 0 | 1.0 | 4.2 | mascot 2.6, ownerCharge 0.5, bossShot 0.3 | $34 |
| F4a | 69 | 100% | 0 | 0 | 1.0 | 2.7 | mascot 0.7, burst 0.6, roofer 0.4 | $47 |
| F4b | 69 | 99% | 1 | 0 | 1.1 | 2.4 | roofer 0.8, mascot 0.4, barrage 0.3 | $49 |

Deaths: F2a PORTRAIT STUDIO (7); F3b OWNER'S SUITE (7); F2b MANAGEMENT SUITE (3); F3a WALK-IN COOLER (3); F2b CINEMA LOBBY (2); F2b PARKING STAIRWELL (2); F1b FOOD COURT (1); F2a ELEVATOR BANK (1).
Killed by: mascot (9), hanger (7), perfume (6), slam (3), bossShot (2), glob (2), ownerCharge (1), roofer (1), shopper (1).

### pro bot, shopping: buy, route: shortcut (100 nights)

Nights won 65% (65), died 35% (35), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.0 | 1.5 | burst 0.7, elf 0.3, hanger 0.2 | $27 |
| F1b | 100 | 100% | 0 | 0 | 0.9 | 1.0 | hanger 0.4, shopper 0.2, burst 0.2 | $23 |
| F2a | 100 | 86% | 14 | 0 | 0.9 | 3.4 | perfume 1.5, burst 0.5, shopper 0.4 | $32 |
| F2b | 86 | 94% | 5 | 0 | 0.8 | 2.2 | bossShot 0.9, shopper 0.4, static 0.3 | $31 |
| F3a | 81 | 96% | 3 | 0 | 0.8 | 3.3 | mascot 1.7, burst 0.5, shopper 0.2 | $41 |
| F3b | 78 | 88% | 9 | 0 | 0.9 | 3.8 | mascot 2.2, ownerCharge 0.5, bossShot 0.3 | $32 |
| F4a | 69 | 96% | 3 | 0 | 0.9 | 2.9 | mascot 0.7, burst 0.6, roofer 0.4 | $41 |
| F4b | 66 | 98% | 1 | 0 | 1.0 | 2.8 | roofer 0.8, mascot 0.5, barrage 0.5 | $53 |

Deaths: F2a PORTRAIT STUDIO (9); F3b OWNER'S SUITE (7); F2a FITTING ROOMS (3); F2b MANAGEMENT SUITE (3); F3a WALK-IN COOLER (2); F2a MAKEUP COUNTERS (1); F2a MEZZANINE OFFICE (1); F2b CINEMA LOBBY (1).
Killed by: mascot (10), perfume (8), hanger (5), bossShot (3), ownerCharge (3), slam (3), burst (1), mannequin (1), shopper (1).

### expert bot, shopping: buy, route: long (100 nights)

Nights won 92% (92), died 8% (8), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.0 | 1.0 | elf 0.5, hanger 0.4, walker 0.1 | $30 |
| F1b | 100 | 100% | 0 | 0 | 0.9 | 0.6 | hanger 0.5, glob 0.0, mannequin 0.0 | $26 |
| F2a | 100 | 99% | 1 | 0 | 0.8 | 0.8 | hanger 0.4, static 0.3, mannequin 0.1 | $48 |
| F2b | 99 | 98% | 2 | 0 | 0.8 | 0.7 | static 0.3, hanger 0.2, walker 0.1 | $37 |
| F3a | 97 | 99% | 1 | 0 | 0.8 | 1.1 | hanger 0.3, slam 0.2, static 0.2 | $43 |
| F3b | 96 | 97% | 3 | 0 | 0.9 | 0.5 | hanger 0.2, static 0.1, mannequin 0.1 | $55 |
| F4a | 93 | 100% | 0 | 0 | 0.9 | 0.6 | goon 0.2, hanger 0.1, slam 0.1 | $70 |
| F4b | 93 | 99% | 1 | 0 | 0.9 | 0.3 | static 0.1, hanger 0.0, other 0.0 | $66 |

Deaths: F3b LOADING DOCK (3); F2a ELEVATOR BANK (1); F2b CINEMA LOBBY (1); F2b PARKING STAIRWELL (1); F3a FREEZER AISLE (1); F4b HVAC YARD (1).
Killed by: hanger (4), walker (2), roofer (1), static (1).


## r59-tuned

## Balance report

### naive bot, shopping: none, route: long (100 nights)

Nights won 0% (0), died 100% (100), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 15% | 85 | 0 | 0.6 | 9.8 | hanger 3.6, glob 2.9, elf 2.0 | $45 |
| F1b | 15 | 67% | 5 | 0 | 0.5 | 5.6 | hanger 1.9, glob 1.9, slam 0.7 | $71 |
| F2a | 10 | 80% | 2 | 0 | 0.6 | 6.8 | shopper 2.4, perfume 1.6, bossShot 0.9 | $100 |
| F2b | 8 | 63% | 3 | 0 | 0.6 | 7.8 | slam 1.8, glob 1.5, bossShot 1.1 | $122 |
| F3a | 5 | 60% | 2 | 0 | 0.5 | 7.4 | mascot 3.6, glob 1.0, shopper 1.0 | $151 |
| F3b | 3 | 33% | 2 | 0 | 0.6 | 9.0 | mascot 2.7, bossShot 2.0, ownerCharge 2.0 | $203 |
| F4a | 1 | 0% | 1 | 0 | 0.7 | 11.0 | goon 3.0, mascot 2.0, slam 2.0 | $211 |

Deaths: F1a CUSTOMER SERVICE (24); F1a FREIGHT HALL (22); F1a TOY STOCKROOM (17); F1a SANTA'S WORKSHOP (15); F1a CAROUSEL COURT (4); F1a KIOSK ALLEY (3); F1b FOOD COURT (3); F2a PORTRAIT STUDIO (2).
Killed by: glob (38), hanger (22), elf (20), mannequin (6), slam (4), mascot (3), walker (2), bossShot (1), burst (1), goon (1), perfume (1), shopper (1).

### dodger bot, shopping: none, route: long (100 nights)

Nights won 1% (1), died 99% (99), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 64% | 36 | 0 | 0.8 | 7.5 | hanger 4.4, glob 1.6, elf 0.5 | $56 |
| F1b | 64 | 64% | 23 | 0 | 0.7 | 7.0 | hanger 3.1, glob 1.9, bossShot 1.2 | $78 |
| F2a | 41 | 88% | 5 | 0 | 0.7 | 4.6 | bossShot 1.2, perfume 1.0, glob 0.7 | $105 |
| F2b | 36 | 92% | 3 | 0 | 0.7 | 5.2 | bossShot 2.6, glob 1.0, shopper 0.6 | $132 |
| F3a | 33 | 79% | 7 | 0 | 0.7 | 5.7 | mascot 2.4, glob 0.7, slam 0.6 | $163 |
| F3b | 26 | 50% | 13 | 0 | 0.8 | 7.4 | mascot 2.9, bossShot 2.6, ownerCharge 0.8 | $200 |
| F4a | 13 | 62% | 5 | 0 | 0.9 | 6.2 | goon 1.2, bossShot 1.1, burst 1.1 | $277 |
| F4b | 8 | 13% | 7 | 0 | 0.9 | 7.9 | bossShot 4.3, glob 0.8, mascot 0.8 | $303 |

Deaths: F1a CUSTOMER SERVICE (24); F1b SECURITY OFFICE (14); F3b OWNER'S SUITE (13); F1b BACK HALL (9); F4b HELIPAD (7); F1a FREIGHT HALL (6); F3a WALK-IN COOLER (6); F4a PENALTY BOX (5).
Killed by: hanger (28), bossShot (26), glob (16), mascot (10), goon (4), burst (3), elf (2), mannequin (2), perfume (2), shopper (2), other (1), roofer (1), slam (1), walker (1).

### pro bot, shopping: none, route: long (100 nights)

Nights won 61% (61), died 38% (38), stalled 1% (1).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.0 | 1.9 | burst 0.8, elf 0.5, hanger 0.3 | $62 |
| F1b | 100 | 100% | 0 | 0 | 0.9 | 1.1 | hanger 0.7, burst 0.1, glob 0.1 | $87 |
| F2a | 100 | 87% | 13 | 0 | 0.8 | 3.8 | perfume 1.9, burst 0.4, hanger 0.4 | $118 |
| F2b | 87 | 98% | 2 | 0 | 0.8 | 2.8 | bossShot 1.0, shopper 0.6, static 0.4 | $152 |
| F3a | 85 | 89% | 8 | 1 | 0.9 | 3.5 | mascot 1.9, burst 0.5, slam 0.3 | $188 |
| F3b | 76 | 86% | 11 | 0 | 0.9 | 4.4 | mascot 2.6, ownerCharge 0.7, hanger 0.3 | $228 |
| F4a | 65 | 97% | 2 | 0 | 0.9 | 4.1 | goon 1.1, mascot 0.9, burst 0.6 | $276 |
| F4b | 63 | 97% | 2 | 0 | 1.0 | 2.8 | roofer 0.8, barrage 0.6, mascot 0.5 | $327 |

Deaths: F2a PORTRAIT STUDIO (8); F3b OWNER'S SUITE (8); F3a WALK-IN COOLER (4); F2a FITTING ROOMS (2); F2a GALLERY WALK (2); F2b MANAGEMENT SUITE (2); F3a FREEZER AISLE (2); F3b LOADING DOCK (2).
Killed by: mascot (13), perfume (9), bossShot (4), burst (2), hanger (2), slam (2), glob (1), mannequin (1), ownerCharge (1), roofer (1), shopper (1), walker (1).

### pro bot, shopping: buy, route: long (100 nights)

Nights won 64% (64), died 36% (36), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.1 | 1.6 | burst 0.8, elf 0.3, hanger 0.3 | $28 |
| F1b | 100 | 100% | 0 | 0 | 1.0 | 1.2 | hanger 0.5, burst 0.3, shopper 0.1 | $23 |
| F2a | 100 | 89% | 11 | 0 | 0.9 | 3.6 | perfume 1.4, shopper 0.6, burst 0.4 | $39 |
| F2b | 89 | 91% | 8 | 0 | 0.9 | 2.6 | bossShot 0.9, shopper 0.5, static 0.3 | $28 |
| F3a | 81 | 93% | 6 | 0 | 0.9 | 3.5 | mascot 1.6, burst 0.5, slam 0.3 | $36 |
| F3b | 75 | 91% | 7 | 0 | 1.0 | 4.4 | mascot 2.7, ownerCharge 0.6, bossShot 0.3 | $44 |
| F4a | 68 | 94% | 4 | 0 | 1.0 | 2.4 | mascot 0.7, burst 0.4, goon 0.4 | $72 |
| F4b | 64 | 100% | 0 | 0 | 1.2 | 2.1 | roofer 0.7, barrage 0.4, bossShot 0.3 | $55 |

Deaths: F2a PORTRAIT STUDIO (6); F3b OWNER'S SUITE (5); F2b MANAGEMENT SUITE (4); F4a ELEVATOR HOUSING (4); F2b PARKING STAIRWELL (3); F2a MEZZANINE OFFICE (2); F3a FREEZER AISLE (2); F3a WALK-IN COOLER (2).
Killed by: mascot (10), perfume (5), slam (5), hanger (4), shopper (4), burst (2), ownerCharge (2), walker (2), glob (1), static (1).

### pro bot, shopping: buy, route: shortcut (100 nights)

Nights won 54% (54), died 46% (46), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.0 | 1.5 | burst 0.7, elf 0.3, hanger 0.2 | $27 |
| F1b | 100 | 99% | 1 | 0 | 0.9 | 1.0 | hanger 0.4, shopper 0.2, burst 0.1 | $24 |
| F2a | 99 | 92% | 8 | 0 | 0.9 | 3.1 | perfume 1.1, burst 0.5, shopper 0.5 | $33 |
| F2b | 91 | 89% | 10 | 0 | 0.8 | 2.7 | bossShot 1.0, shopper 0.6, hanger 0.3 | $31 |
| F3a | 81 | 88% | 10 | 0 | 0.9 | 3.4 | mascot 1.6, burst 0.5, slam 0.2 | $41 |
| F3b | 71 | 87% | 9 | 0 | 0.9 | 3.9 | mascot 2.2, ownerCharge 0.7, bossShot 0.4 | $36 |
| F4a | 62 | 92% | 5 | 0 | 0.9 | 3.1 | mascot 0.8, roofer 0.7, burst 0.4 | $48 |
| F4b | 57 | 95% | 3 | 0 | 1.1 | 3.0 | roofer 0.7, mascot 0.6, barrage 0.5 | $46 |

Deaths: F3a WALK-IN COOLER (8); F3b OWNER'S SUITE (8); F2b MANAGEMENT SUITE (6); F2a PORTRAIT STUDIO (4); F2b CINEMA LOBBY (4); F4a ELEVATOR HOUSING (3); F2a MEZZANINE OFFICE (2); F1b FOOD COURT (1).
Killed by: mascot (14), hanger (9), bossShot (5), shopper (4), ownerCharge (3), perfume (3), slam (3), burst (1), glob (1), other (1), roofer (1), walker (1).

### expert bot, shopping: buy, route: long (100 nights)

Nights won 90% (90), died 10% (10), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.0 | 1.0 | elf 0.5, hanger 0.4, walker 0.1 | $30 |
| F1b | 100 | 100% | 0 | 0 | 0.9 | 0.6 | hanger 0.5, mannequin 0.0, walker 0.0 | $25 |
| F2a | 100 | 98% | 2 | 0 | 0.9 | 0.9 | hanger 0.4, static 0.3, mannequin 0.1 | $46 |
| F2b | 98 | 98% | 2 | 0 | 0.9 | 0.7 | static 0.4, hanger 0.2, mannequin 0.1 | $31 |
| F3a | 96 | 100% | 0 | 0 | 0.9 | 0.9 | static 0.2, hanger 0.2, poodle 0.2 | $40 |
| F3b | 96 | 98% | 2 | 0 | 0.9 | 0.6 | hanger 0.3, static 0.2, mannequin 0.1 | $44 |
| F4a | 94 | 97% | 3 | 0 | 0.9 | 0.8 | goon 0.3, hanger 0.2, static 0.1 | $47 |
| F4b | 91 | 99% | 1 | 0 | 0.9 | 0.2 | static 0.1, hanger 0.1, glob 0.0 | $51 |

Deaths: F2a ELEVATOR BANK (2); F2b PARKING STAIRWELL (2); F4a THE ICE RINK (2); F3b ARCADE (1); F3b LOADING DOCK (1); F4a GRAVEL YARD (1); F4b HVAC YARD (1).
Killed by: hanger (7), mannequin (2), roofer (1).


## r59-elite

## Balance report

### naive bot, shopping: none, route: long (100 nights)

Nights won 0% (0), died 100% (100), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 14% | 86 | 0 | 0.6 | 9.8 | hanger 3.6, glob 2.9, elf 2.0 | $45 |
| F1b | 14 | 64% | 5 | 0 | 0.5 | 6.3 | glob 2.4, hanger 1.8, slam 1.0 | $74 |
| F2a | 9 | 78% | 2 | 0 | 0.6 | 6.9 | shopper 2.1, perfume 1.8, bossShot 1.0 | $106 |
| F2b | 7 | 71% | 2 | 0 | 0.6 | 8.0 | shopper 1.7, slam 1.7, glob 1.4 | $134 |
| F3a | 5 | 60% | 2 | 0 | 0.5 | 6.4 | mascot 3.6, shopper 1.0, burst 0.6 | $173 |
| F3b | 3 | 0% | 3 | 0 | 0.6 | 9.7 | mascot 2.7, bossShot 2.0, ownerCharge 2.0 | $223 |

Deaths: F1a FREIGHT HALL (23); F1a CUSTOMER SERVICE (21); F1a TOY STOCKROOM (20); F1a SANTA'S WORKSHOP (13); F1a KIOSK ALLEY (5); F1a CAROUSEL COURT (4); F3b OWNER'S SUITE (3); F1b BACK HALL (2).
Killed by: glob (33), hanger (27), elf (19), slam (6), mannequin (5), shopper (3), bossShot (2), mascot (2), other (1), perfume (1), walker (1).

### dodger bot, shopping: none, route: long (100 nights)

Nights won 2% (2), died 98% (98), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 60% | 40 | 0 | 0.8 | 7.4 | hanger 4.4, glob 1.6, elf 0.4 | $56 |
| F1b | 60 | 62% | 23 | 0 | 0.7 | 6.2 | hanger 2.6, glob 1.9, bossShot 0.9 | $80 |
| F2a | 37 | 89% | 4 | 0 | 0.7 | 4.5 | bossShot 0.9, glob 0.8, perfume 0.7 | $107 |
| F2b | 33 | 88% | 4 | 0 | 0.7 | 5.8 | bossShot 2.9, glob 1.2, shopper 0.7 | $128 |
| F3a | 29 | 93% | 2 | 0 | 0.8 | 5.3 | mascot 2.2, slam 0.6, glob 0.6 | $169 |
| F3b | 27 | 56% | 12 | 0 | 0.8 | 7.3 | bossShot 2.6, mascot 2.3, ownerCharge 1.0 | $210 |
| F4a | 15 | 60% | 6 | 0 | 0.9 | 6.7 | goon 1.7, bossShot 1.5, roofer 0.8 | $256 |
| F4b | 9 | 22% | 7 | 0 | 0.9 | 7.6 | bossShot 4.4, slam 0.7, glob 0.6 | $310 |

Deaths: F1a CUSTOMER SERVICE (25); F3b OWNER'S SUITE (12); F1b BACK HALL (11); F1b SECURITY OFFICE (11); F1a FREIGHT HALL (8); F4b HELIPAD (7); F4a PENALTY BOX (6); F1a TOY STOCKROOM (3).
Killed by: hanger (35), bossShot (23), glob (15), mannequin (4), mascot (4), ownerCharge (4), burst (3), elf (2), shopper (2), slam (2), goon (1), perfume (1), roofer (1), walker (1).

### pro bot, shopping: none, route: long (100 nights)

Nights won 62% (62), died 38% (38), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.0 | 2.1 | burst 1.0, elf 0.6, hanger 0.4 | $65 |
| F1b | 100 | 99% | 1 | 0 | 0.9 | 1.6 | hanger 0.9, burst 0.4, shopper 0.1 | $91 |
| F2a | 99 | 90% | 10 | 0 | 0.9 | 4.0 | perfume 1.7, burst 0.6, hanger 0.5 | $124 |
| F2b | 89 | 96% | 4 | 0 | 0.9 | 3.1 | bossShot 1.0, shopper 0.7, burst 0.3 | $154 |
| F3a | 85 | 87% | 11 | 0 | 0.8 | 3.0 | mascot 1.6, burst 0.5, hanger 0.2 | $194 |
| F3b | 74 | 88% | 9 | 0 | 0.9 | 4.6 | mascot 2.8, ownerCharge 0.7, bossShot 0.3 | $240 |
| F4a | 65 | 97% | 2 | 0 | 0.9 | 3.4 | goon 1.1, mascot 0.7, burst 0.5 | $283 |
| F4b | 63 | 98% | 1 | 0 | 1.1 | 3.0 | roofer 1.0, mascot 0.6, barrage 0.6 | $341 |

Deaths: F2a PORTRAIT STUDIO (6); F3b OWNER'S SUITE (6); F3a WALK-IN COOLER (5); F2b MANAGEMENT SUITE (3); F3a FREEZER AISLE (3); F2a MEZZANINE OFFICE (2); F3a BALL PIT (2); F3b LOADING DOCK (2).
Killed by: mascot (15), hanger (5), bossShot (4), perfume (4), ownerCharge (3), glob (2), shopper (2), slam (2), burst (1).

### pro bot, shopping: buy, route: long (100 nights)

Nights won 56% (56), died 44% (44), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.1 | 1.9 | burst 1.0, elf 0.3, hanger 0.3 | $31 |
| F1b | 100 | 99% | 1 | 0 | 1.0 | 1.3 | hanger 0.6, burst 0.4, bossShot 0.1 | $26 |
| F2a | 99 | 82% | 18 | 0 | 1.0 | 4.2 | perfume 1.7, hanger 0.5, shopper 0.5 | $34 |
| F2b | 81 | 91% | 7 | 0 | 0.9 | 3.0 | bossShot 1.0, burst 0.5, shopper 0.4 | $27 |
| F3a | 74 | 91% | 7 | 0 | 0.9 | 3.4 | mascot 1.8, burst 0.5, shopper 0.2 | $33 |
| F3b | 67 | 90% | 7 | 0 | 1.0 | 4.3 | mascot 2.8, ownerCharge 0.5, burst 0.3 | $35 |
| F4a | 60 | 95% | 3 | 0 | 1.0 | 2.9 | mascot 0.6, burst 0.6, goon 0.6 | $49 |
| F4b | 57 | 98% | 1 | 0 | 1.2 | 2.9 | roofer 1.1, mascot 0.5, barrage 0.4 | $54 |

Deaths: F2a PORTRAIT STUDIO (6); F2a ELEVATOR BANK (4); F2b CINEMA LOBBY (4); F3b OWNER'S SUITE (4); F2a FITTING ROOMS (3); F3a FREEZER AISLE (3); F3b ARCADE (3); F2a GALLERY WALK (2).
Killed by: hanger (11), mascot (8), perfume (7), shopper (5), bossShot (4), walker (3), slam (2), barrage (1), glob (1), goon (1), ownerCharge (1).

### pro bot, shopping: buy, route: shortcut (100 nights)

Nights won 60% (60), died 40% (40), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.0 | 1.7 | burst 0.8, elf 0.3, hanger 0.2 | $29 |
| F1b | 100 | 98% | 2 | 0 | 0.9 | 1.1 | hanger 0.5, burst 0.2, shopper 0.1 | $25 |
| F2a | 98 | 91% | 9 | 0 | 0.9 | 3.6 | perfume 1.3, burst 0.5, shopper 0.4 | $32 |
| F2b | 89 | 92% | 7 | 0 | 0.8 | 2.5 | bossShot 0.7, shopper 0.5, burst 0.4 | $30 |
| F3a | 82 | 94% | 5 | 0 | 0.9 | 3.1 | mascot 1.6, burst 0.5, hanger 0.2 | $40 |
| F3b | 77 | 82% | 14 | 0 | 0.9 | 4.3 | mascot 2.5, ownerCharge 0.5, bossShot 0.4 | $34 |
| F4a | 63 | 98% | 1 | 0 | 1.0 | 2.9 | mascot 0.8, burst 0.5, roofer 0.4 | $63 |
| F4b | 62 | 97% | 2 | 0 | 1.1 | 2.9 | roofer 0.8, bossShot 0.5, mascot 0.5 | $48 |

Deaths: F3b OWNER'S SUITE (8); F3a WALK-IN COOLER (5); F2a MEZZANINE OFFICE (4); F2a PORTRAIT STUDIO (4); F3b ARCADE (4); F2b MANAGEMENT SUITE (3); F2b CINEMA LOBBY (2); F2b PARKING STAIRWELL (2).
Killed by: mascot (12), hanger (11), shopper (4), bossShot (3), glob (3), perfume (3), ownerCharge (2), roofer (1), static (1).

### expert bot, shopping: buy, route: long (100 nights)

Nights won 95% (95), died 5% (5), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.1 | 1.1 | elf 0.5, hanger 0.4, mannequin 0.0 | $31 |
| F1b | 100 | 100% | 0 | 0 | 0.9 | 0.5 | hanger 0.4, mannequin 0.0, glob 0.0 | $27 |
| F2a | 100 | 98% | 2 | 0 | 0.9 | 1.1 | hanger 0.6, static 0.4, bossShot 0.1 | $48 |
| F2b | 98 | 100% | 0 | 0 | 0.9 | 0.6 | static 0.3, hanger 0.2, mannequin 0.1 | $46 |
| F3a | 98 | 98% | 2 | 0 | 0.9 | 1.0 | hanger 0.3, static 0.3, slam 0.2 | $47 |
| F3b | 96 | 100% | 0 | 0 | 1.0 | 0.3 | static 0.2, hanger 0.1, mannequin 0.0 | $50 |
| F4a | 96 | 99% | 1 | 0 | 0.9 | 0.8 | goon 0.4, hanger 0.2, static 0.1 | $52 |
| F4b | 95 | 100% | 0 | 0 | 1.0 | 0.2 | static 0.1, hanger 0.0, other 0.0 | $57 |

Deaths: F3a FREEZER AISLE (2); F2a ELEVATOR BANK (1); F2a FITTING ROOMS (1); F4a THE ICE RINK (1).
Killed by: hanger (5).

