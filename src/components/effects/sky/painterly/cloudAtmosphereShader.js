import { celestialShaderChunk } from '../../shaders/celestialShader.js';

// The reviewed atmosphere palette is shared by the view and the water atlas.
// Values stay linear HDR until the scene's single display transform.
export const cloudAtmosphereGLSL = /* glsl */`
  uniform float uRadianceGain;
  uniform float uDiscVisible;
  uniform float uDiscCosRadius;
  uniform float uFlash;
  uniform vec3 uFlashPos;
  uniform vec3 uFlashColor;
  ${celestialShaderChunk}

  // A lightning channel as a light: the closest point on the vertical bolt
  // from the ground to the cloud, with an inverse-square falloff softened by
  // the channel's own glow radius. Zero cost while no stroke is live.
  vec3 flashLight(vec3 p) {
    if (uFlash <= 0.0005) return vec3(0.0);
    vec3 c = vec3(uFlashPos.x, clamp(p.y, 0.0, uFlashPos.y), uFlashPos.z);
    vec3 d = p - c;
    return uFlashColor * uFlash * (2.6e5 / (dot(d, d) + 2.6e5));
  }

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
      // At night the key is the moon; its phased body below replaces this disc.
      sky += uSunColor * smoothstep(uDiscCosRadius-aa,uDiscCosRadius+aa,sun) * 8.0 * uDiscVisible * (1.0 - uNight);
    }
    // A storm greys the whole dome: the warm horizon and the blue zenith both
    // collapse toward one dim, slightly cool overcast.
    float lum = dot(sky, vec3(0.3, 0.59, 0.11));
    sky = mix(sky, vec3(lum) * vec3(0.86, 0.9, 0.98) * 0.5, uStorm * 0.8);
    sky *= max(.004, uDay);
    // Haze lit by a stroke: a soft lobe toward the channel plus a faint lift.
    if (uFlash > 0.0005) {
      vec3 toBolt = uFlashPos - uCamera;
      float boltDistance = max(length(toBolt), 1.0);
      float lobe = pow(max(dot(ray, toBolt / boltDistance), 0.0), 32.0);
      sky += uFlashColor * uFlash * (lobe * 0.08 + 0.003);
    }
    return sky + moonBody(ray) + starField(ray);
  }
`;
