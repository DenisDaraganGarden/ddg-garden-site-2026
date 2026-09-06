import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { RangeControl } from '../../HomeEditorControls';
import { TERRAIN_RANGES } from '../../../../../terrain/settings.js';

// Boulders, debris and pebbles are terrain keys (terrain*) with their own nodes
// in the landscape group; the switches above these sliders come from the
// scene object registry.
const sliders = (settings, handleSettingChange, ru, rows) => rows.map(([key, r, e, unit]) => {
  const [min, max, step] = TERRAIN_RANGES[key];
  return <RangeControl key={key} label={ru ? r : e} value={settings[key]} min={min} max={max} step={step} unit={unit} formatValue={(n) => Number(n.toFixed(2))} onChange={(event) => handleSettingChange(event, key)} />;
});

export function RocksSection({ settings, handleSettingChange }) {
  const ru = useLanguage().language === 'ru';
  return <>{sliders(settings, handleSettingChange, ru, [
    ['terrainRocks', 'Валуны · плотность', 'Boulders · density', ''],
    ['terrainRockSize', 'Валуны · размер', 'Boulders · size', '×'],
    ['terrainDebris', 'Осыпь · плотность', 'Debris · density', ''],
  ])}</>;
}

export function PebblesSection({ settings, handleSettingChange }) {
  const ru = useLanguage().language === 'ru';
  return <>{sliders(settings, handleSettingChange, ru, [
    ['terrainPebbles', 'Плотность', 'Density', ''],
    ['terrainPebbleSize', 'Размер', 'Size', '×'],
  ])}</>;
}
