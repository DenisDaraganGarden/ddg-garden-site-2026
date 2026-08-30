import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';

const LazyTransformControls = React.lazy(() => import('@react-three/drei/core/TransformControls.js').then((module) => ({
    default: module.TransformControls,
})));

// What each object is allowed to be dragged by. The rule is not cosmetic: a
// channel a procedural system owns must not be editable by hand, or the gizmo
// and the simulation fight and the author loses either way.
//
//  - The boat floats. Its height comes from the buoyancy probes plus the height
//    offset, and it only ever yaws, so vertical translation and pitch/roll are
//    off. Both hulls are one mesh, so scale stays uniform.
//  - The sculpture stands on the seabed; its base offset owns Y for the same
//    reason.
const GIZMO_TARGETS = {
    boat: {
        objectName: 'boat-anchor',
        translate: { x: true, y: false, z: true },
        rotate: { x: false, y: true, z: false },
        uniformScale: true,
    },
    sculpture: {
        objectName: 'sculpture-anchor',
        translate: { x: true, y: false, z: true },
        rotate: { x: false, y: true, z: false },
        uniformScale: true,
    },
    // A light and the point it looks at are two separate handles, the way a
    // Corona Light works: drag the body to place it, drag the pivot to aim it.
    // Both move freely in all three axes - a light is not standing on anything.
    light1: {
        objectName: 'light-1-anchor',
        translate: { x: true, y: true, z: true },
        rotate: { x: false, y: false, z: false },
        uniformScale: false,
    },
    light1target: {
        objectName: 'light-1-target',
        translate: { x: true, y: true, z: true },
        rotate: { x: false, y: false, z: false },
        uniformScale: false,
    },
    light2: {
        objectName: 'light-2-anchor',
        translate: { x: true, y: true, z: true },
        rotate: { x: false, y: false, z: false },
        uniformScale: false,
    },
    light2target: {
        objectName: 'light-2-target',
        translate: { x: true, y: true, z: true },
        rotate: { x: false, y: false, z: false },
        uniformScale: false,
    },
};

const round = (value, digits = 3) => Number(value.toFixed(digits));

export default function EditorGizmo({ selection, mode, orbitRef, onTransform }) {
    const { scene } = useThree();
    const controlsRef = useRef(null);
    const [target, setTarget] = useState(null);
    const rule = selection ? GIZMO_TARGETS[selection] : null;

    // The anchors mount with the scene, which can be a frame or two after the
    // selection is made, so resolve by name and retry until it exists.
    useEffect(() => {
        if (!rule) {
            setTarget(null);
            return undefined;
        }

        let frame = 0;
        const resolve = () => {
            const found = scene.getObjectByName(rule.objectName);
            if (found) {
                setTarget(found);
                return;
            }
            frame = requestAnimationFrame(resolve);
        };

        resolve();
        return () => cancelAnimationFrame(frame);
    }, [rule, scene]);

    const axes = useMemo(() => {
        if (!rule) {
            return { showX: false, showY: false, showZ: false };
        }
        if (mode === 'translate') {
            return { showX: rule.translate.x, showY: rule.translate.y, showZ: rule.translate.z };
        }
        if (mode === 'rotate') {
            return { showX: rule.rotate.x, showY: rule.rotate.y, showZ: rule.rotate.z };
        }
        return { showX: true, showY: true, showZ: true };
    }, [mode, rule]);

    // Orbiting while dragging a handle would drag the object across the screen.
    useEffect(() => {
        const controls = controlsRef.current;
        const orbit = orbitRef?.current;

        if (!controls) {
            return undefined;
        }

        const handleDragging = (event) => {
            if (orbit) {
                orbit.enabled = !event.value;
            }
        };

        controls.addEventListener('dragging-changed', handleDragging);
        return () => {
            controls.removeEventListener('dragging-changed', handleDragging);
            if (orbit) {
                orbit.enabled = true;
            }
        };
    }, [orbitRef, target]);

    if (!rule || !target) {
        return null;
    }

    const handleObjectChange = () => {
        if (typeof onTransform !== 'function') {
            return;
        }

        // Report the authored value, not the raw object: the scene re-applies
        // settings every frame, so the settings are the source of truth and the
        // gizmo is one more way to write to them.
        if (mode === 'translate') {
            onTransform(selection, {
                position: { x: round(target.position.x, 2), z: round(target.position.z, 2) },
            });
            return;
        }

        if (mode === 'rotate') {
            onTransform(selection, {
                rotationY: Math.round(THREE.MathUtils.radToDeg(target.rotation.y)),
            });
            return;
        }

        const uniform = rule.uniformScale
            ? (target.scale.x + target.scale.y + target.scale.z) / 3
            : target.scale.x;
        onTransform(selection, { scale: round(uniform, 4) });
    };

    return (
        <React.Suspense fallback={null}>
            <LazyTransformControls
                ref={controlsRef}
                object={target}
                mode={mode}
                size={0.8}
                space="world"
                onObjectChange={handleObjectChange}
                {...axes}
            />
        </React.Suspense>
    );
}
