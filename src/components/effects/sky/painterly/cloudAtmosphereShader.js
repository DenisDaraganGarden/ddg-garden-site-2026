// The reviewed atmosphere palette is shared by the view and the water atlas.
// Values stay linear HDR until the scene's single display transform.
export const cloudAtmosphereGLSL = /* glsl */`
  uniform float uRadianceGain;
  uniform float uDiscVisible;
  uniform float uDiscCosRadius;
  vec3 cloudClearSky(vec3 ray, bool disc) {
    float warm = 1.0 - smoothstep(.02, .28, uSun.y);
    float h = pow(clamp(ray.y, 0.0, 1.0), .38);
    vec3 zenith = mix(vec3(.021,.14,.34), vec3(.075,.055,.18), warm);
    vec3 horizon = mix(vec3(.38,.57,.73), vec3(.7,.31,.16), warm);
    vec3 sky = mix(horizon, zenith, h);
    float sun = max(0.0, dot(ray, normalize(uSun)));
    sky += uSunColor * pow(sun,18.0) * (.04 + warm*.09);
    if (disc) {
      float aa = max(fwidth(sun), .000004);
      sky += uSunColor * smoothstep(uDiscCosRadius-aa,uDiscCosRadius+aa,sun) * 8.0 * uDiscVisible;
    }
    return sky * max(.004,uDay);
  }
`;
