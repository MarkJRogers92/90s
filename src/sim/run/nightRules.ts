/**
 * Night rules (round 57): a challenge a shift can carry.
 *
 * Today they come one a day with the Daily Shift (see game/run/dailyShift.ts),
 * so an optional challenge needs no menu. Each rule is one clamped number on a
 * rule the run already has (the health cap, the clear heal, a shelf price, an
 * alarm), so a rule can never do more than its line says. The rule rides the
 * escalator with the run and is written into the checkpoint, so a resumed
 * shift keeps the rule it started under.
 */
export const NIGHT_RULE_IDS = ['glass', 'no_breaks', 'inflation', 'short_fuse'] as const;
export type NightRuleId = (typeof NIGHT_RULE_IDS)[number];

export type NightRuleDefinition = { readonly name: string; readonly blurb: string };

export const NIGHT_RULES: Readonly<Record<NightRuleId, NightRuleDefinition>> = {
  glass: { name: 'GLASS JANITOR', blurb: 'Two hearts instead of three.' },
  no_breaks: { name: 'NO BREAKS', blurb: 'Clearing a fight no longer patches you up.' },
  inflation: { name: 'INFLATION', blurb: 'Everything on the shelves costs $3 more.' },
  short_fuse: { name: 'SHORT FUSE', blurb: 'Store alarms give you a second less.' },
};

/** Glass Janitor: health taken off the cap (2 is one heart). */
export const GLASS_HEALTH_CUT = 2;
/** Inflation: dollars added to every shelf price. */
export const INFLATION_SURCHARGE = 3;
/** Short Fuse: ticks taken off every store alarm. */
export const SHORT_FUSE_CUT = 60;

export function isNightRule(value: unknown): value is NightRuleId {
  return typeof value === 'string' && (NIGHT_RULE_IDS as readonly string[]).includes(value);
}
