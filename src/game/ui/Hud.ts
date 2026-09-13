import type { RunState } from '../../sim/model';

export type HudMode = 'shift' | 'lab';

export class Hud {
  private readonly healthValue: HTMLElement;
  private readonly healthFill: HTMLElement;
  private readonly runStatus: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly labFeedback: HTMLElement;
  private readonly labFeedbackRecent: HTMLElement;
  private readonly labFeedbackTrace: HTMLElement;
  private readonly endState: HTMLElement;
  private readonly endTitle: HTMLElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly onRestart: () => void;
  private readonly mode: HudMode;

  public constructor(onRestart: () => void, mode: HudMode = 'shift') {
    const healthValue = document.querySelector<HTMLElement>('#health-value');
    const healthFill = document.querySelector<HTMLElement>('#health-fill');
    const runStatus = document.querySelector<HTMLElement>('#run-status');
    const controls = document.querySelector<HTMLElement>('#run-controls');
    const endState = document.querySelector<HTMLElement>('#end-state');
    const endTitle = document.querySelector<HTMLElement>('#end-title');
    const restartButton = document.querySelector<HTMLButtonElement>('#restart-shift');
    const labFeedback = document.querySelector<HTMLElement>('#lab-feedback');
    const labFeedbackRecent = document.querySelector<HTMLElement>('#lab-feedback-recent');
    const labFeedbackTrace = document.querySelector<HTMLElement>('#lab-feedback-trace');
    if (
      !healthValue ||
      !healthFill ||
      !runStatus ||
      !controls ||
      !endState ||
      !endTitle ||
      !restartButton ||
      !labFeedback ||
      !labFeedbackRecent ||
      !labFeedbackTrace
    ) {
      throw new Error('Run HUD markup is incomplete.');
    }
    this.healthValue = healthValue;
    this.healthFill = healthFill;
    this.runStatus = runStatus;
    this.controls = controls;
    this.labFeedback = labFeedback;
    this.labFeedbackRecent = labFeedbackRecent;
    this.labFeedbackTrace = labFeedbackTrace;
    this.endState = endState;
    this.endTitle = endTitle;
    this.restartButton = restartButton;
    this.onRestart = onRestart;
    this.mode = mode;
    this.restartButton.addEventListener('click', this.onRestart);
  }

  public sync(state: RunState): void {
    const health = Math.max(0, state.player.health);
    this.healthValue.textContent = `${health} / 6`;
    this.healthFill.style.width = `${(health / 6) * 100}%`;
    this.controls.textContent = this.controlsText(state);
    this.syncLabFeedback(state);
    if (state.status === 'playing') {
      this.endState.hidden = true;
      if (state.paused) {
        this.runStatus.textContent =
          this.mode === 'lab' ? 'LAB PAUSED — PRESS ESC TO RESUME' : 'SHIFT PAUSED — PRESS ESC TO RESUME';
      } else if (this.mode === 'lab') {
        this.runStatus.textContent = `LAB RUN — ${state.compiledLoadout.primary.name.toUpperCase()}`;
      } else {
        this.runStatus.textContent = 'SHIFT ACTIVE';
      }
      return;
    }

    this.runStatus.textContent = state.status === 'won' ? 'ROOM SECURED' : 'FACILITIES INCIDENT';
    this.endTitle.textContent = state.status === 'won' ? 'Shift complete' : 'Shift ended';
    this.endState.hidden = false;
  }

  /** Accurate primary-specific controls text instead of a hard-coded mop line. */
  private controlsText(state: RunState): string {
    const action =
      state.compiledLoadout.primary.delivery === 'direct' ? 'HOLD CLICK MOP' : 'HOLD CLICK WATER SHOT';
    return `WASD MOVE · POINTER AIM · ${action} · ESC PAUSE`;
  }

  private syncLabFeedback(state: RunState): void {
    if (this.mode !== 'lab') {
      this.labFeedback.hidden = true;
      return;
    }
    this.labFeedback.hidden = false;
    const recent = state.recentChange.length > 0 ? state.recentChange : 'none yet';
    const trace = state.behaviorTrace.at(-1) ?? 'none yet';
    if (this.labFeedbackRecent.textContent !== `RECENT: ${recent}`) {
      this.labFeedbackRecent.textContent = `RECENT: ${recent}`;
    }
    if (this.labFeedbackTrace.textContent !== `TRACE: ${trace}`) {
      this.labFeedbackTrace.textContent = `TRACE: ${trace}`;
    }
  }

  public destroy(): void {
    this.restartButton.removeEventListener('click', this.onRestart);
  }
}
