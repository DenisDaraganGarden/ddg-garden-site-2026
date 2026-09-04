import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { createTanker, disposeTanker } from '../tanker/model';
import { updateTankerMaterials } from '../tanker/materials';
import { sampleTankerMotion } from '../tanker/motion';
import TankerWake from '../tanker/TankerWake';

export default function TankerStage({ settings, night, audioRef, onStats, paused }) {
  const { gl, camera } = useThree();
  const group = useRef();
  const wake = useRef();
  const timer = useRef(0);
  const distanceTravelled = useRef(0);
  const lastStats = useRef(-1);
  const lastAudio = useRef(-1);
  const previousDistance = useRef(null);
  const lod = settings.lod;
  const asset = useMemo(() => createTanker({ lod }), [lod]);
  const fleet = useMemo(() => Array.from({ length: settings.count }, (_, index) => {
    const clone = asset.group.clone(true);
    clone.position.set(settings.count > 1 ? (index % 4 - 1.5) * 160 : 0, 0, settings.count > 1 ? Math.floor(index / 4) * 90 - 45 : 0);
    clone.traverse((object) => { if (object.isMesh) object.castShadow = lod === 'near'; });
    return clone;
  }), [asset, lod, settings.count]);
  const vectors = useMemo(() => ({ position: new THREE.Vector3(), forward: new THREE.Vector3(), up: new THREE.Vector3(), direction: new THREE.Vector3() }), []);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uSpeed: { value: 0.7 }, uColor: { value: new THREE.Color('#c0cdc4') } }), []);
  const isWater = settings.mode !== 'studio';
  const scale = settings.mode === 'horizon' ? 0.045 * 220 / settings.distance : settings.count > 1 ? 0.01 : 0.045;
  const waterY = -0.78;

  useEffect(() => () => disposeTanker(asset), [asset]);
  useEffect(() => {
    updateTankerMaterials(asset.materials, { ...settings, night });
  }, [asset, night, settings]);
  useEffect(() => {
    distanceTravelled.current = 0;
    previousDistance.current = null;
  }, [settings.mode]);
  useEffect(() => {
    const previous = gl.info.autoReset;
    gl.info.autoReset = false;
    return () => { gl.info.autoReset = previous; };
  }, [gl]);

  useFrame((state, delta) => {
    const step = paused ? 0 : Math.min(delta, 0.08) * settings.timeScale;
    timer.current += step;
    const motion = sampleTankerMotion(timer.current, { speedKnots: settings.speed, heading: settings.heading, seaState: isWater ? settings.seaState : 0, travel: false });
    if (isWater && settings.travel) distanceTravelled.current += motion.speed * step;
    const travel = isWater && settings.travel ? ((distanceTravelled.current + 520) % 1040) - 520 : 0;
    const x = Math.cos(motion.yaw) * travel;
    const z = -Math.sin(motion.yaw) * travel;
    group.current.position.set(x, motion.y, z);
    group.current.rotation.set(motion.roll, motion.yaw, motion.pitch, 'YXZ');
    if (wake.current) {
      wake.current.position.set(x, 0, z);
      wake.current.rotation.y = motion.yaw;
    }
    uniforms.uTime.value = timer.current;
    uniforms.uSpeed.value = motion.wake * settings.wake;

    if (audioRef.current?.sound && state.clock.elapsedTime - lastAudio.current > 0.045) {
      const audioDelta = state.clock.elapsedTime - lastAudio.current;
      lastAudio.current = state.clock.elapsedTime;
      camera.getWorldDirection(vectors.forward);
      vectors.up.copy(camera.up).applyQuaternion(camera.quaternion).normalize();
      // The studio is a scale model. Acoustics use full-size metres at the
      // selected observation distance and share the visible vessel bearing.
      vectors.direction.set(x * scale, waterY, z * scale).sub(camera.position).normalize();
      const distance = Math.hypot(settings.distance, travel);
      const source = vectors.direction.multiplyScalar(distance).toArray();
      const radialVelocity = previousDistance.current === null ? 0 : (distance - previousDistance.current) / audioDelta;
      previousDistance.current = distance;
      audioRef.current.sound.update({
        source, listener: [0, 0, 0], forward: vectors.forward.toArray(), up: vectors.up.toArray(),
        distance, speedKnots: settings.speed, radialVelocity,
        userEnabled: audioRef.current.enabled,
        settings: settings.audio, engineGain: settings.engineGain, wakeGain: settings.wakeGain,
      });
    }
    if (state.clock.elapsedTime - lastStats.current > 0.4) {
      lastStats.current = state.clock.elapsedTime;
      const meter = audioRef.current?.sound?.meter();
      const stats = {
        triangles: asset.metrics.triangles * settings.count,
        calls: gl.info.render.calls, renderedTriangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries, textures: gl.info.memory.textures,
        rpm: motion.rpm, metres: distanceTravelled.current, roll: motion.roll * 180 / Math.PI,
        lod, count: settings.count, rms: meter?.rms ?? 0, peak: meter?.peak ?? 0,
        cutoff: meter?.cutoff ?? 0, audioState: audioRef.current?.context?.state ?? 'off',
        waterline: waterY, sourceX: x, sourceZ: z,
      };
      gl.domElement.dataset.tankerState = JSON.stringify(stats);
      onStats(stats);
    }
    gl.info.reset();
  });

  return (
    <group position={[0, isWater ? waterY : -0.9375, 0]} scale={scale}>
      <group ref={group}>
        {fleet.map((vessel, index) => <primitive key={`${lod}-${index}`} object={vessel} dispose={null} />)}
      </group>
      {isWater && settings.count === 1 && settings.wake > 0 && <group ref={wake}><TankerWake uniforms={uniforms} /></group>}
    </group>
  );
}
