/**
 * Builds the renderable world: terrain chunks with baked scenery, plus the
 * minimap image. Chunks are generated lazily as the player walks around.
 */

import { objectDef } from '../../shared/data/objects.ts';
import { getWorld } from '../../shared/world/index.ts';
import { HEIGHT_PER_PLANE, terrainType, type PlacedObject, type WorldMap } from '../../shared/world/terrain.ts';
import { MeshBuilder, type Mesh } from './mesh.ts';
import { objectMesh } from './objectmodels.ts';
import type { GpuMesh, Renderer } from './renderer.ts';

export const TILE = 128;
export const CHUNK = 16;

export interface ChunkMeshes {
  terrain: GpuMesh | null;
  scenery: GpuMesh | null;
  dirty: boolean;
}

export interface ObjectInstance {
  obj: PlacedObject;
  worldX: number;
  worldY: number;
  worldZ: number;
  radius: number;
}

export class WorldScene {
  readonly map: WorldMap;
  private readonly chunks = new Map<string, ChunkMeshes>();
  private readonly tileColours: Int32Array;
  /** Overrides sent by the server: "x,y,plane" -> new object id (-1 removes). */
  private readonly overrides = new Map<string, { id: number; rot: number; original: number }>();
  private readonly extraObjects = new Map<string, PlacedObject>();
  private readonly objectIndex = new Map<string, PlacedObject[]>();
  minimap: HTMLCanvasElement;

  constructor(private readonly renderer: Renderer) {
    const built = getWorld();
    this.map = built.map;
    this.tileColours = new Int32Array(this.map.width * this.map.height * this.map.planes);
    this.computeTileColours();
    for (const obj of this.map.objects) {
      const key = `${obj.x},${obj.y},${obj.plane}`;
      const list = this.objectIndex.get(key);
      if (list) list.push(obj);
      else this.objectIndex.set(key, [obj]);
    }
    this.minimap = this.buildMinimap();
  }

  /* ---------------------------------------------------------------- */
  /* Terrain colours                                                   */
  /* ---------------------------------------------------------------- */

  private index(x: number, y: number, plane: number): number {
    return (plane * this.map.height + (y - this.map.minY)) * this.map.width + (x - this.map.minX);
  }

  inBounds(x: number, y: number): boolean {
    return (
      x >= this.map.minX &&
      y >= this.map.minY &&
      x < this.map.minX + this.map.width &&
      y < this.map.minY + this.map.height
    );
  }

