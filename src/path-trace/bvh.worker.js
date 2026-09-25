import { BufferGeometry, BufferAttribute } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

self.onmessage = ({ data }) => {
    try {
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new BufferAttribute(data.position, 3));
        if (data.index) geometry.setIndex(new BufferAttribute(data.index, 1));
        let last = 0;
        const bvh = new MeshBVH(geometry, { ...data.options, onProgress(progress) {
            const now = performance.now();
            if (progress === 1 || now - last > 120) { self.postMessage({ progress }); last = now; }
        } });
        const serialized = MeshBVH.serialize(bvh, { cloneBuffers: false });
        const buffers = [...serialized.roots, data.position.buffer, serialized.index?.buffer, serialized.indirectBuffer?.buffer].filter(Boolean);
        self.postMessage({ serialized, position: data.position }, [...new Set(buffers)]);
    } catch (error) { self.postMessage({ error: error.message }); }
};
