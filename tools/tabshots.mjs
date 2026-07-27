/**
 * Opens each interface tab and captures it, optionally with the cursor parked
 * over a specific cell so the hover readouts are exercised too.
 *
 *   node tools/tabshots.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'tools/shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1530, height: 1006 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
});

await page.goto('http://localhost:43594/', { waitUntil: 'networkidle' });
await page.fill('#name', process.argv[2] ?? 'TabShot');
await page.click('#play');
await page.waitForTimeout(6000);

const chat = async (t) => {
  await page.keyboard.press('Enter');
  await page.keyboard.type(t);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
};
// Give the account levels and runes so the books are not all greyed out.
await chat('::master');
await chat('::item 556 500');
await chat('::item 558 200');
await chat('::item 554 300');
await chat('::item 555 300');
await chat('::item 557 300');
await chat('::item 562 100');
await chat('::item 560 100');
await chat('::item 563 100');
await chat('::item 564 100');
await chat('::item 565 100');
await chat('::item 559 100');
await chat('::item 561 100');

const TAB_X = (i) => 524 + (i % 7) * 33 + 16;
const TAB_Y = (i) => (i < 7 ? 186 : 484);
const click = (x, y) => page.mouse.click(x * 2, y * 2);
const move = (x, y) => page.mouse.move(x * 2, y * 2);

// Skills.
await click(TAB_X(1), TAB_Y(1));
await page.waitForTimeout(400);
await move(580, 240);
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/t-skills.png` });

// Prayer, hovering Protect from Melee (row 4, col 4 => index 18).
await click(TAB_X(5), TAB_Y(5));
await page.waitForTimeout(400);
await move(548 + 6 + 3 * 36 + 16, 205 + 22 + 3 * 31 + 14);
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/t-prayer.png` });

// Magic, hovering Fire Blast (index 29 => row 5 col 4).
await click(TAB_X(6), TAB_Y(6));
await page.waitForTimeout(400);
await move(548 + 6 + 4 * 36 + 16, 205 + 20 + 5 * 27 + 12);
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/t-magic.png` });

// Magic with nothing hovered.
await move(260, 170);
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/t-magic-plain.png` });

console.log(JSON.stringify({ errors }, null, 2));
await browser.close();
