# Lighting system — one implementation plan

## Spine and grafts

**Spine: Design 2.** CPU sky LUT → `DataTexture` → cached PMREM; one shared GLSL sky/disc function; hardware-PCF shadow fetch into the water; zero new render passes. It scored highest on fit and performance and every mechanical claim it makes about the installed dependencies checks out (verified below).

**Grafts, and what they displace:**

| Graft | From | Displaces |
|---|---|---|
| Saturating in-scatter closed form + scale-height-folded Rayleigh constants | Design 3 | Design 2's A2 formula, which is unit-wrong and linear in air mass |
| One shared `celestialBody()` = the sun in the sky, in the water, and in the specular lobe | Designs 1+2 | the sprite, its offscreen-pass juggling, and the third god-ray anchor |
| `cloudCover` moves energy from key to fill *structurally*, because the IBL is a PMREM of the same LUT | Design 3 | any second "ambient" control |
| `directShare` derived in the same CPU loop | Design 2 | Design 3's hardcoded `0.55 + 0.45*forwardScatter` |
| Time drives elevation only; bearing stays authored | Design 3 | Design 1's latitude + dayOfYear + northOffset triple |
| Disc at true angular size, coupled to the key radiance | Design 1 | Design 1's unbounded `E/Ω` (see contradiction 3) |

### Verified against the repo (not assumed)

- `node_modules/three/src/extras/PMREMGenerator.js:266` — `_setSize(texture.image.width / 4)` for equirect; `:288-289` — target is `3*max(cubeSize,112) × 4*cubeSize`. A 256-wide LUT gives cubeSize 64 → a 336×256 RGBA16F PMREM.
- `node_modules/three/src/renderers/webgl/WebGLShadowMap.js:253-266` — under `PCFShadowMap`, `shadow.map.depthTexture` gets `compareFunction = LessEqualCompare` and `Linear` min/mag. The hardware-PCF path is real.
- `node_modules/three/src/renderers/webgl/WebGLProgram.js:797-801` — `#version 300 es` for anything that is not a `RawShaderMaterial`. The water is a `<shaderMaterial>`, so `sampler2DShadow` + `texture(map, vec3)` compiles.
- `node_modules/three/src/renderers/webgl/WebGLPrograms.js:166-176` — `toneMapping = NoToneMapping` whenever `currentRenderTarget !== null`. **This is load-bearing** (contradiction 3).
- `node_modules/three/src/renderers/WebGLRenderer.js:1379` — lights are culled by `object.layers.test(camera.layers)`. One layer bit removes a light *and* its illumination from the mirror.
- `src/components/effects/WaterScene.jsx:224` — `<WaterLights>` is a child of `<WaterReflections>`, which is the `reflectionContext.Provider` (`WaterReflections.jsx:378`, value is the `reflectionData` ref from `:103`). Publishing the shadow handles there is a field on an existing ref, not new plumbing.
- `scripts/smoke-test.mjs:340-358` — editor keys are harvested by regex `handleSettingChange\(event,\s*'([^']+)'`, root-key only; `:596-603` asserts every one is in `publishedHomeSceneKeys` (except 4 dev-local keys); `:681` asserts every publish key exists in `publishedHomeSceneSettings`. `publishedHomeSceneKeys.js` = **154** entries; `publishedHomeSceneSettings.js` = 212 lines of key (nested layout objects inflate it).
- `src/components/effects/ScenePostProcessing.jsx:43,225,339,394` — the post shader already has `uExposure` applied as `exp2()`, fed from `settings.colorExposure`.

---

## Contradictions, resolved

**1. Sky math — Design 3's form wins, Design 2's constants are wrong.**
Design 2 states `BETA_R = [5.802e-3, 13.558e-3, 33.1e-3]` "1/km" and then multiplies by a *dimensionless relative* air mass. The ~8 km Rayleigh scale height is missing; the exponent is ~8× too small. At a 5° sun its red/blue transmittance ratio is 1.32 where physics gives ~17. Design 3's `betaR = [0.058, 0.135, 0.331]` is exactly 10× Design 2's, i.e. already integrated through the column — that is the correct per-unit-air-mass constant. Adopt Design 3's constants and its saturating form `(βR·pr + βM·pm)/βT · (1 − exp(−βT·m))`; Design 2's `× airMass(d.y)` linear form cannot redden the horizon relative to the zenith and is deleted.

**2. Sunset zenith — neither design handles it; one lerp does.**
Multiplying the whole dome by a single sun transmittance reddens the zenith at sunset, which is wrong. Fix with a two-point fit of the sun's path length at the scattering altitude, computed once per bake on the CPU:
```
tSunLow  = exp(-βT · mSun)          // scattering points near the horizon: full path
tSunHigh = exp(-βT · mSun · 0.35)   // high scattering points: shorter path
tSun(ray) = mix(tSunLow, tSunHigh, max(ray.y, 0))
```
`// ponytail: two-point fit of what a raymarch integrates. Ceiling: no ozone tent, so the twilight blue band is missing. Upgrade = Design 1's 16-step march into the same LUT, same shape, ~8x CPU.`

