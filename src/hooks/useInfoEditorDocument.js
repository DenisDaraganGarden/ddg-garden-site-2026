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

export function useInfoEditorDocument() {
  const [state, setState] = useState({
    loaded: false,
    documentState: createDefaultInfoEditorDocument(),
    history: [],
    historyIndex: -1,
    saveStatus: 'loading',
  });
  const saveTimeoutRef = useRef(null);
  const saveSequenceRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    loadInfoEditorDocument().then((documentState) => {
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
  }, []);

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
      const savedDocument = await saveInfoEditorDocument(documentSnapshot);
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
  }, [state.documentState, state.loaded, state.saveStatus]);

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

  const setOverlayAsset = useCallback(async (file) => {
    const dataUrl = await fileToDataUrl(file);

    updateDocument((previous) => ({
      ...previous,
      overlays: [
        {
          id: previous.overlays[0]?.id ?? crypto.randomUUID(),
          kind: 'png',
          name: file.name,
          src: dataUrl,
          xPct: previous.overlays[0]?.xPct ?? 18,
          yPct: previous.overlays[0]?.yPct ?? 72,
          widthPct: previous.overlays[0]?.widthPct ?? 24,
          opacity: previous.overlays[0]?.opacity ?? 0.92,
        },
      ],
    }));
  }, [updateDocument]);

  const updateOverlayAsset = useCallback((patch) => {
    updateDocument((previous) => {
      if (!previous.overlays.length) {
        return previous;
      }

      return {
        ...previous,
        overlays: [
          {
            ...previous.overlays[0],
            ...patch,
          },
        ],
      };
    });
  }, [updateDocument]);

  const removeOverlayAsset = useCallback(() => {
    updateDocument((previous) => ({
      ...previous,
      overlays: [],
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

  const statusLabel = useMemo(() => {
    if (state.saveStatus === 'saving') {
      return 'Saving...';
    }

    if (state.saveStatus === 'saved') {
      return 'Saved';
    }

    if (state.saveStatus === 'dirty') {
      return 'Unsaved changes';
    }

    return 'Loading...';
  }, [state.saveStatus]);

  return {
    loaded: state.loaded,
    documentState: state.documentState,
    saveStatus: state.saveStatus,
    saveStatusLabel: statusLabel,
    canUndo: state.historyIndex > 0,
    canRedo: state.historyIndex < state.history.length - 1,
    setContentHtml,
    updatePaperSetting,
    setOverlayAsset,
    updateOverlayAsset,
    removeOverlayAsset,
    undo,
    redo,
  };
}
