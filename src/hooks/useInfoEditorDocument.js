import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDefaultInfoEditorDocument } from '../lib/infoEditorHtml';
import { loadInfoEditorDocument, saveInfoEditorDocument } from '../lib/infoEditorStorage';

const MAX_HISTORY = 50;

function comparableDocument(documentState) {
  const { updatedAt, ...rest } = documentState ?? {};
  return JSON.stringify(rest);
}

function pushHistory(history, historyIndex, nextDocument) {
  const baseHistory = history.slice(0, historyIndex + 1);
  const previous = baseHistory[baseHistory.length - 1];
  if (previous && comparableDocument(previous) === comparableDocument(nextDocument)) {
    return { history: baseHistory, historyIndex: baseHistory.length - 1 };
  }

  const nextHistory = [...baseHistory, nextDocument].slice(-MAX_HISTORY);
  return {
    history: nextHistory,
    historyIndex: nextHistory.length - 1,
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function normalizeOverlayForInsert(existingOverlays, file, dataUrl, offset = 0) {
  const index = existingOverlays.length + offset;

  return {
    id: crypto.randomUUID(),
    kind: 'png',
    name: file.name,
    src: dataUrl,
    xPct: 12 + Math.min(index * 6, 40),
    yPct: 8 + Math.min(index * 7, 56),
    widthPct: Math.max(12, 22 - Math.min(index * 1.5, 8)),
    opacity: 0.92,
  };
}

export function useInfoEditorDocument(language) {
  const [state, setState] = useState({
    loaded: false,
    documentState: createDefaultInfoEditorDocument(language),
    history: [],
    historyIndex: -1,
    saveStatus: 'loading',
  });
  const saveTimeoutRef = useRef(null);
  const saveSequenceRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    setState({
      loaded: false,
      documentState: createDefaultInfoEditorDocument(language),
      history: [],
      historyIndex: -1,
      saveStatus: 'loading',
    });

    loadInfoEditorDocument(language).then((documentState) => {
      if (cancelled) {
        return;
      }

      setState({
        loaded: true,
        documentState,
        history: [documentState],
        historyIndex: 0,
        saveStatus: 'saved',
      });
    });

    return () => {
      cancelled = true;
    };
  }, [language]);

  const updateDocument = useCallback((updater, options = {}) => {
    const { pushToHistory = options.pushHistory ?? true } = options;

    setState((previous) => {
      const nextDocument = {
        ...(typeof updater === 'function' ? updater(previous.documentState) : updater),
        updatedAt: new Date().toISOString(),
      };

      if (comparableDocument(previous.documentState) === comparableDocument(nextDocument)) {
        return previous;
      }

      const historyState = pushToHistory
        ? pushHistory(previous.history, previous.historyIndex, nextDocument)
        : { history: previous.history, historyIndex: previous.historyIndex };

      return {
        ...previous,
        documentState: nextDocument,
        history: historyState.history,
        historyIndex: historyState.historyIndex,
        saveStatus: previous.loaded ? 'dirty' : previous.saveStatus,
      };
    });
  }, []);

  useEffect(() => {
    if (!state.loaded || state.saveStatus !== 'dirty') {
      return undefined;
    }

    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const saveSequence = saveSequenceRef.current + 1;
      saveSequenceRef.current = saveSequence;
      const documentSnapshot = state.documentState;

      setState((previous) => ({ ...previous, saveStatus: 'saving' }));
      const savedDocument = await saveInfoEditorDocument(documentSnapshot, language);
      setState((previous) => {
        if (saveSequenceRef.current !== saveSequence || comparableDocument(previous.documentState) !== comparableDocument(documentSnapshot)) {
          return previous;
        }

        return {
          ...previous,
          documentState: savedDocument,
          history: previous.history.map((snapshot, index) => (index === previous.historyIndex ? savedDocument : snapshot)),
          saveStatus: 'saved',
        };
      });
    }, 500);

    return () => {
      clearTimeout(saveTimeoutRef.current);
    };
  }, [language, state.documentState, state.loaded, state.saveStatus]);

  const setContentHtml = useCallback((contentHtml, options) => {
    updateDocument((previous) => ({ ...previous, contentHtml }), options);
  }, [updateDocument]);

  const updatePaperSetting = useCallback((key, value) => {
    updateDocument((previous) => ({
      ...previous,
      paperSettings: {
        ...previous.paperSettings,
        [key]: value,
      },
    }));
  }, [updateDocument]);

  const addOverlayAssets = useCallback(async (files) => {
    const nextFiles = Array.from(files ?? []).filter(Boolean);
    if (!nextFiles.length) {
      return;
    }

    const assets = await Promise.all(
      nextFiles.map(async (file) => ({
        file,
        dataUrl: await fileToDataUrl(file),
      })),
    );

    updateDocument((previous) => ({
        ...previous,
        overlays: [
          ...previous.overlays,
          ...assets.map(({ file, dataUrl }, index) => normalizeOverlayForInsert(previous.overlays, file, dataUrl, index)),
        ],
      }));
  }, [updateDocument]);

  const updateOverlayAsset = useCallback((overlayId, patch) => {
    updateDocument((previous) => {
      if (!previous.overlays.length) {
        return previous;
      }

      return {
        ...previous,
        overlays: previous.overlays.map((overlay) => (
          overlay.id === overlayId
            ? {
                ...overlay,
                ...patch,
              }
            : overlay
        )),
      };
    });
  }, [updateDocument]);

  const removeOverlayAsset = useCallback((overlayId) => {
    updateDocument((previous) => ({
      ...previous,
      overlays: previous.overlays.filter((overlay) => overlay.id !== overlayId),
    }));
  }, [updateDocument]);

  const undo = useCallback(() => {
    setState((previous) => {
      if (previous.historyIndex <= 0) {
        return previous;
      }

      return {
        ...previous,
        documentState: previous.history[previous.historyIndex - 1],
        historyIndex: previous.historyIndex - 1,
        saveStatus: 'dirty',
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((previous) => {
      if (previous.historyIndex >= previous.history.length - 1) {
        return previous;
      }

      return {
        ...previous,
        documentState: previous.history[previous.historyIndex + 1],
        historyIndex: previous.historyIndex + 1,
        saveStatus: 'dirty',
      };
    });
  }, []);

  return {
    loaded: state.loaded,
    documentState: state.documentState,
    saveStatus: state.saveStatus,
    canUndo: state.historyIndex > 0,
    canRedo: state.historyIndex < state.history.length - 1,
    setContentHtml,
    updatePaperSetting,
    addOverlayAssets,
    updateOverlayAsset,
    removeOverlayAsset,
    undo,
    redo,
  };
}
