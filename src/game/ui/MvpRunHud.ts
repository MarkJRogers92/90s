/**
 * DOM presentation for the M5 MVP run.
 *
 * The HUD renders what the authoritative simulation already computed: the
 * run seed, room identity and objective, health, economy, carried thefts,
 * provenance-bearing inventory, the compiled primary, the nearby
 * interaction, boss state, checkpoint status, and the terminal summary. It
 * never infers success; command outcomes arrive as sim feedback text.
 */
import { bossPhaseForHealth } from '../../sim/combat/boss';
import {
  BOSS_PORTRAIT_KIND,
  PORTRAIT_ART,
  PORTRAIT_EXPRESSION_SIZE,
  PORTRAIT_SHEET_WIDTH,
  bossPortraitExpression,
  portraitExpressionFrame,
} from '../portraits';
import {
  itemDefinitionName,
  runCarryLimit,
  runOfferPrice,
  runOfferPriceLabel,
} from '../../sim/run/economy';
import { canOpenRunFusionPreview } from '../../sim/run/bench';
import { nearestMvpInteraction } from '../../sim/run/tickMvpRun';
import type { MvpRunState } from '../../sim/run/types';
import type { EnemyState } from '../../sim/model';

const TERMINAL_PROMPT = 'RUN COMPLETE — RESTART OR RETURN';
const PAUSED_PROMPT = 'PAUSED — PRESS ESC TO RESUME';
const PREVIEW_PROMPT = 'FUSION PREVIEW OPEN — CONFIRM OR CANCEL';

/**
 * The movement and action prompt for a live shift.
 *
 * `R RECALL` is advertised only while a fused car actually exists, because
 * recall is refused until Emitter Mount fusion. The car line reports what the
 * car is doing instead of promising a key that would do nothing.
 */
function movementControls(state: MvpRunState): string {
  const parts = ['WASD MOVE', 'POINTER AIM', 'CLICK ATTACK', 'E INTERACT', 'F STEAL'];
  if (state.carrier !== null) {
    parts.push(state.carrier.mode === 'emitter' ? 'R RECALL' : 'CAR FOLLOWS');
  }
  parts.push('ESC PAUSE');
  return parts.join(' · ');
}

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`MvpRun HUD markup is incomplete: missing ${selector}.`);
  }
  return element;
}

/**
 * The boss line the HUD renders.
 *
 * The phase is the simulation's own `bossPhase`, never a second computation,
 * so the HUD cannot disagree with the authoritative phase mid-fight. The
 * health-derived phase is only a fallback for a boss that has not ticked yet.
 */
export function bossHudParts(boss: EnemyState): string[] {
  const bossPhase = boss.bossPhase ?? bossPhaseForHealth(boss.health);
  const parts = [`BOSS: phase ${bossPhase} · HP ${boss.health}/60`];
  if (boss.phase === 'telegraph') {
    parts.push('SLAM WIND-UP');
  }
  const volleyTicks = boss.bossVolleyTelegraphTicks ?? 0;
  if (volleyTicks > 0) {
    parts.push(`VOLLEY INCOMING (${volleyTicks})`);
  }
  if (boss.bossSummoned === true) {
    parts.push('BACKUP CALLED');
  }
  return parts;
}

export class MvpRunHud {
  private readonly root: HTMLElement;
  private readonly seed: HTMLElement;
  private readonly room: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly health: HTMLElement;
  private readonly cash: HTMLElement;
  private readonly heat: HTMLElement;
  private readonly suspicion: HTMLElement;
  private readonly boss: HTMLElement;
  private readonly bossPortrait: HTMLElement;
  private readonly bossFace: HTMLElement;
  private readonly bossExpression: HTMLElement;
  private readonly nearby: HTMLElement;
  private readonly carried: HTMLElement;
  private readonly inventory: HTMLElement;
  private readonly primary: HTMLElement;
  private readonly carrierLine: HTMLElement;
  private readonly trace: HTMLElement;
  private readonly offers: HTMLElement;
  private readonly bench: HTMLElement;
  private readonly benchIngredients: HTMLElement;
  private readonly benchFee: HTMLElement;
  private readonly benchOperation: HTMLElement;
  private readonly benchRetained: HTMLElement;
  private readonly benchExcluded: HTMLElement;
  private readonly benchNotice: HTMLElement;
  private readonly checkpoint: HTMLElement;
  private readonly recent: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly returnButton: HTMLButtonElement;
  private readonly confirmFusionButton: HTMLButtonElement;
  private readonly cancelFusionButton: HTMLButtonElement;
  private readonly muteButton: HTMLButtonElement;
  private readonly onRestart: () => void;
  private readonly onReturn: () => void;
  private readonly onConfirmFusion: () => void;
  private readonly onCancelFusion: () => void;
  private readonly onToggleMute: () => boolean;
  private readonly offerCards = new Map<string, HTMLElement>();

