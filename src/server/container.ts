import { isStackable, itemDef } from '../shared/data/items.ts';

export interface Slot {
  id: number;
  amount: number;
}

/** An inventory / bank / equipment container with RuneScape stacking rules. */
export class Container {
  readonly ids: Int32Array;
  readonly amounts: Int32Array;
  readonly size: number;
  /** Banks stack everything regardless of the item's stackable flag. */
  readonly alwaysStack: boolean;

  constructor(size: number, alwaysStack = false) {
    this.size = size;
    this.alwaysStack = alwaysStack;
    this.ids = new Int32Array(size).fill(-1);
    this.amounts = new Int32Array(size);
  }

  private stacks(id: number): boolean {
    return this.alwaysStack || isStackable(id);
  }

  get(slot: number): Slot | null {
    if (slot < 0 || slot >= this.size || this.ids[slot] < 0) return null;
    return { id: this.ids[slot], amount: this.amounts[slot] };
  }

  isEmpty(): boolean {
    return this.ids.every((v) => v < 0);
  }

  freeSlots(): number {
    let n = 0;
    for (let i = 0; i < this.size; i++) if (this.ids[i] < 0) n++;
    return n;
  }

  firstFree(): number {
    for (let i = 0; i < this.size; i++) if (this.ids[i] < 0) return i;
    return -1;
  }

  slotOf(id: number): number {
    for (let i = 0; i < this.size; i++) if (this.ids[i] === id) return i;
    return -1;
  }

  count(id: number): number {
    let total = 0;
    for (let i = 0; i < this.size; i++) if (this.ids[i] === id) total += this.amounts[i];
    return total;
  }

  has(id: number, amount = 1): boolean {
    return this.count(id) >= amount;
  }

  /** How many of `id` could be added right now. */
  roomFor(id: number, amount: number): number {
    if (this.stacks(id)) {
      const slot = this.slotOf(id);
      if (slot >= 0) return amount;
      return this.firstFree() >= 0 ? amount : 0;
    }
    return Math.min(amount, this.freeSlots());
  }

  /** Adds items, returning the number actually added. */
  add(id: number, amount = 1): number {
    if (amount <= 0 || !itemDef(id)) return 0;
    if (this.stacks(id)) {
      let slot = this.slotOf(id);
      if (slot < 0) {
        slot = this.firstFree();
        if (slot < 0) return 0;
        this.ids[slot] = id;
        this.amounts[slot] = 0;
      }
      this.amounts[slot] += amount;
      return amount;
    }
    let added = 0;
    while (added < amount) {
      const slot = this.firstFree();
      if (slot < 0) break;
      this.ids[slot] = id;
      this.amounts[slot] = 1;
      added++;
    }
    return added;
  }

  /** Adds to a specific slot when it is free (used for drag-and-drop). */
  setSlot(slot: number, id: number, amount: number): void {
    if (slot < 0 || slot >= this.size) return;
    if (id < 0 || amount <= 0) {
      this.ids[slot] = -1;
      this.amounts[slot] = 0;
    } else {
      this.ids[slot] = id;
      this.amounts[slot] = amount;
    }
  }

  /** Removes items, returning the number actually removed. */
  remove(id: number, amount = 1): number {
    let left = amount;
    for (let i = 0; i < this.size && left > 0; i++) {
      if (this.ids[i] !== id) continue;
      const take = Math.min(left, this.amounts[i]);
      this.amounts[i] -= take;
      left -= take;
      if (this.amounts[i] <= 0) {
        this.ids[i] = -1;
        this.amounts[i] = 0;
      }
    }
    return amount - left;
  }

  removeSlot(slot: number, amount = Number.MAX_SAFE_INTEGER): number {
    if (slot < 0 || slot >= this.size || this.ids[slot] < 0) return 0;
    const take = Math.min(amount, this.amounts[slot]);
    this.amounts[slot] -= take;
    if (this.amounts[slot] <= 0) {
      this.ids[slot] = -1;
      this.amounts[slot] = 0;
    }
    return take;
  }

  swap(a: number, b: number): void {
    if (a < 0 || b < 0 || a >= this.size || b >= this.size) return;
    const id = this.ids[a];
    const amount = this.amounts[a];
    this.ids[a] = this.ids[b];
    this.amounts[a] = this.amounts[b];
    this.ids[b] = id;
    this.amounts[b] = amount;
  }

  /** Moves an item to a new slot, shifting the items in between (RS drag). */
  insert(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= this.size || to >= this.size) return;
    const id = this.ids[from];
    const amount = this.amounts[from];
    if (from < to) {
      for (let i = from; i < to; i++) {
        this.ids[i] = this.ids[i + 1];
        this.amounts[i] = this.amounts[i + 1];
      }
    } else {
      for (let i = from; i > to; i--) {
        this.ids[i] = this.ids[i - 1];
        this.amounts[i] = this.amounts[i - 1];
      }
    }
    this.ids[to] = id;
    this.amounts[to] = amount;
  }

  clear(): void {
    this.ids.fill(-1);
    this.amounts.fill(0);
  }

  /** Compacts the container so there are no gaps (used by the bank). */
  compact(): void {
    const kept: Slot[] = [];
    for (let i = 0; i < this.size; i++) if (this.ids[i] >= 0) kept.push({ id: this.ids[i], amount: this.amounts[i] });
    this.clear();
    kept.forEach((slot, i) => {
      this.ids[i] = slot.id;
      this.amounts[i] = slot.amount;
    });
  }

  toArrays(): { items: number[]; amounts: number[] } {
    return { items: Array.from(this.ids), amounts: Array.from(this.amounts) };
  }

  load(items: number[], amounts: number[]): void {
    this.clear();
    for (let i = 0; i < Math.min(this.size, items.length); i++) {
      this.ids[i] = items[i] ?? -1;
      this.amounts[i] = amounts[i] ?? 0;
    }
  }

  *entries(): Generator<[number, Slot]> {
    for (let i = 0; i < this.size; i++) {
      if (this.ids[i] >= 0) yield [i, { id: this.ids[i], amount: this.amounts[i] }];
    }
  }
}
