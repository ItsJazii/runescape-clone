/** Scenery and interactive world objects. */

export interface ObjectDef {
  id: number;
  name: string;
  examine: string;
  sizeX: number;
  sizeY: number;
  /** Blocks movement across its footprint. */
  solid: boolean;
  /** Rendered on a tile edge rather than in the tile centre. */
  wall?: boolean;
  /** Rendered flat on the ground. */
  ground?: boolean;
  /** Right-click options. */
  options: string[];
  /** Model key for the client renderer. */
  model: string;
  colour: number;
  colour2?: number;
  /** Height multiplier for the model. */
  height?: number;
  /** Object it becomes when depleted (tree stump / empty rock). */
  depleted?: number;
  /** Does not block line of sight. */
  seeThrough?: boolean;
}

const defs = new Map<number, ObjectDef>();

interface ObjInput extends Partial<Omit<ObjectDef, 'id' | 'name'>> {
  name: string;
  model: string;
  colour: number;
}

function obj(id: number, o: ObjInput): number {
  defs.set(id, {
    id,
    name: o.name,
    examine: o.examine ?? `It's a ${o.name.toLowerCase()}.`,
    sizeX: o.sizeX ?? 1,
    sizeY: o.sizeY ?? 1,
    solid: o.solid ?? true,
    wall: o.wall,
    ground: o.ground,
    options: o.options ?? [],
    model: o.model,
    colour: o.colour,
    colour2: o.colour2,
    height: o.height ?? 1,
    depleted: o.depleted,
    seeThrough: o.seeThrough,
  });
  return id;
}

export function objectDef(id: number): ObjectDef | undefined {
  return defs.get(id);
}

export function allObjects(): ObjectDef[] {
  return [...defs.values()];
}

/* ------------------------------------------------------------------ */
/* Trees                                                               */
/* ------------------------------------------------------------------ */

export const O_TREE_STUMP = obj(1342, { name: 'Tree stump', model: 'stump', colour: 0x5a4028, examine: 'A tree has been cut down here.' });
export const O_TREE = obj(1276, { name: 'Tree', model: 'tree', colour: 0x3a7a2a, colour2: 0x5a4028, options: ['Chop down'], depleted: O_TREE_STUMP, examine: 'A regular tree.' });
export const O_DEAD_TREE = obj(1282, { name: 'Dead tree', model: 'deadtree', colour: 0x6a5a42, options: ['Chop down'], depleted: O_TREE_STUMP, examine: 'A dead tree.' });
export const O_OAK = obj(1281, { name: 'Oak tree', model: 'oak', colour: 0x2f6a24, colour2: 0x4a3520, options: ['Chop down'], depleted: O_TREE_STUMP, examine: 'A sturdy oak tree.' });
export const O_WILLOW = obj(1308, { name: 'Willow tree', model: 'willow', colour: 0x6a9a3a, colour2: 0x5a4a30, options: ['Chop down'], depleted: O_TREE_STUMP, examine: 'A drooping willow tree.' });
export const O_MAPLE = obj(1307, { name: 'Maple tree', model: 'maple', colour: 0xc06a2a, colour2: 0x5a3a20, options: ['Chop down'], depleted: O_TREE_STUMP, examine: 'A maple tree.' });
export const O_YEW = obj(1309, { name: 'Yew tree', model: 'yew', colour: 0x2a5a2a, colour2: 0x4a3828, options: ['Chop down'], depleted: O_TREE_STUMP, examine: 'An ancient yew tree.' });
export const O_MAGIC_TREE = obj(1306, { name: 'Magic tree', model: 'magictree', colour: 0x5a6ad0, colour2: 0x4a4a70, options: ['Chop down'], depleted: O_TREE_STUMP, examine: 'A magical tree.' });

/* ------------------------------------------------------------------ */
/* Mining rocks                                                        */
/* ------------------------------------------------------------------ */

export const O_ROCK_EMPTY = obj(450, { name: 'Rocks', model: 'rock', colour: 0x6a6a6a, examine: 'The rock is depleted.' });
function rock(id: number, name: string, colour: number, examine: string): number {
  return obj(id, { name, model: 'orerock', colour, options: ['Mine'], depleted: O_ROCK_EMPTY, examine });
}
export const O_CLAY_ROCK = rock(11362, 'Rocks', 0xa07a5a, 'A rock containing clay.');
export const O_COPPER_ROCK = rock(11161, 'Rocks', 0xc07a3a, 'A rock containing copper.');
export const O_TIN_ROCK = rock(11360, 'Rocks', 0xa8a8b0, 'A rock containing tin.');
export const O_IRON_ROCK = rock(11365, 'Rocks', 0x8a4a3a, 'A rock containing iron.');
export const O_SILVER_ROCK = rock(11368, 'Rocks', 0xd0d0d8, 'A rock containing silver.');
export const O_COAL_ROCK = rock(11367, 'Rocks', 0x2a2a2a, 'A rock containing coal.');
export const O_GOLD_ROCK = rock(11370, 'Rocks', 0xe8c040, 'A rock containing gold.');
export const O_MITHRIL_ROCK = rock(11372, 'Rocks', 0x5a5ac0, 'A rock containing mithril.');
export const O_ADAMANTITE_ROCK = rock(11374, 'Rocks', 0x3a8a5a, 'A rock containing adamantite.');
export const O_RUNITE_ROCK = rock(11376, 'Rocks', 0x4ab0c0, 'A rock containing runite.');

