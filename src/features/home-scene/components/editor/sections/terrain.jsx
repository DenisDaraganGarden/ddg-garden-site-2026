import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { RangeControl,SectionHeading } from '../../HomeEditorControls';
import { TERRAIN_RANGES } from '../../../../../terrain/settings.js';
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
// The terrain inspection views are technical frames in the camera tab
// (lib/technicalCameras.js), next to the other frames.
export function TerrainSection({settings,handleSettingChange}) {
 const {language}=useLanguage();const ru=language==='ru';
 return <>
  <div className="home-editor-status">{ru?'С −Z · В +X · Ю +Z · З −X · высота +Y':'N −Z · E +X · S +Z · W −X · up +Y'}</div>
  {groups.map(([r,e,controls])=><React.Fragment key={r}><SectionHeading label={ru?r:e} subtle/>{controls.map(([key,r,e,unit])=>{
    const [min,max,step]=TERRAIN_RANGES[key];return <RangeControl key={key} label={ru?r:e} value={settings[key]} min={min} max={max} step={step} unit={unit} formatValue={n=>Number(n.toFixed(2))} onChange={event=>handleSettingChange(event,key)}/>;
  })}</React.Fragment>)}
 </>;
}
