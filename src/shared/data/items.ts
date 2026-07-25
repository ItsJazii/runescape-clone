import type { Bonuses } from '../combat.ts';
import { WeaponType } from '../combat.ts';
import { Skill } from '../skills.ts';

/** Equipment slots, using RuneScape's own slot numbering. */
export const enum EquipSlot {
  HEAD = 0,
  CAPE = 1,
  AMULET = 2,
  WEAPON = 3,
  BODY = 4,
  SHIELD = 5,
  LEGS = 7,
  HANDS = 9,
  FEET = 10,
  RING = 12,
  AMMO = 13,
}

export const EQUIP_SLOT_COUNT = 14;

export const EQUIP_SLOT_NAMES: Record<number, string> = {
  0: 'Head',
  1: 'Cape',
  2: 'Neck',
  3: 'Weapon',
  4: 'Body',
  5: 'Shield',
  7: 'Legs',
  9: 'Hands',
  10: 'Feet',
  12: 'Ring',
  13: 'Ammo',
};

export interface ItemDef {
  id: number;
  name: string;
  examine: string;
  /** Base shop value. High alchemy = 60%, low alchemy = 40%. */
  value: number;
  stackable?: boolean;
  /** Item id of the noted version. */
  noted?: number;
  /** If this item IS a note, the id of the real item. */
  notedOf?: number;
  equip?: EquipSlot;
  twoHanded?: boolean;
  weight?: number;
  weapon?: { type: WeaponType; speed: number; range?: number };
  bonuses?: Partial<Bonuses>;
  reqs?: [Skill, number][];
  /** Extra inventory options, e.g. ['Eat'] or ['Bury']. */
  options?: string[];
  /** Hitpoints healed when eaten. */
  heal?: number;
  /** Prayer xp when buried. */
  buryXp?: number;
  /** Icon shape used by the procedural icon renderer. */
  icon: string;
  /** Primary colour (0xRRGGBB) used by the icon + 3D model. */
  colour: number;
  /** Secondary colour for the icon renderer. */
  colour2?: number;
  members?: boolean;
  /** Tradeable on the ground / to other players. */
  untradeable?: boolean;
}

const registry = new Map<number, ItemDef>();
const byName = new Map<string, ItemDef>();

function def(id: number, name: string, o: Partial<ItemDef> & { icon: string; colour: number }): ItemDef {
  const item: ItemDef = {
    id,
    name,
    examine: o.examine ?? `It's a ${name.toLowerCase()}.`,
    value: o.value ?? 1,
    ...o,
  };
  registry.set(id, item);
  if (!byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), item);
  return item;
}

export function itemDef(id: number): ItemDef | undefined {
  return registry.get(id);
}

export function itemName(id: number): string {
  return registry.get(id)?.name ?? 'null';
}

export function itemByName(name: string): ItemDef | undefined {
  return byName.get(name.toLowerCase());
}

export function allItems(): ItemDef[] {
  return [...registry.values()];
}

export function isStackable(id: number): boolean {
  const d = registry.get(id);
  return !!d && (d.stackable === true || d.notedOf !== undefined);
}

export function highAlchValue(id: number): number {
  return Math.floor((registry.get(id)?.value ?? 0) * 0.6);
}

export function lowAlchValue(id: number): number {
  return Math.floor((registry.get(id)?.value ?? 0) * 0.4);
}

/* ================================================================== */
/* Currency & basics                                                   */
/* ================================================================== */

