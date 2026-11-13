// Pairing with no pairing server: the handshake goes by QR code, both ways.
// Nothing here can reach a signaling server (the sandbox cannot reach the
// public one, which is exactly the situation this feature is for). The Mac's
// camera is a stand-in showing a picture of the code on the phone's screen;
// reading it (with jsQR: headless Chromium has no barcode reader of its
// own) and everything after is the real path.
//   node tests/offline-pair.mjs

import { benignError, check, failureCount, fakeMacCamera, launch, phoneCode, showToMac, sleep, startSite, waitFor, watch } from './lib.mjs';

const site = await startSite();
const browser = await launch();
const errors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.grantPermissions(['camera', 'microphone']);
  await fakeMacCamera(context);
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  const status = () => control.evaluate(() => window.thirdEye.ui.status);
  const settle = (fn, label, timeout = 15000) => waitFor(fn, { label, timeout }).then(() => true, () => false);
  const alertKeys = () => control.evaluate(() => [...document.querySelectorAll('#alerts [role=alert]')].map((n) => n.dataset.key));
  const paired = () => settle(async () => {
    const p = (await status())?.phone;
    return p?.direct && p.phone === 'connected' && p.media === 'connected';
  }, 'paired', 25000);
  await waitFor(async () => (await status())?.host.role === 'control', { label: 'control hosting' });

  // Opens the dialog, opens the phone on its link, and returns the phone
  // page once it shows its code.
  const begin = async (opener) => {
    await opener();
    await waitFor(() => control.evaluate(() => document.getElementById('offline-link').href.includes('#o=')), { label: 'offer shown' });
    const url = await control.locator('#offline-link').getAttribute('href');
    const phone = await context.newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    watch(phone, 'phone', errors);
    await phone.goto(url);
    // Dispatched, not clicked: a real click waits for the page to draw a
    // frame, and headless Chromium can leave a background tab without one.
    await phone.locator('#start').dispatchEvent('click');
    await waitFor(() => phone.evaluate(() => !document.getElementById('pair').hidden && !!window.thirdEyePhone.pairToken), { label: 'phone shows its code' });
    const code = await phone.evaluate(() => `3EYE.${window.thirdEyePhone.pairToken}`);
    return { phone, url, code, picture: await phoneCode(phone) };
  };

  console.log('the dialog');
  await control.evaluate(() => window.thirdEye.ui.setView('setup'));
  check('Setup offers Pair without internet, with the network tip', (await control.locator('#pair-offline').getAttribute('title')).includes('Internet Sharing'));
  let { phone, url, code, picture } = await begin(() => control.click('#pair-offline'));
  check('the dialog shows a code and the camera', await control.locator('#offline-pair').isVisible() && (await control.evaluate(() => document.getElementById('offline-video').srcObject?.getVideoTracks()[0]?.readyState === 'live')));
  check('it says how to make a network on the Mac', (await control.locator('#network-tip').getAttribute('title')).includes('System Settings → General → Sharing → Internet Sharing'));
  const modules = Number(await control.locator('#offline-qr').getAttribute('data-modules'));
  check('the Mac\'s code is small enough for a phone camera', url.length < 520 && modules <= 77, `${url.length} characters, ${modules}×${modules} modules`);
  check('the phone\'s code is small enough for a laptop camera', code.length < 180, `${code.length} characters`);
  check('the phone\'s code is black on white, whatever the palette', await phone.evaluate(() => {
    const c = document.getElementById('pair-qr');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const tones = new Set();
    for (let i = 0; i < d.length; i += 4) tones.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    return tones.size === 2 && tones.has('0,0,0') && tones.has('255,255,255') && getComputedStyle(document.getElementById('pair')).backgroundColor === 'rgb(255, 255, 255)';
  }));
  check('the pairing server really is out of reach', (await status()).phone.signal !== 'open', (await status()).phone.signal);

  console.log('pairing');
  check('nothing is read while no code is in front of the camera', (await control.locator('#offline-state').textContent()).includes('Waiting'));
  await showToMac(control, picture);
  check('the Mac\'s camera reads the phone\'s code, and the phone pairs and streams with no pairing server', await paired(), JSON.stringify((await status()).phone.error));
  await showToMac(control, null);
  check('the dialog closes by itself and the camera is let go', await settle(() => control.evaluate(() => document.getElementById('offline-pair').hidden && !document.getElementById('offline-video').srcObject), 'dialog closed'));
  check('the phone\'s code goes away', await settle(() => phone.evaluate(() => document.getElementById('pair').hidden), 'code hidden'));
  await control.keyboard.press('1');
  check('video arrives', await settle(async () => (await status()).input.state === 'live' && (await status()).input.fps > 3, 'video live', 20000));
  check('the route is direct', await settle(async () => (await status()).phone.route === 'direct (LAN)', 'route'), (await status()).phone.route);
  check('sensor packets arrive', await settle(async () => (await status()).sensors?.live, 'sensors'));
  check('top bar says streaming', (await control.locator('#phone-pill').textContent()).includes('streaming'), await control.locator('#phone-pill').textContent());
  check('the phone says LIVE', await settle(async () => (await phone.locator('#state').textContent()).startsWith('LIVE'), 'phone live'), await phone.locator('#state').textContent());
  await control.click('#palette > button');
  await control.click('#palette-menu button[aria-label="Palette: Ice"]');
  check('the phone follows the palette over the direct link', await settle(() => phone.evaluate(() => document.documentElement.dataset.palette === 'ice'), 'palette'));

  console.log('camera off and on, no new handshake');
  await phone.click('text=Camera on');
  check('camera off holds the picture', await settle(async () => (await status()).phone.info?.controllerOnly === true && (await status()).input.state === 'paused', 'paused'), (await status()).input.state);
  await phone.click('text=Camera off');
  check('camera on brings it back on the same link', await settle(async () => (await status()).input.state === 'live' && (await status()).phone.direct, 'live again', 20000), (await status()).input.state);

  console.log('an old code');
  await control.evaluate(() => window.thirdEye.ui.pairOffline());
  await waitFor(() => control.evaluate((old) => document.getElementById('offline-link').href !== old && document.getElementById('offline-link').href.includes('#o='), url), { label: 'new offer' });
  await showToMac(control, picture);
  check('a code from an earlier attempt is refused, with what to do', await settle(async () => (await control.locator('#offline-state').textContent()).includes('earlier attempt'), 'refused'), await control.locator('#offline-state').textContent());
  await showToMac(control, null);
  await control.evaluate(() => window.thirdEye.ui.closePairOffline());
  check('and the phone stays paired', (await status()).phone.phone === 'connected' && (await status()).phone.direct);

  console.log('the link is lost');
  await phone.close();
  check('the Mac says so, with the way back', await settle(async () => (await alertKeys()).includes('direct-lost'), 'alert', 20000) && (await control.locator('#alerts [data-key="direct-lost"] .act').textContent()).includes('Pair without internet'));

  console.log('pairing again, slowly');
  ({ phone, url, code, picture } = await begin(() => control.locator('#alerts [data-key="direct-lost"] .go').dispatchEvent('click')));
  // Twenty seconds between the phone showing its code and the Mac reading
  // it: longer than a handshake left hanging would survive if the phone
  // were trying to reach the Mac in the meantime.
  await sleep(20000);
  await showToMac(control, picture);
  check('a code read twenty seconds later still pairs', await paired());
  check('the alert clears', await settle(async () => !(await alertKeys()).includes('direct-lost'), 'alert gone'));
  check('video arrives again', await settle(async () => (await status()).input.state === 'live', 'video live', 20000));

  // The phone and the Mac keep trying the pairing server; here it never answers.
  const real = errors.filter((e) => !benignError(e) && !/ERR_TUNNEL_CONNECTION_FAILED|Could not get an ID|Aborting|retrieving ID/.test(e));
  check('no unexpected console errors', real.length === 0, real.slice(0, 3).join(' | '));
} catch (err) {
  check('test ran to completion', false, err.message.split('\n')[0]);
} finally {
  await browser.close();
  await site.close();
}

if (failureCount()) {
  console.log(`\n${failureCount()} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
process.exit(0);
