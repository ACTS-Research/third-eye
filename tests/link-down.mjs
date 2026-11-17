// The phone when the Mac is not receiving: the band along the foot of the
// preview (what is wrong, retrying or not, a button only when a tap is
// needed), the grey preview and the pulsing edge, the pad left alone, and
// the Resume screen when the page is reopened mid-show.
//   node tests/link-down.mjs

import { benignError, check, failureCount, launch, openSession, startPeerServer, startSite, stopPeerServer, waitFor } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch();
const errors = [];
const settle = (fn, label, timeout = 15000) => waitFor(fn, { label, timeout }).then(() => true, () => false);

try {
  const { control, output, phone, url } = await openSession(browser, site, peerServer, errors);
  const mac = (fn, arg) => control.evaluate(fn, arg);
  const band = () => phone.evaluate(() => ({
    shown: !document.getElementById('down').hidden,
    title: document.getElementById('down-title').textContent,
    line: document.getElementById('down-line').textContent,
    button: document.getElementById('reconnect').hidden ? '' : document.getElementById('reconnect').textContent,
    stale: document.getElementById('stage').classList.contains('stale'),
    alarm: document.getElementById('root').classList.contains('alarm'),
  }));
  const say = async () => JSON.stringify(await band());
  const live = () => settle(async () => (await phone.locator('#state').textContent()).startsWith('LIVE') && !(await band()).shown, 'live', 30000);

  console.log('while all is well');
  await live();
  check('there is no band, no grey and no alarm', await settle(async () => {
    const b = await band();
    return !b.shown && !b.stale && !b.alarm && !b.button;
  }, 'quiet'), await say());

  console.log('it needs the operator');
  const room = await mac(() => window.thirdEye.store.state.net.room);
  await mac(() => window.thirdEye.store.merge('net', { room: 'ZZZZ9' }));
  check('a Mac that has left the room is named, with what to do', await settle(async () => {
    const b = await band();
    return b.shown && b.title === 'Mac not found' && b.line.includes('go to the Mac and scan its code') && b.button === 'Scan code';
  }, 'not found', 40000), await say());
  check('the preview goes grey and the edge of the screen pulses', (await band()).stale && (await band()).alarm);
  const place = await phone.evaluate(() => {
    const s = document.getElementById('stage').getBoundingClientRect();
    const d = document.getElementById('down').getBoundingClientRect();
    const t = document.querySelector('.trig').getBoundingClientRect();
    return { foot: Math.abs(d.bottom - s.bottom) < 3 && d.left >= s.left - 1 && d.right <= s.right + 1, part: d.height < s.height * 0.5, trig: `${Math.round(t.left)},${Math.round(t.top)}` };
  });
  check('the band lies along the foot of the preview and leaves most of it in view', place.foot && place.part, JSON.stringify(place));
  const button = await phone.locator('#reconnect').boundingBox();
  check('the button is large enough to hit', button.height >= 44 && button.width >= 100, `${Math.round(button.width)}×${Math.round(button.height)}`);
  const text = await phone.locator('#down .down-text').boundingBox();
  await phone.mouse.click(text.x + 20, text.y + 10);
  check('a tap on the band is not a touch on the pad', await output.evaluate(() => (window.thirdEye.engine.mod.values.get('pad.touch') ?? 0) === 0).catch(() => true));
  await phone.setViewportSize({ width: 390, height: 844 });
  check('upright it is still along the foot of the preview', await settle(() => phone.evaluate(() => {
    const s = document.getElementById('stage').getBoundingClientRect();
    const d = document.getElementById('down').getBoundingClientRect();
    return Math.abs(d.bottom - s.bottom) < 3 && d.right <= s.right + 1 && d.height < s.height * 0.7;
  }), 'upright'));
  await phone.setViewportSize({ width: 844, height: 390 });
  await mac((r) => window.thirdEye.store.merge('net', { room: r }), room);
  check('when the Mac is back under the room the phone returns by itself and the band goes', await live(), await say());
  check('nothing moved while it was up', (await phone.evaluate(() => {
    const t = document.querySelector('.trig').getBoundingClientRect();
    return `${Math.round(t.left)},${Math.round(t.top)}`;
  })) === place.trig);

  console.log('reopening the page mid-show');
  await phone.reload();
  check('a page that was live a moment ago opens on Resume, not the start form', (await phone.locator('#resume').isVisible()) && (await phone.locator('#join').isHidden()) && (await phone.locator('#resume-room').textContent()).includes(room), await phone.locator('#resume-room').textContent());
  const go = await phone.locator('#resume-go').boundingBox();
  check('Resume fills most of the screen', go.width * go.height > 844 * 390 * 0.5, `${Math.round(go.width)}×${Math.round(go.height)}`);
  await phone.click('#resume-go');
  check('one tap carries on, in the same room', await live(), await phone.locator('#state').textContent());
  await phone.reload();
  await phone.click('#resume-other');
  check('Another room… gives the ordinary start screen', (await phone.locator('#join').isVisible()) && (await phone.locator('#resume').isHidden()) && (await phone.inputValue('#room-input')) === room);
  await phone.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('thirdeye.phone.v1'));
    p.liveAt = Date.now() - 10 * 60 * 1000;
    localStorage.setItem('thirdeye.phone.v1', JSON.stringify(p));
  });
  await phone.goto(url);
  check('after ten minutes away it is the ordinary start screen again', (await phone.locator('#join').isVisible()) && (await phone.locator('#resume').isHidden()));
  await phone.click('#start');
  await live();
  await phone.goto(url.replace(`room=${room}`, 'room=OTHER'));
  check('a pairing link for another room is a fresh start, not a resume', (await phone.locator('#join').isVisible()) && (await phone.locator('#resume').isHidden()) && (await phone.inputValue('#room-input')) === 'OTHER');
  await phone.goto(url);
  await phone.click('#resume-go');
  await live();

  console.log('the phone gets itself back');
  // The Mac goes altogether: its pages close. The phone can reach the
  // pairing server, so it keeps dialling.
  await output.close();
  await control.close();
  check('the band says the phone is retrying, with the time, and asks nothing at first', await settle(async () => {
    const b = await band();
    return b.shown && /Retrying by itself · \d+ s/.test(b.line) && !b.button;
  }, 'retrying', 40000), await say());
  check('once that has gone on a while there is a way to try by hand, or to scan', await settle(async () => ['Reconnect', 'Scan code'].includes((await band()).button), 'button', 40000), await say());

  const real = errors.filter((e) => !benignError(e));
  check('no unexpected console errors', real.length === 0, real.slice(0, 3).join(' | '));
} catch (err) {
  check('the suite ran to the end', false, err.stack ?? String(err));
} finally {
  await browser.close();
  await site.close();
  await stopPeerServer(peerServer);
}
console.log(failureCount() ? `\n${failureCount()} check(s) failed` : '\nall checks passed');
process.exit(failureCount() ? 1 : 0);
