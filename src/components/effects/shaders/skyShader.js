// One sky function, imported by the sky itself AND by the water that reflects it.
//
// This repo's recurring failure is the same formula written twice: the sun
// direction was duplicated by hand into the god-ray pass and drifted, the water's
// scattering density is computed in JS and again in GLSL, and the absorption
// colour exists in both places and has already diverged. The sky is the biggest
// candidate yet for that mistake, so it exists exactly once, here.

export const skyShaderChunk = /* glsl */`
  uniform sampler2D uSkyLut;
  uniform vec3 uKeyDirection;
  uniform vec3 uKeyRadiance;
  uniform float uKeyCosRadius;
  uniform float uKeyGlowPower;
  uniform float uKeyGlowStrength;

  // three's own equirect convention, so the sky the water reflects and the sky
  // the PMREM bakes into the boat's environment are sampled the same way.
  vec3 skyRadiance(vec3 ray) {
    vec3 r = normalize(ray);
    vec2 uv = vec2(
      atan(r.z, r.x) * 0.15915494 + 0.5,
      asin(clamp(r.y, -1.0, 1.0)) * 0.31830989 + 0.5
    );
    return texture2D(uSkyLut, uv).rgb;
  }

  // The disc and its glow. The disc's edge is antialiased against the screen-space
  // derivative of the cosine, so it stays a clean circle at any zoom instead of
  // the fixed-pixel sprite it replaces - and because this is a direction test, it
  // sits at infinity like the light does. The sprite sat at 46 units and missed
  // the shading direction by 12.6 degrees.
  vec3 celestialBody(vec3 ray, vec3 direction, vec3 radiance, float cosRadius, float glowPower) {
    float c = dot(normalize(ray), direction);
    float aa = max(fwidth(c), 1e-5);
    float disc = smoothstep(cosRadius - aa, cosRadius + aa, c);
    float glow = pow(max(c, 0.0), glowPower) * uKeyGlowStrength;
    return radiance * (disc + glow);
  }
`;
