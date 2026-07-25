/**
 * Skinned character models. Each model is built once with a bone index per
 * vertex; animation is done entirely with bone matrices at draw time.
 */

import { EquipSlot, itemDef } from '../../shared/data/items.ts';
import { MeshBuilder, shade, type Mesh } from './mesh.ts';

export const BONE = {
  ROOT: 0,
  TORSO: 1,
  HEAD: 2,
  ARM_L: 3,
  ARM_R: 4,
  LEG_L: 5,
  LEG_R: 6,
  WEAPON: 7,
  SHIELD: 8,
  CAPE: 9,
  TAIL: 10,
  EXTRA_A: 11,
  EXTRA_B: 12,
} as const;

export const MAX_BONES = 14;

/** Where each bone pivots, in model space. Used to build the bone matrices. */
export const BONE_PIVOTS: [number, number, number][] = [
  [0, 0, 0], // root
  [0, 56, 0], // torso
  [0, 104, 0], // head
  [-20, 96, 0], // left arm
  [20, 96, 0], // right arm
  [-10, 56, 0], // left leg
  [10, 56, 0], // right leg
  [26, 84, 4], // weapon
  [-26, 84, 4], // shield
  [0, 100, 10], // cape
  [0, 40, 30], // tail
  [0, 60, 0],
  [0, 60, 0],
];

const cache = new Map<string, Mesh>();

export interface ActorLook {
  model: string;
  colour: number;
  colour2?: number;
  /** Equipment item ids by slot (players only). */
  equipment?: number[];
  scale?: number;
}

export function actorMesh(key: string, look: ActorLook): Mesh {
  const hit = cache.get(key);
  if (hit) return hit;
  const b = new MeshBuilder();
  build(b, look);
  const mesh = b.build();
  cache.set(key, mesh);
  return mesh;
}

const SKIN = 0xc08a5a;
const SKIN_DARK = 0x9a6a40;

function build(b: MeshBuilder, look: ActorLook): void {
  switch (look.model) {
    case 'human':
    case 'player':
      buildHumanoid(b, look);
      break;
    case 'guard':
      buildHumanoid(b, { ...look, model: 'guard' });
      break;
    case 'goblin':
      buildGoblin(b, look);
      break;
    case 'dwarf':
      buildHumanoid(b, look, { height: 0.72, width: 1.25, beard: true });
      break;
    case 'imp':
      buildImp(b, look);
      break;
    case 'wizard':
      buildWizard(b, look);
      break;
    case 'monk':
      buildRobed(b, look);
      break;
    case 'farmer':
    case 'barbarian':
      buildHumanoid(b, look, { beard: look.model === 'barbarian' });
      break;
    case 'knight':
      buildHumanoid(b, look, { armoured: true });
      break;
    case 'skeleton':
      buildSkeleton(b, look);
      break;
    case 'zombie':
      buildHumanoid(b, look, { zombie: true });
      break;
    case 'ghost':
      buildGhost(b, look);
      break;
    case 'giant':
      buildHumanoid(b, look, { height: 1.5, width: 1.5 });
      break;
    case 'demon':
      buildDemon(b, look);
      break;
    case 'chicken':
      buildChicken(b, look);
      break;
    case 'cow':
      buildCow(b, look);
      break;
    case 'rat':
      buildRat(b, look);
      break;
    case 'spider':
      buildSpider(b, look);
      break;
    case 'scorpion':
      buildScorpion(b, look);
      break;
    case 'bear':
      buildBear(b, look);
      break;
    case 'unicorn':
      buildUnicorn(b, look);
      break;
    case 'fishspot':
      buildFishSpot(b);
      break;
    default:
      buildHumanoid(b, look);
  }
}

interface HumanoidOptions {
  height?: number;
  width?: number;
  beard?: boolean;
  armoured?: boolean;
  zombie?: boolean;
}

