# River–sea tanker

The tanker is collection `tanker` in the existing DDG Asset Laboratory:
`http://127.0.0.1:7313/asset-lab.html?collection=tanker`.

This stage belongs to `codex/asset-lab`. Product `WaterScene`, editor drafts and
published home settings are not modified. The ship is an original low-poly
interpretation of the supplied red river/sea tanker photograph, not a claim to
reproduce a specific named vessel or its engineering drawings.

## Authoring and geometry

`model.js` is the deterministic source. Coordinates are physical metres, Y up,
bow +X, port -Z, waterline y=0. Hull length 138 m, moulded beam 16.6 m, draft
4.5 m, masthead 28 m above water. Lifeboats extend the overall beam to 18.27 m.
The hull is a closed cross-section mesh with a flared, raised bow and a hard
chine. Details include cargo pipes, manifolds, tank lids, walkways, railings,
bridge glazing, davits, lifeboats, exhausts, stays and navigation lights.

```sh
node scripts/generate-tanker.mjs
node scripts/check-tanker.mjs
```

Exports live in `public/models/tanker/` with a machine-readable manifest:

| Variant | Triangles | Material batches | GLB |
| --- | ---: | ---: | ---: |
| near | 8,348 | 12 | 611,312 bytes |
| horizon | 860 | 10 | 70,416 bytes |

Both variants retain the same silhouette and pivots. The horizon version removes
railings, glazing mullions, valve wheels and lifeboats. The lab also supports an
eight-vessel load view. Exported GLBs contain standard PBR fallback materials;
the runtime weathering extension is supplied by `materials.js`.

## Material and lighting contract

`createTankerMaterials` builds MeshStandardMaterials. No baked illumination or
unlit hull shader is used. The procedural `onBeforeCompile` extension adds
deterministic plate variation, corrosion streaks and wetness near the waterline,
then leaves shadowing, environment reflection, fog and tone mapping to Three.js.
`updateTankerMaterials` accepts hull colour, wear, wetness, roughness, wireframe
and night weight. Night weight controls the port, starboard and mast emissives.

The lab's **Scene light** option consumes `buildHomeSceneLighting`, including its
sun direction, atmospheric colour, cloud response and night weight. Studio
background remains warm white. Time/cloud controls affect Scene light; exposure
and environment intensity affect both lighting modes.

## Motion and water

`sampleTankerMotion` is independent of rendering and returns physical speed,
RPM, straight-course travel, slow heave, roll and pitch. Preview translation
integrates speed without teleporting when speed changes. At the far end of the
lab's travel strip it repeats outside the close view; this is a preview loop,
not a proposed shipping route in the product scene. Pause holds simulation time;
hidden tabs stop animation. Reduced-motion preference pauses on initial load.

The lab displays a speed-driven procedural wake and uses its existing planar
reflection pass. The tanker casts and receives standard shadows in near mode;
horizon mode avoids shadow-map submissions. In the product, place the model in
the existing reflection pass; do not instantiate another reflection renderer.
Lab preview distance provides a relative far-view and acoustic test, not a
surveyed camera match to the home scene.

## Sound and future scene hookup

`TankerSound` synthesizes a low-speed diesel firing spectrum, propeller/water
noise and a three-tone air horn. It is procedural sound design, not a field
recording. RPM follows speed; HRTF follows the camera-relative vessel bearing.
Inverse-distance falloff, high-frequency air absorption and bounded Doppler
follow the same source trajectory. A 1,200 m vessel is intentionally much quieter
and duller than one at 45 m. Sound only starts after an explicit button press;
mute and hidden tabs suspend the lab context. Nodes are stopped/disconnected on
unmount, with no network fetches.

The lab uses the site's audio field names: `enabled`, `mode`, `masterGain`,
`ambienceGain`, `spatialGain`, `spatialEnabled`, `tracks.tanker.{enabled,gain}`.
It has its own local preview values and does not read or write the home draft.
Modes `off` and `music` mute this soundscape source. It does not play music.

For a later, separately approved product integration:

1. Register `tracks.tanker` in the site's audio normalizer/editor and publish keys.
2. Construct `TankerSound({ context: engine.context, destination: engine.nodes.world,
   sharedWorldBus: true })` after the existing user unlock.
3. Supply normalized scene audio settings and final tanker/listener transforms.
   Shared mode leaves listener ownership with `HomeSoundscapeBridge` and applies
   only the tanker track gain, avoiding a second master/ambience/spatial gain.
4. Include the tanker transform/motion/material settings in authored scene and
   camera snapshots; keep the audio transport outside per-camera snapshots.

## Verification

`check-tanker.mjs` checks both budgets, finite geometry, shell normals, physical
scale, 12 minutes of stable buoyancy, a one-hour course in four headings, and
distance/mute/Doppler contracts. Browser acceptance additionally covers shader
compilation, near/macro/underside/far views, reflection, eight-vessel load,
desktop/mobile layout and audio output. Browser evidence is stored under the
ignored `output/tanker-qa/` folder when produced.

Open `/scripts/check-tanker-audio.html` on the lab server to run the real source
in an OfflineAudioContext. It checks silence at master zero and music-only mode,
near/far attenuation, left/right HRTF, horn audibility and shared listener
ownership, then offers a five-second WAV audition. Recorded RMS at 45 m was
0.03056 versus 0.001207 at 1,200 m; the horn peak was 0.2512, below clipping.
