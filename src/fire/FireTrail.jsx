import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { sceneDepthFragment, sceneDepthVertex } from '../components/effects/shaders/sceneDepth.js';
import {
  FIRE_TIERS, FLAME_CYCLE, buildParticleGeometry, burntBand, createFireUniforms, fireInstanceCount,
  flameFragmentShader, particleVertexShader, smokeFragmentShader, trackFragmentShader, trackVertexShader,
} from './fireShaders.js';
import { buildTrackGeometry, buildTrail, fireFront, sampleTrail, trailBoundingBox, trailBoundingSphere, trailFrame, trailTexture, worldTrailPoints } from './trail.js';

// Огонь по следу: колея на земле, пламя, дым и свет — один объект сцены.
// Сцена даёт землю (`heightAt`), ветер берега, освещение и тир устройства;
// лаборатория — плоскость и свой свет. Часы свои: пауза и скрытая вкладка
// их останавливают, как у танкера.
const ZERO_WIND = Object.freeze({ x: 0, z: 0 });
// ponytail: в зеркале воды огня нет — планарный захват обновляется только от
// движения камеры и лодки, и живое пламя застыло бы в отражении. Отражение —
// это ddgDynamicReflection и обобщение WaterReflections.jsx (сейчас там только
// танкер) с тем же счётчиком кадров; решать по бюджету телефона.
const NO_REFLECTION = Object.freeze({ ddgNoWaterReflection: true });
const noRaycast = () => {};
const flat = () => 0;

function flicker(t) {
  return 0.85 + 0.15 * Math.sin(t * 23.7) * Math.sin(t * 7.3) + 0.08 * Math.sin(t * 41.1) * Math.sin(t * 3.1);
}

