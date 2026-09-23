/**
 * Bounded seeded construction of the fixed six-room M5 wing.
 *
 * Exact draw order:
 *   1. one authored layout variant per combat room, in WING_ROOM_ORDER;
 *   2. one Fisher-Yates shuffle of the four authored store templates;
 *   3. one four-offer window start for storefront_a, then storefront_b;
 *   4. for service_corridor, food_court, and back_hall in room order: one
 *      enemy-count draw, one Fisher-Yates shuffle of that variant's slots, then
 *      one kind draw per selected slot that authors more than one kind.
 *
 * No step performs free-form geometry or unbounded enemy selection.
 */
import { freezeDeep } from '../items/types';
import type { Rect } from '../model';
import { createWingRng, nextInt, shuffleIndices } from './rng';
import type { AuthoredRoomVariant, AuthoredStoreOffer, AuthoredStoreTemplate, CombatRoomRole } from './templates';
import {
  COMBAT_ROOM_ROLES,
  DOORWAY_WIDTH,
  DOORWAY_Y,
  REGULAR_COMBAT_ROOM_ROLES,
  ROOM_BOUNDS,
  ROOM_HEIGHT,
  ROOM_NAMES,
  ROOM_VARIANTS,
  ROOM_WIDTH,
  SECURITY_OFFICE_VARIANT,
  STORE_TEMPLATES,
  STOREFRONT_ROLES,
  WALL_THICKNESS,
} from './templates';
import {
  WING_ROOM_COUNT,
  WING_ROOM_ORDER,
} from './types';
import type {
  GeneratedWing,
  WingDoorSide,
  WingDoorway,
  WingEnemySpawn,
  WingOffer,
  WingRoomDefinition,
  WingRoomId,
  WingStoreInstance,
} from './types';
import { validateWingGraph } from './validateWingGraph';

const STOREFRONT_VARIANT_ID = 'storefront-open-plan';
const STARTING_CASH = 30;
const OFFERS_PER_STOREFRONT = 4;

function perimeterWalls(
  westDoor: boolean,
  eastDoor: boolean,
): Rect[] {
  const walls: Rect[] = [
    { x: 0, y: 0, width: ROOM_WIDTH, height: WALL_THICKNESS },
    {
      x: 0,
      y: ROOM_HEIGHT - WALL_THICKNESS,
      width: ROOM_WIDTH,
      height: WALL_THICKNESS,
    },
  ];

  if (westDoor) {
    walls.push(
      {
        x: 0,
        y: WALL_THICKNESS,
        width: WALL_THICKNESS,
        height: DOORWAY_Y - WALL_THICKNESS,
      },
      {
        x: 0,
        y: DOORWAY_Y + DOORWAY_WIDTH,
        width: WALL_THICKNESS,
        height: ROOM_HEIGHT - WALL_THICKNESS - (DOORWAY_Y + DOORWAY_WIDTH),
      },
    );
  } else {
    walls.push({
      x: 0,
      y: WALL_THICKNESS,
      width: WALL_THICKNESS,
      height: ROOM_HEIGHT - WALL_THICKNESS * 2,
    });
  }

  if (eastDoor) {
    walls.push(
      {
        x: ROOM_WIDTH - WALL_THICKNESS,
        y: WALL_THICKNESS,
        width: WALL_THICKNESS,
        height: DOORWAY_Y - WALL_THICKNESS,
      },
      {
        x: ROOM_WIDTH - WALL_THICKNESS,
        y: DOORWAY_Y + DOORWAY_WIDTH,
        width: WALL_THICKNESS,
        height: ROOM_HEIGHT - WALL_THICKNESS - (DOORWAY_Y + DOORWAY_WIDTH),
      },
    );
  } else {
    walls.push({
      x: ROOM_WIDTH - WALL_THICKNESS,
      y: WALL_THICKNESS,
      width: WALL_THICKNESS,
      height: ROOM_HEIGHT - WALL_THICKNESS * 2,
    });
  }

  return walls;
}

function doorway(roomId: WingRoomId, side: WingDoorSide): WingDoorway {
  return {
    id: `${roomId}-${side}-door`,
    side,
    rect: {
      x: side === 'west' ? 0 : ROOM_WIDTH - WALL_THICKNESS,
      y: DOORWAY_Y,
      width: WALL_THICKNESS,
      height: DOORWAY_WIDTH,
    },
  };
}

