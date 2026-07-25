/** Core engine constants. These mirror the real Old School RuneScape engine. */

/** A single game tick is 600 milliseconds. Everything in RS is quantised to this. */
export const TICK_MS = 600;

/** Ticks per game "minute" used by regen timers. */
export const TICKS_PER_MINUTE = 100;

/** Size in tiles of a map region (RS regions are 64x64). */
export const REGION_SIZE = 64;

/** Number of planes (floors) in the world. */
export const PLANES = 4;

/** World units per tile in the 3D renderer (RS uses 128 units per tile). */
export const TILE_SIZE = 128;

/** Inventory holds 28 items. */
export const INVENTORY_SIZE = 28;

/** The bank holds up to 800 unique stacks (F2P-ish sizing). */
export const BANK_SIZE = 800;

/** Maximum level of a regular skill. */
export const MAX_LEVEL = 99;

/** Maximum experience in a single skill. */
export const MAX_XP = 200_000_000;

/** How far (in tiles) a player can see other entities. */
export const VIEW_DISTANCE = 24;

/** Default server port - 43594 is the real RuneScape game port. */
export const DEFAULT_PORT = 43594;

/** Run energy drains once per tick while running; restores while walking/standing. */
export const MAX_RUN_ENERGY = 100;

/** Special attack energy is stored as 0..1000 (displayed as 0-100%). */
export const MAX_SPECIAL_ENERGY = 1000;

/** Ticks between natural hitpoint regeneration (1 minute). */
export const HP_REGEN_TICKS = 100;

/** Ticks between skill-restore towards base level (1 minute). */
export const STAT_RESTORE_TICKS = 100;

/** How many ticks a ground item stays private to its owner before going public. */
export const GROUND_ITEM_PRIVATE_TICKS = 100;

/** How many ticks until a public ground item despawns. */
export const GROUND_ITEM_DESPAWN_TICKS = 200;

/** Directions, in RS order (used by the movement/animation code). */
export const DIR_NORTH = 0;
export const DIR_NORTH_EAST = 1;
export const DIR_EAST = 2;
export const DIR_SOUTH_EAST = 3;
export const DIR_SOUTH = 4;
export const DIR_SOUTH_WEST = 5;
export const DIR_WEST = 6;
export const DIR_NORTH_WEST = 7;

/** dx/dy offsets indexed by direction constant. */
export const DIR_DX = [0, 1, 1, 1, 0, -1, -1, -1];
export const DIR_DY = [1, 1, 0, -1, -1, -1, 0, 1];

/** Returns the RS direction constant for a delta, or -1 when there is none. */
export function directionOf(dx: number, dy: number): number {
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  for (let d = 0; d < 8; d++) if (DIR_DX[d] === sx && DIR_DY[d] === sy) return d;
  return -1;
}

/** Chebyshev distance - RS uses this for "within N squares" checks. */
export function chebyshev(x1: number, y1: number, x2: number, y2: number): number {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}
