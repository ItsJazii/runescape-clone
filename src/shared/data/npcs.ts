import { AttackType, type Bonuses } from '../combat.ts';
import { combatLevel } from '../skills.ts';

export interface Drop {
  item: number;
  min: number;
  max: number;
  /** Weight out of the table's `size` (default 128). */
  weight: number;
  /** Roll the rare drop table instead of dropping an item. */
  rdt?: boolean;
}

export interface DropTable {
  /** Always dropped on death. */
  always?: { item: number; min: number; max: number }[];
  /** One roll on this table per kill. */
  table?: Drop[];
  /** Denominator for the weights (defaults to 128). */
  size?: number;
}

export interface NpcDef {
  id: number;
  name: string;
  examine: string;
  combat: number;
  hitpoints: number;
  attack: number;
  strength: number;
  defence: number;
  ranged: number;
  magic: number;
  maxHit: number;
  attackSpeed: number;
  attackType: AttackType;
  bonuses: Partial<Bonuses>;
  /** Attacks players who walk near it. */
  aggressive?: boolean;
  aggroRange?: number;
  /** Aggression stops once the player's combat level exceeds this. */
  aggroMaxLevel?: number;
  /** Tile footprint. */
  size: number;
  /** Ticks until respawn after death. */
  respawn: number;
  /** How far from its spawn point it will wander. */
  wander: number;
  /** Right-click options in order. */
  options: string[];
  drops?: DropTable;
  /** Model key used by the client renderer. */
  model: string;
  colour: number;
  colour2?: number;
  scale?: number;
  /** Shop opened by the Trade option. */
  shop?: string;
  /** Dialogue script key. */
  dialogue?: string;
  /** NPC does not move at all. */
  still?: boolean;
  /** Attack range in tiles (melee = 1). */
  attackRange?: number;
  /** Projectile graphic for ranged/magic attackers. */
  projectile?: string;
}

const defs: NpcDef[] = [];

interface NpcInput extends Partial<Omit<NpcDef, 'id' | 'name'>> {
  name: string;
  model: string;
  colour: number;
}

function npc(o: NpcInput): NpcDef {
  const hitpoints = o.hitpoints ?? 1;
  const attack = o.attack ?? 1;
  const strength = o.strength ?? 1;
  const defence = o.defence ?? 1;
  const ranged = o.ranged ?? 1;
  const magic = o.magic ?? 1;
  const d: NpcDef = {
    id: defs.length,
    name: o.name,
    examine: o.examine ?? `It's a ${o.name.toLowerCase()}.`,
    hitpoints,
    attack,
    strength,
    defence,
    ranged,
    magic,
    combat:
      o.combat ??
      combatLevel({ attack, strength, defence, hitpoints, prayer: 0, ranged, magic }),
    maxHit: o.maxHit ?? 0,
    attackSpeed: o.attackSpeed ?? 4,
    attackType: o.attackType ?? AttackType.CRUSH,
    bonuses: o.bonuses ?? {},
    aggressive: o.aggressive,
    aggroRange: o.aggroRange ?? 4,
    aggroMaxLevel: o.aggroMaxLevel,
    size: o.size ?? 1,
    respawn: o.respawn ?? 50,
    wander: o.wander ?? 5,
    options: o.options ?? (o.maxHit !== undefined ? ['Attack'] : ['Talk-to']),
    drops: o.drops,
    model: o.model,
    colour: o.colour,
    colour2: o.colour2,
    scale: o.scale,
    shop: o.shop,
    dialogue: o.dialogue,
    still: o.still,
    attackRange: o.attackRange ?? 1,
    projectile: o.projectile,
  };
  defs.push(d);
  return d;
}

/* Item ids used by drop tables. */
const BONES = 526;
const BIG_BONES = 532;
const COINS = 995;
const FEATHER = 314;
const RAW_CHICKEN = 2138;
const RAW_BEEF = 2132;
const COWHIDE = 1739;

/** The standard Rare Drop Table, rolled by mid-level monsters. */
export const RARE_DROP_TABLE: Drop[] = [
  { item: COINS, min: 3000, max: 3000, weight: 21 },
  { item: 561, min: 67, max: 67, weight: 3 }, // Nature runes
  { item: 560, min: 45, max: 45, weight: 2 }, // Death runes
  { item: 563, min: 45, max: 45, weight: 2 }, // Law runes
  { item: 892, min: 42, max: 42, weight: 2 }, // Rune arrows
  { item: 886, min: 150, max: 150, weight: 2 }, // Steel arrows
  { item: 1319, min: 1, max: 1, weight: 3 }, // Rune 2h sword
  { item: 1373, min: 1, max: 1, weight: 3 }, // Rune battleaxe
  { item: 1187, min: 1, max: 1, weight: 2 }, // Rune sq shield
  { item: 1201, min: 1, max: 1, weight: 1 }, // Rune kiteshield
  { item: 1623, min: 1, max: 1, weight: 32 }, // Uncut sapphire
  { item: 1621, min: 1, max: 1, weight: 16 }, // Uncut emerald
  { item: 1619, min: 1, max: 1, weight: 8 }, // Uncut ruby
  { item: 1617, min: 1, max: 1, weight: 2 }, // Uncut diamond
  { item: 2363, min: 1, max: 1, weight: 1 }, // Runite bar
  { item: 453, min: 150, max: 150, weight: 10 }, // Coal
];
export const RARE_DROP_TABLE_SIZE = 128;

