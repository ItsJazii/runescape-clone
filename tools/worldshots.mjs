/**
 * Captures the 3D view at several landmarks so the camera framing, lighting
 * and ground texturing can be eyeballed against the real game.
 *
 *   node tools/worldshots.mjs
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
await page.fill('#name', process.argv[2] ?? 'WorldShot');
await page.click('#play');
await page.waitForTimeout(6000);

const chat = async (t) => {
  await page.keyboard.press('Enter');
  await page.keyboard.type(t);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
};

const places = [
  ['spawn-lumbridge-courtyard', 3222, 3218],
  ['lumbridge-village', 3232, 3232],
  ['general-store', 3212, 3245],
  ['chicken-farm', 3233, 3295],
  ['river-bridge', 3247, 3226],
  ['al-kharid-gate', 3266, 3227],
  ['draynor-village', 3092, 3247],
  ['swamp', 3200, 3170],
  ['wheat-field', 3162, 3292],
];

for (const [name, x, y] of places) {
  await chat(`::tele ${x} ${y}`);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/w-${name}.png` });
}

console.log(JSON.stringify({ errors }, null, 2));
await browser.close();
