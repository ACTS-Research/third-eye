# Third Eye Cam

A live video instrument. An iPhone streams its camera over WebRTC to a Mac
running Chrome, where a WebGL2 effects chain processes it and sends the result
to a fullscreen window on a second display (projector or TV). The phone is
also the controller: its motion sensors, an XY pad and four trigger buttons
modulate the effects.

Built for live performance: the output window keeps rendering whatever else
fails, and every failure is reported on the operator's screen only.

```
 iPhone Safari (/phone)                     Mac Chrome
 ┌──────────────────────┐    WebRTC     ┌──────────────────────────────┐
 │ camera ──────────────┼──── video ───▶│ /output  (second display)    │
 │ tilt, shake, XY pad, │               │   input → effects → screen   │
 │ triggers ────────────┼─ data 60 Hz ─▶│   owns the render loop       │
 └──────────────────────┘               │        ▲ BroadcastChannel    │
                                        │ /control (laptop screen)     │
                                        │   chain, mappings, presets   │
                                        └──────────────────────────────┘
```

## Contents

- [Setup](#setup)
- [Running a show](#running-a-show)
- [Pairing the phone](#pairing-the-phone)
- [Show networking](#show-networking)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Inputs](#inputs)
- [Effects](#effects)
- [Modulation, triggers and presets](#modulation-triggers-and-presets)
- [MIDI, audio and vision](#midi-audio-and-vision)
- [What happens when things go wrong](#what-happens-when-things-go-wrong)
- [Writing your own shader](#writing-your-own-shader)
- [Sending the output to other software](#sending-the-output-to-other-software-syphon-ndi)
- [Deploying to GitHub Pages](#deploying-to-github-pages)
- [Self-hosting the signaling server](#self-hosting-the-signaling-server)
- [Tests](#tests)
- [What has and has not been verified](#what-has-and-has-not-been-verified)

## Setup

Requirements: Node 20.11 or newer, Chrome on the Mac, Safari on the iPhone
(iOS 16.4 or newer for the screen wake lock).

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:5173/control/>. The first run downloads the
MediaPipe models (about 42 MB) into `public/models/`; later runs reuse them.

The phone page needs **HTTPS** (iOS will not give a camera or motion sensors
to a plain-HTTP page), so for anything involving the phone use either:

- the deployed site (see [Deploying to GitHub Pages](#deploying-to-github-pages)), or
- a local HTTPS dev server reachable from the phone:

  ```bash
  npm run dev:https
  ```

  Open `https://<the Mac's IP>:5173/control/` on the Mac and accept the
  self-signed certificate warning there, and again on the phone the first
  time it opens the pairing link.

Other commands:

```bash
npm run build
```

```bash
npm run preview
```

## Running a show

`/control` has three screens, switched at the top right:

| Screen | For |
| --- | --- |
| **Perform** | The show: panic buttons, input select, a monitor of the output, eight faders for the live preset, and the preset strip |
| **Edit** | One preset: its name, fade-in time, effects chain, pinned faders and modulation |
| **Setup** | Everything done once beforehand: output window, inputs, pairing, MIDI, audio, vision, triggers, preset files |

1. On the Mac open `/control` in Chrome and click **Open output window**. The
   picture is rendered in that separate window, which is the one that goes to
   the projector.
2. Connect the projector. Under **Setup → Output**, click **Find displays**,
   allow the prompt and pick the projector; the output window then opens on
   it. Click the window once (or press `F`) to go fullscreen. Without the
   permission, drag the window to the projector yourself and press `F`.
3. Pair the phone ([below](#pairing-the-phone)) and press `1` to select it.
4. Click a preset on the strip, or **Edit** one.

The coloured dots at the top right change the interface palette (red, amber,
bone, lime, ice, magenta). All are a single ink on black so the laptop does
not light the stage; the phone opens in the same palette.

The output window shows only the picture. A small "click for fullscreen" hint
appears while it is windowed and fades after four seconds; nothing is ever
drawn over the picture in fullscreen.

`/control` is only a remote control. You can reload or even close it during a
show; `/output` keeps running with the current state and a reopened `/control`
picks that state up. If `/output` itself is reloaded it restores the last
state from local storage and the phone reconnects by itself.

Keep the output window visible. Chrome stops drawing windows that are
minimised or completely covered.

## Pairing the phone

1. With the output window open, **Setup → Phone** on `/control` shows a QR
   code and a five-character room code.
2. Point the iPhone's camera app at the QR code and open the link in Safari,
   or open `/phone` by hand and type the room code.
3. Tap **START**. iOS asks for the camera, then for motion and orientation
   access. Allow both.
4. The phone shows `LIVE — streaming to Mac`; `/control` shows
   `Phone: streaming`.

On the phone:

| Control | What it does |
| --- | --- |
| Flip | Front / rear camera |
| Torch, Zoom, Exposure, Focus, Lock … | Shown only when the active camera reports the capability |
| Quality | 360p / 720p / 1080p at 30 or 60 fps (default 720p · 30) |
| Camera on / off | Off = controller only: sensors and touch keep working, the output holds the last frame |
| XY pad | Two modulation sources, plus "pad touched" |
| Four buttons | Triggers; labelled with whatever action they are bound to |

Tick **Controller only** before START to join without ever opening the camera.

Keep Safari in front. iOS stops the camera when the page goes to the
background; when it comes back the phone shows a full-screen red warning and
restarts the stream, and `/control` shows an alert for as long as the page is
hidden. The page requests a screen wake lock; if that fails it says so, and
you should set Auto-Lock to Never.

## Show networking

Only the handshake goes through a server (the public PeerJS cloud by
default). Video and sensor data go **directly** between the phone and the Mac.
No TURN relay is configured on purpose: if the two devices cannot reach each
other directly, pairing fails visibly rather than silently routing your show
through the internet. `/control` shows the route (`direct (LAN)`), round-trip
time, bitrate and jitter buffer under **Status**.

Recommended, in order:

1. **iPhone Personal Hotspot over USB.** Plug the phone into the Mac, turn on
   Personal Hotspot, and select the iPhone under the Mac's network settings.
   The link is a cable, immune to the room's radio traffic, and the phone's
   mobile data covers page loading and the handshake.
2. **iPhone Personal Hotspot over Wi-Fi.** The Mac joins the phone's hotspot.
   Leave "Maximize Compatibility" off so the hotspot uses 5 GHz.
3. **Your own router.** A small travel router on a clear 5 GHz channel, placed
   near the stage, with only the phone and the Mac on it. It needs an internet
   uplink for the handshake unless you
   [self-host signaling](#self-hosting-the-signaling-server).

**Avoid venue Wi-Fi.** Guest networks usually isolate clients from each other
(pairing then cannot work at all), sit behind captive portals, and get
congested the moment the audience arrives.

Once the phone is paired and the pages are loaded, the internet can go away:
the stream continues without the signaling server. The server is needed again
only to *re*-pair after the peer-to-peer link itself has broken, so load
everything and pair before doors open. All code, the MediaPipe runtime and its
models are served from the site itself; nothing is fetched from a CDN.

For the lowest latency: use 720p · 30 or 720p · 60, keep the phone close to
the access point, and close other tabs on the Mac.

## Keyboard shortcuts

They work in both `/control` and `/output` (not while typing in a text field).

| Key | Action |
| --- | --- |
| `B` | Blackout (panic). Press again to return |
| `Space` | Freeze frame: holds the current input frame; effects keep running on it |
| `X` | Bypass all effects |
| `G` | Glitch burst |
| `]` or `→` | Next preset, with crossfade |
| `[` or `←` | Previous preset, with crossfade |
| `1` | Input: iPhone |
| `2` | Input: local camera |
| `3` | Input: test pattern |
| `4` | Input: video file |
| `I` | Cycle to the next input |
| `E` | Edit screen on / off (in the control window) |
| `M` | MIDI map mode on / off (in the control window); `Esc` also leaves it |
| `F` | Fullscreen on / off (in the output window) |

## Inputs

All four feed the same pipeline and can be switched live. While a newly
selected input has no frame yet, the previous picture stays up.

- **iPhone** — the WebRTC stream. Primary input.
Inputs are selected with the `1`–`4` buttons on the perform screen and
configured under **Setup → Input**.

- **Local camera** — any camera Chrome can see. Click **Find cameras** once
  to grant permission and list them. An iPhone used through Continuity Camera
  appears here under its own name: a cable-free backup that needs no pairing.
- **Test pattern** — generated on the GPU; needs nothing.
- **Video file** — **Load video file…** picks a local file, which loops. It is
  held in memory, so pick it again after restarting the browser.

**Fill / Fit / Stretch** and **Mirror** apply to every video input.

## Effects

The chain belongs to a preset and is edited on the **Edit** screen. It is an
ordered list. Each effect can be added, removed, moved,
bypassed, and blended with its input (**wet / dry**). Click an effect's name
to fold its card.

| Effect | Notes |
| --- | --- |
| Video Feedback | Zoom / rotate / shift / decay of its own previous output; four blend modes |
| Trails | Lighten, smear, add or darken persistence |
| Time Delay / Slit-scan | 64-frame ring buffer; whole-frame delay or per-pixel delay by row, column, radius or brightness |
| Kaleidoscope / Mirror | Segments, spin, or plain left/right, top/bottom and quad mirrors |
| Rotate / Counter-rotate | Follows the phone's roll: `follow` 1 keeps the horizon level, -1 doubles the roll |
| Pixel Displacement | Driven by noise, or by the picture's own brightness or colour |
| RGB Offset | Linear or radial channel split |
| Edge Glow | Sobel edges with a halo, tint and direction-based rainbow |
| Posterize | Levels, gamma, dither, pixelate |
| False Colour / Thermal | Five palettes, banding, cycling |
| Hue Shift | Shift, cycle, saturation |
| Contrast / Brightness | Plus saturation, gamma, invert |

**Apply to** (on every effect) limits it to the person or to the background.
That needs **Segmentation** switched on under Setup → Vision.

The picture is rendered at the output window's pixel size and follows resizes
and display scaling. **Setup → Output → Full res / 75% / 50%** lowers the internal
resolution if the GPU is struggling.

## Modulation, triggers and presets

**Sources.** Every external signal is a number, either 0..1 or -1..1:

| Group | Sources |
| --- | --- |
| Phone | roll, pitch, yaw, tilt left/right, tilt forward/back, spin rate ×3, motion, shake |
| Touch | pad X, pad Y, pad touched, triggers 1–4 |
| LFO | four oscillators: sine, triangle, ramp, square, random steps, drift |
| Audio | level, bass, mid, high, beat |
| MIDI | every CC and note, created the first time it is seen |
| Face / Hand / Gesture / Pose / Segment | see [vision](#midi-audio-and-vision) |

**Setup → Sources** shows them all moving live; the perform screen shows the
ones the live preset uses.

**Mappings.** On the Edit screen, under **Modulation**, **Add mapping** connects a source to a
parameter. Touch a parameter slider first and the new mapping targets it.
Each mapping has an amount (-1..1 of the parameter's range), offset,
smoothing time, invert, and a mode: *add to the dialled value* or *replace
the value* (the source sweeps the whole range). Wet / dry can be a target too.

**Triggers.** Any source rising through its halfway point can fire an action:
blackout, freeze, bypass, next / previous preset, next input, glitch burst.
With **hold** ticked, blackout / freeze / bypass stay on only while the
trigger is held. Defaults: phone buttons 1–4 are glitch, freeze (hold),
previous preset, next preset. Triggers are global; they do not change with
presets, so "next preset" keeps working whatever preset you land on.

**Presets** are the tiles along the bottom of the perform screen. Each one
stores a chain, its mappings, its LFO settings and its pinned faders, plus:

- **A name** and **a fade-in time**, set on its Edit screen. Loading a preset
  crossfades over that time: both chains run and are blended, so the change is
  smooth even between unrelated effects. Presets without their own time use
  **Setup → Preset library → Default fade**.
- **An Edit screen** (the **Edit** button on the tile). Everything changed
  there is saved into the preset as you go; **Revert** restores it to how it
  was when the screen was opened. **Duplicate** and **Delete** are there too.
- **A position.** Drag a tile to reorder; `[` and `]` step through in that
  order.

**Save as new preset** keeps whatever is live as a new preset. A set of
factory presets is installed on first run. **Setup → Preset library** exports
every preset to one JSON file and imports such files (added at the end;
unknown effects are dropped and out-of-range values clamped). Presets live in
the browser's local storage; export them to keep a copy.

**Faders.** The perform screen shows up to eight faders for the live preset.
By default they are the first parameters of its chain; on the Edit screen,
**Perform faders** pins the ones you want, in order. Dragging a fader changes
the parameter for now without altering the saved preset; double-click resets
it. A dashed line on a fader shows where modulation is currently pushing the
parameter.

## MIDI, audio and vision

All three are off until enabled, and all permission prompts appear on
`/control`, never on the projector.

**MIDI.** Click **MIDI map** at the top right (or press `M`). Every control
that can be mapped is outlined:

- the panic buttons, the four input buttons, previous / next preset
- every preset tile (a pad per preset; the pad stays with the slot)
- the eight perform faders (the knob moves the parameter itself, so the
  on-screen fader follows the hardware, whatever preset is live)
- any effect parameter: on the Edit screen, touch its slider

Click one, then move a knob or press a pad. The control shows what is mapped
to it. Click a control and press `Delete` to clear it; `Esc` leaves map mode.
Everything mapped this way is also listed under **Setup → Triggers and MIDI
controls**, where a pad can be given any other action.

Devices plugged in later are picked up automatically. A mapped knob that has
not been touched since the page loaded leaves its parameter alone.

**Audio.** Under **Setup**, **Enable audio**, choose the input, and set **Input gain** so the
level meter moves without sitting at maximum. **Beat threshold** is how far
above the recent average a hit must rise to count. If `/control` says audio
analysis is waiting, click the output window once: Chrome only starts audio
processing in a window that has been clicked.

**Vision (MediaPipe).** Under **Setup**, five independent features, each off by default
because each costs GPU and CPU time:

| Feature | Sources it adds |
| --- | --- |
| Face | seen, position, size, turn / nod / tilt, mouth open, smile, pucker, brows up / down, blink left / right, eyes wide, cheek puff |
| Hands | seen, position, pinch, openness, rotation, two-hand distance |
| Gestures | fist, open palm, pointing up, thumb up / down, victory, I-love-you |
| Body pose | seen, position, size, shoulder lean, each hand's position and height, arm span |
| Segmentation | person coverage, plus the mask behind **Apply to** on effects |

Inference runs in a worker on a 480-pixel-wide copy of the input, so it never
blocks rendering; it simply produces results as fast as it can (the panel
shows milliseconds per pass). With Hands and Gestures both on, one model
serves both. The test pattern has nothing to detect: use a camera or a video
file.

## What happens when things go wrong

| Event | Behaviour |
| --- | --- |
| Phone stream stalls or drops | Output holds the last frame. `/control` shows a red alert. Phone and Mac each retry on their own until the stream is back |
| Phone camera flips or restarts | Last frame is held; no black flash |
| Safari goes to the background | `/control` alert while hidden; red warning on the phone when it returns; stream resumes |
| Signaling server unreachable | A paired phone keeps streaming. Both sides keep retrying the server quietly |
| `/control` reloaded or closed | `/output` unaffected |
| `/output` reloaded | Restores the last state; the phone reconnects by itself |
| Local camera unplugged | Last frame held; reopened automatically when it returns |
| Graphics context lost | Pipeline is rebuilt in place; the phone link stays up |
| Everything is on fire | `B` |

## Writing your own shader

Each effect is one file in `src/effects/`. The control UI and the uniforms
are generated from `params`; you only write the fragment body.

```js
// src/effects/wobble.js
export default {
  id: 'wobble',
  name: 'Wobble',
  params: {
    amount: { min: 0, max: 0.1, default: 0.02, step: 0.001 },
    speed: { min: 0, max: 10, default: 2, step: 0.01 },
    axis: { options: { Horizontal: 0, Vertical: 1 }, default: 0 },
    flip: { type: 'bool', default: 0 },
  },
  frag: /* glsl */ `
vec4 effect(vec2 uv) {
  float w = sin(uv.y * 20.0 + uTime * speed) * amount;
  vec2 d = axis < 0.5 ? vec2(w, 0.0) : vec2(0.0, w);
  if (flip > 0.5) d = -d;
  return texture(uTex, mirrorUv(uv + d));
}
`,
};
```

Then add it to the list in `src/effects/index.js`. That is all: it appears in
the **Add effect** menu, its sliders are generated, and every parameter can be
modulated.

- Every parameter arrives as `uniform float <name>` (option lists and
  checkboxes too, as numbers). Avoid GLSL built-in names such as `mix`.
- `uv` is 0..1 with (0,0) at the bottom-left. Return the processed colour;
  wet / dry and person / background masking happen after `effect()` returns.
- Built-ins (`src/effects/common.glsl.js`): `uTex` (input), `uResolution`,
  `uTime`, `uPhone` (roll, pitch, yaw in radians), and helpers `luma`, `rot2`,
  `mirrorUv`, `inFrame`, `rgb2hsv`, `hsv2rgb`, `hueRotate`, `hash21`,
  `noise2`, `ASPECT`, `PI`, `TAU`.
- `uses: { prev: true }` gives the effect its own previous output as `uPrev`
  (see `feedback.js`, `trails.js`).
- `uses: { history: { frames, maxWidth } }` gives a ring buffer of past input
  frames as `uHistory` (see `delay.js`).

A shader that fails to compile is reported in the output window's console
and that effect is skipped; the rest of the chain keeps running.

## Sending the output to other software (Syphon, NDI)

A web page cannot publish a Syphon or NDI source: browsers have no access to
those frameworks. The output window is an ordinary Chrome window, though, so
the usual route is to capture it:

- Most VJ and mapping software can take a window or a display as an input
  (VDMX window inputs, OBS window capture, screen-capture sources in
  MadMapper and Resolume).
- Utilities exist that republish a chosen window as a Syphon source.
- Or give the output window its own display and capture that with a capture
  card on a second machine.

Capture adds a little latency and depends on the window staying visible. A
native wrapper (an Electron build with a Syphon add-on) would be the way to a
true Syphon server; it is not part of this project yet.

## Deploying to GitHub Pages

`.github/workflows/pages.yml` builds on every push and deploys from the
repository's default branch.

One-time step: in the repository on GitHub, **Settings → Pages → Build and
deployment → Source: GitHub Actions**. Until that is set, the build job passes
and the deploy job fails with "Ensure GitHub Pages has been enabled".

The site is then at `https://<owner>.github.io/<repo>/`. It is fully static
and uses relative paths, so it works from any path or any other static host.
GitHub Pages serves HTTPS, which the phone page requires.

## Self-hosting the signaling server

The public PeerJS server is shared and offers no guarantees. To remove that
dependency, run your own [PeerServer](https://github.com/peers/peerjs-server)
and enter its address under **Phone → Link and signaling** on `/control`, for
example `wss://192.168.8.10:9000/`. The address travels to the phone inside
the QR code.

Because the phone page is served over HTTPS it can only reach a `wss://`
server, so PeerServer must be started with a TLS certificate the iPhone
trusts (`peerjs --port 9000 --sslkey key.pem --sslcert cert.pem`), for
example one made with [mkcert](https://github.com/FiloSottile/mkcert) whose
root certificate is installed on the phone. An API key other than the default
can be appended as `?key=…`.

With signaling on your own router the system needs no internet at all once
the pages are loaded.

## Tests

The tests drive the real pages in headless Chromium. They need Playwright's
Chromium; the vision test also downloads a few sample photos.

```bash
npm test
```

| File | Covers |
| --- | --- |
| `tests/smoke.mjs` | Pipeline, control ↔ output sync, keys, resize, reloads, lost GL context |
| `tests/control-ui.mjs` | The three screens, palettes, perform faders, preset editing, fades, reordering, the pop-out output |
| `tests/phone.mjs` | Real WebRTC against a local PeerServer: pairing, live video, hold on stall, every reconnect path, local camera |
| `tests/modulation.mjs` | All effects, sensor channel, simulated motion, touch, mappings, triggers, presets, crossfade |
| `tests/midi-audio.mjs` | Audio analysis on Chromium's fake microphone; MIDI through a stand-in device, MIDI map mode for buttons, presets, faders and parameters |
| `tests/vision.mjs` | Each MediaPipe feature on sample photos; person / background masking |

## What has and has not been verified

Everything above was developed and tested in headless Chromium, with
Chromium's fake camera and microphone standing in for hardware. That covers
the rendering pipeline, state sync, the WebRTC link and its recovery paths,
the modulation system, presets, audio analysis and the MediaPipe features.

It has **not** been run on a real iPhone, a real projector or a real MIDI
controller. Check these the first time you set up:

- The order and wording of the iOS permission prompts. If motion access is
  refused or never asked, the phone shows an **Enable motion sensors** button.
- Which camera controls appear. That depends entirely on what the iPhone's
  camera reports; an empty list is not an error.
- The direction of **Rotate / Counter-rotate**. If the picture turns twice as
  far instead of staying level, set `follow` to -1.
- Fullscreen placement on the projector through the Window Management
  permission, and that the output holds 60 fps at the projector's resolution.
- Latency. `/control` shows an estimate (marked `≈` when it includes an
  allowance for the phone's capture and encode time); trust your eyes.
- MediaPipe on the GPU. The tests use the CPU path. On a Mac the default is
  the GPU; if a feature reports an error, switch Setup → Vision to
  **Run on CPU**.
