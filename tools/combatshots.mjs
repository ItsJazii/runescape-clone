// Captures frames mid-fight so the attack, flinch and bow animations can be
// eyeballed. Needs a running server. Writes to tools/shots/combat-*.png and
// prints which frame caught which animation.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'tools/shots';
mkdirSync(OUT, { recursive: true });

const url = process.argv[2] ?? 'http://localhost:5173/';
const name = process.argv[3] ?? 'AnimShot';
const TARGET = process.argv[4] ?? 'Cow';

// A crop tight around the player, at the 2x capture scale, kept small so a
// screenshot is fast enough to land inside a 600ms animation.
const NEAR = { x: 300, y: 180, width: 460, height: 380 };

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1530, height: 1006 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(e.message));

const cmd = async (text) => {
  await page.evaluate((t) => window.game.send({ t: 'chat', text: t }), text);
  await page.waitForTimeout(700);
};

const nearest = (npcName) =>
  page.evaluate((n) => {
    const self = window.game.self;
    return (
      window.game.npcs
        .filter((e) => e.name === n && e.hp > 0)
        .sort((a, b) => Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y))[0] ?? null
    );
  }, npcName);

await page.goto(url, { waitUntil: 'networkidle' });
await page.fill('#name', name);
await page.click('#play');
await page.waitForFunction(() => window.game?.self, null, { timeout: 20000 });

await cmd('::empty');
await cmd('::heal');
await cmd('::tele 3260 3266 0');
await page.waitForTimeout(2000);

/** Teleports right next to the target, so no walking eats into the capture. */
async function engage(npcName) {
  const npc = await nearest(npcName);
  if (!npc) throw new Error(`no ${npcName} in view`);
  await cmd(`::tele ${npc.x + 1} ${npc.y} 0`);
  await page.waitForTimeout(1200);
  const fresh = await nearest(npcName);
  await page.evaluate((id) => window.game.send({ t: 'npcAction', npc: id, action: 'Attack' }), fresh.id);
  // Wait for the fight to actually start rather than guessing at a delay.
  await page.waitForFunction(
    (n) => {
      const me = window.game.self;
      const it = window.game.npcs.find((e) => e.name === n);
      return me.anim !== 'idle' || (it && it.hp < it.maxHp) || me.hp < me.maxHp;
    },
    npcName,
    { timeout: 20000 },
  );
  return fresh;
}

/** Grabs a tight burst, tagging each frame with what was on screen. */
async function burst(label, frames, gap) {
  const log = [];
  for (let i = 0; i < frames; i++) {
    const tag = String(i).padStart(2, '0');
    const state = await page.evaluate((n) => {
      const it = window.game.npcs.find((e) => e.name === n && e.hp > 0);
      return { me: window.game.self.anim, hp: window.game.self.hp, npc: it?.anim ?? null, npcHp: it?.hp ?? null };
    }, TARGET);
    await page.screenshot({ path: `${OUT}/combat-${label}-${tag}.png`, clip: NEAR });
    log.push({ frame: tag, ...state });
    await page.waitForTimeout(gap);
  }
  return log;
}

/* ---- melee against a quadruped: its lunge, and the player's flinch ---- */
await engage(TARGET);
const melee = await burst('melee', 26, 60);

/* ---- ranged: a real bow draw and release ---- */
await cmd('::item Shortbow');
await cmd('::item Bronze arrow 500');
const slots = await page.evaluate(() => {
  const inv = window.game.inventory;
  return { bow: inv.findIndex((i) => i?.name === 'Shortbow'), arrow: inv.findIndex((i) => i?.name === 'Bronze arrow') };
});
for (const slot of [slots.bow, slots.arrow]) {
  if (slot < 0) continue;
  await page.evaluate(
    (s) => window.game.send({ t: 'itemAction', slot: s, item: window.game.inventory[s].id, action: 'Wear' }),
    slot,
  );
  await page.waitForTimeout(700);
}
const shootAt = await nearest(TARGET);
await cmd(`::tele ${shootAt.x + 5} ${shootAt.y} 0`);
await page.waitForTimeout(1500);
const fresh = await nearest(TARGET);
await page.evaluate((id) => window.game.send({ t: 'npcAction', npc: id, action: 'Attack' }), fresh.id);
await page.waitForFunction(() => window.game.self.anim === 'bow', null, { timeout: 20000 });
const bow = await burst('bow', 20, 60);

const pick = (log, key, value) => log.filter((f) => f[key] === value).map((f) => f.frame);
console.log(
  JSON.stringify(
    {
      slots,
      meleeFrames: melee,
      bowFrames: bow,
      interesting: {
        targetAttacking: pick(melee, 'npc', 'attack'),
        targetFlinching: pick(melee, 'npc', 'block'),
        playerFlinching: pick(melee, 'me', 'block'),
        playerShooting: pick(bow, 'me', 'bow'),
      },
      errors: errors.slice(0, 10),
    },
    null,
    2,
  ),
);
await browser.close();
