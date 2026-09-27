import { getBaseMaterialHooks } from './csmAdapter.js';

const depthFragment = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(0.0);
}
`;

// Preserve the material's vertex program (wind, skinning, displacement and
// instancing), but opaque PBR receivers need none of its lighting/POM fragment
// work to fill a depth buffer. Cutouts and custom depth/discard shaders keep
// their original path. Do not substitute the light's depth material: a plant
// card may deliberately have a different silhouette from the sun's viewpoint.
export function createContactAoDepthMaterials() {
  const entries = new Map();
  function release(source) {
    const entry = entries.get(source);
    if (!entry) return;
    source.removeEventListener('dispose', entry.onDispose);
    entry.depth.dispose();
    entries.delete(source);
  }
  return {
    get(source) {
      if (!source?.isMeshStandardMaterial || source.alphaTest > 0 || source.alphaHash
          || source.alphaMap || source.transparent || source.depthWrite === false) return source;
      const hooks = getBaseMaterialHooks(source);
      const key = hooks.customProgramCacheKey?.call(source) ?? '';
      let entry = entries.get(source);
      if (entry && (entry.version !== source.version || entry.compile !== hooks.onBeforeCompile || entry.key !== key)) {
        release(source);
        entry = null;
      }
      if (!entry) {
        // userData may hold live shader/uniform handles, including cycles.
        // Material.clone() JSON-serialises it; a depth pass must not do that.
        const copySource = Object.create(source);
        copySource.userData = {};
        const depth = new source.constructor().copy(copySource);
        depth.userData = source.userData;
        depth.name = `${source.name}:ao-depth`;
        depth.colorWrite = false;
        depth.onBeforeRender = source.onBeforeRender;
        depth.onBeforeCompile = function compileAoDepth(shader, renderer) {
          hooks.onBeforeCompile?.call(source, shader, renderer);
          // An explicit fragment discard/depth write is geometry, not colour.
          // Unknown extensions retain their exact original behaviour.
          if (!/\bdiscard\b|\bgl_FragDepth(?:EXT)?\b/.test(shader.fragmentShader)) {
            shader.fragmentShader = depthFragment;
          }
        };
        depth.customProgramCacheKey = () => `${key}|ddg-opaque-ao-depth-v1`;
        entry = { depth, key, version: source.version, compile: hooks.onBeforeCompile, onDispose: () => release(source) };
        source.addEventListener('dispose', entry.onDispose);
        entries.set(source, entry);
      }
      entry.depth.displacementScale = source.displacementScale;
      entry.depth.displacementBias = source.displacementBias;
      entry.depth.clippingPlanes = source.clippingPlanes;
      return entry.depth;
    },
    dispose() { [...entries.keys()].forEach(release); },
    get size() { return entries.size; },
  };
}
