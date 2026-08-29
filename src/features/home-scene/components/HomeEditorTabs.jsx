import React from 'react';
import { useLanguage } from '../../../i18n/useLanguage';
import {
    HOME_SCENE_DEBUG_VIEWS,
    HOME_SCENE_HDRI_PRESETS,
    HOME_SCENE_LIGHT_TYPES,
} from '../hooks/useHomeSceneSettings';
import {
    getLayoutVisibleAspect,
    LAYOUT_KEYS,
    resolveLayout,
    resolveLayoutFrameInset,
} from '../lib/layout';
import {
    CheckboxControl,
    ColorControl,
    RangeControl,
    SectionHeading,
    SelectControl,
} from './HomeEditorControls';

const formatFloat = (value, digits = 2) => Number(value).toFixed(digits);
const SIMULATION_RESOLUTION_OPTIONS = [128, 256, 384, 512].map((value) => ({
    value,
    label: `${value} × ${value}`,
}));

export const WaterTab = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <RangeControl
                label={t('homeEditor.controls.waterExtent')}
                value={settings.waterExtent}
                min={12}
                max={200}
                step={0.5}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'waterExtent')}
            />
            <SelectControl
                label={t('homeEditor.controls.simulationResolution')}
                value={settings.simulationResolution}
                options={SIMULATION_RESOLUTION_OPTIONS}
                onChange={(event) => handleSettingChange(event, 'simulationResolution', 'integer')}
            />
            <RangeControl
                label={t('homeEditor.controls.waveAmplitude')}
                value={settings.waveAmplitude}
                min={0}
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
                label={t('homeEditor.controls.rippleImpulse')}
                value={settings.rippleImpulse}
                min={0}
                max={1.2}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'rippleImpulse')}
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
        </>
    );
};

export const LightingTab = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();
    const lightTypeOptions = HOME_SCENE_LIGHT_TYPES.map((option) => ({
        ...option,
        label: t(`homeEditor.controls.lightType${option.value === 'sun' ? 'Sun' : 'Moon'}`),
    }));

    return (
        <>
            <SectionHeading label={t('homeEditor.controls.lightingSectionSunMoon')} />
            <SelectControl
                label={t('homeEditor.controls.keyLightType')}
                value={settings.keyLightType}
                options={lightTypeOptions}
                onChange={(event) => handleSettingChange(event, 'keyLightType', 'string')}
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
            <SectionHeading label={t('homeEditor.controls.lightingSectionHdri')} />
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
            <ColorControl
                label={t('homeEditor.controls.envTint')}
                value={settings.envTint}
                onChange={(event) => handleSettingChange(event, 'envTint', 'color')}
            />
            <CheckboxControl
                label={t('homeEditor.controls.showHdriBackground')}
                checked={Boolean(settings.showHdriBackground)}
                onChange={(event) => handleSettingChange(event, 'showHdriBackground', 'boolean')}
            />

            <SectionHeading label={t('homeEditor.controls.lightingSectionShadows')} />
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

export const DepthTab = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <RangeControl
                label={t('homeEditor.controls.waterDepthMeters')}
                value={settings.waterDepthMeters}
                min={0.25}
                max={12}
                step={0.25}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'waterDepthMeters')}
            />
            <RangeControl
                label={t('homeEditor.controls.waterTurbidity')}
                value={settings.waterTurbidity}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'waterTurbidity')}
            />
            <RangeControl
                label={t('homeEditor.controls.waterScatteringStrength')}
                value={settings.waterScatteringStrength}
                min={0}
                max={2}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'waterScatteringStrength')}
            />
            <ColorControl
                label={t('homeEditor.controls.waterScatteringColor')}
                value={settings.waterScatteringColor}
                onChange={(event) => handleSettingChange(event, 'waterScatteringColor', 'color')}
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
                label={t('homeEditor.controls.causticsIntensity')}
                value={settings.causticsIntensity}
                min={0}
                max={3}
                step={0.02}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'causticsIntensity')}
            />
            <RangeControl
                label={t('homeEditor.controls.causticsSharpness')}
                value={settings.causticsSharpness}
                min={0}
                max={1}
                step={0.02}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'causticsSharpness')}
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
            <RangeControl
                label={t('homeEditor.controls.seabedVariation')}
                value={settings.seabedVariation}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'seabedVariation')}
            />
            <RangeControl
                label={t('homeEditor.controls.seabedAoStrength')}
                value={settings.seabedAoStrength}
                min={0}
                max={1.5}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'seabedAoStrength')}
            />
            <RangeControl
                label={t('homeEditor.controls.plantAoStrength')}
                value={settings.plantAoStrength}
                min={0}
                max={1.5}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'plantAoStrength')}
            />
        </>
  );
};