def(995, 'Coins', { stackable: true, value: 1, icon: 'coins', colour: 0xffd93b, examine: 'Lovely money!' });
def(1755, 'Chisel', { value: 14, icon: 'chisel', colour: 0x9a9a9a, examine: 'Good for cutting gems.' });
def(2347, 'Hammer', { value: 13, icon: 'hammer', colour: 0x6b6b6b, examine: 'Good for hitting things.' });
def(946, 'Knife', { value: 6, icon: 'knife', colour: 0xb0b0b0, examine: 'A sharp knife.' });
def(1733, 'Needle', { value: 1, icon: 'needle', colour: 0xcccccc, examine: 'Used in crafting.' });
def(1734, 'Thread', { value: 1, stackable: true, icon: 'thread', colour: 0xe8e0c0, examine: 'Used in crafting.' });
def(952, 'Spade', { value: 3, icon: 'spade', colour: 0x8a5a2b, examine: 'A sturdy spade.' });
def(954, 'Rope', { value: 18, icon: 'rope', colour: 0xb08040, examine: 'A coil of sturdy rope.' });
def(590, 'Tinderbox', { value: 1, icon: 'tinderbox', colour: 0x8a5a2b, examine: 'Useful for lighting a fire.' });
def(1931, 'Pot', { value: 1, icon: 'pot', colour: 0xc0925f, examine: 'This pot is empty.' });
def(1933, 'Pot of flour', { value: 5, icon: 'pot', colour: 0xf0ecd8, examine: 'A pot filled with flour.' });
def(1925, 'Bucket', { value: 2, icon: 'bucket', colour: 0x8d8d8d, examine: 'It\'s a wooden bucket.' });
def(1929, 'Bucket of water', { value: 4, icon: 'bucket', colour: 0x4a7fd0, examine: 'A bucket filled with water.' });
def(1927, 'Bucket of milk', { value: 6, icon: 'bucket', colour: 0xf5f5f0, examine: 'A bucket filled with milk.' });
def(1935, 'Jug', { value: 1, icon: 'jug', colour: 0xd8d0b8, examine: 'It\'s a jug.' });
def(1937, 'Jug of water', { value: 2, icon: 'jug', colour: 0x4a7fd0, examine: 'A jug of water.' });
def(227, 'Vial of water', { value: 2, icon: 'vial', colour: 0x6ea8e8, examine: 'A vial of water.' });
def(229, 'Vial', { value: 2, icon: 'vial', colour: 0xd8e8f0, examine: 'An empty glass vial.' });
def(1944, 'Egg', { value: 4, icon: 'egg', colour: 0xf2e8d0, examine: 'A nice fresh egg.' });
def(1942, 'Potato', { value: 1, icon: 'potato', colour: 0xc39b62, options: ['Eat'], heal: 1, examine: 'A raw potato.' });
def(1957, 'Onion', { value: 2, icon: 'onion', colour: 0xe8d8a0, options: ['Eat'], heal: 1, examine: 'It\'s an onion.' });
def(1965, 'Cabbage', { value: 1, icon: 'cabbage', colour: 0x5fa04a, options: ['Eat'], heal: 1, examine: 'Yuck! I don\'t like cabbage.' });
def(1982, 'Tomato', { value: 1, icon: 'tomato', colour: 0xc23b2b, options: ['Eat'], heal: 2, examine: 'A red tomato.' });
def(1985, 'Cheese', { value: 5, icon: 'cheese', colour: 0xf0d060, options: ['Eat'], heal: 2, examine: 'A tasty lump of cheese.' });
def(1915, 'Wine of Zamorak', { value: 200, icon: 'jug', colour: 0x7a1030, members: true, examine: 'A jug of evil-looking wine.' });
def(1917, 'Beer', { value: 2, icon: 'beer', colour: 0xd8a23a, options: ['Drink'], heal: 1, examine: 'A glass of frothy ale.' });
def(1919, 'Beer glass', { value: 1, icon: 'beer', colour: 0xd8e8f0, examine: 'An empty beer glass.' });
def(1963, 'Banana', { value: 2, icon: 'food', colour: 0xf0d84a, options: ['Eat'], heal: 2, examine: 'Mmm, this looks tasty.' });
def(2309, 'Bread', { value: 12, icon: 'bread', colour: 0xd0a050, options: ['Eat'], heal: 5, examine: 'Nice crispy bread.' });
def(2307, 'Bread dough', { value: 1, icon: 'bread', colour: 0xe8dcc0, examine: 'Some uncooked dough.' });
def(1891, 'Cake', { value: 100, icon: 'cake', colour: 0xf0e0c0, options: ['Eat'], heal: 4, examine: 'This looks tasty.' });
def(1971, 'Kebab', { value: 1, icon: 'kebab', colour: 0xa05a2a, options: ['Eat'], heal: 3, examine: 'A greasy kebab.' });
def(1550, 'Waterskin(4)', { value: 20, icon: 'jug', colour: 0x9a6a3a, members: true, examine: 'A full waterskin.' });

