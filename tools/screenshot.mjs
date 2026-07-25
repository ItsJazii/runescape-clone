// Headless smoke test: loads the client, logs in, plays for a few ticks and
// captures screenshots so the renderer can be verified without a browser.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'tools/shots';
mkdirSync(OUT, { recursive: true });

const url = process.argv[2] ?? 'http://localhost:43594/';
const steps = JSON.parse(process.argv[3] ?? '[]');

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1530, height: 1006 } });

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') errors.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}\n${err.stack ?? ''}`));

await page.goto(url, { waitUntil: 'networkidle' });
await page.fill('#name', 'Devin');
await page.click('#play');
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/00-login.png` });

let i = 1;
for (const step of steps) {
  if (step.click) {
    await page.mouse.click(step.click[0], step.click[1], { button: step.button ?? 'left' });
  }
  if (step.key) await page.keyboard.press(step.key);
  if (step.type) await page.keyboard.type(step.type);
  await page.waitForTimeout(step.wait ?? 1500);
  await page.screenshot({ path: `${OUT}/${String(i).padStart(2, '0')}-${step.name ?? 'step'}.png` });
  i++;
}

const stats = await page.evaluate(() => {
  const w = window;
  return { ok: true, title: document.title, canvas: !!document.getElementById('world'), href: location.href, ...(w.__debug ?? {}) };
});

console.log(JSON.stringify({ stats, errors: errors.slice(0, 30) }, null, 2));
await browser.close();
