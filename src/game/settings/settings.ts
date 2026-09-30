/**
 * Player comfort and volume settings.
 *
 * Every screen effect reads its strength from here — camera shake, the hit
 * stop, white hit flashes and the red screen washes — and the sound engine
 * reads its two volumes. Presentation only: nothing here changes a rule,
 * and hit stop off simply means the clock never holds.
 *
 * Saved in this browser's storage, guarded like the checkpoint and playtest
 * log, so blocked storage just means the defaults for this session.
 */
export type Strength = 'full' | 'reduced' | 'off';

export type GameSettings = {
  readonly shake: Strength;
  readonly hitStop: Strength;
  /** Reduced: no white hit flashes, gentler red washes, no neon flicker. */
  readonly flashes: 'full' | 'reduced';
  readonly musicVolume: number;
  readonly sfxVolume: number;
};

export const DEFAULT_SETTINGS: GameSettings = {
  shake: 'full',
  hitStop: 'full',
  flashes: 'full',
  musicVolume: 0.8,
  sfxVolume: 1,
};

const STORAGE_KEY = 'dead-mall:settings:v1';
const STRENGTHS: readonly Strength[] = ['full', 'reduced', 'off'];

const strengthScale = (strength: Strength, reduced: number): number => (strength === 'full' ? 1 : strength === 'reduced' ? reduced : 0);

export const shakeScale = (settings: GameSettings): number => strengthScale(settings.shake, 0.35);
export const hitStopScale = (settings: GameSettings): number => strengthScale(settings.hitStop, 0.5);
export const flashAllowed = (settings: GameSettings): boolean => settings.flashes === 'full';
/**
 * An on/off alternation every `halfPeriod` ticks, or steadily on with reduced
 * flashing: banners and highlights still show, they just don't strobe.
 */
export const blink = (tick: number, halfPeriod: number, settings: GameSettings): boolean =>
  !flashAllowed(settings) || Math.floor(tick / halfPeriod) % 2 === 0;
/** Multiplier for full-screen red washes (hurt vignette, heartbeat pulse). */
export const washScale = (settings: GameSettings): number => (settings.flashes === 'full' ? 1 : 0.45);

/** The tick that noise effects (Radio Shed snow) draw from: frozen when flashes are reduced. */
export const flickerTick = (settings: GameSettings, tick: number): number => (settings.flashes === 'full' ? tick : 0);

const volume = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

/** Any stored or pasted value, repaired into valid settings. */
export function sanitizeSettings(raw: unknown): GameSettings {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const strength = (value: unknown, fallback: Strength): Strength =>
    STRENGTHS.includes(value as Strength) ? (value as Strength) : fallback;
  return {
    shake: strength(source.shake, DEFAULT_SETTINGS.shake),
    hitStop: strength(source.hitStop, DEFAULT_SETTINGS.hitStop),
    flashes: source.flashes === 'reduced' ? 'reduced' : 'full',
    musicVolume: volume(source.musicVolume, DEFAULT_SETTINGS.musicVolume),
    sfxVolume: volume(source.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
  };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export class SettingsStore {
  private readonly storage: StorageLike | null;
  private current: GameSettings;
  private readonly listeners = new Set<(settings: GameSettings) => void>();

  public constructor(storage: StorageLike | null) {
    this.storage = storage;
    this.current = DEFAULT_SETTINGS;
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (raw) this.current = sanitizeSettings(JSON.parse(raw));
    } catch {
      this.current = DEFAULT_SETTINGS;
    }
  }

  public get(): GameSettings {
    return this.current;
  }

  public update(patch: Partial<GameSettings>): void {
    this.current = sanitizeSettings({ ...this.current, ...patch });
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.current));
    } catch {
      // Storage refused: the change still applies for this session.
    }
    for (const listener of this.listeners) listener(this.current);
  }

  public subscribe(listener: (settings: GameSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

let shared: SettingsStore | null = null;

/** The one settings store the game and the title screen share. */
export function gameSettings(): SettingsStore {
  shared ??= new SettingsStore(browserStorage());
  return shared;
}
