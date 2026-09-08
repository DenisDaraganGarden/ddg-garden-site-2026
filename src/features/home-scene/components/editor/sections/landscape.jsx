import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import {
    ColorControl,
    CheckboxControl,
    RangeControl,
    SelectControl,
    SectionHeading,
} from '../../HomeEditorControls';
import { formatFloat, SIMULATION_RESOLUTION_OPTIONS } from '../editorShared';
import { TERRAIN_RANGES } from '../../../../../terrain/settings.js';
import { SEA_RANGES } from '../../../../../components/effects/water/seaSettings.js';
import { SEA_STATE_CUSTOM, SEA_STATE_IDS, SEA_STATE_LABELS, resolveSeaState, seaStatePatch } from '../../../../../components/effects/water/seaStatePresets.js';

const seaLabel = (ru, en, language) => language === 'ru' ? ru : en;
const SeaRange = ({ settings, handleSettingChange, setting, ru, en, language, unit = '' }) => {
    const [min, max, step] = SEA_RANGES[setting];
    return <RangeControl label={seaLabel(ru, en, language)} value={settings[setting]} min={min} max={max} step={step} unit={unit} formatValue={(value) => Number(Number(value).toFixed(step < 0.1 ? 2 : 1))} onChange={(event) => handleSettingChange(event, setting)} />;
};
const SEA_WAVES = [
    ['seaWavelength', 'Длина волны', 'Wavelength', 'm'], ['seaAmplitude', 'Высота волны', 'Wave height', 'm'], ['seaSteepness', 'Крутизна', 'Steepness'], ['seaSpeed', 'Скорость', 'Speed'], ['seaWindDirection', 'Направление ветра', 'Wind direction', '°'], ['seaSets', 'Наборы', 'Sets'], ['seaGusts', 'Порывы', 'Gusts'], ['seaCrossWaves', 'Поперечные волны', 'Cross waves'], ['seaFadeStart', 'Волны гаснут с', 'Waves fade from', 'm'], ['seaFadeEnd', 'Волны гаснут до', 'Waves fade to', 'm'],
];
const SEA_SURF = [
    ['seaSurfPhase', 'Фаза обрушения', 'Break phase'], ['seaSurfHeight', 'Высота вала', 'Breaker height', 'm'], ['seaSurfWidth', 'Ширина вала', 'Breaker width', 'm'], ['seaSurfBreakDistance', 'Сдвиг обрушения', 'Break offset', 'm'], ['seaSurfBreakLength', 'Длина обрушения', 'Breaking length', 'm'], ['seaSurfLean', 'Наклон гребня', 'Crest lean'], ['seaSurfJet', 'Выброс губы', 'Lip throw', 'm/s'], ['seaSurfLift', 'Подъём губы', 'Lip lift', 'm/s'], ['seaSurfSheet', 'Толщина губы', 'Lip thickness'], ['seaSurfRoller', 'Объём пены', 'Foam volume'], ['seaSurfRollerDensity', 'Плотность вала', 'Roller density'], ['seaSurfPeel', 'Пил вдоль гребня', 'Peel along crest'], ['seaSurfRefraction', 'Рефракция', 'Refraction'], ['seaSurfBoreLength', 'Схлопывание', 'Collapse', 'm'], ['seaSurfRunup', 'Заплеск на песок', 'Run-up on sand', 'm'], ['seaSurfSpeed', 'Скорость вала', 'Breaker speed', 'm/s'], ['seaSurfPeriod', 'Период', 'Period', 's'], ['seaSurfSets', 'Разброс высоты', 'Height variation'],
];
const SEA_FOAM = [
    ['seaFoamLife', 'Живёт на воде', 'Lives on water', 's'], ['seaFoamDeposit', 'Плотность пены', 'Foam density'], ['seaFoamWindow', 'Окно памяти', 'Memory window', 'm'], ['seaFoamDrift', 'Снос ветром', 'Wind drift', 'm/s'], ['seaFoamSwirl', 'Завихрения', 'Swirl'], ['seaFoamDry', 'Сохнет песок', 'Sand dries in', 's'], ['seaSwashFilm', 'Плёнка заплеска', 'Swash film', 'm'], ['seaFoamThreshold', 'Порог пены', 'Foam threshold'], ['seaFoamSoftness', 'Мягкость', 'Softness'], ['seaFoamLaceScale', 'Масштаб кружева', 'Lace scale'], ['seaFoamBrightness', 'Яркость пены', 'Foam brightness'], ['seaRipple', 'Рябь', 'Ripple'], ['seaWindPatches', 'Пятна ветра', 'Wind patches'], ['seaRippleScale', 'Масштаб ряби', 'Ripple scale'],
];

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
    const { t, language } = useLanguage();
    return <>
        <SectionHeading label={seaLabel('Сетка', 'Mesh', language)} subtle />
        <SeaRange settings={settings} handleSettingChange={handleSettingChange} setting="seaMeshRings" ru="Кольца сетки" en="Mesh rings" language={language} />
        <SeaRange settings={settings} handleSettingChange={handleSettingChange} setting="seaMeshSegments" ru="Сегменты сетки" en="Mesh segments" language={language} />
        <RangeControl label={seaLabel('Область ряби', 'Ripple area', language)} value={settings.waterExtent} min={12} max={200} step={0.5} unit="m" formatValue={(value) => formatFloat(value, 1)} onChange={(event) => handleSettingChange(event, 'waterExtent')} />
        <SelectControl label={t('homeEditor.controls.simulationResolution')} value={settings.simulationResolution} options={SIMULATION_RESOLUTION_OPTIONS} onChange={(event) => handleSettingChange(event, 'simulationResolution', 'integer')} />
    </>;
};

