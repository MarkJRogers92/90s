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
  itemDefinitionName,
  runCarryLimit,
  runOfferPrice,
  runOfferPriceLabel,
} from '../../sim/run/economy';
import { nearestMvpInteraction } from '../../sim/run/tickMvpRun';
import type { MvpRunState } from '../../sim/run/types';
import type { EnemyState } from '../../sim/model';

const TERMINAL_PROMPT = 'RUN COMPLETE — RESTART OR RETURN';
const PAUSED_PROMPT = 'PAUSED — PRESS ESC TO RESUME';
const CONTROLS_PROMPT =
  'WASD MOVE · POINTER AIM · CLICK ATTACK · E INTERACT · F STEAL · R RECALL · ESC PAUSE';

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
  private readonly nearby: HTMLElement;
  private readonly carried: HTMLElement;
  private readonly inventory: HTMLElement;
  private readonly primary: HTMLElement;
  private readonly trace: HTMLElement;
  private readonly offers: HTMLElement;
  private readonly checkpoint: HTMLElement;
  private readonly recent: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly returnButton: HTMLButtonElement;
  private readonly onRestart: () => void;
  private readonly onReturn: () => void;
  private readonly offerCards = new Map<string, HTMLElement>();

  public constructor(onRestart: () => void, onReturn: () => void) {
    this.root = requireElement<HTMLElement>('#mvp-run-hud');
    this.seed = requireElement<HTMLElement>('#mvp-run-seed');
    this.room = requireElement<HTMLElement>('#mvp-run-room');
    this.objective = requireElement<HTMLElement>('#mvp-run-objective');
    this.health = requireElement<HTMLElement>('#mvp-run-health');
    this.cash = requireElement<HTMLElement>('#mvp-run-cash');
    this.heat = requireElement<HTMLElement>('#mvp-run-heat');
    this.suspicion = requireElement<HTMLElement>('#mvp-run-suspicion');
    this.boss = requireElement<HTMLElement>('#mvp-run-boss');
    this.nearby = requireElement<HTMLElement>('#mvp-run-nearby');
    this.carried = requireElement<HTMLElement>('#mvp-run-carried');
    this.inventory = requireElement<HTMLElement>('#mvp-run-inventory');
    this.primary = requireElement<HTMLElement>('#mvp-run-primary');
    this.trace = requireElement<HTMLElement>('#mvp-run-trace');
    this.offers = requireElement<HTMLElement>('#mvp-run-offers');
    this.checkpoint = requireElement<HTMLElement>('#mvp-run-checkpoint');
    this.recent = requireElement<HTMLElement>('#mvp-run-recent');
    this.summary = requireElement<HTMLElement>('#mvp-run-summary');
    this.controls = requireElement<HTMLElement>('#mvp-run-controls');
    this.restartButton = requireElement<HTMLButtonElement>('#mvp-restart-run');
    this.returnButton = requireElement<HTMLButtonElement>('#mvp-return');
    this.onRestart = onRestart;
    this.onReturn = onReturn;
    this.restartButton.addEventListener('click', this.onRestart);
    this.returnButton.addEventListener('click', this.onReturn);
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
      return;
    }
    this.boss.hidden = false;
    this.boss.textContent = bossHudParts(boss).join(' · ');
  }

  private syncInteraction(state: MvpRunState): void {
    const interaction =
      state.status === 'playing' ? nearestMvpInteraction(state) : { kind: 'none', label: '—' } as const;
    this.nearby.textContent = `NEARBY: ${interaction.label}`;

    if (state.status !== 'playing') {
      this.controls.textContent = TERMINAL_PROMPT;
    } else if (state.paused) {
      this.controls.textContent = PAUSED_PROMPT;
    } else if (interaction.kind === 'door' && interaction.locked) {
      this.controls.textContent = interaction.lockedReason ?? CONTROLS_PROMPT;
    } else if (interaction.kind === 'offer') {
      this.controls.textContent = 'E BUY · F STEAL · ' + CONTROLS_PROMPT;
    } else {
      this.controls.textContent = CONTROLS_PROMPT;
    }
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
      `purchased (${summary.purchasedInstanceIds.length}): ${summary.purchasedInstanceIds.join(', ') || 'none'}`;
    const stolen = document.createElement('p');
    stolen.textContent =
      `stolen (${summary.stolenInstanceIds.length}): ${summary.stolenInstanceIds.join(', ') || 'none'}`;
    this.summary.append(title, totals, purchased, stolen);
  }

  public destroy(): void {
    this.restartButton.removeEventListener('click', this.onRestart);
    this.returnButton.removeEventListener('click', this.onReturn);
    this.offerCards.clear();
    this.offers.textContent = '';
  }
}
