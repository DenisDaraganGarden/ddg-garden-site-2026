import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl, ColorControl, RangeControl, SelectControl } from '../../HomeEditorControls';
import { SURFBOARD_CHOICES, SURFBOARD_RANGES } from '../../../../../components/surfboard/settings.js';
import { leaveAuto } from '../../../../../components/surfboard/surfPlayStore.js';

// Limits and steps come from the settings module, so a slider can never offer
// a value the normalizer would clamp away on the next load.
const range = (key, r, e, unit, onChange, settings, ru) => {
  const [min, max, step] = SURFBOARD_RANGES[key];
  return <RangeControl controlId={key} key={key} label={ru ? r : e} value={settings[key]} min={min} max={max} step={step} unit={unit} formatValue={n => Number(n.toFixed(3))} onChange={onChange} />;
};

const shape = [
  ['surfboardLength', 'Длина', 'Length', ' m'],
  ['surfboardWidth', 'Ширина', 'Width', ' m'],
  ['surfboardThickness', 'Толщина', 'Thickness', ' m'],
  ['surfboardNoseRocker', 'Прогиб носа', 'Nose rocker', ' m'],
  ['surfboardTailRocker', 'Прогиб хвоста', 'Tail rocker', ' m'],
];
const colors = [
  ['surfboardDeckColor', 'Дека', 'Deck'],
  ['surfboardRailColor', 'Канты', 'Rails'],
  ['surfboardStripeColor', 'Цвет полос', 'Stripe colour'],
  ['surfboardStringerColor', 'Стрингер', 'Stringer'],
  ['surfboardFinColor', 'Плавники', 'Fins'],
];
const ride = [
  ['surfboardMass', 'Вес доски', 'Board weight', ' kg'],
  ['surfboardRiderMass', 'Вес райдера', 'Rider weight', ' kg'],
  ['surfboardPaddle', 'Гребок', 'Paddle', ''],
  ['surfboardCarve', 'Поворот', 'Carve', ''],
  ['surfboardBalance', 'Баланс', 'Balance', ''],
  ['surfboardCameraFov', 'Угол обзора от первого лица', 'First-person field of view', '°'],
  ['surfboardWakeWaves', 'Волны от доски', 'Wake waves', ''],
  ['surfboardWakeFoam', 'Пена от доски', 'Board foam', ''],
];
const place = [
  ['surfboardCheckpointX', 'Положение X', 'Position X', ' m'],
  ['surfboardCheckpointZ', 'Положение Z', 'Position Z', ' m'],
  ['surfboardCheckpointYaw', 'Курс', 'Heading', '°'],
];

export function SurfboardBoardSection({ settings, handleSettingChange }) {
  const { language } = useLanguage();
  const ru = language === 'ru';
  return <>
    {shape.map(([key, r, e, unit]) => range(key, r, e, unit, event => handleSettingChange(event, key), settings, ru))}
    {range('surfboardStripes', 'Полосы', 'Stripes', '', event => handleSettingChange(event, 'surfboardStripes', 'integer'), settings, ru)}
    {colors.map(([key, r, e]) => <ColorControl controlId={key} key={key} label={ru ? r : e} value={settings[key]} onChange={event => handleSettingChange(event, key, 'color')} />)}
  </>;
}

const looks = { human: ['Человек', 'Human'], skeleton: ['Скелет', 'Skeleton'], both: ['Человек и скелет', 'Human and skeleton'] };

export function SurfboardRideSection({ settings, handleSettingChange }) {
  const { language } = useLanguage();
  const ru = language === 'ru';
  return <>
    <SelectControl controlId="surfboardRiderLook" label={ru ? 'Райдер' : 'Rider'} value={settings.surfboardRiderLook}
      options={SURFBOARD_CHOICES.surfboardRiderLook.map((value) => ({ value, label: looks[value][ru ? 0 : 1] }))}
      onChange={event => handleSettingChange(event, 'surfboardRiderLook', 'string')} />
    {ride.map(([key, r, e, unit]) => range(key, r, e, unit, event => handleSettingChange(event, key), settings, ru))}
  </>;
}

// The checkpoint is where the board waits in the editor and where play starts
// and restarts. Placing it by hand, with a slider or from the view, turns
// «auto» off: otherwise the board would stay at the wave and the slider would
// look broken. Leaving auto keeps the spot the board stood at for whatever the
// edit does not set, and at the wave the sliders show that spot, so what they
// read is where the board is.
export function SurfboardCheckpointSection({ settings, handleSettingChange, applySettings, layoutEditor }) {
  const { language } = useLanguage();
  const ru = language === 'ru';
  const shown = { ...settings, ...leaveAuto(settings, {}) };
  const placeAtView = () => {
    const target = layoutEditor?.capturePose?.()?.cameraTarget;
    if (target) applySettings(leaveAuto(settings, { surfboardCheckpointX: target.x, surfboardCheckpointZ: target.z }));
  };
  return <>
    <div className="home-editor-tabs">
      <button type="button" className="home-editor-tab active" disabled={!layoutEditor?.startPlay} data-testid="surfboard-play" onClick={() => layoutEditor?.startPlay?.()}>{ru ? 'Играть ▸ (P)' : 'Play ▸ (P)'}</button>
    </div>
    <CheckboxControl controlId="surfboardCheckpointAuto" label={ru ? 'У волны, сам' : 'At the wave, automatic'} checked={settings.surfboardCheckpointAuto} onChange={event => (event.target.checked ? handleSettingChange(event, 'surfboardCheckpointAuto', 'boolean') : applySettings(leaveAuto(settings, {})))} />
    {place.map(([key, r, e, unit]) => range(key, r, e, unit, event => applySettings(leaveAuto(settings, { [key]: Number(event.target.value) })), shown, ru))}
    <div className="home-editor-tabs">
      <button type="button" className="home-editor-tab" disabled={!layoutEditor?.capturePose} onClick={placeAtView}>{ru ? 'Поставить в центр вида' : 'Place at the view centre'}</button>
      <button type="button" className="home-editor-tab" onClick={() => layoutEditor?.frameObject?.('surfboard-anchor')}>{ru ? 'Показать' : 'Show'}</button>
    </div>
  </>;
}
