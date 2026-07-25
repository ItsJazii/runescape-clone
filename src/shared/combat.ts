/**
 * Combat mathematics, ported faithfully from Old School RuneScape.
 * Every formula in here matches the values used by the live game.
 */

export const enum AttackType {
  STAB = 0,
  SLASH = 1,
  CRUSH = 2,
  MAGIC = 3,
  RANGED = 4,
}

export const enum AttackStyle {
  ACCURATE = 0,
  AGGRESSIVE = 1,
  CONTROLLED = 2,
  DEFENSIVE = 3,
  /** Ranged only */
  RAPID = 4,
  LONGRANGE = 5,
  /** Magic staves */
  MAGIC_AUTOCAST = 6,
  MAGIC_DEFENSIVE = 7,
}

export interface Bonuses {
  attackStab: number;
  attackSlash: number;
  attackCrush: number;
  attackMagic: number;
  attackRanged: number;
  defenceStab: number;
  defenceSlash: number;
  defenceCrush: number;
  defenceMagic: number;
  defenceRanged: number;
  meleeStrength: number;
  rangedStrength: number;
  magicDamage: number;
  prayerBonus: number;
}

export function emptyBonuses(): Bonuses {
  return {
    attackStab: 0,
    attackSlash: 0,
    attackCrush: 0,
    attackMagic: 0,
    attackRanged: 0,
    defenceStab: 0,
    defenceSlash: 0,
    defenceCrush: 0,
    defenceMagic: 0,
    defenceRanged: 0,
    meleeStrength: 0,
    rangedStrength: 0,
    magicDamage: 0,
    prayerBonus: 0,
  };
}

export function addBonuses(target: Bonuses, extra: Partial<Bonuses>): void {
  for (const key of Object.keys(target) as (keyof Bonuses)[]) {
    target[key] += extra[key] ?? 0;
  }
}

export function attackBonusFor(b: Bonuses, type: AttackType): number {
  switch (type) {
    case AttackType.STAB:
      return b.attackStab;
    case AttackType.SLASH:
      return b.attackSlash;
    case AttackType.CRUSH:
      return b.attackCrush;
    case AttackType.MAGIC:
      return b.attackMagic;
    case AttackType.RANGED:
      return b.attackRanged;
  }
}

export function defenceBonusFor(b: Bonuses, type: AttackType): number {
  switch (type) {
    case AttackType.STAB:
      return b.defenceStab;
    case AttackType.SLASH:
      return b.defenceSlash;
    case AttackType.CRUSH:
      return b.defenceCrush;
    case AttackType.MAGIC:
      return b.defenceMagic;
    case AttackType.RANGED:
      return b.defenceRanged;
  }
}

/** Invisible level boost granted by the selected combat style. */
export interface StyleBonus {
  attack: number;
  strength: number;
  defence: number;
  ranged: number;
  magic: number;
}

export function styleBonusFor(style: AttackStyle): StyleBonus {
  const zero: StyleBonus = { attack: 0, strength: 0, defence: 0, ranged: 0, magic: 0 };
  switch (style) {
    case AttackStyle.ACCURATE:
      return { ...zero, attack: 3, ranged: 3 };
    case AttackStyle.AGGRESSIVE:
      return { ...zero, strength: 3 };
    case AttackStyle.CONTROLLED:
      return { ...zero, attack: 1, strength: 1, defence: 1 };
    case AttackStyle.DEFENSIVE:
      return { ...zero, defence: 3 };
    case AttackStyle.RAPID:
      return zero;
    case AttackStyle.LONGRANGE:
      return { ...zero, defence: 3 };
    case AttackStyle.MAGIC_AUTOCAST:
      return zero;
    case AttackStyle.MAGIC_DEFENSIVE:
      return { ...zero, defence: 3 };
  }
}

/**
 * Effective level used in the attack/defence/strength rolls.
 *   effective = floor(level * prayerMultiplier) + styleBonus + 8
 */
export function effectiveLevel(level: number, prayerMultiplier: number, styleBonus: number, plusEight = true): number {
  return Math.floor(level * prayerMultiplier) + styleBonus + (plusEight ? 8 : 0);
}

/** attackRoll = effectiveLevel * (equipmentBonus + 64) */
export function maxRoll(effective: number, equipmentBonus: number): number {
  return effective * (equipmentBonus + 64);
}

/**
 * Chance for an attack roll to beat a defence roll.
 *   if att > def : 1 - (def + 2) / (2 * (att + 1))
 *   else         : att / (2 * (def + 1))
 */
export function hitChance(attackRoll: number, defenceRoll: number): number {
  if (attackRoll > defenceRoll) {
    return 1 - (defenceRoll + 2) / (2 * (attackRoll + 1));
  }
  return attackRoll / (2 * (defenceRoll + 1));
}

/**
 * Melee/ranged max hit.
 *   maxHit = floor(0.5 + effectiveStrength * (strengthBonus + 64) / 640)
 */
export function maxHit(effectiveStrength: number, strengthBonus: number): number {
  return Math.floor(0.5 + (effectiveStrength * (strengthBonus + 64)) / 640);
}

