import * as THREE from 'three';

export const OLEASTER_DEFAULTS = Object.freeze({ seed: 23, height: 1.35, spread: 1.75, density: .8, dryness: .22, leafSize: 1, wind: 3.5, windBearing: 290, flutter: .55, translucency: .65, roughness: .73 });
export function randomSequence(seed) {
  let value=seed>>>0;
  return () => { value+=0x6D2B79F5; let t=value; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; };
}
const point = (x,y,z) => new THREE.Vector3(x,y,z);
// One deterministic stream of randomness and the two primitives every form of
// the species is built from: a bent branch and a leaf on it. The mature tree
// (treeModel.js) shares them, so a leaf on a six-metre limb attaches, tints
// and flutters exactly like a leaf on a shrub twig. The order of rand() calls
// is the shape: keep it when editing, or every authored seed regrows.
export function createPlantBuilder(seed,{density=.8,leafSize=1,leafAspect=1,crownRadius=1}={}) {
  const rand=randomSequence(seed), branches=[], leaves=[];
  const addBranch = (curve,r0,parent=-1,parentT=0,extra) => {
    const record={id:branches.length,parent,parentT,curve,radius:r0,length:curve.getLength(),phase:rand()*Math.PI*2,...extra};
    branches.push(record); return record;
  };
  const branch = (start,end,bend,r0,parent=-1,parentT=0,extra) => addBranch(
    new THREE.QuadraticBezierCurve3(start.clone(),start.clone().lerp(end,.5).add(bend),end.clone()),r0,parent,parentT,extra,
  );
  const leaf = (stem,t,index) => {
    if(rand()>.3+.7*density)return;
    const pivot=stem.curve.getPoint(t), tangent=stem.curve.getTangent(t).normalize();
    const az=index*2.39996+stem.phase;
    const out=point(Math.cos(az),.2+rand()*.5,Math.sin(az)).addScaledVector(tangent,.3).normalize();
    const x=point().crossVectors(out,point(0,1,0));
    if(x.lengthSq()<.001)x.set(1,0,0);x.normalize();
    const normal=point().crossVectors(x,out).normalize();
    const roll=(rand()-.5)*1.5;
    x.applyAxisAngle(out,roll);normal.applyAxisAngle(out,roll);
    leaves.push({parent:stem.id,t,pivot,axis:out,x,normal,length:(.055+rand()*.03)*leafSize,width:(.012+rand()*.006)*leafSize*leafAspect,variant:Math.floor(rand()*4),phase:rand()*6.28,tint:(.64+rand()*.28)*(.62+.38*Math.min(1,Math.hypot(pivot.x,pivot.z)/(crownRadius*.9)))});
  };
  return {rand,branches,leaves,addBranch,branch,leaf};
}
export function makeOleaster(input={}) {
  const p={...OLEASTER_DEFAULTS,...input};
  const h=Math.max(.3,p.height), radius=Math.max(.3,p.spread)*.5;
  const {rand,branches,leaves,branch,leaf}=createPlantBuilder(p.seed,{density:p.density,leafSize:p.leafSize,crownRadius:radius});
  const stems=9;
  for(let i=0;i<stems;i++){
    const angle=i/stems*Math.PI*2+(rand()-.5)*.45, reach=radius*(i<7 ? .35+rand()*.4 : .12+rand()*.18);
    const start=point(Math.cos(angle)*.034,0,Math.sin(angle)*.034);
    const end=point(Math.cos(angle)*reach,h*(i<7 ? .48+rand()*.34 : .82+rand()*.13),Math.sin(angle)*reach);
    const trunk=branch(start,end,point(Math.cos(angle)*.06,h*.045,Math.sin(angle)*.06),.012+rand()*.006);
    for(let j=0;j<8;j++){
      const t=.11+j*.108, a=angle+(j%2?1:-1)*(.55+rand()*1.15);
      const root=trunk.curve.getPoint(t);
      const length=radius*(.4+rand()*.37)*(1-t*.4);
      const tip=root.clone().add(point(Math.cos(a)*length,h*(.055+rand()*.12),Math.sin(a)*length));
      const lateral=branch(root,tip,point(0,h*.045,0),trunk.radius*(1-t)*.48,trunk.id,t);
      for(let k=0;k<4;k++){
        const u=.2+k*.22, aa=a+(k%2?1:-1)*(.65+rand()*.65), at=lateral.curve.getPoint(u);
        const target=at.clone().add(point(Math.cos(aa)*(.08+rand()*.09)*p.spread, h*(.03+rand()*.065), Math.sin(aa)*(.08+rand()*.09)*p.spread));
        const twig=branch(at,target,point(0,.018,0),.0023*(1-u*.5),lateral.id,u);
        for(let n=0;n<12;n++)leaf(twig,.045+n*.083,n);
      }
      for(let n=0;n<10;n++)leaf(lateral,.18+n*.09,n);
    }
  }
  return {species:'Elaeagnus angustifolia',settings:p,branches,leaves,height:h};
}
function finish(data) {
  const g=new THREE.BufferGeometry();
  for(const [name,values]of Object.entries(data.attributes))g.setAttribute(name,new THREE.Float32BufferAttribute(values,name==='uv'?2:name==='leafWeight'||name==='phase'?1:3));
  g.setIndex(data.indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
  g.boundingSphere.radius+=.75*Math.max(g.boundingBox.max.y,0)**2+.08;g.userData.baseBounds=g.boundingBox.clone();return g;
}
function data() {return {attributes:{position:[],uv:[],leafPivot:[],leafAxis:[],leafWeight:[],phase:[],color:[]},indices:[]};}
function vertex(d,pos,uv,pivot,axis,weight,phase,tint) {d.attributes.position.push(...pos);d.attributes.uv.push(...uv);d.attributes.leafPivot.push(...pivot);d.attributes.leafAxis.push(...axis);d.attributes.leafWeight.push(weight);d.attributes.phase.push(phase);d.attributes.color.push(tint,tint,tint);}
export function makeBranchGeometry(model,lod=0) {
  const d=data(), thinRadius=model.branchDetail?.thinRadius??0;
  for(const b of model.branches){
    // A phone in the middle distance draws no twigs at all: their leaves stay.
    if(lod===1&&model.branchDetail?.midSkipsThin&&b.radius<thinRadius)continue;
    // A twig thinner than the species' threshold is a line, not a tube: it
    // keeps four sides up close and three in the middle distance.
    const radial=b.radius<thinRadius?(lod===0?4:3):(lod===0?7:4);
    const segments=lod===0?Math.max(3,Math.ceil(b.length/.07)):Math.max(2,Math.ceil(b.length/.2)),base=d.attributes.position.length/3;
    for(let j=0;j<=segments;j++){
      const t=j/segments,center=b.curve.getPoint(t),axis=b.curve.getTangent(t),x=point().crossVectors(axis,point(0,0,1));
      if(x.lengthSq()<1e-8)x.crossVectors(axis,point(0,1,0));x.normalize();
      const z=point().crossVectors(axis,x).normalize();
      // A twig tapers to nothing; a trunk hands its radius on to the limbs.
      const radiusEnd=b.radiusEnd??b.radius*.06;
      for(let k=0;k<=radial;k++){
        const a=k/radial*Math.PI*2,r=Math.max(.0005,b.radius+(radiusEnd-b.radius)*t);
        const pos=center.clone().addScaledVector(x,Math.cos(a)*r).addScaledVector(z,Math.sin(a)*r);
        vertex(d,pos.toArray(),[k/radial,t*b.length*6],[0,0,0],[1,0,0],0,b.phase,Math.min(1.05,.75+b.radius*4));
      }
    }
    for(let j=0;j<segments;j++)for(let k=0;k<radial;k++){const a=base+j*(radial+1)+k,c=a+radial+1;d.indices.push(a,a+1,c,a+1,c+1,c);}
  }
  return finish(d);
}
// The petiole is at local y=0 at every LOD. Atlas vertices use the same pivot.
// A species may ask for a cheaper near leaf: a tree carries ten thousand of
// them and reads as mass, where a shrub's few hundred read as shape.
export function makeLeafGeometry(model,lod=0) {
  const d=data(),rows=lod===0?(model.leafDetail?.rows??4):1,cols=lod===0?(model.leafDetail?.cols??2):1;
  // In the middle distance a species may keep every n-th leaf and grow it to
  // cover for the ones it dropped: the same green from afar, a fraction of it.
  const every=lod===1?(model.leafDetail?.midEvery??1):1,grow=Math.sqrt(every);
  for(const [index,leaf] of model.leaves.entries()){
    if(index%every)continue;
    const base=d.attributes.position.length/3,length=leaf.length*grow,width=leaf.width*grow;
    for(let j=0;j<=rows;j++)for(let k=0;k<=cols;k++){
      const t=j/rows,side=k/cols*2-1;
      const pos=leaf.pivot.clone().addScaledVector(leaf.axis,t*length).addScaledVector(leaf.x,side*width*.5).addScaledVector(leaf.normal,Math.sin(t*Math.PI)*length*.075+side*side*width*.06*Math.sin(t*Math.PI));
      vertex(d,pos.toArray(),[(leaf.variant+(side+1)*.5)/4,t],leaf.pivot.toArray(),leaf.x.toArray(),t,leaf.phase,leaf.tint);
    }
    for(let j=0;j<rows;j++)for(let k=0;k<cols;k++){const a=base+j*(cols+1)+k,c=a+cols+1;d.indices.push(a,a+1,c,a+1,c+1,c);}
  }
  return finish(d);
}
export function selectPlantLod(distance,projectedPixels,previous=0,lowPower=false,viewElevation=0) {
  if(distance<2)return 0;
  if(distance<5)return lowPower?1:0;
  if(viewElevation>-.35&&previous===2&&distance>16&&projectedPixels<105)return 2;
  if(viewElevation>-.35&&distance>24&&projectedPixels<75)return 2;
  if(lowPower)return 1;
  return previous===0 ? (distance>11&&projectedPixels<190?1:0) : (distance<8||projectedPixels>240?0:1);
}
// The geometry writer, for species built outside this file (grassModel.js).
export {data as plantGeometryData,vertex as plantGeometryVertex,finish as plantGeometryFinish};
