/**
 * Round 32: a dumb amount of stuff, stocked by the store it would really be
 * sold in. Sports Locker sells bats and hockey sticks, Hardware Hut nail guns
 * and duct tape, and so on (the stores are in wing/templates.ts).
 *
 * Every item here is built from the existing effect kinds, so the attack
 * resolver, the loadout compiler and Void the Warranty treat it exactly like
 * the original twenty-four: any of them fuses with any other. Each entry also
 * carries its fusion noun and adjective, its player-facing blurb and its
 * authored price band, so one list is the whole of an item's content.
 *
 * Immutable authored data only; nothing here reads run state or the renderer.
 */
import type { ItemDefinition, ProjectilePayloadKind } from './types';

const DEGREES = Math.PI / 180;

export type RosterEntry = {
  readonly definition: ItemDefinition;
  /** Fusion naming: "Greasy {noun}" / "{adjective} Mop". */
  readonly noun: string;
  readonly adjective: string;
  /** What it does for you, in HUD words. */
  readonly blurb: string;
  readonly band: { readonly min: number; readonly max: number };
};

type Common = { id: string; name: string; noun: string; adjective: string; blurb: string; band: [number, number] };

function melee(
  spec: Common & { damage: number; cooldown: number; range: number; degrees: number },
): RosterEntry {
  return {
    noun: spec.noun,
    adjective: spec.adjective,
    blurb: spec.blurb,
    band: { min: spec.band[0], max: spec.band[1] },
    definition: {
      id: spec.id,
      name: spec.name,
      summary: `${spec.blurb.charAt(0)}${spec.blurb.slice(1).toLowerCase()}. Stays a direct attack; projectile modifiers never convert it.`,
      base: {
        delivery: 'direct',
        damage: spec.damage,
        cooldownTicks: spec.cooldown,
        range: spec.range,
        halfAngleRadians: spec.degrees * DEGREES,
        speed: 0,
      },
      effects: [],
    },
  };
}

function shooter(
  spec: Common & {
    kind: ProjectilePayloadKind;
    prongs: readonly number[];
    damage: number;
    speed: number;
    radius: number;
    lifetime: number;
    cooldown: number;
    wetTicks?: number;
  },
): RosterEntry {
  const wet = spec.kind === 'water' && spec.wetTicks ? { status: 'wet' as const, ticks: spec.wetTicks } : null;
  return {
    noun: spec.noun,
    adjective: spec.adjective,
    blurb: spec.blurb,
    band: { min: spec.band[0], max: spec.band[1] },
    definition: {
      id: spec.id,
      name: spec.name,
      summary: `${spec.blurb.charAt(0)}${spec.blurb.slice(1).toLowerCase()}.`,
      base: {
        delivery: 'projectile',
        damage: spec.damage,
        cooldownTicks: spec.cooldown,
        range: 0,
        halfAngleRadians: 0,
        speed: spec.speed,
      },
      effects: [
        {
          kind: 'projectile_payload',
          stage: 'projectile',
          priority: 0,
          sourceItemId: spec.id,
          label: `${spec.kind} projectile (${spec.prongs.length} prong${spec.prongs.length === 1 ? '' : 's'}${wet ? `, Wet ${wet.ticks} ticks on hit` : ''})`,
          payloadKind: spec.kind,
          angularOffsetsRadians: spec.prongs.map((degrees) => Math.round(degrees * DEGREES * 1e6) / 1e6),
          damage: spec.damage,
          speed: spec.speed,
          radius: spec.radius,
          lifetimeTicks: spec.lifetime,
          onHit: wet,
        },
      ],
    },
  };
}

function modifier(spec: Common & { effect: ItemDefinition['effects'][number] }): RosterEntry {
  return {
    noun: spec.noun,
    adjective: spec.adjective,
    blurb: spec.blurb,
    band: { min: spec.band[0], max: spec.band[1] },
    definition: {
      id: spec.id,
      name: spec.name,
      summary: `${spec.blurb.charAt(0)}${spec.blurb.slice(1).toLowerCase()}.`,
      effects: [spec.effect],
    },
  };
}

