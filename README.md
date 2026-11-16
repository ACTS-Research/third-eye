# Third Eye Cam

A live video instrument. An iPhone streams its camera over WebRTC to a Mac
running Chrome, where a WebGL2 effects chain processes it. The picture shows
on the control page itself, and, when you open the output window, fullscreen
on a second display (projector or TV). The phone is also the controller: its
motion sensors, an XY pad and four trigger buttons modulate the effects.

Built for live performance: once the output window is open it keeps rendering
whatever else fails, and every failure is reported on the operator's screen
only.

```
 iPhone Safari (/phone)                     Mac Chrome
 ┌──────────────────────┐    WebRTC     ┌──────────────────────────────┐
 │ camera ──────────────┼──── video ───▶│ the engine                   │
 │ tilt, shake, XY pad, │               │   input → effects → picture  │
 │ triggers ────────────┼─ data 60 Hz ─▶│                              │
 └──────────────────────┘               │ runs in /output while an     │
                                        │ output window is open        │
                                        │   (second display)           │
                                        │        ▲ BroadcastChannel    │
                                        │ otherwise in /control        │
                                        │   (laptop screen: chain,     │
                                        │   mappings, presets, monitor)│
                                        └──────────────────────────────┘
```

One engine runs per browser. It does everything live: the render loop, the
phone link, MIDI, audio, vision and recording. With no output window it runs
in `/control` and the monitor there is the picture. Opening the output window
moves it there; closing that window moves it back.

## Contents

