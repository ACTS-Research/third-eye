// The app's own slider and menu.
//
// bar(): a slider drawn as a small rectangular fader on its side, like the
// faders on the perform screen. It is a real <input type="range">, so the
// keyboard, focus and screen readers work as for any slider; only the look
// is ours (control.css, input.bar).
//
// menu(): a button that opens a list drawn by the page. A <select> always
// opens the operating system's pop-up, which looks like nothing else here.

import { el } from '../shared/util.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// How many decimals a value needs for its step.
export function digitsFor(step) {
  return step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
}

// Returns { node, input, set(value) }. `node` holds the bar and, unless
// `value: false`, a box showing the number, which can be typed into.
// onInput(value) fires while dragging or typing; onTouch() when the control
// is first grabbed (MIDI map mode uses it to pick the parameter).
export function bar({ min, max, step = 0.01, value = min, label = '', id, reset, unit = '', showValue = true, onInput, onTouch }) {
  const digits = digitsFor(step);
  const input = el('input', { type: 'range', class: 'bar', min: String(min), max: String(max), step: String(step), 'aria-label': label || null });
  if (id) input.id = id;
  const number = showValue
    ? el('input', { type: 'text', class: 'bar-value', inputMode: 'decimal', 'aria-label': label ? `${label}, value` : 'Value', autocomplete: 'off', spellcheck: false })
    : null;
  let current = value;

  // The fill runs from the left, or from zero for a value that goes both ways.
  function paint() {
    const t = ((current - min) / (max - min)) * 100;
    if (min < 0 && max > 0) {
      const zero = ((0 - min) / (max - min)) * 100;
      const a = Math.min(zero, t);
      const b = Math.max(zero, t);
      input.style.backgroundImage = `linear-gradient(90deg, transparent ${a}%, var(--ink) ${a}%, var(--ink) ${b}%, transparent ${b}%)`;
    } else {
      input.style.backgroundImage = `linear-gradient(90deg, var(--ink) ${t}%, transparent ${t}%)`;
    }
  }
  function show() {
    input.value = String(current);
    if (number && document.activeElement !== number) number.value = `${Number(current).toFixed(digits)}${unit}`;
    paint();
  }
  function commit(v) {
    current = clamp(v, min, max);
    show();
    onInput?.(current);
  }

  input.addEventListener('pointerdown', () => onTouch?.());
  input.addEventListener('focus', () => onTouch?.());
  input.addEventListener('input', () => commit(Number(input.value)));
  // Double-click goes back to the default, as on the perform faders.
  if (reset !== undefined) input.addEventListener('dblclick', () => commit(reset));
  if (number) {
    number.addEventListener('focus', () => {
      number.value = Number(current).toFixed(digits);
      number.select();
    });
    const typed = () => {
      const v = Number(number.value.replace(',', '.'));
      if (Number.isFinite(v)) commit(v);
    };
    number.addEventListener('change', typed);
    number.addEventListener('blur', show);
    number.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') number.blur();
    });
  }
  show();
  return {
    node: el('span', { class: 'bar-field' }, [input, number]),
    input,
    number,
    set(v) {
      // Not while it is being dragged or typed into from here.
      if (input.matches(':active') || document.activeElement === number) return;
      current = clamp(Number(v), min, max);
      show();
    },
    get value() {
      return current;
    },
  };
}

// ------------------------------------------------------------------ menu ---

let openMenu = null; // only one list is ever open

function closeOpenMenu() {
  openMenu?.close();
}
document.addEventListener('pointerdown', (e) => {
  if (openMenu && !openMenu.contains(e.target)) closeOpenMenu();
});
window.addEventListener('resize', closeOpenMenu);
window.addEventListener('blur', closeOpenMenu);
// The list hangs from its button: when the page scrolls it follows, and it
// closes once the button has scrolled out of sight. (Clicking a button that
// is half off the screen scrolls it into view first; closing on any scroll
// would shut the list the moment it opened.)
document.addEventListener('scroll', (e) => {
  if (openMenu && !openMenu.list.contains(e.target)) openMenu.place();
}, true);