function buildHumanoid(b: MeshBuilder, look: ActorLook, opts: HumanoidOptions = {}): void {
  const hs = opts.height ?? 1;
  const ws = opts.width ?? 1;
  const skin = opts.zombie ? 0x7a8a5a : SKIN;
  const eq = look.equipment ?? [];

  const bodyItem = eq[EquipSlot.BODY] >= 0 ? itemDef(eq[EquipSlot.BODY]) : undefined;
  const legItem = eq[EquipSlot.LEGS] >= 0 ? itemDef(eq[EquipSlot.LEGS]) : undefined;
  const headItem = eq[EquipSlot.HEAD] >= 0 ? itemDef(eq[EquipSlot.HEAD]) : undefined;
  const capeItem = eq[EquipSlot.CAPE] >= 0 ? itemDef(eq[EquipSlot.CAPE]) : undefined;
  const weaponItem = eq[EquipSlot.WEAPON] >= 0 ? itemDef(eq[EquipSlot.WEAPON]) : undefined;
  const shieldItem = eq[EquipSlot.SHIELD] >= 0 ? itemDef(eq[EquipSlot.SHIELD]) : undefined;
  const bootItem = eq[EquipSlot.FEET] >= 0 ? itemDef(eq[EquipSlot.FEET]) : undefined;
  const handItem = eq[EquipSlot.HANDS] >= 0 ? itemDef(eq[EquipSlot.HANDS]) : undefined;
  const amuletItem = eq[EquipSlot.AMULET] >= 0 ? itemDef(eq[EquipSlot.AMULET]) : undefined;

  const torsoColour = bodyItem?.colour ?? look.colour;
  const legColour = legItem?.colour ?? look.colour2 ?? shade(look.colour, 0.7);
  const bulky = !!bodyItem?.bonuses?.defenceStab && (bodyItem?.bonuses?.defenceStab ?? 0) > 12;

  b.push();
  b.scale(ws, hs, ws);

  // Torso
  b.setBone(BONE.TORSO);
  b.box(0, 56, 0, bulky || opts.armoured ? 46 : 40, 48, bulky ? 28 : 24, torsoColour, shade(torsoColour, 1.1));
  if (bulky) {
    b.box(-26, 92, 0, 14, 12, 26, shade(torsoColour, 1.15));
    b.box(26, 92, 0, 14, 12, 26, shade(torsoColour, 1.15));
  }
  if (amuletItem) b.box(0, 96, -13, 12, 10, 4, amuletItem.colour);

  // Head
  b.setBone(BONE.HEAD);
  b.box(0, 104, 0, 26, 26, 24, skin, shade(skin, 1.08));
  b.box(-6, 116, -13, 5, 5, 3, 0x1a1a1a);
  b.box(6, 116, -13, 5, 5, 3, 0x1a1a1a);
  if (opts.beard) b.box(0, 104, -12, 20, 14, 6, 0xb0a090);
  if (headItem) {
    const hc = headItem.colour;
    if (headItem.icon === 'fullhelm') {
      b.box(0, 104, 0, 30, 30, 28, hc, shade(hc, 1.15));
      b.box(0, 110, -15, 12, 12, 3, 0x101010);
    } else if (headItem.icon === 'medhelm' || headItem.icon === 'cowl') {
      b.box(0, 118, 0, 30, 16, 28, hc, shade(hc, 1.15));
    } else if (headItem.icon === 'wizhat') {
      b.cylinder(0, 128, 0, 20, 0, 44, 6, hc);
      b.cylinder(0, 126, 0, 30, 30, 5, 8, shade(hc, 0.9));
    } else {
      b.box(0, 120, 0, 28, 12, 26, hc);
    }
  } else {
    b.box(0, 122, 0, 28, 10, 26, hairColour(look));
  }

  // Arms
  const sleeve = torsoColour;
  b.setBone(BONE.ARM_L);
  b.box(-25, 62, 0, 14, 38, 16, sleeve, shade(sleeve, 1.05));
  b.box(-25, 48, 0, 12, 16, 14, handItem?.colour ?? skin);
  b.setBone(BONE.ARM_R);
  b.box(25, 62, 0, 14, 38, 16, sleeve, shade(sleeve, 1.05));
  b.box(25, 48, 0, 12, 16, 14, handItem?.colour ?? skin);

  // Legs
  b.setBone(BONE.LEG_L);
  b.box(-11, 10, 0, 16, 48, 18, legColour, shade(legColour, 1.05));
  b.box(-11, 0, -2, 17, 10, 24, bootItem?.colour ?? 0x4a3520);
  b.setBone(BONE.LEG_R);
  b.box(11, 10, 0, 16, 48, 18, legColour, shade(legColour, 1.05));
  b.box(11, 0, -2, 17, 10, 24, bootItem?.colour ?? 0x4a3520);

  // Cape
  if (capeItem) {
    b.setBone(BONE.CAPE);
    b.box(0, 52, 16, 38, 52, 6, capeItem.colour, shade(capeItem.colour, 1.1));
  }

  // Held items
  if (weaponItem) {
    b.setBone(BONE.WEAPON);
    buildWeapon(b, weaponItem.icon, weaponItem.colour);
  }
  if (shieldItem) {
    b.setBone(BONE.SHIELD);
    const sc = shieldItem.colour;
    if (shieldItem.icon === 'kiteshield') {
      b.box(-30, 46, -6, 8, 54, 34, sc, shade(sc, 1.1));
      b.box(-30, 34, -6, 8, 14, 22, shade(sc, 0.9));
    } else {
      b.box(-30, 48, -6, 8, 40, 36, sc, shade(sc, 1.1));
    }
  }
  b.setBone(BONE.ROOT);
  b.pop();
}

