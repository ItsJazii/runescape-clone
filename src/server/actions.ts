import { AttackType } from '../shared/combat.ts';
import { EquipSlot, itemByName, itemDef, isStackable, highAlchValue, lowAlchValue } from '../shared/data/items.ts';
import * as O from '../shared/data/objects.ts';
import { objectDef } from '../shared/data/objects.ts';
import {
  ALTARS,
  ARROW_TIPPING,
  AXES,
  BAR_SMITH_LEVEL,
  BOW_STRINGING,
  COOKABLES,
  FIREMAKING,
  FISHING_INTERVAL,
  FISHING_METHODS,
  FLETCHING,
  GEM_CUTTING,
  GEM_ROCK_CHANCE,
  GEM_TABLE,
  JEWELLERY,
  LEATHER_PRODUCTS,
  MINING_INTERVAL,
  PICKAXES,
  ROCKS,
  SMELTING,
  SMITH_PRODUCTS,
  SMITH_XP_PER_BAR,
  SPINNING,
  TREES,
  WOODCUTTING_INTERVAL,
  burnChance,
  skillingChance,
} from '../shared/data/skilling.ts';
import { SPELLS, SpellKind, spellById } from '../shared/data/spells.ts';
import { shopDef } from '../shared/data/shops.ts';
import { Skill, SKILL_NAMES } from '../shared/skills.ts';
import type { PlacedObject } from '../shared/world/terrain.ts';
import { castCombatSpell, consumeRunes, hasRunes } from './combat.ts';
import { Npc } from './npc.ts';
import { Player } from './player.ts';
import { startDialogue } from './dialogue.ts';
import type { World } from './world.ts';

/* ------------------------------------------------------------------ */
/* Movement helpers                                                    */
/* ------------------------------------------------------------------ */

export function walkAndDo(
  world: World,
  player: Player,
  x: number,
  y: number,
  sizeX: number,
  sizeY: number,
  range: number,
  exec: () => void,
  valid?: () => boolean,
): void {
  player.resetInteraction();
  player.pending = { x, y, sizeX, sizeY, range, exec, valid };
  const dist = Math.max(
    x - player.x > 0 ? x - player.x : player.x >= x + sizeX ? player.x - (x + sizeX - 1) : 0,
    y - player.y > 0 ? y - player.y : player.y >= y + sizeY ? player.y - (y + sizeY - 1) : 0,
  );
  if (dist > range) player.walkTo(world.collision, x, y, range >= 1, sizeX, sizeY);
}

function objectFootprint(obj: PlacedObject): { x: number; y: number; sizeX: number; sizeY: number } {
  const def = objectDef(obj.id);
  const sizeX = def ? (obj.rot % 2 === 1 ? def.sizeY : def.sizeX) : 1;
  const sizeY = def ? (obj.rot % 2 === 1 ? def.sizeX : def.sizeY) : 1;
  return { x: obj.x, y: obj.y, sizeX, sizeY };
}

/* ------------------------------------------------------------------ */
/* Object interactions                                                 */
/* ------------------------------------------------------------------ */

export function handleObjectAction(world: World, player: Player, id: number, x: number, y: number, action: string): void {
  const obj = world.findObject(id, x, y, player.plane);
  if (!obj) return;
  const def = objectDef(obj.id);
  if (!def) return;
  const fp = objectFootprint(obj);
  const range = obj.type === 0 ? 1 : 1;

  walkAndDo(world, player, fp.x, fp.y, fp.sizeX, fp.sizeY, range, () => {
    runObjectAction(world, player, obj, action);
  });
}

function runObjectAction(world: World, player: Player, obj: PlacedObject, action: string): void {
  const def = objectDef(obj.id);
  if (!def) return;

  switch (action) {
    case 'Examine':
      player.message(def.examine);
      return;
    case 'Open':
      openDoor(world, player, obj);
      return;
    case 'Close':
      closeDoor(world, obj);
      return;
    case 'Climb-up':
    case 'Climb-down':
    case 'Climb-over':
      useLink(world, player, obj, action);
      return;
    case 'Chop down':
      startWoodcutting(world, player, obj);
      return;
    case 'Mine':
      startMining(world, player, obj);
      return;
    case 'Bank':
    case 'Use':
      if (def.options.includes('Bank') || def.id === O.O_BANK_CHEST) {
        openBank(player);
        return;
      }
      if (def.id === O.O_WELL || def.id === O.O_FOUNTAIN || def.id === O.O_SINK || def.id === O.O_WATER_PUMP) {
        fillContainers(player);
        return;
      }
      player.message('Nothing interesting happens.');
      return;
    case 'Collect':
      player.message('You have no items waiting to be collected.');
      return;
    case 'Pray-at':
      prayAtAltar(world, player);
      return;
    case 'Cook':
      player.message('You should use food on the fire.');
      return;
    case 'Smelt':
      openSmelting(player);
      return;
    case 'Smith':
      player.message('You need to use a bar on the anvil.');
      return;
    case 'Spin':
      openSpinning(player);
      return;
    case 'Search':
      searchContainer(world, player, obj);
      return;
    case 'Read':
      player.message(def.examine);
      return;
    case 'Pick':
      pickPlant(world, player, obj);
      return;
    case 'Fill':
      fillHopper(player);
      return;
    case 'Tan':
      tanHides(player);
      return;
    case 'Steal-from':
      player.message('You have nothing to steal from this stall.');
      return;
    default:
      player.message('Nothing interesting happens.');
  }
}

