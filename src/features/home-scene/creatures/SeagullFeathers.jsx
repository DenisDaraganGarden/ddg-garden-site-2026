import React, {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { SEAGULL_ASSET } from './seagullAsset.js';

const FEATHER_CAPACITY = 72;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const scratchMatrix = new THREE.Matrix4();
const scratchScale = new THREE.Vector3();
const scratchAxis = new THREE.Vector3();
const scratchSpinQuaternion = new THREE.Quaternion();

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function createParticle() {
  return {
    active: false,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    spinAxis: new THREE.Vector3(1, 0, 0),
    spinRate: 0,
    flutterPhase: 0,
    flutterRate: 0,
    age: 0,
    life: 1,
    size: 1,
  };
}

const configureFeatherTexture = (texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
};

const SeagullFeathers = forwardRef(function SeagullFeathers(_props, ref) {
  const meshRef = useRef();
  const featherMap = useTexture(SEAGULL_ASSET.featherTexture, configureFeatherTexture);
  const cursor = useRef(0);
  const particles = useMemo(
    () => Array.from({ length: FEATHER_CAPACITY }, createParticle),
    [],
  );
  const hiddenMatrix = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);

  useImperativeHandle(ref, () => ({
    burst(position, inheritedVelocity, count = 8, seed = 1) {
      const random = seededRandom(seed);
      const safeCount = Math.min(Math.max(0, Math.round(count)), FEATHER_CAPACITY);
      for (let index = 0; index < safeCount; index += 1) {
        const particle = particles[cursor.current];
        cursor.current = (cursor.current + 1) % FEATHER_CAPACITY;
        particle.active = true;
        particle.age = 0;
        particle.life = 2.5 + random() * 2.1;
        particle.size = 0.65 + random() * 0.7;
        particle.position.copy(position).add(scratchAxis.set(
          (random() - 0.5) * 0.13,
          (random() - 0.5) * 0.1,
          (random() - 0.5) * 0.13,
        ));
        particle.velocity.copy(inheritedVelocity ?? WORLD_UP).multiplyScalar(0.12 + random() * 0.12);
        particle.velocity.add(scratchAxis.set(
          (random() - 0.5) * 0.92,
          0.25 + random() * 0.85,
          (random() - 0.5) * 0.92,
        ));
        particle.spinAxis.set(
          random() - 0.5,
          random() - 0.5,
          random() - 0.5,
        ).normalize();
        particle.spinRate = (random() < 0.5 ? -1 : 1) * (1.4 + random() * 3.8);
        particle.flutterPhase = random() * Math.PI * 2;
        particle.flutterRate = 2.1 + random() * 2.7;
        particle.quaternion.setFromAxisAngle(particle.spinAxis, random() * Math.PI * 2);
      }
    },
  }), [particles]);

  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const safeDelta = Math.min(delta, 0.05);
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (!particle.active) {
        mesh.setMatrixAt(index, hiddenMatrix);
        continue;
      }

      particle.age += safeDelta;
      if (particle.age >= particle.life) {
        particle.active = false;
        mesh.setMatrixAt(index, hiddenMatrix);
        continue;
      }

      const life = 1 - particle.age / particle.life;
      particle.flutterPhase += safeDelta * particle.flutterRate;
      particle.velocity.y -= 0.52 * safeDelta;
      particle.velocity.multiplyScalar(Math.exp(-safeDelta * 0.88));
      particle.velocity.x += Math.sin(particle.flutterPhase) * safeDelta * 0.18;
      particle.velocity.z += Math.cos(particle.flutterPhase * 0.83) * safeDelta * 0.14;
      particle.position.addScaledVector(particle.velocity, safeDelta);
      scratchSpinQuaternion.setFromAxisAngle(
        particle.spinAxis,
        particle.spinRate * safeDelta,
      );
      particle.quaternion.multiply(scratchSpinQuaternion).normalize();

      const scale = particle.size * (0.36 + life * 0.64);
      scratchScale.set(scale, scale, scale);
      scratchMatrix.compose(particle.position, particle.quaternion, scratchScale);
      mesh.setMatrixAt(index, scratchMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, FEATHER_CAPACITY]} frustumCulled={false}>
      <planeGeometry args={[0.046, 0.13]} />
      <meshStandardMaterial
        map={featherMap}
        color="#c9c9c3"
        roughness={0.92}
        metalness={0}
        side={THREE.DoubleSide}
        // Cut-out through MSAA coverage like the vegetation: no sorting, no
        // halo, and the barbs keep their soft edge.
        alphaToCoverage
      />
    </instancedMesh>
  );
});

export default SeagullFeathers;
