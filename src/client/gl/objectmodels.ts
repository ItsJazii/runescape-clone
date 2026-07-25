/** Procedural models for every scenery object in the world. */

import { objectDef, type ObjectDef } from '../../shared/data/objects.ts';
import { MeshBuilder, mixColour, shade, type Mesh } from './mesh.ts';

const TILE = 128;
const cache = new Map<string, Mesh>();

/** Deterministic pseudo-random in [0,1) from an integer seed. */
function rnd(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function objectMesh(id: number, variant = 0): Mesh {
  const key = `${id}:${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = objectDef(id);
  const b = new MeshBuilder();
  if (def) buildObject(b, def, variant);
  const mesh = b.build();
  cache.set(key, mesh);
  return mesh;
}

function buildObject(b: MeshBuilder, def: ObjectDef, variant: number): void {
  const c = def.colour;
  const c2 = def.colour2 ?? shade(c, 0.75);
  const v = variant;

  switch (def.model) {
    /* ---------------- Trees ---------------- */
    case 'tree': {
      const h = 150 + rnd(v) * 60;
      b.cylinder(0, 0, 0, 14, 10, h, 6, c2);
      const canopyY = h - 20;
      b.sphere(0, canopyY + 40, 0, 62 + rnd(v + 1) * 12, c, 4, 7, 0.85);
      b.sphere(-30, canopyY + 20, 22, 38, shade(c, 0.9), 3, 6, 0.9);
      b.sphere(32, canopyY + 26, -18, 34, shade(c, 1.05), 3, 6, 0.9);
      break;
    }
    case 'oak': {
      const h = 130 + rnd(v) * 40;
      b.cylinder(0, 0, 0, 22, 16, h, 7, c2);
      b.cylinder(0, h * 0.6, 0, 8, 5, 50, 4, c2);
      b.sphere(0, h + 34, 0, 78, c, 4, 8, 0.75);
      b.sphere(-44, h + 8, 26, 44, shade(c, 0.92), 3, 6, 0.85);
      b.sphere(46, h + 14, -24, 42, shade(c, 1.06), 3, 6, 0.85);
      break;
    }
    case 'willow': {
      b.cylinder(0, 0, 0, 18, 13, 120, 6, c2);
      b.sphere(0, 150, 0, 66, c, 3, 8, 0.6);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + rnd(v + i);
        const r = 42 + rnd(v + i * 3) * 22;
        b.push();
        b.translate(Math.cos(a) * r, 70, Math.sin(a) * r);
        b.cylinder(0, 0, 0, 4, 2, 78, 3, shade(c, 0.9));
        b.pop();
      }
      break;
    }
    case 'maple': {
      b.cylinder(0, 0, 0, 20, 14, 140, 6, c2);
      b.sphere(0, 176, 0, 72, c, 4, 8, 0.8);
      b.sphere(-38, 150, 24, 40, shade(c, 0.9), 3, 6, 0.9);
      b.sphere(40, 158, -20, 38, shade(c, 1.08), 3, 6, 0.9);
      break;
    }
    case 'yew': {
      b.cylinder(0, 0, 0, 28, 20, 110, 8, c2);
      b.cylinder(-16, 80, 8, 8, 4, 60, 4, c2);
      b.cylinder(18, 86, -10, 8, 4, 54, 4, c2);
      b.sphere(0, 150, 0, 86, c, 4, 8, 0.7);
      b.sphere(-50, 128, 30, 46, shade(c, 0.9), 3, 6, 0.8);
      b.sphere(52, 134, -28, 44, shade(c, 1.05), 3, 6, 0.8);
      break;
    }
    case 'magictree': {
      b.cylinder(0, 0, 0, 20, 14, 150, 6, c2);
      b.sphere(0, 190, 0, 74, c, 4, 8, 0.8);
      b.sphere(-40, 160, 26, 40, mixColour(c, 0xffffff, 0.25), 3, 6, 0.9);
      b.sphere(42, 168, -22, 38, mixColour(c, 0x00ffff, 0.25), 3, 6, 0.9);
      break;
    }
    case 'deadtree': {
      b.cylinder(0, 0, 0, 15, 8, 130, 5, c);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + rnd(v);
        b.push();
        b.translate(0, 70 + i * 14, 0);
        b.rotateY(a);
        b.rotateX(-0.9);
        b.cylinder(0, 0, 0, 6, 2, 60 + rnd(v + i) * 30, 4, shade(c, 0.9));
        b.pop();
      }
      break;
    }
    case 'stump':
      b.cylinder(0, 0, 0, 20, 18, 22, 7, c);
      b.plate(0, 22, 0, 36, 36, shade(c, 1.25));
      break;
    case 'palm': {
      b.push();
      b.rotateZ(0.06);
      b.cylinder(0, 0, 0, 13, 9, 190, 6, c2);
      b.pop();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        b.push();
        b.translate(0, 188, 0);
        b.rotateY(a);
        b.rotateX(-0.55);
        b.quad(-14, 0, 0, 14, 0, 0, 8, 10, 96, -8, 10, 96, c);
        b.pop();
      }
      b.sphere(0, 180, 0, 16, shade(c2, 1.2), 2, 5);
      break;
    }
    case 'cactus':
      b.cylinder(0, 0, 0, 20, 16, 96, 7, c);
      b.push();
      b.translate(-22, 44, 0);
      b.rotateZ(0.6);
      b.cylinder(0, 0, 0, 9, 8, 44, 5, shade(c, 0.9));
      b.pop();
      b.push();
      b.translate(22, 56, 0);
      b.rotateZ(-0.6);
      b.cylinder(0, 0, 0, 9, 8, 40, 5, shade(c, 0.9));
      b.pop();
      break;

    /* ---------------- Rocks & mining ---------------- */
    case 'rock':
      b.rock(0, 0, 0, 40, c, v * 3 + 1);
      break;
    case 'orerock': {
      b.rock(0, 0, 0, 44, 0x7d766d, v * 5 + 2);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + rnd(v);
        b.sphere(Math.cos(a) * 26, 22 + rnd(v + i) * 26, Math.sin(a) * 26, 9, c, 2, 5);
      }
      break;
    }
    case 'boulder':
      b.rock(0, 0, 0, 52, c, v * 7 + 3);
      break;
    case 'rockpile':
      b.rock(-18, 0, 8, 20, c, v + 1);
      b.rock(16, 0, -10, 16, shade(c, 0.9), v + 2);
      b.rock(2, 0, 20, 13, shade(c, 1.1), v + 3);
      break;

    /* ---------------- Walls, doors, fences ---------------- */
    case 'wall':
      b.box(0, 0, -TILE / 2 + 8, TILE, 200, 16, c, shade(c, 1.1), c);
      break;
    case 'lowwall':
      b.box(0, 0, -TILE / 2 + 8, TILE, 72, 16, c, shade(c, 1.15), c);
      break;
    case 'window':
      b.box(0, 0, -TILE / 2 + 8, TILE, 60, 16, c, shade(c, 1.1), c);
      b.box(0, 140, -TILE / 2 + 8, TILE, 60, 16, c, shade(c, 1.1), c);
      b.box(-46, 60, -TILE / 2 + 8, 20, 80, 16, c);
      b.box(46, 60, -TILE / 2 + 8, 20, 80, 16, c);
      b.box(0, 62, -TILE / 2 + 8, 72, 76, 6, 0x6fa8c8);
      break;
    case 'door':
      b.box(0, 0, -TILE / 2 + 8, TILE - 6, 190, 14, c, shade(c, 1.1), c);
      b.box(38, 90, -TILE / 2 + 2, 10, 10, 8, 0xd8c060);
      break;
    case 'dooropen':
      b.push();
      b.translate(-TILE / 2 + 8, 0, -TILE / 2 + 8);
      b.rotateY(Math.PI / 2);
      b.box(TILE / 2 - 8, 0, 0, TILE - 6, 190, 14, c, shade(c, 1.1), c);
      b.pop();
      break;
    case 'gate':
      b.box(0, 0, -TILE / 2 + 8, TILE - 4, 120, 12, c);
      for (let i = 0; i < 4; i++) b.box(-48 + i * 32, 0, -TILE / 2 + 8, 10, 120, 14, shade(c, 0.85));
      break;
    case 'gateopen':
      b.push();
      b.translate(-TILE / 2 + 8, 0, -TILE / 2 + 8);
      b.rotateY(Math.PI / 2.1);
      b.box(TILE / 2 - 8, 0, 0, TILE - 4, 120, 12, c);
      b.pop();
      break;
    case 'fence':
      b.box(-TILE / 2 + 8, 0, -TILE / 2 + 8, 12, 96, 12, shade(c, 0.85));
      b.box(TILE / 2 - 8, 0, -TILE / 2 + 8, 12, 96, 12, shade(c, 0.85));
      b.box(0, 40, -TILE / 2 + 8, TILE, 10, 8, c);
      b.box(0, 74, -TILE / 2 + 8, TILE, 10, 8, c);
      break;
    case 'stile':
      b.box(-40, 0, -TILE / 2 + 8, 12, 90, 12, c);
      b.box(40, 0, -TILE / 2 + 8, 12, 90, 12, c);
      b.box(0, 30, -TILE / 2 + 8, 90, 8, 26, shade(c, 1.1));
      b.box(0, 58, -TILE / 2 + 8, 90, 8, 26, shade(c, 1.1));
      break;
    case 'arch':
      b.box(-TILE / 2 + 10, 0, -TILE / 2 + 8, 20, 200, 20, c);
      b.box(TILE / 2 - 10, 0, -TILE / 2 + 8, 20, 200, 20, c);
      b.box(0, 200, -TILE / 2 + 8, TILE, 24, 22, shade(c, 1.1));
      break;
    case 'pillar':
      b.cylinder(0, 0, 0, 26, 22, 210, 8, c);
      b.box(0, 210, 0, 66, 16, 66, shade(c, 1.15));
      b.box(0, -2, 0, 70, 12, 70, shade(c, 0.9));
      break;
    case 'torch':
      b.box(0, 90, -TILE / 2 + 12, 10, 40, 10, 0x5a4630);
      b.sphere(0, 138, -TILE / 2 + 12, 16, 0xffb020, 2, 5);
      break;

    /* ---------------- Stairs & ladders ---------------- */
    case 'stairs':
    case 'stairsdown': {
      const down = def.model === 'stairsdown';
      for (let i = 0; i < 6; i++) {
        const y = down ? -i * 22 : i * 22;
        b.box(0, y, -TILE + 22 + i * 42, 2 * TILE - 20, 22, 40, c, shade(c, 1.12));
      }
      break;
    }
    case 'ladder':
    case 'ladderdown':
      b.box(-24, 0, -40, 10, 230, 10, c);
      b.box(24, 0, -40, 10, 230, 10, c);
      for (let i = 0; i < 7; i++) b.box(0, 16 + i * 30, -40, 58, 8, 8, shade(c, 1.1));
      break;

    /* ---------------- Furniture ---------------- */
    case 'table':
      b.box(0, 56, 0, TILE - 10, 12, TILE - 10, c, shade(c, 1.15));
      for (const [dx, dz] of [[-46, -46], [46, -46], [-46, 46], [46, 46]]) b.box(dx, 0, dz, 12, 56, 12, shade(c, 0.8));
      break;
    case 'chair':
      b.box(0, 40, 0, 60, 10, 60, c, shade(c, 1.1));
      b.box(0, 50, -26, 60, 56, 10, shade(c, 1.05));
      for (const [dx, dz] of [[-22, -22], [22, -22], [-22, 22], [22, 22]]) b.box(dx, 0, dz, 8, 40, 8, shade(c, 0.8));
      break;
    case 'bed':
      b.box(0, 20, 0, TILE - 16, 22, 2 * TILE - 22, c);
      b.box(0, 42, 20, TILE - 22, 14, 2 * TILE - 60, c2);
      b.box(0, 42, -TILE + 26, TILE - 26, 20, 34, 0xf0f0f0);
      b.box(0, 0, -TILE + 12, TILE - 16, 74, 12, shade(c, 0.85));
      break;
    case 'bookcase':
      b.box(0, 0, -30, TILE - 12, 150, 46, c, shade(c, 1.1));
      for (let s = 0; s < 3; s++) {
        for (let i = 0; i < 7; i++) {
          const bc = [0x8a2a2a, 0x2a5a8a, 0x2a7a3a, 0x8a7a2a][(i + s) % 4];
          b.box(-50 + i * 16, 14 + s * 44, -14, 11, 32, 18, bc);
        }
      }
      break;
    case 'barrel':
      b.cylinder(0, 0, 0, 34, 34, 76, 8, c);
      b.cylinder(0, 18, 0, 37, 37, 8, 8, shade(c, 0.7));
      b.cylinder(0, 52, 0, 37, 37, 8, 8, shade(c, 0.7));
      b.cylinder(0, 76, 0, 34, 34, 4, 8, shade(c, 1.2));
      break;
    case 'crate':
      b.box(0, 0, 0, 92, 84, 92, c, shade(c, 1.15));
      b.box(0, 40, 0, 96, 8, 96, shade(c, 0.8));
      break;
    case 'sacks':
      b.sphere(-22, 20, 0, 30, c, 3, 6, 1.2);
      b.sphere(20, 18, 12, 28, shade(c, 0.92), 3, 6, 1.2);
      b.sphere(4, 46, -8, 24, shade(c, 1.06), 3, 6, 1.2);
      break;
    case 'haystack':
      b.cylinder(0, 0, 0, 54, 44, 80, 8, c);
      b.sphere(0, 74, 0, 46, shade(c, 1.1), 2, 8, 0.6);
      break;
    case 'logpile':
      for (let i = 0; i < 5; i++) {
        b.push();
        b.translate(-40 + (i % 3) * 40, Math.floor(i / 3) * 30, 0);
        b.rotateZ(Math.PI / 2);
        b.cylinder(0, 0, 0, 15, 15, 100, 6, i % 2 ? c : shade(c, 0.9), true, true);
        b.pop();
      }
      break;
    case 'chest':
      b.box(0, 0, 0, 100, 46, 66, c, shade(c, 1.1));
      b.box(0, 46, 0, 100, 26, 66, shade(c, 0.9), shade(c, 1.2));
      b.box(0, 40, -34, 22, 20, 8, 0xd8c060);
      break;
    case 'coffin':
      b.box(0, 0, 0, 66, 40, TILE + 20, c);
      b.box(0, 40, 0, 70, 12, TILE + 24, shade(c, 1.15));
      break;
    case 'candles':
      b.cylinder(0, 0, 0, 10, 8, 40, 5, 0xc0a040);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        b.cylinder(Math.cos(a) * 14, 40, Math.sin(a) * 14, 4, 4, 26, 4, 0xf0e8c0);
        b.sphere(Math.cos(a) * 14, 70, Math.sin(a) * 14, 6, 0xffc040, 2, 4);
      }
      break;
    case 'counter':
      b.box(0, 0, 0, TILE, 84, TILE - 30, c, shade(c, 1.2));
      b.box(0, 84, 0, TILE + 6, 10, TILE - 22, shade(c, 1.3));
      break;
    case 'stall':
      for (const [dx, dz] of [[-100, -40], [100, -40], [-100, 40], [100, 40]]) b.box(dx, 0, dz, 10, 130, 10, 0x6a4a28);
      b.box(0, 60, 0, 2 * TILE - 20, 16, 100, 0x8a6a48);
      for (let i = 0; i < 6; i++) b.box(-90 + i * 36, 130, 0, 34, 12, 110, i % 2 ? c : 0xf0f0f0);
      break;
    case 'rack':
      b.box(-50, 0, 0, 10, 120, 10, c);
      b.box(50, 0, 0, 10, 120, 10, c);
      b.box(0, 110, 0, 110, 8, 8, c);
      b.box(0, 60, 0, 90, 60, 4, 0xa07a4a);
      break;
    case 'clothesline':
      b.box(-56, 0, 0, 8, 110, 8, 0x7a5a38);
      b.box(56, 0, 0, 8, 110, 8, 0x7a5a38);
      b.box(0, 104, 0, 112, 3, 3, 0xd0d0d0);
      b.box(-24, 60, 0, 34, 42, 3, 0xe0e0f0);
      b.box(20, 62, 0, 30, 40, 3, 0xf0e0d0);
      break;
    case 'signpost':
      b.box(0, 0, 0, 12, 110, 12, c);
      b.box(0, 92, 0, 96, 34, 8, shade(c, 1.2));
      break;
    case 'lamppost':
      b.cylinder(0, 0, 0, 8, 6, 160, 5, c);
      b.sphere(0, 172, 0, 18, 0xffd070, 2, 6);
      break;
    case 'gravestone':
      b.box(0, 0, 0, 56, 76, 16, c, shade(c, 1.1));
      b.sphere(0, 76, 0, 28, c, 2, 6, 0.5);
      break;
    case 'well':
      b.cylinder(0, 0, 0, 48, 48, 60, 8, c);
      b.cylinder(0, 52, 0, 40, 40, 8, 8, 0x203a5a);
      b.box(-44, 60, 0, 10, 90, 10, 0x7a5a38);
      b.box(44, 60, 0, 10, 90, 10, 0x7a5a38);
      b.box(0, 150, 0, 110, 12, 70, 0x8a3a2a);
      break;
    case 'fountain':
      b.cylinder(0, 0, 0, 100, 100, 40, 10, c);
      b.cylinder(0, 34, 0, 92, 92, 8, 10, 0x2f6fb0);
      b.cylinder(0, 40, 0, 24, 18, 70, 8, shade(c, 1.1));
      b.sphere(0, 112, 0, 22, 0x6fb0e0, 2, 6);
      break;
    case 'sink':
      b.box(0, 0, -30, 90, 70, 50, c);
      b.box(0, 70, -30, 96, 10, 56, shade(c, 1.15));
      b.cylinder(0, 78, -44, 6, 6, 34, 4, 0x9a9a9a);
      break;
    case 'pump':
      b.box(0, 0, 0, 40, 70, 40, c);
      b.cylinder(0, 70, 0, 8, 8, 50, 5, shade(c, 1.2));
      b.box(0, 100, 18, 12, 8, 40, shade(c, 1.2));
      break;
    case 'cauldron':
      b.cylinder(0, 12, 0, 46, 52, 60, 8, c);
      b.cylinder(0, 66, 0, 48, 48, 6, 8, 0x2a6a2a);
      for (const a of [0.6, 2.7, 4.8]) b.box(Math.cos(a) * 34, 0, Math.sin(a) * 34, 10, 14, 10, shade(c, 0.7));
      break;
    case 'anvil':
      b.box(0, 0, 0, 46, 22, 40, shade(c, 0.8));
      b.box(0, 22, 0, 26, 26, 26, shade(c, 0.9));
      b.box(0, 48, 0, 104, 26, 44, c, shade(c, 1.25));
      b.push();
      b.translate(62, 56, 0);
      b.cylinder(0, 0, 0, 14, 4, 34, 5, shade(c, 1.1));
      b.pop();
      break;
    case 'furnace':
      b.box(0, 0, 0, 2 * TILE - 30, 150, 2 * TILE - 30, c, shade(c, 1.1));
      b.box(0, 20, -TILE + 18, 80, 80, 20, 0x2a1a10);
      b.box(0, 24, -TILE + 12, 66, 56, 12, 0xff8020);
      b.cylinder(40, 150, 40, 26, 20, 90, 6, shade(c, 0.9));
      break;
    case 'range':
      b.box(0, 0, 0, TILE - 14, 96, TILE - 24, c, shade(c, 1.1));
      b.box(0, 16, -TILE / 2 + 12, 70, 56, 14, 0x1a1a1a);
      b.box(0, 20, -TILE / 2 + 6, 58, 42, 8, 0xff7a20);
      b.cylinder(-30, 96, 0, 20, 20, 12, 8, 0x3a3a3a);
      b.cylinder(30, 96, 0, 20, 20, 12, 8, 0x3a3a3a);
      break;
    case 'fire':
      b.cylinder(-24, 0, 6, 9, 9, 18, 5, 0x4a3520);
      b.cylinder(22, 0, -8, 9, 9, 18, 5, 0x4a3520);
      b.cylinder(0, 0, 22, 9, 9, 18, 5, 0x3a2a18);
      b.cylinder(0, 12, 0, 30, 4, 70, 6, 0xff8a20, false);
      b.cylinder(0, 40, 0, 20, 2, 54, 6, 0xffc840, false);
      b.sphere(0, 20, 0, 26, 0xff5a10, 2, 6, 0.8);
      break;
    case 'bankbooth':
      b.box(0, 0, 0, TILE, 96, TILE - 40, c, shade(c, 1.2));
      b.box(0, 96, 0, TILE + 6, 12, TILE - 30, shade(c, 1.3));
      b.box(-TILE / 2 + 8, 96, 0, 14, 110, TILE - 30, c2);
      b.box(TILE / 2 - 8, 96, 0, 14, 110, TILE - 30, c2);
      b.box(0, 190, 0, TILE, 18, TILE - 30, c2);
      break;
    case 'altar':
      b.box(0, 0, 0, 2 * TILE - 30, 80, TILE - 30, c, shade(c, 1.15));
      b.box(0, 80, 0, 2 * TILE - 10, 14, TILE - 16, shade(c, 1.25));
      b.box(0, 94, 0, 2 * TILE - 40, 10, TILE - 40, 0x8f2f2a);
      b.box(-60, 104, 0, 10, 34, 10, 0xd8c060);
      b.box(60, 104, 0, 10, 34, 10, 0xd8c060);
      break;
    case 'spinningwheel':
      b.box(0, 0, 0, 20, 70, 60, c);
      b.push();
      b.translate(0, 96, 0);
      b.rotateZ(Math.PI / 2);
      b.cylinder(0, 0, 0, 54, 54, 8, 12, shade(c, 1.1), false);
      b.pop();
      b.cylinder(0, 90, 0, 8, 8, 12, 6, shade(c, 0.8));
      break;
    case 'potterywheel':
      b.box(0, 0, 0, 60, 60, 60, c);
      b.cylinder(0, 60, 0, 42, 42, 10, 10, shade(c, 1.2));
      break;
    case 'millstone':
      b.cylinder(0, 0, 0, 100, 90, 110, 10, c);
      b.cylinder(0, 110, 0, 84, 60, 40, 10, shade(c, 1.1));
      break;
    case 'windmill':
      b.cylinder(0, 0, 0, 170, 130, 300, 10, c);
      b.cylinder(0, 300, 0, 140, 20, 90, 10, 0x8a3a2a);
      b.push();
      b.translate(0, 250, -150);
      for (let i = 0; i < 4; i++) {
        b.push();
        b.rotateZ((i / 4) * Math.PI * 2);
        b.box(0, 0, 0, 26, 180, 12, 0x9a7a4a);
        b.pop();
      }
      b.pop();
      break;
    case 'tent':
      b.cylinder(0, 0, 0, 110, 0, 150, 4, c);
      b.box(0, 0, -78, 46, 78, 12, shade(c, 0.6));
      break;
    case 'bridge':
      b.plate(0, 6, 0, TILE, TILE, c);
      break;
    case 'roof':
      b.cylinder(0, 0, 0, 100, 0, 60, 4, c);
      break;

    /* ---------------- Plants ---------------- */
    case 'bush':
      b.sphere(0, 6, 0, 36 + rnd(v) * 10, c, 3, 6, 0.7);
      b.sphere(-18, 2, 12, 22, shade(c, 0.9), 2, 5, 0.8);
      break;
    case 'flowers':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + rnd(v);
        const r = 14 + rnd(v + i) * 16;
        b.cylinder(Math.cos(a) * r, 0, Math.sin(a) * r, 2, 2, 20, 3, 0x3a7a2a);
        b.sphere(Math.cos(a) * r, 24, Math.sin(a) * r, 7, c, 2, 5);
      }
      break;
    case 'mushroom':
      b.cylinder(0, 0, 0, 5, 5, 16, 5, 0xe8e0d0);
      b.sphere(0, 18, 0, 14, c, 2, 6, 0.55);
      break;
    case 'reeds':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rnd(v);
        const r = 8 + rnd(v + i) * 22;
        b.push();
        b.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
        b.rotateZ((rnd(v + i * 2) - 0.5) * 0.5);
        b.cylinder(0, 0, 0, 3, 1, 50 + rnd(v + i) * 34, 3, c);
        b.pop();
      }
      break;
    case 'lily':
      b.plate(0, 4, 0, 60, 60, c);
      break;
    case 'wheat':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = 14 + rnd(v + i) * 14;
        b.cylinder(Math.cos(a) * r, 0, Math.sin(a) * r, 3, 2, 58, 3, 0x8a9a3a);
        b.sphere(Math.cos(a) * r, 58, Math.sin(a) * r, 8, c, 2, 4, 1.6);
      }
      break;
    case 'cabbageplant':
      b.sphere(0, 4, 0, 22, c, 3, 6, 0.7);
      b.plate(0, 2, 0, 60, 60, shade(c, 0.7));
      break;

    default:
      b.box(0, 0, 0, 60, 60, 60, c);
  }
}

/** Tile size used by the models, exported for the scene builder. */
export const MODEL_TILE = TILE;
