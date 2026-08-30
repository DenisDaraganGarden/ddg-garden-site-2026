const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const fract = (value) => value - Math.floor(value);

// This is intentionally the same value-noise FBM used by the seabed vertex
// shader. Keeping the CPU projection on the same field gives the decal its
// actual height above the relief while the GPU pins the visible quad precisely
// to that relief in the refraction capture.
const hash = (x, y) => fract(Math.sin((x * 127.1) + (y * 311.7)) * 43758.5453123);

const noise = (x, y) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ax = hash(ix, iy);
  const bx = hash(ix + 1, iy);
  const cx = hash(ix, iy + 1);
  const dx = hash(ix + 1, iy + 1);
  const ux = fx * fx * (3 - (2 * fx));
  const uy = fy * fy * (3 - (2 * fy));

  return ax + ((bx - ax) * ux) + ((cx - ax) * uy * (1 - ux)) + ((dx - bx) * ux * uy);
};

const fbm = (x, y) => {
  let value = 0;
  let amplitude = 0.5;
  let sampleX = x;
  let sampleY = y;

  for (let octave = 0; octave < 5; octave += 1) {
    value += amplitude * noise(sampleX, sampleY);
    sampleX *= 2;
    sampleY *= 2;
    amplitude *= 0.5;
  }

  return value;
};

export function sampleFishShadowSeabedRelief({
  x,
  z,
  waterExtent,
  reliefStrength,
  reliefScale,
}) {
  const extent = Math.max(Number(waterExtent) || 0, 0.001);
  const strength = Number.isFinite(reliefStrength) ? reliefStrength : 0;
  const scale = Math.max(Number(reliefScale) || 0, 0.001);
  const u = (x / extent) + 0.5;
  // The seabed plane is rotated -90° around X: its V coordinate points along
  // negative world Z. This must match `seabedVertexShader` exactly.
  const v = 0.5 - (z / extent);

  return (fbm(u * scale, v * scale) - 0.5) * strength;
}

export function resolveFishContactShadow({
  position,
  forward,
  catalog,
  lightDirection,
  waterExtent,
  waterDepthMeters,
  seabedReliefStrength,
  seabedReliefScale,
  scale = 1,
}, output = {}) {
  const sourcePosition = position ?? {};
  const sourceForward = forward ?? {};
  const sourceLight = lightDirection ?? {};
  const bodyScale = Math.max(Number(scale) || 0, 0.01);
  const fishLength = Math.max(Number(catalog?.length) || 0.1, 0.03) * bodyScale;
  const fishHalfHeight = Math.max(Number(catalog?.halfHeight) || 0.03, 0.01) * bodyScale;
  const depth = Math.max(Number(waterDepthMeters) || 0, 0.01);
  const fishX = Number(sourcePosition.x) || 0;
  const fishY = Number(sourcePosition.y) || 0;
  const fishZ = Number(sourcePosition.z) || 0;
  const rawLightLength = Math.hypot(
    Number(sourceLight.x) || 0,
    Number(sourceLight.y) || 0,
    Number(sourceLight.z) || 0,
  );
  const lightX = rawLightLength > 1e-5 ? (Number(sourceLight.x) || 0) / rawLightLength : 0;
  const lightY = rawLightLength > 1e-5 ? (Number(sourceLight.y) || 1) / rawLightLength : 1;
  const lightZ = rawLightLength > 1e-5 ? (Number(sourceLight.z) || 0) / rawLightLength : 0;
  const flatForwardLength = Math.hypot(Number(sourceForward.x) || 0, Number(sourceForward.z) || 0);
  const forwardX = flatForwardLength > 1e-5 ? (Number(sourceForward.x) || 0) / flatForwardLength : 1;
  const forwardZ = flatForwardLength > 1e-5 ? (Number(sourceForward.z) || 0) / flatForwardLength : 0;
  let projectedX = fishX;
  let projectedZ = fishZ;
  let seabedY = -depth;
  let height = 0;

  // Two fixed samples are enough for the shallow relief envelope, while
  // keeping every fish projection allocation-free and deterministic.
  for (let sample = 0; sample < 2; sample += 1) {
    seabedY = -depth + sampleFishShadowSeabedRelief({
      x: projectedX,
      z: projectedZ,
      waterExtent,
      reliefStrength: seabedReliefStrength,
      reliefScale: seabedReliefScale,
    });
    height = Math.max(0, fishY - seabedY);
    const projection = height / Math.max(lightY, 0.18);
    projectedX = fishX - (lightX * projection);
    projectedZ = fishZ - (lightZ * projection);
  }

  seabedY = -depth + sampleFishShadowSeabedRelief({
    x: projectedX,
    z: projectedZ,
    waterExtent,
    reliefStrength: seabedReliefStrength,
    reliefScale: seabedReliefScale,
  });
  height = Math.max(0, fishY - seabedY);
  const bodyWidth = Math.min(fishLength * 0.48, fishHalfHeight * 2.7);
  const heightFade = Math.exp(-height * 1.18);

  output.x = projectedX;
  output.z = projectedZ;
  output.yaw = Math.atan2(forwardZ, forwardX);
  output.length = fishLength * (0.72 + (height * 0.34));
  output.width = bodyWidth * (1.08 + (height * 0.58));
  output.opacity = clamp((0.19 + (fishLength * 0.07)) * heightFade, 0.012, 0.23);
  output.seabedY = seabedY;
  output.height = height;

  return output;
}
