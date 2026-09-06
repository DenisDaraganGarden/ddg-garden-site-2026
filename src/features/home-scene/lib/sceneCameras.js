// Camera variants are intentionally data-only.  The editor, settings migration
// and public player can share this module without making either of them depend
// on React or on a particular scene renderer.

export const SCENE_CAMERA_SNAPSHOT_EXCLUDED_KEYS = Object.freeze([
  'sceneCameras',
  'slideshow',
  'freeCamera',
]);

export const DEFAULT_SCENE_CAMERA_HOLD_SECONDS = 8;
export const DEFAULT_SLIDESHOW = Object.freeze({
  enabled: false,
  fadeSeconds: 1.2,
});

const CAMERA_ID_MAX_LENGTH = 64;
const CAMERA_NAME_MAX_LENGTH = 80;
const MIN_HOLD_SECONDS = 1;
const MAX_HOLD_SECONDS = 3600;
const MIN_FADE_SECONDS = 0;
const MAX_FADE_SECONDS = 10;
const snapshotExcludedKeySet = new Set(SCENE_CAMERA_SNAPSHOT_EXCLUDED_KEYS);

const isRecord = (value) => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const clampNumber = (value, min, max, fallback) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numericValue));
};

const cloneValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (isRecord(value)) {
    return Object.entries(value).reduce((copy, [key, entry]) => {
      copy[key] = cloneValue(entry);
      return copy;
    }, {});
  }

  return value;
};

const stripSceneCameraMeta = (value) => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce((snapshot, [key, entry]) => {
    if (!snapshotExcludedKeySet.has(key)) {
      snapshot[key] = cloneValue(entry);
    }
    return snapshot;
  }, {});
};

const normalizeCameraId = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  const compact = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  const trimmed = compact.replace(/^-+|-+$/g, '').slice(0, CAMERA_ID_MAX_LENGTH);

  return /^[a-z][a-z0-9_-]*$/.test(trimmed) ? trimmed : '';
};

const hasId = (usedIds, id) => (
  usedIds instanceof Set ? usedIds.has(id) : Array.isArray(usedIds) && usedIds.includes(id)
);

const addId = (usedIds, id) => {
  if (usedIds instanceof Set) {
    usedIds.add(id);
  } else if (Array.isArray(usedIds)) {
    usedIds.push(id);
  }
};

const makeUniqueCameraId = (rawId, usedIds, index) => {
  const baseId = normalizeCameraId(rawId) || `camera-${Math.max(1, index + 1)}`;
  let candidate = baseId;
  let suffix = 2;

  while (hasId(usedIds, candidate)) {
    const suffixText = `-${suffix}`;
    candidate = `${baseId.slice(0, CAMERA_ID_MAX_LENGTH - suffixText.length)}${suffixText}`;
    suffix += 1;
  }

  addId(usedIds, candidate);
  return candidate;
};

const normalizeName = (value, index, prefix = 'Камера') => {
  if (typeof value !== 'string') {
    return `${prefix} ${index + 1}`;
  }

  const name = value.trim().slice(0, CAMERA_NAME_MAX_LENGTH);
  return name || `${prefix} ${index + 1}`;
};

const normalizeVector = (value) => {
  if (!isRecord(value)) {
    return null;
  }

  const axes = [value.x, value.y, value.z].map(Number);
  return axes.every(Number.isFinite) ? { x: axes[0], y: axes[1], z: axes[2] } : null;
};

/**
 * Work cameras are the editor's viewport bookmarks: a named pose, nothing
 * else. They are never published and never part of a scene snapshot. An entry
 * without a usable pose is dropped rather than repaired - there is no
 * composition to inherit from.
 */
// The main viewport camera: always present and first, active when the editor
// opens, never deleted. The others are ordinary bookmarks.
export const WORK_CAMERA_MAIN_ID = 'work-main';

