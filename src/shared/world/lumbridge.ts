/**
 * The game world: Lumbridge and its surroundings, laid out on the real
 * RuneScape coordinate grid (Lumbridge Castle courtyard is 3222, 3218).
 */

import { DIR_DX, DIR_DY } from '../constants.ts';
import * as N from '../data/npcs.ts';
import * as O from '../data/objects.ts';
import { MapBuilder, hashNoise } from './builder.ts';
import * as T from './terrain.ts';

export const WORLD_MIN_X = 3072;
export const WORLD_MIN_Y = 3136;
export const WORLD_WIDTH = 256;
export const WORLD_HEIGHT = 256;

/** Where new players and respawning players appear. */
export const SPAWN_POINT = { x: 3222, y: 3218, plane: 0 };

const GRASS_TERRAINS = [T.T_GRASS, T.T_GRASS_DARK, T.T_GRASS_LIGHT];

export function buildWorld(): MapBuilder {
  const b = new MapBuilder(WORLD_MIN_X, WORLD_MIN_Y, WORLD_WIDTH, WORLD_HEIGHT, 4);

  b.generateBaseTerrain(T.T_GRASS);
  paintBiomes(b);
  carveWater(b);
  buildRoads(b);

  buildLumbridgeCastle(b);
  buildLumbridgeVillage(b);
  buildChurch(b);
  buildFarms(b);
  buildWindmill(b);
  buildBridgeAndGate(b);
  buildAlKharid(b);
  buildAlKharidMine(b);
  buildDraynor(b);
  buildDraynorManor(b);
  buildWizardsTower(b);
  buildSwamp(b);
  buildDarkWizardCircle(b);
  buildUnderground(b);

  decorate(b);
  populate(b);
  namedAreas(b);

  b.finalise();
  anchorFishingSpots(b);
  return b;
}

/** Fishing spot ids, which are NPCs rather than scenery. */
const FISHING_SPOT_IDS = [N.FISHING_SPOT_NET.id, N.FISHING_SPOT_LURE.id, N.FISHING_SPOT_CAGE.id];

const ORTHOGONAL: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]];

/** How far from its authored tile a spot may be nudged to find the shore. */
const SHORE_SEARCH_RADIUS = 12;

/**
 * Smallest connected walkable area that counts as open countryside rather
 * than a pocket. Enclosed rooms are far smaller than this - the castle
 * courtyard is 137 tiles - so the threshold separates a real river bank from
 * a sandbar or a walled garden you could never walk in from.
 */
const MIN_SHORE_REGION = 400;

/**
 * You fish from the bank, standing on a tile beside the spot, so a spot in
 * open water can never be used: the pathfinder walks you as close as it can
 * and the interaction dies with "I can't reach that!". Subtler, a shore tile
 * cut off from the countryside (a sandbar, say) looks fine but is reachable
 * only by teleporting, which is exactly how this shipped broken - the
 * integration probe teleports beside a spot before fishing, so it never
 * walked there and never noticed.
 *
 * Rather than trust hand-authored coordinates - which silently drift into the
 * river whenever the terrain around them changes - every spot is snapped onto
 * a water tile whose bank belongs to a large walkable region. Runs after
 * `finalise()`, since that is what applies the water collision flags this
 * depends on.
 */
function anchorFishingSpots(b: MapBuilder): void {
  const plane = SPAWN_POINT.plane;
  const regions = walkableRegions(b, plane);
  const onShore = (x: number, y: number) =>
    ORTHOGONAL.some(([dx, dy]) => regions.sizeAt(x + dx, y + dy) >= MIN_SHORE_REGION);

  for (const spawn of b.map.npcSpawns) {
    if (!FISHING_SPOT_IDS.includes(spawn.def) || spawn.plane !== plane) continue;
    if (onShore(spawn.x, spawn.y)) continue;
    const shore = nearestShore(b, spawn.x, spawn.y, spawn.plane, onShore);
    if (!shore) continue;
    spawn.x = shore[0];
    spawn.y = shore[1];
  }
}

/**
 * Labels every walkable tile on a plane with its connected region and returns
 * a lookup for how big the region under a tile is. Movement follows
 * `canMove`, so walls and closed doors partition regions exactly as they
 * partition walking.
 */
function walkableRegions(b: MapBuilder, plane: number): { sizeAt(x: number, y: number): number } {
  const { minX, minY, width, height } = b.map;
  const at = (x: number, y: number) => (y - minY) * width + (x - minX);
  const label = new Int32Array(width * height).fill(-1);
  const sizes: number[] = [];

  for (let y = minY; y < minY + height; y++) {
    for (let x = minX; x < minX + width; x++) {
      if (label[at(x, y)] !== -1 || !b.collision.walkable(x, y, plane)) continue;
      const id = sizes.length;
      const queue: [number, number][] = [[x, y]];
      label[at(x, y)] = id;
      for (let head = 0; head < queue.length; head++) {
        const [cx, cy] = queue[head];
        for (let dir = 0; dir < 8; dir++) {
          const nx = cx + DIR_DX[dir];
          const ny = cy + DIR_DY[dir];
          if (!b.collision.inBounds(nx, ny) || label[at(nx, ny)] !== -1) continue;
          if (!b.collision.canMove(cx, cy, plane, DIR_DX[dir], DIR_DY[dir])) continue;
          label[at(nx, ny)] = id;
          queue.push([nx, ny]);
        }
      }
      sizes.push(queue.length);
    }
  }

  return {
    sizeAt(x: number, y: number): number {
      if (!b.collision.inBounds(x, y)) return 0;
      const id = label[at(x, y)];
      return id < 0 ? 0 : sizes[id];
    },
  };
}

/**
 * Closest water tile to (x, y) that a fisher can stand beside, searched in
 * rings so the spot moves as little as possible. Falls back to any qualifying
 * tile if no water is close enough, since a reachable spot on the bank still
 * beats an unusable one in the middle of the river.
 */
function nearestShore(
  b: MapBuilder,
  x: number,
  y: number,
  plane: number,
  onShore: (x: number, y: number) => boolean,
): [number, number] | null {
  let fallback: [number, number] | null = null;
  for (let r = 0; r <= SHORE_SEARCH_RADIUS; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (!b.collision.inBounds(tx, ty) || !onShore(tx, ty)) continue;
        if (b.isWater(tx, ty, plane)) return [tx, ty];
        fallback ??= [tx, ty];
      }
    }
  }
  return fallback;
}

/* ================================================================== */
/* Biomes and terrain painting                                         */
/* ================================================================== */

function paintBiomes(b: MapBuilder): void {
  // Vary the grass so the ground is not a flat single colour.
  for (let y = WORLD_MIN_Y; y < WORLD_MIN_Y + WORLD_HEIGHT; y++) {
    for (let x = WORLD_MIN_X; x < WORLD_MIN_X + WORLD_WIDTH; x++) {
      const n = hashNoise(x >> 2, y >> 2, 21);
      if (n < 0.28) b.tile(x, y, T.T_GRASS_DARK);
      else if (n > 0.76) b.tile(x, y, T.T_GRASS_LIGHT);
    }
  }

  // The Kharidian Desert: everything east of the river and south of the gate.
  for (let y = WORLD_MIN_Y; y < 3240; y++) {
    for (let x = 3258; x < WORLD_MIN_X + WORLD_WIDTH; x++) {
      const edge = Math.min(1, (3258 + 14 - x) / 14);
      if (hashNoise(x, y, 33) > edge) b.tile(x, y, T.T_DESERT);
      else b.tile(x, y, hashNoise(x, y, 34) > 0.5 ? T.T_SAND : T.T_GRASS_DARK);
    }
  }
  for (let y = WORLD_MIN_Y; y < 3230; y++) {
    for (let x = 3272; x < WORLD_MIN_X + WORLD_WIDTH; x++) b.tile(x, y, T.T_DESERT);
  }

  // Lumbridge Swamp in the south.
  for (let y = WORLD_MIN_Y; y < 3200; y++) {
    for (let x = 3140; x < 3250; x++) {
      const edge = Math.min(1, (3200 - y) / 26);
      if (hashNoise(x, y, 44) < edge) b.tile(x, y, hashNoise(x, y, 45) > 0.7 ? T.T_MUD : T.T_SWAMP);
    }
  }
}