function openDoor(world: World, player: Player, obj: PlacedObject): void {
  const def = objectDef(obj.id);
  if (!def) return;
  const openId = obj.id === O.O_DOOR ? O.O_DOOR_OPEN : obj.id === O.O_GATE ? O.O_GATE_OPEN : -1;
  if (openId < 0) return;
  world.replaceObject(obj, openId, 100);
  player.send({ t: 'sound', name: 'door' });
}

function closeDoor(world: World, obj: PlacedObject): void {
  const closedId = obj.id === O.O_DOOR_OPEN ? O.O_DOOR : obj.id === O.O_GATE_OPEN ? O.O_GATE : -1;
  if (closedId < 0) return;
  world.replaceObject(obj, closedId, 0);
}

function useLink(world: World, player: Player, obj: PlacedObject, action: string): void {
  const link = world.map.links.find(
    (l) => l.x === obj.x && l.y === obj.y && l.plane === obj.plane && l.action === action,
  );
  if (!link) {
    player.message('Nothing interesting happens.');
    return;
  }
  player.teleport(link.to.x, link.to.y, link.to.plane);
  player.stopAction();
}

function searchContainer(world: World, player: Player, obj: PlacedObject): void {
  player.message('You search but find nothing.');
  void world;
  void obj;
}

function pickPlant(world: World, player: Player, obj: PlacedObject): void {
  const map: Record<number, number> = {
    [O.O_CABBAGE_PLANT]: 1965,
    [O.O_POTATO_PLANT]: 1942,
    [O.O_ONION_PLANT]: 1957,
    [O.O_WHEAT]: 1947,
  };
  const item = map[obj.id];
  if (!item) return;
  if (player.inventory.freeSlots() === 0) {
    player.message('Your inventory is too full to hold any more.');
    return;
  }
  player.inventory.add(item, 1);
  player.sendInventory();
  player.playAnimation('pickup', world.tick);
  player.message(`You pick ${itemDef(item)?.name.toLowerCase()}.`);
  world.replaceObject(obj, O.O_FLOWERS, 60);
}

function fillContainers(player: Player): void {
  const pairs: [number, number][] = [
    [1925, 1929], // Bucket -> Bucket of water
    [1935, 1937], // Jug -> Jug of water
    [229, 227], // Vial -> Vial of water
  ];
  let filled = 0;
  for (const [empty, full] of pairs) {
    const count = player.inventory.count(empty);
    if (count > 0) {
      player.inventory.remove(empty, count);
      player.inventory.add(full, count);
      filled += count;
    }
  }
  if (filled === 0) player.message('You have nothing to fill.');
  else {
    player.sendInventory();
    player.message('You fill the container from the water.');
  }
}

function fillHopper(player: Player): void {
  if (!player.inventory.has(1947)) {
    player.message('You have no grain to put in the hopper.');
    return;
  }
  const grain = player.inventory.count(1947);
  player.inventory.remove(1947, grain);
  player.inventory.add(1933, grain);
  player.sendInventory();
  player.message('You grind the grain into flour.');
}

function tanHides(player: Player): void {
  const hides = player.inventory.count(1739);
  if (hides === 0) {
    player.message('You have no cowhides to tan.');
    return;
  }
  const cost = hides * 1;
  if (player.inventory.count(995) < cost) {
    player.message(`You need ${cost} coins to tan that many hides.`);
    return;
  }
  player.inventory.remove(995, cost);
  player.inventory.remove(1739, hides);
  player.inventory.add(1741, hides);
  player.sendInventory();
  player.message(`The tanner cures ${hides} hide${hides === 1 ? '' : 's'} into leather.`);
}

function prayAtAltar(world: World, player: Player): void {
  const max = player.baseLevel(Skill.PRAYER);
  if (player.prayerPoints >= max) {
    player.message('You already have full prayer points.');
    return;
  }
  player.prayerPoints = max;
  player.playAnimation('pray', world.tick);
  player.message('You recharge your prayer points.');
}

/* ------------------------------------------------------------------ */
/* Woodcutting                                                         */
/* ------------------------------------------------------------------ */

function bestTool(player: Player, tools: { item: number; level: number; multiplier: number }[], skill: Skill) {
  for (const tool of tools) {
    if (player.levels[skill] < tool.level) continue;
    if (player.equipment.ids[EquipSlot.WEAPON] === tool.item || player.inventory.has(tool.item)) return tool;
  }
  return null;
}

