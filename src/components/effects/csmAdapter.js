import { CSM } from 'three/addons/csm/CSM.js';
import { CSMShader } from 'three/addons/csm/CSMShader.js';
import { resolveDirectionalShadowContact } from './shadowContactContract.js';

// CSM replaces Three's shared lighting chunk. Some DDG material patches run in
// the same fragment scope, so keep the addon's temporary fade variables private.
// This is idempotent because the old identifiers disappear after the first pass.
if (!CSMShader.lights_fragment_begin.includes('csmFadeMargin')) {
  CSMShader.lights_fragment_begin = CSMShader.lights_fragment_begin
    .replace(/\bcascadeCenter\b/g, 'csmCascadeCenter')
    .replace(/\bclosestEdge\b/g, 'csmClosestEdge')
    .replace(/\bmargin\b/g, 'csmFadeMargin')
    .replace(/\bcsmx\b/g, 'csmFadeStart')
    .replace(/\bcsmy\b/g, 'csmFadeEnd')
    .replace(/\bcascade\b/g, 'csmCascade');
}

// A material can only be driven by one live CSM instance. Keeping ownership on
// the material prevents a disposing scene from restoring hooks installed by a
// newer canvas while each adapter keeps its own explicit cleanup list.
const MATERIAL_OWNER = new WeakMap();
const MATERIAL_BASE_HOOKS = new WeakMap();

// CSM wraps both material callbacks. Off-scene passes (plant-card calibration)
// need the authored callback without CSM's viewport-camera uniforms; callers
// that are not registered simply receive their current hooks.
export function getBaseMaterialHooks(material) {
  const base = MATERIAL_BASE_HOOKS.get(material);
  return base && MATERIAL_OWNER.get(material) === base.owner
    ? { onBeforeCompile: base.onBeforeCompile, customProgramCacheKey: base.customProgramCacheKey }
    : { onBeforeCompile: material?.onBeforeCompile, customProgramCacheKey: material?.customProgramCacheKey };
}

const isLitStandardMaterial = (material) => Boolean(
  material?.isMeshStandardMaterial || material?.isMeshPhysicalMaterial,
);

const makeSplitCallback = (nearDistance) => (cascades, cameraNear, far, breaks) => {
  if (cascades <= 1) {
    breaks.push(1);
    return;
  }
  // This is a world-distance boundary, rather than a percentage that changes
  // with a camera's far plane. Keep a small usable near cascade at all times.
  const split = Math.min(Math.max(nearDistance, cameraNear + 0.5), far - 0.5);
  breaks.push(split / far, 1);
};

function makeFrustumKey(camera, { maxFar, nearDistance, shadowMapSize }) {
  // fov/aspect miss OrthographicCamera.zoom, view offsets and custom projection
  // matrices. The 16 projection values are tiny beside a shadow-map refit.
  return [
    camera.near, camera.far, ...camera.projectionMatrix.elements,
    maxFar, nearDistance, shadowMapSize,
  ].join('|');
}

