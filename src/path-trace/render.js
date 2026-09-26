import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { PathTracingRenderer, PathTracingSceneGenerator } from 'three-gpu-pathtracer';
import { RenderTarget2DArray } from 'three-gpu-pathtracer/src/uniforms/RenderTarget2DArray.js';
import { TraceBvhWorker } from './bvhWorker.js';
import { acquireTraceSource } from './bridge.js';
import { snapshotScene, nextTask, checkAbort } from './snapshot.js';
import { rendererState } from './bake.js';
import { readRenderTargetPixelsWithPboGuard } from '../components/effects/safeRenderTargetReadback.js';

const abortable = (promise, signal) => new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Render cancelled', 'AbortError'));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
});
export function uploadTextureArray(array, gl, textures, width, height) {
    const views = textures.map((texture) => ({ texture, matrix: texture.matrix.clone(), auto: texture.matrixAutoUpdate }));
    try { array.setTextures(gl, textures, width, height); }
    finally { views.forEach(({ texture, matrix, auto }) => { texture.matrix.copy(matrix); texture.matrixAutoUpdate = auto; }); }
}

export function renderDimensions(aspect, edge) {
    const size = Math.min(4096, Math.max(256, Math.round(Number(edge) || 1536)));
    const ratio = Math.min(4, Math.max(.25, aspect || 1));
    return ratio >= 1 ? [size, Math.round(size / ratio)] : [Math.round(size * ratio), size];
}

function outputPass(texture, settings, exposure, denoise) {
    return new THREE.ShaderMaterial({
        uniforms: { map: { value: texture }, ev: { value: exposure + (settings.colorExposure || 0) }, toneMappingExposure: { value: 1 },
            contrast: { value: settings.colorContrast ?? 1 }, saturation: { value: settings.colorSaturation ?? 1 }, gamma: { value: settings.colorGamma ?? 1 }, smoothNoise: { value: denoise ? 1 : 0 }, pixel: { value: new THREE.Vector2(1 / texture.image.width, 1 / texture.image.height) } },
        depthTest: false, depthWrite: false, toneMapped: false,
        vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
        fragmentShader: `uniform sampler2D map; uniform float ev,contrast,saturation,gamma,smoothNoise; uniform vec2 pixel; varying vec2 vUv;
            #include <tonemapping_pars_fragment>
            void main(){ vec3 color=texture2D(map,vUv).rgb;
                if(smoothNoise>.5){ vec3 total=color;float weight=1.; for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){ if(x==0&&y==0)continue; vec3 c=texture2D(map,vUv+vec2(float(x),float(y))*pixel).rgb; float w=exp(-dot(c-color,c-color)/(0.002+dot(color,color)*.2))*.5;total+=c*w;weight+=w;} color=total/weight; }
                color=(color*exp2(ev)-.5)*contrast+.5;
                float l=dot(color,vec3(.2126,.7152,.0722)); color=mix(vec3(l),color,saturation);
                color=pow(max(color,vec3(0.)),vec3(1./max(.01,gamma)));
                color=ACESFilmicToneMapping(color);
                gl_FragColor=linearToOutputTexel(vec4(color,1.)); }`,
    });
}

