import type { RunState } from '../../sim/model';

export class Hud {
  private readonly healthValue: HTMLElement;
  private readonly healthFill: HTMLElement;
  private readonly runStatus: HTMLElement;
  private readonly endState: HTMLElement;
  private readonly endTitle: HTMLElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly onRestart: () => void;

  public constructor(onRestart: () => void) {
    const healthValue = document.querySelector<HTMLElement>('#health-value');
    const healthFill = document.querySelector<HTMLElement>('#health-fill');
    const runStatus = document.querySelector<HTMLElement>('#run-status');
    const endState = document.querySelector<HTMLElement>('#end-state');
    const endTitle = document.querySelector<HTMLElement>('#end-title');
    const restartButton = document.querySelector<HTMLButtonElement>('#restart-shift');
    if (!healthValue || !healthFill || !runStatus || !endState || !endTitle || !restartButton) {
      throw new Error('Run HUD markup is incomplete.');
    }
    this.healthValue = healthValue;
    this.healthFill = healthFill;
    this.runStatus = runStatus;
    this.endState = endState;
    this.endTitle = endTitle;
    this.restartButton = restartButton;
    this.onRestart = onRestart;
    this.restartButton.addEventListener('click', this.onRestart);
  }

  public sync(state: RunState): void {
    const health = Math.max(0, state.player.health);
    this.healthValue.textContent = `${health} / 6`;
    this.healthFill.style.width = `${(health / 6) * 100}%`;
    if (state.status === 'playing') {
      this.endState.hidden = true;
      this.runStatus.textContent = state.paused
        ? 'SHIFT PAUSED — PRESS ESC TO RESUME'
        : 'SHIFT ACTIVE';
      return;
    }

    this.runStatus.textContent = state.status === 'won' ? 'ROOM SECURED' : 'FACILITIES INCIDENT';
    this.endTitle.textContent = state.status === 'won' ? 'Shift complete' : 'Shift ended';
    this.endState.hidden = false;
  }

  public destroy(): void {
    this.restartButton.removeEventListener('click', this.onRestart);
  }
}
