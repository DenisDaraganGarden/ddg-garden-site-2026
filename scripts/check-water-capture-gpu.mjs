import * as THREE from 'three';
import { waterV2FragmentShader } from '../src/components/effects/shaders/waterV2Shaders.js';

// Exercise the shipping optical block, with a known constant-view-depth bed.
// Moving the display camera must not reinterpret a rate-limited capture.
export async function checkWaterCaptureGpu() {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const section = (start, end) => {
    const a = waterV2FragmentShader.indexOf(start), b = waterV2FragmentShader.indexOf(end, a);
    assert(a >= 0 && b > a, `Water capture shader section: ${start}`);
    return waterV2FragmentShader.slice(a, b);
  };
  const fragmentShader = `
    uniform sampler2D uRefractionTexture,uRefractionDepthTexture;
    uniform mat4 uRefractionMatrix,uRefractionViewMatrix,projectionMatrix;
    uniform vec2 uRefractionCameraRange;
    uniform vec3 uSample;
    uniform float uDepthActive;
    ${section('float perspectiveDepthToViewZLocal(', 'vec3 reflectionTone()')}
    float keyShadow(){return 1.0;}
    float coastBloom(vec2 qs,float time,float depth){return 0.0;}
    float coastOffshore(){return 480.0;}
    void main(){
      vec3 vSurfaceWorldPosition=uSample,vWaterNormal=vec3(0,1,0),normal=vWaterNormal;
      vec4 vClipPosition=projectionMatrix*viewMatrix*vec4(uSample,1.0);
      vec3 vViewNormal=mat3(viewMatrix)*normal;
      vec4 uCoastShape=vec4(1,0,0,0);
      vec2 coastQS=vec2(0.0);
      float slope=0.0,vHeightSample=0.0,waveInfluence=0.0,surfaceTransition=0.0;
      float coastGround=-2.0,uTime=0.0,uWaterDepth=10.0,uWaterTurbidity=0.0;
      float uRefractionDepthActive=uDepthActive;
      float normalDotView=abs(normalize(cameraPosition-uSample).y);
      ${section('vec4 capturedPosition =', '// A friendly 0..100% control')}
      gl_FragColor=vec4(screenUv,opticalPath,refractionCoverage);
    }
  `;
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(1, 1, false);
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, depthBuffer: false });
  const data = new Float32Array(16);
  const depth = new THREE.DataTexture(data, 2, 2, THREE.RGBAFormat, THREE.FloatType);
  depth.minFilter = depth.magFilter = THREE.NearestFilter;
  const uniforms = {
    uRefractionTexture: { value: depth }, uRefractionDepthTexture: { value: depth },
    uRefractionMatrix: { value: new THREE.Matrix4() }, uRefractionViewMatrix: { value: new THREE.Matrix4() },
    uRefractionCameraRange: { value: new THREE.Vector2() }, uSample: { value: new THREE.Vector3() },
    uDepthActive: { value: 1 },
  };
  const materials = [false, true].map(logarithmic => new THREE.ShaderMaterial({
    uniforms, fragmentShader, defines: logarithmic ? { USE_LOGARITHMIC_DEPTH_BUFFER: 1 } : {},
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.0,1.0);}', depthTest: false, depthWrite: false,
  }));
  const geometry = new THREE.PlaneGeometry(2, 2), scene = new THREE.Scene();
  const quad = new THREE.Mesh(geometry, materials[0]); quad.frustumCulled = false; scene.add(quad);
  const display = new THREE.PerspectiveCamera(49, 1, .01, 10000);
  const capture = new THREE.PerspectiveCamera(49, 1, .1, 1000);
  const pixel = new Float32Array(4);
  const read = () => {
    renderer.setRenderTarget(target); renderer.render(scene, display);
    renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel);
    assert(pixel.every(Number.isFinite), 'Finite captured water depth'); return [...pixel];
  };
  const record = (logarithmic, thickness) => {
    capture.lookAt(0, 0, 0); capture.updateMatrixWorld(true); capture.updateProjectionMatrix();
    uniforms.uRefractionMatrix.value.copy(capture.projectionMatrix).multiply(capture.matrixWorldInverse);
    uniforms.uRefractionViewMatrix.value.copy(capture.matrixWorldInverse);
    uniforms.uRefractionCameraRange.value.set(capture.near, capture.far);
    const viewDepth = capture.position.length() + thickness;
    const encoded = logarithmic ? Math.log2(viewDepth + 1) / Math.log2(capture.far + 1)
      : (capture.far - capture.near * capture.far / viewDepth) / (capture.far - capture.near);
    for (let i = 0; i < 4; i++) data.set([encoded, 0, 0, 1], i * 4);
    depth.needsUpdate = true;
  };
  let samples = 0, maxDepthError = 0;
  try {
    for (const [index, logarithmic] of [false, true].entries()) {
      quad.material = materials[index];
      await renderer.compileAsync(scene, display);
      capture.position.set(0, 10, 10); capture.far = 1000; record(logarithmic, 3);
      for (const position of [[0, 10, 10], [8, 12, 14], [-12, 5, 8]]) {
        display.position.fromArray(position); display.lookAt(2, 1, -4); display.updateMatrixWorld(true);
        const result = read(); maxDepthError = Math.max(maxDepthError, Math.abs(result[2] - 3)); samples++;
        assert(Math.abs(result[0] - .5) < .00001 && Math.abs(result[1] - .5) < .00001, 'Capture UV moved with display camera');
        assert(Math.abs(result[2] - 3) < .005 && result[3] === 1, 'Captured 3 m water path changed with display camera');
      }
      // A later capture updates the same matrix/range objects and texture.
      capture.position.set(3, 12, 13); capture.far = 2500; record(logarithmic, 2);
      const updated = read(); samples++; maxDepthError = Math.max(maxDepthError, Math.abs(updated[2] - 2));
      assert(Math.abs(updated[2] - 2) < .005, 'New capture camera range and texture disagree');
      uniforms.uSample.value.set(10000, 0, 0);
      for (const active of [0, 1]) {
        uniforms.uDepthActive.value = active;
        assert(read()[3] === 0, 'Offscreen capture must reject clamped edge colours and depth'); samples++;
      }
      uniforms.uSample.value.set(0, 0, 0); uniforms.uDepthActive.value = 1;
    }
    return { status: 'PASS', samples, maxDepthErrorMetres: maxDepthError, encodings: ['perspective', 'logarithmic'] };
  } finally {
    target.dispose(); depth.dispose(); geometry.dispose(); materials.forEach(material => material.dispose());
    renderer.dispose(); renderer.forceContextLoss();
  }
}