// All allocations are owned by this job. The editor's textures/renderer remain
// borrowed, so cancel/close/error restores the same live scene and camera.
export async function renderTrace({ canvas, edge = 1536, samples = 256, bounces = 6, textureSize = 1024, exposure = 0, denoise = true, controller, onProgress }) {
    const signal = controller.signal, source = acquireTraceSource(controller);
    let snapshot, generator, worker, tracer, output, quad, display, arrays, ies;
    const restore = rendererState(source.gl), gl = source.gl;
    const contextLost = () => controller.abort();
    gl.domElement.addEventListener('webglcontextlost', contextLost);
    const started = performance.now();
    try {
        await nextTask(); await nextTask(); checkAbort(signal);
        const context = gl.getContext();
        if (!context.texImage3D || !gl.extensions.has('EXT_color_buffer_float')) throw new Error('Трассировка требует WebGL 2 и float targets. / WebGL 2 and float targets are required.');
        onProgress({ stage: 'scene', progress: 0 });
        snapshot = await snapshotScene(source, { signal, textureSize, onProgress: (progress) => onProgress({ stage: 'scene', progress }) });
        checkAbort(signal);
        generator = new PathTracingSceneGenerator(snapshot.scene);
        generator.bvhOptions = { maxLeafTris: 4 };
        worker = new TraceBvhWorker(); generator.setBVHWorker(worker);
        onProgress({ stage: 'bvh', progress: 0, ...snapshot.stats });
        const built = await abortable(generator.generateAsync((progress) => onProgress({ stage: 'bvh', progress, ...snapshot.stats })), signal);
        checkAbort(signal);
        const textures = [...new Map(built.textures.map((t) => [`${t.source.uuid}:${t.colorSpace}`, t])).values()];
        // Reject an oversized allocation before texture-array upload, instead of
        // silently lowering quality or risking a browser/GPU process crash.
        const bytes = textures.length * textureSize * textureSize * 4;
        if (textures.length > context.getParameter(context.MAX_ARRAY_TEXTURE_LAYERS) || bytes > 1.5 * 1024 ** 3) throw new Error('Карты превышают бюджет рендера. Выберите 1K текстуры. / Texture budget exceeded. Choose 1K textures.');
        onProgress({ stage: 'materials', progress: 0, ...snapshot.stats }); await nextTask();
        tracer = new PathTracingRenderer(gl);
        const material = tracer.material;
        material.bvh.updateFrom(built.bvh);
        material.attributesArray.updateFrom(built.geometry.attributes.normal, built.geometry.attributes.tangent, built.geometry.attributes.uv, built.geometry.attributes.color);
        material.materialIndexAttribute.updateFrom(built.geometry.attributes.materialIndex);
        arrays = new RenderTarget2DArray(textureSize, textureSize); uploadTextureArray(arrays, gl, textures, textureSize, textureSize); material.textures = arrays.texture;
        material.materials.updateFrom(built.materials, textures);
        ies = new RenderTarget2DArray(128, 1, { type: THREE.HalfFloatType, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
        uploadTextureArray(ies, gl, built.iesTextures, 128, 1); material.iesProfiles = ies.texture; material.lights.updateFrom(built.lights, built.iesTextures);
        material.environmentIntensity = snapshot.scene.environment ? snapshot.scene.environmentIntensity : 0;
        if (snapshot.scene.environment) material.envMapInfo.updateFrom(snapshot.scene.environment);
        material.environmentRotation.makeRotationFromEuler(snapshot.scene.environmentRotation).invert();
        material.backgroundMap = snapshot.scene.background?.isTexture ? snapshot.scene.background : null;
        material.backgroundIntensity = snapshot.scene.backgroundIntensity; material.backgroundAlpha = 1;
        material.backgroundRotation.makeRotationFromEuler(snapshot.scene.backgroundRotation).invert();
        material.bounces = Math.min(12, Math.max(2, bounces)); material.transmissiveBounces = 12; material.filterGlossyFactor = .1;
        material.setDefine('FEATURE_DOF', 0); material.setDefine('FEATURE_FOG', 0);
        tracer.setCamera(snapshot.camera);
        const [width, height] = renderDimensions(snapshot.camera.aspect, edge);
        tracer.setSize(width, height); tracer.tiles.set(Math.ceil(width / 256), Math.ceil(height / 256));
        canvas.width = width; canvas.height = height;
        display = new THREE.WebGLRenderTarget(width, height, { depthBuffer: false }); display.texture.colorSpace = THREE.SRGBColorSpace;
        output = outputPass(tracer.target.texture, source.settings, exposure, denoise); quad = new FullScreenQuad(output);
        const pixels = new Uint8Array(width * height * 4), image = new ImageData(width, height);
        const paint = () => {
            output.uniforms.map.value = tracer.target.texture;
            gl.setRenderTarget(display); quad.render(gl);
            readRenderTargetPixelsWithPboGuard(gl, display, 0, 0, width, height, pixels);
            for (let y = 0; y < height; y++) image.data.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), (height - y - 1) * width * 4);
            canvas.getContext('2d').putImageData(image, 0, 0);
        };
        const total = Math.min(4096, Math.max(1, samples)); let shown = -1, lastPaint = 0;
        gl.toneMapping = THREE.NoToneMapping; gl.xr.enabled = false;
        while (tracer.samples < total) {
            checkAbort(signal);
            if (document.hidden) { await new Promise((resolve) => setTimeout(resolve, 200)); continue; }
            tracer.update();
            const now = performance.now(), count = Math.floor(tracer.samples + 1e-5);
            if (count >= 1 && count !== shown && now - lastPaint > 1000) {
                paint(); shown = count; lastPaint = now;
                onProgress({ stage: 'render', samples: count, total, seconds: (now - started) / 1000, ...snapshot.stats });
            }
            await abortable(new Promise((resolve) => requestAnimationFrame(resolve)), signal);
        }
        paint();
        return { width, height, samples: total, seconds: (performance.now() - started) / 1000, ...snapshot.stats };
    } finally {
        worker?.dispose(); generator?.geometry.dispose();
        if (tracer) {
            // v0.0.24's renderer disposal releases targets, but not its material
            // uniforms or blend material. Release those explicitly as owners.
            for (const [key, uniform] of Object.entries(tracer.material.uniforms)) {
                if (!['backgroundMap', 'sobolTexture', 'textures', 'iesProfiles'].includes(key)) uniform.value?.dispose?.();
            }
            tracer.material.lights.tex.dispose();
            tracer.material.dispose(); tracer._blendQuad.material.dispose(); tracer.dispose();
        }
        arrays?.fsQuad.material.dispose(); arrays?.dispose(); ies?.fsQuad.material.dispose(); ies?.dispose();
        quad?.dispose(); output?.dispose(); display?.dispose(); snapshot?.dispose();
        gl.domElement.removeEventListener('webglcontextlost', contextLost);
        restore(); source.release();
    }
}