/* ================================================================== */
/* Bones & prayer                                                      */
/* ================================================================== */

def(526, 'Bones', { value: 1, icon: 'bones', colour: 0xe8e4d0, options: ['Bury'], buryXp: 4.5, examine: 'Bones.' });
def(532, 'Big bones', { value: 1, icon: 'bones', colour: 0xe8e4d0, options: ['Bury'], buryXp: 15, examine: 'Ew, it\'s a pile of big bones.' });
def(530, 'Bat bones', { value: 1, icon: 'bones', colour: 0xd8d4c0, options: ['Bury'], buryXp: 5.3, examine: 'Bat bones.' });
def(528, 'Burnt bones', { value: 1, icon: 'bones', colour: 0x6a6a60, options: ['Bury'], buryXp: 4.5, examine: 'Charred bones.' });
def(2859, 'Wolf bones', { value: 1, icon: 'bones', colour: 0xe8e4d0, options: ['Bury'], buryXp: 4.5, examine: 'Wolf bones.' });
def(536, 'Dragon bones', { value: 1, icon: 'bones', colour: 0xf0ece0, options: ['Bury'], buryXp: 72, members: true, examine: 'Ew, it\'s a pile of dragon bones.' });
def(592, 'Ashes', { value: 1, icon: 'ashes', colour: 0x4a4a4a, examine: 'A pile of ashes.' });

/* ================================================================== */
/* Woodcutting & Firemaking                                            */
/* ================================================================== */

def(1511, 'Logs', { value: 4, icon: 'log', colour: 0x8a5a2b, examine: 'A number of wooden logs.' });
def(1521, 'Oak logs', { value: 20, icon: 'log', colour: 0x7a4a24, examine: 'Logs cut from an oak tree.' });
def(1519, 'Willow logs', { value: 8, icon: 'log', colour: 0x9a7a44, examine: 'Logs cut from a willow tree.' });
def(6333, 'Teak logs', { value: 30, icon: 'log', colour: 0x8a4a20, members: true, examine: 'Logs cut from a teak tree.' });
def(1517, 'Maple logs', { value: 32, icon: 'log', colour: 0xa05a2a, members: true, examine: 'Logs cut from a maple tree.' });
def(6332, 'Mahogany logs', { value: 40, icon: 'log', colour: 0x7a3018, members: true, examine: 'Logs cut from a mahogany tree.' });
def(1515, 'Yew logs', { value: 80, icon: 'log', colour: 0x5a3a1c, examine: 'Logs cut from a yew tree.' });
def(1513, 'Magic logs', { value: 240, icon: 'log', colour: 0x5a5ac0, members: true, examine: 'Magical logs.' });

/* ================================================================== */
/* Mining & Smithing                                                   */
/* ================================================================== */

def(434, 'Clay', { value: 20, icon: 'ore', colour: 0xb08a68, examine: 'This needs refining.' });
def(1761, 'Soft clay', { value: 20, icon: 'ore', colour: 0xa07a58, examine: 'Ready to be moulded.' });
def(436, 'Copper ore', { value: 3, icon: 'ore', colour: 0xc07a3a, examine: 'This needs refining.' });
def(438, 'Tin ore', { value: 3, icon: 'ore', colour: 0xa8a8b0, examine: 'This needs refining.' });
def(440, 'Iron ore', { value: 17, icon: 'ore', colour: 0x8a4a3a, examine: 'This needs refining.' });
def(442, 'Silver ore', { value: 56, icon: 'ore', colour: 0xd0d0d8, examine: 'This needs refining.' });
def(453, 'Coal', { value: 45, icon: 'ore', colour: 0x2a2a2a, examine: 'Hmm, a non-renewable energy source!' });
def(444, 'Gold ore', { value: 150, icon: 'ore', colour: 0xe8c040, examine: 'This needs refining.' });
def(447, 'Mithril ore', { value: 162, icon: 'ore', colour: 0x5a5ac0, examine: 'This needs refining.' });
def(449, 'Adamantite ore', { value: 400, icon: 'ore', colour: 0x3a8a5a, examine: 'This needs refining.' });
def(451, 'Runite ore', { value: 3200, icon: 'ore', colour: 0x4ab0c0, examine: 'This needs refining.' });

