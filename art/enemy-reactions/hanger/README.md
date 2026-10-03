# Hanger reactions (derived art)

`build_hanger_reactions.py` writes both runtime strips from the Hanger's own
`hanger-walk.png`, so palette and silhouette stay exact. No model generation
and no spend.

- `hanger-hurt.png`, 368×736: 4 frames × 8 facings at the 92 px walk canvas,
  rows in `ACTOR_DIRECTION_ORDER` (S, SW, W, NW, N, NE, E, SE). Drawn at scale
  1 with feet at (46, 67.76), as the walk sheet is. Timing is 3/3/4/4 ticks:
  - impact (the shell flattens, the legs splay, the lit shell glints +18%);
  - tuck (the legs snap in);
  - rebound (up 2 px);
  - settle.
- `hanger-shell-impact.png`, 288×48: 6 frames × 48 px of chitin shards in the
  shell blues, one orange leg tip, a dark rim for lit floors and a short pale
  crack star on the first two frames. Played at 2 ticks per frame.

To change a pose, edit `POSES` and re-run the script. Then run
`npx vitest run tests/unit/hanger-reactions.test.ts` and do a live check with
`scripts/live-capture.mjs --fixture mvp-back-hall --target hanger --attack`.
Unlike the Mannequin and the Static, a Hanger flinch outranks its attack pose:
the Hanger has no timed wind-up (it bites on contact), and its reach ring
still draws.
