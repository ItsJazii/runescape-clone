import { DIR_SOUTH, directionOf } from '../shared/constants.ts';
import type { CollisionMap } from '../shared/world/collision.ts';
import { findPath, type Step } from '../shared/world/pathfinding.ts';

export interface Hit {
  dmg: number;
  /** 0 = block (blue), 1 = damage (red), 2 = poison, 3 = heal. */
  type: number;
}

export abstract class Entity {
  index = -1;
  x = 0;
  y = 0;
  plane = 0;
  size = 1;
  direction = DIR_SOUTH;

  hitpoints = 10;
  maxHitpoints = 10;
  dead = false;
  deathTicks = 0;

  animation = 'idle';
  animationTick = 0;
  /** Graphic played above/on the entity this tick. */
  spotAnim: string | null = null;

  hits: Hit[] = [];
  /** Tile the entity is facing this tick (combat lock-on). */
  faceTile: [number, number] | null = null;

  /** Queued walk path. */
  path: Step[] = [];
  /** Tiles stepped through this tick, for smooth client interpolation. */
  waypoints: [number, number][] = [];
  moveKind = 0;
  running = false;
  /** Ticks during which the entity cannot move. */
  frozen = 0;

  /** Current combat target. */
  target: Entity | null = null;
  attackDelay = 0;
  /** Ticks left where the entity is "in combat". */
  inCombat = 0;
  lastAttacker: Entity | null = null;
  lastAttackedTick = 0;

  abstract get name(): string;

  get centreX(): number {
    return this.x + (this.size - 1) / 2;
  }

  get centreY(): number {
    return this.y + (this.size - 1) / 2;
  }

  playAnimation(name: string, tick: number): void {
    this.animation = name;
    this.animationTick = tick;
  }

  face(x: number, y: number): void {
    this.faceTile = [x, y];
    const d = directionOf(Math.sign(x - this.centreX), Math.sign(y - this.centreY));
    if (d >= 0) this.direction = d;
  }

  walkTo(collision: CollisionMap, x: number, y: number, adjacent = false, sizeX = 1, sizeY = 1): boolean {
    const path = findPath(collision, this.x, this.y, this.plane, { x, y, adjacent, sizeX, sizeY });
    this.path = path;
    return path.length > 0;
  }

  clearPath(): void {
    this.path.length = 0;
  }

  teleport(x: number, y: number, plane = this.plane): void {
    this.x = x;
    this.y = y;
    this.plane = plane;
    this.path.length = 0;
    this.moveKind = 3;
    this.waypoints.length = 0;
  }

  /** Advances along the queued path. Returns true if the entity moved. */
  processMovement(collision: CollisionMap, canRun: boolean): boolean {
    this.waypoints.length = 0;
    if (this.moveKind === 3) {
      // Teleport already applied; keep the flag for one tick.
      this.moveKind = 3;
      return true;
    }
    this.moveKind = 0;
    if (this.frozen > 0) {
      this.frozen--;
      return false;
    }
    if (this.path.length === 0) return false;

    const steps = canRun ? 2 : 1;
    let moved = false;
    for (let i = 0; i < steps; i++) {
      const next = this.path[0];
      if (!next) break;
      const dx = Math.sign(next.x - this.x);
      const dy = Math.sign(next.y - this.y);
      if (dx === 0 && dy === 0) {
        this.path.shift();
        i--;
        continue;
      }
      if (!collision.canMove(this.x, this.y, this.plane, dx, dy)) {
        this.path.length = 0;
        break;
      }
      this.path.shift();
      if (i === 1) this.waypoints.push([this.x, this.y]);
      this.x += dx;
      this.y += dy;
      const dir = directionOf(dx, dy);
      if (dir >= 0) this.direction = dir;
      moved = true;
      this.moveKind = i === 1 ? 2 : 1;
    }
    if (moved) this.faceTile = null;
    return moved;
  }

  damage(amount: number, type = 1): void {
    const dealt = Math.max(0, Math.min(amount, this.hitpoints));
    this.hitpoints -= dealt;
    this.hits.push({ dmg: amount, type: amount === 0 ? 0 : type });
    if (this.hitpoints <= 0) this.hitpoints = 0;
  }

  heal(amount: number): void {
    this.hitpoints = Math.min(this.maxHitpoints, this.hitpoints + amount);
  }

  clearTickState(): void {
    this.hits.length = 0;
    this.spotAnim = null;
    if (this.moveKind === 3) this.moveKind = 0;
  }
}
