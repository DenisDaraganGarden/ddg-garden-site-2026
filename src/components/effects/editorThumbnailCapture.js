// A thumbnail is a local editor convenience. It is requested once by Focus and
// fulfilled immediately after the current frame has been presented.
export const EDITOR_THUMBNAIL_REQUEST = 'ddg-editor-camera-thumbnail-request';
export const EDITOR_THUMBNAIL_READY = 'ddg-editor-camera-thumbnail';

export function requestEditorThumbnail(key) {
  if (typeof window === 'undefined' || typeof key !== 'string' || !key) return;
  window.dispatchEvent(new CustomEvent(EDITOR_THUMBNAIL_REQUEST, { detail: { key } }));
}

export function publishEditorThumbnail(key, image) {
  if (typeof window === 'undefined' || typeof key !== 'string' || !image) return;
  window.dispatchEvent(new CustomEvent(EDITOR_THUMBNAIL_READY, { detail: { key, image } }));
}
