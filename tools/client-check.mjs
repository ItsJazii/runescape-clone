/**
 * Plays the game through the real client, the way a person does: clicks in the
 * 3D viewport, uses right-click menus and reads the chatbox back.
 *
 *   npm start
 *   node tools/client-check.mjs
 *
 * Writes screenshots to tools/shots/ and prints a PASS/FAIL report. The point
 * of this harness (as opposed to tools/play-check.ts, which talks to the server
 * directly) is to catch problems in picking, menus and rendering.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'tools/shots';
mkdirSync(OUT, { recursive: true });

const url = process.argv[2] ?? 'http://localhost:43594/';
const name = process.argv[3] ?? 'Tester';

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-gpu-sandbox',
    // Let the AudioContext actually run, but keep the test machine silent.
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
  ],
});
// 2x the 765x503 layout, so screenshot coords are exactly game coords x 2.
const page = await browser.newPage({ viewport: { width: 1530, height: 1006 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

let passes = 0;
const failures = [];
let section = '';
const heading = (s) => {
  section = s;
  console.log(`\n== ${s} ==`);
};
const check = (label, ok, detail = '') => {
  if (ok) {
    passes++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(`${section}: ${label}${detail ? ` -- ${detail}` : ''}`);
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`);
  }
};

const g = (fn, ...args) => page.evaluate(fn, ...args);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
/** Game coords -> screenshot coords. */
const click = (x, y, button = 'left') => page.mouse.click(x * 2, y * 2, { button });
const move = (x, y) => page.mouse.move(x * 2, y * 2);
const chat = async (text) => {
  await page.keyboard.press('Enter');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await wait(900);
};
/** Waits for a chatbox line containing `fragment`. */
async function waitForChat(fragment, ticks = 20) {
  for (let i = 0; i < ticks; i++) {
    const lines = await g(() => window.game.chat);
    if (lines.some((l) => l.toLowerCase().includes(fragment.toLowerCase()))) return true;
    await wait(620);
  }
  return false;
}
async function until(fn, ticks = 20, arg) {
  for (let i = 0; i < ticks; i++) {
    if (await page.evaluate(fn, arg)) return true;
    await wait(620);
  }
  return page.evaluate(fn, arg);
}

/* ---------------------------------------------------------------- */
heading('login');
await page.goto(url, { waitUntil: 'networkidle' });
await page.fill('#name', name);
await page.click('#play');
await wait(6000);
await shot('c00-login');

const self = await g(() => window.game.self);
check('the client renders and receives the player', !!self, JSON.stringify(self));
check('the debug hook is available', await g(() => typeof window.game === 'object'));
const npcs = await g(() => window.game.npcs);
check('NPCs are visible in the client', npcs.length > 0, `${npcs.length} npcs: ${npcs.slice(0, 4).map((n) => n.name).join(', ')}`);
check('the login welcome message is in the chatbox', (await g(() => window.game.chat)).some((l) => l.includes('Welcome')));

/* ---------------------------------------------------------------- */
heading('walking by clicking the ground');
const before = await g(() => window.game.self);
// Click a patch of ground below and left of the player (player is centred).
await click(190, 230);
await wait(3000);
const after = await g(() => window.game.self);
check('clicking the ground walks the player', before.x !== after.x || before.y !== after.y, `${before.x},${before.y} -> ${after.x},${after.y}`);
await shot('c01-walked');

/* ---------------------------------------------------------------- */
heading('hover text and picking');
// Hover the middle of the viewport; there should be a "Walk here" fallback.
await move(260, 170);
await wait(400);
check('hovering empty ground shows "Walk here"', (await g(() => window.game.hoverText)) === 'Walk here', await g(() => window.game.hoverText));

// Find a tree and check it is actually clickable at its rendered position.
// Always name the plane: a previous run leaves the account upstairs in the
// bank, and a plane-less teleport would keep it there.
await chat('::tele 3221 3203 0');
await wait(1500);
const treePos = await g(() => window.game.objectScreenPos('Tree'));
check('a tree is found in the rendered scene', !!treePos, JSON.stringify(treePos));
if (treePos) {
  const label = await g(([x, y]) => window.game.hoverAt(x, y), [treePos.x, treePos.y]);
  check('the tree is pickable at its rendered position', label !== null && label.includes('Tree'), `hover=${label}`);
  await move(treePos.x, treePos.y);
  await wait(400);
  await shot('c02-hover-tree');
}