function buildWeapon(b: MeshBuilder, icon: string, colour: number): void {
  const grip = 0x5a3a20;
  switch (icon) {
    case 'sword':
    case 'longsword':
      b.box(30, 44, -8, 8, 18, 8, grip);
      b.box(30, 60, -8, 26, 6, 8, shade(colour, 0.7));
      b.box(30, 64, -8, 9, 76, 5, colour, shade(colour, 1.3));
      break;
    case 'scimitar':
      b.box(30, 44, -8, 8, 18, 8, grip);
      b.push();
      b.translate(30, 62, -8);
      b.rotateZ(-0.35);
      b.box(0, 0, 0, 10, 66, 5, colour, shade(colour, 1.3));
      b.pop();
      break;
    case 'dagger':
      b.box(30, 44, -8, 7, 14, 7, grip);
      b.box(30, 58, -8, 8, 36, 4, colour, shade(colour, 1.3));
      break;
    case 'twohand':
      b.box(28, 34, -10, 10, 30, 10, grip);
      b.box(28, 64, -10, 34, 8, 10, shade(colour, 0.7));
      b.box(28, 70, -10, 14, 108, 6, colour, shade(colour, 1.3));
      break;
    case 'battleaxe':
    case 'hatchet':
      b.box(30, 42, -8, 8, 62, 8, grip);
      b.box(34, 92, -8, 26, 26, 8, colour, shade(colour, 1.2));
      break;
    case 'mace':
    case 'warhammer':
      b.box(30, 42, -8, 8, 56, 8, grip);
      b.box(30, 96, -8, 22, 22, 22, colour, shade(colour, 1.2));
      break;
    case 'pickaxe':
      b.box(30, 42, -8, 8, 62, 8, grip);
      b.box(30, 98, -8, 54, 10, 8, colour, shade(colour, 1.2));
      break;
    case 'staff':
      b.box(30, 20, -8, 7, 130, 7, 0x6a4a28);
      b.sphere(30, 152, -8, 12, colour, 2, 6);
      break;
    case 'bow':
      b.push();
      b.translate(30, 46, -8);
      b.rotateZ(0.25);
      b.cylinder(0, 0, 0, 5, 5, 100, 5, colour);
      b.box(0, 50, 6, 3, 96, 2, 0xe0e0d0);
      b.pop();
      break;
    case 'whip':
      b.box(30, 44, -8, 8, 20, 8, grip);
      for (let i = 0; i < 6; i++) b.box(30 + i * 4, 60 - i * 8, -8 + i * 5, 5, 10, 5, colour);
      break;
    default:
      b.box(30, 46, -8, 10, 46, 10, colour);
  }
}

function hairColour(look: ActorLook): number {
  return look.colour2 ?? 0x5a3a20;
}

