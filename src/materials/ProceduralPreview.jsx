import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import MaterialPreview from './MaterialPreview.jsx';
import { surfaceSize } from './procedural.js';

function texture(bytes, size, channels, colour = false) {
    const rgba = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i += 1) {
        for (let c = 0; c < 3; c += 1) rgba[i * 4 + c] = bytes[i * channels + (channels === 1 ? 0 : c)];
        rgba[i * 4 + 3] = 255;
    }
    const result = new THREE.DataTexture(rgba, size, size, THREE.RGBAFormat);
    result.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    result.flipY = false; result.wrapS = result.wrapT = THREE.RepeatWrapping;
    result.magFilter = THREE.LinearFilter; result.minFilter = THREE.LinearMipmapLinearFilter;
    result.generateMipmaps = true; result.needsUpdate = true;
    return result;
}
export default function ProceduralPreview({ surface, extent, sourceUrl, parallax, onError, resolution = 512 }) {
    const worker = useRef(null), ticket = useRef(0);
    const [maps, setMaps] = useState(null), [source, setSource] = useState(null);
    const sides = useMemo(() => surfaceSize(surface, extent), [surface, extent]);
    const entry = useMemo(() => ({ id: 'procedural-preview', tile: sides[0], tileY: sides[1], normal: 1, roughness: 1, ao: 1, parallax: Number(parallax), parallaxDepth: surface.relief }), [sides, surface.relief, parallax]);
    useEffect(() => {
        const instance = new Worker(new URL('./procedural.worker.js', import.meta.url), { type: 'module' }); worker.current = instance;
        instance.onmessage = ({ data }) => {
            if (data.ticket !== ticket.current) return;
            if (data.error) { onError(data.error); return; }
            setMaps({ map: texture(data.rgb, data.size, 3, true), normalMap: texture(data.normal, data.size, 3),
                heightMap: texture(data.height, data.size, 1), roughnessMap: texture(data.roughness, data.size, 1), aoMap: texture(data.ao, data.size, 1) });
        };
        return () => { instance.terminate(); worker.current = null; };
    }, [onError]);
    useEffect(() => () => { if (maps) Object.values(maps).forEach((item) => item.dispose()); }, [maps]);
    useEffect(() => {
        let active = true; setSource(null);
        if (!sourceUrl) return undefined;
        void (async () => {
            const response = await fetch(sourceUrl); if (!response.ok) throw new Error('Cannot read the colour source');
            const image = await createImageBitmap(await response.blob());
            const scale = Math.min(1, 512 / Math.max(image.width, image.height));
            const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
            const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
            const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data, rgb = new Uint8Array(canvas.width * canvas.height * 3);
            for (let i = 0; i < rgb.length; i += 1) rgb[i] = rgba[Math.floor(i / 3) * 4 + i % 3];
            if (active) setSource({ rgb, width: canvas.width, height: canvas.height });
        })().catch((error) => { if (active) onError(error.message); });
        return () => { active = false; };
    }, [sourceUrl, onError]);
    useEffect(() => {
        const current = ++ticket.current;
        const timer = setTimeout(() => worker.current?.postMessage({ ticket: current, surface, extent, source, size: resolution }), 180);
        return () => clearTimeout(timer);
    }, [surface, extent, source, resolution]);
    return maps ? <MaterialPreview entry={entry} generated={maps} onError={onError} /> : null;
}