/* ---------------------------------------------------------------- */
heading('right-click menus');
if (treePos) {
  await click(treePos.x, treePos.y, 'right');
  await wait(500);
  const menu = await g(() => window.game.menu);
  check('right-clicking a tree opens a menu', !!menu && menu.length > 0, JSON.stringify(menu));
  check('the menu offers "Chop down"', !!menu && menu.some((m) => m.startsWith('Chop down')), JSON.stringify(menu));
  check('the menu offers "Examine"', !!menu && menu.some((m) => m.startsWith('Examine')), JSON.stringify(menu));
  check('the menu offers "Walk here"', !!menu && menu.some((m) => m === 'Walk here'), JSON.stringify(menu));
  await shot('c03-tree-menu');
  await page.keyboard.press('Escape');
  await wait(300);
}

/* ---------------------------------------------------------------- */
heading('woodcutting by clicking');
await chat('::empty');
await chat('::item 1351 1');
const treePos2 = await g(() => window.game.objectScreenPos('Tree'));
if (treePos2) {
  await click(treePos2.x, treePos2.y);
  const swung = await waitForChat('you swing your axe', 10);
  check('left-clicking a tree starts chopping', swung, JSON.stringify((await g(() => window.game.chat)).slice(-4)));
  const gotLogs = await until(() => window.game.inventory.some((i) => i && i.name === 'Logs'), 60);
  check('chopping eventually yields logs', gotLogs, JSON.stringify((await g(() => window.game.chat)).slice(-4)));
  await shot('c04-woodcutting');
}

/* ---------------------------------------------------------------- */
heading('fighting a chicken by clicking');
await chat('::tele 3233 3295 0');
await wait(2000);
await chat('::setlevel attack 30');
await chat('::setlevel strength 30');
await wait(1200);
const chickens = await g(() => window.game.npcs.filter((n) => n.name === 'Chicken'));
check('chickens are visible', chickens.length > 0, `${chickens.length}`);
const chickenPos = await g(() => window.game.npcScreenPos('Chicken'));
check('a chicken has a screen position', !!chickenPos, JSON.stringify(chickenPos));
if (chickenPos) {
  const label = await g(([x, y]) => window.game.hoverAt(x, y), [chickenPos.x, chickenPos.y]);
  check('the chicken is pickable', label !== null && label.includes('Chicken'), `hover=${label}`);
  check('the chicken shows an Attack option first', label !== null && label.startsWith('Attack'), `hover=${label}`);
  const before = await g(() => window.game.npcs.filter((n) => n.name === 'Chicken').length);
  await click(chickenPos.x, chickenPos.y);
  await wait(1500);
  await shot('c05-attacking');
  // A 30-strength player one-shots a 3hp chicken, so watch for damage *or* for
  // the chicken vanishing rather than trying to catch it mid-fight.
  const fought = await until(
    ([n]) => window.game.npcs.some((x) => x.name === 'Chicken' && x.hp < x.maxHp) || window.game.npcs.filter((x) => x.name === 'Chicken').length < n,
    25,
    [before],
  );
  check('clicking a chicken starts combat and kills it', fought, `chickens ${before} -> ${await g(() => window.game.npcs.filter((n) => n.name === 'Chicken').length)}`);
  const gotDrop = await until(() => window.game.groundItems.length > 0, 40);
  check('killing it leaves a drop on the ground', gotDrop, JSON.stringify(await g(() => window.game.groundItems)));
  await shot('c06-killed');
}

/* ---------------------------------------------------------------- */
heading('all interface tabs render');
// Tab strip: tabW = 33, startX = 524, top row y=168+18, bottom row y=466+18.
const TAB_X = (i) => 524 + (i % 7) * 33 + 16;
const TAB_Y = (i) => (i < 7 ? 186 : 484);
// PANEL from src/client/ui/ui.ts, in game coords.
const PANEL_X = 548;
const PANEL_Y = 205;
const TAB_NAMES = [
  'Combat Options', 'Skills', 'Getting Started', 'Inventory', 'Worn Equipment', 'Prayer', 'Magic',
  'Chat Channel', 'Friends List', 'Ignore List', 'Logout', 'Options', 'Emotes', 'Music Player',
];
for (let i = 0; i < 14; i++) {
  if (i === 10) continue; // Logout
  await click(TAB_X(i), TAB_Y(i));
  await wait(350);
  const active = await g(() => window.game.activeTab);
  check(`tab ${i} (${TAB_NAMES[i]}) opens`, active === i, `activeTab=${active}`);
  await shot(`c10-tab${String(i).padStart(2, '0')}-${TAB_NAMES[i].replace(/\W+/g, '')}`);
}