function buildGoblin(b: MeshBuilder, look: ActorLook): void {
  const green = look.colour;
  b.push();
  b.scale(0.85, 0.85, 0.85);
  b.setBone(BONE.TORSO);
  b.box(0, 50, 0, 38, 42, 22, look.colour2 ?? 0x8a2a2a);
  b.setBone(BONE.HEAD);
  b.box(0, 92, 0, 34, 30, 30, green, shade(green, 1.1));
  b.box(0, 96, -18, 14, 10, 10, shade(green, 1.15));
  b.box(-9, 104, -16, 6, 6, 4, 0xf0e000);
  b.box(9, 104, -16, 6, 6, 4, 0xf0e000);
  b.box(-19, 100, 0, 12, 8, 6, shade(green, 0.9));
  b.box(19, 100, 0, 12, 8, 6, shade(green, 0.9));
  b.setBone(BONE.ARM_L);
  b.box(-24, 56, 0, 12, 34, 12, green);
  b.setBone(BONE.ARM_R);
  b.box(24, 56, 0, 12, 34, 12, green);
  b.setBone(BONE.LEG_L);
  b.box(-10, 8, 0, 14, 44, 14, green);
  b.setBone(BONE.LEG_R);
  b.box(10, 8, 0, 14, 44, 14, green);
  b.setBone(BONE.ROOT);
  b.pop();
}

function buildImp(b: MeshBuilder, look: ActorLook): void {
  b.push();
  b.scale(0.6, 0.6, 0.6);
  b.setBone(BONE.TORSO);
  b.box(0, 40, 0, 30, 34, 20, look.colour);
  b.setBone(BONE.HEAD);
  b.box(0, 74, 0, 30, 26, 26, look.colour);
  b.cylinder(-10, 96, 0, 5, 0, 20, 4, shade(look.colour, 0.7));
  b.cylinder(10, 96, 0, 5, 0, 20, 4, shade(look.colour, 0.7));
  b.box(-7, 84, -14, 5, 5, 3, 0xffe000);
  b.box(7, 84, -14, 5, 5, 3, 0xffe000);
  b.setBone(BONE.ARM_L);
  b.box(-20, 46, 0, 10, 28, 10, look.colour);
  b.setBone(BONE.ARM_R);
  b.box(20, 46, 0, 10, 28, 10, look.colour);
  b.setBone(BONE.LEG_L);
  b.box(-8, 6, 0, 11, 36, 11, look.colour);
  b.setBone(BONE.LEG_R);
  b.box(8, 6, 0, 11, 36, 11, look.colour);
  b.setBone(BONE.ROOT);
  b.pop();
}

function buildWizard(b: MeshBuilder, look: ActorLook): void {
  const robe = look.colour;
  b.setBone(BONE.TORSO);
  b.cylinder(0, 0, 0, 32, 22, 90, 8, robe);
  b.box(0, 84, 0, 36, 26, 22, robe, shade(robe, 1.1));
  b.setBone(BONE.HEAD);
  b.box(0, 110, 0, 24, 24, 22, SKIN);
  b.box(0, 104, -12, 18, 20, 6, 0xe8e8e8);
  b.cylinder(0, 134, 0, 20, 0, 46, 6, robe);
  b.cylinder(0, 132, 0, 32, 32, 5, 8, shade(robe, 0.85));
  b.setBone(BONE.ARM_L);
  b.box(-24, 66, 0, 13, 34, 13, shade(robe, 1.05));
  b.setBone(BONE.ARM_R);
  b.box(24, 66, 0, 13, 34, 13, shade(robe, 1.05));
  b.setBone(BONE.WEAPON);
  b.box(30, 10, -8, 7, 150, 7, 0x6a4a28);
  b.sphere(30, 162, -8, 11, look.colour2 ?? 0x60c0e0, 2, 6);
  b.setBone(BONE.ROOT);
}

function buildRobed(b: MeshBuilder, look: ActorLook): void {
  const robe = look.colour;
  b.setBone(BONE.TORSO);
  b.cylinder(0, 0, 0, 30, 24, 96, 8, robe);
  b.box(0, 90, 0, 34, 24, 22, robe);
  b.setBone(BONE.HEAD);
  b.box(0, 114, 0, 24, 24, 22, SKIN);
  b.box(0, 128, 0, 26, 8, 24, 0x8a7a5a);
  b.setBone(BONE.ARM_L);
  b.box(-23, 70, 0, 13, 32, 13, robe);
  b.setBone(BONE.ARM_R);
  b.box(23, 70, 0, 13, 32, 13, robe);
  b.setBone(BONE.ROOT);
}

