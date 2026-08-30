# Home-scene creatures

This directory owns procedural creature behaviour that can be tested without
mounting the Three.js home scene. The first production collection is seagulls.

## Seagull integration contract

- The water surface datum is world `y=0`; flight routes and downed physics use
  that coordinate directly.
- Load `/models/seagull/seagull-flight.glb` lazily only when seagulls are
  enabled. The GLB contains skinning but no animation clips or embedded maps.
- Build one shared PBR material from the four external WebP maps in
  `seagullAsset.js`. Use sRGB only for albedo; keep normal, ORM and specular as
  data textures with `flipY=false`.
- Share geometry and material between birds. Clone only the skeleton.
- Reuse the home scene's existing directional shadow map; never create a bird
  light or a second shadow map. On medium/high desktop, allow at most two
  skinned casters selected by `seagullShadowLod.js`: perched, landing, taking
  off, falling or low birds inside the boat/sculpture receiver footprint. Keep
  high/long routes, low-power/mobile birds and all feather particles out of the
  shadow map.
- Reuse the existing planar water reflection target; never create a bird-only
  target. `seagullReflectionLod.js` selects at most three high-tier or two
  medium-tier desktop birds that are low, large enough on screen and visible to
  the mirrored view. Mobile/low-power, high routes, removed birds, feathers and
  rig helpers stay out of the capture. The reflection adapter must temporarily
  hide excluded bird roots through `seagullReflectionCapture.js` only around
  the mirrored `gl.render` call, restore visibility in `finally`, and keep the
  reflection cadence active while any selected bird is animated.
- Use at most nine birds on desktop and five on low-power/mobile profiles. The
  runtime hard ceiling is twelve.
- Landing anchors must be children of the live `boat` or `sculpture-anchor`
  transform so a perched bird inherits translation, arbitrary tilt and boat
  buoyancy. Each anchor retains the actual collision mesh through
  `collisionObject` for foot fitting and downed-body sweeps. Failure of one
  point after an extreme editor transform must not take down the WebGL scene.
- Cursor hover and LMB shooting share the canvas without calling
  `preventDefault` or `stopPropagation`; a shot is accepted only for a short,
  stationary pointer gesture over a screen-size-aware bird target. Water's
  cursor plane suppresses its synthetic click impulse for that gesture, while
  the eventual body contact emits the real impulse.
- Water impacts enter the same bounded GPU impulse queue as the live cursor.
  A downed body keeps entry momentum, briefly submerges, rises under damped
  buoyancy, samples the animated surface normal, then remains afloat with slow
  drift and bobbing instead of using the solid-surface despawn timer.
- The caller supplies landing sites and water height to the pure runtime and is
  responsible for disposing cloned skeleton resources on unmount.

Run `npm run check:seagulls` before mounting or changing this runtime. The check
includes the real published boat/sculpture hierarchy and requires all five
dual-foot landing anchors to resolve.

## River-fish integration contract

- The production payload is only `public/models/fish`: three metre-scale GLB
  rigs, their external PBR maps and manifests. Blender authoring, generators and
  the warm-white asset lab stay on `codex/asset-lab`.
- Pike is the solitary predator, perch forms a loose middle group, and roach is
  the dense school. The authored 50-fish mix is `1 + 11 + 38`; editor controls
  change the total, activity, school cohesion and vertical range without
  exposing low-level species physics.
- Render one `InstancedMesh` per visible species. The vertex shader consumes the
  GLB skin weights to drive the axial body wave and pectoral-fin tips, retaining
  the authored rig contract without cloning 50 skeletons.
- Fish are opaque contents of the existing refraction capture. The opaque water
  surface composites them in the normal pass; explicitly hide the fish root
  during planar reflection and never allocate a fish-only render target or
  shadow map.
- Track the animated surface with a small rotating CPU cache fed by one bounded
  GPU probe at a time. Never read the water target once per fish. Low-power
  profiles use the conservative deepest-wave ceiling.
- Refresh boat and arbitrarily tilted sculpture AABBs at 5 Hz and steer/push
  fish around those world-space proxies. Keep the authored school near the
  composition centre instead of scattering it over the full lake extent.
- Runtime caps are 50 high desktop, 30 medium, 14 low and 18 on a phone. The
  requested and effective totals must remain separately visible in diagnostics.

Run `npm run check:fish` after changing fish assets, behaviour or rendering. It
pins the payload hashes, validates rig weights/bounds, runs ten simulated
minutes at 50 fish and injects the production deformation into every real GLB.
