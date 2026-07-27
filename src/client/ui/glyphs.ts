/**
 * Procedurally drawn interface glyphs: the 23 skill icons, the 29 prayer icons
 * and the 34 spell icons. Each is rendered once into a small offscreen canvas
 * and cached, in the same chunky flat-shaded style as the item sprites in
 * `icons.ts`.
 */

import { PRAYERS } from '../../shared/data/prayers.ts';
import { SPELLS, SpellKind } from '../../shared/data/spells.ts';
import { Skill } from '../../shared/skills.ts';

type Ctx = CanvasRenderingContext2D;

const SKILL_SIZE = 22;
const PRAYER_SIZE = 26;
/** The spellbook cells are 32x25, so the glyphs are drawn on a 24px grid and
 *  scaled down slightly when blitted. */
const SPELL_SIZE = 24;
const SPELL_DRAW_SCALE = 22 / 24;

const skillCache = new Map<number, HTMLCanvasElement>();
const prayerCache = new Map<number, HTMLCanvasElement>();
const spellCache = new Map<number, HTMLCanvasElement>();

function make(size: number, draw: (ctx: Ctx) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  draw(ctx);
  return canvas;
}

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

function box(ctx: Ctx, x: number, y: number, w: number, h: number, colour: string): void {
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, w, h);
}

function shape(ctx: Ctx, points: [number, number][], colour: string): void {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fill();
}

