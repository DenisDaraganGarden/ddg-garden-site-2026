import React from 'react';
import {useLanguage} from '../../../../../i18n/useLanguage';
import {ColorControl,RangeControl,SectionHeading} from '../../HomeEditorControls';
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
 ['Дальнее поле','Far field',[
  ['grassFieldCoverage','Покрытие','Coverage',''],['grassFieldContrast','Контраст пятен','Patch contrast',''],['grassFieldWaves','Волны ветра','Wind waves',''],['grassFieldSheen','Блеск по ветру','Wind sheen',''],['grassFieldScale','Масштаб полос','Band scale',' m'],['grassFieldBlend','Дальность перехода','Blend distance',' m'],['grassFieldHeight','Затемнение у корней','Root shading',''],
  ['grassFieldFresh','Цвет свежей травы','Fresh grass colour','color'],['grassFieldDry','Цвет сухой травы','Dry grass colour','color']]],
];
export function GrassSection({settings,handleSettingChange}){
 const ru=useLanguage().language==='ru';
 return <>{groups.map(([r,e,controls])=><React.Fragment key={r}><SectionHeading label={ru?r:e} subtle/>{controls.map(([key,label,en,unit])=>{
  if(unit==='color')return <ColorControl key={key} label={ru?label:en} value={settings[key]} onChange={event=>handleSettingChange(event,key,'color')}/>;
  const [min,max,step]=GRASS_RANGES[key];
  return <RangeControl key={key} label={ru?label:en} value={settings[key]} min={min} max={max} step={step} unit={unit} formatValue={n=>Number(n.toFixed(2))} onChange={event=>handleSettingChange(event,key)}/>;
 })}</React.Fragment>)}</>;
}
