# Handoff

## 2026-11-16 (fourth session)

**Where things stand.** Input B and the Mix B effect are built and live from
`main`: a second input, mixed in by an effect in the chain, with a mix bar
and two small live views under the picture on the perform screen. It has
only been run in headless Chromium. Most of what was built after 13 November
is in the same position.

**Next step.** On the real Mac, with every page reloaded: choose the Mac
camera for B under the picture (or Shift + 2), add Mix B to a preset under
Edit, and drag the bar. Then go down "Built since 13 November, not yet tried
on real hardware" below.

**Decisions only you can make.**

- Say whether the Mix B modes should be a grid of buttons, as in the mock-up.
  They are a menu for now, like every other effect's choices.
- Say when to start the second iPhone as input B (stage 2), and whether
  "an image as a control signal" comes before or after it. You have said
  both phones should control, and yes to the control signal.
- Picture controls on the Mac (brightness, contrast, saturation and so on):
  say whether they belong to each preset (the Contrast / Brightness effect
  already does that) or should be one fixed set that holds across presets.
- Board cover: send a screenshot of the real app to make the current one, or
  say to use the session capture.
- Recording: MP4 is now the default, but your Mac remembers WebM from
  before. Choose MP4 once in Setup → Recordings.
- Say whether the phone's Quality menu should be restyled. It is the
  iPhone's own picker, first in the phone's Camera settings panel.
- Say whether the browser-tab icon is good enough. You kept D2 (the camera);
  bolder alternatives T1 to T7 are on the icon sheet.
- Tick **hold** again on any trigger that had it: settings saved before 13
  November are no longer read.

**Settled on 16 November.** The sideways preview is fixed. Preview: Mac
output is fine as it is (normal pairing only; no work for a phone paired
without internet). Running order: on hold, including named running orders.
Name stays Third Eye Cam; 1280×720 stays. No server of your own: you got
pairing working without it (route not said). Old presets can be abandoned.
Mixing: option C (an effect, with its bar under the picture) and C1 (the
small views choose the inputs, their lists opening downward).

**Built since 13 November, not yet tried on real hardware.**

- Phone: Freeze as a switch; the six buttons following a running order of
  more than six steps; Preview: Mac output; torch and W-lock dimmed on the
  front camera; Scan code reading the Mac's ordinary QR code.
- Mac, perform screen: the running order (+ on a tile, the switch, Next and
  Prev, Return after going off the list, notes and fades); the input line
  under the input buttons; input button 4 opening the file picker; the
  pairing pop-over closing once paired.
- Mac, edit screen: seen by the owner on 15 November (Modulation and LFOs
  tabs); everything on it since then is unseen, namely the LFOs tab, shape
  pictures, note-value tempo sync, and dragging effects to reorder.
- Mac, Setup: the app's own menus and bars.
- Mac, input B and Mix B (16 November): all of it. Two real pictures mixed,
  the iPhone as A or B, 60 fps with two live videos, the small views.

**When you are next in the studio.** Open the output window before the
show, then: measure real latency fullscreen on the projector at 720p · 60 (so
far only against the Mac's own screen: 200 ms at 30 fps, 167 ms at 60), check
the Latency line reads close to it, move the Dim strip with the phone paired
to see the phone follow, and cover or minimise the output window for a few
seconds to see `/control` say it is not drawing (it must not take the picture
over). Try making a closed network on the Mac (README, Pairing without
internet) and pairing by code on it.

**Branch.** Work is on `main`, the default branch and the one that deploys.
Nothing is waiting to be merged; everything is pushed. `main` is the only
branch on GitHub (checked 16 November). A cloud session starts on a
temporary local branch: switch to `main` (`git checkout -B main
origin/main`) before committing, and push `main` only.

**Mock-ups.** Input B and mixing: https://claude.ai/artifact/4yrzjrjTVfZ4qgMexUNNn3
(C and C1 were built). Running order: https://claude.ai/artifact/SiD1F7P89JLwXeC31BKhz4
(A, the strip, was built). Edit screen, slider styles and tempo sync:
https://claude.ai/artifact/UEbbvKGUHsQo7CxCWFUVDT (C, the Bar, and Notes were
built). Icons: https://claude.ai/artifact/PTAr6DCd26vjPQTYy43Nmo. All private
to the owner; their sources are in `design/` (see `design/README.md`).

