import React from 'react';
import {useLanguage} from '../../../../../i18n/useLanguage';
import {RangeControl,SectionHeading} from '../../HomeEditorControls';
import {TREE_RANGES} from '../../../../../plants/settings.js';
import {createCoastTreePlanting} from '../../../../../plants/coastPlanting.js';
import {createTerrainDefinition,createTerrainQuery} from '../../../../../terrain/terrainModel.js';
import {buildCoastRocks,attachRockCollisions} from '../../../../../terrain/terrainRocks.js';
const groups=[
 ['Лесополоса за бровкой','Shelterbelt behind the crest',[
 ['treesCount','Количество','Count',''],['treesLength','Вдоль берега','Alongshore extent',' m'],['treesWidth','Ширина посадки','Planting width',' m'],['treesAlong','Смещение вдоль берега','Alongshore offset',' m'],['treesInland','Отступ от бровки','Crest offset',' m'],['treesSpacing','Расстояние между стволами','Trunk spacing',' m'],['treesSeed','Вариант дерева','Tree seed','']]],
 ['Ниши','Niches',[
 ['treesBluff','Бровка','Bluff edge',''],['treesRavines','Балки и оползни','Ravines and slides',''],['treesBeach','Тыл пляжа','Back beach',''],['treesSnags','Сухостой','Snags','']]],
 ['Виды','Species',[
 ['treesOleaster','Лох','Oleaster',''],['treesElm','Вяз','Elm',''],['treesPlum','Алыча','Plum',''],['treesTamarisk','Гребенщик','Tamarisk',''],['treesWillow','Ива','Willow','']]],
 ['Лох узколистный, взрослое дерево','Mature oleaster',[
 ['treesHeight','Высота','Height',' m'],['treesSpread','Ширина кроны','Crown width',' m'],['treesLean','Наклон от ветра','Wind lean',''],['treesTwist','Кручение ствола','Trunk twist',''],['treesDensity','Облиственность','Leaf density',''],['treesLeafSize','Размер листа','Leaf size',''],['treesDeadwood','Сухие ветви','Deadwood','']]],
 ['Реакция на ветер','Wind response',[
 ['treesFlex','Гибкость','Flexibility','']]],
 ['Свет','Light',[
 ['treesTranslucency','Просвечивание листа','Leaf translucency','']]],
 ['Дальность','Distance',[
 ['treesRenderDistance','Дальность отрисовки','Render distance',' m']]],
];
export function TreesSection({settings,handleSettingChange,layoutEditor}){
 const {language}=useLanguage(),ru=language==='ru';
 const preview=(close,niche='belt')=>{
  const definition=createTerrainDefinition(settings),query=attachRockCollisions(createTerrainQuery(definition),buildCoastRocks(definition)),all=createCoastTreePlanting(query,definition,settings),plants=all.filter(p=>p.niche===niche);
  if(!plants.length)return;
  const centre=plants.reduce((sum,p)=>({x:sum.x+p.x/plants.length,z:sum.z+p.z/plants.length}),{x:0,z:0});
  const p=plants.reduce((best,p)=>Math.hypot(p.x-centre.x,p.z-centre.z)<Math.hypot(best.x-centre.x,best.z-centre.z)?p:best,plants[0]);
  const crown=settings.treesHeight*p.scale,inland=close?7:24,side=close?5:16;
  const x=p.x+definition.landX*inland+definition.alongX*side,z=p.z+definition.landZ*inland+definition.alongZ*side;
  layoutEditor?.previewPose?.({cameraPosition:{x,y:query.heightAt(x,z)+(close?1.7:7),z},cameraTarget:{x:p.x,y:p.y+crown*(close?.5:.55),z:p.z},cameraFov:close?55:50});
 };
 return <>
  <div className="home-editor-tabs">{[[false,'belt','Роща','Grove'],[true,'belt','Дерево вблизи','Tree close-up'],[false,'bluff','Бровка','Bluff edge'],[false,'ravine','Балка','Ravine'],[false,'beach','Пляж','Beach']].map(([close,niche,r,e])=><button type="button" key={r} className="home-editor-tab" onClick={()=>preview(close,niche)}>{ru?r:e}</button>)}</div>
  <div className="home-editor-status">{ru?'Окраска, порывы и трепет листьев — общие с кустарниками.':'Colour, gusts and leaf flutter are shared with the shrubs.'}</div>
  {groups.map(([r,e,controls])=><React.Fragment key={r}><SectionHeading label={ru?r:e} subtle/>{controls.map(([key,r,e,unit])=>{const[min,max,step]=TREE_RANGES[key];return <RangeControl key={key} label={ru?r:e} value={settings[key]} min={min} max={max} step={step} unit={unit} formatValue={n=>Number(n.toFixed(2))} onChange={event=>handleSettingChange(event,key)}/>;})}</React.Fragment>)}
 </>;
}
