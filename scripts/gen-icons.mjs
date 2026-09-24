/**
 * Generates public/icon-512.png and public/icon-192.png from public/mascot.svg.
 * The owl is centered on a warm cream background (full-bleed, maskable-safe).
 * Run: node scripts/gen-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const svg = readFileSync('public/mascot.svg', 'utf8');

// Full-bleed cream background, owl at ~76% of the canvas (inside the
// maskable safe zone), nudged up a touch for optical centering.
const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; }
  #stage {
    width: 100vw; height: 100vh;
    background: #FFF3DF;
    display: flex; align-items: center; justify-content: center;
  }
  #owl { width: 76%; height: 76%; margin-top: -2%; }
  #owl svg { width: 100%; height: 100%; display: block; }
</style></head>
<body><div id="stage"><div id="owl">${svg}</div></div></body></html>`;

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--force-color-profile=srgb', '--hide-scrollbars'],
});

try {
  for (const size of [512, 192]) {
    const page = await browser.newPage();
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buf = await page.screenshot({ type: 'png' });
    writeFileSync(`public/icon-${size}.png`, buf);
    console.log(`wrote public/icon-${size}.png (${buf.length} bytes)`);
    await page.close();
  }
} finally {
  await browser.close();
}
