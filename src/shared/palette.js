// UI colour palettes. A look-and-feel preference of this browser, not part of
// the show state: stored locally, and passed to the phone in the pairing link.

import './theme.css';
import { LOOK_KEYS, clampDim } from './look.js';
import '@fontsource/big-shoulders-display/latin-700';
import '@fontsource/big-shoulders-display/latin-800';
import '@fontsource/jetbrains-mono/latin-400';
import '@fontsource/jetbrains-mono/latin-500';
import '@fontsource/jetbrains-mono/latin-700';

export const PALETTES = {
  darkroom: { label: 'Darkroom red', ink: '#ff6b5e' },
  amber: { label: 'Amber', ink: '#ffb347' },
  bone: { label: 'Bone', ink: '#e8e4dc' },
  lime: { label: 'Lime', ink: '#d6ff3f' },
  ice: { label: 'Ice', ink: '#7ce3ff' },
  magenta: { label: 'Magenta', ink: '#ff7ad9' },
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
  return palette;
}

export function currentDim() {
  return clampDim(document.documentElement.style.getPropertyValue('--dim').replace('%', ''));
}

// Dimmer, 25..100: how much of the palette's light the ink keeps.
export function applyDim(value, { save = true } = {}) {
  const dim = clampDim(value);
  if (dim === 100) document.documentElement.style.removeProperty('--dim');
  else document.documentElement.style.setProperty('--dim', `${dim}%`);
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