/* ---------------------------------------------------------------- */
heading('inventory interaction');
await click(TAB_X(3), TAB_Y(3));
await wait(300);
await chat('::empty');
await chat('::item 1277 1');
await wait(900);
// First inventory slot centre: INV_ORIGIN (560, 213) + half a 42x36 slot.
const SLOT = (i) => ({ x: 560 + (i % 4) * 42 + 18, y: 213 + Math.floor(i / 4) * 36 + 16 });
const s0 = SLOT(0);
await click(s0.x, s0.y, 'right');
await wait(400);
const invMenu = await g(() => window.game.menu);
check('right-clicking an inventory item opens a menu', !!invMenu && invMenu.length > 0, JSON.stringify(invMenu));
check('the menu offers Wield', !!invMenu && invMenu.some((m) => m.startsWith('Wield')), JSON.stringify(invMenu));
check('the menu offers Drop', !!invMenu && invMenu.some((m) => m.startsWith('Drop')), JSON.stringify(invMenu));
await shot('c11-inv-menu');
await page.keyboard.press('Escape');
await wait(300);
await click(s0.x, s0.y);
await wait(1200);
// Assert on the weapon slot rather than on the inventory: `::empty` does not
// strip equipment, so a sword worn by an earlier run swaps back into the bag.
const weapon = await g(() => window.game.equipment[3]);
check('left-clicking a weapon wields it', weapon?.name === 'Bronze sword', JSON.stringify(weapon));
await shot('c12-wielded');

/* ---------------------------------------------------------------- */
heading('shops and dialogue through the UI');
await chat('::tele 3212 3245 0');
await wait(2500);
const keeper = await g(() => window.game.npcScreenPos('Shop keeper'));
check('the shop keeper is on screen', !!keeper, JSON.stringify(keeper));
if (keeper) {
  await click(keeper.x, keeper.y, 'right');
  await wait(400);
  const shopMenu = await g(() => window.game.menu);
  check('the shop keeper menu has Trade', !!shopMenu && shopMenu.some((m) => m.startsWith('Trade')), JSON.stringify(shopMenu));
  await shot('c13-keeper-menu');
  // Click the Trade entry. Menu is drawn at the click point; entries are 15px high
  // starting 15px below the header.
  const idx = (shopMenu ?? []).findIndex((m) => m.startsWith('Trade'));
  if (idx >= 0) {
    await click(keeper.x + 20, keeper.y + 20 + idx * 15);
    const shopOpen = await until(() => window.game.interface === 'shop', 12);
    check('choosing Trade opens the shop', shopOpen, `iface=${await g(() => window.game.interface)}`);
    await shot('c14-shop');
    await page.keyboard.press('Escape');
    await wait(500);
  }

  // Talking is the other half of an NPC interaction. Shop keepers wander, so
  // re-locate and retry rather than trusting one screen position - a single
  // click that lands where the keeper *was* looks exactly like broken picking.
  let talking = false;
  for (let attempt = 0; attempt < 4 && !talking; attempt++) {
    const keeper2 = await g(() => window.game.npcScreenPos('Shop keeper'));
    if (!keeper2) {
      await wait(700);
      continue;
    }
    await click(keeper2.x, keeper2.y);
    talking = await until(() => window.game.dialogue !== null, 6);
  }
  check('left-clicking an NPC starts a conversation', talking, JSON.stringify(await g(() => window.game.dialogue)));
  await shot('c14b-dialogue');
  await page.keyboard.press('Escape');
  await wait(500);
}

/* ---------------------------------------------------------------- */
heading('banking through the UI');
// The Lumbridge bank is on the castle's top floor; stand south of the counter.
await chat('::tele 3208 3215 2');
await wait(2500);
const booth = await g(() => window.game.objectScreenPos('Bank booth'));
check('a bank booth is on screen', !!booth, `at ${JSON.stringify(await g(() => window.game.self))}`);
if (booth) {
  await click(booth.x, booth.y);
  const bankOpen = await until(() => window.game.interface === 'bank', 15);
  check('clicking a bank booth opens the bank', bankOpen, `iface=${await g(() => window.game.interface)}`);
  await shot('c15-bank');
  await page.keyboard.press('Escape');
  await wait(500);
}