/** RuneScape rolls a uniform integer in [0, max] - a zero is a "splash"/block. */
export function rollDamage(max: number, rng: () => number = Math.random): number {
  return Math.floor(rng() * (max + 1));
}

/* ------------------------------------------------------------------ */
/* Weapon categories and their style tables                            */
/* ------------------------------------------------------------------ */

export const enum WeaponType {
  UNARMED = 'unarmed',
  SWORD = 'sword',
  SCIMITAR = 'scimitar',
  DAGGER = 'dagger',
  LONGSWORD = 'longsword',
  TWO_HANDED = '2h',
  AXE = 'axe',
  MACE = 'mace',
  WARHAMMER = 'warhammer',
  PICKAXE = 'pickaxe',
  SPEAR = 'spear',
  BOW = 'bow',
  CROSSBOW = 'crossbow',
  STAFF = 'staff',
  WHIP = 'whip',
  THROWN = 'thrown',
  CLAWS = 'claws',
}

export interface StyleOption {
  name: string;
  style: AttackStyle;
  type: AttackType;
  /** Animation id hint for the client. */
  anim: string;
}

const MELEE_BLOCK = (type: AttackType): StyleOption => ({
  name: 'Block',
  style: AttackStyle.DEFENSIVE,
  type,
  anim: 'slash',
});

