# Architecture

## The model

The server is authoritative. It owns the entire simulation and advances it on a
fixed **600ms tick** (`TICK_MS` in `src/shared/constants.ts`), the same tick
length the real engine uses. Every combat roll, XP award, item movement, NPC
decision and object change happens on the server, and the client is told the
result.

The client decides only what cannot affect the game: camera angle, which
interface tab is open, inventory drag-and-drop arrangement, and what to render
between ticks. It sends *intents* ("walk here", "attack that", "wield this") and
never outcomes.

That split is why the client can be rewritten freely without touching game
balance, and why `tools/play-check.ts` can drive the whole game over a raw
websocket with no browser at all.

```
browser                                    node
+------------------+   intents (JSON)   +---------------------+
|  input -> net.ts | -----------------> |  index.ts dispatch  |
|                  |                    |         |           |
|  state.ts        | <----------------- |  world.ts tick loop |
|  (interpolates)  |   sync, once/tick  |         |           |
|      |           |                    |  player/npc/combat  |
|  gl/ + ui/       |                    |  actions/dialogue   |
+------------------+                    +---------------------+
```

## The tick loop

`World.process()` in `src/server/world.ts` is the heart of the server. The order
of its phases matters, and a surprising number of behaviours fall out of it:

```ts
process(): void {
  this.tick++;
  this.projectiles.length = 0;
  this.spotAnims.length = 0;

  this.processPlayers();      // 1
  this.processNpcs();         // 2
  this.processQueuedHits();   // 3
  this.processTimers();       // 4
  this.processWorldObjects(); // 5
  this.processGroundItems();  // 6
  this.sendUpdates();         // 7

  for (const player of this.activePlayers()) player.clearTickState();
  for (const npc of this.npcs) npc.clearTickState();
}
```

1. **`processPlayers()`** — decrement `attackDelay`, `inCombat`, `actionDelay`
   and chat timers; run combat against the current target (attacking if in
   range, otherwise pathing towards it); `processMovement()`; drain or restore
   run energy; fall back to the idle animation; then `processPending()` for
   walk-then-do interactions, and finally tick the active skilling `action`.
2. **`processNpcs()`** — drop targets that died, logged out or fled beyond 12
   tiles; acquire aggression targets via `findAggroTarget()`; attack or path to
   the target; otherwise wander within the spawn radius. NPCs never run.
3. **`processQueuedHits()`** — applies damage scheduled for this tick. Ranged
   and magic hits land here, several ticks after the animation that threw them.
4. **`processTimers()`** — prayer drain, hitpoint regeneration, and boosted or
   drained stats crawling back towards base level.
5. **`processWorldObjects()`** — restore doors, regrow trees, expire fires.
6. **`processGroundItems()`** — age the owner-only window, despawn, respawn.
7. **`sendUpdates()`** — build each player's `sync` message from everything
   within `VIEW_DISTANCE` (24 tiles) and queue it.

**Players are processed before NPCs.** So when a player and an NPC both act on
the same tick, the player's attack resolves first. This is also why an NPC that
is struck on the same tick it swings will show its own attack animation rather
than a flinch: the flinch is applied during phase 1, and the NPC overwrites it
during phase 2.

Note that `projectiles` and `spotAnims` are cleared at the *start* of the tick.
They are single-tick announcements: whatever is added during a tick is broadcast
by `sendUpdates()` and then forgotten.

### Flushing

`process()` only *queues* messages, onto each `Player.outgoing` array. The
socket write happens in the game loop in `src/server/index.ts`, once per tick,
after `world.process()` returns. Anything talking to this server must therefore
wait longer than 600ms before asserting on a reply.

## Entities

`src/server/entity.ts` defines the abstract `Entity` shared by players and NPCs:
position and `plane`, `size`, `direction`, hitpoints, the current `animation`
plus the `animationTick` it started on, this tick's `hits`, the queued `path`,
`moveKind`, and combat state (`target`, `attackDelay`, `inCombat`,
`lastAttacker`).

`Player` adds skills, the three containers (inventory, equipment, bank),
bonuses, prayers, combat style, run energy, friends and ignores, quest and task
progress, the open interface and dialogue state, and the `outgoing` queue.
`Npc` adds its static `NpcDef`, spawn position, respawn and wander timers, and a
`damageBy` map used to decide who earns the drop.

