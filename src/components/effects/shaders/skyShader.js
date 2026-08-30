// One sky function, imported by the sky itself AND by the water that reflects it.
//
// This repo's recurring failure is the same formula written twice: the sun
// direction was duplicated by hand into the god-ray pass and drifted, the water's
// scattering density is computed in JS and again in GLSL, and the absorption
// colour exists in both places and has already diverged. The sky is the biggest
// candidate yet for that mistake, so it exists exactly once, here.

export const skyShaderChunk = /* glsl */`
  uniform sampler2D uSkyLut;
  uniform vec2 uSkyLutTexel;
  uniform vec3 uKeyDirection;
  uniform vec3 uKeyRadiance;
  uniform float uKeyCosRadius;
  uniform float uKeyGlowPower;
  uniform float uKeyGlowStrength;

  // The table is coarse next to the lens it is seen through: one texel spans
  // about a quarter of a degree, and the authored lens is 24, so a texel lands
  // on roughly ten screen pixels. Bilinear filtering is continuous but its
  // slope is not - it changes at every texel boundary - and along a cloud edge
  // those slope breaks read as a staircase. Catmull-Rom is smooth across the
  // boundary, so the edge resolves as an edge instead of as the grid it was
  // sampled on. Nine taps of a small half-float table, and the table itself
  // stays the size it was: this buys resolution the CPU does not have to pay
  // for.
  vec3 sampleSkyLut(vec2 uv) {
    // A material that forgets to feed the texel size gets the plain filter
    // rather than a division by zero and a sky full of NaN.
    if (uSkyLutTexel.x <= 0.0 || uSkyLutTexel.y <= 0.0) {
      return texture2D(uSkyLut, uv).rgb;
    }

    vec2 size = 1.0 / uSkyLutTexel;
    vec2 samplePos = uv * size;
    vec2 texPos1 = floor(samplePos - 0.5) + 0.5;
    vec2 f = samplePos - texPos1;

    vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
    vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
    vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
    vec2 w3 = f * f * (-0.5 + 0.5 * f);

    // The middle two taps are fetched as one bilinear sample placed between
    // them, which is what turns sixteen taps into nine.
    vec2 w12 = w1 + w2;
    vec2 offset12 = w2 / w12;

    vec2 uv0 = (texPos1 - 1.0) * uSkyLutTexel;
    vec2 uv12 = (texPos1 + offset12) * uSkyLutTexel;
    vec2 uv3 = (texPos1 + 2.0) * uSkyLutTexel;

    vec3 sum = vec3(0.0);
    sum += texture2D(uSkyLut, vec2(uv0.x, uv0.y)).rgb * (w0.x * w0.y);
    sum += texture2D(uSkyLut, vec2(uv12.x, uv0.y)).rgb * (w12.x * w0.y);
    sum += texture2D(uSkyLut, vec2(uv3.x, uv0.y)).rgb * (w3.x * w0.y);

    sum += texture2D(uSkyLut, vec2(uv0.x, uv12.y)).rgb * (w0.x * w12.y);
    sum += texture2D(uSkyLut, vec2(uv12.x, uv12.y)).rgb * (w12.x * w12.y);
    sum += texture2D(uSkyLut, vec2(uv3.x, uv12.y)).rgb * (w3.x * w12.y);

    sum += texture2D(uSkyLut, vec2(uv0.x, uv3.y)).rgb * (w0.x * w3.y);
    sum += texture2D(uSkyLut, vec2(uv12.x, uv3.y)).rgb * (w12.x * w3.y);
    sum += texture2D(uSkyLut, vec2(uv3.x, uv3.y)).rgb * (w3.x * w3.y);

    // Catmull-Rom overshoots on a hard edge, and radiance has no negative side.
    return max(sum, vec3(0.0));
  }

  // three's own equirect convention, so the sky the water reflects and the sky
  // the PMREM bakes into the boat's environment are sampled the same way.
  vec3 skyRadiance(vec3 ray) {
    vec3 r = normalize(ray);
    vec2 uv = vec2(
      atan(r.z, r.x) * 0.15915494 + 0.5,
      asin(clamp(r.y, -1.0, 1.0)) * 0.31830989 + 0.5
    );
    return sampleSkyLut(uv);
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
