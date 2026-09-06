import React from 'react';
import {useLanguage} from '../../../../../i18n/useLanguage';
import {RangeControl,SectionHeading} from '../../HomeEditorControls';
import {SHRUB_RANGES} from '../../../../../plants/settings.js';
import {createCoastPlanting} from '../../../../../plants/coastPlanting.js';
import {createTerrainDefinition,createTerrainQuery} from '../../../../../terrain/terrainModel.js';
import {buildCoastRocks,attachRockCollisions} from '../../../../../terrain/terrainRocks.js';
const groups=[
 ['Посадка','Planting',[
 ['shrubsCount','Количество','Count',''],['shrubsLength','Вдоль берега','Alongshore extent',' m'],['shrubsWidth','Ширина посадки','Planting width',' m'],['shrubsAlong','Смещение вдоль берега','Alongshore offset',' m'],['shrubsInland','Отступ от обрыва','Bluff offset',' m'],['shrubsSeed','Вариант куста','Shrub seed','']]],
 ['Лох узколистный','Narrow-leaf oleaster',[
 ['shrubsHeight','Высота','Height',' m'],['shrubsSpread','Ширина кроны','Crown width',' m'],['shrubsDensity','Облиственность','Leaf density','']]],
 ['Окраска территории','Landscape colour',[
 ['shrubsDryness','Сухость','Dryness',''],['shrubsPatchScale','Размер пятен','Patch size',' m'],['shrubsPatchContrast','Контраст пятен','Patch contrast',''],['shrubsCrownVariation','Пятна в кроне','Crown variation',''],['shrubsCrownScale','Размер пятна в кроне','Crown patch size',' m'],['shrubsFieldSeed','Рисунок территории','Landscape seed',''],['shrubsTranslucency','Просвечивание','Translucency',''],['shrubsRoughness','Шероховатость','Roughness','']]],
 ['Реакция на ветер','Wind response',[
 ['shrubsGusts','Порывы','Gusts',''],['shrubsLodging','Примятость','Wind combing',''],['shrubsFlutter','Трепет листьев','Leaf flutter','']]],
 ['Дальность','Distance',[
 ['shrubsRenderDistance','Дальность отрисовки','Render distance',' m']]],
];
export function ShrubsSection({settings,handleSettingChange,layoutEditor}){
 const {language}=useLanguage(),ru=language==='ru';
 const preview=close=>{
  const definition=createTerrainDefinition(settings),query=attachRockCollisions(createTerrainQuery(definition),buildCoastRocks(definition)),plants=createCoastPlanting(query,definition,settings);
  if(!plants.length)return;
  const crest=plants.filter(p=>p.y>definition.terrainCliffHeight*.45&&query.normalAt(p.x,p.z).y>.94),candidates=crest.length?crest:plants;
  const p=candidates.reduce((best,p)=>Math.hypot(p.x,p.z)<Math.hypot(best.x,best.z)?p:best,candidates[0]);
  const inland=close?1.8:10,side=close?1.8:18;
  const x=p.x+definition.landX*inland+definition.alongX*side,z=p.z+definition.landZ*inland+definition.alongZ*side;
  layoutEditor?.previewPose?.({cameraPosition:{x,y:Math.max(p.y+(close?.95:6),query.heightAt(x,z)+.7),z},cameraTarget:{x:p.x,y:p.y+settings.shrubsHeight*.45,z:p.z},cameraFov:close?48:54});
 };
 return <>
  <div className="home-editor-tabs">{[[false,'Посадка','Planting'],[true,'Куст вблизи','Shrub close-up']].map(([close,r,e])=><button type="button" key={r} className="home-editor-tab" onClick={()=>preview(close)}>{ru?r:e}</button>)}</div>
  {groups.map(([r,e,controls])=><React.Fragment key={r}><SectionHeading label={ru?r:e} subtle/>{controls.map(([key,r,e,unit])=>{const[min,max,step]=SHRUB_RANGES[key];return <RangeControl key={key} label={ru?r:e} value={settings[key]} min={min} max={max} step={step} unit={unit} formatValue={n=>Number(n.toFixed(2))} onChange={event=>handleSettingChange(event,key)}/>;})}</React.Fragment>)}
 </>;
}
