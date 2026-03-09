import React from 'react';
import { useLanguage } from '../../i18n/LanguageProvider';
import { RangeControl, ColorControl, CheckboxControl } from './Controls';

export const PlaneTab = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <ColorControl
                label={t('snakeEditor.controls.planeAlbedo')}
                value={settings.planeAlbedo}
                onChange={(e) => handleSettingChange(e, 'planeAlbedo', true)}
            />
            <RangeControl
                label={t('snakeEditor.controls.planeRoughness')}
                value={settings.planeRoughness}
                min={0}
                max={100}
                unit="%"
                onChange={(e) => handleSettingChange(e, 'planeRoughness')}
            />
            <RangeControl
                label={t('snakeEditor.controls.planeMetalness')}
                value={settings.planeMetalness}
                min={0}
                max={100}
                unit="%"
                onChange={(e) => handleSettingChange(e, 'planeMetalness')}
            />
            <RangeControl
                label={t('snakeEditor.controls.planeHeight')}
                value={settings.planeHeight}
                min={0}
                max={500}
                unit="%"
                onChange={(e) => handleSettingChange(e, 'planeHeight')}
            />
            <RangeControl
                label={t('snakeEditor.controls.planeRadius')}
                value={settings.planeRadius}
                min={50}
                max={1000}
                unit="%"
                onChange={(e) => handleSettingChange(e, 'planeRadius')}
            />
            <RangeControl
                label={t('snakeEditor.controls.planeTrailSpan')}
                value={settings.planeTrailSpan}
                min={1}
                max={100}
                unit="%"
                onChange={(e) => handleSettingChange(e, 'planeTrailSpan')}
            />
            <RangeControl
                label={t('snakeEditor.controls.planeTrailPersistence')}
                value={settings.planeTrailPersistence}
                min={1}
                max={50}
                unit="s"
                onChange={(e) => handleSettingChange(e, 'planeTrailPersistence')}
            />
            <RangeControl
                label={t('snakeEditor.controls.planeSharpness')}
                value={settings.planeSharpness}
                min={1}
                max={100}
                unit="%"
                onChange={(e) => handleSettingChange(e, 'planeSharpness')}
            />
            <RangeControl
                label={t('snakeEditor.controls.planeHeadTaper')}
                value={settings.planeHeadTaper}
                min={0}
                max={100}
                unit="%"
                onChange={(e) => handleSettingChange(e, 'planeHeadTaper')}
            />
            <RangeControl
                label={t('snakeEditor.controls.planeTailTaper')}
                value={settings.planeTailTaper}
                min={0}
                max={150}
                unit="%"
                onChange={(e) => handleSettingChange(e, 'planeTailTaper')}
            />
            <RangeControl
                label={t('snakeEditor.controls.planeMeshDensity')}
                value={settings.planeMeshDensity}
                min={16}
                max={2048}
                step={8}
                onChange={(e) => handleSettingChange(e, 'planeMeshDensity')}
            />
        </>
    );
};

export const LightingTab = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <RangeControl label={t('snakeEditor.controls.hdrExposure')} value={settings.hdrExposure} min={10} max={300} unit="x" onChange={(e) => handleSettingChange(e, 'hdrExposure')} />
            <ColorControl label={t('snakeEditor.controls.lightColor')} value={settings.lightColor} onChange={(e) => handleSettingChange(e, 'lightColor', true)} />
            <RangeControl label={t('snakeEditor.controls.lightIntensity')} value={settings.lightIntensity} min={0} max={1000} unit="x" onChange={(e) => handleSettingChange(e, 'lightIntensity')} />
            <RangeControl label={t('snakeEditor.controls.lightHeight')} value={settings.lightHeight} min={10} max={600} unit="m" onChange={(e) => handleSettingChange(e, 'lightHeight')} />
            <RangeControl label={t('snakeEditor.controls.lightDistance')} value={settings.lightDistance} min={0} max={400} unit="m" onChange={(e) => handleSettingChange(e, 'lightDistance')} />
            <RangeControl label={t('snakeEditor.controls.lightAngle')} value={settings.lightAngle} min={0} max={360} unit="°" onChange={(e) => handleSettingChange(e, 'lightAngle')} />
        </>
    );
};

export const CameraTab = ({ settings, setSettings }) => {
    const { t } = useLanguage();

    return (
        <>
            <RangeControl
                label={t('snakeEditor.controls.cameraFov')}
                value={settings.cameraFov}
                min={10}
                max={120}
                unit="°"
                onChange={(e) => setSettings(prev => ({ ...prev, cameraFov: parseInt(e.target.value, 10) }))}
            />
            <CheckboxControl
                label={t('snakeEditor.controls.freeCamera')}
                checked={settings.freeCamera}
                onChange={(e) => setSettings(prev => ({ ...prev, freeCamera: e.target.checked }))}
            />
        </>
    );
};

export const DevTab = ({ settings, setSettings }) => {
    const { t } = useLanguage();

    return (
        <>
            <CheckboxControl
                label={t('snakeEditor.controls.devWireframe')}
                checked={settings.devWireframe}
                onChange={(e) => setSettings(prev => ({ ...prev, devWireframe: e.target.checked }))}
            />
            <CheckboxControl
                label={t('snakeEditor.controls.devNormals')}
                checked={settings.devNormals}
                onChange={(e) => setSettings(prev => ({ ...prev, devNormals: e.target.checked }))}
            />
            <CheckboxControl
                label={t('snakeEditor.controls.devAxes')}
                checked={settings.devAxes}
                onChange={(e) => setSettings(prev => ({ ...prev, devAxes: e.target.checked }))}
            />
            <CheckboxControl
                label={t('snakeEditor.controls.devStats')}
                checked={settings.devStats}
                onChange={(e) => setSettings(prev => ({ ...prev, devStats: e.target.checked }))}
            />
        </>
    );
};
