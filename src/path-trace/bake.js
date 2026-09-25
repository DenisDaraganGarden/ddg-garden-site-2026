import * as THREE from 'three';
import { readRenderTargetPixelsWithPboGuard } from '../components/effects/safeRenderTargetReadback.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export function rendererState(gl) {
    const target = gl.getRenderTarget(), viewport = gl.getViewport(new THREE.Vector4()), scissor = gl.getScissor(new THREE.Vector4());
    const scissorTest = gl.getScissorTest(), clear = gl.getClearColor(new THREE.Color()), alpha = gl.getClearAlpha();
    const autoClear = gl.autoClear, tone = gl.toneMapping, exposure = gl.toneMappingExposure, xr = gl.xr.enabled;
    return () => { gl.setRenderTarget(target); gl.setViewport(viewport); gl.setScissor(scissor); gl.setScissorTest(scissorTest); gl.setClearColor(clear, alpha); gl.autoClear = autoClear; gl.toneMapping = tone; gl.toneMappingExposure = exposure; gl.xr.enabled = xr; };
}

// Copy physical surface fields only. userData may contain owned caches, original
// materials and live callbacks, none of which belong in an offline snapshot.
export function physicalCopy(source) {
    const out = new THREE.MeshPhysicalMaterial();
    const skip = new Set(['id', 'uuid', 'type', 'version', 'userData', 'defines']);
    for (const key of Object.keys(out)) {
        if (skip.has(key) || !(key in source)) continue;
        const value = source[key];
        if (value?.isTexture || value == null || ['number', 'boolean', 'string'].includes(typeof value)) out[key] = value;
        else if ((value.isColor || value.isVector2) && out[key]?.copy) out[key].copy(value);
    }
    out.envMap = null; out.aoMap = null; out.lightMap = null;
    out.blending = THREE.NormalBlending;
    return out;
}

export function groundUv(geometry) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox, p = geometry.attributes.position, uv = new Float32Array(p.count * 2);
    const dx = Math.max(.001, box.max.x - box.min.x), dz = Math.max(.001, box.max.z - box.min.z);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) - box.min.x) / dx; uv[i * 2 + 1] = (p.getZ(i) - box.min.z) / dz; }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export function bakeSurface(gl, mesh, camera, edge, own) {
    const original = mesh.material, descriptor = original.pathTraceSurface;
    const geometry = mesh.geometry.clone();
    const isGround = descriptor.kind !== 'plant';
    if (isGround) groundUv(geometry);
    else geometry.setAttribute('aVary', new THREE.InstancedBufferAttribute(new Float32Array([1, 1]), 2));
    const baked = physicalCopy(original);
    // Seasonal cards and ground use the very same map equations as the editor.
    // Lighting is not baked: path tracing computes it, including indirect light.
    const restore = rendererState(gl);
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial();
    material.side = THREE.DoubleSide; material.depthTest = false; material.depthWrite = false;
    material.map = original.map; material.alphaTest = 0; material.defines = { ...original.defines };
    for (const key of Object.keys(material.defines)) if (key.startsWith('CSM')) delete material.defines[key];
    let channel = 'color';
    material.onBeforeCompile = (shader) => {
        descriptor.compile(shader, gl);
        shader.vertexShader = shader.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\ngl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);');
        const value = channel === 'normal'
            ? 'vec4(normalize(inverseTransformDirection(normal, viewMatrix)).xzy * 0.5 + 0.5, 1.0)'
            : 'vec4(diffuseColor.rgb, diffuseColor.a)';
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `gl_FragColor = ${value};`)
            .replace('#include <tonemapping_fragment>', '').replace('#include <colorspace_fragment>', '')
            .replace('#include <fog_fragment>', '').replace('#include <dithering_fragment>', '');
    };
    material.customProgramCacheKey = () => `trace-bake:${descriptor.kind}:${channel}:${original.customProgramCacheKey()}`;
    const draw = isGround ? new THREE.Mesh(geometry, material) : new THREE.InstancedMesh(geometry, material, 1);
    draw.matrixAutoUpdate = false; draw.matrix.copy(mesh.matrixWorld); draw.frustumCulled = false;
    if (draw.isInstancedMesh) draw.setMatrixAt(0, new THREE.Matrix4());
    scene.add(draw);
    try {
        gl.toneMapping = THREE.NoToneMapping; gl.xr.enabled = false; gl.autoClear = true; gl.setClearColor(0, 0);
        for (channel of isGround ? ['color', 'normal'] : ['color']) {
            const target = own(new THREE.WebGLRenderTarget(edge, edge, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
            material.needsUpdate = true; gl.setRenderTarget(target); gl.render(scene, camera);
            if (channel === 'color') baked.map = target.texture;
            else { baked.normalMap = target.texture; baked.normalScale.set(1, 1); }
        }
        baked.color.set(0xffffff); baked.roughness = original.roughness;
        baked.alphaTest = isGround ? 0 : original.alphaTest;
        baked.transparent = false;
        return baked;
    } finally { geometry.dispose(); material.dispose(); if (draw.isInstancedMesh) draw.dispose(); restore(); }
}

// Path tracing needs an unfiltered, CPU-readable equirectangular map. Decode
// the current CubeUV environment once, including its current cloud lighting.
export function bakeEnvironment(gl, scene, own) {
    const source = scene.environment;
    if (!source) return null;
    if (source.image?.data && source.mapping !== THREE.CubeUVReflectionMapping) return source;
    const width = 512, height = 256, restore = rendererState(gl);
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.FloatType, depthBuffer: false });
    const cube = source.mapping === THREE.CubeUVReflectionMapping;
    const image = source.image ?? { width: 768, height: 1024 };
    const material = new THREE.ShaderMaterial({
        uniforms: { source: { value: source } },
        defines: cube ? { ENVMAP_TYPE_CUBE_UV: '', CUBEUV_TEXEL_WIDTH: 1 / image.width, CUBEUV_TEXEL_HEIGHT: 1 / image.height, CUBEUV_MAX_MIP: `${Math.log2(image.height / 4)}.0`.replace('.0.0', '.0') } : {},
        vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
        fragmentShader: `varying vec2 vUv; uniform sampler2D source;\n#include <common>\n${cube ? '#include <cube_uv_reflection_fragment>' : ''}\nvoid main(){ float phi=(vUv.x-.5)*2.*PI; float theta=vUv.y*PI; vec3 d=vec3(cos(phi)*sin(theta),-cos(theta),sin(phi)*sin(theta)); gl_FragColor=vec4(${cube ? 'textureCubeUV(source,d,0.).rgb' : 'texture2D(source,vUv).rgb'},1.); }`,
        depthTest: false, depthWrite: false,
    });
    const quad = new FullScreenQuad(material);
    try {
        gl.setRenderTarget(target); quad.render(gl);
        const data = new Float32Array(width * height * 4); readRenderTargetPixelsWithPboGuard(gl, target, 0, 0, width, height, data);
        const texture = own(new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType));
        texture.mapping = THREE.EquirectangularReflectionMapping; texture.colorSpace = THREE.LinearSRGBColorSpace; texture.needsUpdate = true;
        return texture;
    } finally { quad.dispose(); material.dispose(); target.dispose(); restore(); }
}