function startWoodcutting(world: World, player: Player, obj: PlacedObject): void {
  const tree = TREES.find((t) => t.object === obj.id);
  if (!tree) return;
  const axe = bestTool(player, AXES, Skill.WOODCUTTING);
  if (!axe) {
    player.message('You need an axe to chop down this tree.');
    return;
  }
  if (player.levels[Skill.WOODCUTTING] < tree.level) {
    player.message(`You need a Woodcutting level of ${tree.level} to chop down this tree.`);
    return;
  }
  player.message('You swing your axe at the tree.');
  let timer = 0;
  player.startAction({
    name: 'woodcutting',
    tick(p) {
      if (world.dynamicObjects.get(`${obj.x},${obj.y},${obj.plane}`)?.id === tree.object) return true;
      const current = world.findObject(tree.object, obj.x, obj.y, obj.plane);
      if (!current) {
        p.message('There is no tree here.');
        return false;
      }
      if (p.inventory.freeSlots() === 0) {
        p.message('Your inventory is too full to hold any more logs.');
        return false;
      }
      p.playAnimation('chop', world.tick);
      p.face(obj.x, obj.y);
      if (++timer % WOODCUTTING_INTERVAL !== 0) return true;
      const chance = skillingChance(tree.low, tree.high, p.levels[Skill.WOODCUTTING], axe.multiplier);
      if (Math.random() >= chance) return true;
      p.inventory.add(tree.log, 1);
      p.sendInventory();
      p.addXp(Skill.WOODCUTTING, tree.xp);
      p.message(`You get some ${itemDef(tree.log)?.name.toLowerCase()}.`);
      if (Math.random() < tree.depleteChance) {
        world.replaceObject(current, O.O_TREE_STUMP, tree.respawn);
        p.playAnimation('idle', world.tick);
        return false;
      }
      return true;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Mining                                                              */
/* ------------------------------------------------------------------ */

function startMining(world: World, player: Player, obj: PlacedObject): void {
  const rock = ROCKS.find((r) => r.object === obj.id);
  if (!rock) return;
  const pick = bestTool(player, PICKAXES, Skill.MINING);
  if (!pick) {
    player.message('You need a pickaxe to mine this rock.');
    return;
  }
  if (player.levels[Skill.MINING] < rock.level) {
    player.message(`You need a Mining level of ${rock.level} to mine this rock.`);
    return;
  }
  player.message('You swing your pickaxe at the rock.');
  let timer = 0;
  player.startAction({
    name: 'mining',
    tick(p) {
      const current = world.findObject(rock.object, obj.x, obj.y, obj.plane);
      if (!current) return false;
      if (p.inventory.freeSlots() === 0) {
        p.message('Your inventory is too full to hold any more ore.');
        return false;
      }
      p.playAnimation('mine', world.tick);
      p.face(obj.x, obj.y);
      if (++timer % MINING_INTERVAL !== 0) return true;
      const chance = skillingChance(rock.low, rock.high, p.levels[Skill.MINING], pick.multiplier);
      if (Math.random() >= chance) return true;

      if (Math.random() < GEM_ROCK_CHANCE) {
        const total = GEM_TABLE.reduce((sum, [, w]) => sum + w, 0);
        let roll = Math.random() * total;
        for (const [gem, weight] of GEM_TABLE) {
          roll -= weight;
          if (roll <= 0) {
            p.inventory.add(gem, 1);
            p.message('You find a gem!');
            break;
          }
        }
      } else {
        p.inventory.add(rock.ore, 1);
        p.message(`You manage to mine some ${rock.name.toLowerCase()}.`);
      }
      p.sendInventory();
      p.addXp(Skill.MINING, rock.xp);
      world.replaceObject(current, O.O_ROCK_EMPTY, rock.respawn);
      p.playAnimation('idle', world.tick);
      return false;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Fishing                                                             */
/* ------------------------------------------------------------------ */

export function startFishing(world: World, player: Player, npc: Npc, option: string): void {
  const method = FISHING_METHODS.find((m) => m.option === option);
  if (!method) return;
  if (!player.inventory.has(method.tool) && player.equipment.ids[EquipSlot.WEAPON] !== method.tool) {
    player.message(`You need a ${method.toolName} to fish here.`);
    return;
  }
  if (method.bait && !player.inventory.has(method.bait)) {
    player.message(`You need ${method.baitName} to fish here.`);
    return;
  }
  const available = method.fish.filter((f) => player.levels[Skill.FISHING] >= f.level);
  if (available.length === 0) {
    player.message(`You need a Fishing level of ${method.fish[0].level} to fish here.`);
    return;
  }
  player.message('You cast out your line...');
  let timer = 0;
  player.startAction({
    name: 'fishing',
    tick(p) {
      if (npc.dead) return false;
      if (p.inventory.freeSlots() === 0) {
        p.message('Your inventory is too full to hold any more fish.');
        return false;
      }
      if (method.bait && !p.inventory.has(method.bait)) {
        p.message(`You have run out of ${method.baitName}.`);
        return false;
      }
      p.face(npc.x, npc.y);
      p.playAnimation(option === 'Net' || option === 'Cage' ? 'fishnet' : 'fishrod', world.tick);
      if (++timer % FISHING_INTERVAL !== 0) return true;

      // Highest level fish is attempted first, like RuneScape.
      const candidates = [...available].sort((a, bb) => bb.level - a.level);
      for (const fish of candidates) {
        const chance = skillingChance(fish.low, fish.high, p.levels[Skill.FISHING]);
        if (Math.random() >= chance) continue;
        if (method.bait) p.inventory.remove(method.bait, 1);
        p.inventory.add(fish.raw, 1);
        p.sendInventory();
        p.addXp(Skill.FISHING, fish.xp);
        p.message(`You catch some ${fish.name.toLowerCase()}.`);
        break;
      }
      return true;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Firemaking & cooking                                                */
/* ------------------------------------------------------------------ */

export function lightFire(world: World, player: Player, logId: number): void {
  const data = FIREMAKING.find((f) => f.log === logId);
  if (!data) {
    player.message('You cannot light that.');
    return;
  }
  if (player.levels[Skill.FIREMAKING] < data.level) {
    player.message(`You need a Firemaking level of ${data.level} to light these logs.`);
    return;
  }
  if (world.collision.get(player.x, player.y, player.plane) !== 0) {
    player.message('You cannot light a fire here.');
    return;
  }
  player.inventory.remove(logId, 1);
  player.sendInventory();
  player.playAnimation('firemaking', world.tick);
  player.message('You attempt to light the logs.');
  const px = player.x;
  const py = player.y;
  const plane = player.plane;
  let ticks = 0;
  player.startAction({
    name: 'firemaking',
    tick(p) {
      if (++ticks < 4) return true;
      const chance = skillingChance(70, 210, p.levels[Skill.FIREMAKING]);
      if (Math.random() >= chance) {
        ticks = 0;
        p.playAnimation('firemaking', world.tick);
        return true;
      }
      world.spawnObject(O.O_FIRE, px, py, plane, data.duration);
      p.addXp(Skill.FIREMAKING, data.xp);
      p.message('The fire catches and the logs begin to burn.');
      p.playAnimation('idle', world.tick);
      // Step back off the fire, exactly like RuneScape.
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
        if (world.collision.canMove(px, py, plane, dx, dy)) {
          p.path = [{ x: px + dx, y: py + dy }];
          break;
        }
      }
      return false;
    },
  });
}

export function startCooking(world: World, player: Player, rawId: number, obj: PlacedObject): void {
  const data = COOKABLES.find((c) => c.raw === rawId);
  if (!data) {
    player.message('You cannot cook that.');
    return;
  }
  if (player.levels[Skill.COOKING] < data.level) {
    player.message(`You need a Cooking level of ${data.level} to cook this.`);
    return;
  }
  const onRange = obj.id === O.O_RANGE;
  const total = player.inventory.count(rawId);
  let cooked = 0;
  player.startAction({
    name: 'cooking',
    tick(p) {
      if (cooked >= total || !p.inventory.has(rawId)) return false;
      p.face(obj.x, obj.y);
      p.playAnimation('cook', world.tick);
      p.inventory.remove(rawId, 1);
      cooked++;
      if (Math.random() < burnChance(data, p.levels[Skill.COOKING], onRange)) {
        p.inventory.add(data.burnt, 1);
        p.message(`You accidentally burn the ${itemDef(rawId)?.name.replace('Raw ', '').toLowerCase()}.`);
      } else {
        p.inventory.add(data.cooked, 1);
        p.addXp(Skill.COOKING, data.xp);
        p.message(`You successfully cook the ${itemDef(data.cooked)?.name.toLowerCase()}.`);
      }
      p.sendInventory();
      p.actionDelay = 3;
      return true;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Smithing                                                            */
/* ------------------------------------------------------------------ */

function openSmelting(player: Player): void {
  const options = SMELTING.map((s) => ({
    item: s.bar,
    name: s.name,
    level: s.level,
    enabled: player.levels[Skill.SMITHING] >= s.level,
  }));
  player.openInterface = 'smelt';
  player.send({ t: 'makeAmount', options, title: 'Smelt which bar?' });
  player.makeCallback = (amount, option) => {
    const spec = SMELTING[option];
    if (!spec) return;
    smelt(player, spec.bar, amount);
  };
}

function smelt(player: Player, barId: number, amount: number): void {
  const spec = SMELTING.find((s) => s.bar === barId);
  if (!spec) return;
  if (player.levels[Skill.SMITHING] < spec.level) {
    player.message(`You need a Smithing level of ${spec.level} to smelt this.`);
    return;
  }
  let made = 0;
  player.startAction({
    name: 'smelting',
    tick(p) {
      if (made >= amount) return false;
      for (const [ore, qty] of spec.inputs) {
        if (p.inventory.count(ore) < qty) {
          p.message(`You need more ${itemDef(ore)?.name.toLowerCase()}.`);
          return false;
        }
      }
      if (p.inventory.freeSlots() === 0 && !isStackable(spec.bar)) {
        p.message('Your inventory is too full.');
        return false;
      }
      for (const [ore, qty] of spec.inputs) p.inventory.remove(ore, qty);
      made++;
      p.playAnimation('smith', 0);
      if (spec.successChance !== undefined && Math.random() > spec.successChance) {
        p.message('The ore is too impure and you fail to refine it.');
      } else {
        p.inventory.add(spec.bar, 1);
        p.addXp(Skill.SMITHING, spec.xp);
        p.message(`You retrieve a bar of ${spec.name.replace(' bar', '').toLowerCase()}.`);
      }
      p.sendInventory();
      p.actionDelay = 4;
      return true;
    },
  });
}

export function openSmithing(player: Player, barId: number): void {
  const info = BAR_SMITH_LEVEL[barId];
  if (!info) {
    player.message('You cannot smith that.');
    return;
  }
  const options: { item: number; name: string; level: number; enabled: boolean }[] = [];
  const products: { item: number; bars: number; level: number }[] = [];
  for (const product of SMITH_PRODUCTS) {
    const def = itemByName(`${info.tier} ${product.noun}`);
    if (!def) continue;
    const level = info.level + product.levelOffset;
    options.push({ item: def.id, name: def.name, level, enabled: player.levels[Skill.SMITHING] >= level });
    products.push({ item: def.id, bars: product.bars, level });
  }
  player.openInterface = 'smith';
  player.send({ t: 'makeAmount', options, title: `Smith ${info.tier.toLowerCase()} items` });
  player.makeCallback = (amount, option) => {
    const chosen = products[option];
    if (!chosen) return;
    smithItem(player, barId, chosen, amount);
  };
}

function smithItem(player: Player, barId: number, product: { item: number; bars: number; level: number }, amount: number): void {
  if (player.levels[Skill.SMITHING] < product.level) {
    player.message(`You need a Smithing level of ${product.level} to make this.`);
    return;
  }
  let made = 0;
  player.startAction({
    name: 'smithing',
    tick(p) {
      if (made >= amount) return false;
      if (p.inventory.count(barId) < product.bars) {
        p.message(`You need ${product.bars} bars to make this.`);
        return false;
      }
      if (!p.inventory.has(2347)) {
        p.message('You need a hammer to work the metal with.');
        return false;
      }
      p.inventory.remove(barId, product.bars);
      p.inventory.add(product.item, 1);
      p.addXp(Skill.SMITHING, SMITH_XP_PER_BAR * product.bars);
      p.sendInventory();
      p.playAnimation('smith', 0);
      p.message(`You hammer the metal into ${itemDef(product.item)?.name.toLowerCase()}.`);
      made++;
      p.actionDelay = 4;
      return true;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Crafting & fletching                                                */
/* ------------------------------------------------------------------ */

function openSpinning(player: Player): void {
  const options = Object.entries(SPINNING).map(([input, [output, level]]) => ({
    item: output,
    name: itemDef(output)?.name ?? '?',
    level,
    enabled: player.levels[Skill.CRAFTING] >= level && player.inventory.has(Number(input)),
  }));
  player.openInterface = 'spin';
  player.send({ t: 'makeAmount', options, title: 'What would you like to spin?' });
  const entries = Object.entries(SPINNING);
  player.makeCallback = (amount, option) => {
    const entry = entries[option];
    if (!entry) return;
    const [input, [output, level, xp]] = [Number(entry[0]), entry[1]];
    produce(player, Skill.CRAFTING, level, [[input, 1]], output, 1, xp, amount, 3);
  };
}

export function produce(
  player: Player,
  skill: Skill,
  level: number,
  inputs: [number, number][],
  output: number,
  outputAmount: number,
  xp: number,
  times: number,
  delay = 3,
): void {
  if (player.levels[skill] < level) {
    player.message(`You need a ${SKILL_NAMES[skill]} level of ${level} to make this.`);
    return;
  }
  let made = 0;
  player.startAction({
    name: 'producing',
    tick(p) {
      if (made >= times) return false;
      for (const [item, qty] of inputs) {
        if (p.inventory.count(item) < qty) {
          if (made === 0) p.message(`You do not have enough ${itemDef(item)?.name.toLowerCase()}.`);
          return false;
        }
      }
      for (const [item, qty] of inputs) p.inventory.remove(item, qty);
      p.inventory.add(output, outputAmount);
      p.addXp(skill, xp);
      p.sendInventory();
      p.playAnimation('craft', 0);
      made++;
      p.actionDelay = delay;
      return true;
    },
  });
}

function openFletching(player: Player, logId: number): void {
  const list = FLETCHING[logId];
  if (!list) {
    player.message('You cannot fletch that.');
    return;
  }
  player.openInterface = 'fletch';
  player.send({
    t: 'makeAmount',
    title: 'What would you like to make?',
    options: list.map((o) => ({
      item: o.product,
      name: o.name,
      level: o.level,
      enabled: player.levels[Skill.FLETCHING] >= o.level,
    })),
  });
  player.makeCallback = (amount, option) => {
    const chosen = list[option];
    if (!chosen) return;
    produce(player, Skill.FLETCHING, chosen.level, [[logId, 1]], chosen.product, chosen.amount, chosen.xp, amount, 3);
  };
}

function openLeatherwork(player: Player): void {
  player.openInterface = 'craft';
  player.send({
    t: 'makeAmount',
    title: 'What would you like to make?',
    options: LEATHER_PRODUCTS.map((p) => ({
      item: p.product,
      name: p.name,
      level: p.level,
      enabled: player.levels[Skill.CRAFTING] >= p.level,
    })),
  });
  player.makeCallback = (amount, option) => {
    const chosen = LEATHER_PRODUCTS[option];
    if (!chosen) return;
    produce(player, Skill.CRAFTING, chosen.level, [[1741, 1]], chosen.product, 1, chosen.xp, amount, 3);
  };
}

/* ------------------------------------------------------------------ */
/* Item actions                                                        */
/* ------------------------------------------------------------------ */

export function handleItemAction(world: World, player: Player, slot: number, itemId: number, action: string): void {
  const stack = player.inventory.get(slot);
  if (!stack || stack.id !== itemId) return;
  const def = itemDef(itemId);
  if (!def) return;

  switch (action) {
    case 'Examine':
      player.message(def.examine);
      return;
    case 'Drop': {
      player.resetInteraction();
      const amount = player.inventory.removeSlot(slot);
      world.addGroundItem(itemId, amount, player.x, player.y, player.plane, player.index);
      player.sendInventory();
      player.recalculateBonuses();
      player.sendEquipment();
      return;
    }
    case 'Eat':
    case 'Drink': {
      if (player.actionDelay > 0) return;
      const heal = def.heal ?? 0;
      player.inventory.removeSlot(slot, 1);
      if (itemId === 1917) player.inventory.add(1919, 1);
      player.sendInventory();
      player.heal(heal);
      player.playAnimation('eat', world.tick);
      player.actionDelay = 3;
      player.message(`You eat the ${def.name.toLowerCase()}.`);
      if (heal > 0) player.message(`It heals some health.`);
      return;
    }
    case 'Bury': {
      if (player.actionDelay > 0) return;
      player.inventory.removeSlot(slot, 1);
      player.sendInventory();
      player.addXp(Skill.PRAYER, def.buryXp ?? 4.5);
      player.playAnimation('bury', world.tick);
      player.actionDelay = 2;
      player.message('You dig a hole in the ground and bury the bones.');
      return;
    }
    case 'Wear':
    case 'Wield':
    case 'Equip':
      equipItem(world, player, slot);
      return;
    default:
      player.message('Nothing interesting happens.');
  }
}

export function equipItem(world: World, player: Player, slot: number): void {
  const stack = player.inventory.get(slot);
  if (!stack) return;
  const def = itemDef(stack.id);
  if (!def || def.equip === undefined) {
    player.message("You can't wear that.");
    return;
  }
  for (const [skill, level] of def.reqs ?? []) {
    if (player.baseLevel(skill) < level) {
      player.message(`You need ${SKILL_NAMES[skill]} level ${level} to wear this.`);
      return;
    }
  }

  const targetSlot = def.equip;
  const removals: number[] = [targetSlot];
  if (def.twoHanded) removals.push(EquipSlot.SHIELD);
  if (targetSlot === EquipSlot.SHIELD) {
    const weapon = player.equippedIn(EquipSlot.WEAPON);
    if (weapon?.twoHanded) removals.push(EquipSlot.WEAPON);
  }

  const needed = removals.filter((s) => player.equipment.ids[s] >= 0).length;
  if (needed > 1 && player.inventory.freeSlots() < needed - 1) {
    player.message('You do not have enough free inventory space to do that.');
    return;
  }

  const amount = isStackable(stack.id) ? stack.amount : 1;
  player.inventory.removeSlot(slot, amount);
  for (const s of removals) {
    const id = player.equipment.ids[s];
    if (id < 0) continue;
    const qty = player.equipment.amounts[s];
    player.equipment.setSlot(s, -1, 0);
    player.inventory.add(id, qty);
  }
  // Stackable ammo merges with what is already equipped.
  if (isStackable(stack.id) && player.equipment.ids[targetSlot] === stack.id) {
    player.equipment.amounts[targetSlot] += amount;
  } else {
    player.equipment.setSlot(targetSlot, stack.id, amount);
  }

  player.recalculateBonuses();
  player.styleIndex = Math.min(player.styleIndex, player.styles.length - 1);
  player.sendInventory();
  player.sendEquipment();
  player.sendStyle();
  void world;
}

export function unequipItem(player: Player, slot: number): void {
  const id = player.equipment.ids[slot];
  if (id < 0) return;
  const amount = player.equipment.amounts[slot];
  if (player.inventory.roomFor(id, amount) < amount) {
    player.message('Your inventory is full.');
    return;
  }
  player.equipment.setSlot(slot, -1, 0);
  player.inventory.add(id, amount);
  player.recalculateBonuses();
  player.styleIndex = Math.min(player.styleIndex, player.styles.length - 1);
  player.sendInventory();
  player.sendEquipment();
  player.sendStyle();
}

/* ------------------------------------------------------------------ */
/* Item on item / object / npc                                         */
/* ------------------------------------------------------------------ */

export function handleItemOnItem(world: World, player: Player, slotA: number, slotB: number): void {
  const a = player.inventory.get(slotA);
  const b = player.inventory.get(slotB);
  if (!a || !b) return;
  const pair = (x: number, y: number) => (a.id === x && b.id === y) || (a.id === y && b.id === x);
  const other = (id: number) => (a.id === id ? b.id : a.id);

  // Tinderbox on logs
  if (a.id === 590 || b.id === 590) {
    lightFire(world, player, other(590));
    return;
  }
  // Knife on logs -> fletching
  if (a.id === 946 || b.id === 946) {
    const log = other(946);
    if (FLETCHING[log]) {
      openFletching(player, log);
      return;
    }
  }
  // Chisel on gems
  if (a.id === 1755 || b.id === 1755) {
    const gem = other(1755);
    const cut = GEM_CUTTING[gem];
    if (cut) {
      produce(player, Skill.CRAFTING, cut[1], [[gem, 1]], cut[0], 1, cut[2], player.inventory.count(gem), 3);
      return;
    }
  }
  // Needle + thread on leather
  if ((a.id === 1733 || b.id === 1733) && (player.inventory.has(1734) || pair(1733, 1741))) {
    if (other(1733) === 1741) {
      openLeatherwork(player);
      return;
    }
  }
  // Bow string on unstrung bows
  if (a.id === 1777 || b.id === 1777) {
    const bow = other(1777);
    const strung = BOW_STRINGING[bow];
    if (strung) {
      produce(player, Skill.FLETCHING, strung[1], [[bow, 1], [1777, 1]], strung[0], 1, strung[2], player.inventory.count(bow), 3);
      return;
    }
  }
  // Feathers on arrow shafts
  if (pair(314, 52)) {
    const sets = Math.floor(Math.min(player.inventory.count(314), player.inventory.count(52)) / 15);
    if (sets === 0) {
      player.message('You need at least 15 feathers and 15 arrow shafts.');
      return;
    }
    produce(player, Skill.FLETCHING, 1, [[314, 15], [52, 15]], 53, 15, 15, sets, 2);
    return;
  }
  // Arrowtips on headless arrows
  if (a.id === 53 || b.id === 53) {
    const tip = other(53);
    const arrow = ARROW_TIPPING[tip];
    if (arrow) {
      const sets = Math.floor(Math.min(player.inventory.count(53), player.inventory.count(tip)) / 15);
      if (sets === 0) {
        player.message('You need at least 15 headless arrows and 15 arrowtips.');
        return;
      }
      produce(player, Skill.FLETCHING, arrow[1], [[53, 15], [tip, 15]], arrow[0], 15, arrow[2], sets, 2);
      return;
    }
  }
  // Pot of flour + bucket of water -> dough
  if (pair(1933, 1929)) {
    produce(player, Skill.COOKING, 1, [[1933, 1], [1929, 1]], 2307, 1, 0, 1, 2);
    player.inventory.add(1931, 1);
    player.inventory.add(1925, 1);
    player.sendInventory();
    return;
  }
  player.message('Nothing interesting happens.');
}

export function handleItemOnObject(world: World, player: Player, slot: number, objectId: number, x: number, y: number): void {
  const stack = player.inventory.get(slot);
  if (!stack) return;
  const obj = world.findObject(objectId, x, y, player.plane);
  if (!obj) return;
  const fp = objectFootprint(obj);
  walkAndDo(world, player, fp.x, fp.y, fp.sizeX, fp.sizeY, 1, () => {
    const item = stack.id;
    if (obj.id === O.O_FIRE || obj.id === O.O_RANGE) {
      const cookable = COOKABLES.find((c) => c.raw === item);
      if (cookable) {
        startCooking(world, player, item, obj);
        return;
      }
      player.message('Nothing interesting happens.');
      return;
    }
    if (obj.id === O.O_FURNACE) {
      openSmelting(player);
      return;
    }
    if (obj.id === O.O_ANVIL) {
      if (BAR_SMITH_LEVEL[item]) openSmithing(player, item);
      else player.message('You need a metal bar to work on the anvil.');
      return;
    }
    if (obj.id === O.O_SPINNING_WHEEL) {
      openSpinning(player);
      return;
    }
    if (obj.id === O.O_MILLSTONE) {
      fillHopper(player);
      return;
    }
    if (obj.id === O.O_WELL || obj.id === O.O_FOUNTAIN || obj.id === O.O_SINK || obj.id === O.O_WATER_PUMP) {
      fillContainers(player);
      return;
    }
    if (obj.id === O.O_TANNERY) {
      tanHides(player);
      return;
    }
    if (obj.id === O.O_ALTAR) {
      const gold = JEWELLERY.find((j) => j.product === item);
      void gold;
      prayAtAltar(world, player);
      return;
    }
    player.message('Nothing interesting happens.');
  });
}

/* ------------------------------------------------------------------ */
/* NPC interactions                                                    */
/* ------------------------------------------------------------------ */

export function handleNpcAction(world: World, player: Player, npcIndex: number, action: string): void {
  const npc = world.npcs[npcIndex];
  if (!npc || npc.dead) return;

  if (action === 'Examine') {
    player.message(npc.def.examine);
    return;
  }

  if (action === 'Attack') {
    if (!npc.attackable) {
      player.message("You can't attack that.");
      return;
    }
    player.resetInteraction();
    player.target = npc;
    return;
  }

  const range = ['Net', 'Bait', 'Lure', 'Cage', 'Harpoon'].includes(action) ? 1 : 1;
  walkAndDo(
    world,
    player,
    npc.x,
    npc.y,
    npc.size,
    npc.size,
    range,
    () => {
      switch (action) {
        case 'Talk-to':
          startDialogue(world, player, npc);
          return;
        case 'Trade':
          if (npc.def.shop) openShop(player, npc.def.shop);
          else player.message('This person has nothing to trade.');
          return;
        case 'Bank':
          openBank(player);
          return;
        case 'Collect':
          player.message('You have no items waiting to be collected.');
          return;
        case 'Pickpocket':
          pickpocket(world, player, npc);
          return;
        case 'Net':
        case 'Bait':
        case 'Lure':
        case 'Cage':
        case 'Harpoon':
          startFishing(world, player, npc, action);
          return;
        default:
          player.message('Nothing interesting happens.');
      }
    },
    () => !npc.dead,
  );
}

function pickpocket(world: World, player: Player, npc: Npc): void {
  if (player.actionDelay > 0) return;
  player.actionDelay = 3;
  player.playAnimation('pickup', world.tick);
  const level = player.levels[Skill.THIEVING];
  const success = Math.random() < Math.min(0.95, 0.35 + level * 0.01);
  if (success) {
    const coins = 3 + Math.floor(Math.random() * 15);
    player.inventory.add(995, coins);
    player.sendInventory();
    player.addXp(Skill.THIEVING, 8);
    player.message(`You pick the ${npc.def.name.toLowerCase()}'s pocket.`);
  } else {
    player.message(`You fail to pick the ${npc.def.name.toLowerCase()}'s pocket.`);
    player.damage(1);
    player.frozen = 3;
    npc.face(player.x, player.y);
  }
}

/* ------------------------------------------------------------------ */
/* Bank & shops                                                        */
/* ------------------------------------------------------------------ */

export function openBank(player: Player): void {
  player.openInterface = 'bank';
  player.bank.compact();
  player.sendBank();
  player.send({ t: 'iface', id: 'bank' });
}

export function openShop(player: Player, key: string): void {
  const shop = shopDef(key);
  if (!shop) return;
  player.openInterface = 'shop';
  player.currentShop = key;
  sendShop(player, key);
}

export function sendShop(player: Player, key: string): void {
  const shop = shopDef(key);
  if (!shop) return;
  const state = shopStock(key);
  player.send({
    t: 'shop',
    name: shop.name,
    items: state.map((s) => ({ id: s.item, amount: s.amount, price: Math.max(1, Math.round((itemDef(s.item)?.value ?? 1) * shop.sellRate)) })),
  });
}

/** Live shop stock, so buying reduces the amount available. */
const shopState = new Map<string, { item: number; amount: number }[]>();

export function shopStock(key: string): { item: number; amount: number }[] {
  let state = shopState.get(key);
  if (!state) {
    const shop = shopDef(key);
    state = (shop?.stock ?? []).map((s) => ({ item: s.item, amount: s.amount }));
    shopState.set(key, state);
  }
  return state;
}

export function restockShops(): void {
  for (const [key, state] of shopState) {
    const shop = shopDef(key);
    if (!shop) continue;
    for (const entry of state) {
      const target = shop.stock.find((s) => s.item === entry.item)?.amount ?? 0;
      if (entry.amount < target) entry.amount++;
      else if (entry.amount > target && Math.random() < 0.5) entry.amount--;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Spells                                                              */
/* ------------------------------------------------------------------ */

export function handleSpell(
  world: World,
  player: Player,
  spellId: number,
  targetType: 'npc' | 'player' | 'item' | 'none',
  target?: number,
): void {
  const spell = spellById(spellId);
  if (!spell) return;
  if (player.levels[Skill.MAGIC] < spell.level) {
    player.message(`You need a Magic level of ${spell.level} to cast this spell.`);
    return;
  }
  if (!hasRunes(player, spell)) {
    player.message('You do not have the required runes to cast this spell.');
    return;
  }

  switch (spell.kind) {
    case SpellKind.COMBAT: {
      if (targetType === 'npc' && target !== undefined) {
        const npc = world.npcs[target];
        if (!npc || npc.dead) return;
        player.resetInteraction();
        player.autocastSpell = null;
        walkAndDo(world, player, npc.x, npc.y, npc.size, npc.size, 10, () => {
          castCombatSpell(world, player, npc, spell, false);
        }, () => !npc.dead);
      } else if (targetType === 'player' && target !== undefined) {
        const other = world.players[target];
        if (!other) return;
        castCombatSpell(world, player, other, spell, false);
      } else {
        player.message('You need a target for this spell.');
      }
      return;
    }
    case SpellKind.TELEPORT: {
      if (!spell.teleport) return;
      consumeRunes(player, spell);
      player.playAnimation('teleport', world.tick);
      player.addXp(Skill.MAGIC, spell.xp);
      const dest = spell.teleport;
      const inside =
        dest.x >= world.map.minX &&
        dest.y >= world.map.minY &&
        dest.x < world.map.minX + world.map.width &&
        dest.y < world.map.minY + world.map.height;
      if (!inside) {
        player.message('You cannot reach that destination from here.');
        return;
      }
      player.teleport(dest.x, dest.y, dest.plane);
      player.message('You teleport away.');
      return;
    }
    case SpellKind.ALCHEMY: {
      if (targetType !== 'item' || target === undefined) {
        player.message('Cast this on an item in your inventory.');
        return;
      }
      const stack = player.inventory.get(target);
      if (!stack) return;
      if (stack.id === 995) {
        player.message('You cannot alchemise coins.');
        return;
      }
      const value = spell.effect === 'highalch' ? highAlchValue(stack.id) : lowAlchValue(stack.id);
      consumeRunes(player, spell);
      player.inventory.removeSlot(target, 1);
      player.inventory.add(995, Math.max(1, value));
      player.sendInventory();
      player.addXp(Skill.MAGIC, spell.xp);
      player.playAnimation('cast', world.tick);
      world.addSpotAnim(player.x, player.y, 'alch', 0);
      player.message(`You convert the item into ${value} coins.`);
      return;
    }
    case SpellKind.UTILITY: {
      if (spell.effect === 'superheat') {
        if (targetType !== 'item' || target === undefined) return;
        const stack = player.inventory.get(target);
        if (!stack) return;
        const recipe = SMELTING.find((s) => s.inputs.some(([ore]) => ore === stack.id));
        if (!recipe) {
          player.message('You cannot superheat that.');
          return;
        }
        if (player.levels[Skill.SMITHING] < recipe.level) {
          player.message(`You need a Smithing level of ${recipe.level}.`);
          return;
        }
        for (const [ore, qty] of recipe.inputs) {
          if (player.inventory.count(ore) < qty) {
            player.message('You do not have the required ores.');
            return;
          }
        }
        consumeRunes(player, spell);
        for (const [ore, qty] of recipe.inputs) player.inventory.remove(ore, qty);
        player.inventory.add(recipe.bar, 1);
        player.sendInventory();
        player.addXp(Skill.MAGIC, spell.xp);
        player.addXp(Skill.SMITHING, recipe.xp);
        player.playAnimation('cast', world.tick);
        player.message('You superheat the ore into a bar.');
        return;
      }
      if (spell.effect === 'bonestobananas') {
        const bones = player.inventory.count(526);
        if (bones === 0) {
          player.message('You have no bones to convert.');
          return;
        }
        consumeRunes(player, spell);
        player.inventory.remove(526, bones);
        player.inventory.add(1963, bones);
        player.sendInventory();
        player.addXp(Skill.MAGIC, spell.xp);
        player.playAnimation('cast', world.tick);
        player.message('The bones turn into bananas!');
        return;
      }
      if (spell.effect === 'telegrab') {
        player.message('There is nothing to grab from here.');
        return;
      }
      player.message('Nothing interesting happens.');
      return;
    }
    default:
      player.message('You cannot cast that here.');
  }
}

export { SPELLS, AttackType };
