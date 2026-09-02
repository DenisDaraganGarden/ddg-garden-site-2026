import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { fitRenderTargetSize, restoreDefaultFramebuffer } from './renderTargets';
import {
  DEFAULT_CLEAR_COLOR,
  REFLECTION_BOAT_POSITION_EPSILON_SQ,
  REFLECTION_BOAT_ROTATION_EPSILON,
  REFLECTION_CAMERA_POSITION_EPSILON_SQ,
  REFLECTION_CAMERA_ROTATION_EPSILON,
  isDocumentCurrentlyVisible,
  quaternionDelta,
} from './constants';
import { reflectionContext } from './reflectionContext';
import { NO_REFLECTION_LAYER } from './SceneLightObjects';
import {
  hideExcludedSeagullReflections,
  readSeagullReflectionActivity,
} from '../../../features/home-scene/creatures/seagullReflectionCapture';

// Planar reflection and refraction: the scene is re-rendered from a mirrored
// camera into a texture the water surface samples. The refresh is rate limited,
// and the rates matter - the boat bobs every frame, so "moving" is the normal
// state and too low a rate reads as a second boat lagging behind the real one.

const reflectionCameraPosition = new THREE.Vector3();
const mainCameraTargetPosition = new THREE.Vector3();
const reflectionTargetPosition = new THREE.Vector3();
const waterSurfaceWorldPosition = new THREE.Vector3();
const reflectionBoatPosition = new THREE.Vector3();
const reflectionBoatQuaternion = new THREE.Quaternion();
const reflectionSculpturePosition = new THREE.Vector3();
const reflectionSculptureQuaternion = new THREE.Quaternion();
const reflectionPreviousClearColor = new THREE.Color();
const reflectionCameraUp = new THREE.Vector3();
const waterWorldNormal = new THREE.Vector3(0, 1, 0);
const reflectionClipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const refractionClipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
const REFLECTION_CLIP_PLANES = [reflectionClipPlane];
const REFRACTION_CLIP_PLANES = [refractionClipPlane];
const WATER_CLIP_OVERLAP = 0.015;

// The lily shader cuts itself against the wave it floats on rather than against
// a flat plane, so the refraction capture asks it for the submerged part only.
const setSubmergedOnly = (mesh, value) => {
  const uniform = mesh?.material?.uniforms?.uSubmergedOnly;

  if (uniform) {
    uniform.value = value;
  }
};

