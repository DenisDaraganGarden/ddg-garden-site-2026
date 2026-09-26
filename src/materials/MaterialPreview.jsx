import React, { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadLibraryMaps, setLibraryTransform } from './modelMaterials.js';

function Surface({ entry, onError }) {
    const { gl, scene, invalidate } = useThree();
    const [maps, setMaps] = useState(null);
    const geometry = useMemo(() => {
        const box = new THREE.BoxGeometry(2, 2, 0.12);
        const uv = box.attributes.uv;
        for (let i = 0; i < uv.count; i += 1) uv.setY(i, 1 - uv.getY(i));
        return box;
    }, []);
    useEffect(() => () => geometry.dispose(), [geometry]);
    useEffect(() => {
        let live = true, owned;
        loadLibraryMaps(entry.id).then((loaded) => {
            owned = Object.fromEntries(loaded);
            if (live) setMaps(owned);
            else Object.values(owned).forEach((texture) => texture.dispose());
        }, () => { if (live) onError(); });
        return () => { live = false; if (owned) Object.values(owned).forEach((texture) => texture.dispose()); };
    }, [entry.id, onError]);
    useEffect(() => {
        const generator = new THREE.PMREMGenerator(gl);
        const room = new RoomEnvironment();
        const target = generator.fromScene(room, 0.04);
        scene.environment = target.texture;
        room.dispose();
        generator.dispose();
        invalidate();
        return () => { scene.environment = null; target.dispose(); };
    }, [gl, scene, invalidate]);
    useEffect(() => {
        if (!maps) return;
        Object.values(maps).forEach((texture) => {
            setLibraryTransform(texture, { ...entry, tile: entry.tile ?? 1, projection: 'box' }, [2, 2]);
            texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
        });
        invalidate();
    }, [maps, entry, gl, invalidate]);
    if (!maps) return null;
    return <mesh geometry={geometry} rotation={[0, -0.18, 0]}>
        <meshStandardMaterial {...maps} color="#ffffff" roughness={entry.roughness ?? 1} metalness={entry.metalness ?? 0}
            normalScale={[entry.normal ?? 1, -(entry.normal ?? 1)]} aoMapIntensity={entry.ao ?? 1} />
    </mesh>;
}

export default function MaterialPreview({ entry, onError }) {
    return <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [0.25, 0.2, 3.8], fov: 38 }}
        gl={{ antialias: true, powerPreference: 'low-power' }}>
        <color attach="background" args={['#30332f']} />
        <directionalLight position={[-2, 3, 4]} intensity={2.2} />
        <Surface key={entry.id} entry={entry} onError={onError} />
        <OrbitControls enablePan={false} enableDamping={false} minDistance={1.5} maxDistance={6} />
    </Canvas>;
}
