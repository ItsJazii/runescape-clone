import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import '../shared/data/all.ts';
import { TASKS } from '../shared/data/tasks.ts';
import { Skill, levelForXp, xpForLevel } from '../shared/skills.ts';
import { Player, normaliseName, sameName } from '../server/player.ts';

describe('normaliseName', () => {
  it('lowercases and trims', () => {
    assert.equal(normaliseName('  Zezima  '), 'zezima');
  });

  it('treats underscores as spaces, like the real name format', () => {
    assert.equal(normaliseName('Bob_Smith'), 'bob smith');
    assert.equal(normaliseName('bob smith'), 'bob smith');
  });
});

describe('sameName', () => {
  it('matches regardless of case, padding or underscores', () => {
    assert.ok(sameName('Zezima', 'zezima'));
    assert.ok(sameName('Bob_Smith', 'bob smith'));
    assert.ok(sameName(' Bob Smith ', 'BOB_SMITH'));
  });

  it('does not match different names', () => {
    assert.ok(!sameName('Zezima', 'Zezimb'));
    assert.ok(!sameName('Bob', 'Bobby'));
  });
});

describe('new players', () => {
  it('starts at combat level 3 with 10 hitpoints', () => {
    const player = new Player('Tester');
    assert.equal(player.combatLevel, 3);
    assert.equal(player.hitpoints, 10);
    assert.equal(player.maxHitpoints, 10);
    assert.equal(player.baseLevel(Skill.HITPOINTS), 10);
    assert.equal(player.baseLevel(Skill.ATTACK), 1);
  });

  it('has a total level of 32 across the 23 skills', () => {
    // 22 skills at level 1 plus Hitpoints at 10.
    assert.equal(new Player('Tester').totalLevel, 32);
  });

  it('has empty friend and ignore lists', () => {
    const player = new Player('Tester');
    assert.deepEqual(player.friends, []);
    assert.deepEqual(player.ignores, []);
  });
});

describe('friend and ignore membership', () => {
  it('matches names case-insensitively', () => {
    const player = new Player('Tester');
    player.friends.push('Zezima');
    player.ignores.push('Bob_Smith');

    assert.ok(player.friendsWith('zezima'));
    assert.ok(player.friendsWith('ZEZIMA'));
    assert.ok(!player.friendsWith('Bob Smith'));

    assert.ok(player.ignoring('bob smith'));
    assert.ok(player.ignoring('BOB_SMITH'));
    assert.ok(!player.ignoring('Zezima'));
  });

  it('reports nothing for an empty list', () => {
    const player = new Player('Tester');
    assert.ok(!player.friendsWith('anyone'));
    assert.ok(!player.ignoring('anyone'));
  });
});

describe('xp and levelling', () => {
  it('levels up a skill once the threshold is crossed', () => {
    const player = new Player('Tester');
    player.addXp(Skill.ATTACK, xpForLevel(2));
    assert.equal(player.baseLevel(Skill.ATTACK), 2);
    assert.equal(player.levels[Skill.ATTACK], 2);
  });

  it('raises max hitpoints when Hitpoints levels', () => {
    const player = new Player('Tester');
    const before = player.maxHitpoints;
    player.addXp(Skill.HITPOINTS, xpForLevel(11) - player.xp[Skill.HITPOINTS]);
    assert.equal(player.baseLevel(Skill.HITPOINTS), 11);
    assert.equal(player.maxHitpoints, 11);
    assert.equal(player.hitpoints, before + 1);
  });

  it('ignores non-positive xp awards', () => {
    const player = new Player('Tester');
    player.addXp(Skill.MINING, 0);
    player.addXp(Skill.MINING, -100);
    assert.equal(player.xp[Skill.MINING], 0);
  });

  it('caps experience at the 200m limit', () => {
    const player = new Player('Tester');
    player.addXp(Skill.MINING, 500_000_000);
    assert.equal(player.xp[Skill.MINING], 200_000_000);
    assert.equal(player.baseLevel(Skill.MINING), 99);
  });
});

