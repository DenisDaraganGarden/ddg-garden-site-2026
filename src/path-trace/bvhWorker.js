import { BufferAttribute, Box3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

// A local worker entry lets Vite bundle the same URL in dev and production.
// Cancellation also settles its promise; no dangling rejected .finally chains.
export class TraceBvhWorker {
    constructor() { this.worker = new Worker(new URL('./bvh.worker.js', import.meta.url), { type: 'module' }); this.reject = null; }
    generate(geometry, { onProgress, ...options } = {}) {
        return new Promise((resolve, reject) => {
            this.reject = reject;
            this.worker.onerror = (error) => { this.reject = null; reject(new Error(error.message || 'Не удалось подготовить геометрию. / Geometry worker failed.')); };
            this.worker.onmessage = ({ data }) => {
                if (data.error) { this.reject = null; reject(new Error(data.error)); }
                else if (data.serialized) {
                    geometry.attributes.position.array = data.position;
                    if (data.serialized.index) geometry.setIndex(new BufferAttribute(data.serialized.index, 1));
                    const bvh = MeshBVH.deserialize(data.serialized, geometry, { setIndex: false });
                    geometry.boundingBox = bvh.getBoundingBox(new Box3()); this.reject = null; resolve(bvh);
                } else onProgress?.(data.progress);
            };
            const position = geometry.attributes.position.array, index = geometry.index?.array;
            this.worker.postMessage({ position, index, options }, [...new Set([position.buffer, index?.buffer].filter(Boolean))]);
        });
    }
    dispose() { this.worker.terminate(); this.reject?.(new DOMException('Render cancelled', 'AbortError')); this.reject = null; }
}
