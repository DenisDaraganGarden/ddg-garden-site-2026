import {makeOleaster,OLEASTER_DEFAULTS} from '../plants/oleasterModel.js';
import {makeCoastTree,TREE_DEFAULTS} from '../plants/treeModel.js';

// One laboratory, two forms of the species. A species says how to grow its
// model, which sliders shape it, where the cameras stand for a plant its size,
// and what a planting of it looks like. Everything else in the lab is shared.
const oleasterViews={
 full:{landscape:{position:[2.3,1.55,2.9],target:[0,.72,0]},portrait:{position:[2.8,1.6,3.5],target:[0,.72,0]}},
 macro:{landscape:{position:[.9,1.25,1.05],target:[.25,.92,.2]},portrait:{position:[1.2,1.4,1.4],target:[.25,.9,.2]}},
 base:{landscape:{position:[1,.36,1.25],target:[0,.28,0]},portrait:{position:[1.5,.6,2],target:[0,.32,0]}},
 top:{landscape:{position:[.12,4.5,.05],target:[0,.5,0]},portrait:{position:[.12,5.5,.05],target:[0,.5,0]}},
 far:{landscape:{position:[0,2,65],target:[0,.7,0]},portrait:{position:[0,2,80],target:[0,.7,0]}},
 patch:{landscape:{position:[10,7,13],target:[0,.7,0]},portrait:{position:[14,10,20],target:[0,.7,0]}},
};
// The tree is four times the shrub in every direction; so are its cameras.
const treeViews={
 full:{landscape:{position:[8.5,3.4,10.5],target:[0,2.9,0]},portrait:{position:[10,3.6,13],target:[0,2.9,0]}},
 macro:{landscape:{position:[1.9,4.3,2.2],target:[.5,4,.4]},portrait:{position:[2.4,4.5,2.8],target:[.5,3.9,.4]}},
 base:{landscape:{position:[3,1,3.6],target:[0,.9,0]},portrait:{position:[3.6,1.2,4.4],target:[0,1,0]}},
 top:{landscape:{position:[.3,17,.2],target:[0,3,0]},portrait:{position:[.3,21,.2],target:[0,3,0]}},
 far:{landscape:{position:[0,3,140],target:[0,3,0]},portrait:{position:[0,3,170],target:[0,3,0]}},
 patch:{landscape:{position:[36,22,46],target:[0,3,0]},portrait:{position:[48,30,64],target:[0,3,0]}},
};
export const PLANT_SPECIES={
 oleaster:{
  id:'oleaster',makeModel:makeOleaster,
  defaults:{...OLEASTER_DEFAULTS,dryness:.42,count:160,extent:24,spacing:1.05,flex:1},
  shape:['seed','height','spread','density','leafSize'],
  sliders:[['seed',1,200,1],['height',.45,2.4,.05,'m'],['spread',.6,2.5,.05,'m'],['density',.1,1,.01],['leafSize',.65,1.6,.05]],
  planting:{count:[1,512,1],extent:[8,64,1],spacing:1.05,camera:[.65,.42,.87]},
  views:oleasterViews,cameraLimits:{minDistance:.16,maxDistance:150,minPolarAngle:.03,maxPolarAngle:Math.PI-.1},cameraFar:300,fogRange:[180,260],
  impostorFrame:null,
  copy:{ru:{title:'Лох узколистный',subtitle:'Elaeagnus angustifolia · прибрежный куст',specimen:'Куст',count:'Количество кустов',distant:'Проекции куста'},
        en:{title:'Narrow-leaf oleaster',subtitle:'Elaeagnus angustifolia · coastal shrub',specimen:'Specimen',count:'Shrub count',distant:'Shrub projections'}},
 },
 tree:{
  id:'tree',makeModel:makeCoastTree,
  defaults:{...OLEASTER_DEFAULTS,...TREE_DEFAULTS,dryness:.42,count:14,extent:80,spacing:7,flex:.15},
  shape:['seed','height','spread','lean','twist','density','leafSize','deadwood','windBearing'],
  sliders:[['seed',1,200,1],['height',2.5,12,.1,'m'],['spread',1.5,12,.1,'m'],['lean',0,1,.01],['twist',0,1,.01],['density',.1,1,.01],['leafSize',.8,2.4,.05],['deadwood',0,1,.01]],
  // The grove camera stands closer than the shrub plot's, in units of the plot.
  planting:{count:[1,64,1],extent:[24,200,4],spacing:7,camera:[.28,.14,.36]},
  views:treeViews,cameraLimits:{minDistance:.3,maxDistance:400,minPolarAngle:.03,maxPolarAngle:Math.PI-.1},cameraFar:600,fogRange:[380,560],
  impostorFrame:{desktop:384,lowPower:192},
  copy:{ru:{title:'Лох узколистный · дерево',subtitle:'Elaeagnus angustifolia · взрослое дерево на обрыве',specimen:'Дерево',count:'Количество деревьев',distant:'Проекции дерева',lean:'Наклон от ветра',twist:'Кручение ствола',deadwood:'Сухие ветви',flex:'Гибкость'},
        en:{title:'Narrow-leaf oleaster · tree',subtitle:'Elaeagnus angustifolia · mature tree on the bluff',specimen:'Specimen',count:'Tree count',distant:'Tree projections',lean:'Wind lean',twist:'Trunk twist',deadwood:'Deadwood',flex:'Flexibility'}},
 },
};
