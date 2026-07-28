import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { allNpcs } from '../shared/data/npcs.ts';
import { getWorld, SPAWN_POINT } from '../shared/world/index.ts';
import { findPath } from '../shared/world/pathfinding.ts';

const world = getWorld();
const collision = world.collision;
const PLANE = SPAWN_POINT.plane;

const FISHING_SPOT_IDS = allNpcs()
  .filter((d) => d.name === 'Fishing spot')
  .map((d) => d.id);

const spots = world.map.npcSpawns.filter((s) => FISHING_SPOT_IDS.includes(s.def));

const ORTHOGONAL: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]];

/** Walkable tiles orthogonally touching a spot - the tiles you fish from. */
function shoreTiles(x: number, y: number): [number, number][] {
  return ORTHOGONAL.map(([dx, dy]) => [x + dx, y + dy] as [number, number]).filter(([tx, ty]) =>
    collision.walkable(tx, ty, PLANE),
  );
}

describe('fishing spots', () => {
  it('exist on the map', () => {
    assert.ok(FISHING_SPOT_IDS.length >= 3, 'expected net, lure and cage spot definitions');
    assert.ok(spots.length > 0, 'the world has no fishing spots');
  });

  it('all sit on the ground plane', () => {
    for (const spot of spots) {
      assert.equal(spot.plane, PLANE, `spot at (${spot.x},${spot.y}) is on plane ${spot.plane}`);
    }
  });

  it('sit on water rather than dry land', () => {
    for (const spot of spots) {
      assert.ok(world.isWater(spot.x, spot.y, PLANE), `spot at (${spot.x},${spot.y}) is not on a water tile`);
    }
  });

  /**
   * `distanceTo` is Chebyshev, but the pathfinder only accepts orthogonally
   * adjacent goals, so a spot whose only walkable neighbours are diagonal can
   * never be walked to.
   */
  it('have a bank to stand on', () => {
    for (const spot of spots) {
      assert.ok(
        shoreTiles(spot.x, spot.y).length > 0,
        `fishing spot at (${spot.x},${spot.y}) has no orthogonally adjacent walkable tile, ` +
          'so clicking it can only ever say "I can\'t reach that!"',
      );
    }
  });

  /**
   * The regression this guards. Three of the four net spots used to sit in
   * open water, and the fourth had banks that were an isolated pocket, so
   * walking to any of them was impossible - fishing only ever worked because
   * `tools/play-check.ts` teleports beside a spot before clicking it.
   */
  it('can be walked to from a few tiles away', () => {
    for (const spot of spots) {
      const banks = shoreTiles(spot.x, spot.y);
      const starts: [number, number][] = [];
      for (const [bx, by] of banks) {
        for (const [dx, dy] of [[0, 6], [0, -6], [6, 0], [-6, 0], [4, 4], [-4, -4]] as [number, number][]) {
          if (collision.walkable(bx + dx, by + dy, PLANE)) starts.push([bx + dx, by + dy]);
        }
      }
      assert.ok(starts.length > 0, `no walkable tile 6 tiles from the bank of the spot at (${spot.x},${spot.y})`);

      const [sx, sy] = starts[0];
      const path = findPath(collision, sx, sy, PLANE, { x: spot.x, y: spot.y, adjacent: true });
      const last = path[path.length - 1] ?? { x: sx, y: sy };
      const ended = Math.max(Math.abs(last.x - spot.x), Math.abs(last.y - spot.y));
      assert.equal(
        ended,
        1,
        `walking from (${sx},${sy}) to the spot at (${spot.x},${spot.y}) stopped ${ended} tiles short`,
      );
    }
  });
});
