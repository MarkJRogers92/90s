import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SettingsStore,
  flashAllowed,
  hitStopScale,
  sanitizeSettings,
  shakeScale,
} from '../../src/game/settings/settings';

class MemoryStorage {
  public readonly map = new Map<string, string>();
  public getItem(key: string): string | null { return this.map.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.map.set(key, value); }
}

describe('settings values', () => {
  it('scales shake and hit stop from full to off', () => {
    expect(shakeScale({ ...DEFAULT_SETTINGS, shake: 'full' })).toBe(1);
    expect(shakeScale({ ...DEFAULT_SETTINGS, shake: 'reduced' })).toBeGreaterThan(0);
    expect(shakeScale({ ...DEFAULT_SETTINGS, shake: 'reduced' })).toBeLessThan(1);
    expect(shakeScale({ ...DEFAULT_SETTINGS, shake: 'off' })).toBe(0);
    expect(hitStopScale({ ...DEFAULT_SETTINGS, hitStop: 'off' })).toBe(0);
    expect(hitStopScale({ ...DEFAULT_SETTINGS, hitStop: 'reduced' })).toBe(0.5);
  });

  it('turns white flashes off when flashes are reduced', () => {
    expect(flashAllowed(DEFAULT_SETTINGS)).toBe(true);
    expect(flashAllowed({ ...DEFAULT_SETTINGS, flashes: 'reduced' })).toBe(false);
  });

  it('repairs garbage into valid settings', () => {
    const fixed = sanitizeSettings({ shake: 'wobbly', musicVolume: 7, sfxVolume: -1, flashes: 'reduced' });
    expect(fixed.shake).toBe(DEFAULT_SETTINGS.shake);
    expect(fixed.musicVolume).toBe(1);
    expect(fixed.sfxVolume).toBe(0);
    expect(fixed.flashes).toBe('reduced');
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('settings store', () => {
  it('saves changes, reloads them, and tells listeners', () => {
    const storage = new MemoryStorage();
    const store = new SettingsStore(storage);
    let heard = 0;
    store.subscribe(() => { heard += 1; });
    store.update({ shake: 'off', musicVolume: 0.3 });
    expect(heard).toBe(1);
    const reloaded = new SettingsStore(storage);
    expect(reloaded.get().shake).toBe('off');
    expect(reloaded.get().musicVolume).toBeCloseTo(0.3);
  });

  it('keeps working when storage is blocked', () => {
    const blocked = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
    const store = new SettingsStore(blocked);
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(() => store.update({ flashes: 'reduced' })).not.toThrow();
    expect(store.get().flashes).toBe('reduced');
  });
});
