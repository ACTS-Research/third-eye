# Handoff

## 2026-11-12

**Where things stand.** All five planned phases are built and live on GitHub
Pages from `main`, plus the Perform / Edit / Setup redesign, MIDI map mode,
offline reload, tap tempo, recording, codec choice and a real-latency
measurement. On home Wi-Fi it pairs and streams end to end with a real iPhone;
and, since the room-code fixes, on the iPhone's Personal Hotspot too. A
coffee-shop network did not work and has not been retried.

**Next step.** With the working setup, run the three things that have never
seen real hardware: Measure real latency (Setup → Status) once per codec,
a recording of several minutes, and MIDI map with a controller.

**Decisions only you can make.**

- Decide whether to allow a relay (TURN) fallback for networks that block
  the direct phone-to-Mac link (public Wi-Fi, probably). Home Wi-Fi and the
  hotspot do not need it; it costs latency and depends on someone's server.
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
