---
name: ddg-procedural-vegetation
description: Build and integrate procedural shrubs, grasses and trees in DDG/Syte, including coherent habitat colour, anchored wind, distance LODs and terrain cover. Scoped to this project's shared asset laboratory and coastal scene.
---

# DDG procedural vegetation

The portable first species is `src/plants/oleasterModel.js`; its physical contract
is metres, +Y up, north −Z, east +X, root at zero. Preserve the reviewed silhouette
when changing ecology or integrating it. The shared white laboratory is in the
`codex/asset-lab` worktree. Integration uses the separate coastal checkout; verify
both Git states and actual server roots. Refer to `ASSET_LAB.md`, `TERRAIN.md` and
the scene asset skill when touching their respective surfaces.

## Coherent ecology

Use `plantEcology.js` for metre-space fields and paired CPU/GLSL functions.
Broad colonies must correlate neighbouring plants; the crown field adds smaller
patches within each plant. Keep habitat dryness separate from the artist's overall
dryness. Fully fresh and fully dry settings retain their literal endpoints.
Sample rest positions: wind must carry a patch with the foliage, not make colours
swim through a moving crown. Do not replace this with per-instance random tint or
independently seeded colours per LOD.

`plantHabitat.js` scatters deterministically through `surfaceAt(x,z,time)`, with
normal, wetness, shrub suitability, rock exclusion and path mask. `pointAt` adapts
sampling to curved coast coordinates. Use a spatial hash for spacing. Keep roots
anchored to the analytic query; displayed terrain LOD is not the habitat or physics
source. `plantCover.js` packs root litter and vigor for the ground shader. It is
visual cover, not a collision surface. Future paths should supply one exclusion
mask to scatter and ground cover together.

Keep appearance edits independent of shape generation. Avoid regrowing a population
when changing lighting, wind or patch contrast. Reuse immutable geometry and batched
instances; cap rendering distance and expose actual counts/triangles for inspection.

## Geometry, motion and LOD

Leaves begin at their parent's curve point. Wind deforms the common position field;
leaf flutter rotates around its petiole. Bark, leaf, depth and distant passes must
share gust phase, bearing and exposure. `PLANT_BEND_GLSL` gives travelling gust fronts
and a coherent prevailing lean. Preserve root position, inverse-Jacobian normals
and conservative displacement bounds when extending the deformation.

The leaf atlas contains true RGBA cutouts, separate front/back reflectance and
normal detail. Runtime uses the baked maps; do not load the larger authoring source
on mobile. Retain colour padding around alpha edges and coverage correction in
projected mips. Thin-leaf backlighting is an approximation, not volumetric SSS.

`bakePlantImpostor` stores colour, normals and rest position for eight azimuths at three elevations (0/45/90 degrees).
Its position alpha identifies leaves versus bark. Decode position RGB with albedo
coverage, transform by the same instance yaw/scale/root, then sample the same ecology
field. This preserves gradients even after a material edit. Do not bake global
dryness or studio light into the projection. This is a quantized approximation:
validate its error, not just a visually plausible colour.

Set atlas viewports on the render target itself; renderer viewport setters apply
Retina DPR. Create/dispose bakes in effects, including context restoration. Keep
uniform maps stable and mutate values. Avoid auto-disposing shared loader textures
while another mesh still consumes them.

Current near/mid/far budgets are roughly 82k/14k/8 triangles. Far projections rotate
around the crown centre and include aerial views; underside views retain 3D foliage.
Desktop frame tiles are 256 square, mobile tiles 128 square (24 views per atlas).
Keep projected size and hysteresis, and retain near leaves for close-ups on mobile.
New species or denser populations may need additional geometry LODs; do not hide their cost behind a desktop-only benchmark.

## Scene and acceptance

The scene owns lighting, atmosphere, water reflections, active time and audio.
Connect through its settings normalization/publication/camera snapshot keys together.
Do not duplicate wind speed/bearing controls already owned by the landscape.
Use short RU/EN labels and procedural sliders, without tutorial hints in the panel.
Preserve authored and uncommitted published settings; inspection cameras are previews.

Run `scripts/check-plants.mjs`, `scripts/generate-oleaster.mjs` (includes actual GPU
field/attachment/projection checks), and `scripts/check-plant-ui.mjs` against the lab.
`plantEcologyGpuChecks.js` compares the direct mesh field to thousands of projected
leaf pixels, so a wrong coordinate frame or bake bound fails numerically.
For integration also run the coast plant/settings checks and inspect the real shore.
Use one visible graphics tab, pause it during headless GPU QA, close QA browsers,
and verify hide/resume and paused parameter/camera edits. Inspect full plants,
leaf/branch close-ups, a large mixed-LOD patch and phone/tablet viewports. Desktop
Chromium emulation does not establish physical iPhone/iPad Safari performance.
