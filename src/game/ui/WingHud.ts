import { nearestAvailableOffer } from '../../sim/shop/tickWingRun';
import {
  WING_INTERACTION_RANGE,
  itemDefinitionName,
  type WingState,
} from '../../sim/shop/types';

const HOMESTYLE_STORE_ID = 'homestyle';
const FUTURE_STORE_ID = 'future';

function storeDisplayName(storeId: string): string {
  if (storeId === HOMESTYLE_STORE_ID) {
    return 'Homestyle';
  }
  if (storeId === FUTURE_STORE_ID) {
    return 'Future Hobby';
  }
  return storeId;
}

function distanceToRect(pointX: number, pointY: number, rect: { x: number; y: number; width: number; height: number }): number {
  const closestX = Math.max(rect.x, Math.min(pointX, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(pointY, rect.y + rect.height));
  return Math.hypot(pointX - closestX, pointY - closestY);
}

export class WingHud {
  private readonly root: HTMLElement;
  private readonly cash: HTMLElement;
  private readonly heat: HTMLElement;
  private readonly inventory: HTMLElement;
  private readonly nearby: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly carried: HTMLElement;
  private readonly suspicion: HTMLElement;
  private readonly feedback: HTMLElement;
  private readonly homestyleOffers: HTMLElement;
  private readonly futureOffers: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly returnButton: HTMLButtonElement;
  private readonly onRestart: () => void;
  private readonly onReturn: () => void;
  private readonly offerCards = new Map<string, HTMLElement>();

  public constructor(onRestart: () => void, onReturn: () => void) {
    const root = document.querySelector<HTMLElement>('#wing-hud');
    const cash = document.querySelector<HTMLElement>('#wing-cash');
    const heat = document.querySelector<HTMLElement>('#wing-heat');
    const inventory = document.querySelector<HTMLElement>('#wing-inventory');
    const nearby = document.querySelector<HTMLElement>('#wing-nearby');
    const prompt = document.querySelector<HTMLElement>('#wing-prompt');
    const carried = document.querySelector<HTMLElement>('#wing-carried');
    const suspicion = document.querySelector<HTMLElement>('#wing-suspicion');
    const feedback = document.querySelector<HTMLElement>('#wing-feedback');
    const homestyleOffers = document.querySelector<HTMLElement>('#wing-store-homestyle-offers');
    const futureOffers = document.querySelector<HTMLElement>('#wing-store-future-offers');
    const summary = document.querySelector<HTMLElement>('#wing-summary');
    const restartButton = document.querySelector<HTMLButtonElement>('#restart-loop');
    const returnButton = document.querySelector<HTMLButtonElement>('#return-to-title');
    if (
      !root ||
      !cash ||
      !heat ||
      !inventory ||
      !nearby ||
      !prompt ||
      !carried ||
      !suspicion ||
      !feedback ||
      !homestyleOffers ||
      !futureOffers ||
      !summary ||
      !restartButton ||
      !returnButton
    ) {
      throw new Error('Wing HUD markup is incomplete.');
    }
    this.root = root;
    this.cash = cash;
    this.heat = heat;
    this.inventory = inventory;
    this.nearby = nearby;
    this.prompt = prompt;
    this.carried = carried;
    this.suspicion = suspicion;
    this.feedback = feedback;
    this.homestyleOffers = homestyleOffers;
    this.futureOffers = futureOffers;
    this.summary = summary;
    this.restartButton = restartButton;
    this.returnButton = returnButton;
    this.onRestart = onRestart;
    this.onReturn = onReturn;
    this.restartButton.addEventListener('click', this.onRestart);
    this.returnButton.addEventListener('click', this.onReturn);
  }

  public sync(state: WingState): void {
    this.root.hidden = false;
    this.cash.textContent = `$${state.cash}`;
    this.heat.textContent = `HEAT ${state.heat}`;
    const purchased = state.inventory.filter((item) => item.acquisitionKind === 'purchased').length;
    const stolen = state.inventory.filter((item) => item.acquisitionKind === 'stolen').length;
    this.inventory.textContent = `PURCHASED ${purchased} · STOLEN ${stolen}`;

    const offer = state.status === 'shopping' ? nearestAvailableOffer(state) : undefined;
    const nearExit =
      state.status === 'shopping' &&
      distanceToRect(state.player.x, state.player.y, state.wing.mallExit.bounds) <=
        WING_INTERACTION_RANGE;
    if (offer) {
      const name = itemDefinitionName(state, offer.itemDefinitionId);
      this.nearby.textContent = `NEARBY: ${name} — $${offer.price}`;
    } else if (nearExit) {
      this.nearby.textContent = `NEARBY: ${state.wing.mallExit.label}`;
    } else {
      this.nearby.textContent = 'NEARBY: —';
    }

    if (state.status !== 'shopping') {
      this.prompt.textContent = 'LOOP COMPLETE — RESTART OR RETURN';
    } else if (state.paused) {
      this.prompt.textContent = 'PAUSED — PRESS ESC TO RESUME';
    } else if (offer) {
      this.prompt.textContent = `[E] Buy $${offer.price} · [F] Steal`;
    } else if (nearExit) {
      this.prompt.textContent = '[E] Leave';
    } else {
      this.prompt.textContent = 'WASD MOVE · E BUY · F STEAL · ESC PAUSE';
    }

    if (state.carried) {
      const name = itemDefinitionName(state, state.carried.itemDefinitionId);
      this.carried.hidden = false;
      this.carried.textContent = `CARRIED: ${name} (stolen — leave the store to secure it)`;
      this.suspicion.hidden = false;
      this.suspicion.textContent = `SUSPICION ${Math.floor(state.suspicion)}`;
    } else {
      this.carried.hidden = true;
      this.carried.textContent = '';
      this.suspicion.hidden = true;
      this.suspicion.textContent = '';
    }

    const recent = state.recentChange.length > 0 ? state.recentChange : state.behaviorTrace.at(-1) ?? 'none yet';
    const feedbackText = `RECENT: ${recent}`;
    if (this.feedback.textContent !== feedbackText) {
      this.feedback.textContent = feedbackText;
    }

    this.syncOffers(state);
    this.syncSummary(state);
  }

  private syncOffers(state: WingState): void {
    for (const offer of state.offers) {
      let card = this.offerCards.get(offer.id);
      if (!card) {
        card = document.createElement('li');
        card.className = 'wing-offer';
        card.setAttribute('data-testid', 'wing-offer');
        const name = document.createElement('p');
        name.className = 'wing-offer-name';
        const meta = document.createElement('p');
        meta.className = 'wing-offer-meta';
        const status = document.createElement('p');
        status.className = 'wing-offer-status';
        card.append(name, meta, status);
        this.offerCards.set(offer.id, card);
        const list =
          offer.storeId === FUTURE_STORE_ID ? this.futureOffers : this.homestyleOffers;
        list.append(card);
      }
      const name = card.querySelector('.wing-offer-name');
      const meta = card.querySelector('.wing-offer-meta');
      const status = card.querySelector('.wing-offer-status');
      const itemName = itemDefinitionName(state, offer.itemDefinitionId);
      if (name) {
        name.textContent = itemName;
      }
      if (meta) {
        meta.textContent = `$${offer.price} · ${storeDisplayName(offer.storeId)}`;
      }
      if (status) {
        status.textContent =
          offer.status === 'available'
            ? 'AVAILABLE'
            : offer.status === 'carried'
              ? 'CARRIED'
              : 'GONE';
      }
    }
  }

  private syncSummary(state: WingState): void {
    if (state.status !== 'left' || !state.summary) {
      this.summary.hidden = true;
      this.summary.textContent = '';
      return;
    }
    this.summary.hidden = false;
    const summary = state.summary;
    this.summary.textContent = '';
    const title = document.createElement('h2');
    title.textContent = 'Loop complete';
    const totals = document.createElement('p');
    totals.textContent = `STARTING $${summary.startingCash} · LEFT WITH $${summary.cash} · HEAT ${summary.heat}`;
    this.summary.append(title, totals);
    const purchasedTitle = document.createElement('p');
    purchasedTitle.textContent = `purchased (${summary.purchased.length})`;
    this.summary.append(purchasedTitle);
    const purchasedList = document.createElement('ul');
    for (const item of summary.purchased) {
      const entry = document.createElement('li');
      entry.textContent = `purchased: ${itemDefinitionName(state, item.itemDefinitionId)}`;
      purchasedList.append(entry);
    }
    this.summary.append(purchasedList);
    const stolenTitle = document.createElement('p');
    stolenTitle.textContent = `stolen (${summary.stolen.length})`;
    this.summary.append(stolenTitle);
    const stolenList = document.createElement('ul');
    for (const item of summary.stolen) {
      const entry = document.createElement('li');
      entry.textContent = `stolen: ${itemDefinitionName(state, item.itemDefinitionId)}`;
      stolenList.append(entry);
    }
    this.summary.append(stolenList);
  }

  public destroy(): void {
    this.restartButton.removeEventListener('click', this.onRestart);
    this.returnButton.removeEventListener('click', this.onReturn);
    this.offerCards.clear();
    this.homestyleOffers.textContent = '';
    this.futureOffers.textContent = '';
  }
}
