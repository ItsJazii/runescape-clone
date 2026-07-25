import type { MapBuilder } from './builder.ts';
import { buildWorld } from './lumbridge.ts';

let cached: MapBuilder | null = null;

/** Builds (once) and returns the shared world. Client and server agree because
 *  the same deterministic builder runs on both sides. */
export function getWorld(): MapBuilder {
  if (!cached) cached = buildWorld();
  return cached;
}

export * from './terrain.ts';
export * from './collision.ts';
export * from './pathfinding.ts';
export { SPAWN_POINT, WORLD_MIN_X, WORLD_MIN_Y, WORLD_WIDTH, WORLD_HEIGHT } from './lumbridge.ts';
export { MapBuilder, hashNoise, planeHeight } from './builder.ts';
