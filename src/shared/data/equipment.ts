/**
 * Every wearable item, with the exact attack/defence bonuses used by
 * Old School RuneScape.
 *
 * Bonus arrays are ordered:
 *   [ aStab, aSlash, aCrush, aMagic, aRange,
 *     dStab, dSlash, dCrush, dMagic, dRange,
 *     strength, rangedStrength, magicDamage, prayer ]
 */

import type { Bonuses } from '../combat.ts';
import { WeaponType } from '../combat.ts';
import { Skill } from '../skills.ts';
import { defineItem as def, EquipSlot, tierColour } from './items.ts';

function bon(a: number[]): Partial<Bonuses> {
  return {
    attackStab: a[0] ?? 0,
    attackSlash: a[1] ?? 0,
    attackCrush: a[2] ?? 0,
    attackMagic: a[3] ?? 0,
    attackRanged: a[4] ?? 0,
    defenceStab: a[5] ?? 0,
    defenceSlash: a[6] ?? 0,
    defenceCrush: a[7] ?? 0,
    defenceMagic: a[8] ?? 0,
    defenceRanged: a[9] ?? 0,
    meleeStrength: a[10] ?? 0,
    rangedStrength: a[11] ?? 0,
    magicDamage: a[12] ?? 0,
    prayerBonus: a[13] ?? 0,
  };
}

const TIERS = ['Bronze', 'Iron', 'Steel', 'Black', 'Mithril', 'Adamant', 'Rune'] as const;
/** Attack (weapons) / Defence (armour) level required per tier. */
const TIER_REQ = [1, 1, 5, 10, 20, 30, 40];
/** Rough gp value multiplier per tier. */
const TIER_VALUE = [1, 2, 7, 13, 17, 42, 300];

interface GearSpec {
  /** Item name suffix, e.g. 'dagger' -> "Bronze dagger". */
  noun: string;
  ids: (number | null)[];
  stats: number[][];
  icon: string;
  slot: EquipSlot;
  skill: Skill;
  baseValue: number;
  weight: number;
  weapon?: { type: WeaponType; speed: number };
  twoHanded?: boolean;
  examine?: string;
}

function defineTiered(spec: GearSpec): void {
  TIERS.forEach((tier, i) => {
    const id = spec.ids[i];
    if (id == null) return;
    def(id, `${tier} ${spec.noun}`, {
      value: Math.round(spec.baseValue * TIER_VALUE[i]),
      icon: spec.icon,
      colour: tierColour(tier),
      equip: spec.slot,
      twoHanded: spec.twoHanded,
      weight: spec.weight,
      weapon: spec.weapon,
      bonuses: bon(spec.stats[i]),
      reqs: TIER_REQ[i] > 1 ? [[spec.skill, TIER_REQ[i]]] : undefined,
      examine: spec.examine ?? `A ${tier.toLowerCase()} ${spec.noun}.`,
    });
  });
}

/* ------------------------------------------------------------------ */
/* Melee weapons                                                       */
/* ------------------------------------------------------------------ */

defineTiered({
  noun: 'dagger',
  ids: [1205, 1203, 1207, 1217, 1209, 1211, 1213],
  icon: 'dagger',
  slot: EquipSlot.WEAPON,
  skill: Skill.ATTACK,
  baseValue: 10,
  weight: 0.4,
  weapon: { type: WeaponType.DAGGER, speed: 4 },
  stats: [
    [4, 2, -4, 1, 0, 0, 0, 0, 1, 0, 3, 0, 0, 0],
    [5, 3, -4, 1, 0, 0, 0, 0, 1, 0, 4, 0, 0, 0],
    [8, 4, -4, 1, 0, 0, 0, 0, 1, 0, 7, 0, 0, 0],
    [10, 5, -4, 1, 0, 0, 0, 0, 1, 0, 7, 0, 0, 0],
    [11, 5, -4, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 0],
    [15, 8, -4, 1, 0, 0, 0, 0, 1, 0, 14, 0, 0, 0],
    [25, 12, -4, 1, 0, 0, 0, 0, 1, 0, 24, 0, 0, 0],
  ],
});

defineTiered({
  noun: 'sword',
  ids: [1277, 1279, 1281, 1283, 1285, 1287, 1289],
  icon: 'sword',
  slot: EquipSlot.WEAPON,
  skill: Skill.ATTACK,
  baseValue: 26,
  weight: 1.6,
  weapon: { type: WeaponType.SWORD, speed: 4 },
  stats: [
    [4, 3, -2, 0, 0, 0, 2, 1, 0, 0, 5, 0, 0, 0],
    [6, 4, -2, 0, 0, 0, 2, 1, 0, 0, 7, 0, 0, 0],
    [11, 8, -2, 0, 0, 0, 2, 1, 0, 0, 12, 0, 0, 0],
    [14, 10, -2, 0, 0, 0, 2, 1, 0, 0, 12, 0, 0, 0],
    [16, 11, -2, 0, 0, 0, 2, 1, 0, 0, 17, 0, 0, 0],
    [23, 18, -2, 0, 0, 0, 2, 1, 0, 0, 24, 0, 0, 0],
    [38, 26, -2, 0, 0, 0, 2, 1, 0, 0, 39, 0, 0, 0],
  ],
});

