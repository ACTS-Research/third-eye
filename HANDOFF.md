# Handoff

## 2026-11-12 (second session)

**Where things stand.** Everything planned is built, live on GitHub Pages
from `main`, and pairs and streams with a real iPhone (home Wi-Fi; and at a
coffee shop with the Mac on the iPhone's hotspot). This session added the
first real latency numbers, a dimmer, clickable alert strips and a fader
clean-up, and fixed a bug that blacked out the phone page. Next is making
the output window optional, which changes who owns the engine.

**Next step.** Build the optional output window, plan A in
[Plan: optional output window](#plan-optional-output-window) below, once
you have answered the three questions there. Start it in a fresh session
with the prompt at the end of this file.

**Decisions only you can make.**

- Approve plan A for the optional output window (or choose B), say whether
  a 1–3 second phone reconnect when the output opens or closes is
  acceptable, and whether a recording should stop at that switch or block
  it. Details in the plan below.
- Decide whether to allow a relay (TURN) fallback. The hotspot route works
  everywhere tried so far; only the Mac and the phone both on venue Wi-Fi
  fails, and that is the case a relay would cover. A relay costs latency and
  depends on someone's server.
- Decide whether to run your own pairing server instead of the public PeerJS
  one. The public one works; it comes with no guarantees.
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

**When you are next in the studio.** Measure real latency fullscreen on
the projector at 720p · 60 (so far only against the Mac's own screen: 200 ms
at 30 fps, 167 ms at 60), check the Latency line reads close to it, and move
the Dim strip with the phone paired to see the phone follow.

**Branch.** Work is on `main`, the default branch and the one that deploys.
Nothing is waiting to be merged; everything is pushed.

### This session, in short

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

### Plan: optional output window

**What the owner wants.** The app runs fully without an output window: the
phone streams and the preview is live. The output window is only for a
projector or second screen. When it is closed or drops, the status lights up
where it is; nothing stops and nothing covers the preview.

**Why it is not so today.** Everything live runs in `/output` (render loop,
phone link, MIDI, audio, vision, recorder, latency probe; `engine.js`).
`/control` only edits state and shows a ~10 fps readback (`preview.js`).
Closing the output drops the phone, and `perform.js` covers the monitor with
"Output window is closed".

**Plan A (recommended): the engine moves between windows.**

1. *One engine per browser.* Extend the existing `output-ping` / standby
   handshake (`src/output/main.js`) into claim / release: `/control` hosts
   an engine while no output claims it; an opening output claims it,
   `/control` shuts its engine down (`link.shutdown()` frees the room code)
   and confirms, then the output starts. When the output goes (`pagehide`,
   or status silent for ~2 s), `/control` starts its engine again after a
   grace period of about 1.5 s, so an output reload does not bounce it.
2. *Engine in `/control`.* `new Engine(canvas, store, localBus)` on the
   control page, sharing its `Store`. The engine talks over the bus
   (`status`, `sources`, `preview`, `midi-learned` out; `control-alive`,
   `midi`, `file`, `output` in) and BroadcastChannel never delivers to its
   own window, so give it a local loopback: UI → engine and engine → UI
   delivered in-page; do not loop store `op`s back (they would apply twice).
3. *Monitor.* With the engine in `/control`, render straight into the
   monitor canvas at full rate (one canvas; move it between Perform and Edit,
   or copy it); with the output hosting, keep the readback. Remove the full
   cover in `perform.js`.
4. *Status.* "Output: off" becomes a calm top-bar item with an Open action;
   it lights up only if an output in use drops unexpectedly. The status pills
   already work from `status` messages, wherever the engine runs.
5. *Moves with the engine:* recording (stops at a switch unless the owner
   wants switches blocked while recording), MIDI, audio (needs a click on the
   page that hosts it), vision, latency test (in `/control` it flashes the
   monitor). `engine.js` has no output-only code; fullscreen and the idle
   hint live in `src/output/main.js`.
6. *Tests.* Most suites open an output window. Run the key ones in both
   modes, and add: engine runs with no output; opening the output hands over
   (phone reconnects, state kept, only one engine, room code kept); closing
   it hands back; an output reload does not bounce.
7. *Docs.* README (diagram, Setup, Running a show, What happens when things
   go wrong) and the rules below: "`/output` owns everything live" becomes
   "whichever window hosts the engine owns everything live; the output hosts
   it when open".

**Cost of A:** at each switch the phone reconnects (about 1–3 s, needs the
pairing server), so open the output before the show. Once open, the output
renders on its own, so covering, minimising or reloading `/control` cannot
freeze the projector.

**Plan B (not recommended):** the engine always in `/control`, the output
window only mirrors it (like Resolume or VDMX). No reconnects, but Chrome
pauses drawing in a minimised or fully covered window (macOS especially),
so hiding `/control` mid-show would freeze the projector; reloading
`/control` would stop the show; mirroring adds about a frame.

**Not a rebuild.** Engine, effects, phone page, pairing and the control UI
work and are tested; only window ownership changes.

---

## For whoever picks this up

Read `README.md` for what the app does and how it is used. This section is
what the README does not say.

### Shape of the code

Three static pages built by Vite, no framework. About 8,600 lines in `src/`.

| Path | What lives there |
| --- | --- |
| `src/engine/` | Everything that runs in `/output`: the WebGL2 pipeline (`pipeline.js`), inputs, the host side of the phone link (`remote.js`), modulation, MIDI, audio, tempo, vision worker, recorder, latency probe. `engine.js` ties them together and owns the frame loop |
| `src/control/` | The operator's page. `main.js` mounts three screens: `perform.js`, `edit.js` (+ `chain.js`, `mod-panel.js`), and the Setup panels. `midi-map.js` is map mode; `status.js` owns the top-bar readouts and alerts |
| `src/phone/` | The iPhone page: `main.js`, `link.js` (reconnect watchdog), `sensors.js`, `camera-controls.js` |
| `src/shared/` | State and protocol used by more than one page: `state.js` (the state document and its sanitisers), `store.js` (op-based sync over BroadcastChannel), `presets.js`, `actions.js`, `keys.js`, `macros.js`, `net.js`, `sdp.js`, `sources.js`, `palette.js` + `theme.css` + `look.js` (palette and dimmer, kept in this browser's storage; `/output` forwards them to the phone) |
| `src/effects/` | One file per effect; `index.js` is the registry, `common.glsl.js` the shared GLSL |
| `src/sw.js` | Service worker template; `vite.config.js` fills in the file list |
| `scripts/` | `fetch-models.mjs` (MediaPipe models, run before dev and build), `session-screenshot.mjs` (the board screenshot) |
| `tests/` | Nine headless suites and `lib.mjs` |

### Rules that are easy to break

- **`/output` owns everything live** (until the optional-output plan above is
  built). Video, the phone connection, MIDI, audio and vision all run there.
  `/control` only edits state and shows what the output reports, so it can
  be reloaded mid-show.
- **State changes are ops.** Go through `store.dispatch` / `merge` /
  `patchItem` / `setScene`; both windows apply the same op. A new top-level
  state key needs a default in `defaultState()` and a line in
  `sanitizeState()`, or it is dropped on load.
- **A scene is what a preset stores**: `chain`, `mappings`, `lfos`, `macros`.
  Triggers (`actions`), tempo, network and device settings are global.
- **Nothing is ever drawn on the output** except the picture (and the idle
  hint before fullscreen). Status goes to `/control`.
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
  timing-dependent and occasionally fails; it passes on a rerun.

### Never run on real hardware (all unconfirmed)

Measure real latency against a projector (only the Mac's own screen so
far, H.264 only); whether H.264 beats VP8 / VP9; the corrected Latency
estimate and the stray-flash note on the result line; the dimmer on the
iPhone, live and from the QR link; Reload both pages after a real deploy;
recordings longer than a few seconds; MIDI map with a physical controller;
fullscreen placement on a second display; MediaPipe on the Mac's GPU; the
direction of Rotate / Counter-rotate. Tap tempo, offline reload, and the
phone's sensors and touch controls have not been reported on either way.

### Ideas raised and not started

Optional output window (planned above); relay fallback; own pairing
server; a cue list beyond per-preset fade and order; tempo from the audio
beat; a native wrapper for a true Syphon output; a MIDI mapping for the
dimmer.

### Prompt to start a new session

```
You are picking up Third Eye Cam (repo ACTS-Research/third-eye, branch main).
Read CLAUDE.md, then HANDOFF.md, then README.md before doing anything; the
handoff says where things stand, the rules that are easy to break, how to
work in the cloud sandbox, and the plan for this session.

This session: make the output window optional, following "Plan: optional
output window" in HANDOFF.md. My answers to its questions:
- Plan: A (the engine moves between windows)   <- or B
- A 1-3 s phone reconnect when the output opens or closes: OK   <- or not
- A recording in progress at a switch: stop it   <- or block the switch

Before writing code, read src/engine/engine.js, src/output/main.js,
src/control/main.js, src/control/perform.js, src/control/preview.js and
src/shared/store.js and src/shared/bus.js, then tell me in a few lines how
you will do it and what will change for me, and wait for my go.

Work on main and push to main. After each push, check that the "Build and
deploy to GitHub Pages" run succeeded. Run the test suites that cover what
you change (one at a time, under two minutes each, or in the background)
and tell me plainly what you could not verify on real hardware. When I say
"wrap up", follow CLAUDE.md.
```
