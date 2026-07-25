/**
 * Gathering / production skill data.
 *
 * Success rolls use RuneScape's standard interpolation:
 *   chance = (1 + floor( low*(99-L)/98 + high*(L-1)/98 + 0.5 )) / 256
 * where `low` is the chance at level 1 and `high` the chance at level 99,
 * scaled by the tool's effectiveness multiplier.
 */

import { Skill } from '../skills.ts';
import * as O from './objects.ts';

export function skillingChance(low: number, high: number, level: number, toolMultiplier = 1): number {
  const interpolated = (low * (99 - level)) / 98 + (high * (level - 1)) / 98;
  const scaled = Math.floor(interpolated * toolMultiplier + 0.5);
  return Math.max(0, Math.min(1, (1 + scaled) / 256));
}

/* ------------------------------------------------------------------ */
/* Woodcutting                                                         */
/* ------------------------------------------------------------------ */

export interface TreeData {
  object: number;
  name: string;
  level: number;
  xp: number;
  log: number;
  /** Ticks before the stump turns back into a tree. */
  respawn: number;
  /** Probability the tree depletes after each log (1 = always). */
  depleteChance: number;
  low: number;
  high: number;
}

/** Woodcutting rolls once every 4 ticks. */
export const WOODCUTTING_INTERVAL = 4;

export const TREES: TreeData[] = [
  { object: O.O_TREE, name: 'Tree', level: 1, xp: 25, log: 1511, respawn: 60, depleteChance: 1, low: 75, high: 200 },
  { object: O.O_DEAD_TREE, name: 'Dead tree', level: 1, xp: 25, log: 1511, respawn: 60, depleteChance: 1, low: 75, high: 200 },
  { object: O.O_OAK, name: 'Oak tree', level: 15, xp: 37.5, log: 1521, respawn: 14, depleteChance: 1 / 8, low: 32, high: 110 },
  { object: O.O_WILLOW, name: 'Willow tree', level: 30, xp: 67.5, log: 1519, respawn: 14, depleteChance: 1 / 10, low: 25, high: 100 },
  { object: O.O_MAPLE, name: 'Maple tree', level: 45, xp: 100, log: 1517, respawn: 59, depleteChance: 1 / 12, low: 18, high: 85 },
  { object: O.O_YEW, name: 'Yew tree', level: 60, xp: 175, log: 1515, respawn: 99, depleteChance: 1 / 15, low: 12, high: 70 },
  { object: O.O_MAGIC_TREE, name: 'Magic tree', level: 75, xp: 250, log: 1513, respawn: 199, depleteChance: 1 / 20, low: 8, high: 55 },
];

export interface ToolData {
  item: number;
  name: string;
  level: number;
  multiplier: number;
}

/** Axes, best first. Multipliers are the wiki's relative chop speeds. */
export const AXES: ToolData[] = [
  { item: 1359, name: 'Rune axe', level: 41, multiplier: 3.5 },
  { item: 1357, name: 'Adamant axe', level: 31, multiplier: 3.0 },
  { item: 1355, name: 'Mithril axe', level: 21, multiplier: 2.5 },
  { item: 1361, name: 'Black axe', level: 11, multiplier: 2.25 },
  { item: 1353, name: 'Steel axe', level: 6, multiplier: 2.0 },
  { item: 1349, name: 'Iron axe', level: 1, multiplier: 1.5 },
  { item: 1351, name: 'Bronze axe', level: 1, multiplier: 1.0 },
];

/* ------------------------------------------------------------------ */
/* Mining                                                              */
/* ------------------------------------------------------------------ */

export interface RockData {
  object: number;
  name: string;
  level: number;
  xp: number;
  ore: number;
  respawn: number;
  low: number;
  high: number;
}

/** Mining rolls once every 3 ticks. */
export const MINING_INTERVAL = 3;