function roomsHaveDoorSides(
  roomId: WingRoomId,
): readonly WingDoorSide[] {
  if (roomId === 'service_corridor') {
    return ['east'];
  }
  if (roomId === 'security_office') {
    return ['west'];
  }
  return ['west', 'east'];
}

function buildWalls(
  roomId: WingRoomId,
  interiorWalls: readonly Rect[],
): Rect[] {
  const sides = roomsHaveDoorSides(roomId);
  return [
    ...perimeterWalls(sides.includes('west'), sides.includes('east')),
    ...interiorWalls.map((wall) => ({ ...wall })),
  ];
}

function buildDoorways(roomId: WingRoomId): WingDoorway[] {
  return roomsHaveDoorSides(roomId).map((side) => doorway(roomId, side));
}

function instantiateStore(
  template: AuthoredStoreTemplate,
  authoredOffers: readonly AuthoredStoreOffer[],
): { readonly store: WingStoreInstance; readonly offers: WingOffer[] } {
  const offers = authoredOffers.map((offer): WingOffer => ({
    id: `${template.id}-${offer.itemDefinitionId}`,
    storeId: template.id,
    itemDefinitionId: offer.itemDefinitionId,
    position: { ...offer.position },
    price: offer.price,
  }));
  const store: WingStoreInstance = {
    templateId: template.id,
    name: template.name,
    bounds: { ...template.bounds },
    resetPoint: { ...template.resetPoint },
    exit: {
      id: template.exit.id,
      label: template.exit.label,
      bounds: { ...template.exit.bounds },
    },
    sightZone: {
      ...template.sightZone,
      origin: { ...template.sightZone.origin },
    },
    offerIds: offers.map((offer) => offer.id),
  };
  return { store, offers };
}

function chooseCombatSpawns(
  rng: ReturnType<typeof createWingRng>,
  variant: AuthoredRoomVariant,
): WingEnemySpawn[] {
  const count = nextInt(
    rng,
    variant.enemyCount.min,
    variant.enemyCount.max,
  );
  if (count === 0) {
    return [];
  }

  const chosenSlotIndices = shuffleIndices(rng, variant.spawnSlots.length)
    .slice(0, count)
    .sort((left, right) => left - right);

  return chosenSlotIndices.map((slotIndex) => {
    const slot = variant.spawnSlots[slotIndex]!;
    const kindIndex =
      slot.kinds.length === 1 ? 0 : nextInt(rng, 0, slot.kinds.length - 1);
    return {
      slotId: slot.slotId,
      kind: slot.kinds[kindIndex]!,
      x: slot.x,
      y: slot.y,
    };
  });
}

function baseRoom(
  id: WingRoomId,
  variantId: string,
  interiorWalls: readonly Rect[],
  playerEntry: { readonly x: number; readonly y: number },
): WingRoomDefinition {
  return {
    id,
    name: ROOM_NAMES[id],
    variantId,
    bounds: { ...ROOM_BOUNDS },
    walls: buildWalls(id, interiorWalls),
    doorways: buildDoorways(id),
    playerEntry: { ...playerEntry },
    bossAnchor: null,
    enemySpawns: [],
    store: null,
    offers: [],
    benchKiosk: null,
    fixtures: [],
    decals: [],
  };
}

function combatRoom(
  role: CombatRoomRole,
  variant: AuthoredRoomVariant,
  enemySpawns: readonly WingEnemySpawn[],
): WingRoomDefinition {
  return {
    ...baseRoom(role, variant.id, variant.interiorWalls, variant.playerEntry),
    enemySpawns: enemySpawns.map((spawn) => ({ ...spawn })),
    benchKiosk:
      variant.benchKiosk === null ? null : { ...variant.benchKiosk },
    fixtures: (variant.fixtures ?? []).map((fixture) => ({ ...fixture })),
    decals: (variant.decals ?? []).map((decal) => ({ ...decal })),
  };
}