function buildSkeleton(b: MeshBuilder, look: ActorLook): void {
  const bone = look.colour;
  b.setBone(BONE.TORSO);
  b.box(0, 84, 0, 32, 20, 18, bone);
  for (let i = 0; i < 4; i++) b.box(0, 60 + i * 8, 0, 30 - i * 2, 4, 16, shade(bone, 0.92));
  b.box(0, 56, 0, 8, 34, 8, shade(bone, 0.85));
  b.setBone(BONE.HEAD);
  b.box(0, 106, 0, 24, 24, 22, bone, shade(bone, 1.08));
  b.box(-6, 114, -12, 6, 7, 3, 0x101010);
  b.box(6, 114, -12, 6, 7, 3, 0x101010);
  b.box(0, 102, -11, 14, 6, 3, 0x101010);
  b.setBone(BONE.ARM_L);
  b.box(-20, 60, 0, 8, 42, 8, bone);
  b.setBone(BONE.ARM_R);
  b.box(20, 60, 0, 8, 42, 8, bone);
  b.setBone(BONE.LEG_L);
  b.box(-9, 4, 0, 9, 54, 9, bone);
  b.setBone(BONE.LEG_R);
  b.box(9, 4, 0, 9, 54, 9, bone);
  b.setBone(BONE.ROOT);
}

function buildGhost(b: MeshBuilder, look: ActorLook): void {
  const c = look.colour;
  b.setBone(BONE.TORSO);
  b.cylinder(0, 10, 0, 26, 30, 74, 8, c);
  b.setBone(BONE.HEAD);
  b.box(0, 84, 0, 26, 26, 24, shade(c, 1.1));
  b.box(-6, 94, -13, 6, 8, 3, 0x203040);
  b.box(6, 94, -13, 6, 8, 3, 0x203040);
  b.setBone(BONE.ARM_L);
  b.box(-24, 48, 0, 12, 34, 12, c);
  b.setBone(BONE.ARM_R);
  b.box(24, 48, 0, 12, 34, 12, c);
  b.setBone(BONE.ROOT);
}

function buildDemon(b: MeshBuilder, look: ActorLook): void {
  const c = look.colour;
  b.setBone(BONE.TORSO);
  b.box(0, 62, 0, 56, 60, 32, c, shade(c, 1.1));
  b.box(0, 46, 20, 46, 40, 10, shade(c, 0.85));
  b.setBone(BONE.HEAD);
  b.box(0, 122, 0, 34, 30, 30, c);
  b.cylinder(-14, 148, 0, 7, 0, 30, 4, 0x2a1a10);
  b.cylinder(14, 148, 0, 7, 0, 30, 4, 0x2a1a10);
  b.box(-8, 130, -16, 7, 7, 3, 0xffd000);
  b.box(8, 130, -16, 7, 7, 3, 0xffd000);
  b.setBone(BONE.ARM_L);
  b.box(-36, 66, 0, 18, 52, 18, c);
  b.setBone(BONE.ARM_R);
  b.box(36, 66, 0, 18, 52, 18, c);
  b.setBone(BONE.LEG_L);
  b.box(-16, 6, 0, 20, 58, 20, c);
  b.setBone(BONE.LEG_R);
  b.box(16, 6, 0, 20, 58, 20, c);
  b.setBone(BONE.CAPE);
  b.quad(-6, 110, 12, -62, 130, 40, -58, 60, 44, -6, 70, 14, shade(c, 0.7));
  b.quad(6, 110, 12, 6, 70, 14, 58, 60, 44, 62, 130, 40, shade(c, 0.7));
  b.setBone(BONE.ROOT);
}

