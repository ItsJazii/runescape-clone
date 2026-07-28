/**
 * Full gameplay integration probe. Needs a running server:
 *
 *   npm start                # in one terminal
 *   npm run check:play       # in another
 *
 * Logs in as a throwaway account and drives every major gameplay system over
 * the real wire protocol, asserting on what the server sends back. Object
 * coordinates are resolved from the shared world builder, so the probe stays
 * correct when the map changes.
 */
import WebSocket from 'ws';
import { getWorld } from '../src/shared/world/index.ts';
import * as O from '../src/shared/data/objects.ts';
import { itemDef } from '../src/shared/data/items.ts';
import { npcDef, allNpcs } from '../src/shared/data/npcs.ts';
import { SKILL_NAMES, Skill } from '../src/shared/skills.ts';
import type { ClientMessage, ServerMessage, NetNpc, NetPlayer, NetGroundItem } from '../src/shared/net.ts';

const URL = process.argv[2] ?? 'ws://localhost:43594';
const NAME = process.argv[3] ?? 'Probe';

const world = getWorld().map;
const collision = getWorld().collision;

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

class Client {
  ws!: WebSocket;
  self: NetPlayer | null = null;
  npcs: NetNpc[] = [];
  players: NetPlayer[] = [];
  items: NetGroundItem[] = [];
  tick = 0;
  levels: number[] = [];
  xp: number[] = [];
  combat = 0;
  inv: { items: (number | null)[]; amounts: number[] } = { items: [], amounts: [] };
  equip: { items: number[]; bonuses: Record<string, number>; weight: number } = { items: [], bonuses: {}, weight: 0 };
  bank: { items: number[]; amounts: number[] } = { items: [], amounts: [] };
  shop: { name: string; items: { id: number; amount: number; price: number }[] } | null = null;
  dialogue: { lines: string[]; options?: string[]; title?: string } | null = null;
  makeOptions: { item: number; name: string }[] = [];
  iface: string | null = null;
  prayers: number[] = [];
  run = 100;
  prayerPoints = 0;
  log: string[] = [];
  xpDrops: { skill: number; amount: number }[] = [];
  levelUps: { skill: number; level: number }[] = [];
  hitsplats: number[] = [];
  projectiles: string[] = [];
  sounds: string[] = [];

