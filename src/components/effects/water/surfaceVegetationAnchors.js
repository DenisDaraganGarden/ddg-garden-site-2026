import * as THREE from 'three';

const contactRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const stemMatrix = new THREE.Matrix4();
const contactMatrix = new THREE.Matrix4();
const stemPosition = new THREE.Vector3();
const contactPosition = new THREE.Vector3();
const stemScale = new THREE.Vector3();
const contactScale = new THREE.Vector3();
const identityRotation = new THREE.Quaternion();

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
  const extent = Math.max(Number(settings.waterExtent) || 0, 0.001);
  let x = (worldX / extent) + 0.5;
  let y = 0.5 - (worldZ / extent);
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

// The leaf mesh already owns the deterministic scatter. Reusing its attributes
// keeps each root exactly below its own pad while adding only two instanced draw
// calls: slender stems and soft, depth-darkened attachment marks on the bed.
export function updateSurfaceVegetationAnchors({
  geometry,
  stemMesh,
  contactMesh,
  maxInstances,
  settings,
}) {
  if (!stemMesh || !contactMesh) return;

  const count = Math.round(
    THREE.MathUtils.clamp(settings.surfacePlantAmount, 0, 1) * maxInstances,
  );
  const waterDepth = Math.max(Number(settings.waterDepthMeters) || 0, 0.03);
  const floatOffset = Number(settings.surfacePlantFloatOffset) || 0;
  // The real leaf rides a GPU height field. Instead of a CPU readback for each
  // stem, its tip overlaps the full authored wave envelope. That removes the
  // visible split at crests while keeping this layer static and inexpensive.
  const waveReach = Math.abs(Number(settings.waveAmplitude) || 0) * 2.6 + 0.035;

  for (let index = 0; index < count; index += 1) {
    const anchor = getSurfaceVegetationAnchor(geometry, index, settings);
    const relief = sampleSurfaceVegetationSeabedRelief(anchor.x, anchor.z, settings);
    const seabedY = -waterDepth + relief;
    const stemHeight = Math.max(0.03, floatOffset + waveReach - seabedY);
    const stemRadius = THREE.MathUtils.lerp(0.0045, 0.0105, anchor.sizeVariation);
    const contactRadius = Math.max(0.028, settings.surfacePlantSize * anchor.sizeVariation * 0.31);

    stemPosition.set(anchor.x, seabedY + stemHeight * 0.5, anchor.z);
    stemScale.set(stemRadius, stemHeight, stemRadius);
    stemMatrix.compose(stemPosition, identityRotation, stemScale);
    stemMesh.setMatrixAt(index, stemMatrix);

    contactPosition.set(anchor.x, seabedY + 0.006, anchor.z);
    contactScale.set(contactRadius, contactRadius, 1);
    contactMatrix.compose(contactPosition, contactRotation, contactScale);
    contactMesh.setMatrixAt(index, contactMatrix);
  }

  stemMesh.count = count;
  contactMesh.count = count;
  stemMesh.instanceMatrix.needsUpdate = true;
  contactMesh.instanceMatrix.needsUpdate = true;
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
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
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