def(2349, 'Bronze bar', { value: 8, icon: 'bar', colour: 0xb87333, examine: 'It\'s a bar of bronze.' });
def(2351, 'Iron bar', { value: 25, icon: 'bar', colour: 0x8a6a5a, examine: 'It\'s a bar of iron.' });
def(2353, 'Steel bar', { value: 90, icon: 'bar', colour: 0xa8a8a8, examine: 'It\'s a bar of steel.' });
def(2355, 'Silver bar', { value: 100, icon: 'bar', colour: 0xd8d8e0, examine: 'It\'s a bar of silver.' });
def(2357, 'Gold bar', { value: 200, icon: 'bar', colour: 0xe8c040, examine: 'It\'s a bar of gold.' });
def(2359, 'Mithril bar', { value: 324, icon: 'bar', colour: 0x5a5ac0, examine: 'It\'s a bar of mithril.' });
def(2361, 'Adamantite bar', { value: 800, icon: 'bar', colour: 0x3a8a5a, examine: 'It\'s a bar of adamantite.' });
def(2363, 'Runite bar', { value: 6400, icon: 'bar', colour: 0x4ab0c0, examine: 'It\'s a bar of runite.' });

/* Gems */
def(1625, 'Uncut opal', { value: 45, icon: 'gem', colour: 0xd8e8f0, examine: 'This needs cutting.' });
def(1627, 'Uncut jade', { value: 60, icon: 'gem', colour: 0x4aa04a, examine: 'This needs cutting.' });
def(1629, 'Uncut red topaz', { value: 75, icon: 'gem', colour: 0xe08a30, examine: 'This needs cutting.' });
def(1623, 'Uncut sapphire', { value: 250, icon: 'gem', colour: 0x2050d0, examine: 'This needs cutting.' });
def(1621, 'Uncut emerald', { value: 500, icon: 'gem', colour: 0x20a040, examine: 'This needs cutting.' });
def(1619, 'Uncut ruby', { value: 1000, icon: 'gem', colour: 0xd02030, examine: 'This needs cutting.' });
def(1617, 'Uncut diamond', { value: 2000, icon: 'gem', colour: 0xe8f0f8, examine: 'This needs cutting.' });
def(1609, 'Opal', { value: 90, icon: 'gemcut', colour: 0xd8e8f0, examine: 'A colourful opal.' });
def(1611, 'Jade', { value: 120, icon: 'gemcut', colour: 0x4aa04a, examine: 'A green jade.' });
def(1613, 'Red topaz', { value: 150, icon: 'gemcut', colour: 0xe08a30, examine: 'An orange topaz.' });
def(1607, 'Sapphire', { value: 500, icon: 'gemcut', colour: 0x2050d0, examine: 'A sparkling sapphire.' });
def(1605, 'Emerald', { value: 1000, icon: 'gemcut', colour: 0x20a040, examine: 'A shiny emerald.' });
def(1603, 'Ruby', { value: 2000, icon: 'gemcut', colour: 0xd02030, examine: 'A precious ruby.' });
def(1601, 'Diamond', { value: 4000, icon: 'gemcut', colour: 0xe8f0f8, examine: 'A shiny diamond.' });

/* ================================================================== */
/* Fishing & Cooking                                                   */
/* ================================================================== */

