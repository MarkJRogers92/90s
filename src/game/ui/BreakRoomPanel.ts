/**
 * The Break Room: the title screen's meta-progression panel.
 *
 * A cork board in the employee break room. Pay Stubs earned on shift buy perk
 * levels and weapons for the employee locker; shifts that cleared a floor are
 * pinned up as polaroids, and the best one is Employee of the Month. Pure DOM
 * built with textContent only; every rule lives in `career.ts`.
 */
import {
  LOCKER_ITEMS,
  PERKS,
  WALL_SIZE,
  buyLocker,
  buyPerk,
  equipLocker,
  fusionLog,
  nextPerkCost,
  type Career,
  type CareerStore,
  type PerkId,
  type Polaroid,
} from '../career/career';

const ART = '/assets/neon/ui/breakroom';
const PERK_ICONS: Record<PerkId, string> = {
  seniority: `${ART}/perk-seniority.png`,
  dental: `${ART}/perk-dental.png`,
  coffee: `${ART}/perk-coffee.png`,
};
const ITEM_ICON = (itemId: string): string => `/assets/neon/items/${itemId.replace(/_/g, '-')}.png`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function img(src: string, className: string, alt = ''): HTMLImageElement {
  const image = el('img', className);
  image.src = src;
  image.alt = alt;
  image.decoding = 'async';
  return image;
}