/* ------------------------------------------------------------------ */
/* Buildings & furniture                                               */
/* ------------------------------------------------------------------ */

export const O_STONE_WALL = obj(1, { name: 'Wall', model: 'wall', colour: 0x9a9080, wall: true, examine: 'A sturdy stone wall.' });
export const O_WOOD_WALL = obj(2, { name: 'Wall', model: 'wall', colour: 0x8a6a48, wall: true, examine: 'A wooden wall.' });
export const O_WINDOW = obj(3, { name: 'Window', model: 'window', colour: 0x9a9080, wall: true, examine: 'A window.' });
export const O_DOOR = obj(4, { name: 'Door', model: 'door', colour: 0x7a5a38, wall: true, options: ['Open'], examine: 'A wooden door.' });
export const O_DOOR_OPEN = obj(5, { name: 'Door', model: 'dooropen', colour: 0x7a5a38, wall: true, solid: false, options: ['Close'], examine: 'A wooden door.' });
export const O_GATE = obj(6, { name: 'Gate', model: 'gate', colour: 0x7a5a38, wall: true, options: ['Open'], examine: 'A gate.' });
export const O_GATE_OPEN = obj(7, { name: 'Gate', model: 'gateopen', colour: 0x7a5a38, wall: true, solid: false, options: ['Close'], examine: 'A gate.' });
export const O_FENCE = obj(8, { name: 'Fence', model: 'fence', colour: 0x8a6a48, wall: true, seeThrough: true, examine: 'A wooden fence.' });
export const O_LOW_WALL = obj(9, { name: 'Low wall', model: 'lowwall', colour: 0x9a9080, wall: true, seeThrough: true, examine: 'A low stone wall.' });
export const O_ARCH = obj(10, { name: 'Archway', model: 'arch', colour: 0x9a9080, wall: true, solid: false, seeThrough: true, examine: 'An archway.' });

export const O_STAIRS_UP = obj(16671, { name: 'Staircase', model: 'stairs', colour: 0x8a7a60, sizeX: 2, sizeY: 2, options: ['Climb-up'], examine: 'Stairs leading up.' });
export const O_STAIRS_DOWN = obj(16672, { name: 'Staircase', model: 'stairsdown', colour: 0x8a7a60, sizeX: 2, sizeY: 2, options: ['Climb-down'], examine: 'Stairs leading down.' });
export const O_STAIRS_BOTH = obj(16673, { name: 'Staircase', model: 'stairs', colour: 0x8a7a60, sizeX: 2, sizeY: 2, options: ['Climb-up', 'Climb-down'], examine: 'A staircase.' });
export const O_LADDER_UP = obj(16683, { name: 'Ladder', model: 'ladder', colour: 0x8a6a40, solid: false, options: ['Climb-up'], examine: 'A ladder leading up.' });
export const O_LADDER_DOWN = obj(16680, { name: 'Ladder', model: 'ladderdown', colour: 0x8a6a40, solid: false, options: ['Climb-down'], examine: 'A ladder leading down.' });

export const O_BANK_BOOTH = obj(10083, { name: 'Bank booth', model: 'bankbooth', colour: 0x7a5a38, colour2: 0x9a9080, options: ['Bank', 'Collect'], examine: 'Bank of Gielinor - Deposit slot.' });
export const O_BANK_CHEST = obj(4483, { name: 'Bank chest', model: 'chest', colour: 0x6a4a28, options: ['Use'], examine: 'A bank chest.' });