**3. No auto-exposure, and the disc radiance is bounded.**
Design 1's `gl.toneMappingExposure` meter is inert with post on: `WebGLPrograms.js:166-176` compiles tone mapping out for render-target renders, and `ScenePostProcessing.jsx:467-469` renders the whole scene into a target. So there is currently **no tone map at all on the post path** — a pre-existing condition masked by `postProcessingEnabled: false` in production. Consequences:
- One `exposureEv` slider, two sinks: `gl.toneMappingExposure = 2**ev` (post off) **and** `uniforms.uExposure.value = ev` (post on, the uniform already exists). `colorExposure` is absorbed.
- The sun disc radiance is `keyRadiance × SKY_DISC_GAIN` with `SKY_DISC_GAIN = 24.0` fixed — **not** `E/Ω`. At `sunAngularSize` 0.25× the `E/Ω` identity gives ~2.4e5, which overflows the half-float reflection/refraction/post targets to `Inf`. Take Design 1's *coupling* (the disc, the light and the water's lobe are the same radiance at the same angular size); reject its magnitude.

**4. Sun/moon handover is a blend, not a threshold.** Design 3's `night > 0.5` for direction and truthy-`night` for intensity disagree between +2° and 0°, and its key sits at 27% of `sunIntensity` when the azimuth flips 180°. Replace with one continuous weight, no branch:
```
night   = smoothstep(2, -2, sunElevationDeg);        // 0 by day, 1 by night
keyDir  = normalize(mix(sunDir, moonDir, night));    // antipodal at the crossover, both on the horizon
keyRad  = sunRadiance * (1 - night) + moonRadiance * night;
```
At the crossover both bodies are at ~0° elevation, both radiances are already at their extinguished floor, and `mix` of two antipodal unit vectors is degenerate only at exactly `night = 0.5` — clamp `night` to `[0, 0.4999] ∪ [0.5001, 1]`, one line, or slerp. The shadow rotates through the horizon instead of snapping.

**5. Environment gain is not squared.** Design 3's `envIntensity` fed both `scene.environmentIntensity` and `envMapIntensity`, making the boat quadratic in one slider. Resolution: `envReflectionIntensity` is kept **exactly as it is today** (0..220%, the 2.2 ceiling the water's `sqrt(clamp(E*R, 0, 4.84))` curve is keyed to, `ENV_REFLECTION_SCALE.boat = 0.385` / `.sculpture = 0.455` still multiplying). `scene.environmentIntensity` is set to **1.0** and the sky's own absolute radiance carries the level. This also closes Design 2's dangling `uEnvironmentExposure`: it is fed from the LUT's hemispheric irradiance, normalised so the published look is 0.72 at the migrated hour.

**6. The sun glitter gets shadowed too.** Design 3 shadowed `moonHighlight` and `waterGlint` but left the `pow(mu, N)` sun lobe inside `skyColor()` unshadowed — the brightest key term on the water and the one a viewer reads as glitter. That path is water→sun; the boat is on it. It is shadowed.

**7. IBL is `fromEquirectangular`, not a CubeCamera.** Design 3's drei `<Environment>{children}</Environment>` portal re-renders 6 cube faces + PMREM on every parent render (`children` is a fresh element each time, and it is in the effect's dep array). Design 2's direct `pmremGenerator.fromEquirectangular(lut, cachedTarget)` is ~12 tiny draws, fires only on an explicit dirty flag, and frees the visible sky to be the cheapest possible thing.

**8. The visible sky is a fullscreen triangle, not a dome.** Since the IBL no longer needs a mesh inside a cube camera, take Design 2's 3-vertex triangle over Design 3's 32×16 sphere. It needs `frustumCulled = false` (a 3-vertex geometry with an origin-centred bounding sphere is culled the moment the camera looks away, which the published pose does).

**9. No `lights: true` on the water.** Design 3's claim that `shadowmap_pars_fragment` is self-contained is true (the `DirectionalLightShadow` struct is declared at `shadowmap_pars_fragment.glsl.js:30`), but `lights: true` still means merging `UniformsLib.lights` into a hand-built 33-uniform object and a full recompile whenever the light count changes — which the light-objects feature makes a user-facing hitch. Design 2's two handles off `light.shadow` win.

**10. `cloudCover` draws no clouds.** It is a lighting parameter. Say this to Denis before Phase 2, not after.

---

## The model

### New: `src/components/effects/sky/skyModel.js` (plain JS — no React, no three)

Called by `buildHomeSceneLighting`. Exports `SKY` constants, `skyRadianceJS(dir, state)`, `buildSkyLut(state)` and `solveSunDirection(settings)`.