function disc(ctx: Ctx, x: number, y: number, r: number, colour: string): void {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function oval(ctx: Ctx, x: number, y: number, rx: number, ry: number, colour: string, rot = 0): void {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

function stroke(ctx: Ctx, points: [number, number][], colour: string, width: number): void {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.stroke();
}

function ring(ctx: Ctx, x: number, y: number, r: number, colour: string, width: number): void {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

/** A four-pointed sparkle, used by the magic-flavoured icons. */
function star(ctx: Ctx, x: number, y: number, r: number, colour: string): void {
  const t = r * 0.28;
  shape(ctx, [[x, y - r], [x + t, y - t], [x + r, y], [x + t, y + t], [x, y + r], [x - t, y + t], [x - r, y], [x - t, y - t]], colour);
}

/** A flame, used by Firemaking and the fire spells. */
function flame(ctx: Ctx, x: number, y: number, h: number): void {
  shape(ctx, [[x, y - h], [x + h * 0.55, y - h * 0.15], [x + h * 0.42, y + h * 0.45], [x, y + h * 0.6], [x - h * 0.42, y + h * 0.45], [x - h * 0.55, y - h * 0.15]], '#e05a10');
  shape(ctx, [[x, y - h * 0.62], [x + h * 0.34, y], [x + h * 0.22, y + h * 0.4], [x, y + h * 0.5], [x - h * 0.22, y + h * 0.4], [x - h * 0.34, y]], '#f8a820');
  shape(ctx, [[x, y - h * 0.28], [x + h * 0.16, y + h * 0.12], [x, y + h * 0.38], [x - h * 0.16, y + h * 0.12]], '#ffe870');
}

/** A shield outline, used by Defence and the defensive prayers. */
function shield(ctx: Ctx, cx: number, cy: number, w: number, h: number, face: string, edge: string): void {
  const hw = w / 2;
  shape(ctx, [[cx - hw, cy - h / 2], [cx + hw, cy - h / 2], [cx + hw, cy + h * 0.1], [cx, cy + h / 2], [cx - hw, cy + h * 0.1]], edge);
  shape(ctx, [[cx - hw + 1.5, cy - h / 2 + 1.5], [cx + hw - 1.5, cy - h / 2 + 1.5], [cx + hw - 1.5, cy + h * 0.08], [cx, cy + h / 2 - 2], [cx - hw + 1.5, cy + h * 0.08]], face);
}

/** A sword pointing up, used by Attack and the melee prayers. */
function sword(ctx: Ctx, cx: number, top: number, len: number, blade: string, hilt: string): void {
  box(ctx, cx - 1.5, top, 3, len * 0.72, blade);
  shape(ctx, [[cx - 1.5, top], [cx + 1.5, top], [cx, top - 3]], blade);
  box(ctx, cx - 4, top + len * 0.72, 8, 2, hilt);
  box(ctx, cx - 1, top + len * 0.72 + 2, 2, len * 0.22, hilt);
}

/* ------------------------------------------------------------------ */
/* Skill icons                                                         */
/* ------------------------------------------------------------------ */

const SKILL_DRAW: Record<number, (ctx: Ctx) => void> = {
  [Skill.ATTACK]: (c) => {
    // Crossed sword and a stubby dagger, like the stats-tab attack icon.
    c.save();
    c.translate(11, 11);
    c.rotate(0.6);
    sword(c, 0, -9, 18, '#cfd4dc', '#7a5a2a');
    c.restore();
    c.save();
    c.translate(11, 11);
    c.rotate(-0.6);
    sword(c, 0, -9, 18, '#9aa0a8', '#5a4020');
    c.restore();
  },
  [Skill.HITPOINTS]: (c) => {
    shape(c, [[11, 20], [3, 11], [3, 7], [6, 4], [11, 7], [16, 4], [19, 7], [19, 11]], '#8a1010');
    shape(c, [[11, 18], [4.5, 10.5], [4.5, 7.5], [6.5, 5.5], [11, 8.5], [15.5, 5.5], [17.5, 7.5], [17.5, 10.5]], '#d82020');
    oval(c, 8, 8.5, 2, 1.6, '#f07070', -0.5);
  },
  [Skill.MINING]: (c) => {
    box(c, 10, 8, 2.5, 13, '#8a6030');
    stroke(c, [[3, 8], [11, 3], [19, 8]], '#8f96a0', 3.4);
    stroke(c, [[3, 8], [11, 3.6]], '#c2c8d0', 1.4);
  },
  [Skill.STRENGTH]: (c) => {
    // A flexed arm.
    shape(c, [[3, 17], [3, 12], [7, 9], [12, 9], [12, 17]], '#c08a58');
    shape(c, [[12, 9], [17, 6], [20, 9], [20, 13], [15, 13], [12, 11]], '#d09a66');
    box(c, 3, 16, 10, 4, '#8a5a30');
    oval(c, 8, 12.5, 3.4, 2.6, '#e0aa78');
  },
  [Skill.AGILITY]: (c) => {
    // A running boot.
    shape(c, [[4, 5], [10, 5], [10, 13], [19, 15], [19, 19], [4, 19]], '#4a6ab0');
    box(c, 4, 18, 15, 2.5, '#2a3a70');
    box(c, 5, 6.5, 4, 2, '#7a9ae0');
  },
  [Skill.SMITHING]: (c) => {
    box(c, 10, 8, 2.5, 12, '#8a6030');
    box(c, 4, 3, 15, 6, '#8f96a0');
    box(c, 4, 3, 15, 2, '#c2c8d0');
    box(c, 4, 8, 15, 1.5, '#5f666e');
  },
  [Skill.DEFENCE]: (c) => {
    shield(c, 11, 11, 15, 17, '#b03028', '#7a7a84');
    box(c, 10, 6, 2, 10, '#e8e0c0');
    box(c, 6, 9.5, 10, 2, '#e8e0c0');
  },
  [Skill.HERBLORE]: (c) => {
    box(c, 8, 3, 6, 3, '#c8ccd4');
    shape(c, [[7, 6], [15, 6], [17, 20], [5, 20]], '#c8d4e0');
    shape(c, [[6.4, 12], [15.6, 12], [17, 20], [5, 20]], '#3aa03a');
    oval(c, 9, 14, 1.6, 1.2, '#8ae08a');
  },
  [Skill.FISHING]: (c) => {
    shape(c, [[3, 12], [8, 7], [16, 7], [20, 12], [16, 17], [8, 17]], '#6a9ac0');
    shape(c, [[3, 12], [0.5, 7], [0.5, 17]], '#4a7aa0');
    shape(c, [[8, 7], [16, 7], [16, 11], [8, 11]], '#8ab8dc');
    disc(c, 15, 11, 1.4, '#101018');
  },
  [Skill.RANGED]: (c) => {
    ring(c, 15, 11, 9, '#8a6030', 2.6);
    box(c, 15, 1, 8, 21, 'rgba(0,0,0,0)');
    c.clearRect(15, 0, 8, 22);
    ring(c, 15, 11, 9, '#8a6030', 2.6);
    c.clearRect(16, 0, 7, 22);
    stroke(c, [[15, 2], [15, 20]], '#e8e0d0', 1);
    stroke(c, [[3, 11], [18, 11]], '#a8a8b0', 1.6);
    shape(c, [[18, 8], [22, 11], [18, 14]], '#c8ccd4');
    shape(c, [[3, 8.5], [6, 11], [3, 13.5]], '#f0f0f0');
  },
  [Skill.THIEVING]: (c) => {
    // A coin purse.
    shape(c, [[5, 9], [17, 9], [19, 20], [3, 20]], '#7a5230');
    shape(c, [[6, 11], [16, 11], [17.5, 18.5], [4.5, 18.5]], '#9a6a3e');
    stroke(c, [[7, 9], [8, 4], [14, 4], [15, 9]], '#5a3a20', 2);
    disc(c, 11, 15, 3, '#e8c040');
    disc(c, 11, 15, 1.6, '#f8e080');
  },
  [Skill.COOKING]: (c) => {
    stroke(c, [[6, 6], [8, 2]], '#d0d0d8', 1.2);
    stroke(c, [[11, 5], [11, 1]], '#d0d0d8', 1.2);
    stroke(c, [[16, 6], [14, 2]], '#d0d0d8', 1.2);
    shape(c, [[3, 8], [19, 8], [17, 20], [5, 20]], '#4a4a52');
    box(c, 2, 7, 18, 2.4, '#6a6a74');
    shape(c, [[4.6, 10.4], [17.4, 10.4], [16.6, 14], [5.4, 14]], '#b0702a');
  },
  [Skill.PRAYER]: (c) => {
    // Two hands pressed together over a cuff, on a soft golden halo.
    disc(c, 11, 10, 9, '#6a5a2a');
    shape(c, [[11, 2], [16, 9], [16, 16], [11, 18]], '#f0e8d8');
    shape(c, [[11, 2], [6, 9], [6, 16], [11, 18]], '#cfc6b2');
    stroke(c, [[11, 4], [11, 17]], '#a89a86', 1);
    box(c, 5, 16, 12, 4, '#e8c040');
    box(c, 5, 16, 12, 1.5, '#f8e890');
  },
  [Skill.CRAFTING]: (c) => {
    // Needle and thread.
    shape(c, [[13, 21], [16, 21], [16, 5], [14.5, 2]], '#c8ccd4');
    disc(c, 15, 6, 1.2, '#3f382c');
    ctxThread(c);
  },
  [Skill.FIREMAKING]: (c) => {
    box(c, 3, 17, 16, 3, '#6a4a28');
    flame(c, 11, 10, 9);
  },
  [Skill.MAGIC]: (c) => {
    star(c, 8, 8, 7, '#4a6ad8');
    star(c, 15, 14, 5, '#7a9aff');
    star(c, 16, 5, 3.4, '#c8d8ff');
  },
  [Skill.FLETCHING]: (c) => {
    stroke(c, [[3, 19], [19, 3]], '#8a6030', 2);
    shape(c, [[16, 1], [21, 6], [17, 7], [15, 5]], '#c8ccd4');
    shape(c, [[3, 19], [7, 15], [9, 17], [5, 21]], '#e0e0e8');
    shape(c, [[6, 12], [10, 16], [7, 17], [5, 15]], '#3a8a3a');
  },
  [Skill.WOODCUTTING]: (c) => {
    c.save();
    c.translate(11, 11);
    c.rotate(-0.5);
    box(c, -1.4, -9, 2.8, 19, '#8a6030');
    shape(c, [[1.4, -9], [10, -7], [10, 1], [1.4, -1]], '#8f96a0');
    shape(c, [[1.4, -9], [10, -7], [7, -5.5], [1.4, -6.5]], '#c2c8d0');
    c.restore();
    oval(c, 6, 17, 6, 3.4, '#6a4a28');
    oval(c, 6, 17, 2.6, 1.4, '#9a7a50');
  },
  [Skill.RUNECRAFT]: (c) => {
    disc(c, 11, 11, 9, '#5a5a68');
    disc(c, 11, 11, 7, '#8a8a9a');
    stroke(c, [[8, 6], [14, 11], [8, 16]], '#e8e8f8', 2.2);
  },
  [Skill.SLAYER]: (c) => {
    // A horned skull.
    shape(c, [[2, 5], [6, 8], [5, 4]], '#c8c0a8');
    shape(c, [[20, 5], [16, 8], [17, 4]], '#c8c0a8');
    shape(c, [[4, 12], [4, 7], [11, 3], [18, 7], [18, 12], [14, 18], [8, 18]], '#dcd6c0');
    disc(c, 8, 10, 2.2, '#20201c');
    disc(c, 14, 10, 2.2, '#20201c');
    box(c, 9, 14, 4, 4, '#20201c');
  },
  [Skill.FARMING]: (c) => {
    box(c, 10, 9, 2, 12, '#4a7a2a');
    shape(c, [[11, 12], [3, 9], [4, 4], [11, 8]], '#4a9a3a');
    shape(c, [[11, 11], [19, 8], [18, 3], [11, 7]], '#5faa42');
    box(c, 3, 19, 16, 2.4, '#6a5535');
  },
  [Skill.CONSTRUCTION]: (c) => {
    // Hammer crossed with a saw.
    c.save();
    c.translate(11, 11);
    c.rotate(0.55);
    box(c, -1.2, -9, 2.4, 18, '#8a6030');
    box(c, -5, -10, 10, 4, '#8f96a0');
    c.restore();
    c.save();
    c.translate(11, 12);
    c.rotate(-0.6);
    shape(c, [[-9, 2], [7, -2], [8, 2], [-9, 5]], '#c2c8d0');
    box(c, 6, -2, 4, 5, '#7a5230');
    c.restore();
  },
  [Skill.HUNTER]: (c) => {
    // A box trap with a paw print.
    shape(c, [[3, 19], [3, 9], [11, 5], [19, 9], [19, 19]], '#8a6a3e');
    shape(c, [[4.5, 18], [4.5, 10], [11, 6.8], [17.5, 10], [17.5, 18]], '#a88a5e');
    disc(c, 11, 14.5, 3, '#5a3a20');
    disc(c, 7.6, 11.4, 1.4, '#5a3a20');
    disc(c, 11, 10, 1.4, '#5a3a20');
    disc(c, 14.4, 11.4, 1.4, '#5a3a20');
  },
};

/** The wound thread on the crafting icon. */
function ctxThread(c: Ctx): void {
  c.strokeStyle = '#c03040';
  c.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.ellipse(7, 14, 5.5 - i * 1.1, 5 - i * 0.4, i * 0.6, 0, Math.PI * 2);
    c.stroke();
  }
  oval(c, 7, 14, 5.6, 5.2, 'rgba(200,48,64,0.35)');
}

export function skillIcon(skill: number): HTMLCanvasElement {
  const hit = skillCache.get(skill);
  if (hit) return hit;
  const canvas = make(SKILL_SIZE, (ctx) => SKILL_DRAW[skill]?.(ctx));
  skillCache.set(skill, canvas);
  return canvas;
}

/* ------------------------------------------------------------------ */
/* Prayer icons                                                        */
/* ------------------------------------------------------------------ */

/**
 * Prayers are grouped by what they boost; each family shares a base glyph and
 * gains detail with its tier, so the book reads at a glance the way the real
 * prayer interface does.
 */
type PrayerFamily =
  | 'defence'
  | 'strength'
  | 'attack'
  | 'ranged'
  | 'magic'
  | 'restore'
  | 'heal'
  | 'item'
  | 'protect-magic'
  | 'protect-missiles'
  | 'protect-melee'
  | 'retribution'
  | 'redemption'
  | 'smite'
  | 'preserve'
  | 'chivalry'
  | 'piety'
  | 'rigour'
  | 'augury';

const PRAYER_FAMILY: Record<string, PrayerFamily> = {
  'Thick Skin': 'defence',
  'Rock Skin': 'defence',
  'Steel Skin': 'defence',
  'Burst of Strength': 'strength',
  'Superhuman Strength': 'strength',
  'Ultimate Strength': 'strength',
  'Clarity of Thought': 'attack',
  'Improved Reflexes': 'attack',
  'Incredible Reflexes': 'attack',
  'Sharp Eye': 'ranged',
  'Hawk Eye': 'ranged',
  'Eagle Eye': 'ranged',
  'Mystic Will': 'magic',
  'Mystic Lore': 'magic',
  'Mystic Might': 'magic',
  'Rapid Restore': 'restore',
  'Rapid Heal': 'heal',
  'Protect Item': 'item',
  'Protect from Magic': 'protect-magic',
  'Protect from Missiles': 'protect-missiles',
  'Protect from Melee': 'protect-melee',
  Retribution: 'retribution',
  Redemption: 'redemption',
  Smite: 'smite',
  Preserve: 'preserve',
  Chivalry: 'chivalry',
  Piety: 'piety',
  Rigour: 'rigour',
  Augury: 'augury',
};

/** 1, 2 or 3 for the three tiers within a family. */
function prayerTier(name: string): number {
  const tiers: Record<string, number> = {
    'Thick Skin': 1,
    'Rock Skin': 2,
    'Steel Skin': 3,
    'Burst of Strength': 1,
    'Superhuman Strength': 2,
    'Ultimate Strength': 3,
    'Clarity of Thought': 1,
    'Improved Reflexes': 2,
    'Incredible Reflexes': 3,
    'Sharp Eye': 1,
    'Hawk Eye': 2,
    'Eagle Eye': 3,
    'Mystic Will': 1,
    'Mystic Lore': 2,
    'Mystic Might': 3,
  };
  return tiers[name] ?? 1;
}

const TIER_METAL = ['#8a6a3e', '#9aa0aa', '#e8c040'];

function drawPrayer(ctx: Ctx, family: PrayerFamily, tier: number): void {
  const metal = TIER_METAL[tier - 1];
  const cx = 13;
  const cy = 13;
  switch (family) {
    case 'defence':
      shield(ctx, cx, cy, 16, 18, metal, '#4a4a52');
      for (let i = 0; i < tier; i++) box(ctx, cx - 5 + i * 4, cy - 5, 2, 10, '#2e2a24');
      break;
    case 'strength':
      shape(ctx, [[5, 19], [5, 13], [9, 10], [14, 10], [14, 19]], metal);
      shape(ctx, [[14, 10], [19, 7], [22, 11], [22, 15], [16, 14]], metal);
      box(ctx, 5, 18, 9, 3, '#2e2a24');
      for (let i = 0; i < tier; i++) box(ctx, 6 + i * 3, 14, 1.6, 4, '#2e2a24');
      break;
    case 'attack':
      // A helmeted head: the "clarity/reflexes" family.
      shape(ctx, [[6, 20], [6, 10], [13, 4], [20, 10], [20, 20]], metal);
      box(ctx, 6, 12, 14, 2.4, '#2e2a24');
      for (let i = 0; i < tier; i++) box(ctx, 8 + i * 4, 15, 2, 5, '#2e2a24');
      break;
    case 'ranged':
      oval(ctx, cx, cy, 9, 6, '#e8e0d0');
      disc(ctx, cx, cy, 4.2, metal);
      disc(ctx, cx, cy, 2, '#1a1a20');
      for (let i = 0; i < tier; i++) box(ctx, 4, 4 + i * 3, 4, 1.6, metal);
      break;
    case 'magic':
      star(ctx, cx, cy, 9, '#4a6ad8');
      star(ctx, cx, cy, 5, metal);
      for (let i = 0; i < tier; i++) star(ctx, 5 + i * 8, 5, 2.2, '#c8d8ff');
      break;
    case 'restore':
      // An hourglass.
      shape(ctx, [[6, 4], [20, 4], [14, 13], [20, 22], [6, 22], [12, 13]], '#c8ccd4');
      shape(ctx, [[8, 6], [18, 6], [13, 13]], '#4a9ae0');
      shape(ctx, [[13, 13], [18, 20], [8, 20]], '#4a9ae0');
      break;
    case 'heal':
      shape(ctx, [[13, 22], [4, 12], [4, 8], [7, 5], [13, 9], [19, 5], [22, 8], [22, 12]], '#d82020');
      box(ctx, 11.5, 9, 3, 9, '#ffffff');
      box(ctx, 8, 12.5, 10, 3, '#ffffff');
      break;
    case 'item':
      shape(ctx, [[6, 10], [20, 10], [22, 22], [4, 22]], '#7a5230');
      stroke(ctx, [[9, 10], [10, 5], [16, 5], [17, 10]], '#5a3a20', 2.2);
      disc(ctx, 13, 16, 3.4, '#e8c040');
      break;
    case 'protect-magic':
      shield(ctx, cx, cy, 17, 19, '#3a4ab0', '#c8ccd4');
      star(ctx, cx, cy - 1, 6, '#e8e8ff');
      break;
    case 'protect-missiles':
      shield(ctx, cx, cy, 17, 19, '#2f7a3a', '#c8ccd4');
      stroke(ctx, [[6, 17], [19, 6]], '#e8e8d0', 2);
      shape(ctx, [[19, 4], [21, 10], [15, 8]], '#e8e8d0');
      break;
    case 'protect-melee':
      shield(ctx, cx, cy, 17, 19, '#a02828', '#c8ccd4');
      sword(ctx, cx, 5, 15, '#e8e8f0', '#4a3a20');
      break;
    case 'retribution':
      disc(ctx, cx, cy, 9, '#d8a020');
      disc(ctx, cx, cy, 6, '#f8e070');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        box(ctx, cx + Math.cos(a) * 9 - 1, cy + Math.sin(a) * 9 - 1, 2.4, 2.4, '#d8a020');
      }
      break;
    case 'redemption':
      shape(ctx, [[13, 22], [4, 12], [4, 8], [7, 5], [13, 9], [19, 5], [22, 8], [22, 12]], '#e8e8f0');
      shape(ctx, [[13, 19], [7, 12], [7, 9], [8.5, 7.5], [13, 11], [17.5, 7.5], [19, 9], [19, 12]], '#40b040');
      break;
    case 'smite':
      shape(ctx, [[4, 12], [4, 7], [13, 3], [22, 7], [22, 12], [18, 19], [8, 19]], '#dcd6c0');
      disc(ctx, 9.5, 11, 2.4, '#20201c');
      disc(ctx, 16.5, 11, 2.4, '#20201c');
      box(ctx, 11, 15, 4, 4, '#20201c');
      break;
    case 'preserve':
      ring(ctx, cx, cy, 8, '#e8c040', 2.6);
      stroke(ctx, [[13, 7], [13, 13], [18, 15]], '#e8c040', 2);
      break;
    case 'chivalry':
      shield(ctx, cx, cy, 17, 19, '#b03028', '#e8c040');
      sword(ctx, cx, 5, 14, '#f0f0f8', '#8a6a2a');
      break;
    case 'piety':
      shield(ctx, cx, cy, 17, 19, '#e8c040', '#f8f0c0');
      sword(ctx, cx, 5, 14, '#ffffff', '#7a5a20');
      star(ctx, 20, 5, 3, '#ffffff');
      break;
    case 'rigour':
      oval(ctx, cx, cy, 9.5, 7, '#e8c040');
      disc(ctx, cx, cy, 4.4, '#2f7a3a');
      disc(ctx, cx, cy, 2, '#101014');
      star(ctx, 21, 4, 3, '#ffffff');
      break;
    case 'augury':
      star(ctx, cx, cy, 10, '#6a4ad8');
      star(ctx, cx, cy, 6, '#e8c040');
      star(ctx, 21, 4, 3, '#ffffff');
      break;
  }
}

export function prayerIcon(id: number): HTMLCanvasElement {
  const hit = prayerCache.get(id);
  if (hit) return hit;
  const def = PRAYERS[id];
  const canvas = make(PRAYER_SIZE, (ctx) => {
    if (!def) return;
    drawPrayer(ctx, PRAYER_FAMILY[def.name] ?? 'defence', prayerTier(def.name));
  });
  prayerCache.set(id, canvas);
  return canvas;
}

/* ------------------------------------------------------------------ */
/* Spell icons                                                         */
/* ------------------------------------------------------------------ */

const ELEMENT_COLOUR: Record<string, [string, string]> = {
  air: ['#c8d8e8', '#f0f8ff'],
  water: ['#3a6ac8', '#7ab0f0'],
  earth: ['#7a5a2a', '#b09050'],
  fire: ['#c83a10', '#f89020'],
};

/** Combat spells are Strike -> Bolt -> Blast -> Wave; the tier sets the shape. */
function combatTier(name: string): number {
  if (name.includes('Strike')) return 1;
  if (name.includes('Bolt')) return 2;
  if (name.includes('Blast')) return 3;
  if (name.includes('Wave')) return 4;
  return 1;
}

function drawCombatSpell(ctx: Ctx, element: string, tier: number): void {
  const [dark, light] = ELEMENT_COLOUR[element] ?? ['#8a8aa0', '#c8c8e0'];
  const cx = 12;
  const cy = 12;
  switch (tier) {
    case 1: // Strike: a single dart.
      shape(ctx, [[cx, 2], [cx + 5, cy], [cx, 21], [cx - 5, cy]], dark);
      shape(ctx, [[cx, 5], [cx + 2.6, cy], [cx, 18], [cx - 2.6, cy]], light);
      break;
    case 2: // Bolt: a forked bolt.
      shape(ctx, [[cx - 1, 2], [cx + 6, 10], [cx + 1, 10], [cx + 5, 22], [cx - 6, 12], [cx - 1, 12]], dark);
      shape(ctx, [[cx - 1, 5], [cx + 3.4, 10.6], [cx + 0.6, 11], [cx + 2.6, 18], [cx - 3.6, 12.4], [cx - 0.6, 12]], light);
      break;
    case 3: // Blast: a burst.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        shape(
          ctx,
          [
            [cx + Math.cos(a) * 11, cy + Math.sin(a) * 11],
            [cx + Math.cos(a + 0.4) * 4, cy + Math.sin(a + 0.4) * 4],
            [cx + Math.cos(a - 0.4) * 4, cy + Math.sin(a - 0.4) * 4],
          ],
          dark,
        );
      }
      disc(ctx, cx, cy, 5, light);
      break;
    default: // Wave: three stacked crests.
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = i === 1 ? light : dark;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(1, 6 + i * 6);
        ctx.quadraticCurveTo(7, 1 + i * 6, 12, 6 + i * 6);
        ctx.quadraticCurveTo(17, 11 + i * 6, 23, 6 + i * 6);
        ctx.stroke();
      }
      break;
  }
}

