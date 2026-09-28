import Phaser from 'phaser';
import { installBenchDebugBridge, installWorldToCanvas } from '../../debug/DebugBridge';
import {
  acquireLateModifier,
  cancelFusion,
  confirmFusion,
} from '../../sim/bench/commands';
import { createBenchRun } from '../../sim/bench/createBenchRun';
import { tickBenchRun } from '../../sim/bench/tickBenchRun';
import type { BenchInputFrame, BenchRunState, BenchScenarioId } from '../../sim/bench/types';
import { BenchInputAdapter } from '../input/BenchInputAdapter';
import { BenchHud } from '../ui/BenchHud';
import { BenchView } from '../view/BenchView';
import { boundCameraToPlayfield, centreCameraOn, worldToCanvas } from '../view/projection';

const STEP_MS = 1000 / 60;
const MAX_STEPS = 5;
const BENCH_SEED = 7;
const RETURN_TO_TITLE_EVENT = 'dead-mall:return-to-title';

export class BenchScene extends Phaser.Scene {
  public static readonly KEY = 'BenchScene';

  private bench: BenchRunState = createBenchRun('clean-soaker', BENCH_SEED);
  private generation = 1;
  private accumulator = 0;
  private inputAdapter: BenchInputAdapter | undefined;
  private benchView: BenchView | undefined;
  private hud: BenchHud | undefined;
  private removeDebugBridge: (() => void) | undefined;

  public constructor() {
    super(BenchScene.KEY);
  }

  public create(): void {
    this.generation = 1;
    this.bench = this.createInitialRun('clean-soaker');
    this.accumulator = 0;
    this.inputAdapter = new BenchInputAdapter(
      this,
      () => this.handleEscape(),
      () => this.setPaused(true),
    );
    this.benchView = new BenchView(this);
    boundCameraToPlayfield(this);
    this.hud = new BenchHud({
      onConfirm: () => {
        confirmFusion(this.bench);
        this.inputAdapter?.clearHeld();
        this.syncView();
      },
      onCancel: () => {
        cancelFusion(this.bench);
        this.inputAdapter?.clearHeld();
        this.syncView();
      },
      onLatePickup: () => {
        acquireLateModifier(this.bench);
        this.syncView();
      },
      onScenario: (scenarioId) => this.switchScenario(scenarioId),
      onRestart: () => this.restartBench(),
      onReturn: () => this.returnToTitle(),
    });

    if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_BRIDGE === 'true') {
      const removeBridge = installBenchDebugBridge(
        () => this.bench,
        () => this.generation,
      );
      const removeProjection = installWorldToCanvas((x, y) => worldToCanvas(this, x, y));
      this.removeDebugBridge = () => {
        removeProjection();
        removeBridge();
      };
    }

    this.syncView();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyBench, this);
  }

  public update(_time: number, elapsedMs: number): void {
    if (!this.inputAdapter || this.bench.combat.status !== 'playing') {
      this.accumulator = 0;
      this.syncView();
      return;
    }

    const roomBefore = this.bench.activeRoom;
    this.accumulator += Math.min(Math.max(elapsedMs, 0), STEP_MS * MAX_STEPS);
    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < MAX_STEPS) {
      const frame: BenchInputFrame = this.inputAdapter.readFrame();
      tickBenchRun(this.bench, frame);
      this.accumulator -= STEP_MS;
      steps += 1;
      if (this.bench.preview !== null || this.bench.activeRoom !== roomBefore) {
        this.inputAdapter.clearHeld();
        this.bench.heldActions = { interact: false, recall: false };
        break;
      }
    }
    if (steps === MAX_STEPS) {
      this.accumulator = 0;
    }
    this.syncView();
  }

  private handleEscape(): void {
    if (this.bench.preview !== null) {
      cancelFusion(this.bench);
      this.inputAdapter?.clearHeld();
      this.syncView();
      return;
    }
    this.setPaused(!this.bench.paused);
  }

  private setPaused(paused: boolean): void {
    if (this.bench.combat.status !== 'playing' || this.bench.preview !== null) {
      return;
    }
    this.bench.paused = paused;
    this.accumulator = 0;
    this.inputAdapter?.clearHeld();
    this.bench.heldActions = { interact: false, recall: false };
    this.syncView();
  }

  private createInitialRun(scenarioId: BenchScenarioId): BenchRunState {
    const bench = createBenchRun(scenarioId, BENCH_SEED);
    if (!(import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_BRIDGE === 'true')) {
      return bench;
    }
    const fixture = new URLSearchParams(window.location.search).get('fixture');
    if (fixture === 'bench-doorway') {
      bench.combat.player.x = 880;
      bench.combat.player.y = 240;
    }
    return bench;
  }

  private switchScenario(scenarioId: BenchScenarioId): void {
    if (scenarioId === this.bench.scenarioId) {
      this.restartBench();
      return;
    }
    this.generation += 1;
    this.bench = this.createInitialRun(scenarioId);
    this.accumulator = 0;
    this.inputAdapter?.clearHeld();
    this.syncView();
  }

  private restartBench(): void {
    this.generation += 1;
    this.bench = this.createInitialRun(this.bench.scenarioId);
    this.accumulator = 0;
    this.inputAdapter?.clearHeld();
    this.syncView();
  }

  private readonly returnToTitle = (): void => {
    window.dispatchEvent(new CustomEvent(RETURN_TO_TITLE_EVENT));
  };

  private syncView(): void {
    this.benchView?.sync(this.bench);
    this.hud?.sync(this.bench);
    centreCameraOn(this, this.bench.combat.player.x, this.bench.combat.player.y);
  }

  private readonly destroyBench = (): void => {
    this.inputAdapter?.destroy();
    this.inputAdapter = undefined;
    this.benchView?.destroy();
    this.benchView = undefined;
    this.hud?.destroy();
    this.hud = undefined;
    this.removeDebugBridge?.();
    this.removeDebugBridge = undefined;
    this.accumulator = 0;
  };
}