  private computeTileColours(): void {
    const { minX, minY, width, height, planes } = this.map;
    // Blur the underlay so grass/dirt transitions are soft, exactly like the
    // original client's underlay smoothing.
    for (let p = 0; p < planes; p++) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const wx = minX + x;
          const wy = minY + y;
          const idx = this.index(wx, wy, p);
          const overlay = this.map.overlay[idx];
          let colour: number;
          if (overlay) {
            colour = terrainType(overlay).colour;
          } else {
            let r = 0;
            let g = 0;
            let bl = 0;
            let n = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = wx + dx;
                const ny = wy + dy;
                if (!this.inBounds(nx, ny)) continue;
                const t = terrainType(this.map.underlay[this.index(nx, ny, p)]);
                if (t.id === 0) continue;
                const w = dx === 0 && dy === 0 ? 4 : 1;
                r += ((t.colour >> 16) & 255) * w;
                g += ((t.colour >> 8) & 255) * w;
                bl += (t.colour & 255) * w;
                n += w;
              }
            }
            if (n === 0) {
              colour = terrainType(this.map.underlay[idx]).colour;
            } else {
              colour = ((r / n) << 16) | ((g / n) << 8) | (bl / n);
              colour = (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(bl / n);
            }
          }
          // Per-tile noise so large areas are not perfectly flat.
          const t = terrainType(overlay || this.map.underlay[idx]);
          const noise = t.noise ?? 0;
          if (noise > 0) {
            const n2 = ((Math.sin(wx * 12.9898 + wy * 78.233) * 43758.5453) % 1 + 1) % 1;
            const f = 1 + (n2 - 0.5) * noise * 2;
            colour =
              (clamp255(((colour >> 16) & 255) * f) << 16) |
              (clamp255(((colour >> 8) & 255) * f) << 8) |
              clamp255((colour & 255) * f);
          }
          this.tileColours[idx] = colour;
        }
      }
    }
  }

  tileColour(x: number, y: number, plane: number): number {
    if (!this.inBounds(x, y)) return 0x000000;
    return this.tileColours[this.index(x, y, plane)];
  }

  isVoid(x: number, y: number, plane: number): boolean {
    if (!this.inBounds(x, y)) return true;
    return this.map.underlay[this.index(x, y, plane)] === 0;
  }

  isWater(x: number, y: number, plane: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const idx = this.index(x, y, plane);
    return !!terrainType(this.map.overlay[idx] || this.map.underlay[idx]).water;
  }

  /* ---------------------------------------------------------------- */
  /* Heights                                                           */
  /* ---------------------------------------------------------------- */

  vertexHeight(x: number, y: number): number {
    const { minX, minY, width, height } = this.map;
    const lx = Math.max(0, Math.min(width, x - minX));
    const ly = Math.max(0, Math.min(height, y - minY));
    return this.map.heights[ly * (width + 1) + lx];
  }

  /** Bilinear interpolated ground height at a fractional tile position. */
  heightAt(tileX: number, tileY: number, plane = 0): number {
    const x0 = Math.floor(tileX);
    const y0 = Math.floor(tileY);
    const fx = tileX - x0;
    const fy = tileY - y0;
    const h00 = this.vertexHeight(x0, y0);
    const h10 = this.vertexHeight(x0 + 1, y0);
    const h01 = this.vertexHeight(x0, y0 + 1);
    const h11 = this.vertexHeight(x0 + 1, y0 + 1);
    const h = (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
    return h + plane * HEIGHT_PER_PLANE;
  }

  /* ---------------------------------------------------------------- */
  /* Object overrides                                                  */
  /* ---------------------------------------------------------------- */

  applyOverrides(list: { x: number; y: number; p: number; id: number; rot: number; type: number; original: number }[]): void {
    const seen = new Set<string>();
    for (const entry of list) {
      const key = `${entry.x},${entry.y},${entry.p}`;
      seen.add(key);
      const current = this.overrides.get(key);
      if (current && current.id === entry.id) continue;
      this.overrides.set(key, { id: entry.id, rot: entry.rot, original: entry.original });
      if (entry.original === -1) {
        this.extraObjects.set(key, { id: entry.id, x: entry.x, y: entry.y, plane: entry.p, rot: entry.rot, type: entry.type });
      }
      this.markDirty(entry.x, entry.y, entry.p);
    }
    for (const key of [...this.overrides.keys()]) {
      if (seen.has(key)) continue;
      const [x, y, p] = key.split(',').map(Number);
      this.overrides.delete(key);
      this.extraObjects.delete(key);
      this.markDirty(x, y, p);
    }
  }

  private markDirty(x: number, y: number, plane: number): void {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = this.chunkKey(Math.floor((x + dx * CHUNK) / CHUNK), Math.floor((y + dy * CHUNK) / CHUNK), plane);
        const chunk = this.chunks.get(key);
        if (chunk) chunk.dirty = true;
      }
    }
  }

  objectsAt(x: number, y: number, plane: number): PlacedObject[] {
    const key = `${x},${y},${plane}`;
    const statics = this.objectIndex.get(key) ?? [];
    const override = this.overrides.get(key);
    const extra = this.extraObjects.get(key);
    let list = statics;
    if (override && override.original !== -1) {
      list = statics.map((o) => (o.id === override.original ? { ...o, id: override.id, rot: override.rot } : o));
    }
    if (extra) list = [...list, extra];
    return list.filter((o) => objectDef(o.id));
  }

  /* ---------------------------------------------------------------- */
  /* Chunk meshes                                                      */
  /* ---------------------------------------------------------------- */

  private chunkKey(cx: number, cy: number, plane: number): string {
    return `${cx},${cy},${plane}`;
  }

  getChunk(cx: number, cy: number, plane: number): ChunkMeshes {
    const key = this.chunkKey(cx, cy, plane);
    let chunk = this.chunks.get(key);
    if (chunk && !chunk.dirty) return chunk;
    if (chunk?.dirty) {
      this.renderer.dispose(chunk.terrain);
      this.renderer.dispose(chunk.scenery);
    }
    chunk = {
      terrain: this.renderer.upload(this.buildTerrainChunk(cx, cy, plane)),
      scenery: this.renderer.upload(this.buildSceneryChunk(cx, cy, plane)),
      dirty: false,
    };
    this.chunks.set(key, chunk);
    return chunk;
  }

  private buildTerrainChunk(cx: number, cy: number, plane: number): Mesh {
    const startX = cx * CHUNK;
    const startY = cy * CHUNK;
    const positions: number[] = [];
    const normals: number[] = [];
    const colours: number[] = [];
    const bones: number[] = [];
    const planeY = plane * HEIGHT_PER_PLANE;

    const cornerColour = (x: number, y: number): [number, number, number] => {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as [number, number][]) {
        const tx = x + dx;
        const ty = y + dy;
        if (!this.inBounds(tx, ty)) continue;
        if (plane > 0 && this.isVoid(tx, ty, plane)) continue;
        const c = this.tileColour(tx, ty, plane);
        r += (c >> 16) & 255;
        g += (c >> 8) & 255;
        b += c & 255;
        n++;
      }
      if (n === 0) return [0.2, 0.3, 0.2];
      return [r / n / 255, g / n / 255, b / n / 255];
    };

    const normalAt = (x: number, y: number): [number, number, number] => {
      const hl = this.vertexHeight(x - 1, y);
      const hr = this.vertexHeight(x + 1, y);
      const hd = this.vertexHeight(x, y - 1);
      const hu = this.vertexHeight(x, y + 1);
      const nx = hl - hr;
      const nz = hd - hu;
      const ny = 2 * TILE;
      const len = Math.hypot(nx, ny, nz) || 1;
      return [nx / len, ny / len, nz / len];
    };

    for (let ty = startY; ty < startY + CHUNK; ty++) {
      for (let tx = startX; tx < startX + CHUNK; tx++) {
        if (!this.inBounds(tx, ty)) continue;
        if (this.isVoid(tx, ty, plane)) continue;
        const water = this.isWater(tx, ty, plane) ? 13 : 0;

        const corners: [number, number][] = [
          [tx, ty],
          [tx + 1, ty],
          [tx + 1, ty + 1],
          [tx, ty + 1],
        ];
        const vp = corners.map(([x, y]) => [x * TILE, this.vertexHeight(x, y) + planeY, y * TILE] as [number, number, number]);
        const vc = corners.map(([x, y]) => cornerColour(x, y));
        const vn = corners.map(([x, y]) => normalAt(x, y));

        for (const [a, b, c] of [
          [0, 1, 2],
          [0, 2, 3],
        ]) {
          for (const i of [a, b, c]) {
            positions.push(vp[i][0], vp[i][1], vp[i][2]);
            normals.push(vn[i][0], vn[i][1], vn[i][2]);
            colours.push(vc[i][0], vc[i][1], vc[i][2]);
            bones.push(water);
          }
        }
      }
    }

    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      colours: new Float32Array(colours),
      bones: new Float32Array(bones),
      count: positions.length / 3,
    };
  }

  private buildSceneryChunk(cx: number, cy: number, plane: number): Mesh {
    const startX = cx * CHUNK;
    const startY = cy * CHUNK;
    const builder = new MeshBuilder();
    const planeY = plane * HEIGHT_PER_PLANE;

    for (let ty = startY; ty < startY + CHUNK; ty++) {
      for (let tx = startX; tx < startX + CHUNK; tx++) {
        if (!this.inBounds(tx, ty)) continue;
        for (const obj of this.objectsAt(tx, ty, plane)) {
          if (obj.x !== tx || obj.y !== ty) continue;
          const def = objectDef(obj.id);
          if (!def) continue;
          // Fires and other animated objects are drawn as dynamic actors.
          if (def.model === 'fire') continue;
          const sx = obj.rot % 2 === 1 ? def.sizeY : def.sizeX;
          const sy = obj.rot % 2 === 1 ? def.sizeX : def.sizeY;
          const centreX = (obj.x + sx / 2) * TILE;
          const centreZ = (obj.y + sy / 2) * TILE;
          const h = this.heightAt(obj.x + sx / 2, obj.y + sy / 2) + planeY;
          const mesh = objectMesh(obj.id, (obj.x * 31 + obj.y * 17) & 7);
          builder.push();
          builder.translate(centreX, h, centreZ);
          builder.rotateY((obj.rot * Math.PI) / 2);
          appendTransformed(builder, mesh);
          builder.pop();
        }
      }
    }
    return builder.build();
  }

  /** Visible chunk list around a tile position. */
  *visibleChunks(tileX: number, tileY: number, plane: number, radiusTiles: number): Generator<ChunkMeshes> {
    const c0x = Math.floor((tileX - radiusTiles) / CHUNK);
    const c1x = Math.floor((tileX + radiusTiles) / CHUNK);
    const c0y = Math.floor((tileY - radiusTiles) / CHUNK);
    const c1y = Math.floor((tileY + radiusTiles) / CHUNK);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        yield this.getChunk(cx, cy, plane);
      }
    }
  }

  /** Objects near a tile, for mouse picking. */
  nearbyObjects(tileX: number, tileY: number, plane: number, radius: number): ObjectInstance[] {
    const out: ObjectInstance[] = [];
    for (let y = tileY - radius; y <= tileY + radius; y++) {
      for (let x = tileX - radius; x <= tileX + radius; x++) {
        if (!this.inBounds(x, y)) continue;
        for (const obj of this.objectsAt(x, y, plane)) {
          if (obj.x !== x || obj.y !== y) continue;
          const def = objectDef(obj.id);
          if (!def || def.options.length === 0) continue;
          const sx = obj.rot % 2 === 1 ? def.sizeY : def.sizeX;
          const sy = obj.rot % 2 === 1 ? def.sizeX : def.sizeY;
          const cxp = (obj.x + sx / 2) * TILE;
          const czp = (obj.y + sy / 2) * TILE;
          out.push({
            obj,
            worldX: cxp,
            worldY: this.heightAt(obj.x + sx / 2, obj.y + sy / 2) + plane * HEIGHT_PER_PLANE,
            worldZ: czp,
            radius: Math.max(sx, sy) * TILE * 0.5,
          });
        }
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------- */
  /* Minimap                                                           */
  /* ---------------------------------------------------------------- */

  private buildMinimap(): HTMLCanvasElement {
    const { width, height } = this.map;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const colour = this.tileColours[this.index(this.map.minX + x, this.map.minY + y, 0)];
        // Minimap y is flipped: north is up.
        const o = ((height - 1 - y) * width + x) * 4;
        img.data[o] = (colour >> 16) & 255;
        img.data[o + 1] = (colour >> 8) & 255;
        img.data[o + 2] = colour & 255;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Overlay objects so buildings and trees read on the map.
    for (const obj of this.map.objects) {
      if (obj.plane !== 0) continue;
      const def = objectDef(obj.id);
      if (!def) continue;
      let colour: string | null = null;
      if (def.model.includes('tree') || def.model === 'oak' || def.model === 'willow' || def.model === 'maple' || def.model === 'yew') {
        colour = '#1f4a17';
      } else if (def.wall) {
        colour = '#c8c0b0';
      } else if (def.model === 'orerock') {
        colour = '#5a5a5a';
      }
      if (!colour) continue;
      ctx.fillStyle = colour;
      ctx.fillRect(obj.x - this.map.minX, height - 1 - (obj.y - this.map.minY), 1, 1);
    }
    return canvas;
  }
}

function appendTransformed(builder: MeshBuilder, mesh: Mesh): void {
  for (let i = 0; i < mesh.count; i += 3) {
    builder.tri(
      mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2],
      mesh.positions[i * 3 + 3], mesh.positions[i * 3 + 4], mesh.positions[i * 3 + 5],
      mesh.positions[i * 3 + 6], mesh.positions[i * 3 + 7], mesh.positions[i * 3 + 8],
      packColour(mesh.colours[i * 3], mesh.colours[i * 3 + 1], mesh.colours[i * 3 + 2]),
    );
  }
}

function packColour(r: number, g: number, b: number): number {
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
