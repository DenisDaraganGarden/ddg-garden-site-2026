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
- Landing anchors must be children of `boat-anchor` or `sculpture-anchor` so a
  perched bird inherits translation, tilt and buoyancy. Each anchor must retain
  the actual collision mesh through `collisionObject` for foot fitting and
  downed-body sweeps.
- Cursor hover is passive: it may read canvas pointer position, but must not
  call `preventDefault`, `stopPropagation` or own `pointerdown`. The final shot
  dispatcher is connected only after the cursor flashlight input contract is
  stable.
- The caller supplies landing sites and water height to the pure runtime and is
  responsible for disposing cloned skeleton resources on unmount.

Run `npm run check:seagulls` before mounting or changing this runtime.