  public constructor(
    onRestart: () => void,
    onReturn: () => void,
    onConfirmFusion: () => void,
    onCancelFusion: () => void,
    onToggleMute: () => boolean,
  ) {
    this.root = requireElement<HTMLElement>('#mvp-run-hud');
    this.seed = requireElement<HTMLElement>('#mvp-run-seed');
    this.room = requireElement<HTMLElement>('#mvp-run-room');
    this.objective = requireElement<HTMLElement>('#mvp-run-objective');
    this.health = requireElement<HTMLElement>('#mvp-run-health');
    this.cash = requireElement<HTMLElement>('#mvp-run-cash');
    this.heat = requireElement<HTMLElement>('#mvp-run-heat');
    this.suspicion = requireElement<HTMLElement>('#mvp-run-suspicion');
    this.boss = requireElement<HTMLElement>('#mvp-run-boss');
    this.bossPortrait = requireElement<HTMLElement>('#mvp-run-boss-portrait');
    this.bossFace = requireElement<HTMLElement>('#mvp-run-boss-face');
    this.bossExpression = requireElement<HTMLElement>('#mvp-run-boss-expression');
    this.nearby = requireElement<HTMLElement>('#mvp-run-nearby');
    this.carried = requireElement<HTMLElement>('#mvp-run-carried');
    this.inventory = requireElement<HTMLElement>('#mvp-run-inventory');
    this.primary = requireElement<HTMLElement>('#mvp-run-primary');
    this.carrierLine = requireElement<HTMLElement>('#mvp-run-carrier');
    this.trace = requireElement<HTMLElement>('#mvp-run-trace');
    this.offers = requireElement<HTMLElement>('#mvp-run-offers');
    this.bench = requireElement<HTMLElement>('#mvp-run-bench');
    this.benchIngredients = requireElement<HTMLElement>('#mvp-run-bench-ingredients');
    this.benchFee = requireElement<HTMLElement>('#mvp-run-bench-fee');
    this.benchOperation = requireElement<HTMLElement>('#mvp-run-bench-operation');
    this.benchRetained = requireElement<HTMLElement>('#mvp-run-bench-retained');
    this.benchExcluded = requireElement<HTMLElement>('#mvp-run-bench-excluded');
    this.benchNotice = requireElement<HTMLElement>('#mvp-run-bench-notice');
    this.checkpoint = requireElement<HTMLElement>('#mvp-run-checkpoint');
    this.recent = requireElement<HTMLElement>('#mvp-run-recent');
    this.summary = requireElement<HTMLElement>('#mvp-run-summary');
    this.controls = requireElement<HTMLElement>('#mvp-run-controls');
    this.restartButton = requireElement<HTMLButtonElement>('#mvp-restart-run');
    this.returnButton = requireElement<HTMLButtonElement>('#mvp-return');
    this.confirmFusionButton = requireElement<HTMLButtonElement>('#mvp-bench-confirm');
    this.cancelFusionButton = requireElement<HTMLButtonElement>('#mvp-bench-cancel');
    this.muteButton = requireElement<HTMLButtonElement>('#mvp-toggle-sound');
    this.onRestart = onRestart;
    this.onReturn = onReturn;
    this.onConfirmFusion = onConfirmFusion;
    this.onCancelFusion = onCancelFusion;
    this.onToggleMute = onToggleMute;
    this.restartButton.addEventListener('click', this.onRestart);
    this.returnButton.addEventListener('click', this.onReturn);
    this.confirmFusionButton.addEventListener('click', this.onConfirmFusion);
    this.cancelFusionButton.addEventListener('click', this.onCancelFusion);
    this.muteButton.addEventListener('click', this.handleToggleMute);
    this.syncMuteLabel(false);
  }

  /**
   * Flips the sound switch and relabels the button.
   *
   * Public because both entry points route through here — the button click and
   * the M key — so the label can never disagree with the engine's mute state.
   */
  public toggleMute(): void {
    this.syncMuteLabel(this.onToggleMute());
  }

  private readonly handleToggleMute = (): void => {
    this.toggleMute();
  };

  /** The button states what the sound is doing, not what clicking would do. */
  private syncMuteLabel(muted: boolean): void {
    this.muteButton.textContent = muted ? 'SOUND: OFF (M)' : 'SOUND: ON (M)';
    this.muteButton.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }

