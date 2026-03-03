import { createDefaultInfoEditorDocument, DEFAULT_INFO_EDITOR_HTML, DEFAULT_PAPER_SETTINGS, normalizeHtmlString } from './infoEditorHtml';

const DB_NAME = 'ddg-info-editor';
const STORE_NAME = 'documents';
const DB_VERSION = 1;
const DOCUMENT_KEY = 'default';
const LEGACY_CONTENT_KEY = 'cia_editor_content';
const LEGACY_SETTINGS_KEY = 'cia_editor_settings';
const FALLBACK_KEY = 'cia_editor_document_v2';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

function transactionRequest(storeName, mode, operation) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = operation(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  }));
}

function mergePaperSettings(settings) {
  return {
    ...DEFAULT_PAPER_SETTINGS,
    ...(settings ?? {}),
  };
}

function normalizeDocument(documentState) {
  const fallback = createDefaultInfoEditorDocument();
  const normalized = {
    ...fallback,
    ...(documentState ?? {}),
  };

  normalized.version = 2;
  normalized.contentHtml = normalizeHtmlString(normalized.contentHtml || DEFAULT_INFO_EDITOR_HTML);
  normalized.paperSettings = mergePaperSettings(normalized.paperSettings);
  normalized.overlays = Array.isArray(normalized.overlays)
    ? normalized.overlays
        .filter((overlay) => overlay?.kind === 'png' && overlay.src)
        .slice(0, 1)
        .map((overlay) => ({
          id: overlay.id ?? crypto.randomUUID(),
          kind: 'png',
          name: overlay.name ?? 'signature.png',
          src: overlay.src,
          xPct: clampNumber(overlay.xPct, 0, 100, 18),
          yPct: clampNumber(overlay.yPct, 0, 100, 72),
          widthPct: clampNumber(overlay.widthPct, 8, 90, 24),
          opacity: clampNumber(overlay.opacity, 0.1, 1, 0.92),
        }))
    : [];
  normalized.updatedAt = normalized.updatedAt ?? new Date().toISOString();
  return normalized;
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}

function readFallbackDocument() {
  try {
    const raw = window.localStorage.getItem(FALLBACK_KEY);
    return raw ? normalizeDocument(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeFallbackDocument(documentState) {
  try {
    window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(documentState));
  } catch {
    // Best-effort fallback only.
  }
}

export async function migrateLegacyInfoEditorData() {
  const legacyContent = window.localStorage.getItem(LEGACY_CONTENT_KEY);
  const legacySettings = window.localStorage.getItem(LEGACY_SETTINGS_KEY);

  if (!legacyContent && !legacySettings) {
    return createDefaultInfoEditorDocument();
  }

  let parsedSettings = {};
  if (legacySettings) {
    try {
      parsedSettings = JSON.parse(legacySettings);
    } catch {
      parsedSettings = {};
    }
  }

  return normalizeDocument({
    version: 2,
    contentHtml: legacyContent || DEFAULT_INFO_EDITOR_HTML,
    paperSettings: parsedSettings,
    overlays: [],
    updatedAt: new Date().toISOString(),
  });
}

export async function loadInfoEditorDocument() {
  const defaultDocument = createDefaultInfoEditorDocument();

  try {
    const stored = await transactionRequest(STORE_NAME, 'readonly', (store) => store.get(DOCUMENT_KEY));
    if (stored) {
      return normalizeDocument(stored);
    }
  } catch {
    const fallback = readFallbackDocument();
    if (fallback) {
      return fallback;
    }
  }

  const migrated = await migrateLegacyInfoEditorData();
  await saveInfoEditorDocument(migrated);
  return migrated ?? defaultDocument;
}

export async function saveInfoEditorDocument(documentState) {
  const normalized = normalizeDocument(documentState);
  writeFallbackDocument(normalized);

  try {
    await transactionRequest(STORE_NAME, 'readwrite', (store) => store.put(normalized, DOCUMENT_KEY));
  } catch {
    // Keep the fallback localStorage copy if IndexedDB is unavailable.
  }

  return normalized;
}
