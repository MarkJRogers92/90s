# Round 58 balance: per-floor layouts

`npm run balance` before (`origin/main` 90204ab) and after the round-58 layouts, plus a 160-night rerun of the two shopping bots (`BALANCE_NIGHTS=160 BALANCE_BOTS=pro:buy,expert:buy`). Floor 1 is row-for-row identical; floors 2-4 are a little harder, mostly in the mid-floor fights. The owner asked for harder (2026-10-05), so nothing was tuned back.

## 160 nights, before

## Balance report

### pro bot, shopping: buy, route: long (160 nights)

Nights won 61% (97), died 39% (63), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 160 | 100% | 0 | 0 | 1.1 | 1.4 | burst 0.8, elf 0.4, hanger 0.2 | $28 |
| F1b | 160 | 99% | 2 | 0 | 0.9 | 1.1 | hanger 0.4, burst 0.2, glob 0.2 | $22 |
| F2a | 158 | 92% | 12 | 0 | 0.9 | 3.2 | perfume 1.3, burst 0.5, hanger 0.4 | $37 |
| F2b | 146 | 99% | 2 | 0 | 0.9 | 1.6 | shopper 0.5, static 0.3, burst 0.2 | $29 |
| F3a | 144 | 92% | 12 | 0 | 0.9 | 3.2 | mascot 1.8, burst 0.5, shopper 0.3 | $37 |
| F3b | 132 | 80% | 27 | 0 | 1.0 | 4.4 | mascot 2.6, ownerCharge 0.8, shopper 0.3 | $38 |
| F4a | 105 | 97% | 3 | 0 | 1.0 | 3.2 | mascot 0.9, burst 0.6, goon 0.5 | $45 |
| F4b | 102 | 95% | 5 | 0 | 1.1 | 2.8 | roofer 0.6, barrage 0.6, mascot 0.5 | $50 |

Deaths: F3b OWNER'S SUITE (22); F2a PORTRAIT STUDIO (7); F3a WALK-IN COOLER (7); F3a FREEZER AISLE (4); F3b ARCADE (3); F2a FITTING ROOMS (2); F2a MEZZANINE OFFICE (2); F3b LOADING DOCK (2).
Killed by: ownerCharge (20), mascot (12), hanger (7), perfume (7), shopper (5), glob (3), bossShot (2), burst (2), mannequin (2), barrage (1), roofer (1), static (1).

### expert bot, shopping: buy, route: long (160 nights)

Nights won 94% (151), died 6% (9), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 160 | 100% | 0 | 0 | 1.0 | 1.0 | elf 0.6, hanger 0.3, barrage 0.1 | $30 |
| F1b | 160 | 100% | 0 | 0 | 0.9 | 0.7 | hanger 0.6, mannequin 0.1, walker 0.0 | $20 |
| F2a | 160 | 99% | 2 | 0 | 0.8 | 1.1 | hanger 0.5, static 0.3, mannequin 0.1 | $34 |
| F2b | 158 | 99% | 2 | 0 | 0.8 | 0.8 | hanger 0.4, static 0.3, mannequin 0.1 | $28 |
| F3a | 156 | 99% | 2 | 0 | 0.8 | 1.0 | hanger 0.3, static 0.2, slam 0.1 | $31 |
| F3b | 154 | 100% | 0 | 0 | 0.9 | 0.5 | static 0.2, hanger 0.2, mannequin 0.1 | $45 |
| F4a | 154 | 98% | 3 | 0 | 0.9 | 0.8 | goon 0.4, static 0.2, hanger 0.2 | $44 |
| F4b | 151 | 100% | 0 | 0 | 0.9 | 0.3 | static 0.2, hanger 0.0, mannequin 0.0 | $54 |

Deaths: F4a ZAMBONI GARAGE (2); F2a FITTING ROOMS (1); F2a MEZZANINE OFFICE (1); F2b CINEMA LOBBY (1); F2b PARKING STAIRWELL (1); F3a KENNEL ROW (1); F3a WALK-IN COOLER (1); F4a PENALTY BOX (1).
Killed by: hanger (6), goon (1), slam (1), static (1).


