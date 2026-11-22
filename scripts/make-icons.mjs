// Writes the app's icons into public/: icon.svg (browser tabs that take
// SVG), icon-32.png (those that do not), icon-180.png (iOS Home Screen) and
// icon-512.png. The drawing is the logo chosen on 22 November 2026 (H3 on
// the sheet in design/logo/): a compact camera in outline, in the app's red
// on its black, with a horizontal eye in the same line. Its moving form is
// src/shared/mark.js.
//   node scripts/make-icons.mjs

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const INK = '#ff6b5e';
const BLACK = '#060303';
const out = join(import.meta.dirname, '../public');

const LINE = 2.7;
const camera = `
  <path d="M12 14H42V10A2 2 0 0 1 44 8H52A2 2 0 0 1 54 10V14.2A9 9 0 0 1 61 23V51A9 9 0 0 1 52 60H12A9 9 0 0 1 3 51V23A9 9 0 0 1 12 14Z" fill="none" stroke="${INK}" stroke-width="${LINE}" stroke-linejoin="round"/>
  <rect x="10" y="20.5" width="8" height="4" rx="1.5" fill="${INK}"/>
  <path d="M11.5 38Q32 18 52.5 38Q32 58 11.5 38Z" fill="none" stroke="${INK}" stroke-width="${LINE}" stroke-linejoin="round"/>
  <circle cx="32" cy="38" r="4.05" fill="none" stroke="${INK}" stroke-width="${LINE}"/>`;

// `corner`: the tile's corner radius (0 where the system rounds it itself).
// `scale`: how much of the tile the camera fills.
const svg = (corner, scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${corner}" fill="${BLACK}"/>
  <g transform="translate(32 32) scale(${scale}) translate(-32 -34)">${camera}
  </g>
</svg>
`;

writeFileSync(join(out, 'icon.svg'), svg(13, 0.86));

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, corner, scale] of [['icon-32.png', 32, 13, 0.86], ['icon-180.png', 180, 0, 0.74], ['icon-512.png', 512, 0, 0.74]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg(corner, scale)}`);
  await page.screenshot({ path: join(out, name), omitBackground: true });
}
await browser.close();
console.log('icons written to public/');
