import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AttackStyle,
  AttackType,
  addBonuses,
  attackBonusFor,
  defenceBonusFor,
  effectiveLevel,
  emptyBonuses,
  hitChance,
  maxHit,
  maxRoll,
  rollDamage,
  styleBonusFor,
} from '../shared/combat.ts';
import '../shared/data/all.ts';
import { applyDamage } from '../server/combat.ts';
import { Player } from '../server/player.ts';
import { World } from '../server/world.ts';

describe('bonuses', () => {
  it('starts at zero across the board', () => {
    const b = emptyBonuses();
    assert.deepEqual(Object.values(b).filter((v) => v !== 0), []);
  });

  it('accumulates a partial set without touching the rest', () => {
    const b = emptyBonuses();
    addBonuses(b, { attackSlash: 20, defenceStab: 15, prayerBonus: 2 });
    addBonuses(b, { attackSlash: 5 });
    assert.equal(b.attackSlash, 25);
    assert.equal(b.defenceStab, 15);
    assert.equal(b.prayerBonus, 2);
    assert.equal(b.attackCrush, 0);
    assert.equal(b.magicDamage, 0);
  });

  it('handles the negative bonuses that heavy armour carries', () => {
    const b = emptyBonuses();
    addBonuses(b, { attackMagic: -30 });
    addBonuses(b, { attackMagic: -10 });
    assert.equal(b.attackMagic, -40);
  });

  it('reads back the bonus matching each attack type', () => {
    const b = emptyBonuses();
    addBonuses(b, {
      attackStab: 1,
      attackSlash: 2,
      attackCrush: 3,
      attackMagic: 4,
      attackRanged: 5,
      defenceStab: 6,
      defenceSlash: 7,
      defenceCrush: 8,
      defenceMagic: 9,
      defenceRanged: 10,
    });
    assert.equal(attackBonusFor(b, AttackType.STAB), 1);
    assert.equal(attackBonusFor(b, AttackType.SLASH), 2);
    assert.equal(attackBonusFor(b, AttackType.CRUSH), 3);
    assert.equal(attackBonusFor(b, AttackType.MAGIC), 4);
    assert.equal(attackBonusFor(b, AttackType.RANGED), 5);
    assert.equal(defenceBonusFor(b, AttackType.STAB), 6);
    assert.equal(defenceBonusFor(b, AttackType.SLASH), 7);
    assert.equal(defenceBonusFor(b, AttackType.CRUSH), 8);
    assert.equal(defenceBonusFor(b, AttackType.MAGIC), 9);
    assert.equal(defenceBonusFor(b, AttackType.RANGED), 10);
  });
});

describe('styleBonusFor', () => {
  it('gives accurate +3 attack, aggressive +3 strength, defensive +3 defence', () => {
    assert.equal(styleBonusFor(AttackStyle.ACCURATE).attack, 3);
    assert.equal(styleBonusFor(AttackStyle.AGGRESSIVE).strength, 3);
    assert.equal(styleBonusFor(AttackStyle.DEFENSIVE).defence, 3);
  });

  it('spreads controlled evenly across attack, strength and defence', () => {
    const controlled = styleBonusFor(AttackStyle.CONTROLLED);
    assert.equal(controlled.attack, 1);
    assert.equal(controlled.strength, 1);
    assert.equal(controlled.defence, 1);
  });

  it('gives rapid no invisible boost but longrange +3 defence', () => {
    assert.deepEqual(styleBonusFor(AttackStyle.RAPID), {
      attack: 0,
      strength: 0,
      defence: 0,
      ranged: 0,
      magic: 0,
    });
    assert.equal(styleBonusFor(AttackStyle.LONGRANGE).defence, 3);
  });
});

describe('effectiveLevel', () => {
  it('adds the style bonus and the constant 8', () => {
    assert.equal(effectiveLevel(99, 1, 3), 110);
    assert.equal(effectiveLevel(1, 1, 0), 9);
  });

  it('applies the prayer multiplier before adding the bonus', () => {
    // Piety is a 1.2x attack boost: floor(99 * 1.2) = 118, + 3 style + 8.
    assert.equal(effectiveLevel(99, 1.2, 3), 129);
    // Flooring happens on the boosted level, so 118.8 truncates to 118 + 8.
    assert.equal(effectiveLevel(99, 1.2, 0), 126);
  });

  it('can omit the +8 for the rolls that do not use it', () => {
    assert.equal(effectiveLevel(99, 1, 3, false), 102);
  });
});

describe('maxRoll', () => {
  it('scales the effective level by the equipment bonus plus 64', () => {
    assert.equal(maxRoll(110, 0), 7040);
    assert.equal(maxRoll(110, 64), 14080);
  });
});

