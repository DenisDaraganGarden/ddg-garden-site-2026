---
name: ddg-scene-assets
description: Build, review, and integrate procedural 3D assets in the DDG/Syte scene. Use for new lab collections, asset material/motion/audio integration, world coordinates, and scene camera or reflection acceptance. Scoped to this repository.
---

# DDG scene assets

Inspect the running surface before deciding the source of truth: listener port and cwd, Git branch and worktree, browser origin, editor draft, and `publishedHomeSceneSettings.js`. A draft is origin-bound. Camera snapshots carry scene settings; a scene-only change can disappear on a camera cut if its key is not published and normalized.

The main scene is `WaterScene.jsx` inside `SceneCanvas`; `useHomeSceneSettings.js` owns defaults/normalization and `publishedHomeSceneKeys.js` owns persistence and camera snapshots. Use those contracts rather than a parallel settings store. The editor tree is `features/home-scene/components/editor/editorTree.js`. Match its compact RU/EN controls.

Use short labels and procedural sliders. Do not add tutorial text, helper badges or repeated hints to the tool panel. Prefer a single meaningful control over duplicated settings. Explain implementation choices in the task or technical documentation.

## Asset laboratory

Use the existing `codex/asset-lab` worktree and shared `AssetStudio`, after checking their actual location. `ASSET_LAB.md` documents the warm white studio, orbit views and shared materials. One collection per object family; reuse the renderer, floor, light and navigation. A laboratory and product integration are distinct scopes; proceed with integration when the user requests it. Retain the reviewed geometry and physical scale rather than rebuilding the silhouette during integration.

`src/tanker` demonstrates a portable asset: merged geometry by material, near and horizon detail, explicit disposal, deterministic motion, shared standard lighting, and a caller-owned audio context. The reference GLBs are in `public/models/tanker` and their procedural shader extension stays in runtime code. Verify both the procedural model and exported fallback.

## Physical contracts

World distances are metres. Y is up, waterline is Y=0, north is -Z and east is +X. Site bearings run clockwise from north. The tanker bow is +X; its Y rotation is `(90 - bearing) * PI / 180`. Never rotate the world to fit an asset. Verify outward winding from below and lit above before hiding a normal bug with double-sided materials.

Keep global world motion independent from display scale. Integrate speed over time so a speed edit does not jump the object. Cap resumed frame deltas. For long routes, define repeat behavior and check it from the camera, with frame clipping and reflections.

Use MeshStandardMaterial or the existing PBR extension points so scene lights, shadows, fog, exposure and tone mapping remain common. Do not bake the laboratory's lighting into materials. Dispose generated geometry, maps, materials and sources on unmount. Share immutable geometry for repeated objects.

Keep a ShaderMaterial's uniforms map stable after compilation and edit its values in place. Three.js caches the initial map; replacing it can leave GPU lighting and animation on old values even when material.uniforms reports the new settings. Check a live night-to-day edit, not only a fresh load. The water GPU contract in `scripts/check-water-surface-gpu.html` reproduces this binding behavior and also checks world/view normals and simulation UVs.

## Water and sound

The scene has separate near simulated water and far water, plus rate-limited reflection/refraction passes. A visible distant object must participate in the far surface's planar reflection. Its dynamic motion must invalidate that pass. Exclude wake/water surfaces from their own capture. Check the normal render, mirror and submerged pass independently.

`SoundscapeEngine` owns the single AudioContext and bus graph. World sources connect to `nodes.world`; master, ambience, spatial, route, visibility, user mute and camera-cut ducking are already downstream. `TankerSound({sharedWorldBus:true})` applies only its track gain and never writes the listener. `HomeSoundscapeBridge` owns listener synchronization from the final camera. Sources unlock only on a user gesture, release on unmount, and respect solo/track enable and music-only mode.

## Acceptance

For land or shoreline work, read `TERRAIN.md`. Keep the CPU terrain field and its GLSL counterpart in agreement, test them on the GPU, and refine geometry around physical features rather than scaling one uniform grid. Use the shared terrain/rock queries for habitat and collisions, including airborne and ground contact paths. Preserve metre-space normals, geographic headings, mesh bounds and the renderer's logarithmic depth encoding in every world shader. Check both the original composition and a ground-level camera; a distant overview alone cannot validate parallax, clipping or foot contact. Add all terrain settings to normalization, publication and camera snapshots together.

Use scoped checks for geometry winding, metre scale, detail budgets, bounded motion, normalization and audio gain behavior. Inspect the live model at normal view, silhouette, close-up and underside. Check daylight/night, a camera cut, near/far water reflection, motion and sound mute, then a narrow viewport. Offline audio can verify waveform and distance/panning; it does not prove subjective realism.

Keep the user's authored composition. QA cameras or lighting belong in a temporary preview or an explicitly selected editor preset. Keep one visible product tab and close temporary QA tabs/servers when finished. Commit the verified stage with provenance and report any unverified rendering or listening conditions.

For mobile work, inspect phone and tablet layouts, the low-power shader path and close grazing angles. Desktop Chromium with a reduced profile is not proof of physical iOS Safari performance. Keep visual LOD separate from physics, landing anchors and sound; use projected size and hysteresis. Standard material alpha maps are preferable to fragile billboard shader patches.

Hidden pages must stop both rendering and scene audio. R3F restarts its clock on a frameloop change: retain a monotonic active-time timeline so procedural phases survive hide/resume. Use `check:coast-contracts` and `scripts/check-terrain-gpu.html` for the numerical contracts, then inspect the rendered shoreline through a whole wave cycle. A static frame or green build will not expose every seam.