export const ROCKS: RockData[] = [
  { object: O.O_CLAY_ROCK, name: 'Clay', level: 1, xp: 5, ore: 434, respawn: 3, low: 100, high: 220 },
  { object: O.O_COPPER_ROCK, name: 'Copper', level: 1, xp: 17.5, ore: 436, respawn: 4, low: 100, high: 200 },
  { object: O.O_TIN_ROCK, name: 'Tin', level: 1, xp: 17.5, ore: 438, respawn: 4, low: 100, high: 200 },
  { object: O.O_IRON_ROCK, name: 'Iron', level: 15, xp: 35, ore: 440, respawn: 9, low: 50, high: 160 },
  { object: O.O_SILVER_ROCK, name: 'Silver', level: 20, xp: 40, ore: 442, respawn: 100, low: 40, high: 140 },
  { object: O.O_COAL_ROCK, name: 'Coal', level: 30, xp: 50, ore: 453, respawn: 50, low: 30, high: 120 },
  { object: O.O_GOLD_ROCK, name: 'Gold', level: 40, xp: 65, ore: 444, respawn: 100, low: 25, high: 110 },
  { object: O.O_MITHRIL_ROCK, name: 'Mithril', level: 55, xp: 80, ore: 447, respawn: 200, low: 18, high: 90 },
  { object: O.O_ADAMANTITE_ROCK, name: 'Adamantite', level: 70, xp: 95, ore: 449, respawn: 400, low: 12, high: 70 },
  { object: O.O_RUNITE_ROCK, name: 'Runite', level: 85, xp: 125, ore: 451, respawn: 1200, low: 6, high: 50 },
];

export const PICKAXES: ToolData[] = [
  { item: 1275, name: 'Rune pickaxe', level: 41, multiplier: 2.4 },
  { item: 1271, name: 'Adamant pickaxe', level: 31, multiplier: 2.0 },
  { item: 1273, name: 'Mithril pickaxe', level: 21, multiplier: 1.7 },
  { item: 12297, name: 'Black pickaxe', level: 11, multiplier: 1.5 },
  { item: 1269, name: 'Steel pickaxe', level: 6, multiplier: 1.35 },
  { item: 1267, name: 'Iron pickaxe', level: 1, multiplier: 1.15 },
  { item: 1265, name: 'Bronze pickaxe', level: 1, multiplier: 1.0 },
];

/** Chance of hitting the gem drop table while mining. */
export const GEM_ROCK_CHANCE = 1 / 256;
export const GEM_TABLE: [number, number][] = [
  [1623, 60], // Uncut sapphire
  [1621, 30], // Uncut emerald
  [1619, 8], // Uncut ruby
  [1617, 2], // Uncut diamond
];

/* ------------------------------------------------------------------ */
/* Fishing                                                             */
/* ------------------------------------------------------------------ */

export interface FishData {
  name: string;
  level: number;
  xp: number;
  raw: number;
  low: number;
  high: number;
}

export interface FishingSpotData {
  /** Right-click option that starts this method. */
  option: string;
  tool: number;
  toolName: string;
  bait?: number;
  baitName?: string;
  fish: FishData[];
}

/** Fishing rolls once every 5 ticks. */
export const FISHING_INTERVAL = 5;

