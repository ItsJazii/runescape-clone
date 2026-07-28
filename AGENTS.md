# osrs-clone

An Old School RuneScape clone: authoritative 600ms-tick Node server + WebGL2 browser client.

## Layout

| Path | Contents |
| --- | --- |
| `src/shared/` | Code used by both sides: wire protocol (`net.ts`), combat maths, skills/xp, item & NPC data, Getting Started tasks, world/collision/pathfinding |
| `src/server/` | Authoritative simulation: `index.ts` (http + websocket + packet dispatch), `world.ts` (tick loop, entity sync), `player.ts`, `actions.ts`, `combat.ts`, `dialogue.ts` |
| `src/client/` | `main.ts` (frame loop), `state.ts` (interpolated view of the server), `gl/` (WebGL2 renderer), `ui/ui.ts` (the whole 765x503 fixed-mode interface, drawn to a 2D canvas), `audio/` (procedural music and sound effects) |
| `src/test/` | `node:test` unit tests |
| `tools/` | Verification harnesses (see below) |
| `docs/` | Published documentation: `architecture.md`, `protocol.md`, `gameplay.md`, `development.md` |
| `data/players/` | JSON save files, gitignored |

## Commands

```
npm run dev            # server + vite client with hot reload
npm start              # production server, serves dist/client on :43594
npm run build          # tsc --noEmit && vite build
npm run typecheck      # tsc --noEmit (covers src/**/*.ts, including tests)
npm test               # 134 unit tests, no server needed
npm run check:play     # 97-check full gameplay probe over the wire, NEEDS a running server
npm run check:client   # 64-check Playwright run that plays through the real UI, NEEDS a server
npm run check:social   # friends/ignore/private-chat integration check, NEEDS a running server
npm run shots:tabs     # captures the Skills/Prayer/Magic tabs with hover readouts
npm run shots:world    # captures the 3D view at nine landmarks
npm run shots:combat   # captures frames mid-fight, tagged with the live animation state
```

## Verification

Run all of these before considering a change done:

1. `npm test` — pure logic (xp table, combat formulas, containers, pathfinding, persistence, tasks).
2. `npm run build` — typechecks and bundles. **The client is served from `dist/client`, so `npm start` serves a stale bundle until you rebuild.** Console errors that look like real bugs are often just a stale `dist`.
3. `npm start`, then `npm run check:play` — drives movement, every skill, combat, aggression, death, banking, shops, dialogue, prayer, magic and examine against the live server and asserts on the replies. Prints `N passed, M failed`.
4. `npm run check:client` — the same game played through the browser: clicks the ground, right-click menus, tabs, inventory, shop, bank. Catches picking/rendering regressions the wire-level probe cannot.
5. `npm run check:social` — needs a server on :43594.
6. `npm run shots:tabs` / `npm run shots:world` — read the PNGs in `tools/shots/` to eyeball the interface and the 3D view.

Screenshots are 1530x1006, exactly 2x the game's 765x503 layout, so **screenshot coords = game coords x 2**. UI layout constants live at the top of `src/client/ui/ui.ts` (`VIEWPORT`, `CHAT`, `PANEL`, `TAB_ROW_TOP/BOTTOM`). Tab strip: `tabW = 33`, `startX = 524`, top row = tabs 0-6, bottom row = tabs 7-13. **Tab 10 is Logout — do not click it in a screenshot run.**

`window.game` is a read-only debug hook the client exposes (defined at the bottom of `src/client/main.ts`). `tools/client-check.mjs` uses it to read the player, chatbox, inventory, worn equipment, NPCs (including their current animation), open interface, context menu and task list, and to resolve on-screen positions with `npcScreenPos(name)` / `objectScreenPos(name)`. Those helpers **only return positions inside the viewport** — projecting an off-screen object and clicking it lands on the side panel instead, which looks exactly like broken picking.

## Gotchas

- **Orphaned server processes.** Killing the shell running `npm start` does not always kill the node child, leaving :43594 bound and the next `npm start` dying with `EADDRINUSE`. Check with
  `Get-NetTCPConnection -LocalPort 43594 -State Listen` and stop the owning PID. The same applies to test clients: a stale connection keeps a character "already logged in", so logins are refused.
