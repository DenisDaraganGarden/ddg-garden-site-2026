import { createDefaultInfoEditorDocument, DEFAULT_PAPER_SETTINGS, getDefaultInfoEditorHtml, normalizeHtmlString } from './infoEditorHtml';

const DB_NAME = 'ddg-info-editor';
const STORE_NAME = 'documents';
const DB_VERSION = 1;
const DOCUMENT_KEY_PREFIX = 'default';
const LEGACY_DOCUMENT_KEY = 'default';
const LEGACY_CONTENT_KEY = 'cia_editor_content';
const LEGACY_SETTINGS_KEY = 'cia_editor_settings';
const FALLBACK_KEY_PREFIX = 'cia_editor_document_v2';

function getDocumentKey(language) {
  return `${DOCUMENT_KEY_PREFIX}:${language}`;
}

function getFallbackKey(language) {
  return `${FALLBACK_KEY_PREFIX}:${language}`;
}

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

function normalizeDocument(documentState, language = 'ru') {
  const fallback = createDefaultInfoEditorDocument(language);
  const normalized = {
    ...fallback,
    ...(documentState ?? {}),
  };

  normalized.version = 2;
  normalized.contentHtml = normalizeHtmlString(normalized.contentHtml || getDefaultInfoEditorHtml(language), getDefaultInfoEditorHtml(language));
  normalized.paperSettings = mergePaperSettings(normalized.paperSettings);
  normalized.overlays = Array.isArray(normalized.overlays)
    ? normalized.overlays
        .filter((overlay) => overlay?.kind === 'png' && overlay.src)
        .map((overlay, index) => ({
          id: overlay.id ?? crypto.randomUUID(),
          kind: 'png',
          name: overlay.name ?? `overlay-${index + 1}.png`,
          src: overlay.src,
          xPct: clampNumber(overlay.xPct, 0, 100, 14 + Math.min(index * 6, 40)),
          yPct: clampNumber(overlay.yPct, 0, 100, 10 + Math.min(index * 6, 56)),
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

function readFallbackDocument(language) {
  try {
    const raw = window.localStorage.getItem(getFallbackKey(language)) ?? window.localStorage.getItem(FALLBACK_KEY_PREFIX);
    return raw ? normalizeDocument(JSON.parse(raw), language) : null;
  } catch {
    return null;
  }
}

function writeFallbackDocument(language, documentState) {
  try {
    window.localStorage.setItem(getFallbackKey(language), JSON.stringify(documentState));
  } catch {
    // Best-effort fallback only.
  }
}

export async function migrateLegacyInfoEditorData(language = 'ru') {
  const legacyContent = window.localStorage.getItem(LEGACY_CONTENT_KEY);
  const legacySettings = window.localStorage.getItem(LEGACY_SETTINGS_KEY);

  if (!legacyContent && !legacySettings) {
    return createDefaultInfoEditorDocument(language);
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
    contentHtml: legacyContent || getDefaultInfoEditorHtml(language),
    paperSettings: parsedSettings,
    overlays: [],
    updatedAt: new Date().toISOString(),
  }, language);
}

export async function loadInfoEditorDocument(language = 'ru') {
  const defaultDocument = createDefaultInfoEditorDocument(language);

  try {
    const stored = await transactionRequest(STORE_NAME, 'readonly', (store) => store.get(getDocumentKey(language)));
    if (stored) {
      return normalizeDocument(stored, language);
    }
  } catch {
    const fallback = readFallbackDocument(language);
    if (fallback) {
      return fallback;
    }
  }

  try {
    const legacyDocument = await transactionRequest(STORE_NAME, 'readonly', (store) => store.get(LEGACY_DOCUMENT_KEY));
    if (legacyDocument) {
      const normalized = normalizeDocument(legacyDocument, language);
      await saveInfoEditorDocument(normalized, language);
      return normalized;
    }
  } catch {
    const fallback = readFallbackDocument(language);
    if (fallback) {
      return fallback;
    }
  }

  const migrated = await migrateLegacyInfoEditorData(language);
  await saveInfoEditorDocument(migrated, language);
  return migrated ?? defaultDocument;
}

export async function saveInfoEditorDocument(documentState, language = 'ru') {
  const normalized = normalizeDocument(documentState, language);
  writeFallbackDocument(language, normalized);

  try {
    await transactionRequest(STORE_NAME, 'readwrite', (store) => store.put(normalized, getDocumentKey(language)));
  } catch {
    // Keep the fallback localStorage copy if IndexedDB is unavailable.
  }

  return normalized;
}
