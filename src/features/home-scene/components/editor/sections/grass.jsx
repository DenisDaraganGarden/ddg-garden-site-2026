import React from 'react';
import {useLanguage} from '../../../../../i18n/useLanguage';
import {RangeControl,SectionHeading} from '../../HomeEditorControls';
import {GRASS_RANGES} from '../../../../../plants/settings.js';

// Wind, gusts and the landscape's colour ecology are the shrubs' sliders;
// here only what is the grass's own. The switch above comes from the registry.
const groups=[
 ['Посадка','Planting',[
  ['grassSeed','Вариант','Seed',''],['grassDensity','Плотность','Density','×'],['grassStipa','Ковыль','Feather grass',''],['grassFestuca','Типчак','Fescue',''],['grassLeymus','Колосняк','Dune grass',''],['grassPhragmites','Тростник','Reed','']]],
 ['Форма','Form',[
  ['grassHeight','Высота','Height','×'],['grassFlex','Гибкость','Flexibility','']]],
 ['Окраска','Colour',[
  ['grassDryness','Сухость относительно кустов','Dryness relative to shrubs','']]],
 ['Дальность','Distance',[
  ['grassRenderDistance','Дальность отрисовки','Render distance',' m']]],
];
export function GrassSection({settings,handleSettingChange}){
 const ru=useLanguage().language==='ru';
 return <>{groups.map(([r,e,controls])=><React.Fragment key={r}><SectionHeading label={ru?r:e} subtle/>{controls.map(([key,label,en,unit])=>{
  const [min,max,step]=GRASS_RANGES[key];
  return <RangeControl key={key} label={ru?label:en} value={settings[key]} min={min} max={max} step={step} unit={unit} formatValue={n=>Number(n.toFixed(2))} onChange={event=>handleSettingChange(event,key)}/>;
 })}</React.Fragment>)}</>;
}