- **Server flushes once per tick.** Each player's `outgoing` queue is sent in the game loop, so any integration script must wait longer than 600ms after sending before asserting on a reply.
- **`data/players/*.json` persists between runs.** Anything touching friends/ignores/skills must reset its own state first; `tools/social-check.ts` does this explicitly. `check:play` also carries state forward within a run, so pass a fresh character name (`npm run check:play -- ws://localhost:43594 ProbeX`) when a run leaves the account somewhere odd.
- **`::tele x y` keeps your current plane.** After the stairs test the probe is on plane 1, and every later `::tele` without an explicit third argument stays there — objects then "vanish" because `world.findObject` searches the player's plane. Always write `::tele x y 0`.
- **`::empty` clears the inventory only** — worn equipment survives the reset, so an item a previous run wielded swaps *back into* the bag when you wield another. Assert on `window.game.equipment[slot]` rather than on the item being absent from the inventory.
- **Character bones are flat, not hierarchical** (`buildBoneMatrices`): rotating `TORSO` does not carry the arms, so a pose must drive every bone it needs. Four-legged models (`isQuadruped()` in `gl/animation.ts`) reuse `ARM_L`/`ARM_R` as hind legs and pincers and sit far below the humanoid pivots, so arm-driven poses must never be applied to them — drive `ROOT`/legs/tail instead. `src/test/animation.test.ts` guards this by building each NPC mesh and asserting its attack pose moves bones the mesh actually has.
- **Poses are sine-based**, so at `t = 0` and `t = 1` they evaluate to ~`1e-16`, not exactly zero. Compare against an epsilon.
- **`playAnimation` must be stamped with the current tick.** `animationFor` computes `elapsedTicks = state.tick - animStart` and falls back to `idle` once `t > 1.05`, so a constant start tick means the animation is permanently "already finished" and never renders. Smelting, smithing and crafting passed a literal `0` for exactly this reason — they had no `world` in scope — and so never animated at all, and the per-swing sound fired once per action instead of once per item. `PlayerAction.tick` now receives `worldTick` for this.
- **NPCs wander**, so any test that needs to stand next to one must re-locate it rather than trusting a spawn coordinate. `tools/play-check.ts` has `stepOntoNpc()` for this.
- **A probe that teleports next to its target cannot see reachability bugs.** Fishing shipped completely broken this way: fishing spots are NPCs standing on water and three of the four net spots sat in open water with no walkable tile touching them, so clicking one only ever said `I can't reach that!` — but `check:play` teleported onto the bank first, so all 91 checks passed. `anchorFishingSpots()` in `src/shared/world/lumbridge.ts` now snaps every spot onto a water tile whose bank belongs to a walkable region of at least 400 tiles, and `src/test/world.test.ts` asserts it. When adding an interaction, make the probe **walk** to it.
- **Reachability is not "flood fill from `SPAWN_POINT`".** The spawn is inside Lumbridge Castle courtyard, and closed doors block `canMove`, so that fill reaches only 137 tiles. Use connected-region size to tell open countryside from an enclosed pocket.
- **`findPath` only accepts orthogonally adjacent goals** (`adjacent: true`), while `processPending` accepts Chebyshev range 1. A target whose only walkable neighbours are diagonal is therefore unreachable even though the range check would have allowed it.
- **Aggression is capped by combat level.** `NpcDef.aggroMaxLevel` (15 for a Dark wizard) means a boosted test account is ignored; reset the combat stats before testing aggro.
- UI overlays drawn inside the viewport must be listed in `UI.overlayCoversViewport()`, otherwise world-space labels, hitsplats and the click marker paint on top of them.
- **Panel content must fit `PANEL.h` (261px).** The Skills, Prayer, Magic and Getting Started tabs all draw a grid plus a description strip; overflow spills into the bottom tab row at y=466 rather than being clipped.

## Audio

There are no sound files. `src/client/audio/engine.ts` synthesises everything from oscillators and filtered noise; `src/client/audio/tracks.ts` holds the music as a key, a chord progression and a melody in **scale degrees**, and compiles that into the bass, pad, arpeggio and lead the sequencer plays. Track data is pure logic with no WebAudio in it, so `src/test/audio.test.ts` can test the compiler in node — only the oscillator layer needs a browser.

- **Browsers refuse to start an AudioContext without a user gesture**, so `audio.start()` is called from the login button's click handler. Nothing exists before that.
- Notes are handed to the WebAudio clock half a second ahead (`LOOKAHEAD`), which is why the music does not stutter when the frame rate does. Notes more than 250ms in the past are dropped rather than dumped all at once when a backgrounded tab regains focus.
- **Music follows the player's area.** `AREA_TRACKS` keys must match the names in `namedAreas()` exactly; a typo does not throw, the music just silently never changes. `src/test/audio.test.ts` asserts both directions of that mapping.
- Sound effects are queued by name onto `GameState.soundQueue` and drained once per frame by `main.ts`. Most are inferred client-side from data already on the wire — skilling fires off the animation start tick changing, combat off hitsplats, so no new packets were needed. Only `door` and `coins` are pushed by the server via `{ t: 'sound' }`. Because the trigger is the start tick, **any action that wants a per-swing sound must stamp `playAnimation` with `worldTick`**.
- **Muting music calls `stopTrack()`, which clears the current track.** Unmuting therefore has to start one again; `updateAudio` restarts the area's track whenever music is enabled, unpinned and silent, not only on an area change, or the game sits silent with the toggle reading "On".
- **The chatbox prints text verbatim** and colours it by `kind`; `<col=...>` tags only work in context-menu labels and hover text, which run through `stripTags`.
- `window.game.audio` reports `ready`, `playing`, `area`, `pinned` and the volumes, which is the only way a headless run can check any of this. `tools/client-check.mjs` launches Chromium with `--autoplay-policy=no-user-gesture-required --mute-audio` so the context really runs without making noise. **No automated check can prove the output is audible** — that still needs ears.

## Interface art

Skill, prayer and spell icons are drawn procedurally in `src/client/ui/glyphs.ts` (item sprites live in `icons.ts`). Each is rendered once into a small offscreen canvas and cached. Prayers are grouped into families (`PRAYER_FAMILY`) that share a glyph and gain detail with their tier; combat spells derive their shape from Strike/Bolt/Blast/Wave and their colour from the element.

## Camera

`src/client/main.ts` holds the camera constants. With the renderer's 38-degree vertical FOV the horizontal focal length is `334 / (2 * tan(19deg)) = 485px`, so a 128-unit tile at the player's depth covers `128 * 485 / distance` pixels. The default distance of 1480 puts a tile at ~42px, i.e. about 13 tiles across the 512px viewport, which is what the real client shows. To re-measure, call `window.game.tileAt(sx, sy)` at a few x positions along the player's row.