def(303, 'Small fishing net', { value: 5, icon: 'net', colour: 0x9a7a4a, examine: 'Useful for catching small fish.' });
def(305, 'Big fishing net', { value: 20, icon: 'net', colour: 0x8a6a3a, examine: 'Useful for catching a lot of fish.' });
def(307, 'Fishing rod', { value: 5, icon: 'rod', colour: 0x8a5a2b, examine: 'Useful for catching fish.' });
def(309, 'Fly fishing rod', { value: 5, icon: 'rod', colour: 0x9a6a3b, examine: 'Useful for catching fish.' });
def(311, 'Harpoon', { value: 5, icon: 'harpoon', colour: 0x9a9a9a, examine: 'Useful for catching big fish.' });
def(301, 'Lobster pot', { value: 20, icon: 'net', colour: 0xa07a4a, examine: 'Useful for catching lobsters.' });
def(313, 'Fishing bait', { value: 3, stackable: true, icon: 'bait', colour: 0x9a7a5a, examine: 'Bait for fishing with.' });
def(314, 'Feather', { value: 2, stackable: true, icon: 'feather', colour: 0xf0f0f0, examine: 'A soft feather.' });

const RAW_FISH: [number, string, number, string, number][] = [
  [317, 'Raw shrimps', 5, 'fish', 0xd8a08a],
  [321, 'Raw anchovies', 15, 'fish', 0x8a8a9a],
  [327, 'Raw sardine', 8, 'fish', 0xa0a0b0],
  [345, 'Raw herring', 15, 'fish', 0xb0b0c0],
  [353, 'Raw mackerel', 20, 'fish', 0x7a8a9a],
  [335, 'Raw trout', 20, 'fish', 0xb08a6a],
  [341, 'Raw cod', 27, 'fish', 0x9a9a8a],
  [349, 'Raw pike', 30, 'fish', 0x6a8a5a],
  [331, 'Raw salmon', 50, 'fish', 0xd08a6a],
  [359, 'Raw tuna', 60, 'fish', 0x8a9ab0],
  [377, 'Raw lobster', 70, 'fish', 0xa03a2a],
  [363, 'Raw bass', 80, 'fish', 0x5a6a7a],
  [371, 'Raw swordfish', 100, 'fish', 0x7a8a9a],
  [7944, 'Raw monkfish', 130, 'fish', 0x8a7a6a],
  [383, 'Raw shark', 200, 'fish', 0x6a7a8a],
];
for (const [id, name, value, icon, colour] of RAW_FISH) {
  def(id, name, { value, icon, colour, examine: `Some raw ${name.slice(4)}.` });
}

const COOKED_FISH: [number, string, number, number, number][] = [
  [315, 'Shrimps', 5, 3, 0xe8a070],
  [319, 'Anchovies', 15, 1, 0x9a8a7a],
  [325, 'Sardine', 10, 4, 0xb0a080],
  [347, 'Herring', 18, 5, 0xc0b090],
  [355, 'Mackerel', 25, 6, 0x9aa0a0],
  [333, 'Trout', 25, 7, 0xd0a070],
  [339, 'Cod', 32, 7, 0xb0b090],
  [351, 'Pike', 35, 8, 0x8a9a70],
  [329, 'Salmon', 60, 9, 0xe89a70],
  [361, 'Tuna', 70, 10, 0xa0b0c0],
  [379, 'Lobster', 120, 12, 0xd04a30],
  [365, 'Bass', 100, 13, 0x7a8a9a],
  [373, 'Swordfish', 150, 14, 0x9aa0b0],
  [7946, 'Monkfish', 200, 16, 0xa09080],
  [385, 'Shark', 300, 20, 0x8a9aa0],
];
for (const [id, name, value, heal, colour] of COOKED_FISH) {
  def(id, name, { value, icon: 'fishcooked', colour, options: ['Eat'], heal, examine: `Some nicely cooked ${name.toLowerCase()}.` });
}

const BURNT: [number, string][] = [
  [323, 'Burnt shrimp'],
  [324, 'Burnt anchovies'],
  [369, 'Burnt fish'],
  [343, 'Burnt bread'],
  [2146, 'Burnt meat'],
];
for (const [id, name] of BURNT) {
  def(id, name, { value: 1, icon: 'fishcooked', colour: 0x3a3028, examine: 'Oops!' });
}

