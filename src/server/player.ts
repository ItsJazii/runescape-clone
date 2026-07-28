import {
  AttackStyle,
  AttackType,
  WEAPON_STYLES,
  WeaponType,
  addBonuses,
  emptyBonuses,
  type Bonuses,
  type StyleOption,
} from '../shared/combat.ts';
import { INVENTORY_SIZE, BANK_SIZE, MAX_RUN_ENERGY } from '../shared/constants.ts';
import { EQUIP_SLOT_COUNT, EquipSlot, itemDef, type ItemDef } from '../shared/data/items.ts';
import { computePrayerMultipliers, PRAYERS, type PrayerMultipliers } from '../shared/data/prayers.ts';
import { TASKS, taskById } from '../shared/data/tasks.ts';
import type { ServerMessage } from '../shared/net.ts';
import { SKILL_COUNT, Skill, clampXp, combatLevelFromArray, levelForXp, startingXp, xpForLevel, SKILL_NAMES } from '../shared/skills.ts';
import { Container } from './container.ts';
import { Entity } from './entity.ts';

export interface PlayerAction {
  name: string;
  /**
   * Runs each tick while the action is active. Return false to stop.
   * `worldTick` is the current tick, which repeating actions need in order to
   * stamp `playAnimation` - an animation whose start tick never changes is
   * treated as long finished by the client and never plays.
   */
  tick(player: Player, worldTick: number): boolean;
  onStop?(player: Player): void;
}

export interface PendingInteraction {
  /** Target footprint. */
  x: number;
  y: number;
  sizeX: number;
  sizeY: number;
  /** Maximum distance (in tiles) at which the interaction fires. */
  range: number;
  /** Called once when in range. */
  exec: () => void;
  /** Called each tick before the range check; return false to cancel. */
  valid?: () => boolean;
  /** Face the target when arriving. */
  face?: boolean;
  ticks?: number;
}

export interface DialogueState {
  script: string;
  stage: number;
  npcIndex?: number;
  data?: Record<string, unknown>;
}

export class Player extends Entity {
  readonly username: string;
  readonly outgoing: ServerMessage[] = [];

  xp: Float64Array = new Float64Array(SKILL_COUNT);
  levels: Int32Array = new Int32Array(SKILL_COUNT);

  inventory = new Container(INVENTORY_SIZE);
  equipment = new Container(EQUIP_SLOT_COUNT);
  bank = new Container(BANK_SIZE, true);

  bonuses: Bonuses = emptyBonuses();
  weight = 0;

  runEnergy = 10000;
  runEnabled = true;
  specialEnergy = 1000;

  prayerPoints = 1;
  activePrayers = new Set<number>();
  prayerMultipliers: PrayerMultipliers = computePrayerMultipliers(new Set());
  prayerDrainCounter = 0;

  styleIndex = 0;
  autoRetaliate = true;
  autocastSpell: number | null = null;

  action: PlayerAction | null = null;
  pending: PendingInteraction | null = null;

  /** Ticks the player must wait before their next manual action. */
  actionDelay = 0;

  chatMessage: string | null = null;
  chatTicks = 0;

  /** Friend and ignore lists, holding display-cased names. */
  friends: string[] = [];
  ignores: string[] = [];

  /** Currently open interface, if any. */
  openInterface: string | null = null;
  currentShop: string | null = null;
  bankNoted = false;
  dialogue: DialogueState | null = null;
  /** Pending "how many?" prompt. */
  makeCallback: ((amount: number, option: number) => void) | null = null;

  /** Appearance: [gender, hair, beard, torso, arms, legs, hairColour, torsoColour, legsColour, skinColour]. */
  look: number[] = [0, 0, 0, 0, 0, 0, 6, 20, 30, 4];

  /** Quest progress, keyed by quest id. 0 = not started. */
  quests: Record<string, number> = {};

  /** Completed "Getting Started" task ids. */
  tasks = new Set<string>();

  hpRegenCounter = 0;
  statRestoreCounter = 0;
  /** Tracks damage dealt for kill credit. */
  skullTicks = 0;

  loggedIn = true;
  /** Ticks until the client is forcibly disconnected. */
  logoutRequested = false;

  constructor(username: string) {
    super();
    this.username = username;
    for (let i = 0; i < SKILL_COUNT; i++) {
      this.xp[i] = startingXp(i as Skill);
      this.levels[i] = levelForXp(this.xp[i]);
    }
    this.hitpoints = this.levels[Skill.HITPOINTS];
    this.maxHitpoints = this.levels[Skill.HITPOINTS];
    this.prayerPoints = this.levels[Skill.PRAYER];
    this.recalculateBonuses();
  }

