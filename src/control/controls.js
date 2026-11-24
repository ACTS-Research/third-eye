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
// `scale` curves it: { toUnit(value) → 0..1, fromUnit(0..1) → value, center? }.
// The bar then travels in positions while the number beside it, what is
// typed there and what onInput receives stay in the parameter's own units.
export function bar({ min, max, step = 0.01, value = min, label = '', id, reset, unit = '', showValue = true, scale = null, look = '', onInput, onTouch }) {
  const digits = digitsFor(step);
  const input = scale
    ? el('input', { type: 'range', class: 'bar', min: '0', max: '1', step: '0.001', 'aria-label': label || null })
    : el('input', { type: 'range', class: 'bar', min: String(min), max: String(max), step: String(step), 'aria-label': label || null });
  const unitOf = (v) => (scale ? scale.toUnit(v) : (v - min) / (max - min));
  const origin = scale?.center ?? (min < 0 && max > 0 ? 0 : null);
  const snap = (v) => Number((Math.round((v - min) / step) * step + min).toFixed(6));
  if (id) input.id = id;
  const number = showValue
    ? el('input', { type: 'text', class: 'bar-value', inputMode: 'decimal', 'aria-label': label ? `${label}, value` : 'Value', autocomplete: 'off', spellcheck: false })
    : null;
  let current = value;
  let live = null; // where modulation has it now, 0..1, or null
  let was; // the value it had when the edit screen was opened, if it differs
  // While a range is being drawn on the bar: { from, to } along it (0..1),
  // and who to tell where the pointer is. The bar then sets no value.
  let range = null;
  let onRange = null;
  // One layer of the bar's background, from a% to b% of its width.
  const span = (image, a, b) => {
    const size = Math.max(0.5, b - a);
    return `${image} ${size >= 100 ? 0 : (a / (100 - size)) * 100}% 0 / ${size}% 100% no-repeat`;
  };

  // The fill runs from the left, or from zero for a value that goes both ways.
  function paint() {
    const t = unitOf(current) * 100;
    const marks = [];
    // A mark where the value was, readable on the fill and off it.
    if (was !== undefined) {
      const w = unitOf(was) * 100;
      marks.push(`linear-gradient(90deg, transparent calc(${w}% - 3px), var(--bg) calc(${w}% - 3px), var(--bg) calc(${w}% - 1px), var(--ink) calc(${w}% - 1px), var(--ink) calc(${w}% + 1px), var(--bg) calc(${w}% + 1px), var(--bg) calc(${w}% + 3px), transparent calc(${w}% + 3px))`);
    }
    if (range) {
      // The whole reach of the modulation, hatched, with a handle at its end.
      const a = Math.min(range.from, range.to) * 100;
      const b = Math.max(range.from, range.to) * 100;
      const h = range.to * 100;
      marks.push(`linear-gradient(90deg, transparent calc(${h}% - 4px), var(--bg) calc(${h}% - 4px), var(--bg) calc(${h}% - 2px), var(--ink) calc(${h}% - 2px), var(--ink) calc(${h}% + 2px), var(--bg) calc(${h}% + 2px), var(--bg) calc(${h}% + 4px), transparent calc(${h}% + 4px))`);
      if (b - a > 0.4) {
        // Ink stripes show on the empty part of the bar, dark ones (half a
        // step along) on the filled part, so the reach reads on both.
        marks.push(span('repeating-linear-gradient(135deg, var(--ink) 0 2px, transparent 2px 3px, var(--bg) 3px 5px, transparent 5px 6px)', a, b));
      }
    } else if (live !== null && Math.abs(live * 100 - t) > 0.4) {
      const up = live * 100 > t;
      const filled = origin === null ? !up : (t > unitOf(origin) * 100 ? !up : up);
      marks.push(span(`repeating-linear-gradient(135deg, var(${filled ? '--bg' : '--ink'}) 0 2px, transparent 2px 6px)`, Math.min(t, live * 100), Math.max(t, live * 100)));
    }
    const under = marks.length ? `${marks.join(', ')}, ` : '';
    if (look === 'hue') {
      // The colour circle laid flat, with a white mark where the value is.
      input.style.background = `${under}linear-gradient(90deg, transparent calc(${t}% - 2px), #000 calc(${t}% - 2px), #fff calc(${t}% - 1px), #fff calc(${t}% + 1px), #000 calc(${t}% + 2px), transparent calc(${t}% + 2px)), linear-gradient(90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)`;
      return;
    }
    if (origin !== null) {
      const zero = unitOf(origin) * 100;
      const a = Math.min(zero, t);
      const b = Math.max(zero, t);
      input.style.background = `${under}linear-gradient(90deg, transparent ${a}%, var(--ink) ${a}%, var(--ink) ${b}%, transparent ${b}%), var(--bg)`;
    } else {
      input.style.background = `${under}linear-gradient(90deg, var(--ink) ${t}%, transparent ${t}%), var(--bg)`;
    }
  }
  function show() {
    input.value = String(scale ? unitOf(current) : current);
    if (number && document.activeElement !== number) number.value = `${Number(current).toFixed(digits)}${unit}`;
    paint();
  }
  function commit(v) {
    current = clamp(v, min, max);
    show();
    onInput?.(current);
  }

  // Drawing a range: the pointer says how far, and the value stays put.
  const rangeAt = (e) => {
    const r = input.getBoundingClientRect();
    onRange?.(clamp((e.clientX - r.left) / r.width, 0, 1));
  };
  input.addEventListener('pointerdown', (e) => {
    if (!range) return;
    e.preventDefault();
    input.setPointerCapture?.(e.pointerId);
    input.focus();
    rangeAt(e);
  });
  input.addEventListener('pointermove', (e) => {
    if (range && e.buttons & 1) rangeAt(e);
  });
  input.addEventListener('mousedown', (e) => {
    if (range) e.preventDefault();
  });
  input.addEventListener('keydown', (e) => {
    if (!range || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    onRange?.(clamp(range.to + (e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.01 : 0.01), 0, 1));
  });
  input.addEventListener('pointerdown', () => onTouch?.());
  input.addEventListener('focus', () => onTouch?.());
  input.addEventListener('input', () => {
    if (range) return show();
    commit(scale ? snap(scale.fromUnit(Number(input.value))) : Number(input.value));
  });
  // Double-click goes back to the default, as on the perform faders.
  if (reset !== undefined) input.addEventListener('dblclick', () => {
    if (!range) commit(reset);
  });
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
  const field = el('span', { class: 'bar-field' }, [input, number]);
  // Where Glitch throws this slider: a pointer on the bar's top edge and
  // the landing value under the number. Made only for a slider that has one.
  let notch = null;
  let landing = null;
  let jumpTell = null;
  function makeJump() {
    notch = el('span', { class: 'jump-notch', title: 'Blink throws this slider here. Drag to move it; double-click to remove it.' });
    landing = el('span', { class: 'jump-to' });
    const at = (e) => {
      const r = input.getBoundingClientRect();
      const u = clamp((e.clientX - r.left) / r.width, 0, 1);
      jumpTell?.(clamp(snap(scale ? scale.fromUnit(u) : min + u * (max - min)), min, max));
    };
    notch.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      notch.setPointerCapture?.(e.pointerId);
    });
    notch.addEventListener('pointermove', (e) => {
      if (e.buttons & 1) at(e);
    });
    notch.addEventListener('dblclick', () => jumpTell?.(null));
    field.append(notch, landing);
  }
  return {
    node: field,
    input,
    number,
    // `to`: where Glitch throws the slider, or undefined for no jump.
    // `tell(value | null)` hears the pointer dragged, or removed (null).
    setJump(to, tell) {
      jumpTell = tell ?? null;
      if (to === undefined || to === null) {
        notch?.remove();
        landing?.remove();
        notch = landing = null;
        return;
      }
      if (!notch) makeJump();
      field.style.setProperty('--jump', String(clamp(unitOf(to), 0, 1)));
      landing.textContent = `→ ${Number(to).toFixed(digits)}${unit}`;
    },
    set(v) {
      // Not while it is being dragged or typed into from here.
      if (input.matches(':active') || document.activeElement === number) return;
      current = clamp(Number(v), min, max);
      show();
    },
    get value() {
      return current;
    },
    // Where modulation has the value now (0..1 along the bar), or null.
    setLive(unit) {
      const next = unit === null || unit === undefined ? null : clamp(unit, 0, 1);
      if (next === live) return;
      live = next;
      paint();
    },
    // Range mode: `r` is { from, to } along the bar, or null to leave it;
    // `tell(unit)` hears where the pointer is while a range is drawn.
    setRange(r, tell) {
      range = r;
      onRange = r ? tell : null;
      input.classList.toggle('ranging', !!r);
      paint();
    },
    // The value to mark as "where it was", or undefined for no mark.
    setWas(v) {
      if (v === was) return;
      was = v;
      paint();
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
// An option may carry `item` (its text in the list, when that differs from
// the button's) and `midi` (an action, so MIDI map mode can pick it).
// In an action menu `mark()` may return the value to tick. An option may
// also be `pin`ned (it stays at the top while the rest scrolls), `disabled`,
// or carry a class of its own (`cls`).
export function menu({ options, value, onChange, onOpen, label = '', id, text = '', action = false, cls = '', mark = null }) {
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
      const chosen = action ? !!mark && o.value === mark() : o.value === current;
      const item = el('div', { class: `menu-item${chosen ? ' on' : ''}${o.pin ? ' pinned' : ''}${o.disabled ? ' disabled' : ''}${o.cls ? ` ${o.cls}` : ''}`, role: 'option', tabindex: '-1', 'aria-selected': String(chosen), 'aria-disabled': o.disabled ? 'true' : null, 'data-value': String(o.value), text: o.item ?? o.label });
      if (o.midi) item.dataset.midi = o.midi;
      item.addEventListener('click', () => {
        if (!o.disabled) pick(o.value);
      });
      list.append(item);
    }
    if (!items.length) list.append(el('div', { class: 'menu-group', text: 'Nothing to choose' }));
    document.body.append(list);
    // Pinned choices stay in view, one under the other, as the rest scrolls.
    let top = 0;
    for (const item of list.querySelectorAll('.menu-item.pinned')) {
      item.style.top = `${top}px`;
      top += item.offsetHeight;
    }
    onOpen?.(list);
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
    // (A button that is off the screen: place() has closed the list again.)
    if (!list) return;
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
    // Opens the list (for a second button that stands for the same menu).
    open: () => {
      if (!list) open();
    },
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

// A few choices side by side, each a small picture: one is always chosen.
// options: [{ value, label, icon, box?, text? }] where `icon` is the inside
// of an <svg> drawn in `box` (default 32 by 16), or `text` is a word shown
// instead of a picture. The label is the tooltip, and what a screen reader
// says. Returns { node, set(value) }.
export function choice({ options, value, onChange, label = '', cls = '' }) {
  let current = value;
  const node = el('div', { class: `choice${cls ? ` ${cls}` : ''}`, role: 'radiogroup', 'aria-label': label || null });
  const buttons = options.map((o) => {
    const b = el('button', { type: 'button', role: 'radio', title: o.label, 'aria-label': o.label, 'data-value': String(o.value) });
    if (o.text) b.textContent = o.text;
    else b.innerHTML = `<svg viewBox="${o.box ?? '0 0 32 16'}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">${o.icon}</svg>`;
    b.addEventListener('click', () => {
      if (o.value === current) return;
      current = o.value;
      show();
      onChange?.(current);
    });
    node.append(b);
    return [o.value, b];
  });
  function show() {
    for (const [v, b] of buttons) b.setAttribute('aria-checked', String(v === current));
  }
  show();
  return {
    node,
    set(v) {
      current = v;
      show();
    },
  };
}
