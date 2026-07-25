/**
 * Tile collision flags, matching the semantics of the RuneScape client's
 * collision map: per-tile wall bits plus an occupied bit.
 */

export const enum Flag {
  WALL_NORTH_WEST = 0x1,
  WALL_NORTH = 0x2,
  WALL_NORTH_EAST = 0x4,
  WALL_EAST = 0x8,
  WALL_SOUTH_EAST = 0x10,
  WALL_SOUTH = 0x20,
  WALL_SOUTH_WEST = 0x40,
  WALL_WEST = 0x80,
  /** A game object stands on this tile and blocks movement. */
  OBJECT = 0x100,
  /** No walkable floor here (void / water / roof edge). */
  BLOCKED = 0x200000,
  /** Blocks projectiles / line of sight as well. */
  BLOCK_LOS = 0x40000,
}

export const BLOCK_MOVEMENT = Flag.OBJECT | Flag.BLOCKED;

export class CollisionMap {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
  readonly planes: number;
  private readonly flags: Int32Array;

  constructor(minX: number, minY: number, width: number, height: number, planes = 4) {
    this.minX = minX;
    this.minY = minY;
    this.width = width;
    this.height = height;
    this.planes = planes;
    this.flags = new Int32Array(width * height * planes);
  }

  inBounds(x: number, y: number): boolean {
    const lx = x - this.minX;
    const ly = y - this.minY;
    return lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
  }

  private index(x: number, y: number, plane: number): number {
    return (plane * this.height + (y - this.minY)) * this.width + (x - this.minX);
  }

  get(x: number, y: number, plane: number): number {
    if (!this.inBounds(x, y) || plane < 0 || plane >= this.planes) return Flag.BLOCKED;
    return this.flags[this.index(x, y, plane)];
  }

  add(x: number, y: number, plane: number, flag: number): void {
    if (!this.inBounds(x, y) || plane < 0 || plane >= this.planes) return;
    this.flags[this.index(x, y, plane)] |= flag;
  }

  remove(x: number, y: number, plane: number, flag: number): void {
    if (!this.inBounds(x, y) || plane < 0 || plane >= this.planes) return;
    this.flags[this.index(x, y, plane)] &= ~flag;
  }

  set(x: number, y: number, plane: number, flag: number): void {
    if (!this.inBounds(x, y) || plane < 0 || plane >= this.planes) return;
    this.flags[this.index(x, y, plane)] = flag;
  }

  /** Marks a solid object footprint. */
  addObject(x: number, y: number, plane: number, sizeX: number, sizeY: number, blocksLos = true): void {
    for (let dx = 0; dx < sizeX; dx++) {
      for (let dy = 0; dy < sizeY; dy++) {
        this.add(x + dx, y + dy, plane, Flag.OBJECT | (blocksLos ? Flag.BLOCK_LOS : 0));
      }
    }
  }

  removeObject(x: number, y: number, plane: number, sizeX: number, sizeY: number): void {
    for (let dx = 0; dx < sizeX; dx++) {
      for (let dy = 0; dy < sizeY; dy++) {
        this.remove(x + dx, y + dy, plane, Flag.OBJECT | Flag.BLOCK_LOS);
      }
    }
  }

  /**
   * Adds a wall along one edge of a tile. RS stores the mirrored flag on the
   * neighbouring tile too, so a wall blocks from both sides.
   */
  addWall(x: number, y: number, plane: number, side: 'N' | 'E' | 'S' | 'W', blocksLos = true): void {
    const los = blocksLos ? Flag.BLOCK_LOS : 0;
    switch (side) {
      case 'N':
        this.add(x, y, plane, Flag.WALL_NORTH | los);
        this.add(x, y + 1, plane, Flag.WALL_SOUTH | los);
        break;
      case 'E':
        this.add(x, y, plane, Flag.WALL_EAST | los);
        this.add(x + 1, y, plane, Flag.WALL_WEST | los);
        break;
      case 'S':
        this.add(x, y, plane, Flag.WALL_SOUTH | los);
        this.add(x, y - 1, plane, Flag.WALL_NORTH | los);
        break;
      case 'W':
        this.add(x, y, plane, Flag.WALL_WEST | los);
        this.add(x - 1, y, plane, Flag.WALL_EAST | los);
        break;
    }
  }

