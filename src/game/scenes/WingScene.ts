import Phaser from 'phaser';
import { installWingDebugBridge } from '../../debug/DebugBridge';
import { createWingRun } from '../../sim/shop/createWingRun';
import {
  clearWingHeldActions,
  tickWingRun,
  type WingInputFrame,
} from '../../sim/shop/tickWingRun';
import { itemDefinitionName, type WingState } from '../../sim/shop/types';
import { WingInputAdapter } from '../input/WingInputAdapter';
import { WingHud } from '../ui/WingHud';
import { WingView } from '../view/WingView';

const STEP_MS = 1000 / 60;
const MAX_STEPS = 5;
const WING_SEED = 0;
const RETURN_TO_TITLE_EVENT = 'dead-mall:return-to-title';

export class WingScene extends Phaser.Scene {
  public static readonly KEY = 'WingScene';

  private wing: WingState = createWingRun(WING_SEED);
  private generation = 1;
  private accumulator = 0;
  private inputAdapter: WingInputAdapter | undefined;
  private wingView: WingView | undefined;
  private hud: WingHud | undefined;
  private removeDebugBridge: (() => void) | undefined;

  public constructor() {
    super(WingScene.KEY);
  }

  public create(): void {
    this.generation = 1;
    this.wing = this.createInitialRun();
    this.accumulator = 0;
    this.inputAdapter = new WingInputAdapter(
      this,
      () => this.setPaused(!this.wing.paused),
      () => this.setPaused(true),
    );
    this.wingView = new WingView(this);
    this.hud = new WingHud(this.restartLoop, this.returnToTitle);

    if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_BRIDGE === 'true') {
      this.removeDebugBridge = installWingDebugBridge(
        () => this.wing,
        () => this.generation,
      );
    }

    this.syncView();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroyWing, this);
  }

  public update(_time: number, elapsedMs: number): void {
    if (!this.inputAdapter || this.wing.paused || this.wing.status !== 'shopping') {
      this.accumulator = 0;
      this.syncView();
      return;
    }

    this.accumulator += Math.min(Math.max(elapsedMs, 0), STEP_MS * MAX_STEPS);
    let steps = 0;
    let frame: WingInputFrame = { moveX: 0, moveY: 0, interact: false, steal: false };
    while (this.accumulator >= STEP_MS && steps < MAX_STEPS) {
      frame = this.inputAdapter.readFrame();
      tickWingRun(this.wing, frame);
      this.accumulator -= STEP_MS;
      steps += 1;
    }
    if (steps === MAX_STEPS) {
      this.accumulator = 0;
    }
    this.syncView();
  }

  private setPaused(paused: boolean): void {
    this.wing.paused = paused;
    this.accumulator = 0;
    this.inputAdapter?.clearHeld();
    clearWingHeldActions(this.wing);
    this.syncView();
  }

  private createInitialRun(): WingState {
    const wing = createWingRun(WING_SEED);
    if (!(import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_BRIDGE === 'true')) {
      return wing;
    }

    const fixture = new URLSearchParams(window.location.search).get('fixture');
    if (fixture === 'm3-buy-proof' || fixture === 'm3-steal-proof') {
      wing.player.x = 340;
      wing.player.y = 262;
    } else if (fixture === 'm3-caught-proof') {
      const runtime = wing.offers.find((offer) => offer.id === 'homestyle-mop');
      if (runtime) {
        runtime.status = 'carried';
      }
      wing.carried = {
        itemDefinitionId: 'janitor_mop',
        sourceStoreId: 'homestyle',
        sourceOfferId: 'homestyle-mop',
        startedTick: 0,
      };
      wing.suspicion = 99;
      wing.player.x = 240;
      wing.player.y = 150;
      wing.recentChange = `Stole ${itemDefinitionName(wing, 'janitor_mop')} from Homestyle Goods.`;
    } else if (fixture === 'm3-exit-proof') {
      const purchased = wing.offers.find((offer) => offer.id === 'homestyle-mop');
      const stolen = wing.offers.find((offer) => offer.id === 'future-nozzle');
      if (purchased) {
        purchased.status = 'consumed';
      }
      if (stolen) {
        stolen.status = 'consumed';
      }
      wing.inventory.push(
        {
          instanceId: 'wing-item-1',
          itemDefinitionId: 'janitor_mop',
          acquisitionKind: 'purchased',
          sourceStoreId: 'homestyle',
          sourceOfferId: 'homestyle-mop',
          acquisitionTick: 10,
        },
        {
          instanceId: 'wing-item-2',
          itemDefinitionId: 'wide_nozzle',
          acquisitionKind: 'stolen',
          sourceStoreId: 'future',
          sourceOfferId: 'future-nozzle',
          acquisitionTick: 40,
        },
      );
      wing.cash = 20;
      wing.heat = 15;
      wing.nextInstanceId = 3;
      wing.nextEventId = 3;
      wing.player.x = 480;
      wing.player.y = 430;
      wing.recentChange = 'Fixture ready near the mall exit.';
      wing.behaviorTrace.push(
        '[t10] Bought Associate-Issue Mop from Homestyle Goods for $10.',
        '[t40] Secured Wide-Bore Nozzle from Future Hobby.',
      );
    }
    return wing;
  }

  private readonly restartLoop = (): void => {
    this.generation += 1;
    this.wing = this.createInitialRun();
    this.accumulator = 0;
    this.inputAdapter?.clearHeld();
    this.syncView();
  };

  private readonly returnToTitle = (): void => {
    window.dispatchEvent(new CustomEvent(RETURN_TO_TITLE_EVENT));
  };

  private syncView(): void {
    this.wingView?.sync(this.wing);
    this.hud?.sync(this.wing);
  }

  private readonly destroyWing = (): void => {
    this.inputAdapter?.destroy();
    this.inputAdapter = undefined;
    this.wingView?.destroy();
    this.wingView = undefined;
    this.hud?.destroy();
    this.hud = undefined;
    this.removeDebugBridge?.();
    this.removeDebugBridge = undefined;
    this.accumulator = 0;
  };
}
