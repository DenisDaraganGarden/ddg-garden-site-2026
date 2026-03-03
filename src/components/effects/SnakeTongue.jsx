import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const SnakeTongue = ({ curve, settings }) => {
    const tongueGroupRef = useRef();
    const leftForkRef = useRef();
    const rightForkRef = useRef();

    const tongueSpeed = (settings?.tongueSpeed ?? 50) / 10.0;
    const tongueAmplitude = (settings?.tongueAmplitude ?? 80) / 100.0;
    const tongueLength = (settings?.tongueLength ?? 60) / 100.0;

    const { tipPos, quaternion } = useMemo(() => {
        const pos = curve.getPoint(1.0);
        const tangent = curve.getTangent(1.0).normalize();
        const q = new THREE.Quaternion();
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
        return { tipPos: pos, quaternion: q };
    }, [curve]);

    const tongueMaterial = useMemo(() => {
        return new THREE.MeshStandardMaterial({
            color: new THREE.Color('#8b2252'),
            roughness: 0.6,
            metalness: 0.0,
        });
    }, []);

    useFrame(({ clock }) => {
        if (!tongueGroupRef.current) return;
        const t = clock.elapsedTime;

        const extendCycle = Math.sin(t * tongueSpeed) * 0.5 + 0.5;
        const extend = Math.pow(extendCycle, 3.0);

        const flickerMask = THREE.MathUtils.smoothstep(extend, 0.7, 1.0);
        const flicker = Math.sin(t * tongueSpeed * 12.0) * flickerMask;

        tongueGroupRef.current.scale.set(1, extend * tongueAmplitude, 1);

        if (leftForkRef.current && rightForkRef.current) {
            const flickAngle = flicker * 0.18;
            leftForkRef.current.rotation.z = 0.22 + flickAngle;
            rightForkRef.current.rotation.z = -0.22 - flickAngle;
        }
    });

    const baseLen = tongueLength * 0.52;
    const forkLen = tongueLength * 0.48;
    const mouthOffset = baseLen * 0.18;

    return (
        <group position={tipPos.toArray()} quaternion={quaternion}>
            <group ref={tongueGroupRef} position={[0, mouthOffset, 0]}>
                <mesh material={tongueMaterial} position={[0, baseLen * 0.5, 0]}>
                    <cylinderGeometry args={[0.012, 0.018, baseLen, 8]} />
                </mesh>
                <group
                    ref={leftForkRef}
                    position={[0, baseLen, 0]}
                    rotation={[0.05, 0, 0.22]}
                >
                    <mesh
                        material={tongueMaterial}
                        position={[0, forkLen * 0.5, 0]}
                    >
                        <cylinderGeometry args={[0.006, 0.0012, forkLen, 6]} />
                    </mesh>
                </group>
                <group
                    ref={rightForkRef}
                    position={[0, baseLen, 0]}
                    rotation={[-0.05, 0, -0.22]}
                >
                    <mesh
                        material={tongueMaterial}
                        position={[0, forkLen * 0.5, 0]}
                    >
                        <cylinderGeometry args={[0.006, 0.0012, forkLen, 6]} />
                    </mesh>
                </group>
            </group>
        </group>
    );
};

export default SnakeTongue;
