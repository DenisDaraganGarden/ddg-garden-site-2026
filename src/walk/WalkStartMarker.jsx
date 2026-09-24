import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';

// Значок старта прогулки: белое кольцо там, где он встанет, и треугольник —
// куда будет смотреть. Лежит на поверхности, в лучи не попадает; под белым —
// тёмная кайма чуть шире, чтобы значок читался и на светлой плитке. Как у
// отметок уровня, бледный «призрак» виден сквозь растения и стены (ghost);
// в прогулке он выключен — не ложится поверх ног.
const LIFT = 0.012, GHOST = 0.3;
export default function WalkStartMarker({ start, ghost = true }) {
    const parts = useMemo(() => {
        const flat = (material) => Object.assign(material, { transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        // Треугольник к −Y плоской фигуры: уложенный на землю, он смотрит к +Z.
        const arrow = (grow) => new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, -0.6 - grow), new THREE.Vector2(0.11 + grow, -0.42 + grow * 0.5), new THREE.Vector2(-0.11 - grow, -0.42 + grow * 0.5)]));
        return {
            white: flat(new THREE.MeshBasicMaterial({ color: '#ffffff', opacity: 0.96 })),
            halo: flat(new THREE.MeshBasicMaterial({ color: '#000000', opacity: 0.3 })),
            ghost: flat(new THREE.MeshBasicMaterial({ color: '#ffffff', opacity: GHOST, depthTest: false })),
            ring: new THREE.RingGeometry(0.3, 0.335, 72), ringHalo: new THREE.RingGeometry(0.285, 0.35, 72),
            arrow: arrow(0), arrowHalo: arrow(0.018),
        };
    }, []);
    useEffect(() => () => Object.values(parts).forEach((part) => part.dispose()), [parts]);
    if (!start) return null;
    const none = () => {};
    return <group name="walk-start" position={[start.x, start.y + LIFT, start.z]} rotation={[0, start.yaw, 0]}>
        <group rotation={[-Math.PI / 2, 0, 0]}>
            <mesh geometry={parts.ringHalo} material={parts.halo} renderOrder={8} raycast={none} />
            <mesh geometry={parts.arrowHalo} material={parts.halo} renderOrder={8} raycast={none} />
            <mesh geometry={parts.ring} material={parts.white} renderOrder={9} raycast={none} />
            <mesh geometry={parts.arrow} material={parts.white} renderOrder={9} raycast={none} />
            {ghost ? <>
                <mesh geometry={parts.ring} material={parts.ghost} renderOrder={19} raycast={none} />
                <mesh geometry={parts.arrow} material={parts.ghost} renderOrder={19} raycast={none} />
            </> : null}
        </group>
    </group>;
}
