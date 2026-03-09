import React from 'react';
import { useLanguage } from '../../i18n/LanguageProvider';

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

const EditorToolbar = ({
  canUndo,
  canRedo,
  saveStatusLabel,
  selectionState,
  paperSettings,
  overlays,
  activeOverlayId,
  activeOverlay,
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
  const preserveEditorSelection = (event) => {
    event.preventDefault();
  };

  return (
    <div className="editor-toolbar desktop-only">
      <section className="editor-panel editor-panel--text">
        <div className="editor-panel__heading">
          <span>{t('info.editor.tabs.text')}</span>
          <span className="editor-status">{saveStatusLabel}</span>
        </div>
        <div className="editor-action-row">
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

      <section className="editor-panel editor-panel--style">
        <div className="editor-panel__heading">
          <span>{t('info.editor.tabs.style')}</span>
        </div>
        <div className="selection-summary">
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

      <section className="editor-panel editor-panel--paper">
        <div className="editor-panel__heading">
          <span>{t('info.editor.tabs.paper')}</span>
        </div>
        <div className="editor-control-grid">
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

      <section className="editor-panel editor-panel--insert">
        <div className="editor-panel__heading">
          <span>{t('info.editor.overlays.title')}</span>
        </div>
        <div className="editor-action-row">
          <button type="button" onClick={onOpenUpload}>{t('info.editor.actions.addPng')}</button>
          <button type="button" onClick={onRemoveOverlay} disabled={!activeOverlay}>{t('info.editor.actions.removeSelected')}</button>
        </div>
        <div className="editor-overlay-list">
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
        <div className="editor-control-grid">
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
  );
};

export default EditorToolbar;
