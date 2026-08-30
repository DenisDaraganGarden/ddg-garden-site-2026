import * as THREE from 'three';

const contactRotation = new THREE.Quaternion();
const stemMatrix = new THREE.Matrix4();
const contactMatrix = new THREE.Matrix4();
const stemPosition = new THREE.Vector3();
const contactPosition = new THREE.Vector3();
const stemScale = new THREE.Vector3();
const contactScale = new THREE.Vector3();
const identityRotation = new THREE.Quaternion();
const contactBaseNormal = new THREE.Vector3(0, 0, 1);
const contactNormal = new THREE.Vector3();

const fract = (value) => value - Math.floor(value);

function seabedNoise(x, y) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const localX = fract(x);
  const localY = fract(y);
  const smoothX = localX * localX * (3 - 2 * localX);
  const smoothY = localY * localY * (3 - 2 * localY);
  const hash = (sampleX, sampleY) => fract(
    Math.sin(sampleX * 127.1 + sampleY * 311.7) * 43758.5453123,
  );
  const a = hash(cellX, cellY);
  const b = hash(cellX + 1, cellY);
  const c = hash(cellX, cellY + 1);
  const d = hash(cellX + 1, cellY + 1);

  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, smoothX),
    THREE.MathUtils.lerp(c, d, smoothX),
    smoothY,
  );
}

// Matches the five-octave `sampleRelief` in waterRuntimeShaders.js. World Z is
// flipped when the seabed plane rotates from XY into XZ, hence the UV mapping.
export function sampleSurfaceVegetationSeabedRelief(worldX, worldZ, settings) {
  const uv = getSurfaceVegetationSeabedUv(worldX, worldZ, settings);
  return sampleSurfaceVegetationSeabedReliefAtUv(uv, settings);
}

function getSurfaceVegetationSeabedUv(worldX, worldZ, settings) {
  const extent = Math.max(Number(settings.waterExtent) || 0, 0.001);
  return new THREE.Vector2(
    (worldX / extent) + 0.5,
    0.5 - (worldZ / extent),
  );
}

function sampleSurfaceVegetationSeabedReliefAtUv(uv, settings) {
  let x = uv.x;
  let y = uv.y;
  let value = 0;
  let amplitude = 0.5;
  const reliefScale = Number(settings.seabedReliefScale) || 0;

  x *= reliefScale;
  y *= reliefScale;
  for (let octave = 0; octave < 5; octave += 1) {
    value += amplitude * seabedNoise(x, y);
    x *= 2;
    y *= 2;
    amplitude *= 0.5;
  }

  return (value - 0.5) * (Number(settings.seabedReliefStrength) || 0);
}

// Uses the same 0.015 UV central point and forward differences as the seabed
// vertex shader, then rotates that local-plane normal into world XZ space.
export function sampleSurfaceVegetationSeabedNormal(worldX, worldZ, settings, target) {
  const uv = getSurfaceVegetationSeabedUv(worldX, worldZ, settings);
  const relief = sampleSurfaceVegetationSeabedReliefAtUv(uv, settings);
  const step = 0.015;
  const dx = sampleSurfaceVegetationSeabedReliefAtUv(
    new THREE.Vector2(uv.x + step, uv.y),
    settings,
  ) - relief;
  const dy = sampleSurfaceVegetationSeabedReliefAtUv(
    new THREE.Vector2(uv.x, uv.y + step),
    settings,
  ) - relief;
  return target.set(-dx, 1, dy).normalize();
}

export function createSurfacePlantStemGeometry(maxInstances) {
  const geometry = new THREE.CylinderGeometry(1, 0.72, 1, 5, 1, true);
  geometry.setAttribute(
    'aStemBaseY',
    new THREE.InstancedBufferAttribute(new Float32Array(maxInstances), 1),
  );
  geometry.setAttribute(
    'aStemWaterUv',
    new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 2), 2),
  );
  return geometry;
}

export function getSurfaceVegetationAnchor(geometry, index, settings) {
  const scatter = geometry.getAttribute('aScatter');
  const cluster = geometry.getAttribute('aCluster');
  const scale = geometry.getAttribute('aScale');
  const blend = THREE.MathUtils.clamp(settings.surfacePlantClustering, 0, 1);
  const placementX = THREE.MathUtils.lerp(scatter.getX(index), cluster.getX(index), blend);
  const placementZ = THREE.MathUtils.lerp(scatter.getY(index), cluster.getY(index), blend);
  const sizeVariation = THREE.MathUtils.lerp(0.52, 1.46, scale.getX(index));

  return {
    x: settings.surfacePlantCenterX + placementX * settings.surfacePlantRadius,
    z: settings.surfacePlantCenterZ + placementZ * settings.surfacePlantRadius,
    sizeVariation,
  };
}

