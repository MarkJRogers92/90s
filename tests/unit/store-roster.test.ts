import { describe, expect, it } from 'vitest';
import { ITEM_CATALOG } from '../../src/sim/items/catalog';
import { validateCatalog } from '../../src/sim/items/validateCatalog';
import { fusionPairFor, hybridDefinition, shortItemName } from '../../src/sim/fusion/hybrid';
import { AUTHORED_OFFER_BANDS, ALL_STORE_TEMPLATES, STORE_TEMPLATES } from '../../src/sim/wing/templates';
import { generateRunWing, roomStores } from '../../src/sim/run/storeInterior';
import { ITEM_ICON_FILES } from '../../src/game/presentation/assets';
import { itemBlurb } from '../../src/game/ui/itemBlurbs';
// @ts-expect-error Vitest provides this Node built-in at test runtime.
import { existsSync, readFileSync } from 'node:fs';
import { FACADE_TEXTURES, hasStoreLook, storeFacade } from '../../src/game/presentation/rooms/roomDressing';

const template = (id: string) => ALL_STORE_TEMPLATES.find((candidate) => candidate.id === id)!;
const stocks = (id: string) => template(id).offers.map((offer) => offer.itemDefinitionId);

describe('a mall full of themed stores (round 32)', () => {
  it('has at least eleven stores, each with a look of its own', () => {
    expect(ALL_STORE_TEMPLATES.length).toBeGreaterThanOrEqual(11);
    for (const store of ALL_STORE_TEMPLATES) expect(hasStoreLook(store.id), store.id).toBe(true);
  });

  it('no item still wears a placeholder icon', () => {
    const manifest = JSON.parse(readFileSync('public/assets/neon/manifest.json', 'utf8')) as Array<{ path: string; generator: string }>;
    const placeholders = manifest.filter((entry) => entry.path.includes('/items/') && entry.generator.includes('PLACEHOLDER'));
    expect(placeholders.map((entry: { path: string }) => entry.path)).toEqual([]);
  });

  it('every store has a shopfront of its own, drawn for it', () => {
    const facades = ALL_STORE_TEMPLATES.map((store) => storeFacade(store.id));
    expect(new Set(facades).size).toBe(ALL_STORE_TEMPLATES.length);
    for (const facade of facades) expect(existsSync(`public/assets/neon/${FACADE_TEXTURES[facade].file}`), facade).toBe(true);
  });

  it('each store stocks things that fit it', () => {
    expect(stocks('sports-locker')).toEqual(expect.arrayContaining(['aluminum_bat', 'hockey_stick', 'tennis_ball_launcher', 'golf_club']));
    expect(stocks('hardware-hut')).toEqual(expect.arrayContaining(['nail_gun', 'pipe_wrench', 'duct_tape', 'leaf_blower']));
    expect(stocks('toy-box')).toEqual(expect.arrayContaining(['super_soaker_50', 'yo_yo', 'slingshot', 'pog_slammer']));
    expect(stocks('radio-shed')).toEqual(expect.arrayContaining(['laser_pointer', 'walkman', 'nine_volt_pack']));
    expect(stocks('spiral-records')).toEqual(expect.arrayContaining(['electric_guitar', 'record_toss', 'mic_stand', 'drumsticks']));
    expect(stocks('slice-station')).toEqual(expect.arrayContaining(['pizza_cutter', 'pizza_peel', 'cheese_pump', 'soda_gun']));
  });

  it('every themed store has at least eight things so its shelves change shift to shift', () => {
    for (const store of ALL_STORE_TEMPLATES) {
      if (['mall-mart', 'cinema-snacks', 'arcade-annex', 'department-outlet'].includes(store.id)) continue;
      expect(store.offers.length, store.id).toBeGreaterThanOrEqual(8);
      expect(new Set(store.offers.map((offer) => offer.itemDefinitionId)).size, store.id).toBe(store.offers.length);
    }
  });

  it('Mall Mart is the cheap general store: a bit of everything at the bottom of each price band', () => {
    const mart = template('mall-mart');
    expect(mart.offers.length).toBeGreaterThanOrEqual(12);
    for (const offer of mart.offers) expect(offer.price, offer.itemDefinitionId).toBe(AUTHORED_OFFER_BANDS[offer.itemDefinitionId]!.min);
  });

  it('no four offers in a row share a shelf spot', () => {
    for (const store of ALL_STORE_TEMPLATES) {
      for (let start = 0; start + 4 <= store.offers.length; start += 1) {
        const spots = store.offers.slice(start, start + 4).map((offer) => `${offer.position.x},${offer.position.y}`);
        expect(new Set(spots).size, `${store.id} @${start}`).toBe(4);
      }
    }
  });

  it('the catalog has a dumb amount of stuff, all of it drawn, described, named and priced', () => {
    expect(ITEM_CATALOG.length).toBeGreaterThanOrEqual(50);
    for (const item of ITEM_CATALOG) {
      expect(ITEM_ICON_FILES[item.id], `${item.id} icon`).toBeDefined();
      expect(itemBlurb(item.id), `${item.id} blurb`).not.toBe('');
      expect(shortItemName(item.id), `${item.id} noun`).not.toBe(item.id);
    }
    for (const store of ALL_STORE_TEMPLATES) {
      for (const offer of store.offers) expect(AUTHORED_OFFER_BANDS[offer.itemDefinitionId], offer.itemDefinitionId).toBeDefined();
    }
  });

  it('every new item fuses with every other into a valid hybrid', () => {
    const fresh = ITEM_CATALOG.slice(24).filter((item) => !item.capabilities?.includes('emitter_carrier'));
    const hybrids: ReturnType<typeof hybridDefinition>[] = [];
    for (const a of fresh) {
      for (const b of fresh) {
        if (a.id === b.id) continue;
        const pair = fusionPairFor(a, b);
        expect(pair.recipe).toBe('hybrid');
        if (pair.recipe === 'hybrid') hybrids.push(hybridDefinition(pair.baseId, pair.ingredientId));
      }
    }
    const unique = [...new Map(hybrids.map((definition) => [definition.id, definition])).values()];
    expect(() => validateCatalog(unique)).not.toThrow();
  });

  it('a shift visits four different stores, and over many malls every store turns up', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const wing = generateRunWing(seed);
      const shops = wing.rooms.flatMap((room) => roomStores(room).map((store) => store.templateId));
      expect(new Set(shops).size, `seed ${seed}`).toBe(4);
      shops.forEach((shop) => seen.add(shop));
    }
    // Boss wings shuffle the regular stores; the district stores open only in their districts.
    expect([...seen].sort()).toEqual(STORE_TEMPLATES.map((store) => store.id).sort());
  });
});
