# osrs-clone

An Old School RuneScape clone: authoritative 600ms-tick Node server + WebGL2 browser client.

## Layout

| Path | Contents |
| --- | --- |
| `src/shared/` | Code used by both sides: wire protocol (`net.ts`), combat maths, skills/xp, item & NPC data, world/collision/pathfinding |
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
npm test               # 97 unit tests, no server needed
npm run check:social   # friends/ignore/private-chat integration check, NEEDS a running server
```

## Verification

Run all of these before considering a change done:

1. `npm test` — pure logic (xp table, combat formulas, containers, pathfinding, persistence).
2. `npm run build` — typechecks and bundles. **The client is served from `dist/client`, so `npm start` serves a stale bundle until you rebuild.** Console errors that look like real bugs are often just a stale `dist`.
3. `node tools/screenshot.mjs "http://localhost:43594/" (Get-Content tools/steps.json -Raw)` — headless Playwright run that logs in, walks, opens each tab and writes PNGs to `tools/shots/`. It prints any console/page errors as JSON; an empty `errors` array is the pass condition. Read the PNGs to check rendering.
4. `npm run check:social` — needs a server on :43594.

Screenshots are 1530x1006, exactly 2x the game's 765x503 layout, so **screenshot coords = game coords x 2**. UI layout constants live at the top of `src/client/ui/ui.ts` (`VIEWPORT`, `CHAT`, `PANEL`, `TAB_ROW_TOP/BOTTOM`). Tab strip: `tabW = 33`, `startX = 524`, top row = tabs 0-6, bottom row = tabs 7-13. **Tab 10 is Logout — do not click it in a screenshot run.**

## Gotchas

- **Orphaned server processes.** Killing the shell running `npm start` does not always kill the node child, leaving :43594 bound and the next `npm start` dying with `EADDRINUSE`. Check with
  `Get-NetTCPConnection -LocalPort 43594 -State Listen` and stop the owning PID. The same applies to test clients: a stale connection keeps a character "already logged in", so logins are refused.
- **Server flushes once per tick.** Each player's `outgoing` queue is sent in the game loop, so any integration script must wait longer than 600ms after sending before asserting on a reply.
- **`data/players/*.json` persists between runs.** Anything touching friends/ignores/skills must reset its own state first; `tools/social-check.ts` does this explicitly.
- UI overlays drawn inside the viewport must be listed in `UI.overlayCoversViewport()`, otherwise world-space labels, hitsplats and the click marker paint on top of them.
