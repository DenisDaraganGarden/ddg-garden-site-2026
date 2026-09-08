// The retained local simulation is sampled in the same world-space frame by
// every sea mesh. Keep its height blend aligned with the GPU actor probes.
// Requires coastWaterShader before this chunk.
export const seaRippleShader = /* glsl */`
  uniform sampler2D uSeaRippleStateMap;
  uniform sampler2D uSeaRippleNormalMap;
  uniform float uSeaRippleActive;
  uniform float uSeaRippleExtent;
  uniform float uSeaRippleAmplitude;

  float seaRippleDisplacement(vec2 point) {
    if (uSeaRippleActive < 0.5) return 0.0;
    vec2 uv = vec2(point.x / uSeaRippleExtent + 0.5, 0.5 - point.y / uSeaRippleExtent);
    vec2 lo = smoothstep(vec2(0.035), vec2(0.07), uv);
    vec2 hi = 1.0 - smoothstep(vec2(0.93), vec2(0.965), uv);
    float weight = lo.x * lo.y * hi.x * hi.y;
    if (weight <= 0.0) return 0.0;
    // Use the depth map here: evaluating the terrain function per water
    // vertex would multiply the cost of every ribbon and radial ring.
    float wet = uCoastShape.x > 0.5
      ? smoothstep(0.4, 0.8, -coastGround(coastLocal(point))) : 1.0;
    float raw = texture2D(uSeaRippleStateMap, uv).r;
    float smoothed = texture2D(uSeaRippleNormalMap, uv).a * 2.0 - 1.0;
    return mix(raw, smoothed, 0.84) * uSeaRippleAmplitude * weight * wet;
  }
`;
