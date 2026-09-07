import * as THREE from 'three';

export const contactAoVertexShader = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Depth-only contact AO. The depth source is deliberately an opaque-only
// capture: water, sky and blended decals are absent, so they cannot receive
// the familiar screen-space dark halo. Cutout leaves remain because their own
// alpha test and wind shaders are rendered unchanged in the capture.
export const contactAoFragmentShader = `
  varying vec2 vUv;
  uniform sampler2D uDepth;
  uniform vec2 uResolution;
  uniform float uNear;
  uniform float uFar;
  uniform float uRadius;
  uniform float uIntensity;
  uniform float uLogDepth;
  uniform mat4 uProjectionInverse;
  uniform mat4 uProjection;

  float viewDistance(float depth) {
    if (uLogDepth > 0.5) return max(exp2(depth * log2(uFar + 1.0)) - 1.0, 0.0);
    float viewZ = (uNear * uFar) / ((uFar - uNear) * depth - uFar);
    return max(-viewZ, 0.0);
  }

  vec3 viewPosition(vec2 uv, float rawDepth) {
    float distance = viewDistance(rawDepth);
    vec4 ray = uProjectionInverse * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    ray.xyz /= max(abs(ray.w), 0.00001);
    return ray.xyz * (distance / max(-ray.z, 0.00001));
  }

  vec3 readPosition(vec2 uv) {
    return viewPosition(uv, texture2D(uDepth, clamp(uv, 0.001, 0.999)).r);
  }

  vec3 discontinuityAwareNormal(vec2 uv, vec3 center) {
    vec2 texel = 1.0 / max(uResolution, vec2(1.0));
    vec3 left = readPosition(uv - vec2(texel.x, 0.0));
    vec3 right = readPosition(uv + vec2(texel.x, 0.0));
    vec3 down = readPosition(uv - vec2(0.0, texel.y));
    vec3 up = readPosition(uv + vec2(0.0, texel.y));
    vec3 dx = length(left - center) < length(right - center) ? center - left : right - center;
    vec3 dy = length(down - center) < length(up - center) ? center - down : up - center;
    vec3 normal = normalize(cross(dx, dy));
    return dot(normal, -normalize(center)) < 0.0 ? -normal : normal;
  }

  vec2 projectUv(vec3 position) {
    vec4 clip = uProjection * vec4(position, 1.0);
    return clip.xy / max(clip.w, 0.00001) * 0.5 + 0.5;
  }

  void main() {
    float centerRaw = texture2D(uDepth, vUv).r;
    if (centerRaw > 0.999999) { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); return; }
    vec3 center = viewPosition(vUv, centerRaw);
    vec3 normal = discontinuityAwareNormal(vUv, center);
    vec3 view = normalize(-center);
    vec3 tangent = normalize(abs(normal.y) < 0.95 ? cross(normal, vec3(0.0, 1.0, 0.0)) : cross(normal, vec3(1.0, 0.0, 0.0)));
    vec3 bitangent = cross(normal, tangent);
    float rotation = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
    float occ = 0.0;
    const float bias = 0.025;
    for (int i = 0; i < 8; i++) {
      float fi = float(i);
      float angle = rotation + fi * 2.3999632;
      float radial = (fi + 0.5) / 8.0;
      float elevation = mix(0.18, 0.94, fract(fi * 0.6180339 + rotation * 0.159));
      vec3 hemisphere = normalize(tangent * cos(angle) + bitangent * sin(angle) + normal * elevation);
      vec3 probe = center + hemisphere * (uRadius * radial);
      vec2 sampleUv = projectUv(probe);
      if (any(lessThan(sampleUv, vec2(0.001))) || any(greaterThan(sampleUv, vec2(0.999)))) continue;
      float sampleRaw = texture2D(uDepth, sampleUv).r;
      if (sampleRaw > 0.999999) continue;
      vec3 scenePosition = viewPosition(sampleUv, sampleRaw);
      float depthDelta = scenePosition.z - probe.z;
      float range = length(scenePosition - center);
      float horizon = smoothstep(bias, bias + uRadius * 0.35, depthDelta);
      float normalWeight = max(dot(normal, normalize(scenePosition - center)), 0.0);
      float falloff = 1.0 - smoothstep(uRadius * 0.55, uRadius * 1.25, range);
      occ += horizon * normalWeight * falloff;
    }
    float ao = 1.0 - clamp((occ / 8.0) * uIntensity, 0.0, 0.82);
    gl_FragColor = vec4(ao, 0.0, 0.0, 1.0);
  }
`;

