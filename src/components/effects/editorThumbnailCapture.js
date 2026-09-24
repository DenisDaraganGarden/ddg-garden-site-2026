// A thumbnail is a local editor convenience. It is requested once by Focus and
// fulfilled immediately after the current frame has been presented.
export const EDITOR_THUMBNAIL_REQUEST = 'ddg-editor-camera-thumbnail-request';
export const EDITOR_THUMBNAIL_READY = 'ddg-editor-camera-thumbnail';

// ScenePostProcessing is mounted after the editor shell on a cold load. Retain
// the most recent explicit request until that render owner begins listening.
let pendingKey = null;

// width/quality: кадр крупнее миниатюры (снимок генплана для отчёта).
export function requestEditorThumbnail(key, { width = 320, quality = 0.68 } = {}) {
  if (typeof window === 'undefined' || typeof key !== 'string' || !key) return;
  pendingKey = { key, width, quality };
  window.dispatchEvent(new CustomEvent(EDITOR_THUMBNAIL_REQUEST, { detail: pendingKey }));
}

export function consumeEditorThumbnailRequest() {
  const request = pendingKey;
  pendingKey = null;
  return request;
}

export function publishEditorThumbnail(key, image) {
  if (typeof window === 'undefined' || typeof key !== 'string' || !image) return;
  window.dispatchEvent(new CustomEvent(EDITOR_THUMBNAIL_READY, { detail: { key, image } }));
}
