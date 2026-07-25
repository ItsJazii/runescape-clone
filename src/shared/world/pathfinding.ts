import { DIR_DX, DIR_DY } from '../constants.ts';
import type { CollisionMap } from './collision.ts';

export interface Step {
  x: number;
  y: number;
}

export interface PathTarget {
  x: number;
  y: number;
  sizeX?: number;
  sizeY?: number;
  /** Stop on a tile next to the target rather than on it. */
  adjacent?: boolean;
}

/** Search radius, mirroring the client's 104x104 pathfinding window. */
const SEARCH_RADIUS = 64;

/**
 * Breadth-first pathfinder over the tile grid. Diagonal steps are allowed
 * only when both orthogonal neighbours are clear, exactly like RuneScape.
 * When the destination cannot be reached the path leads to the closest
 * reachable tile instead.
 */
export function findPath(
  collision: CollisionMap,
  startX: number,
  startY: number,
  plane: number,
  target: PathTarget,
): Step[] {
  const size = SEARCH_RADIUS * 2;
  const originX = startX - SEARCH_RADIUS;
  const originY = startY - SEARCH_RADIUS;
  const inWindow = (x: number, y: number) => x >= originX && y >= originY && x < originX + size && y < originY + size;

  const tSizeX = target.sizeX ?? 1;
  const tSizeY = target.sizeY ?? 1;

  const isGoal = (x: number, y: number): boolean => {
    if (target.adjacent) {
      // Adjacent means orthogonally touching the target's footprint.
      const withinX = x >= target.x && x < target.x + tSizeX;
      const withinY = y >= target.y && y < target.y + tSizeY;
      if (withinX && withinY) return false;
      if (withinX && (y === target.y - 1 || y === target.y + tSizeY)) return true;
      if (withinY && (x === target.x - 1 || x === target.x + tSizeX)) return true;
      return false;
    }
    return x >= target.x && x < target.x + tSizeX && y >= target.y && y < target.y + tSizeY;
  };

  const idx = (x: number, y: number) => (y - originY) * size + (x - originX);
  const cameFrom = new Int32Array(size * size).fill(-1);
  const visited = new Uint8Array(size * size);
  const queue = new Int32Array(size * size);
  let head = 0;
  let tail = 0;

  queue[tail++] = idx(startX, startY);
  visited[idx(startX, startY)] = 1;

  let goalIndex = -1;
  let bestIndex = idx(startX, startY);
  let bestDistance = distanceToTarget(startX, startY, target, tSizeX, tSizeY);

  if (isGoal(startX, startY)) return [];

  while (head < tail) {
    const current = queue[head++];
    const cx = originX + (current % size);
    const cy = originY + Math.floor(current / size);

    if (isGoal(cx, cy)) {
      goalIndex = current;
      break;
    }

    const d = distanceToTarget(cx, cy, target, tSizeX, tSizeY);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = current;
    }

    for (let dir = 0; dir < 8; dir++) {
      const dx = DIR_DX[dir];
      const dy = DIR_DY[dir];
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inWindow(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (visited[ni]) continue;
      if (!collision.canMove(cx, cy, plane, dx, dy)) continue;
      visited[ni] = 1;
      cameFrom[ni] = current;
      queue[tail++] = ni;
    }
  }

  const endIndex = goalIndex >= 0 ? goalIndex : bestIndex;
  if (endIndex === idx(startX, startY)) return [];

  const path: Step[] = [];
  let node = endIndex;
  while (node !== -1 && node !== idx(startX, startY)) {
    path.push({ x: originX + (node % size), y: originY + Math.floor(node / size) });
    node = cameFrom[node];
  }
  path.reverse();
  return path;
}

function distanceToTarget(x: number, y: number, target: PathTarget, sizeX: number, sizeY: number): number {
  const dx = x < target.x ? target.x - x : x >= target.x + sizeX ? x - (target.x + sizeX - 1) : 0;
  const dy = y < target.y ? target.y - y : y >= target.y + sizeY ? y - (target.y + sizeY - 1) : 0;
  return dx * dx + dy * dy;
}

/** True when an entity at (x, y) is standing next to the given footprint. */
export function isAdjacent(x: number, y: number, tx: number, ty: number, sizeX = 1, sizeY = 1): boolean {
  const withinX = x >= tx && x < tx + sizeX;
  const withinY = y >= ty && y < ty + sizeY;
  if (withinX && withinY) return true;
  if (withinX && (y === ty - 1 || y === ty + sizeY)) return true;
  if (withinY && (x === tx - 1 || x === tx + sizeX)) return true;
  return false;
}

/** Chebyshev distance between an entity and a footprint. */
export function distanceTo(x: number, y: number, tx: number, ty: number, sizeX = 1, sizeY = 1): number {
  const dx = x < tx ? tx - x : x >= tx + sizeX ? x - (tx + sizeX - 1) : 0;
  const dy = y < ty ? ty - y : y >= ty + sizeY ? y - (ty + sizeY - 1) : 0;
  return Math.max(dx, dy);
}