/* ================================================================== */
/* Peaceful townsfolk & shopkeepers                                    */
/* ================================================================== */

export const HANS = npc({ name: 'Hans', model: 'human', colour: 0x9a5a3a, colour2: 0x3a4a6a, dialogue: 'hans', options: ['Talk-to'], wander: 6, examine: 'A servant of the Duke of Lumbridge.' });
export const DUKE_HORACIO = npc({ name: 'Duke Horacio', model: 'human', colour: 0x6a2a6a, colour2: 0x2a2a3a, dialogue: 'duke', options: ['Talk-to'], still: true, examine: 'The Duke of Lumbridge.' });
export const FATHER_AERECK = npc({ name: 'Father Aereck', model: 'monk', colour: 0xd8d8d8, dialogue: 'aereck', options: ['Talk-to'], wander: 3, examine: 'A priest of Saradomin.' });
export const COOK = npc({ name: 'Cook', model: 'human', colour: 0xf0f0f0, colour2: 0xe0e0e0, dialogue: 'cook', options: ['Talk-to'], wander: 3, examine: 'He looks hungry.' });
export const LUMBRIDGE_GUIDE = npc({ name: 'Lumbridge Guide', model: 'human', colour: 0x9a7a4a, colour2: 0x5a4a3a, dialogue: 'guide', options: ['Talk-to'], wander: 3, examine: 'He knows all about Lumbridge.' });
export const SHOP_KEEPER = npc({ name: 'Shop keeper', model: 'human', colour: 0x8a6a4a, colour2: 0x6a5a4a, dialogue: 'shopkeeper', options: ['Talk-to', 'Trade'], shop: 'general', wander: 2, examine: 'He owns the general store.' });
export const SHOP_ASSISTANT = npc({ name: 'Shop assistant', model: 'human', colour: 0xd08a6a, colour2: 0x6a5a4a, dialogue: 'shopkeeper', options: ['Talk-to', 'Trade'], shop: 'general', wander: 2, examine: 'She helps in the general store.' });
export const BOB = npc({ name: 'Bob', model: 'human', colour: 0x8a5a3a, colour2: 0x4a3a2a, dialogue: 'bob', options: ['Talk-to', 'Trade'], shop: 'bobsaxes', wander: 2, examine: 'The owner of Bob\'s Brilliant Axes.' });
export const BANKER = npc({ name: 'Banker', model: 'human', colour: 0x2a2a4a, colour2: 0x1a1a2a, dialogue: 'banker', options: ['Talk-to', 'Bank', 'Collect'], still: true, examine: 'He can look after my money.' });
export const FRED_THE_FARMER = npc({ name: 'Fred the Farmer', model: 'farmer', colour: 0x9a7a3a, colour2: 0x6a5a2a, dialogue: 'fred', options: ['Talk-to'], wander: 4, examine: 'A local farmer.' });
export const MILLIE_MILLER = npc({ name: 'Millie Miller', model: 'human', colour: 0xe8e0d0, colour2: 0x8a6a4a, dialogue: 'millie', options: ['Talk-to'], wander: 3, examine: 'She works the mill.' });
export const DOOMSAYER = npc({ name: 'Doomsayer', model: 'human', colour: 0x3a2a2a, colour2: 0x2a1a1a, dialogue: 'doomsayer', options: ['Talk-to'], still: true, examine: 'He looks worried.' });
export const AGGIE = npc({ name: 'Aggie', model: 'human', colour: 0x5a3a5a, colour2: 0x3a2a3a, dialogue: 'aggie', options: ['Talk-to'], wander: 2, examine: 'A witch, I think.' });
export const NED = npc({ name: 'Ned', model: 'human', colour: 0x7a6a5a, colour2: 0x4a4a5a, dialogue: 'ned', options: ['Talk-to'], wander: 3, examine: 'An old sailor.' });
export const WISE_OLD_MAN = npc({ name: 'Wise Old Man', model: 'human', colour: 0x2a4a8a, colour2: 0xd8d8d8, dialogue: 'wiseoldman', options: ['Talk-to'], still: true, examine: 'He looks very wise.' });
export const ZEKE = npc({ name: 'Zeke', model: 'human', colour: 0xd8c8a0, colour2: 0x8a7a5a, dialogue: 'zeke', options: ['Talk-to', 'Trade'], shop: 'scimitars', wander: 2, examine: 'The owner of Zeke\'s Superior Scimitars.' });
export const ELLIS = npc({ name: 'Ellis', model: 'human', colour: 0xc0a070, colour2: 0x7a5a3a, dialogue: 'ellis', options: ['Talk-to', 'Trade'], wander: 2, examine: 'A tanner.' });
export const DOMMIK = npc({ name: 'Dommik', model: 'human', colour: 0xa08050, colour2: 0x6a5a3a, dialogue: 'shopkeeper', options: ['Talk-to', 'Trade'], shop: 'crafting', wander: 2, examine: 'The owner of Dommik\'s Crafting Store.' });
export const RANAEL = npc({ name: 'Ranael', model: 'human', colour: 0xd0a0a0, colour2: 0x8a6a6a, dialogue: 'shopkeeper', options: ['Talk-to', 'Trade'], shop: 'plateskirts', wander: 2, examine: 'The owner of Ranael\'s Super Skirt Store.' });
export const KARIM = npc({ name: 'Karim', model: 'human', colour: 0xd8b880, colour2: 0x8a6a4a, dialogue: 'karim', options: ['Talk-to', 'Trade'], shop: 'kebab', wander: 2, examine: 'He sells kebabs.' });
export const GEM_TRADER = npc({ name: 'Gem trader', model: 'human', colour: 0xd8c8a0, colour2: 0x6a5a8a, dialogue: 'shopkeeper', options: ['Talk-to', 'Trade'], shop: 'gems', wander: 2, examine: 'He buys and sells gems.' });
export const SILK_TRADER = npc({ name: 'Silk trader', model: 'human', colour: 0xd8c8a0, colour2: 0x8a4a6a, dialogue: 'silk', options: ['Talk-to', 'Trade'], wander: 2, examine: 'He sells silk.' });
export const BORDER_GUARD = npc({ name: 'Border guard', model: 'guard', colour: 0xd8c8a0, colour2: 0x8a8a94, dialogue: 'borderguard', options: ['Talk-to'], still: true, examine: 'He guards the gate to Al Kharid.' });

