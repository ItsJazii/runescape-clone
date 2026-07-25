import { MAX_LEVEL, MAX_XP } from './constants.ts';

/**
 * The 23 skills, in the exact order they appear on the RuneScape stats tab
 * (read left-to-right, top-to-bottom).
 */
export const enum Skill {
  ATTACK = 0,
  HITPOINTS = 1,
  MINING = 2,
  STRENGTH = 3,
  AGILITY = 4,
  SMITHING = 5,
  DEFENCE = 6,
  HERBLORE = 7,
  FISHING = 8,
  RANGED = 9,
  THIEVING = 10,
  COOKING = 11,
  PRAYER = 12,
  CRAFTING = 13,
  FIREMAKING = 14,
  MAGIC = 15,
  FLETCHING = 16,
  WOODCUTTING = 17,
  RUNECRAFT = 18,
  SLAYER = 19,
  FARMING = 20,
  CONSTRUCTION = 21,
  HUNTER = 22,
}

export const SKILL_COUNT = 23;

export const SKILL_NAMES: string[] = [
  'Attack',
  'Hitpoints',
  'Mining',
  'Strength',
  'Agility',
  'Smithing',
  'Defence',
  'Herblore',
  'Fishing',
  'Ranged',
  'Thieving',
  'Cooking',
  'Prayer',
  'Crafting',
  'Firemaking',
  'Magic',
  'Fletching',
  'Woodcutting',
  'Runecraft',
  'Slayer',
  'Farming',
  'Construction',
  'Hunter',
];

/**
 * Experience required for each level, generated with the canonical RS formula:
 *   xp(L) = floor( (1/4) * sum_{i=1}^{L-1} floor(i + 300 * 2^(i/7)) )
 * Level 99 = 13,034,431 xp.
 */
export const XP_TABLE: number[] = (() => {
  const table = new Array<number>(MAX_LEVEL + 2).fill(0);
  let points = 0;
  for (let level = 1; level <= MAX_LEVEL + 1; level++) {
    table[level] = Math.floor(points / 4);
    points += Math.floor(level + 300 * Math.pow(2, level / 7));
  }
  return table;
})();

/** Experience needed to reach `level`. */
export function xpForLevel(level: number): number {
  if (level < 1) return 0;
  if (level > MAX_LEVEL) return XP_TABLE[MAX_LEVEL];
  return XP_TABLE[level];
}

/** The level an amount of experience corresponds to (1-99). */
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && XP_TABLE[level + 1] <= xp) level++;
  return level;
}

export function clampXp(xp: number): number {
  return Math.max(0, Math.min(MAX_XP, xp));
}

/** Skills that start at level 1 with 0 xp, except Hitpoints which starts at 10. */
export function startingXp(skill: Skill): number {
  return skill === Skill.HITPOINTS ? XP_TABLE[10] : 0;
}

/**
 * Combat level, using the live OSRS formula.
 *   base    = 0.25 * (defence + hitpoints + floor(prayer / 2))
 *   melee   = 13/40 * (attack + strength)
 *   ranged  = 13/40 * floor(3 * ranged / 2)
 *   magic   = 13/40 * floor(3 * magic / 2)
 *   level   = floor(base + max(melee, ranged, magic))
 */
export function combatLevel(levels: {
  attack: number;
  strength: number;
  defence: number;
  hitpoints: number;
  prayer: number;
  ranged: number;
  magic: number;
}): number {
  const base = 0.25 * (levels.defence + levels.hitpoints + Math.floor(levels.prayer / 2));
  const melee = (13 / 40) * (levels.attack + levels.strength);
  const range = (13 / 40) * Math.floor((3 * levels.ranged) / 2);
  const mage = (13 / 40) * Math.floor((3 * levels.magic) / 2);
  return Math.floor(base + Math.max(melee, range, mage));
}

export function combatLevelFromArray(levels: number[]): number {
  return combatLevel({
    attack: levels[Skill.ATTACK],
    strength: levels[Skill.STRENGTH],
    defence: levels[Skill.DEFENCE],
    hitpoints: levels[Skill.HITPOINTS],
    prayer: levels[Skill.PRAYER],
    ranged: levels[Skill.RANGED],
    magic: levels[Skill.MAGIC],
  });
}
