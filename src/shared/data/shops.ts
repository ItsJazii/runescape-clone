export interface ShopStockEntry {
  item: number;
  /** Starting / restock-target quantity. 0 means the shop only buys it. */
  amount: number;
}

export interface ShopDef {
  key: string;
  name: string;
  /** General stores buy anything; specialist shops only buy their own stock. */
  general: boolean;
  stock: ShopStockEntry[];
  /** Percentage of item value the shop sells at. */
  sellRate: number;
  /** Percentage of item value the shop buys at. */
  buyRate: number;
}

export const SHOPS: Record<string, ShopDef> = {
  general: {
    key: 'general',
    name: 'Lumbridge General Store',
    general: true,
    sellRate: 1.0,
    buyRate: 0.4,
    stock: [
      { item: 1931, amount: 5 }, // Pot
      { item: 1935, amount: 2 }, // Jug
      { item: 590, amount: 2 }, // Tinderbox
      { item: 1755, amount: 2 }, // Chisel
      { item: 2347, amount: 5 }, // Hammer
      { item: 1925, amount: 2 }, // Bucket
      { item: 946, amount: 5 }, // Knife
      { item: 954, amount: 5 }, // Rope
      { item: 952, amount: 5 }, // Spade
      { item: 1733, amount: 10 }, // Needle
      { item: 1734, amount: 50 }, // Thread
      { item: 314, amount: 100 }, // Feather
      { item: 1511, amount: 10 }, // Logs
    ],
  },
  bobsaxes: {
    key: 'bobsaxes',
    name: "Bob's Brilliant Axes",
    general: false,
    sellRate: 1.0,
    buyRate: 0.55,
    stock: [
      { item: 1351, amount: 5 }, // Bronze axe
      { item: 1349, amount: 3 }, // Iron axe
      { item: 1353, amount: 2 }, // Steel axe
      { item: 1355, amount: 1 }, // Mithril axe
      { item: 1375, amount: 3 }, // Bronze battleaxe
      { item: 1363, amount: 2 }, // Iron battleaxe
      { item: 1365, amount: 1 }, // Steel battleaxe
    ],
  },
  scimitars: {
    key: 'scimitars',
    name: "Zeke's Superior Scimitars",
    general: false,
    sellRate: 1.0,
    buyRate: 0.55,
    stock: [
      { item: 1321, amount: 5 },
      { item: 1323, amount: 4 },
      { item: 1325, amount: 3 },
      { item: 1329, amount: 2 },
      { item: 1331, amount: 1 },
    ],
  },
  plateskirts: {
    key: 'plateskirts',
    name: "Ranael's Super Skirt Store",
    general: false,
    sellRate: 1.0,
    buyRate: 0.55,
    stock: [
      { item: 1087, amount: 5 },
      { item: 1081, amount: 4 },
      { item: 1083, amount: 3 },
      { item: 1085, amount: 2 },
      { item: 1091, amount: 1 },
    ],
  },
  crafting: {
    key: 'crafting',
    name: "Dommik's Crafting Store",
    general: false,
    sellRate: 1.0,
    buyRate: 0.5,
    stock: [
      { item: 1733, amount: 20 }, // Needle
      { item: 1734, amount: 100 }, // Thread
      { item: 1755, amount: 10 }, // Chisel
      { item: 1741, amount: 20 }, // Leather
      { item: 1625, amount: 5 }, // Uncut opal
      { item: 1627, amount: 3 }, // Uncut jade
      { item: 5525, amount: 3 }, // Tiara
    ],
  },
  gems: {
    key: 'gems',
    name: 'Al Kharid Gem Stall',
    general: false,
    sellRate: 1.1,
    buyRate: 0.6,
    stock: [
      { item: 1625, amount: 10 },
      { item: 1627, amount: 8 },
      { item: 1629, amount: 5 },
      { item: 1623, amount: 3 },
      { item: 1621, amount: 2 },
      { item: 1619, amount: 1 },
      { item: 1617, amount: 0 },
    ],
  },
  kebab: {
    key: 'kebab',
    name: "Karim's Kebab House",
    general: false,
    sellRate: 1.0,
    buyRate: 0.3,
    stock: [{ item: 1971, amount: 50 }],
  },
  magic: {
    key: 'magic',
    name: "Betty's Magic Emporium",
    general: false,
    sellRate: 1.0,
    buyRate: 0.5,
    stock: [
      { item: 556, amount: 1000 },
      { item: 555, amount: 1000 },
      { item: 557, amount: 1000 },
      { item: 554, amount: 1000 },
      { item: 558, amount: 1000 },
      { item: 559, amount: 500 },
      { item: 1381, amount: 5 },
      { item: 1383, amount: 5 },
      { item: 1385, amount: 5 },
      { item: 1387, amount: 5 },
      { item: 577, amount: 5 },
      { item: 579, amount: 5 },
      { item: 606, amount: 5 },
    ],
  },
  armour: {
    key: 'armour',
    name: "Varrock Swordshop",
    general: false,
    sellRate: 1.0,
    buyRate: 0.55,
    stock: [
      { item: 1277, amount: 5 },
      { item: 1279, amount: 4 },
      { item: 1281, amount: 3 },
      { item: 1291, amount: 4 },
      { item: 1293, amount: 3 },
      { item: 1295, amount: 2 },
      { item: 1117, amount: 3 },
      { item: 1115, amount: 2 },
      { item: 1119, amount: 1 },
      { item: 1189, amount: 3 },
      { item: 1191, amount: 2 },
    ],
  },
  archery: {
    key: 'archery',
    name: "Lowe's Archery Emporium",
    general: false,
    sellRate: 1.0,
    buyRate: 0.5,
    stock: [
      { item: 841, amount: 5 },
      { item: 839, amount: 5 },
      { item: 843, amount: 3 },
      { item: 845, amount: 3 },
      { item: 882, amount: 1000 },
      { item: 884, amount: 500 },
      { item: 886, amount: 200 },
      { item: 1129, amount: 5 },
      { item: 1095, amount: 5 },
      { item: 1167, amount: 5 },
      { item: 1063, amount: 5 },
    ],
  },
  fishing: {
    key: 'fishing',
    name: "Gerrant's Fishy Business",
    general: false,
    sellRate: 1.0,
    buyRate: 0.4,
    stock: [
      { item: 303, amount: 10 }, // Small fishing net
      { item: 307, amount: 5 }, // Fishing rod
      { item: 309, amount: 5 }, // Fly fishing rod
      { item: 301, amount: 5 }, // Lobster pot
      { item: 311, amount: 5 }, // Harpoon
      { item: 313, amount: 1000 }, // Fishing bait
      { item: 314, amount: 1000 }, // Feather
    ],
  },
};

export function shopDef(key: string): ShopDef | undefined {
  return SHOPS[key];
}
