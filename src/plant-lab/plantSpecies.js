import {makeOleaster,OLEASTER_DEFAULTS} from '../plants/oleasterModel.js';
import {makeCoastTree,TREE_DEFAULTS} from '../plants/treeModel.js';
import {TREE_KINDS,TREE_SHAPE_KEYS,TREE_SPECIES} from '../plants/treeSpecies.js';
import {LEAF_ATLAS,BARK_TILE,barkAtlasSpec} from '../plants/usePlantAtlas.js';

// One laboratory, the forms of the coast's woody plants. A species says how to
// grow its model, which sliders shape it, where the cameras stand for a plant
// its size, and what a planting of it looks like. Everything else in the lab is shared.
const oleasterViews={
 full:{landscape:{position:[2.3,1.55,2.9],target:[0,.72,0]},portrait:{position:[2.8,1.6,3.5],target:[0,.72,0]}},
 macro:{landscape:{position:[.9,1.25,1.05],target:[.25,.92,.2]},portrait:{position:[1.2,1.4,1.4],target:[.25,.9,.2]}},
 base:{landscape:{position:[1,.36,1.25],target:[0,.28,0]},portrait:{position:[1.5,.6,2],target:[0,.32,0]}},
 top:{landscape:{position:[.12,4.5,.05],target:[0,.5,0]},portrait:{position:[.12,5.5,.05],target:[0,.5,0]}},
 far:{landscape:{position:[0,2,65],target:[0,.7,0]},portrait:{position:[0,2,80],target:[0,.7,0]}},
 patch:{landscape:{position:[10,7,13],target:[0,.7,0]},portrait:{position:[14,10,20],target:[0,.7,0]}},
};
// The tree is four times the shrub in every direction; so are its cameras.
// `k` scales them for a species of another height (a 3 m tamarisk, a 7 m elm).
const scale=(v,k)=>v.map(n=>n*k);
const treeViews=k=>({
 full:{landscape:{position:scale([8.5,3.4,10.5],k),target:scale([0,2.9,0],k)},portrait:{position:scale([10,3.6,13],k),target:scale([0,2.9,0],k)}},
 macro:{landscape:{position:scale([1.9,4.3,2.2],k),target:scale([.5,4,.4],k)},portrait:{position:scale([2.4,4.5,2.8],k),target:scale([.5,3.9,.4],k)}},
 base:{landscape:{position:scale([3,1,3.6],k),target:scale([0,.9,0],k)},portrait:{position:scale([3.6,1.2,4.4],k),target:scale([0,1,0],k)}},
 top:{landscape:{position:scale([.3,17,.2],k),target:scale([0,3,0],k)},portrait:{position:scale([.3,21,.2],k),target:scale([0,3,0],k)}},
 far:{landscape:{position:[0,3,140],target:scale([0,3,0],k)},portrait:{position:[0,3,170],target:scale([0,3,0],k)}},
 patch:{landscape:{position:[36,22,46],target:scale([0,3,0],k)},portrait:{position:[48,30,64],target:scale([0,3,0],k)}},
});
const treeCopy={
 ru:{specimen:'Дерево',count:'Количество деревьев',distant:'Проекции дерева',lean:'Наклон от ветра',twist:'Кручение ствола',deadwood:'Сухие ветви',flex:'Гибкость',stems:'Стволов',droop:'Провис ветвей',gnarl:'Кучерявость',twigs:'Веточки',dead:'Сухостой',leafAspect:'Ширина листа',blossom:'Цветение',leafTint:'Тон листа',barkColor:'Тон коры',barkBleach:'Выбеленность коры',trunkShare:'Штамб',limbs:'Сучьев',barkTile:'Масштаб коры'},
 en:{specimen:'Specimen',count:'Tree count',distant:'Tree projections',lean:'Wind lean',twist:'Trunk twist',deadwood:'Deadwood',flex:'Flexibility',stems:'Stems',droop:'Twig droop',gnarl:'Gnarl',twigs:'Twigs',dead:'Drought kill',leafAspect:'Leaf width',blossom:'Blossom',leafTint:'Leaf tint',barkColor:'Bark tint',barkBleach:'Bark bleach',trunkShare:'Clear trunk',limbs:'Limbs',barkTile:'Bark scale'},
};
// A tree species of treeSpecies.js as a laboratory species: the oleaster keeps
// its old id `tree`, the door of collection 07.
function treeSpecies(kind){
 const s=TREE_SPECIES[kind],form={...TREE_DEFAULTS,...s.form},k=Math.max(.45,Math.min(1.6,form.height/6));
 return {
  id:kind==='oleaster'?'tree':kind,kind,collection:'tree',
  makeModel:input=>makeCoastTree({...s.form,...input,species:s.latin||s.ru,barkColor:input.barkColor??s.barkColor,barkTile:input.barkTile??BARK_TILE[s.bark]}),
  atlas:{...LEAF_ATLAS,bark:barkAtlasSpec(s.bark)},
  defaults:{...OLEASTER_DEFAULTS,...form,barkTile:BARK_TILE[s.bark],leafTint:s.leafTint,barkColor:s.barkColor,barkBleach:s.barkBleach??0,blossomColor:s.blossomColor,blossom:0,translucency:1.1,dryness:.42,count:14,extent:80,spacing:Math.max(3,Math.round(form.spread*1.3*2)/2),flex:.15},
  shape:[...TREE_SHAPE_KEYS,'windBearing'],
  sliders:[['seed',1,200,1],['height',1.5,12,.1,'m'],['spread',1,12,.1,'m'],['stems',1,6,1],...(form.crown==='dome'?[['trunkShare',.1,.7,.01],['limbs',4,24,1]]:[]),['lean',0,1,.01],['twist',0,1,.01],['gnarl',0,1,.01],['droop',0,1,.01],['twigs',.3,2,.05],['density',0,1,.01],['leafSize',.3,2.4,.05],['leafAspect',.5,2.5,.05],['deadwood',0,1,.01],['dead',0,1,.01],['barkTile',.15,1.5,.05,'m']],
  // The grove camera stands closer than the shrub plot's, in units of the plot.
  planting:{count:[1,64,1],extent:[24,200,4],spacing:Math.max(3,Math.round(form.spread*1.3*2)/2),camera:[.28,.14,.36]},
  views:treeViews(k),cameraLimits:{minDistance:.3,maxDistance:400,minPolarAngle:.03,maxPolarAngle:Math.PI-.1},cameraFar:600,fogRange:[380,560],
  impostorFrame:{desktop:384,lowPower:192},
  copy:{ru:{...treeCopy.ru,title:kind==='oleaster'?`${s.ru} · дерево`:s.ru,subtitle:s.latin?`${s.latin} · ${s.where.ru}`:s.where.ru},
        en:{...treeCopy.en,title:kind==='oleaster'?`${s.en} · tree`:s.en,subtitle:s.latin?`${s.latin} · ${s.where.en}`:s.where.en}},
 };
}
export const TREE_LAB_SPECIES=Object.fromEntries(TREE_KINDS.map(kind=>[kind==='oleaster'?'tree':kind,treeSpecies(kind)]));
export const TREE_VARIANTS=TREE_KINDS.map(kind=>({id:kind==='oleaster'?'tree':kind,ru:kind==='oleaster'?'Лох':TREE_SPECIES[kind].ru.split(' ')[0],en:kind==='oleaster'?'Oleaster':TREE_SPECIES[kind].en.split(' ').pop()}));
export const PLANT_SPECIES={
 oleaster:{
  id:'oleaster',makeModel:input=>makeOleaster({...input,barkTile:input.barkTile??BARK_TILE.oleaster}),atlas:{...LEAF_ATLAS,bark:barkAtlasSpec('oleaster')},
  defaults:{...OLEASTER_DEFAULTS,barkTile:BARK_TILE.oleaster,barkColor:'#ffffff',barkBleach:0,dryness:.42,count:160,extent:24,spacing:1.05,flex:1},
  shape:['seed','height','spread','density','leafSize','barkTile'],
  sliders:[['seed',1,200,1],['height',.45,2.4,.05,'m'],['spread',.6,2.5,.05,'m'],['density',.1,1,.01],['leafSize',.65,1.6,.05],['barkTile',.15,1.5,.05,'m']],
  planting:{count:[1,512,1],extent:[8,64,1],spacing:1.05,camera:[.65,.42,.87]},
  views:oleasterViews,cameraLimits:{minDistance:.16,maxDistance:150,minPolarAngle:.03,maxPolarAngle:Math.PI-.1},cameraFar:300,fogRange:[180,260],
  impostorFrame:null,
  copy:{ru:{title:'Лох узколистный',subtitle:'Elaeagnus angustifolia · прибрежный куст',specimen:'Куст',count:'Количество кустов',distant:'Проекции куста'},
        en:{title:'Narrow-leaf oleaster',subtitle:'Elaeagnus angustifolia · coastal shrub',specimen:'Specimen',count:'Shrub count',distant:'Shrub projections'}},
 },
 tree:TREE_LAB_SPECIES.tree,
};
