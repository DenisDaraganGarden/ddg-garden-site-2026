import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { RangeControl, SectionHeading } from '../../HomeEditorControls';
import { TERRAIN_RANGES } from '../../../../../terrain/settings.js';
import { PLANTING_RANGES } from '../../../../../planting/settings.js';

// Ветер — один на сцену, в любом проекте: по нему гнутся растения берега
// (кусты, деревья, травы), качаются растения сада — посадки, лианы,
// 2D-растения модели (planting/wind.js) — и бежит береговая волна. Ключи —
// рельефа (terrain*): на них же прибой и пена; здесь они потому, что ветер —
// погода, а не рельеф.
const WIND = [
    ['terrainWindBearing', 'Направление ветра', 'Wind bearing', '°'],
    ['terrainWindSpeed', 'Скорость ветра', 'Wind speed', ' m/s'],
    ['terrainStorm', 'Шторм', 'Storm', ''],
];

export function WindSection({ settings, handleSettingChange }) {
    const { language } = useLanguage(), ru = language === 'ru';
    const [min, max, step] = PLANTING_RANGES.sway;
    return <>
        {WIND.map(([key, r, e, unit]) => {
            const [low, high, by] = TERRAIN_RANGES[key];
            return <RangeControl key={key} controlId={key} label={ru ? r : e} value={settings[key]} min={low} max={high} step={by} unit={unit} formatValue={(n) => Number(n.toFixed(2))} onChange={(event) => handleSettingChange(event, key)} />;
        })}
        <SectionHeading label={ru ? 'Сад' : 'Garden'} subtle />
        <RangeControl controlId="plantingSway" label={ru ? 'Качание сада' : 'Garden sway'} value={settings.plantingSway ?? 1} min={min} max={max} step={step} unit=" ×" onChange={(event) => handleSettingChange(event, 'plantingSway')} />
    </>;
}
