// UI colour palettes. A look-and-feel preference of this browser, not part of
// the show state: stored locally, and passed to the phone in the pairing link.

import './theme.css';
import { LOOK_KEYS, clampDim } from './look.js';
import '@fontsource/big-shoulders-display/latin-700';
import '@fontsource/big-shoulders-display/latin-800';
import '@fontsource/jetbrains-mono/latin-400';
import '@fontsource/jetbrains-mono/latin-500';
import '@fontsource/jetbrains-mono/latin-700';

// ink and bg must match shared/theme.css.
export const PALETTES = {
  darkroom: { label: 'Darkroom red', ink: '#ff6b5e', bg: '#060303' },
  amber: { label: 'Amber', ink: '#ffb347', bg: '#070502' },
  bone: { label: 'Bone', ink: '#e8e4dc', bg: '#050505' },
  lime: { label: 'Lime', ink: '#d6ff3f', bg: '#050702' },
  ice: { label: 'Ice', ink: '#7ce3ff', bg: '#02060a' },
  magenta: { label: 'Magenta', ink: '#ff7ad9', bg: '#080308' },
};


export function currentPalette() {
  return document.documentElement.dataset.palette || 'darkroom';
}

function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private window */
  }
}

export function applyPalette(name, { save = true } = {}) {
  const palette = PALETTES[name] ? name : 'darkroom';
  if (palette === 'darkroom') delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = palette;
  if (save) store(LOOK_KEYS.palette, palette);
  paintDim();
  return palette;
}

export function currentDim() {
  return clampDim(document.documentElement.dataset.dim);
}

// sRGB hex <-> linear light, so "25 %" means a quarter of the light.
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (l) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055);
const channels = (hex) => [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));

export function dimmedInk(name, dim) {
  const p = PALETTES[name] ?? PALETTES.darkroom;
  const k = clampDim(dim) / 100;
  const ink = channels(p.ink);
  const bg = channels(p.bg);
  return `#${ink.map((v, i) => Math.round(toSrgb(v * k + bg[i] * (1 - k)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

// Sets --ink to the dimmed colour as a plain hex value (or leaves the
// palette's own when at full).
function paintDim() {
  const root = document.documentElement;
  const dim = currentDim();
  if (dim === 100) root.style.removeProperty('--ink');
  else root.style.setProperty('--ink', dimmedInk(currentPalette(), dim));
}

// Dimmer, 25..100: how much of the palette's light the ink keeps.
export function applyDim(value, { save = true } = {}) {
  const dim = clampDim(value);
  if (dim === 100) delete document.documentElement.dataset.dim;
  else document.documentElement.dataset.dim = String(dim);
  paintDim();
  if (save) store(LOOK_KEYS.dim, String(dim));
  return dim;
}

export function restorePalette() {
  let saved = { palette: null, dim: null };
  try {
    saved = { palette: localStorage.getItem(LOOK_KEYS.palette), dim: localStorage.getItem(LOOK_KEYS.dim) };
  } catch {
    /* private window */
  }
  applyDim(saved.dim, { save: false });
  return applyPalette(saved.palette, { save: false });
}
