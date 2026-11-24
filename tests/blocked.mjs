// A network that keeps devices apart (a venue's or a campus's guest Wi-Fi):
// the phone reaches the pairing server and so does the Mac, but no link
// between them will open. Both screens must say so, and say what to do
// (the iPhone's Personal Hotspot), and carry on by themselves once the
// network lets them through.
//   node tests/blocked.mjs

import { benignError, check, failureCount, launch, openSession, startPeerServer, startSite, stopPeerServer, waitFor } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch();
const errors = [];
const settle = (fn, label, timeout = 6000) => waitFor(fn, { label, timeout }).then(() => true, () => false);

try {
  const { control, phone } = await openSession(browser, site, peerServer, errors, { start: false });
  const status = () => control.evaluate(() => window.thirdEye.ui.status);
  const alertText = () => control.evaluate(() => document.querySelector('#alerts [data-key="blocked"]')?.textContent ?? '');
  // The phone's links are made unable to connect: signaling still works,
  // nothing direct does. (Relay-only, and there is no relay.)
  await phone.addInitScript(() => {
    const Native = window.RTCPeerConnection;
    window.__blockLinks = true;
    const Wrapped = function (config, ...rest) {
      return new Native(window.__blockLinks ? { ...config, iceTransportPolicy: 'relay' } : config, ...rest);
    };
    Wrapped.prototype = Native.prototype;
    Object.setPrototypeOf(Wrapped, Native);
    window.RTCPeerConnection = Wrapped;
  });
  await phone.reload();
  await control.keyboard.press('1'); // the iPhone input: the starting screen

  console.log('before anyone tries');
  check('the starting screen says what to do about venue Wi-Fi, up front', await settle(async () => (await control.locator('#splash').textContent()).includes('Venue or campus Wi-Fi? Put this Mac on the iPhone\'s Personal Hotspot'), 'hint', 20000));
  check('nothing is reported as blocked', (await status()).phone.blocked === false && (await alertText()) === '');

  console.log('a phone that cannot get through');
  await phone.click('#start');
  check('the Mac notices a phone trying and failing', await settle(async () => (await status()).phone.blocked === true, 'blocked', 40000), JSON.stringify((await status()).phone));
  check('it is not taken for paired', (await status()).phone.phone === 'none');
  check('an alert says what it is and the way out', (await alertText()).includes('cannot get through') && (await alertText()).includes('Personal Hotspot'), await alertText());
  check('the phone readout says so too', (await control.locator('#phone-pill').textContent()).includes('cannot get through'), await control.locator('#phone-pill').textContent());
  check('and the starting screen', await settle(async () => (await control.locator('#splash .splash-state').textContent()).includes('cannot get through'), 'splash line'), await control.locator('#splash .splash-state').textContent());
  check('the phone says it cannot reach the Mac, and to use its hotspot', await settle(async () => (await phone.locator('#down-title').textContent()) === 'Can\'t reach the Mac' && (await phone.locator('#down-line').textContent()).includes('Personal Hotspot'), 'phone band', 40000), `${await phone.locator('#down-title').textContent()} / ${await phone.locator('#down-line').textContent()}`);
  check('it does not say the Mac was not found', !(await phone.locator('#down-title').textContent()).includes('not found'));

  console.log('the network lets them through');
  await phone.evaluate(() => {
    window.__blockLinks = false;
  });
  check('the phone pairs by itself', await settle(async () => (await status()).phone.phone === 'connected', 'paired', 60000), JSON.stringify((await status()).phone));
  check('and the Mac stops saying it is blocked', await settle(async () => (await status()).phone.blocked === false && (await alertText()) === '', 'cleared', 10000), await alertText());
  check('the phone\'s band goes', await settle(() => phone.locator('#down').isHidden(), 'band gone', 20000));
} catch (err) {
  check('test ran to completion', false, err.message.split('\n')[0]);
} finally {
  const real = errors.filter((e) => !benignError(e));
  check('no unexpected console errors', real.length === 0, real.join(' | '));
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
