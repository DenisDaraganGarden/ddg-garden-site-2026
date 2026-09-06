import {makeGrassTuft,GRASS_SPECIES_DEFAULTS,grassAtlasSpec} from '../plants/grassModel.js';
import {OLEASTER_DEFAULTS} from '../plants/oleasterModel.js';

// Four grasses of the Azov coast in the plant laboratory. A species says how to
// grow its tuft, which sliders shape it, where the cameras stand for a plant
// its size and what a planting of it looks like; the lab itself is shared.
const views=h=>({
 full:{landscape:{position:[h*1.7,h*1.1,h*2.2],target:[0,h*.42,0]},portrait:{position:[h*2.1,h*1.3,h*2.7],target:[0,h*.42,0]}},
 macro:{landscape:{position:[h*.55,h*.75,h*.65],target:[0,h*.55,0]},portrait:{position:[h*.7,h*.9,h*.85],target:[0,h*.55,0]}},
 base:{landscape:{position:[h*.9,h*.28,h*1.1],target:[0,h*.12,0]},portrait:{position:[h*1.2,h*.4,h*1.5],target:[0,h*.14,0]}},
 top:{landscape:{position:[.05,h*3.2,.04],target:[0,h*.3,0]},portrait:{position:[.05,h*4,.04],target:[0,h*.3,0]}},
 far:{landscape:{position:[0,1.6,60],target:[0,h*.4,0]},portrait:{position:[0,1.8,75],target:[0,h*.4,0]}},
 patch:{landscape:{position:[12,7,15],target:[0,.4,0]},portrait:{position:[16,10,21],target:[0,.4,0]}},
});
const common={
 dryness:.35,roughness:.8,translucency:.9,extent:32,flex:2.2,
 cameraLimits:{minDistance:.05,maxDistance:150,minPolarAngle:.03,maxPolarAngle:Math.PI-.1},cameraFar:300,fogRange:[180,260],
 impostorFrame:{desktop:128,lowPower:64},
};
const copy={
 ru:{specimen:'Пучок',count:'Пучков',distant:'Проекции пучка',blades:'Лезвий',curl:'Изгиб',awns:'Остей',spikes:'Колосьев',stems:'Стеблей',leaves:'листьев',branches:'стеблей',patch:'Луг'},
 en:{specimen:'Tuft',count:'Tufts',distant:'Tuft projections',blades:'Blades',curl:'Curl',awns:'Awns',spikes:'Spikes',stems:'Stems',leaves:'leaves',branches:'stems',patch:'Meadow'},
};
// Plumes, spikes and panicles stand above the blades: the cameras frame that height.
const FRAME_HEIGHT={stipa:1.7,festuca:1,leymus:1.35,phragmites:1.15};
const species=(id,defaults,shape,sliders,planting,title)=>({
 id,collection:'grass',makeModel:input=>makeGrassTuft(id,input),
 defaults:{...OLEASTER_DEFAULTS,...GRASS_SPECIES_DEFAULTS[id],dryness:common.dryness,roughness:common.roughness,translucency:common.translucency,count:planting.count,extent:common.extent,spacing:planting.spacing,flex:common.flex,...defaults},
 shape,sliders:[['seed',1,200,1],...sliders],
 planting:{count:[1,20000,1],extent:[8,64,1],spacing:planting.spacing,camera:[.55,.3,.7],suitability:s=>s.vegetation?.shrubs??1},
 views:views(GRASS_SPECIES_DEFAULTS[id].height*FRAME_HEIGHT[id]),cameraLimits:common.cameraLimits,cameraFar:common.cameraFar,fogRange:common.fogRange,impostorFrame:common.impostorFrame,
 atlas:grassAtlasSpec(id),
 copy:{ru:{...copy.ru,...title.ru},en:{...copy.en,...title.en}},
});
export const GRASS_SPECIES={
 stipa:species('stipa',{},['seed','height','blades','spread','curl','awns'],[['height',.3,1.2,.01,'m'],['blades',4,24,1],['spread',.08,.6,.01,'m'],['curl',0,1,.01],['awns',0,8,1]],{count:3000,spacing:.32},
  {ru:{title:'Ковыль',subtitle:'Stipa lessingiana · плато и бровка обрыва'},en:{title:'Feather grass',subtitle:'Stipa lessingiana · plateau and bluff edge'}}),
 festuca:species('festuca',{},['seed','height','blades','spread','curl'],[['height',.1,.45,.01,'m'],['blades',6,32,1],['spread',.05,.35,.01,'m'],['curl',0,1,.01]],{count:6000,spacing:.22},
  {ru:{title:'Типчак',subtitle:'Festuca valesiaca · ковёр плато и склонов'},en:{title:'Fescue',subtitle:'Festuca valesiaca · plateau and slope carpet'}}),
 leymus:species('leymus',{},['seed','height','blades','spread','curl','spikes'],[['height',.3,1.4,.01,'m'],['blades',3,16,1],['spread',.1,.7,.01,'m'],['curl',0,1,.01],['spikes',0,4,1]],{count:800,spacing:.5},
  {ru:{title:'Колосняк песчаный',subtitle:'Leymus racemosus · дюны, осыпи, камни у воды'},en:{title:'Dune grass',subtitle:'Leymus racemosus · dunes, screes, stones by the water'}}),
 phragmites:species('phragmites',{},['seed','height','stems','spread','curl','leaves'],[['height',1,3,.02,'m'],['stems',1,8,1],['spread',.1,.8,.01,'m'],['curl',0,1,.01],['leaves',1,5,1]],{count:600,spacing:.45},
  {ru:{title:'Тростник',subtitle:'Phragmites australis · урез воды в затишьях'},en:{title:'Common reed',subtitle:'Phragmites australis · waterline in the lee'}}),
};
export const GRASS_VARIANTS=[{id:'stipa',ru:'Ковыль',en:'Feather grass'},{id:'festuca',ru:'Типчак',en:'Fescue'},{id:'leymus',ru:'Колосняк',en:'Dune grass'},{id:'phragmites',ru:'Тростник',en:'Reed'}];
