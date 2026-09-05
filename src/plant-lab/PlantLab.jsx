import React,{Suspense,useEffect,useMemo,useState} from 'react';
import AssetStudio from '../asset-lab/AssetStudio';
import {buildHomeSceneLighting} from '../components/effects/homeSceneLighting';
import {OLEASTER_DEFAULTS} from '../plants/oleasterModel.js';
import PlantStage from './PlantStage';
import './plantLab.css';
const VIEWS={
 full:{landscape:{position:[2.3,1.55,2.9],target:[0,.72,0]},portrait:{position:[2.8,1.6,3.5],target:[0,.72,0]}},
 macro:{landscape:{position:[.9,1.25,1.05],target:[.25,.92,.2]},portrait:{position:[1.2,1.4,1.4],target:[.25,.9,.2]}},
 base:{landscape:{position:[1,.36,1.25],target:[0,.28,0]},portrait:{position:[1.5,.6,2],target:[0,.32,0]}},
 top:{landscape:{position:[.12,4.5,.05],target:[0,.5,0]},portrait:{position:[.12,5.5,.05],target:[0,.5,0]}},
 far:{landscape:{position:[0,2,65],target:[0,.7,0]},portrait:{position:[0,2,80],target:[0,.7,0]}},
 patch:{landscape:{position:[10,7,13],target:[0,.7,0]},portrait:{position:[14,10,20],target:[0,.7,0]}},
};
const LIMITS={minDistance:.16,maxDistance:150,minPolarAngle:.03,maxPolarAngle:Math.PI-.1};
const DEFAULTS={...OLEASTER_DEFAULTS,lod:'auto',wireframe:false,skeleton:false,count:32,slope:.08,pathWidth:.7,light:'studio',timeOfDay:16,exposure:1.04};
const COPY={
 ru:{title:'Лох узколистный',subtitle:'Elaeagnus angustifolia · прибрежный куст',specimen:'Куст',patch:'Посадка',plant:'Форма',wind:'Ветер',surface:'Материал',ground:'Грунт',light:'Свет',full:'Общий',macro:'Листья',base:'Ветвление',top:'Сверху',far:'Вдали',seed:'Вариант',height:'Высота',spread:'Ширина кроны',density:'Облиственность',leafSize:'Размер листа',dryness:'Сухость',flutter:'Трепет листьев',windSpeed:'Скорость ветра',bearing:'Направление от севера',sss:'Просвечивание',roughness:'Шероховатость',lod:'Детализация',auto:'Авто',near:'Объёмные листья',middle:'Листовые карты',distant:'Проекции куста',skeleton:'Только ветви',wire:'Каркас',count:'Количество кустов',slope:'Уклон',path:'Ширина дорожки',studio:'Студия',scene:'Солнце',hour:'Время суток',exposure:'Экспозиция',pause:'Пауза',play:'Продолжить',reset:'Сброс',mobile:'Лёгкий режим',tri:'треугольников',calls:'вызовов',leaves:'листьев',branches:'ветвей',units:'м'},
 en:{title:'Narrow-leaf oleaster',subtitle:'Elaeagnus angustifolia · coastal shrub',specimen:'Specimen',patch:'Planting',plant:'Form',wind:'Wind',surface:'Material',ground:'Ground',light:'Light',full:'Overview',macro:'Leaves',base:'Branches',top:'Top',far:'Distant',seed:'Seed',height:'Height',spread:'Crown width',density:'Leaf density',leafSize:'Leaf size',dryness:'Dryness',flutter:'Leaf flutter',windSpeed:'Wind speed',bearing:'Bearing from north',sss:'Translucency',roughness:'Roughness',lod:'Detail',auto:'Auto',near:'Curved leaves',middle:'Leaf cards',distant:'Shrub projections',skeleton:'Branches only',wire:'Wireframe',count:'Shrub count',slope:'Slope',path:'Path width',studio:'Studio',scene:'Sun',hour:'Time of day',exposure:'Exposure',pause:'Pause',play:'Resume',reset:'Reset',mobile:'Low power',tri:'triangles',calls:'draw calls',leaves:'leaves',branches:'branches',units:'m'},
};
function Range({label,value,min=0,max=1,step=.01,unit='',onChange}){return <label className="plant-lab__range"><span>{label}</span><output>{Number(value).toFixed(step>=1?0:step>=.1?1:2)} {unit}</output><input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={e=>onChange(+e.target.value)}/></label>;}
function Toggle({label,value,onChange}){return <label className="plant-lab__toggle"><span>{label}</span><input aria-label={label} type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/></label>;}
export default function PlantLab(){
 const[lang,setLang]=useState('ru'),[settings,setSettings]=useState(DEFAULTS),[tab,setTab]=useState('plant'),[view,setView]=useState('full'),[mode,setMode]=useState('specimen'),[paused,setPaused]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),[hidden,setHidden]=useState(document.hidden),[lowPower,setLowPower]=useState(()=>navigator.hardwareConcurrency<=4||matchMedia('(max-width:600px)').matches||(navigator.maxTouchPoints>0&&matchMedia('(pointer:coarse)').matches)),[stats,setStats]=useState({lods:[1,0,0],budgets:[0,0,0],calls:0,triangles:0,branches:0,leaves:0});
 const [focusX,focusY,focusZ]=stats.focus??[0,0,0];
 const cameraViews=useMemo(()=>{
  if(mode!=='patch')return VIEWS;
  const y=settings.slope*5+.28;
  const rootView={position:[focusX-1.1,focusY+.7,focusZ+1.5],target:[focusX,focusY+.32,focusZ]};
  return {...VIEWS,patch:{landscape:{position:[16,y+10,21],target:[0,y+.55,0]},portrait:{position:[18,y+12,23],target:[0,y+.55,0]}},base:{landscape:rootView,portrait:rootView},far:{landscape:{position:[0,y+2,65],target:[0,y+.55,0]},portrait:{position:[0,y+2,80],target:[0,y+.55,0]}}};
 },[mode,settings.slope,focusX,focusY,focusZ]);
 const t=COPY[lang],set=(key,value)=>setSettings(s=>({...s,[key]:value}));
 useEffect(()=>{const changed=()=>setHidden(document.hidden);document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed);},[]);
 const lighting=useMemo(()=>buildHomeSceneLighting({timeOfDay:settings.timeOfDay,sunBearing:155,sunNoonElevation:55,sunIntensity:1.15,ambientIntensity:.2,hemisphereIntensity:.65,hemisphereSkyColor:'#ced9e4',hemisphereGroundColor:'#77705b'}),[settings.timeOfDay]);
 const range=(key,label,min=0,max=1,step=.01,unit='')=><Range key={key} label={label} value={settings[key]} min={min} max={max} step={step} unit={unit} onChange={v=>set(key,v)}/>;
 const selectMode=next=>{setMode(next);setView(next==='patch'?'patch':'full');};
 return <main className="plant-lab" data-asset-collection="oleaster" lang={lang}>
  <header className="plant-lab__header"><div><p>DDG / ASSET LAB / 005</p><h1>{t.title}</h1><span>{t.subtitle}</span></div><div className="plant-lab__header-actions"><div>{['ru','en'].map(l=><button key={l} aria-pressed={l===lang} onClick={()=>setLang(l)}>{l.toUpperCase()}</button>)}</div><nav><a href="?collection=river-fish">01</a><a href="?collection=seagulls">02</a><a href="?collection=black-stone-sculpture">03</a><a href="?collection=tanker">04</a><a href="?collection=oleaster" aria-current="page">05</a></nav></div></header>
  <div className="plant-lab__workspace"><section className="plant-lab__viewer" aria-label="3D plant viewport">
   <AssetStudio view={view} cameraViews={cameraViews} cameraLimits={LIMITS} cameraFar={300} fogRange={[180,260]} floorY={-.014} floorVisible={mode==='specimen'} lighting={settings.light==='scene'?lighting:undefined} exposure={settings.exposure} environmentIntensity={.65} paused={paused} inactive={hidden} pixelRatio={lowPower?1:[1,1.5]}>
    <Suspense fallback={null}><PlantStage settings={settings} mode={mode} paused={paused||hidden} onStats={setStats} lowPower={lowPower}/></Suspense>
   </AssetStudio>
   <div className="plant-lab__views" role="group" aria-label="Ракурс">{(mode==='patch'?['patch','base','far']:['full','macro','base','top','far']).map(v=><button key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{t[v]}</button>)}</div>
   <div className="plant-lab__scale"><span>{stats.scale?.metres??.25} {t.units}</span><i style={{width:stats.scale?.pixels??64}}/></div>
  </section><aside className="plant-lab__inspector">
   <div className="plant-lab__modes">{['specimen','patch'].map(m=><button key={m} aria-pressed={mode===m} onClick={()=>selectMode(m)}>{t[m]}</button>)}</div>
   <div className="plant-lab__tabs" role="tablist">{['plant','wind','surface','ground','light'].map(id=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}>{t[id]}</button>)}</div>
   <div className="plant-lab__controls" role="tabpanel" aria-label={t[tab]}>
    {tab==='plant'&&<>{range('seed',t.seed,1,200,1)}{range('height',t.height,.45,2.4,.05,t.units)}{range('spread',t.spread,.6,2.5,.05,t.units)}{range('density',t.density,.1,1,.01)}{range('leafSize',t.leafSize,.65,1.6,.05)}<label className="plant-lab__select"><span>{t.lod}</span><select aria-label={t.lod} value={settings.lod} onChange={e=>set('lod',e.target.value)}>{['auto','0','1','2'].map((id,i)=><option key={id} value={id}>{[t.auto,t.near,t.middle,t.distant][i]}</option>)}</select></label><Toggle label={t.skeleton} value={settings.skeleton} onChange={v=>set('skeleton',v)}/><Toggle label={t.wire} value={settings.wireframe} onChange={v=>set('wireframe',v)}/><Toggle label={t.mobile} value={lowPower} onChange={setLowPower}/></>}
    {tab==='wind'&&<>{range('wind',t.windSpeed,0,14,.1,lang==='ru'?'м/с':'m/s')}{range('windBearing',t.bearing,0,360,1,'°')}{range('flutter',t.flutter,0,1,.05)}</>}
    {tab==='surface'&&<>{range('dryness',t.dryness,0,1,.05)}{range('translucency',t.sss,0,1.4,.05)}{range('roughness',t.roughness,.35,1,.05)}</>}
    {tab==='ground'&&<>{range('count',t.count,1,64,1)}{range('slope',t.slope,0,.45,.01)}{range('pathWidth',t.path,0,2,.1,t.units)}{range('dryness',t.dryness,0,1,.05)}</>}
    {tab==='light'&&<><label className="plant-lab__select"><span>{t.light}</span><select aria-label={t.light} value={settings.light} onChange={e=>set('light',e.target.value)}><option value="studio">{t.studio}</option><option value="scene">{t.scene}</option></select></label>{range('timeOfDay',t.hour,0,24,.1,lang==='ru'?'ч':'h')}{range('exposure',t.exposure,.3,2,.05)}</>}
   </div><div className="plant-lab__transport"><button onClick={()=>setPaused(p=>!p)}>{paused?'▶':'Ⅱ'} {paused?t.play:t.pause}</button><button onClick={()=>{setSettings(DEFAULTS);setView('full');setMode('specimen');}}>{t.reset}</button></div>
  </aside></div>
  <footer className="plant-lab__footer"><span><b>{stats.triangles.toLocaleString()}</b> {t.tri}</span><span><b>{stats.calls}</b> {t.calls}</span><span>LOD <b>{stats.lods.join(' / ')}</b></span><span><b>{stats.leaves}</b> {t.leaves} · <b>{stats.branches}</b> {t.branches}</span></footer>
 </main>;
}
