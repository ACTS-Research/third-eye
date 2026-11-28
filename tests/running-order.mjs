// Shows: each a name, a tempo and steps that point at presets (the live
// show's steps were "the running order" before shows). Building one from the
// strip, stepping it with Next / Prev, going off the list and back, notes and
// fades, reordering, removing, what the phone's six buttons show, the files,
// the order carrying on with /control closed; then several shows, the Show
// menu, show files, tempo, and the backup to a folder.
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
  const buttons = () => phone.evaluate(() => [...document.querySelectorAll('#presets .preset')].map((b) => ({ n: b.querySelector('b')?.textContent ?? '', name: b.querySelector('.pname')?.textContent ?? '', on: b.classList.contains('on'), next: b.classList.contains('next'), off: b.disabled })));
  const tap = (i) => phone.locator('#presets .preset').nth(i).dispatchEvent('click');

  console.log('with no steps the strip is the preset strip');
  const P = await control.locator('.tile:not(.new) .name').allTextContents();
  check('the head names the show, which cannot be shown yet, and All presets is on', (await control.locator('#strip-order').textContent()) === 'My show' && (await control.locator('#strip-order').isDisabled()) && (await control.locator('#strip-all').getAttribute('aria-pressed')) === 'true');
  check('under the tiles, the Show menu names it', (await control.locator('#show-menu').textContent()).includes('Show: My show'));
  check('every preset tile has a + and an Edit', (await control.locator('.tile .add').count()) === P.length && (await control.locator('.tile .edit').count()) === P.length);
  check('every preset has an id of its own', await mac(() => new Set(window.thirdEye.ui.presets.list.map((p) => p.id)).size === window.thirdEye.ui.presets.list.length));
  check('the phone shows the first six presets', await settle(async () => (await buttons()).map((b) => b.name).join() === P.slice(0, 6).join(), 'phone presets'), (await buttons()).map((b) => b.name).join());

  console.log('building it');
  for (const i of [1, 2, 1, 0]) await control.locator('.tile .add').nth(i).click();
  check('four steps are stored in the live show, pointing at presets by id', await mac(() => {
    const data = JSON.parse(localStorage.getItem('thirdeye.shows.v1'));
    const { steps } = data.shows.find((x) => x.id === data.live);
    const ids = window.thirdEye.ui.presets.list.map((p) => p.id);
    return steps.length === 4 && steps.map((s) => ids.indexOf(s.preset)).join() === '1,2,1,0';
  }));
  check('the show can now be shown', !(await control.locator('#strip-order').isDisabled()) && (await control.locator('#strip-all').getAttribute('aria-pressed')) === 'true');
  check('adding leaves you on All presets', (await control.locator('.tile .add').count()) === P.length);
  check('the phone now shows the steps, the first one dashed', await settle(async () => {
    const b = await buttons();
    return b.map((x) => x.name).join() === [P[1], P[2], P[1], P[0], '', ''].join() && b[0].next && !b.some((x) => x.on) && b[4].off && b[5].off;
  }, 'phone steps'), JSON.stringify(await buttons()));
  await control.click('#strip-order');
  check('the show\'s steps, in order', (await stepNames()).join() === [P[1], P[2], P[1], P[0]].join(), (await stepNames()).join());
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
  check('the library export carries the show by place in the file', file.shows?.length === 1 && file.shows[0].name === 'My show' && file.shows[0].steps.length === 1 && file.presets[file.shows[0].steps[0].preset].name === P[2] && file.order?.length === 1 && !('id' in file.presets[0]), JSON.stringify(file.shows));
  // A file from before shows: its running order becomes a show of its own.
  const incoming = { format: file.format, version: 1, presets: [{ ...file.presets[0], name: 'One' }, { ...file.presets[1], name: 'Two' }], order: [{ preset: 0, note: 'Open', fade: 1 }, { preset: 1, note: '', fade: null }, { preset: 0, note: '', fade: null }, { preset: 7, note: 'no such preset' }] };
  const before = await mac(() => window.thirdEye.ui.presets.list.length);
  await control.setInputFiles('#library-panel input[type=file]', { name: 'show.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
  check('an import adds its presets and its order as a show, not live', await settle(async () => (await mac(() => window.thirdEye.ui.presets.shows.map((x) => x.name).join())) === 'My show,Imported show' && (await mac(() => window.thirdEye.ui.presets.live.name)) === 'My show' && (await mac(() => window.thirdEye.ui.presets.list.length)) === before + 2, 'imported'), await mac(() => window.thirdEye.ui.presets.shows.map((x) => x.name).join()));
  await control.click('#views button[data-view=perform]');
  await control.locator('#show-menu').click();
  await control.locator('.menu-list .menu-item', { hasText: 'Imported show' }).click();
  check('chosen from the Show menu it goes live, from its start', await settle(async () => (await stepNames()).join() === 'One,Two,One' && (await order()).cue === -1, 'imported live'), (await stepNames()).join());
  check('its note came too', (await control.locator('.tile.step').nth(0).locator('.note').textContent()) === 'Open');
  check('a file without presets ids still gets them here', await mac(() => window.thirdEye.ui.presets.list.every((p) => typeof p.id === 'string' && p.id.length >= 3)));

  console.log('a show longer than the phone has buttons');
  await mac(() => {
    const { presets } = window.thirdEye.ui;
    for (let i = 0; i < 7; i++) presets.addStep(i % presets.list.length);
  });
  const numbers = async () => (await buttons()).map((b) => b.n).join();
  check('ten steps: before the start the phone shows 1 to 6', await settle(async () => (await numbers()) === '1,2,3,4,5,6', 'first six'), await numbers());
  for (let i = 0; i < 4; i++) await control.keyboard.press(']');
  check('on step 4 it shows 3 to 8, the live step second and the next one third', await settle(async () => {
    const b = await buttons();
    return (await numbers()) === '3,4,5,6,7,8' && b[1].on && b[2].next && !b[0].on;
  }, 'window moved'), JSON.stringify((await buttons()).map((b) => [b.n, b.on, b.next])));
  await tap(4);
  check('a button means the step written on it (7)', await settle(() => at(6, false), 'step 7'), JSON.stringify(await order()));
  check('and the buttons move on: 6 to 10, one left empty', await settle(async () => {
    const b = await buttons();
    return (await numbers()) === '6,7,8,9,10,' && b[1].on && b[5].off;
  }, 'near the end'), await numbers());
  for (let i = 0; i < 3; i++) await control.keyboard.press(']');
  check('on the last step it shows 9 and 10', await settle(async () => (await numbers()) === '9,10,,,,' && (await buttons())[1].on, 'the end'), await numbers());
  await mac(() => {
    const { presets } = window.thirdEye.ui;
    presets.setSteps(presets.steps.slice(0, 3));
  });
  check('six steps or fewer all fit and stay put', await settle(async () => (await numbers()) === '1,2,3,,,', 'short again'), await numbers());

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
  check('the show cannot be shown, and All presets is on', await settle(async () => (await control.locator('#strip-order').isDisabled()) && (await control.locator('#strip-all').getAttribute('aria-pressed')) === 'true', 'plain strip'));
  const all = await control.locator('.tile:not(.new) .name').allTextContents();
  check('the phone shows presets again', await settle(async () => (await buttons()).map((b) => b.name).join() === all.slice(0, 6).join(), 'phone presets again'), (await buttons()).map((b) => b.name).join());
  await control.locator('.tile .load').nth(all.length - 1).click();
  await control.keyboard.press(']');
  check('Next walks the presets and wraps, as before', await settle(async () => (await order()).preset === 0, 'wrapped'), JSON.stringify(await order()));

  console.log('several shows');
  const showNames = () => mac(() => window.thirdEye.ui.presets.shows.map((x) => x.name).join());
  const liveName = () => mac(() => window.thirdEye.ui.presets.live.name);
  const pickShowItem = async (text) => {
    await control.locator('#show-menu').click();
    await control.locator('.menu-list .menu-item', { hasText: text }).first().click();
  };
  const bpm = () => mac(() => window.thirdEye.store.state.tempo.bpm);
  await mac(() => window.thirdEye.store.merge('tempo', { bpm: 96 }));
  control.once('dialog', (d) => d.accept('Dream machine'));
  await pickShowItem('+ New show');
  check('+ New show makes one, named, live and empty', await settle(async () => (await liveName()) === 'Dream machine' && (await control.locator('#strip-order').textContent()) === 'Dream machine' && (await control.locator('#show-menu').textContent()).includes('Dream machine'), 'new show'), await showNames());
  check('it starts with the tempo as it was', await mac(() => window.thirdEye.ui.presets.live.bpm === 96));
  for (const i of [3, 4]) await control.locator('.tile .add').nth(i).click();
  await control.click('#strip-order');
  check('its steps are its own', (await stepNames()).join() === [all[3], all[4]].join(), (await stepNames()).join());
  await mac(() => window.thirdEye.store.merge('tempo', { bpm: 140 }));
  check('a tempo set while it is live is its tempo', await settle(() => mac(() => window.thirdEye.ui.presets.live.bpm === 140), 'show bpm'));
  // Tapped, the tempo is worked out in the window that makes the picture,
  // which says so (`by`); only /control writes the shows.
  await output.evaluate(() => window.thirdEye.store.dispatch({ op: 'merge', key: 'tempo', patch: { bpm: 133 }, by: 'engine' }));
  check('one tapped in the output window is stored in the live show by this page', await settle(() => mac(() => {
    const data = JSON.parse(localStorage.getItem('thirdeye.shows.v1'));
    return data.shows.find((x) => x.id === data.live).bpm === 133 && data.shows.find((x) => x.id === data.live).name === 'Dream machine' && window.thirdEye.ui.presets.live.bpm === 133 && window.thirdEye.store.state.tempo.bpm === 133;
  }), 'output tempo'), await mac(() => JSON.stringify(JSON.parse(localStorage.getItem('thirdeye.shows.v1')).shows.map((x) => [x.name, x.bpm]))));
  check('and no other show takes it, and none is lost', await mac(() => window.thirdEye.ui.presets.shows.filter((x) => x.bpm === 133).length === 1 && window.thirdEye.ui.presets.shows.length === 3), await showNames());
  // Set by hand in another /control, it is that window's to store.
  await output.evaluate(() => window.thirdEye.store.merge('tempo', { bpm: 99 }));
  check('one set by hand in another window is not written into a show from here', (await settle(async () => (await bpm()) === 99, 'arrived')) && (await mac(() => window.thirdEye.ui.presets.live.bpm === 133)));
  await mac(() => window.thirdEye.store.merge('tempo', { bpm: 140 }));
  await pickShowItem('Imported show');
  await mac(() => window.thirdEye.store.merge('tempo', { bpm: 100 }));
  await pickShowItem('Dream machine');
  check('making it live again brings back its tempo, and starts it from the top', await settle(async () => (await bpm()) === 140 && (await order()).cue === -1 && (await stepNames()).join() === [all[3], all[4]].join(), 'tempo back'), String(await bpm()));
  await control.keyboard.press(']');
  check('Next walks this show', await settle(async () => (await order()).cue === 0 && (await order()).preset === 3, 'walks'), JSON.stringify(await order()));
  check('the phone shows its steps', await settle(async () => (await buttons()).slice(0, 2).map((b) => b.name).join() === [all[3], all[4]].join(), 'phone show'), JSON.stringify(await buttons()));
  await pickShowItem('Duplicate');
  check('Duplicate makes a copy, live, with the same steps', await settle(async () => (await liveName()) === 'Dream machine copy' && (await stepNames()).join() === [all[3], all[4]].join(), 'copy'), await showNames());
  control.once('dialog', (d) => d.accept('Dream machine'));
  await pickShowItem('Rename');
  check('a name another show has gets a number', await settle(async () => (await liveName()) === 'Dream machine 2', 'numbered'), await showNames());
  control.once('dialog', (d) => d.accept('Tunnel piece'));
  await pickShowItem('Rename');
  check('Rename', await settle(async () => (await liveName()) === 'Tunnel piece', 'renamed'), await showNames());
  control.once('dialog', (d) => d.accept());
  await pickShowItem('Delete');
  check('Delete asks, takes the show away and makes the next one live', await settle(async () => !(await showNames()).includes('Tunnel piece') && (await showNames()).split(',').includes(await liveName()), 'deleted'), `${await showNames()} live ${await liveName()}`);
  check('the presets are all still there', (await mac(() => window.thirdEye.ui.presets.list.length)) === all.length);
  await mac((name) => {
    const { presets } = window.thirdEye.ui;
    presets.makeLive(presets.shows.find((x) => x.name === name).id);
  }, 'Dream machine');
  await mac(() => {
    const { presets } = window.thirdEye.ui;
    presets.remove(presets.list.findIndex((p) => p.id === presets.live.steps[1].preset));
  });
  check('a preset deleted leaves every show it was in', await mac(() => {
    const { presets } = window.thirdEye.ui;
    const ids = new Set(presets.list.map((p) => p.id));
    return presets.shows.every((x) => x.steps.every((s) => ids.has(s.preset))) && presets.live.steps.length === 1;
  }));

  console.log('show files');
  const [showDownload] = await Promise.all([control.waitForEvent('download'), control.click('#save-show')]);
  check('Save show to a file names it after the show', showDownload.suggestedFilename() === 'Dream machine.thirdeye-show.json', showDownload.suggestedFilename());
  const showFile = JSON.parse(await readFile(await showDownload.path(), 'utf8'));
  check('it holds the show, its tempo and only the presets it uses, with their ids', showFile.format === 'third-eye-cam-show' && showFile.name === 'Dream machine' && showFile.bpm === 140 && showFile.presets.length === 1 && typeof showFile.presets[0].id === 'string' && showFile.steps[0].preset === 0, JSON.stringify({ ...showFile, presets: showFile.presets.map((p) => p.name) }));
  const changedFile = { ...showFile, name: 'From elsewhere', presets: [{ ...showFile.presets[0], name: 'Changed there' }, { id: 'zzznew1', name: 'Brand new', fade: null, scene: showFile.presets[0].scene }], steps: [...showFile.steps, { preset: 1, note: 'new one', fade: null }] };
  const count0 = await mac(() => window.thirdEye.ui.presets.list.length);
  control.once('dialog', (d) => d.dismiss());
  await control.setInputFiles('#show-file', { name: 'x.thirdeye-show.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changedFile)) });
  check('opening one adds the show, live, with the presets new here', await settle(async () => (await liveName()) === 'From elsewhere' && (await mac(() => window.thirdEye.ui.presets.list.length)) === count0 + 1 && (await stepNames()).length === 2, 'opened'), `${await liveName()} ${await stepNames()}`);
  check('a preset that differs is kept as ours when we say so', await mac(() => !window.thirdEye.ui.presets.list.some((p) => p.name === 'Changed there')));
  await control.setInputFiles('#library-panel input[type=file]', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changedFile)) });
  check('a show file given to Import presets says where it goes instead', await settle(async () => (await control.locator('#library-note').textContent()).includes('Show menu'), 'wrong door'), await control.locator('#library-note').textContent());

  console.log('the backup folder');
  // A stand-in for the folder Chrome would let the operator choose.
  await mac(() => {
    window.__files = {};
    const dir = {
      name: 'Show backups',
      queryPermission: async () => window.__perm ?? 'granted',
      requestPermission: async () => {
        window.__perm = 'granted';
        return 'granted';
      },
      getFileHandle: async (name) => ({
        createWritable: async () => {
          let text = '';
          return { write: async (t) => (text += t), close: async () => (window.__files[name] = text) };
        },
      }),
    };
    window.showDirectoryPicker = async () => dir;
    window.thirdEye.ui.backup.quietMs = 1500;
  });
  await control.click('#views button[data-view=setup]');
  check('before a folder is chosen it says shows are not backed up', (await control.locator('#backup-state').textContent()).includes('not backed up'));
  await control.click('#backup-choose');
  check('choosing a folder writes the live show there at once', await settle(() => mac(() => !!window.__files['From elsewhere.thirdeye-show.json']), 'first write'), await mac(() => Object.keys(window.__files).join()));
  check('and the panel says where and when', await settle(async () => (await control.locator('#backup-state').textContent()).includes('Backing up to Show backups. Last saved'), 'panel'), await control.locator('#backup-state').textContent());
  await mac(() => {
    const { presets } = window.thirdEye.ui;
    presets.updateStep(0, { note: 'changed for the backup' });
  });
  check('a change is written after a quiet spell, over the same file', await settle(() => mac(() => (window.__files['From elsewhere.thirdeye-show.json'] ?? '').includes('changed for the backup')), 'rewritten'));
  await mac(() => {
    window.__perm = 'prompt';
    window.thirdEye.ui.backup.state = 'ask';
    window.thirdEye.ui.presets.updateStep(0, { note: 'waiting for a click' });
  });
  check('when Chrome wants an OK again the panel asks for it', await settle(async () => (await control.locator('#backup-allow').isVisible()) && (await control.locator('#backup-state').textContent()).includes('needs your OK'), 'ask'), await control.locator('#backup-state').textContent());
  await control.click('#backup-allow');
  check('and one click lets the waiting change through', await settle(() => mac(() => (window.__files['From elsewhere.thirdeye-show.json'] ?? '').includes('waiting for a click')), 'allowed'));

  console.log('MIDI controls belong to the show');
  const names = (list) => list.map((b) => `${b.source}>${b.action}`).join();
  const midiNow = () => mac(() => window.thirdEye.store.state.actions.filter((b) => b.source.startsWith('midi.')).map((b) => `${b.source}>${b.action}`).join());
  const restNow = () => mac(() => window.thirdEye.store.state.actions.filter((b) => !b.source.startsWith('midi.')).map((b) => `${b.source}>${b.action}`).join());
  const stored = async (name) => {
    const data = JSON.parse(await mac(() => localStorage.getItem('thirdeye.shows.v1')));
    const show = data.shows.find((x) => x.name === name);
    return show && Array.isArray(show.midi) ? names(show.midi) : null;
  };
  // What MIDI map does when a pad is learned: one more binding among the actions.
  const map = (source, action) => mac(([s, a]) => {
    const { store } = window.thirdEye;
    store.dispatch({ op: 'set', key: 'actions', value: [...store.state.actions, { id: `t${Math.random().toString(36).slice(2, 8)}`, source: s, action: a, hold: false }] });
  }, [source, action]);
  const goLive = (name) => mac((n) => {
    const { presets } = window.thirdEye.ui;
    presets.makeLive(presets.shows.find((x) => x.name === n).id);
  }, name);
  const triggers = await restNow();
  check('to begin with nothing is mapped, and every show keeps a list of its own', (await midiNow()) === '' && (await mac(() => JSON.parse(localStorage.getItem('thirdeye.shows.v1')).shows.every((x) => Array.isArray(x.midi)))));
  await map('midi.note.1.40', 'blackout');
  check('a pad mapped while a show is live is stored in that show, and in no other', (await stored('From elsewhere')) === 'midi.note.1.40>blackout' && (await stored('Dream machine')) === '', `${await stored('From elsewhere')} | ${await stored('Dream machine')}`);
  await goLive('Dream machine');
  check('another show going live takes it away, and leaves the phone triggers alone', (await midiNow()) === '' && (await restNow()) === triggers && triggers.includes('trig.1'), `${await midiNow()} | ${await restNow()}`);
  await map('midi.cc.1.22', 'macro:0');
  await goLive('From elsewhere');
  check('each show brings its own back', (await midiNow()) === 'midi.note.1.40>blackout', await midiNow());
  await goLive('Dream machine');
  check('both ways', (await midiNow()) === 'midi.cc.1.22>macro:0' && (await stored('From elsewhere')) === 'midi.note.1.40>blackout', await midiNow());
  check('the window that makes the picture follows', await settle(() => output.evaluate(() => window.thirdEye.store.state.actions.filter((b) => b.source.startsWith('midi.')).map((b) => `${b.source}>${b.action}`).join() === 'midi.cc.1.22>macro:0'), 'output follows'));
  await mac(() => window.thirdEye.ui.presets.newShow('Third'));
  check('a new show starts with the MIDI of the show that was live', (await liveName()) === 'Third' && (await midiNow()) === 'midi.cc.1.22>macro:0' && (await stored('Third')) === 'midi.cc.1.22>macro:0', `${await midiNow()} | ${await stored('Third')}`);
  await map('midi.note.1.41', 'blink');
  check('and what is mapped in it from then on is its own', (await stored('Third')) === 'midi.cc.1.22>macro:0,midi.note.1.41>blink' && (await stored('Dream machine')) === 'midi.cc.1.22>macro:0', `${await stored('Third')} | ${await stored('Dream machine')}`);
  await mac(() => {
    const { presets } = window.thirdEye.ui;
    presets.duplicateShow(presets.live.id);
  });
  check('a duplicate carries its MIDI', (await liveName()) === 'Third copy' && (await stored('Third copy')) === (await stored('Third')) && (await midiNow()) === (await stored('Third')), await stored('Third copy'));
  await mac(() => {
    const { presets, store } = window.thirdEye.ui;
    store.dispatch({ op: 'set', key: 'actions', value: store.state.actions.filter((b) => b.source !== 'midi.cc.1.22') });
    presets.deleteShow(presets.live.id);
  });
  check('deleting the live show brings in the MIDI of the one that takes over', (await midiNow()) === (await stored(await liveName())) && (await liveName()) !== 'Third copy' && (await stored('Third')) === 'midi.cc.1.22>macro:0,midi.note.1.41>blink', `${await liveName()}: ${await midiNow()}`);
  await goLive('From elsewhere');
  const brought = await mac(() => {
    const { presets } = window.thirdEye.ui;
    return presets.importMidi(presets.shows.find((x) => x.name === 'Third').id);
  });
  check('importing replaces this show\'s MIDI with a copy of the other show\'s', brought === 2 && (await midiNow()) === 'midi.cc.1.22>macro:0,midi.note.1.41>blink' && (await stored('From elsewhere')) === (await stored('Third')), `${brought}: ${await midiNow()}`);
  await map('midi.note.1.42', 'freeze');
  check('a copy: a change here does not reach the show it came from', (await stored('Third')) === 'midi.cc.1.22>macro:0,midi.note.1.41>blink' && (await stored('From elsewhere')).endsWith('midi.note.1.42>freeze'));
  check('through all of it the phone triggers are as they were', (await restNow()) === triggers, await restNow());
  check('the backup file is rewritten with the show\'s MIDI', await settle(() => mac(() => (JSON.parse(window.__files['From elsewhere.thirdeye-show.json'] ?? '{}').midi ?? []).some((b) => b.source === 'midi.note.1.42' && b.action === 'freeze' && !('id' in b))), 'backup midi'));
  const withMidiFile = JSON.parse(await mac(() => window.__files['From elsewhere.thirdeye-show.json']));
  await control.setInputFiles('#show-file', { name: 'a.thirdeye-show.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...withMidiFile, name: 'Came with MIDI', midi: [{ source: 'midi.note.2.60', action: 'blink', hold: false }, { source: 'trig.1', action: 'blackout', hold: false }] })) });
  check('a show file brings its own MIDI, and nothing that is not MIDI', await settle(async () => (await liveName()) === 'Came with MIDI' && (await midiNow()) === 'midi.note.2.60>blink' && (await restNow()) === triggers, 'file midi'), `${await liveName()}: ${await midiNow()} | ${await restNow()}`);
  const bare = { ...withMidiFile, name: 'No MIDI in file' };
  delete bare.midi;
  await control.setInputFiles('#show-file', { name: 'b.thirdeye-show.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bare)) });
  check('a show file without any takes on the live show\'s', await settle(async () => (await liveName()) === 'No MIDI in file' && (await midiNow()) === 'midi.note.2.60>blink' && (await stored('No MIDI in file')) === 'midi.note.2.60>blink', 'file without'), `${await liveName()}: ${await midiNow()}`);
  // A change that reaches this window from another one is that window's to
  // store; and when this page starts, the live show's MIDI is what holds.
  await output.evaluate(() => {
    const { store } = window.thirdEye;
    store.dispatch({ op: 'set', key: 'actions', value: store.state.actions.filter((b) => !b.source.startsWith('midi.')) });
  });
  check('a change arriving from another window is not written into the show', (await settle(async () => (await midiNow()) === '', 'arrived')) && (await stored('No MIDI in file')) === 'midi.note.2.60>blink', await stored('No MIDI in file'));
  await control.reload();
  await waitFor(() => control.evaluate(() => !!window.thirdEye?.ui?.presets), { label: 'control back' });
  check('after a reload the live show and its MIDI are in force again', await settle(async () => (await liveName()) === 'No MIDI in file' && (await midiNow()) === 'midi.note.2.60>blink', 'show wins'), `${await liveName()}: ${await midiNow()}`);
  check('and in the window that makes the picture', await settle(() => output.evaluate(() => window.thirdEye.store.state.actions.some((b) => b.source === 'midi.note.2.60' && b.action === 'blink')), 'output again'));
  // Shows saved before they kept their MIDI.
  await mac(() => {
    const data = JSON.parse(localStorage.getItem('thirdeye.shows.v1'));
    for (const x of data.shows) {
      delete x.midi;
      x.bpm = null;
    }
    localStorage.setItem('thirdeye.shows.v1', JSON.stringify(data));
  });
  await control.reload();
  await waitFor(() => control.evaluate(() => !!window.thirdEye?.ui?.presets), { label: 'control back again' });
  check('shows from before each start with what is mapped today', await settle(() => mac(() => {
    const data = JSON.parse(localStorage.getItem('thirdeye.shows.v1'));
    return data.shows.length > 3 && data.shows.every((x) => Array.isArray(x.midi) && x.midi.length === 1 && x.midi[0].source === 'midi.note.2.60' && x.midi[0].action === 'blink');
  }), 'adopted'), await mac(() => localStorage.getItem('thirdeye.shows.v1').slice(0, 300)));
  check('and nothing changes for the live one', (await midiNow()) === 'midi.note.2.60>blink' && (await restNow()) === triggers);
  check('a show with no tempo of its own starts with the tempo in use, and every show has one', await mac(() => {
    const now = window.thirdEye.store.state.tempo.bpm;
    return JSON.parse(localStorage.getItem('thirdeye.shows.v1')).shows.every((x) => x.bpm === now);
  }));
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
