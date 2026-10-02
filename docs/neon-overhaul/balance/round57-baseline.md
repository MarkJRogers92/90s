# Balance baseline, round 57 (bot playtester)

Produced by `npm run balance` (see `tests/balance/`) on `origin/main` at round 56
(`2b6250d`), nights 1-100, four bots. Re-run after any balance change and
compare. `BALANCE_NIGHTS=100 BALANCE_OUT=docs/neon-overhaul/balance/<name>.md npm run balance`.

How to read it:

- The bot is a ruler, not a person. `naive` walks up and swings, `dodger` also
  sidesteps wind-ups, `pro` also steps out of shots and backs off while its
  swing recovers. `shopping: buy` visits every store and buys the dearest
  thing it can pay for; `none` never shops. No bot steals, fuses, or plays the
  arcade or the secret room.
- Compare one wing with another and one build with another, not the absolute
  win rate with a human's. A human playtest log still outranks this.
- Floor 1 costing the `pro` bot 0.6-0.9 health a wing matches the human log in
  TEST_EVIDENCE.md round 45 ("0-2 damage"), which is why `pro` is the bot to
  watch.
- `min` is minutes of play per wing, with no walking back, no shopping time
  and no hesitation, so a night is ~8 minutes here against ~17 for a person.

### naive bot, shopping: none (100 nights)

Nights won 0% (0), died 100% (100), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 18% | 82 | 0 | 0.6 | 9.5 | glob 3.4, hanger 3.0, elf 2.0 | $45 |
| F1b | 18 | 56% | 8 | 0 | 0.6 | 6.4 | glob 2.6, hanger 1.9, slam 1.1 | $71 |
| F2a | 10 | 70% | 3 | 0 | 0.6 | 7.2 | shopper 2.3, perfume 1.4, glob 1.0 | $100 |
| F2b | 7 | 43% | 4 | 0 | 0.6 | 8.9 | shopper 2.4, slam 1.7, glob 1.4 | $116 |
| F3a | 3 | 67% | 1 | 0 | 0.6 | 8.7 | mascot 4.0, shopper 2.3, glob 1.3 | $160 |
| F3b | 2 | 0% | 2 | 0 | 0.6 | 9.5 | bossShot 2.0, glob 2.0, mascot 2.0 | $213 |

Deaths: F1a CUSTOMER SERVICE (22); F1a FREIGHT HALL (22); F1a TOY STOCKROOM (17); F1a SANTA'S WORKSHOP (13); F1a KIOSK ALLEY (5); F1b SECURITY OFFICE (4); F1a CAROUSEL COURT (3); F1b BACK HALL (3).
Killed by: glob (44), hanger (20), elf (17), mannequin (5), shopper (4), bossShot (2), mascot (2), slam (2), walker (2), other (1), perfume (1).

### dodger bot, shopping: none (100 nights)

Nights won 1% (1), died 99% (99), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 64% | 36 | 0 | 0.8 | 7.1 | hanger 3.6, glob 2.1, elf 0.5 | $56 |
| F1b | 64 | 55% | 29 | 0 | 0.7 | 6.6 | hanger 3.2, glob 1.6, bossShot 1.2 | $81 |
| F2a | 35 | 91% | 3 | 0 | 0.7 | 4.0 | glob 1.0, bossShot 0.9, perfume 0.8 | $115 |
| F2b | 32 | 97% | 1 | 0 | 0.7 | 4.5 | bossShot 2.6, glob 0.9, shopper 0.7 | $141 |
| F3a | 31 | 77% | 7 | 0 | 0.7 | 5.2 | mascot 2.5, glob 1.1, slam 0.5 | $168 |
| F3b | 24 | 46% | 13 | 0 | 0.8 | 7.8 | mascot 2.9, bossShot 2.3, ownerCharge 1.2 | $205 |
| F4a | 11 | 27% | 8 | 0 | 0.7 | 8.8 | goon 3.5, bossShot 1.4, slam 1.3 | $260 |
| F4b | 3 | 33% | 2 | 0 | 0.8 | 7.0 | bossShot 4.7, glob 0.7, roofer 0.7 | $286 |

