import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { rendererState, bakeEnvironment } from './bake.js';
import { readRenderTargetPixelsWithPboGuard } from '../components/effects/safeRenderTargetReadback.js';

// Visible sky is separate from HDRI illumination in the editor. Keep that
// distinction: render the current sky shader once into a direction-space map.
export function bakeBackground(gl, scene, own) {
    const clouds = scene.pathTraceSky, dome = scene.getObjectByName('sky-dome');
    if (!clouds && !dome?.visible) {
        if (scene.background?.isColor) {
            const color = scene.background;
            const texture = own(new THREE.DataTexture(new Float32Array([color.r, color.g, color.b, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType));
            texture.needsUpdate = true;
            return { texture, intensity: 1, rotation: new THREE.Euler() };
        }
        return { texture: scene.background?.isTexture ? bakeEnvironment(gl, { environment: scene.background }, own) : null,
            intensity: scene.backgroundIntensity ?? scene.environmentIntensity, rotation: scene.backgroundRotation };
    }
    const uniforms = { ...(clouds?.uniforms ?? dome.material.uniforms) };
    let fragmentShader;
    if (clouds) {
        uniforms.uEnvironmentTint = { value: new THREE.Vector3(1, 1, 1) };
        fragmentShader = clouds.fragmentShader.replace('cloudClearSky(ray,false)', 'cloudClearSky(ray,true)');
    } else {
        fragmentShader = dome.material.fragmentShader.replace('varying vec3 vRay;', 'varying vec2 vUv;')
            .replace('vec3 ray = normalize(vRay);', 'float az=(vUv.x-.5)*6.28318530718;float el=(vUv.y-.5)*3.14159265359;vec3 ray=vec3(cos(az)*cos(el),sin(el),sin(az)*cos(el));');
    }
    fragmentShader = fragmentShader.replace('#include <tonemapping_fragment>', '').replace('#include <colorspace_fragment>', '').replace('#include <dithering_fragment>', '');
    const restore = rendererState(gl), width = 2048, height = 1024;
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.FloatType, depthBuffer: false });
    const material = new THREE.ShaderMaterial({ uniforms, defines: clouds ? { CLOUD_SKY_ATLAS: 1 } : {}, fragmentShader,
        vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}', depthTest: false, depthWrite: false, toneMapped: false });
    const quad = new FullScreenQuad(material);
    try {
        gl.setRenderTarget(target); gl.setScissorTest(false); quad.render(gl);
        const data = new Float32Array(width * height * 4);
        readRenderTargetPixelsWithPboGuard(gl, target, 0, 0, width, height, data);
        const texture = own(new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType));
        texture.mapping = THREE.EquirectangularReflectionMapping; texture.colorSpace = THREE.LinearSRGBColorSpace;
        texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.wrapS = THREE.RepeatWrapping; texture.needsUpdate = true;
        return { texture, intensity: 1, rotation: new THREE.Euler() };
    } finally { quad.dispose(); material.dispose(); target.dispose(); restore(); }
}
