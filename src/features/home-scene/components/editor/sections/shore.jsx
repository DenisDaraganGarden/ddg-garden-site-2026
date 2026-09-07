import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { RangeControl, SectionHeading } from '../../HomeEditorControls';
import { SHORE_RANGES } from '../../../../../shore/settings.js';
import { createShorePlacement } from '../../../../../shore/shorePlacement.js';
import { createTerrainDefinition, createTerrainQuery } from '../../../../../terrain/terrainModel.js';
import { buildCoastRocks, attachRockCollisions } from '../../../../../terrain/terrainRocks.js';

const groups = [
  ['Россыпь', 'Distribution', [
    ['shoreCount', 'Коряг', 'Wood pieces'], ['shoreLength', 'Вдоль берега', 'Alongshore extent', ' m'],
    ['shoreAlong', 'Смещение вдоль берега', 'Alongshore offset', ' m'], ['shoreSeed', 'Вариант', 'Seed'],
    ['shoreSize', 'Размер', 'Size', '×'], ['shoreBackBeach', 'Тыл пляжа', 'Back beach'],
    ['shoreLogs', 'Стволы и корневища', 'Logs and roots'], ['shoreStakes', 'Из песка', 'Upright timber'],
    ['shoreRings', 'Каменные круги', 'Stone rings'], ['shoreBurial', 'Заглубление', 'Burial'],
  ]],
  ['Материал', 'Material', [
    ['shoreBleach', 'Выбеленность', 'Bleaching'], ['shoreGrain', 'Волокна', 'Grain'],
    ['shoreBark', 'Остатки коры', 'Bark remnants'], ['shoreWetness', 'Влажность', 'Wetness'],
  ]],
  ['Дальность', 'Distance', [['shoreRenderDistance', 'Дальность отрисовки', 'Render distance', ' m']]],
];

export function ShoreSection({ settings, handleSettingChange, layoutEditor }) {
  const ru = useLanguage().language === 'ru';
  const preview = (kind) => {
    const definition = createTerrainDefinition(settings);
    const query = attachRockCollisions(createTerrainQuery(definition), buildCoastRocks(definition));
    const all = createShorePlacement(query, definition, settings);
    const candidates = kind ? all.filter((p) => p.kind === kind) : all;
    if (!candidates.length) return;
    const p = candidates.reduce((best, p) => Math.abs(p.s - settings.shoreAlong) < Math.abs(best.s - settings.shoreAlong) ? p : best);
    const distance = kind ? 5 * p.scale : 18;
    const x = p.x - definition.landX * distance + definition.alongX * distance * .5;
    const z = p.z - definition.landZ * distance + definition.alongZ * distance * .5;
    layoutEditor?.previewPose?.({ cameraPosition: { x, y: Math.max(query.heightAt(x, z), p.y) + (kind ? 2.1 : 6), z }, cameraTarget: { x: p.x, y: p.y + .3, z: p.z }, cameraFov: 50 });
  };
  return <>
    <div className="home-editor-tabs">{[[null, 'Пляж', 'Beach'], ['log', 'Ствол', 'Log'], ['root', 'Корневище', 'Root'], ['ring', 'Круг', 'Ring']].map(([kind, r, e]) => <button type="button" key={r} className="home-editor-tab" onClick={() => preview(kind)}>{ru ? r : e}</button>)}</div>
    {groups.map(([r, e, controls]) => <React.Fragment key={r}><SectionHeading label={ru ? r : e} subtle/>{controls.map(([key, r, e, unit]) => {
      const [min, max, step] = SHORE_RANGES[key];
      return <RangeControl key={key} label={ru ? r : e} value={settings[key]} min={min} max={max} step={step} unit={unit} formatValue={(n) => Number(n.toFixed(2))} onChange={(event) => handleSettingChange(event, key)}/>;
    })}</React.Fragment>)}
  </>;
}
