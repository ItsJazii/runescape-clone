# osrs-clone

An Old School RuneScape clone: authoritative 600ms-tick Node server + WebGL2 browser client.

## Layout

| Path | Contents |
| --- | --- |
| `src/shared/` | Code used by both sides: wire protocol (`net.ts`), combat maths, skills/xp, item & NPC data, Getting Started tasks, world/collision/pathfinding |
| `src/server/` | Authoritative simulation: `index.ts` (http + websocket + packet dispatch), `world.ts` (tick loop, entity sync), `player.ts`, `actions.ts`, `combat.ts`, `dialogue.ts` |
| `src/client/` | `main.ts` (frame loop), `state.ts` (interpolated view of the server), `gl/` (WebGL2 renderer), `ui/ui.ts` (the whole 765x503 fixed-mode interface, drawn to a 2D canvas) |
| `src/test/` | `node:test` unit tests |
| `tools/` | Verification harnesses (see below) |
| `data/players/` | JSON save files, gitignored |

## Commands

```
npm run dev            # server + vite client with hot reload
npm start              # production server, serves dist/client on :43594
npm run build          # tsc --noEmit && vite build
npm run typecheck      # tsc --noEmit (covers src/**/*.ts, including tests)
npm test               # 103 unit tests, no server needed
npm run check:play     # 91-check full gameplay probe over the wire, NEEDS a running server
npm run check:client   # 50-check Playwright run that plays through the real UI, NEEDS a server
npm run check:social   # friends/ignore/private-chat integration check, NEEDS a running server
npm run shots:tabs     # captures the Skills/Prayer/Magic tabs with hover readouts
npm run shots:world    # captures the 3D view at nine landmarks
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

`window.game` is a read-only debug hook the client exposes (defined at the bottom of `src/client/main.ts`). `tools/client-check.mjs` uses it to read the player, chatbox, inventory, NPCs, open interface, context menu and task list, and to resolve on-screen positions with `npcScreenPos(name)` / `objectScreenPos(name)`. Those helpers **only return positions inside the viewport** — projecting an off-screen object and clicking it lands on the side panel instead, which looks exactly like broken picking.

## Gotchas

- **Orphaned server processes.** Killing the shell running `npm start` does not always kill the node child, leaving :43594 bound and the next `npm start` dying with `EADDRINUSE`. Check with
  `Get-NetTCPConnection -LocalPort 43594 -State Listen` and stop the owning PID. The same applies to test clients: a stale connection keeps a character "already logged in", so logins are refused.
- **Server flushes once per tick.** Each player's `outgoing` queue is sent in the game loop, so any integration script must wait longer than 600ms after sending before asserting on a reply.
- **`data/players/*.json` persists between runs.** Anything touching friends/ignores/skills must reset its own state first; `tools/social-check.ts` does this explicitly. `check:play` also carries state forward within a run, so pass a fresh character name (`npm run check:play -- ws://localhost:43594 ProbeX`) when a run leaves the account somewhere odd.
- **`::tele x y` keeps your current plane.** After the stairs test the probe is on plane 1, and every later `::tele` without an explicit third argument stays there — objects then "vanish" because `world.findObject` searches the player's plane. Always write `::tele x y 0`.
- **NPCs wander**, so any test that needs to stand next to one must re-locate it rather than trusting a spawn coordinate. `tools/play-check.ts` has `stepOntoNpc()` for this.
- **Aggression is capped by combat level.** `NpcDef.aggroMaxLevel` (15 for a Dark wizard) means a boosted test account is ignored; reset the combat stats before testing aggro.
- UI overlays drawn inside the viewport must be listed in `UI.overlayCoversViewport()`, otherwise world-space labels, hitsplats and the click marker paint on top of them.
- **Panel content must fit `PANEL.h` (261px).** The Skills, Prayer, Magic and Getting Started tabs all draw a grid plus a description strip; overflow spills into the bottom tab row at y=466 rather than being clipped.

## Interface art

Skill, prayer and spell icons are drawn procedurally in `src/client/ui/glyphs.ts` (item sprites live in `icons.ts`). Each is rendered once into a small offscreen canvas and cached. Prayers are grouped into families (`PRAYER_FAMILY`) that share a glyph and gain detail with their tier; combat spells derive their shape from Strike/Bolt/Blast/Wave and their colour from the element.

## Camera

`src/client/main.ts` holds the camera constants. With the renderer's 38-degree vertical FOV the horizontal focal length is `334 / (2 * tan(19deg)) = 485px`, so a 128-unit tile at the player's depth covers `128 * 485 / distance` pixels. The default distance of 1480 puts a tile at ~42px, i.e. about 13 tiles across the 512px viewport, which is what the real client shows. To re-measure, call `window.game.tileAt(sx, sy)` at a few x positions along the player's row.
