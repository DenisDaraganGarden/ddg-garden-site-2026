# DDG home sound laboratory

The sound system is intentionally independent from the camera editor. It reads
the final Three.js camera and the boat's final buoyant transform, but never writes
camera pose, timing, slideshow order, or object state.

## Playback graph

```text
music ───────────────┐
                     ├─ home route fade ─ master ─ user mute ─ compressor ─ output
water bed ─ ambience ┤
3D emitters ─────────┤
weather ─────────────┘
UI clicks ─────────────────────────────── master
```

- `music`, `soundscape`, `hybrid`, and `off` are publishing modes.
- The top-right sound button is the listener's persisted mute/consent control.
- The first explicit interaction creates/resumes `AudioContext`; no ambience is
  fetched or decoded before consent.
- Leaving `/` fades only the home bus. UI clicks remain available on inner pages.
- Hiding the tab suspends the context. Returning resumes only a previously enabled
  session.

## Loops and camera cuts

- Long-form beds are decoded into `AudioBuffer`s. Replacement sources are
  scheduled before the current source ends and overlap with equal-power curves.
- Birds use randomized 7–14 second excerpts and 9–25 second gaps. Thunder is a
  rare one-shot with randomized delay; neither is a conspicuous short loop.
- Slideshow phase never restarts a source. `fade-out` softly ducks only spatial
  detail, the camera changes under black, and `fade-in` restores it. Web Audio
  listener parameters interpolate the final R3F camera pose, avoiding a hard pan
  jump when the camera editor changes shots.

## Current spatial anchors

The water plane is currently 34 m square and has no shore/tree geometry. Shore,
birds, wind and thunder are therefore bounded virtual emitters editable in
`/home/edit` → **Звук** → **3D-сцена**. The boat source is different: it follows
the rendered hull after live buoyancy each frame. When future shore/tree objects
arrive, they can call the same `updateEmitter` bridge without changing the mixer.

## Publishing contract

The published home scene owns one normalized `audio` object. Audio stays outside
per-camera snapshots so duplicating/reordering shots cannot clone or reset the
sound transport. A later camera-specific design can add a small `audioProfileId`
reference, but should crossfade profiles rather than embedding whole track lists
in every camera.
