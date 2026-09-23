import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createSurfWater } from '../../surfboard/surfWater.js';
import { WATERLINE_REACH, lensWaterline, surfaceGlow, underwaterFog } from './underwaterOptics.js';

// Under the sea. Once a frame, after every camera has moved (the play camera
// at −6, the orbit's own update at −1) and before anything draws with it, the
// water the GPU draws is sampled under the eye: the sea and the breaker on it,
// as the surfboard feels them (surfWater). Below that surface the scene gets a
// FogExp2 of the water's colour and turbidity, the sea surfaces turn their
// undersides to the camera (underwater.active, read by GerstnerWaterSurface
// and ShoreWater), and a backdrop gives the murk to every pixel nothing drew,
// where the sky would show. Above it everything is as it was: no fog, front
// faces, no backdrop.
//
// At the surface the frame also gets its waterline: a lens a few centimetres
// ahead of the eye is partly in the water and partly out of it, and the part
// of it on the far side of the surface from the eye shows the other medium.
// That pass is drawn over the finished frame — after ScenePostProcessing (100)
// in either of its paths, before the render budget closes its timer (101), so
// the budget counts it — and only on frames where the line is on the lens.

// The sky's own trick (SkyDome): one triangle at the far plane, depth-tested
// and writing none, so it fills exactly the pixels no object claimed. Drawn
// after the sky and the painted clouds (renderOrder 2 and 3), over them. It
// shows what an object lost in the fog shows: three's fog colour, set after
// the tone map as three's materials set it, in whichever space this render
// path hands it over.
const FAR_TRIANGLE = [-1, -1, 0, 3, -1, 0, -1, 3, 0];
const backdropVertexShader = /* glsl */`
  void main() {
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;
const backdropFragmentShader = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
#endif
  void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
#ifdef USE_FOG
    gl_FragColor.rgb = fogColor;
#endif
  }
`;

