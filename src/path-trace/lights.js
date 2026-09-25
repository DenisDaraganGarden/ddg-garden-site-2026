import * as THREE from 'three';
import { PhysicalSpotLight } from 'three-gpu-pathtracer';
import { gardenLightUniforms } from '../lighting/gardenLightShader.js';

export function addTraceLights(source, target, own) {
    const { lighting } = source.pathTraceLighting ?? {};
    if (lighting?.key.sceneIntensity > 0) {
        const sun = new THREE.DirectionalLight(new THREE.Color().fromArray(lighting.key.colorLinear), lighting.key.sceneIntensity);
        sun.position.fromArray(lighting.key.direction); target.add(sun, sun.target);
    }
    // Additional authored point/spot sources, but never duplicate CSM suns or
    // view-only cursor flashlights.
    source.traverseVisible((light) => {
        if ((!light.isPointLight && !light.isSpotLight && !light.isRectAreaLight) || light.intensity <= 0) return;
        for (let p = light; p; p = p.parent) if (p.userData.editorOnly || p.name.startsWith('cursor-')) return;
        const copy = light.clone(false); copy.position.setFromMatrixPosition(light.matrixWorld);
        copy.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(light.matrixWorld));
        if (light.target) { copy.target = new THREE.Object3D(); light.target.getWorldPosition(copy.target.position); target.add(copy.target); }
        target.add(copy);
    });
    const garden = source.pathTraceGarden;
    const level = gardenLightUniforms.uGardenLevel.value;
    if (!garden || level <= 0) return 0;
    const profiles = new Map();
    for (const entry of garden.lights) {
        if (!profiles.has(entry.row)) {
            // The tracer samples cos(theta) against the light's backward axis.
            // Its IES map has theta in X, matching our 128-sample profile.
            const values = garden.profiles.slice(entry.row * 128, (entry.row + 1) * 128);
            const map = own(new THREE.DataTexture(values, 128, 1, THREE.RedFormat, THREE.FloatType));
            map.minFilter = map.magFilter = THREE.LinearFilter; map.needsUpdate = true; profiles.set(entry.row, map);
        }
        const light = new PhysicalSpotLight();
        light.position.set(entry.x, entry.y, entry.z);
        light.target.position.copy(light.position).add(new THREE.Vector3().fromArray(entry.axis));
        light.color.fromArray(entry.color); light.intensity = entry.peak * level;
        light.iesMap = profiles.get(entry.row); light.angle = Math.PI / 2; light.radius = entry.radius;
        light.distance = 0; light.decay = 2;
        target.add(light, light.target);
    }
    return garden.lights.length;
}
