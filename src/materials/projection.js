import * as THREE from 'three';

const up = new THREE.Vector3(0, 1, 0);
export function surfaceBasis(normal, mode = 'box') {
    const n = normal.clone().normalize();
    if (mode === 'slope') {
        if (n.y < 0) n.negate();
        const u = new THREE.Vector3().crossVectors(up, n);
        if (u.lengthSq() < 1e-8) return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)];
        u.normalize();
        if (Math.abs(u.x) >= Math.abs(u.z) ? u.x < 0 : u.z < 0) u.negate();
        return [u, new THREE.Vector3().crossVectors(u, n).normalize()];
    }
    const [x, y, z] = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
    return x >= y && x >= z ? [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0)]
        : y >= z ? [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)] : [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0)];
}
