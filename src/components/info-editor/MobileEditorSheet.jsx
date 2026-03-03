import React, { useMemo, useRef } from 'react';

const tabs = ['Text', 'Style', 'Paper', 'Insert'];
const paperControls = [
  { key: 'brightness', label: 'Brightness', min: 70, max: 100, step: 1 },
  { key: 'grain', label: 'Grain', min: 0, max: 25, step: 1 },
  { key: 'dirt', label: 'Dirt', min: 0, max: 50, step: 1 },
  { key: 'creases', label: 'Creases', min: 0, max: 50, step: 1 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 50, step: 1 },
  { key: 'tone', label: 'Tone', min: -20, max: 20, step: 1 },
  { key: 'textScale', label: 'Text Scale', min: 0.85, max: 1.25, step: 0.01 },
];

const MobileEditorSheet = ({
  activeTab,
  canUndo,
  canRedo,
  saveStatusLabel,
  selectionState,
  paperSettings,
  overlay,
  onTabChange,
  onUndo,
  onRedo,
  onClearMarks,
  onToggleMark,
  onPaperSettingChange,
  onOpenUpload,
  onRemoveOverlay,
  onOverlayChange,
}) => {
  const touchStartRef = useRef(null);
  const activeTabIndex = useMemo(() => Math.max(0, tabs.findIndex((tab) => tab.toLowerCase() === activeTab)), [activeTab]);
  const preserveEditorSelection = (event) => {
    event.preventDefault();
  };

  const handleTouchStart = (event) => {
    touchStartRef.current = event.changedTouches[0].clientX;
  };

  const handleTouchEnd = (event) => {
    if (touchStartRef.current == null) {
      return;
    }

    const delta = event.changedTouches[0].clientX - touchStartRef.current;
    touchStartRef.current = null;

    if (Math.abs(delta) < 45) {
      return;
    }

    const nextIndex = delta < 0
      ? Math.min(tabs.length - 1, activeTabIndex + 1)
      : Math.max(0, activeTabIndex - 1);

    onTabChange(tabs[nextIndex].toLowerCase());
  };

  return (
    <div className="mobile-editor-sheet mobile-only">
      <div className="mobile-editor-sheet__header">
        <span className="editor-status">{saveStatusLabel}</span>
        <div className="mobile-editor-sheet__tabs">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab.toLowerCase() ? 'active' : ''}
              onClick={() => onTabChange(tab.toLowerCase())}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div
        className="mobile-editor-sheet__viewport"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="mobile-editor-sheet__track"
          style={{ transform: `translateX(-${activeTabIndex * 100}%)` }}
        >
          <section className="mobile-editor-sheet__panel">
            <div className="editor-action-stack">
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

          <section className="mobile-editor-sheet__panel">
            <div className="selection-summary mobile">
              <span>{selectionState.hasSelection ? 'Text selected' : 'Place cursor or select text'}</span>
              <span>{selectionState.handwriting ? 'Handwriting active' : selectionState.marker ? 'Black marker active' : 'Plain text active'}</span>
            </div>
          </section>

          <section className="mobile-editor-sheet__panel">
            <div className="editor-control-grid mobile">
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

          <section className="mobile-editor-sheet__panel">
            <div className="editor-action-stack">
              <button type="button" onClick={onOpenUpload}>{overlay ? 'Replace PNG' : 'Upload PNG'}</button>
              <button type="button" onClick={onRemoveOverlay} disabled={!overlay}>Remove PNG</button>
            </div>
            <div className="editor-control-grid mobile">
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
      </div>
    </div>
  );
};

export default MobileEditorSheet;
