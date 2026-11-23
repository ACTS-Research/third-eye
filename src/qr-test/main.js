// A test page, not part of the instrument: pairing codes drawn in each of
// the interface's colours, to find out on a real iPhone which of them its
// camera reads. Open it on the Mac, point the phone at each code, and say
// whether it scanned; the page keeps the tally. A code's link comes back to
// this page on the phone, which then names the code it read.
//   /qr-test/

import qrcode from 'qrcode-generator';
import { PALETTES, dimmedInk } from '../shared/palette.js';
import { el } from '../shared/util.js';

// The camera of the mark (shared/mark.js), body from x 3 to 61, y 14 to 60.
const CAMERA = 'M12 14H42V10A2 2 0 0 1 44 8H52A2 2 0 0 1 54 10V14.2A9 9 0 0 1 61 23V51A9 9 0 0 1 52 60H12A9 9 0 0 1 3 51V23A9 9 0 0 1 12 14Z';
const CODE = { x: 14, y: 19, size: 36 };

const VARIANTS = {
  square: 'Black on the colour, square',
  round: 'Black on the colour, rounded',
  reverse: 'The colour on black',
};
const ORDER = [
  ['square', 100],
  ['round', 100],
  ['square', 25],
  ['reverse', 100],
  ['round', 25],
  ['reverse', 25],
];
const STEPS = ORDER.flatMap(([variant, dim]) => Object.keys(PALETTES).map((palette) => ({ palette, variant, dim, id: `${palette}-${variant}-${dim}` })));
const name = (s) => `${PALETTES[s.palette].label} · ${VARIANTS[s.variant].toLowerCase()} · dimmer ${s.dim}%`;

// The link a code carries: this page again, saying which code it was. About
// as long as a real pairing link, so the code is about as dense.
const linkFor = (s) => new URL(`?scanned=${s.id}`, location.href.split('?')[0]).href;

function codeSvg(s) {
  const qr = qrcode(0, 'M');
  qr.addData(linkFor(s));
  qr.make();
  const n = qr.getModuleCount();
  const ink = dimmedInk(s.palette, s.dim);
  const reverse = s.variant === 'reverse';
  const m = CODE.size / n;
  const inFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  let cells = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      const round = s.variant === 'round' && !inFinder(r, c);
      // (A hair of overlap, so square modules leave no seams between them.)
      const size = round ? m * 0.92 : m * 1.03;
      cells += `<rect x="${(CODE.x + c * m + (m - size) / 2).toFixed(3)}" y="${(CODE.y + r * m + (m - size) / 2).toFixed(3)}" width="${size.toFixed(3)}" height="${size.toFixed(3)}"${round ? ` rx="${(m * 0.3).toFixed(3)}"` : ''}/>`;
    }
  }
  const camera = reverse ? `<path d="${CAMERA}" fill="#000" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>` : `<path d="${CAMERA}" fill="${ink}"/>`;
  return `<svg viewBox="0 5 64 58" role="img" aria-label="Test code: ${name(s)}">${camera}<g fill="${reverse ? ink : '#000'}">${cells}</g></svg>`;
}

const app = document.getElementById('app');
const style = document.createElement('style');
style.textContent = `
html, body { margin: 0; background: #000; color: #e8e4dc; font: 500 15px/1.4 'JetBrains Mono', ui-monospace, Menlo, monospace; }
#app { min-height: 100vh; box-sizing: border-box; padding: 20px; display: flex; gap: 28px; flex-wrap: wrap; align-items: flex-start; justify-content: center; }
h1 { font: 800 30px/1 'Big Shoulders Display', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 6px; }
.stage { flex: 1 1 420px; max-width: 640px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.stage svg { width: min(100%, 62vh); display: block; }
.side { flex: 0 1 380px; display: flex; flex-direction: column; gap: 12px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; }
button { font: inherit; text-transform: uppercase; letter-spacing: 0.08em; font-size: 13px; padding: 12px 16px; background: none; color: inherit; border: 1px solid #e8e4dc; cursor: pointer; }
button.yes { background: #e8e4dc; color: #000; }
button.quiet { border-color: #555; color: #aaa; }
.dim { color: #9a968e; font-size: 13px; }
ol { margin: 0; padding: 0; list-style: none; font-size: 12px; max-height: 44vh; overflow: auto; border-top: 1px solid #333; }
li { display: flex; gap: 8px; padding: 4px 0; border-bottom: 1px solid #1c1c1c; cursor: pointer; }
li.now { color: #fff; font-weight: 700; }
li b { width: 34px; flex-shrink: 0; }
textarea { width: 100%; box-sizing: border-box; height: 90px; background: #0b0b0b; color: #e8e4dc; border: 1px solid #333; font: inherit; font-size: 12px; padding: 8px; }
.big { font: 800 64px/1 'Big Shoulders Display', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
`;
document.head.append(style);

