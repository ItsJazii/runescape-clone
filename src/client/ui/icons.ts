/** Procedurally drawn item icons, in the chunky style of the RuneScape sprites. */

import { itemDef } from '../../shared/data/items.ts';

const W = 36;
const H = 32;
const cache = new Map<number, HTMLCanvasElement>();

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

function shade(c: number, amount: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((c >> 16) & 255) * amount)));
  const g = Math.max(0, Math.min(255, Math.round(((c >> 8) & 255) * amount)));
  const b = Math.max(0, Math.min(255, Math.round((c & 255) * amount)));
  return (r << 16) | (g << 8) | b;
}

export function itemIcon(id: number): HTMLCanvasElement {
  const hit = cache.get(id);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const def = itemDef(id);
  if (def) draw(ctx, def.icon, def.colour, def.colour2 ?? shade(def.colour, 0.65));
  cache.set(id, canvas);
  return canvas;
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: number): void {
  ctx.fillStyle = hex(c);
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][], c: number): void {
  ctx.fillStyle = hex(c);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: number): void {
  ctx.fillStyle = hex(c);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, c: number): void {
  ctx.fillStyle = hex(c);
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Blade-style weapon: handle, guard and a blade polygon. */
function blade(
  ctx: CanvasRenderingContext2D,
  colour: number,
  dark: number,
  opts: { length: number; width: number; curve?: number; guard?: number; tip?: 'point' | 'flat' },
): void {
  const grip = 0x5a3a20;
  rect(ctx, 16, 24, 4, 7, grip);
  rect(ctx, 15, 30, 6, 2, shade(grip, 0.7));
  if (opts.guard) rect(ctx, 18 - opts.guard / 2, 22, opts.guard, 3, dark);
  const cx = 18;
  const top = 24 - opts.length;
  const hw = opts.width / 2;
  const curve = opts.curve ?? 0;
  if (opts.tip === 'flat') {
    poly(ctx, [[cx - hw, 22], [cx + hw, 22], [cx + hw + curve, top], [cx - hw + curve, top]], colour);
  } else {
    poly(ctx, [[cx - hw, 22], [cx + hw, 22], [cx + curve, top]], colour);
  }
  poly(ctx, [[cx - hw, 22], [cx - hw + curve * 0.5, top + 2], [cx + curve * 0.4, top + 1], [cx - 1, 22]], shade(colour, 1.35));
}

function draw(ctx: CanvasRenderingContext2D, icon: string, colour: number, colour2: number): void {
  const dark = shade(colour, 0.65);
  const light = shade(colour, 1.35);
  ctx.imageSmoothingEnabled = false;

  switch (icon) {
    /* ---------------- Currency & misc ---------------- */
    case 'coins':
      for (const [x, y, r] of [[12, 22, 5], [22, 22, 5], [17, 15, 5], [24, 13, 4], [11, 13, 4]] as [number, number, number][]) {
        circle(ctx, x, y, r, colour);
        circle(ctx, x - 1, y - 1, r - 2, light);
      }
      break;
    case 'hammer':
      rect(ctx, 17, 12, 3, 18, 0x6a4a28);
      rect(ctx, 10, 8, 17, 7, colour);
      rect(ctx, 10, 8, 17, 2, light);
      break;
    case 'chisel':
      rect(ctx, 16, 16, 5, 14, 0x6a4a28);
      poly(ctx, [[16, 16], [21, 16], [20, 6], [17, 6]], colour);
      break;
    case 'knife':
      rect(ctx, 16, 20, 4, 10, 0x6a4a28);
      poly(ctx, [[16, 20], [20, 20], [22, 5], [18, 8]], colour);
      break;
    case 'needle':
      poly(ctx, [[16, 28], [19, 28], [19, 5], [17, 3]], colour);
      break;
    case 'thread':
    case 'wool':
      ellipse(ctx, 18, 18, 11, 10, colour);
      ctx.strokeStyle = hex(dark);
      ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.ellipse(18, 18, 11 - Math.abs(i) * 2, 10, i * 0.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case 'spade':
      rect(ctx, 17, 4, 3, 16, 0x6a4a28);
      poly(ctx, [[12, 19], [24, 19], [22, 30], [14, 30]], colour);
      break;
    case 'rope':
      ctx.strokeStyle = hex(colour);
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(18, 17, 11 - i * 3.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case 'tinderbox':
      rect(ctx, 8, 13, 20, 13, colour);
      rect(ctx, 8, 13, 20, 3, light);
      rect(ctx, 15, 10, 6, 4, dark);
      break;
    case 'pot':
      poly(ctx, [[11, 12], [25, 12], [23, 28], [13, 28]], colour);
      ellipse(ctx, 18, 12, 7, 3, light);
      break;
    case 'bucket':
      poly(ctx, [[10, 12], [26, 12], [23, 29], [13, 29]], colour);
      ellipse(ctx, 18, 12, 8, 3, light);
      ctx.strokeStyle = hex(dark);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(18, 12, 8, Math.PI, 0);
      ctx.stroke();
      break;
    case 'jug':
      poly(ctx, [[13, 10], [23, 10], [25, 28], [11, 28]], colour);
      rect(ctx, 23, 14, 4, 8, colour);
      ellipse(ctx, 18, 10, 5, 2, light);
      break;
    case 'vial':
      rect(ctx, 15, 6, 6, 4, 0xd8d8d8);
      poly(ctx, [[14, 10], [22, 10], [23, 28], [13, 28]], colour);
      break;
    case 'egg':
      ellipse(ctx, 18, 18, 8, 11, colour);
      ellipse(ctx, 15, 14, 3, 4, light);
      break;

    /* ---------------- Food ---------------- */
    case 'potato':
      ellipse(ctx, 18, 18, 11, 8, colour);
      circle(ctx, 14, 16, 1.5, dark);
      circle(ctx, 21, 20, 1.5, dark);
      break;
    case 'onion':
      ellipse(ctx, 18, 20, 9, 8, colour);
      poly(ctx, [[16, 12], [20, 12], [19, 4], [17, 4]], 0x6a9a3a);
      break;
    case 'cabbage':
      circle(ctx, 18, 19, 10, colour);
      circle(ctx, 15, 16, 5, shade(colour, 1.25));
      break;
    case 'tomato':
      circle(ctx, 18, 20, 9, colour);
      poly(ctx, [[14, 12], [22, 12], [18, 8]], 0x3a8a3a);
      break;
    case 'cheese':
      poly(ctx, [[8, 24], [28, 24], [28, 14], [8, 20]], colour);
      circle(ctx, 15, 21, 2, dark);
      circle(ctx, 22, 19, 1.5, dark);
      break;
    case 'bread':
      poly(ctx, [[8, 24], [28, 24], [26, 12], [10, 12]], colour);
      rect(ctx, 10, 12, 16, 3, light);
      break;
    case 'cake':
      rect(ctx, 8, 16, 20, 10, colour);
      rect(ctx, 8, 12, 20, 5, 0xf0f0f0);
      circle(ctx, 13, 12, 2, 0xd02030);
      circle(ctx, 23, 12, 2, 0xd02030);
      break;
    case 'kebab':
      rect(ctx, 17, 4, 2, 24, 0xc0c0c0);
      for (let i = 0; i < 3; i++) circle(ctx, 18, 10 + i * 6, 5, i % 2 ? 0x8a4a2a : colour);
      break;
    case 'beer':
      rect(ctx, 12, 10, 12, 18, 0xcfe0e8);
      rect(ctx, 12, 14, 12, 14, colour);
      rect(ctx, 12, 10, 12, 4, 0xf0f0e0);
      break;
    case 'meat':
      ellipse(ctx, 19, 19, 10, 7, colour);
      rect(ctx, 8, 16, 8, 3, 0xe8e0d0);
      break;
    case 'fish':
    case 'fishcooked':
      poly(ctx, [[6, 18], [14, 11], [26, 12], [30, 18], [26, 25], [14, 25]], colour);
      poly(ctx, [[6, 18], [2, 12], [2, 24]], shade(colour, 0.8));
      circle(ctx, 24, 16, 1.6, 0x101010);
      if (icon === 'fishcooked') rect(ctx, 12, 14, 12, 2, light);
      break;
    case 'food':
      ellipse(ctx, 18, 18, 10, 8, colour);
      break;

    /* ---------------- Resources ---------------- */
    case 'bones':
      ctx.save();
      ctx.translate(18, 18);
      ctx.rotate(-0.5);
      rect(ctx, -10, -2, 20, 4, colour);
      circle(ctx, -10, -3, 3, colour);
      circle(ctx, -10, 3, 3, colour);
      circle(ctx, 10, -3, 3, colour);
      circle(ctx, 10, 3, 3, colour);
      ctx.restore();
      break;
    case 'ashes':
      ellipse(ctx, 18, 24, 11, 4, colour);
      ellipse(ctx, 16, 21, 6, 3, shade(colour, 1.4));
      break;
    case 'log':
      ctx.save();
      ctx.translate(18, 18);
      ctx.rotate(-0.35);
      rect(ctx, -13, -6, 26, 12, colour);
      ellipse(ctx, 13, 0, 3, 6, light);
      ellipse(ctx, 13, 0, 1.5, 3, dark);
      ctx.restore();
      break;
    case 'ore':
      poly(ctx, [[8, 24], [12, 12], [22, 9], [28, 18], [24, 26]], 0x7a7268);
      circle(ctx, 15, 18, 3, colour);
      circle(ctx, 22, 15, 2.5, colour);
      circle(ctx, 20, 22, 2, colour);
      break;
    case 'bar':
      poly(ctx, [[7, 22], [11, 15], [27, 15], [29, 22], [25, 25], [11, 25]], colour);
      poly(ctx, [[11, 15], [27, 15], [25, 18], [13, 18]], light);
      break;
    case 'gem':
      poly(ctx, [[10, 20], [14, 11], [24, 11], [28, 20], [19, 27]], colour);
      poly(ctx, [[14, 11], [24, 11], [19, 17]], light);
      break;
    case 'gemcut':
      poly(ctx, [[11, 16], [18, 8], [25, 16], [18, 28]], colour);
      poly(ctx, [[11, 16], [18, 8], [18, 16]], light);
      poly(ctx, [[18, 16], [25, 16], [18, 28]], dark);
      break;
    case 'hide':
      poly(ctx, [[8, 10], [28, 12], [30, 22], [20, 28], [8, 24], [6, 16]], colour);
      circle(ctx, 15, 17, 2.5, dark);
      circle(ctx, 22, 20, 2, dark);
      break;
    case 'leathersheet':
      poly(ctx, [[7, 11], [29, 9], [30, 24], [8, 26]], colour);
      rect(ctx, 10, 13, 16, 2, light);
      break;
    case 'herb':
      for (let i = -1; i <= 1; i++) {
        poly(ctx, [[18, 28], [18 + i * 8, 12], [18 + i * 4, 8]], colour);
      }
      break;
    case 'seed':
      for (const [x, y] of [[13, 20], [19, 17], [22, 22], [16, 24]] as [number, number][]) ellipse(ctx, x, y, 3.5, 2.5, colour);
      break;
    case 'wheat':
      rect(ctx, 17, 14, 2, 16, 0x8a9a3a);
      for (let i = 0; i < 4; i++) {
        ellipse(ctx, 15, 12 + i * 4, 3, 2, colour);
        ellipse(ctx, 21, 12 + i * 4, 3, 2, colour);
      }
      break;
    case 'feather':
      poly(ctx, [[18, 30], [14, 14], [18, 4], [22, 14]], colour);
      rect(ctx, 17.5, 6, 1, 24, shade(colour, 0.75));
      break;
    case 'bait':
      for (const [x, y] of [[13, 18], [20, 15], [18, 23]] as [number, number][]) ellipse(ctx, x, y, 5, 3, colour);
      break;

    /* ---------------- Runes & magic ---------------- */
    case 'rune':
      circle(ctx, 18, 18, 11, shade(colour, 0.55));
      circle(ctx, 18, 18, 9, colour);
      ctx.strokeStyle = hex(light);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(14, 13);
      ctx.lineTo(22, 18);
      ctx.lineTo(14, 23);
      ctx.stroke();
      break;
    case 'essence':
      circle(ctx, 18, 19, 10, colour);
      circle(ctx, 15, 16, 4, light);
      break;
    case 'talisman':
      circle(ctx, 18, 18, 11, 0x8a7a5a);
      circle(ctx, 18, 18, 8, colour);
      circle(ctx, 18, 18, 3, 0x8a7a5a);
      break;
    case 'tiara':
      ctx.strokeStyle = hex(colour);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(18, 20, 10, Math.PI, 0);
      ctx.stroke();
      poly(ctx, [[15, 12], [21, 12], [18, 5]], colour);
      break;

    /* ---------------- Weapons ---------------- */
    case 'dagger':
      blade(ctx, colour, dark, { length: 14, width: 5, guard: 9 });
      break;
    case 'sword':
      blade(ctx, colour, dark, { length: 19, width: 6, guard: 12 });
      break;
    case 'longsword':
      blade(ctx, colour, dark, { length: 21, width: 7, guard: 15 });
      break;
    case 'scimitar':
      blade(ctx, colour, dark, { length: 19, width: 6, curve: 7, guard: 11 });
      break;
    case 'twohand':
      blade(ctx, colour, dark, { length: 23, width: 10, guard: 20 });
      break;
    case 'battleaxe':
      rect(ctx, 17, 8, 3, 22, 0x6a4a28);
      poly(ctx, [[19, 8], [30, 10], [30, 20], [19, 20]], colour);
      poly(ctx, [[17, 8], [6, 10], [6, 20], [17, 20]], colour);
      break;
    case 'hatchet':
      rect(ctx, 15, 8, 3, 22, 0x6a4a28);
      poly(ctx, [[17, 8], [29, 10], [29, 21], [17, 19]], colour);
      poly(ctx, [[17, 8], [29, 10], [26, 12], [17, 11]], light);
      break;
    case 'mace':
      rect(ctx, 17, 14, 3, 16, 0x6a4a28);
      circle(ctx, 18, 11, 7, colour);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        rect(ctx, 18 + Math.cos(a) * 7 - 1.5, 11 + Math.sin(a) * 7 - 1.5, 3, 3, dark);
      }
      break;
    case 'warhammer':
      rect(ctx, 17, 12, 3, 18, 0x6a4a28);
      rect(ctx, 9, 5, 18, 9, colour);
      rect(ctx, 9, 5, 18, 3, light);
      break;
    case 'pickaxe':
      rect(ctx, 17, 10, 3, 20, 0x6a4a28);
      ctx.strokeStyle = hex(colour);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(6, 12);
      ctx.quadraticCurveTo(18, 4, 30, 12);
      ctx.stroke();
      break;
    case 'staff':
      rect(ctx, 17, 6, 3, 25, 0x6a4a28);
      circle(ctx, 18, 6, 6, colour);
      circle(ctx, 17, 5, 3, light);
      break;
    case 'whip':
      ctx.strokeStyle = hex(colour);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(10, 30);
      ctx.bezierCurveTo(4, 16, 28, 20, 26, 6);
      ctx.stroke();
      rect(ctx, 8, 26, 5, 7, 0x3a2a1a);
      break;
    case 'bow':
      ctx.strokeStyle = hex(colour);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(24, 17, 13, Math.PI * 0.55, Math.PI * 1.45);
      ctx.stroke();
      ctx.strokeStyle = '#e8e0d0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(17, 5);
      ctx.lineTo(17, 29);
      ctx.stroke();
      break;
    case 'arrow':
      for (let i = 0; i < 3; i++) {
        const x = 10 + i * 8;
        rect(ctx, x, 8, 2, 20, 0x9a7a4a);
        poly(ctx, [[x - 2, 8], [x + 4, 8], [x + 1, 2]], colour);
        poly(ctx, [[x - 2, 26], [x + 4, 26], [x + 1, 31]], 0xf0f0f0);
      }
      break;
    case 'arrowtip':
      for (const [x, y] of [[12, 20], [20, 16], [22, 24]] as [number, number][]) poly(ctx, [[x - 4, y + 5], [x + 4, y + 5], [x, y - 5]], colour);
      break;
    case 'shaft':
      for (let i = 0; i < 4; i++) rect(ctx, 9 + i * 6, 6, 2, 24, colour);
      break;

    /* ---------------- Armour ---------------- */
    case 'fullhelm':
      poly(ctx, [[9, 26], [9, 14], [18, 5], [27, 14], [27, 26], [22, 26], [22, 18], [14, 18], [14, 26]], colour);
      poly(ctx, [[9, 14], [18, 5], [18, 12], [11, 18]], light);
      break;
    case 'medhelm':
      poly(ctx, [[9, 24], [9, 15], [18, 6], [27, 15], [27, 24]], colour);
      poly(ctx, [[9, 15], [18, 6], [18, 13], [11, 19]], light);
      break;
    case 'cowl':
      poly(ctx, [[9, 26], [10, 13], [18, 6], [26, 13], [27, 26], [18, 22]], colour);
      break;
    case 'wizhat':
      poly(ctx, [[8, 26], [28, 26], [18, 4]], colour);
      rect(ctx, 6, 25, 24, 4, dark);
      break;
    case 'platebody':
      poly(ctx, [[10, 9], [26, 9], [30, 14], [28, 27], [8, 27], [6, 14]], colour);
      poly(ctx, [[10, 9], [18, 9], [18, 27], [8, 27], [6, 14]], light);
      rect(ctx, 14, 6, 8, 4, dark);
      break;
    case 'chainbody':
      poly(ctx, [[10, 9], [26, 9], [29, 14], [27, 27], [9, 27], [7, 14]], colour);
      for (let y = 11; y < 26; y += 3) for (let x = 9; x < 27; x += 3) circle(ctx, x + (y % 6 ? 1.5 : 0), y, 1.2, dark);
      break;
    case 'leatherbody':
      poly(ctx, [[11, 9], [25, 9], [28, 14], [27, 27], [9, 27], [8, 14]], colour);
      rect(ctx, 16, 9, 4, 18, shade(colour, 0.8));
      break;
    case 'robetop':
      poly(ctx, [[12, 8], [24, 8], [29, 16], [27, 28], [9, 28], [7, 16]], colour);
      rect(ctx, 16, 8, 4, 20, light);
      break;
    case 'platelegs':
      poly(ctx, [[9, 6], [27, 6], [27, 28], [20, 28], [18, 16], [16, 28], [9, 28]], colour);
      poly(ctx, [[9, 6], [18, 6], [18, 16], [16, 28], [9, 28]], light);
      break;
    case 'plateskirt':
      poly(ctx, [[11, 6], [25, 6], [30, 28], [6, 28]], colour);
      poly(ctx, [[11, 6], [18, 6], [18, 28], [6, 28]], light);
      break;
    case 'chaps':
      poly(ctx, [[10, 6], [26, 6], [26, 28], [20, 28], [18, 18], [16, 28], [10, 28]], colour);
      break;
    case 'robebottom':
      poly(ctx, [[12, 6], [24, 6], [28, 28], [8, 28]], colour);
      break;
    case 'kiteshield':
      poly(ctx, [[9, 6], [27, 6], [27, 18], [18, 30], [9, 18]], colour);
      poly(ctx, [[9, 6], [18, 6], [18, 30], [9, 18]], light);
      rect(ctx, 16, 12, 4, 10, dark);
      break;
    case 'sqshield':
      poly(ctx, [[9, 7], [27, 7], [26, 22], [18, 29], [10, 22]], colour);
      poly(ctx, [[9, 7], [18, 7], [18, 29], [10, 22]], light);
      break;
    case 'gloves':
      poly(ctx, [[11, 28], [11, 14], [14, 8], [17, 14], [20, 7], [23, 14], [25, 12], [25, 28]], colour);
      break;
    case 'boots':
      poly(ctx, [[11, 8], [21, 8], [21, 22], [29, 22], [29, 28], [11, 28]], colour);
      rect(ctx, 11, 25, 18, 3, dark);
      break;
    case 'cape':
      poly(ctx, [[13, 6], [23, 6], [29, 29], [7, 29]], colour);
      poly(ctx, [[13, 6], [18, 6], [18, 29], [7, 29]], light);
      break;

    /* ---------------- Jewellery ---------------- */
    case 'amulet':
      ctx.strokeStyle = '#d8c060';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(18, 13, 8, Math.PI * 0.15, Math.PI * 0.85, true);
      ctx.stroke();
      poly(ctx, [[14, 17], [22, 17], [18, 27]], colour);
      break;
    case 'ring':
      ctx.strokeStyle = '#e8c040';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(18, 20, 8, 0, Math.PI * 2);
      ctx.stroke();
      poly(ctx, [[14, 11], [22, 11], [18, 4]], colour);
      break;

    /* ---------------- Tools ---------------- */
    case 'net':
      ctx.strokeStyle = hex(colour);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(18, 16, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      for (let i = -8; i <= 8; i += 4) {
        ctx.beginPath();
        ctx.moveTo(18 + i, 8);
        ctx.lineTo(18 + i, 24);
        ctx.moveTo(10, 16 + i);
        ctx.lineTo(26, 16 + i);
        ctx.stroke();
      }
      rect(ctx, 17, 24, 3, 8, 0x6a4a28);
      break;
    case 'rod':
      ctx.strokeStyle = hex(colour);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(6, 30);
      ctx.quadraticCurveTo(20, 20, 30, 4);
      ctx.stroke();
      ctx.strokeStyle = '#d0d0d0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(30, 4);
      ctx.lineTo(26, 20);
      ctx.stroke();
      break;
    case 'harpoon':
      rect(ctx, 16, 10, 3, 20, 0x6a4a28);
      poly(ctx, [[13, 12], [17, 2], [21, 12]], colour);
      poly(ctx, [[11, 14], [13, 8], [15, 14]], colour);
      poly(ctx, [[20, 14], [22, 8], [24, 14]], colour);
      break;

    default:
      rect(ctx, 10, 10, 16, 16, colour);
      rect(ctx, 10, 10, 16, 4, light);
  }
}

export const ICON_WIDTH = W;
export const ICON_HEIGHT = H;