/* ================================================================== */
/* Low level monsters                                                  */
/* ================================================================== */

export const CHICKEN = npc({
  name: 'Chicken', model: 'chicken', colour: 0xf0f0f0, colour2: 0xd04030,
  hitpoints: 3, attack: 1, strength: 1, defence: 1, maxHit: 1, attackSpeed: 4,
  attackType: AttackType.STAB, options: ['Attack'], respawn: 25, wander: 4,
  examine: 'Yep, definitely a chicken.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }, { item: RAW_CHICKEN, min: 1, max: 1 }],
    table: [
      { item: FEATHER, min: 5, max: 5, weight: 64 },
      { item: FEATHER, min: 15, max: 15, weight: 32 },
    ],
  },
});

export const DUCK = npc({
  name: 'Duck', model: 'chicken', colour: 0x8a6a3a, colour2: 0xd0c020,
  hitpoints: 3, attack: 1, strength: 1, defence: 1, maxHit: 1, attackSpeed: 4,
  options: ['Attack'], respawn: 25, wander: 4, examine: 'Quack.',
  drops: { always: [{ item: BONES, min: 1, max: 1 }] },
});

export const COW = npc({
  name: 'Cow', model: 'cow', colour: 0xf0f0f0, colour2: 0x4a3020,
  hitpoints: 8, attack: 1, strength: 1, defence: 1, maxHit: 1, attackSpeed: 4,
  options: ['Attack'], respawn: 40, wander: 4, examine: 'Converts grass into beef.',
  drops: {
    always: [
      { item: BONES, min: 1, max: 1 },
      { item: RAW_BEEF, min: 1, max: 1 },
      { item: COWHIDE, min: 1, max: 1 },
    ],
  },
});

export const COW_CALF = npc({
  name: 'Cow calf', model: 'cow', colour: 0xf0f0f0, colour2: 0x6a4a30, scale: 0.7,
  hitpoints: 6, attack: 1, strength: 1, defence: 1, maxHit: 1, attackSpeed: 4,
  options: ['Attack'], respawn: 40, wander: 4, examine: 'A baby cow.',
  drops: {
    always: [
      { item: BONES, min: 1, max: 1 },
      { item: RAW_BEEF, min: 1, max: 1 },
      { item: COWHIDE, min: 1, max: 1 },
    ],
  },
});

export const RAT = npc({
  name: 'Rat', model: 'rat', colour: 0x6a5a4a,
  hitpoints: 2, attack: 1, strength: 1, defence: 1, maxHit: 1, attackSpeed: 4,
  options: ['Attack'], respawn: 25, wander: 5, examine: 'Ugh, a rat.',
  drops: { always: [{ item: BONES, min: 1, max: 1 }] },
});

export const GIANT_RAT = npc({
  name: 'Giant rat', model: 'rat', colour: 0x7a5a3a, scale: 1.4,
  hitpoints: 5, attack: 2, strength: 2, defence: 2, maxHit: 1, attackSpeed: 4,
  options: ['Attack'], respawn: 30, wander: 5, examine: 'Now that\'s a big rat!',
  drops: { always: [{ item: BONES, min: 1, max: 1 }] },
});

export const GIANT_RAT_6 = npc({
  name: 'Giant rat', model: 'rat', colour: 0x8a6a3a, scale: 1.5,
  hitpoints: 10, attack: 4, strength: 4, defence: 4, maxHit: 2, attackSpeed: 4,
  options: ['Attack'], respawn: 30, wander: 5, examine: 'Now that\'s a big rat!',
  drops: { always: [{ item: BONES, min: 1, max: 1 }] },
});