function carveWater(b: MapBuilder): void {
  // The River Lum flows from the north down into the swamp.
  b.river(
    [
      [3252, 3391],
      [3249, 3340],
      [3245, 3300],
      [3243, 3262],
      [3242, 3236],
      [3244, 3222],
      [3241, 3200],
      [3232, 3176],
      [3220, 3150],
      [3210, 3136],
    ],
    9,
    T.T_WATER,
  );

  // Draynor's southern lake.
  b.river(
    [
      [3072, 3222],
      [3110, 3220],
      [3140, 3216],
      [3170, 3200],
      [3196, 3180],
    ],
    11,
    T.T_WATER,
  );

  // Swamp pools.
  for (const [px, py, r] of [
    [3168, 3168, 5],
    [3196, 3158, 4],
    [3150, 3186, 4],
    [3212, 3164, 3],
  ] as [number, number, number][]) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        b.tile(px + dx, py + dy, T.T_SHALLOW_WATER);
        b.setHeight(px + dx, py + dy, -60);
      }
    }
  }
}

function buildRoads(b: MapBuilder): void {
  // Lumbridge -> Draynor (west).
  b.path(
    [
      [3208, 3228],
      [3180, 3232],
      [3150, 3240],
      [3122, 3246],
      [3100, 3250],
    ],
    3,
    T.T_PATH,
  );
  // Lumbridge -> Varrock (north).
  b.path(
    [
      [3222, 3232],
      [3225, 3270],
      [3228, 3310],
      [3226, 3360],
      [3224, 3391],
    ],
    3,
    T.T_PATH,
  );
  // Lumbridge courtyard -> east bridge -> Al Kharid gate.
  b.path(
    [
      [3216, 3227],
      [3236, 3227],
      [3256, 3227],
      [3272, 3226],
    ],
    3,
    T.T_PATH,
  );
  // Al Kharid gate -> Al Kharid town.
  b.path(
    [
      [3272, 3226],
      [3284, 3210],
      [3290, 3190],
      [3292, 3172],
    ],
    3,
    T.T_GRAVEL,
  );
  // Al Kharid -> mine (north-east).
  b.path(
    [
      [3296, 3200],
      [3300, 3240],
      [3300, 3280],
    ],
    2,
    T.T_GRAVEL,
  );
  // Lumbridge -> south along the swamp.
  b.path(
    [
      [3218, 3205],
      [3222, 3180],
      [3226, 3160],
    ],
    2,
    T.T_DIRT,
  );
  // Draynor -> Draynor Manor.
  b.path(
    [
      [3108, 3266],
      [3108, 3300],
      [3105, 3330],
    ],
    2,
    T.T_PATH,
  );
}

/* ================================================================== */
/* Lumbridge Castle                                                    */
/* ================================================================== */

function buildLumbridgeCastle(b: MapBuilder): void {
  const x = 3200;
  const y = 3205;
  const w = 16;
  const h = 18;

  const ground = b.flatten({ x: x - 3, y: y - 3, w: w + 6, h: h + 6 }, 120);
  b.blendEdges({ x: x - 3, y: y - 3, w: w + 6, h: h + 6 }, 5);
  b.fill({ x: x - 3, y: y - 3, w: w + 6, h: h + 6 }, T.T_GRASS_LIGHT);

  /* --- Ground floor --------------------------------------------- */
  b.building({
    x,
    y,
    w,
    h,
    floor: T.T_STONE_FLOOR,
    wallId: O.O_STONE_WALL,
    flattenTo: ground,
    doors: [
      [x + 7, y, 'S'],
      [x + 8, y, 'S'],
      [x + w - 1, y + 11, 'E'],
    ],
    windows: [
      [x, y + 4, 'W'],
      [x, y + 13, 'W'],
      [x + w - 1, y + 4, 'E'],
      [x + 3, y + h - 1, 'N'],
      [x + 12, y + h - 1, 'N'],
    ],
  });

  // Interior partitions: kitchen (NW), dining hall (centre), stairwell (SW).
  for (let i = 0; i < 7; i++) b.wall(O.O_STONE_WALL, x + i, y + 11, 'N');
  b.wall(O.O_DOOR, x + 4, y + 11, 'N');
  for (let i = 12; i < h; i++) b.wall(O.O_STONE_WALL, x + 7, y + i, 'E');
  b.wall(O.O_DOOR, x + 7, y + 14, 'E');

  // Kitchen
  b.fill({ x: x + 1, y: y + 12, w: 6, h: 5 }, T.T_WOOD_FLOOR);
  b.object(O.O_RANGE, x + 1, y + 15, 0, 0);
  b.object(O.O_TABLE, x + 3, y + 14, 0, 0);
  b.object(O.O_SACKS, x + 5, y + 16, 0, 0);
  b.object(O.O_BARREL, x + 1, y + 13, 0, 0);
  b.object(O.O_SINK, x + 6, y + 16, 0, 0);
  b.object(O.O_BOOKCASE, x + 4, y + 16, 0, 0);
  b.npc(N.COOK.id, x + 3, y + 15);

  // Dining hall with the long table.
  b.fill({ x: x + 9, y: y + 12, w: 6, h: 5 }, T.T_CARPET_RED);
  for (let i = 0; i < 4; i++) b.object(O.O_TABLE, x + 11, y + 13 + i, 0, 0);
  for (let i = 0; i < 4; i++) {
    b.object(O.O_CHAIR, x + 10, y + 13 + i, 0, 2);
    b.object(O.O_CHAIR, x + 12, y + 13 + i, 0, 0);
  }
  b.object(O.O_CANDLES, x + 11, y + 12, 0, 0);
  b.npc(N.LUMBRIDGE_GUIDE.id, x + 13, y + 15);

  // Entrance hall
  b.fill({ x: x + 5, y: y + 1, w: 6, h: 9 }, T.T_CARPET_BLUE);
  b.object(O.O_PILLAR, x + 4, y + 3);
  b.object(O.O_PILLAR, x + 11, y + 3);
  b.object(O.O_PILLAR, x + 4, y + 8);
  b.object(O.O_PILLAR, x + 11, y + 8);

  // Staircases: south-west corner goes up, north-east goes to the cellar.
  b.object(O.O_STAIRS_BOTH, x + 1, y + 1, 0, 0);
  b.link(x + 1, y + 1, 0, O.O_STAIRS_BOTH, 'Climb-up', { x: x + 3, y: y + 2, plane: 1 });
  b.object(O.O_LADDER_DOWN, x + 13, y + 2, 0, 0);
  b.link(x + 13, y + 2, 0, O.O_LADDER_DOWN, 'Climb-down', { x: x + 13, y: y + 2, plane: 3 });

  /* --- First floor ---------------------------------------------- */
  b.building({
    x,
    y,
    w,
    h,
    plane: 1,
    floor: T.T_STONE_FLOOR,
    wallId: O.O_STONE_WALL,
    windows: [
      [x, y + 6, 'W'],
      [x + w - 1, y + 6, 'E'],
      [x + 5, y, 'S'],
      [x + 10, y, 'S'],
      [x + 5, y + h - 1, 'N'],
      [x + 10, y + h - 1, 'N'],
    ],
  });
  b.object(O.O_STAIRS_BOTH, x + 1, y + 1, 1, 0);
  b.link(x + 1, y + 1, 1, O.O_STAIRS_BOTH, 'Climb-down', { x: x + 3, y: y + 2, plane: 0 });
  b.link(x + 1, y + 1, 1, O.O_STAIRS_BOTH, 'Climb-up', { x: x + 3, y: y + 2, plane: 2 });

  // Duke Horacio's study.
  for (let i = 0; i < 8; i++) b.wall(O.O_STONE_WALL, x + 8, y + 10 + i, 'W');
  for (let i = 8; i < w; i++) b.wall(O.O_STONE_WALL, x + i, y + 10, 'S');
  b.wall(O.O_DOOR, x + 10, y + 10, 'S', 1);
  b.fill({ x: x + 9, y: y + 11, w: 6, h: 6 }, T.T_CARPET_RED, 1);
  b.object(O.O_TABLE, x + 12, y + 15, 1, 0);
  b.object(O.O_BOOKCASE, x + 9, y + 16, 1, 0);
  b.object(O.O_BOOKCASE, x + 10, y + 16, 1, 0);
  b.object(O.O_BED, x + 14, y + 12, 1, 0);
  b.npc(N.DUKE_HORACIO.id, x + 12, y + 14, 1);

  /* --- Second floor: the bank ----------------------------------- */
  b.building({
    x: x + 4,
    y: y + 4,
    w: 9,
    h: 10,
    plane: 2,
    floor: T.T_WOOD_FLOOR,
    wallId: O.O_STONE_WALL,
    windows: [
      [x + 4, y + 8, 'W'],
      [x + 12, y + 8, 'E'],
    ],
  });
  b.object(O.O_STAIRS_DOWN, x + 5, y + 5, 2, 0);
  b.link(x + 5, y + 5, 2, O.O_STAIRS_DOWN, 'Climb-down', { x: x + 3, y: y + 2, plane: 1 });
  for (let i = 0; i < 4; i++) {
    b.object(O.O_BANK_BOOTH, x + 7 + i, y + 12, 2, 0);
    b.npc(N.BANKER.id, x + 7 + i, y + 13, 2);
  }

  /* --- Courtyard ------------------------------------------------- */
  b.fill({ x: x + 16, y: y + 8, w: 12, h: 12 }, T.T_PATH);
  b.fenceRect({ x: x + 16, y: y + 8, w: 12, h: 12 }, O.O_LOW_WALL, [
    [x + 21, y + 8, 'S'],
    [x + 22, y + 8, 'S'],
    [x + 27, y + 13, 'E'],
    [x + 27, y + 14, 'E'],
  ]);
  b.object(O.O_FOUNTAIN, x + 20, y + 12, 0, 0);
  b.npc(N.HANS.id, x + 22, y + 15);
  b.npc(N.DOOMSAYER.id, x + 24, y + 10);
}