export const O_RANGE = obj(114, { name: 'Range', model: 'range', colour: 0x5a5a5a, colour2: 0xd06020, options: ['Cook'], examine: 'A hot cooking range.' });
export const O_FIRE = obj(26185, { name: 'Fire', model: 'fire', colour: 0xe08020, solid: false, options: ['Cook'], examine: 'A fire. Warm and toasty.' });
export const O_ANVIL = obj(2097, { name: 'Anvil', model: 'anvil', colour: 0x4a4a52, options: ['Smith'], examine: 'A heavy iron anvil.' });
export const O_FURNACE = obj(24009, { name: 'Furnace', model: 'furnace', colour: 0x6a5a4a, colour2: 0xe06020, sizeX: 2, sizeY: 2, options: ['Smelt'], examine: 'A furnace for smelting ore.' });
export const O_SPINNING_WHEEL = obj(25824, { name: 'Spinning wheel', model: 'spinningwheel', colour: 0x8a6a40, options: ['Spin'], examine: 'For spinning wool into thread.' });
export const O_POTTERY_WHEEL = obj(14887, { name: 'Potter\'s wheel', model: 'potterywheel', colour: 0x8a6a40, options: ['Make-pottery'], examine: 'For making pottery.' });
export const O_MILLSTONE = obj(2718, { name: 'Hopper', model: 'millstone', colour: 0x9a9080, sizeX: 2, sizeY: 2, options: ['Fill'], examine: 'A hopper for grinding grain.' });
export const O_ALTAR = obj(409, { name: 'Altar', model: 'altar', colour: 0xd8d8e0, sizeX: 2, sizeY: 1, options: ['Pray-at'], examine: 'An altar to Saradomin.' });
export const O_WELL = obj(884, { name: 'Well', model: 'well', colour: 0x8a8a80, options: ['Use'], examine: 'A well with fresh water.' });
export const O_FOUNTAIN = obj(879, { name: 'Fountain', model: 'fountain', colour: 0x9a9a94, sizeX: 2, sizeY: 2, options: ['Use'], examine: 'A fountain of clean water.' });
export const O_SINK = obj(873, { name: 'Sink', model: 'sink', colour: 0x9a9a94, options: ['Use'], examine: 'A sink with running water.' });
export const O_TABLE = obj(1210, { name: 'Table', model: 'table', colour: 0x7a5a38, examine: 'A wooden table.' });
export const O_LONG_TABLE = obj(1211, { name: 'Table', model: 'table', colour: 0x7a5a38, sizeX: 1, sizeY: 3, examine: 'A long dining table.' });
export const O_CHAIR = obj(1212, { name: 'Chair', model: 'chair', colour: 0x7a5a38, solid: false, examine: 'A wooden chair.' });
export const O_BED = obj(1213, { name: 'Bed', model: 'bed', colour: 0x8a6a48, colour2: 0xd0d0d0, sizeX: 1, sizeY: 2, examine: 'A comfy bed.' });
export const O_BOOKCASE = obj(1214, { name: 'Bookcase', model: 'bookcase', colour: 0x6a4a28, options: ['Search'], examine: 'Lots of books.' });
export const O_BARREL = obj(1215, { name: 'Barrel', model: 'barrel', colour: 0x7a5a38, options: ['Search'], examine: 'A wooden barrel.' });
export const O_CRATE = obj(1216, { name: 'Crate', model: 'crate', colour: 0x8a6a40, options: ['Search'], examine: 'A wooden crate.' });
export const O_SACKS = obj(1217, { name: 'Sacks', model: 'sacks', colour: 0xa89a70, options: ['Search'], examine: 'Sacks of grain.' });
export const O_CHEST = obj(1218, { name: 'Chest', model: 'chest', colour: 0x6a4a28, options: ['Open'], examine: 'A wooden chest.' });
export const O_CANDLES = obj(1219, { name: 'Candles', model: 'candles', colour: 0xf0e0a0, solid: false, examine: 'A candelabra.' });
export const O_SHOP_COUNTER = obj(1220, { name: 'Counter', model: 'counter', colour: 0x8a6a48, examine: 'A shop counter.' });
export const O_CAULDRON = obj(1221, { name: 'Cauldron', model: 'cauldron', colour: 0x3a3a3a, options: ['Use'], examine: 'A bubbling cauldron.' });
export const O_SIGNPOST = obj(1222, { name: 'Signpost', model: 'signpost', colour: 0x8a6a48, solid: false, options: ['Read'], examine: 'A signpost.' });
export const O_LAMP_POST = obj(1223, { name: 'Lamp post', model: 'lamppost', colour: 0x3a3a3a, solid: false, examine: 'It lights the street.' });
export const O_MARKET_STALL = obj(1224, { name: 'Market stall', model: 'stall', colour: 0xb04030, colour2: 0x8a6a48, sizeX: 2, sizeY: 1, options: ['Steal-from'], examine: 'A market stall.' });
export const O_TANNERY = obj(1225, { name: 'Tanning rack', model: 'rack', colour: 0x8a6a48, options: ['Tan'], examine: 'For tanning hides.' });

/* ------------------------------------------------------------------ */
/* Nature & decoration                                                 */
/* ------------------------------------------------------------------ */