export const GOBLIN = npc({
  name: 'Goblin', model: 'goblin', colour: 0x5a8a3a, colour2: 0x8a2a2a,
  hitpoints: 5, attack: 1, strength: 1, defence: 1, maxHit: 1, attackSpeed: 4,
  options: ['Attack'], respawn: 30, wander: 6, examine: 'An ugly green creature.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [
      { item: COINS, min: 1, max: 24, weight: 38 },
      { item: 2347, min: 1, max: 1, weight: 15 }, // Hammer
      { item: 288, min: 1, max: 1, weight: 5 }, // Goblin mail
      { item: 1949, min: 1, max: 1, weight: 3 }, // Chef's hat
      { item: 1917, min: 1, max: 1, weight: 2 }, // Beer
      { item: 1438, min: 1, max: 1, weight: 1 }, // Air talisman
      { item: 315, min: 1, max: 1, weight: 4 }, // Shrimps
    ],
  },
});

export const GOBLIN_5 = npc({
  name: 'Goblin', model: 'goblin', colour: 0x4a7a2a, colour2: 0x2a4a8a,
  hitpoints: 12, attack: 3, strength: 3, defence: 1, maxHit: 2, attackSpeed: 4,
  options: ['Attack'], respawn: 30, wander: 6, examine: 'An ugly green creature.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [
      { item: COINS, min: 5, max: 42, weight: 44 },
      { item: 2347, min: 1, max: 1, weight: 12 },
      { item: 288, min: 1, max: 1, weight: 6 },
      { item: 1205, min: 1, max: 1, weight: 3 }, // Bronze dagger
      { item: 1277, min: 1, max: 1, weight: 2 }, // Bronze sword
      { item: 1438, min: 1, max: 1, weight: 1 },
    ],
  },
});

export const MAN = npc({
  name: 'Man', model: 'human', colour: 0x8a6a4a, colour2: 0x5a4a3a,
  hitpoints: 7, attack: 1, strength: 1, defence: 1, maxHit: 1, attackSpeed: 4,
  options: ['Attack', 'Pickpocket'], respawn: 30, wander: 6, examine: 'One of Lumbridge\'s citizens.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [
      { item: COINS, min: 3, max: 25, weight: 70 },
      { item: 1917, min: 1, max: 1, weight: 10 },
      { item: 2309, min: 1, max: 1, weight: 8 },
      { item: 995, min: 40, max: 40, weight: 6 },
      { item: 1621, min: 1, max: 1, weight: 1 },
    ],
  },
});

export const WOMAN = npc({
  name: 'Woman', model: 'human', colour: 0xd08a6a, colour2: 0x8a4a6a,
  hitpoints: 7, attack: 1, strength: 1, defence: 1, maxHit: 1, attackSpeed: 4,
  options: ['Attack', 'Pickpocket'], respawn: 30, wander: 6, examine: 'One of Lumbridge\'s citizens.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [
      { item: COINS, min: 3, max: 25, weight: 70 },
      { item: 1917, min: 1, max: 1, weight: 10 },
      { item: 2309, min: 1, max: 1, weight: 8 },
      { item: 995, min: 40, max: 40, weight: 6 },
      { item: 1623, min: 1, max: 1, weight: 1 },
    ],
  },
});

export const FARMER = npc({
  name: 'Farmer', model: 'farmer', colour: 0x9a7a3a, colour2: 0x6a5a2a,
  hitpoints: 12, attack: 6, strength: 5, defence: 4, maxHit: 2, attackSpeed: 4,
  options: ['Attack', 'Pickpocket'], respawn: 35, wander: 5, examine: 'A hard working farmer.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [
      { item: COINS, min: 9, max: 9, weight: 123 },
      { item: 5318, min: 1, max: 1, weight: 5 }, // Potato seed
    ],
  },
});

export const GUARD = npc({
  name: 'Guard', model: 'guard', colour: 0x8a8a94, colour2: 0x6a2a2a,
  hitpoints: 22, attack: 18, strength: 16, defence: 19, maxHit: 4, attackSpeed: 4,
  options: ['Attack'], respawn: 40, wander: 5, examine: 'He\'s on guard duty.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [
      { item: COINS, min: 10, max: 60, weight: 80 },
      { item: 2309, min: 1, max: 1, weight: 12 },
      { item: 1205, min: 1, max: 1, weight: 8 },
      { item: 1139, min: 1, max: 1, weight: 6 },
      { item: 453, min: 1, max: 1, weight: 10 },
      { item: 1621, min: 1, max: 1, weight: 2 },
      { item: 0, min: 0, max: 0, weight: 10, rdt: true },
    ],
  },
});

export const AL_KHARID_WARRIOR = npc({
  name: 'Al Kharid warrior', model: 'guard', colour: 0xd8c8a0, colour2: 0x8a8a94,
  hitpoints: 18, attack: 6, strength: 6, defence: 5, maxHit: 3, attackSpeed: 4,
  options: ['Attack'], respawn: 40, wander: 5, examine: 'A desert warrior.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [
      { item: COINS, min: 5, max: 40, weight: 100 },
      { item: 1971, min: 1, max: 1, weight: 15 },
      { item: 1323, min: 1, max: 1, weight: 8 },
      { item: 0, min: 0, max: 0, weight: 5, rdt: true },
    ],
  },
});