/* ================================================================== */
/* Lumbridge village                                                   */
/* ================================================================== */

function buildLumbridgeVillage(b: MapBuilder): void {
  // General store.
  b.building({
    x: 3209,
    y: 3243,
    w: 7,
    h: 6,
    floor: T.T_WOOD_FLOOR,
    wallId: O.O_WOOD_WALL,
    doors: [[3212, 3243, 'S']],
    windows: [
      [3209, 3246, 'W'],
      [3215, 3246, 'E'],
    ],
  });
  b.object(O.O_SHOP_COUNTER, 3211, 3247, 0, 0);
  b.object(O.O_SHOP_COUNTER, 3212, 3247, 0, 0);
  b.object(O.O_SHOP_COUNTER, 3213, 3247, 0, 0);
  b.object(O.O_CRATE, 3210, 3244, 0, 0);
  b.object(O.O_CRATE, 3214, 3244, 0, 0);
  b.npc(N.SHOP_KEEPER.id, 3212, 3246);
  b.npc(N.SHOP_ASSISTANT.id, 3213, 3246);
  b.path([[3212, 3242], [3216, 3233], [3216, 3228]], 3, T.T_PATH);

  // Bob's Brilliant Axes.
  b.building({
    x: 3228,
    y: 3200,
    w: 6,
    h: 6,
    floor: T.T_WOOD_FLOOR,
    wallId: O.O_WOOD_WALL,
    doors: [[3230, 3205, 'N']],
    windows: [[3233, 3202, 'E']],
  });
  b.object(O.O_SHOP_COUNTER, 3229, 3201, 0, 0);
  b.object(O.O_SHOP_COUNTER, 3230, 3201, 0, 0);
  b.object(O.O_ANVIL, 3232, 3204, 0, 0);
  b.npc(N.BOB.id, 3230, 3202);
  b.path([[3230, 3206], [3226, 3214], [3220, 3218]], 2, T.T_PATH);

  // A few houses to make the village feel lived in.
  house(b, 3195, 3242, 6, 5, [[3197, 3242, 'S']]);
  house(b, 3186, 3232, 5, 5, [[3188, 3232, 'S']]);
  house(b, 3228, 3240, 6, 5, [[3230, 3240, 'S']]);
  house(b, 3234, 3248, 5, 5, [[3236, 3248, 'S']]);

  b.object(O.O_SIGNPOST, 3220, 3230, 0, 0);
  b.object(O.O_WELL, 3208, 3234, 0, 0);
  b.object(O.O_LAMP_POST, 3217, 3232);
  b.object(O.O_LAMP_POST, 3217, 3240);
}

function house(
  b: MapBuilder,
  x: number,
  y: number,
  w: number,
  h: number,
  doors: [number, number, 'N' | 'E' | 'S' | 'W'][],
): void {
  b.building({ x, y, w, h, floor: T.T_WOOD_FLOOR, wallId: O.O_WOOD_WALL, doors, windows: [[x, y + h - 2, 'W'], [x + w - 1, y + 1, 'E']] });
  b.object(O.O_TABLE, x + 1, y + h - 2, 0, 0);
  b.object(O.O_CHAIR, x + 2, y + h - 2, 0, 2);
  b.object(O.O_BED, x + w - 2, y + 1, 0, 0);
  if (hashNoise(x, y, 5) > 0.5) b.object(O.O_BOOKCASE, x + w - 2, y + h - 2, 0, 0);
}

function buildChurch(b: MapBuilder): void {
  const x = 3236;
  const y = 3203;
  b.building({
    x,
    y,
    w: 8,
    h: 12,
    floor: T.T_STONE_FLOOR,
    wallId: O.O_STONE_WALL,
    doors: [[x + 3, y, 'S'], [x + 4, y, 'S']],
    windows: [
      [x, y + 3, 'W'],
      [x, y + 7, 'W'],
      [x + 7, y + 3, 'E'],
      [x + 7, y + 7, 'E'],
      [x + 3, y + 11, 'N'],
    ],
  });
  b.fill({ x: x + 3, y: y + 1, w: 2, h: 10 }, T.T_CARPET_RED);
  b.object(O.O_ALTAR, x + 3, y + 10, 0, 0);
  for (let i = 0; i < 4; i++) {
    b.object(O.O_CHAIR, x + 2, y + 3 + i * 2, 0, 2);
    b.object(O.O_CHAIR, x + 5, y + 3 + i * 2, 0, 0);
  }
  b.object(O.O_CANDLES, x + 1, y + 10);
  b.object(O.O_CANDLES, x + 6, y + 10);
  b.npc(N.FATHER_AERECK.id, x + 4, y + 8);
  b.npc(N.MONK.id, x + 2, y + 5);

  // Graveyard behind the church.
  b.fill({ x: x - 8, y: y + 1, w: 7, h: 11 }, T.T_DIRT);
  b.fenceRect({ x: x - 9, y: y, w: 9, h: 13 }, O.O_FENCE, [[x - 5, y, 'S']]);
  for (let i = 0; i < 8; i++) {
    const gx = x - 8 + (i % 3) * 2;
    const gy = y + 2 + Math.floor(i / 3) * 3;
    b.object(O.O_GRAVESTONE, gx, gy, 0, 0);
  }
  b.object(O.O_COFFIN, x - 4, y + 10, 0, 0);
  b.npc(N.GHOST.id, x - 6, y + 6);
  b.path([[x + 3, y - 1], [x - 4, y - 4], [x - 12, y - 2]], 2, T.T_PATH);
}

