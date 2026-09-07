import * as THREE from 'three';
import { farWaterFragmentShader } from '../src/components/effects/water/FarWaterSurface.jsx';

// This deliberately extracts the shipping FarWater capture block. It proves
// that a frozen refraction target still measures the same three-metre optical
// path when only the display camera moves, including both depth encodings.
export async function checkFarWaterCaptureGpu() {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const section = (start, end) => {
    const from = farWaterFragmentShader.indexOf(start);
    const to = farWaterFragmentShader.indexOf(end, from);
    assert(from >= 0 && to > from, `FarWater shader section missing: ${start}`);
    return farWaterFragmentShader.slice(from, to);
  };
  const decode = section('float coastDepthToViewZ(', 'void main()');
  const optical = section('float contactFoam=0.0;', 'vec4 projected =').replace(
    /\n\s*}\s*$/,
    `
      gl_FragColor = vec4(opticalPath, contactFoam, captureCoverage, screenUv.x);
      return;
    }
  `,
  );
  const fragmentShader = /* glsl */`
    precision highp float;
    uniform sampler2D uCoastRefraction, uCoastDepth;
    uniform mat4 uCoastRefractionMatrix, uCoastRefractionViewMatrix;
    uniform vec2 uCoastRefractionCameraRange;
    uniform vec3 uSample, uCoastKeyColor, uWaterScatteringColor, uKeyDirection;
    uniform vec4 uCoastShape, uCoastSurface, uCoastSurf;
    uniform float uCoastRefractionActive, uCoastDepthActive, uCoastTurbidity, uCoastScattering;
    uniform float uCoastKeyIntensity, uEnvironmentExposure, uEnvironmentReflection;
    ${decode}
    float coastOffshore() { return 480.0; }
    void main() {
      vec3 vWorldPosition = uSample;
      vec2 qs = vec2(-32.0, 0.0);
      float ground = -3.0;
      vec3 normal = vec3(0.0, 1.0, 0.0);
      vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
      vec3 deepTint = vec3(0.03, 0.07, 0.09);
      vec3 refraction = deepTint;
      ${optical}
      gl_FragColor = vec4(0.0);
    }
  `;
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(1, 1, false);
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.FloatType,
    depthBuffer: false,
  });
  const textureData = new Float32Array([
    0.4, 0.5, 0.6, 1,
    0.4, 0.5, 0.6, 1,
    0.4, 0.5, 0.6, 1,
    0.4, 0.5, 0.6, 1,
  ]);
  const captureTexture = new THREE.DataTexture(textureData, 2, 2, THREE.RGBAFormat, THREE.FloatType);
  captureTexture.minFilter = captureTexture.magFilter = THREE.NearestFilter;
  captureTexture.needsUpdate = true;
  const depthData = new Float32Array(16);
  const depthTexture = new THREE.DataTexture(depthData, 2, 2, THREE.RGBAFormat, THREE.FloatType);
  depthTexture.minFilter = depthTexture.magFilter = THREE.NearestFilter;
  const capture = new THREE.PerspectiveCamera(49, 1, 0.1, 1000);
  const uniforms = {
    uCoastRefraction: { value: captureTexture },
    uCoastDepth: { value: depthTexture },
    uCoastRefractionMatrix: { value: new THREE.Matrix4() },
    uCoastRefractionViewMatrix: { value: new THREE.Matrix4() },
    uCoastRefractionCameraRange: { value: new THREE.Vector2() },
    uSample: { value: new THREE.Vector3(0, 0, 0) },
    uCoastShape: { value: new THREE.Vector4(1, 0, 0, 0) },
    uCoastSurface: { value: new THREE.Vector4(1, 10, 0, 0) },
    uCoastSurf: { value: new THREE.Vector4(0, 1, 1, 0) },
    uCoastRefractionActive: { value: 1 },
    uCoastDepthActive: { value: 1 },
    uCoastTurbidity: { value: 0.4 },
    uCoastScattering: { value: 0.2 },
    uCoastKeyColor: { value: new THREE.Vector3(1, 1, 1) },
    uCoastKeyIntensity: { value: 1 },
    uWaterScatteringColor: { value: new THREE.Vector3(0.05, 0.08, 0.09) },
    uEnvironmentExposure: { value: 1 },
    uEnvironmentReflection: { value: 1 },
    uKeyDirection: { value: new THREE.Vector3(0, 1, 0) },
  };
  const materials = [false, true].map((logarithmic) => new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader,
    defines: logarithmic ? { USE_LOGARITHMIC_DEPTH_BUFFER: 1 } : {},
    depthTest: false,
    depthWrite: false,
  }));
  const geometry = new THREE.PlaneGeometry(2, 2);
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(geometry, materials[0]);
  quad.frustumCulled = false;
  scene.add(quad);
  const display = new THREE.PerspectiveCamera(49, 1, 0.01, 10000);
  const pixel = new Float32Array(4);
  const read = () => {
    renderer.setRenderTarget(target);
    renderer.render(scene, display);
    renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel);
    assert(pixel.every(Number.isFinite), 'FarWater capture output must be finite');
    return [...pixel];
  };
  const record = (logarithmic, thickness) => {
    capture.position.set(0, 10, 10);
    capture.lookAt(0, 0, 0);
    capture.updateMatrixWorld(true);
    capture.updateProjectionMatrix();
    uniforms.uCoastRefractionMatrix.value.copy(capture.projectionMatrix).multiply(capture.matrixWorldInverse);
    uniforms.uCoastRefractionViewMatrix.value.copy(capture.matrixWorldInverse);
    uniforms.uCoastRefractionCameraRange.value.set(capture.near, capture.far);
    const surfaceViewZ = Math.abs((new THREE.Vector3(0, 0, 0)).applyMatrix4(capture.matrixWorldInverse).z);
    const sceneViewZ = surfaceViewZ + thickness;
    const encoded = logarithmic
      ? Math.log2(sceneViewZ + 1) / Math.log2(capture.far + 1)
      : (capture.far - capture.near * capture.far / sceneViewZ) / (capture.far - capture.near);
    for (let index = 0; index < 4; index += 1) depthData.set([encoded, 0, 0, 1], index * 4);
    depthTexture.needsUpdate = true;
  };
  let samples = 0;
  let minimumDepthStepMetres = Infinity;
  try {
    for (const [index, logarithmic] of [false, true].entries()) {
      quad.material = materials[index];
      await renderer.compileAsync(scene, display);
      display.position.set(0, 10, 10);
      display.lookAt(0, 0, 0);
      display.updateMatrixWorld(true);
      const measured = [];
      for (const thickness of [1, 3, 7]) {
        record(logarithmic, thickness);
        const sample = read();
        assert(Math.abs(sample[0] - thickness) < 0.005, `Static ${thickness}-metre capture depth must survive sign conversion`);
        assert(sample[2] === 1, 'Captured point must be covered');
        measured.push(sample[0]);
        samples += 1;
      }
      minimumDepthStepMetres = Math.min(
        minimumDepthStepMetres,
        measured[1] - measured[0],
        measured[2] - measured[1],
      );
      assert(measured[0] < measured[1] && measured[1] < measured[2], 'Captured optical depth must increase monotonically with bed depth');
      record(logarithmic, 3);
      const still = read();
      display.position.set(8, 12, 14);
      display.lookAt(2, 1, -4);
      display.updateMatrixWorld(true);
      const moved = read();
      assert(Math.abs(moved[0] - 3) < 0.005, 'Display-camera movement must not change frozen capture depth');
      assert(Math.abs(moved[3] - still[3]) < 0.00001, 'Display-camera movement must not change captured UV');
      samples += 2;
      uniforms.uSample.value.set(10000, 0, 0);
      const outside = read();
      assert(outside[2] === 0 && outside[1] === 0, 'Offscreen capture must mask colour/depth contact foam together');
      samples += 1;
      uniforms.uSample.value.set(0, 0, 0);
    }
    return {
      status: 'PASS',
      samples,
      minimumDepthStepMetres,
      encodings: ['perspective', 'logarithmic'],
    };
  } finally {
    target.dispose();
    captureTexture.dispose();
    depthTexture.dispose();
    geometry.dispose();
    materials.forEach((material) => material.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
