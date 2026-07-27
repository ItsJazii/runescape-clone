import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';

import '../shared/data/all.ts';
import { DEFAULT_PORT, TICK_MS } from '../shared/constants.ts';
import { EQUIP_SLOT_COUNT, EquipSlot, itemDef, itemByName, isStackable } from '../shared/data/items.ts';
import { shopDef } from '../shared/data/shops.ts';
import { spellById } from '../shared/data/spells.ts';
import type { ClientMessage } from '../shared/net.ts';
import { SKILL_NAMES, Skill, levelForXp, xpForLevel } from '../shared/skills.ts';
import {
  equipItem,
  handleItemAction,
  handleItemOnItem,
  handleItemOnObject,
  handleNpcAction,
  handleObjectAction,
  handleSpell,
  openShop,
  restockShops,
  shopStock,
  sendShop,
  unequipItem,
} from './actions.ts';
import { advanceDialogue } from './dialogue.ts';
import { Player, normaliseName, sameName } from './player.ts';
import { World } from './world.ts';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SAVE_DIR = join(ROOT, 'data', 'players');
const CLIENT_DIR = join(ROOT, 'dist', 'client');
const PORT = Number(process.env.PORT ?? DEFAULT_PORT);

try {
  if (!existsSync(SAVE_DIR)) mkdirSync(SAVE_DIR, { recursive: true });
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'EEXIST') console.warn('Could not create the save directory:', err);
}

const world = new World();
const sockets = new Map<Player, WebSocket>();

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

function savePath(username: string): string {
  // Normalise first so "Bob Smith" and "bob_smith" resolve to the same save.
  const file = normaliseName(username).replace(/ /g, '_').replace(/[^a-z0-9_-]/g, '');
  return join(SAVE_DIR, `${file}.json`);
}

function loadPlayer(username: string): Player {
  const player = new Player(username);
  const file = savePath(username);
  if (existsSync(file)) {
    try {
      player.deserialise(JSON.parse(readFileSync(file, 'utf8')));
    } catch (err) {
      console.error(`Failed to load save for ${username}:`, err);
    }
  } else {
    // A fresh account starts with the classic Lumbridge starter kit.
    player.inventory.add(1277, 1); // Bronze sword
    player.inventory.add(1171, 1); // Wooden shield
    player.inventory.add(841, 1); // Shortbow
    player.inventory.add(882, 25); // Bronze arrows
    player.inventory.add(556, 25); // Air runes
    player.inventory.add(558, 15); // Mind runes
    player.inventory.add(2309, 1); // Bread
    player.inventory.add(1351, 1); // Bronze axe
    player.inventory.add(1265, 1); // Bronze pickaxe
    player.inventory.add(590, 1); // Tinderbox
    player.inventory.add(303, 1); // Small fishing net
    player.inventory.add(995, 25); // Coins
    player.recalculateBonuses();
  }
  return player;
}

function savePlayer(player: Player): void {
  try {
    writeFileSync(savePath(player.username), JSON.stringify(player.serialise()));
  } catch (err) {
    console.error(`Failed to save ${player.username}:`, err);
  }
}

/* ------------------------------------------------------------------ */
/* Static file serving (production build)                              */
/* ------------------------------------------------------------------ */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  if (!existsSync(CLIENT_DIR)) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Old School RuneScape clone server is running.\nStart the client with: npm run dev');
    return;
  }
  const url = (req.url ?? '/').split('?')[0];
  let path = join(CLIENT_DIR, normalize(url === '/' ? '/index.html' : url));
  if (!path.startsWith(CLIENT_DIR)) path = join(CLIENT_DIR, 'index.html');
  if (!existsSync(path)) path = join(CLIENT_DIR, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
  res.end(readFileSync(path));
}

const http = createServer(serveStatic);
const wss = new WebSocketServer({ server: http });

/* ------------------------------------------------------------------ */
/* Connection handling                                                 */
/* ------------------------------------------------------------------ */

