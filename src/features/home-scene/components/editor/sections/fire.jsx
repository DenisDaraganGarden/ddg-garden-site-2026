import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { CheckboxControl, ColorControl, RangeControl, SectionHeading, SelectControl } from '../../HomeEditorControls';
import { useFocusControlScope } from '../focus/FocusControlsContext';
import { FIRE_POINTS_MAX, FIRE_RANGES } from '../../../../../fire/settings.js';

// Огонь по следу. Выключатель сверху — из реестра. Точки следа — в местной
// системе рамы: выбранная точка получает свои два ползунка и ручку в сцене;
// в каталоге (⌘K, справочник) видны все точки.
const groups = [
  ['Рама следа', 'Trail frame', [
    ['fireX', 'Восток / запад · X', 'East / west · X', 'm', 0.1],
    ['fireZ', 'Юг / север · Z', 'South / north · Z', 'm', 0.1],
    ['fireYaw', 'Поворот', 'Turn', '°', 1],
    ['fireScale', 'Масштаб', 'Scale', '×', 0.01]]],
  ['Фронт', 'Front', [
    ['fireDelay', 'Задержка поджига', 'Ignition delay', 's', 0.1],
    ['fireSpeed', 'Скорость фронта', 'Front speed', 'm/s', 0.1],
    ['fireBurn', 'Время горения места', 'Burn time per spot', 's', 0.5],
    ['fireLoop', 'Повторять', 'Repeat', 'toggle'],
    ['fireLoopPause', 'Пауза перед повтором', 'Pause before repeat', 's', 0.5]]],
  ['Пламя', 'Flames', [
    ['fireWidth', 'Ширина колеи', 'Track width', 'm', 0.05],
    ['fireHeight', 'Высота', 'Height', 'm', 0.05],
    ['fireIntensity', 'Яркость', 'Brightness', '×', 0.05],
    ['fireTurbulence', 'Турбулентность', 'Turbulence', '', 0.05],
    ['fireColorHot', 'Цвет ядра', 'Core colour', 'color'],
    ['fireColorCool', 'Цвет языков', 'Tongue colour', 'color']]],
  ['Дым', 'Smoke', [
    ['fireSmoke', 'Дым', 'Smoke', 'toggle'],
    ['fireSmokeAmount', 'Количество', 'Amount', '×', 0.05],
    ['fireSmokeRise', 'Подъём', 'Rise', 'm/s', 0.1],
    ['fireSmokeLife', 'Жизнь', 'Lifetime', 's', 0.5],
    ['fireSmokeSize', 'Размер клуба', 'Puff size', 'm', 0.1],
    ['fireSmokeWind', 'Доля ветра берега', 'Share of coast wind', '×', 0.05],
    ['fireSmokeOpacity', 'Плотность', 'Density', '', 0.01],
    ['fireSmokeColor', 'Цвет', 'Colour', 'color']]],
  ['Свет', 'Light', [
    ['fireLight', 'Свет от огня', 'Light from the fire', 'toggle'],
    ['fireLightIntensity', 'Сила света', 'Intensity', '', 1],
    ['fireLightDistance', 'Дальность света', 'Reach', 'm', 0.5]]],
  ['Земля', 'Ground', [
    ['fireTrack', 'Колея и копоть', 'Track and soot', 'toggle'],
    ['fireTrackDark', 'Темнота следа', 'Track darkness', '', 0.01],
    ['fireSootFade', 'Копоть сходит за', 'Soot fades in', 's', 5]]],
];

export function FireSection({ settings, handleSettingChange }) {
  const ru = useLanguage().language === 'ru';
  const catalog = Boolean(useFocusControlScope()?.catalogOnly);
  const count = Math.max(2, Math.min(FIRE_POINTS_MAX, Math.round(settings.firePointCount) || 2));
  const selected = Math.min(count, Math.round(settings.fireEditPoint) || 0);
  const points = catalog ? Array.from({ length: FIRE_POINTS_MAX }, (_, i) => i + 1) : (selected ? [selected] : []);
  const control = ([key, r, e, unit, step]) => {
    if (unit === 'toggle') return <CheckboxControl controlId={key} key={key} label={ru ? r : e} checked={Boolean(settings[key])} onChange={(event) => handleSettingChange(event, key, 'boolean')} />;
    if (unit === 'color') return <ColorControl controlId={key} key={key} label={ru ? r : e} value={settings[key]} onChange={(event) => handleSettingChange(event, key, 'color')} />;
    const [min, max] = FIRE_RANGES[key];
    return <RangeControl controlId={key} key={key} label={ru ? r : e} value={settings[key]} min={min} max={max} step={step} unit={unit} formatValue={(n) => Number(Number(n).toFixed(2))} onChange={(event) => handleSettingChange(event, key)} />;
  };
  return <>
    <SectionHeading label={ru ? 'Точки следа' : 'Trail points'} subtle />
    <RangeControl controlId="firePointCount" label={ru ? 'Точек' : 'Points'} value={count} min={2} max={FIRE_POINTS_MAX} step={1} onChange={(event) => handleSettingChange(event, 'firePointCount', 'integer')} />
    <SelectControl
      controlId="fireEditPoint"
      label={ru ? 'Ручка в сцене' : 'Handle in the scene'}
      value={selected}
      options={[{ value: 0, label: ru ? 'Весь след' : 'Whole trail' }, ...Array.from({ length: count }, (_, i) => ({ value: i + 1, label: ru ? `Точка ${i + 1}` : `Point ${i + 1}` }))]}
      onChange={(event) => handleSettingChange(event, 'fireEditPoint', 'integer')}
    />
    {points.flatMap((n) => [
      control([`fireP${n}X`, `Точка ${n} · поперёк X`, `Point ${n} · across X`, 'm', 0.1]),
      control([`fireP${n}Z`, `Точка ${n} · вдоль Z`, `Point ${n} · along Z`, 'm', 0.1]),
    ])}
    {groups.map(([r, e, controls]) => <React.Fragment key={r}><SectionHeading label={ru ? r : e} subtle />{controls.map(control)}</React.Fragment>)}
  </>;
}
