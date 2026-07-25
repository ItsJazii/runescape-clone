import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import '../shared/data/all.ts';
import { isStackable } from '../shared/data/items.ts';
import { Container } from '../server/container.ts';

/** Coins stack; a chisel and a hammer do not. */
const COINS = 995;
const CHISEL = 1755;
const HAMMER = 2347;
const UNKNOWN = 999999;

describe('item stacking rules', () => {
  it('agrees with the item definitions used by the tests', () => {
    assert.ok(isStackable(COINS));
    assert.ok(!isStackable(CHISEL));
    assert.ok(!isStackable(HAMMER));
  });
});

describe('Container.add', () => {
  it('merges stackable items into a single slot', () => {
    const inv = new Container(28);
    assert.equal(inv.add(COINS, 100), 100);
    assert.equal(inv.add(COINS, 50), 50);
    assert.equal(inv.count(COINS), 150);
    assert.equal(inv.freeSlots(), 27);
  });

  it('gives every non-stackable item its own slot', () => {
    const inv = new Container(28);
    assert.equal(inv.add(CHISEL, 5), 5);
    assert.equal(inv.count(CHISEL), 5);
    assert.equal(inv.freeSlots(), 23);
  });

  it('fills only the slots it has and reports the shortfall', () => {
    const inv = new Container(3);
    assert.equal(inv.add(CHISEL, 5), 3);
    assert.equal(inv.count(CHISEL), 3);
    assert.equal(inv.freeSlots(), 0);
  });

  it('refuses a stackable item when the container is completely full', () => {
    const inv = new Container(2);
    inv.add(CHISEL, 2);
    assert.equal(inv.add(COINS, 100), 0);
    assert.equal(inv.count(COINS), 0);
  });

  it('still tops up an existing stack in a full container', () => {
    const inv = new Container(2);
    inv.add(COINS, 10);
    inv.add(CHISEL, 1);
    assert.equal(inv.freeSlots(), 0);
    assert.equal(inv.add(COINS, 90), 90);
    assert.equal(inv.count(COINS), 100);
  });

  it('rejects unknown items and non-positive amounts', () => {
    const inv = new Container(28);
    assert.equal(inv.add(UNKNOWN, 1), 0);
    assert.equal(inv.add(COINS, 0), 0);
    assert.equal(inv.add(COINS, -5), 0);
    assert.ok(inv.isEmpty());
  });

  it('stacks everything when the container always stacks, like the bank', () => {
    const bank = new Container(10, true);
    assert.equal(bank.add(CHISEL, 4), 4);
    assert.equal(bank.count(CHISEL), 4);
    assert.equal(bank.freeSlots(), 9);
  });
});

describe('Container.roomFor', () => {
  it('reports the free slot count for non-stackables', () => {
    const inv = new Container(4);
    inv.add(CHISEL, 1);
    assert.equal(inv.roomFor(HAMMER, 10), 3);
    assert.equal(inv.roomFor(HAMMER, 2), 2);
  });

  it('reports the full amount for a stackable with an existing stack', () => {
    const inv = new Container(2);
    inv.add(COINS, 1);
    inv.add(CHISEL, 1);
    assert.equal(inv.roomFor(COINS, 1_000_000), 1_000_000);
    assert.equal(inv.roomFor(HAMMER, 1), 0);
  });
});

describe('Container.remove', () => {
  it('takes from a stack and clears the slot when it empties', () => {
    const inv = new Container(28);
    inv.add(COINS, 100);
    assert.equal(inv.remove(COINS, 40), 40);
    assert.equal(inv.count(COINS), 60);
    assert.equal(inv.remove(COINS, 60), 60);
    assert.equal(inv.count(COINS), 0);
    assert.ok(inv.isEmpty());
  });

  it('spans several slots for non-stackables', () => {
    const inv = new Container(28);
    inv.add(CHISEL, 5);
    assert.equal(inv.remove(CHISEL, 3), 3);
    assert.equal(inv.count(CHISEL), 2);
    assert.equal(inv.freeSlots(), 26);
  });

  it('removes what it can and reports the true total', () => {
    const inv = new Container(28);
    inv.add(COINS, 30);
    assert.equal(inv.remove(COINS, 100), 30);
    assert.equal(inv.count(COINS), 0);
  });

  it('leaves the container untouched when the item is absent', () => {
    const inv = new Container(28);
    inv.add(COINS, 30);
    assert.equal(inv.remove(HAMMER, 1), 0);
    assert.equal(inv.count(COINS), 30);
  });
});

