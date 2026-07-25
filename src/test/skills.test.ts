import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_LEVEL, MAX_XP } from '../shared/constants.ts';
import {
  SKILL_COUNT,
  SKILL_NAMES,
  Skill,
  clampXp,
  combatLevel,
  combatLevelFromArray,
  levelForXp,
  startingXp,
  xpForLevel,
} from '../shared/skills.ts';

/** The canonical Old School RuneScape experience table. */
const KNOWN_XP: [number, number][] = [
  [1, 0],
  [2, 83],
  [3, 174],
  [4, 276],
  [5, 388],
  [10, 1154],
  [20, 4470],
  [30, 13363],
  [40, 37224],
  [50, 101333],
  [60, 273742],
  [70, 737627],
  [80, 1986068],
  [90, 5346332],
  [92, 6517253],
  [98, 11805606],
  [99, 13034431],
];

describe('skill metadata', () => {
  it('names every skill exactly once', () => {
    assert.equal(SKILL_NAMES.length, SKILL_COUNT);
    assert.equal(new Set(SKILL_NAMES).size, SKILL_COUNT);
  });

  it('orders the stats tab so Hitpoints follows Attack', () => {
    assert.equal(SKILL_NAMES[Skill.ATTACK], 'Attack');
    assert.equal(SKILL_NAMES[Skill.HITPOINTS], 'Hitpoints');
    assert.equal(SKILL_NAMES[Skill.HUNTER], 'Hunter');
  });

  it('starts Hitpoints at level 10 and everything else at 1', () => {
    assert.equal(levelForXp(startingXp(Skill.HITPOINTS)), 10);
    assert.equal(levelForXp(startingXp(Skill.ATTACK)), 1);
    assert.equal(levelForXp(startingXp(Skill.MAGIC)), 1);
  });
});

describe('xpForLevel', () => {
  it('matches the canonical table', () => {
    for (const [level, xp] of KNOWN_XP) {
      assert.equal(xpForLevel(level), xp, `level ${level}`);
    }
  });

  it('increases monotonically', () => {
    for (let level = 2; level <= MAX_LEVEL; level++) {
      assert.ok(xpForLevel(level) > xpForLevel(level - 1), `level ${level} must cost more than ${level - 1}`);
    }
  });

  it('clamps out-of-range levels', () => {
    assert.equal(xpForLevel(0), 0);
    assert.equal(xpForLevel(-5), 0);
    assert.equal(xpForLevel(MAX_LEVEL + 10), xpForLevel(MAX_LEVEL));
  });
});

describe('levelForXp', () => {
  it('inverts xpForLevel at every boundary', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      assert.equal(levelForXp(xpForLevel(level)), level, `level ${level}`);
    }
  });

  it('stays on the lower level one xp short of the threshold', () => {
    for (let level = 2; level <= MAX_LEVEL; level++) {
      assert.equal(levelForXp(xpForLevel(level) - 1), level - 1, `level ${level}`);
    }
  });

  it('never exceeds 99, even at the xp cap', () => {
    assert.equal(levelForXp(MAX_XP), MAX_LEVEL);
    assert.equal(levelForXp(Number.MAX_SAFE_INTEGER), MAX_LEVEL);
  });

  it('treats zero and negative xp as level 1', () => {
    assert.equal(levelForXp(0), 1);
    assert.equal(levelForXp(-1), 1);
  });
});

describe('clampXp', () => {
  it('holds xp within [0, MAX_XP]', () => {
    assert.equal(clampXp(-10), 0);
    assert.equal(clampXp(500), 500);
    assert.equal(clampXp(MAX_XP + 1), MAX_XP);
  });
});

describe('combatLevel', () => {
  const levels = (over: Partial<Parameters<typeof combatLevel>[0]> = {}) => ({
    attack: 1,
    strength: 1,
    defence: 1,
    hitpoints: 10,
    prayer: 1,
    ranged: 1,
    magic: 1,
    ...over,
  });

  it('rates a fresh account as combat level 3', () => {
    assert.equal(combatLevel(levels()), 3);
  });

  it('rates a maxed account as combat level 126', () => {
    assert.equal(
      combatLevel({ attack: 99, strength: 99, defence: 99, hitpoints: 99, prayer: 99, ranged: 99, magic: 99 }),
      126,
    );
  });

  it('takes the highest of the melee, ranged and magic contributions', () => {
    const melee = combatLevel(levels({ attack: 60, strength: 60 }));
    const ranged = combatLevel(levels({ ranged: 80 }));
    // 13/40 * 120 = 39 for melee versus 13/40 * 120 = 39 for ranged.
    assert.equal(melee, ranged);
    // Adding an unused style must not change the result.
    assert.equal(combatLevel(levels({ attack: 60, strength: 60, magic: 20 })), melee);
  });

  it('counts only half of the prayer level, rounded down', () => {
    const odd = combatLevel(levels({ prayer: 43 }));
    const even = combatLevel(levels({ prayer: 42 }));
    assert.equal(odd, even);
  });

  it('never decreases when a level goes up', () => {
    let previous = combatLevel(levels());
    for (let level = 2; level <= MAX_LEVEL; level++) {
      const next = combatLevel(levels({ attack: level, strength: level }));
      assert.ok(next >= previous, `combat level dropped at ${level}`);
      previous = next;
    }
  });

  it('reads the same values out of a skill array', () => {
    const array = new Array(SKILL_COUNT).fill(1);
    array[Skill.HITPOINTS] = 10;
    assert.equal(combatLevelFromArray(array), 3);

    const maxed = new Array(SKILL_COUNT).fill(99);
    assert.equal(combatLevelFromArray(maxed), 126);
  });
});
