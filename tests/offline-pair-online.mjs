// Pair without internet while the pairing server CAN be reached (the way it
// will first be tried: on a working hotspot). The phone must not slip into
// normal pairing a moment before showing its code.
//   node tests/offline-pair-online.mjs

import { benignError, check, failureCount, fakeMacCamera, launch, phoneCode, showToMac, sleep, startPeerServer, startSite, stopPeerServer, waitFor, watch } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch();
const errors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.grantPermissions(['camera', 'microphone']);
  await fakeMacCamera(context);
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  await control.evaluate((sig) => window.thirdEye.store.merge('net', { signal: sig }), peerServer.signalUrl);
  const status = () => control.evaluate(() => window.thirdEye.ui.status);
  const settle = (fn, label, timeout = 20000) => waitFor(fn, { label, timeout }).then(() => true, () => false);
  await waitFor(async () => (await status())?.phone.signal === 'open', { label: 'pairing server reached', timeout: 20000 });
  check('the pairing server is reachable this time', true);

  const open = async () => {
    await control.evaluate(() => window.thirdEye.ui.pairOffline());
    await waitFor(() => control.evaluate(() => document.getElementById('offline-link').href.includes('#o=') && document.getElementById('offline-qr').style.visibility !== 'hidden'), { label: 'offer shown' });
    const phone = await context.newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    watch(phone, 'phone', errors);
    await phone.goto(await control.locator('#offline-link').getAttribute('href'));
    await phone.locator('#start').dispatchEvent('click');
    await waitFor(() => phone.evaluate(() => !!window.thirdEyePhone.pairToken), { label: 'phone has its code' });
    return phone;
  };

  console.log('by code, although the server is there');
  let phone = await open();
  // Long enough for normal pairing to have happened, if it were going to.
  await waitFor(() => phone.evaluate(() => window.thirdEyePhone.link.peer?.open), { label: 'phone reached the server', timeout: 15000 });
  await sleep(4000);
  check('the phone shows its code and waits', await phone.evaluate(() => !document.getElementById('pair').hidden) && (await status()).phone.phone !== 'connected', await phone.locator('#state').textContent());
  await showToMac(control, await phoneCode(phone));
  check('it pairs by code', await settle(async () => {
    const p = (await status()).phone;
    return p.direct && p.phone === 'connected';
  }, 'paired by code'));
  await showToMac(control, null);
  check('the dialog closes', await settle(() => control.evaluate(() => document.getElementById('offline-pair').hidden), 'dialog closed'));
  await phone.close();
  await settle(async () => (await status()).phone.phone !== 'connected', 'phone gone');

  console.log('giving up on the code');
  phone = await open();
  await phone.locator('#pair-hide').dispatchEvent('click');
  check('Hide the code lets normal pairing take over', await settle(async () => {
    const p = (await status()).phone;
    return p.phone === 'connected' && !p.direct;
  }, 'paired the normal way'), JSON.stringify((await status()).phone.direct));
  check('and the Mac\'s dialog says so and closes', await settle(() => control.evaluate(() => document.getElementById('offline-pair').hidden), 'dialog closed'), await control.locator('#offline-state').textContent());

  const real = errors.filter((e) => !benignError(e));
  check('no unexpected console errors', real.length === 0, real.slice(0, 3).join(' | '));
} catch (err) {
  check('test ran to completion', false, err.message.split('\n')[0]);
} finally {
  await browser.close();
  await site.close();
  await stopPeerServer(peerServer);
}

if (failureCount()) {
  console.log(`\n${failureCount()} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
process.exit(0);
