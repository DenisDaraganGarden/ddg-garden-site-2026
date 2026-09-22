// Stands in for `three/webgpu` and `three/tsl` in this build. The globe on /map
// (three-globe, three-render-objects) imports them for an opt-in WebGPU path
// and a GPU heat-map compute we never enable; the real modules are 1.5 MB of
// renderer that nothing here calls. If a newer globe pulls another name from
// them, the build fails on the missing export - add it here, do not drop the
// alias without measuring the map page again.
export class WebGPURenderer {}
export class StorageInstancedBufferAttribute {}
