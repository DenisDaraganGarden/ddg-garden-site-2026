import React,{Suspense,useEffect,useMemo,useState} from 'react';
import AssetStudio from '../asset-lab/AssetStudio';
import LabNav from '../asset-lab/LabNav';
import {assetIndex} from '../asset-lab/assetCatalog';
import {buildHomeSceneLighting} from '../components/effects/homeSceneLighting';
import {ECOLOGY_DEFAULTS} from '../plants/plantEcology.js';
import {PLANT_SPECIES} from './plantSpecies.js';
import PlantStage from './PlantStage';
import './plantLab.css';
const labDefaults=species=>({...ECOLOGY_DEFAULTS,...species.defaults,lod:'auto',wireframe:false,skeleton:false,slope:.12,pathWidth:.7,light:'studio',timeOfDay:16,exposure:1.04});
const COPY={
 ru:{title:'Лох узколистный',subtitle:'Elaeagnus angustifolia · прибрежный куст',specimen:'Куст',patch:'Посадка',plant:'Форма',wind:'Ветер',surface:'Материал',ground:'Грунт',light:'Свет',full:'Общий',macro:'Листья',base:'Ветвление',top:'Сверху',far:'Вдали',seed:'Вариант',height:'Высота',spread:'Ширина кроны',density:'Облиственность',leafSize:'Размер листа',dryness:'Сухость',patchScale:'Размер пятен',patchContrast:'Контраст пятен',crownVariation:'Пятна в кроне',crownScale:'Размер пятна в кроне',fieldSeed:'Рисунок территории',gustStrength:'Порывы',lodging:'Примятость',extent:'Размер участка',flutter:'Трепет листьев',windSpeed:'Скорость ветра',bearing:'Направление от севера',sss:'Просвечивание',roughness:'Шероховатость',lod:'Детализация',auto:'Авто',near:'Объёмные листья',middle:'Листовые карты',distant:'Проекции куста',skeleton:'Только ветви',wire:'Каркас',count:'Количество кустов',slope:'Уклон',path:'Ширина дорожки',studio:'Студия',scene:'Солнце',hour:'Время суток',exposure:'Экспозиция',pause:'Пауза',play:'Продолжить',reset:'Сброс',mobile:'Лёгкий режим',tri:'треугольников',calls:'вызовов',leaves:'листьев',branches:'ветвей',units:'м'},
 en:{title:'Narrow-leaf oleaster',subtitle:'Elaeagnus angustifolia · coastal shrub',specimen:'Specimen',patch:'Planting',plant:'Form',wind:'Wind',surface:'Material',ground:'Ground',light:'Light',full:'Overview',macro:'Leaves',base:'Branches',top:'Top',far:'Distant',seed:'Seed',height:'Height',spread:'Crown width',density:'Leaf density',leafSize:'Leaf size',dryness:'Dryness',patchScale:'Patch size',patchContrast:'Patch contrast',crownVariation:'Crown variation',crownScale:'Crown patch size',fieldSeed:'Landscape seed',gustStrength:'Gusts',lodging:'Wind combing',extent:'Plot size',flutter:'Leaf flutter',windSpeed:'Wind speed',bearing:'Bearing from north',sss:'Translucency',roughness:'Roughness',lod:'Detail',auto:'Auto',near:'Curved leaves',middle:'Leaf cards',distant:'Shrub projections',skeleton:'Branches only',wire:'Wireframe',count:'Shrub count',slope:'Slope',path:'Path width',studio:'Studio',scene:'Sun',hour:'Time of day',exposure:'Exposure',pause:'Pause',play:'Resume',reset:'Reset',mobile:'Low power',tri:'triangles',calls:'draw calls',leaves:'leaves',branches:'branches',units:'m'},
};
function Range({label,value,min=0,max=1,step=.01,unit='',onChange}){return <label className="plant-lab__range"><span>{label}</span><output>{Number(value).toFixed(step>=1?0:step>=.1?1:2)} {unit}</output><input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={e=>onChange(+e.target.value)}/></label>;}
function Toggle({label,value,onChange}){return <label className="plant-lab__toggle"><span>{label}</span><input aria-label={label} type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/></label>;}
export default function PlantLab({species=PLANT_SPECIES.oleaster}){
 const VIEWS=species.views,LIMITS=species.cameraLimits,DEFAULTS=useMemo(()=>labDefaults(species),[species]);
 const[lang,setLang]=useState('ru'),[settings,setSettings]=useState(DEFAULTS),[tab,setTab]=useState('plant'),[view,setView]=useState('full'),[mode,setMode]=useState('specimen'),[paused,setPaused]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),[hidden,setHidden]=useState(document.hidden),[lowPower,setLowPower]=useState(()=>navigator.hardwareConcurrency<=4||matchMedia('(max-width:600px)').matches||(navigator.maxTouchPoints>0&&matchMedia('(pointer:coarse)').matches)),[stats,setStats]=useState({lods:[1,0,0],budgets:[0,0,0],calls:0,triangles:0,branches:0,leaves:0});
 const [focusX,focusY,focusZ]=stats.focus??[0,0,0];
 const cameraViews=useMemo(()=>{
  if(mode!=='patch')return VIEWS;
  const extent=settings.extent,y=settings.slope*extent*.5+.28;
  const rootView={position:[focusX-1.1,focusY+.7,focusZ+1.5],target:[focusX,focusY+.32,focusZ]};
  const eye=settings.height*.45;
  const [cx,cy,cz]=species.planting.camera;
  return {...VIEWS,patch:{landscape:{position:[extent*cx,y+extent*cy,extent*cz],target:[0,y+eye,0]},portrait:{position:[extent*cx*1.25,y+extent*cy*1.3,extent*cz*1.2],target:[0,y+eye,0]}},base:{landscape:rootView,portrait:rootView},far:{landscape:{position:[0,y+2,Math.max(65,extent*1.6)],target:[0,y+eye,0]},portrait:{position:[0,y+2,Math.max(80,extent*1.9)],target:[0,y+eye,0]}}};
 },[mode,settings.slope,settings.extent,settings.height,focusX,focusY,focusZ,VIEWS,species]);
 const t={...COPY[lang],...species.copy[lang]},set=(key,value)=>setSettings(s=>({...s,[key]:value}));
 useEffect(()=>{const changed=()=>setHidden(document.hidden);document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed);},[]);
 const lighting=useMemo(()=>buildHomeSceneLighting({timeOfDay:settings.timeOfDay,sunBearing:155,sunNoonElevation:55,sunIntensity:1.15,ambientIntensity:.2,hemisphereIntensity:.65,hemisphereSkyColor:'#ced9e4',hemisphereGroundColor:'#77705b'}),[settings.timeOfDay]);
 const range=(key,label,min=0,max=1,step=.01,unit='')=><Range key={key} label={label} value={settings[key]} min={min} max={max} step={step} unit={unit} onChange={v=>set(key,v)}/>;
 const selectMode=next=>{setMode(next);setView(next==='patch'?'patch':'full');};
 return <main className="plant-lab" data-asset-collection={species.id} lang={lang}>
  <header className="plant-lab__header"><div><p>DDG / ASSET LAB / {assetIndex(species.id)}</p><h1>{t.title}</h1><span>{t.subtitle}</span></div><div className="plant-lab__header-actions"><div>{['ru','en'].map(l=><button key={l} aria-pressed={l===lang} onClick={()=>setLang(l)}>{l.toUpperCase()}</button>)}</div><LabNav current={species.id} lang={lang}/></div></header>
  <div className="plant-lab__workspace"><section className="plant-lab__viewer" aria-label="3D plant viewport">
   <AssetStudio view={view} cameraViews={cameraViews} cameraLimits={LIMITS} cameraFar={species.cameraFar} fogRange={species.fogRange} floorY={-.014} floorVisible={mode==='specimen'} lighting={settings.light==='scene'?lighting:undefined} exposure={settings.exposure} environmentIntensity={.65} paused={paused} inactive={hidden} pixelRatio={lowPower?1:[1,1.5]}>
    <Suspense fallback={null}><PlantStage species={species} settings={settings} mode={mode} paused={paused||hidden} onStats={setStats} lowPower={lowPower}/></Suspense>
   </AssetStudio>
   <div className="plant-lab__views" role="group" aria-label="Ракурс">{(mode==='patch'?['patch','base','far']:['full','macro','base','top','far']).map(v=><button key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{t[v]}</button>)}</div>
   <div className="plant-lab__scale"><span>{stats.scale?.metres??.25} {t.units}</span><i style={{width:stats.scale?.pixels??64}}/></div>
  </section><aside className="plant-lab__inspector">
   <div className="plant-lab__modes">{['specimen','patch'].map(m=><button key={m} aria-pressed={mode===m} onClick={()=>selectMode(m)}>{t[m]}</button>)}</div>
   <div className="plant-lab__tabs" role="tablist">{['plant','wind','surface','ground','light'].map(id=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}>{t[id]}</button>)}</div>
   <div className="plant-lab__controls" role="tabpanel" aria-label={t[tab]}>
    {tab==='plant'&&<>{species.sliders.map(([key,min,max,step,unit])=>range(key,t[key],min,max,step,unit==='m'?t.units:''))}<label className="plant-lab__select"><span>{t.lod}</span><select aria-label={t.lod} value={settings.lod} onChange={e=>set('lod',e.target.value)}>{['auto','0','1','2'].map((id,i)=><option key={id} value={id}>{[t.auto,t.near,t.middle,t.distant][i]}</option>)}</select></label><Toggle label={t.skeleton} value={settings.skeleton} onChange={v=>set('skeleton',v)}/><Toggle label={t.wire} value={settings.wireframe} onChange={v=>set('wireframe',v)}/><Toggle label={t.mobile} value={lowPower} onChange={setLowPower}/></>}
    {tab==='wind'&&<>{range('wind',t.windSpeed,0,14,.1,lang==='ru'?'м/с':'m/s')}{range('windBearing',t.bearing,0,360,1,'°')}{species.id==='tree'&&range('flex',t.flex,0,1,.01)}{range('flutter',t.flutter,0,1,.05)}{range('gustStrength',t.gustStrength,0,1,.05)}{range('lodging',t.lodging,0,1,.05)}</>}
    {tab==='surface'&&<>{range('dryness',t.dryness,0,1,.05)}{range('patchScale',t.patchScale,1,30,.5,t.units)}{range('patchContrast',t.patchContrast,0,1,.05)}{range('crownVariation',t.crownVariation,0,1,.05)}{range('crownScale',t.crownScale,.2,2,.1,t.units)}{range('translucency',t.sss,0,1.4,.05)}{range('roughness',t.roughness,.35,1,.05)}</>}
    {tab==='ground'&&<>{range('count',t.count,...species.planting.count)}{range('extent',t.extent,...species.planting.extent,t.units)}{range('fieldSeed',t.fieldSeed,1,200,1)}{range('slope',t.slope,0,.45,.01)}{range('pathWidth',t.path,0,2,.1,t.units)}</>}
    {tab==='light'&&<><label className="plant-lab__select"><span>{t.light}</span><select aria-label={t.light} value={settings.light} onChange={e=>set('light',e.target.value)}><option value="studio">{t.studio}</option><option value="scene">{t.scene}</option></select></label>{range('timeOfDay',t.hour,0,24,.1,lang==='ru'?'ч':'h')}{range('exposure',t.exposure,.3,2,.05)}</>}
   </div><div className="plant-lab__transport"><button onClick={()=>setPaused(p=>!p)}>{paused?'▶':'Ⅱ'} {paused?t.play:t.pause}</button><button onClick={()=>{setSettings(DEFAULTS);setView('full');setMode('specimen');}}>{t.reset}</button></div>
  </aside></div>
  <footer className="plant-lab__footer"><span><b>{stats.triangles.toLocaleString()}</b> {t.tri}</span><span><b>{stats.calls}</b> {t.calls}</span><span>LOD <b>{stats.lods.join(' / ')}</b></span><span><b>{stats.leaves}</b> {t.leaves} · <b>{stats.branches}</b> {t.branches}</span></footer>
 </main>;
}

// The registry maps a collection to a component without props; each form of
// the species gets its own door.
export const OleasterLab=()=><PlantLab species={PLANT_SPECIES.oleaster}/>;
export const TreeLab=()=><PlantLab species={PLANT_SPECIES.tree}/>;
