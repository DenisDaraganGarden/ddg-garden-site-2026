# Azov coast

The coast is part of `WaterScene`, with controls in **Ландшафт → Суша / Landscape → Land**. It starts on the eastern side of the existing composition. The original draft and published camera poses are not rewritten. The four inspection buttons move the editor camera; save a camera explicitly to retain a view.

## Coordinates and scale

All distances are metres: +Y up, sea level Y=0, north −Z, east +X, south +Z, west −X. Geographic headings run clockwise from north. `terrainBearing` points inland; at 90° land is east and the shoreline runs north–south. `coastPoint(q,s,definition)` converts distance inland from the curved shoreline and distance along it to world X/Z. The cape and curvature move the shoreline, while its origin stays at `terrainOffset`.

The existing solar field stores its legacy azimuth with 0° at +Z. The light panel converts this to geographic bearing (`180 − legacy`, wrapped to 360°), preserving the authored light direction. Do not reinterpret old persisted values or rotate the scene.

## Geometry and visibility

`src/terrain/terrainModel.js` is the continuous height field. `terrainShader.js` mirrors it for wetness, surface clipping, waves and foam. Geometry rows follow the foot and crown of the bluff. The shallow shelf joins the old bed at −96 m offshore; the finite inland/end boundaries descend below water rather than exposing vertical mesh edges.

The default shoreline is 1,600 m in 25 strips of 64 m. The editor allows up to 4,096 m. Each strip selects one of three resolutions, with hysteresis and frustum culling. Shared analytic normals and edge skirts bridge detail transitions. Across-shore water density stays high enough to resolve the wave even in distant strips. Changing a material control keeps geometry; replacing a strip disposes its old buffers.

The camera keeps near=0.01 m and far=10,000 m. `SceneCanvas` enables logarithmic depth; all world ShaderMaterials, optical captures and depth-reading post effects use that encoding. Fullscreen simulation and sky passes retain screen-space depth. Shader displacement bounds include the entire allowed wave envelope.

## Surface and water

`scripts/terrain/generate-pbr.py` creates nine deterministic, tileable 1,024² maps with NumPy and Pillow. No external photographs or baked lighting are used. Sand and shells tile at 1.2 m, sandstone at 2.8 m. Albedo is sRGB; normal and packed roughness/AO/height maps are linear and stored losslessly. `public/textures/azov/manifest.json` records the seed, metric relief and encoding.

Standard PBR materials follow common lights, environment, exposure, shadows and tone mapping. Slope blends sand into triplanar sandstone; shoreline distance controls shell coverage; wave run-up darkens the wet margin and lowers roughness. Sixteen-step interpolated parallax fades out between 8 and 22 m. A bounded, deterministic camera-local batch adds centimetre shell fragments. Low-power mode disables parallax and fragments and caps terrain detail.

Near water and the extended shore use the same WaterSurfaceV2 shader, GPU state, wave phase, optics, cursor light and foam function. Shore strips own the curved q=-96..8 m band; the original pond mesh excludes that band. World-space strips map back into the pond UV frame and fade simulation samples outside its finite extent. The outer q=-96..-32 m part uses a sparse mesh; the near band retains dense rows. The outer eight metres blend into the shared far-water body shading before the mesh boundary. There is no stochastic coverage or double-drawn shoreline. Foam uses the actual scene key/fill radiance, including night lighting. Water uniform maps keep a stable identity: replacing the map after Three.js compiles a material can otherwise leave GPU values frozen at the initial settings. The GPU ripple simulation has a 1.5 m absorbing perimeter and damps across the 0.8–0.4 m shoal interval. This same depth weight is used by display normals/displacement and CPU probes. Boat probes and existing floating/submerged plants consume the coast surface; fish respect the new bottom. Refraction measures submerged terrain and rock depth, with contact foam. Reflection/refraction exclude water and tanker wakes. The existing `shore` audio emitter follows the closest shoreline through the common mixer.