  public sync(state: MvpRunState, checkpointStatus: string): void {
    this.root.hidden = false;
    const room = state.wing.rooms[state.roomIndex];
    this.seed.textContent = `seed ${state.seed}`;
    this.room.textContent = room
      ? `${room.name} (${state.roomIndex + 1} / ${state.wing.rooms.length})`
      : '—';
    this.objective.textContent = `OBJECTIVE: ${this.objectiveText(state)}`;

    const health = state.room.combat.player.health;
    this.health.textContent = `${health} / 6`;
    this.cash.textContent = `$${state.cash}`;
    this.heat.textContent = `HEAT ${state.heat}`;
    this.suspicion.textContent = `SUSPICION ${Math.floor(state.suspicion)}`;

    this.syncBoss(state);
    this.syncInteraction(state);
    this.syncEconomy(state);
    this.syncCarrier(state);
    this.syncBench(state);
    this.syncOffers(state);

    this.checkpoint.textContent = `CHECKPOINT: ${checkpointStatus}`;
    const recent =
      state.recentChange.length > 0 ? state.recentChange : (state.behaviorTrace.at(-1) ?? 'none yet');
    this.recent.textContent = `RECENT: ${recent}`;

    this.syncSummary(state);
  }

  private objectiveText(state: MvpRunState): string {
    if (state.status === 'won') {
      return 'Shift survived.';
    }
    if (state.status === 'dead') {
      return 'Shift ended.';
    }
    const room = state.wing.rooms[state.roomIndex];
    if (!room) {
      return '—';
    }
    const living = state.room.combat.enemies.filter((enemy) => enemy.health > 0);
    const boss = living.find((enemy) => enemy.kind === 'lp_manager');
    if (boss) {
      return 'Defeat the Loss Prevention Manager.';
    }
    if (living.length > 0) {
      return `Clear the room (${living.length} enemies left).`;
    }
    const available = room.offers.filter(
      (offer) => (state.offerStatus[offer.id] ?? 'available') === 'available',
    );
    if (room.store && available.length > 0) {
      return 'Shop the offers (E buy · F steal) or move on.';
    }
    if (state.roomIndex < state.wing.rooms.length - 1) {
      return 'Head east to continue the shift.';
    }
    return '—';
  }

  private syncBoss(state: MvpRunState): void {
    const boss = state.room.combat.enemies.find((enemy) => enemy.kind === 'lp_manager');
    if (!boss || state.status !== 'playing') {
      this.boss.hidden = true;
      this.boss.textContent = '';
      this.bossPortrait.hidden = true;
      this.bossFace.style.backgroundImage = '';
      this.bossExpression.textContent = '';
      return;
    }
    this.boss.hidden = false;
    this.boss.textContent = bossHudParts(boss).join(' · ');

    // The face tracks the same authoritative state as the line above it, so the
    // expression and the text cannot disagree mid-fight.
    const expression = bossPortraitExpression(boss);
    const art = PORTRAIT_ART[BOSS_PORTRAIT_KIND];
    this.bossPortrait.hidden = false;
    this.bossFace.style.backgroundImage = `url(${art.expressionUrl})`;
    this.bossFace.style.backgroundPosition =
      `-${portraitExpressionFrame(expression) * PORTRAIT_EXPRESSION_SIZE * 2}px 0`;
    this.bossExpression.textContent = `LOSS PREVENTION // ${expression}`;
  }

  private syncInteraction(state: MvpRunState): void {
    const interaction =
      state.status === 'playing' ? nearestMvpInteraction(state) : { kind: 'none', label: '—' } as const;
    this.nearby.textContent = `NEARBY: ${interaction.label}`;

    if (state.status !== 'playing') {
      this.controls.textContent = TERMINAL_PROMPT;
    } else if (state.preview !== null) {
      this.controls.textContent = PREVIEW_PROMPT;
    } else if (state.paused) {
      this.controls.textContent = PAUSED_PROMPT;
    } else if (interaction.kind === 'door' && interaction.locked) {
      this.controls.textContent = interaction.lockedReason ?? movementControls(state);
    } else if (interaction.kind === 'bench') {
      // Never advertise a key the sim would refuse: without an owned carrier the
      // kiosk has no proposal to offer, so the prompt says what is missing.
      this.controls.textContent = canOpenRunFusionPreview(state)
        ? 'E PREVIEW FUSION · ' + movementControls(state)
        : 'BENCH WARRANT NEEDS AN OWNED EMITTER CARRIER · ' + movementControls(state);
    } else if (interaction.kind === 'offer') {
      this.controls.textContent = 'E BUY · F STEAL · ' + movementControls(state);
    } else {
      this.controls.textContent = movementControls(state);
    }
  }