Deaths: F1b SECURITY OFFICE (17); F1a CUSTOMER SERVICE (14); F1a FREIGHT HALL (13); F3b OWNER'S SUITE (12); F1b BACK HALL (10); F4a PENALTY BOX (7); F3a WALK-IN COOLER (6); F1a KIOSK ALLEY (5).
Killed by: glob (35), bossShot (29), hanger (18), goon (5), mascot (4), elf (2), walker (2), mannequin (1), perfume (1), shopper (1), slam (1).

### pro bot, shopping: none (100 nights)

Nights won 54% (54), died 45% (45), stalled 1% (1).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.0 | 0.8 | elf 0.5, hanger 0.2, glob 0.0 | $65 |
| F1b | 100 | 100% | 0 | 0 | 0.9 | 0.9 | hanger 0.5, bossShot 0.1, shopper 0.1 | $91 |
| F2a | 100 | 89% | 11 | 0 | 0.8 | 3.0 | perfume 1.4, shopper 0.5, hanger 0.4 | $123 |
| F2b | 89 | 99% | 1 | 0 | 0.8 | 1.4 | shopper 0.4, bossShot 0.3, static 0.3 | $155 |
| F3a | 88 | 93% | 5 | 1 | 0.9 | 2.8 | mascot 2.0, hanger 0.2, slam 0.2 | $194 |
| F3b | 82 | 74% | 21 | 0 | 0.9 | 4.9 | mascot 3.0, ownerCharge 0.9, bossShot 0.3 | $237 |
| F4a | 61 | 95% | 3 | 0 | 0.9 | 3.0 | mascot 1.0, goon 0.9, roofer 0.5 | $296 |
| F4b | 58 | 93% | 4 | 0 | 1.0 | 2.8 | roofer 0.7, barrage 0.6, mascot 0.6 | $352 |

Deaths: F3b OWNER'S SUITE (17); F2a PORTRAIT STUDIO (9); F3a WALK-IN COOLER (4); F4b HELIPAD (3); F3b ARCADE (2); F3b LOADING DOCK (2); F2a FITTING ROOMS (1); F2a GALLERY WALK (1).
Killed by: mascot (15), ownerCharge (9), perfume (8), bossShot (3), hanger (3), roofer (3), slam (2), goon (1), walker (1).

### pro bot, shopping: buy (100 nights)

Nights won 63% (63), died 37% (37), stalled 0% (0).

| wing | entered | cleared | died | stalled | min | hp lost | top damage | cash left |
|---|---|---|---|---|---|---|---|---|
| F1a | 100 | 100% | 0 | 0 | 1.1 | 0.6 | elf 0.3, hanger 0.1, glob 0.1 | $29 |
| F1b | 100 | 99% | 1 | 0 | 1.0 | 0.7 | hanger 0.4, shopper 0.1, glob 0.1 | $26 |
| F2a | 99 | 89% | 11 | 0 | 0.9 | 2.9 | perfume 1.3, hanger 0.4, bossShot 0.3 | $36 |
| F2b | 88 | 98% | 2 | 0 | 0.9 | 1.4 | shopper 0.6, hanger 0.2, static 0.2 | $25 |
| F3a | 86 | 94% | 5 | 0 | 0.9 | 2.6 | mascot 1.6, shopper 0.3, slam 0.2 | $34 |
| F3b | 81 | 83% | 14 | 0 | 1.1 | 4.8 | mascot 2.9, ownerCharge 0.9, shopper 0.4 | $41 |
| F4a | 67 | 97% | 2 | 0 | 1.0 | 2.5 | mascot 0.9, roofer 0.4, goon 0.4 | $52 |
| F4b | 65 | 97% | 2 | 0 | 1.1 | 2.5 | roofer 0.7, barrage 0.6, mascot 0.4 | $54 |

Deaths: F3b OWNER'S SUITE (14); F2a PORTRAIT STUDIO (8); F2b CINEMA LOBBY (2); F3a BALL PIT (2); F3a WALK-IN COOLER (2); F1b FOOD COURT (1); F2a FITTING ROOMS (1); F2a GALLERY WALK (1).
Killed by: ownerCharge (10), mascot (8), perfume (6), hanger (5), slam (3), bossShot (2), roofer (2), glob (1).