describe('player persistence', () => {
  it('round-trips friends, ignores, skills and position', () => {
    const player = new Player('Tester');
    player.x = 3222;
    player.y = 3218;
    player.plane = 1;
    player.friends.push('Zezima', 'Bob_Smith');
    player.ignores.push('Spammer');
    player.addXp(Skill.WOODCUTTING, xpForLevel(30));
    player.inventory.add(995, 1234);

    const restored = new Player('Tester');
    restored.deserialise(JSON.parse(JSON.stringify(player.serialise())));

    assert.deepEqual(restored.friends, ['Zezima', 'Bob_Smith']);
    assert.deepEqual(restored.ignores, ['Spammer']);
    assert.equal(restored.x, 3222);
    assert.equal(restored.y, 3218);
    assert.equal(restored.plane, 1);
    assert.equal(restored.baseLevel(Skill.WOODCUTTING), 30);
    assert.equal(restored.inventory.count(995), 1234);
    assert.ok(restored.friendsWith('bob smith'));
  });

  it('survives a save file with no friend or ignore data', () => {
    const player = new Player('Tester');
    player.deserialise({ x: 3200, y: 3200 });
    assert.deepEqual(player.friends, []);
    assert.deepEqual(player.ignores, []);
  });

  it('discards non-string entries from a corrupted list', () => {
    const player = new Player('Tester');
    player.deserialise({ friends: ['Zezima', 42, null, 'Bob'], ignores: [{}, 'Spammer'] });
    assert.deepEqual(player.friends, ['Zezima', 'Bob']);
    assert.deepEqual(player.ignores, ['Spammer']);
  });

  it('never restores more hitpoints than the level allows', () => {
    const player = new Player('Tester');
    player.deserialise({ hitpoints: 9999 });
    assert.equal(player.hitpoints, levelForXp(player.xp[Skill.HITPOINTS]));
  });

  it('round-trips the Getting Started tasks', () => {
    const player = new Player('Tester');
    player.completeTask('chop');
    player.completeTask('kill');

    const restored = new Player('Tester');
    restored.deserialise(JSON.parse(JSON.stringify(player.serialise())));
    assert.deepEqual([...restored.tasks].sort(), ['chop', 'kill']);
  });
});

describe('getting started tasks', () => {
  it('has a unique id and a hint for every task', () => {
    const ids = new Set(TASKS.map((t) => t.id));
    assert.equal(ids.size, TASKS.length);
    for (const task of TASKS) {
      assert.ok(task.name.length > 0, `${task.id} needs a name`);
      assert.ok(task.hint.length > 0, `${task.id} needs a hint`);
    }
  });

  it('marks a task done exactly once', () => {
    const player = new Player('Tester');
    const sent: string[] = [];
    player.send = (msg) => {
      if (msg.t === 'tasks') sent.push(msg.done.join(','));
    };
    player.completeTask('chop');
    player.completeTask('chop');
    assert.deepEqual([...player.tasks], ['chop']);
    assert.equal(sent.length, 1);
  });

  it('ignores unknown task ids', () => {
    const player = new Player('Tester');
    player.completeTask('not-a-task');
    assert.equal(player.tasks.size, 0);
  });

  it('ticks off skilling tasks when the matching xp is earned', () => {
    const cases: [Skill, string][] = [
      [Skill.WOODCUTTING, 'chop'],
      [Skill.FIREMAKING, 'fire'],
      [Skill.FISHING, 'fish'],
      [Skill.COOKING, 'cook'],
      [Skill.MINING, 'mine'],
      [Skill.SMITHING, 'smith'],
      [Skill.MAGIC, 'spell'],
    ];
    for (const [skill, id] of cases) {
      const player = new Player('Tester');
      player.addXp(skill, 10);
      assert.ok(player.tasks.has(id), `${id} should be ticked by skill ${skill} xp`);
    }
  });

  it('does not tick a task for an unrelated skill', () => {
    const player = new Player('Tester');
    player.addXp(Skill.AGILITY, 10);
    assert.equal(player.tasks.size, 0);
  });
});
