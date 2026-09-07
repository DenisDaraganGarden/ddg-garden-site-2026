import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useCloudScene } from './CloudSceneContext.jsx';
import {
  bindCloudShadowMaterial,
  updateBoundCloudShadowMaterial,
  updateCloudShadowUniforms,
} from './cloudShadowRuntime.js';

// The CSM adapter owns CSM materials and applies its post-chunk hook itself.
// This receiver owns everything else, including the single-cascade fallback.
// It never creates a light: it only tints an already computed directional ray.
export default function CloudShadowReceivers() {
  const { scene } = useThree();
  const cloudScene = useCloudScene();
  const ownedRef = useRef(new Map());

  useFrame(() => {
    const descriptor = cloudScene?.current;
    scene.traverse((object) => {
      if (!object.isMesh && !object.isInstancedMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (!material) return;
        // CSM expands its directional chunk after normal callbacks. Its adapter
        // owns that path and restores the fallback callback on disposal.
        if ((material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)
          && !Object.hasOwn(material.defines ?? {}, 'USE_CSM')) {
          if (!ownedRef.current.has(material)) {
            const dispose = bindCloudShadowMaterial(material, cloudScene);
            if (dispose) {
              const onDispose = () => {
                ownedRef.current.delete(material);
                material.removeEventListener('dispose', onDispose);
              };
              material.addEventListener('dispose', onDispose);
              ownedRef.current.set(material, { dispose, onDispose });
            }
          }
          updateBoundCloudShadowMaterial(material);
        }
        const plantUniforms = material.userData?.ddgCloudShadowUniforms ?? material.userData?.uniforms;
        if (plantUniforms?.uDdgCloudShadowEnabled) updateCloudShadowUniforms(plantUniforms, descriptor);
      });
    });
  }, -3);

  useEffect(() => () => {
    ownedRef.current.forEach(({ dispose, onDispose }, material) => {
      material.removeEventListener('dispose', onDispose);
      dispose();
    });
    ownedRef.current.clear();
  }, []);

  return null;
}