/* ================================================================== */
/* Farms                                                               */
/* ================================================================== */

function buildFarms(b: MapBuilder): void {
  // Cow field, north-east across the river.
  const cf = { x: 3252, y: 3255, w: 16, h: 22 };
  b.fill(cf, T.T_GRASS_LIGHT);
  b.fenceRect(cf, O.O_FENCE, [
    [cf.x, cf.y + 10, 'W'],
    [cf.x + 6, cf.y, 'S'],
  ]);
  for (let i = 0; i < 12; i++) {
    const cx = cf.x + 2 + Math.floor(hashNoise(i, 1, 61) * (cf.w - 4));
    const cy = cf.y + 2 + Math.floor(hashNoise(i, 2, 62) * (cf.h - 4));
    b.npc(i % 4 === 3 ? N.COW_CALF.id : N.COW.id, cx, cy);
  }
  b.object(O.O_HAYSTACK, cf.x + 3, cf.y + 18);
  b.object(O.O_HAYSTACK, cf.x + 12, cf.y + 4);

  // Chicken farm.
  const chick = { x: 3226, y: 3292, w: 9, h: 9 };
  b.fill(chick, T.T_DIRT);
  b.fenceRect(chick, O.O_FENCE, [[chick.x + 4, chick.y, 'S']]);
  for (let i = 0; i < 8; i++) {
    b.npc(
      N.CHICKEN.id,
      chick.x + 1 + Math.floor(hashNoise(i, 3, 71) * (chick.w - 2)),
      chick.y + 1 + Math.floor(hashNoise(i, 4, 72) * (chick.h - 2)),
    );
  }
  house(b, 3236, 3293, 5, 5, [[3236, 3295, 'W']]);
  b.object(O.O_HAYSTACK, chick.x + 7, chick.y + 7);

  // Fred the Farmer and the sheep pen.
  house(b, 3186, 3273, 6, 6, [[3188, 3273, 'S']]);
  b.npc(N.FRED_THE_FARMER.id, 3189, 3271);
  const pen = { x: 3194, y: 3270, w: 10, h: 10 };
  b.fill(pen, T.T_GRASS_LIGHT);
  b.fenceRect(pen, O.O_FENCE, [[pen.x, pen.y + 4, 'W']]);

  // Wheat field.
  const wheat = { x: 3200, y: 3286, w: 12, h: 10 };
  b.fill(wheat, T.T_WHEAT_FIELD);
  b.fenceRect(wheat, O.O_FENCE, [[wheat.x + 5, wheat.y, 'S']]);
  for (let y = wheat.y + 1; y < wheat.y + wheat.h - 1; y += 2) {
    for (let x = wheat.x + 1; x < wheat.x + wheat.w - 1; x += 2) b.object(O.O_WHEAT, x, y);
  }

  // Vegetable patches near Lumbridge.
  const veg = { x: 3230, y: 3272, w: 8, h: 6 };
  b.fill(veg, T.T_FARMLAND);
  for (let y = veg.y; y < veg.y + veg.h; y += 2) {
    for (let x = veg.x; x < veg.x + veg.w; x += 2) {
      const n = hashNoise(x, y, 88);
      b.object(n < 0.4 ? O.O_CABBAGE_PLANT : n < 0.7 ? O.O_POTATO_PLANT : O.O_ONION_PLANT, x, y);
    }
  }
}

function buildWindmill(b: MapBuilder): void {
  const x = 3164;
  const y = 3302;
  b.flatten({ x: x - 2, y: y - 2, w: 10, h: 10 }, 180);
  b.blendEdges({ x: x - 2, y: y - 2, w: 10, h: 10 }, 4);
  b.building({
    x,
    y,
    w: 6,
    h: 6,
    floor: T.T_WOOD_FLOOR,
    wallId: O.O_STONE_WALL,
    doors: [[x + 2, y, 'S']],
    flattenTo: 180,
  });
  b.object(O.O_MILLSTONE, x + 3, y + 3, 0, 0);
  b.object(O.O_WINDMILL_SAILS, x + 1, y + 6, 0, 0);
  b.npc(N.MILLIE_MILLER.id, x + 2, y + 4);
  b.object(O.O_SACKS, x + 1, y + 1);
  b.object(O.O_SACKS, x + 4, y + 1);
  b.path([[x + 2, y - 1], [x + 20, y - 10], [3200, 3286]], 2, T.T_DIRT);
}

/* ================================================================== */
/* River crossing and the Al Kharid toll gate                          */
/* ================================================================== */

function buildBridgeAndGate(b: MapBuilder): void {
  // The Lumbridge bridge over the River Lum.
  for (let x = 3236; x <= 3252; x++) {
    for (let y = 3226; y <= 3229; y++) {
      b.tile(x, y, T.T_BRIDGE);
      b.setHeight(x, y, 20);
      b.setHeight(x + 1, y, 20);
      b.setHeight(x, y + 1, 20);
      b.setHeight(x + 1, y + 1, 20);
      b.collision.remove(x, y, 0, 0x200000);
      b.map.tileFlags[
        (0 * WORLD_HEIGHT + (y - WORLD_MIN_Y)) * WORLD_WIDTH + (x - WORLD_MIN_X)
      ] |= 2;
    }
  }
  for (let x = 3236; x <= 3252; x++) {
    b.wall(O.O_FENCE, x, 3226, 'S');
    b.wall(O.O_FENCE, x, 3229, 'N');
  }

  // A second crossing further north.
  for (let x = 3240; x <= 3254; x++) {
    for (let y = 3312; y <= 3314; y++) {
      b.tile(x, y, T.T_BRIDGE);
      b.setHeight(x, y, 20);
      b.setHeight(x + 1, y + 1, 20);
    }
  }

  // Al Kharid toll gate.
  b.fill({ x: 3267, y: 3222, w: 2, h: 12 }, T.T_GRAVEL);
  for (let y = 3222; y < 3234; y++) {
    if (y === 3226 || y === 3227) continue;
    b.wall(O.O_STONE_WALL, 3268, y, 'W');
  }
  b.wall(O.O_GATE, 3268, 3226, 'W');
  b.wall(O.O_GATE, 3268, 3227, 'W');
  b.object(O.O_PILLAR, 3268, 3225);
  b.object(O.O_PILLAR, 3268, 3228);
  b.npc(N.BORDER_GUARD.id, 3267, 3226);
  b.npc(N.BORDER_GUARD.id, 3267, 3228);
}

/* ================================================================== */
/* Al Kharid                                                           */
/* ================================================================== */

