// Run in the in-app browser's dev origin: import this module and call the export.
// No external browser, DOM mutation or scene storage is needed.
import * as THREE from 'three';
import { createSpatialUpscaler, rcasShaderChunk, upscaleVertexShader, UPSCALE_SCALES } from '../src/components/effects/spatialUpscale.js';
import { readRenderTargetPixelsWithPboGuard } from '../src/components/effects/safeRenderTargetReadback.js';
import { postFragmentShader, postVertexShader } from '../src/components/effects/scenePostShaders.js';

export function runSpatialUpscaleGpuCheck() {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(128, 128); renderer.toneMapping = THREE.NoToneMapping;
  const pipeline = createSpatialUpscaler(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const target = new THREE.WebGLRenderTarget(128, 128, { depthBuffer: false });
  const uniforms = { uSource: { value: pipeline.output.texture }, uSize: { value: new THREE.Vector2(128, 128) }, uStrength: { value: 0.25 } };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: upscaleVertexShader,
    fragmentShader: `varying vec2 vUv; uniform sampler2D uSource; uniform vec2 uSize; uniform float uStrength; ${rcasShaderChunk} void main(){gl_FragColor=vec4(ddgRcas(uSource,vUv,uSize,uStrength),1.0);}`,
    toneMapped: false, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material), scene = new THREE.Scene(); scene.add(quad);
  const pixels = new Uint8Array(128 * 128 * 4), results = [];
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  try {
    for (const [quality, scale] of Object.entries(UPSCALE_SCALES)) {
      const size = Math.round(128 * scale); pipeline.resize(size, size, 128, 128);
      for (const pattern of ['black', 'white', 'color', 'ramp', 'diagonal']) {
        const data = new Uint8Array(size * size * 4);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          const k = (y * size + x) * 4;
          const v = pattern === 'white' ? 255 : pattern === 'ramp' ? Math.round((x + .5) / size * 255) : pattern === 'diagonal' ? (x > y ? 230 : x === y ? 128 : 26) : 0;
          data.set(pattern === 'color' ? [41, 123, 201, 255] : [v, v, v, 255], k);
        }
        const texture = new THREE.DataTexture(data, size, size); texture.needsUpdate = true;
        pipeline.uniforms.uInput.value = texture;
        try {
          renderer.setRenderTarget(pipeline.output); renderer.render(pipeline.scene, camera);
          renderer.setRenderTarget(target); renderer.render(scene, camera);
          readRenderTargetPixelsWithPboGuard(renderer, target, 0, 0, 128, 128, pixels);
          let error = 0, symmetry = 0, min = 255, max = 0;
          for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
            const k = (y * 128 + x) * 4;
            require(pixels[k + 3] === 255, `${quality}/${pattern}: incomplete output`);
            min = Math.min(min, pixels[k]); max = Math.max(max, pixels[k]);
            if (pattern === 'diagonal') symmetry = Math.max(symmetry, Math.abs(pixels[k] + pixels[(x * 128 + y) * 4] - 256));
            else for (let c = 0; c < 3; c++) {
              const expected = pattern === 'color' ? [41, 123, 201][c] : pattern === 'white' ? 255 : pattern === 'ramp' ? (x + .5) / 128 * 255 : 0;
              error += Math.abs(pixels[k + c] - expected) / (128 * 128 * 3);
            }
          }
          require(error < 1.5, `${quality}/${pattern}: color error ${error}`);
          require(pattern !== 'diagonal' || symmetry <= 3, `${quality}: rotated edge asymmetry ${symmetry}`);
          require(renderer.getContext().getError() === 0, `${quality}/${pattern}: WebGL error`);
          results.push({ quality, pattern, meanError: +error.toFixed(3), symmetry, min, max });
        } finally { texture.dispose(); }
      }
    }
    return { passed: true, cases: results };
  } finally {
    target.dispose(); pipeline.dispose(); material.dispose(); quad.geometry.dispose();
    renderer.dispose(); renderer.forceContextLoss();
  }
}

// Compare the complete production tone-map/encode route with native rendering,
// including HDR values above 1. A shader-only EASU check cannot catch double ACES.
export function runPostUpscaleColorGpuCheck() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(32, 32); renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const pipeline = createSpatialUpscaler(); pipeline.resize(16, 16, 32, 32);
  const source = new THREE.DataTexture(new Float32Array([0, 0, 0, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
  source.needsUpdate = true;
  const common = {
    uColorTexture: { value: source }, uDepthTexture: { value: source }, uResolution: { value: new THREE.Vector2(16, 16) },
    uContrast: { value: 1 }, uSaturation: { value: 1 }, uGamma: { value: 1 }, uToneMappingExposure: { value: 1 },
  };
  const make = (uniforms, define) => {
    const material = new THREE.ShaderMaterial({ uniforms, defines: define ? { [define]: 1 } : {},
      vertexShader: postVertexShader, fragmentShader: postFragmentShader, toneMapped: !define, depthTest: false, depthWrite: false });
    const geometry = new THREE.PlaneGeometry(2, 2), scene = new THREE.Scene(); scene.add(new THREE.Mesh(geometry, material));
    return { scene, dispose() { material.dispose(); geometry.dispose(); } };
  };
  const native = make(common), grade = make(common, 'DDG_UPSCALE_PREPASS');
  const present = make({ ...common, uColorTexture: { value: pipeline.output.texture }, uResolution: { value: new THREE.Vector2(32, 32) }, uUpscaleSharpness: { value: .25 } }, 'DDG_UPSCALE_PRESENT');
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), gl = renderer.getContext();
  const read = () => { const pixel = new Uint8Array(4); gl.readPixels(16, 16, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); return [...pixel].slice(0, 3); };
  const results = [];
  try {
    for (const color of [[0,0,0], [.018,.018,.018], [.18,.18,.18], [.5,.125,.75], [4,2,1]]) {
      source.image.data.set([...color, 1]); source.needsUpdate = true;
      renderer.setRenderTarget(null); renderer.render(native.scene, camera); const a = read();
      renderer.setRenderTarget(pipeline.input); renderer.render(grade.scene, camera);
      renderer.setRenderTarget(pipeline.output); renderer.render(pipeline.scene, camera);
      renderer.setRenderTarget(null); renderer.render(present.scene, camera); const b = read();
      const maxError = Math.max(...a.map((v, i) => Math.abs(v - b[i])));
      if (maxError > 1 || gl.getError() !== 0) throw new Error(`post color mismatch ${color}: ${a} vs ${b}`);
      results.push({ linearInput: color, native: a, upscale: b, maxError });
    }
    return { passed: true, cases: results };
  } finally {
    native.dispose(); grade.dispose(); present.dispose(); source.dispose(); pipeline.dispose();
    renderer.dispose(); renderer.forceContextLoss();
  }
}