**What is backed up, and what is not.** The code, tests, docs, screenshots
and mock-up sources are all on GitHub in `main`. Your presets, running order
and recordings are not: they live in your browser on the Mac. Export presets
from Setup; save recordings to disk from Setup → Recordings.

### Seen on the real iPhone and Mac this session

- Normal pairing and streaming with the Mac on the iPhone's hotspot (the
  phone on cellular): works.
- University Wi-Fi: the Mac could not reach the public pairing server.
- The owner reported "it works" after Pair without internet shipped, with
  the phone live; which route was used was not said.
- The rebuilt phone screen draws correctly in Safari, the Mac's preset names
  and trigger labels arrive, and the iPhone's camera offers zoom, torch and a
  white-balance lock.
- The screen wake lock was refused on the owner's iPhone (the message
  appeared; the battery was low, so Low Power Mode is a guess).
- The first rebuild's sideways picture was rejected (see below). Freeze from
  the phone was reported not working twice; the fix that followed (every tap
  its own press) is not yet confirmed.
- 14 November: on the hotspot (phone on 5G) the upright phone screen showed
  its six presets, triggers, icons and zoom bar; the preview showed the
  Mac's screen on its side, cause not yet known (see the first decision).
- 14 November: after the reconnect changes the owner said reconnecting
  "works better", and later that pairing "seems to work fine".
- 15 November: the owner used the rebuilt edit screen on the Mac (in a blue
  palette) and asked for the LFOs tab and picture buttons that followed.
- The iPhone's camera offers a web page no exposure or focus controls (the
  settings panel was empty apart from Quality and Camera).

### This session, in short

- **Optional output window.** The engine moves between windows; `/control`
  hosts it when no output is open. Details below.
- **Pair without internet.** QR code both ways, no server; the picture moves
  between windows without a new scan. jsQR added with the owner's approval.
- **The phone's live screen.** Rebuilt twice in one evening; what stands is
  below.
- **Top bar.** Each readout is a button with its own job: output opens the
  output window, phone shows pairing. The input readout was taken out on 14
  November at the owner's suggestion (it repeated the input buttons); the
  input's state is now the line under those buttons on the perform screen,
  and a click on it goes to Setup → Input.
- **Icon.** Option D2 (a compact camera with an upright eye), eye a little
  right of centre; `scripts/make-icons.mjs` draws it. The sheet with all
  three rounds is in `design/third-eye-icons.html` and at
  https://claude.ai/artifact/PTAr6DCd26vjPQTYy43Nmo (private to the owner).
- **Fixed on the way:** a video call left open on the Mac when the phone link
  was shut down (PeerJS skips connections on destroy); two quick taps on a
  trigger read as one press.
- **Two mistakes worth knowing about.** A function was deleted with a
  scripted edit and went live for about fifteen minutes because only four
  suites had finished; and a rename the owner had stopped was pushed because
  it was sitting uncommitted. Both are now rules under "Working in the cloud
  sandbox".
- **Running order** (14 November). Steps that point at presets, on the
  preset strip; the phone's six buttons follow it.
- **Reconnecting** (14 November). The phone's scanner reads either code, the
  phone notices a silent Mac, the Mac keeps its room code for 75 seconds.
- **Preview: Mac output** on the phone (14 November), normal pairing only.
- **Edit screen rebuilt** (15 November) as mock-up C with the app's own
  sliders, menus and picture buttons; Tweakpane removed; Setup followed.
- **Small things:** the pairing pop-over closes once paired; modulation
  meters say what they move; input button 4 opens the file picker; the
  person mask no longer flickers on a slow machine.
- **The cloud sandbox got slower during the session** and several suites
  began failing on timing alone. Each was traced before being touched: the
  stand-in camera, the smoke test's clip, and four checks that sampled once
  now wait for the state they test. None was skipped or loosened in what it
  checks. If a suite fails, run it again alone before believing it, and
  compare against the previous commit before blaming a change.
- **Suites added:** `handover`, `standalone`, `offline-pair`,
  `offline-pair-online`, `offline-handover`, `phone-screen`, `running-order`,
  `reconnect`, `output-preview`, `edit-screen`.

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

