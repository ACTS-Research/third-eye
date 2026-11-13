// Orientation on the phone page.
//
// The page lays itself out for however it is turned (upright: preview on
// top; on its side: preview on the left), and iOS turns the camera frames to
// match, so the world is always the right way up. The picture the Mac shows
// is always horizontal: from upright frames it takes the middle band, and
// the preview here shows that same band.
//
// The one thing a performer can change is `picture`: the Rotate button turns
// the picture a quarter turn at a time, on the Mac and in the preview alike.

export const orient = { picture: 0, angle: 0 };

const listeners = new Set();
export const onOrient = (fn) => listeners.add(fn);

// How the page is turned relative to the phone: 0 upright, 90 on its side
// (top to the left), 270 on its other side.
function pageAngle() {
  const raw = Number(window.orientation ?? screen.orientation?.angle ?? 0);
  return Number.isFinite(raw) ? (((Math.round(raw / 90) * 90) % 360) + 360) % 360 : 0;
}

export function measure() {
  const angle = pageAngle();
  if (angle === orient.angle) return false;
  orient.angle = angle;
  for (const fn of listeners) fn(orient);
  return true;
}

// Degrees (0, 90, 180, 270) the picture is turned by the Rotate button.
export function setTurn(degrees) {
  orient.picture = (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
  for (const fn of listeners) fn(orient);
}

// Which way is up in the picture as the Mac shows it, in the phone's own
// terms; the Mac measures roll against it.
export const pictureUp = () => (orient.angle + orient.picture) % 360;

// A touch in an element's own coordinates, 0..1 each way.
export function localXY(element, e) {
  const r = element.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
    y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
  };
}
