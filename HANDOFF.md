# Handoff

## 2026-11-12

**Where things stand.** All five planned phases are built and live on GitHub
Pages from `main`, plus the Perform / Edit / Setup redesign, MIDI map mode,
offline reload, tap tempo, recording, codec choice and a real-latency
measurement. On home Wi-Fi it pairs and streams end to end with a real iPhone;
on a coffee-shop network and on the iPhone's Personal Hotspot it did not, and
that was never diagnosed on the current version.

**Next step.** Reproduce the Personal Hotspot failure on the current build:
join the Mac to the hotspot, reload `/control`, use Restart output, pair, and
read the line under the room code in the pairing pop-over (click the phone
status in the top bar). That line says which step fails.

**Decisions only you can make.**

- Decide whether to allow a relay (TURN) fallback. Today video must go
  directly between phone and Mac; if the hotspot blocks that, a relay is the
  only fix, at the cost of latency and a dependency on someone's server.
  (That the hotspot blocks the direct link is unconfirmed.)
- Decide whether to run your own pairing server instead of the public PeerJS
  one. The public one worked on home Wi-Fi; it comes with no guarantees.
- Pick the default recording format. It is WebM now because Chrome writes it
  to disk every second; MP4 opens in more players but is written in large
  pieces.
- Delete the old `claude/affectionate-gates-x6ngzx` branch and its
  Pages deployment rule when you no longer want them. Nothing deploys from it.

**Never run on real hardware (all unconfirmed).**

- Measure real latency, with the phone pointed at a projector.
- Whether H.264 actually lowers latency compared with VP8 / VP9.
- Recordings longer than a few seconds.
- MIDI map mode with a physical controller.
- Fullscreen placement on a second display, and 60 fps at projector size.
- MediaPipe features on the Mac's GPU.
- The direction of Rotate / Counter-rotate (set `follow` to -1 if it doubles).

**Open question.** An early screenshot showed the output at 30 fps rather
than 60. Never explained (Low Power Mode and an overlapping window are
guesses).

**Branch.** Work is on `main`, which is the default branch and the one that
deploys.

**How to check a change.** `npm test` runs eight headless suites (pipeline,
control screens, offline, pairing over real WebRTC, recording and latency,
modulation, MIDI and audio, vision). They use a fake camera and microphone,
so they do not replace a run on the real devices.
