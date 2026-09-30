/**
 * The mall PA: what the building says over the speakers, and when.
 *
 * `PaDirector` compares consecutive run states the way the audio cues do and
 * decides when an announcement plays: the boss room, the upper level, a
 * blackout or Blue Light Special, a first drop to the last heart in a room,
 * the store alarm and its shutter, rising wanted stars, laundering, a big
 * combo, room entries now and then, and an idle line in a long quiet stretch.
 * A cooldown keeps it from talking over itself (the boss, upstairs,
 * room-event, alarm and shutter lines cut in regardless), and lines are
 * picked from the mall seed, so the same mall says the same things. Pure: no
 * Phaser.
 */
import { roomEventFor } from '../../sim/run/roomEvents';
import { COMBO_MILESTONE } from '../../sim/run/combo';
import type { MvpRunState } from '../../sim/run/types';
import { hotItemCount, wantedStars } from '../../sim/run/wanted';
import { STALKER_MIN_STARS } from '../../sim/run/stalker';
import { activeStore } from '../../sim/run/storeInterior';
import { shelvedSignaturePair } from '../../sim/run/recipeHints';
import { itemDefinitionName } from '../../sim/run/economy';
import { shortItemName } from '../../sim/fusion/hybrid';
import { floorNumberOf, type FloorNumber } from '../../sim/wing/floorSpecs';

export const PA_COOLDOWN_TICKS = 60 * 12;
/** The longest line the ticker shows. */
export const PA_MAX_CHARS = 56;
export const PA_IDLE_TICKS = 60 * 45;
/** A fresh shift or floor keeps the PA quiet only this long (the cold open's beat). */
export const PA_START_GRACE_TICKS = 60 * 3;
const LAST_HEART = 2;

export const PA_LINES = {
  room: [
    'ATTENTION SHOPPERS: THE MALL IS NOW CLOSED. PLEASE STAY.',
    'REMINDER: RUNNING IN THE MALL IS STRICTLY ENCOURAGED.',
    "TONIGHT'S SPECIAL: EVERYTHING. EVERYONE. FOREVER.",
    'A LOST CHILD HAS BEEN FOUND. IT IS NOT A CHILD.',
    'WILL THE OWNER OF A BLUE STATION WAGON... NEVER MIND.',
  ],
  low_health: [
    'CLEANUP ON AISLE FOUR. BRING A BIGGER MOP.',
    'A FIRST AID ATTENDANT IS ON THE WAY. NO THEY ARE NOT.',
    'EMPLOYEES ARE REMINDED TO BLEED ON THEIR OWN TIME.',
  ],
  theft: [
    'LOSS PREVENTION TO THE STORE FLOOR. LOSS PREVENTION.',
    'ATTENTION: A JANITOR IS CONCEALING MERCHANDISE.',
    'SHOPLIFTING IS A CRIME. IT IS ALSO A LIFESTYLE.',
  ],
  alarm: [
    'FIVE-FINGER DISCOUNT IN PROGRESS: {STORE}.',
    'CODE FIVE-FINGER: {STORE}. THE DEAL IS YOURS.',
  ],
  shutter: ['SECURITY TO {STORE}. NOBODY LEAVES.'],
  wanted: [
    'WOULD THE JANITOR PLEASE RETURN THE MERCHANDISE.',
    'THE JANITOR IS WANTED. PLEASE DO NOT ENCOURAGE.',
  ],
  launder: ['MANAGEMENT REMINDS STAFF: ALL SALES ARE FINAL.'],
  // Round 34: a signature pair shelved together in the store just entered.
  recipe: [
    'PSST. {A} AND {B}. TRUST US.',
    'STAFF PICK: {A} WITH {B}.',
    'TRY THE {A} WITH THE {B}.',
  ],
  stalker: [
    'LOSS PREVENTION IS NOW FOLLOWING THE JANITOR. KEEP UP.',
    'AN AGENT HAS BEEN ASSIGNED. HE DOES NOT CLOCK OUT.',
  ],
  stalker_lost: ['LOSS PREVENTION HAS GONE ON BREAK. FOR NOW.'],
  combo: [
    'ATTENTION: WE HAVE AN EMPLOYEE OF THE MONTH.',
    'SOMEONE GIVE THAT JANITOR A RAISE. REQUEST DENIED.',
  ],
  blackout: [
    'WE ARE EXPERIENCING... TECHNICAL DIFFICULTIES.',
    'POWER WILL BE RESTORED WHEN WE FEEL LIKE IT.',
  ],
  blue_light: ['ATTENTION SHOPPERS: A BLUE LIGHT SPECIAL. HALF OFF.'],
  boss_floor_one: ['LOSS PREVENTION IS ON THE FLOOR. DO NOT RUN.'],
  boss_floor_two: ['WILL THE MALL MANAGER PLEASE REPORT TO... OH NO.'],
  boss_floor_three: ['THE OWNER WOULD LIKE A WORD. PLEASE DO NOT REPLY.'],
  topfloor: ['THE FOOD COURT IS CLOSED. THE MASCOTS ARE NOT.'],
  upstairs: ['WELCOME TO THE UPPER LEVEL. PLEASE HOLD THE HANDRAIL.'],
  idle: [
    'THE MALL CLOSES AT 9 PM. IT IS NOW PAST MIDNIGHT.',
    'PLEASE DO NOT FEED THE MANNEQUINS.',
    'THE FOUNTAIN IS NOT FOR DRINKING. OR WISHING.',
    'NOW PLAYING: THE SAME SONG. AGAIN.',
    'THANK YOU FOR SHOPPING AT DEAD MALL. YOU CANNOT LEAVE.',
  ],
} as const;

