import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CollisionMap } from '../shared/world/collision.ts';
import { distanceTo, findPath, isAdjacent, type Step } from '../shared/world/pathfinding.ts';

const PLANE = 0;

function emptyMap(size = 48): CollisionMap {
  return new CollisionMap(0, 0, size, size, 1);
}

/**
 * Asserts that every step of a path is a single legal move. This keeps the
 * tests independent of which equal-length route the BFS happens to pick.
 */
function assertWalkable(collision: CollisionMap, startX: number, startY: number, path: Step[]): void {
  let x = startX;
  let y = startY;
  for (const [i, step] of path.entries()) {
    const dx = step.x - x;
    const dy = step.y - y;
    assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1, `step ${i} jumps from (${x},${y}) to (${step.x},${step.y})`);
    assert.ok(dx !== 0 || dy !== 0, `step ${i} does not move`);
    assert.ok(collision.canMove(x, y, PLANE, dx, dy), `step ${i} moves through a blocked edge`);
    x = step.x;
    y = step.y;
  }
}

describe('findPath on open ground', () => {
  it('walks a straight line north', () => {
    const collision = emptyMap();
    const path = findPath(collision, 10, 10, PLANE, { x: 10, y: 15 });
    assert.equal(path.length, 5);
    assert.deepEqual(path.at(-1), { x: 10, y: 15 });
    assertWalkable(collision, 10, 10, path);
  });

  it('uses diagonals so a corner-to-corner trip costs the longer axis', () => {
    const collision = emptyMap();
    const path = findPath(collision, 10, 10, PLANE, { x: 13, y: 13 });
    assert.equal(path.length, 3);
    assert.deepEqual(path.at(-1), { x: 13, y: 13 });
    assertWalkable(collision, 10, 10, path);
  });

  it('costs the Chebyshev distance on open ground', () => {
    const collision = emptyMap();
    const path = findPath(collision, 10, 10, PLANE, { x: 18, y: 13 });
    assert.equal(path.length, 8);
    assert.deepEqual(path.at(-1), { x: 18, y: 13 });
  });

  it('returns an empty path when already standing on the target', () => {
    const collision = emptyMap();
    assert.deepEqual(findPath(collision, 10, 10, PLANE, { x: 10, y: 10 }), []);
  });
});

describe('findPath around obstacles', () => {
  it('routes around a wall that spans the direct line', () => {
    const collision = emptyMap();
    // A solid barrier across x = 8..14 at y = 12, with a gap at x = 14.
    for (let x = 8; x < 14; x++) collision.addObject(x, 12, PLANE, 1, 1);

    const path = findPath(collision, 10, 10, PLANE, { x: 10, y: 15 });
    assert.deepEqual(path.at(-1), { x: 10, y: 15 });
    assert.ok(path.length > 5, 'detouring must cost more than the straight line');
    assert.ok(
      !path.some((step) => step.y === 12 && step.x >= 8 && step.x < 14),
      'the path must not cross the barrier',
    );
    assertWalkable(collision, 10, 10, path);
  });

  it('will not squeeze diagonally past a corner', () => {
    const collision = emptyMap();
    // Block both orthogonal neighbours of the north-east diagonal.
    collision.addObject(11, 10, PLANE, 1, 1);
    collision.addObject(10, 11, PLANE, 1, 1);
    assert.ok(!collision.canMove(10, 10, PLANE, 1, 1));

    const path = findPath(collision, 10, 10, PLANE, { x: 11, y: 11 });
    assert.deepEqual(path.at(-1), { x: 11, y: 11 });
    assert.ok(path.length > 1, 'the blocked diagonal must not be taken in one step');
    assertWalkable(collision, 10, 10, path);
  });

  it('respects a wall placed on a tile edge', () => {
    const collision = emptyMap();
    collision.addWall(10, 10, PLANE, 'N');
    assert.ok(!collision.canMove(10, 10, PLANE, 0, 1));

    const path = findPath(collision, 10, 10, PLANE, { x: 10, y: 11 });
    assert.deepEqual(path.at(-1), { x: 10, y: 11 });
    assert.ok(path.length > 1, 'a wall must force a detour around it');
    assertWalkable(collision, 10, 10, path);
  });

  it('stops at the closest reachable tile when the target is walled in', () => {
    const collision = emptyMap();
    // Seal (20, 20) behind a ring of solid objects.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        collision.addObject(20 + dx, 20 + dy, PLANE, 1, 1);
      }
    }

    const path = findPath(collision, 10, 10, PLANE, { x: 20, y: 20 });
    assert.ok(path.length > 0, 'the walk should still start');
    const end = path.at(-1)!;
    assert.notDeepEqual(end, { x: 20, y: 20 });
    assertWalkable(collision, 10, 10, path);
    // The fallback must genuinely be closer than where we started.
    assert.ok(distanceTo(end.x, end.y, 20, 20) < distanceTo(10, 10, 20, 20));
  });
});

