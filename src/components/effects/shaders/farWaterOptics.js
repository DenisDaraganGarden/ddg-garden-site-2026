// Shared distant-water body term.  The coast V2 strip blends to this exact
// term before it meets FarWater, so an offshore LOD/material boundary cannot
// become a colour band.
export const farWaterBodyShader = /* glsl */`
vec3 farWaterBody(vec3 deepTint, vec3 surfaceColor, vec3 horizonColor, float exposure, vec3 normal, float fresnel) {
  vec3 distantBody = mix(deepTint, max(surfaceColor, vec3(.001)), .76)
    * (.54 + sqrt(clamp(exposure, 0.0, 2.2)) * .28);
  float slope = 1.0 - clamp(normal.y, 0.0, 1.0);
  return mix(distantBody * .94, horizonColor * .26 + distantBody * .24,
    clamp(slope * 1.7 + fresnel * .28, 0.0, .72));
}
`;
