import React from 'react';
import { useLanguage } from '../../i18n/LanguageProvider';
import { RangeControl, ColorControl, CheckboxControl } from './Controls';

export const PlaneTab = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <ColorControl
                label={t('snakeEditor.controls.planeColor')}
                value={settings.planeColor}
                onChange={(e) => handleSettingChange(e, 'planeColor', true)}
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

export const GeometryTab = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <RangeControl label={t('snakeEditor.controls.length')} value={settings.length} min={10} max={200} unit="м" onChange={(e) => handleSettingChange(e, 'length')} />
            <RangeControl label={t('snakeEditor.controls.curl')} value={settings.curl} min={0} max={100} unit="%" onChange={(e) => handleSettingChange(e, 'curl')} />
            <RangeControl label={t('snakeEditor.controls.tailFactor')} value={settings.tailFactor} min={0} max={200} unit="%" onChange={(e) => handleSettingChange(e, 'tailFactor')} />
            <RangeControl label={t('snakeEditor.controls.bodyFactor')} value={settings.bodyFactor} min={0} max={200} unit="%" onChange={(e) => handleSettingChange(e, 'bodyFactor')} />
            <RangeControl label={t('snakeEditor.controls.neckFactor')} value={settings.neckFactor} min={0} max={200} unit="%" onChange={(e) => handleSettingChange(e, 'neckFactor')} />
            <RangeControl label={t('snakeEditor.controls.headFactor')} value={settings.headFactor} min={0} max={200} unit="%" onChange={(e) => handleSettingChange(e, 'headFactor')} />
            <RangeControl label={t('snakeEditor.controls.noseFactor')} value={settings.noseFactor} min={0} max={200} unit="%" onChange={(e) => handleSettingChange(e, 'noseFactor')} />
            <RangeControl label={t('snakeEditor.controls.eyeDimple')} value={settings.eyeDimple} min={0} max={100} unit="%" onChange={(e) => handleSettingChange(e, 'eyeDimple')} />
            <RangeControl label={t('snakeEditor.controls.cheekbone')} value={settings.cheekbone} min={0} max={100} unit="%" onChange={(e) => handleSettingChange(e, 'cheekbone')} />
            <RangeControl label={t('snakeEditor.controls.jaw')} value={settings.jaw} min={0} max={100} unit="%" onChange={(e) => handleSettingChange(e, 'jaw')} />
            <RangeControl label={t('snakeEditor.controls.crown')} value={settings.crown} min={0} max={100} unit="%" onChange={(e) => handleSettingChange(e, 'crown')} />
            <RangeControl label={t('snakeEditor.controls.tongueSpeed')} value={settings.tongueSpeed} min={10} max={200} unit="%" onChange={(e) => handleSettingChange(e, 'tongueSpeed')} />
            <RangeControl label={t('snakeEditor.controls.tongueAmplitude')} value={settings.tongueAmplitude} min={10} max={200} unit="%" onChange={(e) => handleSettingChange(e, 'tongueAmplitude')} />
            <RangeControl label={t('snakeEditor.controls.tongueLength')} value={settings.tongueLength} min={10} max={200} unit="%" onChange={(e) => handleSettingChange(e, 'tongueLength')} />
        </>
    );
};

export const ShaderTab = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <ColorControl label={t('snakeEditor.controls.baseColor')} value={settings.baseColor} onChange={(e) => handleSettingChange(e, 'baseColor', true)} />
            <ColorControl label={t('snakeEditor.controls.bellyColor')} value={settings.bellyColor} onChange={(e) => handleSettingChange(e, 'bellyColor', true)} />
            <RangeControl label={t('snakeEditor.controls.scaleDensity')} value={settings.scaleDensity} min={10} max={200} onChange={(e) => handleSettingChange(e, 'scaleDensity')} />
            <RangeControl label={t('snakeEditor.controls.roughness')} value={settings.roughness} min={0} max={100} unit="%" onChange={(e) => handleSettingChange(e, 'roughness')} />
            <RangeControl label={t('snakeEditor.controls.metalness')} value={settings.metalness} min={0} max={100} unit="%" onChange={(e) => handleSettingChange(e, 'metalness')} />
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
