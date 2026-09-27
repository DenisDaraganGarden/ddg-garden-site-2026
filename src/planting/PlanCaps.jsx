import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { plantingGroups, planHeight, planOpacity, planRadius } from './planDrawing.js';

const NO_PICK = () => {};
// Один квадрат на растение: круг, обводка и перекрестие рисуются в одном
// проходе. Толщина линии задаётся пикселями и не распухает у крупномеров.
export default function PlanCaps({ instances, library, beds }) {
    const { invalidate } = useThree(), mesh = useRef();
    const capacity = Math.max(1, 2 ** Math.ceil(Math.log2(Math.max(1, instances.length))));
    const ordered = useMemo(() => [...instances].sort((a, b) => planHeight(library.get(a.plant), a) - planHeight(library.get(b.plant), b)), [instances, library]);
    const resources = useMemo(() => {
        const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
        geometry.setAttribute('aPlan', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2));
        const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
        material.customProgramCacheKey = () => 'plant-plan-v1';
        material.onBeforeCompile = (shader) => {
            shader.vertexShader = `attribute vec2 aPlan; varying vec2 vPlan; varying vec2 vPlanUv;\n${shader.vertexShader}`
                .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlan = aPlan; vPlanUv = uv;');
            shader.fragmentShader = `varying vec2 vPlan; varying vec2 vPlanUv;\n${shader.fragmentShader}`
                .replace('#include <color_fragment>', `#include <color_fragment>
                vec2 q = vPlanUv - 0.5;
                float d = length(q), px = max(fwidth(d), 0.0001);
                float coverage = 1.0 - smoothstep(0.5 - px, 0.5, d);
                if (coverage < 0.01) discard;
                float ring = smoothstep(0.5 - px * 2.3, 0.5 - px * 0.8, d);
                vec2 aq = abs(q), dp = max(fwidth(q), vec2(0.0001));
                float arms = (1.0 - smoothstep(0.115, 0.13, max(aq.x, aq.y)));
                float cross = (1.0 - smoothstep(0.35, 1.15, min(aq.x / dp.x, aq.y / dp.y))) * arms;
                float core = vPlan.y * (1.0 - smoothstep(0.035, 0.035 + px, d));
                float ink = max(ring, max(cross, core));
                vec3 dark = mix(diffuseColor.rgb * 0.42, vec3(0.028), vPlan.y);
                diffuseColor.rgb = mix(diffuseColor.rgb, dark, ink);
                diffuseColor.a *= coverage * mix(vPlan.x, 0.86, ink);
                `);
        };
        return { geometry, material };
    }, [capacity]);
    useEffect(() => () => { resources.geometry.dispose(); resources.material.dispose(); }, [resources]);
    useLayoutEffect(() => {
        if (!mesh.current) return;
        const matrix = new THREE.Matrix4(), color = new THREE.Color(), values = resources.geometry.attributes.aPlan;
        ordered.forEach((p, i) => {
            const plant = library.get(p.plant), height = planHeight(plant, p), size = 2 * planRadius(plant, p);
            matrix.makeScale(size, 1, size).setPosition(p.x, p.y + 0.035 + height * 0.001 + i * 1e-7, p.z);
            mesh.current.setMatrixAt(i, matrix);
            mesh.current.setColorAt(i, color.set(p.existing ? '#f4f3ee' : plant?.cap ?? '#888888'));
            values.setXY(i, planOpacity(height), p.existing ? 1 : 0);
        });
        mesh.current.count = ordered.length;
        mesh.current.instanceMatrix.needsUpdate = true;
        if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
        values.needsUpdate = true;
        invalidate();
    }, [ordered, library, resources, invalidate]);
    const links = useMemo(() => {
        const positions = [];
        for (const group of plantingGroups(instances, library, beds)) for (const [a, b] of group.links) {
            const y = Math.max(a.y, b.y) + 0.15;
            positions.push(a.x, y, a.z, b.x, y, b.z);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        return geometry;
    }, [instances, library, beds]);
    useEffect(() => () => links.dispose(), [links]);
    return <group name="planting-plan-caps">
        <instancedMesh ref={mesh} args={[resources.geometry, resources.material, capacity]} frustumCulled={false} raycast={NO_PICK} renderOrder={2} />
        <lineSegments geometry={links} raycast={NO_PICK} renderOrder={3}>
            <lineBasicMaterial color="#3b4335" transparent opacity={0.44} depthWrite={false} toneMapped={false} />
        </lineSegments>
    </group>;
}
