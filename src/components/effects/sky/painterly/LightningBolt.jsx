import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { buildBolt } from './lightning';

// The visible channel: one jittered polyline drawn twice, a thin white-hot
// core and a wider bluish glow, both additive and in world metres so the bolt
// keeps its width at any distance; branches are the same pair, thinner. It
// exists for the first frames of a stroke only; the cloud interior and the
// receivers carry the rest of the flash.
const CORE = new THREE.Color(1, 1, 1).multiplyScalar(9);
const GLOW = new THREE.Color(0.55, 0.66, 1).multiplyScalar(1.2);
// [core width, glow width, glow opacity] in metres for the trunk and branches.
const TRUNK = [3.5, 22, 0.22];
const BRANCH = [2, 12, 0.15];

const LightningBolt = forwardRef(function LightningBolt({ onAfterRender }, ref) {
  const { size } = useThree();
  const state = useRef({ strokeId: -1 });
  const objects = useMemo(() => {
    const material = (color, linewidth, opacity) => new LineMaterial({
      color, linewidth, opacity, worldUnits: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: true,
    });
    const pair = ([core, glow, glowOpacity]) => {
      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(new Float32Array(6));
      const lines = [new LineSegments2(geometry, material(GLOW, glow, glowOpacity)), new LineSegments2(geometry, material(CORE, core, 1))];
      for (const line of lines) { line.frustumCulled = false; line.visible = false; line.renderOrder = 4; }
      return { geometry, lines, glowOpacity };
    };
    return { trunk: pair(TRUNK), branches: pair(BRANCH) };
  }, []);
  const all = useMemo(() => [objects.trunk, objects.branches], [objects]);
  useEffect(() => () => { for (const part of all) { part.geometry.dispose(); part.lines.forEach((line) => line.material.dispose()); } }, [all]);
  useEffect(() => {
    for (const part of all) part.lines.forEach((line) => line.material.resolution.set(size.width, size.height));
  }, [all, size]);

  useImperativeHandle(ref, () => ({
    sync(lightning) {
      const strike = lightning.strike;
      const alive = strike && lightning.bolt > 0.001;
      for (const part of all) part.lines.forEach((line) => { line.visible = Boolean(alive); });
      if (!alive) return;
      if (lightning.strokeId !== state.current.strokeId) {
        state.current.strokeId = lightning.strokeId;
        // Re-strikes reuse the channel and lose branches, like a real flash.
        const first = lightning.strokes.length <= 1;
        const bolt = buildBolt({
          x: strike.x, z: strike.z, top: strike.top, bottom: strike.bottom,
          seed: strike.seed + (first ? 0 : lightning.strokeId), branches: first ? 4 : 1,
        });
        objects.trunk.geometry.setPositions(bolt.main);
        objects.branches.geometry.setPositions(bolt.branches.length ? bolt.branches : new Float32Array(6));
        for (const part of all) part.geometry.computeBoundingSphere();
      }
      for (const part of all) {
        part.lines[0].material.opacity = part.glowOpacity * lightning.bolt;
        part.lines[1].material.opacity = lightning.bolt;
      }
    },
  }), [all, objects]);

  return <group name="lightning-bolt">
    {all.map((part, index) => part.lines.map((line, order) => <primitive key={`${index}-${order}`} object={line} onAfterRender={onAfterRender} />))}
  </group>;
});

export default LightningBolt;
