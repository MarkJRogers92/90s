# Reaction-delay report, round 57 follow-up

`npm run balance:reaction`. The `expert` bot (it sees every lane, slam, shot, fuse,
lob and volley) is given a **reaction delay**: a hazard is unknown to it until it
has been in view that many ticks (60 a second), as it is to a person who has to
notice a wind-up and decide which way to go. Each cell is the share of that
hazard's attacks that hit, at that delay. "Never reacts" is a bot that is never
told at all, and "dodged" means the hit rate is at most 20% of that. `slack` is the
hand arithmetic from the expert evidence (wind-up minus the ticks to walk clear
from where a standing player would be). `Walking only` never dashes; `dashing
allowed` dashes when walking cannot get clear, which is the best a player can do.

## What it says

For a typical reaction (the time to notice something and start moving is roughly
0.25-0.4 s, 15 to 24 ticks; that figure is general psychology, not measured here):

- **The Perfume Spritzer's spritz is the tightest hazard.** A player who walks is
  hit once the delay passes 0.2 s; one who dashes copes up to 0.4 s. It is the
  only hazard where a typical reaction without a dash fails.
- **The Volatile elite's fuse is the same, for a different reason:** a player who
  kills it and keeps walking on is usually walking *into* the blast, and by the
  time they notice they need more distance than the fuse has left (see below).
  0.2 s walking, 0.5 s with a dash.
- **The Bargain Hunter's charge** is dodged to 0.4 s either way: the dash does
  not help, its charge is too short and fast (a 34-tick wind-up).
- **The Mascot Brute (0.6 s walking, 0.7 s dashing) and the Roofer's bucket (0.5 s,
  0.8 s) are comfortable.** The Roofer is worse than its arithmetic (0.5 s, not
  0.72), probably because its earlier buckets leave tar that slows the walk to
  55% (an inference; the sweep did not isolate it).
- **The Mall Owner is the compound test, and the most demanding thing in the
  game for a pure reaction.** Dashing, the expert takes 0.3 hp at 0.1 s,
  2.2 hp at 0.2 s (1 of 6 fights fatal), 5.8 hp at 0.3 s (5 of 6 fatal) and dies at
  0.4 s; walking only, it loses 1.7 hp even at once and 2 of 6 die at 0.1 s. His volleys, charges and
  summoned Mascots overlap, and each shows its wind-up for a short time. This
  is a **pessimistic bound**: the bot never learns his rhythm, and a person does
  (the volley cadence and the charge on every second attack from phase two are
  fixed). Do not read it as "a player with a 0.3 s reaction cannot beat the Owner".
  Read it as: the Owner is the one fight where anticipation is not optional.

## Why the slack table was optimistic

The hand table assumes the player stands still until they react. Where they are
walking toward the hazard instead, the delay also carries them further in. The
Volatile fuse is the clearest case: the bot kills the elite, then walks on to the
door through the centre of the blast, and at an 18-tick delay it is standing in
the middle with 15 ticks left and about 22 ticks of walking to do. The measured
thresholds (walking only) are 12 ticks for the Spritzer (slack 17), 12 for the
fuse (23), 24 for the Bargain Hunter (26), 36 for the Mascot (38) and 30 for the
Roofer (43): never better than the arithmetic, close for the fast charges.

## An experiment, reverted (not a change to the game)

What if the two tightest were longer? Setting the Spritzer's wind-up to 42 ticks
(from 30) moves the longest delay a walker can have from 12 to 24 ticks (0.2 s to
0.4 s), and a dasher's from 24 to 36. Setting the Volatile fuse to 48 ticks (from
36) makes the burst harmless to a bot that never reacts at all in these scenes
(0% hit, from 25%): it simply walks out of range in time, so it stops being a hazard
and only taxes standing over the corpse. So a longer Spritzer wind-up would make it
fair to a typical reaction, while the fuse is better left alone; both are the
owner's decision, and a human playtest should come first.

## Limits

