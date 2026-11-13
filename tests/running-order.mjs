// The running order: steps that point at presets. Building it from the
// strip, stepping it with Next / Prev, going off the list and back, notes and
// fades, reordering, removing, what the phone's six buttons show, the export
// file, and the order carrying on with /control closed.
//   node tests/running-order.mjs

import { readFile } from 'node:fs/promises';
import { benignError, check, failureCount, launch, openSession, startPeerServer, startSite, stopPeerServer, waitFor, watch } from './lib.mjs';

const site = await startSite();
const peerServer = await startPeerServer();
const browser = await launch();
const errors = [];
const settle = (fn, label, timeout = 8000) => waitFor(fn, { label, timeout }).then(() => true, () => false);

try {
  const session = await openSession(browser, site, peerServer, errors);
  const { context, output, phone } = session;
  let { control } = session;
  const mac = (fn, arg) => control.evaluate(fn, arg);
  const order = () => mac(() => ({ ...window.thirdEye.store.state.order, preset: window.thirdEye.store.state.presetIndex }));
  const at = async (cue, off, preset) => {
    const o = await order();
    return o.cue === cue && o.off === off && (preset === undefined || o.preset === preset);
  };
  const stepNames = () => control.locator('.tile.step .name').allTextContents();
  const statusText = () => control.locator('#strip-status').textContent();
  const buttons = () => phone.evaluate(() => [...document.querySelectorAll('#presets .preset')].map((b) => ({ name: b.querySelector('.pname')?.textContent ?? '', on: b.classList.contains('on'), next: b.classList.contains('next'), off: b.disabled })));
  const tap = (i) => phone.locator('#presets .preset').nth(i).dispatchEvent('click');

  console.log('with no running order the strip is the preset strip');
  const P = await control.locator('.tile:not(.new) .name').allTextContents();
  check('the heading reads Presets and there is no switch', (await control.locator('.strip-head .caps').first().isVisible()) && (await control.locator('#strip-order').isHidden()) && (await control.locator('#strip-all').isHidden()));
  check('every preset tile has a + and an Edit', (await control.locator('.tile .add').count()) === P.length && (await control.locator('.tile .edit').count()) === P.length);
  check('every preset has an id of its own', await mac(() => new Set(window.thirdEye.ui.presets.list.map((p) => p.id)).size === window.thirdEye.ui.presets.list.length));
  check('the phone shows the first six presets', await settle(async () => (await buttons()).map((b) => b.name).join() === P.slice(0, 6).join(), 'phone presets'), (await buttons()).map((b) => b.name).join());

  console.log('building it');
  for (const i of [1, 2, 1, 0]) await control.locator('.tile .add').nth(i).click();
  check('four steps are stored, pointing at presets by id', await mac(() => {
    const { steps } = JSON.parse(localStorage.getItem('thirdeye.order.v1'));
    const ids = window.thirdEye.ui.presets.list.map((p) => p.id);
    return steps.length === 4 && steps.map((s) => ids.indexOf(s.preset)).join() === '1,2,1,0';
  }));
  check('the switch appears and counts them', (await control.locator('#strip-order').textContent()) === 'Running order · 4' && (await control.locator('#strip-all').getAttribute('aria-pressed')) === 'true');
  check('adding leaves you on All presets', (await control.locator('.tile .add').count()) === P.length);
  check('the phone now shows the steps, the first one dashed', await settle(async () => {
    const b = await buttons();
    return b.map((x) => x.name).join() === [P[1], P[2], P[1], P[0], '', ''].join() && b[0].next && !b.some((x) => x.on) && b[4].off && b[5].off;
  }, 'phone steps'), JSON.stringify(await buttons()));
  await control.click('#strip-order');
  check('Running order shows the steps in order', (await stepNames()).join() === [P[1], P[2], P[1], P[0]].join(), (await stepNames()).join());
  check('before the first step it says so', (await statusText()) === `Not started. Next loads step 1, ${P[1]}.`, await statusText());

  console.log('stepping');
  await control.keyboard.press(']');
  check('Next loads step 1', await settle(() => at(0, false, 1), 'step 1'));
  check('the live step is lit and the next one dashed', await settle(async () => (await control.locator('.tile.step').nth(0).evaluate((t) => t.classList.contains('on'))) && (await control.locator('.tile.step.next .tag').textContent()) === 'Next' && (await control.locator('.tile.step').nth(1).evaluate((t) => t.classList.contains('next'))), 'tiles'));
  check('the phone follows', await settle(async () => {
    const b = await buttons();
    return b[0].on && b[1].next && !b[0].next;
  }, 'phone follows'));
  await control.keyboard.press(']');
  await control.locator('.strip-head >> text=Next ]').click();
  check('the same preset can come round again (step 3)', await settle(() => at(2, false, 1), 'step 3'), JSON.stringify(await order()));

  console.log('off the list and back');
  await control.click('#strip-all');
  await control.locator('.tile .load').nth(4).click();
  check('a preset picked by hand goes live and the order keeps its place', await settle(() => at(2, true, 4), 'off list'), JSON.stringify(await order()));
  check('the strip says where Next goes', (await statusText()) === `Off the list on ${P[4]}. Next returns to step 3.`, await statusText());
  await control.click('#strip-order');
  check('the step to return to is dashed and nothing is lit', (await control.locator('.tile.step.on').count()) === 0 && (await control.locator('.tile.step').nth(2).locator('.tag').textContent()) === 'Return');
  check('on the phone too', await settle(async () => {
    const b = await buttons();
    return !b.some((x) => x.on) && b[2].next;
  }, 'phone return'));
  await control.keyboard.press(']');
  check('Next returns to the step that was left', await settle(() => at(2, false, 1), 'returned'), JSON.stringify(await order()));
  await control.keyboard.press('[');
  check('Prev goes back one step', await settle(() => at(1, false, 2), 'prev'));
  await control.keyboard.press(']');
  await control.keyboard.press(']');
  check('Next reaches the last step', await settle(() => at(3, false, 0), 'last'));
  check('and says so', (await statusText()) === 'Last step.', await statusText());
  await control.keyboard.press(']');
  await control.keyboard.press(']');
  check('Next stops at the end', await at(3, false, 0));

  console.log('from the phone');
  await tap(0);
  check('a button on the phone loads its step', await settle(() => at(0, false, 1), 'phone step'), JSON.stringify(await order()));

  console.log('a note and a fade for one step');
  await control.locator('.tile.step .note-edit').nth(1).click();
  check('the dialog names the step', (await control.locator('#step-title').textContent()) === `Step 2 · ${P[2]}`);
  await control.fill('#step-note', 'Chorus.');
  await control.fill('#step-fade', '0.5');
  await control.locator('#step-dialog >> text=Done').click();
  check('the note is on the tile', (await control.locator('.tile.step').nth(1).locator('.note').textContent()) === 'Chorus.');
  check('and in what comes next', (await statusText()) === `Next: 2 ${P[2]} · Chorus.`, await statusText());
  await mac(() => {
    window.__ops = [];
    window.thirdEye.store.subscribe((op) => window.__ops.push(op));
  });
  await control.keyboard.press(']');
  check("the step's own fade is used", await settle(() => mac(() => window.__ops.some((op) => op.op === 'scene' && op.cue === 1 && op.fade === 0.5)), 'fade'));

  console.log('rearranging');
  await control.locator('.tile.step').nth(3).dragTo(control.locator('.tile.step').nth(0));
  check('a step can be dragged to a new place', await settle(async () => (await stepNames()).join() === [P[0], P[1], P[2], P[1]].join(), 'moved'), (await stepNames()).join());
  check('the live step is still the live step', (await at(2, false, 2)) && (await control.locator('.tile.step.on .name').textContent()) === P[2], JSON.stringify(await order()));
  await control.locator('.tile.step .remove').nth(0).click();
  check('× removes a step and keeps the preset', await settle(async () => (await stepNames()).join() === [P[1], P[2], P[1]].join() && (await at(1, false, 2)), 'removed') && (await mac(() => window.thirdEye.ui.presets.list.length)) === P.length);
  await control.locator('.tile.step .remove').nth(1).click();
  check('removing the live step leaves the picture and waits on the next', await settle(() => at(1, true, 2), 'live removed'), JSON.stringify(await order()));
  await mac(() => window.thirdEye.ui.presets.move(0, 3));
  check('reordering presets does not disturb the steps', (await stepNames()).join() === [P[1], P[1]].join(), (await stepNames()).join());
  await mac((name) => {
    const { presets } = window.thirdEye.ui;
    presets.addStep(presets.list.findIndex((p) => p.name === name));
  }, P[2]);
  await mac((name) => {
    const { presets } = window.thirdEye.ui;
    presets.remove(presets.list.findIndex((p) => p.name === name));
  }, P[1]);
  check('deleting a preset takes its steps with it', await settle(async () => (await stepNames()).join() === P[2], 'pruned') && (await order()).cue === 0, `${(await stepNames()).join()} ${JSON.stringify(await order())}`);

  console.log('it is kept');
  await control.reload();
  await waitFor(() => control.evaluate(() => !!window.thirdEye?.ui?.presets), { label: 'control back' });
  check('after a reload the order and the view are as they were', await settle(async () => (await stepNames()).join() === P[2] && (await control.locator('#strip-order').getAttribute('aria-pressed')) === 'true', 'reloaded'));

  console.log('files');
  await control.click('#views button[data-view=setup]');
  const [download] = await Promise.all([control.waitForEvent('download'), control.click('#library-panel >> text=Export presets')]);
  const file = JSON.parse(await readFile(await download.path(), 'utf8'));
  check('the export carries the order by place in the file', file.order?.length === 1 && file.presets[file.order[0].preset].name === P[2] && !('id' in file.presets[0]), JSON.stringify(file.order));
  const incoming = { format: file.format, version: 1, presets: [{ ...file.presets[0], name: 'One' }, { ...file.presets[1], name: 'Two' }], order: [{ preset: 0, note: 'Open', fade: 1 }, { preset: 1, note: '', fade: null }, { preset: 0, note: '', fade: null }, { preset: 7, note: 'no such preset' }] };
  const before = await mac(() => window.thirdEye.ui.presets.list.length);
  control.once('dialog', (d) => d.accept());
  await control.setInputFiles('#library-panel input[type=file]', { name: 'show.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
  await control.click('#views button[data-view=perform]');
  check('an import adds its presets and, when asked, takes its order', await settle(async () => (await stepNames()).join() === 'One,Two,One' && (await mac(() => window.thirdEye.ui.presets.list.length)) === before + 2, 'imported'), (await stepNames()).join());
  check('its note came too and the order starts over', (await control.locator('.tile.step').nth(0).locator('.note').textContent()) === 'Open' && (await order()).cue === -1);
  check('a file without presets ids still gets them here', await mac(() => window.thirdEye.ui.presets.list.every((p) => typeof p.id === 'string' && p.id.length >= 3)));

  console.log('with /control closed');
  await control.close();
  check('the phone still shows the steps', await settle(async () => (await buttons()).slice(0, 3).map((b) => b.name).join() === 'One,Two,One', 'phone order'), JSON.stringify(await buttons()));
  await tap(1);
  check('and its buttons still step the order', await settle(() => output.evaluate(() => window.thirdEye.store.state.order.cue === 1 && !window.thirdEye.store.state.order.off), 'output steps'));
  check('the phone lights the live step', await settle(async () => {
    const b = await buttons();
    return b[1].on && b[2].next;
  }, 'phone lit'));

  console.log('emptied, it is the preset strip again');
  control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  await waitFor(() => control.evaluate(() => !!window.thirdEye?.ui?.presets), { label: 'control again' });
  await mac(() => window.thirdEye.ui.presets.setSteps([]));
  check('no switch, and the heading is back', await settle(async () => (await control.locator('#strip-order').isHidden()) && (await control.locator('.strip-head .caps').first().isVisible()), 'plain strip'));
  const all = await control.locator('.tile:not(.new) .name').allTextContents();
  check('the phone shows presets again', await settle(async () => (await buttons()).map((b) => b.name).join() === all.slice(0, 6).join(), 'phone presets again'), (await buttons()).map((b) => b.name).join());
  await control.locator('.tile .load').nth(all.length - 1).click();
  await control.keyboard.press(']');
  check('Next walks the presets and wraps, as before', await settle(async () => (await order()).preset === 0, 'wrapped'), JSON.stringify(await order()));
  await context.close();

  console.log('with no output window (/control makes the picture)');
  const solo = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const alone = await solo.newPage();
  watch(alone, 'control alone', errors);
  await alone.goto(`${site.url}/control/`);
  await waitFor(() => alone.evaluate(() => window.thirdEye.ui.status?.renderFps > 0), { label: 'local engine', timeout: 20000 });
  await alone.evaluate(() => {
    window.__sent = [];
    const { link } = window.thirdEye.engine;
    const send = link.send.bind(link);
    link.send = (msg) => {
      window.__sent.push(msg);
      return send(msg);
    };
  });
  await alone.locator('.tile .add').nth(2).click();
  await alone.locator('.tile .add').nth(3).click();
  check('the engine here is told about the order at once', await settle(() => alone.evaluate(() => window.__sent.some((m) => m.t === 'presets' && m.order && m.names.length === 2 && m.next === 0)), 'sent'));
  await alone.keyboard.press(']');
  await alone.keyboard.press(']');
  check('and steps it', await settle(() => alone.evaluate(() => window.thirdEye.store.state.order.cue === 1 && window.thirdEye.store.state.presetIndex === 3), 'solo steps'));
  await solo.close();

  const real = errors.filter((e) => !benignError(e));
  check('no errors in any window', real.length === 0, real.slice(0, 3).join(' | '));
} catch (err) {
  console.log(`  FAIL ${err.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  await stopPeerServer(peerServer);
  await site.close();
}

console.log(failureCount() ? `\n${failureCount()} check(s) failed` : '\nall checks passed');
process.exit(failureCount() || process.exitCode ? 1 : 0);
