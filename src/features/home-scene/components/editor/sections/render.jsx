import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import {
    CheckboxControl,
    RangeControl,
    SelectControl,
    SectionHeading,
} from '../../HomeEditorControls';
import { formatFloat } from '../editorShared';
import {
    HOME_SCENE_CAMERA_FOV_MAX,
    HOME_SCENE_CAMERA_FOV_MIN,
    HOME_SCENE_DEBUG_VIEWS,
    HOME_SCENE_FILM_STOCKS,
} from '../../../hooks/useHomeSceneSettings';
import {
    resolveLayout,
    resolveLayoutFrameInset,
} from '../../../lib/layout';

const LAYOUT_LABEL_KEYS = {
    portrait: 'homeEditor.controls.layoutPortrait',
    desktop: 'homeEditor.controls.layoutDesktop',
};

// The show flags. Shadows, post and sun rays already own a switch inside their
// own section - duplicating them here would put one value behind two checkboxes.
export const VisibilitySection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();
    const flags = [
        'waterVisible',
        'farWaterVisible',
        'skyVisible',
        'seabedVisible',
        'liliesVisible',
        'algaeVisible',
        'boatVisible',
        'sculptureVisible',
        'reflectionsEnabled',
    ];

    return (
        <>
            {flags.map((key) => (
                <CheckboxControl
                    key={key}
                    label={t(`homeEditor.controls.${key}`)}
                    checked={Boolean(settings[key])}
                    onChange={(event) => handleSettingChange(event, key, 'boolean')}
                />
            ))}
        </>
    );
};

