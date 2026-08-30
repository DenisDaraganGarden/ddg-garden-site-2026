import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import {
    CheckboxControl,
    ColorControl,
    RangeControl,
    SelectControl,
    SectionHeading,
} from '../../HomeEditorControls';
import { formatFloat } from '../editorShared';
import {
    HOME_SCENE_CLOUD_PRESETS,
    HOME_SCENE_HDRI_PRESETS,
} from '../../../hooks/useHomeSceneSettings';

const formatHour = (value) => {
    const hours = Math.floor(value);
    const minutes = Math.round((value - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

export const LightSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();
    const cloudPresetOptions = HOME_SCENE_CLOUD_PRESETS.map((option) => ({
        value: option.value,
        label: t(`homeEditor.controls.${option.labelKey}`),
    }));

    return (
        <>
            <SectionHeading label={t('homeEditor.blocks.sun')} subtle />
            <RangeControl
                label={t('homeEditor.controls.timeOfDay')}
                value={settings.timeOfDay}
                min={0}
                max={24}
                step={0.05}
                formatValue={formatHour}
                onChange={(event) => handleSettingChange(event, 'timeOfDay')}
            />
            <RangeControl
                label={t('homeEditor.controls.sunBearing')}
                value={settings.sunBearing}
                min={0}
                max={360}
                step={1}
                unit="°"
                onChange={(event) => handleSettingChange(event, 'sunBearing')}
            />
            <RangeControl
                label={t('homeEditor.controls.sunNoonElevation')}
                value={settings.sunNoonElevation}
                min={0}
                max={85}
                step={1}
                unit="°"
                onChange={(event) => handleSettingChange(event, 'sunNoonElevation')}
            />
            <RangeControl
                label={t('homeEditor.controls.sunIntensity')}
                value={settings.sunIntensity}
                min={0}
                max={8}
                step={0.05}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'sunIntensity')}
            />
            <ColorControl
                label={t('homeEditor.controls.sunTint')}
                value={settings.sunTint}
                onChange={(event) => handleSettingChange(event, 'sunTint', 'color')}
            />
            <RangeControl
                label={t('homeEditor.controls.sunAngularSize')}
                value={settings.sunAngularSize}
                min={0.2}
                max={6}
                step={0.05}
                unit="x"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'sunAngularSize')}
            />

            <SectionHeading label={t('homeEditor.blocks.air')} subtle />
            <RangeControl
                label={t('homeEditor.controls.skyTurbidity')}
                value={settings.skyTurbidity}
                min={1}
                max={10}
                step={0.1}
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'skyTurbidity')}
            />

            <SectionHeading label={t('homeEditor.blocks.clouds')} subtle />
            <SelectControl
                label={t('homeEditor.controls.cloudPreset')}
                value={settings.cloudPreset}
                options={cloudPresetOptions}
                onChange={(event) => handleSettingChange(event, 'cloudPreset', 'string')}
            />
            <RangeControl
                label={t('homeEditor.controls.cloudCover')}
                value={settings.cloudCover}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'cloudCover')}
            />
            <RangeControl
                label={t('homeEditor.controls.cloudHorizon')}
                value={settings.cloudHorizon}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'cloudHorizon')}
            />
            <RangeControl
                label={t('homeEditor.controls.cloudDensity')}
                value={settings.cloudDensity}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'cloudDensity')}
            />
            <RangeControl
                label={t('homeEditor.controls.cloudScale')}
                value={settings.cloudScale}
                min={0.5}
                max={4}
                step={0.05}
                unit="x"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'cloudScale')}
            />
            <RangeControl
                label={t('homeEditor.controls.cloudSunOcclusion')}
                value={settings.cloudSunOcclusion}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'cloudSunOcclusion')}
            />
            <ColorControl
                label={t('homeEditor.controls.distantSurfaceColor')}
                value={settings.distantSurfaceColor}
                onChange={(event) => handleSettingChange(event, 'distantSurfaceColor', 'color')}
            />

            <SectionHeading label={t('homeEditor.blocks.moon')} subtle />
            <RangeControl
                label={t('homeEditor.controls.moonPhase')}
                value={settings.moonPhase}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'moonPhase')}
            />
            <RangeControl
                label={t('homeEditor.controls.moonBrightness')}
                value={settings.moonBrightness}
                min={0}
                max={4}
                step={0.05}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'moonBrightness')}
            />

            <CheckboxControl
                label={t('homeEditor.controls.lightDiscEnabled')}
                checked={Boolean(settings.lightDiscEnabled)}
                onChange={(event) => handleSettingChange(event, 'lightDiscEnabled', 'boolean')}
            />
            <SectionHeading label={t('homeEditor.blocks.shadows')} subtle />
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
            <RangeControl
                label={t('homeEditor.controls.shadowBias')}
                value={settings.shadowBias}
                min={-0.005}
                max={0.005}
                step={0.0001}
                formatValue={(value) => Number(value).toFixed(4)}
                onChange={(event) => handleSettingChange(event, 'shadowBias')}
            />
            <RangeControl
                label={t('homeEditor.controls.waterShadowStrength')}
                value={settings.waterShadowStrength}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'waterShadowStrength')}
            />
        </>
    );
};

export const HdriSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <SelectControl
                label={t('homeEditor.controls.envMode')}
                value={settings.envMode}
                options={[
                    { value: 'sky', label: t('homeEditor.controls.envModeSky') },
                    { value: 'sky+hdri', label: t('homeEditor.controls.envModeBoth') },
                    { value: 'hdri', label: t('homeEditor.controls.envModeHdri') },
                ]}
                onChange={(event) => handleSettingChange(event, 'envMode', 'string')}
            />
            <RangeControl
                label={t('homeEditor.controls.hdriIntensity')}
                value={settings.hdriIntensity}
                min={0}
                max={2}
                step={0.01}
                unit="x"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'hdriIntensity')}
            />
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
            <SectionHeading label={t('homeEditor.blocks.fog')} subtle />
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
            <SectionHeading label={t('homeEditor.blocks.distance')} subtle />
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
            <SectionHeading label={t('homeEditor.blocks.volume')} subtle />
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