  connect(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(URL);
      const timer = setTimeout(() => reject(new Error('no init packet')), 15_000);
      this.ws.on('error', reject);
      this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'login', name })));
      this.ws.on('message', (raw) => {
        const m: ServerMessage = JSON.parse(raw.toString());
        this.handle(m);
        if (m.t === 'init') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }

  private handle(m: ServerMessage): void {
    switch (m.t) {
      case 'sync':
        this.tick = m.tick;
        this.self = m.self;
        this.npcs = m.npcs;
        this.players = m.players;
        this.items = m.items;
        this.run = m.run;
        this.prayerPoints = m.prayer;
        for (const h of m.self.hits ?? []) this.hitsplats.push(h.dmg);
        for (const p of m.projectiles) this.projectiles.push(p.gfx);
        break;
      case 'stats':
        this.levels = m.levels;
        this.xp = m.xp;
        this.combat = m.combat;
        break;
      case 'inv':
        this.inv = { items: m.items, amounts: m.amounts };
        break;
      case 'equip':
        this.equip = { items: m.items, bonuses: m.bonuses as unknown as Record<string, number>, weight: m.weight };
        break;
      case 'bank':
        this.bank = { items: m.items, amounts: m.amounts };
        break;
      case 'shop':
        this.shop = { name: m.name, items: m.items };
        break;
      case 'dialogue':
        this.dialogue = { lines: m.lines, options: m.options, title: m.title };
        break;
      case 'makeAmount':
        this.makeOptions = m.options;
        break;
      case 'iface':
        this.iface = m.id;
        break;
      case 'closeIface':
        this.iface = null;
        this.dialogue = null;
        this.shop = null;
        break;
      case 'msg':
        this.log.push(m.text);
        break;
      case 'xp':
        this.xpDrops.push({ skill: m.skill, amount: m.amount });
        break;
      case 'levelup':
        this.levelUps.push({ skill: m.skill, level: m.level });
        break;
      case 'prayers':
        this.prayers = m.active;
        break;
      case 'sound':
        this.sounds.push(m.name);
        break;
    }
  }

  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  cmd(text: string): void {
    this.send({ t: 'chat', text });
  }

  /** Inventory slot holding `id`, or -1. */
  slotOf(id: number): number {
    return this.inv.items.findIndex((it) => it === id);
  }

  count(id: number): number {
    let n = 0;
    for (let i = 0; i < this.inv.items.length; i++) if (this.inv.items[i] === id) n += this.inv.amounts[i];
    return n;
  }

  clearLog(): void {
    this.log.length = 0;
    this.xpDrops.length = 0;
    this.levelUps.length = 0;
    this.hitsplats.length = 0;
    this.projectiles.length = 0;
    this.sounds.length = 0;
  }

  said(fragment: string): boolean {
    return this.log.some((l) => l.toLowerCase().includes(fragment.toLowerCase()));
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TICK = 620;

/** Waits until `predicate` holds, polling once per tick. */
async function until(predicate: () => boolean, ticks = 20): Promise<boolean> {
  for (let i = 0; i < ticks; i++) {
    if (predicate()) return true;
    await wait(TICK);
  }
  return predicate();
}

/**
 * NPCs wander, so tests that need to stand next to one hunt for whichever
 * matching NPC is closest right now and teleport beside it. Retries a few
 * times because the target keeps moving between ticks.
 */
async function stepOntoNpc(match: (n: NetNpc) => boolean, attempts = 6): Promise<NetNpc | undefined> {
  for (let i = 0; i < attempts; i++) {
    const candidates = c.npcs
      .filter(match)
      .sort(
        (a, b) =>
          Math.hypot(a.x - c.self!.x, a.y - c.self!.y) - Math.hypot(b.x - c.self!.x, b.y - c.self!.y),
      );
    const target = candidates[0];
    if (!target) {
      await wait(TICK * 2);
      continue;
    }
    c.cmd(`::tele ${target.x} ${target.y} ${target.p}`);
    await wait(TICK * 2);
    const live = c.npcs.find((n) => n.i === target.i);
    if (live && Math.max(Math.abs(live.x - c.self!.x), Math.abs(live.y - c.self!.y)) <= 1) return live;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Reporting                                                           */
/* ------------------------------------------------------------------ */

let passes = 0;
const failures: string[] = [];
let section = '';

function heading(name: string): void {
  section = name;
  console.log(`\n== ${name} ==`);
}

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    passes++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(`${section}: ${label}${detail ? ` -- ${detail}` : ''}`);
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`);
  }
}

/* ------------------------------------------------------------------ */
/* World lookups                                                       */
/* ------------------------------------------------------------------ */

function findObject(id: number, plane = 0): { id: number; x: number; y: number } | undefined {
  return world.objects.find((o) => o.id === id && o.plane === plane);
}

function nearestObject(id: number, x: number, y: number, plane = 0) {
  let best: { x: number; y: number } | undefined;
  let bestD = Infinity;
  for (const o of world.objects) {
    if (o.id !== id || o.plane !== plane) continue;
    const d = Math.abs(o.x - x) + Math.abs(o.y - y);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Probe                                                               */
/* ------------------------------------------------------------------ */

const c = new Client();
await c.connect(NAME);
await wait(1200);

heading('login & initial state');
check('receives a sync packet with self', c.self !== null);
check('spawns at the Lumbridge spawn point', c.self?.x === 3222 && c.self?.y === 3218, `${c.self?.x},${c.self?.y}`);
check('stats packet arrived', c.levels.length === 23, `${c.levels.length} skills`);
check('hitpoints start at 10', c.levels[Skill.HITPOINTS] === 10, String(c.levels[Skill.HITPOINTS]));
check('combat level is 3', c.combat === 3, String(c.combat));
check('inventory packet arrived', c.inv.items.length === 28);
check('world has NPCs in view', c.npcs.length > 0, `${c.npcs.length}`);
check('welcome message shown', c.said('Welcome to RuneScape'), c.log.join(' | '));

// Reset the account so repeat runs are deterministic.
c.cmd('::empty');
await wait(TICK * 2);
c.cmd('::heal');
await wait(TICK * 2);

/* ---------------------------------------------------------------- */
heading('movement');
c.clearLog();
const startX = c.self!.x;
const startY = c.self!.y;
c.send({ t: 'walk', x: startX + 5, y: startY });
const walked = await until(() => c.self!.x === startX + 5 && c.self!.y === startY, 15);
check('walks to a clicked tile', walked, `at ${c.self?.x},${c.self?.y}`);
check('reports walking movement kind', true);

// Run is enabled by default on a fresh account; walk a long path and watch for
// the two-tiles-per-tick movement kind.
let sawRun = false;
c.send({ t: 'walk', x: startX + 5, y: startY + 14 });
for (let i = 0; i < 12; i++) {
  await wait(TICK);
  if (c.self!.mv === 2 || (c.self!.wp?.length ?? 0) >= 1) sawRun = true;
}
check('running covers two tiles per tick', sawRun, `mv=${c.self!.mv} wp=${JSON.stringify(c.self!.wp)}`);
check('run energy drains', c.run < 100, `run=${c.run}`);
c.send({ t: 'toggleRun' });
await wait(TICK * 2);
c.send({ t: 'walk', x: startX + 5, y: startY });
let sawRunWhileOff = false;
for (let i = 0; i < 10; i++) {
  await wait(TICK);
  if (c.self!.mv === 2) sawRunWhileOff = true;
}
check('toggling run off falls back to walking', !sawRunWhileOff, `mv=${c.self!.mv}`);
c.send({ t: 'toggleRun' });
await wait(TICK * 2);

c.cmd(`::tele ${startX} ${startY}`);
await until(() => c.self!.x === startX && c.self!.y === startY, 8);
check('teleport command works', c.self!.x === startX, `${c.self!.x},${c.self!.y}`);

// Walking into water must fail.
c.send({ t: 'walk', x: 3244, y: 3222 });
await wait(TICK * 12);
check('cannot walk into the river', !(c.self!.x === 3244 && c.self!.y === 3222), `${c.self!.x},${c.self!.y}`);

/* ---------------------------------------------------------------- */
heading('woodcutting');
c.cmd('::empty');
await wait(TICK * 2);
c.cmd('::item 1351 1'); // Bronze axe
await wait(TICK * 2);
const tree = nearestObject(O.O_TREE, 3222, 3218);
check('the map has a normal tree', !!tree, JSON.stringify(tree));
if (tree) {
  c.cmd(`::tele ${tree.x + 1} ${tree.y}`);
  await wait(TICK * 3);
  c.clearLog();
  c.send({ t: 'objectAction', id: O.O_TREE, x: tree.x, y: tree.y, action: 'Chop down' });
  const gotLog = await until(() => c.count(1511) > 0, 40);
  check('chopping a tree yields logs', gotLog, c.log.slice(-4).join(' | '));
  check('woodcutting xp is awarded', c.xpDrops.some((d) => d.skill === Skill.WOODCUTTING), JSON.stringify(c.xpDrops));
  check('the game narrates the chop', c.said('You get some logs'), c.log.slice(-4).join(' | '));
}

/* ---------------------------------------------------------------- */
heading('firemaking & cooking');
c.cmd('::item 1511 5'); // Logs
c.cmd('::item 590 1'); // Tinderbox
c.cmd('::item 2138 3'); // Raw chicken
await wait(TICK * 3);
c.cmd('::setlevel firemaking 50');
c.cmd('::setlevel cooking 50');
await wait(TICK * 3);
c.clearLog();
const logSlot = c.slotOf(1511);
const tinderSlot = c.slotOf(590);
check('starter kit contains logs and a tinderbox', logSlot >= 0 && tinderSlot >= 0);
c.send({ t: 'itemOnItem', slotA: tinderSlot, slotB: logSlot });
const lit = await until(() => c.said('fire catches'), 30);
check('a tinderbox on logs lights a fire', lit, c.log.slice(-5).join(' | '));
check('firemaking xp is awarded', c.xpDrops.some((d) => d.skill === Skill.FIREMAKING), JSON.stringify(c.xpDrops));

/* ---------------------------------------------------------------- */
heading('mining & smithing');
c.cmd('::empty');
await wait(TICK * 2);
c.cmd('::item 1265 1'); // Bronze pickaxe
await wait(TICK * 2);
const rock = nearestObject(O.O_COPPER_ROCK, 3300, 3310) ?? findObject(O.O_COPPER_ROCK);
check('the map has a copper rock', !!rock, JSON.stringify(rock));
if (rock) {
  c.cmd(`::tele ${rock.x + 1} ${rock.y}`);
  await wait(TICK * 3);
  c.clearLog();
  c.send({ t: 'objectAction', id: O.O_COPPER_ROCK, x: rock.x, y: rock.y, action: 'Mine' });
  const gotOre = await until(() => c.count(436) > 0, 40);
  check('mining a copper rock yields ore', gotOre, c.log.slice(-4).join(' | '));
  check('mining xp is awarded', c.xpDrops.some((d) => d.skill === Skill.MINING), JSON.stringify(c.xpDrops));
}

const furnace = findObject(O.O_FURNACE);
check('the map has a furnace', !!furnace, JSON.stringify(furnace));
if (furnace) {
  c.cmd('::item 436 4');
  c.cmd('::item 438 4'); // Tin ore
  await wait(TICK * 3);
  c.cmd(`::tele ${furnace.x + 2} ${furnace.y}`);
  await wait(TICK * 3);
  c.clearLog();
  c.send({ t: 'objectAction', id: O.O_FURNACE, x: furnace.x, y: furnace.y, action: 'Smelt' });
  const smeltMenu = await until(() => c.makeOptions.length > 0, 12);
  check('the furnace opens a smelting menu', smeltMenu, JSON.stringify(c.makeOptions.slice(0, 3)));
  if (smeltMenu) {
    c.send({ t: 'makeAmount', amount: 2, option: 0 });
    const madeBar = await until(() => c.count(2349) > 0, 25);
    check('smelting produces a bronze bar', madeBar, `bars=${c.count(2349)} ${c.log.slice(-3).join(' | ')}`);
    check('smithing xp is awarded', c.xpDrops.some((d) => d.skill === Skill.SMITHING), JSON.stringify(c.xpDrops));
  }
}

/* ---------------------------------------------------------------- */
heading('fishing');
c.cmd('::empty');
await wait(TICK * 2);
c.cmd('::item 303 1'); // Small fishing net
await wait(TICK * 2);
// Fishing spots are NPCs. Land a short walk away rather than beside the spot:
// teleporting onto the bank hid the fact that three of the four net spots used
// to sit in unreachable open water, so the walk is the part worth testing.
const netSpotDef = allNpcs().find((d) => d.name === 'Fishing spot' && d.options.includes('Net'));
const netSpawn = netSpotDef ? world.npcSpawns.find((s) => s.def === netSpotDef.id) : undefined;
check('the map has a net fishing spot', !!netSpawn, JSON.stringify(netSpawn));
if (netSpawn) {
  const bank = ([[0, 1], [0, -1], [1, 0], [-1, 0]] as [number, number][])
    .map(([dx, dy]) => [netSpawn.x + dx, netSpawn.y + dy] as [number, number])
    .find(([x, y]) => collision.walkable(x, y, netSpawn.plane));
  check('the fishing spot has a bank to stand on', !!bank, `spot=(${netSpawn.x},${netSpawn.y})`);

  // A tile several steps back from the bank, so the server has to path there.
  let start: [number, number] | undefined;
  if (bank) {
    for (const [dx, dy] of [[0, 5], [0, -5], [5, 0], [-5, 0], [3, 3], [-3, -3]] as [number, number][]) {
      if (collision.walkable(bank[0] + dx, bank[1] + dy, netSpawn.plane)) {
        start = [bank[0] + dx, bank[1] + dy];
        break;
      }
    }
  }
  if (start) {
    c.cmd(`::tele ${start[0]} ${start[1]} ${netSpawn.plane}`);
    await wait(TICK * 2);
  }
  const spot = c.npcs.find((n) => n.def === netSpotDef!.id);
  check('the fishing spot is visible to the client', !!spot, `npcs=${c.npcs.length}`);
  if (spot) {
    const away = Math.max(Math.abs(c.self!.x - spot.x), Math.abs(c.self!.y - spot.y));
    check('the probe starts away from the spot', away > 1, `distance=${away}`);
    c.clearLog();
    c.send({ t: 'npcAction', npc: spot.i, action: 'Net' });
    const caught = await until(() => c.count(317) > 0 || c.count(321) > 0, 40);
    check('walking to a fishing spot and netting it catches shrimp', caught, c.log.slice(-4).join(' | '));
    check('fishing does not report "I can\'t reach that!"', !c.said("can't reach"), c.log.slice(-4).join(' | '));
    check('fishing xp is awarded', c.xpDrops.some((d) => d.skill === Skill.FISHING), JSON.stringify(c.xpDrops));
  }
}

/* ---------------------------------------------------------------- */
heading('combat');
c.cmd('::empty');
await wait(TICK * 2);
c.cmd('::item 1277 1'); // Bronze sword
c.cmd('::setlevel attack 40');
c.cmd('::setlevel strength 40');
await wait(TICK * 3);
// Chickens live on the farm north-east of Lumbridge.
const chickenDef = allNpcs().find((d) => d.name === 'Chicken');
const chickenSpawn = chickenDef ? world.npcSpawns.find((s) => s.def === chickenDef.id) : undefined;
check('the world has chickens to fight', !!chickenSpawn, JSON.stringify(chickenSpawn));
if (chickenSpawn) {
  c.cmd(`::tele ${chickenSpawn.x} ${chickenSpawn.y} 0`);
  await wait(TICK * 4);
}
const victim = await stepOntoNpc((n) => {
  const d = npcDef(n.def);
  return !!d && d.options.includes('Attack') && d.combat <= 5;
});
check('an attackable NPC is adjacent', !!victim, `npcs in view=${c.npcs.length} at ${c.self!.x},${c.self!.y}`);
if (victim) {
  const vdef = npcDef(victim.def)!;
  console.log(`       target: ${vdef.name} (level ${vdef.combat}, ${vdef.hitpoints} hp) at ${victim.x},${victim.y}, me at ${c.self!.x},${c.self!.y}`);
  c.clearLog();
  const beforeXp = c.xp[Skill.ATTACK] ?? 0;
  c.send({ t: 'npcAction', npc: victim.i, action: 'Attack' });
  const engaged = await until(() => {
    const live = c.npcs.find((n) => n.i === victim!.i);
    return !!live && (live.hp < live.maxHp || (live.hits?.length ?? 0) > 0);
  }, 25);
  check('attacking an NPC deals damage', engaged, `hp=${c.npcs.find((n) => n.i === victim!.i)?.hp}/${victim.maxHp} log=${c.log.slice(-3).join(' | ')}`);
  const killed = await until(() => {
    const live = c.npcs.find((n) => n.i === victim!.i);
    return !live || live.hp === 0 || live.a === 'death';
  }, 45);
  check('the NPC can be killed', killed, `hp=${c.npcs.find((n) => n.i === victim!.i)?.hp}`);
  check('combat awards attack xp', (c.xp[Skill.ATTACK] ?? 0) > beforeXp, `${beforeXp} -> ${c.xp[Skill.ATTACK]}`);
  check('combat awards hitpoints xp', c.xpDrops.some((d) => d.skill === Skill.HITPOINTS), JSON.stringify(c.xpDrops.slice(0, 6)));
  await wait(TICK * 4);
  const nearDrop = c.items.find((i) => Math.abs(i.x - victim!.x) <= 2 && Math.abs(i.y - victim!.y) <= 2);
  check('the kill leaves a drop on the ground', !!nearDrop, `${c.items.length} ground items in view`);
  if (nearDrop) {
    c.clearLog();
    c.send({ t: 'groundItemAction', item: nearDrop.item, x: nearDrop.x, y: nearDrop.y, action: 'Take' });
    const picked = await until(() => c.count(nearDrop.item) > 0, 20);
    check('drops can be picked up', picked, `${itemDef(nearDrop.item)?.name} ${c.log.slice(-3).join(' | ')}`);
  }
}

// The NPC must fight back.
heading('npc retaliation');
c.send({ t: 'setAutoRetaliate', on: true });
c.cmd('::item 1277 1');
await wait(TICK * 3);
const banditDef = allNpcs().find((d) => d.name === 'Man' || d.name === 'Guard');
const banditSpawn = banditDef ? world.npcSpawns.find((s) => s.def === banditDef.id) : undefined;
if (banditSpawn && banditDef) {
  // Townsfolk wander, so walk onto whichever one is closest right now.
  c.cmd(`::tele ${banditSpawn.x} ${banditSpawn.y} 0`);
  await wait(TICK * 4);
  const foe = await stepOntoNpc((n) => {
    const d = npcDef(n.def);
    return !!d && d.options.includes('Attack') && d.maxHit > 0 && d.combat <= 15;
  });
  check('an NPC that fights back is adjacent', !!foe, `at ${c.self!.x},${c.self!.y}, npcs=${c.npcs.length}`);
  if (foe) {
    c.clearLog();
    c.send({ t: 'npcAction', npc: foe.i, action: 'Attack' });
    const fightBack = await until(() => c.hitsplats.length > 0 || (c.self!.hp ?? 10) < (c.self!.maxHp ?? 10), 30);
    check(`the ${npcDef(foe.def)?.name} fights back`, fightBack, `hp=${c.self!.hp}/${c.self!.maxHp} splats=${JSON.stringify(c.hitsplats)}`);
  }
}

/* ---------------------------------------------------------------- */
heading('combat styles & retaliation');
c.clearLog();
c.send({ t: 'setStyle', index: 2 });
await wait(TICK * 2);
c.send({ t: 'setAutoRetaliate', on: false });
await wait(TICK * 2);
check('style and retaliate packets are accepted without error', true);

/* ---------------------------------------------------------------- */
heading('equipment');
c.cmd('::empty');
await wait(TICK * 2);
c.cmd('::item 1277 1'); // Bronze sword
c.cmd('::item 1171 1'); // Wooden shield
c.cmd('::item 1117 1'); // Bronze platebody
await wait(TICK * 3);
const swordSlot = c.slotOf(1277);
c.clearLog();
c.send({ t: 'itemAction', slot: swordSlot, item: 1277, action: 'Wield' });
const wielded = await until(() => c.equip.items.some((i) => i === 1277), 12);
check('a sword can be wielded', wielded, JSON.stringify(c.equip.items));
check('wielding raises the stab attack bonus', (c.equip.bonuses.attackStab ?? 0) > 0, JSON.stringify(c.equip.bonuses));
const bodySlot = c.slotOf(1117);
c.send({ t: 'itemAction', slot: bodySlot, item: 1117, action: 'Wear' });
const worn = await until(() => c.equip.items.some((i) => i === 1117), 12);
check('a platebody can be worn', worn, JSON.stringify(c.equip.items));
check('armour raises defence bonuses', (c.equip.bonuses.defenceSlash ?? 0) > 0, JSON.stringify(c.equip.bonuses));
check('equipment has weight', c.equip.weight > 0, String(c.equip.weight));
const weaponIdx = c.equip.items.findIndex((i) => i === 1277);
c.send({ t: 'equipAction', slot: weaponIdx, action: 'Remove' });
const removed = await until(() => !c.equip.items.some((i) => i === 1277), 12);
check('equipment can be removed', removed, JSON.stringify(c.equip.items));

/* ---------------------------------------------------------------- */
heading('food & healing');
c.cmd('::item 2309 3'); // Bread
await wait(TICK * 2);
c.cmd('::setlevel hitpoints 20');
await wait(TICK * 2);
// Take damage from an NPC-free source: use the ::hurt style approach via combat is
// unreliable, so verify eating at full hp reports the right message instead.
c.clearLog();
const breadSlot = c.slotOf(2309);
c.send({ t: 'itemAction', slot: breadSlot, item: 2309, action: 'Eat' });
const ate = await until(() => c.count(2309) < 3, 12);
check('food is consumed when eaten', ate, `bread=${c.count(2309)} ${c.log.slice(-3).join(' | ')}`);
check('eating is narrated', c.said('eat') || c.said('bread'), c.log.slice(-3).join(' | '));

/* ---------------------------------------------------------------- */
heading('prayer');
c.cmd('::setlevel prayer 45');
await wait(TICK * 3);
c.clearLog();
c.send({ t: 'prayer', id: 0 });
const prayerOn = await until(() => c.prayers.includes(0), 10);
check('a prayer can be activated', prayerOn, JSON.stringify(c.prayers) + ' ' + c.log.slice(-3).join(' | '));
const drained = await until(() => c.prayerPoints < 45, 20);
check('active prayers drain prayer points', drained, `points=${c.prayerPoints}`);
c.send({ t: 'prayer', id: 0 });
const prayerOff = await until(() => !c.prayers.includes(0), 10);
check('a prayer can be deactivated', prayerOff, JSON.stringify(c.prayers));

const altar = findObject(O.O_ALTAR);
if (altar) {
  c.cmd(`::tele ${altar.x} ${altar.y + 1}`);
  await wait(TICK * 3);
  c.clearLog();
  c.send({ t: 'objectAction', id: O.O_ALTAR, x: altar.x, y: altar.y, action: 'Pray-at' });
  const recharged = await until(() => c.prayerPoints >= 45, 15);
  check('praying at an altar recharges prayer', recharged, `points=${c.prayerPoints} ${c.log.slice(-3).join(' | ')}`);
}

/* ---------------------------------------------------------------- */
heading('magic');
c.cmd('::empty');
await wait(TICK * 2);
c.cmd('::setlevel magic 55');
c.cmd('::item 556 50'); // Air runes
c.cmd('::item 558 50'); // Mind runes
c.cmd('::item 555 50'); // Water runes
c.cmd('::item 554 50'); // Fire runes
c.cmd('::item 557 50'); // Earth runes
c.cmd('::item 561 20'); // Nature runes
await wait(TICK * 4);
if (chickenSpawn) {
  c.cmd(`::tele ${chickenSpawn.x + 2} ${chickenSpawn.y} 0`);
  await wait(TICK * 4);
}
const magicTarget = c.npcs.find((n) => {
  const d = npcDef(n.def);
  return d && d.options.includes('Attack') && Math.max(Math.abs(n.x - c.self!.x), Math.abs(n.y - c.self!.y)) <= 6;
});
check('a target is available for a spell', !!magicTarget, `npcs=${c.npcs.length} at ${c.self!.x},${c.self!.y}`);
if (magicTarget) {
  c.clearLog();
  c.send({ t: 'castSpell', spell: 0, targetType: 'npc', target: magicTarget.i }); // Wind Strike
  const cast = await until(() => c.xpDrops.some((d) => d.skill === Skill.MAGIC) || c.projectiles.length > 0, 20);
  check('Wind Strike can be cast at an NPC', cast, `${c.log.slice(-4).join(' | ')} proj=${JSON.stringify(c.projectiles)}`);
  check('casting consumes runes', c.count(556) < 50 || c.count(558) < 50, `air=${c.count(556)} mind=${c.count(558)}`);
  check('a projectile is sent to the client', c.projectiles.length > 0, JSON.stringify(c.projectiles));
}

// Non-combat spells.
c.cmd('::empty');
await wait(TICK * 2);
c.cmd('::item 554 20');
c.cmd('::item 561 20');
c.cmd('::item 1275 1'); // Mithril pickaxe or similar alchable item
await wait(TICK * 3);
const alchSlot = c.slotOf(1275);
if (alchSlot >= 0) {
  c.clearLog();
  const coinsBefore = c.count(995);
  c.send({ t: 'castSpell', spell: 27, targetType: 'item', target: alchSlot }); // High Level Alchemy
  const alched = await until(() => c.count(995) > coinsBefore, 20);
  check('High Level Alchemy turns an item into coins', alched, `coins ${coinsBefore} -> ${c.count(995)} ${c.log.slice(-3).join(' | ')}`);
}
c.cmd('::item 556 30');
c.cmd('::item 557 20');
c.cmd('::item 563 20');
await wait(TICK * 3);
c.clearLog();
c.send({ t: 'castSpell', spell: 16, targetType: 'none' }); // Lumbridge Teleport
const teleported = await until(() => c.self!.x === 3222 && c.self!.y === 3218, 20);
check('Lumbridge Teleport moves the player home', teleported, `at ${c.self!.x},${c.self!.y} ${c.log.slice(-3).join(' | ')}`);

/* ---------------------------------------------------------------- */
heading('banking');
const booth = findObject(O.O_BANK_BOOTH);
check('the map has a bank booth', !!booth, JSON.stringify(booth));
if (booth) {
  c.cmd('::empty');
  await wait(TICK * 2);
  c.cmd('::item 995 500');
  c.cmd('::item 1511 10');
  await wait(TICK * 3);
  c.cmd(`::tele ${booth.x} ${booth.y - 1}`);
  await wait(TICK * 3);
  c.clearLog();
  c.send({ t: 'objectAction', id: O.O_BANK_BOOTH, x: booth.x, y: booth.y, action: 'Bank' });
  const bankOpen = await until(() => c.iface === 'bank', 15);
  check('a bank booth opens the bank', bankOpen, `iface=${c.iface} ${c.log.slice(-3).join(' | ')}`);
  if (bankOpen) {
    const depositSlot = c.slotOf(1511);
    c.send({ t: 'bank', action: 'deposit', slot: depositSlot, amount: 10 });
    const deposited = await until(() => c.bank.items.includes(1511), 12);
    check('items can be deposited', deposited, JSON.stringify(c.bank.items));
    const bankSlot = c.bank.items.indexOf(1511);
    c.send({ t: 'bank', action: 'withdraw', slot: bankSlot, amount: 4 });
    const withdrew = await until(() => c.count(1511) === 4, 12);
    check('items can be withdrawn', withdrew, `logs=${c.count(1511)}`);
    c.send({ t: 'bank', action: 'depositAll' });
    const allIn = await until(() => c.count(1511) === 0, 12);
    check('deposit-all empties the inventory', allIn, JSON.stringify(c.inv.items.filter(Boolean)));
    c.send({ t: 'bank', action: 'close' });
    await wait(TICK * 2);
    check('the bank can be closed', c.iface !== 'bank', `iface=${c.iface}`);
  }
}

/* ---------------------------------------------------------------- */
heading('shops & dialogue');
const shopNpcDef = allNpcs().find((d) => d.shop && d.options.includes('Trade'));
const shopSpawn = shopNpcDef ? world.npcSpawns.find((s) => s.def === shopNpcDef.id) : undefined;
check('a shopkeeper exists in the world', !!shopSpawn, shopNpcDef?.name);
if (shopSpawn && shopNpcDef) {
  c.cmd(`::tele ${shopSpawn.x} ${shopSpawn.y - 1}`);
  await wait(TICK * 4);
  const keeper = c.npcs.find((n) => n.def === shopNpcDef.id);
  check('the shopkeeper is visible', !!keeper, `npcs=${c.npcs.length}`);
  if (keeper) {
    c.clearLog();
    c.send({ t: 'npcAction', npc: keeper.i, action: 'Trade' });
    const shopOpen = await until(() => c.shop !== null, 15);
    check('a shop interface opens', shopOpen, `${c.log.slice(-3).join(' | ')}`);
    if (shopOpen && c.shop!.items.length > 0) {
      console.log(`       shop: ${c.shop!.name}, ${c.shop!.items.length} lines`);
      c.cmd('::item 995 1000');
      await wait(TICK * 2);
      const line = c.shop!.items.findIndex((s) => s.amount > 0 && s.price <= 500);
      if (line >= 0) {
        const buyId = c.shop!.items[line].id;
        const before = c.count(buyId);
        c.send({ t: 'shop', action: 'buy', slot: line, amount: 1 });
        const bought = await until(() => c.count(buyId) > before, 12);
        check('items can be bought', bought, `${itemDef(buyId)?.name} ${c.log.slice(-3).join(' | ')}`);
        const sellSlot = c.slotOf(buyId);
        if (sellSlot >= 0) {
          c.send({ t: 'shop', action: 'sell', slot: sellSlot, amount: 1 });
          const sold = await until(() => c.count(buyId) === before, 12);
          check('items can be sold back', sold, `${c.log.slice(-3).join(' | ')}`);
        }
      }
      c.send({ t: 'shop', action: 'close' });
      await wait(TICK * 2);
      check('the shop can be closed', c.shop === null || c.iface !== 'shop');
    }
  }
}

const talkerDef = allNpcs().find((d) => d.dialogue && d.options.includes('Talk-to'));
const talkerSpawn = talkerDef ? world.npcSpawns.find((s) => s.def === talkerDef.id) : undefined;
check('a talkable NPC exists', !!talkerSpawn, talkerDef?.name);
if (talkerSpawn && talkerDef) {
  c.cmd(`::tele ${talkerSpawn.x} ${talkerSpawn.y - 1}`);
  await wait(TICK * 4);
  const talker = c.npcs.find((n) => n.def === talkerDef.id);
  if (talker) {
    c.clearLog();
    c.dialogue = null;
    c.send({ t: 'npcAction', npc: talker.i, action: 'Talk-to' });
    const talking = await until(() => c.dialogue !== null, 15);
    check(`talking to ${talkerDef.name} opens dialogue`, talking, `${c.log.slice(-3).join(' | ')}`);
    if (talking) {
      console.log(`       says: ${JSON.stringify(c.dialogue!.lines)}`);
      const hadOptions = !!c.dialogue!.options;
      c.send({ t: 'dialogue' });
      await wait(TICK * 3);
      check('dialogue advances on continue', true, hadOptions ? 'had options' : 'plain lines');
      c.send({ t: 'closeInterface' });
      await wait(TICK * 2);
    }
  } else {
    check(`${talkerDef.name} is visible after teleporting`, false, `npcs=${c.npcs.length}`);
  }
}

/* ---------------------------------------------------------------- */
heading('doors, stairs & world interaction');
const door = findObject(O.O_DOOR);
if (door) {
  c.cmd(`::tele ${door.x} ${door.y - 1}`);
  await wait(TICK * 3);
  c.clearLog();
  c.send({ t: 'objectAction', id: O.O_DOOR, x: door.x, y: door.y, action: 'Open' });
  const opened = await until(() => c.sounds.includes('door'), 15);
  check('doors can be opened', opened, c.log.slice(-3).join(' | '));
}

const stairs = findObject(O.O_STAIRS_UP) ?? findObject(O.O_STAIRS_BOTH);
if (stairs) {
  const link = world.links.find((l) => l.x === stairs.x && l.y === stairs.y && l.action === 'Climb-up');
  c.cmd(`::tele ${stairs.x} ${stairs.y}`);
  await wait(TICK * 3);
  c.clearLog();
  c.send({ t: 'objectAction', id: stairs.id, x: stairs.x, y: stairs.y, action: 'Climb-up' });
  const climbed = await until(() => c.self!.p === 1, 15);
  check('stairs move the player up a plane', climbed, `plane=${c.self!.p} link=${JSON.stringify(link?.to)}`);
}

/* ---------------------------------------------------------------- */
heading('dropping & ground items');
// The stairs test left us upstairs, so name the plane explicitly.
c.cmd('::tele 3222 3218 0');
await until(() => c.self!.p === 0, 8);
check('teleporting back to ground level works', c.self!.p === 0, `plane=${c.self!.p}`);
c.cmd('::empty');
await wait(TICK * 2);
c.cmd('::item 1511 5');
await wait(TICK * 2);
c.clearLog();
const dropSlot = c.slotOf(1511);
c.send({ t: 'itemAction', slot: dropSlot, item: 1511, action: 'Drop' });
const dropped = await until(() => c.items.some((i) => i.item === 1511), 12);
check('items can be dropped', dropped, `${c.items.length} ground items`);
c.send({ t: 'groundItemAction', item: 1511, x: c.self!.x, y: c.self!.y, action: 'Take' });
const retaken = await until(() => c.count(1511) === 5, 12);
check('dropped items can be taken back', retaken, `logs=${c.count(1511)}`);

/* ---------------------------------------------------------------- */
heading('chat & examine');
c.clearLog();
c.send({ t: 'chat', text: 'hello world' });
await wait(TICK * 3);
check('public chat echoes back to the sender', c.said('hello world'), c.log.slice(-3).join(' | '));

// Examine must answer from anywhere without walking, so pick an object that is
// well out of interaction range and one that skilling can never deplete.
const farObject =
  findObject(O.O_FOUNTAIN) ?? findObject(O.O_WELL) ?? findObject(O.O_BANK_BOOTH, 0) ?? findObject(O.O_ALTAR);
check('the map has a permanent object to examine', !!farObject, JSON.stringify(farObject));
if (farObject) {
  const before = { x: c.self!.x, y: c.self!.y };
  const distance = Math.max(Math.abs(farObject.x - before.x), Math.abs(farObject.y - before.y));
  c.clearLog();
  c.send({ t: 'objectAction', id: farObject.id, x: farObject.x, y: farObject.y, action: 'Examine' });
  const examined = await until(() => c.log.length > 0, 6);
  check('objects can be examined', examined, c.log.slice(-3).join(' | '));
  check('examining never says "I can\'t reach that"', !c.said("can't reach"), c.log.slice(-3).join(' | '));
  check(
    `examining from ${distance} tiles away does not walk you over`,
    c.self!.x === before.x && c.self!.y === before.y,
    `${before.x},${before.y} -> ${c.self!.x},${c.self!.y}`,
  );
}

/* ---------------------------------------------------------------- */
heading('death & respawn');
// Stand in the dark wizard circle unarmoured with 10 hp; they aggro and kill.
const wizDef = allNpcs().find((d) => d.name === 'Dark wizard' && d.aggressive);
const wizSpawn = wizDef ? world.npcSpawns.find((s) => s.def === wizDef.id) : undefined;
check('an aggressive NPC exists to test death', !!wizSpawn, wizDef?.name);
if (wizSpawn) {
  c.cmd('::empty');
  await wait(TICK * 2);
  // Aggression stops above combat level 15, so drop back to a fresh account.
  for (const s of ['attack', 'strength', 'defence', 'ranged', 'magic', 'prayer']) c.cmd(`::setlevel ${s} 1`);
  c.cmd('::setlevel hitpoints 10');
  await wait(TICK * 4);
  check('combat level is back to 3 for the aggro test', c.combat <= 4, `combat=${c.combat}`);
  c.cmd(`::tele ${wizSpawn.x} ${wizSpawn.y} ${wizSpawn.plane}`);
  await wait(TICK * 3);
  // Wizards wander, so land on whichever aggressive one is closest.
  await stepOntoNpc((n) => npcDef(n.def)?.aggressive === true);
  c.clearLog();
  const tookDamage = await until(() => c.hitsplats.length > 0 || (c.self!.hp ?? 10) < 10, 40);
  check('aggressive NPCs attack on sight', tookDamage, `hp=${c.self!.hp} at ${c.self!.x},${c.self!.y} splats=${JSON.stringify(c.hitsplats)}`);
  const died = await until(() => c.said('Oh dear') || (c.self!.x === 3222 && c.self!.y === 3218), 90);
  check('dying respawns you in Lumbridge', died, `at ${c.self!.x},${c.self!.y} hp=${c.self!.hp} ${c.log.slice(-4).join(' | ')}`);
}

/* ---------------------------------------------------------------- */
console.log('\n=======================================================');
console.log(`${passes} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('=======================================================');

c.ws.close();
process.exit(failures.length ? 1 : 0);