```js
export const SKY = {
  betaR: [0.058, 0.135, 0.331],   // per unit relative air mass, scale height folded in
  betaM: 0.021,                    // x (0.4 + turbidity*0.36) below
  g: 0.76,
  inscatterGain: 12.0,
  discGain: 24.0,
};

// Kasten-Young. Clamped at -3 deg elevation: past 93.885 deg zenith it goes complex,
// and that is exactly the frame Denis will be looking at.
const airMass = (elevDeg) => {
  const z = 90 - Math.max(elevDeg, -3);
  return 1 / (Math.cos(z * DEG) + 0.15 * Math.pow(Math.max(93.885 - z, 0.6), -1.253));
};
```

**Sun path** — Design 2's arc, so the migration is bit-exact:
```js
const h   = (timeOfDay / 24) * TAU - Math.PI;                 // 0 at solar noon
const el  = Math.asin(Math.sin(noonEl) * Math.cos(h));
const az  = sunBearing + Math.atan2(Math.sin(h), Math.cos(noonEl) * Math.cos(h));
sunDir    = buildHomeSceneLightDirection(deg(az), deg(el));   // EXISTING helper, unchanged
```
At `timeOfDay = 12`, `h = 0` → `el = noonEl`, `az = sunBearing + atan2(0, cos(noonEl))` = `sunBearing`. Today's direction reproduced to 1e-12.

**Moon** — same great circle, hour angle `h + π + (moonPhase − 0.5)·2π`; illumination `(1 − cos(phaseAngle))/2` from the same number, so position and brightness cannot disagree. Radiance `= sunE0 × 2.1e-6 × illum × moonBrightness × tSun(moonEl)`.

