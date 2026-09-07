import { cloudAtmosphereGLSL } from './cloudAtmosphereShader';

// WebGL2 shader sources for the painterly finite cloud slab. The density
// function is shared verbatim by the view and sun passes: a cloud cannot look
// like one formation and cast a shadow from another one.

export const cloudDensityGLSL = /* glsl */`
  uniform sampler3D uNoise;
  uniform sampler2D uWeather;
  uniform vec2 uWind;
  uniform float uCoverage;
  uniform float uDensity;
  uniform float uAltitude;
  uniform float uHeight;
  uniform float uScale;
  uniform float uLightSteps;

  float saturate(float value) { return clamp(value, 0.0, 1.0); }

  float cloudDensityMode(vec3 p, bool fine) {
    float layerY = (p.y - uAltitude) / max(uHeight, 1.0);
    if (uCoverage <= 0.001 || layerY <= 0.0 || layerY >= 1.0) return 0.0;

    // Weather is intentionally much larger than detail noise: its broad
    // formations establish the flat, legible bases and the unequal towers.
    vec2 weatherUv = fract((p.xz + uWind) / max(18000.0 * uScale, 1.0));
    vec2 weather = texture(uWeather, weatherUv).rg;
    float macro = weather.r;
    float coverThreshold = mix(0.62, 0.02, saturate(uCoverage));
    float formation = smoothstep(coverThreshold, coverThreshold + 0.21, macro);
    if (formation <= 0.001) return 0.0;

    // G stores a weather-driven top height. The quiet lower third is broad and
    // horizontal; only strong macro cells climb into tall cumulonimbus towers.
    float tower = smoothstep(coverThreshold + 0.02, 0.56, macro);
    float topHeight = mix(0.28 + weather.g * 0.45, 0.62 + weather.g * 0.65, tower);
    float flatBase = smoothstep(0.0, 0.055, layerY);
    float topCap = 1.0 - smoothstep(topHeight - 0.18, topHeight, layerY);
    float vertical = flatBase * topCap;
    if (vertical <= 0.001) return 0.0;

    vec3 noiseUv = vec3(
      (p.x + uWind.x) / max(3400.0 * uScale, 1.0),
      layerY * 1.16,
      (p.z + uWind.y) / max(3400.0 * uScale, 1.0)
    );
    vec3 noise = texture(uNoise, fract(noiseUv)).rgb;
    // R is fBm, G is 1-Worley and B is the smaller erosion octave. Erosion is
    // strongest near an edge, preserving quiet, light-collecting interiors.
    vec3 detail = fine ? texture(uNoise, fract(noiseUv * 2.83 + vec3(.17,.31,.73))).rgb : vec3(.6);
    float shape = noise.r * 0.68 + noise.g * 0.32;
    shape = smoothstep(.24,.78,shape);
    float threshold = mix(0.86, 0.24, formation * vertical);
    float body = smoothstep(threshold, threshold + 0.12, shape);
    float eroded = max(0., body - (1.-detail.r)*0.36*(1.-body));
    return saturate(eroded * vertical * max(uDensity, 0.0));
  }
  float cloudDensity(vec3 p) { return cloudDensityMode(p,true); }
`;