function sticky(id: string, ticks: number, slowMultiplier: number, slowFloor: number) {
  return {
    kind: 'status_modifier' as const, stage: 'status' as const, priority: 0, sourceItemId: id,
    label: `Sticky ${ticks} ticks at ${slowMultiplier} movement (${slowFloor} floor)`,
    status: 'sticky' as const, ticks, slowMultiplier, slowFloor,
  };
}

function geometry(id: string, radiusBonus: number, speedMultiplier: number) {
  return {
    kind: 'projectile_geometry' as const, stage: 'geometry' as const, priority: 0, sourceItemId: id,
    label: `radius ${radiusBonus >= 0 ? '+' : ''}${radiusBonus} and speed x${speedMultiplier} for projectile deliveries`,
    radiusBonus, speedMultiplier,
  };
}

/** Everything new, grouped by the store that stocks it. */
export const STORE_ROSTER: readonly RosterEntry[] = [
  // Sports Locker
  melee({ id: 'aluminum_bat', name: 'Aluminum Bat', noun: 'Bat', adjective: 'Batting', blurb: 'BIG HEAVY SWING', band: [16, 22], damage: 7, cooldown: 42, range: 76, degrees: 40 }),
  melee({ id: 'hockey_stick', name: 'Hockey Stick', noun: 'Stick', adjective: 'Slapshot', blurb: 'LONG WIDE SWEEP', band: [13, 19], damage: 5, cooldown: 32, range: 88, degrees: 50 }),
  melee({ id: 'golf_club', name: 'Golf Club', noun: 'Club', adjective: 'Teed-Off', blurb: 'LONG NARROW DRIVE, HITS HARD', band: [15, 23], damage: 8, cooldown: 52, range: 92, degrees: 22 }),
  shooter({ id: 'tennis_ball_launcher', name: 'Tennis Ball Launcher', noun: 'Launcher', adjective: 'Fuzzy', blurb: 'FAST BOUNCY BALLS', band: [15, 21], kind: 'physical', prongs: [0], damage: 3, speed: 5.5, radius: 5, lifetime: 60, cooldown: 28 }),
  shooter({ id: 'dodgeball', name: 'Dodgeball', noun: 'Dodgeball', adjective: 'Dodging', blurb: 'BIG SLOW RUBBER BALL', band: [8, 12], kind: 'physical', prongs: [0], damage: 4, speed: 3.0, radius: 10, lifetime: 70, cooldown: 40 }),
  modifier({ id: 'sweatband', name: 'Terry Sweatband', noun: 'Sweatband', adjective: 'Sweaty', blurb: 'NARROWER, FASTER SHOTS', band: [6, 10], effect: geometry('sweatband', -1, 1.2) }),
  melee({ id: 'lacrosse_stick', name: 'Lacrosse Stick', noun: 'Crosse', adjective: 'Scooping', blurb: 'QUICK REACHING SWING', band: [11, 17], damage: 4, cooldown: 22, range: 84, degrees: 30 }),
  shooter({ id: 'football', name: 'Nerf Football', noun: 'Football', adjective: 'Spiraling', blurb: 'LONG SPIRAL PASS', band: [9, 13], kind: 'physical', prongs: [0], damage: 3, speed: 6.0, radius: 4, lifetime: 70, cooldown: 30 }),

  // Hardware Hut
  shooter({ id: 'nail_gun', name: 'Nail Gun', noun: 'Nailer', adjective: 'Nailed', blurb: 'RAPID TINY NAILS', band: [18, 26], kind: 'physical', prongs: [0], damage: 1, speed: 7.0, radius: 2, lifetime: 35, cooldown: 8 }),
  melee({ id: 'pipe_wrench', name: 'Pipe Wrench', noun: 'Wrench', adjective: 'Plumbing', blurb: 'SHORT CRUSHING SWING', band: [14, 20], damage: 8, cooldown: 46, range: 60, degrees: 35 }),
  modifier({ id: 'duct_tape', name: 'Duct Tape', noun: 'Tape', adjective: 'Taped', blurb: 'HITS MAKE ENEMIES STICKY', band: [5, 9], effect: sticky('duct_tape', 120, 0.55, 0.45) }),
  modifier({ id: 'leaf_blower', name: 'Leaf Blower', noun: 'Blower', adjective: 'Gusting', blurb: 'HUGE, SLOW SHOTS', band: [16, 24], effect: geometry('leaf_blower', 6, 0.7) }),
  shooter({ id: 'staple_gun', name: 'Staple Gun', noun: 'Stapler', adjective: 'Stapled', blurb: 'THREE-WAY STAPLE SPRAY', band: [10, 16], kind: 'physical', prongs: [-6, 0, 6], damage: 1, speed: 6.0, radius: 2, lifetime: 30, cooldown: 20 }),
  melee({ id: 'claw_hammer', name: 'Claw Hammer', noun: 'Hammer', adjective: 'Hammered', blurb: 'QUICK HARD KNOCK', band: [9, 15], damage: 5, cooldown: 26, range: 56, degrees: 30 }),
  shooter({ id: 'garden_hose', name: 'Garden Hose', noun: 'Hose', adjective: 'Hosed', blurb: 'STEADY WATER STREAM - MAKES ENEMIES WET', band: [12, 18], kind: 'water', prongs: [0], damage: 1, speed: 4.5, radius: 5, lifetime: 45, cooldown: 10, wetTicks: 150 }),
  modifier({ id: 'jumper_cables', name: 'Jumper Cables', noun: 'Cables', adjective: 'Jump-Started', blurb: 'LONGER LIGHTNING CHAINS', band: [12, 18], effect: { kind: 'conductive_range', stage: 'reaction', priority: 1, sourceItemId: 'jumper_cables', label: 'conductive range 260 (weak discharge without a globe)', range: 260, weakDischarge: true } }),

  // Toy Box
  shooter({ id: 'super_soaker_50', name: 'Super Soaker 50', noun: 'Super Soaker', adjective: 'Supersoaked', blurb: 'BIG WATER BLASTS - SOAKS ENEMIES', band: [20, 28], kind: 'water', prongs: [0], damage: 3, speed: 3.8, radius: 7, lifetime: 90, cooldown: 22, wetTicks: 240 }),
  melee({ id: 'yo_yo', name: 'Glow Yo-Yo', noun: 'Yo-Yo', adjective: 'Yo-Yo', blurb: 'FAST LONG THIN STRIKE', band: [6, 10], damage: 3, cooldown: 14, range: 100, degrees: 10 }),
  shooter({ id: 'slingshot', name: 'Wrist Slingshot', noun: 'Slingshot', adjective: 'Slung', blurb: 'FAST HARD PEBBLE', band: [9, 15], kind: 'physical', prongs: [0], damage: 3, speed: 6.5, radius: 3, lifetime: 50, cooldown: 26 }),
  modifier({ id: 'slime_tub', name: 'Tub of Slime', noun: 'Slime', adjective: 'Slimy', blurb: 'HITS MAKE ENEMIES STICKY FOR AGES', band: [7, 11], effect: sticky('slime_tub', 200, 0.6, 0.5) }),
  shooter({ id: 'pog_slammer', name: 'Pog Slammer', noun: 'Slammer', adjective: 'Slammin\'', blurb: 'FIVE-WAY POG SPRAY', band: [8, 12], kind: 'physical', prongs: [-20, -10, 0, 10, 20], damage: 1, speed: 4.5, radius: 4, lifetime: 35, cooldown: 34 }),
  shooter({ id: 'water_balloons', name: 'Water Balloons', noun: 'Balloons', adjective: 'Ballooned', blurb: 'SLOW SPLASHY BALLOONS - MAKES ENEMIES WET', band: [6, 10], kind: 'water', prongs: [-8, 8], damage: 2, speed: 2.8, radius: 8, lifetime: 60, cooldown: 30, wetTicks: 200 }),
  melee({ id: 'foam_sword', name: 'Foam Sword', noun: 'Sword', adjective: 'Swashbuckling', blurb: 'WIDE SOFT SWING', band: [7, 11], damage: 3, cooldown: 18, range: 72, degrees: 55 }),
  modifier({ id: 'slinky', name: 'Slinky', noun: 'Slinky', adjective: 'Springy', blurb: 'SHOTS COME BACK FOR A SECOND HIT', band: [10, 16], effect: { kind: 'trajectory_replay', stage: 'trajectory', priority: 0, sourceItemId: 'slinky', label: 'one return pass (activates once per root)', returnPasses: 1, activatesOncePerRoot: true } }),

  // Radio Shed
  shooter({ id: 'laser_pointer', name: 'Laser Pointer', noun: 'Laser', adjective: 'Lasered', blurb: 'NEEDLE-THIN, SUPER-FAST BEAM', band: [14, 20], kind: 'physical', prongs: [0], damage: 1, speed: 9.0, radius: 2, lifetime: 40, cooldown: 6 }),
  modifier({ id: 'walkman', name: 'Walkman', noun: 'Walkman', adjective: 'Auto-Reverse', blurb: 'SHOTS REWIND FOR A SECOND HIT', band: [16, 24], effect: { kind: 'trajectory_replay', stage: 'trajectory', priority: 0, sourceItemId: 'walkman', label: 'auto-reverse: one return pass (activates once per root)', returnPasses: 1, activatesOncePerRoot: true } }),
  modifier({ id: 'nine_volt_pack', name: '9-Volt Battery Pack', noun: 'Nine-Volt', adjective: 'Tingly', blurb: 'WET ENEMIES CHAIN LIGHTNING', band: [9, 15], effect: { kind: 'conductive_reaction', stage: 'reaction', priority: 0, sourceItemId: 'nine_volt_pack', label: 'conductive chain (one start per root, two additional Wet targets)', chainStartsPerRoot: 1, maxAdditionalTargets: 2, baseRange: 120, visitsEachTargetOnce: true } }),
  shooter({ id: 'boombox', name: 'Boombox', noun: 'Boombox', adjective: 'Bass-Boosted', blurb: 'FIVE-WAY SOUND WAVE', band: [18, 26], kind: 'physical', prongs: [-25, -12, 0, 12, 25], damage: 2, speed: 3.0, radius: 8, lifetime: 40, cooldown: 48 }),
  shooter({ id: 'rc_blimp_remote', name: 'Tesla Remote', noun: 'Remote', adjective: 'Remote-Control', blurb: 'TWIN ZAPS', band: [12, 18], kind: 'physical', prongs: [-4, 4], damage: 2, speed: 5.5, radius: 3, lifetime: 45, cooldown: 24 }),
  modifier({ id: 'satellite_dish', name: 'Mini Satellite Dish', noun: 'Dish', adjective: 'Broadcast', blurb: 'BIGGER, SLOWER SHOTS', band: [11, 17], effect: geometry('satellite_dish', 4, 0.85) }),
  modifier({ id: 'tesla_coil_kit', name: 'Tesla Coil Kit', noun: 'Coil', adjective: 'Arcing', blurb: 'WET ENEMIES CHAIN TWICE, FAR', band: [20, 28], effect: { kind: 'conductive_reaction', stage: 'reaction', priority: 0, sourceItemId: 'tesla_coil_kit', label: 'conductive chain (two starts per root, three additional Wet targets)', chainStartsPerRoot: 2, maxAdditionalTargets: 3, baseRange: 170, visitsEachTargetOnce: true } }),
  shooter({ id: 'camcorder', name: 'Camcorder Flash', noun: 'Camcorder', adjective: 'Flashing', blurb: 'WIDE BRIGHT FLASH', band: [13, 19], kind: 'physical', prongs: [-10, 0, 10], damage: 2, speed: 4.0, radius: 6, lifetime: 28, cooldown: 34 }),

  // Spiral Records
  melee({ id: 'electric_guitar', name: 'Electric Guitar', noun: 'Guitar', adjective: 'Shredding', blurb: 'HUGE SLOW POWER CHORD SWING', band: [22, 30], damage: 9, cooldown: 58, range: 74, degrees: 55 }),
  shooter({ id: 'record_toss', name: 'Vinyl Record', noun: 'Record', adjective: 'Spinning', blurb: 'HARD SPINNING DISC', band: [9, 15], kind: 'physical', prongs: [0], damage: 4, speed: 4.8, radius: 6, lifetime: 70, cooldown: 32 }),
  melee({ id: 'mic_stand', name: 'Mic Stand', noun: 'Mic Stand', adjective: 'Amplified', blurb: 'VERY LONG JAB', band: [12, 18], damage: 6, cooldown: 38, range: 104, degrees: 18 }),
  melee({ id: 'drumsticks', name: 'Drumsticks', noun: 'Drumsticks', adjective: 'Drumming', blurb: 'BLINDINGLY FAST TAPS', band: [7, 11], damage: 2, cooldown: 9, range: 52, degrees: 30 }),
  modifier({ id: 'mixtape', name: 'Mixtape', noun: 'Mixtape', adjective: 'Remixed', blurb: 'BIGGER, FASTER SHOTS', band: [8, 14], effect: geometry('mixtape', 2, 1.15) }),
  shooter({ id: 'cd_shuriken', name: 'Scratched CD', noun: 'CD', adjective: 'Skipping', blurb: 'TWIN FAST DISCS', band: [8, 12], kind: 'physical', prongs: [-7, 7], damage: 2, speed: 6.0, radius: 3, lifetime: 45, cooldown: 22 }),
  modifier({ id: 'fog_machine', name: 'Fog Machine', noun: 'Fogger', adjective: 'Foggy', blurb: 'WATER SHOTS BECOME PIERCING BUBBLES', band: [14, 20], effect: { kind: 'projectile_conversion', stage: 'conversion', priority: 0, sourceItemId: 'fog_machine', label: 'fog bubbles (penetrating drift, one radius-56 Wet patch for 180 ticks)', converts: 'water_projectile', result: 'drifting_bubble', speed: 2.2, minRadius: 12, lifetimeTicks: 100, penetrates: true, recordsHitPerPass: true, terminalWetPatch: { radius: 56, ticks: 180 } } }),
  melee({ id: 'keytar', name: 'Keytar', noun: 'Keytar', adjective: 'Synth', blurb: 'WIDE NEON SWING', band: [16, 22], damage: 6, cooldown: 36, range: 70, degrees: 60 }),

  // Slice Station
  melee({ id: 'pizza_cutter', name: 'Pizza Cutter', noun: 'Cutter Wheel', adjective: 'Sliced', blurb: 'QUICK ROLLING SLASH', band: [7, 11], damage: 3, cooldown: 13, range: 54, degrees: 28 }),
  melee({ id: 'pizza_peel', name: 'Pizza Peel', noun: 'Peel', adjective: 'Oven-Fresh', blurb: 'WIDE FLAT SWAT', band: [10, 16], damage: 5, cooldown: 32, range: 80, degrees: 60 }),
  modifier({ id: 'cheese_pump', name: 'Nacho Cheese Pump', noun: 'Cheese Pump', adjective: 'Cheesy', blurb: 'HITS MAKE ENEMIES VERY STICKY', band: [8, 14], effect: sticky('cheese_pump', 100, 0.5, 0.4) }),
  shooter({ id: 'soda_gun', name: 'Soda Gun', noun: 'Soda Gun', adjective: 'Fizzy', blurb: 'TWIN SODA JETS - MAKES ENEMIES WET', band: [12, 18], kind: 'water', prongs: [-5, 5], damage: 2, speed: 4.0, radius: 5, lifetime: 55, cooldown: 24, wetTicks: 150 }),
  melee({ id: 'dough_roller', name: 'Rolling Pin', noun: 'Rolling Pin', adjective: 'Rolled', blurb: 'HEAVY ROUND WHACK', band: [11, 17], damage: 7, cooldown: 46, range: 64, degrees: 45 }),
  shooter({ id: 'pepperoni_launcher', name: 'Pepperoni Launcher', noun: 'Pepperoni', adjective: 'Pepperoni', blurb: 'THREE-WAY MEATY DISCS', band: [10, 16], kind: 'physical', prongs: [-12, 0, 12], damage: 2, speed: 4.6, radius: 5, lifetime: 45, cooldown: 30 }),
  modifier({ id: 'hot_sauce', name: 'Ghost Pepper Sauce', noun: 'Hot Sauce', adjective: 'Spicy', blurb: 'LONGER LIGHTNING CHAINS', band: [9, 15], effect: { kind: 'conductive_range', stage: 'reaction', priority: 1, sourceItemId: 'hot_sauce', label: 'conductive range 240 (weak discharge without a globe)', range: 240, weakDischarge: true } }),
  shooter({ id: 'ketchup_bottle', name: 'Squeeze Ketchup', noun: 'Ketchup', adjective: 'Saucy', blurb: 'SHORT RED SQUIRT', band: [5, 9], kind: 'physical', prongs: [0], damage: 2, speed: 4.2, radius: 4, lifetime: 40, cooldown: 16 }),

  // Video World
  shooter({ id: 'vhs_tape', name: 'Overdue VHS Tape', noun: 'Tape', adjective: 'Overdue', blurb: 'HEAVY TUMBLING TAPE', band: [7, 11], kind: 'physical', prongs: [0], damage: 4, speed: 4.0, radius: 6, lifetime: 55, cooldown: 34 }),
  melee({ id: 'cardboard_standee', name: 'Cardboard Standee', noun: 'Standee', adjective: 'Life-Size', blurb: 'HUGE FLIMSY SWAT', band: [6, 10], damage: 3, cooldown: 30, range: 96, degrees: 50 }),
  modifier({ id: 'popcorn_bucket', name: 'Popcorn Bucket', noun: 'Popcorn', adjective: 'Buttery', blurb: 'HITS MAKE ENEMIES STICKY', band: [6, 10], effect: sticky('popcorn_bucket', 110, 0.6, 0.5) }),
  modifier({ id: 'rewind_button', name: 'Universal Remote', noun: 'Universal Remote', adjective: 'Rewound', blurb: 'SHOTS REWIND FOR A SECOND HIT', band: [14, 22], effect: { kind: 'trajectory_replay', stage: 'trajectory', priority: 0, sourceItemId: 'rewind_button', label: 'one return pass (activates once per root)', returnPasses: 1, activatesOncePerRoot: true } }),
  shooter({ id: 'laserdisc', name: 'Laserdisc', noun: 'Laserdisc', adjective: 'Widescreen', blurb: 'BIG SHINY DISC', band: [12, 18], kind: 'physical', prongs: [0], damage: 5, speed: 4.4, radius: 8, lifetime: 60, cooldown: 42 }),
  melee({ id: 'late_fee_stamp', name: 'Late Fee Stamp', noun: 'Stamp', adjective: 'Late', blurb: 'QUICK STAMP SMACK', band: [5, 9], damage: 3, cooldown: 16, range: 50, degrees: 35 }),
];

