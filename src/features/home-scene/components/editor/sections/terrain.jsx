import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { RangeControl,SectionHeading } from '../../HomeEditorControls';
import { TERRAIN_RANGES } from '../../../../../terrain/settings.js';
import { coastProfile } from '../../../../../terrain/terrainLandforms.js';
import { createTerrainDefinition,coastPoint,sampleTerrainHeight } from '../../../../../terrain/terrainModel.js';
const groups=[
 ['Береговая линия','Coastline',[
  ['terrainBearing','Направление суши от севера','Landward bearing','°'],['terrainOffset','Смещение берега','Shore offset',' m'],['terrainLength','Длина побережья','Coast length',' m'],['terrainLandWidth','Глубина суши','Inland extent',' m'],['terrainCurve','Изгибы берега','Shore curvature',' m'],['terrainSeed','Вариант рельефа','Terrain seed','']]],
 ['Пляж и обрыв','Beach and bluff',[
  ['terrainBeachWidth','Ширина пляжа','Beach width',' m'],['terrainCliffHeight','Высота обрыва','Bluff height',' m'],['terrainCliffSlope','Ширина склона','Bluff slope width',' m'],['terrainCapeDepth','Выступ мыса','Cape projection',' m'],['terrainCapePosition','Положение мыса вдоль берега','Cape along coast',' m'],['terrainCapeWidth','Ширина мыса','Cape width',' m'],['terrainRocks','Каменные осыпи','Rock scatter','']]],
 ['Эрозия и спуски','Erosion and access',[
  ['terrainFeatureScale','Масштаб участков','Landform spacing',' m'],['terrainLandslides','Оползни и обвалы','Landslides',''],['terrainErosion','Промоины и расщелины','Ravines and rills',''],['terrainPaths','Частота спусков','Descent frequency',''],['terrainPathWidth','Ширина тропы','Path width',' m']]],
 ['Поверхность','Surface',[
  ['terrainShells','Ракушечник','Shell coverage',''],['terrainTextureScale','Масштаб фактуры','Texture frequency',''],['terrainRelief','Рельеф поверхности','Surface relief',''],['terrainParallax','Параллакс','Parallax',''],['terrainGroundCover','Растительный покров грунта','Ground vegetation cover',''],['terrainSoil','Почвенный слой','Soil cap',''],['terrainWeathering','Выветривание','Weathering','']]],
 ['Прибой','Surf',[
  ['terrainWaveHeight','Высота прибрежной волны','Shore wave height',' m'],['terrainWavePeriod','Период волны','Wave period',' s'],['terrainFoam','Пена прибоя','Surf foam',''],['terrainWetBand','Влажная кромка','Wet margin',' m']]],
 ['Ветер и среда','Wind and habitat',[
  ['terrainWindBearing','Направление ветра от севера','Wind bearing','°'],['terrainWindSpeed','Скорость ветра','Wind speed',' m/s'],['terrainStorm','Шторм','Storm',''],['terrainBloom','Цветение воды','Water bloom','']]],
];
export function TerrainSection({settings,handleSettingChange,layoutEditor}) {
 const {language}=useLanguage();const ru=language==='ru';
 const preview=(kind)=>{
  const p=createTerrainDefinition(settings);
  if(['bluff','descent','cover'].includes(kind)){
   let best={s:0,score:-1};
   for(let s=-Math.min(160,p.terrainLength*.25);s<Math.min(160,p.terrainLength*.25);s+=.5){const f=coastProfile(s,p),score=kind==='descent'?f.descent:f.slide;if(score>best.score)best={s,score};}
   const f=coastProfile(best.s,p),close=kind==='cover';
   const position=coastPoint(close?f.top+5:f.foot-7,best.s+(close?-1.8:-13),p);
   const target=coastPoint(close?f.top+5:(f.foot+f.top)*.5,best.s,p);
   layoutEditor?.previewPose?.({cameraPosition:{...position,y:Math.max(0,sampleTerrainHeight(position.x,position.z,p))+(close?.4:4.2)},cameraTarget:{...target,y:sampleTerrainHeight(target.x,target.z,p)+(close?.04:.6)},cameraFov:close?48:57});return;
  }
  const views={coast:[3,-35,1.65,1,65,1.1,58],sea:[7,0,1.65,-900,-350,0,52],shells:[2,-2,.28,3,0,.02,48],overview:[-42,95,48,18,-20,3,54]};
  const [q,s,y,tq,ts,ty,fov]=views[kind],position=coastPoint(q,s,p),target=coastPoint(tq,ts,p);
  layoutEditor?.previewPose?.({cameraPosition:{...position,y:Math.max(sampleTerrainHeight(position.x,position.z,p),0)+y},cameraTarget:{...target,y:Math.max(sampleTerrainHeight(target.x,target.z,p),0)+ty},cameraFov:fov});
 };
 return <>
  <div className="home-editor-tabs">{[['coast','Вдоль берега','Along coast'],['sea','К морю','Seaward'],['shells','Ракушки','Shell close-up'],['overview','Обзор','Overview'],['bluff','Обвал','Landslide'],['descent','Спуск','Descent'],['cover','Покров','Ground cover']].map(([key,r,e])=><button type="button" className="home-editor-tab" key={key} onClick={()=>preview(key)}>{ru?r:e}</button>)}</div>
  <div className="home-editor-status">{ru?'С −Z · В +X · Ю +Z · З −X · высота +Y':'N −Z · E +X · S +Z · W −X · up +Y'}</div>
  {groups.map(([r,e,controls])=><React.Fragment key={r}><SectionHeading label={ru?r:e} subtle/>{controls.map(([key,r,e,unit])=>{
    const [min,max,step]=TERRAIN_RANGES[key];return <RangeControl key={key} label={ru?r:e} value={settings[key]} min={min} max={max} step={step} unit={unit} formatValue={n=>Number(n.toFixed(2))} onChange={event=>handleSettingChange(event,key)}/>;
  })}</React.Fragment>)}
 </>;
}