export const FISHING_METHODS: FishingSpotData[] = [
  {
    option: 'Net',
    tool: 303,
    toolName: 'small fishing net',
    fish: [
      { name: 'Shrimps', level: 1, xp: 10, raw: 317, low: 100, high: 220 },
      { name: 'Anchovies', level: 15, xp: 40, raw: 321, low: 60, high: 180 },
    ],
  },
  {
    option: 'Bait',
    tool: 307,
    toolName: 'fishing rod',
    bait: 313,
    baitName: 'fishing bait',
    fish: [
      { name: 'Sardine', level: 5, xp: 20, raw: 327, low: 80, high: 200 },
      { name: 'Herring', level: 10, xp: 30, raw: 345, low: 70, high: 190 },
      { name: 'Pike', level: 25, xp: 60, raw: 349, low: 60, high: 180 },
    ],
  },
  {
    option: 'Lure',
    tool: 309,
    toolName: 'fly fishing rod',
    bait: 314,
    baitName: 'feather',
    fish: [
      { name: 'Trout', level: 20, xp: 50, raw: 335, low: 70, high: 190 },
      { name: 'Salmon', level: 30, xp: 70, raw: 331, low: 50, high: 170 },
    ],
  },
  {
    option: 'Cage',
    tool: 301,
    toolName: 'lobster pot',
    fish: [{ name: 'Lobster', level: 40, xp: 90, raw: 377, low: 40, high: 150 }],
  },
  {
    option: 'Harpoon',
    tool: 311,
    toolName: 'harpoon',
    fish: [
      { name: 'Tuna', level: 35, xp: 80, raw: 359, low: 45, high: 160 },
      { name: 'Swordfish', level: 50, xp: 100, raw: 371, low: 30, high: 140 },
      { name: 'Shark', level: 76, xp: 110, raw: 383, low: 20, high: 110 },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Cooking                                                             */
/* ------------------------------------------------------------------ */

export interface CookData {
  raw: number;
  cooked: number;
  burnt: number;
  level: number;
  xp: number;
  /** Level at which you stop burning on a fire. */
  stopBurnFire: number;
  /** Level at which you stop burning on a range. */
  stopBurnRange: number;
}

export const COOKABLES: CookData[] = [
  { raw: 317, cooked: 315, burnt: 323, level: 1, xp: 30, stopBurnFire: 34, stopBurnRange: 31 },
  { raw: 321, cooked: 319, burnt: 324, level: 1, xp: 30, stopBurnFire: 34, stopBurnRange: 31 },
  { raw: 327, cooked: 325, burnt: 369, level: 5, xp: 40, stopBurnFire: 38, stopBurnRange: 34 },
  { raw: 345, cooked: 347, burnt: 369, level: 10, xp: 50, stopBurnFire: 41, stopBurnRange: 38 },
  { raw: 353, cooked: 355, burnt: 369, level: 16, xp: 60, stopBurnFire: 45, stopBurnRange: 41 },
  { raw: 335, cooked: 333, burnt: 369, level: 15, xp: 70, stopBurnFire: 50, stopBurnRange: 45 },
  { raw: 341, cooked: 339, burnt: 369, level: 18, xp: 75, stopBurnFire: 51, stopBurnRange: 47 },
  { raw: 349, cooked: 351, burnt: 369, level: 20, xp: 80, stopBurnFire: 54, stopBurnRange: 49 },
  { raw: 331, cooked: 329, burnt: 369, level: 25, xp: 90, stopBurnFire: 58, stopBurnRange: 55 },
  { raw: 359, cooked: 361, burnt: 369, level: 30, xp: 100, stopBurnFire: 63, stopBurnRange: 60 },
  { raw: 377, cooked: 379, burnt: 369, level: 40, xp: 120, stopBurnFire: 74, stopBurnRange: 70 },
  { raw: 363, cooked: 365, burnt: 369, level: 43, xp: 130, stopBurnFire: 80, stopBurnRange: 76 },
  { raw: 371, cooked: 373, burnt: 369, level: 45, xp: 140, stopBurnFire: 86, stopBurnRange: 76 },
  { raw: 7944, cooked: 7946, burnt: 369, level: 62, xp: 150, stopBurnFire: 92, stopBurnRange: 86 },
  { raw: 383, cooked: 385, burnt: 369, level: 80, xp: 210, stopBurnFire: 99, stopBurnRange: 98 },
  { raw: 2132, cooked: 2142, burnt: 2146, level: 1, xp: 30, stopBurnFire: 34, stopBurnRange: 31 },
  { raw: 2138, cooked: 2140, burnt: 2146, level: 1, xp: 30, stopBurnFire: 34, stopBurnRange: 31 },
  { raw: 2307, cooked: 2309, burnt: 343, level: 1, xp: 40, stopBurnFire: 40, stopBurnRange: 38 },
];

/**
 * Burn chance ramps from ~55% at the minimum cooking level down to zero at
 * the "stop burning" level.
 */
export function burnChance(data: CookData, level: number, onRange: boolean): number {
  const stop = onRange ? data.stopBurnRange : data.stopBurnFire;
  if (level >= stop) return 0;
  const span = Math.max(1, stop - data.level);
  const progress = (level - data.level) / span;
  return Math.max(0, Math.min(0.6, 0.55 * (1 - progress) + 0.05));
}

/* ------------------------------------------------------------------ */
/* Firemaking                                                          */
/* ------------------------------------------------------------------ */

export interface FiremakingData {
  log: number;
  level: number;
  xp: number;
  /** Ticks the fire burns for. */
  duration: number;
}

export const FIREMAKING: FiremakingData[] = [
  { log: 1511, level: 1, xp: 40, duration: 170 },
  { log: 1521, level: 15, xp: 60, duration: 200 },
  { log: 1519, level: 30, xp: 90, duration: 220 },
  { log: 6333, level: 35, xp: 105, duration: 240 },
  { log: 1517, level: 45, xp: 135, duration: 260 },
  { log: 6332, level: 50, xp: 157.5, duration: 280 },
  { log: 1515, level: 60, xp: 202.5, duration: 300 },
  { log: 1513, level: 75, xp: 303.8, duration: 340 },
];

/* ------------------------------------------------------------------ */
/* Smithing                                                            */
/* ------------------------------------------------------------------ */

export interface SmeltData {
  bar: number;
  name: string;
  level: number;
  xp: number;
  /** [itemId, quantity] pairs consumed. */
  inputs: [number, number][];
  /** Chance of the smelt succeeding (iron is 50%). */
  successChance?: number;
}

export const SMELTING: SmeltData[] = [
  { bar: 2349, name: 'Bronze bar', level: 1, xp: 6.2, inputs: [[436, 1], [438, 1]] },
  { bar: 2351, name: 'Iron bar', level: 15, xp: 12.5, inputs: [[440, 1]], successChance: 0.5 },
  { bar: 2355, name: 'Silver bar', level: 20, xp: 13.7, inputs: [[442, 1]] },
  { bar: 2353, name: 'Steel bar', level: 30, xp: 17.5, inputs: [[440, 1], [453, 2]] },
  { bar: 2357, name: 'Gold bar', level: 40, xp: 22.5, inputs: [[444, 1]] },
  { bar: 2359, name: 'Mithril bar', level: 50, xp: 30, inputs: [[447, 1], [453, 4]] },
  { bar: 2361, name: 'Adamantite bar', level: 70, xp: 37.5, inputs: [[449, 1], [453, 6]] },
  { bar: 2363, name: 'Runite bar', level: 85, xp: 50, inputs: [[451, 1], [453, 8]] },
];

export interface SmithProduct {
  /** Item name suffix, matched against "<Tier> <noun>". */
  noun: string;
  /** Extra smithing levels above the bar's base level. */
  levelOffset: number;
  bars: number;
  /** Items produced per smith action. */
  amount: number;
}

/** Smithing gives 12.5 xp per bar used. */
export const SMITH_XP_PER_BAR = 12.5;

export const SMITH_PRODUCTS: SmithProduct[] = [
  { noun: 'dagger', levelOffset: 0, bars: 1, amount: 1 },
  { noun: 'axe', levelOffset: 0, bars: 1, amount: 1 },
  { noun: 'mace', levelOffset: 1, bars: 1, amount: 1 },
  { noun: 'med helm', levelOffset: 2, bars: 1, amount: 1 },
  { noun: 'sword', levelOffset: 3, bars: 1, amount: 1 },
  { noun: 'scimitar', levelOffset: 4, bars: 2, amount: 1 },
  { noun: 'longsword', levelOffset: 5, bars: 2, amount: 1 },
  { noun: 'full helm', levelOffset: 6, bars: 2, amount: 1 },
  { noun: 'sq shield', levelOffset: 7, bars: 2, amount: 1 },
  { noun: 'warhammer', levelOffset: 8, bars: 3, amount: 1 },
  { noun: 'battleaxe', levelOffset: 9, bars: 3, amount: 1 },
  { noun: 'chainbody', levelOffset: 10, bars: 3, amount: 1 },
  { noun: 'kiteshield', levelOffset: 11, bars: 3, amount: 1 },
  { noun: '2h sword', levelOffset: 13, bars: 3, amount: 1 },
  { noun: 'platelegs', levelOffset: 15, bars: 3, amount: 1 },
  { noun: 'plateskirt', levelOffset: 15, bars: 3, amount: 1 },
  { noun: 'platebody', levelOffset: 17, bars: 5, amount: 1 },
];

/** The smithing level required to work each bar at all. */
export const BAR_SMITH_LEVEL: Record<number, { tier: string; level: number }> = {
  2349: { tier: 'Bronze', level: 1 },
  2351: { tier: 'Iron', level: 15 },
  2353: { tier: 'Steel', level: 30 },
  2359: { tier: 'Mithril', level: 50 },
  2361: { tier: 'Adamant', level: 70 },
  2363: { tier: 'Rune', level: 85 },
};

/* ------------------------------------------------------------------ */
/* Fletching                                                           */
/* ------------------------------------------------------------------ */

export interface FletchOption {
  product: number;
  name: string;
  level: number;
  xp: number;
  amount: number;
}

export const FLETCHING: Record<number, FletchOption[]> = {
  1511: [
    { product: 52, name: 'Arrow shafts', level: 1, xp: 5, amount: 15 },
    { product: 50, name: 'Shortbow', level: 5, xp: 5, amount: 1 },
    { product: 48, name: 'Longbow', level: 10, xp: 10, amount: 1 },
  ],
  1521: [
    { product: 52, name: 'Arrow shafts', level: 15, xp: 10, amount: 30 },
    { product: 54, name: 'Oak shortbow', level: 20, xp: 16.5, amount: 1 },
    { product: 56, name: 'Oak longbow', level: 25, xp: 25, amount: 1 },
  ],
  1519: [
    { product: 52, name: 'Arrow shafts', level: 30, xp: 15, amount: 45 },
    { product: 60, name: 'Willow shortbow', level: 35, xp: 33.3, amount: 1 },
    { product: 58, name: 'Willow longbow', level: 40, xp: 41.5, amount: 1 },
  ],
  1517: [
    { product: 52, name: 'Arrow shafts', level: 45, xp: 20, amount: 60 },
    { product: 64, name: 'Maple shortbow', level: 50, xp: 50, amount: 1 },
    { product: 62, name: 'Maple longbow', level: 55, xp: 58.3, amount: 1 },
  ],
  1515: [
    { product: 52, name: 'Arrow shafts', level: 60, xp: 25, amount: 75 },
    { product: 68, name: 'Yew shortbow', level: 65, xp: 67.5, amount: 1 },
    { product: 66, name: 'Yew longbow', level: 70, xp: 75, amount: 1 },
  ],
  1513: [
    { product: 52, name: 'Arrow shafts', level: 75, xp: 30, amount: 90 },
    { product: 72, name: 'Magic shortbow', level: 80, xp: 83.3, amount: 1 },
    { product: 70, name: 'Magic longbow', level: 85, xp: 91.5, amount: 1 },
  ],
};

/** unstrung bow id -> [strung bow id, level, xp] */
export const BOW_STRINGING: Record<number, [number, number, number]> = {
  50: [841, 5, 5],
  48: [839, 10, 10],
  54: [843, 20, 16.5],
  56: [845, 25, 25],
  60: [849, 35, 33.3],
  58: [847, 40, 41.5],
  64: [853, 50, 50],
  62: [851, 55, 58.3],
  68: [857, 65, 67.5],
  66: [855, 70, 75],
  72: [861, 80, 83.3],
  70: [859, 85, 91.5],
};

/** arrowtip id -> [arrow id, level, xp per 15] */
export const ARROW_TIPPING: Record<number, [number, number, number]> = {
  39: [882, 1, 19.5],
  40: [884, 15, 37.5],
  41: [886, 30, 75],
  42: [888, 45, 112.5],
  43: [890, 60, 150],
  44: [892, 75, 187.5],
};

/* ------------------------------------------------------------------ */
/* Crafting                                                            */
/* ------------------------------------------------------------------ */

export interface LeatherProduct {
  product: number;
  name: string;
  level: number;
  xp: number;
}

export const LEATHER_PRODUCTS: LeatherProduct[] = [
  { product: 1059, name: 'Leather gloves', level: 1, xp: 13.8 },
  { product: 1061, name: 'Leather boots', level: 7, xp: 16.3 },
  { product: 1167, name: 'Leather cowl', level: 9, xp: 18.5 },
  { product: 1063, name: 'Leather vambraces', level: 11, xp: 22 },
  { product: 1129, name: 'Leather body', level: 14, xp: 25 },
  { product: 1095, name: 'Leather chaps', level: 18, xp: 27 },
];

/** uncut gem -> [cut gem, level, xp] */
export const GEM_CUTTING: Record<number, [number, number, number]> = {
  1625: [1609, 1, 15],
  1627: [1611, 13, 20],
  1629: [1613, 16, 25],
  1623: [1607, 20, 50],
  1621: [1605, 27, 67.5],
  1619: [1603, 34, 85],
  1617: [1601, 43, 107.5],
};

/** Gold bar jewellery. */
export const JEWELLERY: { product: number; name: string; level: number; xp: number }[] = [
  { product: 1635, name: 'Gold ring', level: 5, xp: 15 },
  { product: 1637, name: 'Sapphire ring', level: 20, xp: 40 },
  { product: 1639, name: 'Emerald ring', level: 27, xp: 55 },
  { product: 1641, name: 'Ruby ring', level: 34, xp: 70 },
  { product: 1643, name: 'Diamond ring', level: 43, xp: 85 },
];

/* ------------------------------------------------------------------ */
/* Runecraft                                                           */
/* ------------------------------------------------------------------ */

export interface AltarData {
  name: string;
  rune: number;
  level: number;
  xp: number;
  talisman: number;
  /** [level, runes per essence] thresholds, highest first. */
  multiples: [number, number][];
}

export const ALTARS: AltarData[] = [
  { name: 'Air', rune: 556, level: 1, xp: 5, talisman: 1438, multiples: [[99, 10], [88, 9], [77, 8], [66, 7], [55, 6], [44, 5], [33, 4], [22, 3], [11, 2]] },
  { name: 'Mind', rune: 558, level: 2, xp: 5.5, talisman: 1448, multiples: [[98, 8], [84, 7], [70, 6], [56, 5], [42, 4], [28, 3], [14, 2]] },
  { name: 'Water', rune: 555, level: 5, xp: 6, talisman: 1444, multiples: [[95, 6], [76, 5], [57, 4], [38, 3], [19, 2]] },
  { name: 'Earth', rune: 557, level: 9, xp: 6.5, talisman: 1440, multiples: [[78, 4], [52, 3], [26, 2]] },
  { name: 'Fire', rune: 554, level: 14, xp: 7, talisman: 1442, multiples: [[70, 3], [35, 2]] },
];

/* ------------------------------------------------------------------ */
/* Misc production                                                     */
/* ------------------------------------------------------------------ */

/** Spinning wheel recipes: input -> [output, level, xp]. */
export const SPINNING: Record<number, [number, number, number]> = {
  1737: [1759, 10, 15], // Wool -> Ball of wool
  1779: [1777, 10, 15], // Flax -> Bow string
};

export const SKILL_OF_ACTION: Record<string, Skill> = {
  woodcutting: Skill.WOODCUTTING,
  mining: Skill.MINING,
  fishing: Skill.FISHING,
  cooking: Skill.COOKING,
  firemaking: Skill.FIREMAKING,
  smithing: Skill.SMITHING,
  crafting: Skill.CRAFTING,
  fletching: Skill.FLETCHING,
  runecraft: Skill.RUNECRAFT,
  prayer: Skill.PRAYER,
};