## 160 nights, after

## Balance report

### pro bot, shopping: buy, route: long (160 nights)

Nights won 57% (91), died 43% (69), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 160 | 100% | 0 | 0 | 1.1 | 1.4 | burst 0.8, elf 0.4, hanger 0.2 | $28 |
| F1b | 160 | 99% | 2 | 0 | 0.9 | 1.1 | hanger 0.4, burst 0.2, glob 0.2 | $22 |
| F2a | 158 | 91% | 14 | 0 | 0.9 | 3.3 | perfume 1.3, burst 0.5, hanger 0.4 | $34 |
| F2b | 144 | 93% | 10 | 0 | 0.9 | 2.1 | shopper 0.7, hanger 0.4, bossShot 0.3 | $28 |
| F3a | 134 | 85% | 20 | 0 | 0.9 | 3.2 | mascot 1.9, burst 0.4, shopper 0.2 | $32 |
| F3b | 114 | 84% | 18 | 0 | 1.0 | 3.6 | mascot 2.0, ownerCharge 0.6, bossShot 0.4 | $36 |
| F4a | 96 | 95% | 5 | 0 | 1.0 | 2.8 | mascot 0.8, burst 0.6, roofer 0.5 | $44 |
| F4b | 91 | 100% | 0 | 0 | 1.1 | 2.6 | roofer 0.8, barrage 0.6, bossShot 0.5 | $50 |

Deaths: F3b OWNER'S SUITE (15); F3a WALK-IN COOLER (13); F2a PORTRAIT STUDIO (7); F2b CINEMA LOBBY (5); F4a ELEVATOR HOUSING (4); F2b PARKING STAIRWELL (3); F3a BALL PIT (3); F2a ELEVATOR BANK (2).
Killed by: mascot (26), hanger (12), ownerCharge (9), perfume (7), bossShot (4), glob (3), mannequin (3), shopper (3), burst (1), slam (1).

### expert bot, shopping: buy, route: long (160 nights)

Nights won 89% (142), died 11% (18), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 160 | 100% | 0 | 0 | 1.0 | 1.0 | elf 0.6, hanger 0.3, barrage 0.1 | $30 |
| F1b | 160 | 100% | 0 | 0 | 0.9 | 0.7 | hanger 0.6, mannequin 0.1, walker 0.0 | $20 |
| F2a | 160 | 98% | 3 | 0 | 0.8 | 1.0 | hanger 0.5, static 0.3, mannequin 0.1 | $36 |
| F2b | 157 | 97% | 5 | 0 | 0.8 | 0.8 | hanger 0.3, static 0.2, walker 0.2 | $32 |
| F3a | 152 | 99% | 1 | 0 | 0.8 | 0.8 | hanger 0.3, static 0.2, poodle 0.1 | $39 |
| F3b | 151 | 97% | 4 | 0 | 0.9 | 0.6 | hanger 0.4, mannequin 0.1, static 0.1 | $43 |
| F4a | 147 | 97% | 4 | 0 | 0.9 | 0.8 | goon 0.3, hanger 0.2, static 0.1 | $45 |
| F4b | 143 | 99% | 1 | 0 | 1.0 | 0.3 | hanger 0.2, static 0.1, other 0.0 | $56 |

Deaths: F2b CINEMA LOBBY (3); F3b LOADING DOCK (3); F2b PARKING STAIRWELL (2); F4a ZAMBONI GARAGE (2); F2a FITTING ROOMS (1); F2a GALLERY WALK (1); F2a MEZZANINE OFFICE (1); F3a WALK-IN COOLER (1).
Killed by: hanger (9), walker (5), goon (2), mannequin (1), mascot (1).


## 40 nights (the default run), before

## Balance report

### naive bot, shopping: none, route: long (40 nights)