## Physics and future vegetation

`createTerrainQuery(definition)` provides `heightAt`, `normalAt`, `surfaceAt` and `raycast`. `attachRockCollisions` overlays the actual instanced rock triangles through a spatial hash. `createTerrainCollider` adapts this to the existing creature raycaster, including ground impacts and occlusion, with a bounding slab before marching.

Flying birds anticipate terrain height; landing sites use dry, low-slope ground. `surfaceAt(x,z,time)` returns material, slope, friction, wetness, habitat, grass/shrub/tree suitability and a deterministic wind vector, gust and exposure. The coastal oleaster now consumes these queries through `src/plants/coastPlanting.js`; future species should use them rather than intersect the current display LOD or copy terrain formulas.

This is a single-valued height field: caves and overhangs need separate colliders. Rock tops are resolved from triangles. Slabs embed into the bluff instead of being lifted by a single uphill corner; the contact check prevents floating above their beach footing. Parallax and shell fragments are visual microrelief, not navigation obstacles. The analytic field is independent of the displayed triangle approximation; default close geometry was checked within 3.6 cm at sampled triangle centres. Very steep settings and distant LODs have a larger approximation error.

## Verification

- `npm run check:terrain`: axes, top winding, shared normals, seams, bounds, 4 km extent, seeded rocks, analytic and Three.js collider agreement, dry-ground fish exclusion, bird ground clearance and depth precision.
- Open `/scripts/check-terrain-gpu.html` on the editor Vite server: 288 CPU/GPU samples, published settings roundtrip and complete camera snapshot keys. Measured errors: height <0.3 mm; shore wave <0.02 mm. These compare the analytic functions, not a coarse display mesh.
- Existing camera, lighting, vegetation, fish and seagull checks cover their integration paths. Inspect shore, shell-level, aerial, night and narrow-screen views as well as the original scene.

Work is isolated on `codex/azov-coast`. The `5d6423f` baseline preserves the main checkout's pre-existing working state; `db14e8f` integrates the reviewed tanker. No published scene file or main checkout was replaced by QA cameras or lighting. The main checkout's 45 inherited files were subsequently preserved without content changes in checkpoint `404f464`, leaving that tree clean (including its original review artifacts). Local review server: port 41213. No deployment is part of this stage.

## Taganrog reference and procedural controls

