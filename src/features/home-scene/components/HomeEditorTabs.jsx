import React from 'react';
import { useLanguage } from '../../../i18n/useLanguage';
import {
    HOME_SCENE_DEBUG_VIEWS,
    HOME_SCENE_HDRI_PRESETS,
} from '../hooks/useHomeSceneSettings';
import {
    ColorControl,
    RangeControl,
    SelectControl,
} from './HomeEditorControls';

const formatFloat = (value, digits = 2) => Number(value).toFixed(digits);

export const WaterTab = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <RangeControl
                label={t('homeEditor.controls.waterExtent')}
                value={settings.waterExtent}
                min={12}
                max={40}
                step={0.5}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'waterExtent')}
            />
            <SelectControl
                label={t('homeEditor.controls.simulationResolution')}
                value={String(settings.simulationResolution)}
                options={[
                    { value: '256', label: '256' },
                    { value: '384', label: '384' },
                    { value: '512', label: '512' },
                ]}
                onChange={(event) => handleSettingChange(event, 'simulationResolution', 'integer')}
            />
            <RangeControl
                label={t('homeEditor.controls.waterMeshDensity')}
                value={settings.waterMeshDensity}
                min={96}
                max={384}
                step={16}
                onChange={(event) => handleSettingChange(event, 'waterMeshDensity', 'integer')}
            />
            <RangeControl
                label={t('homeEditor.controls.waveAmplitude')}
                value={settings.waveAmplitude}
                min={0.01}
                max={0.2}
                step={0.005}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'waveAmplitude')}
            />
            <RangeControl
                label={t('homeEditor.controls.waveLength')}
                value={settings.waveLength}
                min={0.4}
                max={3.2}
                step={0.05}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'waveLength')}
            />
            <RangeControl
                label={t('homeEditor.controls.waveChoppiness')}
                value={settings.waveChoppiness}
                min={0}
                max={1.25}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'waveChoppiness')}
            />
            <RangeControl
                label={t('homeEditor.controls.rippleDamping')}
                value={settings.rippleDamping}
                min={0.93}
                max={0.992}
                step={0.001}
                formatValue={(value) => formatFloat(value, 3)}
                onChange={(event) => handleSettingChange(event, 'rippleDamping')}
            />
            <RangeControl
                label={t('homeEditor.controls.rippleRadius')}
                value={settings.rippleRadius}
                min={0.1}
                max={2.4}
                step={0.01}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'rippleRadius')}
            />
            <RangeControl
                label={t('homeEditor.controls.rippleImpulse')}
                value={settings.rippleImpulse}
                min={0.05}
                max={1.2}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'rippleImpulse')}
            />
            <RangeControl
                label={t('homeEditor.controls.normalStrength')}
                value={settings.normalStrength}
                min={0.4}
                max={3.2}
                step={0.05}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'normalStrength')}
            />
            <RangeControl
                label={t('homeEditor.controls.normalBlur')}
                value={settings.normalBlur}
                min={0.2}
                max={2.5}
                step={0.05}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'normalBlur')}
            />
            <RangeControl
                label={t('homeEditor.controls.ambientWaveIntensity')}
                value={settings.ambientWaveIntensity}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'ambientWaveIntensity')}
            />
            <RangeControl
                label={t('homeEditor.controls.ambientWaveSpeed')}
                value={settings.ambientWaveSpeed}
                min={0}
                max={5}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'ambientWaveSpeed')}
            />
        </>
    );
};

export const LightingTab = ({ settings, handleSettingChange }) => {
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
                min={20}
                max={220}
                step={1}
                unit="%"
                onChange={(event) => handleSettingChange(event, 'hdrExposure', 'integer')}
            />
            <RangeControl
                label={t('homeEditor.controls.envReflectionIntensity')}
                value={settings.envReflectionIntensity}
                min={20}
                max={220}
                step={1}
                unit="%"
                onChange={(event) => handleSettingChange(event, 'envReflectionIntensity', 'integer')}
            />
            <ColorControl
                label={t('homeEditor.controls.envTint')}
                value={settings.envTint}
                onChange={(event) => handleSettingChange(event, 'envTint', 'color')}
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
                min={5}
                max={85}
                step={1}
                unit="°"
                onChange={(event) => handleSettingChange(event, 'moonElevation')}
            />
            <RangeControl
                label={t('homeEditor.controls.moonSpecularStrength')}
                value={settings.moonSpecularStrength}
                min={0}
                max={2}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'moonSpecularStrength')}
            />
            <RangeControl
                label={t('homeEditor.controls.moonSpecularPower')}
                value={settings.moonSpecularPower}
                min={4}
                max={128}
                step={1}
                onChange={(event) => handleSettingChange(event, 'moonSpecularPower')}
            />
        </>
    );
};