Nights won 0% (0), died 100% (40), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 40 | 18% | 33 | 0 | 0.6 | 9.3 | hanger 3.8, glob 3.0, elf 1.3 | $42 |
| F1b | 7 | 71% | 2 | 0 | 0.6 | 5.4 | glob 2.0, hanger 2.0, mannequin 0.6 | $69 |
| F2a | 5 | 80% | 1 | 0 | 0.6 | 6.0 | perfume 2.6, bossShot 1.6, slam 1.2 | $93 |
| F2b | 4 | 50% | 2 | 0 | 0.6 | 8.5 | shopper 1.8, hanger 1.5, slam 1.5 | $117 |
| F3a | 2 | 100% | 0 | 0 | 0.6 | 6.5 | shopper 3.0, mascot 2.0, glob 1.5 | $171 |
| F3b | 2 | 0% | 2 | 0 | 0.6 | 9.5 | glob 2.0, mascot 2.0, ownerCharge 2.0 | $211 |

Deaths: F1a FREIGHT HALL (11); F1a CUSTOMER SERVICE (10); F1a TOY STOCKROOM (5); F1a KIOSK ALLEY (3); F1a CAROUSEL COURT (2); F1a SANTA'S WORKSHOP (2); F3b OWNER'S SUITE (2); F1b BACK HALL (1).
Killed by: glob (15), hanger (13), mannequin (4), elf (3), mascot (1), ownerCharge (1), perfume (1), shopper (1), walker (1).

### dodger bot, shopping: none, route: long (40 nights)

Nights won 3% (1), died 98% (39), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 40 | 50% | 20 | 0 | 0.8 | 7.9 | hanger 4.7, glob 2.0, mannequin 0.6 | $51 |
| F1b | 20 | 50% | 10 | 0 | 0.7 | 8.0 | hanger 3.5, glob 2.3, bossShot 1.6 | $77 |
| F2a | 10 | 100% | 0 | 0 | 0.6 | 3.8 | bossShot 1.2, shopper 0.7, glob 0.5 | $106 |
| F2b | 10 | 100% | 0 | 0 | 0.7 | 4.3 | bossShot 2.6, glob 0.9, shopper 0.5 | $132 |
| F3a | 10 | 100% | 0 | 0 | 0.8 | 4.6 | mascot 1.2, glob 0.9, burst 0.7 | $162 |
| F3b | 10 | 40% | 6 | 0 | 0.8 | 7.7 | bossShot 2.2, mascot 2.2, glob 1.7 | $191 |
| F4a | 4 | 25% | 3 | 0 | 0.7 | 8.3 | goon 4.0, bossShot 1.5, glob 1.0 | $226 |
| F4b | 1 | 100% | 0 | 0 | 0.9 | 5.0 | bossShot 5.0 | $363 |

Deaths: F1a CUSTOMER SERVICE (9); F1b SECURITY OFFICE (7); F1a FREIGHT HALL (6); F3b OWNER'S SUITE (5); F1a KIOSK ALLEY (3); F1b BACK HALL (3); F4a PENALTY BOX (2); F1a CAROUSEL COURT (1).
Killed by: glob (13), hanger (11), bossShot (7), goon (2), mascot (2), walker (2), mannequin (1), ownerCharge (1).

### pro bot, shopping: none, route: long (40 nights)

Nights won 57% (23), died 43% (17), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 40 | 100% | 0 | 0 | 1.0 | 1.9 | burst 0.8, elf 0.5, hanger 0.4 | $61 |
| F1b | 40 | 100% | 0 | 0 | 0.9 | 1.1 | hanger 0.4, burst 0.3, shopper 0.1 | $87 |
| F2a | 40 | 88% | 5 | 0 | 0.9 | 3.8 | perfume 1.7, burst 0.7, bossShot 0.3 | $116 |
| F2b | 35 | 100% | 0 | 0 | 0.8 | 2.2 | shopper 0.6, burst 0.4, static 0.4 | $148 |
| F3a | 35 | 86% | 5 | 0 | 0.9 | 3.1 | mascot 1.7, burst 0.4, hanger 0.2 | $183 |
| F3b | 30 | 80% | 6 | 0 | 0.9 | 4.9 | mascot 3.2, ownerCharge 0.6, burst 0.3 | $228 |
| F4a | 24 | 96% | 1 | 0 | 0.8 | 3.3 | goon 1.0, mascot 0.9, burst 0.4 | $271 |
| F4b | 23 | 100% | 0 | 0 | 0.9 | 2.4 | roofer 0.9, barrage 0.3, mascot 0.3 | $327 |