describe('Container.removeSlot', () => {
  it('takes only from the requested slot', () => {
    const inv = new Container(28);
    inv.add(CHISEL, 2);
    assert.equal(inv.removeSlot(0), 1);
    assert.equal(inv.get(0), null);
    assert.equal(inv.count(CHISEL), 1);
  });

  it('caps the amount at what the slot holds', () => {
    const inv = new Container(28);
    inv.add(COINS, 10);
    assert.equal(inv.removeSlot(0, 99), 10);
    assert.ok(inv.isEmpty());
  });

  it('ignores empty and out-of-range slots', () => {
    const inv = new Container(4);
    assert.equal(inv.removeSlot(0), 0);
    assert.equal(inv.removeSlot(-1), 0);
    assert.equal(inv.removeSlot(99), 0);
  });
});

describe('Container slot movement', () => {
  it('swaps two slots', () => {
    const inv = new Container(28);
    inv.add(COINS, 5);
    inv.add(CHISEL, 1);
    inv.swap(0, 1);
    assert.deepEqual(inv.get(0), { id: CHISEL, amount: 1 });
    assert.deepEqual(inv.get(1), { id: COINS, amount: 5 });
  });

  it('shifts the items in between when inserting forwards', () => {
    const inv = new Container(4);
    inv.add(CHISEL, 1);
    inv.add(HAMMER, 1);
    inv.add(COINS, 7);
    inv.insert(0, 2);
    assert.equal(inv.get(0)?.id, HAMMER);
    assert.equal(inv.get(1)?.id, COINS);
    assert.equal(inv.get(2)?.id, CHISEL);
  });

  it('shifts the items in between when inserting backwards', () => {
    const inv = new Container(4);
    inv.add(CHISEL, 1);
    inv.add(HAMMER, 1);
    inv.add(COINS, 7);
    inv.insert(2, 0);
    assert.equal(inv.get(0)?.id, COINS);
    assert.equal(inv.get(1)?.id, CHISEL);
    assert.equal(inv.get(2)?.id, HAMMER);
  });

  it('ignores no-op and out-of-range moves', () => {
    const inv = new Container(4);
    inv.add(CHISEL, 1);
    inv.insert(0, 0);
    inv.insert(0, 99);
    inv.insert(-1, 0);
    assert.equal(inv.get(0)?.id, CHISEL);
  });
});

describe('Container.compact', () => {
  it('closes the gaps while preserving order', () => {
    const inv = new Container(6);
    inv.setSlot(0, CHISEL, 1);
    inv.setSlot(3, HAMMER, 1);
    inv.setSlot(5, COINS, 9);
    inv.compact();
    assert.equal(inv.get(0)?.id, CHISEL);
    assert.equal(inv.get(1)?.id, HAMMER);
    assert.deepEqual(inv.get(2), { id: COINS, amount: 9 });
    assert.equal(inv.get(3), null);
  });
});

describe('Container serialisation', () => {
  it('round-trips through toArrays and load', () => {
    const inv = new Container(28);
    inv.add(COINS, 1234);
    inv.add(CHISEL, 2);
    const saved = inv.toArrays();

    const restored = new Container(28);
    restored.load(saved.items, saved.amounts);
    assert.deepEqual(restored.toArrays(), saved);
    assert.equal(restored.count(COINS), 1234);
    assert.equal(restored.count(CHISEL), 2);
  });

  it('clears anything already held when loading', () => {
    const inv = new Container(28);
    inv.add(HAMMER, 3);
    inv.load([COINS], [10]);
    assert.equal(inv.count(HAMMER), 0);
    assert.equal(inv.count(COINS), 10);
  });

  it('enumerates only the occupied slots', () => {
    const inv = new Container(6);
    inv.setSlot(1, CHISEL, 1);
    inv.setSlot(4, COINS, 5);
    assert.deepEqual(
      [...inv.entries()].map(([slot, item]) => [slot, item.id, item.amount]),
      [
        [1, CHISEL, 1],
        [4, COINS, 5],
      ],
    );
  });
});