export const volumeVertex = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const volumeFragment = /* glsl */`
  precision highp float;
  precision highp sampler3D;
  varying vec2 vUv;


  uniform vec3 uSun;
  uniform vec3 uSunColor;
  uniform vec3 uAmbient;
  uniform vec3 uHazeColor;
  uniform float uHaze;
  uniform float uDay;
  uniform float uSteps;
  uniform mat4 uInvProjection;
  uniform mat4 uInvView;
  uniform vec3 uCamera;
  uniform vec2 uResolution;

  ${cloudDensityGLSL}
  ${cloudAtmosphereGLSL}

  float stableJitter(vec2 pixel) {
    uint h=uint(pixel.x)*374761393u+uint(pixel.y)*668265263u;
    h=(h^(h>>13u))*1274126177u;
    return float(h^(h>>16u))/4294967295.;
  }

  bool intersectCloudSlab(vec3 origin, vec3 direction, out float nearT, out float farT) {
    if (abs(direction.y) < 0.00001) return false;
    float first = (uAltitude - origin.y) / direction.y;
    float second = (uAltitude + uHeight - origin.y) / direction.y;
    nearT = max(min(first, second), 0.05);
    farT = min(max(first, second), 18000.0);
    return farT > nearT;
  }

  float sunTransmittance(vec3 p) {
    // Four short taps turn the same density field into self-shadowing. Their
    // growing separation makes a thin silver rim and a deep cool interior
    // without a second expensive raymarch toward the sun.
    float opticalDepth = 0.0;
    for (int tap = 1; tap <= 4; tap += 1) {
      if (float(tap)>uLightSteps) break;
      float distanceToSun = float(tap*tap) * 110.0;
      opticalDepth += cloudDensityMode(p + normalize(uSun) * distanceToSun,false) * (0.34 + float(tap)*0.21);
    }
    return exp(-opticalDepth);
  }

  void main() {
    #ifdef CLOUD_SKY_ATLAS
      float azimuth = (vUv.x-.5)*6.28318530718;
      float elevation = (vUv.y-.5)*3.14159265359;
      vec3 ray = vec3(cos(azimuth)*cos(elevation),sin(elevation),sin(azimuth)*cos(elevation));
      vec3 sky = cloudClearSky(ray,false);
    #else
      vec2 clip = vUv * 2.0 - 1.0;
      vec4 view = uInvProjection * vec4(clip, 1.0, 1.0);
      vec3 ray = normalize(mat3(uInvView) * (view.xyz / max(view.w, 0.00001)));
      vec3 sky = cloudClearSky(ray,true);
    #endif
    float nearT;
    float farT;
    if (!intersectCloudSlab(uCamera, ray, nearT, farT)) {
      gl_FragColor = vec4(sky * uRadianceGain, 1.0);
      return;
    }

    float steps = clamp(uSteps, 1.0, 80.0);
    float stepLength = (farT - nearT) / steps;
    float jitter = .5 + (stableJitter(floor(gl_FragCoord.xy))-.5)*.3;
    float t = nearT + stepLength * jitter;
    float transmittance = 1.0;
    vec3 radiance = vec3(0.0);
    vec3 sun = normalize(uSun);
    float viewSun = max(dot(ray, sun), 0.0);
    float forwardScatter = pow(viewSun, 7.0);

    for (int stepIndex = 0; stepIndex < 80; stepIndex += 1) {
      if (float(stepIndex) >= steps || t > farT || transmittance < 0.012) break;
      vec3 p = uCamera + ray * t;
      float density = cloudDensity(p);
      if (density > 0.0005) {
        float opticalDepth = density * stepLength * 0.00175;
        float alpha = 1.0 - exp(-opticalDepth);
        float sunLight = sunTransmittance(p);
        float height = saturate((p.y - uAltitude) / max(uHeight, 1.0));
        vec3 ambient = mix(uHazeColor, uAmbient, smoothstep(0.06, 0.76, height));
        // A Beer/powder approximation: deep, directly lit bodies collect a
        // broad glow; the view-sun term leaves the vivid thin rim around gaps.
        float powder = 1.0 - exp(-density * 2.6);
        float direct = sunLight * (0.16 + powder * 0.84) * (0.72 + forwardScatter * 1.85);
        vec3 sampleLight = ambient * (0.22 + 0.6 * height)
          + uSunColor * direct * uDay;
        radiance += transmittance * sampleLight * alpha;
        transmittance *= (1.0 - alpha);
      }
      t += stepLength;
    }

    float distanceHaze = 1.0 - exp(-(farT - nearT) * max(uHaze, 0.0) * 0.000025);
    radiance = mix(radiance, uHazeColor * (1.0 - transmittance), distanceHaze);
    gl_FragColor = vec4((radiance + sky * transmittance) * uRadianceGain, 1.0);
  }
`;

export const shadowVolumeFragment = /* glsl */`
  precision highp float;
  precision highp sampler3D;
  varying vec2 vUv;


  uniform vec3 uSun;
  uniform vec2 uOrigin;
  uniform float uExtent;
  uniform float uSoftness;

  ${cloudDensityGLSL}

  float stableShadowJitter(vec2 uv) {
    return fract(sin(dot(floor(uv * 1024.0), vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec3 sun = normalize(uSun);
    if (sun.y <= 0.002) {
      gl_FragColor = vec4(1.0);
      return;
    }

    // uOrigin is the centre of the world projection, shared by all receivers.
    vec2 ground = uOrigin + (vUv - 0.5) * uExtent;
    float start = uAltitude / sun.y;
    float end = (uAltitude + uHeight) / sun.y;
    float stepLength = (end - start) / 12.0;
    float jitter = stableShadowJitter(vUv) - 0.5;
    vec2 softOffset = vec2(jitter, -jitter) * 2.0;
    float opticalDepth = 0.0;
    for (int stepIndex = 0; stepIndex < 12; stepIndex += 1) {
      float t = start + (float(stepIndex) + 0.5) * stepLength;
      vec3 p = vec3(ground.x + softOffset.x, 0.0, ground.y + softOffset.y) + sun * t;
      opticalDepth += cloudDensity(p) * stepLength * 0.00175;
    }
    float transmission = mix(1.,exp(-opticalDepth),smoothstep(.025,.14,sun.y));
    gl_FragColor = vec4(vec3(transmission), 1.0);
  }
`;
