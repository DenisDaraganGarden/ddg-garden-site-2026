import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import * as THREE from 'three';
import { Bvh } from '@react-three/drei';
import { useDragOnPlane } from './useDragOnPlane';
import { createLiftedTextureTint, ENV_REFLECTION_SCALE } from './pbrMaterial';
import {
  createBlackStoneMaterial,
  createBlackStoneUniforms,
  updateBlackStoneUniforms,
} from './blackStoneMaterial';
import { DEFAULT_SCULPTURE_ANCHOR, SCULPTURE_DRAG_EDGE_MARGIN, clamp } from './constants';

// The sculpture stands on the seabed. It does not float, so its height is the base
// offset rather than anything the simulation decides.

export default function StaticSculpture({
  settings,
  lighting,
  layout,
  mode,
  orbitRef,
  onSculpturePositionChange,
  onLandingSurfaceReady,
}) {
  const anchorRef = useRef();
  const sculptureAnchorRef = useRef(new THREE.Vector3(
    layout?.sculpturePosition?.x ?? settings?.sculpturePosition?.x ?? DEFAULT_SCULPTURE_ANCHOR.x,
    0,
    layout?.sculpturePosition?.z ?? settings?.sculpturePosition?.z ?? DEFAULT_SCULPTURE_ANCHOR.z,
  ));
  const setOrbitEnabled = useCallback((enabled) => {
    if (orbitRef?.current) {
      orbitRef.current.enabled = enabled;
    }
  }, [orbitRef]);

  const seabedY = (-settings.waterDepthMeters) + settings.sculptureBottomOffset;
  const commitSculpturePosition = useCallback((position) => {
    if (typeof onSculpturePositionChange !== 'function' || !position) {
      return;
    }

    onSculpturePositionChange({
      x: Number(position.x.toFixed(4)),
      z: Number(position.z.toFixed(4)),
    });
  }, [onSculpturePositionChange]);
  const applySculptureAnchor = useCallback((x, z) => {
    const halfExtent = Math.max((settings.waterExtent * 0.5) - SCULPTURE_DRAG_EDGE_MARGIN, 0.1);
    const nextX = clamp(x, -halfExtent, halfExtent);
    const nextZ = clamp(z, -halfExtent, halfExtent);
    sculptureAnchorRef.current.set(nextX, 0, nextZ);

    if (anchorRef.current) {
      anchorRef.current.position.set(nextX, seabedY, nextZ);
    }
  }, [settings.waterExtent, seabedY]);

  const { isDraggingRef, dragHandlers } = useDragOnPlane({
    mode,
    anchorRef,
    fallbackAnchorRef: sculptureAnchorRef,
    planeHeight: seabedY,
    applyAnchor: applySculptureAnchor,
    commitPosition: commitSculpturePosition,
    setOrbitEnabled,
  });

  const blackStoneUniforms = useMemo(() => createBlackStoneUniforms(), []);
  const sculptureMaterial = useMemo(
    () => createBlackStoneMaterial(blackStoneUniforms),
    [blackStoneUniforms],
  );

  useEffect(() => {
    updateBlackStoneUniforms(
      blackStoneUniforms,
      {
        layering: settings.sculptureLayering,
        layerScale: settings.sculptureLayerScale,
        layerRelief: settings.sculptureLayerRelief,
        layerSharpness: settings.sculptureLayerSharpness,
        layerEdgeChips: settings.sculptureLayerEdgeChips,
        fracture: settings.sculptureFracture,
        fractureScale: settings.sculptureFractureScale,
        veins: settings.sculptureVeins,
        veinScale: settings.sculptureVeinScale,
        polish: settings.sculpturePolish,
        wearScale: settings.sculptureWearScale,
        wetness: settings.sculptureWetness,
        dryRoughness: settings.sculptureDryRoughness,
        microRelief: settings.sculptureMicroRelief,
      },
      'beauty',
      createLiftedTextureTint(settings.sculptureColor, 1),
    );
    sculptureMaterial.envMapIntensity = lighting.environment.reflection
      * ENV_REFLECTION_SCALE.sculpture;
  }, [
    blackStoneUniforms,
    lighting.environment.reflection,
    sculptureMaterial,
    settings.sculptureColor,
    settings.sculptureDryRoughness,
    settings.sculptureFracture,
    settings.sculptureFractureScale,
    settings.sculptureLayerEdgeChips,
    settings.sculptureLayerRelief,
    settings.sculptureLayerScale,
    settings.sculptureLayerSharpness,
    settings.sculptureLayering,
    settings.sculptureMicroRelief,
    settings.sculpturePolish,
    settings.sculptureVeinScale,
    settings.sculptureVeins,
    settings.sculptureWearScale,
    settings.sculptureWetness,
  ]);

  useEffect(() => () => {
    sculptureMaterial.dispose();
  }, [sculptureMaterial]);

  useEffect(() => {
    const anchorX = layout?.sculpturePosition?.x ?? settings?.sculpturePosition?.x ?? DEFAULT_SCULPTURE_ANCHOR.x;
    const anchorZ = layout?.sculpturePosition?.z ?? settings?.sculpturePosition?.z ?? DEFAULT_SCULPTURE_ANCHOR.z;

    if (isDraggingRef.current) {
      return;
    }

    applySculptureAnchor(anchorX, anchorZ);
  }, [applySculptureAnchor, isDraggingRef, layout?.sculpturePosition?.x, layout?.sculpturePosition?.z, settings?.sculpturePosition?.x, settings?.sculpturePosition?.z]);

  useEffect(() => {
    if (!anchorRef.current) {
      return;
    }

    anchorRef.current.position.y = seabedY;
  }, [seabedY]);

  const obj = useLoader(GLTFLoader, '/models/sculpture/sculpture.glb').scene;
  const normalizedObj = useMemo(() => {
    const clone = obj.clone();
    const bounds = new THREE.Box3().setFromObject(clone);
    const center = bounds.getCenter(new THREE.Vector3());

    clone.position.set(-center.x, -bounds.min.y, -center.z);
    return clone;
  }, [obj]);
  const clonedObj = useMemo(() => {
    const clone = normalizedObj.clone();

    clone.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      child.material = sculptureMaterial;
      child.castShadow = true;
      child.receiveShadow = true;
    });

    return clone;
  }, [normalizedObj, sculptureMaterial]);

  useEffect(() => {
    if (typeof onLandingSurfaceReady !== 'function' || !anchorRef.current) {
      return undefined;
    }

    // The sculpture anchor owns editor translation, scale and arbitrary tilt,
    // so a perched bird inherits the same authored pose.
    onLandingSurfaceReady({
      surface: 'sculpture',
      root: anchorRef.current,
      collisionObject: anchorRef.current,
      revision: clonedObj,
    });

    return () => onLandingSurfaceReady({ surface: 'sculpture', root: null, collisionObject: null });
  }, [clonedObj, onLandingSurfaceReady]);

  return (
    <group
      ref={anchorRef}
      name="sculpture-anchor"
      rotation={[
        THREE.MathUtils.degToRad(settings.sculptureRotationX),
        THREE.MathUtils.degToRad(settings.sculptureRotationY),
        THREE.MathUtils.degToRad(settings.sculptureRotationZ),
      ]}
      scale={[settings.sculptureScale, settings.sculptureScale, settings.sculptureScale]}
      {...dragHandlers}
    >
      <group name="sculpture">
        {/* Same reason as the boat: 59,972 triangles under the cursor's ray. */}
        <Bvh>
          <primitive object={clonedObj} />
        </Bvh>
      </group>
    </group>
  );
}