def(2132, 'Raw beef', { value: 5, icon: 'meat', colour: 0xc0503a, examine: 'I need to cook this first.' });
def(2138, 'Raw chicken', { value: 3, icon: 'meat', colour: 0xe0b0a0, examine: 'I need to cook this first.' });
def(2142, 'Cooked meat', { value: 5, icon: 'meat', colour: 0x8a4a2a, options: ['Eat'], heal: 3, examine: 'Nicely cooked meat.' });
def(2140, 'Cooked chicken', { value: 4, icon: 'meat', colour: 0xd0a070, options: ['Eat'], heal: 3, examine: 'Nicely cooked chicken.' });
def(1739, 'Cowhide', { value: 12, icon: 'hide', colour: 0x8a6a4a, examine: 'I should take this to a tannery.' });
def(1741, 'Leather', { value: 20, icon: 'leathersheet', colour: 0xa07a4a, examine: 'A piece of tanned leather.' });
def(1743, 'Hard leather', { value: 45, icon: 'leathersheet', colour: 0x7a5a30, examine: 'A piece of hard leather.' });
def(1737, 'Wool', { value: 6, icon: 'wool', colour: 0xe8e0d0, examine: 'A ball of unspun wool.' });
def(1759, 'Ball of wool', { value: 2, icon: 'wool', colour: 0xf0e8d8, examine: 'A ball of wool.' });
def(1779, 'Flax', { value: 3, icon: 'herb', colour: 0x9ac060, examine: 'I should spin this.' });
def(1777, 'Bow string', { value: 6, stackable: true, icon: 'thread', colour: 0xe8e0c0, examine: 'A string for a bow.' });

/* ================================================================== */
/* Runes & magic                                                       */
/* ================================================================== */

const RUNES: [number, string, number, number][] = [
  [556, 'Air rune', 4, 0xdfe8f0],
  [555, 'Water rune', 4, 0x4a7fd0],
  [557, 'Earth rune', 4, 0x8a6a3a],
  [554, 'Fire rune', 4, 0xd04a20],
  [558, 'Mind rune', 3, 0xa0a0b8],
  [559, 'Body rune', 3, 0xc0a080],
  [562, 'Chaos rune', 90, 0x8a2a2a],
  [560, 'Death rune', 180, 0xe8e8e8],
  [561, 'Nature rune', 180, 0x3a9a3a],
  [563, 'Law rune', 240, 0x6a6ad0],
  [564, 'Cosmic rune', 100, 0x9a5ad0],
  [565, 'Blood rune', 300, 0x9a1a2a],
  [566, 'Soul rune', 300, 0xf0f0d0],
];
for (const [id, name, value, colour] of RUNES) {
  def(id, name, { value, stackable: true, icon: 'rune', colour, examine: 'Used for casting spells.' });
}
def(1436, 'Rune essence', { value: 1, icon: 'essence', colour: 0xb0a898, examine: 'It contains uncharted magical energies.' });
def(7936, 'Pure essence', { value: 1, icon: 'essence', colour: 0xd0c8b8, examine: 'There is a great deal of power within.' });
def(1438, 'Air talisman', { value: 1, icon: 'talisman', colour: 0xdfe8f0, examine: 'A mysterious power emanates from the talisman.' });
def(1448, 'Mind talisman', { value: 1, icon: 'talisman', colour: 0xa0a0b8, examine: 'A mysterious power emanates from the talisman.' });
def(1444, 'Water talisman', { value: 1, icon: 'talisman', colour: 0x4a7fd0, examine: 'A mysterious power emanates from the talisman.' });
def(1440, 'Earth talisman', { value: 1, icon: 'talisman', colour: 0x8a6a3a, examine: 'A mysterious power emanates from the talisman.' });
def(1442, 'Fire talisman', { value: 1, icon: 'talisman', colour: 0xd04a20, examine: 'A mysterious power emanates from the talisman.' });
def(5525, 'Tiara', { value: 100, icon: 'tiara', colour: 0xd8d8e0, equip: EquipSlot.HEAD, examine: 'A tiara.' });

/* ================================================================== */
/* Melee weapons                                                       */
/* ================================================================== */