export const WEAPON_STYLES: Record<string, StyleOption[]> = {
  [WeaponType.UNARMED]: [
    { name: 'Punch', style: AttackStyle.ACCURATE, type: AttackType.CRUSH, anim: 'punch' },
    { name: 'Kick', style: AttackStyle.AGGRESSIVE, type: AttackType.CRUSH, anim: 'kick' },
    { name: 'Block', style: AttackStyle.DEFENSIVE, type: AttackType.CRUSH, anim: 'punch' },
  ],
  [WeaponType.SWORD]: [
    { name: 'Stab', style: AttackStyle.ACCURATE, type: AttackType.STAB, anim: 'stab' },
    { name: 'Lunge', style: AttackStyle.AGGRESSIVE, type: AttackType.STAB, anim: 'stab' },
    { name: 'Slash', style: AttackStyle.AGGRESSIVE, type: AttackType.SLASH, anim: 'slash' },
    MELEE_BLOCK(AttackType.STAB),
  ],
  [WeaponType.SCIMITAR]: [
    { name: 'Chop', style: AttackStyle.ACCURATE, type: AttackType.SLASH, anim: 'slash' },
    { name: 'Slash', style: AttackStyle.AGGRESSIVE, type: AttackType.SLASH, anim: 'slash' },
    { name: 'Lunge', style: AttackStyle.CONTROLLED, type: AttackType.STAB, anim: 'stab' },
    MELEE_BLOCK(AttackType.SLASH),
  ],
  [WeaponType.DAGGER]: [
    { name: 'Stab', style: AttackStyle.ACCURATE, type: AttackType.STAB, anim: 'stab' },
    { name: 'Lunge', style: AttackStyle.AGGRESSIVE, type: AttackType.STAB, anim: 'stab' },
    { name: 'Slash', style: AttackStyle.AGGRESSIVE, type: AttackType.SLASH, anim: 'slash' },
    MELEE_BLOCK(AttackType.STAB),
  ],
  [WeaponType.LONGSWORD]: [
    { name: 'Chop', style: AttackStyle.ACCURATE, type: AttackType.SLASH, anim: 'slash' },
    { name: 'Slash', style: AttackStyle.AGGRESSIVE, type: AttackType.SLASH, anim: 'slash' },
    { name: 'Lunge', style: AttackStyle.CONTROLLED, type: AttackType.STAB, anim: 'stab' },
    MELEE_BLOCK(AttackType.SLASH),
  ],
  [WeaponType.TWO_HANDED]: [
    { name: 'Chop', style: AttackStyle.ACCURATE, type: AttackType.SLASH, anim: 'slash' },
    { name: 'Slash', style: AttackStyle.AGGRESSIVE, type: AttackType.SLASH, anim: 'slash' },
    { name: 'Smash', style: AttackStyle.AGGRESSIVE, type: AttackType.CRUSH, anim: 'crush' },
    MELEE_BLOCK(AttackType.SLASH),
  ],
  [WeaponType.AXE]: [
    { name: 'Chop', style: AttackStyle.ACCURATE, type: AttackType.SLASH, anim: 'slash' },
    { name: 'Hack', style: AttackStyle.AGGRESSIVE, type: AttackType.SLASH, anim: 'slash' },
    { name: 'Smash', style: AttackStyle.AGGRESSIVE, type: AttackType.CRUSH, anim: 'crush' },
    MELEE_BLOCK(AttackType.SLASH),
  ],
  [WeaponType.MACE]: [
    { name: 'Pound', style: AttackStyle.ACCURATE, type: AttackType.CRUSH, anim: 'crush' },
    { name: 'Pummel', style: AttackStyle.AGGRESSIVE, type: AttackType.CRUSH, anim: 'crush' },
    { name: 'Spike', style: AttackStyle.CONTROLLED, type: AttackType.STAB, anim: 'stab' },
    MELEE_BLOCK(AttackType.CRUSH),
  ],
  [WeaponType.WARHAMMER]: [
    { name: 'Pound', style: AttackStyle.ACCURATE, type: AttackType.CRUSH, anim: 'crush' },
    { name: 'Pummel', style: AttackStyle.AGGRESSIVE, type: AttackType.CRUSH, anim: 'crush' },
    MELEE_BLOCK(AttackType.CRUSH),
  ],
  [WeaponType.PICKAXE]: [
    { name: 'Spike', style: AttackStyle.ACCURATE, type: AttackType.STAB, anim: 'stab' },
    { name: 'Impale', style: AttackStyle.AGGRESSIVE, type: AttackType.STAB, anim: 'stab' },
    { name: 'Smash', style: AttackStyle.AGGRESSIVE, type: AttackType.CRUSH, anim: 'crush' },
    MELEE_BLOCK(AttackType.STAB),
  ],
  [WeaponType.SPEAR]: [
    { name: 'Lunge', style: AttackStyle.CONTROLLED, type: AttackType.STAB, anim: 'stab' },
    { name: 'Swipe', style: AttackStyle.CONTROLLED, type: AttackType.SLASH, anim: 'slash' },
    { name: 'Pound', style: AttackStyle.CONTROLLED, type: AttackType.CRUSH, anim: 'crush' },
    MELEE_BLOCK(AttackType.STAB),
  ],
  [WeaponType.WHIP]: [
    { name: 'Flick', style: AttackStyle.ACCURATE, type: AttackType.SLASH, anim: 'whip' },
    { name: 'Lash', style: AttackStyle.CONTROLLED, type: AttackType.SLASH, anim: 'whip' },
    { name: 'Deflect', style: AttackStyle.DEFENSIVE, type: AttackType.SLASH, anim: 'whip' },
  ],
  [WeaponType.CLAWS]: [
    { name: 'Chop', style: AttackStyle.ACCURATE, type: AttackType.SLASH, anim: 'slash' },
    { name: 'Slash', style: AttackStyle.AGGRESSIVE, type: AttackType.SLASH, anim: 'slash' },
    { name: 'Lunge', style: AttackStyle.CONTROLLED, type: AttackType.STAB, anim: 'stab' },
    MELEE_BLOCK(AttackType.SLASH),
  ],
  [WeaponType.BOW]: [
    { name: 'Accurate', style: AttackStyle.ACCURATE, type: AttackType.RANGED, anim: 'bow' },
    { name: 'Rapid', style: AttackStyle.RAPID, type: AttackType.RANGED, anim: 'bow' },
    { name: 'Longrange', style: AttackStyle.LONGRANGE, type: AttackType.RANGED, anim: 'bow' },
  ],
  [WeaponType.CROSSBOW]: [
    { name: 'Accurate', style: AttackStyle.ACCURATE, type: AttackType.RANGED, anim: 'crossbow' },
    { name: 'Rapid', style: AttackStyle.RAPID, type: AttackType.RANGED, anim: 'crossbow' },
    { name: 'Longrange', style: AttackStyle.LONGRANGE, type: AttackType.RANGED, anim: 'crossbow' },
  ],
  [WeaponType.THROWN]: [
    { name: 'Accurate', style: AttackStyle.ACCURATE, type: AttackType.RANGED, anim: 'throw' },
    { name: 'Rapid', style: AttackStyle.RAPID, type: AttackType.RANGED, anim: 'throw' },
    { name: 'Longrange', style: AttackStyle.LONGRANGE, type: AttackType.RANGED, anim: 'throw' },
  ],
  [WeaponType.STAFF]: [
    { name: 'Bash', style: AttackStyle.ACCURATE, type: AttackType.CRUSH, anim: 'crush' },
    { name: 'Pound', style: AttackStyle.AGGRESSIVE, type: AttackType.CRUSH, anim: 'crush' },
    { name: 'Focus', style: AttackStyle.DEFENSIVE, type: AttackType.CRUSH, anim: 'crush' },
    { name: 'Spell', style: AttackStyle.MAGIC_AUTOCAST, type: AttackType.MAGIC, anim: 'cast' },
  ],
};

/** Ranged "Rapid" fires one tick faster. Longrange adds one tile of range. */
export function applyStyleToSpeed(baseSpeed: number, style: AttackStyle): number {
  if (style === AttackStyle.RAPID) return Math.max(1, baseSpeed - 1);
  return baseSpeed;
}

/* ------------------------------------------------------------------ */
/* Experience awards                                                   */
/* ------------------------------------------------------------------ */

/** Combat xp per point of damage dealt. */
export const XP_PER_DAMAGE = 4;
/** Hitpoints xp per point of damage dealt (4 / 3). */
export const HP_XP_PER_DAMAGE = 4 / 3;
/** Magic damage xp per point of damage. */
export const MAGIC_XP_PER_DAMAGE = 2;
