/** The standard spellbook, with live OSRS levels, runes, damage and xp. */

export const enum SpellKind {
  COMBAT = 0,
  TELEPORT = 1,
  ALCHEMY = 2,
  ENCHANT = 3,
  UTILITY = 4,
  CURSE = 5,
}

export interface SpellDef {
  id: number;
  name: string;
  level: number;
  xp: number;
  kind: SpellKind;
  /** [runeId, amount] pairs. */
  runes: [number, number][];
  /** Max hit for combat spells. */
  maxHit?: number;
  /** Element used for the staff-rune discount. */
  element?: 'air' | 'water' | 'earth' | 'fire';
  /** Projectile graphic key. */
  projectile?: string;
  /** Impact graphic key. */
  gfx?: string;
  /** Teleport destination. */
  teleport?: { x: number; y: number; plane: number };
  /** Extra behaviour tag handled by the server. */
  effect?: string;
  members?: boolean;
}

const AIR = 556;
const WATER = 555;
const EARTH = 557;
const FIRE = 554;
const MIND = 558;
const BODY = 559;
const CHAOS = 562;
const DEATH = 560;
const NATURE = 561;
const LAW = 563;
const COSMIC = 564;
const BLOOD = 565;

export const SPELLS: SpellDef[] = [
  { id: 0, name: 'Wind Strike', level: 1, xp: 5.5, kind: SpellKind.COMBAT, runes: [[AIR, 1], [MIND, 1]], maxHit: 2, element: 'air', projectile: 'strike_air', gfx: 'hit_air' },
  { id: 1, name: 'Confuse', level: 3, xp: 13, kind: SpellKind.CURSE, runes: [[WATER, 3], [EARTH, 2], [BODY, 1]], effect: 'confuse', gfx: 'curse' },
  { id: 2, name: 'Water Strike', level: 5, xp: 7.5, kind: SpellKind.COMBAT, runes: [[WATER, 1], [AIR, 1], [MIND, 1]], maxHit: 4, element: 'water', projectile: 'strike_water', gfx: 'hit_water' },
  { id: 3, name: 'Enchant Sapphire', level: 7, xp: 17.5, kind: SpellKind.ENCHANT, runes: [[WATER, 1], [COSMIC, 1]], effect: 'enchant1' },
  { id: 4, name: 'Earth Strike', level: 9, xp: 9.5, kind: SpellKind.COMBAT, runes: [[EARTH, 2], [AIR, 1], [MIND, 1]], maxHit: 6, element: 'earth', projectile: 'strike_earth', gfx: 'hit_earth' },
  { id: 5, name: 'Weaken', level: 11, xp: 21, kind: SpellKind.CURSE, runes: [[WATER, 3], [EARTH, 2], [BODY, 1]], effect: 'weaken', gfx: 'curse' },
  { id: 6, name: 'Fire Strike', level: 13, xp: 11.5, kind: SpellKind.COMBAT, runes: [[FIRE, 3], [AIR, 2], [MIND, 1]], maxHit: 8, element: 'fire', projectile: 'strike_fire', gfx: 'hit_fire' },
  { id: 7, name: 'Bones to Bananas', level: 15, xp: 25, kind: SpellKind.UTILITY, runes: [[EARTH, 2], [WATER, 2], [NATURE, 1]], effect: 'bonestobananas' },
  { id: 8, name: 'Wind Bolt', level: 17, xp: 13.5, kind: SpellKind.COMBAT, runes: [[AIR, 2], [CHAOS, 1]], maxHit: 9, element: 'air', projectile: 'bolt_air', gfx: 'hit_air' },
  { id: 9, name: 'Curse', level: 19, xp: 29, kind: SpellKind.CURSE, runes: [[WATER, 2], [EARTH, 3], [BODY, 1]], effect: 'curse', gfx: 'curse' },
  { id: 10, name: 'Bind', level: 20, xp: 30, kind: SpellKind.CURSE, runes: [[EARTH, 3], [WATER, 3], [NATURE, 2]], effect: 'bind', gfx: 'bind' },
  { id: 11, name: 'Low Level Alchemy', level: 21, xp: 31, kind: SpellKind.ALCHEMY, runes: [[FIRE, 3], [NATURE, 1]], effect: 'lowalch' },
  { id: 12, name: 'Water Bolt', level: 23, xp: 16.5, kind: SpellKind.COMBAT, runes: [[WATER, 2], [AIR, 2], [CHAOS, 1]], maxHit: 10, element: 'water', projectile: 'bolt_water', gfx: 'hit_water' },
  { id: 13, name: 'Varrock Teleport', level: 25, xp: 35, kind: SpellKind.TELEPORT, runes: [[AIR, 3], [FIRE, 1], [LAW, 1]], teleport: { x: 3213, y: 3424, plane: 0 } },
  { id: 14, name: 'Enchant Emerald', level: 27, xp: 37, kind: SpellKind.ENCHANT, runes: [[AIR, 3], [COSMIC, 1]], effect: 'enchant2' },
  { id: 15, name: 'Earth Bolt', level: 29, xp: 19.5, kind: SpellKind.COMBAT, runes: [[EARTH, 3], [AIR, 2], [CHAOS, 1]], maxHit: 11, element: 'earth', projectile: 'bolt_earth', gfx: 'hit_earth' },
  { id: 16, name: 'Lumbridge Teleport', level: 31, xp: 41, kind: SpellKind.TELEPORT, runes: [[AIR, 3], [EARTH, 1], [LAW, 1]], teleport: { x: 3222, y: 3218, plane: 0 } },
  { id: 17, name: 'Telekinetic Grab', level: 33, xp: 43, kind: SpellKind.UTILITY, runes: [[AIR, 1], [LAW, 1]], effect: 'telegrab' },
  { id: 18, name: 'Fire Bolt', level: 35, xp: 22.5, kind: SpellKind.COMBAT, runes: [[FIRE, 4], [AIR, 3], [CHAOS, 1]], maxHit: 12, element: 'fire', projectile: 'bolt_fire', gfx: 'hit_fire' },
  { id: 19, name: 'Falador Teleport', level: 37, xp: 48, kind: SpellKind.TELEPORT, runes: [[AIR, 3], [WATER, 1], [LAW, 1]], teleport: { x: 2965, y: 3379, plane: 0 } },
  { id: 20, name: 'Crumble Undead', level: 39, xp: 24.5, kind: SpellKind.COMBAT, runes: [[EARTH, 2], [AIR, 2], [CHAOS, 1]], maxHit: 15, element: 'earth', projectile: 'bolt_earth', gfx: 'hit_earth', effect: 'undeadonly' },
  { id: 21, name: 'Wind Blast', level: 41, xp: 25.5, kind: SpellKind.COMBAT, runes: [[AIR, 3], [DEATH, 1]], maxHit: 13, element: 'air', projectile: 'blast_air', gfx: 'hit_air' },
  { id: 22, name: 'Superheat Item', level: 43, xp: 53, kind: SpellKind.UTILITY, runes: [[FIRE, 4], [NATURE, 1]], effect: 'superheat' },
  { id: 23, name: 'Camelot Teleport', level: 45, xp: 55.5, kind: SpellKind.TELEPORT, runes: [[AIR, 5], [LAW, 1]], teleport: { x: 2757, y: 3477, plane: 0 }, members: true },
  { id: 24, name: 'Water Blast', level: 47, xp: 28.5, kind: SpellKind.COMBAT, runes: [[WATER, 3], [AIR, 3], [DEATH, 1]], maxHit: 14, element: 'water', projectile: 'blast_water', gfx: 'hit_water' },
  { id: 25, name: 'Enchant Ruby', level: 49, xp: 59, kind: SpellKind.ENCHANT, runes: [[FIRE, 5], [COSMIC, 1]], effect: 'enchant3', members: true },
  { id: 26, name: 'Earth Blast', level: 53, xp: 31.5, kind: SpellKind.COMBAT, runes: [[EARTH, 4], [AIR, 3], [DEATH, 1]], maxHit: 15, element: 'earth', projectile: 'blast_earth', gfx: 'hit_earth' },
  { id: 27, name: 'High Level Alchemy', level: 55, xp: 65, kind: SpellKind.ALCHEMY, runes: [[FIRE, 5], [NATURE, 1]], effect: 'highalch' },
  { id: 28, name: 'Enchant Diamond', level: 57, xp: 67, kind: SpellKind.ENCHANT, runes: [[EARTH, 10], [COSMIC, 1]], effect: 'enchant4', members: true },
  { id: 29, name: 'Fire Blast', level: 59, xp: 34.5, kind: SpellKind.COMBAT, runes: [[FIRE, 5], [AIR, 4], [DEATH, 1]], maxHit: 16, element: 'fire', projectile: 'blast_fire', gfx: 'hit_fire' },
  { id: 30, name: 'Wind Wave', level: 62, xp: 36, kind: SpellKind.COMBAT, runes: [[AIR, 5], [BLOOD, 1]], maxHit: 17, element: 'air', projectile: 'wave_air', gfx: 'hit_air', members: true },
  { id: 31, name: 'Water Wave', level: 65, xp: 37.5, kind: SpellKind.COMBAT, runes: [[WATER, 7], [AIR, 5], [BLOOD, 1]], maxHit: 18, element: 'water', projectile: 'wave_water', gfx: 'hit_water', members: true },
  { id: 32, name: 'Earth Wave', level: 70, xp: 40, kind: SpellKind.COMBAT, runes: [[EARTH, 7], [AIR, 5], [BLOOD, 1]], maxHit: 19, element: 'earth', projectile: 'wave_earth', gfx: 'hit_earth', members: true },
  { id: 33, name: 'Fire Wave', level: 75, xp: 42.5, kind: SpellKind.COMBAT, runes: [[FIRE, 7], [AIR, 5], [BLOOD, 1]], maxHit: 20, element: 'fire', projectile: 'wave_fire', gfx: 'hit_fire', members: true },
];

export function spellById(id: number): SpellDef | undefined {
  return SPELLS[id];
}

/** Elemental staves supply unlimited runes of their element. */
export const STAFF_ELEMENTS: Record<number, 'air' | 'water' | 'earth' | 'fire'> = {
  1381: 'air',
  1383: 'water',
  1385: 'earth',
  1387: 'fire',
};

export const ELEMENT_RUNES: Record<string, number> = {
  air: AIR,
  water: WATER,
  earth: EARTH,
  fire: FIRE,
};

/** Enchant spell tiers: unenchanted -> enchanted jewellery. */
export const ENCHANT_TABLE: Record<string, Record<number, number>> = {
  enchant1: { 1637: 2550 }, // Sapphire ring -> Ring of recoil
  enchant2: { 1639: 1639 },
  enchant3: { 1641: 1641 },
  enchant4: { 1643: 1643 },
};