/* ---------------------------------------------------------------- */
heading('getting started checklist');
await click(TAB_X(2), TAB_Y(2));
await wait(400);
await shot('c16-tasks');
const doneTasks = await g(() => window.game.tasks);
check('the task list tracks progress', Array.isArray(doneTasks) && doneTasks.length > 0, JSON.stringify(doneTasks));
for (const id of ['talk', 'chop', 'equip', 'kill', 'shop', 'bank']) {
  check(`task "${id}" was ticked off by playing`, doneTasks.includes(id), JSON.stringify(doneTasks));
}

/* ---------------------------------------------------------------- */
// Audio cannot be listened to from a test, so assert on the engine's state
// instead: that the context actually started, that a track is scheduled, and
// that walking into a different area swaps the track.
heading('audio');
const audio0 = await g(() => window.game.audio);
check('the audio engine started', audio0.ready, JSON.stringify(audio0));
check('music is enabled by default', audio0.musicEnabled && audio0.sfxEnabled, JSON.stringify(audio0));
check('a track is playing', typeof audio0.playing === 'string' && audio0.playing.length > 0, JSON.stringify(audio0));
check('the track follows the area, not a manual pick', audio0.pinned === false, JSON.stringify(audio0));

// Lumbridge -> Al Kharid should change both the area and the music.
await chat('::tele 3221 3218 0');
await wait(2000);
const inLumbridge = await g(() => window.game.audio);
check('Lumbridge is detected as an area', inLumbridge.area === 'Lumbridge', JSON.stringify(inLumbridge));
await chat('::tele 3290 3180 0');
await wait(2000);
const inKharid = await g(() => window.game.audio);
check('crossing into Al Kharid changes the area', inKharid.area === 'Al Kharid', JSON.stringify(inKharid));
check(
  'the music changes with the area',
  inKharid.playing !== inLumbridge.playing,
  `${inLumbridge.playing} -> ${inKharid.playing}`,
);
const unlocked = await g(() => window.game.chat);
check(
  'entering a new area unlocks its track',
  unlocked.some((l) => l.includes('unlocked a new music track')),
  JSON.stringify(unlocked.slice(-4)),
);

// The music player tab: pick a track by hand and check it pins.
await click(TAB_X(13), TAB_Y(13));
await wait(400);
await shot('c17-music');
await click(PANEL_X + 40, PANEL_Y + 32);
await wait(600);
const picked = await g(() => window.game.audio);
check('clicking a track plays it and pins it', picked.pinned === true, JSON.stringify(picked));
check('the picked track is playing', typeof picked.playing === 'string', JSON.stringify(picked));

// Options: mute music and confirm the engine reports it.
await click(TAB_X(11), TAB_Y(11));
await wait(400);
await shot('c18-options');
const beforeMute = await g(() => window.game.audio);
// Options rows: Run at PANEL.y+36, then Music 32px below it.
await click(PANEL_X + 94, PANEL_Y + 80);
await wait(400);
const muted = await g(() => window.game.audio);
check('the Music toggle switches music off', muted.musicEnabled === !beforeMute.musicEnabled, JSON.stringify(muted));
check('switching music off stops the track', muted.playing === null, JSON.stringify(muted));
await click(PANEL_X + 94, PANEL_Y + 80);
await wait(1200);
const unmuted = await g(() => window.game.audio);
check('the Music toggle switches back on', unmuted.musicEnabled === beforeMute.musicEnabled, JSON.stringify(unmuted));
// Regression: re-enabling only restored the volume, and the area track was
// restarted solely on an area change, so the game stayed silent while the
// toggle read "On" until the player wandered into somewhere new.
check(
  'switching music back on resumes a track without leaving the area',
  typeof unmuted.playing === 'string' && unmuted.playing.length > 0,
  JSON.stringify(unmuted),
);

/* ---------------------------------------------------------------- */
console.log('\n=======================================================');
console.log(`${passes} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f}`);
}
if (errors.length) {
  console.log('\nCONSOLE/PAGE ERRORS:');
  for (const e of errors.slice(0, 20)) console.log(`  - ${e}`);
}
console.log('=======================================================');

await browser.close();
process.exit(failures.length || errors.length ? 1 : 0);