export const IMP = npc({
  name: 'Imp', model: 'imp', colour: 0x9a3a2a, scale: 0.75,
  hitpoints: 8, attack: 1, strength: 1, defence: 1, maxHit: 1, attackSpeed: 4,
  options: ['Attack'], respawn: 45, wander: 12, examine: 'A cheeky little demon.',
  drops: {
    table: [
      { item: 1436, min: 1, max: 1, weight: 20 },
      { item: 592, min: 1, max: 1, weight: 30 },
      { item: COINS, min: 1, max: 12, weight: 40 },
      { item: 314, min: 3, max: 3, weight: 20 },
      { item: 1438, min: 1, max: 1, weight: 5 },
    ],
  },
});

export const DWARF = npc({
  name: 'Dwarf', model: 'dwarf', colour: 0x8a6a4a, colour2: 0x6a4a2a, scale: 0.8,
  hitpoints: 16, attack: 7, strength: 7, defence: 7, maxHit: 2, attackSpeed: 5,
  options: ['Attack'], respawn: 40, wander: 5, examine: 'A short, stocky warrior.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [
      { item: COINS, min: 5, max: 30, weight: 60 },
      { item: 1265, min: 1, max: 1, weight: 13 },
      { item: 1139, min: 1, max: 1, weight: 4 },
      { item: 1375, min: 1, max: 1, weight: 2 },
      { item: 1363, min: 1, max: 1, weight: 1 },
      { item: 562, min: 2, max: 2, weight: 4 },
      { item: 561, min: 2, max: 2, weight: 4 },
      { item: 453, min: 1, max: 2, weight: 20 },
      { item: 1621, min: 1, max: 1, weight: 1 },
    ],
  },
});

export const BARBARIAN = npc({
  name: 'Barbarian', model: 'barbarian', colour: 0x9a7a5a, colour2: 0x5a3a2a,
  hitpoints: 16, attack: 7, strength: 7, defence: 7, maxHit: 3, attackSpeed: 4,
  options: ['Attack'], respawn: 40, wander: 5, examine: 'A hairy northerner.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [
      { item: COINS, min: 5, max: 45, weight: 70 },
      { item: 1277, min: 1, max: 1, weight: 10 },
      { item: 1291, min: 1, max: 1, weight: 6 },
      { item: 1117, min: 1, max: 1, weight: 4 },
      { item: 1917, min: 1, max: 1, weight: 20 },
      { item: 0, min: 0, max: 0, weight: 5, rdt: true },
    ],
  },
});

export const MONK = npc({
  name: 'Monk', model: 'monk', colour: 0x9a7a4a,
  hitpoints: 10, attack: 3, strength: 3, defence: 3, maxHit: 1, attackSpeed: 4,
  options: ['Attack', 'Talk-to'], respawn: 40, wander: 4, dialogue: 'monk',
  examine: 'He looks peaceful.',
  drops: { always: [{ item: BONES, min: 1, max: 1 }], table: [{ item: COINS, min: 5, max: 20, weight: 100 }] },
});

export const HIGHWAYMAN = npc({
  name: 'Highwayman', model: 'human', colour: 0x2a2a2a, colour2: 0x1a1a1a,
  hitpoints: 10, attack: 4, strength: 3, defence: 2, maxHit: 2, attackSpeed: 4,
  attackType: AttackType.STAB, aggressive: true, aggroRange: 4, aggroMaxLevel: 11,
  options: ['Attack'], respawn: 40, wander: 4, examine: 'Stand and deliver!',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }, { item: 1019, min: 1, max: 1 }],
    table: [{ item: COINS, min: 10, max: 50, weight: 100 }],
  },
});

export const THUG = npc({
  name: 'Thug', model: 'human', colour: 0x4a3a2a, colour2: 0x2a2a2a,
  hitpoints: 18, attack: 7, strength: 7, defence: 5, maxHit: 3, attackSpeed: 4,
  aggressive: true, aggroRange: 3, aggroMaxLevel: 20,
  options: ['Attack'], respawn: 40, wander: 4, examine: 'A nasty piece of work.',
  drops: { always: [{ item: BONES, min: 1, max: 1 }], table: [{ item: COINS, min: 10, max: 40, weight: 120 }] },
});

export const WIZARD = npc({
  name: 'Wizard', model: 'wizard', colour: 0x2a3a9a, colour2: 0xd8d8d8,
  hitpoints: 15, attack: 1, strength: 1, defence: 3, magic: 11, maxHit: 4,
  attackSpeed: 5, attackType: AttackType.MAGIC, attackRange: 7, projectile: 'strike_water',
  options: ['Attack'], respawn: 45, wander: 5, examine: 'A student of magic.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [
      { item: 1379, min: 1, max: 1, weight: 8 },
      { item: 577, min: 1, max: 1, weight: 7 },
      { item: 579, min: 1, max: 1, weight: 3 },
      { item: 562, min: 2, max: 2, weight: 8 },
      { item: 561, min: 2, max: 2, weight: 8 },
      { item: 556, min: 5, max: 12, weight: 20 },
      { item: 555, min: 4, max: 10, weight: 20 },
      { item: 558, min: 5, max: 15, weight: 20 },
      { item: 1444, min: 1, max: 1, weight: 3 },
      { item: 1448, min: 1, max: 1, weight: 4 },
      { item: 563, min: 2, max: 2, weight: 1 },
    ],
  },
});

