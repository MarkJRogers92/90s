import { STORE_ROSTER } from '../../sim/items/storeRoster';

/**
 * Player-facing one-liners for every item, short enough for a HUD toast.
 * The catalog `summary` strings are precise design notes; these say what the
 * item does for you in the words a player would use.
 */
export const ITEM_BLURBS: Readonly<Record<string, string>> = {
  janitor_mop: 'WIDE MELEE SWING',
  pump_soaker: 'SHOOTS WATER - MAKES ENEMIES WET',
  bubble_bath: 'WATER SHOTS BECOME PIERCING BUBBLES',
  plasma_globe: 'WET ENEMIES CHAIN LIGHTNING',
  vhs_rewinder: 'SHOTS REWIND FOR A SECOND HIT',
  extension_cord: 'LONGER LIGHTNING CHAINS',
  gel_pens: 'HITS MAKE ENEMIES STICKY AND SLOW',
  wide_nozzle: 'BIGGER, SLOWER SHOTS',
  receipt_wallet: 'EVERY PURCHASE $2 CHEAPER',
  fanny_pack: 'CARRY 2 STOLEN ITEMS, +1.5S ALARM',
  rc_car: 'A CAR THAT RIDES ALONG - FUSE A WEAPON TO IT',
  party_popper: 'THREE-WAY CONFETTI BURST',
  bottle_rocket_pack: 'TWO-WAY ROCKET BURST',
  fire_extinguisher: 'SLOW HEAVY WATER BLAST',
  paint_marker: 'FAST LIGHT SHOT',
  foam_ball_blaster: 'THREE-WAY FOAM BURST',
  slushie_cup: 'SHOOTS SLUSH - MAKES ENEMIES WET',
  broken_broom_handle: 'LONG HEAVY MELEE SWING',
  box_cutter: 'QUICK SHORT SLASH',
  grease_gun: 'HITS MAKE ENEMIES VERY STICKY',
  anti_static_strap: 'WET ENEMIES CHAIN TWICE',
  car_battery: 'LONGER, SAFER LIGHTNING CHAINS',
  needle_nozzle: 'NARROWER, FASTER SHOTS',
  heavy_duty_spring: 'BIGGER, SLOWER SHOTS',
  ...Object.fromEntries(STORE_ROSTER.map((entry) => [entry.definition.id, entry.blurb])),
};

export function itemBlurb(itemDefinitionId: string): string {
  return ITEM_BLURBS[itemDefinitionId] ?? '';
}