### The phone's live screen (rebuilt 2026-11-13)

Twice. The first attempt kept the screen horizontal by drawing it on its
side when the phone was upright and laid upright camera frames on their side
on the Mac. The owner rejected that on the iPhone: the picture must stay the
right way up. What stands now:

- **Two real layouts**, chosen by how the page is turned (`#root.upright`,
  set in `layout()` in `src/phone/main.js`; the rest is `phone.css`). Nothing
  on the live screen is drawn turned.
- **The picture is always horizontal and the world always upright.** Upright
  camera frames are not turned: the Mac's Fill takes their middle band and
  the preview (`object-fit: cover` in a 16:9 box) shows the same band. Do not
  bring back turning frames to "use the whole sensor".
- **Rotate is the only turn**: quarter turns of the picture, sent as `P.TURN`
  and applied in the source shader (`uTurn`); vision sees the turned picture.
  `P.SCREEN` carries which way is up in the picture as shown, for roll.
- **The preview is the XY pad.** Six preset buttons come from the Mac
  (`presets` message; `preset` back); no banks, no scrolling. Triggers bound
  to previous / next preset are hidden while the presets are shown.
- **Every tap is its own press** (`queued` / `shown` in
  `src/engine/phone-sensors.js`): two taps that reach the engine between two
  frames used to read as one long press, so the second tap on Freeze did
  nothing. Keep that if you touch the trigger path.
- **Trigger "hold" is stored as `hold`**, not `momentary` as before
  2026-11-13. The old name is ignored on purpose, so no stored session and no
  stale window can bring the old default (Freeze on hold) back.
- **Sliders are the `fader`** in `src/phone/widgets.js`; zoom is a bare one.
  Flip, torch and the white-balance lock are icon buttons under the presets.
- **Messages lie over the status line** for a few seconds (`setNote`); they
  must never take room from the preview.
- **The phone asks for its state** (`hello`) when its link opens; the Mac
  answers with labels, presets, codec and palette (`greetPhone`).
- **Reconnect** redials (`HostLink.restart`). It reads **Scan code** for a
  phone paired by code, or when the pairing server says nothing is
  registered under the room (`state.notFound`), and then reads a code on the
  Mac inside the page (jsQR, loaded on demand): the Pair-without-internet
  offer, or the ordinary pairing link (`joinRoom` → `HostLink.setRoom`).
- **The phone does not trust the browser about a dead link** (added 14
  November after the owner kept having to close the page and scan again;
  which failure they hit is not known). `HostLink.tick` counts silence: the
  Mac answers a ping a second, and ten seconds with nothing heard (six at first; raised on 15 November after
  a busy Mac page was seen to trip it in a test) drops the
  link and starts signaling over too. Two data connections in a row that
  never open also restart signaling. Time the page spent asleep is not
  counted (`awake`, and the gap check at the top of `tick`). A direct link is
  only dropped for silence when the pairing server can be reached.
- **`tests/offline-pair.mjs` and slow machines.** From 14 November the
  check "a code read twenty seconds later still pairs" failed about one run
  in two in the cloud sandbox. Traced: once the phone's code reaches the
  Mac's reader the app pairs in about 0.3 s every time; what crawls is the
  sandbox (the Mac page's draw loop at 0 to 6 frames a second while it reads
  a camera, decodes video and draws with software graphics), and the test's
  stand-in camera, which left to itself can go half a minute without
  delivering a frame. The stand-in camera (`fakeCamera` in `lib.mjs`) now
  pushes its frames from a worker's clock, and that one check waits up to a
  minute. Not settled: the suite passed 4 runs in 4 on the code from before
  the reconnect change and failed about half the time after it, and no
  cause was found in the code. If Pair without internet feels slower on the
  real phone and Mac than it did, start there.
- **`tests/vision.mjs` and slow machines.** A person mask is fresh for 1.5 s
  (`MASK_FRESH_MS`); in the cloud sandbox a segmentation pass takes about a
  second on the CPU and sometimes longer, so a picture read at the wrong
  moment has no mask. The mask test now reads a picture drawn just after a
  mask arrived. It failed two runs in three before that, on older code too.