function stubs(amount: number): HTMLElement {
  const wrap = el('span', 'br-stubs');
  wrap.append(img(`${ART}/stub.png`, 'br-stub-icon'), el('span', undefined, `${amount}`));
  return wrap;
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Each pinned photo leans a little, the same way every time. */
function tilt(index: number): number {
  return [-4, 3, -2, 5, -3, 2, -5, 4, -1][index % 9]!;
}

export class BreakRoomPanel {
  private readonly store: CareerStore;
  private readonly panel: HTMLElement;
  private readonly body: HTMLElement;
  private readonly balance: HTMLElement;
  private readonly status: HTMLElement;
  private readonly openButton: HTMLButtonElement;
  private readonly onChange: () => void;

  public constructor(store: CareerStore, find: <T extends HTMLElement>(selector: string) => T, onChange: () => void = () => {}) {
    this.store = store;
    this.onChange = onChange;
    this.panel = find('#break-room');
    this.body = find('#break-room-body');
    this.balance = find('#break-room-balance');
    this.status = find('#break-room-status');
    this.openButton = find<HTMLButtonElement>('#break-room-open');
    this.openButton.addEventListener('click', () => this.open());
    find('#break-room-close').addEventListener('click', () => this.close());
    // On the window, not the panel: a purchase redraws the cards, and the
    // button that had focus goes with them.
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.panel.hidden) {
        event.preventDefault();
        this.close();
      }
    });
    this.refreshButton();
  }

  public open(): void {
    this.panel.hidden = false;
    this.status.textContent = '';
    this.render();
    this.panel.querySelector<HTMLElement>('#break-room-close')?.focus();
  }

  public close(): void {
    this.panel.hidden = true;
    this.openButton.focus();
  }

  /** The title button carries the balance, so there is a reason to look inside. */
  public refreshButton(): void {
    const career = this.store.load();
    this.openButton.textContent = career.stubs > 0 ? `Break Room · ${career.stubs} stubs` : 'Break Room';
  }

  private commit(career: Career, message: string): void {
    this.store.save(career);
    this.status.textContent = message;
    this.render();
    this.refreshButton();
    this.onChange();
  }

  private render(): void {
    const career = this.store.load();
    this.balance.replaceChildren(stubs(career.stubs), el('span', 'br-balance-label', 'PAY STUBS'));
    const perks = el('section', 'br-section br-perks');
    perks.append(el('h3', 'br-heading', 'Benefits package'));
    for (const perk of PERKS) perks.append(this.perkCard(career, perk.id));

    const locker = el('section', 'br-section br-locker');
    locker.append(el('h3', 'br-heading', 'Employee locker'), el('p', 'br-note', 'Bring one weapon from home. It starts in your hands.'));
    const grid = el('div', 'br-locker-grid');
    for (const item of LOCKER_ITEMS) grid.append(this.lockerCard(career, item.itemId));
    locker.append(grid);

    const wall = el('section', 'br-section br-wall');
    wall.append(this.plaque(career.wall[0] ?? null));
    const photos = el('div', 'br-photos');
    for (let index = 0; index < WALL_SIZE; index += 1) photos.append(this.polaroid(career.wall[index] ?? null, index));
    wall.append(photos);

    const stats = el('p', 'br-career');
    stats.textContent = career.shifts === 0
      ? 'No shifts on record yet. Clock in and get paid.'
      : `${career.shifts} SHIFTS · ${career.floorClears} FLOOR CLEARS · ${career.clockOuts} CLOCK-OUTS · ${career.kills} KILLS · BEST COMBO X${career.bestCombo} · ${career.lifetimeStubs} STUBS EARNED`;

    const log = fusionLog(career);
    const fusions = el('section', 'br-section br-fusions');
    fusions.append(
      el('h3', 'br-heading', `Fusion log · ${log.signaturesFound}/${log.signatureTotal} signatures`),
      el('p', 'br-note', log.totalFound === 0
        ? 'Fuse any two items at a Bench Warrant. Some pairs have names.'
        : `${log.totalFound} different fusions made. Some pairs have names — find them all.`),
    );
    const list = el('ul', 'br-fusion-list');
    for (const entry of log.entries) list.append(el('li', entry.found ? 'is-found' : '', entry.name.toUpperCase()));
    fusions.append(list);

    const left = el('div', 'br-column');
    left.append(perks, locker, fusions);
    this.body.replaceChildren(left, wall, stats);
  }

  private perkCard(career: Career, id: PerkId): HTMLElement {
    const perk = PERKS.find((candidate) => candidate.id === id)!;
    const level = career.perks[id];
    const cost = nextPerkCost(career, id);
    const card = el('article', 'br-card');
    card.dataset.perk = id;
    const pips = el('span', 'br-pips');
    pips.setAttribute('aria-label', `Level ${level} of ${perk.costs.length}`);
    for (let index = 0; index < perk.costs.length; index += 1) pips.append(el('span', index < level ? 'br-pip is-on' : 'br-pip'));
    const text = el('div', 'br-card-text');
    const title = el('h4', 'br-card-title', perk.name);
    title.append(pips);
    text.append(title, el('p', 'br-card-blurb', perk.perLevel));
    const button = el('button', 'br-buy');
    button.type = 'button';
    if (cost === null) {
      button.textContent = 'Maxed';
      button.disabled = true;
    } else {
      button.append(`${level === 0 ? 'Enroll' : 'Upgrade'} · `, stubs(cost));
      button.disabled = career.stubs < cost;
      button.setAttribute('aria-label', `${level === 0 ? 'Enroll in' : 'Upgrade'} ${perk.name} for ${cost} pay stubs`);
      button.addEventListener('click', () => {
        const result = buyPerk(this.store.load(), id);
        if (result.ok) this.commit(result.career, `${perk.name} is now level ${result.career.perks[id]}.`);
        else this.status.textContent = result.reason;
      });
    }
    card.append(img(PERK_ICONS[id], 'br-card-icon'), text, button);
    return card;
  }

  private lockerCard(career: Career, itemId: string): HTMLElement {
    const item = LOCKER_ITEMS.find((candidate) => candidate.itemId === itemId)!;
    const owned = career.lockerOwned.includes(itemId);
    const equipped = career.lockerEquipped === itemId;
    const card = el('article', `br-item${equipped ? ' is-equipped' : ''}${owned ? '' : ' is-locked'}`);
    card.dataset.item = itemId;
    const text = el('div', 'br-card-text');
    text.append(el('h4', 'br-card-title', item.name), el('p', 'br-card-blurb', item.blurb));
    const button = el('button', 'br-buy');
    button.type = 'button';
    if (!owned) {
      button.append('Buy · ', stubs(item.cost));
      button.disabled = career.stubs < item.cost;
      button.setAttribute('aria-label', `Buy ${item.name} for ${item.cost} pay stubs`);
      button.addEventListener('click', () => {
        const result = buyLocker(this.store.load(), itemId);
        if (result.ok) this.commit(result.career, `${item.name} is in your locker. You will bring it to work.`);
        else this.status.textContent = result.reason;
      });
    } else {
      button.textContent = equipped ? 'In hand' : 'Bring it';
      button.setAttribute('aria-pressed', String(equipped));
      button.addEventListener('click', () => {
        const next = equipLocker(this.store.load(), equipped ? null : itemId);
        this.commit(next, equipped ? `${item.name} stays in the locker.` : `You will bring the ${item.name} to work.`);
      });
    }
    card.append(img(ITEM_ICON(itemId), 'br-item-icon'), text, button);
    return card;
  }

  private plaque(best: Polaroid | null): HTMLElement {
    const plaque = el('div', 'br-plaque');
    plaque.append(el('span', 'br-plaque-title', 'Employee of the Month'));
    plaque.append(el('span', 'br-plaque-name', best ? `ALEX · ${best.score.toLocaleString('en-US')} PTS` : 'POSITION OPEN'));
    return plaque;
  }

  private polaroid(photo: Polaroid | null, index: number): HTMLElement {
    const frame = el('figure', `br-polaroid${photo ? '' : ' is-empty'}${photo && index === 0 ? ' is-best' : ''}`);
    frame.style.setProperty('--tilt', `${tilt(index)}deg`);
    frame.append(img(`${ART}/pushpin.png`, 'br-pin'));
    if (!photo) {
      frame.append(el('div', 'br-photo-blank', 'YOUR PHOTO HERE'), el('figcaption', 'br-caption', 'clear a floor'));
      return frame;
    }
    frame.append(img(`${ART}/polaroid-${photo.photo}.png`, 'br-photo', photo.won ? 'The janitor after clocking out' : 'The janitor after clearing floor 1'));
    const caption = el('figcaption', 'br-caption');
    caption.append(
      el('span', 'br-caption-score', photo.score.toLocaleString('en-US')),
      el('span', 'br-caption-line', photo.won ? `CLOCKED OUT ${clock(photo.seconds)}` : 'FLOOR 1 CLEARED'),
      el('span', 'br-caption-date', `${photo.date} · MALL #${photo.mall}`),
    );
    frame.append(caption);
    return frame;
  }
}