export type PaEvent = keyof typeof PA_LINES;

/** Each floor's welcome off the escalator (none on the ground floor) and its boss-room line. */
const FLOOR_PA: Readonly<Record<FloorNumber, { readonly arrive: PaEvent | null; readonly boss: PaEvent }>> = {
  1: { arrive: null, boss: 'boss_floor_one' },
  2: { arrive: 'upstairs', boss: 'boss_floor_two' },
  3: { arrive: 'topfloor', boss: 'boss_floor_three' },
};

type Snapshot = {
  readonly tick: number;
  readonly seed: number;
  readonly floor: FloorNumber;
  readonly roomIndex: number;
  readonly health: number;
  readonly stars: number;
  readonly hotItems: number;
  readonly alarm: boolean;
  readonly shutter: string | null;
  readonly store: string;
  readonly comboTier: number;
  readonly quiet: boolean;
  readonly interior: boolean;
  /** A signature pair both still on the active store's shelf, by item id. */
  readonly pair: readonly [string, string] | null;
};

/** A recipe line with both items named, falling back to their short nouns when it would not fit the ticker. */
export function recipeLine(line: string, a: string, b: string): string {
  const full = line.replace('{A}', itemDefinitionName(a).toUpperCase()).replace('{B}', itemDefinitionName(b).toUpperCase());
  if (full.length <= PA_MAX_CHARS) return full;
  return line.replace('{A}', shortItemName(a).toUpperCase()).replace('{B}', shortItemName(b).toUpperCase());
}

function snapshot(state: MvpRunState): Snapshot {
  return {
    tick: state.tick,
    seed: state.seed,
    floor: floorNumberOf(state.wing),
    roomIndex: state.roomIndex,
    health: state.room.combat.player.health,
    stars: wantedStars(state.heat),
    hotItems: hotItemCount(state),
    alarm: state.alarm !== null,
    shutter: state.alarm?.shutter ?? null,
    store: (activeStore(state)?.name ?? 'the store').toUpperCase(),
    comboTier: Math.floor((state.stats?.combo ?? 0) / COMBO_MILESTONE),
    quiet: !state.room.combat.enemies.some((enemy) => enemy.health > 0),
    interior: state.room.interior === true,
    pair: activeStore(state) ? shelvedSignaturePair(state, activeStore(state)!.templateId) : null,
  };
}

export class PaDirector {
  private previous: Snapshot | null = null;
  private lastSpoke = 0;
  private spoken = 0;
  private lowHealthRoom = -1;