Deaths: F3b OWNER'S SUITE (6); F2a PORTRAIT STUDIO (4); F3a WALK-IN COOLER (3); F3a KENNEL ROW (2); F2a MEZZANINE OFFICE (1); F4a ELEVATOR HOUSING (1).
Killed by: mascot (5), ownerCharge (4), burst (3), perfume (3), bossShot (1), hanger (1).

### pro bot, shopping: buy, route: long (40 nights)

Nights won 78% (31), died 23% (9), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 40 | 100% | 0 | 0 | 1.1 | 1.6 | burst 0.8, elf 0.4, hanger 0.1 | $28 |
| F1b | 40 | 98% | 1 | 0 | 1.0 | 1.3 | hanger 0.4, burst 0.3, glob 0.3 | $22 |
| F2a | 39 | 95% | 2 | 0 | 0.9 | 3.2 | perfume 1.1, burst 0.7, bossShot 0.5 | $29 |
| F2b | 37 | 100% | 0 | 0 | 0.9 | 1.4 | shopper 0.5, burst 0.3, bossShot 0.2 | $29 |
| F3a | 37 | 97% | 1 | 0 | 0.9 | 2.2 | mascot 1.0, burst 0.4, shopper 0.2 | $32 |
| F3b | 36 | 86% | 5 | 0 | 1.1 | 4.8 | mascot 2.9, ownerCharge 0.8, shopper 0.3 | $35 |
| F4a | 31 | 100% | 0 | 0 | 1.0 | 3.2 | mascot 0.8, burst 0.6, roofer 0.5 | $44 |
| F4b | 31 | 100% | 0 | 0 | 1.1 | 2.1 | roofer 0.5, barrage 0.4, bossShot 0.4 | $52 |

Deaths: F3b OWNER'S SUITE (3); F1b BACK HALL (1); F2a FITTING ROOMS (1); F2a PORTRAIT STUDIO (1); F3a FREEZER AISLE (1); F3b ARCADE (1); F3b LOADING DOCK (1).
Killed by: mascot (2), ownerCharge (2), perfume (2), glob (1), mannequin (1), shopper (1).

### pro bot, shopping: buy, route: shortcut (40 nights)

Nights won 73% (29), died 28% (11), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 40 | 100% | 0 | 0 | 1.0 | 1.4 | burst 0.7, elf 0.3, hanger 0.2 | $26 |
| F1b | 40 | 100% | 0 | 0 | 0.9 | 0.8 | hanger 0.3, burst 0.1, glob 0.1 | $21 |
| F2a | 40 | 93% | 3 | 0 | 0.9 | 3.3 | perfume 1.5, bossShot 0.6, burst 0.5 | $32 |
| F2b | 37 | 100% | 0 | 0 | 0.8 | 1.2 | shopper 0.4, burst 0.3, bossShot 0.2 | $29 |
| F3a | 37 | 92% | 3 | 0 | 0.9 | 2.9 | mascot 1.5, burst 0.4, slam 0.3 | $31 |
| F3b | 34 | 94% | 2 | 0 | 0.9 | 3.7 | mascot 1.9, bossShot 0.5, ownerCharge 0.5 | $40 |
| F4a | 32 | 91% | 3 | 0 | 0.9 | 2.8 | mascot 0.9, goon 0.4, roofer 0.3 | $53 |
| F4b | 29 | 100% | 0 | 0 | 1.0 | 2.2 | roofer 0.6, barrage 0.5, mascot 0.3 | $57 |