  override get name(): string {
    return this.username;
  }

  /* ---------------------------------------------------------------- */
  /* Networking helpers                                                */
  /* ---------------------------------------------------------------- */

  send(msg: ServerMessage): void {
    this.outgoing.push(msg);
  }

  message(text: string, kind: 'game' | 'chat' | 'trade' | 'system' | 'private' = 'game'): void {
    this.send({ t: 'msg', text, kind });
  }

  sendStats(): void {
    this.send({
      t: 'stats',
      xp: Array.from(this.xp),
      levels: Array.from(this.levels),
      combat: this.combatLevel,
      totalLevel: this.totalLevel,
      totalXp: this.totalXp,
    });
  }

  sendInventory(): void {
    const { items, amounts } = this.inventory.toArrays();
    this.send({ t: 'inv', items, amounts });
  }

  sendEquipment(): void {
    const { items, amounts } = this.equipment.toArrays();
    this.send({ t: 'equip', items, amounts, bonuses: this.bonuses, weight: Math.round(this.weight * 10) / 10 });
  }

  sendBank(): void {
    const { items, amounts } = this.bank.toArrays();
    this.send({ t: 'bank', items, amounts, noted: this.bankNoted });
  }

  sendPrayers(): void {
    this.send({ t: 'prayers', active: [...this.activePrayers] });
  }

  sendTasks(): void {
    this.send({ t: 'tasks', done: [...this.tasks] });
  }

  /**
   * Marks a "Getting Started" task as done the first time the player does it.
   * Nothing is gated on these; they exist so a new player has a next step.
   */
  completeTask(id: string): void {
    if (this.tasks.has(id)) return;
    const def = taskById(id);
    if (!def) return;
    this.tasks.add(id);
    this.sendTasks();
    const remaining = TASKS.length - this.tasks.size;
    this.message(`<Getting Started> ${def.name} - done!`, 'system');
    if (remaining === 0) this.message('You have finished every Getting Started task. Gielinor is yours.', 'system');
  }

  sendIgnores(): void {
    this.send({ t: 'ignores', list: [...this.ignores] });
  }

  /** True when `name` is on this player's ignore list. */
  ignoring(name: string): boolean {
    return this.ignores.some((n) => sameName(n, name));
  }

  /** True when `name` is on this player's friend list. */
  friendsWith(name: string): boolean {
    return this.friends.some((n) => sameName(n, name));
  }

  sendStyle(): void {
    this.send({ t: 'style', index: this.styleIndex, autoRetaliate: this.autoRetaliate, autocast: this.autocastSpell });
  }

  /* ---------------------------------------------------------------- */
  /* Skills                                                            */
  /* ---------------------------------------------------------------- */

  get combatLevel(): number {
    return combatLevelFromArray(Array.from(this.baseLevels()));
  }

  get totalLevel(): number {
    let total = 0;
    for (let i = 0; i < SKILL_COUNT; i++) total += levelForXp(this.xp[i]);
    return total;
  }

  get totalXp(): number {
    let total = 0;
    for (let i = 0; i < SKILL_COUNT; i++) total += this.xp[i];
    return Math.floor(total);
  }

  /** Levels derived from experience, ignoring boosts and drains. */
  baseLevels(): Int32Array {
    const out = new Int32Array(SKILL_COUNT);
    for (let i = 0; i < SKILL_COUNT; i++) out[i] = levelForXp(this.xp[i]);
    return out;
  }

  baseLevel(skill: Skill): number {
    return levelForXp(this.xp[skill]);
  }

  addXp(skill: Skill, amount: number): void {
    if (amount <= 0) return;
    const task = XP_TASKS[skill];
    if (task) this.completeTask(task);
    const before = levelForXp(this.xp[skill]);
    this.xp[skill] = clampXp(this.xp[skill] + amount);
    const after = levelForXp(this.xp[skill]);
    this.send({ t: 'xp', skill, amount });
    if (after > before) {
      const gained = after - this.levels[skill] > 0;
      this.levels[skill] += after - before;
      if (skill === Skill.HITPOINTS) {
        this.maxHitpoints = after;
        this.hitpoints += after - before;
      }
      if (skill === Skill.PRAYER) this.prayerPoints = Math.min(after, this.prayerPoints + (after - before));
      this.message(
        `Congratulations, you just advanced ${/^[AEIOU]/i.test(SKILL_NAMES[skill]) ? 'an' : 'a'} ${SKILL_NAMES[skill]} level.`,
      );
      this.send({ t: 'levelup', skill, level: after });
      void gained;
    }
    this.sendStats();
  }

