import {
  applySceneSnapshot,
  createSceneSnapshot,
  DEFAULT_SCENE_CAMERA_HOLD_SECONDS,
  normalizeWorkCameras,
  WORK_CAMERA_MAIN_ID,
} from './sceneCameras.js';
import { createPairedCameraLayouts, resolveLayout } from './layout.js';

const cameraListKey = (kind) => kind === 'work' ? 'workCameras' : 'sceneCameras';

function nextCameraIdentity(cameras, kind) {
  const prefix = kind === 'work' ? 'work' : 'camera';
  const names = kind === 'work' ? /^(?:Рабочая|Work)\s+(\d+)$/i : /^(?:Камера|Camera)\s+(\d+)$/i;
  const ids = new Set(cameras.map((camera) => camera.id));
  const idPattern = new RegExp(`^${prefix}-(\\d+)$`);
  const nextNumber = (read) => 1 + cameras.reduce((max, camera) => (
    Math.max(max, Number(read(camera)?.[1]) || 0)
  ), 0);
  let number = nextNumber((camera) => camera.id === WORK_CAMERA_MAIN_ID ? ['', '1'] : idPattern.exec(camera.id));
  while (ids.has(`${prefix}-${number}`)) number += 1;
  return {
    id: `${prefix}-${number}`,
    name: `${kind === 'work' ? 'Рабочая' : 'Камера'} ${nextNumber((camera) => names.exec(camera.name))}`,
  };
}

// Every edit is committed to exactly one owner, before persistence or switching.
// The last site-camera ID stays available while a work camera is selected, but
// is never an edit destination in that mode.
export function syncActiveEditorCamera(settings, snapshotKeys) {
  const kind = settings.activeWorkCameraId ? 'work' : 'scene';
  const key = cameraListKey(kind);
  const cameras = settings[key] ?? [];
  const id = kind === 'work' ? settings.activeWorkCameraId : settings.activeCameraId;
  const active = cameras.find((camera) => camera.id === id);
  if (!active) return settings;
  const scene = createSceneSnapshot(settings, snapshotKeys);
  if (JSON.stringify(active.scene) === JSON.stringify(scene)) return settings;
  return {
    ...settings,
    [key]: cameras.map((camera) => camera.id === id ? { ...camera, scene } : camera),
  };
}

export function initializeEditorCameras(settings, snapshotKeys, layoutKey = 'desktop') {
  let cameras = normalizeWorkCameras(settings.workCameras, createSceneSnapshot(settings, snapshotKeys));
  let activeWorkCameraId = settings.activeWorkCameraId ?? null;
  if (!cameras.some((camera) => camera.id === WORK_CAMERA_MAIN_ID)) {
    if (cameras.length) {
      cameras = [{
        id: WORK_CAMERA_MAIN_ID,
        name: cameras.some((camera) => /^(?:Рабочая|Work)\s+1$/i.test(camera.name))
          ? nextCameraIdentity(cameras, 'work').name
          : 'Рабочая 1',
        scene: createSceneSnapshot(cameras[0].scene, snapshotKeys),
      }, ...cameras];
    } else {
      const scene = createSceneSnapshot({
        ...settings,
        layouts: createPairedCameraLayouts(settings, layoutKey),
      }, snapshotKeys);
      cameras = [{ id: WORK_CAMERA_MAIN_ID, name: 'Рабочая 1', scene }];
      activeWorkCameraId = WORK_CAMERA_MAIN_ID;
    }
  }
  cameras = [
    ...cameras.filter((camera) => camera.id === WORK_CAMERA_MAIN_ID),
    ...cameras.filter((camera) => camera.id !== WORK_CAMERA_MAIN_ID),
  ];
  const active = cameras.find((camera) => camera.id === activeWorkCameraId);
  const next = { ...settings, workCameras: cameras, activeWorkCameraId: active?.id ?? null };
  // A legacy active work pose was separate from root.layouts; migrate its pose
  // into the working snapshot without copying the working look to a site camera.
  return syncActiveEditorCamera(active ? applySceneSnapshot(next, active.scene) : next, snapshotKeys);
}

