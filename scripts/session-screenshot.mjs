// Takes the board's session screenshot: the perform screen of /control at
// 1440x900, running by itself on the test pattern (no output window), saved
// as screenshots/third-eye-session.png. Uses a local pairing server so the
// top bar shows a normal state where the public one cannot be reached.
//   node scripts/session-screenshot.mjs

import { join } from 'node:path';
import { launch, sleep, startPeerServer, startSite, stopPeerServer, waitFor } from '../tests/lib.mjs';
const site = await startSite();
const ps = await startPeerServer();
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const control = await context.newPage();
await control.goto(`${site.url}/control/`);
await control.evaluate((signal) => window.thirdEye.store.merge('net', { signal }), ps.signalUrl);
await waitFor(() => control.evaluate(() => window.thirdEye.ui.status?.host.role === 'control' && window.thirdEye.ui.status.phone.signal === 'open'), { label: 'ready', timeout: 20000 });
await control.locator('.tile .load').nth(1).click();
await sleep(5000);
console.log(await control.evaluate(() => ({ pills: [...document.querySelectorAll('.pill')].map((p) => p.textContent), alerts: document.querySelectorAll('.alert').length, live: !!document.querySelector('.monitor #stage') })));
await control.screenshot({ path: join(import.meta.dirname, '../screenshots/third-eye-session.png') });
await browser.close(); await site.close(); await stopPeerServer(ps); process.exit(0);
