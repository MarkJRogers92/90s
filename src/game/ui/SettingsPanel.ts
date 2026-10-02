/**
 * The settings dialog, shared by the title screen and the game. Plain,
 * keyboard-accessible form controls bound to `gameSettings()`; every change
 * applies at once and is saved. Esc closes it before anything else sees the
 * key, so closing settings never also unpauses the shift.
 */
import { DEFAULT_SETTINGS, gameSettings, type GameSettings } from '../settings/settings';

export const SETTINGS_OPENED_EVENT = 'dead-mall:settings-opened';
/** Asks the page to open the dialog (the game's O key). */
export const OPEN_SETTINGS_EVENT = 'dead-mall:open-settings';

/** True while the dialog is up, so game input can stand aside. */
export function settingsDialogOpen(): boolean {
  const panel = typeof document === 'undefined' ? null : document.getElementById('settings-panel');
  return panel !== null && !panel.hidden;
}

type Find = <T extends HTMLElement>(selector: string) => T;

export class SettingsPanel {
  private readonly panel: HTMLElement;
  private readonly music: HTMLInputElement;
  private readonly sfx: HTMLInputElement;
  private readonly musicValue: HTMLOutputElement;
  private readonly sfxValue: HTMLOutputElement;
  private returnFocus: HTMLElement | null = null;

  public constructor(find: Find) {
    this.panel = find('#settings-panel');
    this.music = find<HTMLInputElement>('#setting-music');
    this.sfx = find<HTMLInputElement>('#setting-sfx');
    this.musicValue = find<HTMLOutputElement>('#setting-music-value');
    this.sfxValue = find<HTMLOutputElement>('#setting-sfx-value');
    find('#settings-open').addEventListener('click', () => this.open());
    find('#mvp-open-settings').addEventListener('click', () => this.open());
    find('#settings-close').addEventListener('click', () => this.close());
    find('#settings-reset').addEventListener('click', () => {
      gameSettings().update(DEFAULT_SETTINGS);
      this.render(gameSettings().get());
    });
    for (const name of ['shake', 'hitStop', 'flashes'] as const) {
      for (const input of this.panel.querySelectorAll<HTMLInputElement>(`input[name="setting-${name}"]`)) {
        input.addEventListener('change', () => {
          if (input.checked) gameSettings().update({ [name]: input.value } as Partial<GameSettings>);
        });
      }
    }
    for (const input of this.panel.querySelectorAll<HTMLInputElement>('input[name="setting-coach"]')) {
      input.addEventListener('change', () => {
        if (input.checked) gameSettings().update({ coach: input.value === 'on' });
      });
    }
    this.music.addEventListener('input', () => {
      gameSettings().update({ musicVolume: Number(this.music.value) / 100 });
      this.render(gameSettings().get());
    });
    this.sfx.addEventListener('input', () => {
      gameSettings().update({ sfxVolume: Number(this.sfx.value) / 100 });
      this.render(gameSettings().get());
    });
    // Capture phase: Esc and O are ours while the dialog is open.
    window.addEventListener('keydown', (event) => {
      if (this.panel.hidden) return;
      if (event.code === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.close();
      }
    }, true);
  }

  public get isOpen(): boolean {
    return !this.panel.hidden;
  }

  public open(): void {
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.render(gameSettings().get());
    this.panel.hidden = false;
    // The game pauses itself when it hears this.
    window.dispatchEvent(new CustomEvent(SETTINGS_OPENED_EVENT));
    this.panel.querySelector<HTMLInputElement>('input:checked')?.focus();
  }

  public close(): void {
    this.panel.hidden = true;
    this.returnFocus?.focus();
  }

  private render(settings: GameSettings): void {
    for (const name of ['shake', 'hitStop', 'flashes'] as const) {
      for (const input of this.panel.querySelectorAll<HTMLInputElement>(`input[name="setting-${name}"]`)) {
        input.checked = input.value === settings[name];
      }
    }
    for (const input of this.panel.querySelectorAll<HTMLInputElement>('input[name="setting-coach"]')) {
      input.checked = input.value === (settings.coach ? 'on' : 'off');
    }
    this.music.value = String(Math.round(settings.musicVolume * 100));
    this.sfx.value = String(Math.round(settings.sfxVolume * 100));
    this.musicValue.textContent = `${this.music.value}%`;
    this.sfxValue.textContent = `${this.sfx.value}%`;
  }
}
