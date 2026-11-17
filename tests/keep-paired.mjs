// Keeping what is paired: a paired phone cannot be pushed out by another
// phone on the same code (and may itself redial at any time), the room code
// is not changed under a phone that has paired, and a phone holds on to a
// link it could not make again.
//   node tests/keep-paired.mjs

import { benignError, check, failureCount, launch, openSession, sleep, startPeerServer, startSite, stopPeerServer, waitFor, watch } from './lib.mjs';

const site = await startSite();
let peerServer = await startPeerServer();
const browser = await launch();
const errors = [];
const settle = (fn, label, timeout = 15000) => waitFor(fn, { label, timeout }).then(() => true, () => false);

try {
  const { control, output, phone, url } = await openSession(browser, site, peerServer, errors);
  const mac = (fn, arg) => output.evaluate(fn, arg);
  const status = () => control.evaluate(() => window.thirdEye.ui.status);
  const paired = async () => (await status())?.phone.phone === 'connected';
  const bar = (page) => page.evaluate(() => document.getElementById('state').textContent);
  const frames = () => mac(() => window.thirdEye.engine.inputs.feeds.phone.frames);

  console.log('another phone scans the code');
  const device = await phone.evaluate(() => JSON.parse(localStorage.getItem('thirdeye.phone.v1')).device);
  check('each phone has an id of its own, and the Mac knows the paired one', device.length >= 8 && (await mac(() => window.thirdEye.engine.link.device)) === device, device);
  // A separate browser context is another phone: its own storage, its own id.
  const elsewhere = await browser.newContext({ viewport: { width: 844, height: 390 } });
  await elsewhere.grantPermissions(['camera', 'microphone']);
  const stranger = await elsewhere.newPage();
  watch(stranger, 'stranger', errors);
  await stranger.goto(url);
  await stranger.click('#start');
  check('it is told the Mac already has a phone', await settle(async () => (await bar(stranger)) === 'This Mac already has an iPhone.', 'busy', 20000), await bar(stranger));
  check('the Mac turned it away', await settle(async () => (await mac(() => window.thirdEye.engine.link.turnedAway)) > 0 && (await status()).phone.turnedAway > 0, 'turned away', 8000), JSON.stringify({ engine: await mac(() => window.thirdEye.engine.link.turnedAway), status: (await status()).phone.turnedAway }));
  const before = await frames();
  await sleep(4000);
  check('the paired phone keeps its place and its picture', (await paired()) && (await mac(() => window.thirdEye.engine.link.device)) === device && (await frames()) > before && (await bar(phone)).startsWith('LIVE'), await bar(phone));
  await control.evaluate(() => window.thirdEye.store.merge('net', { second: true }));
  check('with a second phone switched on, it is pointed to the iPhone B code', await settle(async () => (await bar(stranger)) === 'This Mac already has an iPhone. Scan its iPhone B code.', 'busy B', 15000), await bar(stranger));
  await control.evaluate(() => window.thirdEye.store.merge('net', { second: false }));

  console.log('the paired phone itself may redial');
  await phone.evaluate(() => window.thirdEyePhone.link.restart());
  check('a redial from the paired phone is let in at once', await settle(async () => (await paired()) && (await bar(phone)).startsWith('LIVE') && (await mac(() => window.thirdEye.engine.link.device)) === (await phone.evaluate(() => window.thirdEyePhone.link.device)), 'redial', 30000), await bar(phone));
  await phone.reload();
  await phone.click('#resume-go');
  check('and so is the same phone after its page reloads', await settle(async () => (await paired()) && (await bar(phone)).startsWith('LIVE'), 'reload', 30000), await bar(phone));
  check('the other phone is still waiting', (await bar(stranger)).startsWith('This Mac already has an iPhone'), await bar(stranger));

  console.log('a phone holds on to a link it could not make again');
  // The pairing server goes, then the Mac stops answering for a while (as
  // in a break in the network): the phone must keep the link, not drop it.
  await stranger.close();
  await stopPeerServer(peerServer);
  peerServer = null;
  await settle(() => phone.evaluate(() => !window.thirdEyePhone.link.peer?.open), 'signaling gone', 20000);
  await phone.evaluate(() => { window.__conn = window.thirdEyePhone.link.conn; });
  await mac(() => {
    const c = window.thirdEye.engine.link.conn;
    window.__send = c.send;
    c.send = () => {};
  });
  check('the phone says the Mac is not answering', await settle(async () => (await bar(phone)) === 'Mac not answering', 'silent', 25000), await bar(phone));
  await sleep(6000);
  check('but keeps the link, having no way to dial again', await phone.evaluate(() => window.thirdEyePhone.link.conn === window.__conn && window.__conn.open));
  await mac(() => { window.thirdEye.engine.link.conn.send = window.__send; });
  check('and carries on when the Mac answers again, with no new pairing', await settle(async () => (await bar(phone)).startsWith('LIVE') && (await phone.evaluate(() => window.thirdEyePhone.link.conn === window.__conn)), 'healed', 15000), await bar(phone));

  console.log('the room code under a paired phone');
  const room = await control.evaluate(() => window.thirdEye.store.state.net.room);
  await mac(() => window.thirdEye.engine.link.onRoomTaken());
  check('a code that reads as taken is kept, because a phone has paired on it', (await control.evaluate(() => window.thirdEye.store.state.net.room)) === room && (await mac(() => window.thirdEye.engine.link.notice)).includes('Still trying it'));
  check('and the Mac says so, with the way to a new one', await settle(async () => (await control.locator('#alerts').textContent()).includes('New room code'), 'alert'), await control.locator('#alerts').textContent());
  await mac(() => {
    localStorage.removeItem('thirdeye.pairedAt');
    window.thirdEye.engine.link.onRoomTaken();
  });
  check('with no phone paired lately it moves to a new code, as before', (await control.evaluate(() => window.thirdEye.store.state.net.room)) !== room);

  const real = errors.filter((e) => !benignError(e));
  check('no unexpected console errors', real.length === 0, real.slice(0, 3).join(' | '));
} catch (err) {
  check('the suite ran to the end', false, err.stack ?? String(err));
} finally {
  await browser.close();
  await site.close();
  if (peerServer) await stopPeerServer(peerServer);
}
console.log(failureCount() ? `\n${failureCount()} check(s) failed` : '\nall checks passed');
process.exit(failureCount() ? 1 : 0);