export const DARK_WIZARD = npc({
  name: 'Dark wizard', model: 'wizard', colour: 0x1a1a1a, colour2: 0x3a1a3a,
  hitpoints: 12, attack: 1, strength: 1, defence: 1, magic: 9, maxHit: 3,
  attackSpeed: 5, attackType: AttackType.MAGIC, attackRange: 7, projectile: 'strike_water',
  aggressive: true, aggroRange: 4, aggroMaxLevel: 15,
  options: ['Attack'], respawn: 45, wander: 4, examine: 'A worshipper of Zamorak.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [
      { item: 1379, min: 1, max: 1, weight: 8 },
      { item: 562, min: 2, max: 2, weight: 10 },
      { item: 556, min: 5, max: 12, weight: 25 },
      { item: 557, min: 4, max: 10, weight: 25 },
      { item: 558, min: 5, max: 15, weight: 25 },
      { item: 1442, min: 1, max: 1, weight: 3 },
      { item: COINS, min: 5, max: 30, weight: 25 },
    ],
  },
});

export const DARK_WIZARD_20 = npc({
  name: 'Dark wizard', model: 'wizard', colour: 0x1a1a1a, colour2: 0x5a1a1a, scale: 1.05,
  hitpoints: 25, attack: 1, strength: 1, defence: 12, magic: 25, maxHit: 6,
  attackSpeed: 5, attackType: AttackType.MAGIC, attackRange: 7, projectile: 'strike_earth',
  aggressive: true, aggroRange: 4, aggroMaxLevel: 40,
  options: ['Attack'], respawn: 45, wander: 4, examine: 'A powerful worshipper of Zamorak.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [
      { item: 562, min: 4, max: 8, weight: 20 },
      { item: 560, min: 1, max: 3, weight: 6 },
      { item: 563, min: 1, max: 3, weight: 6 },
      { item: COINS, min: 20, max: 90, weight: 60 },
      { item: 0, min: 0, max: 0, weight: 8, rdt: true },
    ],
  },
});

export const SKELETON = npc({
  name: 'Skeleton', model: 'skeleton', colour: 0xe0dcc8,
  hitpoints: 20, attack: 19, strength: 18, defence: 18, maxHit: 3, attackSpeed: 4,
  bonuses: { defenceCrush: -8, defenceStab: 5 },
  options: ['Attack'], respawn: 45, wander: 4, examine: 'A skeletal warrior.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [
      { item: COINS, min: 5, max: 60, weight: 80 },
      { item: 453, min: 1, max: 1, weight: 15 },
      { item: 1205, min: 1, max: 1, weight: 10 },
      { item: 0, min: 0, max: 0, weight: 8, rdt: true },
    ],
  },
});

export const ZOMBIE = npc({
  name: 'Zombie', model: 'zombie', colour: 0x6a7a5a, colour2: 0x4a3a3a,
  hitpoints: 16, attack: 11, strength: 10, defence: 10, maxHit: 2, attackSpeed: 5,
  options: ['Attack'], respawn: 45, wander: 4, examine: 'It\'s been dead a while.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [
      { item: COINS, min: 3, max: 40, weight: 90 },
      { item: 1205, min: 1, max: 1, weight: 8 },
      { item: 526, min: 1, max: 1, weight: 20 },
      { item: 0, min: 0, max: 0, weight: 6, rdt: true },
    ],
  },
});

export const GHOST = npc({
  name: 'Ghost', model: 'ghost', colour: 0xa8c0d0,
  hitpoints: 18, attack: 17, strength: 16, defence: 17, maxHit: 3, attackSpeed: 4,
  options: ['Attack'], respawn: 50, wander: 4, examine: 'A restless spirit.',
  drops: { table: [{ item: COINS, min: 1, max: 30, weight: 60 }] },
});

export const SPIDER = npc({
  name: 'Spider', model: 'spider', colour: 0x2a2a2a, scale: 0.6,
  hitpoints: 5, attack: 1, strength: 1, defence: 1, maxHit: 1, attackSpeed: 4,
  options: ['Attack'], respawn: 30, wander: 5, examine: 'Eight legs of fun.',
  drops: {},
});

export const GIANT_SPIDER = npc({
  name: 'Giant spider', model: 'spider', colour: 0x3a2a2a, scale: 1.3,
  hitpoints: 26, attack: 24, strength: 23, defence: 23, maxHit: 4, attackSpeed: 4,
  options: ['Attack'], respawn: 45, wander: 5, examine: 'Big, hairy and horrible.',
  drops: { table: [{ item: COINS, min: 5, max: 50, weight: 60 }, { item: 0, min: 0, max: 0, weight: 8, rdt: true }] },
});