Deaths: F2a PORTRAIT STUDIO (2); F3a WALK-IN COOLER (2); F3b OWNER'S SUITE (2); F4a ELEVATOR HOUSING (2); F2a FITTING ROOMS (1); F3a BALL PIT (1); F4a PENALTY BOX (1).
Killed by: mascot (4), bossShot (2), ownerCharge (2), perfume (2), shopper (1).

### expert bot, shopping: buy, route: long (40 nights)

Nights won 98% (39), died 3% (1), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 40 | 100% | 0 | 0 | 1.0 | 0.8 | elf 0.5, hanger 0.2, glob 0.1 | $33 |
| F1b | 40 | 100% | 0 | 0 | 0.9 | 0.7 | hanger 0.6, mannequin 0.1, glob 0.0 | $21 |
| F2a | 40 | 100% | 0 | 0 | 0.8 | 1.0 | hanger 0.4, static 0.4, bossShot 0.1 | $33 |
| F2b | 40 | 100% | 0 | 0 | 0.8 | 1.1 | hanger 0.6, static 0.3, mannequin 0.1 | $21 |
| F3a | 40 | 98% | 1 | 0 | 0.8 | 1.3 | hanger 0.5, static 0.4, poodle 0.1 | $24 |
| F3b | 39 | 100% | 0 | 0 | 0.9 | 0.6 | static 0.3, hanger 0.2, mannequin 0.1 | $45 |
| F4a | 39 | 100% | 0 | 0 | 0.9 | 0.6 | hanger 0.2, static 0.2, goon 0.2 | $44 |
| F4b | 39 | 100% | 0 | 0 | 0.9 | 0.3 | static 0.1, hanger 0.1, mannequin 0.1 | $49 |

Deaths: F3a KENNEL ROW (1).
Killed by: hanger (1).


## 40 nights, after

## Balance report

### naive bot, shopping: none, route: long (40 nights)

Nights won 3% (1), died 98% (39), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 40 | 18% | 33 | 0 | 0.6 | 9.3 | hanger 3.8, glob 3.0, elf 1.3 | $42 |
| F1b | 7 | 71% | 2 | 0 | 0.6 | 5.4 | glob 2.0, hanger 2.0, mannequin 0.6 | $69 |
| F2a | 5 | 80% | 1 | 0 | 0.6 | 6.0 | perfume 2.6, bossShot 1.6, slam 1.2 | $93 |
| F2b | 4 | 75% | 1 | 0 | 0.6 | 7.3 | shopper 1.5, slam 1.5, glob 1.3 | $116 |
| F3a | 3 | 67% | 1 | 0 | 0.5 | 5.7 | poodle 2.0, mascot 1.3, shopper 1.0 | $148 |
| F3b | 2 | 50% | 1 | 0 | 0.6 | 8.5 | bossShot 2.0, mascot 2.0, ownerCharge 2.0 | $224 |
| F4a | 1 | 100% | 0 | 0 | 0.6 | 10.0 | goon 6.0, slam 2.0, bossShot 1.0 | $283 |
| F4b | 1 | 100% | 0 | 0 | 0.7 | 6.0 | bossShot 2.0, glob 2.0, roofer 2.0 | $324 |

Deaths: F1a FREIGHT HALL (11); F1a CUSTOMER SERVICE (10); F1a TOY STOCKROOM (5); F1a KIOSK ALLEY (3); F1a CAROUSEL COURT (2); F1a SANTA'S WORKSHOP (2); F1b BACK HALL (1); F1b SECURITY OFFICE (1).
Killed by: glob (15), hanger (12), mannequin (4), elf (3), perfume (1), poodle (1), shopper (1), slam (1), walker (1).

### dodger bot, shopping: none, route: long (40 nights)

