// The sky, as numbers. No React, no three - so it runs in node and can be
// checked against physics rather than against a screenshot (see skyModel.check.js).
//
// One model feeds four things that used to be authored separately and drifted
// apart: the visible sky, the sky reflected in the water, the image-based fill
// on every material, and the direction and colour of the key light. They cannot
// disagree here, because they are all read out of the same table.

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

export const SKY = Object.freeze({
  // Per unit relative air mass, with the ~8 km Rayleigh scale height already
  // folded in - these are column values, not per-kilometre coefficients.
  betaR: Object.freeze([0.058, 0.135, 0.331]),
  betaM: 0.021,
  g: 0.76,
  // Calibrated, not picked: at a clear noon with the sun 40 deg up this puts
  // directShare at 0.84, against ~0.85 for real clear-sky direct-vs-diffuse.
  // It sets how much of the light a shadow is allowed to remove, so guessing it
  // would quietly make every shadow the wrong strength. Absolute sky brightness
  // is the exposure control's job, not this number's.
  inscatterGain: 2.0,
  // Radiance of the solar disc, as a multiple of the key radiance. NOT the
  // physical E/Omega identity: at this angular size that lands near 2.4e5 and
  // overflows the half-float reflection, refraction and post targets to Inf.
  // The coupling is what matters - disc, light and water lobe share one number.
  discGain: 24.0,
  sunAngularSizeDeg: 0.53,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const mix = (a, b, t) => a + (b - a) * t;

const smoothstep = (edge0, edge1, x) => {
  if (edge0 === edge1) {
    return x < edge0 ? 0 : 1;
  }
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

// Kasten-Young relative air mass. Clamped at -3 deg: past 93.885 deg zenith the
// fit goes complex, and a sun just under the horizon is exactly the frame worth
// looking at.
export function airMass(elevationDeg) {
  const zenith = 90 - Math.max(elevationDeg, -3);
  return 1 / (
    Math.cos(zenith * DEG)
    + 0.15 * Math.pow(Math.max(93.885 - zenith, 0.6), -1.253)
  );
}

// Unit vector pointing FROM the origin TOWARD the light. Azimuth and elevation
// in degrees. Moved here from homeSceneLighting so the sun path and the light
// direction cannot be two different formulas - the repo already lost that bet
// once, in the god-ray pass.
export function buildHomeSceneLightDirection(azimuthDeg = 42, elevationDeg = 18) {
  const azimuth = finite(azimuthDeg, 42) * DEG;
  const elevation = finite(elevationDeg, 18) * DEG;
  const horizontal = Math.cos(elevation);

  return [
    horizontal * Math.sin(azimuth),
    Math.sin(elevation),
    horizontal * Math.cos(azimuth),
  ];
}

// The sun rides one great circle; `timeOfDay` moves it along that arc and
// `sunNoonElevation` sets how high the arc climbs. Bearing stays authored,
// because the composition was built around a direction, not around a latitude.
//
// At timeOfDay 12 the hour angle is 0, so elevation === noon elevation and
// azimuth === bearing: the legacy azimuth/elevation pair is reproduced exactly.
export function solveSunElevationAzimuth(timeOfDay, sunBearingDeg, sunNoonElevationDeg) {
  const hourAngle = (finite(timeOfDay, 12) / 24) * TAU - Math.PI;
  const noonElevation = finite(sunNoonElevationDeg, 18) * DEG;
  const bearing = finite(sunBearingDeg, 42) * DEG;

  const elevation = Math.asin(Math.sin(noonElevation) * Math.cos(hourAngle));
  const azimuth = bearing + Math.atan2(
    Math.sin(hourAngle),
    Math.cos(noonElevation) * Math.cos(hourAngle),
  );

  return { elevationDeg: elevation / DEG, azimuthDeg: azimuth / DEG };
}

// The moon runs the same arc half a day out of step, offset by its phase, and
// its brightness comes from the same angle as its position - so a full moon
// cannot appear in the wrong part of the sky.
export function solveMoonElevationAzimuth(timeOfDay, sunBearingDeg, sunNoonElevationDeg, moonPhase) {
  const phaseShift = ((finite(moonPhase, 0.5) - 0.5) * 24);
  const moonTime = ((finite(timeOfDay, 12) + 12 + phaseShift) % 24 + 24) % 24;
  const arc = solveSunElevationAzimuth(moonTime, sunBearingDeg, sunNoonElevationDeg);
  const phaseAngle = (finite(moonPhase, 0.5)) * TAU;
  const illumination = (1 - Math.cos(phaseAngle)) / 2;

  return { ...arc, illumination };
}

// One continuous weight instead of a threshold: at the crossover both bodies sit
// on the horizon with their radiance already at the extinguished floor, so the
// shadow rotates through the horizon rather than snapping 180 degrees.
export function solveNightWeight(sunElevationDeg) {
  const night = smoothstep(2, -2, sunElevationDeg);
  // mix() of two antipodal unit vectors is degenerate at exactly 0.5.
  if (Math.abs(night - 0.5) < 1e-4) {
    return night < 0.5 ? 0.4999 : 0.5001;
  }
  return night;
}

// The colour of sunlight after the atmosphere has had it. A real sun is very
// nearly white above the haze; everything warm about a low sun is extinction
// along a long path, which is why a sunset reddens the light AND the horizon
// together. Authoring the key colour directly - as this scene did with a fixed
// #e78b23 - makes those two independent, and then the sky and the light it
// supposedly comes from can never agree.
export function solveKeyLight({
  sunElevationDeg = 18,
  moonElevationDeg = 18,
  sunTint = [1, 0.96, 0.92],
  sunIntensity = 1,
  skyTurbidity = 2.6,
  cloudCover = 0,
  night = 0,
  moonIllumination = 1,
  moonBrightness = 1,
} = {}) {
  const betaM = SKY.betaM * (0.4 + clamp(skyTurbidity, 1, 10) * 0.36);
  const extinction = (elevationDeg) => {
    const mass = airMass(elevationDeg);
    return SKY.betaR.map((b) => Math.exp(-(b + betaM) * mass));
  };

  const sunTransmittance = extinction(sunElevationDeg);
  const sun = [
    sunTint[0] * sunTransmittance[0] * sunIntensity,
    sunTint[1] * sunTransmittance[1] * sunIntensity,
    sunTint[2] * sunTransmittance[2] * sunIntensity,
  ];

  // Moonlight is sunlight twice reflected: a fraction of the intensity, slightly
  // blue because the lunar surface is grey against a warm sun. It reddens along
  // ITS OWN path - taking the sun's extinction here made a midnight moon glow
  // the colour of a sunset.
  const moonTransmittance = extinction(moonElevationDeg);
  const moonScale = 0.02 * clamp(moonIllumination, 0, 1) * moonBrightness;
  const moon = [
    sunTint[0] * moonTransmittance[0] * sunIntensity * moonScale * 0.78,
    sunTint[1] * moonTransmittance[1] * sunIntensity * moonScale * 0.88,
    sunTint[2] * moonTransmittance[2] * sunIntensity * moonScale * 1.15,
  ];

  const beam = 1 - 0.9 * clamp(cloudCover, 0, 1);
  return [0, 1, 2].map((c) => (sun[c] * (1 - night) + moon[c] * night) * beam);
}

const normalize = (v) => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

const luminance = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

/**
 * Builds the equirectangular sky table plus the three scalars the rest of the
 * lighting needs. Returns linear radiance in a Float32Array of RGB triples;
 * turning that into a texture is the caller's job (this file stays free of three).
 *
 * The mapping is three's own equirect convention - u from atan2(z, x), v from
 * asin(y) - which is what keeps the sky the water reflects and the sky the PMREM
 * bakes into the boat's environment the same sky.
 */
export function buildSkyLut(state = {}) {
  const width = Math.max(8, Math.round(state.width ?? 256));
  const height = Math.max(4, Math.round(state.height ?? 128));
  const turbidity = clamp(finite(state.skyTurbidity, 2.6), 1, 10);
  const cloudCover = clamp(finite(state.cloudCover, 0), 0, 1);
  const groundAlbedo = state.groundAlbedo ?? [0.08, 0.09, 0.07];
  const keyDirection = normalize(state.keyDirection ?? [0, 0.3, 1]);
  const keyRadiance = state.keyRadiance ?? [1, 1, 1];

  const betaR = SKY.betaR;
  const betaM = SKY.betaM * (0.4 + turbidity * 0.36);
  const betaT = [betaR[0] + betaM, betaR[1] + betaM, betaR[2] + betaM];

  // Two-point fit of the sun's path length at the scattering altitude. A single
  // transmittance for the whole dome reddens the zenith at sunset, which is wrong;
  // scattering points near the horizon see the full path, high ones a short one.
  // ponytail: two-point fit of what a raymarch integrates. Ceiling: no ozone, so
  // the deep twilight blue band is missing. Upgrade = a 16-step march into the
  // same table, same shape, ~8x the CPU - still once at load.
  const sunElevationDeg = Math.asin(clamp(keyDirection[1], -1, 1)) / DEG;
  const sunMass = airMass(sunElevationDeg);
  const tSunLow = betaT.map((bt) => Math.exp(-bt * sunMass));
  const tSunHigh = betaT.map((bt) => Math.exp(-bt * sunMass * 0.35));

  // The achromatic part of the sun's extinction, used for the multiply-scattered
  // Rayleigh contribution (see the loop below).
  const tSunGrey = luminance(tSunHigh);

  const g2 = SKY.g * SKY.g;
  const data = new Float32Array(width * height * 3);

  // Grid is uniform in azimuth and uniform in elevation (v maps through asin),
  // so the solid angle of a texel is cos(elevation) * dElevation * dAzimuth.
  const dElevation = Math.PI / height;
  const dAzimuth = TAU / width;

  const integrateHemisphere = () => {
    const total = [0, 0, 0];
    for (let y = 0; y < height; y += 1) {
      const v = (y + 0.5) / height;
      const elevation = (v - 0.5) * Math.PI;
      const sinE = Math.sin(elevation);
      if (sinE < 0) {
        continue;
      }
      const weight = sinE * Math.cos(elevation) * dElevation * dAzimuth;
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 3;
        total[0] += data[index] * weight;
        total[1] += data[index + 1] * weight;
        total[2] += data[index + 2] * weight;
      }
    }
    return total;
  };

  const belowHorizon = [];

  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    const elevation = (v - 0.5) * Math.PI;
    const sinE = Math.sin(elevation);
    const cosE = Math.cos(elevation);

    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const azimuth = (u - 0.5) * TAU;
      const dir = [cosE * Math.cos(azimuth), sinE, cosE * Math.sin(azimuth)];
      const index = (y * width + x) * 3;

      if (sinE < 0) {
        // Below the horizon is ground, not a mirrored sky. This is the fill light.
        belowHorizon.push(index);
        continue;
      }

      const mu = dir[0] * keyDirection[0] + dir[1] * keyDirection[1] + dir[2] * keyDirection[2];
      const mass = airMass(elevation / DEG);
      const rayleighPhase = 0.0596831 * (1 + mu * mu);
      const denom = Math.max(1 + g2 - 2 * SKY.g * mu, 1e-3);
      const miePhase = 0.0795775 * (1 - g2) / (denom * Math.sqrt(denom));

      // Rayleigh light reaching a high point at sunset has bounced more than once,
      // and multiple scattering desaturates the reddening the direct beam picked
      // up. Applying the chromatic sun transmittance to it as well turns the
      // twilight zenith orange - which is the one thing everybody knows a sunset
      // sky does not do. So: the Mie lobe, which IS the direct beam smeared
      // forward, takes the full chromatic transmittance; the Rayleigh term takes
      // a neutral one near the zenith and the chromatic one near the horizon.
      // ponytail: a stand-in for multiple scattering. Ceiling: no ozone, so the
      // deep twilight blue band is still missing. Upgrade = a real two-order
      // march into the same table.
      const horizonWeight = 1 - Math.max(dir[1], 0);
      for (let c = 0; c < 3; c += 1) {
        const tSunDirect = mix(tSunLow[c], tSunHigh[c], Math.max(dir[1], 0));
        const tSunRayleigh = mix(tSunGrey, tSunDirect, horizonWeight);
        const rayleigh = betaR[c] * rayleighPhase * tSunRayleigh;
        const mie = betaM * miePhase * tSunDirect;
        const saturating = 1 - Math.exp(-betaT[c] * mass);
        data[index + c] = (rayleigh + mie) / betaT[c]
          * saturating * keyRadiance[c] * SKY.inscatterGain;
      }
    }
  }

  const keyUp = clamp(keyDirection[1], 0, 1);
  const clearIrradiance = integrateHemisphere();

  // Overcast, with the energy actually conserved. The beam loses 90% of itself
  // at full cover; that light does not vanish, it becomes the dome - minus what
  // the cloud tops reflect back to space. Getting this wrong the obvious way
  // (shaping the dome from the clear zenith) makes an overcast sky DARKER than a
  // clear one, which is backwards, and leaves directShare high so the shadow
  // stays hard under total cloud.
  if (cloudCover > 0) {
    const blend = smoothstep(0, 1, cloudCover);
    const CLOUD_TOP_ALBEDO = 0.35;
    const beamRemoved = keyRadiance.map((value) => value * keyUp * 0.9 * cloudCover);
    const target = clearIrradiance.map(
      (value, c) => value + beamRemoved[c] * (1 - CLOUD_TOP_ALBEDO),
    );

    // CIE overcast: three times brighter overhead than at the horizon. Written
    // with unit zenith radiance, then scaled to carry `target` exactly.
    let shapeIrradiance = 0;
    for (let y = 0; y < height; y += 1) {
      const v = (y + 0.5) / height;
      const elevation = (v - 0.5) * Math.PI;
      const sinE = Math.sin(elevation);
      if (sinE < 0) {
        continue;
      }
      shapeIrradiance += ((1 + 2 * sinE) / 3)
        * sinE * Math.cos(elevation) * dElevation * dAzimuth * width;
    }

    const scale = target.map((value) => (shapeIrradiance > 1e-9 ? value / shapeIrradiance : 0));

    for (let y = 0; y < height; y += 1) {
      const v = (y + 0.5) / height;
      const sinE = Math.sin((v - 0.5) * Math.PI);
      if (sinE < 0) {
        continue;
      }
      const shape = (1 + 2 * sinE) / 3;
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 3;
        for (let c = 0; c < 3; c += 1) {
          data[index + c] = mix(data[index + c], shape * scale[c], blend);
        }
      }
    }
  }

  const irradiance = cloudCover > 0 ? integrateHemisphere() : clearIrradiance;

  const groundRadiance = [
    groundAlbedo[0] * irradiance[0] / Math.PI,
    groundAlbedo[1] * irradiance[1] / Math.PI,
    groundAlbedo[2] * irradiance[2] / Math.PI,
  ];
  for (const index of belowHorizon) {
    data[index] = groundRadiance[0];
    data[index + 1] = groundRadiance[1];
    data[index + 2] = groundRadiance[2];
  }

  const beamLoss = 1 - 0.9 * cloudCover;
  const keyIlluminance = [
    keyRadiance[0] * keyUp * beamLoss,
    keyRadiance[1] * keyUp * beamLoss,
    keyRadiance[2] * keyUp * beamLoss,
  ];

  const keyLevel = luminance(keyIlluminance);
  const skyLevel = luminance(irradiance);
  // The fraction of the light a shadow is allowed to remove. Overcast drives it
  // toward zero on its own, which is why softening the shadow needs no slider.
  const directShare = keyLevel + skyLevel > 1e-6 ? keyLevel / (keyLevel + skyLevel) : 0;

  return {
    data,
    width,
    height,
    skyIrradiance: irradiance,
    keyIlluminance,
    directShare,
    sunElevationDeg,
  };
}
