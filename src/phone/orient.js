// Keeps the live screen horizontal, and says how the camera frames must be
// turned so the picture the Mac shows is horizontal too.
//
// A web page on iOS cannot lock its orientation, and Safari turns the camera
// frames so they are upright for however the page is turned: hold the phone
// upright and the Mac would get an upright, narrow picture. So:
//
//   - `ui`: degrees (clockwise) the live screen is drawn turned inside the
//     page. A quarter turn while the page is upright; the screen then reads
//     the right way up when the phone is held sideways, like a camera.
//   - `picture`: degrees the Mac turns the frames back (anticlockwise). It
//     follows the shape of the frames themselves, so it is right on a
//     desktop browser too, where frames never turn.
//   - `manual`: half a turn added to both by the Rotate button, for holding
//     the phone the other way round.
//
// With these the picture is fixed to the phone like a camcorder's: it never
// flips by itself, whatever the page does.

export const orient = { ui: 0, picture: 0, manual: 0, angle: 0 };

const listeners = new Set();
export const onOrient = (fn) => listeners.add(fn);

// How the page itself is turned relative to the phone: 0 upright, 90 on its
// side (top to the left), 270 on its other side.
function pageAngle() {
  const raw = Number(window.orientation ?? screen.orientation?.angle ?? 0);
  return Number.isFinite(raw) ? (((Math.round(raw / 90) * 90) % 360) + 360) % 360 : 0;
}

export function measure(video) {
  const angle = pageAngle();
  // The two sideways holds differ by half a turn.
  const other = angle === 270 ? 180 : 0;
  const uprightPage = window.innerHeight > window.innerWidth;
  const uprightFrame = !!video && video.videoHeight > video.videoWidth;
  const ui = ((uprightPage ? 90 : other) + orient.manual) % 360;
  const picture = ((uprightFrame ? 90 : other) + orient.manual) % 360;
  if (ui === orient.ui && picture === orient.picture && angle === orient.angle) return false;
  Object.assign(orient, { ui, picture, angle });
  for (const fn of listeners) fn(orient);
  return true;
}

export function setManual(degrees) {
  orient.manual = ((degrees % 360) + 360) % 360;
}

// Which way is up in the picture as the Mac shows it, in the phone's own
// terms; the Mac measures roll against it.
export const pictureUp = () => (orient.angle + orient.picture) % 360;

// A touch in an element's own coordinates, 0..1 each way, whatever turn the
// live screen is drawn with.
export function localXY(element, e) {
  const r = element.getBoundingClientRect();
  const u = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const v = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  switch (orient.ui) {
    case 90:
      return { x: v, y: 1 - u };
    case 180:
      return { x: 1 - u, y: 1 - v };
    case 270:
      return { x: 1 - v, y: u };
    default:
      return { x: u, y: v };
  }
}