export const O_BUSH = obj(1230, { name: 'Bush', model: 'bush', colour: 0x3a6a2a, solid: false, seeThrough: true, examine: 'A leafy bush.' });
export const O_FLOWERS = obj(1231, { name: 'Flowers', model: 'flowers', colour: 0xd04070, solid: false, seeThrough: true, examine: 'Pretty flowers.' });
export const O_MUSHROOM = obj(1232, { name: 'Mushroom', model: 'mushroom', colour: 0xc04030, solid: false, seeThrough: true, examine: 'A red mushroom.' });
export const O_BOULDER = obj(1233, { name: 'Rock', model: 'boulder', colour: 0x7a7a74, examine: 'A large boulder.' });
export const O_REEDS = obj(1234, { name: 'Reeds', model: 'reeds', colour: 0x6a8a3a, solid: false, seeThrough: true, examine: 'Marsh reeds.' });
export const O_LILY = obj(1235, { name: 'Lily pads', model: 'lily', colour: 0x3a7a3a, solid: false, ground: true, seeThrough: true, examine: 'Lily pads.' });
export const O_WHEAT = obj(1236, { name: 'Wheat', model: 'wheat', colour: 0xd0b040, solid: false, seeThrough: true, options: ['Pick'], examine: 'Ripe wheat.' });
export const O_CABBAGE_PLANT = obj(1237, { name: 'Cabbage', model: 'cabbageplant', colour: 0x5fa04a, solid: false, seeThrough: true, options: ['Pick'], examine: 'A cabbage.' });
export const O_POTATO_PLANT = obj(1238, { name: 'Potato', model: 'cabbageplant', colour: 0x7a9a4a, solid: false, seeThrough: true, options: ['Pick'], examine: 'A potato plant.' });
export const O_ONION_PLANT = obj(1239, { name: 'Onion', model: 'cabbageplant', colour: 0x9aaa5a, solid: false, seeThrough: true, options: ['Pick'], examine: 'An onion plant.' });
export const O_GRAVESTONE = obj(1240, { name: 'Gravestone', model: 'gravestone', colour: 0x9a9a94, options: ['Read'], examine: 'Rest in peace.' });
export const O_COFFIN = obj(1241, { name: 'Coffin', model: 'coffin', colour: 0x6a4a28, options: ['Open'], examine: 'A stone coffin.' });
export const O_BRIDGE = obj(1242, { name: 'Bridge', model: 'bridge', colour: 0x8a6a48, solid: false, ground: true, examine: 'A sturdy bridge.' });
export const O_PILLAR = obj(1243, { name: 'Pillar', model: 'pillar', colour: 0x9a9080, examine: 'A stone pillar.' });
export const O_ROOF_PEAK = obj(1244, { name: 'Roof', model: 'roof', colour: 0x8a3a2a, solid: false, examine: 'A tiled roof.' });
export const O_TORCH = obj(1245, { name: 'Torch', model: 'torch', colour: 0xe08020, wall: true, solid: false, seeThrough: true, examine: 'A burning torch.' });
export const O_STILE = obj(1246, { name: 'Stile', model: 'stile', colour: 0x8a6a48, wall: true, solid: false, options: ['Climb-over'], examine: 'A stile over the fence.' });
export const O_PALM_TREE = obj(1247, { name: 'Palm tree', model: 'palm', colour: 0x4a8a3a, colour2: 0x8a6a3a, examine: 'A desert palm tree.' });
export const O_CACTUS = obj(1248, { name: 'Cactus', model: 'cactus', colour: 0x4a8a4a, examine: 'A prickly cactus.' });
export const O_ROCKS_SCENERY = obj(1249, { name: 'Rocks', model: 'rockpile', colour: 0x8a8a84, solid: false, seeThrough: true, examine: 'Some loose rocks.' });
export const O_WATER_PUMP = obj(1250, { name: 'Water pump', model: 'pump', colour: 0x5a5a5a, options: ['Use'], examine: 'A water pump.' });
export const O_CLOTHES_LINE = obj(1251, { name: 'Clothes line', model: 'clothesline', colour: 0xd0d0d0, solid: false, seeThrough: true, examine: 'Washing hung out to dry.' });
export const O_WINDMILL_SAILS = obj(1252, { name: 'Windmill', model: 'windmill', colour: 0xd8d8d0, sizeX: 3, sizeY: 3, examine: 'A windmill.' });
export const O_HAYSTACK = obj(1253, { name: 'Haystack', model: 'haystack', colour: 0xd8b850, options: ['Search'], examine: 'A pile of hay.' });
export const O_LOG_PILE = obj(1254, { name: 'Log pile', model: 'logpile', colour: 0x7a5a38, examine: 'A pile of logs.' });
export const O_TENT = obj(1255, { name: 'Tent', model: 'tent', colour: 0xc0a070, sizeX: 2, sizeY: 2, examine: 'A desert tent.' });
export const O_STONE_STAIRS = obj(1256, { name: 'Staircase', model: 'stairs', colour: 0x9a9080, sizeX: 2, sizeY: 2, options: ['Climb-up'], examine: 'Stone stairs.' });