const excludedNames = new Set([
  'water-surface', 'shore-water-surface', 'far-water-surface', 'shore-water-strip',
  'coast-water', 'sky-dome', 'surface-vegetation', 'surface-vegetation-stems',
  'surface-vegetation-contacts', 'fish-contact-shadows', 'tanker-wake',
]);

export function decodeContactAoViewDistance(depth, near, far, logarithmic = true) {
  if (!Number.isFinite(depth) || !Number.isFinite(near) || !Number.isFinite(far) || near <= 0 || far <= near) return null;
  if (depth < 0 || depth > 1) return null;
  if (logarithmic) return Math.max((far + 1) ** depth - 1, 0);
  const denominator = ((far - near) * depth) - far;
  if (Math.abs(denominator) < 1e-12) return null;
  return Math.max(-((near * far) / denominator), 0);
}

export function reconstructContactAoViewPosition({ uv, depth, near, far, logarithmic, projectionInverse }) {
  const distance = decodeContactAoViewDistance(depth, near, far, logarithmic);
  if (distance === null || !projectionInverse) return null;
  const ray = new THREE.Vector4(uv.x * 2 - 1, uv.y * 2 - 1, 1, 1).applyMatrix4(projectionInverse);
  ray.multiplyScalar(1 / Math.max(Math.abs(ray.w), 1e-8));
  return new THREE.Vector3(ray.x, ray.y, ray.z).multiplyScalar(distance / Math.max(-ray.z, 1e-8));
}

export function isContactAoOccluder(sceneViewZ, probeViewZ, bias = 0.025) {
  return Number.isFinite(sceneViewZ) && Number.isFinite(probeViewZ) && sceneViewZ - probeViewZ > bias;
}

export function captureContactAoDepth({ gl, scene, camera, target }) {
  const hidden = [];
  const colorWrites = [];
  const previousTarget = gl.getRenderTarget();
  const previousBackground = scene.background;
  const previousAutoUpdate = gl.shadowMap.autoUpdate;
  scene.traverse((object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const isTransparent = materials.some((material) => material?.transparent || material?.depthWrite === false);
    if (excludedNames.has(object.name) || isTransparent) {
      if (object.visible) { hidden.push(object); object.visible = false; }
      return;
    }
    materials.forEach((material) => {
      if (!material || material.colorWrite === false) return;
      colorWrites.push([material, material.colorWrite]);
      material.colorWrite = false;
    });
  });
  try {
    scene.background = null;
    gl.shadowMap.autoUpdate = false;
    gl.setRenderTarget(target);
    gl.clear(true, true, true);
    gl.render(scene, camera);
  } finally {
    colorWrites.forEach(([material, value]) => { material.colorWrite = value; });
    hidden.forEach((object) => { object.visible = true; });
    scene.background = previousBackground;
    gl.shadowMap.autoUpdate = previousAutoUpdate;
    gl.setRenderTarget(previousTarget);
  }
}

export function createContactAoTargets() {
  const depthTarget = new THREE.WebGLRenderTarget(1, 1, { format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false });
  depthTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  depthTarget.depthTexture.format = THREE.DepthFormat;
  depthTarget.depthTexture.minFilter = THREE.NearestFilter;
  depthTarget.depthTexture.magFilter = THREE.NearestFilter;
  depthTarget.texture.name = 'contact-ao-opaque-depth';
  const aoTarget = new THREE.WebGLRenderTarget(1, 1, { format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false });
  aoTarget.texture.name = 'contact-ao-half-res';
  return { depthTarget, aoTarget };
}
