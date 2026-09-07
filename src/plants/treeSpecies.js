// The trees of the Azov coast (docs/tree-lab-plan.md §2) on one builder
// (treeModel.js) and one leaf atlas: a species is a form, a leaf tint, a bark
// colour and the niches it may stand in. Tint and blossom multiply the
// oleaster's leaf albedo until Denis's own maps arrive; bark is a colour under
// the shared procedural grain.
export const TREE_KINDS=Object.freeze(['oleaster','tamarisk','plum','elm','willow','snag']);
export const TREE_SHAPE_KEYS=Object.freeze(['seed','height','spread','lean','twist','density','leafSize','leafAspect','deadwood','stems','droop','gnarl','twigs','dead']);
export const TREE_SPECIES=Object.freeze({
 oleaster:{latin:'Elaeagnus angustifolia',ru:'Лох узколистный',en:'Narrow-leaf oleaster',where:{ru:'взрослое дерево на обрыве',en:'mature tree on the bluff'},
  form:{},leafTint:'#ffffff',barkColor:'#685b44',blossomColor:'#f3e9bf',niches:['bluff','belt','sand']},
 tamarisk:{latin:'Tamarix ramosissima',ru:'Гребенщик',en:'Tamarisk',where:{ru:'тыл пляжа, песок у воды',en:'back beach, sand by the water'},
  form:{height:3.2,spread:3.8,lean:.7,twist:.5,density:.9,leafSize:.65,leafAspect:.7,deadwood:.4,stems:4,droop:.45,gnarl:.5,twigs:1.4,dead:.15},leafTint:'#dbe79b',barkColor:'#4a423b',blossomColor:'#e6b3c4',niches:['sand','bluff','wet']},
 plum:{latin:'Prunus cerasifera',ru:'Алыча',en:'Cherry plum',where:{ru:'бровка, оползневые бенчи, устья балок',en:'bluff edge, landslide benches, ravine mouths'},
  form:{height:4,spread:4.6,lean:.25,twist:.3,density:.9,leafSize:.95,leafAspect:1.9,deadwood:.15,stems:3,droop:.1,gnarl:.6,twigs:1.3,dead:0},leafTint:'#95bd7c',barkColor:'#3c342d',blossomColor:'#fbf6f0',niches:['bluff','wet','belt']},
 elm:{latin:'Ulmus pumila',ru:'Вяз приземистый',en:'Siberian elm',where:{ru:'лесополоса на плато, бровка',en:'shelterbelt on the plateau, bluff edge'},
  form:{height:7,spread:7.5,lean:.35,twist:.5,density:.85,leafSize:.9,leafAspect:1.6,deadwood:.35,stems:1,droop:.15,gnarl:.7,twigs:1.3,dead:.15},leafTint:'#a9c688',barkColor:'#5a5147',blossomColor:'#d9d7a8',niches:['belt','bluff']},
 willow:{latin:'Salix alba',ru:'Ива белая',en:'White willow',where:{ru:'устья балок, мокрая подошва, затишья',en:'ravine mouths, the wet bluff foot, calm water'},
  form:{height:7.5,spread:7,lean:.2,twist:.25,density:.8,leafSize:1.6,leafAspect:.8,deadwood:.1,stems:2,droop:.85,gnarl:.2,twigs:1.05,dead:0},leafTint:'#d3e3c4',barkColor:'#6f6a5e',blossomColor:'#e8e6b0',niches:['wet']},
 snag:{latin:'',ru:'Сухостой',en:'Snag',where:{ru:'мёртвое дерево: песок, бровка, у воды',en:'a dead tree: sand, bluff edge, waterline'},
  form:{height:4.5,spread:4.5,lean:.6,twist:.5,density:0,leafSize:1,leafAspect:1,deadwood:1,stems:1,droop:.1,gnarl:.6,twigs:.8,dead:1},leafTint:'#ffffff',barkColor:'#a39b8a',blossomColor:'#ffffff',niches:['sand','bluff','shore']},
});
