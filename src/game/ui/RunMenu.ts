/** Accessible page controls. The scene alone owns the simulation's pause state. */
import { SETTINGS_OPENED_EVENT, settingsDialogOpen } from './SettingsPanel';

export const RUN_MENU_OPENED_EVENT = 'dead-mall:run-menu-opened';
export const RUN_MENU_CLOSED_EVENT = 'dead-mall:run-menu-closed';
export type RunMenuClosedDetail = { readonly resume: boolean };

type Find = <T extends HTMLElement>(selector: string) => T;

export function runMenuOpen(): boolean {
  const panel = typeof document === 'undefined' ? null : document.getElementById('run-menu-panel');
  return panel !== null && !panel.hidden;
}

export class RunMenu {
  private readonly panel: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly fullscreen: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly app: HTMLElement;
  private readonly restart: HTMLElement;
  private readonly returnButton: HTMLElement;
  private returnFocus: HTMLElement | null = null;
  private pendingFullscreen = false;
  private wasFullscreen = false;
  private ignoreEscapeUntil = 0;
  private destroyed = false;
  private errorTimeout: ReturnType<typeof setTimeout> | null = null;

  public constructor(find: Find) {
    this.panel = find('#run-menu-panel');
    this.toggle = find('#run-menu-toggle');
    this.closeButton = find('#run-menu-close');
    this.fullscreen = find('#run-fullscreen');
    this.status = find('#run-fullscreen-status');
    this.status.dataset.error = 'false';
    this.app = find('#app');
    this.restart = find('#mvp-restart-run');
    this.returnButton = find('#mvp-return');
    this.panel.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.addEventListener('click', this.toggleMenu);
    this.closeButton.addEventListener('click', this.closeMenu);
    this.fullscreen.addEventListener('click', this.toggleFullscreen);
    this.restart.addEventListener('click', this.resetMenu);
    this.returnButton.addEventListener('click', this.resetMenu);
    window.addEventListener(SETTINGS_OPENED_EVENT, this.yieldToSettings);
    window.addEventListener('keydown', this.handleKeyDown, true);
    window.addEventListener('keyup', this.handleKeyUp, true);
    window.addEventListener('focusin', this.containFocus);
    window.addEventListener('pointerdown', this.blockBackdrop, true);
    window.addEventListener('click', this.blockBackdrop, true);
    document.addEventListener('fullscreenchange', this.fullscreenChanged);
    document.addEventListener('fullscreenerror', this.fullscreenError);
    this.wasFullscreen = document.fullscreenElement === this.app;
    this.syncFullscreen();
  }

  public open(): void {
    if (!this.panel.hidden || this.destroyed || settingsDialogOpen()) return;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : this.toggle;
    this.panel.hidden = false;
    this.toggle.setAttribute('aria-expanded', 'true');
    window.dispatchEvent(new CustomEvent(RUN_MENU_OPENED_EVENT));
    this.closeButton.focus();
  }