const lensVertexShader = /* glsl */`
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
// uLine: the glass's height over the water, x + y·ndc.x + z·ndc.y metres
// (lensWaterline), positive in the air; uSide: +1 with the eye above the
// water, −1 below. From above, the drowned glass sees murk, darkening away
// from the line as a look into the water does; from below, the glass out of
// the water is lifted toward the bright surface. Along the line the meniscus:
// the water climbing the glass is a dark line, its crest a bright rim on the
// air side, wavering a little. Widths are in CSS pixels, so the same at any
// resolution.
const lensFragmentShader = /* glsl */`
  uniform vec3 uLine;
  uniform vec2 uResolution;
  uniform float uSide;
  uniform float uPixel;
  uniform float uTime;
  uniform vec3 uWaterTint;
  uniform vec3 uAirTint;

  vec4 over(vec4 top, vec4 below) {
    float alpha = top.a + below.a * (1.0 - top.a);
    return vec4((top.rgb * top.a + below.rgb * below.a * (1.0 - top.a)) / max(alpha, 1e-4), alpha);
  }

  void main() {
    vec2 ndc = gl_FragCoord.xy / uResolution * 2.0 - 1.0;
    float lens = uLine.x + uLine.y * ndc.x + uLine.z * ndc.y;
    vec2 slope = vec2(uLine.y, uLine.z) * 2.0 / uResolution;
    float perPixel = max(length(slope), 1e-9);
    // Along the line in frame heights, and the pixels to it, air side positive.
    float along = dot(gl_FragCoord.xy, vec2(-slope.y, slope.x)) / (perPixel * uResolution.y);
    float d = lens / perPixel + uPixel * (1.5 * sin(along * 23.0 + uTime * 1.7) + 0.8 * sin(along * 61.0 - uTime * 2.9));
    float air = smoothstep(-uPixel, uPixel, d);
    float down = clamp(-d / (0.6 * uResolution.y), 0.0, 1.0);
    vec4 color = uSide > 0.0
      ? vec4(uWaterTint * mix(0.9, 0.45, down), (1.0 - air) * 0.9)
      : vec4(uAirTint, air * 0.6);
    float core = 1.0 - smoothstep(0.7 * uPixel, 1.8 * uPixel, abs(d));
    float rim = smoothstep(1.4 * uPixel, 2.4 * uPixel, d) * (1.0 - smoothstep(2.8 * uPixel, 4.5 * uPixel, d));
    color = over(vec4(uWaterTint * 0.15, core * 0.85), color);
    color = over(vec4(uAirTint * 1.4, rim * 0.55), color);
    gl_FragColor = color;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
// Pixels past the line the meniscus and its waver can reach (4.5 + 2.3).
const LENS_MARGIN = 7;

// underwater: { active, murk } — what the sea surfaces read: whether to show
// their undersides, and the fog's colour in linear light for them.
export default function UnderwaterView({ seaSettings, lighting, terrainDefinition, terrainQuery, surfRibbons, underwater }) {
  const { camera, scene } = useThree();
  const water = useMemo(() => createSurfWater({
    seaSettings,
    coastDefinition: terrainDefinition,
    getCamera: () => camera.position,
    surfRibbons,
    terrainHeight: terrainQuery?.heightAt ?? null,
  }), [camera, seaSettings, surfRibbons, terrainDefinition, terrainQuery]);
  const view = useMemo(() => ({
    fog: new THREE.FogExp2(0x000000, 0),
    glow: new THREE.Color(),
    sample: {},
    depth: -Infinity,
    previousFog: null,
    line: [0, 0, 0],
  }), []);
  const backdropRef = useRef(null);
  const backdrop = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(FAR_TRIANGLE, 3));
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      vertexShader: backdropVertexShader,
      fragmentShader: backdropFragmentShader,
      depthWrite: false,
      fog: true,
    });
    return { geometry, material };
  }, []);
  const lens = useMemo(() => {
    const uniforms = {
      uLine: { value: new THREE.Vector3() },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uSide: { value: 1 },
      uPixel: { value: 1 },
      uTime: { value: 0 },
      uWaterTint: { value: view.fog.color },
      uAirTint: { value: view.glow },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: lensVertexShader,
      fragmentShader: lensFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    const lensScene = new THREE.Scene();
    lensScene.add(quad);
    return {
      scene: lensScene,
      camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
      uniforms,
      dispose() { quad.geometry.dispose(); material.dispose(); },
    };
  }, [view]);
  useEffect(() => () => { backdrop.geometry.dispose(); backdrop.material.dispose(); }, [backdrop]);
  useEffect(() => () => lens.dispose(), [lens]);
  // Leave the scene as it was found: its own fog, the sea facing up.
  useEffect(() => () => {
    if (scene.fog === view.fog) scene.fog = view.previousFog;
    if (underwater) underwater.active = false;
  }, [scene, underwater, view]);

  useFrame(({ clock }) => {
    const sample = water.sample(camera.position.x, camera.position.z, clock.elapsedTime, view.sample);
    // Sea under the eye, not the beach: there the ground stands above the water.
    view.depth = sample.ground < sample.height ? sample.height - camera.position.y : -Infinity;
    const under = view.depth > 0;
    if (underwater) underwater.active = under;
    if (view.depth > -WATERLINE_REACH) {
      underwaterFog(seaSettings, lighting, view.depth, view.fog);
      underwater?.murk.copy(view.fog.color);
    }
    if (under && scene.fog !== view.fog) {
      view.previousFog = scene.fog;
      scene.fog = view.fog;
    } else if (!under && scene.fog === view.fog) {
      scene.fog = view.previousFog;
    }
    if (backdropRef.current) backdropRef.current.visible = under;
  }, -0.5);

  useFrame(({ gl, clock }) => {
    if (!(Math.abs(view.depth) < WATERLINE_REACH) || !camera.isPerspectiveCamera) return;
    // The eye's height over the water plane through the surface under it.
    const height = -view.depth * view.sample.ny;
    camera.updateMatrixWorld();
    const [a, b, c] = lensWaterline(height, view.sample, camera.matrixWorld.elements, camera.projectionMatrix.elements, view.line);
    const { uniforms } = lens;
    const resolution = gl.getDrawingBufferSize(uniforms.uResolution.value);
    const pixel = gl.getPixelRatio();
    const side = height >= 0 ? 1 : -1;
    // The whole glass on the eye's side, meniscus and all: nothing to draw.
    const perPixel = Math.hypot((2 * b) / resolution.x, (2 * c) / resolution.y);
    if (side * a - Math.abs(b) - Math.abs(c) > LENS_MARGIN * pixel * perPixel) return;
    uniforms.uLine.value.set(a, b, c);
    uniforms.uSide.value = side;
    uniforms.uPixel.value = pixel;
    uniforms.uTime.value = clock.elapsedTime;
    surfaceGlow(lighting, view.glow);
    const target = gl.getRenderTarget();
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(null);
    gl.render(lens.scene, lens.camera);
    gl.autoClear = autoClear;
    gl.setRenderTarget(target);
  }, 100.5);

  return (
    <mesh
      ref={backdropRef}
      name="underwater-backdrop"
      geometry={backdrop.geometry}
      material={backdrop.material}
      visible={false}
      frustumCulled={false}
      renderOrder={4}
    />
  );
}