function buildChicken(b: MeshBuilder, look: ActorLook): void {
  const c = look.colour;
  b.setBone(BONE.TORSO);
  b.sphere(0, 26, 0, 22, c, 3, 6, 1.1);
  b.sphere(0, 30, 18, 12, shade(c, 0.9), 2, 5, 1.2);
  b.setBone(BONE.HEAD);
  b.sphere(0, 46, -16, 12, c, 3, 5);
  b.cylinder(0, 44, -26, 5, 0, 12, 4, 0xe0a020);
  b.box(0, 54, -14, 8, 10, 6, look.colour2 ?? 0xd04030);
  b.setBone(BONE.LEG_L);
  b.box(-7, 0, 0, 4, 16, 4, 0xe0a020);
  b.setBone(BONE.LEG_R);
  b.box(7, 0, 0, 4, 16, 4, 0xe0a020);
  b.setBone(BONE.ROOT);
}

function buildCow(b: MeshBuilder, look: ActorLook): void {
  const c = look.colour;
  const spots = look.colour2 ?? 0x4a3020;
  b.setBone(BONE.TORSO);
  b.box(0, 42, 0, 46, 44, 92, c, shade(c, 1.08));
  b.box(-14, 60, 12, 22, 20, 30, spots);
  b.box(16, 52, -18, 18, 18, 26, spots);
  b.setBone(BONE.HEAD);
  b.box(0, 52, -60, 30, 30, 34, c);
  b.box(0, 46, -78, 20, 16, 12, 0xe0b0a0);
  b.cylinder(-14, 76, -58, 4, 2, 14, 4, 0xe8e0c0);
  b.cylinder(14, 76, -58, 4, 2, 14, 4, 0xe8e0c0);
  b.setBone(BONE.LEG_L);
  b.box(-16, 0, -30, 13, 44, 13, spots);
  b.box(-16, 0, 30, 13, 44, 13, spots);
  b.setBone(BONE.LEG_R);
  b.box(16, 0, -30, 13, 44, 13, spots);
  b.box(16, 0, 30, 13, 44, 13, spots);
  b.setBone(BONE.TAIL);
  b.box(0, 60, 50, 6, 6, 30, spots);
  b.setBone(BONE.ROOT);
}

function buildRat(b: MeshBuilder, look: ActorLook): void {
  const c = look.colour;
  b.setBone(BONE.TORSO);
  b.sphere(0, 16, 0, 20, c, 3, 6, 0.75);
  b.setBone(BONE.HEAD);
  b.sphere(0, 16, -20, 12, shade(c, 1.05), 3, 5, 0.9);
  b.cylinder(0, 14, -30, 5, 0, 10, 4, 0xe0a0a0);
  b.box(-7, 26, -18, 7, 7, 3, shade(c, 0.8));
  b.box(7, 26, -18, 7, 7, 3, shade(c, 0.8));
  b.setBone(BONE.TAIL);
  b.box(0, 14, 22, 4, 4, 40, 0xd0a0a0);
  b.setBone(BONE.LEG_L);
  b.box(-10, 0, -8, 5, 10, 5, shade(c, 0.8));
  b.box(-10, 0, 8, 5, 10, 5, shade(c, 0.8));
  b.setBone(BONE.LEG_R);
  b.box(10, 0, -8, 5, 10, 5, shade(c, 0.8));
  b.box(10, 0, 8, 5, 10, 5, shade(c, 0.8));
  b.setBone(BONE.ROOT);
}

function buildSpider(b: MeshBuilder, look: ActorLook): void {
  const c = look.colour;
  b.setBone(BONE.TORSO);
  b.sphere(0, 20, 12, 26, c, 3, 6, 0.8);
  b.setBone(BONE.HEAD);
  b.sphere(0, 18, -16, 15, shade(c, 1.1), 3, 5, 0.9);
  b.box(-6, 24, -26, 5, 5, 4, 0xd02020);
  b.box(6, 24, -26, 5, 5, 4, 0xd02020);
  for (let i = 0; i < 4; i++) {
    const z = -12 + i * 12;
    b.setBone(i % 2 === 0 ? BONE.LEG_L : BONE.ARM_L);
    b.push();
    b.translate(-14, 18, z);
    b.rotateZ(0.9);
    b.cylinder(0, 0, 0, 3, 2, 34, 4, shade(c, 0.85));
    b.pop();
    b.setBone(i % 2 === 0 ? BONE.LEG_R : BONE.ARM_R);
    b.push();
    b.translate(14, 18, z);
    b.rotateZ(-0.9);
    b.cylinder(0, 0, 0, 3, 2, 34, 4, shade(c, 0.85));
    b.pop();
  }
  b.setBone(BONE.ROOT);
}

