import React from 'react';

const paperControls = [
  { key: 'brightness', label: 'Brightness', min: 70, max: 100, step: 1 },
  { key: 'grain', label: 'Grain', min: 0, max: 25, step: 1 },
  { key: 'dirt', label: 'Dirt', min: 0, max: 50, step: 1 },
  { key: 'creases', label: 'Creases', min: 0, max: 50, step: 1 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 50, step: 1 },
  { key: 'tone', label: 'Tone', min: -20, max: 20, step: 1 },
  { key: 'textScale', label: 'Text Scale', min: 0.85, max: 1.25, step: 0.01 },
];

const EditorToolbar = ({
  canUndo,
  canRedo,
  saveStatusLabel,
  selectionState,
  paperSettings,
  overlay,
  onUndo,
  onRedo,
  onClearMarks,
  onToggleMark,
  onPaperSettingChange,
  onOpenUpload,
  onRemoveOverlay,
  onOverlayChange,
}) => {
  const preserveEditorSelection = (event) => {
    event.preventDefault();
  };

  return (
    <div className="editor-toolbar desktop-only">
      <section className="editor-panel editor-panel--text">
        <div className="editor-panel__heading">
          <span>Text</span>
          <span className="editor-status">{saveStatusLabel}</span>
        </div>
        <div className="editor-action-row">
          <button type="button" onMouseDown={preserveEditorSelection} onClick={onUndo} disabled={!canUndo}>Undo</button>
          <button type="button" onMouseDown={preserveEditorSelection} onClick={onRedo} disabled={!canRedo}>Redo</button>
          <button type="button" onMouseDown={preserveEditorSelection} onClick={onClearMarks}>Plain</button>
          <button
            type="button"
            onMouseDown={preserveEditorSelection}
            onClick={() => onToggleMark('handwriting')}
            className={selectionState.handwriting ? 'active handwriting-btn' : 'handwriting-btn'}
          >
            Handwriting
          </button>
          <button
            type="button"
            onMouseDown={preserveEditorSelection}
            onClick={() => onToggleMark('marker')}
            className={selectionState.marker ? 'active redact-btn' : 'redact-btn'}
          >
            Black Marker
          </button>
        </div>
      </section>

      <section className="editor-panel editor-panel--style">
        <div className="editor-panel__heading">
          <span>Selection</span>
        </div>
        <div className="selection-summary">
          <span>{selectionState.hasSelection ? 'Text selected' : 'Place cursor or select text'}</span>
          <span>{selectionState.handwriting ? 'Handwriting active' : selectionState.marker ? 'Black marker active' : 'Plain text active'}</span>
        </div>
      </section>

      <section className="editor-panel editor-panel--paper">
        <div className="editor-panel__heading">
          <span>Paper</span>
        </div>
        <div className="editor-control-grid">
          {paperControls.map((control) => (
            <label key={control.key} className="editor-range">
              <span>{control.label}</span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={paperSettings[control.key]}
                onChange={(event) => onPaperSettingChange(control.key, Number(event.target.value))}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="editor-panel editor-panel--insert">
        <div className="editor-panel__heading">
          <span>Insert</span>
        </div>
        <div className="editor-action-row">
          <button type="button" onClick={onOpenUpload}>{overlay ? 'Replace PNG' : 'Upload PNG'}</button>
          <button type="button" onClick={onRemoveOverlay} disabled={!overlay}>Remove PNG</button>
        </div>
        <div className="editor-control-grid">
          <label className="editor-range">
            <span>Opacity</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.01"
              value={overlay?.opacity ?? 0.92}
              disabled={!overlay}
              onChange={(event) => onOverlayChange({ opacity: Number(event.target.value) })}
            />
          </label>
          <label className="editor-range">
            <span>Size</span>
            <input
              type="range"
              min="12"
              max="42"
              step="1"
              value={overlay?.widthPct ?? 24}
              disabled={!overlay}
              onChange={(event) => onOverlayChange({ widthPct: Number(event.target.value) })}
            />
          </label>
        </div>
      </section>
    </div>
  );
};

export default EditorToolbar;