- The bot never anticipates a pattern, and it dashes optimally (when allowed).
- Reaction is one number for the whole decision (notice, choose, start to move).
- The duels are small fixed scenes (16 to 96 attacks a cell, depending on the
  hazard), and the Owner fights start from six positions but are otherwise
  near-identical, so single cells can jump (a few percent is about one hit).
  Trust the shape, not one cell.
- Two real behaviours are in the numbers, not noise: the dash helps the Spritzer, the
  fuse and the Roofer a lot and the Bargain Hunter not at all.

### Walking only (never dashes)

| hazard | wind-up | slack | 0 | 6 | 12 | 18 | 24 | 30 | 36 | 42 | 48 | 54 | never reacts | longest reaction that still dodges it |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Perfume Spritzer's spritz | 30 | 17 | 0% | 0% | 5% | 57% | 96% | 100% | 100% | 100% | 100% | 100% | 100% | 12 ticks (0.20 s) |
| Volatile elite's fuse | 36 | 23 | 0% | 0% | 0% | 25% | 25% | 25% | 25% | 25% | 25% | 25% | 25% | 12 ticks (0.20 s) |
| Bargain Hunter's charge | 34 | 26 | 0% | 0% | 5% | 5% | 3% | 93% | 100% | 100% | 100% | 100% | 100% | 24 ticks (0.40 s) |
| Mascot Brute's charge | 46 | 38 | 0% | 0% | 0% | 0% | 0% | 5% | 17% | 100% | 100% | 100% | 100% | 36 ticks (0.60 s) |
| Roofer's bucket | 54 | 43 | 2% | 0% | 0% | 0% | 2% | 2% | 60% | 83% | 100% | 100% | 100% | 30 ticks (0.50 s) |

### Dashing allowed (the expert dashes when walking cannot get clear)

| hazard | wind-up | slack | 0 | 6 | 12 | 18 | 24 | 30 | 36 | 42 | 48 | 54 | never reacts | longest reaction that still dodges it |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Perfume Spritzer's spritz | 30 | 17 | 0% | 0% | 0% | 4% | 0% | 100% | 100% | 100% | 100% | 100% | 100% | 24 ticks (0.40 s) |
| Volatile elite's fuse | 36 | 23 | 0% | 0% | 0% | 0% | 0% | 0% | 25% | 25% | 25% | 25% | 25% | 30 ticks (0.50 s) |
| Bargain Hunter's charge | 34 | 26 | 0% | 0% | 7% | 5% | 3% | 93% | 100% | 100% | 100% | 100% | 100% | 24 ticks (0.40 s) |
| Mascot Brute's charge | 46 | 38 | 0% | 0% | 0% | 0% | 0% | 5% | 17% | 0% | 100% | 100% | 100% | 42 ticks (0.70 s) |
| Roofer's bucket | 54 | 43 | 2% | 0% | 0% | 0% | 2% | 0% | 5% | 10% | 2% | 100% | 100% | 48 ticks (0.80 s) |

### The Mall Owner alone (starting mop, full health, 6 fights): health lost (of 6) and deaths

| reaction (ticks) | 0 | 6 | 12 | 18 | 24 | 30 | 36 | 42 | 48 | 54 |
|---|---|---|---|---|---|---|---|---|---|---|
| walking only | 1.7 hp | 3.0 hp, 2/6 died | 3.5 hp, 2/6 died | 6.0 hp, 6/6 died | 6.0 hp, 6/6 died | 6.0 hp, 6/6 died | 6.0 hp, 6/6 died | 6.0 hp, 6/6 died | 6.0 hp, 6/6 died | 6.0 hp, 6/6 died |
| dashing allowed | 0.0 hp | 0.3 hp | 2.2 hp, 1/6 died | 5.8 hp, 5/6 died | 6.0 hp, 6/6 died | 6.0 hp, 6/6 died | 6.0 hp, 6/6 died | 6.0 hp, 6/6 died | 6.0 hp, 6/6 died | 6.0 hp, 6/6 died |

