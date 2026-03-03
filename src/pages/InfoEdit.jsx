import React, { useEffect, useRef, useState } from 'react';
import EditorToolbar from '../components/info-editor/EditorToolbar';
import MobileEditorSheet from '../components/info-editor/MobileEditorSheet';
import PaperOverlayLayer from '../components/info-editor/PaperOverlayLayer';
import { useInfoEditorDocument } from '../hooks/useInfoEditorDocument';
import { normalizeEditorRoot } from '../lib/infoEditorHtml';
import { clearMarks, getEditorSelectionState, insertPlainText, normalizeEditorWithSelection, toggleMark } from '../lib/infoEditorSelection';
import '../styles/CIAEditor.css';

const EMPTY_SELECTION_STATE = {
  handwriting: false,
  marker: false,
  hasSelection: false,
  isCollapsed: true,
};

function paperStyleVars(settings) {
  return {
    '--paper-brightness': `${settings.brightness}%`,
    '--paper-noise': `${settings.grain / 100}`,
    '--paper-vignette': `${settings.vignette / 100}`,
    '--paper-creases': `${settings.creases / 100}`,
    '--paper-dirt': `${settings.dirt / 100}`,
    '--paper-tone': `${settings.tone}`,
    '--text-scale': `${settings.textScale}`,
  };
}

const InfoEdit = () => {
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastRenderedHtmlRef = useRef('');
  const [selectionState, setSelectionState] = useState(EMPTY_SELECTION_STATE);
  const [activeTab, setActiveTab] = useState('text');
  const {
    loaded,
    documentState,
    saveStatusLabel,
    canUndo,
    canRedo,
    setContentHtml,
    updatePaperSetting,
    setOverlayAsset,
    updateOverlayAsset,
    removeOverlayAsset,
    undo,
    redo,
  } = useInfoEditorDocument();

  const refreshSelectionState = () => {
    if (!editorRef.current) {
      setSelectionState(EMPTY_SELECTION_STATE);
      return;
    }

    setSelectionState(getEditorSelectionState(editorRef.current));
  };

  const syncEditorToState = (pushHistory = true) => {
    if (!editorRef.current) {
      return;
    }

    normalizeEditorWithSelection(editorRef.current);
    const nextHtml = editorRef.current.innerHTML;
    lastRenderedHtmlRef.current = nextHtml;
    setContentHtml(nextHtml, { pushHistory });
    refreshSelectionState();
  };

  useEffect(() => {
    if (!loaded || !editorRef.current) {
      return;
    }

    if (lastRenderedHtmlRef.current === documentState.contentHtml && editorRef.current.innerHTML === documentState.contentHtml) {
      refreshSelectionState();
      return;
    }

    editorRef.current.innerHTML = documentState.contentHtml;
    normalizeEditorRoot(editorRef.current);
    lastRenderedHtmlRef.current = editorRef.current.innerHTML;
    refreshSelectionState();
  }, [documentState.contentHtml, loaded]);

  useEffect(() => {
    const handleSelectionChange = () => {
      if (!editorRef.current) {
        return;
      }

      const selection = window.getSelection();
      if (selection?.anchorNode && editorRef.current.contains(selection.anchorNode)) {
        refreshSelectionState();
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  const handleToggleMark = (mark) => {
    if (!editorRef.current) {
      return;
    }

    editorRef.current.focus();
    const didChange = toggleMark(editorRef.current, mark);
    if (didChange) {
      const nextHtml = editorRef.current.innerHTML;
      lastRenderedHtmlRef.current = nextHtml;
      setContentHtml(nextHtml);
      refreshSelectionState();
    }
  };

  const handleClearMarks = () => {
    if (!editorRef.current) {
      return;
    }

    editorRef.current.focus();
    const didChange = clearMarks(editorRef.current);
    if (didChange) {
      const nextHtml = editorRef.current.innerHTML;
      lastRenderedHtmlRef.current = nextHtml;
      setContentHtml(nextHtml);
      refreshSelectionState();
    }
  };

  const handlePaste = (event) => {
    if (!editorRef.current) {
      return;
    }

    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    if (insertPlainText(editorRef.current, text)) {
      const nextHtml = editorRef.current.innerHTML;
      lastRenderedHtmlRef.current = nextHtml;
      setContentHtml(nextHtml);
      refreshSelectionState();
    }
  };

  const handleUploadChange = async (event) => {
    const [file] = event.target.files ?? [];
    if (!file) {
      return;
    }

    await setOverlayAsset(file);
    event.target.value = '';
  };

  const handleOverlayChange = (patch) => {
    updateOverlayAsset(patch);
  };

  const handleKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
    }
  };

  if (!loaded) {
    return <div className="editor-loading">Loading editor...</div>;
  }

  return (
    <div className="cia-editor-container info-editor-page fade-in">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png"
        hidden
        onChange={handleUploadChange}
      />

      <EditorToolbar
        canUndo={canUndo}
        canRedo={canRedo}
        saveStatusLabel={saveStatusLabel}
        selectionState={selectionState}
        paperSettings={documentState.paperSettings}
        overlay={documentState.overlays[0]}
        onUndo={undo}
        onRedo={redo}
        onClearMarks={handleClearMarks}
        onToggleMark={handleToggleMark}
        onPaperSettingChange={updatePaperSetting}
        onOpenUpload={() => fileInputRef.current?.click()}
        onRemoveOverlay={removeOverlayAsset}
        onOverlayChange={handleOverlayChange}
      />

      <div className="paper-wrapper editor-paper-wrapper">
        <div className="paper-container info-paper-container" style={paperStyleVars(documentState.paperSettings)}>
          <div
            ref={editorRef}
            className="a4-paper info-editor-surface"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            onInput={() => syncEditorToState(true)}
            onBlur={() => syncEditorToState(true)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onMouseUp={refreshSelectionState}
            onKeyUp={refreshSelectionState}
          />
          <div className="paper-overlay paper-creases" />
          <div className="paper-overlay paper-dirt" />
          <div className="paper-overlay paper-noise" />
          <PaperOverlayLayer
            overlays={documentState.overlays}
            editable
            onUpdateOverlay={handleOverlayChange}
          />
        </div>
      </div>

      <MobileEditorSheet
        activeTab={activeTab}
        canUndo={canUndo}
        canRedo={canRedo}
        saveStatusLabel={saveStatusLabel}
        selectionState={selectionState}
        paperSettings={documentState.paperSettings}
        overlay={documentState.overlays[0]}
        onTabChange={setActiveTab}
        onUndo={undo}
        onRedo={redo}
        onClearMarks={handleClearMarks}
        onToggleMark={handleToggleMark}
        onPaperSettingChange={updatePaperSetting}
        onOpenUpload={() => fileInputRef.current?.click()}
        onRemoveOverlay={removeOverlayAsset}
        onOverlayChange={handleOverlayChange}
      />
    </div>
  );
};

export default InfoEdit;