/**
 * Rare finds: never on a shelf. Enemies drop them once in a while and every
 * boss hands one over. Stronger than anything in a store, and very 90s.
 */
export const RARE_ROSTER: readonly RosterEntry[] = [
  melee({ id: 'golden_mop', name: 'Golden Mop', noun: 'Golden Mop', adjective: 'Golden', blurb: 'RARE: THE EMPLOYEE OF THE YEAR SWING', band: [40, 50], damage: 9, cooldown: 22, range: 86, degrees: 50 }),
  melee({ id: 'power_glove', name: 'Power Glove', noun: 'Power Glove', adjective: "It's-So-Bad", blurb: 'RARE: LIGHTNING-FAST HEAVY PUNCHES', band: [40, 50], damage: 6, cooldown: 11, range: 62, degrees: 45 }),
  shooter({ id: 'super_soaker_cps', name: 'Super Soaker CPS 2000', noun: 'CPS 2000', adjective: 'Pressurized', blurb: 'RARE: THREE HUGE SOAKING BLASTS', band: [40, 50], kind: 'water', prongs: [-8, 0, 8], damage: 4, speed: 4.4, radius: 8, lifetime: 90, cooldown: 20, wetTicks: 300 }),
  shooter({ id: 'game_brick', name: 'Game Brick', noun: 'Brick', adjective: 'Indestructible', blurb: 'RARE: A HANDHELD THAT HITS LIKE A BRICK', band: [40, 50], kind: 'physical', prongs: [0], damage: 8, speed: 4.6, radius: 7, lifetime: 70, cooldown: 36 }),
  shooter({ id: 'laser_tag_rifle', name: 'Laser Tag Rifle', noun: 'Laser Rifle', adjective: 'Tagged', blurb: 'RARE: FAST TWIN LASERS', band: [40, 50], kind: 'physical', prongs: [-3, 3], damage: 3, speed: 8.5, radius: 3, lifetime: 50, cooldown: 10 }),
  modifier({ id: 'virtual_pet', name: 'Virtual Pet', noun: 'Virtual Pet', adjective: 'Hungry', blurb: 'RARE: WET ENEMIES CHAIN LIGHTNING THREE TIMES', band: [40, 50], effect: { kind: 'conductive_reaction', stage: 'reaction', priority: 0, sourceItemId: 'virtual_pet', label: 'conductive chain (three starts per root, five additional Wet targets)', chainStartsPerRoot: 3, maxAdditionalTargets: 5, baseRange: 190, visitsEachTargetOnce: true } }),
  modifier({ id: 'trapper_keeper', name: 'Trapper Keeper', noun: 'Trapper Keeper', adjective: 'Velcro', blurb: 'RARE: HITS GLUE ENEMIES IN PLACE', band: [40, 50], effect: sticky('trapper_keeper', 240, 0.4, 0.3) }),
  modifier({ id: 'moon_shoes', name: 'Moon Shoes', noun: 'Moon Shoes', adjective: 'Lunar', blurb: 'RARE: BIGGER AND FASTER SHOTS', band: [40, 50], effect: geometry('moon_shoes', 5, 1.3) }),
  modifier({ id: 'pager', name: 'Two-Way Pager', noun: 'Pager', adjective: 'Paged', blurb: 'RARE: SHOTS COME BACK, BIGGER', band: [40, 50], effect: { kind: 'trajectory_replay', stage: 'trajectory', priority: 0, sourceItemId: 'pager', label: 'one return pass (activates once per root)', returnPasses: 1, activatesOncePerRoot: true } }),
  melee({ id: 'lightsaber_toy', name: 'Light-Up Laser Sword', noun: 'Laser Sword', adjective: 'Humming', blurb: 'RARE: LONG GLOWING SLASH', band: [40, 50], damage: 8, cooldown: 26, range: 96, degrees: 40 }),
];