function buildAlKharid(b: MapBuilder): void {
  const cx = 3280;
  const cy = 3160;
  b.fill({ x: cx - 6, y: cy, w: 40, h: 46 }, T.T_DESERT);

  // Town square.
  b.fill({ x: 3286, y: 3178, w: 12, h: 12 }, T.T_GRAVEL);
  b.object(O.O_FOUNTAIN, 3291, 3183, 0, 0);

  // Bank.
  b.building({
    x: 3266,
    y: 3163,
    w: 9,
    h: 8,
    floor: T.T_STONE_FLOOR,
    wallId: O.O_STONE_WALL,
    doors: [[3270, 3163, 'S']],
    windows: [[3266, 3167, 'W'], [3274, 3167, 'E']],
  });
  for (let i = 0; i < 4; i++) {
    b.object(O.O_BANK_BOOTH, 3268 + i, 3169, 0, 0);
    b.npc(N.BANKER.id, 3268 + i, 3170);
  }
  b.path([[3270, 3162], [3282, 3172], [3290, 3180]], 3, T.T_GRAVEL);

  // Zeke's scimitar shop.
  shop(b, 3286, 3192, 6, 5, [[3288, 3192, 'S']], N.ZEKE.id);
  // Ranael's skirt shop.
  shop(b, 3312, 3188, 6, 5, [[3314, 3188, 'S']], N.RANAEL.id);
  // Dommik's crafting shop.
  shop(b, 3312, 3174, 6, 5, [[3314, 3174, 'S']], N.DOMMIK.id);
  // Karim's kebab shop.
  shop(b, 3272, 3178, 5, 5, [[3274, 3178, 'S']], N.KARIM.id);

  // Market stalls.
  b.object(O.O_MARKET_STALL, 3283, 3185, 0, 0);
  b.npc(N.GEM_TRADER.id, 3283, 3186);
  b.object(O.O_MARKET_STALL, 3283, 3182, 0, 0);
  b.npc(N.SILK_TRADER.id, 3283, 3183);

  // Furnace and tannery.
  b.building({
    x: 3272,
    y: 3183,
    w: 7,
    h: 7,
    floor: T.T_STONE_FLOOR,
    wallId: O.O_STONE_WALL,
    doors: [[3275, 3183, 'S']],
  });
  b.object(O.O_FURNACE, 3273, 3187, 0, 0);
  b.object(O.O_ANVIL, 3277, 3185, 0, 0);
  b.object(O.O_TANNERY, 3277, 3188, 0, 0);
  b.npc(N.ELLIS.id, 3276, 3187);

  // Palace.
  const px = 3288;
  const py = 3160;
  b.building({
    x: px,
    y: py,
    w: 16,
    h: 14,
    floor: T.T_MARBLE,
    wallId: O.O_STONE_WALL,
    doors: [[px + 7, py, 'S'], [px + 8, py, 'S']],
    windows: [
      [px, py + 6, 'W'],
      [px + 15, py + 6, 'E'],
      [px + 4, py + 13, 'N'],
      [px + 11, py + 13, 'N'],
    ],
  });
  b.fill({ x: px + 6, y: py + 1, w: 4, h: 12 }, T.T_CARPET_RED);
  for (const [ox, oy] of [[px + 3, py + 3], [px + 12, py + 3], [px + 3, py + 10], [px + 12, py + 10]]) {
    b.object(O.O_PILLAR, ox, oy);
  }
  b.npc(N.AL_KHARID_WARRIOR.id, px + 5, py + 6);
  b.npc(N.AL_KHARID_WARRIOR.id, px + 10, py + 6);
  b.npc(N.JAIL_GUARD.id, px + 8, py + 11);

  // Desert scenery.
  b.scatter({ x: 3262, y: 3140, w: 60, h: 90 }, O.O_CACTUS, 0.012, 91, [T.T_DESERT, T.T_SAND]);
  b.scatter({ x: 3262, y: 3140, w: 60, h: 90 }, O.O_PALM_TREE, 0.006, 92, [T.T_DESERT]);
  b.scatter({ x: 3262, y: 3140, w: 60, h: 90 }, O.O_ROCKS_SCENERY, 0.01, 93, [T.T_DESERT, T.T_SAND]);
  b.object(O.O_TENT, 3306, 3204, 0, 0);
  b.object(O.O_TENT, 3312, 3210, 0, 0);
}

function shop(
  b: MapBuilder,
  x: number,
  y: number,
  w: number,
  h: number,
  doors: [number, number, 'N' | 'E' | 'S' | 'W'][],
  npcId: number,
): void {
  b.building({ x, y, w, h, floor: T.T_WOOD_FLOOR, wallId: O.O_STONE_WALL, doors, windows: [[x, y + h - 2, 'W']] });
  for (let i = 1; i < w - 1; i++) b.object(O.O_SHOP_COUNTER, x + i, y + h - 2, 0, 0);
  b.npc(npcId, x + Math.floor(w / 2), y + h - 3);
  b.object(O.O_CRATE, x + 1, y + 1);
}

function buildAlKharidMine(b: MapBuilder): void {
  const mx = 3294;
  const my = 3272;
  b.fill({ x: mx - 6, y: my, w: 22, h: 36 }, T.T_ROCK_FLOOR);
  b.flatten({ x: mx - 6, y: my, w: 22, h: 36 }, 60);
  b.blendEdges({ x: mx - 6, y: my, w: 22, h: 36 }, 4);

  const ores: [number, number, number][] = [
    [O.O_COPPER_ROCK, mx - 4, my + 4],
    [O.O_COPPER_ROCK, mx - 3, my + 6],
    [O.O_COPPER_ROCK, mx - 5, my + 8],
    [O.O_TIN_ROCK, mx - 4, my + 11],
    [O.O_TIN_ROCK, mx - 2, my + 13],
    [O.O_TIN_ROCK, mx - 5, my + 15],
    [O.O_IRON_ROCK, mx + 1, my + 5],
    [O.O_IRON_ROCK, mx + 3, my + 7],
    [O.O_IRON_ROCK, mx + 2, my + 10],
    [O.O_IRON_ROCK, mx + 5, my + 12],
    [O.O_SILVER_ROCK, mx + 8, my + 6],
    [O.O_SILVER_ROCK, mx + 9, my + 9],
    [O.O_COAL_ROCK, mx + 7, my + 16],
    [O.O_COAL_ROCK, mx + 9, my + 18],
    [O.O_COAL_ROCK, mx + 5, my + 19],
    [O.O_COAL_ROCK, mx + 11, my + 14],
    [O.O_GOLD_ROCK, mx + 12, my + 22],
    [O.O_GOLD_ROCK, mx + 10, my + 25],
    [O.O_MITHRIL_ROCK, mx + 3, my + 26],
    [O.O_MITHRIL_ROCK, mx + 1, my + 29],
    [O.O_ADAMANTITE_ROCK, mx + 8, my + 30],
    [O.O_RUNITE_ROCK, mx + 12, my + 32],
    [O.O_CLAY_ROCK, mx - 5, my + 22],
    [O.O_CLAY_ROCK, mx - 3, my + 24],
  ];
  for (const [id, x, y] of ores) b.object(id, x, y, 0, 0);
  for (let i = 0; i < 14; i++) {
    b.object(O.O_BOULDER, mx - 6 + Math.floor(hashNoise(i, 9, 101) * 22), my + Math.floor(hashNoise(i, 8, 102) * 36));
  }
  b.npc(N.SCORPION.id, mx + 2, my + 16);
  b.npc(N.SCORPION.id, mx + 6, my + 22);
  b.npc(N.SCORPION.id, mx - 2, my + 28);
  b.npc(N.KING_SCORPION.id, mx + 10, my + 33);
  b.npc(N.DEADLY_RED_SPIDER.id, mx + 13, my + 29);
}

/* ================================================================== */
/* Draynor Village                                                     */
/* ================================================================== */