The north Taganrog coast combines soft loam/clay and sand with resistant carbonate debris. The Merzhanovo field study describes limestone megaclasts left behind as softer landslide deposits erode ([Geosciences field paper](https://www.mdpi.com/2076-3263/11/3/129)). This motivates a soil cap, ochre exposure and pale weathered rock rather than one uniform grey cliff. `terrainErosion` cuts deterministic drainage channels; `terrainSoil` and `terrainWeathering` control the surface layers and future habitat dryness.

`terrainStorm` is an artistic weather envelope: it increases the shore-wave amplitude and foam, shortens the period and strengthens the habitat wind. Maximum wave displacement is 0.48 m and water bounds allow ±0.5 m. It is not a storm-surge solver. Wind-driven water-level changes are significant in this shallow bay ([Taganrog setdown study](https://www.sciencedirect.com/science/article/abs/pii/S0272771424002981)). `terrainBloom` adds slowly drifting green patches to water-body shading, inspired by the bay's cyanobacterial blooms ([VNIRO observations](https://azniirkh.vniro.ru/content/read/archive/novosti/o-letnih-tsveteniyah-sinezelenyih-vodorosley-v-taganrogskom-zalive)). Default bloom and storm are zero.

Low-frequency domain warping breaks the regular PBR repeat without extra texture reads. All channels sample the same warped/parallax coordinates; the normal derivative basis uses warped coordinates **before** parallax to avoid grazing-angle bands. Recent wave phases keep the ground wet after withdrawal, and a bounded foam remnant is shared by water and the ground material.

## Runtime budgets

Visible boat and sculpture LOD reuse reduced index buffers on the original meshes; anchors, motion and collision identity remain intact. Distance and projected size both govern hysteresis. Distant airborne gulls use one instanced alpha-masked silhouette batch; perched/landing/shot birds keep their rig. Behaviour and sound continue independently of visual detail.

Hidden documents set the R3F frame loop to `never`. `sceneTimeline` retains elapsed active time across R3F's clock restart, preserving procedural phase on resume. Audio visibility handling remains in the shared sound engine. DEV-only canvas telemetry exposes elapsed time and frame count for real hide/resume verification.

Additional browser checks:

- `/scripts/check-water-surface-gpu.html` renders the actual V2 vertex shader with known state textures, checking world-space strips against the rotated pond geometry and CPU surface probes, including world/view normals. Its renderer regression reproduces cached uniform-map replacement and verifies that in-place edits reach the GPU.
- `/scripts/check-scene-visibility.html` exercises real R3F frames with a synthetic document visibility event. In the recorded 1.2 s hidden interval, frames and elapsed time stayed exactly fixed; resume advanced by 0.2017 s after a 0.2 s active interval. This is an integration test, not a physical iOS backgrounding test.
- Narrow preview at 390 px exercised low-power terrain LOD (53,720 land triangles), 128² water simulation and parallax-off material path on the desktop GPU. It does not establish iPhone/iPad frame rate or Safari compatibility; those require the actual device. The actual editor panel and shoreline camera were also inspected at 390 and 768 px, including scrolling to the final controls.

## Coastal shrubs

`WaterScene` creates one deterministic shrub population and its ground-cover map.
**Озеленение → Кустарники / Greenery → Shrubs** controls population, coastal region,
shape, dry/fresh colonies, crown patches, gust response and render distance. Default
planting is 512 shrubs over a 120 × 24 m curved coastal region. The count is a target:
unsuitable or crowded land can yield fewer plants. Changing colour or wind retains
root positions. Habitat permits soil on gentle bluff shoulders and excludes water,
steep faces and the actual rock colliders. A `pathMask` contract is ready for future paths.

`CoastShrubs` uses the reviewed portable lab geometry, PBR leaf textures and the shared
scene clock/light/fog. Speed and bearing come from terrain weather, including storm;
shader bending saturates at strong wind to keep geometry inside its declared bounds.
Litter/vigor masks blend into the terrain's existing PBR shading under each crown.
Shrubs do not create another light, water reflection target or audio context. Their
visual LOD and ground cover do not replace the analytic terrain/collision query.

Near and mid leaves share petiole anchors. Far LOD samples 24 projections (8 azimuths
at 0/45/90° elevation), with an extra coordinate atlas to reconstruct the same ecology
field. Atlas frames are 256² on desktop and 128² for touch/low-power profiles. Roots
and counts stay authored on mobile; only visual detail and temporary GPU textures
shrink. Close views below 2 m retain curved leaves. The planting/close-up buttons
change the free camera only; authored camera snapshots are not rewritten.

- `node scripts/check-coast-plants.mjs`: anchoring, rock/water/slope/path exclusion,
  deterministic identities, settings bounds and the ground-cover buffer.
- `/scripts/check-coast-plant-settings.html`: all shrub controls survive publication
  serialization and camera snapshots.
- `node scripts/check-coast-plant-ui.mjs`: actual editor, preview poses, live dryness,
  touch phone/tablet profile, shader errors and layout. Its isolated storage enables
  colour for inspection and blocks publication requests. `PLANT_GPU_BACKEND=metal`
  uses native macOS graphics for QA; default is portable SwiftShader. Neither proves
  physical iOS Safari frame rate.

The reusable workflow is `.agents/skills/ddg-procedural-vegetation/SKILL.md`.
The laboratory remains in its own worktree/port; the product branch carries portable
assets and scene integration. The pre-existing mutable published-scene file is excluded
from vegetation commits.