wss.on('connection', (socket) => {
  let player: Player | null = null;

  socket.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!player) {
      if (msg.t !== 'login') return;
      const name = String(msg.name ?? '').trim().slice(0, 12) || 'Guest';
      const existing = world.findPlayer(name);
      if (existing) {
        socket.send(JSON.stringify({ t: 'msg', text: 'That character is already logged in.', kind: 'system' }));
        socket.close();
        return;
      }
      player = loadPlayer(name);
      world.addPlayer(player);
      sockets.set(player, socket);
      player.send({ t: 'init', index: player.index, name: player.username, tick: world.tick });
      player.sendStats();
      player.sendInventory();
      player.sendEquipment();
      player.sendPrayers();
      player.sendStyle();
      sendFriends(player);
      player.sendIgnores();
      player.sendTasks();
      player.message('Welcome to RuneScape.');
      if (player.tasks.size === 0) {
        player.message('Left-click the ground to walk. Right-click anything for its options.', 'system');
        player.message('Open the Quest tab for a Getting Started checklist.', 'system');
      }
      broadcastFriendStatus(player, true);
      console.log(`[login] ${player.username} (${world.activePlayers().length} online)`);
      return;
    }

    try {
      handleMessage(player, msg);
    } catch (err) {
      console.error('Error handling message', msg, err);
    }
  });

  socket.on('close', () => {
    if (!player) return;
    savePlayer(player);
    world.removePlayer(player);
    sockets.delete(player);
    // Announce after removal so the friend list reports them as offline.
    broadcastFriendStatus(player, false);
    console.log(`[logout] ${player.username}`);
    player = null;
  });

  socket.on('error', () => socket.close());
});

/* ------------------------------------------------------------------ */
/* Packet dispatch                                                     */
/* ------------------------------------------------------------------ */

