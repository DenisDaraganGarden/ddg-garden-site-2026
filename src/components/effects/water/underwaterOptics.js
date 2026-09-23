import { BackSide, Color, FrontSide } from 'three';

// What a camera under the sea sees, reduced to what the renderer takes: a fog
// for the water it looks through, the surface drawn from below, and the
// waterline across its lens while it sits at the surface. UnderwaterView
// drives all three from one sample of the water under the eye.

// The lens: its front glass this far ahead of the eye, in metres.
export const LENS_RADIUS = 0.12;
// The lens is watched for a waterline while the eye is this close to the surface.
export const WATERLINE_REACH = 0.5;

const clamp01 = (x) => Math.min(Math.max(Number.isFinite(x) ? x : 0.5, 0), 1);

// How far one sees under water: 25 m in clear water, 3 m at full turbidity,
// the same factor for each step of the slider between them.
export const underwaterVisibility = (turbidity) => 25 * (3 / 25) ** clamp01(turbidity);

const waterColor = new Color();
const deepColor = new Color();

// fog: a THREE.FogExp2, written in place. It hides 1 − e^−(density·d)² of what
// stands d away, 98% at 2/density: that distance is the visibility. Its colour
// is the water's body as the sea shows it from above (shadeWater: between the
// deep and the water colour, lit by the fill and a share of the sun on a level
// surface), so night water is dark. Going down, the water thickens a little
// and the light from the surface fades. depth: metres of water over the eye;
// at or above the surface the colour is the surface's own murk.
export function underwaterFog(sea, lighting, depth, fog) {
  const visibility = underwaterVisibility(Number(sea?.bedTurbidity));
  const down = Math.max(depth, 0);
  fog.density = (2 / visibility) * (1 + 0.03 * down);
  waterColor.set(sea?.waterColor ?? '#2c7a64');
  deepColor.set(sea?.deepColor ?? '#143a40');
  const fill = lighting?.fill?.irradiance ?? [0.5, 0.5, 0.5];
  const sun = lighting?.key?.sceneRadiance ?? [0, 0, 0];
  const share = 0.15 + 0.45 * Math.max(lighting?.key?.direction?.[1] ?? 0, 0);
  const light = (0.55 / Math.PI) * Math.exp(-down / visibility);
  fog.color.setRGB(
    (waterColor.r + deepColor.r) * 0.5 * (fill[0] + sun[0] * share) * light,
    (waterColor.g + deepColor.g) * 0.5 * (fill[1] + sun[1] * share) * light,
    (waterColor.b + deepColor.b) * 0.5 * (fill[2] + sun[2] * share) * light,
  );
  return fog;
}

// The surface seen from just under it, with no water between: what comes down
// through it, the fill and the sun on a level plane, as a radiance.
export function surfaceGlow(lighting, out) {
  const fill = lighting?.fill?.irradiance ?? [0.5, 0.5, 0.5];
  const sun = lighting?.key?.sceneRadiance ?? [0, 0, 0];
  const up = Math.max(lighting?.key?.direction?.[1] ?? 0, 0);
  return out.setRGB((fill[0] + sun[0] * up) / Math.PI, (fill[1] + sun[1] * up) / Math.PI, (fill[2] + sun[2] * up) / Math.PI);
}