describe('hitChance', () => {
  it('is a probability for every matchup', () => {
    for (const attack of [1, 100, 5000, 20000]) {
      for (const defence of [1, 100, 5000, 20000]) {
        const chance = hitChance(attack, defence);
        assert.ok(chance >= 0 && chance <= 1, `${attack} vs ${defence} gave ${chance}`);
      }
    }
  });

  it('uses the winning-roll branch when the attack roll is higher', () => {
    // 1 - (def + 2) / (2 * (att + 1))
    assert.equal(hitChance(1000, 500), 1 - 502 / 2002);
  });

  it('uses the losing-roll branch when the defence roll wins', () => {
    // att / (2 * (def + 1))
    assert.equal(hitChance(500, 1000), 500 / 2002);
  });

  it('sits just under 50% for an even matchup', () => {
    const chance = hitChance(1000, 1000);
    assert.ok(chance > 0.49 && chance < 0.5, `even matchup gave ${chance}`);
  });

  it('improves as the attack roll grows and worsens as defence grows', () => {
    assert.ok(hitChance(2000, 1000) > hitChance(1500, 1000));
    assert.ok(hitChance(1000, 500) > hitChance(1000, 1500));
  });
});

describe('maxHit', () => {
  it('follows the strength formula', () => {
    // floor(0.5 + 110 * 64 / 640) = 11
    assert.equal(maxHit(110, 0), 11);
    // floor(0.5 + 118 * 146 / 640) = 27
    assert.equal(maxHit(118, 82), 27);
  });

  it('grows with both the effective level and the strength bonus', () => {
    assert.ok(maxHit(120, 80) > maxHit(110, 80));
    assert.ok(maxHit(110, 90) > maxHit(110, 80));
  });

  it('never goes negative for an unarmed level 1', () => {
    assert.ok(maxHit(9, 0) >= 1);
  });
});

describe('rollDamage', () => {
  it('rolls a uniform integer in [0, max]', () => {
    assert.equal(rollDamage(10, () => 0), 0);
    assert.equal(rollDamage(10, () => 0.5), 5);
    assert.equal(rollDamage(10, () => 0.999999), 10);
  });

  it('can never exceed the max hit', () => {
    for (const max of [0, 1, 5, 30]) {
      assert.equal(rollDamage(max, () => 0.9999999999), max);
      for (let i = 0; i < 200; i++) {
        const damage = rollDamage(max);
        assert.ok(damage >= 0 && damage <= max, `rolled ${damage} against max ${max}`);
      }
    }
  });

  it('can roll a zero, which the game shows as a block', () => {
    assert.equal(rollDamage(5, () => 0.01), 0);
  });
});

/** Runs the world's queued-hit pass, which is private to the tick loop. */
function drainHitQueue(world: World): void {
  (world as unknown as { processQueuedHits(): void }).processQueuedHits();
}

describe('flinching when hit', () => {
  const setup = () => {
    const world = new World();
    world.tick = 100;
    const target = new Player('Target');
    const attacker = new Player('Attacker');
    return { world, target, attacker };
  };

  it('plays the block animation on whoever took the hit', () => {
    const { world, target, attacker } = setup();
    applyDamage(world, attacker, target, 3);
    assert.equal(target.animation, 'block');
    assert.equal(target.animationTick, world.tick);
  });

  it('flinches even when the hit does no damage', () => {
    // A zero is still a hit landing, and the real client reacts to it.
    const { world, target, attacker } = setup();
    applyDamage(world, attacker, target, 0);
    assert.equal(target.animation, 'block');
    assert.equal(target.hitpoints, target.maxHitpoints);
  });

  it('does not interrupt the target\u2019s own attack on the same tick', () => {
    const { world, target, attacker } = setup();
    target.playAnimation('slash', world.tick);
    applyDamage(world, attacker, target, 3);
    assert.equal(target.animation, 'slash', 'the attack animation should win');
  });

  it('does flinch once the target\u2019s own animation is over', () => {
    const { world, target, attacker } = setup();
    target.playAnimation('slash', world.tick - 1);
    applyDamage(world, attacker, target, 3);
    assert.equal(target.animation, 'block');
  });

  it('leaves a teleport alone', () => {
    const { world, target, attacker } = setup();
    target.playAnimation('teleport', world.tick - 1);
    applyDamage(world, attacker, target, 3);
    assert.equal(target.animation, 'teleport');
  });

  it('plays death rather than a flinch on a killing blow', () => {
    const { world, target, attacker } = setup();
    applyDamage(world, attacker, target, target.hitpoints);
    assert.equal(target.hitpoints, 0);
    assert.equal(target.dead, true);
    assert.equal(target.animation, 'death');
  });

  it('reacts through the delayed hit queue used by bows and spells', () => {
    const { world, target, attacker } = setup();
    // Ranged and magic land their damage a few ticks after the animation.
    applyDamage(world, attacker, target, 4, 2);
    assert.equal(target.animation, 'idle', 'nothing should happen until the shot arrives');
    world.tick += 2;
    drainHitQueue(world);
    assert.equal(target.animation, 'block');
    assert.equal(target.hitpoints, target.maxHitpoints - 4);
  });
});
