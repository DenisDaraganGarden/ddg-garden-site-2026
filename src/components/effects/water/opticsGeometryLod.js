import * as THREE from 'three';

const MAGIC = 'RLOD';
const VERSION = 1;
const lodCache = new Map();

export function parseOpticsGeometryLod(buffer) {
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (magic !== MAGIC || view.getUint16(4, true) !== VERSION) {
    throw new Error('Unsupported optics LOD file');
  }

  const entryCount = view.getUint16(6, true);
  const entries = new Map();
  let offset = 8;
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    const nameLength = view.getUint16(offset, true);
    offset += 2;
    const name = decoder.decode(new Uint8Array(buffer, offset, nameLength));
    offset += nameLength;
    const indexCount = view.getUint32(offset, true);
    offset += 4;
    const indices = new Uint16Array(indexCount);
    for (let index = 0; index < indexCount; index += 1) {
      indices[index] = view.getUint16(offset, true);
      offset += 2;
    }
    entries.set(name, indices);
  }

  if (offset !== buffer.byteLength) {
    throw new Error('Malformed optics LOD file');
  }
  return entries;
}

function loadOpticsGeometryLod(assetPath) {
  if (!lodCache.has(assetPath)) {
    const request = fetch(`${import.meta.env.BASE_URL}${assetPath.replace(/^\//, '')}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load optics LOD: ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then(parseOpticsGeometryLod)
      .catch((error) => {
        // A transient asset failure must not poison the session: a later mount
        // can retry after the network or dev server has recovered.
        lodCache.delete(assetPath);
        throw error;
      });
    lodCache.set(assetPath, request);
  }
  return lodCache.get(assetPath);
}

export function installOpticsGeometryLod(root, assetPath, enabled) {
  if (!enabled || !root) {
    return () => {};
  }

  const installed = [];
  let cancelled = false;
  loadOpticsGeometryLod(assetPath).then((entries) => {
    if (cancelled) return;
    root.traverse((object) => {
      const indices = entries.get(object.name);
      if (!object.isMesh || !object.geometry || !indices) return;
      const geometry = object.geometry.clone();
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeBoundingSphere();
      object.userData.ddgOpticsGeometry = geometry;
      // Keep the original geometry on the mesh. A visible-object LOD can now
      // switch this exact mesh without replacing its parent: buoyancy, drag
      // anchors and bird landing/collision roots retain their coordinate space.
      object.userData.ddgOpticsBaseGeometry = object.geometry;
      installed.push({ object, geometry, baseGeometry: object.geometry });
    });
  }).catch((error) => {
    if (import.meta.env.DEV) {
      console.warn(error);
    }
  });

  return () => {
    cancelled = true;
    installed.forEach(({ object, geometry, baseGeometry }) => {
      if (object.geometry === geometry) {
        object.geometry = baseGeometry;
      }
      if (object.userData.ddgOpticsGeometry === geometry) {
        delete object.userData.ddgOpticsGeometry;
      }
      if (object.userData.ddgOpticsBaseGeometry === baseGeometry) {
        delete object.userData.ddgOpticsBaseGeometry;
      }
      geometry.dispose();
    });
  };
}

// This only swaps index buffers. It deliberately leaves Mesh instances,
// transforms and materials intact, so it is safe for animated/interactive
// objects and for the short, temporary swaps used by the optical capture.
export function setOpticsGeometryLod(root, useReducedGeometry) {
  if (!root) return 0;

  let changed = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    const reducedGeometry = object.userData?.ddgOpticsGeometry;
    const baseGeometry = object.userData?.ddgOpticsBaseGeometry;
    const nextGeometry = useReducedGeometry ? reducedGeometry : baseGeometry;
    if (!nextGeometry || object.geometry === nextGeometry) return;
    object.geometry = nextGeometry;
    changed += 1;
  });
  return changed;
}

export function applyOpticsGeometryLods(...roots) {
  const restored = [];
  roots.forEach((root) => {
    root?.traverse((object) => {
      const geometry = object.userData?.ddgOpticsGeometry;
      if (!object.isMesh || !geometry || object.geometry === geometry) return;
      restored.push({ object, geometry: object.geometry });
      object.geometry = geometry;
    });
  });

  return {
    count: restored.length,
    restore() {
      restored.forEach(({ object, geometry }) => {
        object.geometry = geometry;
      });
    },
  };
}