function buildDraynor(b: MapBuilder): void {
  const x = 3082;
  const y = 3242;
  b.fill({ x: x - 4, y: y - 8, w: 52, h: 44 }, T.T_GRASS);
  b.path([[x + 10, y - 8], [x + 12, y + 20], [x + 14, y + 34]], 3, T.T_PATH);
  b.path([[x - 4, y + 8], [x + 30, y + 6], [x + 48, y + 4]], 3, T.T_PATH);

  // Bank.
  b.building({
    x: x + 10,
    y: y + 9,
    w: 10,
    h: 8,
    floor: T.T_STONE_FLOOR,
    wallId: O.O_STONE_WALL,
    doors: [[x + 14, y + 9, 'S']],
    windows: [[x + 10, y + 13, 'W'], [x + 19, y + 13, 'E']],
  });
  for (let i = 0; i < 5; i++) {
    b.object(O.O_BANK_BOOTH, x + 12 + i, y + 15, 0, 0);
    b.npc(N.BANKER.id, x + 12 + i, y + 16);
  }

  // Market square with stalls.
  b.fill({ x: x + 22, y: y + 8, w: 10, h: 8 }, T.T_GRAVEL);
  b.object(O.O_MARKET_STALL, x + 24, y + 11, 0, 0);
  b.object(O.O_MARKET_STALL, x + 28, y + 11, 0, 0);
  b.npc(N.WISE_OLD_MAN.id, x + 8, y + 3);

  // Aggie's hut and Ned's house.
  house(b, x + 2, y + 16, 6, 6, [[x + 4, y + 16, 'S']]);
  b.object(O.O_CAULDRON, x + 4, y + 20, 0, 0);
  b.npc(N.AGGIE.id, x + 5, y + 19);
  house(b, x + 3, y + 1, 6, 6, [[x + 5, y + 1, 'S']]);
  b.npc(N.NED.id, x + 6, y + 4);
  b.object(O.O_SPINNING_WHEEL, x + 6, y + 5, 0, 0);
  house(b, x + 24, y + 20, 6, 6, [[x + 26, y + 20, 'S']]);
  house(b, x + 34, y + 12, 6, 6, [[x + 36, y + 12, 'S']]);

  // Willow trees along the water.
  for (const [wx, wy] of [
    [x + 4, y - 12],
    [x + 8, y - 14],
    [x + 13, y - 13],
    [x + 18, y - 15],
    [x + 23, y - 12],
    [x + 28, y - 14],
  ] as [number, number][]) {
    if (b.isClear(wx, wy)) b.object(O.O_WILLOW, wx, wy, 0, 0);
  }

  // Fishing spots on the lake edge.
  b.npc(N.FISHING_SPOT_NET.id, x + 6, y - 17);
  b.npc(N.FISHING_SPOT_NET.id, x + 14, y - 18);
  b.npc(N.FISHING_SPOT_LURE.id, x + 22, y - 17);

  // Jail south-east of the village.
  b.building({
    x: x + 36,
    y: y - 6,
    w: 10,
    h: 8,
    floor: T.T_STONE_FLOOR,
    wallId: O.O_STONE_WALL,
    doors: [[x + 40, y - 6, 'S']],
  });
  b.npc(N.JAIL_GUARD.id, x + 40, y - 3);
  b.npc(N.THUG.id, x + 43, y - 4);
}

function buildDraynorManor(b: MapBuilder): void {
  const x = 3096;
  const y = 3334;
  b.fill({ x: x - 10, y: y - 12, w: 34, h: 34 }, T.T_GRASS_DARK);
  b.flatten({ x: x - 2, y: y - 2, w: 22, h: 22 }, 210);
  b.blendEdges({ x: x - 2, y: y - 2, w: 22, h: 22 }, 5);

  b.building({
    x,
    y,
    w: 18,
    h: 16,
    floor: T.T_WOOD_FLOOR,
    wallId: O.O_STONE_WALL,
    flattenTo: 210,
    doors: [[x + 8, y, 'S'], [x + 9, y, 'S']],
    windows: [
      [x, y + 4, 'W'],
      [x, y + 11, 'W'],
      [x + 17, y + 4, 'E'],
      [x + 17, y + 11, 'E'],
    ],
  });
  b.object(O.O_STAIRS_UP, x + 1, y + 1, 0, 0);
  b.link(x + 1, y + 1, 0, O.O_STAIRS_UP, 'Climb-up', { x: x + 3, y: y + 2, plane: 1 });
  b.building({
    x,
    y,
    w: 18,
    h: 16,
    plane: 1,
    floor: T.T_WOOD_FLOOR,
    wallId: O.O_STONE_WALL,
    windows: [[x, y + 8, 'W'], [x + 17, y + 8, 'E']],
  });
  b.object(O.O_STAIRS_DOWN, x + 1, y + 1, 1, 0);
  b.link(x + 1, y + 1, 1, O.O_STAIRS_DOWN, 'Climb-down', { x: x + 3, y: y + 2, plane: 0 });

  b.npc(N.SKELETON.id, x + 4, y + 5);
  b.npc(N.SKELETON.id, x + 13, y + 9);
  b.npc(N.ZOMBIE.id, x + 8, y + 12);
  b.npc(N.GHOST.id, x + 5, y + 12, 1);
  b.npc(N.ZOMBIE.id, x + 12, y + 5, 1);
  b.npc(N.SKELETON.id, x + 9, y + 8, 1);

  // Manor grounds: dead trees, gravestones, a fence with a gate.
  b.fenceRect({ x: x - 8, y: y - 10, w: 34, h: 32 }, O.O_FENCE, [[x + 8, y - 10, 'S'], [x + 9, y - 10, 'S']]);
  b.scatter({ x: x - 8, y: y - 10, w: 34, h: 10 }, O.O_DEAD_TREE, 0.09, 111, [T.T_GRASS_DARK, T.T_GRASS]);
  for (let i = 0; i < 6; i++) {
    b.object(O.O_GRAVESTONE, x - 6 + i * 2, y - 6, 0, 0);
  }
  // Yew trees on the grounds.
  for (const [tx, ty] of [[x - 6, y + 6], [x - 6, y + 14], [x + 22, y + 6], [x + 22, y + 14]] as [number, number][]) {
    if (b.isClear(tx, ty)) b.object(O.O_YEW, tx, ty, 0, 0);
  }
}

function buildWizardsTower(b: MapBuilder): void {
  const x = 3104;
  const y = 3156;
  b.fill({ x: x - 8, y: y - 8, w: 24, h: 24 }, T.T_GRASS);
  b.flatten({ x: x - 4, y: y - 4, w: 16, h: 16 }, 100);
  b.blendEdges({ x: x - 4, y: y - 4, w: 16, h: 16 }, 4);
  b.building({
    x,
    y,
    w: 10,
    h: 10,
    floor: T.T_STONE_FLOOR,
    wallId: O.O_STONE_WALL,
    flattenTo: 100,
    doors: [[x + 4, y, 'S'], [x + 5, y, 'S']],
    windows: [[x, y + 5, 'W'], [x + 9, y + 5, 'E'], [x + 4, y + 9, 'N']],
  });
  b.object(O.O_STAIRS_UP, x + 1, y + 8, 0, 0);
  b.link(x + 1, y + 8, 0, O.O_STAIRS_UP, 'Climb-up', { x: x + 3, y: y + 7, plane: 1 });
  b.building({
    x: x + 1,
    y: y + 1,
    w: 8,
    h: 8,
    plane: 1,
    floor: T.T_STONE_FLOOR,
    wallId: O.O_STONE_WALL,
    windows: [[x + 1, y + 5, 'W'], [x + 8, y + 5, 'E']],
  });
  b.object(O.O_STAIRS_DOWN, x + 2, y + 7, 1, 0);
  b.link(x + 2, y + 7, 1, O.O_STAIRS_DOWN, 'Climb-down', { x: x + 3, y: y + 7, plane: 0 });
  b.npc(N.WIZARD.id, x + 4, y + 4);
  b.npc(N.WIZARD.id, x + 7, y + 6);
  b.npc(N.WIZARD.id, x + 4, y + 5, 1);
  b.npc(N.DARK_WIZARD.id, x + 6, y + 3, 1);
  b.object(O.O_BOOKCASE, x + 1, y + 1);
  b.object(O.O_BOOKCASE, x + 2, y + 1);
  b.object(O.O_ALTAR, x + 4, y + 7, 1, 0);
}

