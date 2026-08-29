import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import {
    CheckboxControl,
    RangeControl,
    SelectControl,
} from '../../HomeEditorControls';
import { formatFloat } from '../editorShared';
import { HOME_SCENE_DEBUG_VIEWS } from '../../../hooks/useHomeSceneSettings';
import {
    getLayoutVisibleAspect,
    LAYOUT_KEYS,
    resolveLayout,
    resolveLayoutFrameInset,
} from '../../../lib/layout';

const LAYOUT_LABEL_KEYS = {
    portrait: 'homeEditor.controls.layoutPortrait',
    desktop: 'homeEditor.controls.layoutDesktop',
};

export const CameraSection = ({ settings, layoutEditor }) => {
    const { t } = useLanguage();

    if (!layoutEditor) {
        return null;
    }

    const {
        selectedKey,
        setSelectedKey,
        currentKey,
        layouts,
        captureLayout,
        resetLayout,
        onFovChange,
        onFrameInsetChange,
    } = layoutEditor;
    const effective = resolveLayout(layouts, selectedKey) ?? {};
    const frameInset = resolveLayoutFrameInset(layouts, selectedKey);
    const visibleAspect = getLayoutVisibleAspect(selectedKey, frameInset);
    const isCustomized = Boolean(layouts?.[selectedKey]?.customized);
    const buckets = LAYOUT_KEYS;

    return (
        <>
            <p className="home-editor-inline-hint">{t('homeEditor.controls.layoutHint')}</p>
            <div className="home-editor-control-group">
                <label>{t('homeEditor.controls.layoutBucket')}</label>
                <div className="home-editor-layout-tabs">
                    {buckets.map((key) => (
                        <button
                            key={key}
                            type="button"
                            className={`home-editor-layout-tab ${selectedKey === key ? 'active' : ''}`}
                            onClick={() => setSelectedKey(key)}
                        >
                            {t(LAYOUT_LABEL_KEYS[key])}
                            {currentKey === key ? ' •' : ''}
                        </button>
                    ))}
                </div>
                <span className="home-editor-camera-pose-status">
                    {isCustomized
                        ? t('homeEditor.controls.layoutStatusSet')
                        : t('homeEditor.controls.layoutStatusAuto')}
                    {currentKey === selectedKey ? ` · ${t('homeEditor.controls.layoutIsCurrent')}` : ''}
                </span>
            </div>
            <RangeControl
                label={t('homeEditor.controls.cameraFov')}
                value={effective.cameraFov ?? settings.cameraFov}
                min={24}
                max={75}
                step={1}
                unit="°"
                onChange={(event) => onFovChange(parseInt(event.target.value, 10))}
            />
            <RangeControl
                label={t('homeEditor.controls.frameInset')}
                value={frameInset * 100}
                min={0}
                max={32}
                step={0.5}
                unit="%"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => onFrameInsetChange(parseFloat(event.target.value) / 100)}
            />
            <p className="home-editor-inline-hint">
                {t('homeEditor.controls.frameVisibleAspect', { aspect: visibleAspect.toFixed(2) })}
            </p>
            <div className="home-editor-camera-actions">
                <button
                    type="button"
                    className="home-editor-action-button"
                    onClick={() => captureLayout(selectedKey)}
                >
                    {t('homeEditor.controls.layoutCapture')}
                </button>
                <button
                    type="button"
                    className="home-editor-action-button"
                    onClick={() => resetLayout(selectedKey)}
                    disabled={!isCustomized}
                >
                    {t('homeEditor.controls.layoutReset')}
                </button>
            </div>
        </>
    );
};

export const ResolutionSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <RangeControl
                label={t('homeEditor.controls.renderScale')}
                value={settings.renderScale}
                min={0.5}
                max={2}
                step={0.05}
                unit="x"
                formatValue={(value) => formatFloat(value, 2)}
                onChange={(event) => handleSettingChange(event, 'renderScale')}
            />

        </>
    );
};

export const PostSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <CheckboxControl
                label={t('homeEditor.controls.postProcessingEnabled')}
                checked={Boolean(settings.postProcessingEnabled)}
                onChange={(event) => handleSettingChange(event, 'postProcessingEnabled', 'boolean')}
            />

            <CheckboxControl
                label={t('homeEditor.controls.filmGrainEnabled')}
                checked={Boolean(settings.filmGrainEnabled)}
                onChange={(event) => handleSettingChange(event, 'filmGrainEnabled', 'boolean')}
            />
            <RangeControl
                label={t('homeEditor.controls.filmGrainIntensity')}
                value={settings.filmGrainIntensity}
                min={0}
                max={0.25}
                step={0.001}
                formatValue={(value) => formatFloat(value, 3)}
                onChange={(event) => handleSettingChange(event, 'filmGrainIntensity')}
            />
            <RangeControl
                label={t('homeEditor.controls.filmGrainSize')}
                value={settings.filmGrainSize}
                min={0.35}
                max={4}
                step={0.05}
                unit="px"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'filmGrainSize')}
            />
            <RangeControl
                label={t('homeEditor.controls.filmGrainSpeed')}
                value={settings.filmGrainSpeed}
                min={0}
                max={3}
                step={0.05}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'filmGrainSpeed')}
            />

            <CheckboxControl
                label={t('homeEditor.controls.bloomEnabled')}
                checked={Boolean(settings.bloomEnabled)}
                onChange={(event) => handleSettingChange(event, 'bloomEnabled', 'boolean')}
            />
            <RangeControl
                label={t('homeEditor.controls.bloomStrength')}
                value={settings.bloomStrength}
                min={0}
                max={2.5}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'bloomStrength')}
            />
            <RangeControl
                label={t('homeEditor.controls.bloomThreshold')}
                value={settings.bloomThreshold}
                min={0}
                max={2}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'bloomThreshold')}
            />
            <RangeControl
                label={t('homeEditor.controls.bloomRadius')}
                value={settings.bloomRadius}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'bloomRadius')}
            />

            <RangeControl
                label={t('homeEditor.controls.colorExposure')}
                value={settings.colorExposure}
                min={-3}
                max={3}
                step={0.05}
                unit="EV"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'colorExposure')}
            />

            <RangeControl
                label={t('homeEditor.controls.colorContrast')}
                value={settings.colorContrast}
                min={0}
                max={2}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'colorContrast')}
            />
            <RangeControl
                label={t('homeEditor.controls.colorSaturation')}
                value={settings.colorSaturation}
                min={0}
                max={2}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'colorSaturation')}
            />
            <RangeControl
                label={t('homeEditor.controls.colorGamma')}
                value={settings.colorGamma}
                min={0.35}
                max={2.5}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'colorGamma')}
            />
            <RangeControl
                label={t('homeEditor.controls.colorHue')}
                value={settings.colorHue}
                min={-180}
                max={180}
                step={1}
                unit="°"
                onChange={(event) => handleSettingChange(event, 'colorHue')}
            />
        </>
    );
};

export const DebugSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <CheckboxControl
                label={t('homeEditor.controls.showPerformanceHud')}
                checked={Boolean(settings.showPerformanceHud)}
                onChange={(event) => handleSettingChange(event, 'showPerformanceHud', 'boolean')}
            />
            <SelectControl
                label={t('homeEditor.controls.debugView')}
                value={settings.debugView}
                options={HOME_SCENE_DEBUG_VIEWS}
                onChange={(event) => handleSettingChange(event, 'debugView', 'string')}
            />
        </>
    );
};