defineTiered({
  noun: 'scimitar',
  ids: [1321, 1323, 1325, 1327, 1329, 1331, 1333],
  icon: 'scimitar',
  slot: EquipSlot.WEAPON,
  skill: Skill.ATTACK,
  baseValue: 32,
  weight: 1.8,
  weapon: { type: WeaponType.SCIMITAR, speed: 4 },
  stats: [
    [1, 7, -2, 0, 0, 0, 1, 0, 0, 0, 6, 0, 0, 0],
    [2, 10, -2, 0, 0, 0, 1, 0, 0, 0, 9, 0, 0, 0],
    [3, 15, -2, 0, 0, 0, 1, 0, 0, 0, 14, 0, 0, 0],
    [4, 19, -2, 0, 0, 0, 1, 0, 0, 0, 14, 0, 0, 0],
    [5, 21, -2, 0, 0, 0, 1, 0, 0, 0, 20, 0, 0, 0],
    [6, 29, -2, 0, 0, 0, 1, 0, 0, 0, 28, 0, 0, 0],
    [7, 45, -2, 0, 0, 0, 1, 0, 0, 0, 44, 0, 0, 0],
  ],
});

defineTiered({
  noun: 'longsword',
  ids: [1291, 1293, 1295, 1297, 1299, 1301, 1303],
  icon: 'longsword',
  slot: EquipSlot.WEAPON,
  skill: Skill.ATTACK,
  baseValue: 40,
  weight: 2.2,
  weapon: { type: WeaponType.LONGSWORD, speed: 5 },
  stats: [
    [4, 5, -2, 0, 0, 0, 3, 2, 0, 0, 7, 0, 0, 0],
    [6, 8, -2, 0, 0, 0, 3, 2, 0, 0, 10, 0, 0, 0],
    [9, 14, -2, 0, 0, 0, 3, 2, 0, 0, 16, 0, 0, 0],
    [13, 18, -2, 0, 0, 0, 3, 2, 0, 0, 16, 0, 0, 0],
    [15, 20, -2, 0, 0, 0, 3, 2, 0, 0, 22, 0, 0, 0],
    [20, 29, -2, 0, 0, 0, 3, 2, 0, 0, 31, 0, 0, 0],
    [38, 47, -2, 0, 0, 0, 3, 2, 0, 0, 49, 0, 0, 0],
  ],
});

defineTiered({
  noun: '2h sword',
  ids: [1307, 1309, 1311, 1313, 1315, 1317, 1319],
  icon: 'twohand',
  slot: EquipSlot.WEAPON,
  skill: Skill.ATTACK,
  baseValue: 80,
  weight: 4.5,
  twoHanded: true,
  weapon: { type: WeaponType.TWO_HANDED, speed: 7 },
  stats: [
    [-4, 9, 8, -4, 0, 0, 0, 0, 0, -1, 10, 0, 0, 0],
    [-4, 13, 10, -4, 0, 0, 0, 0, 0, -1, 14, 0, 0, 0],
    [-4, 21, 16, -4, 0, 0, 0, 0, 0, -1, 22, 0, 0, 0],
    [-4, 27, 21, -4, 0, 0, 0, 0, 0, -1, 26, 0, 0, 0],
    [-4, 30, 24, -4, 0, 0, 0, 0, 0, -1, 31, 0, 0, 0],
    [-4, 43, 30, -4, 0, 0, 0, 0, 0, -1, 44, 0, 0, 0],
    [-4, 69, 50, -4, 0, 0, 0, 0, 0, -1, 70, 0, 0, 0],
  ],
});

defineTiered({
  noun: 'battleaxe',
  ids: [1375, 1363, 1365, 1367, 1369, 1371, 1373],
  icon: 'battleaxe',
  slot: EquipSlot.WEAPON,
  skill: Skill.ATTACK,
  baseValue: 60,
  weight: 3.6,
  weapon: { type: WeaponType.AXE, speed: 6 },
  stats: [
    [-2, 6, 3, 0, 0, 0, 0, 0, 0, -1, 9, 0, 0, 0],
    [-2, 8, 4, 0, 0, 0, 0, 0, 0, -1, 11, 0, 0, 0],
    [-2, 10, 6, 0, 0, 0, 0, 0, 0, -1, 14, 0, 0, 0],
    [-2, 12, 8, 0, 0, 0, 0, 0, 0, -1, 17, 0, 0, 0],
    [-2, 14, 10, 0, 0, 0, 0, 0, 0, -1, 20, 0, 0, 0],
    [-2, 18, 14, 0, 0, 0, 0, 0, 0, -1, 26, 0, 0, 0],
    [-2, 24, 18, 0, 0, 0, 0, 0, 0, -1, 33, 0, 0, 0],
  ],
});