### Movement and interpolation

`processMovement()` advances one tile per tick when walking and two when
running. When it takes two steps it records the intermediate tile in
`waypoints`, and that array is sent to the client so a run can be interpolated
through the tile it passed through rather than cutting the corner.

`moveKind` tells the client how to animate:

| Value | Meaning |
| --- | --- |
| 0 | Standing |
| 1 | Walking (one tile this tick) |
| 2 | Running (two tiles this tick) |
| 3 | Teleported (do not interpolate) |

## The world

The map is not loaded from files — it is *built* by code.
`src/shared/world/builder.ts` provides a `MapBuilder` with primitives like
`fill()`, `building()`, `wall()`, `object()`, `fenceRect()`, `path()`, `river()`
and `scatter()`, and `src/shared/world/lumbridge.ts` calls them to lay out the
world. `getWorld()` in `src/shared/world/index.ts` builds it once and caches it,
and because it lives in `shared/` the client builds an identical copy rather
than downloading a map.

The result is a `WorldMap`: 256x256 tiles over 4 planes, with vertex `heights`,
`underlay`/`overlay` terrain ids, `tileFlags`, placed `objects`, NPC and item
spawns, named `areas` and teleport `links`. A tile is 128 world units and each
plane sits 240 units above the last.

Collision (`collision.ts`) is a flag field per tile. Walls are stored on both
sides of the edge they block, so `canMove()` can validate a step from either
tile, and diagonal movement additionally requires both orthogonal neighbours to
be clear — the same rule the real game uses. `hasLineOfSight()` walks the line
between two tiles and is what gates ranged and magic attacks.

Pathfinding (`pathfinding.ts`) is a **breadth-first search** over a bounded
region, not A*. Because every step costs the same, BFS returns a shortest path
without needing a heuristic, and the bounded region keeps the worst case cheap.
When the exact target is unreachable it returns a path to the nearest reachable
tile, so clicking into a wall still walks you as close as it can.

Objects are looked up by a `"x,y,plane"` key. Static objects come from the built
map; anything that changes at runtime (an opened door, a chopped tree, a lit
fire) goes into a `dynamicObjects` overlay with an optional restore tick, and
`sendUpdates()` ships only that overlay to clients.

## Rendering

Two stacked canvases make up the game:

| Canvas | Size | Purpose |
| --- | --- | --- |
| `#world` | 512x334 | WebGL2 3D scene, scaled by device pixel ratio |
| `#ui` | 765x503 | 2D interface, drawn at fixed logical size |

Every mesh is generated at runtime by `MeshBuilder` (`gl/mesh.ts`) from
primitives — boxes, cylinders, spheres, plates — with a transform stack and
per-triangle normals for flat shading. Meshes are cached by key. Scenery models
live in `gl/objectmodels.ts` and characters in `gl/actormodels.ts`; both use
deterministic noise so the same tree looks the same every time.

Characters are skinned to **14 bones** (`BONE` in `gl/actormodels.ts`): root,
torso, head, two arms, two legs, weapon, shield, cape, tail and two spares. The
skeleton is flat, not hierarchical — `buildBoneMatrices()` computes each bone
independently as *world transform x local rotation about that bone's pivot* —
so a pose that rotates the torso does not carry the arms with it, and poses have
to move each bone explicitly.