- **The phone's preview can show the Mac's output** (14 November; a setting
  in the phone's camera panel, off by default). `engine/return-feed.js`
  copies the finished frame to a 480-wide canvas about 15 times a second,
  only while a phone has asked (`{ t: 'preview', on }`); `PhoneLink.acceptCall`
  answers the phone's call with that canvas's stream, so nothing new is
  negotiated. On the phone `HostLink.remote` is that stream and
  `syncPreview` in `main.js` decides what the preview shows. Not done: a
  phone paired without internet (the direct handshake is receive-only on the
  Mac's side; its codes would have to change), and a phone with its camera
  off (PeerJS will not make a call without a stream to send).
- **The Mac holds on to its room code for 75 seconds** when it reads as
  taken (`ROOM_TAKEN_MS` in `remote.js`), because a registration left by a
  reload clears within a minute and a new code strands the phone.

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

### The name

The app is called **Third Eye Cam**. A rename to "3rdEyeCam" was started on
2026-11-13 and the owner stopped it ("leave it as it was for now"). Do not
rename anything unless asked.

### Shape of the code

Three static pages built by Vite, no framework.

| Path | What lives there |
| --- | --- |
| `src/engine/` | Everything live: the WebGL2 pipeline (`pipeline.js`), inputs, the host side of the phone link (`remote.js`), the small copy of the output sent back to the phone (`return-feed.js`), modulation, MIDI, audio, tempo, vision worker, recorder, latency probe. `engine.js` ties them together and owns the frame loop. It runs in `/output` while an output window is open, otherwise in `/control` |
| `src/control/` | The operator's page. `main.js` mounts three screens: `perform.js` (+ `strip.js`, the strip of presets and the running order), `edit.js` (+ `chain.js` the chain row and Parameters tab, `mod-panel.js` the Modulation tab, `controls.js` the app's own bar slider, menu, switch and row of picture buttons), and the Setup panels. `host.js` decides which window hosts the engine and owns the monitor canvas. `midi-map.js` is map mode; `status.js` owns the top-bar readouts and alerts |
| `src/phone/` | The iPhone page: `main.js`, `link.js` (reconnect watchdog, direct links), `sensors.js` (motion, the XY pad, triggers, presets), `camera-controls.js`, `orient.js` (page angle, the Rotate turn), `widgets.js` (the fader) |
| `src/shared/` | State and protocol used by more than one page: `state.js` (the state document and its sanitisers), `store.js` (op-based sync over BroadcastChannel), `presets.js` (presets, each with a permanent id, and the running order: `loadOrder`, `orderView`, `applyStep`, `stepShow`), `actions.js`, `keys.js`, `macros.js`, `net.js`, `sdp.js`, `direct.js` (pairing with no server), `qr.js`, `sources.js`, `palette.js` + `theme.css` + `look.js` (palette and dimmer, kept in this browser's storage; the engine forwards them to the phone) |
| `src/effects/` | One file per effect; `index.js` is the registry, `common.glsl.js` the shared GLSL |
| `src/sw.js` | Service worker template; `vite.config.js` fills in the file list |
| `scripts/` | `fetch-models.mjs` (MediaPipe models, run before dev and build), `session-screenshot.mjs` (the board screenshot), `make-icons.mjs` (the tab and Home Screen icon, option D2 from the sheet at https://claude.ai/artifact/PTAr6DCd26vjPQTYy43Nmo) |
| `design/` | Mock-ups shown to the owner, not part of the site: `third-eye-icons.html`, `running-order/`, `edit-screen/`, `mix/`. `design/README.md` says which option of each was built |
| `tests/` | Twenty headless suites and `lib.mjs` |

### Rules that are easy to break

- **No `<select>`, no plain `<input type=range>` and no third-party controls
  anywhere on `/control`.** (The phone page keeps its one system menu.) Sliders
  are `bar()` and menus are `menu()` from `src/control/controls.js` (Tweakpane
  was removed on 15 November). A `menu()` list is appended to `<body>` and
  must stop key events itself: the page's shortcuts (arrows step presets,
  Space freezes) listen on `window`. It follows its button on scroll instead
  of closing, because clicking a half-hidden button scrolls it into view
  first. `choice()` is a row of picture buttons (LFO shape, tempo sync).
  One trap: `.panel button.grow` is styled tall for big wrapped buttons, so a
  `menu()` given `grow` needs the `.panel button.menu.grow` override.
- **A step of the running order points at a preset by id, never by place.**
  Presets are still addressed by index everywhere else (`presetIndex`,
  `preset:3`), so anything that creates a preset must give it an id
  (`snapshotPreset` does; `loadPresets` mints and saves ids for old data).
  Where the order is at lives in the shared state (`order: { cue, off }`),
  not in `/control`, because the engine steps it with `/control` closed. A
  `scene` op with `cue` moves the order; one with `offList` (a preset loaded
  by hand, via `applyPreset`) leaves it where it was and marks it off.
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
- **A stop hook asks for anything uncommitted to be committed and pushed.**
  Before obeying, be sure you know where every change came from: run
  `git status` at the start of a turn, and if a change is not yours and not
  asked for in the conversation you can see, ask the owner instead of
  pushing. Every push is live.
- **Run all the suites before a push that touches `engine.js`, `remote.js`,
  `host.js` or the phone's `link.js`**, not only the ones that seem related.
  After removing code with a scripted edit, search for callers of everything
  it removed.
- **This Chromium has no MIDI backend** (`requestMIDIAccess` never settles);
  the MIDI test stubs a device.
- Deleting a remote branch and changing repository settings are not possible
  from the cloud session.

### Things outside this repo

- The three design directions the redesign came from are on a design canvas:
  https://claude.ai/artifact/4bRZEX1Xp89CPKQF79ozx6 (private to the owner).
  Direction C, "Darkroom", was chosen. Its source is not in the repo.
- The later mock-ups (icons, running order, edit screen) are on claude.ai
  too, with their sources in `design/`; `design/README.md` has the links.
- Presets and recordings live in the owner's browser storage. Nothing here
  backs them up.

### Known rough edges

- Several alerts at once stack over the top of the page; they are compact
  and each can be closed with its ×.
- Below about 1000 px wide the top bar is tight: the phone readout is cut
  short before anything else gives way.
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

- **The phone's screen as it now stands:** the upright layout, the preview's
  band matching the Mac's, Freeze with quick taps, Rotate, the three camera
  icons, messages over the status line.
- **Pair without internet, every step:** Safari answering the offer, the
  Mac's real camera reading the phone's real screen, the rebuilt answer
  being accepted between Chrome and Safari, a Mac-made network carrying it,
  the phone following the picture between windows, scanning the Mac's code
  from inside the phone page. Whether iOS still has the phone page saved
  after a week.
- **No output window:** the monitor holding 60 fps; the phone reconnecting
  when the output opens or closes, and how long it takes; a covered or
  minimised output being reported as not drawing; audio, MIDI and recording
  on `/control`.
- **From earlier sessions:** real latency against a projector (only the
  Mac's own screen so far, H.264 only); whether H.264 beats VP8 / VP9; the
  corrected Latency estimate and the stray-flash note; the dimmer on the
  iPhone; Reload both pages after a real deploy; recordings longer than a
  few seconds; MIDI map with a physical controller; fullscreen placement on
  a second display; MediaPipe on the Mac's GPU; the direction of Rotate /
  Counter-rotate. Tap tempo and offline reload have not been reported on
  either way.

### Ideas raised and not started

Own pairing server plus a relay on port 443 (not needed, 16 November);
a local program on the Mac that serves the pages and the pairing itself
(option B when Pair without internet was chosen); several named running
orders, and steps timed against an audio track (on hold); the Mac-output
preview on a phone paired without internet or with its camera off (not
wanted, 16 November); a brightness control
on the Mac side; a larger XY pad in place of the phone's six buttons (the
owner chose to leave the pad on the preview); tempo from the audio beat; a
native wrapper for a true Syphon output; a MIDI mapping for the dimmer.

### Input B and Mix B (built 2026-11-16)

Stage 1 of the advice on blending inputs. Stage 2 (a second iPhone) and "an
image as a control signal" are not started; see the end of this section.

- **Two slots, one set of feeds.** `InputManager` (`src/engine/inputs.js`) is
  input A itself and has `b`, a second `Slot` with its own texture. State:
  `input.kind` and `input.kindB` (`''` = off). The two are never the same
  source, because a feed's "new frame" flag is taken by whichever slot
  uploads it: the `input` and `inputB` actions make A and B trade places
  instead (`src/shared/actions.js`). Change inputs through those actions,
  never with `store.merge('input', { kind })`.
- **B is drawn only while it is on** (`Pipeline.updateSource(…, true)` into
  `srcB`), fitted and mirrored like A. Vision, the latency estimate and the
  top-bar readouts still watch A only.
- **Mix B is an ordinary effect** (`src/effects/mixb.js`) with
  `uses: { inputB: true }`: it gets `uTexB`, and the runner skips it while B
  has no picture, so A passes through. Its mix is the effect's own wet / dry
  (`mixLabel` renames the slider), which is why pinning, mapping, presets
  and Apply to all work with no new code.
- **The row under the picture** (`perform.js`, "inputs and the mix"): the
  bar moves the `mix` of the preset's first Mix B that is not bypassed. The
  small views are one 192×54 strip (A left, B right) the engine reads back
  about five times a second and sends as `thumbs` on the bus, so they work
  in both hosting modes. `Readback` in `pipeline.js` is the shared
  non-blocking readback (the monitor image uses it too).
- **The input lists open downward** (`menu({ down: true })`), over the
  preset strip, never over the picture: the owner asked for that. Their
  choices carry `data-midi`, so MIDI map mode picks them from the open list.
- **Not done:** the Mix B modes as a grid of buttons (the mock-up drew one;
  they are a menu); a hatched "moved by modulation" band on the bar; a
  second video file.

Still to come, as advised:

- **A second iPhone as input B.** Today a second phone that pairs takes over
  from the first (`acceptCall` / `acceptData` in `remote.js` replace the
  link). `PhoneLink` would hold two links; first to pair is A, the next B;
  both ways of pairing; both phones carried when the engine moves between
  windows; phone B's sensors as their own modulation sources (the owner
  wants both phones to control). Touches engine, remote, host and link. Two
  720p60 streams are about 10 Mbit/s; on the iPhone hotspot phone B's video
  goes through phone A's radio.
- **An image as a control signal** (the owner said yes): B's brightness or
  motion, whole or by region, as modulation sources.

### Prompt to start a new session

Paste this as the first message, with the last paragraph filled in.

```
You are picking up Third Eye Cam (repo ACTS-Research/third-eye, branch main):
a live video instrument that runs in the browser. An iPhone's camera streams
over WebRTC into a WebGL2 effects chain on a Mac, which shows the result on
its own page or on a second display.

Read CLAUDE.md, then HANDOFF.md, then README.md before doing anything. The
handoff says where things stand, what has not yet been tried on the real
iPhone and Mac, the decisions that are mine to make, the rules that are easy
to break, and how to work in the cloud sandbox (it is slow: read that part
before trusting or distrusting a failing test).

How I work:
- Before writing code, tell me in a few lines how you will do it and what
  will change for me, and wait for my go. A small change I have asked for
  outright can simply be done.
- For anything that changes how a screen looks or works, show me mock-ups
  first (two or three options on a design canvas) and let me choose.
- Work on main and push to main. After each push, check that the "Build and
  deploy to GitHub Pages" run succeeded.
- Run the test suites that cover what you change (one at a time, under two
  minutes each, or in the background), and all of them before a push that
  touches engine.js, remote.js, host.js or the phone's link.js.
- Tell me plainly what you could not verify on real hardware. You cannot
  reach the deployed site, the public pairing server or my devices.
- Write to me in plain language, short, with what I need to do or decide
  first.
- When I say "wrap up", follow CLAUDE.md.

Start by telling me, in a few lines, where things stand and what is waiting
on me (from the top of HANDOFF.md). Then:

This session: <say what you want built or fixed. Ideas already raised are
under "Ideas raised and not started" in HANDOFF.md: several named running
orders, steps timed to an audio track, the Mac-output preview on a phone
paired without internet, a brightness control on the Mac, a pairing server
of my own for the university Wi-Fi.>
```