defineTiered({
  noun: 'mace',
  ids: [1422, 1420, 1424, 1426, 1428, 1430, 1432],
  icon: 'mace',
  slot: EquipSlot.WEAPON,
  skill: Skill.ATTACK,
  baseValue: 18,
  weight: 1.4,
  weapon: { type: WeaponType.MACE, speed: 4 },
  stats: [
    [1, -2, 6, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 1],
    [4, -2, 9, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 1],
    [7, -2, 13, 0, 0, 0, 0, 0, 0, 0, 11, 0, 0, 2],
    [8, -2, 16, 0, 0, 0, 0, 0, 0, 0, 13, 0, 0, 2],
    [11, -2, 18, 0, 0, 0, 0, 0, 0, 0, 16, 0, 0, 3],
    [13, -2, 25, 0, 0, 0, 0, 0, 0, 0, 23, 0, 0, 3],
    [20, -2, 39, 0, 0, 0, 0, 0, 0, 0, 36, 0, 0, 4],
  ],
});

defineTiered({
  noun: 'warhammer',
  ids: [1337, 1335, 1339, 1341, 1343, 1345, 1347],
  icon: 'warhammer',
  slot: EquipSlot.WEAPON,
  skill: Skill.ATTACK,
  baseValue: 70,
  weight: 3.1,
  weapon: { type: WeaponType.WARHAMMER, speed: 6 },
  stats: [
    [-4, -4, 10, -4, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0],
    [-4, -4, 11, -4, 0, 0, 0, 0, 0, 0, 11, 0, 0, 0],
    [-4, -4, 18, -4, 0, 0, 0, 0, 0, 0, 16, 0, 0, 0],
    [-4, -4, 22, -4, 0, 0, 0, 0, 0, 0, 22, 0, 0, 0],
    [-4, -4, 25, -4, 0, 0, 0, 0, 0, 0, 27, 0, 0, 0],
    [-4, -4, 35, -4, 0, 0, 0, 0, 0, 0, 39, 0, 0, 0],
    [-4, -4, 53, -4, 0, 0, 0, 0, 0, 0, 62, 0, 0, 0],
  ],
});

defineTiered({
  noun: 'axe',
  ids: [1351, 1349, 1353, 1361, 1355, 1357, 1359],
  icon: 'hatchet',
  slot: EquipSlot.WEAPON,
  skill: Skill.ATTACK,
  baseValue: 16,
  weight: 1.5,
  weapon: { type: WeaponType.AXE, speed: 4 },
  examine: 'A woodcutter\'s axe.',
  stats: [
    [-2, 4, 2, 0, 0, 0, 1, 0, 0, 0, 5, 0, 0, 0],
    [-2, 5, 3, 0, 0, 0, 1, 0, 0, 0, 6, 0, 0, 0],
    [-2, 8, 6, 0, 0, 0, 1, 0, 0, 0, 9, 0, 0, 0],
    [-2, 10, 8, 0, 0, 0, 1, 0, 0, 0, 12, 0, 0, 0],
    [-2, 12, 10, 0, 0, 0, 1, 0, 0, 0, 13, 0, 0, 0],
    [-2, 17, 15, 0, 0, 0, 1, 0, 0, 0, 19, 0, 0, 0],
    [-2, 26, 24, 0, 0, 0, 1, 0, 0, 0, 29, 0, 0, 0],
  ],
});

defineTiered({
  noun: 'pickaxe',
  ids: [1265, 1267, 1269, 12297, 1273, 1271, 1275],
  icon: 'pickaxe',
  slot: EquipSlot.WEAPON,
  skill: Skill.ATTACK,
  baseValue: 18,
  weight: 2.2,
  weapon: { type: WeaponType.PICKAXE, speed: 4 },
  examine: 'A miner\'s pickaxe.',
  stats: [
    [4, -2, 2, 0, 0, 0, 1, 0, 0, 0, 5, 0, 0, 0],
    [5, -2, 3, 0, 0, 0, 1, 0, 0, 0, 7, 0, 0, 0],
    [8, -2, 6, 0, 0, 0, 1, 0, 0, 0, 9, 0, 0, 0],
    [10, -2, 8, 0, 0, 0, 1, 0, 0, 0, 11, 0, 0, 0],
    [12, -2, 10, 0, 0, 0, 1, 0, 0, 0, 13, 0, 0, 0],
    [17, -2, 15, 0, 0, 0, 1, 0, 0, 0, 19, 0, 0, 0],
    [26, -2, 24, 0, 0, 0, 1, 0, 0, 0, 29, 0, 0, 0],
  ],
});

/* Dragon / high tier weapons */
def(1215, 'Dragon dagger', {
  value: 30000, icon: 'dagger', colour: 0xc02020, equip: EquipSlot.WEAPON, weight: 0.4,
  weapon: { type: WeaponType.DAGGER, speed: 4 }, members: true,
  bonuses: bon([40, 25, -4, 1, 0, 0, 0, 0, 1, 0, 40, 0, 0, 0]), reqs: [[Skill.ATTACK, 60]],
});
def(4587, 'Dragon scimitar', {
  value: 100000, icon: 'scimitar', colour: 0xc02020, equip: EquipSlot.WEAPON, weight: 1.8,
  weapon: { type: WeaponType.SCIMITAR, speed: 4 }, members: true,
  bonuses: bon([8, 67, -2, 0, 0, 0, 1, 0, 0, 0, 66, 0, 0, 0]), reqs: [[Skill.ATTACK, 60]],
});
def(1305, 'Dragon longsword', {
  value: 100000, icon: 'longsword', colour: 0xc02020, equip: EquipSlot.WEAPON, weight: 2.2,
  weapon: { type: WeaponType.LONGSWORD, speed: 5 }, members: true,
  bonuses: bon([58, 69, -2, 0, 0, 0, 3, 2, 0, 0, 71, 0, 0, 0]), reqs: [[Skill.ATTACK, 60]],
});
def(4151, 'Abyssal whip', {
  value: 120001, icon: 'whip', colour: 0x2a1a1a, equip: EquipSlot.WEAPON, weight: 0.4,
  weapon: { type: WeaponType.WHIP, speed: 4 }, members: true,
  bonuses: bon([0, 82, 0, 0, 0, 0, 0, 0, 0, 0, 82, 0, 0, 0]), reqs: [[Skill.ATTACK, 70]],
});
def(4153, 'Granite maul', {
  value: 60000, icon: 'warhammer', colour: 0x6a6a6a, equip: EquipSlot.WEAPON, weight: 9.0,
  weapon: { type: WeaponType.WARHAMMER, speed: 7 }, members: true,
  bonuses: bon([0, 0, 81, 0, 0, 0, 0, 0, 0, 0, 79, 0, 0, 0]), reqs: [[Skill.ATTACK, 50], [Skill.STRENGTH, 50]],
});

