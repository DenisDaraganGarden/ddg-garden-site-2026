import * as THREE from 'three';
import {randomSequence,plantGeometryData,plantGeometryVertex,plantGeometryFinish} from './oleasterModel.js';
import {GRASS_ATLASES} from './grassAtlas.js';

// A tuft: blades around one root plus the species' parts - awns on culms,
// spikes, reed stems with leaves and panicles. Every piece is a ribbon along a
// bent line with the oleaster leaf's vertex contract (pivot, lateral axis,
// weight, phase, tint), so plantMaterials bends, tints and backlights it
// unchanged and PlantPopulation drives it through the same three levels.
export const GRASS_SPECIES_DEFAULTS=Object.freeze({
 stipa:{seed:5,height:.65,blades:16,spread:.22,curl:.55,awns:5},
 festuca:{seed:5,height:.22,blades:16,spread:.14,curl:.7},
 leymus:{seed:5,height:.8,blades:8,spread:.3,curl:.32,spikes:1},
 phragmites:{seed:5,height:2.1,stems:3,spread:.35,curl:.5,leaves:3},
});
export const GRASS_SPECIES_NAMES=Object.freeze({stipa:'Stipa lessingiana',festuca:'Festuca valesiaca',leymus:'Leymus racemosus',phragmites:'Phragmites australis'});
const point=(x,y,z)=>new THREE.Vector3(x,y,z);
const UP=point(0,1,0);

// uv rectangle of a part cell: image origin top-left, texture v origin bottom.
function cellUv(kind,part,index){
 const atlas=GRASS_ATLASES[kind],rects=atlas.parts[part],[x,y,w,h]=rects[index%rects.length];
 return {u0:x/atlas.width,u1:(x+w)/atlas.width,v0:1-(y+h)/atlas.height,v1:1-y/atlas.height,aspect:w/h};
}
// The centre line of a piece: `tilt` leans it from vertical toward `out`,
// `curl` arches it further out and down.
function linePoint(piece,t){
 const s=Math.sin(piece.tilt),c=Math.cos(piece.tilt),L=piece.length;
 return piece.root.clone().addScaledVector(UP,L*(t*c-piece.curl*.3*t*t)).addScaledVector(piece.out,L*(t*s+piece.curl*.5*t*t));
}
// Width follows the atlas cell's proportions (the alpha draws the real
// blade), narrowed by `widthScale`; `inset` samples the middle of a cell.
function writePiece(d,piece,rows){
 const lateral=point().crossVectors(piece.out,UP);if(lateral.lengthSq()<1e-6)lateral.set(1,0,0);lateral.normalize();
 const inset=piece.inset??0,width=piece.length*piece.uv.aspect*(1-2*inset)*(piece.widthScale??1);
 const pivot=(piece.pivot??piece.root).toArray(),[w0,w1]=piece.weight;
 // A plume, panicle or spike is two cards crossed at right angles, so it has
 // a face toward every camera; a blade is one ribbon.
 const facings=piece.cross?[lateral,point().crossVectors(UP,lateral).normalize()]:[lateral];
 for(const across of facings){
  const base=d.attributes.position.length/3;
  for(let j=0;j<=rows;j++){
   const t=j/rows,centre=linePoint(piece,t);
   for(let k=0;k<=1;k++){
    const pos=centre.clone().addScaledVector(across,(k*2-1)*width*.5);
    plantGeometryVertex(d,pos.toArray(),[piece.uv.u0+(inset+k*(1-2*inset))*(piece.uv.u1-piece.uv.u0),piece.uv.v0+t*(piece.uv.v1-piece.uv.v0)],pivot,across.toArray(),w0+t*(w1-w0),piece.phase,piece.tint);
   }
  }
  for(let j=0;j<rows;j++){const a=base+j*2;d.indices.push(a,a+1,a+2,a+1,a+3,a+2);}
 }
}
// Near, middle and far by distance, scaled by the species' height so a reed
// keeps its stems as long as a fescue keeps its blades on screen.
function lodSelector(height){
 const k=Math.max(.6,Math.min(3,height/.6));
 return (distance,pixels,previous=0,lowPower=false)=>{
  const near=(lowPower?6:11)*k,mid=(lowPower?22:38)*k;
  if(distance<near*(previous===0?1.15:.85))return 0;
  if(distance<mid*(previous===2?.85:1.15))return 1;
  return 2;
 };
}