export const SCORPION = npc({
  name: 'Scorpion', model: 'scorpion', colour: 0x8a5a2a,
  hitpoints: 15, attack: 12, strength: 12, defence: 12, maxHit: 3, attackSpeed: 4,
  aggressive: true, aggroRange: 4, aggroMaxLevel: 29,
  options: ['Attack'], respawn: 40, wander: 5, examine: 'Nasty pointy thing on its tail.',
  drops: { always: [{ item: BONES, min: 1, max: 1 }], table: [{ item: COINS, min: 3, max: 35, weight: 80 }] },
});

export const KING_SCORPION = npc({
  name: 'King Scorpion', model: 'scorpion', colour: 0x3a3a5a, scale: 1.35,
  hitpoints: 35, attack: 26, strength: 26, defence: 26, maxHit: 5, attackSpeed: 4,
  aggressive: true, aggroRange: 5, aggroMaxLevel: 65,
  options: ['Attack'], respawn: 50, wander: 5, examine: 'The king of scorpions.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [{ item: COINS, min: 20, max: 120, weight: 90 }, { item: 0, min: 0, max: 0, weight: 12, rdt: true }],
  },
});

export const BLACK_BEAR = npc({
  name: 'Black bear', model: 'bear', colour: 0x2a2018,
  hitpoints: 25, attack: 15, strength: 15, defence: 15, maxHit: 3, attackSpeed: 4,
  options: ['Attack'], respawn: 45, wander: 5, examine: 'A large brown bear.',
  drops: { always: [{ item: BONES, min: 1, max: 1 }], table: [{ item: COINS, min: 5, max: 45, weight: 80 }] },
});

export const GRIZZLY_BEAR = npc({
  name: 'Grizzly bear', model: 'bear', colour: 0x5a4030, scale: 1.1,
  hitpoints: 27, attack: 16, strength: 16, defence: 16, maxHit: 4, attackSpeed: 4,
  aggressive: true, aggroRange: 4, aggroMaxLevel: 42,
  options: ['Attack'], respawn: 45, wander: 5, examine: 'A big, angry bear.',
  drops: { always: [{ item: BONES, min: 1, max: 1 }], table: [{ item: COINS, min: 10, max: 60, weight: 80 }] },
});

export const UNICORN = npc({
  name: 'Unicorn', model: 'unicorn', colour: 0xf0f0f0,
  hitpoints: 20, attack: 12, strength: 12, defence: 12, maxHit: 3, attackSpeed: 4,
  options: ['Attack'], respawn: 45, wander: 6, examine: 'A wild unicorn.',
  drops: { always: [{ item: BONES, min: 1, max: 1 }] },
});

export const HOBGOBLIN = npc({
  name: 'Hobgoblin', model: 'goblin', colour: 0x3a5a3a, colour2: 0x6a4a2a, scale: 1.25,
  hitpoints: 29, attack: 22, strength: 22, defence: 26, maxHit: 4, attackSpeed: 4,
  options: ['Attack'], respawn: 45, wander: 5, examine: 'A cross between a goblin and a hob.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [
      { item: COINS, min: 10, max: 80, weight: 70 },
      { item: 453, min: 1, max: 1, weight: 12 },
      { item: 1103, min: 1, max: 1, weight: 5 },
      { item: 0, min: 0, max: 0, weight: 10, rdt: true },
    ],
  },
});

export const HILL_GIANT = npc({
  name: 'Hill Giant', model: 'giant', colour: 0xa08060, colour2: 0x5a4a3a, size: 1, scale: 1.6,
  hitpoints: 35, attack: 21, strength: 21, defence: 24, maxHit: 5, attackSpeed: 5,
  aggressive: true, aggroRange: 5, aggroMaxLevel: 57,
  options: ['Attack'], respawn: 50, wander: 5, examine: 'Not the sharpest tool in the shed.',
  drops: {
    always: [{ item: BIG_BONES, min: 1, max: 1 }],
    table: [
      { item: COINS, min: 20, max: 120, weight: 45 },
      { item: 1203, min: 1, max: 1, weight: 4 },
      { item: 1137, min: 1, max: 1, weight: 5 },
      { item: 1153, min: 1, max: 1, weight: 5 },
      { item: 1191, min: 1, max: 1, weight: 3 },
      { item: 1325, min: 1, max: 1, weight: 2 },
      { item: 1295, min: 1, max: 1, weight: 2 },
      { item: 1521, min: 1, max: 1, weight: 6 },
      { item: 561, min: 3, max: 3, weight: 6 },
      { item: 562, min: 3, max: 3, weight: 6 },
      { item: 0, min: 0, max: 0, weight: 16, rdt: true },
    ],
  },
});

export const MOSS_GIANT = npc({
  name: 'Moss giant', model: 'giant', colour: 0x4a6a3a, colour2: 0x2a4a2a, scale: 1.7,
  hitpoints: 60, attack: 30, strength: 30, defence: 30, maxHit: 8, attackSpeed: 5,
  options: ['Attack'], respawn: 55, wander: 5, examine: 'He is a big fellow.',
  drops: {
    always: [{ item: BIG_BONES, min: 1, max: 1 }],
    table: [
      { item: COINS, min: 30, max: 200, weight: 45 },
      { item: 1381, min: 1, max: 1, weight: 3 },
      { item: 1201, min: 1, max: 1, weight: 1 },
      { item: 453, min: 1, max: 3, weight: 12 },
      { item: 561, min: 5, max: 5, weight: 8 },
      { item: 1623, min: 1, max: 1, weight: 3 },
      { item: 0, min: 0, max: 0, weight: 20, rdt: true },
    ],
  },
});

