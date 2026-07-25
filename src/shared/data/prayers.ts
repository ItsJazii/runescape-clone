/** The standard prayer book, with live OSRS levels, drain rates and multipliers. */

export interface PrayerDef {
  id: number;
  name: string;
  level: number;
  /** Drain effect points; ticks-per-point = floor((60 + 2*prayerBonus) / totalDrain). */
  drain: number;
  description: string;
  attack?: number;
  strength?: number;
  defence?: number;
  ranged?: number;
  rangedStrength?: number;
  magic?: number;
  /** Overhead icon shown above the player's head. */
  overhead?: 'melee' | 'missiles' | 'magic' | 'retribution' | 'redemption' | 'smite';
  /** Prayers in the same group turn each other off. */
  group?: string;
}

export const PRAYERS: PrayerDef[] = [
  { id: 0, name: 'Thick Skin', level: 1, drain: 3, description: 'Increases your Defence by 5%.', defence: 0.05, group: 'defence' },
  { id: 1, name: 'Burst of Strength', level: 4, drain: 3, description: 'Increases your Strength by 5%.', strength: 0.05, group: 'strength' },
  { id: 2, name: 'Clarity of Thought', level: 7, drain: 3, description: 'Increases your Attack by 5%.', attack: 0.05, group: 'attack' },
  { id: 3, name: 'Sharp Eye', level: 8, drain: 3, description: 'Increases your Ranged by 5%.', ranged: 0.05, rangedStrength: 0.05, group: 'ranged' },
  { id: 4, name: 'Mystic Will', level: 9, drain: 3, description: 'Increases your Magic by 5%.', magic: 0.05, group: 'magic' },
  { id: 5, name: 'Rock Skin', level: 10, drain: 6, description: 'Increases your Defence by 10%.', defence: 0.1, group: 'defence' },
  { id: 6, name: 'Superhuman Strength', level: 13, drain: 6, description: 'Increases your Strength by 10%.', strength: 0.1, group: 'strength' },
  { id: 7, name: 'Improved Reflexes', level: 16, drain: 6, description: 'Increases your Attack by 10%.', attack: 0.1, group: 'attack' },
  { id: 8, name: 'Rapid Restore', level: 19, drain: 1, description: 'Restores your stats twice as fast.' },
  { id: 9, name: 'Rapid Heal', level: 22, drain: 2, description: 'Restores your hitpoints twice as fast.' },
  { id: 10, name: 'Protect Item', level: 25, drain: 2, description: 'Keep 1 extra item if you die.' },
  { id: 11, name: 'Hawk Eye', level: 26, drain: 6, description: 'Increases your Ranged by 10%.', ranged: 0.1, rangedStrength: 0.1, group: 'ranged' },
  { id: 12, name: 'Mystic Lore', level: 27, drain: 6, description: 'Increases your Magic by 10%.', magic: 0.1, group: 'magic' },
  { id: 13, name: 'Steel Skin', level: 28, drain: 12, description: 'Increases your Defence by 15%.', defence: 0.15, group: 'defence' },
  { id: 14, name: 'Ultimate Strength', level: 31, drain: 12, description: 'Increases your Strength by 15%.', strength: 0.15, group: 'strength' },
  { id: 15, name: 'Incredible Reflexes', level: 34, drain: 12, description: 'Increases your Attack by 15%.', attack: 0.15, group: 'attack' },
  { id: 16, name: 'Protect from Magic', level: 37, drain: 12, description: 'Blocks incoming magic attacks.', overhead: 'magic', group: 'overhead' },
  { id: 17, name: 'Protect from Missiles', level: 40, drain: 12, description: 'Blocks incoming ranged attacks.', overhead: 'missiles', group: 'overhead' },
  { id: 18, name: 'Protect from Melee', level: 43, drain: 12, description: 'Blocks incoming melee attacks.', overhead: 'melee', group: 'overhead' },
  { id: 19, name: 'Eagle Eye', level: 44, drain: 12, description: 'Increases your Ranged by 15%.', ranged: 0.15, rangedStrength: 0.15, group: 'ranged' },
  { id: 20, name: 'Mystic Might', level: 45, drain: 12, description: 'Increases your Magic by 15%.', magic: 0.15, group: 'magic' },
  { id: 21, name: 'Retribution', level: 46, drain: 3, description: 'Deals damage around you when you die.', overhead: 'retribution', group: 'overhead' },
  { id: 22, name: 'Redemption', level: 49, drain: 6, description: 'Heals you when you drop below 10% hitpoints.', overhead: 'redemption', group: 'overhead' },
  { id: 23, name: 'Smite', level: 52, drain: 18, description: 'Drains the prayer of those you hit.', overhead: 'smite', group: 'overhead' },
  { id: 24, name: 'Preserve', level: 55, drain: 2, description: 'Boosted stats last 50% longer.' },
  {
    id: 25,
    name: 'Chivalry',
    level: 60,
    drain: 24,
    description: '+15% Defence, +18% Attack, +18% Strength.',
    attack: 0.15,
    strength: 0.18,
    defence: 0.2,
    group: 'overhead-melee',
  },
  {
    id: 26,
    name: 'Piety',
    level: 70,
    drain: 24,
    description: '+25% Defence, +20% Attack, +23% Strength.',
    attack: 0.2,
    strength: 0.23,
    defence: 0.25,
    group: 'overhead-melee',
  },
  {
    id: 27,
    name: 'Rigour',
    level: 74,
    drain: 24,
    description: '+20% Ranged attack, +23% Ranged strength, +25% Defence.',
    ranged: 0.2,
    rangedStrength: 0.23,
    defence: 0.25,
    group: 'overhead-melee',
  },
  {
    id: 28,
    name: 'Augury',
    level: 77,
    drain: 24,
    description: '+25% Magic, +25% Magic defence, +25% Defence.',
    magic: 0.25,
    defence: 0.25,
    group: 'overhead-melee',
  },
];

