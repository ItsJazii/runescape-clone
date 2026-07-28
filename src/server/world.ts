import {
  GROUND_ITEM_DESPAWN_TICKS,
  GROUND_ITEM_PRIVATE_TICKS,
  HP_REGEN_TICKS,
  STAT_RESTORE_TICKS,
  TICK_MS,
  VIEW_DISTANCE,
  chebyshev,
} from '../shared/constants.ts';
import { isStackable, itemDef } from '../shared/data/items.ts';
import { RARE_DROP_TABLE, RARE_DROP_TABLE_SIZE, npcDef, type Drop } from '../shared/data/npcs.ts';
import { objectDef } from '../shared/data/objects.ts';
import { prayerDrainInterval } from '../shared/data/prayers.ts';
import type { NetGroundItem, NetNpc, NetPlayer, NetProjectile, NetSpotAnim, ServerMessage } from '../shared/net.ts';
import { SKILL_COUNT, Skill, levelForXp } from '../shared/skills.ts';
import { CollisionMap, Flag } from '../shared/world/collision.ts';
import { getWorld, SPAWN_POINT } from '../shared/world/index.ts';
import { distanceTo } from '../shared/world/pathfinding.ts';
import type { ItemSpawn, PlacedObject, WorldMap } from '../shared/world/terrain.ts';
import { applyDamage, combatDistance, performNpcAttack, performPlayerAttack, playerCanReach } from './combat.ts';
import type { Entity } from './entity.ts';
import { Npc } from './npc.ts';
import { Player, sameName } from './player.ts';

export interface GroundItem {
  item: number;
  amount: number;
  x: number;
  y: number;
  plane: number;
  /** Player index that owns it during the private window, or -1. */
  owner: number;
  privateTicks: number;
  despawnTicks: number;
  /** Respawning world spawn this came from. */
  spawn?: ItemSpawn;
}

export interface DynamicObject {
  x: number;
  y: number;
  plane: number;
  id: number;
  rot: number;
  type: number;
  original: number;
  /** Tick at which the original object returns (0 = never). */
  restoreTick: number;
  /** Extra state used by skilling (logs left, ore respawn, fire fuel). */
  data?: Record<string, number>;
}

interface QueuedHit {
  target: Entity;
  source: Entity | null;
  damage: number;
  tick: number;
  type: number;
  onApply?: () => void;
}

export class World {
  readonly map: WorldMap;
  readonly collision: CollisionMap;
  tick = 0;

  readonly players: (Player | null)[] = [];
  readonly npcs: Npc[] = [];
  readonly groundItems: GroundItem[] = [];
  readonly dynamicObjects = new Map<string, DynamicObject>();
  private readonly staticObjects = new Map<string, PlacedObject[]>();
  private readonly pendingHits: QueuedHit[] = [];
  private readonly projectiles: NetProjectile[] = [];
  private readonly spotAnims: NetSpotAnim[] = [];
  private readonly itemRespawns: { spawn: ItemSpawn; tick: number }[] = [];