  /** Feed every rendered frame; returns a line when the PA should speak. */
  public observe(state: MvpRunState): string | null {
    const current = snapshot(state);
    const previous = this.previous;
    this.previous = current;
    if (previous === null) {
      this.quietStart(current.tick);
      return null;
    }
    if (state.status !== 'playing') return null;
    // A new shift or a new floor: the run started over underneath us.
    if (current.tick < previous.tick || current.floor !== previous.floor || current.seed !== previous.seed) {
      this.quietStart(current.tick);
      this.lowHealthRoom = -1;
      const welcome = FLOOR_PA[current.floor].arrive;
      return welcome && current.floor !== previous.floor ? this.say(welcome, current, true) : null;
    }
    if (current.alarm && !previous.alarm) return this.say('alarm', current, true);
    if (current.shutter === 'closed' && previous.shutter !== 'closed') return this.say('shutter', current, true);
    if (current.interior && !previous.interior && current.pair) return this.say('recipe', current, true);
    if (current.roomIndex !== previous.roomIndex) {
      const room = state.wing.rooms[current.roomIndex];
      if (room?.bossAnchor != null) return this.say(FLOOR_PA[current.floor].boss, current, true);
      const event = roomEventFor(state, current.roomIndex);
      if (event === 'blackout') return this.say('blackout', current, true);
      if (event === 'blue_light') return this.say('blue_light', current, true);
      // Now and then, the mall has something to say about the next room.
      if ((current.seed + current.roomIndex) % 2 === 0) return this.say('room', current);
    }
    if (current.health <= LAST_HEART && previous.health > LAST_HEART && this.lowHealthRoom !== current.roomIndex) {
      this.lowHealthRoom = current.roomIndex;
      return this.say('low_health', current);
    }
    // Four stars sets Loss Prevention on the janitor (see stalker.ts).
    if (current.stars >= STALKER_MIN_STARS && previous.stars < STALKER_MIN_STARS) return this.say('stalker', current, true);
    if (current.stars < STALKER_MIN_STARS && previous.stars >= STALKER_MIN_STARS) return this.say('stalker_lost', current, true);
    if (current.stars > previous.stars) return this.say(current.stars >= 3 ? 'wanted' : 'theft', current);
    if (current.hotItems < previous.hotItems) return this.say('launder', current);
    if (current.comboTier > previous.comboTier && current.comboTier >= 2) return this.say('combo', current);
    if (current.quiet && current.tick - this.lastSpoke >= PA_IDLE_TICKS) return this.say('idle', current);
    return null;
  }

  /** As if the PA last spoke just long enough ago to be free again after the grace. */
  private quietStart(tick: number): void {
    this.lastSpoke = tick - PA_COOLDOWN_TICKS + PA_START_GRACE_TICKS;
  }

  private say(event: PaEvent, current: Snapshot, force = false): string | null {
    if (!force && current.tick - this.lastSpoke < PA_COOLDOWN_TICKS) return null;
    const lines: readonly string[] = PA_LINES[event];
    const pick = Math.abs(Math.imul(current.seed + 17, 31) + this.spoken * 7) % lines.length;
    this.lastSpoke = current.tick;
    this.spoken += 1;
    const line = (lines[pick] ?? lines[0]!).replace('{STORE}', current.store);
    return event === 'recipe' && current.pair ? recipeLine(line, current.pair[0], current.pair[1]) : line;
  }
}

const CHIME_MS = 600;
const CHARS_PER_SECOND = 30;
const HOLD_MS = 3000;
const FADE_MS = 400;

/** The ticker's timeline: a chime, the line typed out, a hold, then a fade. */
export function paTypingFrame(ms: number, text: string): { readonly chars: number; readonly alpha: number; readonly done: boolean } {
  const typed = CHIME_MS + (text.length / CHARS_PER_SECOND) * 1000;
  const fadeFrom = typed + HOLD_MS;
  return {
    chars: Math.max(0, Math.min(text.length, Math.floor(((ms - CHIME_MS) / 1000) * CHARS_PER_SECOND))),
    alpha: ms < 150 ? ms / 150 : ms < fadeFrom ? 1 : Math.max(0, 1 - (ms - fadeFrom) / FADE_MS),
    done: ms >= fadeFrom + FADE_MS,
  };
}