**LUT** — 256×128 equirect desktop / 128×64 phone, standard mapping `u = atan2(z,x)/2π + 0.5`, `v = asin(y)/π + 0.5` (matching three's PMREM equirect shader is what keeps the water's sky and the boat's reflected sky the same sky).

Per texel:
```js
const mu   = dot(dir, keyDir);
const mass = airMass(degrees(asin(dir.y)));
const betaM = SKY.betaM * (0.4 + turbidity * 0.36);
const betaT = betaR.map(b => b + betaM);
const pr = 0.0596831 * (1 + mu*mu);
const g2 = 0.5776, d = Math.max(1 + g2 - 2*0.76*mu, 1e-3);
const pm = 0.0795775 * (1 - g2) / (d * Math.sqrt(d));         // no pow()
const tSun = mix(tSunLow, tSunHigh, Math.max(dir.y, 0));      // contradiction 2
let L = betaT.map((bt, c) =>
  (betaR[c]*pr + betaM*pm) / bt * (1 - Math.exp(-bt * mass))
  * keyRadiance[c] * tSun[c] * SKY.inscatterGain);
// CIE overcast dome, energy taken out of the beam put back into the sky
const overcast = zenithLum * (1 + 2*Math.max(dir.y, 0)) / 3;
L = mix(L, desaturate(overcast), smoothstep(0, 1, cloudCover));
// Below the horizon: the ground, not a mirrored sky. This IS the fill light.
if (dir.y < 0) L = mul(groundAlbedoLinear, skyIrradiance);
```

**The three integrated scalars, in the same loop, free:**
```
skyIrradiance  = Σ L(d)·max(d.y,0)·dΩ        -> environment.ambient, uEnvironmentExposure
keyIlluminance = keyRadiance · clamp(keyDir.y, 0, 1) · (1 - 0.9·cloudCover)
directShare    = |keyIlluminance| / (|keyIlluminance| + |skyIrradiance|)
```
`directShare` is the fraction of light a shadow is allowed to remove — the quantity the audit says is missing. Overcast drives it to ~0 by itself, so `cloudCover` fades the shadow with no second slider.

### New: `src/components/effects/water/skyEnvironment.js` (~70 lines, the only new three code)

One `THREE.DataTexture` 256×128 RGBA HalfFloat (`THREE.DataUtils.toHalfFloat` — half-float linear filtering is core WebGL2, float linear is an extension), `EquirectangularReflectionMapping`; one cached `pmremGenerator.fromEquirectangular(lut, cachedTarget)` → `scene.environment`. Rebuild trigger is an hour bucket (1/256 of a day) or any sky setting change. **For a published scene with a fixed hour this runs exactly once, at load.** The raw `DataTexture` (not the PMREM) goes to the water and the sky triangle.

### New: `src/components/effects/shaders/skyShader.js` — one string, imported by `SkyDome.jsx` AND `waterV2Shaders.js`

```glsl
vec3 skyRadiance(vec3 r) {
  vec2 uv = vec2(atan(r.z, r.x) * 0.15915494 + 0.5,
                 asin(clamp(r.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  return texture2D(uSkyLut, uv).rgb;
}

vec3 celestialBody(vec3 r, vec3 dir, vec3 radiance, float cosRadius, float glowPower) {
  float c  = dot(r, dir);
  float aa = max(fwidth(c), 1e-5);                                  // fwidth already used at waterV2Shaders.js:287
  return radiance * (smoothstep(cosRadius - aa, cosRadius + aa, c)
                   + pow(max(c, 0.0), glowPower) * uGlowStrength);
}
```
`cosRadius = cos(radians(0.53 * sunAngularSize) * 0.5)`; `glowPower = mix(2000.0, 12.0, cloudCover)`. This is the anti-drift measure: the repo's recurring failure is the same formula written twice (`scatteringDensity` in JS and GLSL, `absorptionColor` which has already diverged, the direction formula duplicated at `ScenePostProcessing.jsx:436-442`).

### The water (`waterV2Shaders.js`)

`skyColor()`'s palette ramp, the ±12% azimuth wobble, `reflectionTone()` and the hardcoded `pow(mu,420)*3.5 + pow(mu,28)*0.18` all go:
```glsl
vec3 reflection = skyRadiance(reflectedRay) * uEnvironmentLevel
                + celestialBody(reflectedRay, uKeyDirection, uKeyRadiance,
                                uKeyCosRadius, uKeyGlowPower) * shadow;   // contradiction 6
```
Net ALU: −1 mix, −2 pow, −1 atan, −1 cos, −8 (reflectionTone); +1 asin, +1 atan, +1 fetch, +2 pow. Roughly break-even, and the sky now tracks the sun because the texture does. `uEnvironmentLevel` keeps `sqrt(clamp(uEnvironmentExposure * uEnvironmentReflection, 0.0, 4.84))` and its 2.2 ceiling untouched.

**Shadow — one extra fetch, no second map, no three lighting chunks.** Take two handles off the existing directional light and publish them on the `reflectionData` ref that `WaterSurface`'s `useFrame(-2)` already reads:
```js
ctx.keyShadowMap    = light.shadow.map?.depthTexture ?? null;   // null until the first shadow render
ctx.keyShadowMatrix = light.shadow.matrix;
```
```glsl
// vertex: from the DISPLACED world position - a flat plane would be wrong on waves
vKeyShadowCoord = uKeyShadowMatrix * vec4(vSurfaceWorldPosition, 1.0);

// fragment
float keyShadow() {
#ifdef WATER_KEY_SHADOW
  if (uKeyShadowActive < 0.5) return 1.0;
  vec3 c = vKeyShadowCoord.xyz / vKeyShadowCoord.w;
  if (c.z > 1.0 || any(lessThan(c.xy, vec2(0.0))) || any(greaterThan(c.xy, vec2(1.0)))) return 1.0;
  return mix(1.0, texture(uKeyShadowMap, vec3(c.xy, c.z + uKeyShadowBias)), uShadowIntensity);
#else
  return 1.0;
#endif
}
```
Applied in four places, zero further fetches:
```glsl
moonHighlight *= shadow;
waterGlint    *= shadow;
reflection    += celestialBody(...) * shadow;
refraction = refractedScene * transmittance
           + scatterColor * scatterAmount * scatterLight
             * mix(1.0, shadow, uKeyDirectShare * uWaterShadowStrength)
             * (0.82 + forwardScatter * uKeyIntensity * 0.2);
```
That last `mix` is the fix for the worst live bug: today raising `waterTurbidity` **erases** the boat's shadow, because the unshadowed haze rises exactly as `refractedScene * transmittance` falls. After it, `scatterAmount` grows with turbidity *and* is occluded — murky water shows a **stronger** shadow shaft, which is what turbid water does.

**Shadow camera refit** (`WaterLights.jsx`), a straight bug fix:
```js
const casterRadius  = Math.max(hypot(boat.x,boat.z), hypot(sculpt.x,sculpt.z)) + 3.0;
const shadowFrustum = clamp(casterRadius, 4, 16);   // published: ~6.5, was 24
const standoff      = shadowFrustum + 6;            // was a fixed 18
// near = max(0.5, standoff - shadowFrustum - 1); far = standoff + shadowFrustum + 1;
```
13 m box instead of 48: 12.6 mm/texel at 1024 instead of 46.9, and the near plane can no longer clip a caster at low sun. That is 3.7× sharper for free, which is what lets the `shadowMapSize >= 640` gate be **deleted** so `shadowsEnabled` finally means something on a phone (25 mm/texel at a 512 map — better than desktop is today). `shadow-bias` starts reading `settings.shadowBias`, and the published `-0.0042` (21× the hardcoded value, never once rendered) is re-authored to `-0.0006` in the same commit.

**Light objects** — `settings.lights`, max 2, `<spotLight castShadow={false}>` (point when `coneAngle >= 180`) plus `light-N-anchor` and `light-N-target` empties. The manipulator is the **existing** `EditorGizmo`: two entries in `GIZMO_TARGETS` (`EditorGizmo.jsx:18-31`) with all three translate axes, resolved by name exactly as `boat-anchor` is. The target pivot uses the **existing** `useDragOnPlane` hook the boat and sculpture share. Zero new interaction code — that is the Corona-Light pivot drag, already written and already wired to disable orbit while dragging. `visibleInReflections` is one layer bit (3) on the light and its emissive source mesh, plus `reflectionCamera.layers.disable(3)`; `WebGLRenderer.js:1379` then removes both the source and its illumination from the mirror. Boat, sculpture and seabed get these lights free through three's standard lighting; the water gets an unrolled 2-light block, ~24 ALU, no fetch, disabled by multiplying by intensity 0.

---

## Settings ledger and publish accounting

`publishedHomeSceneKeys.js` currently has **154** entries. Every editor control matching `handleSettingChange(event, 'key'` must be in it (`smoke-test.mjs:596-603`), and every key in it must exist in `publishedHomeSceneSettings.js` (`:681`). Both files change in the same commit as the code.

### Deleted outright — 16 keys
`hdrPreset` · `hdrExposure` · `hdrRotation` · `showHdriBackground` · `envTint` · `keyLightType` · `lightDiscEnabled` · `moonElevation` · `moonSpecularPower` · `shadowRadius` · `ambientIntensity` · `ambientColor` · `hemisphereIntensity` · `hemisphereSkyColor` · `hemisphereGroundColor` · `colorExposure`

Why each is safe to remove:
- `hdrPreset` — five of six values fetch `raw.githack.com` at runtime; its palette role is replaced by the LUT. `SELF_HOSTED_HDRI.night` survives as the one file behind `envMode: 'hdri'`.
- `hdrRotation` — only phase-shifted a ±12% cosine on the water. `sunBearing` *is* the sky rotation now.
- `envTint` — its value channel was floor-clamped at 0.45 (`waterV2Shaders.js:112`), so the label lied, and at the published `#949494` it is already near-identity.
- `keyLightType` / `lightDiscEnabled` — the hour decides sun vs moon; the sun is in the sky.
- `shadowRadius` — derived from `sunAngularSize` and `cloudCover` (see below).
- The five ambient/hemisphere keys — **no editor controls exist for any of them**, and `WaterLights.jsx:16-17` caps them (`min(sqrt(0.81)*0.36, 0.32)` — the published value lands *exactly* on the ceiling). The LUT's ground hemisphere and `skyIrradiance` replace both fill lights.
- `colorExposure` — absorbed by `exposureEv`, which writes the same `uExposure` uniform.

### Renamed — 5 out, 5 in (one migration block beside the existing `lightColor→moonColor` one at `useHomeSceneSettings.js:355-373`)
`moonAzimuth → sunBearing` · `moonIntensity → sunIntensity` · `moonColor → sunTint` · `moonSpecularStrength → keySpecularStrength` · `lightDiscSize → sunAngularSize`

`sunTint` is no longer *the* key colour — it is a multiplicative bias on the physically-derived one, default `#ffffff`. Migration solves `sunTint = publishedColor / physicalColor(migratedHour)`, clamped, so the published frame does not jump.

`sunAngularSize` absorbs `moonSpecularPower`: `specularPower = clamp(2.0/alpha^2 - 2.0, 4.0, 128.0)`. One control for how big the sun is and how tight its highlight is, instead of two that fought.

### Added — 12 keys
| key | range | meaning |
|---|---|---|
| `timeOfDay` | 0–24 h, step 0.05 | Solar hour. 12 = highest. Goes **below** the horizon — night becomes a real state, not a palette name. |
| `sunNoonElevation` | 5–88° | How high the sun climbs at noon (latitude+season made visible). Sets the arc; `timeOfDay` sets the position along it. Orthogonal by construction. |
| `skyTurbidity` | 1–10 | Aerosol load. Whitens the horizon, grows the halo, reddens the low sun. Keeps shadows **sharp** — that is what distinguishes it from cloud. |
| `cloudCover` | 0–100 % | Moves energy out of the beam into the CIE overcast dome. Dims the key, raises the fill (structurally — the IBL is a PMREM of this sky), widens the penumbra, drops shadow contrast. One slider, four coupled consequences, zero GPU cost. |
| `moonPhase` | 0–1 | Sets the moon's hour-angle offset from the sun **and** its illumination from the same number. |
| `moonBrightness` | 0–2× | Multiplier on physical moonlight (~1/400 000 of sun). Lets night be readable without lying about where the light is. |
| `groundAlbedo` | hex | Reflectance written into the lower hemisphere of the LUT. Reaches the PMREM, the water and the custom shaders identically — no fill light needed. |
| `exposureEv` | −3…+3 EV | Scene brightness. `gl.toneMappingExposure = 2**ev` and post `uExposure = ev`. |
| `envMode` | `'sky'` \| `'hdri'` | Where PBR materials get IBL. `'sky'` (default) = PMREM of the LUT, no fetch. `'hdri'` = drei `<Environment>` with the one self-hosted file. Two states, not a blend — cross-fading costs a second PMREM. |
| `hdriIntensity` | 0–220 % | Live only in `'hdri'`; greyed out otherwise so it cannot silently do nothing. |
| `waterShadowStrength` | 0–1 | How much the key shadow darkens the water's own haze. Multiplied by `directShare`, so overcast switches it off by itself. |
| `lights` | array, max 2 | `{ type, position, target, color, intensity, coneAngle 5–180°, penumbra, sourceVisible, sourceRadius, visibleInReflections }`. Never cast shadows. |

**Kept, deliberately unchanged:** `envReflectionIntensity` (0–220%, the 2.2 ceiling, and the boat 0.385 / sculpture 0.455 multipliers), `shadowsEnabled`, `shadowIntensity`, `shadowBias` (finally read), `waterTurbidity`, `waterScatteringColor`, `waterScatteringStrength`, `waterDepthMeters`, all the fog/bloom/grain/grade keys except `colorExposure`.

**Net: 154 − 16 − 5 + 5 + 12 = 150 publish keys.** The `lights` array will not be caught by the smoke test's regex (it is not a `handleSettingChange(event, 'lights')` call) — add it to `publishedHomeSceneKeys.js` anyway, and give it `[]` in `publishedHomeSceneSettings.js`.

---

## Phases

### Phase 1 — One sun, one sky, one piece of math *(look-preserving)*

**Work.** New `sky/skyModel.js`, `shaders/skyShader.js`, `water/skyEnvironment.js`, `water/SkyDome.jsx` (3-vertex triangle, `frustumCulled={false}`, `depthTest` on, `depthWrite` off, `renderOrder={2}`, `gl_Position = vec4(pos.xy, 1.0, 1.0)`). `homeSceneLighting.js` rewritten: the scattering model, the LUT builder, `skyIrradiance`/`directShare`; `HOME_SCENE_HDRI_PALETTES` and the ten never-read fields deleted (which takes both GLSL-duplicated ones with them). `waterV2Shaders.js` swaps its palette ramp and two hardcoded sun `pow`s for the shared functions. `WaterLights.jsx` loses the `celestial-disc` sprite, `<ambientLight>`, `<hemisphereLight>` and (in `'sky'` mode) drei `<Environment>`. `WaterReflections.jsx` hides `sky-dome` in **both** offscreen passes, in the exact block that hides `celestial-disc` today (`:299, :305, :373`) — miss one and the mirror gets a doubled sky. `<color attach="background" args={['#040507']} />` stays as the clear behind the triangle (only the reflection pass nulls it today; the refraction pass would otherwise change what it captures at uncovered pixels).

**No new editor controls yet.** `timeOfDay`/`sunNoonElevation` are derived from the existing `moonAzimuth`/`moonElevation`. The frame is meant to look the same.

**Verifiable.** Screenshot the published pose. Sun disc, water sun-glitter and directional light land on one screen point: today's **12.6°** disagreement measures 0.0°. Orbit — the disc no longer parallaxes and no longer paints over the boat (`depthTest: false` is gone with the sprite). Network panel: no `dikhololo_night_1k.hdr` (1 745 132 bytes), no `raw.githack.com`, and first paint no longer blocks on r3f's Suspense.

### Phase 2 — Time of day, moon, cloud

**Work.** Replace `moonAzimuth`/`moonElevation` with `timeOfDay` + `sunBearing` + `sunNoonElevation`; add `skyTurbidity`, `cloudCover`, `moonPhase`, `moonBrightness`, `groundAlbedo`, `exposureEv`, `envMode`, `hdriIntensity`. Delete the two fill lights and their five keys. Sun/moon crossfade per contradiction 4. `uEnvironmentDiffuse` stops being a second name for exposure and becomes the sky irradiance level — which makes the *existing* ambient-chroma GLSL in the seabed, lily and algae shaders correct with **zero GLSL edits**. Refit the shadow camera. Editor: the `hdri` node in `editorTree.js` becomes `sky`; the light section becomes the clock. Migration block, clamps, publish keys, translations. **Re-author `publishedHomeSceneSettings.js` as the last step of this phase.**

**Verifiable.** Sweep `timeOfDay` 4 → 22: the horizon reddens on its own with no palette switch; the shadow rotates and lengthens; the sun sets; the moon rises opposite it with no intensity step and no azimuth snap at the crossover. Sweep `cloudCover` 0 → 100 at noon: the shadow fades while the frame stays bright. `buildHomeSceneLighting({})` still returns a complete object; the memo at `WaterScene.jsx:146` still changes identity only on a settings change. Runnable check (`node src/components/effects/sky/skyModel.check.js`) asserting: direction unit length and sign; `timeOfDay = 12` reproducing the legacy az/el to 1e-12; red/blue sun transmittance ratio > 10 at 5° elevation and > 1000 at 0°; `directShare → 0` at `cloudCover` 1. **This is the first runnable check in the repo.**

### Phase 3 — The shadow reaches the water

**First task, before any other code:** confirm `sampler2DShadow` + `texture(map, vec3)` compiles in a raw `<shaderMaterial>` on a **real iOS device**. `WebGLProgram.js:797-801` says it will (three's own PCF chunk uses that syntax under `#version 300 es`), but that is evidence, not a test. Fallback if it fails: `BasicShadowMap` (`compareFunction = null`, Nearest) and a hand comparison, at the cost of a harder edge.

**Work.** Publish `light.shadow.map.depthTexture` and `light.shadow.matrix` on the `reflectionData` ref — tolerate `null` and re-read **every frame** (the map is null until the first shadow render and is recreated when the map size changes; copy the pattern the reflection textures already use, do not cache in a memo). Add `vKeyShadowCoord`, one `sampler2DShadow` compare behind a `#define` set from the quality tier, and the four multiplies. Add `waterShadowStrength`. Wire `shadowBias` to the light and re-author the published value. Wire `cloudCover` into `shadowRadius`:
```js
const penumbraAngle = radians(0.53 * sunAngularSize) + cloudCover * 0.52;
shadowRadius    = clamp(1.2 * tan(penumbraAngle) / texelWorld, 0.5, 4);   // ceiling 4, not 8
shadowIntensity = settings.shadowIntensity * (1 - 0.75 * cloudCover);
```
Delete the `shadowMapSize >= 640` gate.

**Verifiable.** Put the boat between the sun and the camera: its shadow appears **on** the water it floats on — today it casts none. Raise `waterTurbidity` 0.08 → 0.6: the shadow gets **stronger**, the exact inverse of today. The sparkles go dark inside it. Resize below 768 px or open on a phone: shadows appear where the 512-vs-640 gate silently removed them. Measured from recorded pixels on a fixed camera sweep with the dev servers stopped — a check sharing the camera with the shader cannot see an error in it.

### Phase 4 — Light objects

**Work.** `SceneLightObjects.jsx` (spot/point + two named empties + optional emissive source sphere). Two entries in `GIZMO_TARGETS`. `useDragOnPlane` for the target pivot. One `reflectionCamera.layers.disable(3)` call. `pickLights()` normaliser (cap 2, clamp every field). New editor section under `atmosphere`. Unrolled 2-light block in the water shader.

**Verifiable.** Add a spot, drag the pivot, drag the target: the cone pool moves across the water **and** across the boat and seabed together. Untick "In Reflections" and both the glowing source and its illumination vanish from the mirror while staying in the direct view. Draw-call and pass counts identical before and after adding both lights.

### Phase 5 — Collect the budget

**Work.** Delete `oceanSky`, `waterVertexShader`, `waterFragmentShader` from `waterRuntimeShaders.js` (nothing imports them; `WaterScene.jsx:33-34` is a literally empty import). Delete the duplicated az/el formula at `ScenePostProcessing.jsx:436-442` and anchor `uSunUv` to the shared key direction through a ref read inside `useFrame` — **not** a third copy of the spherical formula, and not through `settings` (that would be a React commit per frame). Delete the two unreachable low-power branches (`uBloomTapCount 9`, `uSunRaySampleCount 8`) whose effects are already force-disabled on the same devices. Add `#include <tonemapping_fragment>` to the post shader's tail and swap the `dithering`/`colorspace` order to match three's.

**Verifiable.** `grep` for the deleted names returns nothing. God rays finally *can* fire, because `timeOfDay` puts the sun below the top frustum plane at sunrise and sunset — which is when god rays exist anyway. Frame time on a mid-range phone equal to or better than the pre-Phase-1 baseline, measured from recorded pixels on a fixed camera sweep.

---

## Phone budget

**Per frame (public, low tier):**
- Sky triangle: 3 vertices, depth-tested against the already-drawn scene, so it shades **only** actual sky pixels (~25–40% of this composition). 1 fetch + 2 `pow`. ~0.05 ms.
- Water surface: **+1** LUT fetch, **+1** hardware-PCF shadow fetch (4 filtered taps for the price of one), +1 `mat4 × vec4` in the vertex shader. Against that the old path gives back 1 mix, 2 pow, 1 atan, 1 cos and the whole 8-ALU `reflectionTone()`. Net ≈ **+1.2 fetches per water pixel**: 0.1–0.2 ms at ~800×400 water pixels.
- Light objects: 0 passes, 0 fetches, ~24 ALU.
- Unchanged: one shadow map, the ping-pong sim, the planar reflection, the refraction, the single post quad. **No fourth full-scene submission is added.**

**Per hour bucket** (1/256 of a day; for a published static scene, **exactly once at load**): LUT 128×64 on phone = 8192 texels × ~45 flops + 3 `Math.exp` each ≈ **0.6 ms JS**, plus 32 768 `toHalfFloat` ≈ 0.1 ms, plus one 32 KB upload and `fromEquirectangular` at cubeSize 32 (a 336×64 target from ~12 tiny draws) ≈ 0.3 ms. Desktop is 256×128 → ~2.5 ms, still once.

**Scales down:** LUT 128×64; the shadow fetch is compiled out via `#define` (the tier is fixed for the session, so the recompile is free and the fetch genuinely disappears); hour bucket coarsened to 1/64 of a day when time is animated; `envMode` forced to `'sky'`. What does **not** scale down is the sky model — it is CPU work that runs once. A phone gets the same sky as a desktop.

**Removed from load:** a 1 745 132-byte blocking `.hdr` fetch that today holds the whole route at the Suspense fallback and, if it fails, takes the scene down to the WebGL-unsupported screen; the `raw.githack.com` dependency; two lights out of every lit material's loop; one additive sprite draw with `depthTest: false` and two visibility save/restore blocks per offscreen pass.

**Refused, explicitly:** a second shadow map (no cascades, no VSM, no PCSS; light objects never cast). A `CubeCamera` (6 scene draws). PMREM per frame or per un-quantised settings change. A ray-marched volumetric shadow in the water — there is no world-space refracted ray today, and building one to march over the largest surface in the frame is the most expensive thing this design could do; one surface sample used four times buys ~90% of the look. An occlusion pre-pass for god rays. Aerial perspective on geometry (needs a depth term that exists only in the post pass, and post is off in production). Hosek-Wilkie or a tabulated sky. More than 2 light objects. `shadowRadius` above 4.

---

## What will not be photoreal, and why

1. **No clouds are drawn.** `cloudCover` flattens the sky's shape, dims the beam and softens the shadow. There is no cloud texture, no shape, no shadow from a cloud. Ceiling: a second LUT channel and one more fetch. **Tell Denis before Phase 2.**
2. **Single scattering only, no ozone.** Twilight below about −4° sun is darker and less blue than reality — the real sky's deep-blue twilight band comes from ozone absorption and multiple scattering, neither of which is here. `moonBrightness` and `groundAlbedo` are the compensating knobs. Upgrade: Design 1's 16-step march with an ozone tent, same LUT shape, ~8× the CPU bake (still once at load).
3. **The zenith-vs-horizon sun transmittance is a two-point lerp**, not an integral. At extreme turbidity the sunset zenith will be a few percent warmer than it should be.
4. **The water's shadow is one sample at the surface.** No shaft structure through the column, no god rays inside the water, no shadowed caustics. It reads correctly because the term it multiplies (`scatterAmount`) already grows with depth and turbidity.
5. **PCF's 5-tap Vogel disk is spatial dither, not a blur.** Above ~4 texels it reads as noise. That is why `cloudCover` also drops `shadowIntensity` to 0.25 — the noise hides in a faint shadow. A soft **and dark** shadow (a big bounce card, not overcast) is not reachable with `PCFShadowMap`; the answer would be a different shadow-map type, not a bigger radius.
6. **Light objects do not cast shadows, do not produce caustics, and do not appear in the seabed's refraction path** beyond what three's standard lighting gives it.
7. **The moon is always round.** `moonPhase` sets its position and brightness, not the shape of its disc.
8. **The reflected sky is the same LUT at the same resolution as the sky above**, so they cannot disagree — but the LUT is 2.8°/texel on a phone at 128×64, which is coarse for the sunset band. That is the one place where the phone visibly differs from the desktop.

---

## Risks, in order

1. **The published look shifts in Phase 2** when `moonColor` stops being the key colour. Mitigated by the solved `sunTint` migration, but `publishedHomeSceneSettings.js` must be re-authored in the same commit. Do it with a before/after screenshot pair. **Do not ship Phase 2 without re-publishing.**
2. **`sampler2DShadow` in a hand-written `ShaderMaterial`** — the evidence is strong (`WebGLProgram.js:797-801`) but it is the first task of Phase 3 on a real iOS device, not the last.
3. **`light.shadow.map` is null until the first shadow render** and is recreated when the map size changes. The per-frame assignment must tolerate null and re-read every frame.
4. **The sky triangle must be hidden in BOTH offscreen passes.** Easiest thing in the whole design to get half-right.
5. **The Phase-2 frustum refit changes texel size ~3×**, so `shadowBias` and the derived softness read differently. Both are re-authored in that phase; they are not independent of the frustum change.
6. **The hand-rolled shadow lookup drops three's `shadowNormalBias`.** Constant depth bias alone at a low sun on a near-horizontal surface is the textbook acne case. It holds here only because the shadow multiplies specular, glint and a smooth scatter term — all near zero over most of the water. If acne appears, add a normal-offset in the vertex shader (`worldPos += normal * uKeyShadowNormalBias`), one line.
7. **Animated time rebuilds the LUT + PMREM every ~5.6 scene-minutes** — at a 24 h/60 s sweep that is ~4 rebuilds/s, ~4 ms/s of GPU on a weak phone. Coarsen the bucket on the low tier. A static published hour rebuilds once.
8. **`envMode: 'hdri'` needs its own PMREM at the file's real resolution** (drei's `<Environment>` already does this). It cannot share the 256×128 cached target.
9. **16 deleted keys against a frozen literal in a repo whose only test is the smoke test.** The migration keeps the old keys accepted-and-mapped for one release rather than dropping them; a key dropped early reverts a saved scene to defaults through the existing `VALID_*` fallbacks with no error anywhere.