import {coastPoint,coastCoordinates,shorePosition} from '../terrain/terrainModel.js';
import {coastProfile} from '../terrain/terrainLandforms.js';
import {coastWeather} from '../terrain/settings.js';
import {scatterPlants} from './plantHabitat.js';
import {randomSequence} from './oleasterModel.js';
import {TREE_KINDS,TREE_SPECIES} from './treeSpecies.js';
import {normalizeShrubSettings,normalizeTreeSettings,shrubAssetSettings,treeAssetSettings} from './settings.js';

const smooth=(a,b,n)=>{const t=Math.max(0,Math.min(1,(n-a)/(b-a)));return t*t*(3-2*t);};
// A planting is a strip in coast coordinates: `length` along the shore around
// `along`, `width` across it, `inland` metres behind the bluff's slope.
function coastStrip(query,definition,{seed,count,length:requestedLength,width,along:requestedAlong,inland:requestedInland,spacing,asset,suitability},pathMask){
 const margin=Math.min(64,definition.terrainLength*.2),length=Math.min(requestedLength,definition.terrainLength-margin*2);
 const along=Math.max(-definition.terrainLength*.5+margin+length*.5,Math.min(definition.terrainLength*.5-margin-length*.5,requestedAlong));
 const inland=definition.terrainBeachWidth+definition.terrainCliffSlope+requestedInland+width*.5;
 return scatterPlants(query,{seed,count,extent:[width,length],spacing,dryness:asset.dryness,ecology:asset,pathMask,suitability,
  pointAt:(q,t)=>coastPoint(q+inland,t+along,definition)});
}
const wind=definition=>({speed:coastWeather(definition).wind,bearing:definition.terrainWindBearing});
export function createCoastPlanting(query,definition,input,pathMask=()=>0){
 const s=normalizeShrubSettings(input);
 if(!s.shrubsEnabled||!query)return [];
 return coastStrip(query,definition,{seed:s.shrubsSeed,count:s.shrubsCount,length:s.shrubsLength,width:s.shrubsWidth,along:s.shrubsAlong,inland:s.shrubsInland,
  spacing:Math.max(.7,s.shrubsSpread*.57),asset:shrubAssetSettings(s,wind(definition)),suitability:surface=>surface.vegetation?.shrubs??1},pathMask);
}

// Trees stand in niches read off the coast profile (docs/tree-lab-plan.md §3):
// the bluff edge, the shelterbelt behind it, landslide benches and ravine
// mouths, the back beach. Each niche is a strip of its own, measured from the
// local crest or foot rather than a nominal offset, with its own count,
// spacing, snag share and the species the table allows there; every tree
// draws its kind by the species shares, and some of them stand dead.
const NICHES={
 bluff:{tag:'bluff',spacing:9,perMetre:.1,snags:1.2,seed:1,range:f=>[f.top-2,f.top+8],suits:(s,f,q)=>s.height>.25&&s.normal.y>.8?smooth(f.top-3,f.top-1.5,q)*(1-smooth(f.top+6,f.top+9,q)):0},
 belt:{tag:'belt',snags:.5,seed:0,range:(f,t)=>[f.top+t.treesInland,f.top+t.treesInland+t.treesWidth],suits:s=>s.height>.25&&s.normal.y>.9?1:0},
 ravine:{tag:'wet',spacing:4,perMetre:.125,snags:.3,seed:2,range:f=>[f.foot-2,f.foot+f.width*.6],suits:(s,f,q)=>{const wet=Math.max(f.slide,f.ravine);return wet>.3&&s.normal.y>.7&&s.height>.2?smooth(.3,.6,wet)*(1-smooth(f.foot+f.width*.5,f.foot+f.width*.65,q)):0;}},
 beach:{tag:'sand',spacing:8,perMetre:1/12,snags:1.5,seed:3,range:(f,t,p)=>[p.terrainBeachWidth*.4,f.foot-1],suits:(s,f,q,p)=>s.height>.15&&(s.wetness??0)<.1&&s.normal.y>.85?smooth(p.terrainBeachWidth*.35,p.terrainBeachWidth*.5,q)*(1-smooth(f.foot-2.5,f.foot-.8,q)):0},
};
const SHARE_KEY={oleaster:'treesOleaster',elm:'treesElm',plum:'treesPlum',tamarisk:'treesTamarisk',willow:'treesWillow'};
export function createCoastTreePlanting(query,definition,input,pathMask=()=>0){
 const t=normalizeTreeSettings(input);
 if(!t.treesEnabled||!query)return [];
 const asset=treeAssetSettings(input,wind(definition)),p=definition;
 const margin=Math.min(64,p.terrainLength*.2),length=Math.min(t.treesLength,p.terrainLength-margin*2);
 const along=Math.max(-p.terrainLength*.5+margin+length*.5,Math.min(p.terrainLength*.5-margin-length*.5,t.treesAlong));
 const out=[];
 for(const [name,niche] of Object.entries(NICHES)){
  const density=name==='belt'?1:name==='bluff'?t.treesBluff:name==='ravine'?t.treesRavines:t.treesBeach;
  const count=name==='belt'?t.treesCount:Math.round(length*niche.perMetre*density);
  if(count<=0||density<=0)continue;
  const spacing=name==='belt'?t.treesSpacing:niche.spacing;
  const nominal=name==='belt'?t.treesWidth:name==='bluff'?10:name==='ravine'?p.terrainCliffSlope*.6+2:p.terrainBeachWidth*.5;
  const placed=scatterPlants(query,{seed:t.treesSeed+911+niche.seed*131,count,extent:[nominal,length],spacing,dryness:asset.dryness,ecology:asset,pathMask,
   // The strip's cross-shore span follows the local profile: `q` in [-nominal/2, nominal/2] maps onto the niche's range at this `s`.
   pointAt:(q,tt)=>{const sc=tt+along,f=coastProfile(sc,p),[q0,q1]=niche.range(f,t,p);return coastPoint(q0+(q/nominal+.5)*Math.max(.5,q1-q0),sc,p);},
   suitability:(s,x,z)=>{if(s.habitat==='rock')return 0;const local=coastCoordinates(x,z,p),q=local.u-shorePosition(local.s,p),f=coastProfile(local.s,p);return niche.suits(s,f,q,p);}});
  const kinds=TREE_KINDS.filter(kind=>kind!=='snag'&&TREE_SPECIES[kind].niches.includes(niche.tag));
  for(const plant of placed){
   const random=randomSequence(plant.seed*7+3);
   const weights=kinds.map(kind=>t[SHARE_KEY[kind]]??1),total=weights.reduce((a,b)=>a+b,0);
   let kind='oleaster';
   if(total>0){let r=random()*total;for(let i=0;i<kinds.length;i++){r-=weights[i];if(r<=0){kind=kinds[i];break;}}}
   if(random()<t.treesSnags*niche.snags)kind='snag';
   out.push({...plant,kind,niche:name});
  }
 }
 return out;
}
