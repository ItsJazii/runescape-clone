# Wire protocol

Both directions are **JSON text over a WebSocket**, and every message is a
tagged union discriminated by a `t` field. The types are defined once in
`src/shared/net.ts` and imported by both sides, so the protocol typechecks
end-to-end: the server cannot send a message shape the client does not handle.

## Connecting

The client picks its URL in `Connection.connect()` (`src/client/net.ts`):

```ts
const isDev = location.port === '5173' || location.port === '' || location.protocol === 'file:';
const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const url = isDev ? `${proto}//${location.hostname || 'localhost'}:${DEFAULT_PORT}` : `${proto}//${location.host}`;
```

So under Vite on `:5173` it reaches across to the game server on
`DEFAULT_PORT` (43594, RuneScape's own port), and in production it just uses
whatever host served the page. Messages sent before the socket opens are queued
and flushed on connect, with `login` always first.

## Client to server

| `t` | Payload | Purpose |
| --- | --- | --- |
| `login` | `name` | Join the world under a display name |
| `walk` | `x`, `y`, `ctrl?` | Walk to a tile |
| `walkMinimap` | `x`, `y` | Walk to a tile picked on the minimap |
| `objectAction` | `id`, `x`, `y`, `action` | Interact with scenery (Chop, Mine, Open, Climb-up...) |
| `npcAction` | `npc`, `action` | Interact with an NPC (Attack, Talk-to, Trade, Bank...) |
| `playerAction` | `player`, `action` | Attack, Follow or Examine another player |
| `groundItemAction` | `item`, `x`, `y`, `action` | Take or examine an item on the floor |
| `itemAction` | `slot`, `item`, `action` | Inventory action (Wear, Eat, Bury, Drop, Use...) |
| `itemOnItem` | `slotA`, `slotB` | Combine two inventory items |
| `itemOnObject` | `slot`, `id`, `x`, `y` | Use an item on scenery (ore on furnace, logs on fire) |
| `itemOnNpc` | `slot`, `npc` | Use an item on an NPC |
| `swapSlots` | `from`, `to` | Rearrange the inventory |
| `equipAction` | `slot`, `action` | Act on a worn item (Remove, Examine) |
| `bank` | `action`, `slot?`, `amount?`, `noted?` | `deposit`, `withdraw`, `depositAll`, `depositEquipment`, `setNoted`, `close` |
| `shop` | `action`, `slot?`, `amount?` | `buy`, `sell`, `value`, `close` |
| `dialogue` | `option?` | Advance dialogue, or pick an option |
| `setStyle` | `index` | Choose an attack style |
| `setAutoRetaliate` | `on` | Toggle auto-retaliate |
| `prayer` | `id` | Toggle a prayer |
| `toggleRun` | — | Toggle running |
| `castSpell` | `spell`, `targetType`, `target?` | Cast at an `npc`, `player`, `item` or `none` |
| `autocast` | `spell` | Set or clear the autocast spell (`null` clears) |
| `chat` | `text` | Public chat, or a `::command` |
| `friend` | `action`, `name` | `add` or `remove` |
| `ignore` | `action`, `name` | `add` or `remove` |
| `privateMessage` | `name`, `text` | Send a private message |
| `closeInterface` | — | Close whatever is open |
| `makeAmount` | `amount`, `option` | Answer a "how many?" prompt |
| `ping` | — | Keepalive; answered with `pong` |

## Server to client

| `t` | Payload | Purpose |
| --- | --- | --- |
| `init` | `index`, `name`, `tick` | Handshake: your entity index and the current tick |
| `sync` | see below | The per-tick world snapshot |
| `stats` | `xp[]`, `levels[]`, `combat`, `totalLevel`, `totalXp` | Full skills refresh |
| `inv` | `items[]`, `amounts[]` | Inventory contents |
| `equip` | `items[]`, `amounts[]`, `bonuses`, `weight` | Worn equipment and resulting bonuses |
| `bank` | `items[]`, `amounts[]`, `noted` | Bank contents |
| `shop` | `name`, `items[]` (`id`, `amount`, `price`) | Shop stock |
| `msg` | `text`, `kind?` | Chatbox line (`game`, `chat`, `trade`, `system`, `private`) |
| `dialogue` | `entity`, `lines[]`, `options?`, `title?` | Open a dialogue box |
| `iface` / `closeIface` | `id`, `data?` / — | Open or close an interface |
| `makeAmount` | `options[]`, `title` | Ask which product and how many |
| `xp` | `skill`, `amount` | XP drop, for the floating counter |
| `levelup` | `skill`, `level` | Level-up notification |
| `prayers` | `active[]` | Which prayers are lit |
| `style` | `index`, `autoRetaliate`, `autocast` | Combat option state |
| `design` | `look[]` | Character appearance |
| `friends` | `list[]` | Friends and their online state |
| `ignores` | `list[]` | Ignored names |
| `private` | `name`, `text`, `outgoing` | A private message in either direction |
| `tasks` | `done[]` | Completed Getting Started task ids |
| `sound` | `name` | Play a sound effect |
| `pong` | — | Reply to `ping` |

## The `sync` message

Sent to every player once per tick. It carries the whole visible world, so there
is no separate "entity added/removed" protocol — the client diffs against what it
already has.

| Field | Meaning |
| --- | --- |
| `tick` | Server tick this snapshot describes |
| `self` | Your own `NetPlayer` |
| `players` | Other visible players |
| `npcs` | Visible NPCs |
| `items` | Visible ground items |
| `projectiles` | Projectiles launched this tick |
| `spotanims` | Spot graphics started this tick |
| `objects` | Objects that differ from the built map (`x`, `y`, `p`, `id`, `rot`, `type`, `original`) |
| `run` | Run energy |
| `runOn` | Whether running is toggled on |
| `spec` | Special attack energy |
| `prayer` | Prayer points |

Visibility is `VIEW_DISTANCE` (24 tiles, Chebyshev) on the same plane.

### Rendered entities

Field names are terse because this goes out every 600ms to every player.

| Field | Meaning |
| --- | --- |
| `i` | Server entity index (stable identity) |
| `x`, `y`, `p` | Tile position at the **end** of this tick, and plane |
| `d` | Facing direction, 0-7, or -1 |
| `a` | Current animation name |
| `at` | Tick the animation started on |
| `hp`, `maxHp` | Hitpoints |
| `mv` | Movement kind: 0 stand, 1 walk, 2 run, 3 teleport |
| `wp?` | Intermediate tiles stepped through this tick (a run crosses two) |
| `face?` | Tile the entity is turned towards, for combat lock-on |
| `hits?` | Hitsplats applied this tick: `{ dmg, type }` |
| `oh?` | Overhead prayer icon |
| `msg?` | Chat message to show above the head |

`NetPlayer` additionally carries `name`, `combat`, `eq` (worn item ids by slot,
-1 for empty), `look` (appearance) and `skulled?`. `NetNpc` adds `def`, its
definition id.

Because `a` and `at` are both sent every tick, replaying the *same* animation
still registers on the client: the name is unchanged but `at` moves, and
`state.ts` restarts on a change to either.

### Projectiles and spot animations

`NetProjectile` is `from {x,y}`, `to {x,y}`, `gfx`, `startTick`, `duration` (in
ticks) and `arcHeight`, so the client can fly an arrow along an arc that lands
exactly when the damage does. `NetSpotAnim` is `x`, `y`, `gfx`, `startTick` and
`height`.

Both lists are cleared at the start of every tick, so they only ever describe
things that began during that tick.

## Flow control

The server never writes to a socket mid-tick. `Player.send()` appends to
`Player.outgoing`, and the game loop in `src/server/index.ts` drains every
player's queue once per tick after `world.process()`:

```ts
for (const [player, socket] of sockets) {
  if (socket.readyState !== socket.OPEN) continue;
  for (const msg of player.outgoing) socket.send(JSON.stringify(msg));
  player.outgoing.length = 0;
}
```

Two consequences worth knowing:

- Anything scripting this server must wait **longer than 600ms** after sending
  before asserting on the reply. Most flakiness in integration tests is this.
- A tick's messages arrive as a batch, so a single action can produce `inv`,
  `stats`, `xp` and `msg` together and the client sees them atomically.
