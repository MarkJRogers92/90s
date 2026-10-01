/**
 * Hero fusions (round 53): three signature pairs that also get a move of
 * their own, beyond the signature tier's numbers. Pure data, so the fusion
 * rules (hybrid.ts) and the combat stage (combat/heroes.ts) can both read it.
 */
export type HeroId = 'greatest_hits' | 'comedy_hour' | 'movie_night';

export type HeroFusion = {
  readonly id: HeroId;
  readonly name: string;
  /** The two catalog items, either order. */
  readonly pair: readonly [string, string];
  /** What it does, for the Bench Warrant card (after "HERO: "). */
  readonly line: string;
};

export const HERO_FUSIONS: readonly HeroFusion[] = [
  { id: 'greatest_hits', name: 'Greatest Hits', pair: ['mixtape', 'record_toss'], line: 'RECORDS ORBIT YOU; EVERY 4TH SHOT FLINGS THEM' },
  { id: 'comedy_hour', name: 'Comedy Hour', pair: ['rubber_chicken', 'whoopee_cushion'], line: 'THROWS A DECOY CHICKEN THAT BURSTS' },
  { id: 'movie_night', name: 'Movie Night', pair: ['popcorn_bucket', 'vhs_tape'], line: 'A PROJECTOR BEAM SCARES THE WHOLE AISLE' },
];

/** The hero two plain items make, in either order, or null. */
export function heroForPair(a: string, b: string): HeroFusion | null {
  return HERO_FUSIONS.find((hero) => (hero.pair[0] === a && hero.pair[1] === b) || (hero.pair[0] === b && hero.pair[1] === a)) ?? null;
}
