# Handoff

## 2026-11-13 (third session, continued)

**Where things stand.** Two things were built this session and both are
live on GitHub Pages from `main`. The output window is optional: `/control`
runs the whole instrument by itself. And the phone can be paired with no
internet, by QR code both ways ("Pair without internet"). All fourteen test
suites pass in headless Chromium. On the real Mac and iPhone only normal
pairing over the hotspot has been confirmed (it works); the university Wi-Fi
could not reach the pairing server, which is what the new pairing is for.

**Next step.** Try Pair without internet on the real Mac and iPhone, on the
iPhone's hotspot: scan the Mac's code, show the phone's code to the Mac's
camera, then open and close the output window. Report what happens at each
step; none of it has run on Safari yet.

**Decisions only you can make.**

- Say whether 1280×720 is the right size for the picture (and recordings)
  while no output window is open. It is fixed so recordings do not depend on
  the size of the monitor on the page.
- Decide whether to allow a relay (TURN) fallback. The hotspot route works
  everywhere tried so far; only the Mac and the phone both on venue Wi-Fi
  fails, and that is the case a relay would cover. A relay costs latency and
  depends on someone's server.
- Decide whether to run your own pairing server instead of the public PeerJS
  one. The public one works; it comes with no guarantees. It is now also
  needed each time the output window opens or closes with a phone paired.
- Pick the default recording format. It is WebM because Chrome writes it to
  disk every second; MP4 opens in more players but is written in large pieces.
- Say whether the board cover should stay the design prototype
  (`screenshots/third-eye-current.png`) or become a capture of the real app.
- Delete two branches on GitHub (Branches page, trash icon), and their rules
  under Settings → Environments → `github-pages` if listed:
  `claude/affectionate-gates-x6ngzx` and `claude/affectionate-tesla-hj7oki`.
  Both are fully contained in `main`; a cloud session cannot delete them.
- Export your presets (Setup → Preset library → Export presets) if you care
  about them. They live only in your browser, not in this repo.