export function getSurfaceVegetationStemClearance() {
  return 0.016;
}

// The leaf mesh already owns the deterministic scatter. Reusing its attributes
// keeps each root exactly below its own pad while adding only two instanced draw
// calls: slender stems and soft, depth-darkened attachment marks on the bed.
export function updateSurfaceVegetationAnchors({
  geometry,
  stemGeometry,
  stemMesh,
  contactMesh,
  maxInstances,
  settings,
}) {
  if (!stemMesh || !contactMesh || !stemGeometry) return;

  const count = Math.round(
    THREE.MathUtils.clamp(settings.surfacePlantAmount, 0, 1) * maxInstances,
  );
  const waterDepth = Math.max(Number(settings.waterDepthMeters) || 0, 0.03);
  const stemBaseY = stemGeometry.getAttribute('aStemBaseY');
  const stemWaterUv = stemGeometry.getAttribute('aStemWaterUv');

  for (let index = 0; index < count; index += 1) {
    const anchor = getSurfaceVegetationAnchor(geometry, index, settings);
    const waterUv = getSurfaceVegetationSeabedUv(anchor.x, anchor.z, settings);
    const relief = sampleSurfaceVegetationSeabedRelief(anchor.x, anchor.z, settings);
    const seabedY = -waterDepth + relief;
    const insideWater = waterUv.x >= 0.012
      && waterUv.x <= 0.988
      && waterUv.y >= 0.012
      && waterUv.y <= 0.988;
    const stemRadius = THREE.MathUtils.lerp(0.0024, 0.0052, anchor.sizeVariation);
    const contactRadius = Math.max(0.028, settings.surfacePlantSize * anchor.sizeVariation * 0.31);
    stemBaseY.setX(index, seabedY);
    stemWaterUv.setXY(index, waterUv.x, waterUv.y);

    if (!insideWater) {
      stemScale.set(0, 0, 0);
      stemMatrix.compose(stemPosition.set(0, 0, 0), identityRotation, stemScale);
      stemMesh.setMatrixAt(index, stemMatrix);
      contactMesh.setMatrixAt(index, stemMatrix);
      continue;
    }

    // Height is resolved in the stem shader from the same wave textures as the
    // leaf. Keep only horizontal placement and radius in the instance matrix.
    stemPosition.set(anchor.x, 0, anchor.z);
    stemScale.set(stemRadius, 1, stemRadius);
    stemMatrix.compose(stemPosition, identityRotation, stemScale);
    stemMesh.setMatrixAt(index, stemMatrix);

    sampleSurfaceVegetationSeabedNormal(anchor.x, anchor.z, settings, contactNormal);
    contactPosition.set(anchor.x, seabedY, anchor.z).addScaledVector(contactNormal, 0.006);
    contactScale.set(contactRadius, contactRadius, 1);
    contactRotation.setFromUnitVectors(contactBaseNormal, contactNormal);
    contactMatrix.compose(contactPosition, contactRotation, contactScale);
    contactMesh.setMatrixAt(index, contactMatrix);
  }

  stemMesh.count = count;
  contactMesh.count = count;
  stemMesh.instanceMatrix.needsUpdate = true;
  contactMesh.instanceMatrix.needsUpdate = true;
  stemBaseY.needsUpdate = true;
  stemWaterUv.needsUpdate = true;
}

export function createSurfacePlantContactMap(size = 32) {
  const data = new Uint8Array(size * size * 4);
  const radius = Math.max(size * 0.5, 1);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x + 0.5 - radius, y + 0.5 - radius) / radius;
      const falloff = 1 - THREE.MathUtils.smoothstep(distance, 0.16, 1);
      const alpha = Math.round(falloff * falloff * 178);
      const offset = (y * size + x) * 4;
      // Three's alphaMap shader chunk samples the green channel, not alpha.
      // Keep alpha in sync for inspection/export, but write the live falloff to
      // RGB so the soft decal survives material compilation on every renderer.
      data[offset] = alpha;
      data[offset + 1] = alpha;
      data[offset + 2] = alpha;
      data[offset + 3] = alpha;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