/** Prayers within these groups are mutually exclusive (matching OSRS). */
export const EXCLUSIVE_GROUPS: string[][] = [
  ['attack', 'overhead-melee'],
  ['strength', 'overhead-melee'],
  ['defence', 'overhead-melee'],
  ['ranged', 'overhead-melee'],
  ['magic', 'overhead-melee'],
  ['overhead'],
];

export function prayerById(id: number): PrayerDef | undefined {
  return PRAYERS[id];
}

/** Combined multipliers for the currently active prayers. */
export interface PrayerMultipliers {
  attack: number;
  strength: number;
  defence: number;
  ranged: number;
  rangedStrength: number;
  magic: number;
  overhead: PrayerDef['overhead'] | undefined;
  drain: number;
  rapidRestore: boolean;
  rapidHeal: boolean;
  protectItem: boolean;
  preserve: boolean;
}

export function computePrayerMultipliers(active: Set<number>): PrayerMultipliers {
  const m: PrayerMultipliers = {
    attack: 1,
    strength: 1,
    defence: 1,
    ranged: 1,
    rangedStrength: 1,
    magic: 1,
    overhead: undefined,
    drain: 0,
    rapidRestore: false,
    rapidHeal: false,
    protectItem: false,
    preserve: false,
  };
  for (const id of active) {
    const p = PRAYERS[id];
    if (!p) continue;
    m.attack += p.attack ?? 0;
    m.strength += p.strength ?? 0;
    m.defence += p.defence ?? 0;
    m.ranged += p.ranged ?? 0;
    m.rangedStrength += p.rangedStrength ?? 0;
    m.magic += p.magic ?? 0;
    m.drain += p.drain;
    if (p.overhead) m.overhead = p.overhead;
    if (p.name === 'Rapid Restore') m.rapidRestore = true;
    if (p.name === 'Rapid Heal') m.rapidHeal = true;
    if (p.name === 'Protect Item') m.protectItem = true;
    if (p.name === 'Preserve') m.preserve = true;
    if (p.name === 'Chivalry' || p.name === 'Piety') m.overhead = undefined;
  }
  return m;
}

/**
 * Ticks between each prayer point drained.
 *   resistance = 60 + 2 * prayerBonus
 *   ticks      = floor(resistance / drainEffect)  (0 => no drain)
 */
export function prayerDrainInterval(drainEffect: number, prayerBonus: number): number {
  if (drainEffect <= 0) return 0;
  const resistance = 60 + 2 * prayerBonus;
  return Math.max(1, Math.floor(resistance / drainEffect));
}