export const PlantsTab = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <SectionHeading label={t('homeEditor.controls.plantsSectionSurface')} />
            <RangeControl
                label={t('homeEditor.controls.surfacePlantAmount')}
                value={settings.surfacePlantAmount}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'surfacePlantAmount')}
            />
            <RangeControl
                label={t('homeEditor.controls.surfacePlantClustering')}
                value={settings.surfacePlantClustering}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'surfacePlantClustering')}
            />
            <RangeControl
                label={t('homeEditor.controls.surfacePlantCenterX')}
                value={settings.surfacePlantCenterX}
                min={-20}
                max={20}
                step={0.1}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'surfacePlantCenterX')}
            />
            <RangeControl
                label={t('homeEditor.controls.surfacePlantCenterZ')}
                value={settings.surfacePlantCenterZ}
                min={-20}
                max={20}
                step={0.1}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'surfacePlantCenterZ')}
            />
            <RangeControl
                label={t('homeEditor.controls.surfacePlantRadius')}
                value={settings.surfacePlantRadius}
                min={0}
                max={20}
                step={0.1}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'surfacePlantRadius')}
            />
            <RangeControl
                label={t('homeEditor.controls.surfacePlantSize')}
                value={settings.surfacePlantSize}
                min={0}
                max={0.6}
                step={0.01}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'surfacePlantSize')}
            />
            <ColorControl
                label={t('homeEditor.controls.surfacePlantColor')}
                value={settings.surfacePlantColor}
                onChange={(event) => handleSettingChange(event, 'surfacePlantColor', 'color')}
            />
            <RangeControl
                label={t('homeEditor.controls.surfacePlantSaturation')}
                value={settings.surfacePlantSaturation}
                min={0}
                max={2}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'surfacePlantSaturation')}
            />
            <RangeControl
                label={t('homeEditor.controls.surfacePlantTranslucency')}
                value={settings.surfacePlantTranslucency}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'surfacePlantTranslucency')}
            />
            <RangeControl
                label={t('homeEditor.controls.surfacePlantReflection')}
                value={settings.surfacePlantReflection}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'surfacePlantReflection')}
            />

            <SectionHeading label={t('homeEditor.controls.plantsSectionUnderwater')} />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeAmount')}
                value={settings.underwaterAlgaeAmount}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeAmount')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeSway')}
                value={settings.underwaterAlgaeSway}
                min={0}
                max={1.5}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeSway')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeFlowDirection')}
                value={settings.underwaterAlgaeFlowDirection}
                min={-180}
                max={180}
                step={1}
                unit="°"
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeFlowDirection')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeFlowStrength')}
                value={settings.underwaterAlgaeFlowStrength}
                min={0}
                max={2}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeFlowStrength')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeSpeciesMix')}
                value={settings.underwaterAlgaeSpeciesMix}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeSpeciesMix')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaePatchiness')}
                value={settings.underwaterAlgaePatchiness}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaePatchiness')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeCenterX')}
                value={settings.underwaterAlgaeCenterX}
                min={-20}
                max={20}
                step={0.1}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeCenterX')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeCenterZ')}
                value={settings.underwaterAlgaeCenterZ}
                min={-20}
                max={20}
                step={0.1}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeCenterZ')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeRadius')}
                value={settings.underwaterAlgaeRadius}
                min={0}
                max={20}
                step={0.1}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeRadius')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeLength')}
                value={settings.underwaterAlgaeLength}
                min={0}
                max={3}
                step={0.05}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeLength')}
            />
            <ColorControl
                label={t('homeEditor.controls.underwaterAlgaeColor')}
                value={settings.underwaterAlgaeColor}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeColor', 'color')}
            />
            <RangeControl
                label={t('homeEditor.controls.underwaterAlgaeSaturation')}
                value={settings.underwaterAlgaeSaturation}
                min={0}
                max={2}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'underwaterAlgaeSaturation')}
            />
        </>
    );
};

