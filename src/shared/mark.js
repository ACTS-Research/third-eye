// The app's mark, drawn inline so it can move: the camera in outline, light
// video noise inside it that changes ten times a second, and an eye that
// blinks now and then (the noise dims and softens a little as it does). The
// movement is SVG's own animation, so nothing here needs a stylesheet or a
// timer. The still form is public/icon.svg, drawn by scripts/make-icons.mjs:
// when the logo is redrawn, change both.

export const MARK_SVG = `<svg class="mark" viewBox="0 5 64 58" role="img" aria-label="Third Eye Cam">
<defs><filter id="mark-noise" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.5" numOctaves="2" seed="1" result="t"><animate attributeName="seed" dur="0.9s" repeatCount="indefinite" calcMode="discrete" values="1;2;3;4;5;6;7;8;9"/></feTurbulence><feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  14 0 0 0 -8.7" result="a"/><feComposite in="SourceGraphic" in2="a" operator="in" result="n"/><feGaussianBlur in="n" stdDeviation="0"><animate attributeName="stdDeviation" dur="20s" repeatCount="indefinite" keyTimes="0;0.175;0.1785;0.2;0.52;0.5235;0.5375;0.541;0.565;0.86;0.8635;0.885;1" values="0;0;0.13;0;0;0.13;0.065;0.13;0;0;0.13;0;0"/></feGaussianBlur></filter></defs>
<path d="M12 14H42V10A2 2 0 0 1 44 8H52A2 2 0 0 1 54 10V14.2A9 9 0 0 1 61 23V51A9 9 0 0 1 52 60H12A9 9 0 0 1 3 51V23A9 9 0 0 1 12 14Z" fill="var(--ink)" filter="url(#mark-noise)"><animate attributeName="opacity" dur="20s" repeatCount="indefinite" keyTimes="0;0.175;0.1785;0.2;0.52;0.5235;0.5375;0.541;0.565;0.86;0.8635;0.885;1" values="1;1;0.85;1;1;0.85;0.925;0.85;1;1;0.85;1;1"/></path>
<path d="M12 14H42V10A2 2 0 0 1 44 8H52A2 2 0 0 1 54 10V14.2A9 9 0 0 1 61 23V51A9 9 0 0 1 52 60H12A9 9 0 0 1 3 51V23A9 9 0 0 1 12 14Z" fill="none" stroke="var(--ink)" stroke-width="2.7" stroke-linejoin="round"/>
<rect x="10" y="20.5" width="8" height="4" rx="1.5" fill="var(--ink)"/>
<path d="M11.5 38Q32 18 52.5 38Q32 58 11.5 38Z" fill="var(--bg)" stroke="var(--ink)" stroke-width="2.7" stroke-linejoin="round"><animate attributeName="d" dur="20s" repeatCount="indefinite" keyTimes="0;0.175;0.1785;0.1835;0.52;0.5235;0.5285;0.5375;0.541;0.546;0.86;0.8635;0.8685;1" values="M11.5 38Q32 18 52.5 38Q32 58 11.5 38Z;M11.5 38Q32 18 52.5 38Q32 58 11.5 38Z;M11.5 38Q32 39.5 52.5 38Q32 39.5 11.5 38Z;M11.5 38Q32 18 52.5 38Q32 58 11.5 38Z;M11.5 38Q32 18 52.5 38Q32 58 11.5 38Z;M11.5 38Q32 39.5 52.5 38Q32 39.5 11.5 38Z;M11.5 38Q32 18 52.5 38Q32 58 11.5 38Z;M11.5 38Q32 18 52.5 38Q32 58 11.5 38Z;M11.5 38Q32 39.5 52.5 38Q32 39.5 11.5 38Z;M11.5 38Q32 18 52.5 38Q32 58 11.5 38Z;M11.5 38Q32 18 52.5 38Q32 58 11.5 38Z;M11.5 38Q32 39.5 52.5 38Q32 39.5 11.5 38Z;M11.5 38Q32 18 52.5 38Q32 58 11.5 38Z;M11.5 38Q32 18 52.5 38Q32 58 11.5 38Z"/></path>
<g transform="translate(32 38)"><g><g><animateTransform attributeName="transform" type="scale" dur="20s" repeatCount="indefinite" keyTimes="0;0.175;0.1785;0.1835;0.52;0.5235;0.5285;0.5375;0.541;0.546;0.86;0.8635;0.8685;1" values="1 1;1 1;1 0;1 1;1 1;1 0;1 1;1 1;1 0;1 1;1 1;1 0;1 1;1 1"/><circle r="4.05" fill="none" stroke="var(--ink)" stroke-width="2.7"/></g></g></g>
</svg>`;

export const MARK_CSS = `
.mark { display: block; }
`;

let installed = false;
// Returns an element holding the mark, `width` CSS pixels wide.
export function mark(width) {
  if (!installed) {
    installed = true;
    const style = document.createElement('style');
    style.textContent = MARK_CSS;
    document.head.append(style);
  }
  const box = document.createElement('div');
  box.className = 'mark-box';
  box.style.width = `${width}px`;
  box.innerHTML = MARK_SVG;
  // Someone who has asked their system for less motion gets the mark still.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const a of box.querySelectorAll('animate, animateTransform')) a.remove();
  }
  return box;
}
