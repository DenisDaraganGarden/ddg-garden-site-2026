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
  uniform float uStorm;
  uniform float uTime;
  uniform float uRainCells;
  uniform float uRainDark;

  float saturate(float value) { return clamp(value, 0.0, 1.0); }
  // The rain cell of the last density sample, for the lighting of that sample.
  float ddgRainCell = 0.0;

  // The raining cells are the strongest macro bodies of the weather map. The
  // same threshold feeds the density, the dark bases and the curtains below.
  float rainCellFromMacro(float macro) {
    float threshold = mix(0.78, 0.35, clamp(uRainCells, 0.0, 1.0));
    return uStorm * smoothstep(threshold, threshold + 0.25, macro);
  }
  float rainCell(vec2 xz) {
    if (uStorm <= 0.001) return 0.0;
    vec2 weatherUv = fract((xz + uWind) / max(18000.0 * uScale, 1.0));
    return rainCellFromMacro(texture(uWeather, weatherUv).r);
  }

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
    // Below ~13% coverage the threshold passes 0.54 and the edges would cross:
    // smoothstep with reversed edges is undefined (Metal gave 0), so say so.
    float tower = coverThreshold + 0.02 < 0.56 ? smoothstep(coverThreshold + 0.02, 0.56, macro) : 0.0;
    // Storm cells thicken and their towers breathe slowly, so a storm deck is
    // never a still photograph. At storm 0 every term here is zero.
    float rain = rainCellFromMacro(macro);
    ddgRainCell = rain;
    float topHeight = mix(0.28 + weather.g * 0.45, 0.62 + weather.g * 0.65, tower)
      + rain * (0.12 + 0.1 * sin(uTime * 0.03 + macro * 40.0));
    float flatBase = smoothstep(0.0, 0.055, layerY);
    float topCap = 1.0 - smoothstep(topHeight - 0.18, topHeight, layerY);
    float vertical = flatBase * topCap;
    if (vertical <= 0.001) return 0.0;

    // Upper levels drift faster than the base (a height shear on the same wind
    // offset) and the detail scrolls slowly through height, so forms evolve
    // instead of sliding past as one rigid picture.
    vec2 drift = uWind * (1.0 + layerY * 0.35);
    vec3 noiseUv = vec3(
      (p.x + drift.x) / max(3400.0 * uScale, 1.0),
      layerY * 1.16 + uTime * 0.0022,
      (p.z + drift.y) / max(3400.0 * uScale, 1.0)
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
    return saturate(eroded * vertical * max(uDensity, 0.0) * (1.0 + rain * 1.4));
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
  uniform float uRain;
  uniform float uRainInView;
  uniform float uFineStep;
  uniform float uMoonGate;
  uniform vec3 uEnvironmentTint;

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
    // The slab used to end at 18 km, which cut the deck with a straight edge a
    // few degrees above the horizon. It now reaches 48 km: the near part keeps
    // its full sampling, the far part is a coarse tail that fades into haze.
    farT = min(max(first, second), 48000.0);
    return farT > nearT;
  }

  float sunTransmittance(vec3 p) {
    // Four short taps turn the same density field into self-shadowing. Their
    // growing separation makes a thin silver rim and a deep cool interior
    // without a second expensive raymarch toward the sun.
    // Six taps (ultra) sample the same reach twice as densely, with their
    // weights scaled so the total optical depth matches the four-tap profiles.
    float opticalDepth = 0.0;
    bool dense = uLightSteps > 4.5;
    float spacing = dense ? 55.0 : 110.0;
    float weightScale = dense ? 0.536 : 1.0;
    for (int tap = 1; tap <= 6; tap += 1) {
      if (float(tap)>uLightSteps) break;
      float distanceToSun = float(tap*tap) * spacing;
      opticalDepth += cloudDensityMode(p + normalize(uSun) * distanceToSun,false) * (0.34 + float(tap)*0.21) * weightScale;
    }
    return exp(-opticalDepth);
  }

  // One lit sample of the volume: rgb is the radiance it adds, a its alpha.
  vec4 cloudSample(vec3 p, float density, float stepLength, float viewSun, float forwardScatter) {
    if (density <= 0.0005) return vec4(0.0);
    float opticalDepth = density * stepLength * 0.00175;
    float alpha = 1.0 - exp(-opticalDepth);
    float sunLight = sunTransmittance(p);
    float height = saturate((p.y - uAltitude) / max(uHeight, 1.0));
    // Raining cells carry dark, wet bases: their skylight is what the thicker
    // column above has already absorbed.
    float cell = ddgRainCell * clamp(uRainDark, 0.0, 1.0);
    vec3 ambient = mix(uHazeColor, uAmbient, smoothstep(0.06, 0.76, height)) * (1.0 - cell);
    // A Beer/powder approximation: deep, directly lit bodies collect a broad
    // glow; the view-sun term leaves the vivid thin rim around gaps. The
    // narrow forward lobe keeps the silver rim; a wide lobe lets a deep, lit
    // body glow through when the sun stands behind it.
    float powder = 1.0 - exp(-density * 2.6);
    float direct = sunLight * (0.16 + powder * 0.84) * (0.72 + forwardScatter * 1.85 + viewSun * viewSun * 0.15) * (1.0 - cell * 0.85);
    vec3 sampleLight = ambient * (0.22 + 0.6 * height)
      + uSunColor * direct * max(uDay, uMoonGate)
      + flashLight(p) * (0.35 + powder * 0.65);
    return vec4(sampleLight * alpha, alpha);
  }

  void main() {
    vec3 gain = vec3(uRadianceGain);
    #ifdef CLOUD_SKY_ATLAS
      // The atlas is the sky the sea reflects and the image light is baked
      // from: the environment tone belongs here, not on the sky in view.
      gain *= uEnvironmentTint;
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
    float nearT = 0.0;
    float farT = 0.0;
    bool hitSlab = intersectCloudSlab(uCamera, ray, nearT, farT);
    float jitter = .5 + (stableJitter(floor(gl_FragCoord.xy))-.5)*.3;
    float transmittance = 1.0;
    vec3 radiance = vec3(0.0);
    vec3 sun = normalize(uSun);
    float viewSun = max(dot(ray, sun), 0.0);
    float forwardScatter = pow(viewSun, 7.0);

    // Rain curtains hang from the raining cells to the ground. Eight coarse
    // steps between the eye and the cloud base, in front of the clouds, streaked
    // by the cloud noise scrolling downward. Near steps are faded so the view
    // never greys out at the camera; the curtains belong to the horizon.
    // The water atlas always keeps its rain; the view pass yields it to the
    // product post pass, which draws it with scene depth.
    #ifdef CLOUD_SKY_ATLAS
      float rainHere = uRain;
    #else
      float rainHere = uRain * uRainInView;
    #endif
    if (rainHere > 0.001 && uCamera.y < uAltitude && ray.y > -0.02) {
      float rainFar = ray.y > 0.0001 ? min((uAltitude - uCamera.y) / ray.y, 24000.0) : 24000.0;
      float rainStep = rainFar / 8.0;
      float hazeLum = dot(uHazeColor, vec3(0.3, 0.59, 0.11));
      vec3 rainColor = vec3(hazeLum) * vec3(0.84, 0.9, 1.0) * 0.55;
      for (int i = 0; i < 8; i += 1) {
        float rt = (float(i) + jitter) * rainStep;
        vec3 rp = uCamera + ray * rt;
        float cell = rainCell(rp.xz) * smoothstep(500.0, 2500.0, rt);
        if (cell > 0.001) {
          float streak = texture(uNoise, vec3(rp.x * 0.0006, rp.y * 0.00008 - uTime * 0.03, rp.z * 0.0006)).g;
          float alpha = 1.0 - exp(-cell * rainHere * (0.45 + streak) * rainStep * 0.00016);
          radiance += transmittance * (rainColor + flashLight(rp) * 0.25) * alpha;
          transmittance *= 1.0 - alpha;
        }
      }
    }

    if (!hitSlab) {
      gl_FragColor = vec4((radiance + sky * transmittance) * gain, 1.0);
      return;
    }

    float steps = clamp(uSteps, 1.0, 80.0);
    float nearFar = min(farT, 18000.0);
    float stepLength = max(nearFar - nearT, 0.0) / steps;
    float t = nearT + stepLength * jitter;
    // Adaptive march (high and ultra): empty air is crossed in double steps,
    // cloud is sampled in half steps, and the first hit after a gap refines
    // the entry edge with one extra sample. The step budget doubles so a ray
    // fully inside cloud still reaches the far side.
    float fine = stepLength * uFineStep;
    float coarse = uFineStep < 0.999 ? stepLength * 2.0 : stepLength;
    float budget = uFineStep < 0.999 ? steps * 2.0 : steps;
    bool inside = false;
    for (int stepIndex = 0; stepIndex < 160; stepIndex += 1) {
      if (float(stepIndex) >= budget || t > nearFar || transmittance < 0.012) break;
      vec3 p = uCamera + ray * t;
      float density = cloudDensity(p);
      if (density > 0.0005) {
        if (!inside && coarse > fine * 1.5) {
          vec3 edge = uCamera + ray * (t - coarse * 0.5);
          vec4 edgeLit = cloudSample(edge, cloudDensity(edge), coarse * 0.5, viewSun, forwardScatter);
          radiance += transmittance * edgeLit.rgb;
          transmittance *= 1.0 - edgeLit.a;
        }
        inside = true;
        vec4 lit = cloudSample(p, density, fine, viewSun, forwardScatter);
        radiance += transmittance * lit.rgb;
        transmittance *= 1.0 - lit.a;
        t += fine;
      } else {
        inside = false;
        t += coarse;
      }
    }
    // Ten coarse steps carry the deck on to the far limit; for a grazing ray
    // that enters the slab beyond 18 km they are its only samples.
    float tailStart = max(nearFar, nearT);
    float tailLength = (farT - tailStart) / 10.0;
    if (tailLength > 0.1) {
      for (int stepIndex = 0; stepIndex < 10; stepIndex += 1) {
        if (transmittance < 0.012) break;
        float tt = tailStart + (float(stepIndex) + jitter) * tailLength;
        vec3 p = uCamera + ray * tt;
        // The deck thins toward the far limit instead of ending on a line.
        vec4 lit = cloudSample(p, cloudDensityMode(p, false) * (1.0 - smoothstep(30000.0, 48000.0, tt)), tailLength, viewSun, forwardScatter);
        radiance += transmittance * lit.rgb;
        transmittance *= 1.0 - lit.a;
      }
    }

    // The sun behind a deck: a diffuse bright patch where the deck is neither
    // clear (the disc is drawn in the sky) nor opaque (nothing gets through).
    float halo = pow(viewSun, 22.0) * (1.0 - transmittance) * pow(transmittance, 0.35);
    radiance += uSunColor * max(uDay, uMoonGate) * halo * 0.8 * (1.0 - uStorm * 0.7);
    float distanceHaze = 1.0 - exp(-(farT - nearT) * max(uHaze, 0.0) * 0.000025);
    radiance = mix(radiance, uHazeColor * (1.0 - transmittance), distanceHaze);
    gl_FragColor = vec4((radiance + sky * transmittance) * gain, 1.0);
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