export function makeGrassTuft(kind,input={}){
 const p={...GRASS_SPECIES_DEFAULTS[kind],...input},rand=randomSequence(p.seed*7+kind.length*131);
 const h=Math.max(.05,p.height),spread=Math.max(.02,p.spread),pieces=[];
 const tint=()=>.78+rand()*.27,phase=()=>rand()*Math.PI*2;
 const radial=(a,r)=>({root:point(Math.cos(a)*r,0,Math.sin(a)*r),out:point(Math.cos(a),0,Math.sin(a))});
 if(kind==='phragmites'){
  for(let i=0;i<p.stems;i++){
   const a=rand()*Math.PI*2,{root,out}=radial(a,spread*.5*Math.sqrt(rand()));
   const stem={rows:4,root,out,length:h*(.8+rand()*.3),uv:cellUv(kind,'stems',i),tilt:.05+rand()*.12,curl:.08,widthScale:.3,phase:phase(),tint:tint(),weight:[0,.6]};
   pieces.push(stem);
   for(let j=0;j<p.leaves;j++){
    const t=.3+j*(.45/Math.max(1,p.leaves-1)),at=linePoint(stem,t),la=a+(j%2?1:-1)*(.9+rand()*.8);
    pieces.push({rows:4,root:at,out:point(Math.cos(la),0,Math.sin(la)),length:stem.length*.25*(1-t*.3),uv:cellUv(kind,'leaves',Math.floor(rand()*6)),tilt:.9+rand()*.3,curl:p.curl*.8,phase:phase(),tint:tint(),weight:[.6,1]});
   }
   const top=linePoint(stem,1);
   pieces.push({rows:2,cross:true,root:top,out,length:stem.length*.15,uv:cellUv(kind,'panicles',Math.floor(rand()*4)),tilt:.25+rand()*.2,curl:.2,phase:phase(),tint:1,weight:[1,1]});
  }
 } else {
  for(let i=0;i<p.blades;i++){
   const a=i/p.blades*Math.PI*2+rand()*.5,r=spread*.5*(.15+.85*Math.sqrt(rand())),{root,out}=radial(a,r);
   pieces.push({rows:4,root,out,length:h*(.7+rand()*.35),uv:cellUv(kind,'blades',Math.floor(rand()*8)),tilt:.12+(r/(spread*.5))*.55+rand()*.15,curl:p.curl*(.6+rand()*.6),widthScale:kind==='leymus'?.6:1,phase:phase(),tint:tint(),weight:[0,1]});
  }
  const culms=kind==='stipa'?p.awns:kind==='leymus'?p.spikes:0;
  for(let i=0;i<culms;i++){
   const {root,out}=radial(rand()*Math.PI*2,spread*.2*rand());
   const culm={rows:2,root,out,length:h*(kind==='stipa'?1.15+rand()*.25:1.05+rand()*.15),uv:cellUv(kind,'blades',Math.floor(rand()*4)),tilt:.08+rand()*.2,curl:.12,widthScale:.22,inset:.35,phase:phase(),tint:.9,weight:[0,.8]};
   pieces.push(culm);
   const top=linePoint(culm,1);
   pieces.push({rows:2,cross:true,root:top,out,length:h*(kind==='stipa'?.45:.28),uv:cellUv(kind,kind==='stipa'?'awns':'spikes',Math.floor(rand()*4)),tilt:kind==='stipa'?.35+rand()*.3:.05,curl:kind==='stipa'?.5:0,phase:phase(),tint:1,weight:[.8,1]});
  }
 }
 let height=0;
 for(const piece of pieces)for(const t of [.5,.75,1])height=Math.max(height,linePoint(piece,t).y);
 const geometry=lod=>{
  const d=plantGeometryData();
  for(const piece of pieces)writePiece(d,piece,lod===0?piece.rows:Math.max(1,Math.ceil(piece.rows/2)));
  return {bark:plantGeometryFinish(plantGeometryData()),leaf:plantGeometryFinish(d)};
 };
 return {species:GRASS_SPECIES_NAMES[kind],form:'grass',kind,settings:p,branches:[],leaves:pieces,height,geometry,selectLod:lodSelector(height)};
}
