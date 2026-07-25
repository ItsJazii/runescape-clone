import { CollisionMap, Flag } from './collision.ts';
import * as O from '../data/objects.ts';
import {
  HEIGHT_PER_PLANE,
  T_NONE,
  type ItemSpawn,
  type NamedArea,
  type NpcSpawn,
  type PlacedObject,
  type TeleportLink,
  type WorldMap,
  terrainType,
} from './terrain.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Deterministic value noise so the terrain looks the same on client + server. */
export function hashNoise(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 100000;
}

function smoothNoise(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const n00 = hashNoise(x0, y0, seed);
  const n10 = hashNoise(x0 + 1, y0, seed);
  const n01 = hashNoise(x0, y0 + 1, seed);
  const n11 = hashNoise(x0 + 1, y0 + 1, seed);
  return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy;
}

export class MapBuilder {
  readonly map: WorldMap;
  readonly collision: CollisionMap;
  /** Object lookup by "x,y,plane" for replacement / removal. */
  private readonly objectIndex = new Map<string, PlacedObject[]>();

  constructor(minX: number, minY: number, width: number, height: number, planes = 4) {
    this.map = {
      minX,
      minY,
      width,
      height,
      planes,
      heights: new Int16Array((width + 1) * (height + 1)),
      underlay: new Uint8Array(width * height * planes),
      overlay: new Uint8Array(width * height * planes),
      tileFlags: new Uint8Array(width * height * planes),
      objects: [],
      npcSpawns: [],
      itemSpawns: [],
      areas: [],
      links: [],
    };
    this.collision = new CollisionMap(minX, minY, width, height, planes);
    // Everything above ground level starts as void.
    for (let p = 1; p < planes; p++) {
      this.map.underlay.fill(T_NONE, p * width * height, (p + 1) * width * height);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Indexing helpers                                                  */
  /* ---------------------------------------------------------------- */

  inBounds(x: number, y: number): boolean {
    const lx = x - this.map.minX;
    const ly = y - this.map.minY;
    return lx >= 0 && ly >= 0 && lx < this.map.width && ly < this.map.height;
  }

  private ti(x: number, y: number, plane: number): number {
    return (plane * this.map.height + (y - this.map.minY)) * this.map.width + (x - this.map.minX);
  }

  private vi(x: number, y: number): number {
    return (y - this.map.minY) * (this.map.width + 1) + (x - this.map.minX);
  }

  /* ---------------------------------------------------------------- */
  /* Terrain                                                           */
  /* ---------------------------------------------------------------- */

  /** Base landscape: rolling hills with gentle noise. */
  generateBaseTerrain(baseTerrain: number): void {
    const { minX, minY, width, height } = this.map;
    for (let y = 0; y <= height; y++) {
      for (let x = 0; x <= width; x++) {
        const wx = minX + x;
        const wy = minY + y;
        const h =
          smoothNoise(wx, wy, 48, 1) * 260 +
          smoothNoise(wx, wy, 17, 2) * 70 +
          smoothNoise(wx, wy, 7, 3) * 22;
        this.map.heights[this.vi(wx, wy)] = Math.round(h - 160);
      }
    }
    for (let p = 0; p < 1; p++) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          this.map.underlay[this.ti(minX + x, minY + y, p)] = baseTerrain;
        }
      }
    }
  }

  getHeight(x: number, y: number): number {
    if (x < this.map.minX || y < this.map.minY || x > this.map.minX + this.map.width || y > this.map.minY + this.map.height) return 0;
    return this.map.heights[this.vi(x, y)];
  }

  setHeight(x: number, y: number, h: number): void {
    if (x < this.map.minX || y < this.map.minY || x > this.map.minX + this.map.width || y > this.map.minY + this.map.height) return;
    this.map.heights[this.vi(x, y)] = h;
  }

  /** Flattens a rectangle to the average height of its corners. */
  flatten(r: Rect, target?: number): number {
    let h = target;
    if (h === undefined) {
      const a = this.getHeight(r.x, r.y);
      const b = this.getHeight(r.x + r.w, r.y);
      const c = this.getHeight(r.x, r.y + r.h);
      const d = this.getHeight(r.x + r.w, r.y + r.h);
      h = Math.round((a + b + c + d) / 4);
    }
    for (let y = r.y; y <= r.y + r.h; y++) {
      for (let x = r.x; x <= r.x + r.w; x++) this.setHeight(x, y, h);
    }
    return h;
  }

  /** Smooths heights around a rectangle so flattened areas blend in. */
  blendEdges(r: Rect, radius = 3): void {
    for (let pass = 0; pass < radius; pass++) {
      const snapshot = new Map<string, number>();
      for (let y = r.y - radius - 1; y <= r.y + r.h + radius + 1; y++) {
        for (let x = r.x - radius - 1; x <= r.x + r.w + radius + 1; x++) {
          const inside = x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
          if (inside) continue;
          let sum = 0;
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              sum += this.getHeight(x + dx, y + dy);
              n++;
            }
          }
          snapshot.set(`${x},${y}`, Math.round(sum / n));
        }
      }
      for (const [key, value] of snapshot) {
        const [x, y] = key.split(',').map(Number);
        this.setHeight(x, y, value);
      }
    }
  }

  fill(r: Rect, terrain: number, plane = 0): void {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (!this.inBounds(x, y)) continue;
        this.map.underlay[this.ti(x, y, plane)] = terrain;
        const t = terrainType(terrain);
        if (t.blocked) this.collision.add(x, y, plane, Flag.BLOCKED);
        else this.collision.remove(x, y, plane, Flag.BLOCKED);
      }
    }
  }

  overlay(r: Rect, terrain: number, plane = 0): void {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (!this.inBounds(x, y)) continue;
        this.map.overlay[this.ti(x, y, plane)] = terrain;
        const t = terrainType(terrain);
        if (t.blocked) this.collision.add(x, y, plane, Flag.BLOCKED);
      }
    }
  }

  tile(x: number, y: number, terrain: number, plane = 0): void {
    this.fill({ x, y, w: 1, h: 1 }, terrain, plane);
  }

  markIndoors(r: Rect, plane = 0): void {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (!this.inBounds(x, y)) continue;
        this.map.tileFlags[this.ti(x, y, plane)] |= 1;
      }
    }
  }

  /** Paints a winding path between waypoints. */
  path(points: [number, number][], width: number, terrain: number, plane = 0): void {
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const cx = Math.round(x1 + (x2 - x1) * t);
        const cy = Math.round(y1 + (y2 - y1) * t);
        const w = width + (hashNoise(cx, cy, 7) > 0.75 ? 1 : 0);
        const half = Math.floor(w / 2);
        for (let dy = -half; dy <= half; dy++) {
          for (let dx = -half; dx <= half; dx++) {
            if (dx * dx + dy * dy > half * half + half) continue;
            this.tile(cx + dx, cy + dy, terrain, plane);
          }
        }
      }
    }
  }

  /** Carves a river; the banks are lowered and the bed is flooded. */
  river(points: [number, number][], width: number, terrain: number): void {
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const cx = Math.round(x1 + (x2 - x1) * t);
        const cy = Math.round(y1 + (y2 - y1) * t);
        const wobble = Math.round((hashNoise(cx >> 2, cy >> 2, 11) - 0.5) * 2);
        const half = Math.floor(width / 2) + wobble;
        for (let dy = -half - 2; dy <= half + 2; dy++) {
          for (let dx = -half - 2; dx <= half + 2; dx++) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > half + 2) continue;
            const x = cx + dx;
            const y = cy + dy;
            if (!this.inBounds(x, y)) continue;
            if (dist <= half) {
              this.tile(x, y, terrain);
              this.setHeight(x, y, -80);
              this.setHeight(x + 1, y, -80);
              this.setHeight(x, y + 1, -80);
              this.setHeight(x + 1, y + 1, -80);
            } else {
              const cur = this.getHeight(x, y);
              this.setHeight(x, y, Math.min(cur, -20));
            }
          }
        }
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Objects                                                           */
  /* ---------------------------------------------------------------- */

  object(id: number, x: number, y: number, plane = 0, rot = 0, type = 2): PlacedObject | null {
    if (!this.inBounds(x, y)) return null;
    const def = O.objectDef(id);
    if (!def) throw new Error(`Unknown object id ${id}`);
    const placed: PlacedObject = { id, x, y, plane, rot, type };
    this.map.objects.push(placed);
    const key = `${x},${y},${plane}`;
    const list = this.objectIndex.get(key);
    if (list) list.push(placed);
    else this.objectIndex.set(key, [placed]);

    if (type === 2 && def.solid) {
      const sx = rot % 2 === 1 ? def.sizeY : def.sizeX;
      const sy = rot % 2 === 1 ? def.sizeX : def.sizeY;
      this.collision.addObject(x, y, plane, sx, sy, !def.seeThrough);
    }
    return placed;
  }

  /** Places a wall-type object on one edge of a tile. */
  wall(id: number, x: number, y: number, side: 'N' | 'E' | 'S' | 'W', plane = 0): PlacedObject | null {
    const def = O.objectDef(id);
    if (!def) throw new Error(`Unknown object id ${id}`);
    const rot = { S: 0, W: 1, N: 2, E: 3 }[side];
    const placed = this.object(id, x, y, plane, rot, 0);
    if (placed && def.solid) this.collision.addWall(x, y, plane, side, !def.seeThrough);
    return placed;
  }

  objectsAt(x: number, y: number, plane: number): PlacedObject[] {
    return this.objectIndex.get(`${x},${y},${plane}`) ?? [];
  }

  npc(def: number, x: number, y: number, plane = 0, count = 1): void {
    for (let i = 0; i < count; i++) this.map.npcSpawns.push({ def, x, y, plane });
  }

  item(item: number, amount: number, x: number, y: number, plane = 0, respawn = 100): void {
    this.map.itemSpawns.push({ item, amount, x, y, plane, respawn });
  }

  area(name: string, x: number, y: number, w: number, h: number): void {
    this.map.areas.push({ name, x, y, w, h });
  }

  link(x: number, y: number, plane: number, objectId: number, action: string, to: { x: number; y: number; plane: number }): void {
    this.map.links.push({ x, y, plane, objectId, action, to });
  }

  /* ---------------------------------------------------------------- */
  /* Composite helpers                                                 */
  /* ---------------------------------------------------------------- */

  /**
   * Builds a rectangular building: floor, perimeter walls with doorways,
   * and an optional upper storey.
   */
  building(opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    plane?: number;
    floor: number;
    wallId?: number;
    /** Doorways as [x, y, side]. */
    doors?: [number, number, 'N' | 'E' | 'S' | 'W'][];
    /** Windows as [x, y, side]. */
    windows?: [number, number, 'N' | 'E' | 'S' | 'W'][];
    /** Openings with no wall at all. */
    gaps?: [number, number, 'N' | 'E' | 'S' | 'W'][];
    flattenTo?: number;
    noFlatten?: boolean;
  }): number {
    const { x, y, w, h } = opts;
    const plane = opts.plane ?? 0;
    const wallId = opts.wallId ?? O.O_STONE_WALL;
    let baseHeight = 0;
    if (plane === 0 && !opts.noFlatten) {
      baseHeight = this.flatten({ x, y, w, h }, opts.flattenTo);
      this.blendEdges({ x, y, w, h }, 3);
    }
    this.fill({ x, y, w, h }, opts.floor, plane);
    this.markIndoors({ x, y, w, h }, plane);

    const doorSet = new Set((opts.doors ?? []).map(([dx, dy, s]) => `${dx},${dy},${s}`));
    const windowSet = new Set((opts.windows ?? []).map(([dx, dy, s]) => `${dx},${dy},${s}`));
    const gapSet = new Set((opts.gaps ?? []).map(([dx, dy, s]) => `${dx},${dy},${s}`));

    const put = (px: number, py: number, side: 'N' | 'E' | 'S' | 'W') => {
      const key = `${px},${py},${side}`;
      if (gapSet.has(key)) return;
      if (doorSet.has(key)) {
        this.wall(O.O_DOOR, px, py, side, plane);
        return;
      }
      if (windowSet.has(key)) {
        this.wall(O.O_WINDOW, px, py, side, plane);
        return;
      }
      this.wall(wallId, px, py, side, plane);
    };

    for (let i = 0; i < w; i++) {
      put(x + i, y, 'S');
      put(x + i, y + h - 1, 'N');
    }
    for (let i = 0; i < h; i++) {
      put(x, y + i, 'W');
      put(x + w - 1, y + i, 'E');
    }
    return baseHeight;
  }

  /** Encloses an area with fencing, leaving gates where specified. */
  fenceRect(r: Rect, fenceId: number, gates: [number, number, 'N' | 'E' | 'S' | 'W'][] = [], gateId = O.O_GATE, plane = 0): void {
    const gateSet = new Set(gates.map(([gx, gy, s]) => `${gx},${gy},${s}`));
    const put = (px: number, py: number, side: 'N' | 'E' | 'S' | 'W') => {
      if (gateSet.has(`${px},${py},${side}`)) this.wall(gateId, px, py, side, plane);
      else this.wall(fenceId, px, py, side, plane);
    };
    for (let i = 0; i < r.w; i++) {
      put(r.x + i, r.y, 'S');
      put(r.x + i, r.y + r.h - 1, 'N');
    }
    for (let i = 0; i < r.h; i++) {
      put(r.x, r.y + i, 'W');
      put(r.x + r.w - 1, r.y + i, 'E');
    }
  }

  /** Scatters scenery objects using deterministic noise. */
  scatter(r: Rect, objectId: number, density: number, seed: number, allowed?: number[], plane = 0): void {
    const allow = allowed ? new Set(allowed) : null;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (!this.inBounds(x, y)) continue;
        if (hashNoise(x, y, seed) > density) continue;
        if (this.collision.get(x, y, plane) !== 0) continue;
        const t = this.map.underlay[this.ti(x, y, plane)];
        const type = terrainType(t);
        if (type.water || type.blocked) continue;
        if (this.map.overlay[this.ti(x, y, plane)] !== 0) continue;
        if (allow && !allow.has(t)) continue;
        this.object(objectId, x, y, plane, Math.floor(hashNoise(x, y, seed + 1) * 4));
      }
    }
  }

  /** True when a tile is free of objects and walkable. */
  isClear(x: number, y: number, plane = 0): boolean {
    return this.inBounds(x, y) && this.collision.get(x, y, plane) === 0;
  }

  /** Applies the collision flags implied by the map's water/blocked terrain. */
  finalise(): void {
    const { minX, minY, width, height, planes } = this.map;
    for (let p = 0; p < planes; p++) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = this.ti(minX + x, minY + y, p);
          const under = terrainType(this.map.underlay[idx]);
          const over = this.map.overlay[idx] ? terrainType(this.map.overlay[idx]) : null;
          if (under.blocked || over?.blocked) {
            this.collision.add(minX + x, minY + y, p, Flag.BLOCKED);
          }
        }
      }
    }
  }
}

export function planeHeight(plane: number): number {
  return plane * HEIGHT_PER_PLANE;
}

export type { PlacedObject, NpcSpawn, ItemSpawn, NamedArea, TeleportLink };