// options: [{ value, label, group?, item? }] (`item` is the shorter text for
// the list when the group heading already says the rest), or a function
// returning that (asked
// each time the list opens). With `action: true` the button keeps its own
// text and each choice just calls onChange (an "Add…" menu).
// Returns { node, set(value), get value }.
export function menu({ options, value, onChange, label = '', id, text = '', action = false, cls = '' }) {
  const caption = el('span', { class: 'menu-text' });
  const button = el('button', { type: 'button', class: `menu${cls ? ` ${cls}` : ''}`, 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': label || null }, [caption, el('span', { class: 'menu-mark', 'aria-hidden': 'true', text: action ? '' : '▾' })]);
  if (id) button.id = id;
  let current = value;
  let list = null;

  const all = () => (typeof options === 'function' ? options() : options);
  const labelOf = (v) => all().find((o) => o.value === v)?.label ?? (v === undefined || v === null || v === '' ? '—' : String(v));
  function show() {
    caption.textContent = action ? text : labelOf(current);
    if (!action) button.dataset.value = String(current ?? '');
  }

  function close(focus = false) {
    if (!list) return;
    list.remove();
    list = null;
    openMenu = null;
    button.setAttribute('aria-expanded', 'false');
    if (focus) button.focus();
  }

  function pick(v) {
    close(true);
    if (!action) {
      current = v;
      show();
    }
    onChange?.(v);
  }

  function open() {
    closeOpenMenu();
    const items = all();
    list = el('div', { class: 'menu-list', role: 'listbox', 'aria-label': label || null });
    let group = '';
    for (const o of items) {
      if (o.group && o.group !== group) {
        group = o.group;
        list.append(el('div', { class: 'menu-group', text: group }));
      }
      const chosen = !action && o.value === current;
      const item = el('div', { class: `menu-item${chosen ? ' on' : ''}`, role: 'option', tabindex: '-1', 'aria-selected': String(chosen), 'data-value': String(o.value), text: o.item ?? o.label });
      item.addEventListener('click', () => pick(o.value));
      list.append(item);
    }
    if (!items.length) list.append(el('div', { class: 'menu-group', text: 'Nothing to choose' }));
    document.body.append(list);
    // Under the button if there is room, else above it; never off the page.
    const place = () => {
      const r = button.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return close();
      const below = window.innerHeight - r.bottom - 8;
      const above = r.top - 8;
      list.style.maxHeight = '';
      const wanted = Math.min(list.scrollHeight + 2, 360);
      const up = below < Math.min(wanted, 160) && above > below;
      list.style.maxHeight = `${Math.max(80, Math.min(wanted, up ? above : below))}px`;
      list.style.minWidth = `${r.width}px`;
      list.style.left = `${clamp(r.left, 8, Math.max(8, window.innerWidth - list.offsetWidth - 8))}px`;
      list.style.top = up ? '' : `${r.bottom}px`;
      list.style.bottom = up ? `${window.innerHeight - r.top}px` : '';
    };
    place();
    button.setAttribute('aria-expanded', 'true');
    openMenu = { close, place, list, contains: (node) => list.contains(node) || button.contains(node) };
    const choices = [...list.querySelectorAll('.menu-item')];
    (choices.find((n) => n.classList.contains('on')) ?? choices[0])?.focus();
    // The page's own shortcuts (arrows step presets, Space freezes) must not
    // fire while a list has the keyboard.
    list.addEventListener('keydown', (e) => {
      const at = choices.indexOf(document.activeElement);
      const go = (i) => choices[clamp(i, 0, choices.length - 1)]?.focus();
      if (e.key === 'ArrowDown') go(at + 1);
      else if (e.key === 'ArrowUp') go(at - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(choices.length - 1);
      else if (e.key === 'Enter' || e.key === ' ') document.activeElement?.click();
      else if (e.key === 'Escape' || e.key === 'Tab') close(true);
      else if (e.key.length === 1) {
        // A letter jumps to the next choice that starts with it.
        const letter = e.key.toLowerCase();
        const next = [...choices.slice(at + 1), ...choices.slice(0, at + 1)].find((n) => n.textContent.trim().toLowerCase().startsWith(letter));
        next?.focus();
      } else return;
      e.preventDefault();
      e.stopPropagation();
    });
  }

  button.addEventListener('click', () => (list ? close() : open()));
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (!list) open();
    }
  });
  show();
  return {
    node: button,
    set(v) {
      current = v;
      show();
    },
    refresh: show,
    get value() {
      return current;
    },
  };
}

// An on/off switch as a button.
export function toggle({ on = false, text = '', onText = text, label = '', onChange, cls = '' }) {
  let state = !!on;
  const button = el('button', { type: 'button', class: `switch${cls ? ` ${cls}` : ''}`, 'aria-label': label || null });
  const show = () => {
    button.setAttribute('aria-pressed', String(state));
    button.textContent = state ? onText : text;
  };
  button.addEventListener('click', () => {
    state = !state;
    show();
    onChange?.(state);
  });
  show();
  return {
    node: button,
    set(v) {
      state = !!v;
      show();
    },
  };
}