export const BLACK_KNIGHT = npc({
  name: 'Black Knight', model: 'knight', colour: 0x1a1a1a, colour2: 0x2a2a2a,
  hitpoints: 42, attack: 26, strength: 26, defence: 26, maxHit: 6, attackSpeed: 4,
  aggressive: true, aggroRange: 4, aggroMaxLevel: 66,
  options: ['Attack'], respawn: 50, wander: 4, examine: 'A knight of the Kinshra.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [
      { item: COINS, min: 20, max: 150, weight: 70 },
      { item: 1125, min: 1, max: 1, weight: 3 },
      { item: 1283, min: 1, max: 1, weight: 4 },
      { item: 0, min: 0, max: 0, weight: 14, rdt: true },
    ],
  },
});

export const CHAOS_DRUID = npc({
  name: 'Chaos druid', model: 'monk', colour: 0x4a2a5a,
  hitpoints: 20, attack: 9, strength: 9, defence: 9, maxHit: 3, attackSpeed: 4,
  options: ['Attack'], respawn: 45, wander: 4, examine: 'A crazed follower of Zamorak.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [
      { item: COINS, min: 5, max: 60, weight: 60 },
      { item: 561, min: 2, max: 2, weight: 10 },
      { item: 563, min: 2, max: 2, weight: 8 },
      { item: 1623, min: 1, max: 1, weight: 4 },
      { item: 0, min: 0, max: 0, weight: 10, rdt: true },
    ],
  },
});

export const DEADLY_RED_SPIDER = npc({
  name: 'Deadly red spider', model: 'spider', colour: 0x9a1a1a, scale: 1.2,
  hitpoints: 40, attack: 27, strength: 28, defence: 27, maxHit: 5, attackSpeed: 4,
  aggressive: true, aggroRange: 4, aggroMaxLevel: 68,
  options: ['Attack'], respawn: 50, wander: 4, examine: 'It has deadly poison dripping from its fangs.',
  drops: { table: [{ item: COINS, min: 20, max: 100, weight: 80 }, { item: 0, min: 0, max: 0, weight: 15, rdt: true }] },
});

export const LESSER_DEMON = npc({
  name: 'Lesser demon', model: 'demon', colour: 0x9a2a1a, scale: 1.8, size: 2,
  hitpoints: 79, attack: 68, strength: 70, defence: 70, maxHit: 8, attackSpeed: 4,
  options: ['Attack'], respawn: 60, wander: 4, examine: 'A demon from the abyss.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [
      { item: COINS, min: 50, max: 400, weight: 45 },
      { item: 1147, min: 1, max: 1, weight: 3 },
      { item: 1353, min: 1, max: 1, weight: 3 },
      { item: 1295, min: 1, max: 1, weight: 3 },
      { item: 1109, min: 1, max: 1, weight: 1 },
      { item: 1303, min: 1, max: 1, weight: 1 },
      { item: 554, min: 10, max: 20, weight: 10 },
      { item: 0, min: 0, max: 0, weight: 25, rdt: true },
    ],
  },
});

export const JAIL_GUARD = npc({
  name: 'Jail guard', model: 'guard', colour: 0x7a7a84, colour2: 0x3a3a4a,
  hitpoints: 29, attack: 21, strength: 21, defence: 21, maxHit: 5, attackSpeed: 4,
  aggressive: true, aggroRange: 4, aggroMaxLevel: 52,
  options: ['Attack'], respawn: 45, wander: 4, examine: 'He guards the prison.',
  drops: {
    always: [{ item: BONES, min: 1, max: 1 }],
    table: [{ item: COINS, min: 15, max: 70, weight: 100 }, { item: 0, min: 0, max: 0, weight: 8, rdt: true }],
  },
});

/* Fishing spots and other interactive "NPCs" */
export const FISHING_SPOT_NET = npc({
  name: 'Fishing spot', model: 'fishspot', colour: 0x60a0d0,
  options: ['Net', 'Bait'], still: true, respawn: 0, examine: 'You can catch shrimps and anchovies here.',
});
export const FISHING_SPOT_LURE = npc({
  name: 'Fishing spot', model: 'fishspot', colour: 0x60a0d0,
  options: ['Lure', 'Bait'], still: true, respawn: 0, examine: 'You can catch trout and salmon here.',
});
export const FISHING_SPOT_CAGE = npc({
  name: 'Fishing spot', model: 'fishspot', colour: 0x60a0d0,
  options: ['Cage', 'Harpoon'], still: true, respawn: 0, examine: 'You can catch lobsters and tuna here.',
});

export function npcDef(id: number): NpcDef | undefined {
  return defs[id];
}

export function allNpcs(): NpcDef[] {
  return defs;
}