export const PostProcessingTab = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();
    const fogOptions = [
        { value: 'off', label: t('homeEditor.controls.fogModeOff') },
        { value: 'cheap', label: t('homeEditor.controls.fogModeCheap') },
        { value: 'volumetric', label: t('homeEditor.controls.fogModeVolumetric') },
    ];

    return (
        <>
            <CheckboxControl
                label={t('homeEditor.controls.postProcessingEnabled')}
                checked={Boolean(settings.postProcessingEnabled)}
                onChange={(event) => handleSettingChange(event, 'postProcessingEnabled', 'boolean')}
            />

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

            <SectionHeading label={t('homeEditor.controls.postSectionGrain')} />
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

            <SectionHeading label={t('homeEditor.controls.postSectionBloom')} />
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

            <SectionHeading label={t('homeEditor.controls.postSectionWaterGlints')} />
            <RangeControl
                label={t('homeEditor.controls.waterGlintStrength')}
                value={settings.waterGlintStrength}
                min={0}
                max={2}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'waterGlintStrength')}
            />
            <RangeControl
                label={t('homeEditor.controls.waterGlintDensity')}
                value={settings.waterGlintDensity}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'waterGlintDensity')}
            />
            <RangeControl
                label={t('homeEditor.controls.waterGlintSharpness')}
                value={settings.waterGlintSharpness}
                min={0}
                max={1}
                step={0.01}
                unit="%"
                formatValue={(value) => Math.round(Number(value) * 100)}
                onChange={(event) => handleSettingChange(event, 'waterGlintSharpness')}
            />

            <SectionHeading label={t('homeEditor.controls.postSectionColor')} />
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
                label={t('homeEditor.controls.colorHue')}
                value={settings.colorHue}
                min={-180}
                max={180}
                step={1}
                unit="°"
                onChange={(event) => handleSettingChange(event, 'colorHue')}
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
                label={t('homeEditor.controls.colorExposure')}
                value={settings.colorExposure}
                min={-3}
                max={3}
                step={0.05}
                unit="EV"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'colorExposure')}
            />

            <SectionHeading label={t('homeEditor.controls.postSectionSunRays')} />
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

            <SectionHeading label={t('homeEditor.controls.postSectionFog')} />
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

const LAYOUT_LABEL_KEYS = {
    portrait: 'homeEditor.controls.layoutPortrait',
    desktop: 'homeEditor.controls.layoutDesktop',
};