export const CameraSection = ({ settings, layoutEditor }) => {
    const { t } = useLanguage();

    if (!layoutEditor) {
        return null;
    }

    const {
        cameras = [],
        activeCameraId,
        selectCamera,
        addCamera,
        removeCamera,
        moveCamera,
        renameCamera,
        setCameraEnabled,
        setCameraHoldSeconds,
        selectedKey,
        setSelectedKey,
        currentKey,
        currentScene,
        captureLayout,
        resetLayout,
        onFovChange,
        onFrameInsetChange,
        slideshow = {},
        updateSlideshow,
    } = layoutEditor;
    const activeCamera = cameras.find((camera) => camera.id === activeCameraId) ?? cameras[0];
    const layouts = currentScene?.layouts ?? activeCamera?.scene?.layouts ?? {};
    const effective = resolveLayout(layouts, selectedKey) ?? {};
    const frameInset = resolveLayoutFrameInset(layouts, selectedKey);
    const isCustomized = Boolean(layouts?.[selectedKey]?.customized);
    const fadeSeconds = slideshow.fadeSeconds ?? 1.2;

    return (
        <>
            <section className="home-editor-cameras" aria-label={t('homeEditor.controls.cameras')}>
                <div className="home-editor-cameras-header">
                    <span>{t('homeEditor.controls.cameras')}</span>
                    <button
                        type="button"
                        className="home-editor-camera-icon-button"
                        onClick={addCamera}
                        aria-label={t('homeEditor.controls.cameraAdd')}
                        data-testid="home-editor-camera-add"
                    >
                        +
                    </button>
                </div>
                <div className="home-editor-camera-list" data-testid="home-editor-camera-list">
                    {cameras.map((camera, index) => (
                        <div
                            key={camera.id}
                            className={`home-editor-camera-row ${camera.id === activeCamera?.id ? 'active' : ''}`}
                        >
                            <input
                                type="checkbox"
                                checked={Boolean(camera.enabled)}
                                onChange={(event) => setCameraEnabled(camera.id, event.target.checked)}
                                aria-label={t('homeEditor.controls.cameraEnabled')}
                                data-testid={`home-editor-camera-enabled-${camera.id}`}
                            />
                            <button
                                type="button"
                                className="home-editor-camera-select"
                                onClick={() => selectCamera(camera.id)}
                                aria-pressed={camera.id === activeCamera?.id}
                                data-testid={`home-editor-camera-select-${camera.id}`}
                            >
                                <span className="home-editor-camera-number">{String(index + 1).padStart(2, '0')}</span>
                            </button>
                            <input
                                type="text"
                                className="home-editor-camera-name"
                                value={camera.name ?? `${t('homeEditor.controls.camera')} ${index + 1}`}
                                onFocus={() => selectCamera(camera.id)}
                                onChange={(event) => renameCamera(camera.id, event.target.value)}
                                aria-label={t('homeEditor.controls.cameraName')}
                                data-testid={`home-editor-camera-name-${camera.id}`}
                            />
                            <label className="home-editor-camera-hold">
                                <input
                                    type="number"
                                    min="1"
                                    max="3600"
                                    step="0.5"
                                    value={camera.holdSeconds ?? 8}
                                    onFocus={() => selectCamera(camera.id)}
                                    onChange={(event) => setCameraHoldSeconds(camera.id, parseFloat(event.target.value) || 1)}
                                    aria-label={t('homeEditor.controls.cameraDuration')}
                                    data-testid={`home-editor-camera-duration-${camera.id}`}
                                />
                                <span>{t('homeEditor.controls.seconds')}</span>
                            </label>
                            <div className="home-editor-camera-row-actions">
                                <button
                                    type="button"
                                    className="home-editor-camera-icon-button"
                                    onClick={() => moveCamera(camera.id, -1)}
                                    disabled={index === 0}
                                    aria-label={t('homeEditor.controls.cameraMoveUp')}
                                    data-testid={`home-editor-camera-up-${camera.id}`}
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    className="home-editor-camera-icon-button"
                                    onClick={() => moveCamera(camera.id, 1)}
                                    disabled={index === cameras.length - 1}
                                    aria-label={t('homeEditor.controls.cameraMoveDown')}
                                    data-testid={`home-editor-camera-down-${camera.id}`}
                                >
                                    ↓
                                </button>
                                <button
                                    type="button"
                                    className="home-editor-camera-icon-button home-editor-camera-icon-button--danger"
                                    onClick={() => removeCamera(camera.id)}
                                    disabled={cameras.length <= 1}
                                    aria-label={t('homeEditor.controls.cameraDelete')}
                                    data-testid={`home-editor-camera-delete-${camera.id}`}
                                >
                                    ×
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
            <div className="home-editor-camera-variants" role="tablist" aria-label={t('homeEditor.controls.layoutBucket')}>
                {['desktop', 'portrait'].map((key) => (
                        <button
                            key={key}
                            type="button"
                            className={`home-editor-camera-variant ${selectedKey === key ? 'active' : ''}`}
                            onClick={() => setSelectedKey(key)}
                            role="tab"
                            aria-selected={selectedKey === key}
                            data-testid={`home-editor-camera-variant-${key}`}
                        >
                            {t(LAYOUT_LABEL_KEYS[key])}
                        </button>
                ))}
                {currentKey === selectedKey ? <span className="home-editor-camera-current" aria-label={t('homeEditor.controls.layoutIsCurrent')}>•</span> : null}
            </div>
            <RangeControl
                label={t('homeEditor.controls.cameraFov')}
                value={effective.cameraFov ?? settings.cameraFov}
                min={HOME_SCENE_CAMERA_FOV_MIN}
                max={HOME_SCENE_CAMERA_FOV_MAX}
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
            <div className="home-editor-camera-actions">
                <button
                    type="button"
                    className="home-editor-action-button"
                    onClick={() => captureLayout(selectedKey)}
                    data-testid="home-editor-camera-capture"
                >
                    {t('homeEditor.controls.layoutCapture')}
                </button>
                <button
                    type="button"
                    className="home-editor-action-button"
                    onClick={() => resetLayout(selectedKey)}
                    disabled={!isCustomized}
                    data-testid="home-editor-camera-reset"
                >
                    {t('homeEditor.controls.layoutReset')}
                </button>
            </div>
            <div className="home-editor-camera-playback">
                <label className="home-editor-camera-playback-toggle">
                    <input
                        type="checkbox"
                        checked={Boolean(slideshow.enabled)}
                        onChange={(event) => updateSlideshow({ enabled: event.target.checked })}
                        data-testid="home-editor-slideshow-enabled"
                    />
                    <span>{t('homeEditor.controls.slideshow')}</span>
                </label>
                <label>
                    <span>{t('homeEditor.controls.cameraFade')}</span>
                    <input
                        type="number"
                        min="0"
                        max="30"
                        step="0.1"
                        value={fadeSeconds}
                        onChange={(event) => updateSlideshow({ fadeSeconds: Math.max(0, parseFloat(event.target.value) || 0) })}
                        data-testid="home-editor-slideshow-fade"
                    />
                </label>
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
            <RangeControl
                label={t('homeEditor.controls.renderScaleMobile')}
                value={settings.renderScaleMobile}
                min={0.5}
                max={2}
                step={0.05}
                unit="x"
                formatValue={(value) => formatFloat(value, 2)}
                onChange={(event) => handleSettingChange(event, 'renderScaleMobile')}
            />
        </>
    );
};

export const PostSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();
    const filmStockOptions = HOME_SCENE_FILM_STOCKS.map(({ value }) => ({
        value,
        label: t(`homeEditor.filmStocks.${value}`),
    }));

    return (
        <>
            <SectionHeading label={t('homeEditor.blocks.post')} subtle />
            <CheckboxControl
                label={t('homeEditor.controls.postProcessingEnabled')}
                checked={Boolean(settings.postProcessingEnabled)}
                onChange={(event) => handleSettingChange(event, 'postProcessingEnabled', 'boolean')}
            />

            <SectionHeading label={t('homeEditor.blocks.film')} subtle />
            <CheckboxControl
                label={t('homeEditor.controls.filmEnabled')}
                checked={Boolean(settings.filmEnabled)}
                onChange={(event) => handleSettingChange(event, 'filmEnabled', 'boolean')}
                testId="home-editor-film-enabled"
            />
            <SelectControl
                label={t('homeEditor.controls.filmStock')}
                value={settings.filmStock}
                options={filmStockOptions}
                onChange={(event) => handleSettingChange(event, 'filmStock', 'string')}
                testId="home-editor-film-stock"
            />

            <SectionHeading label={t('homeEditor.blocks.filmGrain')} subtle />
            <RangeControl
                label={t('homeEditor.controls.filmGrainAmount')}
                value={settings.filmGrainAmount}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value, 2)}
                onChange={(event) => handleSettingChange(event, 'filmGrainAmount')}
                testId="home-editor-film-grain-amount"
            />
            <RangeControl
                label={t('homeEditor.controls.filmGrainSize')}
                value={settings.filmGrainSize}
                min={0.45}
                max={3}
                step={0.05}
                unit="px"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'filmGrainSize')}
                testId="home-editor-film-grain-size"
            />

            <SectionHeading label={t('homeEditor.blocks.filmDamage')} subtle />
            <RangeControl
                label={t('homeEditor.controls.filmDustAmount')}
                value={settings.filmDustAmount}
                min={0}
                max={1}
                step={0.005}
                formatValue={(value) => formatFloat(value, 3)}
                onChange={(event) => handleSettingChange(event, 'filmDustAmount')}
                testId="home-editor-film-dust-amount"
            />
            <RangeControl
                label={t('homeEditor.controls.filmScratchAmount')}
                value={settings.filmScratchAmount}
                min={0}
                max={1}
                step={0.005}
                formatValue={(value) => formatFloat(value, 3)}
                onChange={(event) => handleSettingChange(event, 'filmScratchAmount')}
                testId="home-editor-film-scratch-amount"
            />

            <SectionHeading label={t('homeEditor.blocks.filmMechanics')} subtle />
            <RangeControl
                label={t('homeEditor.controls.filmFlickerAmount')}
                value={settings.filmFlickerAmount}
                min={0}
                max={0.2}
                step={0.001}
                unit=" EV"
                formatValue={(value) => formatFloat(value, 3)}
                onChange={(event) => handleSettingChange(event, 'filmFlickerAmount')}
                testId="home-editor-film-flicker-amount"
            />
            <RangeControl
                label={t('homeEditor.controls.filmFlickerRate')}
                value={settings.filmFlickerRate}
                min={0.5}
                max={24}
                step={0.25}
                unit=" Hz"
                formatValue={(value) => formatFloat(value, 2)}
                onChange={(event) => handleSettingChange(event, 'filmFlickerRate')}
                testId="home-editor-film-flicker-rate"
            />
            <RangeControl
                label={t('homeEditor.controls.filmGateWeaveAmount')}
                value={settings.filmGateWeaveAmount}
                min={0}
                max={2}
                step={0.01}
                unit="px"
                formatValue={(value) => formatFloat(value, 2)}
                onChange={(event) => handleSettingChange(event, 'filmGateWeaveAmount')}
                testId="home-editor-film-gate-weave-amount"
            />
            <RangeControl
                label={t('homeEditor.controls.filmGateWeaveRate')}
                value={settings.filmGateWeaveRate}
                min={0.25}
                max={12}
                step={0.25}
                unit=" Hz"
                formatValue={(value) => formatFloat(value, 2)}
                onChange={(event) => handleSettingChange(event, 'filmGateWeaveRate')}
                testId="home-editor-film-gate-weave-rate"
            />

            <SectionHeading label={t('homeEditor.blocks.bloom')} subtle />
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

            <SectionHeading label={t('homeEditor.blocks.color')} subtle />
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
                label={t('homeEditor.controls.debugWireframe')}
                checked={Boolean(settings.debugWireframe)}
                onChange={(event) => handleSettingChange(event, 'debugWireframe', 'boolean')}
            />
            <CheckboxControl
                label={t('homeEditor.controls.showPointerDebug')}
                checked={Boolean(settings.showPointerDebug)}
                onChange={(event) => handleSettingChange(event, 'showPointerDebug', 'boolean')}
            />
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
