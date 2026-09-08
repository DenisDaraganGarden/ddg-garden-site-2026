// Shared distant-water body term.  The coast V2 strip blends to this exact
// term before it meets FarWater, so an offshore LOD/material boundary cannot
// become a colour band.
// The open-water swell both surfaces read: three crossing trains, the primary
// one running downwind. The far field shades with it everywhere; the coast
// strip grows it in over its outer fifty metres so the two agree where they
// meet at -96 m. Needs the coast chunk (uCoastShape, uCoastSwell) before it.
export const farWaterSwellShader = /* glsl */`
vec2 rotateSwell(vec2 v, float angle) {
  float c = cos(angle), s = sin(angle);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}
// A crest train seen from afar: once a pixel spans more than a radian or so of
// phase the cosine is no longer resolved and only shimmers as the camera moves
// (a moiré over the whole sea), so it is averaged out over the pixel instead.
float farWaterCrest(float phase) {
  return cos(phase) * (1.0 - smoothstep(0.35, 1.5, fwidth(phase)));
}
vec2 farWaterSwellGradient(vec2 point, float time, float waveSpeed) {
  // Crests travel toward -direction, so downwind is minus the wind. The
  // two crossing trains keep their authored angles to the primary one.
  vec2 directionA = uCoastShape.x > 0.5 ? -normalize(uCoastSwell.xy) : normalize(vec2(0.86, 0.51));
  vec2 directionB = rotateSwell(directionA, 1.405);
  vec2 directionC = rotateSwell(directionA, -1.925);
  float phaseA = dot(point, directionA) * 0.24 + time * waveSpeed * 0.31;
  float phaseB = dot(point, directionB) * 0.41 - time * waveSpeed * 0.22;
  float phaseC = dot(point, directionC) * 0.13 + time * waveSpeed * 0.14;
  return directionA * farWaterCrest(phaseA) * 0.24
    + directionB * farWaterCrest(phaseB) * 0.41 * 0.42
    + directionC * farWaterCrest(phaseC) * 0.13 * 0.7;
}
`;

export const farWaterBodyShader = /* glsl */`
vec3 farWaterBody(vec3 deepTint, vec3 surfaceColor, vec3 horizonColor, float exposure, vec3 normal, float fresnel) {
  vec3 distantBody = mix(deepTint, max(surfaceColor, vec3(.001)), .76)
    * (.54 + sqrt(clamp(exposure, 0.0, 2.2)) * .28);
  float slope = 1.0 - clamp(normal.y, 0.0, 1.0);
  return mix(distantBody * .94, horizonColor * .26 + distantBody * .24,
    clamp(slope * 1.7 + fresnel * .28, 0.0, .72));
}
`;