/* ------------------------------------------------------------------ */
/* Melee armour                                                        */
/* ------------------------------------------------------------------ */

defineTiered({
  noun: 'full helm',
  ids: [1155, 1153, 1157, 1165, 1159, 1161, 1163],
  icon: 'fullhelm',
  slot: EquipSlot.HEAD,
  skill: Skill.DEFENCE,
  baseValue: 44,
  weight: 2.7,
  stats: [
    [0, 0, 0, -6, -3, 4, 5, 3, -1, 4, 0, 0, 0, 0],
    [0, 0, 0, -6, -3, 6, 7, 5, -1, 6, 0, 0, 0, 0],
    [0, 0, 0, -6, -3, 9, 10, 8, -1, 9, 0, 0, 0, 0],
    [0, 0, 0, -6, -3, 12, 13, 10, -1, 12, 0, 0, 0, 0],
    [0, 0, 0, -6, -3, 13, 14, 11, -1, 13, 0, 0, 0, 0],
    [0, 0, 0, -6, -3, 19, 21, 16, -1, 19, 0, 0, 0, 0],
    [0, 0, 0, -6, -3, 30, 32, 27, -1, 30, 0, 0, 0, 0],
  ],
});

defineTiered({
  noun: 'med helm',
  ids: [1139, 1137, 1141, 1151, 1143, 1145, 1147],
  icon: 'medhelm',
  slot: EquipSlot.HEAD,
  skill: Skill.DEFENCE,
  baseValue: 24,
  weight: 1.8,
  stats: [
    [0, 0, 0, -3, 0, 3, 4, 2, -1, 3, 0, 0, 0, 0],
    [0, 0, 0, -3, 0, 4, 5, 3, -1, 4, 0, 0, 0, 0],
    [0, 0, 0, -3, 0, 7, 8, 6, -1, 7, 0, 0, 0, 0],
    [0, 0, 0, -3, 0, 9, 10, 8, -1, 9, 0, 0, 0, 0],
    [0, 0, 0, -3, 0, 10, 11, 9, -1, 10, 0, 0, 0, 0],
    [0, 0, 0, -3, 0, 14, 15, 13, -1, 14, 0, 0, 0, 0],
    [0, 0, 0, -3, 0, 22, 23, 21, -1, 22, 0, 0, 0, 0],
  ],
});

defineTiered({
  noun: 'platebody',
  ids: [1117, 1115, 1119, 1125, 1121, 1123, 1127],
  icon: 'platebody',
  slot: EquipSlot.BODY,
  skill: Skill.DEFENCE,
  baseValue: 200,
  weight: 9.9,
  stats: [
    [0, 0, 0, -30, -15, 15, 14, 9, -6, 14, 0, 0, 0, 0],
    [0, 0, 0, -30, -15, 21, 20, 12, -6, 20, 0, 0, 0, 0],
    [0, 0, 0, -30, -15, 32, 31, 24, -6, 31, 0, 0, 0, 0],
    [0, 0, 0, -30, -15, 41, 40, 30, -6, 40, 0, 0, 0, 0],
    [0, 0, 0, -30, -15, 46, 44, 38, -6, 44, 0, 0, 0, 0],
    [0, 0, 0, -30, -15, 65, 63, 55, -6, 63, 0, 0, 0, 0],
    [0, 0, 0, -30, -15, 82, 80, 72, -6, 80, 0, 0, 0, 0],
  ],
});

defineTiered({
  noun: 'chainbody',
  ids: [1103, 1101, 1105, 1107, 1109, 1111, 1113],
  icon: 'chainbody',
  slot: EquipSlot.BODY,
  skill: Skill.DEFENCE,
  baseValue: 120,
  weight: 6.8,
  stats: [
    [0, 0, 0, -15, 0, 7, 11, 13, -3, 9, 0, 0, 0, 0],
    [0, 0, 0, -15, 0, 10, 15, 19, -3, 12, 0, 0, 0, 0],
    [0, 0, 0, -15, 0, 17, 25, 30, -3, 19, 0, 0, 0, 0],
    [0, 0, 0, -15, 0, 22, 32, 39, -3, 24, 0, 0, 0, 0],
    [0, 0, 0, -15, 0, 25, 35, 42, -3, 27, 0, 0, 0, 0],
    [0, 0, 0, -15, 0, 36, 50, 61, -3, 38, 0, 0, 0, 0],
    [0, 0, 0, -15, 0, 63, 72, 78, -3, 65, 0, 0, 0, 0],
  ],
});

