/**
 * A tiny low-poly mesh builder with a transform stack. Everything in the
 * world (scenery, characters, items) is generated procedurally from these
 * primitives, in the chunky flat-shaded style of the RuneScape models.
 */

export interface Mesh {
  positions: Float32Array;
  normals: Float32Array;
  colours: Float32Array;
  bones: Float32Array;
  count: number;
}

const TMP = new Float32Array(16);

function matIdentity(m: Float32Array): void {
  m.fill(0);
  m[0] = m[5] = m[10] = m[15] = 1;
}

function matMul(out: Float32Array, a: Float32Array, b: Float32Array): void {
  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
    TMP[i * 4] = b0 * a[0] + b1 * a[4] + b2 * a[8] + b3 * a[12];
    TMP[i * 4 + 1] = b0 * a[1] + b1 * a[5] + b2 * a[9] + b3 * a[13];
    TMP[i * 4 + 2] = b0 * a[2] + b1 * a[6] + b2 * a[10] + b3 * a[14];
    TMP[i * 4 + 3] = b0 * a[3] + b1 * a[7] + b2 * a[11] + b3 * a[15];
  }
  out.set(TMP);
}

export class MeshBuilder {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly col: number[] = [];
  private readonly bone: number[] = [];
  private stack: Float32Array[] = [];
  private m: Float32Array;
  private currentBone = 0;

  constructor() {
    this.m = new Float32Array(16);
    matIdentity(this.m);
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  setBone(index: number): void {
    this.currentBone = index;
  }

  push(): void {
    this.stack.push(new Float32Array(this.m));
  }

  pop(): void {
    const m = this.stack.pop();
    if (m) this.m = m;
  }

  translate(x: number, y: number, z: number): void {
    const t = new Float32Array(16);
    matIdentity(t);
    t[12] = x;
    t[13] = y;
    t[14] = z;
    matMul(this.m, this.m, t);
  }

  scale(x: number, y: number, z: number): void {
    const t = new Float32Array(16);
    matIdentity(t);
    t[0] = x;
    t[5] = y;
    t[10] = z;
    matMul(this.m, this.m, t);
  }

  rotateY(angle: number): void {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = new Float32Array(16);
    matIdentity(t);
    t[0] = c; t[2] = -s; t[8] = s; t[10] = c;
    matMul(this.m, this.m, t);
  }

  rotateX(angle: number): void {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = new Float32Array(16);
    matIdentity(t);
    t[5] = c; t[6] = s; t[9] = -s; t[10] = c;
    matMul(this.m, this.m, t);
  }

  rotateZ(angle: number): void {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = new Float32Array(16);
    matIdentity(t);
    t[0] = c; t[1] = s; t[4] = -s; t[5] = c;
    matMul(this.m, this.m, t);
  }

  private tx(x: number, y: number, z: number): [number, number, number] {
    const m = this.m;
    return [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
    ];
  }

  /** Adds a flat-shaded triangle in local space. */
  tri(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    colour: number,
  ): void {
    const a = this.tx(ax, ay, az);
    const b = this.tx(bx, by, bz);
    const c = this.tx(cx, cy, cz);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const r = ((colour >> 16) & 255) / 255;
    const g = ((colour >> 8) & 255) / 255;
    const bl = (colour & 255) / 255;
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(nx, ny, nz);
      this.col.push(r, g, bl);
      this.bone.push(this.currentBone);
    }
  }

  quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    colour: number,
  ): void {
    this.tri(ax, ay, az, bx, by, bz, cx, cy, cz, colour);
    this.tri(ax, ay, az, cx, cy, cz, dx, dy, dz, colour);
  }

  /** Axis-aligned box; (x, y, z) is the centre of its base. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, colour: number, top = colour, side = colour): void {
    const x0 = x - w / 2, x1 = x + w / 2;
    const y0 = y, y1 = y + h;
    const z0 = z - d / 2, z1 = z + d / 2;
    this.quad(x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1, top); // top
    this.quad(x0, y0, z1, x1, y0, z1, x1, y0, z0, x0, y0, z0, shade(colour, 0.6)); // bottom
    this.quad(x0, y0, z1, x0, y1, z1, x1, y1, z1, x1, y0, z1, side); // +z
    this.quad(x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z0, side); // -z
    this.quad(x1, y0, z1, x1, y1, z1, x1, y1, z0, x1, y0, z0, shade(side, 0.88)); // +x
    this.quad(x0, y0, z0, x0, y1, z0, x0, y1, z1, x0, y0, z1, shade(side, 0.88)); // -x
  }

  /** Tapered cylinder / cone; (x, y, z) is the centre of its base. */
  cylinder(
    x: number, y: number, z: number,
    rBottom: number, rTop: number, h: number,
    sides: number, colour: number, capTop = true, capBottom = false,
  ): void {
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      const shadeAmount = 0.82 + 0.18 * (0.5 + 0.5 * Math.cos(a0 - 0.8));
      const c = shade(colour, shadeAmount);
      if (rTop <= 0.001) {
        this.tri(x + c0 * rBottom, y, z + s0 * rBottom, x, y + h, z, x + c1 * rBottom, y, z + s1 * rBottom, c);
      } else {
        this.quad(
          x + c0 * rBottom, y, z + s0 * rBottom,
          x + c0 * rTop, y + h, z + s0 * rTop,
          x + c1 * rTop, y + h, z + s1 * rTop,
          x + c1 * rBottom, y, z + s1 * rBottom,
          c,
        );
      }
      if (capTop && rTop > 0.001) {
        this.tri(x, y + h, z, x + c0 * rTop, y + h, z + s0 * rTop, x + c1 * rTop, y + h, z + s1 * rTop, shade(colour, 1.1));
      }
      if (capBottom) {
        this.tri(x, y, z, x + c1 * rBottom, y, z + s1 * rBottom, x + c0 * rBottom, y, z + s0 * rBottom, shade(colour, 0.6));
      }
    }
  }

  /** Low-poly sphere, flattened by `squash`. */
  sphere(x: number, y: number, z: number, r: number, colour: number, rings = 4, segments = 6, squash = 1): void {
    for (let ring = 0; ring < rings; ring++) {
      const p0 = (ring / rings) * Math.PI;
      const p1 = ((ring + 1) / rings) * Math.PI;
      const y0 = Math.cos(p0) * r * squash;
      const y1 = Math.cos(p1) * r * squash;
      const r0 = Math.sin(p0) * r;
      const r1 = Math.sin(p1) * r;
      for (let seg = 0; seg < segments; seg++) {
        const a0 = (seg / segments) * Math.PI * 2;
        const a1 = ((seg + 1) / segments) * Math.PI * 2;
        const c = shade(colour, 0.85 + 0.15 * (0.5 + 0.5 * Math.cos(a0 - 0.8)));
        const ax = x + Math.cos(a0) * r0, az = z + Math.sin(a0) * r0;
        const bx = x + Math.cos(a1) * r0, bz = z + Math.sin(a1) * r0;
        const cx = x + Math.cos(a1) * r1, cz = z + Math.sin(a1) * r1;
        const dx = x + Math.cos(a0) * r1, dz = z + Math.sin(a0) * r1;
        if (r0 < 0.001) this.tri(ax, y + y0, az, cx, y + y1, cz, dx, y + y1, dz, c);
        else if (r1 < 0.001) this.tri(ax, y + y0, az, bx, y + y0, bz, cx, y + y1, cz, c);
        else this.quad(ax, y + y0, az, bx, y + y0, bz, cx, y + y1, cz, dx, y + y1, dz, c);
      }
    }
  }

  /** Irregular rock built from a jittered icosphere. */
  rock(x: number, y: number, z: number, r: number, colour: number, seed: number): void {
    const rings = 3;
    const segments = 6;
    const jitter = (i: number, j: number) => 0.72 + 0.55 * frac(Math.sin((i * 12.9898 + j * 78.233 + seed) * 43758.5453));
    for (let ring = 0; ring < rings; ring++) {
      const p0 = (ring / rings) * Math.PI;
      const p1 = ((ring + 1) / rings) * Math.PI;
      for (let seg = 0; seg < segments; seg++) {
        const a0 = (seg / segments) * Math.PI * 2;
        const a1 = ((seg + 1) / segments) * Math.PI * 2;
        const pts: [number, number][] = [
          [p0, a0],
          [p0, a1],
          [p1, a1],
          [p1, a0],
        ];
        const v = pts.map(([p, a], k) => {
          const jr = r * jitter(ring + (k > 1 ? 1 : 0), seg + (k === 1 || k === 2 ? 1 : 0));
          return [x + Math.sin(p) * Math.cos(a) * jr, y + (Math.cos(p) * 0.5 + 0.5) * jr * 1.4, z + Math.sin(p) * Math.sin(a) * jr];
        });
        const c = shade(colour, 0.8 + 0.3 * jitter(ring, seg) * 0.5);
        this.quad(v[0][0], v[0][1], v[0][2], v[1][0], v[1][1], v[1][2], v[2][0], v[2][1], v[2][2], v[3][0], v[3][1], v[3][2], c);
      }
    }
  }

  /** Flat plate lying on the ground. */
  plate(x: number, y: number, z: number, w: number, d: number, colour: number): void {
    const x0 = x - w / 2, x1 = x + w / 2;
    const z0 = z - d / 2, z1 = z + d / 2;
    this.quad(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1, colour);
  }

  /** Two crossed vertical quads, used for foliage, reeds and flames. */
  cross(x: number, y: number, z: number, w: number, h: number, colour: number): void {
    const hw = w / 2;
    this.quad(x - hw, y, z, x + hw, y, z, x + hw, y + h, z, x - hw, y + h, z, colour);
    this.quad(x + hw, y, z, x - hw, y, z, x - hw, y + h, z, x + hw, y + h, z, colour);
    this.quad(x, y, z - hw, x, y, z + hw, x, y + h, z + hw, x, y + h, z - hw, shade(colour, 0.9));
    this.quad(x, y, z + hw, x, y, z - hw, x, y + h, z - hw, x, y + h, z + hw, shade(colour, 0.9));
  }

  append(other: Mesh): void {
    for (let i = 0; i < other.count; i++) {
      this.pos.push(other.positions[i * 3], other.positions[i * 3 + 1], other.positions[i * 3 + 2]);
      this.nrm.push(other.normals[i * 3], other.normals[i * 3 + 1], other.normals[i * 3 + 2]);
      this.col.push(other.colours[i * 3], other.colours[i * 3 + 1], other.colours[i * 3 + 2]);
      this.bone.push(other.bones[i]);
    }
  }

  build(): Mesh {
    return {
      positions: new Float32Array(this.pos),
      normals: new Float32Array(this.nrm),
      colours: new Float32Array(this.col),
      bones: new Float32Array(this.bone),
      count: this.pos.length / 3,
    };
  }
}

function frac(v: number): number {
  return v - Math.floor(v);
}

export function shade(colour: number, amount: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((colour >> 16) & 255) * amount)));
  const g = Math.max(0, Math.min(255, Math.round(((colour >> 8) & 255) * amount)));
  const b = Math.max(0, Math.min(255, Math.round((colour & 255) * amount)));
  return (r << 16) | (g << 8) | b;
}

export function mixColour(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

export const EMPTY_MESH: Mesh = {
  positions: new Float32Array(0),
  normals: new Float32Array(0),
  colours: new Float32Array(0),
  bones: new Float32Array(0),
  count: 0,
};
