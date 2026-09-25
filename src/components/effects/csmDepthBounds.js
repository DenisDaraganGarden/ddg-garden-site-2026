import { Vector3 } from 'three';

const point = new Vector3();

// The view distance is not the light-camera depth. A wide cascade viewed at
// an angle can be deeper than maxFar + a fixed margin, cutting holes in its
// shadows. Fit depth in light space; keep XY framing, texels and map sizes.
export function fitCsmDepthBounds(csm) {
  const distance = Math.min(csm.camera.far, csm.maxFar);
  for (let i = 0; i < csm.frustums.length; i += 1) {
    const light = csm.lights[i];
    const camera = light.shadow.camera;
    const vertices = csm.frustums[i].vertices;
    // CSM_FADE samples half of its transition window beyond each split.
    const nearPad = csm.fade ? 0.125 * (csm.breaks[i - 1] ?? 0) ** 2 * distance : 0;
    const farPad = csm.fade ? 0.125 * csm.breaks[i] ** 2 * distance : 0;
    let min = Infinity, max = -Infinity;
    for (let corner = 0; corner < 4; corner += 1) {
      const near = vertices.near[corner], far = vertices.far[corner];
      const span = Math.max(0.001, near.z - far.z);
      for (let end = 0; end < 2; end += 1) {
        const t = end === 0 ? -nearPad / span : 1 + farPad / span;
        point.lerpVectors(near, far, t).applyMatrix4(csm.camera.matrixWorld);
        const depth = point.sub(light.position).dot(csm.lightDirection);
        min = Math.min(min, depth);
        max = Math.max(max, depth);
      }
    }
    // Reserve the existing upstream caster margin, including in the blend
    // zone. Moving along the light ray leaves the stable XY projection intact.
    const shift = camera.near + csm.lightMargin - min;
    light.position.addScaledVector(csm.lightDirection, -shift);
    light.target.position.addScaledVector(csm.lightDirection, -shift);
    const far = Math.max(camera.near + 1, Math.ceil(max + shift + 1));
    if (camera.far !== far) {
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }
}