export const WaterWavesSection = ({ settings, handleSettingChange, applySettings }) => {
    const { t, language } = useLanguage();

    const stateLabels = SEA_STATE_LABELS[language];
    const selectedState = resolveSeaState(settings, 'product');
    const seaStateOptions = [
        { value: SEA_STATE_CUSTOM, label: stateLabels.custom },
        ...SEA_STATE_IDS.map((id) => ({ value: id, label: stateLabels[id] })),
    ];
    const applySeaState = (event) => {
        const patch = seaStatePatch(event.target.value, 'product');
        if (patch) applySettings?.(patch);
    };

    return (
        <>
            <SelectControl label={stateLabels.label} value={selectedState} options={seaStateOptions} onChange={applySeaState} />
            {SEA_WAVES.map(([setting, ru, en, unit]) => <SeaRange key={setting} settings={settings} handleSettingChange={handleSettingChange} setting={setting} ru={ru} en={en} language={language} unit={unit} />)}
            <SectionHeading label={seaLabel('Прибой', 'Surf', language)} subtle />
            <CheckboxControl label={seaLabel('Прибой включён', 'Surf enabled', language)} checked={Boolean(settings.seaSurfEnabled)} onChange={(event) => handleSettingChange(event, 'seaSurfEnabled', 'boolean')} />
            <CheckboxControl label={seaLabel('Стоп-кадр', 'Freeze', language)} checked={Boolean(settings.seaSurfFreeze)} onChange={(event) => handleSettingChange(event, 'seaSurfFreeze', 'boolean')} />
            {SEA_SURF.map(([setting, ru, en, unit]) => <SeaRange key={setting} settings={settings} handleSettingChange={handleSettingChange} setting={setting} ru={ru} en={en} language={language} unit={unit} />)}
            <SectionHeading label={t('homeEditor.blocks.cursorRipples')} subtle />
            <RangeControl
                label={seaLabel('Амплитуда ряби', 'Ripple amplitude', language)}
                value={settings.waveAmplitude}
                min={0}
                max={0.2}
                step={0.005}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'waveAmplitude')}
            />
            <RangeControl
                label={seaLabel('Длина ряби', 'Ripple wavelength', language)}
                value={settings.waveLength}
                min={0.4}
                max={3.2}
                step={0.05}
                unit="m"
                formatValue={(value) => formatFloat(value)}
                onChange={(event) => handleSettingChange(event, 'waveLength')}
            />
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
    const { t, language } = useLanguage();

    return <>
        <SectionHeading label={seaLabel('Пена и рябь', 'Foam and ripple', language)} subtle />
        <CheckboxControl label={seaLabel('Память пены', 'Foam memory', language)} checked={Boolean(settings.seaFoamMemory)} onChange={(event) => handleSettingChange(event, 'seaFoamMemory', 'boolean')} />
        {SEA_FOAM.map(([setting, ru, en, unit]) => <SeaRange key={setting} settings={settings} handleSettingChange={handleSettingChange} setting={setting} ru={ru} en={en} language={language} unit={unit} />)}
        <SectionHeading label={seaLabel('Вид', 'Look', language)} subtle />
        <ColorControl label={seaLabel('Цвет воды', 'Water colour', language)} value={settings.seaWaterColor} onChange={(event) => handleSettingChange(event, 'seaWaterColor', 'color')} />
        <ColorControl label={seaLabel('Цвет глубины', 'Deep colour', language)} value={settings.seaDeepColor} onChange={(event) => handleSettingChange(event, 'seaDeepColor', 'color')} />
        <ColorControl label={seaLabel('Цвет дна', 'Bed colour', language)} value={settings.seaBedColor} onChange={(event) => handleSettingChange(event, 'seaBedColor', 'color')} />
        <SeaRange settings={settings} handleSettingChange={handleSettingChange} setting="seaBedTurbidity" ru="Мутность воды" en="Water turbidity" language={language} />
        <SeaRange settings={settings} handleSettingChange={handleSettingChange} setting="seaCrestGlow" ru="Просвет гребня" en="Crest glow" language={language} />
        <SeaRange settings={settings} handleSettingChange={handleSettingChange} setting="seaGlint" ru="Блики солнца" en="Sun glints" language={language} />
        <SeaRange settings={settings} handleSettingChange={handleSettingChange} setting="seaSkyReflection" ru="Отражение неба" en="Sky reflection" language={language} />
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
    </>;
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
