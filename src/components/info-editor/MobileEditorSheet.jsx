import React, { useMemo, useRef } from 'react';
import { useLanguage } from '../../i18n/LanguageProvider';

const tabs = ['text', 'style', 'paper', 'insert'];
const paperControls = [
  { key: 'brightness', labelKey: 'brightness', min: 82, max: 100, step: 1 },
  { key: 'grain', labelKey: 'grain', min: 0, max: 30, step: 1 },
  { key: 'dirt', labelKey: 'dirt', min: 0, max: 28, step: 1 },
  { key: 'creases', labelKey: 'creases', min: 0, max: 40, step: 1 },
  { key: 'vignette', labelKey: 'vignette', min: 0, max: 24, step: 1 },
  { key: 'inkFade', labelKey: 'inkFade', min: 0, max: 45, step: 1 },
  { key: 'inkBleed', labelKey: 'inkBleed', min: 0, max: 35, step: 1 },
  { key: 'textScale', labelKey: 'textScale', min: 0.85, max: 1.25, step: 0.01 },
];

const MobileEditorSheet = ({
  activeTab,
  canUndo,
  canRedo,
  saveStatusLabel,
  selectionState,
  paperSettings,
  overlays,
  activeOverlayId,
  activeOverlay,
  onTabChange,
  onUndo,
  onRedo,
  onClearMarks,
  onToggleMark,
  onPaperSettingChange,
  onOpenUpload,
  onRemoveOverlay,
  onSelectOverlay,
  onOverlayChange,
}) => {
  const { t } = useLanguage();
  const touchStartRef = useRef(null);
  const activeTabIndex = useMemo(() => Math.max(0, tabs.findIndex((tab) => tab === activeTab)), [activeTab]);
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

    onTabChange(tabs[nextIndex]);
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
              className={activeTab === tab ? 'active' : ''}
              onClick={() => onTabChange(tab)}
            >
              {t(`info.editor.tabs.${tab}`)}
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
              <button type="button" onMouseDown={preserveEditorSelection} onClick={onUndo} disabled={!canUndo}>{t('info.editor.actions.undo')}</button>
              <button type="button" onMouseDown={preserveEditorSelection} onClick={onRedo} disabled={!canRedo}>{t('info.editor.actions.redo')}</button>
              <button type="button" onMouseDown={preserveEditorSelection} onClick={onClearMarks}>{t('info.editor.actions.plain')}</button>
              <button
                type="button"
                onMouseDown={preserveEditorSelection}
                onClick={() => onToggleMark('faded')}
                className={selectionState.faded ? 'active' : ''}
              >
                {t('info.editor.actions.burnt')}
              </button>
              <button
                type="button"
                onMouseDown={preserveEditorSelection}
                onClick={() => onToggleMark('handwriting')}
                className={selectionState.handwriting ? 'active handwriting-btn' : 'handwriting-btn'}
              >
                {t('info.editor.actions.scribble')}
              </button>
              <button
                type="button"
                onMouseDown={preserveEditorSelection}
                onClick={() => onToggleMark('marker')}
                className={selectionState.marker ? 'active redact-btn' : 'redact-btn'}
              >
                {t('info.editor.actions.marker')}
              </button>
            </div>
          </section>

          <section className="mobile-editor-sheet__panel">
            <div className="selection-summary mobile">
              <span>{selectionState.hasSelection ? t('info.editor.selection.selected') : t('info.editor.selection.idle')}</span>
              <span>
                {selectionState.marker
                  ? t('info.editor.selection.marker')
                  : selectionState.faded
                    ? t('info.editor.selection.faded')
                    : selectionState.handwriting
                      ? t('info.editor.selection.handwriting')
                      : t('info.editor.selection.plain')}
              </span>
            </div>
          </section>

          <section className="mobile-editor-sheet__panel">
            <div className="editor-control-grid mobile">
              {paperControls.map((control) => (
                <label key={control.key} className="editor-range">
                  <span>{t(`info.editor.controls.${control.labelKey}`)}</span>
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
              <button type="button" onClick={onOpenUpload}>{t('info.editor.actions.addPng')}</button>
              <button type="button" onClick={onRemoveOverlay} disabled={!activeOverlay}>{t('info.editor.actions.removeSelected')}</button>
            </div>
            <div className="editor-overlay-list mobile">
              {overlays.length ? overlays.map((overlay, index) => (
                <button
                  key={overlay.id}
                  type="button"
                  className={overlay.id === activeOverlayId ? 'active' : ''}
                  onClick={() => onSelectOverlay(overlay.id)}
                >
                  {t('info.editor.overlays.note', { index: index + 1 })}
                </button>
              )) : <span className="editor-empty-note">{t('info.editor.overlays.empty')}</span>}
            </div>
            <div className="editor-control-grid mobile">
              <label className="editor-range">
                <span>{t('info.editor.controls.opacity')}</span>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.01"
                  value={activeOverlay?.opacity ?? 0.92}
                  disabled={!activeOverlay}
                  onChange={(event) => onOverlayChange({ opacity: Number(event.target.value) })}
                />
              </label>
              <label className="editor-range">
                <span>{t('info.editor.controls.size')}</span>
                <input
                  type="range"
                  min="12"
                  max="42"
                  step="1"
                  value={activeOverlay?.widthPct ?? 24}
                  disabled={!activeOverlay}
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