Nights won 0% (0), died 100% (40), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 40 | 50% | 20 | 0 | 0.8 | 7.9 | hanger 4.7, glob 2.0, mannequin 0.6 | $51 |
| F1b | 20 | 50% | 10 | 0 | 0.7 | 8.0 | hanger 3.5, glob 2.3, bossShot 1.6 | $77 |
| F2a | 10 | 100% | 0 | 0 | 0.6 | 3.7 | bossShot 1.2, glob 0.6, shopper 0.5 | $107 |
| F2b | 10 | 100% | 0 | 0 | 0.7 | 4.6 | bossShot 2.5, glob 0.7, shopper 0.7 | $129 |
| F3a | 10 | 90% | 1 | 0 | 0.7 | 4.8 | mascot 1.5, hanger 0.9, glob 0.8 | $157 |
| F3b | 9 | 44% | 5 | 0 | 0.8 | 7.1 | bossShot 2.4, mascot 2.1, ownerCharge 1.1 | $196 |
| F4a | 4 | 0% | 4 | 0 | 0.7 | 8.8 | goon 4.3, bossShot 2.3, slam 1.5 | $212 |

Deaths: F1a CUSTOMER SERVICE (9); F1b SECURITY OFFICE (7); F1a FREIGHT HALL (6); F3b OWNER'S SUITE (5); F4a PENALTY BOX (4); F1a KIOSK ALLEY (3); F1b BACK HALL (3); F1a CAROUSEL COURT (1).
Killed by: hanger (12), bossShot (11), glob (11), goon (2), walker (2), mannequin (1), ownerCharge (1).

### pro bot, shopping: none, route: long (40 nights)

Nights won 60% (24), died 40% (16), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 40 | 100% | 0 | 0 | 1.0 | 1.9 | burst 0.8, elf 0.5, hanger 0.4 | $61 |
| F1b | 40 | 100% | 0 | 0 | 0.9 | 1.1 | hanger 0.4, burst 0.3, shopper 0.1 | $87 |
| F2a | 40 | 88% | 5 | 0 | 0.8 | 3.7 | perfume 1.7, burst 0.6, bossShot 0.3 | $115 |
| F2b | 35 | 97% | 1 | 0 | 0.8 | 1.8 | shopper 0.5, static 0.3, bossShot 0.3 | $146 |
| F3a | 34 | 91% | 3 | 0 | 0.8 | 2.6 | mascot 1.3, burst 0.4, hanger 0.3 | $175 |
| F3b | 31 | 81% | 6 | 0 | 0.8 | 4.2 | mascot 2.1, ownerCharge 1.2, bossShot 0.3 | $210 |
| F4a | 25 | 96% | 1 | 0 | 0.9 | 4.0 | goon 1.1, mascot 0.9, burst 0.5 | $263 |
| F4b | 24 | 100% | 0 | 0 | 1.0 | 1.9 | roofer 0.5, barrage 0.3, burst 0.3 | $331 |

Deaths: F2a PORTRAIT STUDIO (4); F3b ARCADE (3); F3b OWNER'S SUITE (3); F3a WALK-IN COOLER (2); F2a MEZZANINE OFFICE (1); F2b MANAGEMENT SUITE (1); F3a KENNEL ROW (1); F4a ELEVATOR HOUSING (1).
Killed by: mascot (5), ownerCharge (3), perfume (3), burst (2), bossShot (1), shopper (1), slam (1).

### pro bot, shopping: buy, route: long (40 nights)

Nights won 60% (24), died 40% (16), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 40 | 100% | 0 | 0 | 1.1 | 1.6 | burst 0.8, elf 0.4, hanger 0.1 | $28 |
| F1b | 40 | 98% | 1 | 0 | 1.0 | 1.3 | hanger 0.4, burst 0.3, glob 0.3 | $22 |
| F2a | 39 | 90% | 4 | 0 | 0.9 | 3.2 | perfume 1.1, burst 0.6, bossShot 0.5 | $28 |
| F2b | 35 | 100% | 0 | 0 | 0.9 | 1.6 | shopper 0.6, bossShot 0.3, burst 0.3 | $26 |
| F3a | 35 | 91% | 3 | 0 | 0.9 | 2.5 | mascot 1.4, shopper 0.3, burst 0.3 | $31 |
| F3b | 32 | 78% | 7 | 0 | 1.0 | 3.3 | mascot 1.8, ownerCharge 0.8, bossShot 0.4 | $37 |
| F4a | 25 | 96% | 1 | 0 | 1.0 | 2.9 | mascot 0.8, goon 0.5, burst 0.5 | $55 |
| F4b | 24 | 100% | 0 | 0 | 1.1 | 2.1 | barrage 0.8, roofer 0.5, shopper 0.4 | $58 |