`gl/animation.ts` holds the poses. `poseFor(anim, t, cycle, quadruped)` returns
a rotation/translation per bone, where `t` runs 0..1 for one-shot animations and
`cycle` is a free-running phase for looping ones. Four-legged models reuse
`ARM_L`/`ARM_R` for hind legs and pincers, so they take separate branches; see
[the quadruped note in gameplay.md](gameplay.md#animation).

The camera uses a 38-degree vertical FOV at a default distance of 1480, which
puts a 128-unit tile at roughly 42 pixels — about 13 tiles across the 512px
viewport, matching the real client's framing. `window.game.tileAt(sx, sy)` will
tell you which tile a pixel maps to if you need to re-measure.

## Client state and interpolation

`src/client/state.ts` holds the client's mirror of the server plus everything
needed to render between ticks. Each `sync` sets an entity's authoritative
end-of-tick position; `interpolate(now, dt)` then runs every frame and computes
`progress = (now - lastSyncAt) / TICK_MS`, walking through
`[previous position, ...waypoints, new position]` to get a smooth `renderX` /
`renderY`.

Facing is eased towards the target angle rather than snapped, walk cycles
advance with real elapsed time so animation speed does not depend on framerate,
hitsplats fade after 1.2s and chat bubbles expire after 5s.

Animation timing is reconstructed from `state.tick - view.animStart` plus the
fraction of the current tick that has elapsed, divided by the animation's
duration in ticks. Once that exceeds 1.05 the entity falls back to `idle`, which
is why the server can leave `animation` set to the last thing that happened
without the client freezing on that pose.

## The interface

`src/client/ui/ui.ts` draws the entire interface to a 2D canvas at a fixed
765x503 layout. The constants at the top of the file are the source of truth:

```ts
VIEWPORT = { x: 4,   y: 4,   w: 512, h: 334 }
CHAT     = { x: 0,   y: 338, w: 519, h: 165 }
PANEL    = { x: 548, y: 205, w: 190, h: 261 }
TAB_ROW_TOP = 168, TAB_ROW_BOTTOM = 466
```

There are 14 tabs in two rows of seven (`tabW = 33`, `startX = 524`): Combat
Options, Skills, Getting Started, Inventory, Worn Equipment, Prayer, Magic, Chat
Channel, Friends List, Ignore List, Logout, Options, Emotes, Music Player. Panel
content must fit `PANEL.h`, or it spills into the bottom tab row.

Item sprites are drawn procedurally in `ui/icons.ts`, and skill, prayer and
spell glyphs in `ui/glyphs.ts`. Each is rendered once into a small offscreen
canvas and cached.

## Module map

| Path | Responsibility |
| --- | --- |
| `src/shared/constants.ts` | Tick length, world size, view distance, container sizes, port |
| `src/shared/net.ts` | The wire protocol: `ClientMessage` and `ServerMessage` unions |
| `src/shared/combat.ts` | Accuracy and max-hit formulas, bonuses, weapon types, attack styles |
| `src/shared/skills.ts` | Skill list, XP table, level and combat-level maths |
| `src/shared/data/` | Static content: items, equipment, NPCs, objects, shops, spells, prayers, skilling, tasks |
| `src/shared/world/` | `builder.ts` map primitives, `lumbridge.ts` the map itself, `terrain.ts`, `collision.ts`, `pathfinding.ts` |
| `src/server/index.ts` | HTTP + websocket, packet dispatch, login/logout, persistence, debug commands |
| `src/server/world.ts` | Tick loop, entity sync, queued hits, death and loot, object and item lifetimes |
| `src/server/entity.ts` | Shared entity base: movement, damage, animation, facing |
| `src/server/player.ts` | Skills, containers, bonuses, prayers, style, appearance, serialisation |
| `src/server/npc.ts` | NPC instance state: spawn, respawn, wander, damage credit |
| `src/server/container.ts` | Inventory/bank/equipment with RuneScape stacking rules |
| `src/server/actions.ts` | Every object, item and NPC interaction, and all skilling loops |
| `src/server/combat.ts` | Attacking, damage application, flinch, projectile scheduling |
| `src/server/dialogue.ts` | Dialogue trees and quest scripting |
| `src/client/main.ts` | Frame loop, input, camera, picking, render orchestration, `window.game` |
| `src/client/state.ts` | Client mirror of the server plus per-frame interpolation |
| `src/client/net.ts` | Websocket connection and message plumbing |
| `src/client/gl/renderer.ts` | WebGL2 setup, shaders, bone uniforms, draw calls |
| `src/client/gl/worldscene.ts` | Terrain chunking, height queries, object placement, minimap |
| `src/client/gl/mesh.ts` | Procedural mesh builder |
| `src/client/gl/actormodels.ts` | Character models and the bone skeleton |
| `src/client/gl/animation.ts` | Bone poses for every animation, and matrix construction |
| `src/client/gl/objectmodels.ts` | Procedural scenery models |
| `src/client/ui/ui.ts` | The whole 2D interface |
| `src/client/ui/icons.ts`, `glyphs.ts` | Procedural item sprites and skill/prayer/spell glyphs |