  /** What the Remote-Control Car is doing, or that the shift owns none. */
  private syncCarrier(state: MvpRunState): void {
    const carrier = state.carrier;
    if (carrier === null) {
      this.carrierLine.textContent = 'CAR: none owned';
      return;
    }
    if (carrier.mode === 'emitter') {
      const leashState = carrier.recalling ? 'returning on recall' : 'steered by the pointer';
      this.carrierLine.textContent =
        `CAR: fused emitter mount — ${leashState}; shots fire from the car`;
      return;
    }
    this.carrierLine.textContent =
      'CAR: independent — seeks and bumps nearby enemies; fuse it to fire from it';
  }

  /**
   * The Bench Warrant preview.
   *
   * Every line is read from the simulation's own proposal, so the panel cannot
   * describe a fee or an ingredient set the commit would not honour. Confirm
   * and cancel are the only actions; the sim revalidates on commit.
   */
  private syncBench(state: MvpRunState): void {
    const preview = state.preview;
    if (preview === null) {
      this.bench.hidden = true;
      return;
    }
    this.bench.hidden = false;
    // A terminal run can still be cancelled but never committed, so the confirm
    // button must not look available while the sim would refuse it.
    this.confirmFusionButton.disabled = state.status !== 'playing';
    this.benchIngredients.textContent =
      `INGREDIENTS: ${preview.primaryName} (${preview.primaryProvenance}) + ` +
      `${preview.carrierName} (${preview.carrierProvenance})`;
    this.benchFee.textContent =
      `FEE: $${preview.fee} (base $${preview.baseFee} − clean discount $${preview.cleanDiscount})` +
      ` · CASH $${state.cash}`;
    this.benchOperation.textContent =
      `RESULT: attack origin ${preview.operation.attackOrigin} · steering ` +
      `${preview.operation.steering} · recall ${preview.operation.recallKey} · ` +
      `${preview.operation.lostBehavior} lost`;
    this.benchRetained.textContent =
      `RETAINED: ${preview.retainedInstanceIds.join(', ') || 'nothing else'}`;
    this.benchExcluded.textContent = `EXCLUDED: ${preview.excludedNotes.join(' ')}`;
    this.benchNotice.textContent = preview.irreversibilityNotice;
  }

  private syncEconomy(state: MvpRunState): void {
    if (state.carried.length === 0) {
      this.carried.textContent = 'CARRIED: none';
    } else {
      const names = state.carried.map(
        (theft) => `${itemDefinitionName(theft.itemDefinitionId)} (stolen — leave the store to secure it)`,
      );
      this.carried.textContent = `CARRIED: ${names.join(' · ')}`;
    }

    const parts: string[] = [];
    let purchased = 0;
    let stolen = 0;
    for (const node of state.inventory.inventory) {
      if (node.kind === 'leaf') {
        if (node.acquisitionKind === 'purchased') {
          purchased += 1;
        } else {
          stolen += 1;
        }
        parts.push(
          `${itemDefinitionName(node.itemDefinitionId)} (${node.acquisitionKind} · ${node.sourceLocationId})`,
        );
      } else {
        if (node.primary.acquisitionKind === 'purchased') {
          purchased += 1;
        } else {
          stolen += 1;
        }
        if (node.carrier.acquisitionKind === 'purchased') {
          purchased += 1;
        } else {
          stolen += 1;
        }
        parts.push(
          `${itemDefinitionName(node.primary.itemDefinitionId)} + ${itemDefinitionName(node.carrier.itemDefinitionId)} (fused ${node.primary.acquisitionKind}/${node.carrier.acquisitionKind})`,
        );
      }
    }
    this.inventory.textContent =
      `SECURED: purchased ${purchased} · stolen ${stolen}` +
      (parts.length > 0 ? ` — ${parts.join(' · ')}` : '');

    const compiled = state.room.combat.compiledLoadout;
    const compiledTrace = compiled.trace.at(-1) ?? 'no compiled steps yet';
    this.primary.textContent =
      `PRIMARY: ${compiled.primary.name} (${compiled.primary.definitionId}) — ${compiledTrace}`;
    const behavior = state.behaviorTrace.slice(-3);
    this.trace.textContent = `TRACE: ${behavior.length > 0 ? behavior.join(' | ') : 'none yet'}`;
  }