export const CameraTab = ({ settings, layoutEditor }) => {
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

export const BoatTab = ({ settings, handleSettingChange, layoutEditor }) => {
    const { t } = useLanguage();
    const activeBoat = (layoutEditor
        ? resolveLayout(layoutEditor.layouts, layoutEditor.selectedKey)?.boatPosition
        : null) ?? settings.boatPosition ?? { x: 0, z: 0 };
    const setBoatAxis = (axis, value) => {
        if (!layoutEditor) {
            return;
        }
        layoutEditor.updateLayout(layoutEditor.selectedKey, {
            boatPosition: { ...activeBoat, [axis]: value },
        });
    };

    return (
        <>
            <p className="home-editor-inline-hint">
                {t('homeEditor.controls.boatMoveHint')}
            </p>
            <RangeControl
                label={t('homeEditor.controls.boatPositionX')}
                value={activeBoat.x ?? 0}
                min={-20}
                max={20}
                step={0.01}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => setBoatAxis('x', parseFloat(event.target.value))}
            />
            <RangeControl
                label={t('homeEditor.controls.boatPositionZ')}
                value={activeBoat.z ?? 0}
                min={-20}
                max={20}
                step={0.01}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => setBoatAxis('z', parseFloat(event.target.value))}
            />
            <ColorControl
                label={t('homeEditor.controls.boatColor')}
                value={settings.boatColor}
                onChange={(event) => handleSettingChange(event, 'boatColor', 'color')}
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
                label={t('homeEditor.controls.boatReflectionIntensity')}
                value={settings.boatReflectionIntensity}
                min={0}
                max={2}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'boatReflectionIntensity')}
            />
            <RangeControl
                label={t('homeEditor.controls.boatYaw')}
                value={settings.boatYaw}
                min={-180}
                max={180}
                step={1}
                unit="°"
                onChange={(event) => handleSettingChange(event, 'boatYaw')}
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
            <RangeControl
                label={t('homeEditor.controls.boatHeightOffset')}
                value={settings.boatHeightOffset}
                min={-0.6}
                max={0.6}
                step={0.01}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'boatHeightOffset')}
            />
        </>
    );
};

export const SculptureTab = ({ settings, handleSettingChange, layoutEditor }) => {
    const { t } = useLanguage();
    const activeSculpture = (layoutEditor
        ? resolveLayout(layoutEditor.layouts, layoutEditor.selectedKey)?.sculpturePosition
        : null) ?? settings.sculpturePosition ?? { x: 0, z: 0 };
    const setSculptureAxis = (axis, value) => {
        if (!layoutEditor) {
            return;
        }
        layoutEditor.updateLayout(layoutEditor.selectedKey, {
            sculpturePosition: { ...activeSculpture, [axis]: value },
        });
    };

    return (
        <>
            <p className="home-editor-inline-hint">
                {t('homeEditor.controls.sculptureMoveHint')}
            </p>
            <RangeControl
                label={t('homeEditor.controls.sculpturePositionX')}
                value={activeSculpture.x ?? 0}
                min={-20}
                max={20}
                step={0.01}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => setSculptureAxis('x', parseFloat(event.target.value))}
            />
            <RangeControl
                label={t('homeEditor.controls.sculpturePositionZ')}
                value={activeSculpture.z ?? 0}
                min={-20}
                max={20}
                step={0.01}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => setSculptureAxis('z', parseFloat(event.target.value))}
            />
            <ColorControl
                label={t('homeEditor.controls.sculptureColor')}
                value={settings.sculptureColor}
                onChange={(event) => handleSettingChange(event, 'sculptureColor', 'color')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureRoughness')}
                value={settings.sculptureRoughness}
                min={0}
                max={1}
                step={0.01}
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'sculptureRoughness')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureScale')}
                value={settings.sculptureScale}
                min={0.005}
                max={0.2}
                step={0.001}
                formatValue={(value) => formatFloat(value, 3)}
                onChange={(event) => handleSettingChange(event, 'sculptureScale')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureRotationY')}
                value={settings.sculptureRotationY}
                min={-180}
                max={180}
                step={1}
                unit="°"
                onChange={(event) => handleSettingChange(event, 'sculptureRotationY')}
            />
            <RangeControl
                label={t('homeEditor.controls.sculptureBottomOffset')}
                value={settings.sculptureBottomOffset}
                min={-2}
                max={2}
                step={0.01}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'sculptureBottomOffset')}
            />
        </>
    );
};

export const DebugTab = ({ settings, handleSettingChange }) => {
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

export const InterfaceTab = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();
    const toggles = [
        'uiBrandVisible',
        'uiSubtitleVisible',
        'uiMenuVisible',
        'uiLanguageVisible',
        'uiSoundVisible',
        'uiFrameVisible',
    ];

    return (
        <>
            {toggles.map((key) => (
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
