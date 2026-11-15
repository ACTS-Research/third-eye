// Getting the phone back without closing its page: a Mac that goes quiet, a
// Mac that reloads, a room code that changes, and reading the Mac's ordinary
// pairing code (not only the Pair-without-internet one) inside the page.
//   node tests/reconnect.mjs

import { benignError, check, failureCount, fakePhoneCamera, launch, startPeerServer, startSite, stopPeerServer, waitFor, watch } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch();
const errors = [];
const settle = (fn, label, timeout = 15000) => waitFor(fn, { label, timeout }).then(() => true, () => false);

try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.grantPermissions(['camera', 'microphone']);
  await fakePhoneCamera(context);
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  await control.evaluate((sig) => window.thirdEye.store.merge('net', { signal: sig }), peerServer.signalUrl);
  const macPhone = () => control.evaluate(() => window.thirdEye.ui.status?.phone);
  await waitFor(async () => (await macPhone())?.signal === 'open', { label: 'registered', timeout: 20000 });
  const room = await control.locator('#room-code').textContent();
  // The pairing pop-over, opened to pair a phone.
  await control.locator('#phone-pill').click();
  const popOpen = () => control.locator('#pairing-pop').isVisible();
  check('the pairing pop-over is open, waiting for a phone', await popOpen());
  const phone = await context.newPage();
  watch(phone, 'phone', errors);
  await phone.setViewportSize({ width: 844, height: 390 });
  await phone.goto(await control.locator('#phone-link').getAttribute('href'));
  await phone.locator('#start').dispatchEvent('click');
  const stateText = () => phone.locator('#state').textContent();
  const live = (timeout = 25000) => settle(async () => (await stateText()).startsWith('LIVE'), 'live', timeout);
  const button = async () => ((await phone.locator('#reconnect').isHidden()) ? '' : await phone.locator('#reconnect').textContent());
  // Holds the Mac's ordinary pairing code up to the phone's camera.
  const showPairingCode = async () => phone.evaluate((p) => window.__show(p), await control.evaluate(() => document.getElementById('qr').toDataURL()));
  check('paired the ordinary way', await live(30000), await stateText());
  check('once the phone has paired the pop-over closes by itself', await settle(async () => !(await popOpen()), 'pop closed', 12000));
  await control.locator('#phone-pill').dispatchEvent('click');
  await new Promise((r) => setTimeout(r, 3500));
  check('opened again with the phone already paired, it stays', await popOpen());
  await control.locator('#phone-pill').dispatchEvent('click');

  console.log('a Mac that stops answering');
  await phone.evaluate(() => {
    window.__firstConn = window.thirdEyePhone.link.conn;
  });
  // The connection stays up as far as the browser can tell; the Mac just
  // never says anything on it again.
  await control.evaluate(() => {
    window.thirdEye.engine.link.conn.send = () => {};
  });
  const t0 = Date.now();
  check('the phone gives up on a silent link and dials again', await settle(() => phone.evaluate(() => window.thirdEyePhone.link.conn && window.thirdEyePhone.link.conn !== window.__firstConn && window.thirdEyePhone.link.state.data === 'open'), 'redialled', 25000), `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  check('and is live again by itself', await live(), await stateText());

  console.log('a Mac that reloads');
  const t1 = Date.now();
  await control.reload();
  await waitFor(() => control.evaluate(() => !!window.thirdEye?.ui?.status), { label: 'control back', timeout: 20000 });
  check('the phone finds it again without a tap', await settle(async () => (await macPhone())?.phone === 'connected' && (await stateText()).startsWith('LIVE'), 'back after reload', 30000), `${((Date.now() - t1) / 1000).toFixed(1)} s`);
  check('the room code is the same', (await control.locator('#room-code').textContent()) === room);
  check('the Mac waits over a minute before giving up a room code', await control.evaluate(() => window.thirdEye.engine.link.takenWaitMs >= 60000));

  console.log('scanning while the link comes back by itself');
  await phone.evaluate(() => window.thirdEyePhone.link.dropConn());
  await phone.locator('#panel-toggle').dispatchEvent('click');
  await phone.locator('#scan').dispatchEvent('click');
  check('scanning stops by itself once the link is up', await settle(async () => (await phone.locator('#scan-hint').isHidden()) && (await button()) === '' && (await stateText()).startsWith('LIVE'), 'scan stopped', 25000), `${await button()} | ${await stateText()}`);

  console.log('the ordinary pairing code, read inside the page');
  await phone.locator('#panel-toggle').dispatchEvent('click');
  await phone.locator('#scan').dispatchEvent('click');
  check('what to do is written on the preview and the status line stays readable', await settle(async () => !(await phone.locator('#scan-hint').isHidden()), 'hint') && (await phone.locator('#note').textContent()) === '' && (await stateText()).startsWith('LIVE'), await stateText());
  await showPairingCode();
  check('read while linked to that room, it says so and stops', await settle(async () => (await phone.locator('#note').textContent()).includes(`Already linked to the Mac (room ${room})`) && (await phone.locator('#scan-hint').isHidden()), 'already linked', 25000), await phone.locator('#note').textContent());
  await phone.evaluate(() => window.__show(null));

  console.log('a room code that changes');
  await control.evaluate(() => window.thirdEye.store.merge('net', { room: 'QX7RM' }));
  await waitFor(async () => (await macPhone())?.signal === 'open' && (await control.locator('#phone-link').getAttribute('href')).includes('room=QX7RM'), { label: 'new room up', timeout: 20000 });
  check('the phone says the Mac is not there and offers to scan', await settle(async () => (await button()) === 'Scan code' && /Mac not found/.test(await stateText()), 'scan offered', 25000), `${await button()} | ${await stateText()}`);
  await phone.locator('#reconnect').dispatchEvent('click');
  await showPairingCode();
  check('reading the new code joins the new room', await settle(async () => (await phone.locator('#room-label').textContent()) === 'QX7RM' && (await stateText()).startsWith('LIVE'), 'joined', 30000), `${await phone.locator('#room-label').textContent()} | ${await stateText()}`);
  check('the Mac has the phone back', await settle(async () => (await macPhone())?.phone === 'connected' && !(await macPhone()).direct, 'mac side'));
  check('the new room is remembered and the button is gone', (await phone.evaluate(() => JSON.parse(localStorage.getItem('thirdeye.phone.v1')).room)) === 'QX7RM' && (await button()) === '');
  await phone.evaluate(() => window.__show(null));

  console.log('Reconnect by hand still works');
  await phone.evaluate(() => {
    const { link } = window.thirdEyePhone;
    link.dropConn();
    link.connTriedAt = performance.now() + 60000; // no automatic redial for a while
    link.changed();
  });
  check('the button reads Reconnect when the Mac is there', await settle(async () => (await button()) === 'Reconnect', 'reconnect button'), await button());
  await phone.locator('#reconnect').dispatchEvent('click');
  check('and brings the phone back', await live(), await stateText());

  const real = errors.filter((e) => !benignError(e) && !/Could not connect to peer|peer-unavailable/i.test(e));
  check('no unexpected errors', real.length === 0, real.slice(0, 3).join(' | '));
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