  /** Applies a temporary boost or drain. */
  alterLevel(skill: Skill, delta: number): void {
    this.levels[skill] = Math.max(0, this.levels[skill] + delta);
    this.sendStats();
  }

  setLevel(skill: Skill, value: number): void {
    this.levels[skill] = Math.max(0, value);
    this.sendStats();
  }

  hasLevel(skill: Skill, required: number): boolean {
    return this.levels[skill] >= required;
  }

  /* ---------------------------------------------------------------- */
  /* Equipment                                                         */
  /* ---------------------------------------------------------------- */

  equippedIn(slot: EquipSlot): ItemDef | undefined {
    const id = this.equipment.ids[slot];
    return id >= 0 ? itemDef(id) : undefined;
  }

  get weapon(): ItemDef | undefined {
    return this.equippedIn(EquipSlot.WEAPON);
  }

  get weaponType(): WeaponType {
    return (this.weapon?.weapon?.type as WeaponType) ?? WeaponType.UNARMED;
  }

  get styles(): StyleOption[] {
    return WEAPON_STYLES[this.weaponType] ?? WEAPON_STYLES[WeaponType.UNARMED];
  }

  get style(): StyleOption {
    const list = this.styles;
    return list[Math.min(this.styleIndex, list.length - 1)];
  }

  get attackSpeed(): number {
    const base = this.weapon?.weapon?.speed ?? 4;
    return this.style.style === AttackStyle.RAPID ? Math.max(1, base - 1) : base;
  }

  get attackRange(): number {
    const w = this.weapon?.weapon;
    if (!w) return 1;
    if (w.range) return this.style.style === AttackStyle.LONGRANGE ? w.range + 2 : w.range;
    if (w.type === WeaponType.STAFF && this.style.type === AttackType.MAGIC) return 10;
    return 1;
  }

  recalculateBonuses(): void {
    const total = emptyBonuses();
    let weight = 0;
    for (let slot = 0; slot < EQUIP_SLOT_COUNT; slot++) {
      const id = this.equipment.ids[slot];
      if (id < 0) continue;
      const def = itemDef(id);
      if (!def) continue;
      if (def.bonuses) addBonuses(total, def.bonuses);
      weight += def.weight ?? 0;
    }
    for (const [, slot] of this.inventory.entries()) {
      const def = itemDef(slot.id);
      if (def && !def.stackable) weight += def.weight ?? 0;
    }
    this.bonuses = total;
    this.weight = Math.max(0, weight);
  }

  recalculatePrayers(): void {
    this.prayerMultipliers = computePrayerMultipliers(this.activePrayers);
  }

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  startAction(action: PlayerAction | null): void {
    if (this.action && this.action !== action) this.action.onStop?.(this);
    this.action = action;
  }

  stopAction(): void {
    if (this.action) {
      this.action.onStop?.(this);
      this.action = null;
    }
  }

  /** Cancels walking, actions and interactions - used when the player clicks elsewhere. */
  resetInteraction(keepPath = false): void {
    this.stopAction();
    this.pending = null;
    this.target = null;
    if (!keepPath) this.clearPath();
  }