Deaths: F3b OWNER'S SUITE (6); F1b BACK HALL (1); F2a ELEVATOR BANK (1); F2a FITTING ROOMS (1); F2a GALLERY WALK (1); F2a PORTRAIT STUDIO (1); F3a BALL PIT (1); F3a KENNEL ROW (1).
Killed by: mascot (5), ownerCharge (4), perfume (2), glob (1), hanger (1), mannequin (1), shopper (1), slam (1).

### pro bot, shopping: buy, route: shortcut (40 nights)

Nights won 60% (24), died 40% (16), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 40 | 100% | 0 | 0 | 1.0 | 1.4 | burst 0.7, elf 0.3, hanger 0.2 | $26 |
| F1b | 40 | 100% | 0 | 0 | 0.9 | 0.8 | hanger 0.3, burst 0.1, glob 0.1 | $21 |
| F2a | 40 | 90% | 4 | 0 | 0.9 | 3.1 | perfume 1.5, bossShot 0.6, burst 0.4 | $33 |
| F2b | 36 | 100% | 0 | 0 | 0.8 | 1.0 | bossShot 0.4, shopper 0.3, burst 0.2 | $28 |
| F3a | 36 | 86% | 5 | 0 | 0.8 | 3.1 | mascot 1.8, burst 0.4, slam 0.3 | $30 |
| F3b | 31 | 84% | 5 | 0 | 0.9 | 3.5 | mascot 2.1, ownerCharge 0.6, bossShot 0.4 | $47 |
| F4a | 26 | 92% | 2 | 0 | 0.9 | 3.1 | mascot 1.3, burst 0.5, goon 0.3 | $53 |
| F4b | 24 | 100% | 0 | 0 | 1.1 | 2.1 | barrage 0.6, bossShot 0.5, roofer 0.3 | $61 |

Deaths: F3a WALK-IN COOLER (4); F3b OWNER'S SUITE (3); F2a PORTRAIT STUDIO (2); F3b ARCADE (2); F4a ELEVATOR HOUSING (2); F2a FITTING ROOMS (1); F2a GALLERY WALK (1); F3a BALL PIT (1).
Killed by: mascot (9), ownerCharge (2), perfume (2), bossShot (1), burst (1), hanger (1).

### expert bot, shopping: buy, route: long (40 nights)

Nights won 93% (37), died 8% (3), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 40 | 100% | 0 | 0 | 1.0 | 0.8 | elf 0.5, hanger 0.2, glob 0.1 | $33 |
| F1b | 40 | 100% | 0 | 0 | 0.9 | 0.7 | hanger 0.6, mannequin 0.1, glob 0.0 | $21 |
| F2a | 40 | 100% | 0 | 0 | 0.9 | 0.9 | hanger 0.4, static 0.3, mannequin 0.1 | $35 |
| F2b | 40 | 100% | 0 | 0 | 0.8 | 0.8 | hanger 0.3, mannequin 0.2, static 0.2 | $30 |
| F3a | 40 | 98% | 1 | 0 | 0.8 | 1.1 | hanger 0.6, static 0.3, mannequin 0.1 | $34 |
| F3b | 39 | 95% | 2 | 0 | 0.9 | 0.8 | hanger 0.4, mannequin 0.3, static 0.1 | $37 |
| F4a | 37 | 100% | 0 | 0 | 0.9 | 0.9 | goon 0.4, static 0.2, hanger 0.2 | $43 |
| F4b | 37 | 100% | 0 | 0 | 1.0 | 0.5 | hanger 0.3, static 0.1, other 0.1 | $50 |

Deaths: F3b LOADING DOCK (2); F3a WALK-IN COOLER (1).
Killed by: hanger (2), mannequin (1).

