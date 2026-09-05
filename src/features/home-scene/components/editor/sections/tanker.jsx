import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { RangeControl, CheckboxControl } from '../../HomeEditorControls';
const controls = [
  ['tankerX', 'Восток / запад · X', 'East / west · X', -8000, 8000, 10, ' m'],
  ['tankerZ', 'Юг / север · Z', 'South / north · Z', -8000, 8000, 10, ' m'],
  ['tankerBearing', 'Курс от севера', 'Bearing from north', 0, 360, 1, '°'],
  ['tankerSpeed', 'Скорость', 'Speed', 0, 14, 0.1, ' kn'],
  ['tankerRouteLength', 'Длина маршрута', 'Route length', 500, 16000, 100, ' m'],
  ['tankerSeaState', 'Качка', 'Swell response', 0, 1, 0.01, ''],
  ['tankerWear', 'Износ окраски', 'Paint wear', 0, 1, 0.01, ''],
  ['tankerWetness', 'Влажность корпуса', 'Hull wetness', 0, 1, 0.01, ''],
  ['tankerRoughness', 'Шероховатость', 'Roughness', 0.1, 1, 0.01, ''],
];
export function TankerSection({ settings, handleSettingChange }) {
  const { language } = useLanguage();
  const ru = language === 'ru';
  return <>
    {[['tankerVisible', 'Танкер', 'Tanker'], ['tankerTravel', 'Движение по маршруту', 'Travel'], ['tankerWake', 'Кильватерный след', 'Wake']].map(([key, r, e]) =>
      <CheckboxControl key={key} label={ru ? r : e} checked={settings[key]} onChange={event => handleSettingChange(event, key, 'boolean')} />)}
    {controls.map(([key, r, e, min, max, step, unit]) => <RangeControl key={key} label={ru ? r : e} value={settings[key]} min={min} max={max} step={step} unit={unit} formatValue={n => Number(n.toFixed(2))} onChange={event => handleSettingChange(event, key)} />)}
  </>;
}