  closeInterface(): void {
    if (this.openInterface || this.dialogue) {
      this.openInterface = null;
      this.currentShop = null;
      this.dialogue = null;
      this.makeCallback = null;
      this.send({ t: 'closeIface' });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Prayer & energy                                                   */
  /* ---------------------------------------------------------------- */

  togglePrayer(id: number): void {
    const def = PRAYERS[id];
    if (!def) return;
    if (this.activePrayers.has(id)) {
      this.activePrayers.delete(id);
      this.recalculatePrayers();
      this.sendPrayers();
      return;
    }
    if (this.baseLevel(Skill.PRAYER) < def.level) {
      this.message(`You need a Prayer level of ${def.level} to use ${def.name}.`);
      this.sendPrayers();
      return;
    }
    if (this.prayerPoints <= 0) {
      this.message('You have run out of prayer points.');
      this.sendPrayers();
      return;
    }
    // Turn off conflicting prayers.
    for (const active of [...this.activePrayers]) {
      const other = PRAYERS[active];
      if (!other) continue;
      if (other.group && def.group && conflicts(other.group, def.group)) this.activePrayers.delete(active);
    }
    this.activePrayers.add(id);
    this.recalculatePrayers();
    this.sendPrayers();
    this.completeTask('pray');
  }

  deactivateAllPrayers(): void {
    if (this.activePrayers.size === 0) return;
    this.activePrayers.clear();
    this.recalculatePrayers();
    this.sendPrayers();
  }

  canRun(): boolean {
    return this.runEnabled && this.runEnergy > 0 && this.path.length > 0;
  }

  /* ---------------------------------------------------------------- */
  /* Persistence                                                       */
  /* ---------------------------------------------------------------- */

  serialise(): Record<string, unknown> {
    return {
      username: this.username,
      x: this.x,
      y: this.y,
      plane: this.plane,
      xp: Array.from(this.xp),
      levels: Array.from(this.levels),
      hitpoints: this.hitpoints,
      prayerPoints: this.prayerPoints,
      runEnergy: this.runEnergy,
      runEnabled: this.runEnabled,
      styleIndex: this.styleIndex,
      autoRetaliate: this.autoRetaliate,
      look: this.look,
      quests: this.quests,
      tasks: [...this.tasks],
      friends: this.friends,
      ignores: this.ignores,
      inventory: this.inventory.toArrays(),
      equipment: this.equipment.toArrays(),
      bank: this.bank.toArrays(),
    };
  }

  deserialise(data: Record<string, any>): void {
    if (Array.isArray(data.xp)) for (let i = 0; i < SKILL_COUNT; i++) this.xp[i] = data.xp[i] ?? 0;
    if (Array.isArray(data.levels)) for (let i = 0; i < SKILL_COUNT; i++) this.levels[i] = data.levels[i] ?? 1;
    this.x = data.x ?? this.x;
    this.y = data.y ?? this.y;
    this.plane = data.plane ?? 0;
    this.maxHitpoints = levelForXp(this.xp[Skill.HITPOINTS]);
    this.hitpoints = Math.min(this.maxHitpoints, data.hitpoints ?? this.maxHitpoints);
    this.prayerPoints = Math.min(levelForXp(this.xp[Skill.PRAYER]), data.prayerPoints ?? 1);
    this.runEnergy = data.runEnergy ?? 10000;
    this.runEnabled = data.runEnabled ?? true;
    this.styleIndex = data.styleIndex ?? 0;
    this.autoRetaliate = data.autoRetaliate ?? true;
    if (Array.isArray(data.look)) this.look = data.look;
    if (data.quests && typeof data.quests === 'object') this.quests = data.quests;
    if (Array.isArray(data.tasks)) this.tasks = new Set(data.tasks.filter((t: unknown) => typeof t === 'string'));
    if (Array.isArray(data.friends)) this.friends = data.friends.filter((n: unknown) => typeof n === 'string');
    if (Array.isArray(data.ignores)) this.ignores = data.ignores.filter((n: unknown) => typeof n === 'string');
    if (data.inventory) this.inventory.load(data.inventory.items, data.inventory.amounts);
    if (data.equipment) this.equipment.load(data.equipment.items, data.equipment.amounts);
    if (data.bank) this.bank.load(data.bank.items, data.bank.amounts);
    this.recalculateBonuses();
  }
}

/** RuneScape names are case-insensitive, and spaces and underscores are equivalent. */
export function sameName(a: string, b: string): boolean {
  return normaliseName(a) === normaliseName(b);
}

export function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/_/g, ' ');
}

/** Earning xp in these skills ticks off the matching Getting Started task. */
const XP_TASKS: Partial<Record<Skill, string>> = {
  [Skill.WOODCUTTING]: 'chop',
  [Skill.FIREMAKING]: 'fire',
  [Skill.FISHING]: 'fish',
  [Skill.COOKING]: 'cook',
  [Skill.MINING]: 'mine',
  [Skill.SMITHING]: 'smith',
  [Skill.MAGIC]: 'spell',
};

function conflicts(a: string, b: string): boolean {
  if (a === b) return true;
  const melee = 'overhead-melee';
  const boostGroups = ['attack', 'strength', 'defence', 'ranged', 'magic'];
  if (a === melee && boostGroups.includes(b)) return true;
  if (b === melee && boostGroups.includes(a)) return true;
  if (a === melee && b === 'overhead') return false;
  return false;
}

export { xpForLevel, MAX_RUN_ENERGY };