export const DepthTab = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <RangeControl
                label={t('homeEditor.controls.waterDepthMeters')}
                value={settings.waterDepthMeters}
                min={1}
                max={12}
                step={0.25}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'waterDepthMeters')}
            />
            <RangeControl
                label={t('homeEditor.controls.seabedReliefStrength')}
                value={settings.seabedReliefStrength}
                min={0}
                max={2}
                step={0.02}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'seabedReliefStrength')}
            />
            <RangeControl
                label={t('homeEditor.controls.seabedReliefScale')}
                value={settings.seabedReliefScale}
                min={0.5}
                max={6}
                step={0.05}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'seabedReliefScale')}
            />
            <RangeControl
                label={t('homeEditor.controls.causticsIntensity')}
                value={settings.causticsIntensity}
                min={0}
                max={3}
                step={0.02}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'causticsIntensity')}
            />
            <RangeControl
                label={t('homeEditor.controls.causticsScale')}
                value={settings.causticsScale}
                min={0.5}
                max={6}
                step={0.05}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'causticsScale')}
            />
            <RangeControl
                label={t('homeEditor.controls.causticsSharpness')}
                value={settings.causticsSharpness}
                min={0.1}
                max={1.5}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'causticsSharpness')}
            />
            <hr style={{ margin: '12px 0', borderColor: 'rgba(255,255,255,0.1)' }} />
            <RangeControl
                label={t('homeEditor.controls.seabedTextureScale')}
                value={settings.seabedTextureScale}
                min={0.1}
                max={10}
                step={0.1}
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'seabedTextureScale')}
            />
            <RangeControl
                label={t('homeEditor.controls.seabedSaturation')}
                value={settings.seabedSaturation}
                min={0}
                max={2}
                step={0.05}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'seabedSaturation')}
            />
            <RangeControl
                label={t('homeEditor.controls.seabedBrightness')}
                value={settings.seabedBrightness}
                min={0}
                max={2}
                step={0.05}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'seabedBrightness')}
            />
        </>
    );
};

export const CameraTab = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <RangeControl
            label={t('homeEditor.controls.cameraFov')}
            value={settings.cameraFov}
            min={24}
            max={75}
            step={1}
            unit="°"
            onChange={(event) => handleSettingChange(event, 'cameraFov', 'integer')}
        />
    );
};

export const BoatTab = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <ColorControl
                label={t('homeEditor.controls.boatColor')}
                value={settings.boatColor}
                onChange={(event) => handleSettingChange(event, 'boatColor', 'color')}
            />
            <RangeControl
                label={t('homeEditor.controls.boatMetalness')}
                value={settings.boatMetalness}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'boatMetalness')}
            />
            <RangeControl
                label={t('homeEditor.controls.boatRoughness')}
                value={settings.boatRoughness}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'boatRoughness')}
            />
            <RangeControl
                label={t('homeEditor.controls.boatClearcoat')}
                value={settings.boatClearcoat}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'boatClearcoat')}
            />
            <RangeControl
                label={t('homeEditor.controls.boatClearcoatRoughness')}
                value={settings.boatClearcoatRoughness}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'boatClearcoatRoughness')}
            />
            <RangeControl
                label={t('homeEditor.controls.boatScale')}
                value={settings.boatScale}
                min={0.001}
                max={0.05}
                step={0.001}
                formatValue={(value) => formatFloat(value, 3)}
                onChange={(event) => handleSettingChange(event, 'boatScale')}
            />
        </>
    );
};

export const DebugTab = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <SelectControl
            label={t('homeEditor.controls.debugView')}
            value={settings.debugView}
            options={HOME_SCENE_DEBUG_VIEWS}
            onChange={(event) => handleSettingChange(event, 'debugView', 'string')}
        />
    );
};