function handleMessage(player: Player, msg: ClientMessage): void {
  switch (msg.t) {
    case 'ping':
      player.send({ t: 'pong' });
      return;

    case 'walk':
    case 'walkMinimap': {
      if (player.dead) return;
      player.resetInteraction();
      player.closeInterface();
      player.walkTo(world.collision, msg.x, msg.y);
      if (player.path.length >= 3) player.completeTask('walk');
      return;
    }

    case 'objectAction':
      if (player.dead) return;
      player.closeInterface();
      handleObjectAction(world, player, msg.id, msg.x, msg.y, msg.action);
      return;

    case 'npcAction':
      if (player.dead) return;
      player.closeInterface();
      handleNpcAction(world, player, msg.npc, msg.action);
      return;

    case 'playerAction': {
      if (player.dead) return;
      const other = world.players[msg.player];
      if (!other || other === player) return;
      if (msg.action === 'Attack') {
        player.resetInteraction();
        player.target = other;
      } else if (msg.action === 'Follow') {
        player.resetInteraction();
        player.walkTo(world.collision, other.x, other.y, true);
      } else {
        player.message(`${other.username} is level ${other.combatLevel}.`);
      }
      return;
    }

    case 'groundItemAction': {
      if (player.dead) return;
      const target = world
        .groundItemsAt(msg.x, msg.y, player.plane, player)
        .find((g) => g.item === msg.item);
      if (!target) return;
      if (msg.action === 'Examine') {
        player.message(itemDef(target.item)?.examine ?? '');
        return;
      }
      const { x, y } = target;
      player.resetInteraction();
      player.pending = {
        x,
        y,
        sizeX: 1,
        sizeY: 1,
        range: 0,
        valid: () => world.groundItems.includes(target),
        exec: () => {
          if (player.inventory.roomFor(target.item, target.amount) < target.amount) {
            player.message('Your inventory is too full to hold that.');
            return;
          }
          player.inventory.add(target.item, target.amount);
          world.takeGroundItem(target);
          player.sendInventory();
          player.recalculateBonuses();
          player.sendEquipment();
          player.playAnimation('pickup', world.tick);
          player.completeTask('loot');
        },
      };
      if (player.x !== x || player.y !== y) player.walkTo(world.collision, x, y);
      return;
    }

    case 'itemAction':
      if (player.dead) return;
      handleItemAction(world, player, msg.slot, msg.item, msg.action);
      return;

    case 'itemOnItem':
      if (player.dead) return;
      handleItemOnItem(world, player, msg.slotA, msg.slotB);
      return;

    case 'itemOnObject':
      if (player.dead) return;
      handleItemOnObject(world, player, msg.slot, msg.id, msg.x, msg.y);
      return;

    case 'itemOnNpc': {
      if (player.dead) return;
      const npc = world.npcs[msg.npc];
      const stack = player.inventory.get(msg.slot);
      if (!npc || !stack) return;
      player.message('Nothing interesting happens.');
      return;
    }

    case 'swapSlots':
      player.inventory.insert(msg.from, msg.to);
      player.sendInventory();
      return;

    case 'equipAction':
      if (msg.action === 'Remove' || msg.action === 'Unequip') unequipItem(player, msg.slot);
      else {
        const id = player.equipment.ids[msg.slot];
        if (id >= 0) player.message(itemDef(id)?.examine ?? '');
      }
      return;

    case 'bank':
      handleBank(player, msg);
      return;

    case 'shop':
      handleShop(player, msg);
      return;

    case 'dialogue':
      advanceDialogue(world, player, msg.option);
      return;

    case 'setStyle':
      player.styleIndex = Math.max(0, Math.min(msg.index, player.styles.length - 1));
      player.sendStyle();
      return;

    case 'setAutoRetaliate':
      player.autoRetaliate = msg.on;
      player.sendStyle();
      return;

    case 'prayer':
      player.togglePrayer(msg.id);
      return;

    case 'toggleRun':
      if (!player.runEnabled && player.runEnergy <= 0) {
        player.message('You are too tired to run.');
        return;
      }
      player.runEnabled = !player.runEnabled;
      return;

    case 'castSpell':
      if (player.dead) return;
      player.closeInterface();
      handleSpell(world, player, msg.spell, msg.targetType, msg.target);
      return;

    case 'autocast': {
      if (msg.spell === null) {
        player.autocastSpell = null;
      } else {
        const spell = spellById(msg.spell);
        if (!spell || spell.maxHit === undefined) return;
        player.autocastSpell = msg.spell;
      }
      player.sendStyle();
      return;
    }

    case 'chat': {
      const text = String(msg.text ?? '').slice(0, 80);
      if (!text) return;
      if (text.startsWith('::')) {
        handleCommand(player, text.slice(2));
        return;
      }
      player.chatMessage = text;
      player.chatTicks = 8;
      for (const other of world.activePlayers()) {
        if (other.ignoring(player.username)) continue;
        other.send({ t: 'msg', text: `${player.username}: ${text}`, kind: 'chat' });
      }
      return;
    }

    case 'friend':
      handleFriend(player, msg);
      return;

    case 'ignore':
      handleIgnore(player, msg);
      return;

    case 'privateMessage':
      handlePrivateMessage(player, msg);
      return;

    case 'closeInterface':
      player.closeInterface();
      return;

    case 'makeAmount': {
      const cb = player.makeCallback;
      player.makeCallback = null;
      player.closeInterface();
      cb?.(Math.max(1, msg.amount), msg.option);
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Friends, ignores and private chat                                   */
/* ------------------------------------------------------------------ */

/** RuneScape caps both lists; exceeding it shows "Your friend list is full." */
const MAX_LIST_SIZE = 200;

function sendFriends(player: Player): void {
  player.send({
    t: 'friends',
    list: player.friends.map((name) => ({ name, online: !!world.findPlayer(name) })),
  });
}

/**
 * Tells everyone online who has `player` as a friend that they just logged in
 * or out, and refreshes their list so the status dot updates.
 */
function broadcastFriendStatus(player: Player, online: boolean): void {
  for (const other of world.activePlayers()) {
    if (other === player || !other.friendsWith(player.username)) continue;
    if (other.ignoring(player.username)) continue;
    other.message(`${player.username} has logged ${online ? 'in' : 'out'}.`, 'private');
    sendFriends(other);
  }
}

function handleFriend(player: Player, msg: Extract<ClientMessage, { t: 'friend' }>): void {
  const name = String(msg.name ?? '').trim().slice(0, 12);
  if (!name) return;

  if (msg.action === 'remove') {
    const before = player.friends.length;
    player.friends = player.friends.filter((n) => !sameName(n, name));
    if (player.friends.length !== before) sendFriends(player);
    return;
  }

  if (sameName(name, player.username)) {
    player.message('You are already your own best friend.');
    return;
  }
  if (player.friendsWith(name)) {
    player.message(`${name} is already on your friend list.`);
    return;
  }
  if (player.ignoring(name)) {
    player.message('Please remove them from your ignore list first.');
    return;
  }
  if (player.friends.length >= MAX_LIST_SIZE) {
    player.message('Your friend list is full.');
    return;
  }

  // Store the online player's real display name when we can resolve it.
  player.friends.push(world.findPlayer(name)?.username ?? name);
  sendFriends(player);
}

function handleIgnore(player: Player, msg: Extract<ClientMessage, { t: 'ignore' }>): void {
  const name = String(msg.name ?? '').trim().slice(0, 12);
  if (!name) return;

  if (msg.action === 'remove') {
    const before = player.ignores.length;
    player.ignores = player.ignores.filter((n) => !sameName(n, name));
    if (player.ignores.length !== before) player.sendIgnores();
    return;
  }

  if (sameName(name, player.username)) {
    player.message('You cannot ignore yourself.');
    return;
  }
  if (player.ignoring(name)) {
    player.message(`${name} is already on your ignore list.`);
    return;
  }
  if (player.friendsWith(name)) {
    player.message('Please remove them from your friend list first.');
    return;
  }
  if (player.ignores.length >= MAX_LIST_SIZE) {
    player.message('Your ignore list is full.');
    return;
  }

  player.ignores.push(world.findPlayer(name)?.username ?? name);
  player.sendIgnores();
}

function handlePrivateMessage(player: Player, msg: Extract<ClientMessage, { t: 'privateMessage' }>): void {
  const name = String(msg.name ?? '').trim().slice(0, 12);
  const text = String(msg.text ?? '').trim().slice(0, 80);
  if (!name || !text) return;

  const target = world.findPlayer(name);
  if (!target || target === player) {
    player.message(`Unable to send message - ${name} is not online.`);
    return;
  }

  // The sender always sees their own message, even when the recipient has them
  // on ignore - exactly as the real game behaves.
  player.send({ t: 'private', name: target.username, text, outgoing: true });
  if (target.ignoring(player.username)) return;
  target.send({ t: 'private', name: player.username, text, outgoing: false });
}

/* ------------------------------------------------------------------ */
/* Banking                                                            */
/* ------------------------------------------------------------------ */

function handleBank(player: Player, msg: Extract<ClientMessage, { t: 'bank' }>): void {
  switch (msg.action) {
    case 'close':
      player.closeInterface();
      return;
    case 'setNoted':
      player.bankNoted = !!msg.noted;
      player.sendBank();
      return;
    case 'deposit': {
      if (player.openInterface !== 'bank' || msg.slot === undefined) return;
      const stack = player.inventory.get(msg.slot);
      if (!stack) return;
      const amount = Math.min(msg.amount ?? 1, player.inventory.count(stack.id));
      const moved = player.bank.add(stack.id, amount);
      if (moved === 0) {
        player.message('Your bank is full.');
        return;
      }
      if (isStackable(stack.id)) player.inventory.removeSlot(msg.slot, moved);
      else player.inventory.remove(stack.id, moved);
      player.bank.compact();
      player.sendBank();
      player.sendInventory();
      player.recalculateBonuses();
      return;
    }
    case 'depositAll': {
      for (const [, stack] of [...player.inventory.entries()]) {
        const moved = player.bank.add(stack.id, stack.amount);
        if (moved > 0) player.inventory.remove(stack.id, moved);
      }
      player.bank.compact();
      player.sendBank();
      player.sendInventory();
      player.recalculateBonuses();
      player.sendEquipment();
      return;
    }
    case 'depositEquipment': {
      for (let slot = 0; slot < EQUIP_SLOT_COUNT; slot++) {
        const id = player.equipment.ids[slot];
        if (id < 0) continue;
        const moved = player.bank.add(id, player.equipment.amounts[slot]);
        if (moved > 0) player.equipment.setSlot(slot, -1, 0);
      }
      player.bank.compact();
      player.recalculateBonuses();
      player.sendBank();
      player.sendEquipment();
      return;
    }
    case 'withdraw': {
      if (player.openInterface !== 'bank' || msg.slot === undefined) return;
      const stack = player.bank.get(msg.slot);
      if (!stack) return;
      const wanted = Math.min(msg.amount ?? 1, stack.amount);
      const room = player.inventory.roomFor(stack.id, wanted);
      if (room === 0) {
        player.message('Your inventory is full.');
        return;
      }
      const moved = player.inventory.add(stack.id, room);
      player.bank.removeSlot(msg.slot, moved);
      player.bank.compact();
      player.sendBank();
      player.sendInventory();
      player.recalculateBonuses();
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Shops                                                              */
/* ------------------------------------------------------------------ */

function handleShop(player: Player, msg: Extract<ClientMessage, { t: 'shop' }>): void {
  if (msg.action === 'close') {
    player.closeInterface();
    return;
  }
  const key = player.currentShop;
  if (!key) return;
  const shop = shopDef(key);
  if (!shop) return;
  const stock = shopStock(key);

  if (msg.action === 'value') {
    const entry = stock[msg.slot ?? -1];
    if (!entry) return;
    const price = Math.max(1, Math.round((itemDef(entry.item)?.value ?? 1) * shop.sellRate));
    player.message(`${itemDef(entry.item)?.name}: currently costs ${price} coins.`);
    return;
  }

  if (msg.action === 'buy') {
    const entry = stock[msg.slot ?? -1];
    if (!entry) return;
    const unit = Math.max(1, Math.round((itemDef(entry.item)?.value ?? 1) * shop.sellRate));
    let amount = Math.min(msg.amount ?? 1, entry.amount);
    if (amount <= 0) {
      player.message('The shop has run out of stock.');
      return;
    }
    amount = Math.min(amount, Math.floor(player.inventory.count(995) / unit));
    if (amount <= 0) {
      player.message('You do not have enough coins.');
      return;
    }
    amount = Math.min(amount, player.inventory.roomFor(entry.item, amount));
    if (amount <= 0) {
      player.message('Your inventory is full.');
      return;
    }
    player.inventory.remove(995, unit * amount);
    player.inventory.add(entry.item, amount);
    entry.amount -= amount;
    player.sendInventory();
    sendShop(player, key);
    return;
  }

  if (msg.action === 'sell') {
    const stack = player.inventory.get(msg.slot ?? -1);
    if (!stack) return;
    const def = itemDef(stack.id);
    if (!def || def.untradeable || stack.id === 995) {
      player.message('You cannot sell that.');
      return;
    }
    if (!shop.general && !shop.stock.some((s) => s.item === stack.id)) {
      player.message('You cannot sell that item to this shop.');
      return;
    }
    const unit = Math.max(1, Math.round(def.value * shop.buyRate));
    const amount = Math.min(msg.amount ?? 1, stack.amount);
    player.inventory.removeSlot(msg.slot!, amount);
    player.inventory.add(995, unit * amount);
    const entry = stock.find((s) => s.item === stack.id);
    if (entry) entry.amount += amount;
    else stock.push({ item: stack.id, amount });
    player.sendInventory();
    sendShop(player, key);
  }
}

/* ------------------------------------------------------------------ */
/* Developer commands                                                  */
/* ------------------------------------------------------------------ */

function handleCommand(player: Player, command: string): void {
  const [cmd, ...args] = command.trim().split(/\s+/);
  switch (cmd.toLowerCase()) {
    case 'help':
      player.message('Commands: ::item <name|id> [amount], ::tele <x> <y> [plane], ::setlevel <skill> <level>,');
      player.message('::master, ::heal, ::empty, ::pos, ::players');
      return;
    case 'item': {
      const query = args.slice(0, -1).join(' ') || args[0] || '';
      const maybeAmount = Number(args[args.length - 1]);
      const amount = Number.isFinite(maybeAmount) && args.length > 1 ? maybeAmount : 1;
      const def = /^\d+$/.test(query) ? itemDef(Number(query)) : itemByName(query);
      if (!def) {
        player.message(`No such item: ${query}`);
        return;
      }
      player.inventory.add(def.id, Math.max(1, amount));
      player.sendInventory();
      player.message(`Spawned ${amount} x ${def.name}.`);
      return;
    }
    case 'tele': {
      const x = Number(args[0]);
      const y = Number(args[1]);
      const plane = Number(args[2] ?? player.plane);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      player.teleport(x, y, Number.isFinite(plane) ? plane : 0);
      player.message(`Teleported to ${x}, ${y}, ${plane}.`);
      return;
    }
    case 'setlevel': {
      const name = args[0]?.toLowerCase();
      const level = Math.max(1, Math.min(99, Number(args[1] ?? 1)));
      const skill = SKILL_NAMES.findIndex((s) => s.toLowerCase() === name);
      if (skill < 0) {
        player.message(`Unknown skill: ${name}`);
        return;
      }
      player.xp[skill] = xpForLevel(level);
      player.levels[skill] = level;
      if (skill === Skill.HITPOINTS) {
        player.maxHitpoints = level;
        player.hitpoints = level;
      }
      player.sendStats();
      player.message(`${SKILL_NAMES[skill]} set to ${level}.`);
      return;
    }
    case 'master': {
      for (let i = 0; i < player.xp.length; i++) {
        player.xp[i] = xpForLevel(99);
        player.levels[i] = 99;
      }
      player.maxHitpoints = 99;
      player.hitpoints = 99;
      player.prayerPoints = 99;
      player.sendStats();
      player.message('All skills set to 99.');
      return;
    }
    case 'heal':
      player.hitpoints = player.maxHitpoints;
      player.prayerPoints = levelForXp(player.xp[Skill.PRAYER]);
      player.runEnergy = 10000;
      player.message('Restored.');
      return;
    case 'empty':
      player.inventory.clear();
      player.sendInventory();
      return;
    case 'pos':
      player.message(`You are at ${player.x}, ${player.y}, plane ${player.plane}.`);
      return;
    case 'players':
      player.message(`Online: ${world.activePlayers().map((p) => p.username).join(', ')}`);
      return;
    default:
      player.message(`Unknown command: ${cmd}`);
  }
}

/* ------------------------------------------------------------------ */
/* Main loop                                                           */
/* ------------------------------------------------------------------ */

let lastSave = Date.now();

function gameLoop(): void {
  const started = Date.now();
  try {
    world.process();
  } catch (err) {
    console.error('Tick error:', err);
  }

  for (const [player, socket] of sockets) {
    if (socket.readyState !== socket.OPEN) continue;
    for (const msg of player.outgoing) {
      socket.send(JSON.stringify(msg));
    }
    player.outgoing.length = 0;
  }

  if (world.tick % 100 === 0) restockShops();
  if (Date.now() - lastSave > 60_000) {
    lastSave = Date.now();
    for (const player of world.activePlayers()) savePlayer(player);
  }

  const elapsed = Date.now() - started;
  if (elapsed > TICK_MS) console.warn(`Tick ${world.tick} took ${elapsed}ms`);
  setTimeout(gameLoop, Math.max(0, TICK_MS - elapsed));
}

http.listen(PORT, () => {
  console.log(`Old School RuneScape clone`);
  console.log(`  game server listening on port ${PORT}`);
  console.log(`  world: ${world.npcs.length} NPCs, ${world.map.objects.length} objects`);
  if (existsSync(CLIENT_DIR)) console.log(`  client: http://localhost:${PORT}/`);
  else console.log(`  client: run "npm run dev" and open http://localhost:5173/`);
});

gameLoop();

process.on('SIGINT', () => {
  console.log('\nSaving players...');
  for (const player of world.activePlayers()) savePlayer(player);
  process.exit(0);
});

export { world };

