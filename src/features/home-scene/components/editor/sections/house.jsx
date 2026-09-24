import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl, ColorControl, RangeControl } from '../../HomeEditorControls';
import { HOUSE_SETTING_RANGES } from '../../../../../components/house/settings.js';

// Bikini Point: the beach house, its shed and the surfers' things
// (components/house). Limits and steps come from the settings module, so a
// slider can never offer a value the normalizer would clamp away.
const range = (key, r, e, unit, onChange, settings, ru) => {
  const [min, max, step] = HOUSE_SETTING_RANGES[key];
  return <RangeControl controlId={key} key={key} label={ru ? r : e} value={settings[key]} min={min} max={max} step={step} unit={unit} formatValue={n => Number(n.toFixed(2))} onChange={onChange} />;
};
const colour = ([key, r, e], settings, ru, handleSettingChange) => (
  <ColorControl controlId={key} key={key} label={ru ? r : e} value={settings[key]} onChange={event => handleSettingChange(event, key, 'color')} />
);

const place = [
  ['houseX', 'Положение X', 'Position X', ' m'],
  ['houseZ', 'Положение Z', 'Position Z', ' m'],
  ['houseHeading', 'Курс', 'Heading', '°'],
];
const shape = [
  ['houseWidth', 'Ширина дома', 'House width', ' m'],
  ['houseLength', 'Длина дома', 'House length', ' m'],
  ['houseFloorHeight', 'Высота свай', 'Stilt height', ' m'],
  ['houseRoofPitch', 'Уклон крыши', 'Roof pitch', '°'],
  ['housePorchDepth', 'Глубина веранды', 'Porch depth', ' m'],
];
const wear = [
  ['houseWeather', 'Подтёки и выцветание', 'Streaks and fading', ''],
  ['houseDamage', 'Сломанные доски', 'Broken boards', ''],
  ['houseSag', 'Проседание', 'Sagging', ''],
];
const paint = [
  ['houseSidingColor', 'Обшивка', 'Siding'],
  ['houseShakesColor', 'Дранка пристройки', 'Lean-to shakes'],
  ['houseTrimColor', 'Белые доски', 'White boards'],
  ['houseDeckColor', 'Настил', 'Decking'],
  ['houseWoodColor', 'Сваи и каркас', 'Stilts and frame'],
  ['houseRoofColor', 'Кровля', 'Roofing'],
  ['houseMetalColor', 'Профлист', 'Corrugated iron'],
  ['houseGlassColor', 'Стекло', 'Glass'],
  ['houseDoorColor', 'Двери', 'Doors'],
  ['houseAwningColor', 'Ставни', 'Shutters'],
  ['houseShedWallColor', 'Сарай', 'Shed'],
  ['houseShedRoofColor', 'Крыша сарая', 'Shed roof'],
  ['houseRopeColor', 'Верёвка', 'Rope'],
  ['houseUnitColor', 'Кондиционер', 'Air conditioner'],
  ['houseVoidColor', 'Дыры', 'Holes'],
  ['houseLampColor', 'Фонари', 'Lanterns'],
];
const thingColours = [
  ['houseCampChairsColor', 'Шезлонги', 'Deck chairs'],
  ['houseCampHammockColor', 'Гамак', 'Hammock'],
  ['houseCampCurtainColor', 'Занавеска', 'Curtain'],
  ['houseCampFlagsColor', 'Флажки', 'Flags'],
  ['houseCampMachineColor', 'Автомат', 'Drinks machine'],
  ['houseCampMachineSideColor', 'Бок автомата', 'Machine side'],
];

export function HouseTransformSection({ settings, handleSettingChange, applySettings, layoutEditor }) {
  const { language } = useLanguage();
  const ru = language === 'ru';
  const placeAtView = () => {
    const target = layoutEditor?.capturePose?.()?.cameraTarget;
    if (target) applySettings({ houseX: target.x, houseZ: target.z });
  };
  return <>
    {place.map(([key, r, e, unit]) => range(key, r, e, unit, event => handleSettingChange(event, key), settings, ru))}
    <div className="home-editor-tabs">
      <button type="button" className="home-editor-tab" disabled={!layoutEditor?.capturePose} onClick={placeAtView}>{ru ? 'Поставить в центр вида' : 'Place at the view centre'}</button>
      <button type="button" className="home-editor-tab" onClick={() => layoutEditor?.frameObject?.('beach-house')}>{ru ? 'Показать' : 'Show'}</button>
    </div>
    {shape.map(([key, r, e, unit]) => range(key, r, e, unit, event => handleSettingChange(event, key), settings, ru))}
    {range('houseSeed', 'Вариант досок', 'Board variant', '', event => handleSettingChange(event, 'houseSeed', 'integer'), settings, ru)}
    <CheckboxControl controlId="houseShed" label={ru ? 'Сарай' : 'Shed'} checked={settings.houseShed} onChange={event => handleSettingChange(event, 'houseShed', 'boolean')} />
  </>;
}

export function HouseWearSection({ settings, handleSettingChange }) {
  const { language } = useLanguage();
  const ru = language === 'ru';
  return <>{wear.map(([key, r, e, unit]) => range(key, r, e, unit, event => handleSettingChange(event, key), settings, ru))}</>;
}

export function HousePaintSection({ settings, handleSettingChange }) {
  const { language } = useLanguage();
  const ru = language === 'ru';
  return <>{paint.map((row) => colour(row, settings, ru, handleSettingChange))}</>;
}

export function HouseLightSection({ settings, handleSettingChange }) {
  const { language } = useLanguage();
  const ru = language === 'ru';
  return <>
    {range('houseLamps', 'Лампы в доме', 'House lamps', '', event => handleSettingChange(event, 'houseLamps'), settings, ru)}
    {range('houseGarlands', 'Гирлянды', 'String lights', '', event => handleSettingChange(event, 'houseGarlands'), settings, ru)}
  </>;
}

export function HouseThingsSection({ settings, handleSettingChange }) {
  const { language } = useLanguage();
  const ru = language === 'ru';
  return <>
    <CheckboxControl controlId="houseCamp" label={ru ? 'Вещи серферов' : 'Surfers’ things'} checked={settings.houseCamp} onChange={event => handleSettingChange(event, 'houseCamp', 'boolean')} />
    {range('houseCampSeed', 'Раскладка', 'Arrangement', '', event => handleSettingChange(event, 'houseCampSeed', 'integer'), settings, ru)}
    {range('houseCampWind', 'Ветер', 'Wind', '', event => handleSettingChange(event, 'houseCampWind'), settings, ru)}
    {range('houseCampHue', 'Оттенок вещей', 'Hue of the things', '°', event => handleSettingChange(event, 'houseCampHue'), settings, ru)}
    {range('houseCampFade', 'Выгорание на солнце', 'Sun fading', '', event => handleSettingChange(event, 'houseCampFade'), settings, ru)}
    {thingColours.map((row) => colour(row, settings, ru, handleSettingChange))}
  </>;
}
