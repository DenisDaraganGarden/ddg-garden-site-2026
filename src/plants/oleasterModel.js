import * as THREE from 'three';

export const OLEASTER_DEFAULTS = Object.freeze({ seed: 23, height: 1.35, spread: 1.75, density: .8, dryness: .22, leafSize: 1, wind: 3.5, windBearing: 290, flutter: .55, translucency: .65, roughness: .73 });
export function randomSequence(seed) {
  let value=seed>>>0;
  return () => { value+=0x6D2B79F5; let t=value; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; };
}
const point = (x,y,z) => new THREE.Vector3(x,y,z);
export function makeOleaster(input={}) {
  const p={...OLEASTER_DEFAULTS,...input}, rand=randomSequence(p.seed), branches=[], leaves=[];
  const h=Math.max(.3,p.height), radius=Math.max(.3,p.spread)*.5;
  const branch = (start,end,bend,r0,parent=-1,parentT=0) => {
    const curve=new THREE.QuadraticBezierCurve3(start.clone(),start.clone().lerp(end,.5).add(bend),end.clone());
    const record={id:branches.length,parent,parentT,curve,radius:r0,length:curve.getLength(),phase:rand()*Math.PI*2};
    branches.push(record); return record;
  };
  const leaf = (stem,t,index) => {
    if(rand()>.3+.7*p.density)return;
    const pivot=stem.curve.getPoint(t), tangent=stem.curve.getTangent(t).normalize();
    const az=index*2.39996+stem.phase;
    const out=point(Math.cos(az),.2+rand()*.5,Math.sin(az)).addScaledVector(tangent,.3).normalize();
    const x=point().crossVectors(out,point(0,1,0));
    if(x.lengthSq()<.001)x.set(1,0,0);x.normalize();
    const normal=point().crossVectors(x,out).normalize();
    const roll=(rand()-.5)*1.5;
    x.applyAxisAngle(out,roll);normal.applyAxisAngle(out,roll);
    leaves.push({parent:stem.id,t,pivot,axis:out,x,normal,length:(.055+rand()*.03)*p.leafSize,width:(.012+rand()*.006)*p.leafSize,variant:Math.floor(rand()*4),phase:rand()*6.28,tint:(.64+rand()*.28)*(.62+.38*Math.min(1,Math.hypot(pivot.x,pivot.z)/(radius*.9)))});
  };
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
  const d=data(), radial=lod===0?7:4;
  for(const b of model.branches){
    const segments=lod===0?Math.max(3,Math.ceil(b.length/.07)):Math.max(2,Math.ceil(b.length/.2)),base=d.attributes.position.length/3;
    for(let j=0;j<=segments;j++){
      const t=j/segments,center=b.curve.getPoint(t),axis=b.curve.getTangent(t),x=point().crossVectors(axis,point(0,0,1));
      if(x.lengthSq()<1e-8)x.crossVectors(axis,point(0,1,0));x.normalize();
      const z=point().crossVectors(axis,x).normalize();
      for(let k=0;k<=radial;k++){
        const a=k/radial*Math.PI*2,r=Math.max(.0005,b.radius*(1-t*.94));
        const pos=center.clone().addScaledVector(x,Math.cos(a)*r).addScaledVector(z,Math.sin(a)*r);
        vertex(d,pos.toArray(),[k/radial,t*b.length*6],[0,0,0],[1,0,0],0,b.phase,.75+b.radius*4);
      }
    }
    for(let j=0;j<segments;j++)for(let k=0;k<radial;k++){const a=base+j*(radial+1)+k,c=a+radial+1;d.indices.push(a,a+1,c,a+1,c+1,c);}
  }
  return finish(d);
}
// The petiole is at local y=0 at every LOD. Atlas vertices use the same pivot.
export function makeLeafGeometry(model,lod=0) {
  const d=data(),rows=lod===0?4:1,cols=lod===0?2:1;
  for(const leaf of model.leaves){
    const base=d.attributes.position.length/3;
    for(let j=0;j<=rows;j++)for(let k=0;k<=cols;k++){
      const t=j/rows,side=k/cols*2-1;
      const pos=leaf.pivot.clone().addScaledVector(leaf.axis,t*leaf.length).addScaledVector(leaf.x,side*leaf.width*.5).addScaledVector(leaf.normal,Math.sin(t*Math.PI)*leaf.length*.075+side*side*leaf.width*.06*Math.sin(t*Math.PI));
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