describe('findPath with an adjacent target', () => {
  it('stops orthogonally next to a 1x1 target instead of on it', () => {
    const collision = emptyMap();
    const path = findPath(collision, 10, 10, PLANE, { x: 10, y: 15, adjacent: true });
    const end = path.at(-1)!;
    assert.notDeepEqual(end, { x: 10, y: 15 });
    assert.ok(isAdjacent(end.x, end.y, 10, 15), `(${end.x},${end.y}) is not next to the target`);
    assertWalkable(collision, 10, 10, path);
  });

  it('stops next to the footprint of a larger target', () => {
    const collision = emptyMap();
    collision.addObject(20, 20, PLANE, 3, 3);
    const path = findPath(collision, 10, 10, PLANE, { x: 20, y: 20, sizeX: 3, sizeY: 3, adjacent: true });
    const end = path.at(-1)!;
    assert.ok(isAdjacent(end.x, end.y, 20, 20, 3, 3), `(${end.x},${end.y}) is not next to the footprint`);
    assert.ok(
      end.x < 20 || end.x > 22 || end.y < 20 || end.y > 22,
      'the path must not end inside the object footprint',
    );
    assertWalkable(collision, 10, 10, path);
  });

  it('does not move when already adjacent', () => {
    const collision = emptyMap();
    assert.deepEqual(findPath(collision, 10, 14, PLANE, { x: 10, y: 15, adjacent: true }), []);
  });
});

describe('isAdjacent', () => {
  it('counts the tile itself and the four orthogonal neighbours', () => {
    assert.ok(isAdjacent(10, 10, 10, 10));
    assert.ok(isAdjacent(10, 11, 10, 10));
    assert.ok(isAdjacent(10, 9, 10, 10));
    assert.ok(isAdjacent(11, 10, 10, 10));
    assert.ok(isAdjacent(9, 10, 10, 10));
  });

  it('excludes diagonals, matching how RuneScape interacts', () => {
    assert.ok(!isAdjacent(11, 11, 10, 10));
    assert.ok(!isAdjacent(9, 9, 10, 10));
  });

  it('handles multi-tile footprints', () => {
    // A 3x3 object rooted at (20, 20) occupies 20..22 on both axes.
    assert.ok(isAdjacent(21, 19, 20, 20, 3, 3));
    assert.ok(isAdjacent(23, 21, 20, 20, 3, 3));
    assert.ok(isAdjacent(21, 21, 20, 20, 3, 3), 'standing inside the footprint counts as adjacent');
    assert.ok(!isAdjacent(19, 19, 20, 20, 3, 3), 'the diagonal corner does not count');
    assert.ok(!isAdjacent(24, 21, 20, 20, 3, 3));
  });
});

describe('distanceTo', () => {
  it('measures Chebyshev distance to a single tile', () => {
    assert.equal(distanceTo(10, 10, 10, 10), 0);
    assert.equal(distanceTo(10, 10, 13, 11), 3);
    assert.equal(distanceTo(10, 10, 7, 6), 4);
  });

  it('measures to the nearest edge of a footprint', () => {
    assert.equal(distanceTo(21, 21, 20, 20, 3, 3), 0);
    assert.equal(distanceTo(24, 21, 20, 20, 3, 3), 2);
    assert.equal(distanceTo(19, 20, 20, 20, 3, 3), 1);
  });
});
