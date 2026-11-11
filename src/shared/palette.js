// UI colour palettes. A look-and-feel preference of this browser, not part of
// the show state: stored locally, and passed to the phone in the pairing link.

import './theme.css';
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

const KEY = 'thirdeye.palette';

export function currentPalette() {
  return document.documentElement.dataset.palette || 'darkroom';
}

export function applyPalette(name, { save = true } = {}) {
  const palette = PALETTES[name] ? name : 'darkroom';
  if (palette === 'darkroom') delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = palette;
  if (save) {
    try {
      localStorage.setItem(KEY, palette);
    } catch {
      /* private window */
    }
  }
  return palette;
}

export function restorePalette() {
  let saved = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    /* private window */
  }
  return applyPalette(saved, { save: false });
}