/* ================================================================== */
/* Swamp, goblins and the dark wizards                                 */
/* ================================================================== */

function buildSwamp(b: MapBuilder): void {
  b.scatter({ x: 3140, y: 3138, w: 110, h: 62 }, O.O_REEDS, 0.1, 121, [T.T_SWAMP, T.T_MUD]);
  b.scatter({ x: 3140, y: 3138, w: 110, h: 62 }, O.O_MUSHROOM, 0.03, 122, [T.T_SWAMP, T.T_MUD]);
  b.scatter({ x: 3140, y: 3138, w: 110, h: 62 }, O.O_DEAD_TREE, 0.02, 123, [T.T_SWAMP, T.T_MUD]);

  // Lumbridge Swamp mine.
  const mx = 3222;
  const my = 3146;
  b.fill({ x: mx - 4, y: my - 4, w: 14, h: 14 }, T.T_ROCK_FLOOR);
  const ores: [number, number, number][] = [
    [O.O_COPPER_ROCK, mx, my],
    [O.O_COPPER_ROCK, mx + 2, my + 1],
    [O.O_COPPER_ROCK, mx - 2, my + 3],
    [O.O_TIN_ROCK, mx + 4, my + 4],
    [O.O_TIN_ROCK, mx + 1, my + 5],
    [O.O_TIN_ROCK, mx - 3, my - 1],
    [O.O_CLAY_ROCK, mx + 5, my - 1],
    [O.O_IRON_ROCK, mx + 3, my + 7],
  ];
  for (const [id, x, y] of ores) b.object(id, x, y, 0, 0);
  b.npc(N.GIANT_RAT.id, mx + 6, my + 2);
  b.npc(N.GIANT_RAT_6.id, mx - 5, my + 6);

  // Entrance to the swamp caves.
  b.object(O.O_LADDER_DOWN, 3169, 3172, 0, 0);
  b.link(3169, 3172, 0, O.O_LADDER_DOWN, 'Climb-down', { x: 3169, y: 3172, plane: 3 });

  // Goblins camped on the east bank of the river.
  const gx = 3248;
  const gy = 3236;
  b.fill({ x: gx, y: gy, w: 14, h: 14 }, T.T_DIRT);
  b.object(O.O_FIRE, gx + 6, gy + 6, 0, 0);
  b.object(O.O_TENT, gx + 2, gy + 9, 0, 0);
  b.object(O.O_TENT, gx + 9, gy + 3, 0, 0);
  b.object(O.O_LOG_PILE, gx + 8, gy + 8);
  for (let i = 0; i < 7; i++) {
    b.npc(
      i % 3 === 0 ? N.GOBLIN_5.id : N.GOBLIN.id,
      gx + 1 + Math.floor(hashNoise(i, 5, 131) * 12),
      gy + 1 + Math.floor(hashNoise(i, 6, 132) * 12),
    );
  }
}

function buildDarkWizardCircle(b: MapBuilder): void {
  const cx = 3226;
  const cy = 3360;
  b.fill({ x: cx - 7, y: cy - 7, w: 15, h: 15 }, T.T_DIRT);
  b.flatten({ x: cx - 7, y: cy - 7, w: 15, h: 15 }, 150);
  b.blendEdges({ x: cx - 7, y: cy - 7, w: 15, h: 15 }, 4);
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const px = cx + Math.round(Math.cos(ang) * 5);
    const py = cy + Math.round(Math.sin(ang) * 5);
    b.object(O.O_PILLAR, px, py, 0, 0);
  }
  b.npc(N.DARK_WIZARD.id, cx - 2, cy);
  b.npc(N.DARK_WIZARD.id, cx + 2, cy + 1);
  b.npc(N.DARK_WIZARD.id, cx, cy - 2);
  b.npc(N.DARK_WIZARD_20.id, cx, cy + 2);
  b.npc(N.DARK_WIZARD_20.id, cx + 1, cy - 1);
}

/** The Lumbridge Swamp Caves, on plane 3. */
function buildUnderground(b: MapBuilder): void {
  const P = 3;
  const x0 = 3150;
  const y0 = 3150;
  const w = 44;
  const h = 44;
  b.fill({ x: x0, y: y0, w, h }, T.T_ROCK_FLOOR, P);
  // Cave walls around the perimeter.
  for (let i = 0; i < w; i++) {
    b.wall(O.O_STONE_WALL, x0 + i, y0, 'S', P);
    b.wall(O.O_STONE_WALL, x0 + i, y0 + h - 1, 'N', P);
  }
  for (let i = 0; i < h; i++) {
    b.wall(O.O_STONE_WALL, x0, y0 + i, 'W', P);
    b.wall(O.O_STONE_WALL, x0 + w - 1, y0 + i, 'E', P);
  }
  // Rubble pillars to break the space up.
  for (let i = 0; i < 40; i++) {
    const bx = x0 + 2 + Math.floor(hashNoise(i, 1, 141) * (w - 4));
    const by = y0 + 2 + Math.floor(hashNoise(i, 2, 142) * (h - 4));
    b.object(O.O_BOULDER, bx, by, P, 0);
  }
  b.object(O.O_LADDER_UP, 3169, 3172, P, 0);
  b.link(3169, 3172, P, O.O_LADDER_UP, 'Climb-up', { x: 3169, y: 3173, plane: 0 });
  b.object(O.O_FIRE, 3160, 3160, P, 0);

  for (let i = 0; i < 6; i++) {
    b.npc(N.HILL_GIANT.id, x0 + 6 + Math.floor(hashNoise(i, 3, 143) * 14), y0 + 6 + Math.floor(hashNoise(i, 4, 144) * 30), P);
  }
  for (let i = 0; i < 4; i++) {
    b.npc(N.MOSS_GIANT.id, x0 + 26 + Math.floor(hashNoise(i, 5, 145) * 14), y0 + 8 + Math.floor(hashNoise(i, 6, 146) * 28), P);
  }
  for (let i = 0; i < 5; i++) {
    b.npc(N.GIANT_SPIDER.id, x0 + 4 + Math.floor(hashNoise(i, 7, 147) * 36), y0 + 4 + Math.floor(hashNoise(i, 8, 148) * 36), P);
  }
  b.npc(N.LESSER_DEMON.id, x0 + 36, y0 + 36, P);
  b.npc(N.BLACK_KNIGHT.id, x0 + 20, y0 + 38, P);
  b.npc(N.HOBGOBLIN.id, x0 + 12, y0 + 34, P);
  b.npc(N.HOBGOBLIN.id, x0 + 16, y0 + 30, P);
  b.npc(N.CHAOS_DRUID.id, x0 + 30, y0 + 20, P);

  b.item(453, 1, x0 + 8, y0 + 8, P, 200);
  b.item(1265, 1, x0 + 30, y0 + 12, P, 300);
}

/* ================================================================== */
/* Scenery, trees and remaining spawns                                 */
/* ================================================================== */