  constructor() {
    const built = getWorld();
    this.map = built.map;
    this.collision = built.collision;

    for (const obj of this.map.objects) {
      const key = `${obj.x},${obj.y},${obj.plane}`;
      const list = this.staticObjects.get(key);
      if (list) list.push(obj);
      else this.staticObjects.set(key, [obj]);
    }

    for (const spawn of this.map.npcSpawns) {
      const npc = new Npc(spawn.def, spawn.x, spawn.y, spawn.plane);
      npc.index = this.npcs.length;
      this.npcs.push(npc);
    }

    for (const spawn of this.map.itemSpawns) {
      this.groundItems.push({
        item: spawn.item,
        amount: spawn.amount,
        x: spawn.x,
        y: spawn.y,
        plane: spawn.plane,
        owner: -1,
        privateTicks: 0,
        despawnTicks: Number.MAX_SAFE_INTEGER,
        spawn,
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Players                                                           */
  /* ---------------------------------------------------------------- */

  addPlayer(player: Player): void {
    let index = this.players.findIndex((p) => p === null);
    if (index < 0) index = this.players.push(null) - 1;
    this.players[index] = player;
    player.index = index;
    if (player.x === 0) {
      player.x = SPAWN_POINT.x;
      player.y = SPAWN_POINT.y;
      player.plane = SPAWN_POINT.plane;
    }
    player.moveKind = 3;
  }

  removePlayer(player: Player): void {
    if (player.index >= 0) this.players[player.index] = null;
    for (const npc of this.npcs) if (npc.target === player) npc.target = null;
    player.index = -1;
  }

  activePlayers(): Player[] {
    return this.players.filter((p): p is Player => p !== null);
  }

  findPlayer(name: string): Player | undefined {
    return this.activePlayers().find((p) => sameName(p.username, name));
  }

  /* ---------------------------------------------------------------- */
  /* Objects                                                           */
  /* ---------------------------------------------------------------- */

  objectsAt(x: number, y: number, plane: number): PlacedObject[] {
    const dynamic = this.dynamicObjects.get(`${x},${y},${plane}`);
    const statics = this.staticObjects.get(`${x},${y},${plane}`) ?? [];
    if (!dynamic) return statics;
    return statics.map((o) => (o.id === dynamic.original ? { ...o, id: dynamic.id, rot: dynamic.rot } : o));
  }

  /** Finds an object of the given id at (or overlapping) a tile. */
  findObject(id: number, x: number, y: number, plane: number): PlacedObject | undefined {
    const direct = this.objectsAt(x, y, plane).find((o) => o.id === id);
    if (direct) return direct;
    for (let dx = -3; dx <= 0; dx++) {
      for (let dy = -3; dy <= 0; dy++) {
        const list = this.objectsAt(x + dx, y + dy, plane);
        for (const o of list) {
          if (o.id !== id) continue;
          const def = objectDef(o.id);
          if (!def) continue;
          const sx = o.rot % 2 === 1 ? def.sizeY : def.sizeX;
          const sy = o.rot % 2 === 1 ? def.sizeX : def.sizeY;
          if (x >= o.x && x < o.x + sx && y >= o.y && y < o.y + sy) return o;
        }
      }
    }
    return undefined;
  }

  /** Swaps an object for another, optionally restoring it later. */
  replaceObject(obj: PlacedObject, newId: number, restoreTicks = 0, data?: Record<string, number>): DynamicObject {
    const key = `${obj.x},${obj.y},${obj.plane}`;
    const existing = this.dynamicObjects.get(key);
    const original = existing?.original ?? obj.id;
    const oldId = existing?.id ?? obj.id;

    this.applyCollision(obj, oldId, false);
    const dyn: DynamicObject = {
      x: obj.x,
      y: obj.y,
      plane: obj.plane,
      id: newId,
      rot: obj.rot,
      type: obj.type,
      original,
      restoreTick: restoreTicks > 0 ? this.tick + restoreTicks : 0,
      data: data ?? existing?.data,
    };
    this.dynamicObjects.set(key, dyn);
    this.applyCollision(obj, newId, true);
    return dyn;
  }

  restoreObject(key: string): void {
    const dyn = this.dynamicObjects.get(key);
    if (!dyn) return;
    const proto: PlacedObject = { id: dyn.id, x: dyn.x, y: dyn.y, plane: dyn.plane, rot: dyn.rot, type: dyn.type };
    this.applyCollision(proto, dyn.id, false);
    this.applyCollision(proto, dyn.original, true);
    this.dynamicObjects.delete(key);
  }

  private applyCollision(obj: PlacedObject, id: number, add: boolean): void {
    const def = objectDef(id);
    if (!def || !def.solid) return;
    if (obj.type === 0) {
      const side = (['S', 'W', 'N', 'E'] as const)[obj.rot % 4];
      if (add) this.collision.addWall(obj.x, obj.y, obj.plane, side, !def.seeThrough);
      else this.collision.removeWall(obj.x, obj.y, obj.plane, side);
      return;
    }
    const sx = obj.rot % 2 === 1 ? def.sizeY : def.sizeX;
    const sy = obj.rot % 2 === 1 ? def.sizeX : def.sizeY;
    if (add) this.collision.addObject(obj.x, obj.y, obj.plane, sx, sy, !def.seeThrough);
    else this.collision.removeObject(obj.x, obj.y, obj.plane, sx, sy);
  }

  /** Spawns a brand new object (fires from firemaking). */
  spawnObject(id: number, x: number, y: number, plane: number, ticks: number, rot = 0): DynamicObject {
    const proto: PlacedObject = { id, x, y, plane, rot, type: 2 };
    const key = `${x},${y},${plane}`;
    const dyn: DynamicObject = { x, y, plane, id, rot, type: 2, original: -1, restoreTick: ticks > 0 ? this.tick + ticks : 0 };
    this.dynamicObjects.set(key, dyn);
    this.applyCollision(proto, id, true);
    return dyn;
  }

  removeSpawnedObject(key: string): void {
    const dyn = this.dynamicObjects.get(key);
    if (!dyn) return;
    const proto: PlacedObject = { id: dyn.id, x: dyn.x, y: dyn.y, plane: dyn.plane, rot: dyn.rot, type: dyn.type };
    this.applyCollision(proto, dyn.id, false);
    this.dynamicObjects.delete(key);
  }

  /* ---------------------------------------------------------------- */
  /* Ground items                                                      */
  /* ---------------------------------------------------------------- */

  addGroundItem(item: number, amount: number, x: number, y: number, plane: number, owner = -1): void {
    if (amount <= 0 || !itemDef(item)) return;
    if (isStackable(item)) {
      const existing = this.groundItems.find(
        (g) => g.item === item && g.x === x && g.y === y && g.plane === plane && g.owner === owner,
      );
      if (existing) {
        existing.amount += amount;
        existing.despawnTicks = GROUND_ITEM_DESPAWN_TICKS;
        return;
      }
    }
    this.groundItems.push({
      item,
      amount,
      x,
      y,
      plane,
      owner,
      privateTicks: owner >= 0 ? GROUND_ITEM_PRIVATE_TICKS : 0,
      despawnTicks: GROUND_ITEM_DESPAWN_TICKS,
    });
  }

  takeGroundItem(g: GroundItem): void {
    const index = this.groundItems.indexOf(g);
    if (index >= 0) this.groundItems.splice(index, 1);
    if (g.spawn) this.itemRespawns.push({ spawn: g.spawn, tick: this.tick + g.spawn.respawn });
  }

  groundItemsAt(x: number, y: number, plane: number, viewer: Player): GroundItem[] {
    return this.groundItems.filter(
      (g) => g.x === x && g.y === y && g.plane === plane && (g.privateTicks <= 0 || g.owner === viewer.index),
    );
  }

  /* ---------------------------------------------------------------- */
  /* Effects                                                           */
  /* ---------------------------------------------------------------- */

  addProjectile(fromX: number, fromY: number, toX: number, toY: number, gfx: string, delayTicks: number): void {
    this.projectiles.push({
      from: { x: fromX, y: fromY },
      to: { x: toX, y: toY },
      gfx,
      startTick: this.tick,
      duration: Math.max(1, delayTicks),
      arcHeight: gfx.startsWith('arrow') ? 8 : 20,
    });
  }

  addSpotAnim(x: number, y: number, gfx: string, height: number): void {
    this.spotAnims.push({ x, y, gfx, startTick: this.tick, height });
  }

  queueHit(target: Entity, source: Entity | null, damage: number, delay: number, type: number, onApply?: () => void): void {
    this.pendingHits.push({ target, source, damage, tick: this.tick + Math.max(0, delay), type, onApply });
  }

  enterCombat(a: Entity, b: Entity): void {
    a.inCombat = 16;
    b.inCombat = 16;
  }

  /* ---------------------------------------------------------------- */
  /* Death and loot                                                    */
  /* ---------------------------------------------------------------- */

  killEntity(entity: Entity, killer: Entity | null): void {
    entity.dead = true;
    entity.deathTicks = 4;
    entity.target = null;
    entity.clearPath();
    entity.playAnimation('death', this.tick);
    if (entity instanceof Player) {
      entity.stopAction();
      entity.closeInterface();
      entity.message('Oh dear, you are dead!');
    }
    if (entity instanceof Npc && killer instanceof Player) killer.completeTask('kill');
  }

  private finishDeath(entity: Entity): void {
    if (entity instanceof Npc) {
      const killerIndex = entity.topDamager();
      const killer = killerIndex >= 0 ? this.players[killerIndex] : null;
      this.dropLoot(entity, killer);
      entity.respawnTimer = entity.def.respawn;
      entity.hitpoints = 0;
      return;
    }
    if (entity instanceof Player) {
      this.handlePlayerDeath(entity);
    }
  }

  private dropLoot(npc: Npc, killer: Player | null): void {
    const drops = npc.def.drops;
    if (!drops) return;
    const owner = killer?.index ?? -1;
    for (const always of drops.always ?? []) {
      const amount = always.min + Math.floor(Math.random() * (always.max - always.min + 1));
      this.addGroundItem(always.item, amount, npc.x, npc.y, npc.plane, owner);
    }
    if (!drops.table || drops.table.length === 0) return;
    const size = drops.size ?? 128;
    const roll = Math.random() * size;
    let acc = 0;
    for (const drop of drops.table) {
      acc += drop.weight;
      if (roll >= acc) continue;
      this.rollDrop(drop, npc, owner);
      return;
    }
  }

  private rollDrop(drop: Drop, npc: Npc, owner: number): void {
    if (drop.rdt) {
      const roll = Math.random() * RARE_DROP_TABLE_SIZE;
      let acc = 0;
      for (const rare of RARE_DROP_TABLE) {
        acc += rare.weight;
        if (roll < acc) {
          const amount = rare.min + Math.floor(Math.random() * (rare.max - rare.min + 1));
          this.addGroundItem(rare.item, amount, npc.x, npc.y, npc.plane, owner);
          return;
        }
      }
      return;
    }
    const amount = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
    if (amount > 0) this.addGroundItem(drop.item, amount, npc.x, npc.y, npc.plane, owner);
  }

  private handlePlayerDeath(player: Player): void {
    const keep: { id: number; amount: number; value: number }[] = [];
    const all: { id: number; amount: number; value: number; source: 'inv' | 'equip'; slot: number }[] = [];
    for (const [slot, item] of player.inventory.entries()) {
      all.push({ id: item.id, amount: item.amount, value: itemDef(item.id)?.value ?? 0, source: 'inv', slot });
    }
    for (const [slot, item] of player.equipment.entries()) {
      all.push({ id: item.id, amount: item.amount, value: itemDef(item.id)?.value ?? 0, source: 'equip', slot });
    }
    all.sort((a, b) => b.value - a.value);
    const keepCount = player.prayerMultipliers.protectItem ? 4 : 3;
    for (const entry of all.slice(0, keepCount)) keep.push({ id: entry.id, amount: 1, value: entry.value });

    const keptRemaining = new Map<number, number>();
    for (const k of keep) keptRemaining.set(k.id, (keptRemaining.get(k.id) ?? 0) + k.amount);

    const dropAt = { x: player.x, y: player.y, plane: player.plane };
    for (const entry of all) {
      let amount = entry.amount;
      const kept = keptRemaining.get(entry.id) ?? 0;
      if (kept > 0) {
        const take = Math.min(kept, amount);
        keptRemaining.set(entry.id, kept - take);
        amount -= take;
      }
      if (amount > 0) this.addGroundItem(entry.id, amount, dropAt.x, dropAt.y, dropAt.plane, player.index);
    }

    player.inventory.clear();
    player.equipment.clear();
    for (const [id, amount] of keptRemaining) void [id, amount];
    for (const k of keep) player.inventory.add(k.id, k.amount);

    player.deactivateAllPrayers();
    for (let i = 0; i < SKILL_COUNT; i++) player.levels[i] = levelForXp(player.xp[i]);
    player.maxHitpoints = player.levels[Skill.HITPOINTS];
    player.hitpoints = player.maxHitpoints;
    player.prayerPoints = player.levels[Skill.PRAYER];
    player.runEnergy = 10000;
    player.dead = false;
    player.deathTicks = 0;
    player.teleport(SPAWN_POINT.x, SPAWN_POINT.y, SPAWN_POINT.plane);
    player.recalculateBonuses();
    player.sendInventory();
    player.sendEquipment();
    player.sendStats();
    player.message('You have been sent back to Lumbridge.');
  }

  /* ---------------------------------------------------------------- */
  /* Tick                                                              */
  /* ---------------------------------------------------------------- */

  process(): void {
    this.tick++;
    this.projectiles.length = 0;
    this.spotAnims.length = 0;

    this.processPlayers();
    this.processNpcs();
    this.processQueuedHits();
    this.processTimers();
    this.processWorldObjects();
    this.processGroundItems();
    this.sendUpdates();

    for (const player of this.activePlayers()) player.clearTickState();
    for (const npc of this.npcs) npc.clearTickState();
  }

  private processPlayers(): void {
    for (const player of this.activePlayers()) {
      if (player.dead) {
        if (--player.deathTicks <= 0) this.finishDeath(player);
        continue;
      }
      if (player.attackDelay > 0) player.attackDelay--;
      if (player.inCombat > 0) player.inCombat--;
      if (player.actionDelay > 0) player.actionDelay--;
      if (player.chatTicks > 0 && --player.chatTicks === 0) player.chatMessage = null;

      // Combat: keep chasing the target.
      if (player.target && !player.target.dead && this.isReachableTarget(player, player.target)) {
        const target = player.target;
        if (playerCanReach(this, player, target)) {
          player.clearPath();
          player.face(target.x, target.y);
          performPlayerAttack(this, player, target);
        } else if (player.path.length === 0) {
          player.walkTo(this.collision, target.x, target.y, true, target.size, target.size);
        }
      } else if (player.target) {
        player.target = null;
      }

      const running = player.canRun();
      const moved = player.processMovement(this.collision, running);
      if (moved && running) {
        const drain = Math.floor((60 + (67 * Math.min(64, player.weight)) / 64) * (1 - player.levels[Skill.AGILITY] / 300));
        player.runEnergy = Math.max(0, player.runEnergy - drain);
        if (player.runEnergy === 0) {
          player.runEnabled = false;
          player.message('You have run out of energy!');
        }
      } else if (!moved) {
        const restore = Math.floor(player.levels[Skill.AGILITY] / 6) + 8;
        player.runEnergy = Math.min(10000, player.runEnergy + restore);
      }

      if (!moved && player.animation !== 'death' && this.tick - player.animationTick > 2 && !player.action) {
        if (player.animation !== 'idle' && player.inCombat === 0) player.playAnimation('idle', this.tick);
      }

      this.processPending(player);
      if (player.action && !player.pending && player.path.length === 0) {
        if (!player.action.tick(player, this.tick)) player.stopAction();
      }
    }
  }

  private isReachableTarget(player: Player, target: Entity): boolean {
    if (target instanceof Npc && (target.dead || target.hitpoints <= 0)) return false;
    if (target instanceof Player && (target.index < 0 || target.dead)) return false;
    return target.plane === player.plane && chebyshev(player.x, player.y, target.x, target.y) < 32;
  }

  private processPending(player: Player): void {
    const pending = player.pending;
    if (!pending) return;
    if (pending.valid && !pending.valid()) {
      player.pending = null;
      return;
    }
    const dist = distanceTo(player.x, player.y, pending.x, pending.y, pending.sizeX, pending.sizeY);
    if (dist <= pending.range) {
      player.pending = null;
      player.clearPath();
      if (pending.face !== false) player.face(pending.x, pending.y);
      pending.exec();
      return;
    }
    pending.ticks = (pending.ticks ?? 0) + 1;
    if (player.path.length === 0) {
      // Could not get any closer.
      if ((pending.ticks ?? 0) > 2) {
        player.pending = null;
        player.message("I can't reach that!");
      }
    }
  }

  private processNpcs(): void {
    for (const npc of this.npcs) {
      if (npc.dead) {
        if (npc.deathTicks > 0 && --npc.deathTicks === 0) this.finishDeath(npc);
        else if (npc.deathTicks <= 0 && --npc.respawnTimer <= 0) npc.respawn();
        continue;
      }
      if (npc.attackDelay > 0) npc.attackDelay--;
      if (npc.inCombat > 0) npc.inCombat--;
      if (npc.aggroCooldown > 0) npc.aggroCooldown--;
      if (npc.def.respawn === 0 && npc.def.still) continue;

      // Drop the target if it has wandered too far or is gone.
      if (npc.target) {
        const t = npc.target;
        const gone = t.dead || (t instanceof Player && t.index < 0) || t.plane !== npc.plane;
        if (gone || distanceTo(npc.x, npc.y, t.x, t.y, t.size, t.size) > 12) npc.target = null;
      }

      if (!npc.target && npc.def.aggressive && npc.aggroCooldown === 0) {
        const victim = this.findAggroTarget(npc);
        if (victim) npc.target = victim;
      }

      if (npc.target) {
        const target = npc.target;
        const range = npc.def.attackRange ?? 1;
        const dist = combatDistance(npc, target);
        if (dist <= range && (range === 1 || this.collision.hasLineOfSight(npc.x, npc.y, target.x, target.y, npc.plane))) {
          npc.clearPath();
          npc.face(target.x, target.y);
          performNpcAttack(this, npc, target);
        } else if (npc.path.length === 0) {
          npc.walkTo(this.collision, target.x, target.y, true, target.size, target.size);
        }
      } else if (!npc.def.still && npc.def.wander > 0) {
        if (npc.wanderDelay > 0) npc.wanderDelay--;
        else if (npc.path.length === 0 && Math.random() < 0.12) {
          const nx = npc.spawnX + Math.floor(Math.random() * (npc.def.wander * 2 + 1)) - npc.def.wander;
          const ny = npc.spawnY + Math.floor(Math.random() * (npc.def.wander * 2 + 1)) - npc.def.wander;
          if (this.collision.walkable(nx, ny, npc.plane)) npc.walkTo(this.collision, nx, ny);
          npc.wanderDelay = 4 + Math.floor(Math.random() * 8);
        }
      }

      npc.processMovement(this.collision, false);
      if (npc.moveKind === 0 && npc.inCombat === 0 && this.tick - npc.animationTick > 2 && npc.animation !== 'idle') {
        npc.playAnimation('idle', this.tick);
      }
    }
  }

  private findAggroTarget(npc: Npc): Player | null {
    const range = npc.def.aggroRange ?? 4;
    for (const player of this.activePlayers()) {
      if (player.dead || player.plane !== npc.plane) continue;
      if (npc.def.aggroMaxLevel !== undefined && player.combatLevel > npc.def.aggroMaxLevel) continue;
      if (distanceTo(player.x, player.y, npc.x, npc.y, npc.size, npc.size) > range) continue;
      if (!this.collision.hasLineOfSight(npc.x, npc.y, player.x, player.y, npc.plane)) continue;
      return player;
    }
    return null;
  }

  private processQueuedHits(): void {
    for (let i = this.pendingHits.length - 1; i >= 0; i--) {
      const hit = this.pendingHits[i];
      if (hit.tick > this.tick) continue;
      this.pendingHits.splice(i, 1);
      if (hit.target.dead) continue;
      applyDamage(this, hit.source, hit.target, hit.damage, 0);
      hit.onApply?.();
    }
  }

  private processTimers(): void {
    for (const player of this.activePlayers()) {
      // Prayer drain
      const drainEffect = player.prayerMultipliers.drain;
      if (drainEffect > 0 && player.prayerPoints > 0) {
        const interval = prayerDrainInterval(drainEffect, player.bonuses.prayerBonus);
        player.prayerDrainCounter++;
        if (player.prayerDrainCounter >= interval) {
          player.prayerDrainCounter = 0;
          player.prayerPoints = Math.max(0, player.prayerPoints - 1);
          if (player.prayerPoints === 0) {
            player.deactivateAllPrayers();
            player.message('You have run out of prayer points!');
          }
        }
      }

      // Hitpoint regeneration
      player.hpRegenCounter++;
      const regenInterval = player.prayerMultipliers.rapidHeal ? HP_REGEN_TICKS / 2 : HP_REGEN_TICKS;
      if (player.hpRegenCounter >= regenInterval) {
        player.hpRegenCounter = 0;
        if (player.hitpoints < player.maxHitpoints) player.heal(1);
      }

      // Stat restoration toward base levels
      player.statRestoreCounter++;
      const restoreInterval = player.prayerMultipliers.rapidRestore ? STAT_RESTORE_TICKS / 2 : STAT_RESTORE_TICKS;
      if (player.statRestoreCounter >= restoreInterval) {
        player.statRestoreCounter = 0;
        for (let skill = 0; skill < SKILL_COUNT; skill++) {
          if (skill === Skill.HITPOINTS || skill === Skill.PRAYER) continue;
          const base = levelForXp(player.xp[skill]);
          if (player.levels[skill] < base) player.levels[skill]++;
          else if (player.levels[skill] > base) player.levels[skill]--;
        }
        player.sendStats();
      }
    }
  }

  private processWorldObjects(): void {
    for (const [key, dyn] of [...this.dynamicObjects]) {
      if (dyn.restoreTick === 0 || dyn.restoreTick > this.tick) continue;
      if (dyn.original === -1) this.removeSpawnedObject(key);
      else this.restoreObject(key);
    }
  }

  private processGroundItems(): void {
    for (let i = this.groundItems.length - 1; i >= 0; i--) {
      const g = this.groundItems[i];
      if (g.privateTicks > 0) g.privateTicks--;
      if (g.despawnTicks === Number.MAX_SAFE_INTEGER) continue;
      if (--g.despawnTicks <= 0) this.groundItems.splice(i, 1);
    }
    for (let i = this.itemRespawns.length - 1; i >= 0; i--) {
      const entry = this.itemRespawns[i];
      if (entry.tick > this.tick) continue;
      this.itemRespawns.splice(i, 1);
      const s = entry.spawn;
      this.groundItems.push({
        item: s.item,
        amount: s.amount,
        x: s.x,
        y: s.y,
        plane: s.plane,
        owner: -1,
        privateTicks: 0,
        despawnTicks: Number.MAX_SAFE_INTEGER,
        spawn: s,
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Client synchronisation                                            */
  /* ---------------------------------------------------------------- */

  private sendUpdates(): void {
    for (const player of this.activePlayers()) {
      const visiblePlayers: NetPlayer[] = [];
      for (const other of this.activePlayers()) {
        if (other === player) continue;
        if (other.plane !== player.plane) continue;
        if (chebyshev(other.x, other.y, player.x, player.y) > VIEW_DISTANCE) continue;
        visiblePlayers.push(this.encodePlayer(other));
      }

      const visibleNpcs: NetNpc[] = [];
      for (const npc of this.npcs) {
        if (npc.plane !== player.plane) continue;
        if (npc.dead && npc.deathTicks <= 0) continue;
        if (chebyshev(npc.x, npc.y, player.x, player.y) > VIEW_DISTANCE) continue;
        visibleNpcs.push(this.encodeNpc(npc));
      }

      const items: NetGroundItem[] = [];
      for (const g of this.groundItems) {
        if (g.plane !== player.plane) continue;
        if (chebyshev(g.x, g.y, player.x, player.y) > VIEW_DISTANCE) continue;
        if (g.privateTicks > 0 && g.owner !== player.index) continue;
        items.push({ x: g.x, y: g.y, p: g.plane, item: g.item, amount: g.amount });
      }

      const objects: ServerMessage extends never ? never : { x: number; y: number; p: number; id: number; rot: number; type: number; original: number }[] = [];
      for (const dyn of this.dynamicObjects.values()) {
        if (dyn.plane !== player.plane) continue;
        if (chebyshev(dyn.x, dyn.y, player.x, player.y) > VIEW_DISTANCE + 8) continue;
        objects.push({ x: dyn.x, y: dyn.y, p: dyn.plane, id: dyn.id, rot: dyn.rot, type: dyn.type, original: dyn.original });
      }

      const projectiles = this.projectiles.filter(
        (p) => chebyshev(p.from.x, p.from.y, player.x, player.y) <= VIEW_DISTANCE + 4,
      );
      const spotanims = this.spotAnims.filter((s) => chebyshev(s.x, s.y, player.x, player.y) <= VIEW_DISTANCE + 4);

      player.send({
        t: 'sync',
        tick: this.tick,
        self: this.encodePlayer(player),
        players: visiblePlayers,
        npcs: visibleNpcs,
        items,
        projectiles,
        spotanims,
        objects,
        run: Math.round(player.runEnergy / 100),
        runOn: player.runEnabled,
        spec: player.specialEnergy,
        prayer: player.prayerPoints,
      });
    }
  }

  private encodePlayer(p: Player): NetPlayer {
    return {
      i: p.index,
      x: p.x,
      y: p.y,
      p: p.plane,
      d: p.direction,
      a: p.animation,
      at: p.animationTick,
      hp: p.hitpoints,
      maxHp: p.maxHitpoints,
      mv: p.moveKind,
      wp: p.waypoints.length ? [...p.waypoints] : undefined,
      face: p.faceTile ?? undefined,
      hits: p.hits.length ? [...p.hits] : undefined,
      msg: p.chatMessage ?? undefined,
      oh: p.prayerMultipliers.overhead,
      name: p.username,
      combat: p.combatLevel,
      eq: Array.from(p.equipment.ids),
      look: p.look,
    };
  }

  private encodeNpc(n: Npc): NetNpc {
    return {
      i: n.index,
      x: n.x,
      y: n.y,
      p: n.plane,
      d: n.direction,
      a: n.animation,
      at: n.animationTick,
      hp: n.hitpoints,
      maxHp: n.maxHitpoints,
      mv: n.moveKind,
      wp: n.waypoints.length ? [...n.waypoints] : undefined,
      face: n.faceTile ?? undefined,
      hits: n.hits.length ? [...n.hits] : undefined,
      def: n.def.id,
    };
  }
}

export { TICK_MS, Flag, npcDef };