const CITY_COLOUR: Record<string, string> = {
  'Varrock Teleport': '#a03028',
  'Lumbridge Teleport': '#3a6ac8',
  'Falador Teleport': '#c8c8d0',
  'Camelot Teleport': '#3a8a4a',
};

function drawSpell(ctx: Ctx, id: number): void {
  const spell = SPELLS[id];
  if (!spell) return;

  if (spell.kind === SpellKind.COMBAT) {
    drawCombatSpell(ctx, spell.element ?? 'air', combatTier(spell.name));
    if (spell.effect === 'undeadonly') {
      // Crumble Undead gets a skull so it is not mistaken for Earth Bolt.
      shape(ctx, [[6, 13], [6, 8], [12, 4], [18, 8], [18, 13], [15, 18], [9, 18]], '#dcd6c0');
      disc(ctx, 9.5, 11, 2, '#20201c');
      disc(ctx, 14.5, 11, 2, '#20201c');
    }
    return;
  }

  if (spell.kind === SpellKind.TELEPORT) {
    // A rune tablet with a swirl.
    shape(ctx, [[4, 3], [20, 3], [20, 21], [4, 21]], '#6a5230');
    shape(ctx, [[6, 5], [18, 5], [18, 19], [6, 19]], CITY_COLOUR[spell.name] ?? '#8a8ac0');
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const a = t * Math.PI * 3;
      const r = 1 + t * 5.5;
      const px = 12 + Math.cos(a) * r;
      const py = 12 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    return;
  }

  if (spell.kind === SpellKind.CURSE) {
    const tint: Record<string, string> = {
      Confuse: '#9a4ac0',
      Weaken: '#6a3aa0',
      Curse: '#4a2a80',
      Bind: '#3a8a6a',
    };
    disc(ctx, 12, 12, 10, tint[spell.name] ?? '#7a3aa0');
    disc(ctx, 12, 12, 7, '#1a1024');
    if (spell.name === 'Bind') {
      for (let i = 0; i < 3; i++) box(ctx, 5, 8 + i * 4, 14, 2, '#8ae0c0');
    } else {
      // A downward arrow: the stat is being drained.
      box(ctx, 11, 6, 2.4, 8, '#e8d8ff');
      shape(ctx, [[8, 13], [16, 13], [12, 18]], '#e8d8ff');
      for (let i = 1; i < combatCurseTier(spell.name); i++) box(ctx, 6 + i * 5, 5, 2, 2, '#e8d8ff');
    }
    return;
  }

  if (spell.kind === SpellKind.ENCHANT) {
    const gems: Record<string, string> = {
      'Enchant Sapphire': '#2a5ad0',
      'Enchant Emerald': '#2aa04a',
      'Enchant Ruby': '#c02030',
      'Enchant Diamond': '#d8e8f0',
    };
    const colour = gems[spell.name] ?? '#c060c0';
    shape(ctx, [[6, 11], [12, 3], [18, 11], [12, 21]], colour);
    shape(ctx, [[6, 11], [12, 3], [12, 11]], '#ffffff');
    star(ctx, 19, 5, 3.4, '#ffffff');
    return;
  }

  if (spell.kind === SpellKind.ALCHEMY) {
    disc(ctx, 9, 15, 5, '#c8a020');
    disc(ctx, 8, 14, 3.4, '#f0d860');
    disc(ctx, 15, 11, 5, '#c8a020');
    disc(ctx, 14, 10, 3.4, '#f0d860');
    flame(ctx, 18, 18, 5);
    return;
  }

  // Utility spells each get their own glyph.
  switch (spell.effect) {
    case 'bonestobananas':
      shape(ctx, [[4, 16], [8, 5], [12, 4], [10, 8], [8, 17], [6, 19]], '#e8d040');
      shape(ctx, [[11, 18], [15, 7], [19, 6], [17, 10], [15, 19], [13, 21]], '#f0e070');
      break;
    case 'telegrab':
      // A reaching hand.
      shape(ctx, [[7, 21], [7, 12], [9, 5], [11, 5], [10, 12], [12, 12], [12, 4], [14, 4], [14, 12], [16, 12], [16, 6], [18, 6], [18, 21]], '#d8b088');
      star(ctx, 5, 6, 3.4, '#c8d8ff');
      break;
    case 'superheat':
      shape(ctx, [[4, 15], [7, 10], [19, 10], [21, 15], [18, 18], [7, 18]], '#c8a020');
      flame(ctx, 12, 7, 6);
      break;
    default:
      star(ctx, 12, 12, 9, '#8a8ac0');
  }
}

function combatCurseTier(name: string): number {
  return name === 'Confuse' ? 1 : name === 'Weaken' ? 2 : 3;
}

export function spellIcon(id: number): HTMLCanvasElement {
  const hit = spellCache.get(id);
  if (hit) return hit;
  const canvas = make(Math.round(SPELL_SIZE * SPELL_DRAW_SCALE), (ctx) => {
    ctx.scale(SPELL_DRAW_SCALE, SPELL_DRAW_SCALE);
    drawSpell(ctx, id);
  });
  spellCache.set(id, canvas);
  return canvas;
}

export { SKILL_SIZE, PRAYER_SIZE, SPELL_SIZE };