const PLATELEG_STATS = [
  [0, 0, 0, -21, -11, 8, 7, 6, -4, 7, 0, 0, 0, 0],
  [0, 0, 0, -21, -11, 11, 10, 10, -4, 10, 0, 0, 0, 0],
  [0, 0, 0, -21, -11, 17, 16, 15, -4, 16, 0, 0, 0, 0],
  [0, 0, 0, -21, -11, 21, 20, 19, -4, 20, 0, 0, 0, 0],
  [0, 0, 0, -21, -11, 24, 22, 20, -4, 22, 0, 0, 0, 0],
  [0, 0, 0, -21, -11, 33, 31, 29, -4, 31, 0, 0, 0, 0],
  [0, 0, 0, -21, -11, 51, 49, 47, -4, 49, 0, 0, 0, 0],
];

defineTiered({
  noun: 'platelegs',
  ids: [1075, 1067, 1069, 1077, 1071, 1073, 1079],
  icon: 'platelegs',
  slot: EquipSlot.LEGS,
  skill: Skill.DEFENCE,
  baseValue: 160,
  weight: 9.0,
  stats: PLATELEG_STATS,
});

defineTiered({
  noun: 'plateskirt',
  ids: [1087, 1081, 1083, 1089, 1085, 1091, 1093],
  icon: 'plateskirt',
  slot: EquipSlot.LEGS,
  skill: Skill.DEFENCE,
  baseValue: 160,
  weight: 9.0,
  stats: PLATELEG_STATS,
});

defineTiered({
  noun: 'kiteshield',
  ids: [1189, 1191, 1193, 1195, 1197, 1199, 1201],
  icon: 'kiteshield',
  slot: EquipSlot.SHIELD,
  skill: Skill.DEFENCE,
  baseValue: 68,
  weight: 5.4,
  stats: [
    [0, 0, 0, -8, -3, 5, 7, 6, -1, 6, 0, 0, 0, 0],
    [0, 0, 0, -8, -3, 8, 10, 9, -1, 9, 0, 0, 0, 0],
    [0, 0, 0, -8, -3, 13, 15, 14, -1, 14, 0, 0, 0, 0],
    [0, 0, 0, -8, -3, 17, 19, 18, -1, 18, 0, 0, 0, 0],
    [0, 0, 0, -8, -3, 18, 22, 20, -1, 20, 0, 0, 0, 0],
    [0, 0, 0, -8, -3, 27, 31, 29, -1, 29, 0, 0, 0, 0],
    [0, 0, 0, -8, -3, 44, 48, 46, -1, 46, 0, 0, 0, 0],
  ],
});

defineTiered({
  noun: 'sq shield',
  ids: [1173, 1175, 1177, 1181, 1183, 1185, 1187],
  icon: 'sqshield',
  slot: EquipSlot.SHIELD,
  skill: Skill.DEFENCE,
  baseValue: 48,
  weight: 4.0,
  stats: [
    [0, 0, 0, -6, 0, 5, 6, 4, 0, 5, 0, 0, 0, 0],
    [0, 0, 0, -6, 0, 8, 9, 7, 0, 8, 0, 0, 0, 0],
    [0, 0, 0, -6, 0, 12, 13, 11, 0, 12, 0, 0, 0, 0],
    [0, 0, 0, -6, 0, 15, 16, 14, 0, 15, 0, 0, 0, 0],
    [0, 0, 0, -6, 0, 17, 19, 15, 0, 17, 0, 0, 0, 0],
    [0, 0, 0, -6, 0, 24, 26, 22, 0, 24, 0, 0, 0, 0],
    [0, 0, 0, -6, 0, 38, 40, 36, 0, 38, 0, 0, 0, 0],
  ],
});

/* ------------------------------------------------------------------ */
/* Ranged                                                              */
/* ------------------------------------------------------------------ */

interface BowSpec {
  id: number;
  name: string;
  ranged: number;
  level: number;
  speed: number;
  value: number;
  colour: number;
}

