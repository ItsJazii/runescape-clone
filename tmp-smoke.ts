import WebSocket from "ws";
const ws = new WebSocket("ws://localhost:43594");
let syncs = 0, npcCount = 0, lastSelf: any = null;
ws.on("open", () => {
  ws.send(JSON.stringify({ t: "login", name: "Tester" }));
  setTimeout(() => ws.send(JSON.stringify({ t: "walk", x: 3230, y: 3225 })), 700);
});
ws.on("error", (e) => console.log("ERR", e.message));
ws.on("message", (d) => {
  const m = JSON.parse(d.toString());
  if (m.t === "sync") { syncs++; npcCount = m.npcs.length; lastSelf = [m.self.x, m.self.y, m.self.mv]; }
  else if (m.t === "msg") console.log("MSG:", m.text);
  else if (m.t === "init") console.log("INIT index", m.index);
});
setTimeout(() => { console.log("syncs", syncs, "visible npcs", npcCount, "self", lastSelf); ws.close(); process.exit(0); }, 6000);
