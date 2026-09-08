import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import {
    ColorControl,
    RangeControl,
    SelectControl,
    SectionHeading,
} from '../../HomeEditorControls';
import { formatFloat, SIMULATION_RESOLUTION_OPTIONS } from '../editorShared';
import { TERRAIN_RANGES } from '../../../../../terrain/settings.js';

// The bed of the Azov shelf lives in the terrain (terrainShader.js coastBedCover):
// the offshore slope, then what lies on the sand. Labels inline, as in terrain.jsx.
const SHELF_CONTROLS = [
    ['terrainShelfExtent', 'Дальность дна', 'Seabed extent', ' m'],
    ['terrainShoreKnee', 'Колено дна', 'Bed knee', ' m'],
    ['terrainBars', 'Бары и отмели', 'Bars and shoals', ''],
    ['terrainShelfSlope', 'Уклон шельфа', 'Shelf slope', '%'],
    ['terrainWeed', 'Луга водорослей', 'Weed meadows', ''],
    ['terrainSilt', 'Ил', 'Silt', ''],
    ['terrainMussels', 'Мидиевые банки', 'Mussel beds', ''],
    ['terrainBedScale', 'Масштаб пятен', 'Patch scale', ' m'],
    ['terrainRipples', 'Рябь на песке', 'Sand ripples', ''],
];

export const WaterGeometrySection = ({ settings, handleSettingChange }) => {
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
        </>
    );
};

export const WaterWavesSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <SectionHeading label={t('homeEditor.blocks.simulation')} subtle />
            <SelectControl
                label={t('homeEditor.controls.simulationResolution')}
                value={settings.simulationResolution}
                options={SIMULATION_RESOLUTION_OPTIONS}
                onChange={(event) => handleSettingChange(event, 'simulationResolution', 'integer')}
            />
            <SectionHeading label={t('homeEditor.blocks.waveShape')} subtle />
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
            <SectionHeading label={t('homeEditor.blocks.cursorRipples')} subtle />
            <RangeControl
                label={t('homeEditor.controls.rippleRadius')}
                value={settings.rippleRadius}
                min={0.05}
                max={2.4}
                step={0.05}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'rippleRadius')}
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
            <SectionHeading label={t('homeEditor.blocks.ambientWaves')} subtle />
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

export const WaterShaderSection = ({ settings, handleSettingChange }) => {
    const { t } = useLanguage();

    return (
        <>
            <SectionHeading label={t('homeEditor.blocks.body')} subtle />
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
            <ColorControl
                label={t('homeEditor.controls.envTint')}
                value={settings.envTint}
                onChange={(event) => handleSettingChange(event, 'envTint', 'color')}
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
            <SectionHeading label={t('homeEditor.blocks.scattering')} subtle />
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
            <SectionHeading label={t('homeEditor.blocks.glints')} subtle />
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

            <RangeControl
                label={t('homeEditor.controls.farWaterBlendWidth')}
                value={settings.farWaterBlendWidth}
                min={0.4}
                max={8}
                step={0.1}
                unit="m"
                formatValue={(value) => formatFloat(value, 1)}
                onChange={(event) => handleSettingChange(event, 'farWaterBlendWidth')}
            />
        </>
    );
};

export const SeabedSection = ({ settings, handleSettingChange }) => {
    const { t, language } = useLanguage();
    const ru = language === 'ru';

    return (
        <>
            <SectionHeading label={ru ? 'Шельф Азова' : 'Azov shelf'} subtle />
            {SHELF_CONTROLS.map(([key, labelRu, labelEn, unit]) => {
                const [min, max, step] = TERRAIN_RANGES[key];
                return (
                    <RangeControl
                        key={key}
                        label={ru ? labelRu : labelEn}
                        value={settings[key]}
                        min={min}
                        max={max}
                        step={step}
                        unit={unit}
                        formatValue={(value) => Number(Number(value).toFixed(2))}
                        onChange={(event) => handleSettingChange(event, key)}
                    />
                );
            })}
            <SectionHeading label={t('homeEditor.blocks.surface')} subtle />
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
            <SectionHeading label={t('homeEditor.blocks.caustics')} subtle />
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
        </>
    );
};