const BOWS: BowSpec[] = [
  { id: 841, name: 'Shortbow', ranged: 8, level: 1, speed: 4, value: 50, colour: 0x9a6a3a },
  { id: 839, name: 'Longbow', ranged: 8, level: 1, speed: 6, value: 80, colour: 0x9a6a3a },
  { id: 843, name: 'Oak shortbow', ranged: 14, level: 5, speed: 4, value: 100, colour: 0x8a5a2a },
  { id: 845, name: 'Oak longbow', ranged: 14, level: 5, speed: 6, value: 120, colour: 0x8a5a2a },
  { id: 849, name: 'Willow shortbow', ranged: 20, level: 20, speed: 4, value: 200, colour: 0xa88a5a },
  { id: 847, name: 'Willow longbow', ranged: 20, level: 20, speed: 6, value: 240, colour: 0xa88a5a },
  { id: 853, name: 'Maple shortbow', ranged: 29, level: 30, speed: 4, value: 400, colour: 0xb06a3a },
  { id: 851, name: 'Maple longbow', ranged: 29, level: 30, speed: 6, value: 480, colour: 0xb06a3a },
  { id: 857, name: 'Yew shortbow', ranged: 47, level: 40, speed: 4, value: 800, colour: 0x6a4a2a },
  { id: 855, name: 'Yew longbow', ranged: 47, level: 40, speed: 6, value: 960, colour: 0x6a4a2a },
  { id: 861, name: 'Magic shortbow', ranged: 69, level: 50, speed: 4, value: 1600, colour: 0x5a5ac0 },
  { id: 859, name: 'Magic longbow', ranged: 69, level: 50, speed: 6, value: 1920, colour: 0x5a5ac0 },
];
for (const b of BOWS) {
  def(b.id, b.name, {
    value: b.value,
    icon: 'bow',
    colour: b.colour,
    equip: EquipSlot.WEAPON,
    twoHanded: true,
    weight: 1.6,
    weapon: { type: WeaponType.BOW, speed: b.speed, range: b.speed === 6 ? 10 : 7 },
    bonuses: bon([0, 0, 0, 0, b.ranged, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    reqs: b.level > 1 ? [[Skill.RANGED, b.level]] : undefined,
    examine: 'A finely crafted bow.',
  });
}

const ARROWS: [number, string, number, number, number, number][] = [
  [882, 'Bronze arrow', 7, 1, 1, 0xb87333],
  [884, 'Iron arrow', 10, 1, 3, 0x8a8a8a],
  [886, 'Steel arrow', 16, 5, 8, 0xc0c0c8],
  [888, 'Mithril arrow', 22, 20, 25, 0x5a5ac8],
  [890, 'Adamant arrow', 31, 30, 60, 0x3a8a5a],
  [892, 'Rune arrow', 49, 40, 180, 0x4ab8c8],
];
for (const [id, name, rstr, level, value, colour] of ARROWS) {
  def(id, name, {
    value,
    stackable: true,
    icon: 'arrow',
    colour,
    equip: EquipSlot.AMMO,
    bonuses: bon([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, rstr, 0, 0]),
    reqs: level > 1 ? [[Skill.RANGED, level]] : undefined,
    examine: 'Arrows with metal tips.',
  });
}

/* Leather / ranged armour */
def(1129, 'Leather body', { value: 21, icon: 'leatherbody', colour: 0x8a6a3a, equip: EquipSlot.BODY, weight: 4.5, bonuses: bon([0, 0, 0, -2, 2, 8, 9, 10, 4, 9, 0, 0, 0, 0]) });
def(1131, 'Hardleather body', { value: 42, icon: 'leatherbody', colour: 0x6a4a24, equip: EquipSlot.BODY, weight: 5.4, bonuses: bon([0, 0, 0, -4, 8, 12, 15, 18, 6, 15, 0, 0, 0, 0]), reqs: [[Skill.DEFENCE, 10]] });
def(1133, 'Studded body', { value: 350, icon: 'leatherbody', colour: 0x7a5a2a, colour2: 0xb0b0b0, equip: EquipSlot.BODY, weight: 5.4, bonuses: bon([0, 0, 0, -4, 8, 18, 25, 22, 8, 25, 0, 0, 0, 0]), reqs: [[Skill.DEFENCE, 20], [Skill.RANGED, 20]] });
def(1095, 'Leather chaps', { value: 12, icon: 'chaps', colour: 0x8a6a3a, equip: EquipSlot.LEGS, weight: 3.6, bonuses: bon([0, 0, 0, 0, 4, 2, 2, 1, 0, 0, 0, 0, 0, 0]) });
def(1097, 'Studded chaps', { value: 300, icon: 'chaps', colour: 0x7a5a2a, colour2: 0xb0b0b0, equip: EquipSlot.LEGS, weight: 4.5, bonuses: bon([0, 0, 0, -5, 6, 15, 16, 17, 6, 16, 0, 0, 0, 0]), reqs: [[Skill.DEFENCE, 20], [Skill.RANGED, 20]] });
def(1167, 'Leather cowl', { value: 18, icon: 'cowl', colour: 0x8a6a3a, equip: EquipSlot.HEAD, weight: 0.9, bonuses: bon([0, 0, 0, 0, 1, 2, 3, 4, 2, 3, 0, 0, 0, 0]) });
def(1169, 'Coif', { value: 120, icon: 'cowl', colour: 0x7a5a3a, colour2: 0xa0a0a0, equip: EquipSlot.HEAD, weight: 1.4, bonuses: bon([0, 0, 0, -1, 2, 4, 6, 8, 4, 4, 0, 0, 0, 0]), reqs: [[Skill.RANGED, 20]] });
def(1059, 'Leather gloves', { value: 6, icon: 'gloves', colour: 0x8a6a3a, equip: EquipSlot.HANDS, weight: 0.2, bonuses: bon([0, 0, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 0, 0]) });
def(1061, 'Leather boots', { value: 6, icon: 'boots', colour: 0x8a6a3a, equip: EquipSlot.FEET, weight: 0.5, bonuses: bon([0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0]) });
def(1063, 'Leather vambraces', { value: 12, icon: 'gloves', colour: 0x8a6a3a, equip: EquipSlot.HANDS, weight: 0.2, bonuses: bon([0, 0, 0, 0, 4, 2, 2, 1, 0, 0, 0, 0, 0, 0]) });
def(3105, 'Climbing boots', { value: 12, icon: 'boots', colour: 0x6a4a2a, equip: EquipSlot.FEET, weight: 0.6, members: true, bonuses: bon([0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 2, 0, 0, 0]) });

/* ------------------------------------------------------------------ */
/* Magic                                                               */
/* ------------------------------------------------------------------ */

def(579, 'Blue wizard hat', { value: 20, icon: 'wizhat', colour: 0x2a3a9a, equip: EquipSlot.HEAD, weight: 0.4, bonuses: bon([0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0]) });
def(577, 'Blue wizard robe', { value: 30, icon: 'robetop', colour: 0x2a3a9a, equip: EquipSlot.BODY, weight: 1.4, bonuses: bon([0, 0, 0, 3, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0]) });
def(606, 'Blue skirt', { value: 20, icon: 'robebottom', colour: 0x2a3a9a, equip: EquipSlot.LEGS, weight: 1.4, bonuses: bon([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) });
def(1011, 'Black skirt', { value: 20, icon: 'robebottom', colour: 0x1a1a1a, equip: EquipSlot.LEGS, weight: 1.4, bonuses: bon([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) });
def(1013, 'Pink skirt', { value: 20, icon: 'robebottom', colour: 0xd06a9a, equip: EquipSlot.LEGS, weight: 1.4 });

const STAVES: [number, string, number[], number, number][] = [
  [1379, 'Staff', [0, -1, 7, 4, 0, 2, 3, 1, 4, 0, 3, 0, 0, 0], 15, 0x8a5a2a],
  [1389, 'Magic staff', [2, -1, 10, 10, 0, 2, 3, 1, 10, 0, 7, 0, 0, 0], 200, 0x6a4aa0],
  [1381, 'Staff of air', [0, -1, 7, 10, 0, 2, 3, 1, 10, 0, 3, 0, 0, 0], 1500, 0xdfe8f0],
  [1383, 'Staff of water', [0, -1, 7, 10, 0, 2, 3, 1, 10, 0, 3, 0, 0, 0], 1500, 0x4a7fd0],
  [1385, 'Staff of earth', [1, -1, 9, 10, 0, 2, 3, 1, 10, 0, 5, 0, 0, 0], 1500, 0x8a6a3a],
  [1387, 'Staff of fire', [3, -1, 9, 10, 0, 2, 3, 1, 10, 0, 6, 0, 0, 0], 1500, 0xd04a20],
];
for (const [id, name, stats, value, colour] of STAVES) {
  def(id, name, {
    value,
    icon: 'staff',
    colour,
    equip: EquipSlot.WEAPON,
    twoHanded: true,
    weight: 2.2,
    weapon: { type: WeaponType.STAFF, speed: 5 },
    bonuses: bon(stats),
    examine: 'A magical staff.',
  });
}

/* ------------------------------------------------------------------ */
/* Jewellery, capes and misc                                           */
/* ------------------------------------------------------------------ */

def(1725, 'Amulet of strength', { value: 1500, icon: 'amulet', colour: 0xd02030, equip: EquipSlot.AMULET, bonuses: bon([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0]) });
def(1731, 'Amulet of power', { value: 2000, icon: 'amulet', colour: 0x20a040, equip: EquipSlot.AMULET, bonuses: bon([6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 0, 0, 1]) });
def(1727, 'Amulet of magic', { value: 900, icon: 'amulet', colour: 0x2050d0, equip: EquipSlot.AMULET, bonuses: bon([0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) });
def(1729, 'Amulet of defence', { value: 1200, icon: 'amulet', colour: 0xe8f0f8, equip: EquipSlot.AMULET, bonuses: bon([0, 0, 0, 0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0]) });
def(1478, 'Amulet of accuracy', { value: 400, icon: 'amulet', colour: 0xd8e8f0, equip: EquipSlot.AMULET, bonuses: bon([4, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0]) });
def(1718, 'Holy symbol', { value: 200, icon: 'amulet', colour: 0xd8d8e0, equip: EquipSlot.AMULET, bonuses: bon([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8]) });
def(1724, 'Unholy symbol', { value: 200, icon: 'amulet', colour: 0x6a2a6a, equip: EquipSlot.AMULET, members: true, bonuses: bon([2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 8]) });

def(1635, 'Gold ring', { value: 350, icon: 'ring', colour: 0xe8c040, equip: EquipSlot.RING });
def(1637, 'Sapphire ring', { value: 900, icon: 'ring', colour: 0x2050d0, equip: EquipSlot.RING });
def(1639, 'Emerald ring', { value: 1200, icon: 'ring', colour: 0x20a040, equip: EquipSlot.RING });
def(1641, 'Ruby ring', { value: 1800, icon: 'ring', colour: 0xd02030, equip: EquipSlot.RING });
def(1643, 'Diamond ring', { value: 2800, icon: 'ring', colour: 0xe8f0f8, equip: EquipSlot.RING });
def(2570, 'Ring of life', { value: 5000, icon: 'ring', colour: 0x40d0d0, equip: EquipSlot.RING, members: true, examine: 'Teleports you to safety when you are nearly dead.' });

const CAPES: [number, string, number][] = [
  [1007, 'Red cape', 0xc02020],
  [1019, 'Black cape', 0x1a1a1a],
  [1021, 'Blue cape', 0x2040c0],
  [1023, 'Yellow cape', 0xe0c020],
  [1027, 'Green cape', 0x209040],
  [1029, 'Purple cape', 0x8020c0],
  [1031, 'Orange cape', 0xe08020],
];
for (const [id, name, colour] of CAPES) {
  def(id, name, { value: 12, icon: 'cape', colour, equip: EquipSlot.CAPE, weight: 0.4, bonuses: bon([0, 0, 0, 0, 0, 0, 1, 1, 0, 2, 0, 0, 0, 0]) });
}

def(1540, 'Anti-dragon shield', { value: 2000, icon: 'sqshield', colour: 0x8a8a94, equip: EquipSlot.SHIELD, weight: 5.4, untradeable: true, bonuses: bon([0, 0, 0, 0, 0, 7, 9, 8, 2, 8, 0, 0, 0, 0]), examine: 'A shield that protects against dragonfire.' });
def(1171, 'Wooden shield', { value: 20, icon: 'sqshield', colour: 0x8a5a2a, equip: EquipSlot.SHIELD, weight: 3.2, bonuses: bon([0, 0, 0, 0, 0, 4, 5, 3, 1, 4, 0, 0, 0, 0]) });

def(544, 'Monk\'s robe top', { value: 27, icon: 'robetop', colour: 0x9a7a4a, equip: EquipSlot.BODY, weight: 1.4, bonuses: bon([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6]) });
def(542, 'Monk\'s robe', { value: 27, icon: 'robebottom', colour: 0x9a7a4a, equip: EquipSlot.LEGS, weight: 1.4, bonuses: bon([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5]) });
def(428, 'Priest gown', { value: 24, icon: 'robetop', colour: 0xd8d8e0, equip: EquipSlot.BODY, weight: 1.4, bonuses: bon([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3]) });
def(426, 'Priest gown (bottom)', { value: 24, icon: 'robebottom', colour: 0xd8d8e0, equip: EquipSlot.LEGS, weight: 1.4, bonuses: bon([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3]) });
def(1949, 'Chef\'s hat', { value: 2, icon: 'wizhat', colour: 0xf0f0f0, equip: EquipSlot.HEAD, weight: 0.2 });
def(288, 'Goblin mail', { value: 12, icon: 'leatherbody', colour: 0x5a7a3a, equip: EquipSlot.BODY, weight: 2.7, bonuses: bon([0, 0, 0, 0, 0, 3, 4, 5, 0, 4, 0, 0, 0, 0]) });

/* Fletching intermediates */
def(52, 'Arrow shaft', { value: 1, stackable: true, icon: 'shaft', colour: 0x9a7a4a, examine: 'I need some feathers to make this into an arrow.' });
def(53, 'Headless arrow', { value: 1, stackable: true, icon: 'arrow', colour: 0xb0a080, examine: 'I need to attach an arrowhead.' });
const ARROW_TIPS: [number, string, number][] = [
  [39, 'Bronze arrowtips', 0xb87333],
  [40, 'Iron arrowtips', 0x8a8a8a],
  [41, 'Steel arrowtips', 0xc0c0c8],
  [42, 'Mithril arrowtips', 0x5a5ac8],
  [43, 'Adamant arrowtips', 0x3a8a5a],
  [44, 'Rune arrowtips', 0x4ab8c8],
];
for (const [id, name, colour] of ARROW_TIPS) {
  def(id, name, { value: 2, stackable: true, icon: 'arrowtip', colour, examine: 'Arrow tips - I need arrow shafts.' });
}
const UNSTRUNG: [number, string, string, number][] = [
  [50, 'Shortbow (u)', 'Shortbow', 0x9a6a3a],
  [48, 'Longbow (u)', 'Longbow', 0x9a6a3a],
  [54, 'Oak shortbow (u)', 'Oak shortbow', 0x8a5a2a],
  [56, 'Oak longbow (u)', 'Oak longbow', 0x8a5a2a],
  [60, 'Willow shortbow (u)', 'Willow shortbow', 0xa88a5a],
  [58, 'Willow longbow (u)', 'Willow longbow', 0xa88a5a],
  [64, 'Maple shortbow (u)', 'Maple shortbow', 0xb06a3a],
  [62, 'Maple longbow (u)', 'Maple longbow', 0xb06a3a],
  [68, 'Yew shortbow (u)', 'Yew shortbow', 0x6a4a2a],
  [66, 'Yew longbow (u)', 'Yew longbow', 0x6a4a2a],
  [72, 'Magic shortbow (u)', 'Magic shortbow', 0x5a5ac0],
  [70, 'Magic longbow (u)', 'Magic longbow', 0x5a5ac0],
];
for (const [id, name, , colour] of UNSTRUNG) {
  def(id, name, { value: 20, icon: 'bow', colour, examine: 'It needs a string.' });
}

export const UNSTRUNG_BOWS = UNSTRUNG;
export {};