export default function WaterReflections({
  children,
  textureSize = 512,
  enabled = true,
  reflectionEnabled = true,
  refractionEnabled = false,
  refractionTextureType = THREE.HalfFloatType,
  refractionDepthEnabled = true,
  refractionDepthMode = refractionDepthEnabled ? 'texture' : 'none',
  activeFps = 30,
  idleFps = 12,
}) {
  const { gl, scene, camera, size } = useThree();
  const targetSize = useMemo(
    () => fitRenderTargetSize(textureSize, size.width / Math.max(size.height, 1)),
    [size.height, size.width, textureSize],
  );
  const reflectionTarget = useMemo(() => new THREE.WebGLRenderTarget(targetSize.width, targetSize.height, {
    format: THREE.RGBAFormat,
    type: refractionTextureType,
    colorSpace: THREE.LinearSRGBColorSpace,
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  }), [refractionTextureType, targetSize.height, targetSize.width]);
  reflectionTarget.texture.name = 'water-reflection-color';
  const refractionTarget = useMemo(() => {
    if (!refractionEnabled) {
      return null;
    }

    const target = new THREE.WebGLRenderTarget(targetSize.width, targetSize.height, {
      format: THREE.RGBAFormat,
      // Half-float preserves long gradients on full browsers. Low-power and
      // embedded WebViews use RGBA8 because incomplete half-float FBOs were
      // the source of the flat blue fallback plane.
      type: refractionTextureType,
      colorSpace: THREE.LinearSRGBColorSpace,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    if (refractionDepthEnabled) {
      target.depthTexture = new THREE.DepthTexture(
        targetSize.width,
        targetSize.height,
        THREE.UnsignedIntType,
      );
      target.depthTexture.format = THREE.DepthFormat;
      target.depthTexture.minFilter = THREE.NearestFilter;
      target.depthTexture.magFilter = THREE.NearestFilter;
      target.depthTexture.generateMipmaps = false;
      target.depthTexture.name = 'water-refraction-depth';
    }

    return target;
  }, [refractionDepthEnabled, refractionEnabled, refractionTextureType, targetSize.height, targetSize.width]);

  const reflectionCamera = useMemo(() => {
    const camera = new THREE.PerspectiveCamera();
    // A light on this layer is culled from the mirrored render along with its
    // illumination, which is what "not in reflections" has to mean - hiding only
    // the bulb would leave its light pooling on reflected water.
    camera.layers.disable(NO_REFLECTION_LAYER);
    return camera;
  }, []);
  const reflectionData = useRef({
    texture: null,
    refractionTexture: null,
    refractionDepthTexture: null,
    cameraNear: camera.near,
    cameraFar: camera.far,
    matrix: new THREE.Matrix4(),
    keyShadowTexelSize: new THREE.Vector2(1 / 1024, 1 / 1024),
  });
  const sceneObjectsRef = useRef({
    waterSurface: null,
    seabed: null,
    surfaceVegetation: null,
    underwaterAlgae: null,
    interactionPlane: null,
    celestialDisc: null,
    skyDome: null,
    farWaterSurface: null,
    boatAnchor: null,
    boat: null,
    sculptureAnchor: null,
    seagullFlock: null,
    fishSchool: null,
  });
  const reflectionTimingRef = useRef({
    initialized: false,
    lastRenderTime: -Infinity,
    pendingPass: null,
    cameraPosition: new THREE.Vector3(),
    cameraQuaternion: new THREE.Quaternion(),
    boatPosition: new THREE.Vector3(),
    boatQuaternion: new THREE.Quaternion(),
    sculpturePosition: new THREE.Vector3(),
    sculptureQuaternion: new THREE.Quaternion(),
  });

  useEffect(() => () => {
    reflectionTarget.dispose();
  }, [reflectionTarget]);

  useEffect(() => () => {
    refractionTarget?.dispose();
  }, [refractionTarget]);

  useEffect(() => {
    const textureLabel = refractionTextureType === THREE.HalfFloatType ? 'half-float' : 'rgba8';
    gl.domElement.dataset.ddgOpticsTarget = `${targetSize.width}x${targetSize.height}`;
    gl.domElement.dataset.ddgOpticsTexture = textureLabel;
    gl.domElement.dataset.ddgOpticsDepth = refractionDepthMode;

    return () => {
      delete gl.domElement.dataset.ddgOpticsTarget;
      delete gl.domElement.dataset.ddgOpticsTexture;
      delete gl.domElement.dataset.ddgOpticsDepth;
    };
  }, [gl, refractionDepthMode, refractionTextureType, targetSize.height, targetSize.width]);

  useEffect(() => {
    if (enabled) {
      return;
    }

    reflectionData.current.texture = null;
    reflectionData.current.refractionTexture = null;
    reflectionData.current.refractionDepthTexture = null;
    reflectionTimingRef.current.initialized = false;
    reflectionTimingRef.current.lastRenderTime = -Infinity;
  }, [enabled]);

  useEffect(() => {
    if (!reflectionEnabled) {
      reflectionData.current.texture = null;
    }
    if (!refractionEnabled) {
      reflectionData.current.refractionTexture = null;
      reflectionData.current.refractionDepthTexture = null;
    }

    reflectionTimingRef.current.initialized = false;
    reflectionTimingRef.current.lastRenderTime = -Infinity;
  }, [reflectionEnabled, refractionEnabled]);

  useFrame(({ clock }, frameDelta) => {
    if (!enabled || !reflectionCamera || !reflectionTarget || !isDocumentCurrentlyVisible()) {
      return;
    }

    const sceneObjects = sceneObjectsRef.current;
    const reflectionTiming = reflectionTimingRef.current;

    if (!sceneObjects.waterSurface || !sceneObjects.waterSurface.parent) {
      sceneObjects.waterSurface = scene.getObjectByName('water-surface');
    }
    if (!sceneObjects.seabed || !sceneObjects.seabed.parent) {
      sceneObjects.seabed = scene.getObjectByName('seabed');
    }
    if (!sceneObjects.surfaceVegetation || !sceneObjects.surfaceVegetation.parent) {
      sceneObjects.surfaceVegetation = scene.getObjectByName('surface-vegetation');
    }
    if (!sceneObjects.underwaterAlgae || !sceneObjects.underwaterAlgae.parent) {
      sceneObjects.underwaterAlgae = scene.getObjectByName('underwater-algae');
    }
    if (!sceneObjects.interactionPlane || !sceneObjects.interactionPlane.parent) {
      sceneObjects.interactionPlane = scene.getObjectByName('water-interaction-plane');
    }
    if (!sceneObjects.celestialDisc || !sceneObjects.celestialDisc.parent) {
      sceneObjects.celestialDisc = scene.getObjectByName('celestial-disc');
    }
    if (!sceneObjects.skyDome || !sceneObjects.skyDome.parent) {
      sceneObjects.skyDome = scene.getObjectByName('sky-dome');
    }
    if (!sceneObjects.farWaterSurface || !sceneObjects.farWaterSurface.parent) {
      sceneObjects.farWaterSurface = scene.getObjectByName('far-water-surface');
    }
    if (!sceneObjects.boatAnchor || !sceneObjects.boatAnchor.parent) {
      sceneObjects.boatAnchor = scene.getObjectByName('boat-anchor');
    }
    if (!sceneObjects.boat || !sceneObjects.boat.parent) {
      sceneObjects.boat = scene.getObjectByName('boat');
    }
    if (!sceneObjects.sculptureAnchor || !sceneObjects.sculptureAnchor.parent) {
      sceneObjects.sculptureAnchor = scene.getObjectByName('sculpture-anchor');
    }
    if (!sceneObjects.seagullFlock || !sceneObjects.seagullFlock.parent) {
      sceneObjects.seagullFlock = scene.getObjectByName('seagull-flock');
    }
    if (!sceneObjects.fishSchool || !sceneObjects.fishSchool.parent) {
      sceneObjects.fishSchool = scene.getObjectByName('river-fish-school');
    }

    const waterSurface = sceneObjects.waterSurface;
    const seabed = sceneObjects.seabed;
    const skyDome = sceneObjects.skyDome;
    const farWaterSurface = sceneObjects.farWaterSurface;
    const surfaceVegetation = sceneObjects.surfaceVegetation;
    const underwaterAlgae = sceneObjects.underwaterAlgae;
    const interactionPlane = sceneObjects.interactionPlane;
    const celestialDisc = sceneObjects.celestialDisc;
    const boatAnchor = sceneObjects.boatAnchor;
    const boat = sceneObjects.boat;
    const sculptureAnchor = sceneObjects.sculptureAnchor;
    const seagullFlock = sceneObjects.seagullFlock;
    const fishSchool = sceneObjects.fishSchool;
    const seagullReflectionActivity = readSeagullReflectionActivity(seagullFlock);

    if (!waterSurface) {
      return;
    }

    const now = clock.elapsedTime;
    let isMoving = true;

    if (boat || boatAnchor) {
      const trackedBoat = boat ?? boatAnchor;
      trackedBoat.getWorldPosition(reflectionBoatPosition);
      trackedBoat.getWorldQuaternion(reflectionBoatQuaternion);
    }
    if (sculptureAnchor) {
      sculptureAnchor.getWorldPosition(reflectionSculpturePosition);
      sculptureAnchor.getWorldQuaternion(reflectionSculptureQuaternion);
    }

    if (reflectionTiming.initialized) {
      const cameraMoved = camera.position.distanceToSquared(reflectionTiming.cameraPosition) > REFLECTION_CAMERA_POSITION_EPSILON_SQ
        || quaternionDelta(camera.quaternion, reflectionTiming.cameraQuaternion) > REFLECTION_CAMERA_ROTATION_EPSILON;
      const boatMoved = (boat || boatAnchor)
        ? (
          reflectionBoatPosition.distanceToSquared(reflectionTiming.boatPosition) > REFLECTION_BOAT_POSITION_EPSILON_SQ
          || quaternionDelta(reflectionBoatQuaternion, reflectionTiming.boatQuaternion) > REFLECTION_BOAT_ROTATION_EPSILON
        )
        : false;
      const sculptureMoved = sculptureAnchor
        ? (
          reflectionSculpturePosition.distanceToSquared(reflectionTiming.sculpturePosition) > REFLECTION_BOAT_POSITION_EPSILON_SQ
          || quaternionDelta(reflectionSculptureQuaternion, reflectionTiming.sculptureQuaternion) > REFLECTION_BOAT_ROTATION_EPSILON
        )
        : false;

      isMoving = cameraMoved
        || boatMoved
        || sculptureMoved
        || seagullReflectionActivity.dynamic
        // Fish animate continuously inside the refraction texture. Without this
        // signal a still camera with hidden scene props would throttle them to
        // the idle optics rate and the shoal would visibly step.
        || fishSchool?.userData?.ddgDynamicRefraction === true;
    }

    const minInterval = 1 / Math.max(isMoving ? activeFps : idleFps, 1);
    // Both captures re-render the scene, and together they are about two thirds
    // of a frame's GPU time. On a display faster than the capture rate they
    // used to land in the same frame every other frame - 12 ms in an 8.3 ms
    // budget at 120 Hz, a judder every second frame - while the frames between
    // did nothing. When the display has room, refraction takes the due frame
    // and reflection the one after: each still updates at its own rate, one
    // frame apart, and no frame carries both. At 60 Hz the display has no
    // spare frame, so both render together exactly as before.
    const pendingReflection = reflectionTiming.pendingPass === 'reflection';
    if (!pendingReflection && (now - reflectionTiming.lastRenderTime) < minInterval) {
      return;
    }
    const stagger = !pendingReflection
      && reflectionEnabled
      && refractionEnabled
      && Boolean(refractionTarget)
      && frameDelta > 0
      // "Room" means the display refreshes at least ~1.8x faster than the
      // capture rate, so the deferred pass still lands inside the same capture
      // interval. 120 Hz against 60 Hz captures qualifies; 60 Hz does not.
      && frameDelta <= minInterval * 0.55;
    const doRefraction = !pendingReflection;
    const doReflection = pendingReflection || !stagger;
    reflectionTiming.pendingPass = stagger ? 'reflection' : null;

    if (pendingReflection) {
      // The bookkeeping below was done on the frame that scheduled this one.
    } else {
    reflectionTiming.initialized = true;
    reflectionTiming.lastRenderTime = now;
    reflectionTiming.cameraPosition.copy(camera.position);
    reflectionTiming.cameraQuaternion.copy(camera.quaternion);
    if (boat || boatAnchor) {
      reflectionTiming.boatPosition.copy(reflectionBoatPosition);
      reflectionTiming.boatQuaternion.copy(reflectionBoatQuaternion);
    }
    if (sculptureAnchor) {
      reflectionTiming.sculpturePosition.copy(reflectionSculpturePosition);
      reflectionTiming.sculptureQuaternion.copy(reflectionSculptureQuaternion);
    }
    }

    waterSurface.getWorldPosition(waterSurfaceWorldPosition);
    const mirrorY = waterSurfaceWorldPosition.y;

    // 1. Sync mirror camera with main camera
    reflectionCamera.fov = camera.fov;
    reflectionCamera.aspect = camera.aspect;
    reflectionCamera.near = camera.near;
    reflectionCamera.far = camera.far;
    reflectionCamera.updateProjectionMatrix();

    // 2. Mirror camera across water plane.
    reflectionCameraPosition.copy(camera.position);
    reflectionCameraPosition.y = (mirrorY * 2) - reflectionCameraPosition.y;

    camera.getWorldDirection(mainCameraTargetPosition);
    mainCameraTargetPosition.add(camera.position);
    reflectionTargetPosition.copy(mainCameraTargetPosition);
    reflectionTargetPosition.y = (mirrorY * 2) - reflectionTargetPosition.y;

    reflectionCamera.position.copy(reflectionCameraPosition);
    reflectionCameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion).reflect(waterWorldNormal);
    reflectionCamera.up.copy(reflectionCameraUp);
    reflectionCamera.lookAt(reflectionTargetPosition);
    reflectionCamera.updateMatrixWorld(true);
    reflectionCamera.matrixWorldInverse.copy(reflectionCamera.matrixWorld).invert();

    // 3. Update reflection projection for the water surface.
    reflectionData.current.matrix.copy(reflectionCamera.projectionMatrix).multiply(reflectionCamera.matrixWorldInverse);

    // 4. Render scene optics. Refraction uses the real camera and keeps the
    // seabed visible, so its regular shadow map remains part of the image.
    const surfaceVegetationWasVisible = surfaceVegetation?.visible ?? false;
    const underwaterAlgaeWasVisible = underwaterAlgae?.visible ?? false;
    const celestialDiscWasVisible = celestialDisc?.visible ?? false;
    const skyDomeWasVisible = skyDome?.visible ?? false;
    const farWaterSurfaceWasVisible = farWaterSurface?.visible ?? false;
    const fishSchoolWasVisible = fishSchool?.visible ?? false;

    if (waterSurface) waterSurface.visible = false;
    if (interactionPlane) interactionPlane.visible = false;
    // The procedural water sky already contains the key-light highlight.
    // Excluding the UI-facing disc avoids a doubled sun in planar captures.
    if (celestialDisc) celestialDisc.visible = false;
    // The sky triangle is drawn at the far plane from the MAIN camera's inverse
    // matrices, so capturing it into either offscreen target paints the wrong
    // sky over the whole capture. Hidden in both passes, deliberately - the
    // water samples the same table directly, so it loses nothing.
    if (skyDome) skyDome.visible = false;
    // The analytic outer surface belongs only to the final scene. Capturing it
    // beneath the detailed pond would hide the real seabed and underwater life.
    if (farWaterSurface) farWaterSurface.visible = false;

    const previousClearAlpha = gl.getClearAlpha();
    gl.getClearColor(reflectionPreviousClearColor);
    gl.setClearColor(DEFAULT_CLEAR_COLOR, 0);
    const previousShadowAutoUpdate = gl.shadowMap.autoUpdate;
    const previousSceneBackground = scene.background;
    const previousClippingPlanes = gl.clippingPlanes;
    gl.shadowMap.autoUpdate = false;
    // Both optical targets need transparent empty pixels. The scene background
    // is opaque even after a clear with alpha zero, which made uncovered
    // refraction read as a real near-black surface.
    scene.background = null;

    try {
      if (doRefraction && refractionEnabled && refractionTarget) {
        // Keep only geometry below the waterline. Rendering the complete boat
        // and sculpture here created a camera-dependent dark duplicate that
        // looked like a shadow travelling out of the objects.
        refractionClipPlane.constant = mirrorY + WATER_CLIP_OVERLAP;
        // A pad washed over by a wave belongs in this capture: the water samples
        // it through itself, so the submerged part reads as a green shape under
        // the surface instead of vanishing behind the depth test. Only that part
        // though - capturing the whole leaf drew it twice, which is the dark
        // fringe that used to ring every one of them. A flat clipping plane
        // cannot make that cut on a wave, so the leaf shader makes it per vertex.
        setSubmergedOnly(surfaceVegetation, 1);
        gl.clippingPlanes = REFRACTION_CLIP_PLANES;
        gl.setRenderTarget(refractionTarget);
        gl.clear(true, true, true);
        gl.render(scene, camera);
        reflectionData.current.refractionTexture = refractionTarget.texture;
        reflectionData.current.refractionDepthTexture = refractionTarget.depthTexture;
        reflectionData.current.cameraNear = camera.near;
        reflectionData.current.cameraFar = camera.far;
      }

      if (doReflection && reflectionEnabled) {
        // Keep the reflection target transparent outside rendered objects.
        // The water shader already draws its own sky; capturing the scene
        // background here creates a dark, low-resolution duplicate of it.
        if (seabed) seabed.visible = false;
        // A pad lies on the mirror plane itself, so mirroring it welds a second
        // leaf to the first.
        if (surfaceVegetation) surfaceVegetation.visible = false;
        // The custom ribbon shader intentionally stays minimal and does not
        // compile the global clipping-plane chunks. Hide the submerged layer
        // explicitly from the mirrored pass; it remains visible in refraction.
        if (underwaterAlgae) underwaterAlgae.visible = false;
        // Underwater life belongs to the refracted view through the surface,
        // never to the mirrored world above it. The flat clip plane would catch
        // near-surface tails during a wave, so exclude the school explicitly.
        if (fishSchool) fishSchool.visible = false;
        // The mirrored pass must only contain the part above the waterline.
        // Otherwise underwater geometry is mirrored as a second dark object.
        reflectionClipPlane.constant = -mirrorY + WATER_CLIP_OVERLAP;
        gl.clippingPlanes = REFLECTION_CLIP_PLANES;
        gl.setRenderTarget(reflectionTarget);
        gl.clear(true, true, true);
        const restoreSeagullVisibility = hideExcludedSeagullReflections(seagullFlock);
        try {
          gl.render(scene, reflectionCamera);
        } finally {
          restoreSeagullVisibility();
        }
        reflectionData.current.texture = reflectionTarget.texture;
      }
    } finally {
      scene.background = previousSceneBackground;
      gl.clippingPlanes = previousClippingPlanes;
      gl.shadowMap.autoUpdate = previousShadowAutoUpdate;
      restoreDefaultFramebuffer(gl);
      gl.setClearColor(reflectionPreviousClearColor, previousClearAlpha);

      if (waterSurface) waterSurface.visible = true;
      if (seabed) seabed.visible = true;
      setSubmergedOnly(surfaceVegetation, 0);
      if (surfaceVegetation) surfaceVegetation.visible = surfaceVegetationWasVisible;
      if (underwaterAlgae) underwaterAlgae.visible = underwaterAlgaeWasVisible;
      if (fishSchool) fishSchool.visible = fishSchoolWasVisible;
      if (interactionPlane) interactionPlane.visible = true;
      if (celestialDisc) celestialDisc.visible = celestialDiscWasVisible;
      if (skyDome) skyDome.visible = skyDomeWasVisible;
      if (farWaterSurface) farWaterSurface.visible = farWaterSurfaceWasVisible;
    }
  });

  return (
    <reflectionContext.Provider value={reflectionData}>
      {children}
    </reflectionContext.Provider>
  );
}
