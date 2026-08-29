import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import {
    CheckboxControl,
    ColorControl,
    RangeControl,
    SelectControl,
} from '../../HomeEditorControls';
import { formatFloat } from '../editorShared';
import {
    HOME_SCENE_HDRI_PRESETS,
    HOME_SCENE_LIGHT_TYPES,
} from '../../../hooks/useHomeSceneSettings';

export const LightSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();
    const lightTypeOptions = HOME_SCENE_LIGHT_TYPES.map((option) => ({
        ...option,
        label: t(`homeEditor.controls.lightType${option.value === 'sun' ? 'Sun' : 'Moon'}`),
    }));

    return (
        <>
            <SelectControl
                label={t('homeEditor.controls.keyLightType')}
                value={settings.keyLightType}
                options={lightTypeOptions}
                onChange={(event) => handleSettingChange(event, 'keyLightType', 'string')}
            />
            <ColorControl
                label={t('homeEditor.controls.moonColor')}
                value={settings.moonColor}
                onChange={(event) => handleSettingChange(event, 'moonColor', 'color')}
            />
            <RangeControl
                label={t('homeEditor.controls.moonIntensity')}
                value={settings.moonIntensity}
                min={0}
                max={4}
                step={0.05}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'moonIntensity')}
            />
            <RangeControl
                label={t('homeEditor.controls.moonAzimuth')}
                value={settings.moonAzimuth}
                min={0}
                max={360}
                step={1}
                unit="°"
                onChange={(event) => handleSettingChange(event, 'moonAzimuth')}
            />
            <RangeControl
                label={t('homeEditor.controls.moonElevation')}
                value={settings.moonElevation}
                min={0}
                max={85}
                step={1}
                unit="°"
                onChange={(event) => handleSettingChange(event, 'moonElevation')}
            />
            <CheckboxControl
                label={t('homeEditor.controls.lightDiscEnabled')}
                checked={Boolean(settings.lightDiscEnabled)}
                onChange={(event) => handleSettingChange(event, 'lightDiscEnabled', 'boolean')}
            />
            <RangeControl
                label={t('homeEditor.controls.lightDiscSize')}
                value={settings.lightDiscSize}
                min={0.25}
                max={6}
                step={0.05}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'lightDiscSize')}
            />
            <CheckboxControl
                label={t('homeEditor.controls.shadowsEnabled')}
                checked={settings.shadowsEnabled !== false}
                onChange={(event) => handleSettingChange(event, 'shadowsEnabled', 'boolean')}
            />
            <RangeControl
                label={t('homeEditor.controls.shadowIntensity')}
                value={settings.shadowIntensity}
                min={0}
                max={1}
                step={0.05}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'shadowIntensity')}
            />
            <RangeControl
                label={t('homeEditor.controls.shadowRadius')}
                value={settings.shadowRadius}
                min={0}
                max={8}
                step={0.25}
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'shadowRadius')}
            />
        </>
    );
};

export const HdriSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <SelectControl
                label={t('homeEditor.controls.hdrPreset')}
                value={settings.hdrPreset}
                options={HOME_SCENE_HDRI_PRESETS}
                onChange={(event) => handleSettingChange(event, 'hdrPreset', 'string')}
            />
            <RangeControl
                label={t('homeEditor.controls.hdrRotation')}
                value={settings.hdrRotation}
                min={0}
                max={360}
                step={1}
                unit="°"
                onChange={(event) => handleSettingChange(event, 'hdrRotation')}
            />
            <RangeControl
                label={t('homeEditor.controls.hdrExposure')}
                value={settings.hdrExposure}
                min={0}
                max={220}
                step={1}
                unit="%"
                onChange={(event) => handleSettingChange(event, 'hdrExposure', 'integer')}
            />
            <RangeControl
                label={t('homeEditor.controls.envReflectionIntensity')}
                value={settings.envReflectionIntensity}
                min={0}
                max={220}
                step={1}
                unit="%"
                onChange={(event) => handleSettingChange(event, 'envReflectionIntensity', 'integer')}
            />
            <CheckboxControl
                label={t('homeEditor.controls.showHdriBackground')}
                checked={Boolean(settings.showHdriBackground)}
                onChange={(event) => handleSettingChange(event, 'showHdriBackground', 'boolean')}
            />

        </>
    );
};

export const FogSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();
    const fogOptions = [
        { value: 'off', label: t('homeEditor.controls.fogModeOff') },
        { value: 'cheap', label: t('homeEditor.controls.fogModeCheap') },
        { value: 'volumetric', label: t('homeEditor.controls.fogModeVolumetric') },
    ];

    return (
        <>
            <SelectControl
                label={t('homeEditor.controls.fogMode')}
                value={settings.fogMode}
                options={fogOptions}
                onChange={(event) => handleSettingChange(event, 'fogMode', 'string')}
            />
            <ColorControl
                label={t('homeEditor.controls.fogColor')}
                value={settings.fogColor}
                onChange={(event) => handleSettingChange(event, 'fogColor', 'color')}
            />
            <RangeControl
                label={t('homeEditor.controls.fogDensity')}
                value={settings.fogDensity}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'fogDensity')}
            />
            <RangeControl
                label={t('homeEditor.controls.fogNear')}
                value={settings.fogNear}
                min={0}
                max={100}
                step={0.5}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'fogNear')}
            />
            <RangeControl
                label={t('homeEditor.controls.fogFar')}
                value={settings.fogFar}
                min={0.1}
                max={200}
                step={0.5}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'fogFar')}
            />
            <RangeControl
                label={t('homeEditor.controls.fogNoiseScale')}
                value={settings.fogNoiseScale}
                min={0.1}
                max={12}
                step={0.1}
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'fogNoiseScale')}
            />
            <RangeControl
                label={t('homeEditor.controls.fogSpeed')}
                value={settings.fogSpeed}
                min={0}
                max={2}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'fogSpeed')}
            />
            <RangeControl
                label={t('homeEditor.controls.fogScattering')}
                value={settings.fogScattering}
                min={0}
                max={2}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'fogScattering')}
            />
        </>
    );
};

export const RaysSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <CheckboxControl
                label={t('homeEditor.controls.sunRaysEnabled')}
                checked={Boolean(settings.sunRaysEnabled)}
                onChange={(event) => handleSettingChange(event, 'sunRaysEnabled', 'boolean')}
            />
            <RangeControl
                label={t('homeEditor.controls.sunRaysIntensity')}
                value={settings.sunRaysIntensity}
                min={0}
                max={2}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'sunRaysIntensity')}
            />
            <RangeControl
                label={t('homeEditor.controls.sunRaysDecay')}
                value={settings.sunRaysDecay}
                min={0.72}
                max={0.995}
                step={0.005}
                formatValue={(value) => formatFloat(value, 3)}
                onChange={(event) => handleSettingChange(event, 'sunRaysDecay')}
            />
            <RangeControl
                label={t('homeEditor.controls.sunRaysDensity')}
                value={settings.sunRaysDensity}
                min={0}
                max={1.5}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'sunRaysDensity')}
            />

        </>
    );
};
