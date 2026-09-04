---
name: ddg-scene-assets
description: Build, review, and integrate procedural 3D assets in the DDG/Syte scene. Use for new lab collections, asset material/motion/audio integration, world coordinates, and scene camera or reflection acceptance. Scoped to this repository.
---

# DDG scene assets

Inspect the running surface before deciding the source of truth: listener port and cwd, Git branch and worktree, browser origin, editor draft, and `publishedHomeSceneSettings.js`. A draft is origin-bound. Camera snapshots carry scene settings; a scene-only change can disappear on a camera cut if its key is not published and normalized.

The main scene is `WaterScene.jsx` inside `SceneCanvas`; `useHomeSceneSettings.js` owns defaults/normalization and `publishedHomeSceneKeys.js` owns persistence and camera snapshots. Use those contracts rather than a parallel settings store. The editor tree is `features/home-scene/components/editor/editorTree.js`. Match its compact RU/EN controls.

## Asset laboratory

Use the existing `codex/asset-lab` worktree and shared `AssetStudio`, after checking their actual location. `ASSET_LAB.md` documents the warm white studio, orbit views and shared materials. One collection per object family; reuse the renderer, floor, light and navigation. A laboratory and product integration are distinct scopes; proceed with integration when the user requests it. Retain the reviewed geometry and physical scale rather than rebuilding the silhouette during integration.

`src/tanker` demonstrates a portable asset: merged geometry by material, near and horizon detail, explicit disposal, deterministic motion, shared standard lighting, and a caller-owned audio context. The reference GLBs are in `public/models/tanker` and their procedural shader extension stays in runtime code. Verify both the procedural model and exported fallback.

## Physical contracts

World distances are metres. Y is up, waterline is Y=0, north is -Z and east is +X. Site bearings run clockwise from north. The tanker bow is +X; its Y rotation is `(90 - bearing) * PI / 180`. Never rotate the world to fit an asset. Verify outward winding from below and lit above before hiding a normal bug with double-sided materials.

Keep global world motion independent from display scale. Integrate speed over time so a speed edit does not jump the object. Cap resumed frame deltas. For long routes, define repeat behavior and check it from the camera, with frame clipping and reflections.

Use MeshStandardMaterial or the existing PBR extension points so scene lights, shadows, fog, exposure and tone mapping remain common. Do not bake the laboratory's lighting into materials. Dispose generated geometry, maps, materials and sources on unmount. Share immutable geometry for repeated objects.

## Water and sound

The scene has separate near simulated water and far water, plus rate-limited reflection/refraction passes. A visible distant object must participate in the far surface's planar reflection. Its dynamic motion must invalidate that pass. Exclude wake/water surfaces from their own capture. Check the normal render, mirror and submerged pass independently.

`SoundscapeEngine` owns the single AudioContext and bus graph. World sources connect to `nodes.world`; master, ambience, spatial, route, visibility, user mute and camera-cut ducking are already downstream. `TankerSound({sharedWorldBus:true})` applies only its track gain and never writes the listener. `HomeSoundscapeBridge` owns listener synchronization from the final camera. Sources unlock only on a user gesture, release on unmount, and respect solo/track enable and music-only mode.

## Acceptance

Use scoped checks for geometry winding, metre scale, detail budgets, bounded motion, normalization and audio gain behavior. Inspect the live model at normal view, silhouette, close-up and underside. Check daylight/night, a camera cut, near/far water reflection, motion and sound mute, then a narrow viewport. Offline audio can verify waveform and distance/panning; it does not prove subjective realism.

Keep the user's authored composition. QA cameras or lighting belong in a temporary preview or an explicitly selected editor preset. Keep one visible product tab and close temporary QA tabs/servers when finished. Commit the verified stage with provenance and report any unverified rendering or listening conditions.