  private syncOffers(state: MvpRunState): void {
    const room = state.wing.rooms[state.roomIndex];
    const seen = new Set<string>();
    if (room?.store) {
      const carryLimit = runCarryLimit(state);
      for (const offer of room.offers) {
        seen.add(offer.id);
        let card = this.offerCards.get(offer.id);
        if (!card) {
          card = document.createElement('li');
          card.className = 'mvp-run-offer';
          card.setAttribute('data-testid', 'mvp-run-offer');
          const name = document.createElement('p');
          name.className = 'mvp-run-offer-name';
          const meta = document.createElement('p');
          meta.className = 'mvp-run-offer-meta';
          const status = document.createElement('p');
          status.className = 'mvp-run-offer-status';
          card.append(name, meta, status);
          this.offerCards.set(offer.id, card);
          this.offers.append(card);
        }
        const price = runOfferPrice(state, offer);
        const offerStatus = state.offerStatus[offer.id] ?? 'available';
        const name = card.querySelector('.mvp-run-offer-name');
        const meta = card.querySelector('.mvp-run-offer-meta');
        const status = card.querySelector('.mvp-run-offer-status');
        if (name) {
          name.textContent = itemDefinitionName(offer.itemDefinitionId);
        }
        if (meta) {
          meta.textContent = `${runOfferPriceLabel(state, offer)} · ${room.store.name}`;
        }
        if (status) {
          if (offerStatus === 'carried') {
            status.textContent = 'CARRIED';
          } else if (offerStatus === 'consumed') {
            status.textContent = 'GONE';
          } else if (state.cash < price) {
            status.textContent = `AVAILABLE — needs $${price} (short $${price - state.cash})`;
          } else if (state.carried.length >= carryLimit) {
            status.textContent = 'AVAILABLE — hands full, secure the carried item first';
          } else {
            status.textContent = 'AVAILABLE';
          }
        }
      }
    }
    for (const [offerId, card] of [...this.offerCards]) {
      if (!seen.has(offerId)) {
        card.remove();
        this.offerCards.delete(offerId);
      }
    }
  }

  private syncSummary(state: MvpRunState): void {
    if (state.status === 'playing' || !state.summary) {
      this.summary.hidden = true;
      this.summary.textContent = '';
      return;
    }
    this.summary.hidden = false;
    this.summary.textContent = '';
    const summary = state.summary;
    const title = document.createElement('h2');
    title.textContent = summary.status === 'won' ? 'Night shift survived' : 'Shift ended';
    const totals = document.createElement('p');
    totals.textContent =
      `SEED ${summary.seed} · ROOM ${summary.roomIndex + 1} · CLEARED ${summary.roomsCleared} · ` +
      `CASH $${summary.cash} · HEAT ${summary.heat}`;
    const purchased = document.createElement('p');
    purchased.textContent =
      `purchased (${summary.purchasedInstanceIds.length}): ${this.instanceNames(state, summary.purchasedInstanceIds)}`;
    const stolen = document.createElement('p');
    stolen.textContent =
      `stolen (${summary.stolenInstanceIds.length}): ${this.instanceNames(state, summary.stolenInstanceIds)}`;
    this.summary.append(title, totals, purchased, stolen);
  }

  /**
   * Readable names for a summary's instance IDs.
   *
   * The summary deliberately carries IDs, not labels, so the HUD resolves them
   * against the inventory it already renders rather than printing raw IDs like
   * `mvp-purchased-mall-mart-receipt_wallet` at the player.
   */
  private instanceNames(state: MvpRunState, instanceIds: readonly string[]): string {
    if (instanceIds.length === 0) {
      return 'none';
    }
    return instanceIds
      .map((instanceId) => {
        for (const node of state.inventory.inventory) {
          if (node.kind === 'leaf') {
            if (node.instanceId === instanceId) {
              return itemDefinitionName(node.itemDefinitionId);
            }
            continue;
          }
          if (node.primary.instanceId === instanceId) {
            return itemDefinitionName(node.primary.itemDefinitionId);
          }
          if (node.carrier.instanceId === instanceId) {
            return itemDefinitionName(node.carrier.itemDefinitionId);
          }
        }
        return instanceId;
      })
      .join(', ');
  }

  public destroy(): void {
    this.restartButton.removeEventListener('click', this.onRestart);
    this.returnButton.removeEventListener('click', this.onReturn);
    this.confirmFusionButton.removeEventListener('click', this.onConfirmFusion);
    this.cancelFusionButton.removeEventListener('click', this.onCancelFusion);
    this.muteButton.removeEventListener('click', this.handleToggleMute);
    this.offerCards.clear();
    this.offers.textContent = '';
    this.bench.hidden = true;
  }
}
