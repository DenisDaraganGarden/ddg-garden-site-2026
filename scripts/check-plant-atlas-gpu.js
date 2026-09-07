// Run with the current in-app browser on the dev origin. Own context only.
import * as THREE from 'three';
import { bakePlantImpostor } from '../src/plants/plantAtlases.js';
import { readRenderTargetPixelsWithPboGuard } from '../src/components/effects/safeRenderTargetReadback.js';

export function runPlantAtlasGpuCheck() {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(64, 96); renderer.setViewport(3, 4, 40, 50);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.setClearColor('#153047', .4);
  const gl = renderer.getContext(), generateMipmap = gl.generateMipmap, render = renderer.render;
  const bark = new THREE.BoxGeometry(.3, 2, .3), leaf = new THREE.PlaneGeometry(1.8, 1.5);
  leaf.translate(.35, .4, .12);
  for (const geometry of [bark, leaf]) {
    geometry.computeBoundingBox(); geometry.userData.baseBounds = geometry.boundingBox.clone();
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 3).fill(1), 3));
  }
  const texels = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < 16; i++) texels.set([45, 150, 73, i % 3 ? 255 : 0], i * 4);
  const texture = new THREE.DataTexture(texels, 4, 4); texture.needsUpdate = true;
  const atlas = { color: { texture }, singleSided: true }, baked = [];
  const output = new THREE.WebGLRenderTarget(64, 96, { depthBuffer: false });
  const uniform = { uMap: { value: texture } };
  const material = new THREE.ShaderMaterial({ uniforms: uniform, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: 'varying vec2 vUv;uniform sampler2D uMap;void main(){gl_FragColor=texture2D(uMap,vUv);}' });
  const plane = new THREE.PlaneGeometry(2, 2), scene = new THREE.Scene(), camera = new THREE.Camera();
  scene.add(new THREE.Mesh(plane, material));
  let mipCount = 0;
  const counts = [], cases = [];
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  try {
    gl.generateMipmap = function (...args) { mipCount++; return generateMipmap.apply(this, args); };
    for (const everyView of [true, false]) {
      mipCount = 0;
      // Recreate the old scheduling with the same production geometry/shaders:
      // generate the full mip chain after every view, rather than only the last.
      renderer.render = function (...args) {
        if (everyView) this.getRenderTarget().texture.generateMipmaps = true;
        return render.apply(this, args);
      };
      baked.push(bakePlantImpostor(renderer, {}, { bark, leaf }, atlas, 16));
      counts.push(mipCount);
      require(renderer.getRenderTarget() === null, 'bake leaked render target');
      require(renderer.toneMapping === THREE.ACESFilmicToneMapping, 'bake leaked tone mapping');
      require(renderer.getClearAlpha() === .4, 'bake leaked clear alpha');
      require(renderer.getViewport(new THREE.Vector4()).equals(new THREE.Vector4(3, 4, 40, 50)), 'bake leaked viewport');
    }
    renderer.render = render; gl.generateMipmap = generateMipmap;
    require(counts[0] === 72 && counts[1] === 3, `unexpected mip generation counts: ${counts}`);
    for (const channel of ['color', 'normal', 'position']) for (const divisor of [1, 2, 4, 16]) {
      output.setSize(64 / divisor, 96 / divisor);
      const images = baked.map(asset => {
        require(asset[channel].texture.generateMipmaps === true, `${channel} mip state not restored`);
        uniform.uMap.value = asset[channel].texture;
        renderer.setRenderTarget(output); renderer.render(scene, camera);
        const pixels = new Uint8Array(output.width * output.height * 4);
        readRenderTargetPixelsWithPboGuard(renderer, output, 0, 0, output.width, output.height, pixels);
        return pixels;
      });
      let maxError = 0, nonzero = 0;
      for (let i = 0; i < images[0].length; i++) { maxError = Math.max(maxError, Math.abs(images[0][i] - images[1][i])); nonzero += images[1][i] !== 0 ? 1 : 0; }
      require(maxError === 0 && nonzero > 0, `${channel}/${divisor}: mismatch ${maxError}, nonzero ${nonzero}`);
      require(gl.getError() === 0, `${channel}/${divisor}: WebGL error`);
      cases.push({ channel, divisor, maxError, nonzero });
    }
    return { passed: true, mipGenerations: { everyView: counts[0], finalView: counts[1] }, cases };
  } finally {
    renderer.render = render; gl.generateMipmap = generateMipmap;
    baked.forEach(asset => asset.dispose()); bark.dispose(); leaf.dispose(); texture.dispose();
    output.dispose(); material.dispose(); plane.dispose(); renderer.dispose(); renderer.forceContextLoss();
  }
}