export function updateEditorLayout(settings, key, patch) {
  const source = resolveLayout(settings.layouts, key) ?? settings;
  return {
    ...settings,
    layouts: {
      ...settings.layouts,
      [key]: {
        ...source,
        customized: true,
        cameraPosition: { ...source.cameraPosition },
        cameraTarget: { ...source.cameraTarget },
        boatPosition: { ...source.boatPosition },
        sculpturePosition: { ...source.sculpturePosition },
        ...patch,
      },
    },
  };
}

export function selectEditorCamera(settings, id, kind, snapshotKeys) {
  const prepared = syncActiveEditorCamera(settings, snapshotKeys);
  const target = prepared[cameraListKey(kind)]?.find((camera) => camera.id === id);
  if (!target) return prepared;
  return {
    ...applySceneSnapshot(prepared, target.scene),
    activeCameraId: kind === 'work' ? prepared.activeCameraId : id,
    activeWorkCameraId: kind === 'work' ? id : null,
    freeCamera: true,
  };
}

export function addEditorCamera(settings, { kind, layoutKey, pose }, snapshotKeys) {
  const prepared = syncActiveEditorCamera(settings, snapshotKeys);
  const key = cameraListKey(kind);
  const cameras = prepared[key] ?? [];
  const withPose = {
    ...prepared,
    layouts: createPairedCameraLayouts(prepared, layoutKey, pose),
  };
  const camera = {
    ...nextCameraIdentity(cameras, kind),
    scene: createSceneSnapshot(withPose, snapshotKeys),
    ...(kind === 'work' ? {} : {
      enabled: true,
      holdSeconds: prepared.sceneCameras?.find((entry) => entry.id === prepared.activeCameraId)
        ?.holdSeconds ?? DEFAULT_SCENE_CAMERA_HOLD_SECONDS,
    }),
  };
  return {
    ...withPose,
    [key]: [...cameras, camera],
    activeCameraId: kind === 'work' ? prepared.activeCameraId : camera.id,
    activeWorkCameraId: kind === 'work' ? camera.id : null,
    freeCamera: true,
  };
}

export function removeEditorCamera(settings, id, kind, snapshotKeys) {
  const prepared = syncActiveEditorCamera(settings, snapshotKeys);
  const key = cameraListKey(kind);
  const cameras = prepared[key] ?? [];
  if ((kind === 'work' && id === WORK_CAMERA_MAIN_ID) || (kind !== 'work' && cameras.length <= 1)) {
    return prepared;
  }
  const index = cameras.findIndex((camera) => camera.id === id);
  if (index < 0) return prepared;
  const remaining = cameras.filter((camera) => camera.id !== id);
  const next = { ...prepared, [key]: remaining };
  const wasActive = kind === 'work'
    ? prepared.activeWorkCameraId === id
    : !prepared.activeWorkCameraId && prepared.activeCameraId === id;
  if (kind !== 'work' && prepared.activeCameraId === id) next.activeCameraId = remaining[0].id;
  if (!wasActive) return next;
  const target = remaining[Math.min(index, remaining.length - 1)];
  if (!target) {
    const siteCamera = next.sceneCameras?.find((camera) => camera.id === next.activeCameraId);
    return { ...applySceneSnapshot(next, siteCamera?.scene), activeWorkCameraId: null };
  }
  // The removed owner has already been committed. Apply the target directly;
  // syncing after changing its ID would copy the deleted camera into it.
  return {
    ...applySceneSnapshot(next, target.scene),
    activeCameraId: kind === 'work' ? next.activeCameraId : target.id,
    activeWorkCameraId: kind === 'work' ? target.id : null,
    freeCamera: true,
  };
}
