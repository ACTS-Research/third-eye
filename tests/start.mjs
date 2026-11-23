// A fresh start, in a browser that has never opened the app: the Mac opens
// on the iPhone input with the splash where the picture will be (the mark,
// the code, one instruction, the ways on without a phone), the "Before the
// show" check and its flag; the phone's start screen and its check after
// START.
//   node tests/start.mjs

import jsQR from 'jsqr';
import { benignError, check, failureCount, launch, startPeerServer, startSite, stopPeerServer, waitFor, watch } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch([], { fresh: true });
const errors = [];
const settle = (fn, label, timeout = 15000) => waitFor(fn, { label, timeout }).then(() => true, () => false);

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.grantPermissions(['camera', 'microphone']);
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  await control.evaluate((signal) => window.thirdEye.store.merge('net', { signal }), peerServer.signalUrl);
  const mac = (fn, arg) => control.evaluate(fn, arg);
  const status = () => mac(() => window.thirdEye.ui.status);

  console.log('the Mac, never opened before');
  check('it opens on the iPhone input', (await mac(() => window.thirdEye.store.state.input.kind)) === 'phone');
  check('the splash is where the picture will be', await settle(() => control.evaluate(() => {
    const s = document.getElementById('splash');
    const m = document.querySelector('.monitor').getBoundingClientRect();
    const r = s.getBoundingClientRect();
    return !s.hidden && Math.abs(r.left - m.left) < 2 && Math.abs(r.width - m.width) < 2 && Math.abs(r.height - m.height) < 2;
  }), 'splash'));
  // The opening: the mark, a blink, noise, then the code. Once a session.
  check('the opening plays on a first visit', await settle(() => control.evaluate(() => ['opening', 'code'].includes(document.querySelector('#splash .code-mark').dataset.state)), 'opening'));
  check('and ends on the code, with the words under it', await settle(() => control.evaluate(() => document.querySelector('#splash .code-mark').dataset.state === 'code' && !document.querySelector('#splash .splash-text').classList.contains('waiting')), 'code', 12000));
  const splash = await control.evaluate(() => {
    const s = document.getElementById('splash');
    const code = s.querySelector('.code-mark').getBoundingClientRect();
    return { order: [...s.children].map((n) => n.classList[0]), text: s.textContent, width: code.width, top: code.top, textTop: s.querySelector('.splash-text').getBoundingClientRect().top };
  });
  check('the camera holding the code is the one large thing, above the words', splash.order[0] === 'code-mark' && splash.width > 200 && splash.textTop > splash.top, JSON.stringify({ ...splash, text: '' }));
  check('with the one instruction and the room code, and no title', splash.text.includes('Point the iPhone\'s camera at this code and open the link.') && splash.text.includes(await mac(() => window.thirdEye.store.state.net.room)) && !/third eye cam/i.test(splash.text), splash.text);
  check('it says how far pairing has got, and where a second iPhone goes', /Ready\.|pairing server|room code is in use/.test(splash.text) && splash.text.includes('A second iPhone?'), splash.text);
  // The code in the camera is the pairing link, readable as drawn in each
  // palette and with the interface dimmed right down.
  const readCode = async () => {
    const img = await control.evaluate(async () => {
      const svg = document.querySelector('#splash .code-mark');
      const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
      const xml = new XMLSerializer().serializeToString(svg).replaceAll('var(--ink)', ink).replace('<svg ', '<svg width="512" height="464" ');
      const im = new Image();
      await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`; });
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 464;
      const x = c.getContext('2d');
      x.fillRect(0, 0, 512, 464);
      x.drawImage(im, 0, 0, 512, 464);
      return Array.from(x.getImageData(0, 0, 512, 464).data);
    });
    return jsQR(new Uint8ClampedArray(img), 512, 464)?.data ?? null;
  };
  const link = await mac(() => window.thirdEye.ui.phoneLink());
  check('the code in the camera carries the pairing link', (await readCode()) === link, `${await readCode()} / ${link}`);
  await control.evaluate(() => { document.documentElement.dataset.palette = 'lime'; document.documentElement.style.setProperty('--ink', '#3a4512'); });
  check('and still reads in another colour, dimmed', (await readCode()) !== null);
  await control.evaluate(() => { delete document.documentElement.dataset.palette; document.documentElement.style.removeProperty('--ink'); });
  await control.locator('#splash >> text=Test pattern').click();
  check('Test pattern takes its place', (await mac(() => window.thirdEye.store.state.input.kind)) === 'pattern' && (await settle(() => control.locator('#splash').isHidden(), 'gone')));
  await control.keyboard.press('1');
  check('back on the iPhone input it returns', await settle(() => control.locator('#splash').isVisible(), 'back'));
  check('and shows the code at once: the opening plays only when a session starts', await control.evaluate(() => document.querySelector('#splash .code-mark').dataset.state === 'code' && !document.querySelector('#splash .splash-text').classList.contains('waiting')));

  console.log('before the show, on the Mac');
  const flag = () => control.locator('#check-flag').textContent();
  const rows = () => control.evaluate(() => [...document.querySelectorAll('#checks .check-row')].map((r) => `${r.querySelector('.check-mark').textContent}|${r.textContent}`));
  check('the top bar flags what needs a look', await settle(async () => (await control.locator('#check-flag').isVisible()) && /^Check \d$/.test(await flag()), 'flag'), await flag());
  const before = Number((await flag()).split(' ')[1]);
  await control.locator('#check-flag').click();
  check('the flag goes to the check, under Setup', (await mac(() => window.thirdEye.ui.view)) === 'setup' && (await control.locator('#check-panel').isVisible()));
  check('it says the picture would freeze if the phone dropped, with the way to fix it', (await rows()).some((r) => r.startsWith('CHECK|') && r.includes('the picture freezes') && r.includes('Go to Input')), (await rows()).join(' / '));
  check('and that no phone is paired', (await rows()).some((r) => r.startsWith('CHECK|') && r.includes('No phone is paired')));
  check('with the things only the operator can see', (await rows()).filter((r) => r.startsWith('YOU|')).length === 2);
  await mac(() => window.thirdEye.store.merge('input', { dropA: 'black' }));
  check('choosing a stand-by clears that line and lowers the count', await settle(async () => Number((await flag()).split(' ')[1]) === before - 1 && (await rows()).some((r) => r.startsWith('OK|') && r.includes('stand-by')), 'cleared'), await flag());
  await mac(() => window.thirdEye.ui.setView('perform'));

  console.log('the phone, never opened before');
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  watch(phone, 'phone', errors);
  await phone.goto(await control.locator('#phone-link').getAttribute('href'));
  check('its start screen has the mark and no title', (await phone.locator('#join-mark .mark').isVisible()) && (await phone.locator('#join h1').count()) === 0 && !/third eye cam/i.test(await phone.locator('#join').textContent()));
  await phone.click('#start');
  check('after START comes the check', await settle(() => phone.locator('#check').isVisible(), 'check'));
  const lines = () => phone.evaluate(() => [...document.querySelectorAll('#check-list .check-row')].map((r) => `${r.querySelector('.check-mark').textContent}|${r.textContent}`));
  check('the camera and the link to the Mac pass', await settle(async () => (await lines()).some((r) => r.startsWith('OK|') && r.includes('Camera')) && (await lines()).some((r) => r.startsWith('OK|') && r.includes('Linked to the Mac')), 'passes', 25000), (await lines()).join(' / '));
  check('on the first run of the day it names what only the operator can do, and waits', (await lines()).filter((r) => r.startsWith('YOU|')).length === 2 && (await phone.locator('#check').isVisible()));
  check('the Mac\'s splash has given way to the picture', await settle(async () => (await control.locator('#splash').isHidden()) && (await status()).input.state === 'live', 'picture', 25000));
  await phone.click('#check-go');
  check('GO LIVE goes to the live screen', (await phone.locator('#check').isHidden()) && (await settle(async () => (await phone.locator('#state').textContent()).startsWith('LIVE'), 'live', 25000)));
  check('the check can be switched off in the camera settings', await phone.evaluate(() => {
    document.getElementById('panel-toggle').click();
    const b = document.getElementById('check-pref');
    const was = b.textContent;
    b.click();
    return was === 'Check before the show: on' && b.textContent === 'Check before the show: off' && JSON.parse(localStorage.getItem('thirdeye.phone.v1')).check === false;
  }));
  await phone.evaluate(() => document.getElementById('check-pref').click());
  // A new start later the same day (not a resume: the page was not live lately).
  await phone.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('thirdeye.phone.v1'));
    p.liveAt = 0;
    localStorage.setItem('thirdeye.phone.v1', JSON.stringify(p));
  });
  await phone.reload();
  await phone.click('#start');
  check('later the same day those reminders are not repeated', await settle(async () => (await phone.locator('#check').isHidden()) || ((await lines()).length > 0 && (await lines()).every((r) => !r.startsWith('YOU|'))), 'second run'), (await lines()).join(' / '));

  const real = errors.filter((e) => !benignError(e));
  check('no unexpected console errors', real.length === 0, real.slice(0, 3).join(' | '));
  if (process.env.SHOTS) {
    await control.keyboard.press('4');
    await phone.close();
    await control.keyboard.press('1');
  }
} catch (err) {
  check('the suite ran to the end', false, err.stack ?? String(err));
} finally {
  await browser.close();
  await site.close();
  await stopPeerServer(peerServer);
}
console.log(failureCount() ? `\n${failureCount()} check(s) failed` : '\nall checks passed');
process.exit(failureCount() ? 1 : 0);