// The waterline on the lens. A pixel's ray d meets the flat front glass,
// LENS_RADIUS along the view axis f, at eye + d·r/(d·f), and that point stands
// s = s0 + r·(d·n)/(d·f) over the water plane through the surface under the
// eye (normal n; s0 the eye's own height over it). With d = f + x·right + y·up
// the ratio is linear in the ray's slopes x and y, and a perspective projection
// makes those linear in NDC (x = (ndc.x + P8)/P0, y = (ndc.y + P9)/P5, view
// offsets included). So the glass is cut by a straight line:
// s = A + B·ndc.x + C·ndc.y, in metres, positive on the air side.
// height: s0. water: { nx, ny, nz }. eye: camera.matrixWorld.elements (right,
// up and back in its first three columns). projection: projectionMatrix.elements.
export function lensWaterline(height, water, eye, projection, out = [0, 0, 0]) {
  const right = eye[0] * water.nx + eye[1] * water.ny + eye[2] * water.nz;
  const up = eye[4] * water.nx + eye[5] * water.ny + eye[6] * water.nz;
  const ahead = -(eye[8] * water.nx + eye[9] * water.ny + eye[10] * water.nz);
  out[0] = height + LENS_RADIUS * (ahead + right * projection[8] / projection[0] + up * projection[9] / projection[5]);
  out[1] = LENS_RADIUS * right / projection[0];
  out[2] = LENS_RADIUS * up / projection[5];
  return out;
}

// A sea material drawn from below while the eye is under the water: its back
// faces, through the WATER_UNDERSIDE branch. Above it the material is exactly
// what it was — front faces and no define — so that program is the old one.
// Each keeps its own compiled program: after the first dive a crossing
// compiles nothing.
export function setUnderside(material, under) {
  if (!material || (material.side === BackSide) === under) return;
  material.side = under ? BackSide : FrontSide;
  if (under) material.defines.WATER_UNDERSIDE = '';
  else delete material.defines.WATER_UNDERSIDE;
  material.needsUpdate = true;
}

// The sea's surface from below, for the fragment shaders that include
// waterShadingShader. uUnderwaterMurk: the fog's colour in linear light
// (underwater.murk), since the fog's own uniform is not linear on the canvas.
// Inside Snell's window, 48.6° either side of the vertical, the sky comes
// through, the whole hemisphere squeezed into it, and the sun with it: a small
// hot disc and a soft halo. Outside, the surface is a mirror of the water
// under it (total internal reflection): the murk where the reflected ray runs
// level, as the water at the horizon is, darker where it dives toward the
// deep, which rings the window. Fresnel runs to one at the window's rim, so
// the rim is sharp on calm water and ripples on a rough one; past the critical
// angle refract() returns zero and the same formula gives the mirror. The fog
// finishes it with distance. Behind the define, so the program drawn above the
// water does not even carry it.
export const waterUndersideShader = /* glsl */`
#ifdef WATER_UNDERSIDE
  uniform vec3 uUnderwaterMurk;
  vec3 waterUnderside(vec3 world, vec3 n, vec3 view) {
    vec3 sky = refract(-view, -n, 1.333);
    float mirror = 0.02 + 0.98 * pow(1.0 - clamp(dot(sky, n), 0.0, 1.0), 5.0);
    float dive = clamp(-reflect(-view, -n).y, 0.0, 1.0);
    vec3 murk = uUnderwaterMurk * (1.0 - 0.4 * dive);
    float toSun = max(dot(sky, uSunDirection), 0.0);
    float sun = (pow(toSun, 800.0) * 2.0 + pow(toSun, 48.0) * 0.08) * waterKeyVisibility(world);
    vec3 window = waterSkyIrradiance(sky) / WATER_PI + uSunRadiance * sun;
    return mix(window, murk, mirror);
  }
#endif
`;

// The end of a sea fragment shader. Above the water the fog stays where it
// always was, before the tone map, so that program is unchanged. From below it
// is the murk the whole scene fades into, laid on after the tone map and the
// output encoding as three's own materials (the seabed, the rocks) lay theirs
// on, and as three's fog colour assumes: display space when the frame is drawn
// straight to the canvas, linear in a render target. Before the tone map the
// sea's underside faded to a murk three times brighter than the seabed's with
// post-processing off.
export const waterFragmentTail = /* glsl */`
#ifndef WATER_UNDERSIDE
    #include <fog_fragment>
#endif
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
#ifdef WATER_UNDERSIDE
    #include <fog_fragment>
#endif
`;
