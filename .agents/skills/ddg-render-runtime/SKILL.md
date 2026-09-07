---
name: ddg-render-runtime
description: Maintain DDG/Syte lighting, shadows, water optics, AO, antialiasing, FSR 1 and render budgets. Use when changing the shared renderer or integrating materials into its passes. Scoped to this repository.
---

# DDG render runtime

Read the live checkout before relying on a report. Runtime entry points are
`src/components/effects/SceneCanvas.jsx`, `WaterScene.jsx` and
`ScenePostProcessing.jsx`. The reference implementation and measured limits are in
[render core](../../../docs/render-core-2026-09-07.md) and
[upscale and warmup](../../../docs/render-upscale-2026-09-07.md).

## Settings and scene integration

`renderQualitySettings.js` owns quality defaults and normalization.
`publishedHomeSceneKeys.js` includes them in publication and camera snapshots.
Keep author settings separate from effective device quality: budget changes must
not rewrite camera snapshots, object placements or saved controls.

A merged implementation can still be absent from the authored scene. Compare
the approved feature settings against the published root and camera snapshots,
then use `sanitizeHomeSceneSettingsForPublish` and the existing publish client.
Verify the main dev at `http://localhost:41212/home/edit` and the published site.
The agent sandbox is 41213; it is not the main development editor. Publication
and adopting it in an editor are separate steps; preserve newer local author edits.

## Light and shadow receivers

`homeSceneLighting.js` and `csmAdapter.js` share the sun and shadow maps. Shadow
bias is specified in metres, then converted for each map; do not restore a raw
depth bias shared across different frusta. Normal bias is texel dependent and
bounded. Automatic desktop quality uses two zones, mobile/low power one; explicit
controls can override this. Projection changes include zoom and view offsets.

Preserve material `onBeforeCompile`, cache keys and disposal hooks when binding
CSM. Late materials must receive the same contract. Assets still own cast/receive
policy and depth materials matching wind deformation and alpha cutout. Plant
transmission and both water surfaces receive the shared shadows explicitly;
cascades are alternative coverage, not additional suns. Update existing uniform
values in place and clear obsolete far-map references when leaving two-zone mode.

## Optics and postprocessing

Water reflection/refraction textures retain the matrices of their capture camera.
They cannot be sampled with the current camera's matrices after movement. Preserve
the urgent coverage refresh and depth decoding when changing their cadence or LOD.
`safeRenderTargetReadback.js` isolates synchronous plant reads from an in-flight
water PIXEL_PACK_BUFFER binding; restore renderer/GL state after probes or bakes.

`renderTargetCapabilities.js` probes the actual color/depth/stencil resolve once
per context. An extension string alone does not prove MSAA works. Unsupported
MSAA falls back to FXAA. AO uses a separate opaque depth pass at half resolution;
exclude water and blended surfaces and retain depth-aware compositing.

The FSR 1 path is spatial EASU then RCAS, without frame history or motion vectors.
Apply one tone map and color encoding before FSR; put grain and film artifacts
after upscale. Respect combined-scale and 240-pixel short-edge guards; a smaller
native frame skips upscale. Keep the pinned AMD attribution and distributed MIT
notice. Do not describe this path as DLSS, temporal reconstruction or TAA.

## Scheduling and startup limits

Frame caps are 30/40/60/120/unlimited; they are upper bounds. The automatic budget
targets 30 FPS with hysteresis and lowers water capture cadence, then post
resolution. Unsupported GPU timing falls back to frame timing. Preserve the
monotonic active timeline and stop continuous render/audio on a hidden page.

`src/plants/calibrationQueue.js` shares one cooperative queue per renderer:
at most two generator steps per frame, with no further work started after 3 ms.
One step is not preemptible. In `plantAtlases.js`, generate mipmaps after the last
atlas view of each output, not every view. Restore render state and cancel jobs
before disposing their resources.

Initial geometry/baking remain synchronous. Plant calibration does not yet rerun
after a large lighting change. The existing three-frame ready beacon is not a
complete startup barrier. Do not claim these remaining tasks, universal SSS/GI,
local-light shadow maps, or physical-phone performance are already implemented.

Use focused checks for the changed contract, plus real rendered inspection in
the user's selected browser. Before push, run the project-required lint/build.
A successful deployment is distinct from a successful full smoke run.