  public close(resume = true, restoreFocus = true): void {
    if (this.panel.hidden) return;
    this.panel.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'false');
    window.dispatchEvent(new CustomEvent<RunMenuClosedDetail>(RUN_MENU_CLOSED_EVENT, { detail: { resume } }));
    if (restoreFocus) (this.returnFocus ?? this.toggle).focus();
    this.returnFocus = null;
  }

  /** Navigation discards the old scene's pause lease, never resumes that scene. */
  public reset(): void { this.close(false, false); }

  public destroy(): void {
    this.reset();
    this.destroyed = true;
    this.clearError();
    this.toggle.removeEventListener('click', this.toggleMenu);
    this.closeButton.removeEventListener('click', this.closeMenu);
    this.fullscreen.removeEventListener('click', this.toggleFullscreen);
    this.restart.removeEventListener('click', this.resetMenu);
    this.returnButton.removeEventListener('click', this.resetMenu);
    window.removeEventListener(SETTINGS_OPENED_EVENT, this.yieldToSettings);
    window.removeEventListener('keydown', this.handleKeyDown, true);
    window.removeEventListener('keyup', this.handleKeyUp, true);
    window.removeEventListener('focusin', this.containFocus);
    window.removeEventListener('pointerdown', this.blockBackdrop, true);
    window.removeEventListener('click', this.blockBackdrop, true);
    document.removeEventListener('fullscreenchange', this.fullscreenChanged);
    document.removeEventListener('fullscreenerror', this.fullscreenError);
  }

  private readonly toggleMenu = (): void => { if (this.panel.hidden) this.open(); else this.close(); };
  private readonly closeMenu = (): void => this.close();
  private readonly resetMenu = (): void => this.reset();
  private readonly yieldToSettings = (): void => this.close(false, false);
  private readonly blockBackdrop = (event: Event): void => {
    if (this.panel.hidden) return;
    const target = event.target as Node;
    if (this.panel.contains(target) || this.toggle.contains(target) || this.fullscreen.contains(target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.closeButton.focus();
  };
  private readonly containFocus = (event: Event): void => {
    if (!this.panel.hidden && !this.panel.contains(event.target as Node)) this.closeButton.focus();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    // Some browsers deliver Esc before fullscreenchange, some immediately after.
    // Leave its native exit action alone, but never also toggle the game's pause.
    if (event.code === 'Escape' && (document.fullscreenElement || Date.now() < this.ignoreEscapeUntil)) {
      event.stopImmediatePropagation();
      return;
    }
    if (this.panel.hidden) return;
    event.stopImmediatePropagation();
    if (event.code === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.code === 'Tab') {
      event.preventDefault();
      const controls = Array.from(this.panel.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary, [tabindex]'))
        .filter((element) => !('disabled' in element && element.disabled) && element.tabIndex >= 0 && !element.closest('[hidden], [inert]') && element.getClientRects().length > 0);
      const index = controls.indexOf(document.activeElement as HTMLElement);
      const next = index < 0 ? (event.shiftKey ? controls.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      (controls[next] ?? this.closeButton).focus();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (!this.panel.hidden) event.stopImmediatePropagation();
  };

  private supported(): boolean {
    return document.fullscreenEnabled !== false && typeof this.app.requestFullscreen === 'function' && typeof document.exitFullscreen === 'function';
  }

  private syncFullscreen(): void {
    const active = document.fullscreenElement === this.app;
    this.fullscreen.textContent = active ? 'Exit fullscreen' : 'Fullscreen';
    this.fullscreen.setAttribute('aria-pressed', String(active));
    this.fullscreen.disabled = this.pendingFullscreen || !this.supported();
    if (!this.supported()) {
      this.clearError();
      this.status.textContent = 'Fullscreen is unavailable in this browser. You can still play in this window.';
      this.fullscreen.title = this.status.textContent;
    }
  }

  private readonly fullscreenChanged = (): void => {
    const active = document.fullscreenElement === this.app;
    if (this.wasFullscreen && !active) this.ignoreEscapeUntil = Date.now() + 250;
    this.wasFullscreen = active;
    this.clearError();
    this.status.textContent = active ? 'Fullscreen on.' : 'Fullscreen off.';
    this.syncFullscreen();
  };

  private clearError(): void {
    if (this.errorTimeout !== null) clearTimeout(this.errorTimeout);
    this.errorTimeout = null;
    this.status.dataset.error = 'false';
  }

  private reportError(message: string): void {
    this.clearError();
    this.status.dataset.error = 'true';
    this.status.textContent = message;
    this.errorTimeout = setTimeout(() => {
      this.status.dataset.error = 'false';
      this.errorTimeout = null;
    }, 6000);
  }

  private readonly fullscreenError = (): void => {
    this.reportError('Fullscreen could not be changed. Please try again or use your browser’s fullscreen control.');
  };

  private readonly toggleFullscreen = async (): Promise<void> => {
    if (this.pendingFullscreen || !this.supported() || this.destroyed) return;
    const exiting = document.fullscreenElement === this.app;
    this.pendingFullscreen = true;
    this.clearError();
    this.status.textContent = '';
    this.syncFullscreen();
    try {
      if (exiting) await document.exitFullscreen();
      else await this.app.requestFullscreen();
    } catch {
      if (!this.destroyed) {
        this.reportError(`Could not ${exiting ? 'exit' : 'enter'} fullscreen. Please try again or use your browser's fullscreen control.`);
      }
    } finally {
      this.pendingFullscreen = false;
      if (!this.destroyed) this.syncFullscreen();
    }
  };
}

/** A menu may restore only the pause it acquired; settings/blur retain theirs. */
export class RunMenuPause {
  private openNow = false;
  private ownsPause = false;
  public constructor(private readonly port: {
    readonly isPaused: () => boolean;
    readonly canResume: () => boolean;
    readonly setPaused: (paused: boolean) => void;
    readonly clearInput: () => void;
  }) {}

  public open(): void {
    if (this.openNow) return;
    this.openNow = true;
    this.ownsPause = !this.port.isPaused() && this.port.canResume();
    this.port.clearInput();
    if (this.ownsPause) this.port.setPaused(true);
  }

  public close(resume: boolean): void {
    if (!this.openNow) return;
    this.openNow = false;
    this.port.clearInput();
    if (resume && this.ownsPause && this.port.canResume()) this.port.setPaused(false);
    this.ownsPause = false;
  }

  public retainPause(): void { this.ownsPause = false; }
}