/** Every round-32 entry, sold or dropped. */
export const ALL_ROSTER: readonly RosterEntry[] = [...STORE_ROSTER, ...RARE_ROSTER];

/**
 * Who sells what, by store template id. The template list in
 * wing/templates.ts lays these out on shelves and prices them in band.
 */
export const STORE_STOCK: Readonly<Record<string, readonly string[]>> = {
  'sports-locker': ['aluminum_bat', 'hockey_stick', 'tennis_ball_launcher', 'golf_club', 'dodgeball', 'sweatband', 'lacrosse_stick', 'football'],
  'hardware-hut': ['nail_gun', 'pipe_wrench', 'duct_tape', 'leaf_blower', 'staple_gun', 'claw_hammer', 'garden_hose', 'jumper_cables', 'extension_cord', 'car_battery'],
  'toy-box': ['super_soaker_50', 'yo_yo', 'slingshot', 'slime_tub', 'pog_slammer', 'water_balloons', 'foam_sword', 'slinky', 'foam_ball_blaster', 'party_popper'],
  'radio-shed': ['laser_pointer', 'walkman', 'nine_volt_pack', 'boombox', 'rc_blimp_remote', 'satellite_dish', 'tesla_coil_kit', 'camcorder', 'plasma_globe', 'anti_static_strap'],
  'spiral-records': ['electric_guitar', 'record_toss', 'mic_stand', 'drumsticks', 'mixtape', 'cd_shuriken', 'fog_machine', 'keytar'],
  'slice-station': ['pizza_cutter', 'pizza_peel', 'cheese_pump', 'soda_gun', 'dough_roller', 'pepperoni_launcher', 'hot_sauce', 'ketchup_bottle', 'slushie_cup'],
  'video-world': ['vhs_tape', 'cardboard_standee', 'popcorn_bucket', 'rewind_button', 'laserdisc', 'late_fee_stamp', 'vhs_rewinder', 'paint_marker'],
};