function buildScorpion(b: MeshBuilder, look: ActorLook): void {
  const c = look.colour;
  b.setBone(BONE.TORSO);
  b.box(0, 12, 0, 34, 18, 56, c, shade(c, 1.1));
  b.setBone(BONE.HEAD);
  b.box(0, 12, -34, 24, 14, 20, shade(c, 1.05));
  b.setBone(BONE.ARM_L);
  b.box(-26, 12, -34, 22, 12, 14, shade(c, 0.9));
  b.setBone(BONE.ARM_R);
  b.box(26, 12, -34, 22, 12, 14, shade(c, 0.9));
  b.setBone(BONE.TAIL);
  for (let i = 0; i < 4; i++) b.box(0, 20 + i * 12, 30 + i * 6, 12 - i, 12, 12, shade(c, 1 - i * 0.04));
  b.sphere(0, 70, 52, 9, 0xd0c020, 2, 5);
  b.setBone(BONE.LEG_L);
  for (let i = 0; i < 3; i++) b.box(-20, 0, -12 + i * 16, 6, 12, 6, shade(c, 0.8));
  b.setBone(BONE.LEG_R);
  for (let i = 0; i < 3; i++) b.box(20, 0, -12 + i * 16, 6, 12, 6, shade(c, 0.8));
  b.setBone(BONE.ROOT);
}

function buildBear(b: MeshBuilder, look: ActorLook): void {
  const c = look.colour;
  b.setBone(BONE.TORSO);
  b.box(0, 40, 0, 48, 46, 86, c, shade(c, 1.08));
  b.setBone(BONE.HEAD);
  b.box(0, 52, -56, 32, 30, 30, c);
  b.box(0, 46, -74, 18, 16, 12, shade(c, 0.8));
  b.sphere(-14, 74, -52, 8, shade(c, 0.9), 2, 5);
  b.sphere(14, 74, -52, 8, shade(c, 0.9), 2, 5);
  b.setBone(BONE.LEG_L);
  b.box(-17, 0, -28, 16, 42, 16, shade(c, 0.9));
  b.box(-17, 0, 28, 16, 42, 16, shade(c, 0.9));
  b.setBone(BONE.LEG_R);
  b.box(17, 0, -28, 16, 42, 16, shade(c, 0.9));
  b.box(17, 0, 28, 16, 42, 16, shade(c, 0.9));
  b.setBone(BONE.ROOT);
}

function buildUnicorn(b: MeshBuilder, look: ActorLook): void {
  const c = look.colour;
  b.setBone(BONE.TORSO);
  b.box(0, 54, 0, 36, 42, 90, c, shade(c, 1.06));
  b.setBone(BONE.HEAD);
  b.box(0, 78, -54, 22, 24, 40, c);
  b.box(0, 72, -76, 16, 16, 14, shade(c, 0.92));
  b.cylinder(0, 100, -62, 5, 0, 32, 5, 0xe8d060);
  b.box(0, 92, -34, 8, 20, 40, 0xd8c0e0);
  b.setBone(BONE.LEG_L);
  b.box(-13, 0, -30, 11, 56, 11, shade(c, 0.92));
  b.box(-13, 0, 30, 11, 56, 11, shade(c, 0.92));
  b.setBone(BONE.LEG_R);
  b.box(13, 0, -30, 11, 56, 11, shade(c, 0.92));
  b.box(13, 0, 30, 11, 56, 11, shade(c, 0.92));
  b.setBone(BONE.TAIL);
  b.box(0, 72, 50, 10, 12, 40, 0xd8c0e0);
  b.setBone(BONE.ROOT);
}

function buildFishSpot(b: MeshBuilder): void {
  b.setBone(BONE.TORSO);
  for (let i = 0; i < 3; i++) {
    const r = 22 + i * 16;
    b.cylinder(0, 2 + i, 0, r, r, 2, 12, 0x9fd8f0, false);
  }
  b.setBone(BONE.ROOT);
}

export function clearActorCache(): void {
  cache.clear();
}