export function normalizeWorkCameras(raw) {
  const source = Array.isArray(raw) ? raw : [];
  const usedIds = new Set();

  return source.reduce((cameras, entry, index) => {
    const cameraPosition = normalizeVector(entry?.cameraPosition);
    const cameraTarget = normalizeVector(entry?.cameraTarget);

    if (!cameraPosition || !cameraTarget) {
      return cameras;
    }

    cameras.push({
      id: makeUniqueCameraId(entry.id, usedIds, index),
      name: normalizeName(entry.name, index, 'Рабочая'),
      cameraPosition,
      cameraTarget,
      // Same bounds as the editor's FOV slider (HOME_SCENE_CAMERA_FOV_MIN/MAX).
      cameraFov: clampNumber(entry.cameraFov, 1, 75, 36),
    });
    return cameras;
  }, []);
}

/**
 * Copies only scene keys into a snapshot. Metadata that controls the camera
 * catalogue is deliberately excluded, preventing nested catalogues.
 */
export function createSceneSnapshot(settings, keys = []) {
  const source = isRecord(settings) ? settings : {};
  const snapshotKeys = Array.isArray(keys) ? keys : [];

  return snapshotKeys.reduce((snapshot, key) => {
    if (
      typeof key === 'string'
      && !snapshotExcludedKeySet.has(key)
      && Object.prototype.hasOwnProperty.call(source, key)
    ) {
      snapshot[key] = cloneValue(source[key]);
    }
    return snapshot;
  }, {});
}

/**
 * Normalizes one persisted camera. `normalizeSnapshot` is injected by the
 * settings layer so this pure module never recurses through a camera catalogue.
 */
export function normalizeSceneCamera(
  raw,
  fallbackScene,
  normalizeSnapshot,
  usedIds = new Set(),
  index = 0,
) {
  const source = isRecord(raw) ? raw : {};
  const sourceScene = isRecord(source.scene) ? source.scene : fallbackScene;
  let normalizedScene;

  try {
    normalizedScene = typeof normalizeSnapshot === 'function'
      ? normalizeSnapshot(sourceScene, fallbackScene)
      : sourceScene;
  } catch {
    normalizedScene = fallbackScene;
  }

  return {
    id: makeUniqueCameraId(source.id, usedIds, index),
    name: normalizeName(source.name, index),
    enabled: typeof source.enabled === 'boolean' ? source.enabled : true,
    holdSeconds: clampNumber(
      source.holdSeconds,
      MIN_HOLD_SECONDS,
      MAX_HOLD_SECONDS,
      DEFAULT_SCENE_CAMERA_HOLD_SECONDS,
    ),
    scene: stripSceneCameraMeta(normalizedScene),
  };
}

/**
 * A published scene always has at least one camera variant.  An empty or
 * malformed catalogue therefore falls back to the current flat scene.
 */
export function normalizeSceneCameras(raw, fallbackScene, normalizeSnapshot) {
  const source = Array.isArray(raw) ? raw : [];
  const usedIds = new Set();
  const normalized = source.map((camera, index) => normalizeSceneCamera(
    camera,
    fallbackScene,
    normalizeSnapshot,
    usedIds,
    index,
  ));

  if (normalized.length > 0) {
    return normalized;
  }

  return [normalizeSceneCamera(
    { id: 'camera-1', name: 'Камера 1', enabled: true, scene: fallbackScene },
    fallbackScene,
    normalizeSnapshot,
    usedIds,
    0,
  )];
}

export function normalizeSlideshow(raw) {
  const source = isRecord(raw) ? raw : {};

  return {
    enabled: typeof source.enabled === 'boolean'
      ? source.enabled
      : DEFAULT_SLIDESHOW.enabled,
    fadeSeconds: clampNumber(
      source.fadeSeconds,
      MIN_FADE_SECONDS,
      MAX_FADE_SECONDS,
      DEFAULT_SLIDESHOW.fadeSeconds,
    ),
  };
}

export function getPlayableSceneCameras(settings) {
  return Array.isArray(settings?.sceneCameras)
    ? settings.sceneCameras.filter((camera) => camera?.enabled !== false)
    : [];
}

/**
 * Applies a variant to a root settings object while retaining catalogue and
 * editor-only state. Snapshot metadata is removed defensively before merging.
 */
export function applySceneSnapshot(root, snapshot) {
  const source = isRecord(root) ? root : {};

  return {
    ...source,
    ...stripSceneCameraMeta(snapshot),
    sceneCameras: source.sceneCameras,
    slideshow: source.slideshow,
    freeCamera: source.freeCamera,
  };
}
