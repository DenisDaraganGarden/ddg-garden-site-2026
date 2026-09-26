import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { fenceLayout } from './fenceLayout.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const NO_RAYCAST = () => {};

function buildFence(object) {
    const layout = fenceLayout(object);
    const style = object.fenceStyle;
    const height = object.height;
    const premium = style === 'mesh-358';
    const palisade = style === 'palisade';
    const postWidth = premium ? .08 : .065;
    const wire = premium ? .004 : .0055;
    const matrices = { posts: [], wires: [], rails: [], pickets: [], tips: [] };
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const add = (list, x, y, z, sx, sy, sz, heading = 0) => {
        position.set(x, y, z);
        scale.set(sx, sy, sz);
        rotation.setFromAxisAngle(Y_AXIS, heading);
        matrices[list].push(new THREE.Matrix4().compose(position, rotation, scale));
    };

    for (const [x, z] of layout.posts) add('posts', x, height / 2 + .04, z, postWidth, height + .08, postWidth);
    for (const { x0, z0, x1, z1, span } of layout.panels) {
        const heading = -Math.atan2(z1 - z0, x1 - x0);
        const nx = (x1 - x0) / span, nz = (z1 - z0) / span;
        const inset = postWidth / 2 + .025;
        const inside = span - inset * 2;
        if (inside <= .05) continue;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        // Panels remain straight between posts, including along a curved path.
        if (palisade) {
            const bars = Math.floor(inside / .11);
            for (let i = 0; i <= bars; i++) {
                const t = (i / Math.max(1, bars) - .5) * inside;
                add('pickets', cx + nx * t, height / 2, cz + nz * t, .032, height - .13, .032, heading);
                add('tips', cx + nx * t, height - .02, cz + nz * t, 1, 1, 1, heading);
            }
            // Rails sit on the garden side of the pickets.
            const rx = cx - nz * .09, rz = cz + nx * .09;
            add('rails', rx, height * .35, rz, inside, .045, .045, heading);
            add('rails', rx, height * .72, rz, inside, .045, .045, heading);
            continue;
        }
        add('rails', cx, .13, cz, inside, .018, .03, heading);
        add('rails', cx, height - .07, cz, inside, .018, .03, heading);
        const verticalStep = premium ? .0762 : .2;
        const horizontalStep = premium ? .0127 : .05;
        const verticals = Math.floor(inside / verticalStep);
        for (let i = 0; i <= verticals; i++) {
            const t = (i / Math.max(1, verticals) - .5) * inside;
            add('wires', cx + nx * t, height / 2 + .025, cz + nz * t,
                wire, height - .27, wire);
        }
        const horizontals = Math.floor((height - .27) / horizontalStep);
        for (let i = 0; i <= horizontals; i++) {
            const y = .15 + i * (height - .27) / Math.max(1, horizontals);
            add('wires', cx, y, cz, inside, wire, wire, heading);
        }
        if (!premium) {
            // The 2D panel has paired horizontal rods at its two stiffener lines.
            add('rails', cx, height * .35, cz, inside, .008, .014, heading);
            add('rails', cx, height * .72, cz, inside, .008, .014, heading);
        }
    }

    const material = new THREE.MeshStandardMaterial({ color: '#30383a', metalness: .68, roughness: .38 });
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const tipGeometry = new THREE.ConeGeometry(.027, .13, 4);
    const meshes = Object.entries(matrices).filter(([, values]) => values.length).map(([kind, values]) => {
        const mesh = new THREE.InstancedMesh(kind === 'tips' ? tipGeometry : geometry, material, values.length);
        mesh.name = `topiary-fence-${kind}`;
        values.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = kind === 'posts' || kind === 'rails' || kind === 'pickets';
        mesh.receiveShadow = true;
        if (kind === 'wires') mesh.raycast = NO_RAYCAST;
        return mesh;
    });
    return { meshes, geometry, tipGeometry, material };
}

export default function TopiaryFence({ object }) {
    const pathKey = JSON.stringify(object.points);
    const { height, fenceStyle, fenceSmooth } = object;
    const fence = useMemo(() => buildFence({ points: JSON.parse(pathKey), height, fenceStyle, fenceSmooth }), [pathKey, height, fenceStyle, fenceSmooth]);
    useEffect(() => () => {
        fence.geometry.dispose();
        fence.tipGeometry.dispose();
        fence.material.dispose();
    }, [fence]);
    return <group name={`topiary-fence-${object.id}`}>
        {fence.meshes.map(mesh => <primitive key={mesh.name} object={mesh} />)}
    </group>;
}