**When you are next in the studio.** Open the output window before the
show, then: measure real latency fullscreen on the projector at 720p · 60 (so
far only against the Mac's own screen: 200 ms at 30 fps, 167 ms at 60), check
the Latency line reads close to it, move the Dim strip with the phone paired
to see the phone follow, and cover or minimise the output window for a few
seconds to see `/control` say it is not drawing (it must not take the picture
over).

**Branch.** Work is on `main`, the default branch and the one that deploys.
Nothing is waiting to be merged; everything is pushed.

### Pair without internet (built 2026-11-13)

- **What travels** is in the header of `src/shared/direct.js`: the Mac's
  offer, slimmed, phrase-swapped and compressed, in the pairing link after
  the `#`; the phone's half as a 108-character token. The Mac never sees the
  phone's real answer: it rebuilds one from its own offer plus the token.
  The offer carries no addresses of the Mac's, on purpose: the Mac makes the
  first move, and a phone with nothing to try cannot time out while its code
  is being shown.
- **A direct link fills the same slots** as a PeerJS one (`conn`, `call`) on
  both sides, through `DirectConn` / `DirectCall`. One RTCPeerConnection
  carries video, the message channel (negotiated, id 1) and the sensor
  channel (id 42).
- **The phone keeps direct links in reserve** (`pendings` in
  `src/phone/link.js`) and switches to one when the Mac's engine first
  speaks on it (`host`).
- **Introductions** move the picture without a re-scan: the window that
  reaches the phone relays another window's offer to it and the answer back
  (`PhoneLink.relay`, bus `intro` / `intro-answer`). An opening output is
  told `engine-hold`, gets introduced, then says `engine-take`. While an
  output hosts, `/control` keeps a link in reserve (`keepSpare` in
  `host.js`), so closing or crashing the output needs no handshake.
- **A phone page opened from the code pairs by code only** (`directFirst`
  in `src/phone/link.js`) until the link is up or the operator taps Hide the
  code. Without that, a reachable pairing server wins the race and the phone
  never shows its code.
- **The dialog never shows an earlier attempt's code**: it blanks the code
  until the engine's fresh offer arrives.
- **The dialog** is `src/control/offline-pair.js`. The Mac's camera reads the
  phone's code with `BarcodeDetector` where Chrome has one, and with the
  bundled jsQR library (added 2026-11-13 with the owner's approval; loaded
  only when the dialog opens) whenever that finds nothing. The tests give
  `/control` a stand-in camera showing a picture of the phone's code
  (`fakeMacCamera` in `tests/lib.mjs`), read by jsQR.

### This session, in short

- The engine moves between windows (plan A). Details under
  [Optional output window](#optional-output-window-built-2026-11-12-third-session).
- Top bar: `Output off · 60 fps` is calm and opens the output window when
  clicked. An alert appears only if the output vanishes without warning or
  stops drawing. Nothing covers the monitor any more.
- Fixed on the way: a video call left open on the Mac when the phone link
  was shut down (PeerJS skips connections on destroy).
- New suites: `tests/handover.mjs`, `tests/standalone.mjs`; `smoke`,
  `control-ui` and `layout` cover both modes.

### Second session (2026-11-12), in short

- Latency measured on the real phone; 720p · 60 is the phone's default; the
  Latency estimate allows one camera frame; a stray flash is named apart.
- Dim strip under the palettes (25 %–100 %), carried to the phone by the QR
  link and live while paired; palette changes now reach the phone live too.
- Alert strips: compact, an × on each, a fix button where there is one
  (Show pairing, Show QR code, Reload both pages, Go to a Setup panel); the
  room-code strip now clears once the phone pairs.
- Fader column: no overlaps in short windows, names whole; modulation shown
  as a hatched band instead of a dashed line.
- Fixed: the phone page went black (a CSS variable loop between the dimmer
  and the phone's own `--dim`). That also hid START and broke pairing tests
  in the field; after the fix the hotspot route works.

### Optional output window (built 2026-11-12, third session)

Plan A as approved: the engine moves between windows. The phone reconnects
at each switch (1.5–2.5 s in the headless tests) and a recording in progress
stops.

- **Who hosts** is decided in `src/control/host.js`; the header comment there
  lists the states and the bus messages. In short: `/control` asks
  `engine-who` on load and starts its own engine if nobody answers; an output
  window claims with `output-ping` (the hosting `/control` stops and answers
  `engine-released`); a host says `engine-gone` as its page closes; a quiet
  host is probed with `engine-who` before it is taken for gone, because a
  window Chrome has stopped drawing sends no status but still answers.
- **One `Engine` object per page**, started and stopped (`engine.start()`,
  `engine.stop()`), never rebuilt. A stopped engine holds no room code, no
  devices and no recording, and ignores the store; `start()` takes everything
  from the store again (`resync()`).
- **The bus loops back** in `/control` (`createBus({ loopback: true })`), so
  the engine and the UI talk in one window. Store traffic (`op`, `event`,
  `hello`) is never looped back.
- **The monitor** on `/control` is the engine's own canvas (`#stage`) while
  it hosts, moved between the Perform and Edit screens; otherwise the small
  readback (`canvas.readback`). In `/control` the engine renders at a fixed
  1280×720.
- **The phone learns the picture moved** from a `host` message carrying a
  session id (new at every `engine.start()`), and calls again at once
  (`onHostSession` in `src/phone/link.js`).

---

## For whoever picks this up

Read `README.md` for what the app does and how it is used. This section is
what the README does not say.

### Shape of the code

Three static pages built by Vite, no framework. About 8,600 lines in `src/`.

| Path | What lives there |
| --- | --- |
| `src/engine/` | Everything live: the WebGL2 pipeline (`pipeline.js`), inputs, the host side of the phone link (`remote.js`), modulation, MIDI, audio, tempo, vision worker, recorder, latency probe. `engine.js` ties them together and owns the frame loop. It runs in `/output` while an output window is open, otherwise in `/control` |
| `src/control/` | The operator's page. `main.js` mounts three screens: `perform.js`, `edit.js` (+ `chain.js`, `mod-panel.js`), and the Setup panels. `host.js` decides which window hosts the engine and owns the monitor canvas. `midi-map.js` is map mode; `status.js` owns the top-bar readouts and alerts |
| `src/phone/` | The iPhone page: `main.js`, `link.js` (reconnect watchdog), `sensors.js`, `camera-controls.js` |
| `src/shared/` | State and protocol used by more than one page: `state.js` (the state document and its sanitisers), `store.js` (op-based sync over BroadcastChannel), `presets.js`, `actions.js`, `keys.js`, `macros.js`, `net.js`, `sdp.js`, `direct.js` (pairing with no server), `qr.js`, `sources.js`, `palette.js` + `theme.css` + `look.js` (palette and dimmer, kept in this browser's storage; the engine forwards them to the phone) |
| `src/effects/` | One file per effect; `index.js` is the registry, `common.glsl.js` the shared GLSL |
| `src/sw.js` | Service worker template; `vite.config.js` fills in the file list |
| `scripts/` | `fetch-models.mjs` (MediaPipe models, run before dev and build), `session-screenshot.mjs` (the board screenshot) |
| `tests/` | Fourteen headless suites and `lib.mjs` |

### Rules that are easy to break

- **Whichever window hosts the engine owns everything live**: video, the
  phone connection, MIDI, audio, vision, recording. The output window hosts
  it when open, `/control` otherwise. Only one engine may run per browser:
  two would fight over the room code. With the output open, `/control` only
  edits state and shows what the output reports, so it can be reloaded
  mid-show.
- **Anything the engine listens for must work while it is stopped.** Guard
  new store, bus and window listeners in `engine.js` with `this.running`,
  and release new devices in `stop()`.
- **A message between the engine and the control UI goes over the bus**, not
  by direct call, so it works in both modes. A page never gets a storage
  event for its own change: `/control` calls `ui.lookChanged()` for the
  palette and dimmer.
- **A direct link must survive every signaling retry.** `PhoneLink.open()`
  tears down only PeerJS connections (`destroy({ keepDirect: true })`), and
  the phone never drops a direct link for being slow, only for being dead.
- **Do not put the Mac's addresses back into the offer**, and do not make
  the phone wait on anything before it shows its code (see above).
- **Close a PeerJS connection yourself before destroying its peer.**
  `peer.destroy()` skips every other connection (it removes them from the
  list it is looping over); `PhoneLink.destroy()` works around it.
- **State changes are ops.** Go through `store.dispatch` / `merge` /
  `patchItem` / `setScene`; both windows apply the same op. A new top-level
  state key needs a default in `defaultState()` and a line in
  `sanitizeState()`, or it is dropped on load.
- **A scene is what a preset stores**: `chain`, `mappings`, `lfos`, `macros`.
  Triggers (`actions`), tempo, network and device settings are global.
- **Nothing is ever drawn on the output** except the picture (and the idle
  hint before fullscreen). Status goes to `/control`. Nothing may cover the
  monitor on `/control` either, except the operator's own "Monitor off".
- **The phone is never tethered.** The owner rules out a cable between the
  phone and the Mac (2026-11-12): it defeats the purpose. Do not propose USB
  as the answer to a network problem.
- **Nothing may be fetched from a third party at run time.** Fonts, the
  MediaPipe runtime and models are all served from the site.
- **Keep `--ink` a plain colour.** The dimmer sets it from script
  (`palette.js`). Do not make it depend on another CSS variable: the phone's
  stylesheet defines its own `--dim`, and a loop blanks every ink colour.
  `tests/control-ui.mjs` checks the phone page is really inked.
- **The control page must not jump.** Text that comes and goes gets a
  reserved height (`keep-1` … `keep-6` in `control.css`); alerts float.
  `tests/layout.mjs` enforces this.
- **An alert with a fix passes an action** (`ui.setAlert(key, text, level,
  ui.alertTo.…)`): pairing, QR code, reload both pages, or a Setup panel by
  id. Every alert gets an × automatically.
- **Anything a performer can press should carry `data-midi="<action>"`** so
  MIDI map mode picks it up.
- **The phone must release its video sender before stopping a camera track**
  (`link.detach()`), or the Mac receives a black frame.
- Copy on the pages is plain and says what to do; see the existing messages.

### Working in the cloud sandbox

- **Push straight to `main`** (the owner's instruction). Every push deploys;
  check the "Build and deploy to GitHub Pages" run afterwards.
- **The deployed site and the public PeerJS server cannot be reached from the
  sandbox.** Pairing is tested against a local PeerServer (`tests/lib.mjs`).
- **Run suites one at a time with a timeout under two minutes**, or in the
  background; `tests/vision.mjs` takes several minutes. `SKIP_BUILD=1` reuses
  `dist/`. Do not rebuild while a suite is running.
- **Headless Chromium starves background pages**: frames arrive hundreds of
  milliseconds apart and timers are throttled to about one a second. Tests
  must poll for a condition, never sleep and sample. Low fps readings in
  sandbox screenshots mean nothing.
- **`outputStats()` in the tests reads the small readback**, which an engine
  only renders for a control page in another window. To read it on
  `/control` itself, set `engine.remoteControlSeenAt = Infinity` first.
- **To stage statuses on `/control`** (`tests/layout.mjs`), close the output,
  wait for `/control` to host, then `engine.stop()`; otherwise live status
  replaces the staged one.
- **This Chromium has no MIDI backend** (`requestMIDIAccess` never settles);
  the MIDI test stubs a device.
- Deleting a remote branch and changing repository settings are not possible
  from the cloud session.

### Things outside this repo

- The three design directions the redesign came from are on a design canvas:
  https://claude.ai/artifact/4bRZEX1Xp89CPKQF79ozx6 (private to the owner).
  Direction C, "Darkroom", was chosen.
- Presets and recordings live in the owner's browser storage.

### Known rough edges

- Several alerts at once stack over the top of the page; they are compact
  and each can be closed with its ×.
- Below about 1000 px wide the top bar only has room for the output readout.
- The first reload after a deploy can show the previous version for a few
  seconds; `/control` warns when its version and the output's differ.
- An early screenshot showed the output at 30 fps rather than 60; it read 60
  later. Never explained (Low Power Mode is a guess).
- MP4 recording holds most of the file back until recording stops.
- One `control-ui` check ("it says what is wrong and what to try") is
  timing-dependent and occasionally fails; it passes on a rerun. So does
  "the output flashes black and white during the test" in `record-latency`.
- In the sandbox a busy output can go quiet for two seconds, and `/control`
  then shows "not drawing" for a moment. Not seen to matter; on a real Mac
  it should only appear for a window that is really hidden.

### Never run on real hardware (all unconfirmed)

Pair without internet, every step: Safari answering the offer, the Mac's
real camera reading the phone's real screen, the rebuilt answer being accepted between
Chrome and Safari, the hotspot or a Mac-made network carrying it, and the
phone following the picture between windows. Whether iOS still has the
phone page saved after a week. Running with no output window; the phone reconnecting when the output opens
or closes, and how long it takes; a covered or minimised output being
reported as not drawing; audio, MIDI and recording on `/control`. Measure
real latency against a projector (only the Mac's own screen so
far, H.264 only); whether H.264 beats VP8 / VP9; the corrected Latency
estimate and the stray-flash note on the result line; the dimmer on the
iPhone, live and from the QR link; Reload both pages after a real deploy;
recordings longer than a few seconds; MIDI map with a physical controller;
fullscreen placement on a second display; MediaPipe on the Mac's GPU; the
direction of Rotate / Counter-rotate. Tap tempo, offline reload, and the
phone's sensors and touch controls have not been reported on either way.

### Ideas raised and not started

Relay fallback; own pairing
server; a cue list beyond per-preset fade and order; tempo from the audio
beat; a native wrapper for a true Syphon output; a MIDI mapping for the
dimmer.

### Prompt to start a new session

```
You are picking up Third Eye Cam (repo ACTS-Research/third-eye, branch main).
Read CLAUDE.md, then HANDOFF.md, then README.md before doing anything; the
handoff says where things stand, the rules that are easy to break, how to
work in the cloud sandbox, and the plan for this session.

This session: <say what you want done>.

Before writing code, tell me in a few lines how you will do it and what will
change for me, and wait for my go.

Work on main and push to main. After each push, check that the "Build and
deploy to GitHub Pages" run succeeded. Run the test suites that cover what
you change (one at a time, under two minutes each, or in the background)
and tell me plainly what you could not verify on real hardware. When I say
"wrap up", follow CLAUDE.md.
```