- [Setup](#setup)
- [Running a show](#running-a-show)
- [Pairing the phone](#pairing-the-phone)
- [Pairing without internet](#pairing-without-internet)
- [Show networking](#show-networking)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Inputs](#inputs)
- [Effects](#effects)
- [Modulation, triggers and presets](#modulation-triggers-and-presets)
- [MIDI, audio and vision](#midi-audio-and-vision)
- [What happens when things go wrong](#what-happens-when-things-go-wrong)
- [Writing your own shader](#writing-your-own-shader)
- [Recording](#recording)
- [Latency](#latency)
- [Sending the output to other software](#sending-the-output-to-other-software-syphon-ndi)
- [Icon](#icon)
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
| **Perform** | The show: panic buttons, the monitor, the inputs and the mix bar under it, eight faders for the live preset, and the strip of presets and the running order |
| **Edit** | One preset. At the left the picture, with the effects chain as a row of buttons under it and the faders as the perform screen will show them. At the right four tabs: **Parameters** (the open effect's controls), **Faders**, **Modulation** and **LFOs** |
| **Setup** | Everything done once beforehand: output window, inputs, pairing, MIDI, audio, vision, triggers, preset files |

1. On the Mac open `/control` in Chrome. That is enough to play: the picture
   runs on the page and the monitor on the Perform screen shows it live. The
   top bar reads `Output off`.
2. Pair the phone ([below](#pairing-the-phone)) and press `1` to select it.
3. Click a preset on the strip, or **Edit** one.
4. For a projector or second screen, open the output window: click `Output
   off` in the top bar, or **Setup → Output → Open output window**. Under
   **Setup → Output**, **Find displays** lets you pick the projector first, so
   the window opens on it. Click the window once (or press `F`) to go
   fullscreen. Without the permission, drag the window to the projector
   yourself and press `F`.

**Open the output window before the show, not during it.** Opening or closing
it moves the picture between the two windows: the phone reconnects by itself
in a few seconds (it needs the pairing server for that), and a recording in
progress stops.

The two readouts at the top left are also buttons, each with its own job:
the output readout opens the output window, and the phone readout shows the
QR code and the connection steps. Under the picture on the perform screen
is one slim strip: a small live view of input A, the mix bar, a small live
view of input B, and the mode of the mix (see [Inputs](#inputs)). Point at a
view and a line above the strip says which source it is and what it is doing
(`A · iPhone · live`, `B · off`), and its four source icons slide out beside
it: iPhone, local camera, test pattern, video file. Point at an icon to see
that source in the small view without choosing it (a source that is not
running shows its name instead); click to choose it. B's lit icon turns B
off. Choosing **Video file** with no file loaded opens the file picker
straight away (the same picker as **Setup → Input → Load video file…**).
Everything that pops up from the strip opens upward, over the picture, for
that moment only; none of it is ever on the output or in a recording.

The coloured dot at the top right opens the interface palettes (red, amber,
bone, lime, ice, magenta). All are a single ink on black so the laptop does
not light the stage. The **Dim** strip under them turns the whole page down,
from full to a quarter of the light: drag it, use the arrow keys, or
double-click for full. The phone opens in the same palette and dimmer, and
follows any change while it is paired.

The output window shows only the picture. A small "click for fullscreen" hint
appears while it is windowed and fades after four seconds; nothing is ever
drawn over the picture in fullscreen.

While the output window is open, `/control` is only a remote control. You
can reload or even close it during a show; `/output` keeps running with the
current state and a reopened `/control` picks that state up. If `/output`
itself is reloaded it restores the last state from local storage and the phone
reconnects by itself; `/control` waits for it rather than taking the picture
over in between.

With no output window, `/control` is the show: reloading it restarts the
picture and the phone reconnects, and a `/control` tab that is minimised or
hidden behind another tab stops drawing.

Keep the output window visible. Chrome stops drawing windows that are
minimised or completely covered; `/control` then says the output is not
drawing.

Two `/control` tabs can be open at once. Only one hosts the picture; the
other shows a small copy of it.

## Pairing the phone

1. **Setup → Phone** on `/control` shows a QR code and a five-character room
   code. (So does a click on the phone status in the top bar.) The output
   window does not need to be open.
2. Point the iPhone's camera app at the QR code and open the link in Safari,
   or open `/phone` by hand and type the room code.
3. Tap **START**. iOS asks for the camera, then for motion and orientation
   access. Allow both.
4. The phone shows `LIVE — streaming to Mac`; `/control` shows
   `Phone: streaming`.

If it does not get that far, click the phone status in the top bar of
`/control`. (Opened to pair a phone, the pop-over closes by itself a moment
after the phone has paired; opened with a phone already paired, it stays.)
The pop-over shows the QR code and room code again, and lists the
connection as five steps (picture running, pairing server reached, phone
found, video link, picture arriving) with the one it is stuck at marked. It also has
**Restart output** and **New room code**.

The picture the Mac shows is always horizontal, and so is the preview on the
phone. The page lays itself out for how the phone is held:

- **On its side:** the preview on the left, as large as it will go; beside it
  the triggers, six presets and three camera icons; zoom down the right edge.
- **Upright:** the preview across the top; under it the six presets (1 2 / 3 4
  / 5 6) with the camera icons, the triggers stacked beside them, and zoom on
  the right.

Held upright, the iPhone's camera frames are upright too. Nothing is laid on
its side: the Mac fills its horizontal picture from the middle band of the
frame (with **Fill**, the default under Setup → Input), the world stays the
right way up, and the preview shows that same band. Hold the phone on its side
to use the whole sensor.

| On the screen | What it does |
| --- | --- |
| The preview | The picture the Mac shows. It is also the XY pad: a finger on the picture moves the dot, giving two modulation sources plus "pad touched" |
| Triggers | Labelled with whatever action they are bound to. **Freeze** is a switch, as on the control page: tap to freeze, tap again to release, and the button stays lit meanwhile. A trigger bound to previous or next preset is left out: the preset buttons do that job |
| The six buttons | With a running order on the Mac, its steps: the live one lit, the one Next would load dashed. A show of more than six steps moves through the buttons as it goes: they show the step before the live one, the live one (second button) and the four after it, each with its own step number, so the next step is always the third button. Without a running order, the first six presets, the live one lit; later presets are loaded from the Mac. Tap to load one |
| The three icons | Flip between the front and rear camera; torch; lock the white balance. Torch and the lock are dimmed when the camera in use does not offer them (the front camera has no torch), so the row never changes shape |
| Zoom | The bare bar down the right, when the camera offers zoom |
| Rotate (the circling arrow, top right) | Turns the picture a quarter turn, on the Mac and in the preview, each time it is pressed |
| Camera (top right) | Opens the settings panel: Quality (360p / 720p / 1080p at 30 or 60 fps, default 720p · 60), Camera on / off, **Preview: camera / Mac output**, any exposure and focus controls the camera reports (an iPhone in Safari reports none, and the panel says so), and **Scan the Mac's code** |
| Preview: Mac output | The preview shows the Mac's finished picture instead of the camera: effects, Freeze and Blackout as the audience sees them. The Mac sends it back small (480 pixels wide, 15 pictures a second, at most 500 kbit/s) on the video call the phone already has, and only while a phone asks for it. It runs a moment behind the camera, because the picture has been to the Mac and back. It needs the camera on, and is not available on a phone paired without internet; the preview then shows the camera and the panel says why. The setting is remembered |
| **Reconnect** | Appears in the top line whenever the link is down. It redials. It reads **Scan code** instead when the phone was paired by code, or when no Mac is found under the phone's room code (the code may have changed): it then reads a code on the Mac's screen through the camera, without leaving the page. Either code works: the ordinary pairing code (click **Phone** in the Mac's top bar) or the one from Pair without internet. While it is reading, the instruction lies along the foot of the preview and the status line stays readable; it stops by itself if the link comes back |
| By itself | The phone redials whenever the link drops, and also when the Mac has said nothing for ten seconds, whatever the browser reports about the connection. After a Mac reload it is back in a few seconds with no tap |

A message (a camera that refused a setting, a screen that will not stay awake)
lies over the top line for a few seconds and goes; it never takes room from
the preview. Tap it to dismiss it sooner.

Camera off means controller only: sensors and touch keep working and the
output holds the last frame.

**Coming back.** The phone remembers the last room it joined, so opening
the phone page again (from a bookmark, or the Home Screen) fills the room
code in; tap START. There is no need to scan the QR code again unless the
room code has changed.

Tick **Controller only** before START to join without ever opening the camera.

Keep Safari in front. iOS stops the camera when the page goes to the
background; when it comes back the phone shows a full-screen red warning and
restarts the stream, and `/control` shows an alert for as long as the page is
hidden. The page requests a screen wake lock; if that fails it says so, and
you should set Auto-Lock to Never.

## Pairing without internet

Normal pairing sends a small handshake through a pairing server on the
internet. When that server cannot be reached (no signal, a network that
blocks it), pair by QR code in both directions instead. Nothing leaves the
room; the phone and the Mac only have to be on the same local network.

1. Put both on one network. The easiest is the iPhone's Personal Hotspot,
   joined from the Mac. Leave mobile data on: turning it off switches the
   hotspot off too. The hotspot only has to exist; it does not matter how
   weak the signal is. The alternative is a closed network made by the Mac
   (see below). The same hint is on the **How?** tooltip in the dialog.
2. On `/control`, click **Pair without internet** (under the QR code in
   **Setup → Phone**, or in the pop-over behind the phone readout). The Mac's
   camera switches on; allow it the first time.
3. Scan the large code with the iPhone's camera, open the link and tap
   **START**. The phone now shows a code of its own.
4. Hold the phone up to the camera above the Mac's screen until it is read.
   The dialog closes by itself and the phone shows `LIVE`.

This works whether or not the internet is there, so it can be tried on a
working hotspot. A phone opened from this code waits for the Mac to read its
code even if the pairing server happens to be reachable; **Hide the code** on
the phone gives up and lets normal pairing take over.

After that everything is the same as with normal pairing, including opening
and closing the output window: the window that has the phone introduces the
other one to it, so no code is scanned again.

**A closed network from the Mac.** Apple removed "Create Network…" from the
Wi-Fi menu; Internet Sharing is what is left, and despite its name it can
make a Wi-Fi network with no internet behind it:

1. **System Settings → General → Sharing → Internet Sharing** (click the ⓘ).
2. Set **Share your connection from** to anything other than Wi-Fi, for
   example Thunderbolt Bridge with nothing plugged in. While Wi-Fi is the
   source it is not offered as a destination.
3. Under **To devices using**, switch on **Wi-Fi**. **Wi-Fi Options…** sets
   the network's name and password.
4. Turn **Internet Sharing** on and join that network from the iPhone. The
   phone will say it has no internet; that is expected.

The Mac's Wi-Fi is then busy being the network, so the Mac is offline until
you turn Internet Sharing off again. A small travel router does the same job
without tying up the Mac.

**Pairing by code again** does not need the Camera app: on the phone, tap
**Scan code** in the top line (or **Camera → Scan the Mac's code**) and point
it at the code on the Mac. The phone reads it through the camera it already
has open.

What is different:

- **If the link is lost completely** (the phone left the network, Safari was
  closed), nothing can rebuild it by itself. `/control` says so, with **Pair
  without internet** on the strip; scan both ways again. A short dropout
  recovers by itself.
- **The phone needs its saved copy of the page**, since it cannot download
  it. Open the phone page once while online beforehand; its start screen then
  reads "Saved on this phone". iOS can discard that copy after about a week
  without use.
- **The codec is fixed when you pair.** Changing **Codec** afterwards takes
  effect at the next pairing.
- **The Mac reads the phone's code with its camera**, using Chrome's own
  barcode reader where there is one and the bundled
  [jsQR](https://github.com/cozmo/jsQR) library (Apache-2.0) otherwise.

## Show networking

Only the handshake goes through a server (the public PeerJS cloud by
default). Video and sensor data go **directly** between the phone and the Mac.
No TURN relay is configured on purpose: if the two devices cannot reach each
other directly, pairing fails visibly rather than silently routing your show
through the internet. `/control` shows the route (`direct (LAN)`), round-trip
time, bitrate and jitter buffer under **Status**.

The phone is meant to move freely, so the link is wireless. With no usable
internet at all, the same networks work with
[Pair without internet](#pairing-without-internet). Recommended, in order:

1. **iPhone Personal Hotspot over Wi-Fi.** The Mac joins the phone's hotspot.
   On the iPhone, leave Wi-Fi on (the hotspot uses it), turn **Auto-Join**
   off for the venue's network so the phone does not hop onto it, switch on
   **Settings → Personal Hotspot → Allow Others to Join**, and keep that
   screen open until the Mac has joined. Once it has, the phone uses mobile
   data for its own internet by itself. Leave "Maximize Compatibility" off so
   the hotspot uses 5 GHz. This works even where the venue Wi-Fi does not: at
   a coffee shop, the Mac on the hotspot and the same iPhone paired and
   streamed. Check a website loads on the Mac before opening `/control`.
2. **Your own router.** A small travel router on a clear 5 GHz channel, placed
   near the stage, with only the phone and the Mac on it. It needs an internet
   uplink for the handshake unless you
   [self-host signaling](#self-hosting-the-signaling-server).

A USB cable between the phone and the Mac (Personal Hotspot, **USB Only**)
also works and is immune to the room's radio traffic, but it tethers the
phone; keep it for testing at a desk.

**Avoid venue Wi-Fi.** Guest networks usually isolate clients from each other
(pairing then cannot work at all), sit behind captive portals, and get
congested the moment the audience arrives.

After one visit online, both Mac pages and the phone page reload with no
internet at all: the site is stored in the browser (**Setup → Status →
Offline** says `ready`). MediaPipe models are the exception; each is stored
the first time its feature is switched on, so turn on the ones you plan to use
once before the show.

Once the phone is paired and the pages are loaded, the internet can go away:
the stream continues without the signaling server. The server is needed again
only to *re*-pair after the peer-to-peer link itself has broken, so load
everything and pair before doors open. All code, the MediaPipe runtime and its
models are served from the site itself; nothing is fetched from a CDN.

For the lowest latency: use 720p · 60 (the default), keep the phone close to
the access point, and close other tabs on the Mac.

## Keyboard shortcuts

They work in both `/control` and `/output` (not while typing in a text field).

| Key | Action |
| --- | --- |
| `B` | Blackout (panic). Press again to return |
| `Space` | Freeze frame: holds the current input frame; effects keep running on it |
| `X` | Bypass all effects |
| `G` | Glitch burst |
| `]` or `→` | Next step of the running order, with crossfade; next preset when there is no running order |
| `[` or `←` | Previous step, or previous preset |
| `1` | Input: iPhone |
| `2` | Input: local camera |
| `3` | Input: test pattern |
| `4` | Input: video file |
| `Shift` + `1`–`4` | The same four sources, for input B |
| `R` | Record the output on / off |
| `T` | Tap tempo |
| `I` | Cycle to the next input |
| `E` | Edit screen on / off (in the control window) |
| `M` | MIDI map mode on / off (in the control window); `Esc` also leaves it |
| `F` | Fullscreen on / off (in the output window) |

## Inputs

There are four sources and two inputs. **Input A** is what the effects
chain starts from, and what face, hand and person tracking watch. **Input
B** is a second picture that the **Mix B** effect mixes in; it is off until
you choose a source for it. Both are chosen from the icons beside the small
views under the picture on the perform screen (or `1`–`4` for A, `Shift` +
`1`–`4` for B)
and configured under **Setup → Input**. They can be switched live; while a
newly chosen source has no frame yet, the previous picture stays up.

A and B never show the same source: ask one for the source the other has
and they trade places. So one iPhone, and the one video file, can feed A or
B, not both.

**Mixing.** The bar between the two small views mixes B in, in any preset.
It belongs to an effect in the chain, **Mix B**: if the preset has none, the
first drag of the bar adds one, a plain fade in front of every other effect
(to keep it in the preset, open Edit, or save a new preset). Its **mix** is
how much of B comes in: drag the bar, pin it as a fader, map it to MIDI, or
have tilt, an LFO or the audio level move it like any other slider. The
button at the right of the strip names the **mode** and opens all nine as a
grid; the grid stays open while you try them, and closes on a click
elsewhere or `Esc`. The same grid is in Mix B's panel under Edit. Effects
before Mix B in the chain treat A alone; effects after it treat the mixed
picture, so drag Mix B along the chain under Edit to choose. **Apply to**
limits the mix to the person or to the background. With B off, Mix B passes
A through.

| Mode | What it does |
| --- | --- |
| Fade | A plain crossfade from A to B |
| Add, Screen, Multiply, Difference | The two pictures combined, as in a video mixer or a paint program |
| Bright key | B shows where B is brighter than **level**; **softness** blurs the edge |
| Colour key | B shows except where it is the **key colour** (0.33 is green); **level** is how far from that colour still counts |
| Wipe | An edge across the picture at **level**, turned by **angle**: B on one side, A on the other |
| B pushes A | B is not seen: its brightness pushes A's pixels along **angle**, as far as **level** |

The sources:

- **iPhone** — the WebRTC stream. Primary input.

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
| Mix B | Mixes input B in: nine modes (see [Inputs](#inputs)) |

**Apply to** (on every effect) limits it to the person or to the background.
That needs **Segmentation** switched on under Setup → Vision.

**Editing the chain.** Under the picture on the Edit screen the chain reads
left to right: the input, each effect, then **+ Add effect**. Click an effect
to open its controls on the **Parameters** tab; drag its button to move it
(or use ← → beside its name), and **Bypass** or **✕** there to skip or remove
it. Each slider is a bar: click or drag to set it, type an exact number in
the box beside it, double-click to return to the default. The two buttons on
a slider's row are **Fader**, which puts it on the perform screen, and
**Mod**, which has something move it by itself (both below).

The picture is rendered at the output window's pixel size and follows resizes
and display scaling. **Setup → Output → Full res / 75% / 50%** lowers the internal
resolution if the GPU is struggling.

## Modulation, triggers and presets

**Sources.** Every external signal is a number, either 0..1 or -1..1:

| Group | Sources |
| --- | --- |
| Phone | roll, pitch, yaw, tilt left/right, tilt forward/back, spin rate ×3, motion, shake |
| Touch | pad X, pad Y, pad touched, triggers 1–4 |
| LFO | four oscillators: sine, triangle, ramp, square, random steps, drift; free-running or locked to the tempo |
| Tempo | beat pulse, beat ramp, bar ramp |
| Audio | level, bass, mid, high, beat |
| MIDI | every CC and note, created the first time it is seen |
| Face / Hand / Gesture / Pose / Segment | see [vision](#midi-audio-and-vision) |

**Setup → Sources** shows them all moving live; the perform screen shows the
ones the live preset uses.

**Modulation.** Press **Mod** on a slider and a source starts moving it; the
**Modulation** tab opens on the new box. Each box is one source moving one
slider (`Phone · Roll → 1 Video Feedback · rotate`), with a thin meter
showing the source live. **Source** and **Slider** are menus, so a box can be
re-aimed; **Amount** (-1..1 of the slider's range) and **Smoothing** are
always there, and **More** opens **Offset**, **Invert** and how it is
applied: *added to the dialled value* or *replaces the value* (the source
sweeps the whole range). The switch turns one off without removing it; ✕
removes it. A preset can have any number, and one slider can be moved by
more than one source. **+ Add modulation** on the tab aims at the slider
touched last. Wet / dry can be moved too.

**LFOs.** The fourth tab holds the four LFOs. Each has a meter showing what
it is doing, its **shape** as a row of small pictures (sine, triangle, ramp
up, square, random steps, drift), **tempo sync**, and **rate**. Tempo sync
is a row of buttons: **Free**, then one cycle every 4, 2 or 1 bars (a
numbered bar) or every 2, 1, ½ or ¼ beats (a half, quarter, eighth or
sixteenth note); each says what it is when the pointer rests on it. The rate
only counts while the LFO runs free; locked to the tempo it is dimmed.

**Triggers.** Any source rising through its halfway point can fire an action:
blackout, freeze, bypass, next / previous preset, next input, glitch burst.
With **hold** ticked, blackout / freeze / bypass stay on only while the
trigger is held. (Hold settings saved before 13 November 2026 are no longer
read: every trigger is a switch until you tick hold for it again.) Defaults: phone buttons 1–4 are glitch, freeze (a switch,
as on the control page: tap on, tap off, and the phone's button stays lit),
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

**The running order** is a list of steps for a show. Each step points at a
preset, so one preset can come round as often as the show needs, and editing
the preset changes every step that uses it. It is optional: with no steps the
strip is the plain preset strip and none of this applies.

- **Build it.** On a preset tile, **+** adds that preset to the end of the
  running order. From the first step on, the strip has a switch: **Running
  order** and **All presets**.
- **Arrange it.** In Running order, drag a step to move it and **×** to take it
  out (the preset is kept). **Note** opens the step's note (a line of text
  shown on the tile) and a fade time of its own; left blank, the step uses
  its preset's.
- **Play it.** **Next** and **Prev** (`]` and `[`, a MIDI pad, a phone trigger)
  walk the steps and stop at either end. The live step is lit and the one
  Next will load has a dashed outline; the line at the right of the strip
  says the same in words, with the next step's note.
- **Leave it and come back.** Load any preset by hand (from All presets, a
  MIDI pad, or the Edit screen) and the running order keeps its place: the
  step you left is marked **Return**, and Next or Prev goes back to it.
- **Keep it.** There is one running order. It lives in the browser's local
  storage beside the presets, and **Export presets** writes it into the same
  file. Importing a file that has one asks before replacing yours.

**Tempo.** Tap `T` (or the **Tap** button, or a MIDI pad mapped to it) in
time, at least twice; the last eight taps are averaged, and the button blinks
on the beat. A single tap just moves the downbeat. The BPM can also be typed
next to the button. Each LFO has a **tempo sync** setting on the Edit screen
(from a quarter of a beat to four bars); the Tempo sources can be mapped like
any other, and the beat pulse works as a trigger. The tempo is global, not
per preset.

**Faders.** The perform screen shows up to eight faders for the live preset.
By default they are picked automatically: the eight places are shared out
between the effects in the chain (two effects get four each, three get three
each), and each effect gives its first sliders, in the order they appear on
the Edit screen; menus and switches are skipped. On the Edit screen,
**Fader** on a slider's row chooses it instead; the **Faders** tab lists the
chosen ones in order, with ↑ ↓ to rearrange and ✕ to take one off, and the
row of small faders under the picture shows the result. Under the faders,
each modulation source the preset uses has a meter, with what it is moving
written under it (`→ 1 Video Feedback · rotate`). Dragging a fader changes
the parameter for now without altering the saved preset; double-click resets
it. When modulation moves a fader's parameter, a hatched band runs from the
fader's setting to where the parameter is right now: stripes above the fill
when it is pushed up, dark stripes cut into the fill when it is pulled down.

## MIDI, audio and vision

All three are off until enabled, and all permission prompts appear on
`/control`, never on the projector. They run wherever the picture runs, and
move with it when the output window opens or closes.

**MIDI.** Click **MIDI map** at the top right (or press `M`). Every control
that can be mapped is outlined:

- the panic buttons, the source icons of inputs A and B and the nine mix
  modes (all shown while map mode is on, or open), previous / next preset
- every preset tile (a pad per preset; the pad stays with the slot) and every
  step of the running order (a pad per step number)
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
analysis is waiting, click the output window once (the message says which
window): Chrome only starts audio processing in a window that has been
clicked.

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

Problems show as strips across the top of `/control`. A strip with a fix is
a button that says where it goes (**Show pairing**, **Show QR code**,
**Reload both pages**, **Go to Input**, **Go to Recording**, **Go to
Vision**). Every strip has an **×** on the right; a closed strip stays closed
until its message changes or the problem clears and comes back. Strips about
a passing state (a stall, a recovering graphics context) remove themselves.

| Event | Behaviour |
| --- | --- |
| Phone stream stalls or drops | The picture holds the last frame. `/control` shows a red alert. Phone and Mac each retry on their own until the stream is back |
| Phone camera flips or restarts | Last frame is held; no black flash |
| Safari goes to the background | `/control` alert while hidden; red warning on the phone when it returns; stream resumes |
| Pairing server unreachable | A paired phone keeps streaming. Both sides keep retrying; the top bar says so. To pair anyway, use [Pair without internet](#pairing-without-internet) |
| A phone paired without internet drops off completely | `/control` says the link was lost, with **Pair without internet** on the strip. Scan both ways again |
| Room code reads as taken | Usually the Mac's own registration left behind by a reload or a dropped network; the pairing server clears it within a minute and the phone then reconnects by itself. The Mac keeps trying for 75 seconds. Only if the code is still taken then (another computer has it) does it move to a new code; `/control` says to scan again, and the phone's **Scan code** button reads the new one |
| The output window is closed | The picture returns to `/control` after about two seconds; the phone reconnects by itself. The top bar reads `Output off`; no alert |
| The output window crashes or is killed | The same, and `/control` says the output stopped without warning, with **Open output window** on the strip |
| The output window is minimised or covered | Chrome stops drawing it. `/control` says the output is not drawing and leaves the picture with it; bring the window back into view |
| A second output window is opened | It stays idle with a message; the running one is untouched |
| Not sure which window has the phone | **Restart output** closes every output window in this browser and opens one fresh one |
| A newer version of the app was deployed | `/control` says so, and warns if the output window is on a different version. **Reload both pages** reloads the output in place (it stays on its display but leaves fullscreen) and then `/control` |
| `/control` reloaded or closed | With the output window open: `/output` unaffected. With none: the picture restarts with the page and the phone reconnects |
| `/output` reloaded | Restores the last state; the phone reconnects by itself. `/control` waits for it |
| Internet drops, then a page is reloaded | The page loads from the browser's stored copy. Pairing a phone again still needs the signaling server |
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
- `uses: { inputB: true }` gives input B as `uTexB`, fitted like A; the
  effect is skipped while B is off (see `mixb.js`). `mixLabel` renames the
  effect's wet / dry slider.

A shader that fails to compile is reported in the console of the window
drawing the picture and that effect is skipped; the rest of the chain keeps
running.

## Recording

**REC** in the top bar (or `R`, or a MIDI pad mapped to it) records exactly
what the output shows, at the output's size, with the audio input if that is
switched on. The button shows elapsed time and file size while it runs.

With no output window the picture is rendered, and recorded, at 1280×720
whatever the size of the monitor on the page. Opening or closing the output
window stops a recording; what was recorded up to then is kept.

Recordings are written inside the browser's own storage as they are made, so
nothing is held in memory and nothing needs choosing mid-show. Afterwards,
**Setup → Recordings** lists them: **Save to disk** downloads a file,
**Delete** frees the space. They stay there across reloads until you do one
or the other.

Two formats: **WebM** (the default) reaches the file every second, so a crash
loses at most the last second; **MP4** opens in more players but Chrome writes
it in large pieces, so more is at risk if the browser dies. WebM plays in
Chrome and VLC, not in QuickTime.

Recording costs GPU and CPU. Check that the first readout in the top bar
(`Output 60 fps`, or `Output off · 60 fps`) still reads 60 fps while it runs;
if not, lower **Setup → Output** resolution.

## Latency

Three things to tune, all under **Setup**:

- **Codec** (Phone panel). H.264 is preferred by default because the iPhone
  encodes it and the Mac decodes it in hardware; VP8, VP9 and the browser's
  own choice are there to compare. Changing it restarts the phone's video for
  a moment. **Status → Stream** shows the codec actually in use and, when
  Chrome reports it, whether decoding is in hardware.
- **Quality** (on the phone). 720p · 60, the default, halves the time
  between frames compared with 720p · 30, at a higher bitrate and more heat
  on the phone. The phone remembers the last quality chosen on it.
- **Network.** See [Show networking](#show-networking).

To see what a change really did, use **Status → Measure real latency**. Point
the phone at the projected output so it fills most of the frame and click it:
the output goes black and flashes white five times, and the Mac times how
long each flash takes to come back through the camera. The result is the
whole loop the audience sees (projector, camera, phone, network, Mac), which
the **Latency** line above it can only estimate. Run it before the show, not
during: it takes over the output for about ten seconds. With no output window
it flashes the monitor on the Perform screen instead; that measures the
laptop's screen, not a projector.

The result is the median of the five flashes. A flash that comes back far
later than the others (a camera hiccup or a frozen frame) is named as a
stray and left out of the range; if strays turn up on every run, look for
dropped frames.

Measured on a real iPhone over home Wi-Fi with H.264, the phone pointed at
the output in a window on the Mac's screen (no projector):

| Phone quality | Frames arriving | Measured | Estimate then (Latency line) |
| --- | --- | --- | --- |
| 720p · 30 | 26 fps | 200 ms (167–217) | ≈ 160 ms |
| 720p · 60 | 54 fps | 167 ms (one stray at 817) | ≈ 152 ms |

The network round trip was 8–14 ms, so nearly all of the delay is the camera,
encoding, decoding and display. A projector adds its own lag on top; a game
or low-latency picture mode helps. The estimate now allows one camera frame
for capture; worked out from these runs it would have read about 198 and
170 ms, but it has not been seen on the phone since the change.

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

## Icon

The browser-tab and Home Screen icon is a compact camera with an upright eye,
in the app's red on its black. `scripts/make-icons.mjs` draws it and writes
the files in `public/` (`icon.svg`, `icon-32.png`, `icon-180.png`,
`icon-512.png`); change the drawing there and run it again.

```bash
node scripts/make-icons.mjs
```

The mock-ups for the running order and the edit screen are kept beside it
(`design/README.md` says what each is). The other icon options that were
considered are in `design/third-eye-icons.html`
(open the file in a browser).

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
| `tests/smoke.mjs` | Pipeline with no output window and with one, control ↔ output sync, keys, resize, reloads, lost GL context in either window, a video file following the picture back to `/control` |
| `tests/handover.mjs` | The optional output window, with real WebRTC: `/control` renders alone and the phone pairs with it; opening the output hands over (state and room code kept, recording stopped, one engine only, phone reconnects); an output reload does not bounce; an output that stops drawing is not taken for gone; closing it hands back; one that vanishes raises the alert |
| `tests/offline-pair.mjs` | Pairing with no pairing server, by QR code both ways: the dialog and its network tooltip, the size of both codes, the phone's code read from a camera picture, video, sensors and palette over the direct link, camera off and on, a stale code, a lost link and its alert, a code read twenty seconds late |
| `tests/offline-pair-online.mjs` | The same pairing while the pairing server can be reached: the phone still shows its code and waits; Hide the code falls back to normal pairing and the Mac's dialog closes |
| `tests/offline-handover.mjs` | A phone paired that way while the output window opens, reloads, closes and vanishes: the phone follows each time with no code scanned again |
| `tests/standalone.mjs` | With no output window at all: recording, the latency measurement, audio, MIDI and MIDI map, palette and dimmer reaching the phone; opening an output releases the microphone and MIDI |
| `tests/layout.mjs` | No overlaps at six window widths on every screen; the fader column (names whole, nothing overlapping) for every factory preset at five window sizes; nothing moves when the information changes; alert strips (fix buttons, ×, closing and returning); the palette pop-over |
| `tests/control-ui.mjs` | The three screens, the live monitor and the `Output off` readout that opens the output, palettes and the dimmer (and that the phone page is really inked), perform faders and the modulation band, preset editing, fades, reordering, the pop-out output, Reload both pages |
| `tests/offline.mjs` | Reloading every page with the server gone; tap tempo and tempo-synced LFOs |
| `tests/phone.mjs` | Real WebRTC against a local PeerServer: pairing, live video, palette and dimmer following live, the room-code strip clearing once the phone pairs, hold on stall, every reconnect path, a second output window, a taken room code, Restart output, local camera |
| `tests/record-latency.mjs` | Recording to WebM and MP4, saving and deleting; the latency measurement, including a stray late flash; switching codec |
| `tests/phone-screen.mjs` | The phone's live screen in both layouts: the horizontal preview that is also the XY pad, triggers, six presets numbered across then down, the camera icons, the bare zoom bar, Freeze as a switch (including two quick taps and a session saved with the old hold setting), Rotate, upright frames staying upright on the Mac, messages that leave the preview alone, Reconnect, the remembered room, scanning the Mac's code inside the page |
| `tests/running-order.mjs` | The running order: building it with +, Next and Prev, the same preset twice, going off the list and returning, notes and fades, dragging and removing steps, deleting a preset that steps use, the phone's six buttons following it, the export file, stepping with `/control` closed and with no output window |
| `tests/reconnect.mjs` | Getting the phone back without closing its page: a Mac that stops answering, a Mac reload, scanning that stops when the link returns, the ordinary pairing code read inside the page, a changed room code, Reconnect by hand |
| `tests/output-preview.mjs` | The phone's preview showing the Mac's finished picture: the setting, the picture following Blackout, Rotate not applied twice, the camera taking over while a code is read, a Mac reload, switching back; torch and white-balance lock dimmed on a camera without them |
| `tests/edit-screen.mjs` | The edit screen's own controls: the bar slider (click, typed value, double-click reset), the app's menus by mouse and keyboard without the page's shortcuts firing, a menu whose button scrolls into view, the chain row (add, drag, remove, bypass), modulation boxes and their extra settings, LFOs, autosave, a narrow window |
| `tests/mix.mjs` | Input B and Mix B: the strip under the picture (uncropped small views, source icons that slide out, looking at a source without choosing it, tooltips and the mode grid opening upward), the bar adding Mix B on its first drag, the nine modes on both screens, A and B trading places, B off passing A through, the iPhone as B, B carrying on when the picture moves to `/control` |
| `tests/modulation.mjs` | All effects, sensor channel, simulated motion, touch, mappings, triggers, presets, crossfade |
| `tests/midi-audio.mjs` | Audio analysis on Chromium's fake microphone; MIDI through a stand-in device, MIDI map mode for buttons, presets, faders and parameters |
| `tests/vision.mjs` | Each MediaPipe feature on sample photos; person / background masking |

## What has and has not been verified

**On real devices** (a Mac, an iPhone, home Wi-Fi and the iPhone's Personal
Hotspot): pairing by QR code through the public PeerJS server, live video
into the effects chain over a direct link with H.264, the control screens,
the output window, and Measure real latency with H.264 at 30 and 60 fps
against the Mac's own screen (see [Latency](#latency)). At a coffee shop the
Mac on the iPhone's hotspot works (the iPhone itself on the shop's Wi-Fi);
the Mac and the phone both on the shop's Wi-Fi do not. On a university
network the Mac could not reach the public pairing server at all. The
iPhone's camera offers zoom, a torch and a white-balance lock (and no
exposure or focus controls), and the phone's rebuilt screen draws correctly
in Safari, upright included. After the reconnect changes of 14 November the
phone was reported to reconnect better. The rebuilt edit screen was used on
the Mac on 15 November, before its LFOs tab was added.

**Only in headless Chromium**, with a fake camera and microphone: everything
else. Check these the first time you use them:

- **Input B and Mix B** (16 November): two real pictures mixed, the iPhone
  as A or B beside the Mac's camera, and whether the Mac holds 60 fps with
  two live videos. The tests mix the test pattern, Chromium's stand-in
  camera and a stand-in phone.
- **A closed network made by the Mac** with Internet Sharing and no internet
  behind it. The steps are from how macOS is known to behave; they have not
  been tried on your Mac.
- **Pair without internet**, all of it: Safari answering the Mac's code, the
  Mac's real camera reading the phone's real screen (the tests show jsQR a
  clean picture of the code), the link forming on a hotspot or a Mac-made
  network, and the phone following the picture between windows. Only Chromium talking to
  Chromium has been tried.
- **The phone's screen**, on a real iPhone: the preview showing the same
  band of an upright frame that the Mac shows (on 14 November the preview
  showed the Mac's screen on its side; whether Rotate or the iPhone's
  orientation lock was the cause is not known), Freeze as a switch, Rotate,
  the camera icons dimmed on the front camera, **Preview: Mac output** and
  how far it lags, and **Scan code** reading the Mac's ordinary QR code.
- **The running order**: building and stepping it on the Mac, and the
  phone's six buttons following a show of more than six steps.
- **The edit screen's LFOs tab** (shape pictures, note-value tempo sync),
  dragging effects to reorder, and **the Setup screen's menus and bars**.
- **Running with no output window, and moving the picture** by opening and
  closing it: that the iPhone reconnects by itself each time and how long it
  takes (1.5–2.5 s in the tests), that the monitor on `/control` holds 60 fps,
  and that a covered or minimised output is reported as not drawing rather
  than taken over.
- **Measure real latency** through a projector, and with VP8 or VP9. It
  has only been run against the Mac's screen, with H.264.
- Recordings longer than a few seconds.
- MIDI map with a physical controller.
- Fullscreen placement on a projector through the Window Management
  permission, and 60 fps at the projector's resolution.
- MediaPipe on the GPU. The tests use the CPU path. If a feature reports an
  error, switch Setup → Vision to **Run on CPU**.
- The direction of **Rotate / Counter-rotate**. If the picture turns twice as
  far instead of staying level, set `follow` to -1.
- Which camera controls appear on the phone. That depends on what the
  iPhone's camera reports; an empty list is not an error.
- Tap tempo, offline reload and the motion sensors and touch controls on the
  phone have not been reported on either way.
