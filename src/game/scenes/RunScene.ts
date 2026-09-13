import Phaser from 'phaser';
import { installDebugBridge } from '../../debug/DebugBridge';
import { createRun } from '../../sim/createRun';
import { tickRun } from '../../sim/tickRun';
import type { RunState } from '../../sim/model';
import { InputAdapter } from '../input/InputAdapter';
import { Hud } from '../ui/Hud';
import { EntityView } from '../view/EntityView';

const STEP_MS = 1000 / 60;
const MAX_STEPS = 5;

export class RunScene extends Phaser.Scene {
  public static readonly KEY = 'RunScene';

  private run: RunState = createRun(1997);
  private accumulator = 0;
  private inputAdapter: InputAdapter | undefined;
  private entityView: EntityView | undefined;
  private hud: Hud | undefined;
  private removeDebugBridge: (() => void) | undefined;

  public constructor() {
    super(RunScene.KEY);
  }

  public create(): void {
    this.run = createRun(1997);
    this.accumulator = 0;
    this.inputAdapter = new InputAdapter(
      this,
      () => this.setPaused(!this.run.paused),
      () => this.setPaused(true),
    );
    this.entityView = new EntityView(this);
    this.hud = new Hud();

    if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_BRIDGE === 'true') {
      this.removeDebugBridge = installDebugBridge(() => this.run);
    }

    this.syncView();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyRun, this);
  }

  public update(_time: number, elapsedMs: number): void {
    if (!this.inputAdapter || this.run.paused || this.run.status !== 'playing') {
      this.accumulator = 0;
      this.syncView();
      return;
    }

    this.accumulator += Math.min(Math.max(elapsedMs, 0), STEP_MS * MAX_STEPS);
    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < MAX_STEPS) {
      tickRun(this.run, this.inputAdapter.readFrame());
      this.accumulator -= STEP_MS;
      steps += 1;
    }
    if (steps === MAX_STEPS) {
      this.accumulator = 0;
    }
    this.syncView();
  }

  private setPaused(paused: boolean): void {
    this.run.paused = paused;
    this.accumulator = 0;
    this.inputAdapter?.clearHeld();
    this.syncView();
  }

  private syncView(): void {
    this.entityView?.sync(this.run);
    this.hud?.sync(this.run);
  }

  private readonly destroyRun = (): void => {
    this.inputAdapter?.destroy();
    this.inputAdapter = undefined;
    this.entityView?.destroy();
    this.entityView = undefined;
    this.hud = undefined;
    this.removeDebugBridge?.();
    this.removeDebugBridge = undefined;
    this.accumulator = 0;
  };
}
