import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createTanker, disposeTanker } from './model.js';
import { updateTankerMaterials } from './materials.js';
import { KNOTS_TO_METERS_PER_SECOND, sampleTankerMotion } from './motion.js';
import TankerWake from './TankerWake.jsx';

export default function HomeTanker({ settings, lighting, audioRuntime }) {
  const { camera, gl } = useThree();
  const root = useRef(), wakeRoot = useRef();
  const elapsed = useRef(0), travel = useRef(0), lastDistance = useRef(null);
  const models = useMemo(() => ({ near: createTanker(), far: createTanker({ lod: 'horizon' }) }), []);
  const wake = useMemo(() => ({ uTime: { value: 0 }, uSpeed: { value: 0 }, uColor: { value: new THREE.Color() } }), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => () => {
    disposeTanker(models.near); disposeTanker(models.far);
  }, [models]);
  useEffect(() => () => audioRuntime?.releaseTanker?.(), [audioRuntime]);
  useEffect(() => {
    for (const model of Object.values(models)) {
      updateTankerMaterials(model.materials, {
        wear: settings.tankerWear, wetness: settings.tankerWetness,
        roughness: settings.tankerRoughness, night: lighting.sky.nightFactor ?? (lighting.key.direction[1] < 0.04 ? 1 : 0),
      });
      for (const material of Object.values(model.materials)) material.envMapIntensity = lighting.environment.reflection;
    }
    wake.uColor.value.setRGB(...lighting.key.colorLinear).multiplyScalar(0.5).addScalar(0.2);
  }, [models, settings.tankerWear, settings.tankerWetness, settings.tankerRoughness, lighting, wake]);
  useFrame((state, delta) => {
    if (document.hidden || !root.current) return;
    const dt = Math.min(delta, 0.1);
    elapsed.current += dt;
    if (settings.tankerTravel) travel.current += dt * settings.tankerSpeed * KNOTS_TO_METERS_PER_SECOND;
    const length = settings.tankerRouteLength;
    const along = ((travel.current + length / 2) % length) - length / 2;
    // Site bearings are clockwise from north (-Z). The authored bow is +X.
    const motion = sampleTankerMotion(elapsed.current, {
      speedKnots: settings.tankerSpeed, heading: 90 - settings.tankerBearing,
      seaState: settings.tankerSeaState * (0.4 + settings.waveAmplitude * 12), travel: false,
    });
    position.set(settings.tankerX + Math.cos(motion.yaw) * along, motion.y,
      settings.tankerZ - Math.sin(motion.yaw) * along);
    root.current.position.copy(position);
    root.current.rotation.set(motion.roll, motion.yaw, motion.pitch, 'YXZ');
    const distance = camera.position.distanceTo(position);
    // Hysteresis prevents detail switching repeatedly during a slow camera orbit.
    if (distance < 620) models.near.group.visible = true;
    if (distance > 780) models.near.group.visible = false;
    models.far.group.visible = !models.near.group.visible;
    if (wakeRoot.current) {
      wakeRoot.current.position.set(position.x, 0, position.z);
      wakeRoot.current.rotation.y = motion.yaw;
    }
    wake.uTime.value = elapsed.current;
    wake.uSpeed.value = motion.wake;
    audioRuntime?.updateTanker?.({
      source: [position.x, position.y + 8, position.z], distance,
      speedKnots: settings.tankerSpeed,
      radialVelocity: lastDistance.current == null ? 0 : THREE.MathUtils.clamp((distance - lastDistance.current) / Math.max(dt, 0.001), -25, 25),
    });
    lastDistance.current = distance;
    if (import.meta.env.DEV && state.clock.elapsedTime % 0.5 < dt) {
      gl.domElement.dataset.ddgTanker = JSON.stringify({ lod: models.near.group.visible ? 'near' : 'horizon', distance: Math.round(distance), position: position.toArray(), speed: settings.tankerSpeed });
    }
  }, -2);
  return <>
    <group ref={root} name="tanker-anchor" userData={{ ddgDynamicReflection: true }}>
      <primitive object={models.near.group} />
      <primitive object={models.far.group} />
    </group>
    {settings.tankerWake && <group ref={wakeRoot} name="tanker-wake"><TankerWake uniforms={wake} /></group>}
  </>;
}