function securityOffice(): WingRoomDefinition {
  const variant = SECURITY_OFFICE_VARIANT;
  return {
    ...baseRoom(
      'security_office',
      variant.id,
      variant.interiorWalls,
      variant.playerEntry,
    ),
    bossAnchor:
      variant.bossAnchor === null ? null : { ...variant.bossAnchor },
    // `baseRoom` takes only the walls and the entry point, so an optional
    // authored field has to be propagated explicitly here or it is silently
    // dropped for this room.
    fixtures: (variant.fixtures ?? []).map((fixture) => ({ ...fixture })),
    decals: (variant.decals ?? []).map((decal) => ({ ...decal })),
  };
}

function storefrontRoom(
  role: 'storefront_a' | 'storefront_b',
  template: AuthoredStoreTemplate,
  authoredOffers: readonly AuthoredStoreOffer[],
): WingRoomDefinition {
  const instance = instantiateStore(template, authoredOffers);
  return {
    ...baseRoom(
      role,
      STOREFRONT_VARIANT_ID,
      [],
      { x: 110, y: 240 },
    ),
    store: instance.store,
    offers: instance.offers,
    decals: (template.decals ?? []).map((decal) => ({ ...decal })),
    fixtures: (template.fixtures ?? []).map((fixture) => ({ ...fixture })),
  };
}

export function generateWing(seed: number): GeneratedWing {
  const rng = createWingRng(seed);

  const combatVariants = new Map<CombatRoomRole, AuthoredRoomVariant>();
  for (const role of COMBAT_ROOM_ROLES) {
    const authoredVariants = ROOM_VARIANTS[role];
    const variantIndex = nextInt(rng, 0, authoredVariants.length - 1);
    combatVariants.set(role, authoredVariants[variantIndex]!);
  }

  const templateOrder = shuffleIndices(rng, STORE_TEMPLATES.length);
  const storefrontTemplates = STOREFRONT_ROLES.map((_, storefrontIndex) => {
    const templateIndex = templateOrder[storefrontIndex]!;
    return STORE_TEMPLATES[templateIndex]!;
  });

  const storefrontOfferWindows = storefrontTemplates.map((template) =>
    (() => {
      const windowStart = nextInt(
        rng,
        0,
        template.offers.length - OFFERS_PER_STOREFRONT,
      );
      return template.offers.slice(
        windowStart,
        windowStart + OFFERS_PER_STOREFRONT,
      );
    })(),
  );

  const combatSpawns = new Map<CombatRoomRole, readonly WingEnemySpawn[]>();
  for (const role of REGULAR_COMBAT_ROOM_ROLES) {
    combatSpawns.set(
      role,
      chooseCombatSpawns(rng, combatVariants.get(role)!),
    );
  }

  const storefrontTemplateById = new Map(
    STOREFRONT_ROLES.map((role, index) => [
      role,
      {
        template: storefrontTemplates[index]!,
        offers: storefrontOfferWindows[index]!,
      },
    ]),
  );

  const rooms: WingRoomDefinition[] = [];
  for (const roomId of WING_ROOM_ORDER) {
    switch (roomId) {
      case 'service_corridor':
        rooms.push(
          combatRoom(
            'service_corridor',
            combatVariants.get('service_corridor')!,
            combatSpawns.get('service_corridor')!,
          ),
        );
        break;
      case 'food_court':
        rooms.push(
          combatRoom(
            'food_court',
            combatVariants.get('food_court')!,
            combatSpawns.get('food_court')!,
          ),
        );
        break;
      case 'back_hall':
        rooms.push(
          combatRoom(
            'back_hall',
            combatVariants.get('back_hall')!,
            combatSpawns.get('back_hall')!,
          ),
        );
        break;
      case 'security_office':
        rooms.push(securityOffice());
        break;
      case 'storefront_a': {
        const selection = storefrontTemplateById.get('storefront_a')!;
        rooms.push(
          storefrontRoom('storefront_a', selection.template, selection.offers),
        );
        break;
      }
      case 'storefront_b': {
        const selection = storefrontTemplateById.get('storefront_b')!;
        rooms.push(
          storefrontRoom('storefront_b', selection.template, selection.offers),
        );
        break;
      }
    }
  }

  if (rooms.length !== WING_ROOM_COUNT) {
    throw new Error(
      `Wing generator produced ${rooms.length} rooms instead of ${WING_ROOM_COUNT}.`,
    );
  }

  const wing: GeneratedWing = freezeDeep({
    seed,
    rooms,
    startingCash: STARTING_CASH,
  });
  validateWingGraph(wing);
  return wing;
}