function decorate(b: MapBuilder): void {
  // Woodland.
  b.scatter({ x: 3140, y: 3240, w: 60, h: 80 }, O.O_TREE, 0.05, 201, GRASS_TERRAINS);
  b.scatter({ x: 3180, y: 3300, w: 70, h: 80 }, O.O_TREE, 0.055, 202, GRASS_TERRAINS);
  b.scatter({ x: 3240, y: 3280, w: 60, h: 100 }, O.O_TREE, 0.045, 203, GRASS_TERRAINS);
  b.scatter({ x: 3080, y: 3280, w: 60, h: 60 }, O.O_TREE, 0.05, 204, GRASS_TERRAINS);
  b.scatter({ x: 3186, y: 3200, w: 40, h: 40 }, O.O_TREE, 0.03, 205, GRASS_TERRAINS);

  // Oak groves.
  b.scatter({ x: 3190, y: 3245, w: 26, h: 26 }, O.O_OAK, 0.03, 211, GRASS_TERRAINS);
  b.scatter({ x: 3244, y: 3290, w: 30, h: 30 }, O.O_OAK, 0.03, 212, GRASS_TERRAINS);
  b.scatter({ x: 3140, y: 3290, w: 24, h: 24 }, O.O_OAK, 0.03, 213, GRASS_TERRAINS);

  // Willows near the water and maples/yews to the north.
  b.scatter({ x: 3160, y: 3196, w: 60, h: 16 }, O.O_WILLOW, 0.04, 221, GRASS_TERRAINS);
  b.scatter({ x: 3190, y: 3330, w: 40, h: 40 }, O.O_MAPLE, 0.02, 222, GRASS_TERRAINS);
  b.scatter({ x: 3250, y: 3330, w: 50, h: 50 }, O.O_YEW, 0.012, 223, GRASS_TERRAINS);
  b.scatter({ x: 3140, y: 3350, w: 40, h: 40 }, O.O_MAGIC_TREE, 0.004, 224, GRASS_TERRAINS);

  // Undergrowth.
  b.scatter({ x: WORLD_MIN_X, y: WORLD_MIN_Y, w: WORLD_WIDTH, h: WORLD_HEIGHT }, O.O_BUSH, 0.014, 231, GRASS_TERRAINS);
  b.scatter({ x: WORLD_MIN_X, y: WORLD_MIN_Y, w: WORLD_WIDTH, h: WORLD_HEIGHT }, O.O_FLOWERS, 0.01, 232, GRASS_TERRAINS);
  b.scatter({ x: WORLD_MIN_X, y: WORLD_MIN_Y, w: WORLD_WIDTH, h: WORLD_HEIGHT }, O.O_ROCKS_SCENERY, 0.006, 233, GRASS_TERRAINS);
  b.scatter({ x: 3072, y: 3300, w: 60, h: 90 }, O.O_BOULDER, 0.008, 234, GRASS_TERRAINS);
}

function populate(b: MapBuilder): void {
  // Fishing spots along the River Lum.
  for (const [x, y, kind] of [
    [3239, 3244, 0],
    [3238, 3250, 0],
    [3240, 3256, 1],
    [3241, 3266, 1],
    [3244, 3286, 2],
    [3246, 3300, 2],
  ] as [number, number, number][]) {
    b.npc([N.FISHING_SPOT_NET.id, N.FISHING_SPOT_LURE.id, N.FISHING_SPOT_CAGE.id][kind], x, y);
  }

  // Townsfolk wandering Lumbridge.
  for (const [x, y] of [
    [3218, 3240],
    [3226, 3232],
    [3210, 3238],
    [3232, 3222],
    [3205, 3232],
  ] as [number, number][]) {
    b.npc(hashNoise(x, y, 151) > 0.5 ? N.MAN.id : N.WOMAN.id, x, y);
  }
  for (const [x, y] of [
    [3092, 3252],
    [3100, 3260],
    [3110, 3248],
  ] as [number, number][]) {
    b.npc(hashNoise(x, y, 152) > 0.5 ? N.MAN.id : N.WOMAN.id, x, y);
  }

  // Guards at the Lumbridge courtyard and Al Kharid.
  b.npc(N.GUARD.id, 3220, 3210);
  b.npc(N.GUARD.id, 3228, 3212);
  b.npc(N.AL_KHARID_WARRIOR.id, 3290, 3196);
  b.npc(N.AL_KHARID_WARRIOR.id, 3296, 3186);
  b.npc(N.AL_KHARID_WARRIOR.id, 3284, 3176);

  // Wildlife.
  for (let i = 0; i < 8; i++) {
    b.npc(N.RAT.id, 3200 + Math.floor(hashNoise(i, 1, 161) * 50), 3140 + Math.floor(hashNoise(i, 2, 162) * 50));
  }
  b.npc(N.IMP.id, 3212, 3260);
  b.npc(N.IMP.id, 3196, 3300);
  b.npc(N.IMP.id, 3260, 3268);
  b.npc(N.BLACK_BEAR.id, 3160, 3320);
  b.npc(N.BLACK_BEAR.id, 3168, 3332);
  b.npc(N.GRIZZLY_BEAR.id, 3152, 3340);
  b.npc(N.UNICORN.id, 3186, 3352);
  b.npc(N.UNICORN.id, 3196, 3344);
  b.npc(N.DWARF.id, 3300, 3282);
  b.npc(N.DWARF.id, 3304, 3290);
  b.npc(N.BARBARIAN.id, 3140, 3268);
  b.npc(N.BARBARIAN.id, 3146, 3276);
  b.npc(N.HIGHWAYMAN.id, 3164, 3244);
  b.npc(N.HIGHWAYMAN.id, 3134, 3248);
  b.npc(N.SPIDER.id, 3178, 3210);
  b.npc(N.SPIDER.id, 3190, 3196);
  b.npc(N.DUCK.id, 3202, 3222);
  b.npc(N.DUCK.id, 3204, 3224);

  // Ground item spawns, exactly like the classic respawning items.
  b.item(590, 1, 3214, 3245, 0, 100); // Tinderbox in the general store
  b.item(2347, 1, 3231, 3203, 0, 100); // Hammer at Bob's
  b.item(1265, 1, 3223, 3147, 0, 150); // Bronze pickaxe at the swamp mine
  b.item(1351, 1, 3228, 3204, 0, 150); // Bronze axe at Bob's
  b.item(303, 1, 3240, 3243, 0, 120); // Small fishing net by the river
  b.item(307, 1, 3241, 3252, 0, 120); // Fishing rod
  b.item(313, 20, 3241, 3253, 0, 120); // Fishing bait
  b.item(1925, 1, 3209, 3235, 0, 120); // Bucket by the well
  b.item(1931, 1, 3204, 3216, 0, 120); // Pot in the castle
  b.item(1935, 1, 3205, 3216, 0, 120); // Jug
  b.item(2309, 1, 3206, 3218, 0, 150); // Bread in the castle
  b.item(526, 1, 3252, 3240, 0, 100); // Bones at the goblin camp
  b.item(995, 12, 3096, 3260, 0, 200); // Coins in Draynor
}

function namedAreas(b: MapBuilder): void {
  b.area('Lumbridge', 3180, 3190, 70, 70);
  b.area('Lumbridge Swamp', 3130, 3136, 120, 60);
  b.area('Al Kharid', 3260, 3140, 68, 90);
  b.area('Al Kharid Mine', 3286, 3268, 30, 44);
  b.area('Draynor Village', 3072, 3230, 60, 50);
  b.area('Draynor Manor', 3082, 3320, 50, 50);
  b.area('Wizards\' Tower', 3090, 3140, 40, 40);
  b.area('Lumbridge Swamp Caves', 3150, 3150, 44, 44);
  b.area('The Wilderness Road', 3200, 3300, 60, 92);
}
