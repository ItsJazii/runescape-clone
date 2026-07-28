# Development

## Setup

```bash
npm install
npm run dev
```

`npm run dev` runs two processes under `concurrently`:

| Process | Port | What |
| --- | --- | --- |
| `tsx watch src/server/index.ts` | 43594 | The game server; restarts on any change under `src/server/` or `src/shared/` |
| `vite` | 5173 | The client with hot module reload |

Play on <http://localhost:5173/>. The client detects port 5173 and connects its
websocket across to 43594 (see [protocol.md](protocol.md#connecting)), so both
ports need to be up.

There is no build step in development, no transpile cache to clear, and no
password — type a name and play.

## Commands

| Command | What it does | Needs a server |
| --- | --- | --- |
| `npm run dev` | Server + client with reload | — |
| `npm start` | Production server, serves `dist/client` | — |
| `npm run build` | `tsc --noEmit` then `vite build` | — |
| `npm run typecheck` | Typecheck only, including tests | — |
| `npm test` | 122 unit tests | no |
| `npm run check:play` | 91 checks over a raw websocket | **yes** |
| `npm run check:client` | 50 checks through real Chromium | **yes** |
| `npm run check:social` | Friends, ignore and private chat | **yes** |
| `npm run shots:world` | Captures the 3D view at nine landmarks | **yes** |
| `npm run shots:tabs` | Captures interface tabs with hover readouts | **yes** |
| `npm run shots:combat` | Captures frames mid-fight to check animations | **yes** |

## Verification

Run all of these before calling a change done:

1. **`npm test`** — pure logic: the XP table, combat formulas, containers,
   pathfinding, persistence, tasks, and the animation poses.
2. **`npm run build`** — typechecks *and* rebuilds `dist/client`.
3. **`npm start`** (or leave `npm run dev` running), then **`npm run check:play`**
   — drives movement, every skill, combat, aggression, death, banking, shops,
   dialogue, prayer, magic and examine against the live server and asserts on
   the replies. Prints `N passed, M failed`.
4. **`npm run check:client`** — the same game played through a browser: clicking
   the ground, right-click menus, every tab, inventory, shop, bank. Catches
   picking and rendering regressions the wire-level probe cannot see.
5. **`npm run check:social`**.
6. **`npm run shots:*`** — then actually look at the PNGs in `tools/shots/`.

`check:play` and `check:client` are the real safety net. They are not smoke
tests; they play the game and assert on outcomes.

## Debugging

### `window.game`

The client exposes a read-only debug hook, defined at the bottom of
`src/client/main.ts`. Nothing in the game reads it back, so it cannot change
behaviour. It is how the browser harness sees what a human would see:

```js
window.game.self            // position, plane, hp, current animation
window.game.npcs            // visible NPCs with position, hp and animation
window.game.inventory       // 28 slots with item names
window.game.equipment       // 14 worn slots, RuneScape slot numbering
window.game.levels, .tasks, .chat, .menu, .interface, .dialogue
window.game.activeTab, .hoverText
window.game.npcScreenPos(name)      // where an NPC is on screen
window.game.objectScreenPos(name)   // where an object is on screen
window.game.hoverAt(sx, sy)         // what a left click there would do
window.game.tileAt(sx, sy)          // which tile a pixel maps to
window.game.camera
window.game.send(msg)               // inject a raw client message
```

`npcScreenPos` and `objectScreenPos` **only return positions inside the
viewport**. Projecting something off-screen and clicking it lands on the side
panel instead, which looks exactly like broken picking.

### Debug commands

Type these in chat: `::help`, `::item <name|id> [amount]`, `::tele <x> <y> [plane]`,
`::setlevel <skill> <level>`, `::master`, `::heal`, `::empty`, `::pos`, `::players`.

### Screenshot coordinates

Screenshots are captured at 1530x1006, exactly 2x the game's 765x503 layout, so
**screenshot coordinates = game coordinates x 2**. Layout constants live at the
top of `src/client/ui/ui.ts`.

## Gotchas

These have all cost real time.

**`npm start` serves a stale client.** The production server serves
`dist/client`, so until you re-run `npm run build` you are testing the old
bundle. Console errors that look like real bugs are usually this. It also bites
`check:client`, which connects to port 43594 — if a check needs a client change
you just made, rebuild first.

**Orphaned server processes.** Killing the shell running the server does not
always kill the node child, leaving 43594 bound so the next start dies with
`EADDRINUSE`:

```powershell
Get-NetTCPConnection -LocalPort 43594 -State Listen
```

Stop the owning PID. The same applies to test clients — a stale connection keeps
a character "already logged in" and further logins are refused.

**The server flushes once per tick.** Any script must wait longer than 600ms
after sending before asserting on a reply.

**`data/players/*.json` persists between runs.** Anything touching friends,
ignores, skills or position must reset its own state first. This is the single
biggest source of tests that pass once and then fail forever:

- `::empty` clears the **inventory only** — worn equipment survives, so an item
  wielded by an earlier run will swap *back into* the bag next time. Assert on
  `window.game.equipment[slot]`, not on the item's absence from the inventory.
- **`::tele x y` keeps your current plane.** If a run ends upstairs in the bank
  (plane 2), every plane-less teleport in the next run stays up there and every
  object appears to have vanished, because lookups are per-plane. Always write
  `::tele x y 0`.
- Pass a fresh character name when a run leaves an account somewhere odd:
  `npm run check:play -- ws://localhost:43594 ProbeX`.

**NPCs wander.** A test that needs to stand next to one must re-locate it rather
than trusting a spawn coordinate. `tools/play-check.ts` has `stepOntoNpc()`.

**Aggression is capped by combat level.** `NpcDef.aggroMaxLevel` (15 for a Dark
wizard) means a boosted account is ignored. Reset combat stats before testing
aggro.

**Overlays must be declared.** UI drawn inside the viewport has to be listed in
`UI.overlayCoversViewport()`, or world-space labels, hitsplats and the click
marker paint straight over it.

**Panel content must fit `PANEL.h` (261px).** Skills, Prayer, Magic and Getting
Started all draw a grid plus a description strip; overflow spills into the bottom
tab row at y=466 instead of being clipped.

## Testing notes

Tests are `node:test` via `tsx`, in `src/test/*.test.ts`. They import server and
client modules directly — `src/client/gl/mesh.ts` and `animation.ts` are
DOM-free, so poses and meshes can be asserted in Node without a browser, and
`src/test/animation.test.ts` does exactly that by building each NPC mesh and
checking that its attack pose moves bones the mesh actually has.

`new World()` builds the whole map in a few hundred milliseconds, and
`new Player(name)` needs no socket (`send()` just appends to `outgoing`), so
server behaviour can be unit-tested directly without standing anything up.

When adding a pose or animation, remember the poses are sine-based: at `t = 0`
and `t = 1` they evaluate to values like `1e-16` rather than exactly zero, so
compare against an epsilon.

## Conventions

- Strict TypeScript throughout, ES modules, `.ts` extensions in import
  specifiers, no build step in development.
- Shared code goes in `src/shared/` and must not import from `src/server/` or
  `src/client/`. The client rebuilds the world map locally from shared code
  rather than downloading it.
- Game data lives in `src/shared/data/` as plain tables, generated
  programmatically where the real game is regular (equipment tiers, spell
  tiers) rather than written out by hand.
- The wire protocol is a discriminated union in one file, so both sides
  typecheck against the same contract.
- Comments explain *why*, not *what*.