interface TierSpec {
  suffix: string;
  colour: number;
  /** Multiplier applied to the base bronze stats. */
  reqAttack: number;
  valueMul: number;
}

const METAL_TIERS: Record<string, TierSpec> = {
  Bronze: { suffix: 'Bronze', colour: 0xb87333, reqAttack: 1, valueMul: 1 },
  Iron: { suffix: 'Iron', colour: 0x8a8a8a, reqAttack: 1, valueMul: 2 },
  Steel: { suffix: 'Steel', colour: 0xc0c0c8, reqAttack: 5, valueMul: 7 },
  Black: { suffix: 'Black', colour: 0x3a3a42, reqAttack: 10, valueMul: 14 },
  Mithril: { suffix: 'Mithril', colour: 0x5a5ac8, reqAttack: 20, valueMul: 18 },
  Adamant: { suffix: 'Adamant', colour: 0x3a8a5a, reqAttack: 30, valueMul: 45 },
  Rune: { suffix: 'Rune', colour: 0x4ab8c8, reqAttack: 40, valueMul: 320 },
};

export const TIER_ORDER = ['Bronze', 'Iron', 'Steel', 'Black', 'Mithril', 'Adamant', 'Rune'] as const;
export type TierName = (typeof TIER_ORDER)[number];

export const TIER_COLOURS: Record<string, number> = Object.fromEntries(
  Object.entries(METAL_TIERS).map(([k, v]) => [k, v.colour]),
);

export function tierAttackReq(tier: string): number {
  return METAL_TIERS[tier]?.reqAttack ?? 1;
}

export function tierColour(tier: string): number {
  return METAL_TIERS[tier]?.colour ?? 0xb87333;
}

export function tierValueMul(tier: string): number {
  return METAL_TIERS[tier]?.valueMul ?? 1;
}

/* ================================================================== */
/* Quest & misc items                                                  */
/* ================================================================== */

def(1947, 'Grain', { value: 1, icon: 'wheat', colour: 0xd0b040, examine: 'I should mill this.' });
def(5318, 'Potato seed', { value: 1, stackable: true, icon: 'seed', colour: 0x9a7a4a, examine: 'A potato seed.' });
def(5319, 'Onion seed', { value: 1, stackable: true, icon: 'seed', colour: 0xa08a5a, examine: 'An onion seed.' });
def(950, 'Silk', { value: 12, icon: 'leathersheet', colour: 0xe0d0e0, examine: 'A roll of fine silk.' });
def(2136, 'Raw bear meat', { value: 5, icon: 'meat', colour: 0xa04030, examine: 'I need to cook this first.' });
def(948, 'Bear fur', { value: 18, icon: 'hide', colour: 0x4a3a2a, examine: 'A thick bear pelt.' });
def(2542, 'Ring of recoil', { value: 1200, icon: 'ring', colour: 0x60d0d0, equip: EquipSlot.RING, members: true, examine: 'Reflects damage back at your attacker.' });
def(1856, 'Ghostspeak amulet', { value: 100, icon: 'amulet', colour: 0xc0d0e0, equip: EquipSlot.AMULET, untradeable: true, examine: 'Lets you speak to ghosts.' });
def(552, 'Skull', { value: 1, icon: 'bones', colour: 0xe8e4d0, untradeable: true, examine: 'A rather grisly skull.' });
def(1673, 'Gold amulet (u)', { value: 250, icon: 'amulet', colour: 0xe8c040, examine: 'It needs a string.' });
def(1692, 'Gold amulet', { value: 300, icon: 'amulet', colour: 0xe8c040, equip: EquipSlot.AMULET, examine: 'A plain gold amulet.' });
def(1783, 'Bucket of sand', { value: 30, icon: 'bucket', colour: 0xd8c890, examine: 'A bucket of sand.' });
def(9075, 'Astral rune', { value: 200, stackable: true, icon: 'rune', colour: 0xa0c0e0, members: true, examine: 'Used for Lunar spells.' });

export { def as defineItem, registry as ITEM_REGISTRY };