export function createCsmAdapter({
  scene,
  camera,
  cascades,
  maxFar,
  nearDistance,
  shadowMapSize,
  lightDirection,
  lightColor,
  lightIntensity,
  shadowRadius,
  shadowIntensity,
  contactOffsetMeters,
  legacyBias,
}) {
  const csm = new CSM({
    camera,
    parent: scene,
    cascades,
    maxFar,
    mode: 'custom',
    customSplitsCallback: makeSplitCallback(nearDistance),
    shadowMapSize,
    lightDirection,
    lightIntensity,
    lightNear: 0.5,
    lightFar: maxFar + 80,
    lightMargin: 32,
  });
  csm.fade = true;

  const owner = {};
  const materials = new Map();
  let current = {
    maxFar,
    nearDistance,
    shadowMapSize,
    lightDirection: lightDirection.clone(),
    lightColor: lightColor.clone(),
    lightIntensity,
    shadowRadius,
    shadowIntensity,
    contactOffsetMeters,
    legacyBias,
  };
  let frustumKey = '';

  const restoreMaterial = (material, previous) => {
    if (!previous || MATERIAL_OWNER.get(material) !== owner) return;
    material.removeEventListener('dispose', previous.onDispose);
    const shader = csm.shaders.get(material);
    if (shader?.uniforms) {
      delete shader.uniforms.CSM_cascades;
      delete shader.uniforms.cameraNear;
      delete shader.uniforms.shadowFar;
    }
    csm.shaders.delete(material);
    material.onBeforeCompile = previous.previousCompile;
    material.customProgramCacheKey = previous.previousKey;
    previous.csmDefines.forEach(({ key, had, value }) => {
      if (had) material.defines[key] = value;
      else delete material.defines[key];
    });
    material.needsUpdate = true;
    MATERIAL_OWNER.delete(material);
    MATERIAL_BASE_HOOKS.delete(material);
    materials.delete(material);
  };

  const registerMaterial = (material) => {
    if (!isLitStandardMaterial(material) || MATERIAL_OWNER.has(material)) return;
    const previousCompile = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;
    const csmDefines = ['USE_CSM', 'CSM_CASCADES', 'CSM_FADE'].map((key) => ({
      key,
      had: Object.hasOwn(material.defines ?? {}, key),
      value: material.defines?.[key],
    }));
    csm.setupMaterial(material);
    const csmCompile = material.onBeforeCompile;
    material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
      previousCompile?.call(material, shader, renderer);
      csmCompile.call(material, shader, renderer);
    };
    material.customProgramCacheKey = function customProgramCacheKey() {
      return `${previousKey?.call(material) ?? material.type}|ddg-csm-${csm.cascades}`;
    };
    material.needsUpdate = true;
    const previous = { previousCompile, previousKey, csmDefines, onDispose: null };
    previous.onDispose = () => restoreMaterial(material, previous);
    material.addEventListener('dispose', previous.onDispose);
    MATERIAL_OWNER.set(material, owner);
    MATERIAL_BASE_HOOKS.set(material, { owner, onBeforeCompile: previousCompile, customProgramCacheKey: previousKey });
    materials.set(material, previous);
  };

  const scan = () => {
    scene.traverse((object) => {
      if (!object.isMesh && !object.isInstancedMesh) return;
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      objectMaterials.forEach(registerMaterial);
    });
  };

  const applyLightParameters = () => {
    csm.lightDirection.copy(current.lightDirection);
    csm.lights.forEach((light) => {
      light.color.copy(current.lightColor);
      light.intensity = current.lightIntensity;
      light.shadow.radius = current.shadowRadius;
      light.shadow.intensity = current.shadowIntensity;
      const shadowCamera = light.shadow.camera;
      const radius = Math.max(Math.abs(shadowCamera.right - shadowCamera.left), Math.abs(shadowCamera.top - shadowCamera.bottom)) * 0.5;
      const contact = resolveDirectionalShadowContact({
        legacyBias: current.legacyBias,
        contactOffsetMeters: current.contactOffsetMeters,
        near: shadowCamera.near,
        far: shadowCamera.far,
        radius,
        mapSize: current.shadowMapSize,
      });
      light.shadow.bias = contact.bias;
      light.shadow.normalBias = contact.normalBias;
      light.userData.ddgShadowContact = contact;
    });
  };

  const refreshFrustums = (force = false) => {
    const nextKey = makeFrustumKey(camera, current);
    if (!force && nextKey === frustumKey) return;
    csm.maxFar = current.maxFar;
    csm.mode = 'custom';
    csm.customSplitsCallback = makeSplitCallback(current.nearDistance);
    csm.lights.forEach((light) => {
      light.shadow.mapSize.set(current.shadowMapSize, current.shadowMapSize);
      light.shadow.camera.far = current.maxFar + 80;
    });
    csm.updateFrustums();
    frustumKey = nextKey;
    applyLightParameters();
  };

  const configure = (next = {}) => {
    const directionChanged = next.lightDirection && !current.lightDirection.equals(next.lightDirection);
    const colorChanged = next.lightColor && !current.lightColor.equals(next.lightColor);
    current = {
      ...current,
      ...next,
      lightDirection: next.lightDirection ? next.lightDirection.clone() : current.lightDirection,
      lightColor: next.lightColor ? next.lightColor.clone() : current.lightColor,
    };
    if (directionChanged || colorChanged || next.lightIntensity !== undefined || next.shadowRadius !== undefined
      || next.shadowIntensity !== undefined || next.contactOffsetMeters !== undefined || next.legacyBias !== undefined) {
      applyLightParameters();
    }
    refreshFrustums();
  };

  // First scan happens before the CSM lights turn visible so a material can
  // never render one frame with both CSM lights as independent suns.
  scan();
  refreshFrustums(true);
  csm.lights.forEach((light) => { light.visible = false; });

  return {
    csm,
    scan,
    configure,
    update() {
      // React mounts dynamic meshes between commits. Scanning each render keeps
      // their first draw under CSM; Map/WeakMap make registered materials cheap.
      scan();
      refreshFrustums();
      csm.lights.forEach((light) => { light.visible = true; });
      csm.update();
    },
    getShadowHandles() {
      return csm.lights.map((light) => ({
        map: light.shadow.map?.depthTexture ?? null,
        matrix: light.shadow.matrix,
        bias: light.shadow.bias,
        waterBias: light.userData.ddgShadowContact?.waterBias ?? light.shadow.bias,
        radius: light.shadow.radius,
        mapSize: light.shadow.mapSize,
      }));
    },
    getSplitDistance() {
      return (csm.breaks[0] ?? 1) * Math.min(camera.far, current.maxFar);
    },
    dispose() {
      // Restore first: CSM.dispose() otherwise deletes the wrapped hook before
      // we can put a material's original callback back.
      [...materials.entries()].forEach(([material, previous]) => restoreMaterial(material, previous));
      csm.remove();
      csm.dispose();
    },
  };
}