  removeWall(x: number, y: number, plane: number, side: 'N' | 'E' | 'S' | 'W'): void {
    switch (side) {
      case 'N':
        this.remove(x, y, plane, Flag.WALL_NORTH);
        this.remove(x, y + 1, plane, Flag.WALL_SOUTH);
        break;
      case 'E':
        this.remove(x, y, plane, Flag.WALL_EAST);
        this.remove(x + 1, y, plane, Flag.WALL_WEST);
        break;
      case 'S':
        this.remove(x, y, plane, Flag.WALL_SOUTH);
        this.remove(x, y - 1, plane, Flag.WALL_NORTH);
        break;
      case 'W':
        this.remove(x, y, plane, Flag.WALL_WEST);
        this.remove(x - 1, y, plane, Flag.WALL_EAST);
        break;
    }
  }

  /** Can a 1x1 entity stand here? */
  walkable(x: number, y: number, plane: number): boolean {
    return (this.get(x, y, plane) & BLOCK_MOVEMENT) === 0;
  }

  /**
   * Can an entity move from (x, y) one step in direction (dx, dy)?
   * Diagonal moves require both orthogonal components to be clear, exactly
   * as the RuneScape client enforces.
   */
  canMove(x: number, y: number, plane: number, dx: number, dy: number): boolean {
    const nx = x + dx;
    const ny = y + dy;
    if (!this.walkable(nx, ny, plane)) return false;
    const here = this.get(x, y, plane);
    const there = this.get(nx, ny, plane);

    if (dx === 0 && dy === 1) return (here & Flag.WALL_NORTH) === 0 && (there & Flag.WALL_SOUTH) === 0;
    if (dx === 0 && dy === -1) return (here & Flag.WALL_SOUTH) === 0 && (there & Flag.WALL_NORTH) === 0;
    if (dx === 1 && dy === 0) return (here & Flag.WALL_EAST) === 0 && (there & Flag.WALL_WEST) === 0;
    if (dx === -1 && dy === 0) return (here & Flag.WALL_WEST) === 0 && (there & Flag.WALL_EAST) === 0;

    // Diagonals: the two adjacent orthogonal tiles must also be traversable.
    if (dx === 1 && dy === 1) {
      return (
        this.canMove(x, y, plane, 1, 0) &&
        this.canMove(x, y, plane, 0, 1) &&
        this.canMove(x + 1, y, plane, 0, 1) &&
        this.canMove(x, y + 1, plane, 1, 0)
      );
    }
    if (dx === 1 && dy === -1) {
      return (
        this.canMove(x, y, plane, 1, 0) &&
        this.canMove(x, y, plane, 0, -1) &&
        this.canMove(x + 1, y, plane, 0, -1) &&
        this.canMove(x, y - 1, plane, 1, 0)
      );
    }
    if (dx === -1 && dy === 1) {
      return (
        this.canMove(x, y, plane, -1, 0) &&
        this.canMove(x, y, plane, 0, 1) &&
        this.canMove(x - 1, y, plane, 0, 1) &&
        this.canMove(x, y + 1, plane, -1, 0)
      );
    }
    if (dx === -1 && dy === -1) {
      return (
        this.canMove(x, y, plane, -1, 0) &&
        this.canMove(x, y, plane, 0, -1) &&
        this.canMove(x - 1, y, plane, 0, -1) &&
        this.canMove(x, y - 1, plane, -1, 0)
      );
    }
    return dx === 0 && dy === 0;
  }

  /** Bresenham-style line of sight used for ranged/magic attacks. */
  hasLineOfSight(x1: number, y1: number, x2: number, y2: number, plane: number): boolean {
    if (x1 === x2 && y1 === y2) return true;
    let dx = x2 - x1;
    let dy = y2 - y1;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    let cx = x1;
    let cy = y1;
    const sx = dx / steps;
    const sy = dy / steps;
    let fx = x1 + 0.5;
    let fy = y1 + 0.5;
    for (let i = 0; i < steps; i++) {
      const px = cx;
      const py = cy;
      fx += sx;
      fy += sy;
      cx = Math.floor(fx);
      cy = Math.floor(fy);
      if (cx === x2 && cy === y2) return true;
      const ddx = Math.sign(cx - px);
      const ddy = Math.sign(cy - py);
      if (ddx !== 0 || ddy !== 0) {
        if (!this.canMove(px, py, plane, ddx, ddy) && (this.get(cx, cy, plane) & Flag.BLOCK_LOS) !== 0) return false;
        if ((this.get(cx, cy, plane) & Flag.BLOCK_LOS) !== 0) return false;
      }
    }
    return true;
  }
}
