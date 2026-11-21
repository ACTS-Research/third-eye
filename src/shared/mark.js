// The app's mark, drawn inline so it can move: the eye looks slowly from
// side to side and blinks now and then (mark.css). The same shapes as
// public/icon.svg; when the logo is redrawn, change both.

export const MARK_SVG = `<svg class="mark" viewBox="0 6 64 58" role="img" aria-label="Third Eye Cam">
<path d="M12 14H42V10A2 2 0 0 1 44 8H52A2 2 0 0 1 54 10V14.2A9 9 0 0 1 61 23V51A9 9 0 0 1 52 60H12A9 9 0 0 1 3 51V23A9 9 0 0 1 12 14Z" fill="var(--ink)"/>
<rect x="9" y="20" width="9" height="5" rx="1.5" fill="var(--bg)"/>
<g class="mark-lid"><path d="M35 18Q53 37 35 56Q17 37 35 18Z" fill="var(--bg)"/>
<g class="mark-iris"><circle cx="35" cy="37" r="7" fill="var(--ink)"/><circle cx="35" cy="37" r="2.6" fill="var(--bg)"/></g>
<circle class="mark-ring" cx="35" cy="37" r="4"/></g>
</svg>`;

export const MARK_CSS = `
.mark { display: block; }
.mark-lid { transform-origin: 35px 37px; animation: mark-blink 6s ease-in-out infinite; }
.mark-iris { transform-origin: 35px 37px; animation: mark-look 9s ease-in-out infinite; }
.mark-ring { transform-origin: 35px 37px; animation: mark-ring 3s ease-out infinite; fill: none; stroke: var(--ink); stroke-width: 1; }
@keyframes mark-blink { 0%, 91%, 100% { transform: scaleY(1); } 94% { transform: scaleY(0.08); } }
@keyframes mark-look { 0%, 100% { transform: translateX(0); } 30% { transform: translateX(-3px); } 60% { transform: translateX(3px); } }
@keyframes mark-ring { 0% { transform: scale(0.5); opacity: 0.9; } 100% { transform: scale(2.6); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .mark-lid, .mark-iris, .mark-ring { animation: none; } }
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
  return box;
}