const scanned = new URLSearchParams(location.search).get('scanned');
if (scanned) {
  // On the phone: the code was read. Say which.
  const s = STEPS.find((x) => x.id === scanned);
  app.append(
    el('div', { class: 'stage' }, [
      el('div', { class: 'big', text: 'Scanned' }),
      el('div', { text: s ? name(s) : scanned }),
      el('div', { class: 'dim', text: 'On the Mac, press IT SCANNED. Then come back to the Camera app for the next code.' }),
    ]),
  );
} else {
  const KEY = 'thirdeye.qrtest';
  let results = {};
  try {
    results = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    results = {};
  }
  let at = Math.max(0, STEPS.findIndex((s) => !(s.id in results)));
  const picture = el('div', { style: 'width:100%;display:flex;justify-content:center' });
  const title = el('div', { style: 'font-weight:700;text-align:center' });
  const list = el('ol');
  const summary = el('textarea', { readOnly: true, 'aria-label': 'Results, to copy' });
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(results));
    } catch {
      /* nothing to keep it in */
    }
  };
  const mark = { yes: 'YES', no: 'NO', skip: '–' };
  function show() {
    const s = STEPS[at];
    picture.innerHTML = codeSvg(s);
    title.textContent = `${at + 1} of ${STEPS.length} · ${name(s)}`;
    list.replaceChildren(
      ...STEPS.map((x, i) =>
        el('li', { class: i === at ? 'now' : '', onclick: () => { at = i; show(); } }, [el('b', { text: mark[results[x.id]] ?? '' }), el('span', { text: name(x) })]),
      ),
    );
    list.querySelector('.now')?.scrollIntoView({ block: 'nearest' });
    summary.value = STEPS.filter((x) => results[x.id] && results[x.id] !== 'skip').map((x) => `${mark[results[x.id]]}  ${name(x)}`).join('\n');
  }
  const answer = (value) => {
    results[STEPS[at].id] = value;
    save();
    if (at < STEPS.length - 1) at++;
    show();
  };
  app.append(
    el('div', { class: 'stage' }, [picture, title, el('div', { class: 'dim', style: 'text-align:center', text: 'Point the iPhone\'s Camera app at the code, from where you would stand. If it offers a link, open it: the phone names the code it read.' })]),
    el('div', { class: 'side' }, [
      el('h1', { text: 'Code test' }),
      el('div', { class: 'dim', text: 'Each code is drawn as the starting screen would draw it. "Dimmer 25%" is the interface turned right down. Say what happened and the next one comes up.' }),
      el('div', { class: 'row' }, [
        el('button', { class: 'yes', text: 'It scanned', onclick: () => answer('yes') }),
        el('button', { text: 'It did not', onclick: () => answer('no') }),
        el('button', { class: 'quiet', text: 'Skip', onclick: () => answer('skip') }),
      ]),
      list,
      summary,
      el('div', { class: 'row' }, [
        el('button', { class: 'quiet', text: 'Copy results', onclick: () => navigator.clipboard?.writeText(summary.value) }),
        el('button', { class: 'quiet', text: 'Start again', onclick: () => { results = {}; save(); at = 0; show(); } }),
      ]),
    ]),
  );
  show();
}