export default function FireTrail({ settings, heightAt = flat, wind = ZERO_WIND, lighting = null, tier = 'high', paused = false, editor = false, onFrame = null }) {
  const { gl } = useThree();
  const budget = FIRE_TIERS[tier] ?? FIRE_TIERS.high;
  // След пересобирается только когда двигаются его точки или рама.
  const pointsKey = JSON.stringify(worldTrailPoints(settings));
  const trail = useMemo(() => buildTrail(JSON.parse(pointsKey), heightAt), [pointsKey, heightAt]);
  const texture = useMemo(() => trailTexture(trail), [trail]);
  useEffect(() => () => texture.dispose(), [texture]);
  const trackWidth = Number(settings.fireWidth) * 1.25;
  const trackGeometry = useMemo(() => buildTrackGeometry(trail, trackWidth, heightAt), [trail, trackWidth, heightAt]);
  useEffect(() => () => trackGeometry.dispose(), [trackGeometry]);
  const geometries = useMemo(() => ({ flames: buildParticleGeometry(budget.flamePool), smoke: buildParticleGeometry(budget.smokePool) }), [budget]);
  useEffect(() => () => { geometries.flames.dispose(); geometries.smoke.dispose(); }, [geometries]);
  // Границы частиц — след с запасом на пламя и дым: по ним сортируются
  // прозрачные слои и наводится камера («Виды → Огонь»); без коробки Box3
  // взял бы базовый квадрат частицы в начале координат мира.
  useEffect(() => {
    const sphere = trailBoundingSphere(trail, 8 + 4 * Number(settings.fireSmokeLife || 8));
    const box = trailBoundingBox(trail, 1).expandByVector(new THREE.Vector3(0, 2 + Number(settings.fireHeight || 1), 0));
    for (const geometry of [geometries.flames, geometries.smoke]) {
      geometry.boundingSphere = sphere.clone();
      geometry.boundingBox = box.clone();
    }
  }, [geometries, trail, settings.fireSmokeLife, settings.fireHeight]);

  const shared = useMemo(createFireUniforms, []);
  const materials = useMemo(() => {
    const particle = (fragment, defines, own) => new THREE.ShaderMaterial({
      defines,
      uniforms: { ...shared, ...own },
      vertexShader: sceneDepthVertex(particleVertexShader),
      fragmentShader: sceneDepthFragment(fragment),
      fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    // Пламя складывается: premultiplied add — свет прибавляется, ничего не закрывает.
    const flames = particle(flameFragmentShader, {}, { uCycle: { value: FLAME_CYCLE }, uRise: { value: 0 }, uSize: { value: 0 }, uOpacity: { value: 1 } });
    flames.blending = THREE.CustomBlending;
    flames.blendSrc = THREE.OneFactor;
    flames.blendDst = THREE.OneFactor;
    flames.blendSrcAlpha = THREE.OneFactor;
    flames.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    const smoke = particle(smokeFragmentShader, { SMOKE: '' }, { uCycle: { value: 8 }, uRise: { value: 1.4 }, uSize: { value: 1.6 }, uOpacity: { value: 0.55 } });
    smoke.premultipliedAlpha = true;
    const track = new THREE.ShaderMaterial({
      uniforms: shared,
      vertexShader: sceneDepthVertex(trackVertexShader),
      fragmentShader: sceneDepthFragment(trackFragmentShader),
      fog: true, transparent: true, depthWrite: false, premultipliedAlpha: true,
    });
    return { flames, smoke, track };
  }, [shared]);
  useEffect(() => () => Object.values(materials).forEach((material) => material.dispose()), [materials]);

  const elapsed = useRef(0);
  const light = useRef();
  const drawingBuffer = useMemo(() => new THREE.Vector2(), []);
  const frame = trailFrame(settings);

  useFrame((state, delta) => {
    if (document.hidden) return;
    if (!paused) elapsed.current += Math.min(delta, 0.1);
    const t = elapsed.current;
    const speed = Math.max(0.01, Number(settings.fireSpeed) || 1);
    const { front, tail, burning, t: sinceIgnition } = fireFront(t, settings, trail.length);
    const smokeLife = Math.max(1, Number(settings.fireSmokeLife) || 8);
    const u = shared;
    u.uTrail.value = texture;
    u.uLength.value = trail.length;
    u.uTime.value = t;
    u.uFront.value = front;
    u.uTail.value = tail;
    u.uT.value = sinceIgnition;
    u.uSpeed.value = speed;
    u.uBurn.value = Math.max(0, Number(settings.fireBurn) || 0);
    u.uWidth.value = Math.max(0.05, Number(settings.fireWidth) || 0.5);
    u.uHeight.value = Math.max(0.1, Number(settings.fireHeight) || 1);
    u.uTurbulence.value = Number(settings.fireTurbulence) || 0;
    u.uIntensity.value = Number(settings.fireIntensity) || 0;
    u.uSootFade.value = Math.max(0, Number(settings.fireSootFade) || 0);
    u.uDark.value = Number(settings.fireTrackDark) || 0;
    const windShare = Number(settings.fireSmokeWind) || 0;
    u.uWind.value.set(wind.x * windShare, 0, wind.z * windShare);
    gl.getDrawingBufferSize(drawingBuffer);
    u.uViewport.value = drawingBuffer.y;
    u.uMinPx.value = budget.minPx;
    u.uHot.value.set(settings.fireColorHot || '#fff1c2');
    u.uCool.value.set(settings.fireColorCool || '#ff4d0f');
    u.uSmokeColor.value.set(settings.fireSmokeColor || '#3b3634');
    if (lighting) {
      u.uSun.value.fromArray(lighting.key.direction).normalize();
      u.uSunRadiance.value.fromArray(lighting.key.sceneRadiance);
      u.uFill.value.fromArray(lighting.fill.irradiance);
    }
    u.uGlow.value.copy(u.uCool.value).multiplyScalar(u.uIntensity.value * 0.14);
    materials.smoke.uniforms.uCycle.value = smokeLife;
    materials.smoke.uniforms.uRise.value = Number(settings.fireSmokeRise) || 1;
    materials.smoke.uniforms.uSize.value = Number(settings.fireSmokeSize) || 1;
    materials.smoke.uniforms.uOpacity.value = Number(settings.fireSmokeOpacity) || 0;

    const flameLife = FLAME_CYCLE * 0.78;
    geometries.flames.instanceCount = fireInstanceCount({
      band: burntBand({ front, tail, speed, life: flameLife }), rate: budget.flameRate, life: flameLife,
      pool: budget.flamePool, width: u.uWidth.value, amount: 0.5 + 0.5 * u.uIntensity.value,
    });
    geometries.smoke.instanceCount = settings.fireSmoke === false ? 0 : fireInstanceCount({
      band: burntBand({ front, tail, speed, life: smokeLife }), rate: budget.smokeRate, life: smokeLife * 0.78,
      pool: budget.smokePool, width: u.uWidth.value, amount: Number(settings.fireSmokeAmount) || 0,
    });

    if (light.current) {
      // Свет гасится силой, а не видимостью: невидимый источник меняет число
      // ламп в сцене, и каждый освещённый материал перекомпилируется в момент поджига.
      const on = settings.fireLight !== false && burning;
      const at = sampleTrail(trail, Math.max(tail, front - 1.5));
      light.current.position.set(at.x, at.y + 0.5 + 0.35 * u.uHeight.value, at.z);
      light.current.intensity = on ? (Number(settings.fireLightIntensity) || 0) * flicker(t) * Math.min(1, u.uIntensity.value) : 0;
      light.current.distance = Number(settings.fireLightDistance) || 16;
      light.current.color.copy(u.uCool.value).lerp(u.uHot.value, 0.35);
    }
    onFrame?.({ time: t, front, tail, burning, length: trail.length, flames: geometries.flames.instanceCount, smoke: geometries.smoke.instanceCount });
  });

  // Ручки точек — только редактору: пустые узлы, за которые берётся манипулятор.
  const markers = useMemo(() => (editor ? JSON.parse(pointsKey).map((point, index) => (
    <object3D key={index} name={`fire-point-${index + 1}`} position={[point.x, heightAt(point.x, point.z) + 0.2, point.z]} />
  )) : null), [editor, pointsKey, heightAt]);

  return (
    <group name="fire-anchor" position={[frame.x, 0, frame.z]} userData={NO_REFLECTION}>
      <group position={[-frame.x, 0, -frame.z]}>
        <group name="fire-track">
          <mesh geometry={trackGeometry} material={materials.track} visible={settings.fireTrack !== false} renderOrder={2} />
        </group>
        <mesh name="fire-flames" geometry={geometries.flames} material={materials.flames} frustumCulled={false} renderOrder={6} raycast={noRaycast} />
        <mesh name="fire-smoke" geometry={geometries.smoke} material={materials.smoke} frustumCulled={false} renderOrder={7} raycast={noRaycast} visible={settings.fireSmoke !== false} />
        <pointLight ref={light} name="fire-light" decay={2} castShadow={false} />
        {markers}
      </group>
    </group>
  );
}
