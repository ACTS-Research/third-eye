// The edit screen's own controls: the bar slider (click, type a value,
// double-click to reset), the app's menus (mouse and keyboard, without the
// page's shortcuts firing), the chain row (open, add, reorder, remove), the
// Modulation tab's boxes with their extra settings, and the LFOs.
//   node tests/edit-screen.mjs

import { addEffect, check, clickBar, failureCount, launch, paramBar, startSite, waitFor, watch } from './lib.mjs';

const site = await startSite();
const browser = await launch();
const errors = [];
const settle = (fn, label, timeout = 6000) => waitFor(fn, { label, timeout }).then(() => true, () => false);

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const control = await context.newPage();
  watch(control, 'control', errors);
  await control.goto(`${site.url}/control/`);
  await waitFor(() => control.evaluate(() => window.thirdEye.ui.status?.renderFps > 0), { label: 'engine', timeout: 20000 });
  const state = (fn, arg) => control.evaluate(fn, arg);
  const chainTypes = () => state(() => window.thirdEye.store.state.chain.map((c) => c.type).join());
  const param = (key) => state((k) => window.thirdEye.store.state.chain.find((c) => c.uid === document.querySelector('.chain-row .fx[aria-pressed=true]').dataset.uid).params[k], key);
  const mapping = (i = 0) => state((n) => window.thirdEye.store.state.mappings[n], i);

  // Preset 2, Tunnel: Video Feedback then RGB Offset, three mappings.
  await control.locator('.tile .edit').nth(1).click();
  await waitFor(() => control.locator('#tab-params .fx-head').isVisible(), { label: 'edit screen' });

  console.log('the screen');
  check('picture at the left with the chain as a row under it', await state(() => {
    const m = document.querySelector('.edit-monitor').getBoundingClientRect();
    const r = document.querySelector('.chain-row').getBoundingClientRect();
    const t = document.querySelector('.tabs').getBoundingClientRect();
    return r.top >= m.bottom - 1 && t.left > m.right && m.width > 500;
  }));
  check('the chain row reads input, then each effect in order', (await control.locator('.chain-row .chain-end').textContent()).startsWith('In: ') && (await control.locator('.chain-row .fx .name').allTextContents()).join(',') === 'Video Feedback,RGB Offset');
  check('the first effect is open, with what is pinned and moved on its button', (await control.locator('#tab-params .fx-head .name').textContent()) === 'Video Feedback' && (await control.locator('.chain-row .fx').first().locator('.meta').textContent()) === '3 moved');
  check('no system menus and nothing left of the old control library', (await control.locator('#view-edit select').count()) === 0 && (await control.locator('[class*="tp-"]').count()) === 0);

  console.log('the bar');
  await clickBar(control, paramBar('decay'), 0.25);
  const quarter = await param('decay');
  check('a click on a bar sets the value there', Math.abs(quarter - 0.578) < 0.02, String(quarter));
  await control.locator('#tab-params .param[data-key="decay"] .bar-value').fill('0.9');
  await control.keyboard.press('Enter');
  check('a value can be typed', await settle(async () => (await param('decay')) === 0.9, 'typed'), String(await param('decay')));
  check('and the bar and its number follow', Math.abs(Number(await control.locator(paramBar('decay')).inputValue()) - 0.536) < 0.005 && (await control.locator('#tab-params .param[data-key="decay"] .bar-value').inputValue()) === '0.900');
  await control.locator(paramBar('decay')).dblclick();
  check('double-click goes back to the default', await settle(async () => (await param('decay')) === 0.94, 'reset'), String(await param('decay')));
  const bars = await state(() => [...document.querySelectorAll('#tab-params input.bar')].map((b) => b.getBoundingClientRect().width));
  check('bars are short, all the same length', Math.max(...bars) <= 181 && Math.max(...bars) - Math.min(...bars) < 1, bars.join(', '));

  console.log('a menu, by mouse and by keyboard');
  const before = await state(() => ({ preset: window.thirdEye.store.state.presetIndex, freeze: window.thirdEye.store.state.globals.freeze }));
  await control.locator('#tab-params .param[data-key="blend"] .menu').click();
  check('it opens a list drawn by the page, the current choice marked', (await control.locator('.menu-list .menu-item').count()) > 1 && (await control.locator('.menu-list .menu-item.on').count()) === 1);
  await control.keyboard.press('ArrowDown');
  await control.keyboard.press(' ');
  check('arrows and Space choose from it', await settle(async () => (await param('blend')) === 1, 'chosen by keyboard'), String(await param('blend')));
  const after = await state(() => ({ preset: window.thirdEye.store.state.presetIndex, freeze: window.thirdEye.store.state.globals.freeze }));
  check('without stepping presets or freezing the picture', after.preset === before.preset && after.freeze === before.freeze, JSON.stringify(after));
  await control.locator('#tab-params .param[data-key="blend"] .menu').click();
  await control.keyboard.press('Escape');
  check('Esc closes it and changes nothing', (await control.locator('.menu-list').count()) === 0 && (await param('blend')) === 1);
  await control.locator('#tab-params .param[data-key="blend"] .menu').click();
  await control.mouse.click(300, 300);
  check('so does a click anywhere else', (await control.locator('.menu-list').count()) === 0);

  console.log('the chain');
  await addEffect(control, 'kaleido');
  check('an added effect goes on the end and opens', await settle(async () => (await chainTypes()) === 'feedback,rgbshift,kaleido' && (await control.locator('#tab-params .fx-head .name').textContent()) === 'Kaleidoscope / Mirror', 'added'), await chainTypes());
  await control.locator('.chain-row .fx').nth(2).dragTo(control.locator('.chain-row .fx').nth(0));
  check('dragging its button moves it', await settle(async () => (await chainTypes()) === 'kaleido,feedback,rgbshift', 'dragged'), await chainTypes());
  check('and it stays the open one', (await control.locator('.chain-row .fx[aria-pressed=true]').getAttribute('data-type')) === 'kaleido');
  await control.locator('#tab-params .fx-head button[title="Remove"]').click();
  check('Remove takes it out and opens its neighbour', await settle(async () => (await chainTypes()) === 'feedback,rgbshift' && (await control.locator('.chain-row .fx[aria-pressed=true]').count()) === 1, 'removed'), await chainTypes());
  await control.locator('#tab-params .fx-head >> text=Bypass').click();
  check('Bypass dims the effect on the chain row', await settle(() => control.locator('.chain-row .fx.bypassed').count().then((n) => n === 1), 'bypassed'));
  await control.locator('#tab-params .fx-head >> text=Bypass').click();

  console.log('modulation');
  await control.locator('.tabs button[data-tab=mods]').click();
  check('one box for each mapping', (await control.locator('.mod').count()) === 3 && (await control.locator('.tabs button[data-tab=mods]').textContent()) === 'Modulation · 3');
  const first = control.locator('.mod').first();
  check('each says what moves what and has its own close box at the top right', (await first.locator('.mod-title').textContent()) === 'Phone · Roll → 1 Video Feedback · rotate' && (await first.evaluate((box) => {
    const x = box.querySelector('button[title="Remove this modulation"]').getBoundingClientRect();
    const b = box.getBoundingClientRect();
    return b.right - x.right < 16 && x.top - b.top < 16;
  })));
  await clickBar(control, '.mod >> nth=0 >> .mod-grid input.bar >> nth=0', 0.75);
  check('Amount is a bar that fills from the middle', await settle(async () => Math.abs((await mapping()).amount - 0.5) < 0.03, 'amount'), String((await mapping()).amount));
  check('the extra settings are behind More', await first.locator('.mod-grid').nth(1).isHidden());
  await first.locator('.mod-more').click();
  await first.locator('.mod-grid').nth(1).locator('.switch').click();
  await first.locator('.mod-grid').nth(1).locator('.menu').click();
  await control.locator('.menu-list .menu-item[data-value="set"]').click();
  check('Invert and how it is applied are stored', await settle(async () => (await mapping()).invert === true && (await mapping()).mode === 'set', 'extras'), JSON.stringify(await mapping()));
  check('and More stays open through the change', await control.locator('.mod').first().locator('.mod-grid').nth(1).isVisible());
  await control.locator('.mod').first().locator('.mod-head .switch').click();
  check('the switch turns one off without removing it', await settle(async () => (await mapping()).enabled === false && (await control.locator('.mod.off').count()) === 1, 'switched off'));
  await control.locator('.mod').first().locator('.mod-route .menu').nth(1).click();
  await control.locator('.menu-list .menu-item', { hasText: '2 RGB Offset · amount' }).click();
  check('the Slider menu re-aims it', await settle(async () => (await mapping()).key === 'amount' && (await control.locator('.mod').first().locator('.mod-title').textContent()).endsWith('2 RGB Offset · amount'), 're-aimed'), JSON.stringify(await mapping()));

  console.log('LFOs');
  await control.locator('.tabs button[data-tab=lfos]').click();
  check('the LFOs have a tab of their own, the fourth', (await control.locator('.tabs button').allTextContents()).join('|') === 'Parameters|Faders · 0|Modulation · 3|LFOs' && (await control.locator('#lfo-panel .lfo').count()) === 4 && (await control.locator('#lfo-panel .lfo').first().isVisible()));
  const lfo = control.locator('#lfo-panel .lfo').first();
  check('shape is a row of six small pictures, the current one marked', (await lfo.locator('.choice.shape button').count()) === 6 && (await lfo.locator('.choice.shape button svg path').count()) === 6 && (await lfo.locator('.choice.shape button[aria-checked=true]').getAttribute('title')) === 'Sine');
  await lfo.locator('.choice.shape button[data-value="square"]').click();
  check('a click on a picture chooses that shape', await settle(() => state(() => window.thirdEye.store.state.lfos[0].shape === 'square'), 'shape') && (await lfo.locator('.choice.shape button[aria-checked=true]').getAttribute('title')) === 'Square');
  await lfo.locator('.bar-value').fill('2.5');
  await control.keyboard.press('Enter');
  check('rate is a bar with a number', await settle(() => state(() => window.thirdEye.store.state.lfos[0].rate === 2.5), 'rate'));
  const sync = control.locator('#lfo-panel .lfo').nth(3).locator('.choice.sync');
  check('tempo sync is the word Free and seven note values, each with a tooltip', (await sync.locator('button').count()) === 8 && (await sync.locator('button').first().textContent()) === 'Free' && (await sync.locator('button svg').count()) === 7 && (await sync.locator('button').evaluateAll((list) => list.every((b) => b.title.length > 5 && b.getAttribute('aria-label') === b.title))), (await sync.locator('button').evaluateAll((list) => list.map((b) => b.title))).join(' | '));
  check('the quarter note says what it is', (await sync.locator('button[data-value="1"]').getAttribute('title')) === 'One cycle every 1 beat (a quarter note)');
  await sync.locator('button[data-value="4"]').click();
  check('a click on one locks the LFO to that length', await settle(() => state(() => window.thirdEye.store.state.lfos[3].sync === 4), 'sync') && (await sync.locator('button[aria-checked=true]').getAttribute('title')) === 'One cycle every 1 bar');
  check('a synced LFO\'s rate is dimmed: it is not used', await control.locator('#lfo-panel .lfo').nth(3).locator('.bar-field').evaluate((n) => n.classList.contains('idle')) && !(await lfo.locator('.bar-field').evaluate((n) => n.classList.contains('idle'))));
  await sync.locator('button[data-value="0"]').click();
  check('Free unlocks it again', await settle(() => state(() => window.thirdEye.store.state.lfos[3].sync === 0), 'free') && !(await control.locator('#lfo-panel .lfo').nth(3).locator('.bar-field').evaluate((n) => n.classList.contains('idle'))));
  check('each LFO has a meter that moves', await settle(() => lfo.locator('.mod-meter i').evaluate((i) => parseFloat(i.style.width) > 0), 'lfo meter'));

  console.log('it is saved');
  check('all of it went into the preset', await settle(() => state(() => {
    const p = JSON.parse(localStorage.getItem('thirdeye.presets.v1'))[1];
    return p.scene.mappings[0].mode === 'set' && p.scene.mappings[0].enabled === false && p.scene.lfos[0].shape === 'square' && p.scene.chain[0].params.blend === 1;
  }), 'saved', 8000));

  console.log('the setup screen');
  await state(() => window.thirdEye.ui.setView('setup'));
  check('no system menus or plain sliders anywhere on the page', await state(() => document.querySelectorAll('select').length === 0 && document.querySelectorAll('input[type=range]:not(.bar)').length === 0));
  // A menu whose button is off the screen: clicking it scrolls it into view
  // first, and the list must survive that.
  await control.setViewportSize({ width: 1440, height: 420 });
  await control.locator('#rec-format').click();
  await control.locator('.menu-list .menu-item[data-value="mp4"]').click();
  check('a menu whose button had to scroll into view still works', await settle(() => state(() => window.thirdEye.store.state.globals.recFormat === 'mp4'), 'format') && (await control.locator('#rec-format .menu-text').textContent()).startsWith('MP4'));
  await state(() => window.thirdEye.store.merge('globals', { recFormat: 'webm' }));
  check('and follows a change made elsewhere', await settle(async () => (await control.locator('#rec-format .menu-text').textContent()).startsWith('WebM'), 'follows'));
  await control.setViewportSize({ width: 1440, height: 900 });
  await control.locator('#library-panel .bar-value').fill('3.5');
  await control.keyboard.press('Enter');
  check('Default fade is a bar with a number', await settle(() => state(() => window.thirdEye.store.state.globals.fadeTime === 3.5), 'fade') && (await control.locator('#library-panel .bar-value').inputValue()) === '3.5 s');
  await control.locator('#actions-panel .binding .menu').first().click();
  check('a trigger\'s source is chosen from the grouped list', (await control.locator('.menu-list .menu-group').count()) > 3 && (await control.locator('.menu-list .menu-item.on').count()) === 1);
  await control.keyboard.press('Escape');
  await state(() => window.thirdEye.ui.setView('edit'));

  console.log('a narrow window');
  await control.setViewportSize({ width: 900, height: 900 });
  check('below 1000 px the tabs go under the picture', await state(() => document.querySelector('.tabs').getBoundingClientRect().top > document.querySelector('.fader-preview').getBoundingClientRect().bottom - 1));

  const real = errors.filter((e) => !/peerjs|WebSocket|ERR_|Could not get an ID|Aborting|retrieving ID|socket/i.test(e));
  check('no errors', real.length === 0, real.slice(0, 3).join(' | '));
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
