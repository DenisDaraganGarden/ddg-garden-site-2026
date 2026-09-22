import * as THREE from 'three';
import { coastPoint, coastHeight, sampleTerrainNormal, shorePosition, COAST_STRIP_LENGTH } from './terrainModel.js';
import { coastProfile } from './terrainLandforms.js';
const subdivisions = (a,b,n,out) => { for(let i=0;i<n;i++)out.push(a+(b-a)*i/n); };
// A quad on a bank is split along the diagonal with the smaller height change,
// so a bank crossing the grid at an angle reads as a slope, not as sawteeth.
// The coarsest level decides from its own heights; finer levels inherit the
// parent quad's diagonal, so every fine triangle stays inside one parent
// triangle and the LOD morph lands on the parent's real surface.
const splitAlongAD=(y,a,b,c,d)=>Math.abs(y[a*3+1]-y[d*3+1])<Math.abs(y[b*3+1]-y[c*3+1]);
const splitOf=parent=>(z,r,i)=>parent.userData.split[z][(r>>1)*(parent.userData.zones[z].cols-1)+(i>>1)]===1;
const plateauAt=(s,p)=>{const f=coastProfile(s,p);return Math.min(f.top+Math.max(8,f.bank*3),p.terrainLandWidth-49);};
// The zone cut behind the crown sits on one fixed q for the whole coast, not
// on the wandering plateau line: two zones - or two strips - meeting on a
// column that moves along the shore overlap and gap by the chord of that move.
const plateauCuts=new WeakMap();
function plateauCut(p){
  if(!plateauCuts.has(p)){
    let cut=0;for(let i=0;i<=256;i++)cut=Math.max(cut,plateauAt(-p.terrainLength*.5+p.terrainLength*i/256,p));
    plateauCuts.set(p,Math.min(cut+2,p.terrainLandWidth-56));
  }
  return plateauCuts.get(p);
}
function buildStrip(p,s0,lod=2,water=false,parentSplit=null) {
  const spit=p.terrainSpitEnabled&&s0+COAST_STRIP_LENGTH>=p.spit.bounds.minS&&s0<=p.spit.bounds.maxS;
  const along=(water?(spit?[64,32,16]:[64,32,8]):[128,64,32])[lod],detail=[1,.5,.25][lod];
  // Offshore detail is set by the shoal's metre scale, not by its distance
  // from the old waterline. The steep spit banks keep nested 1/2/4 m columns;
  // parent morphs remain exact as the shelf also halves along-shore rows.
  const shelfColumns=Math.max(8,Math.ceil((p.coastOffshore-32)/(spit?4:8)/8)*8)*(spit?[4,2,1][lod]:1);
  // On land the spit keeps its metre columns and every along-shore row only in
  // a band around its own centreline, row by row, so the band bends with the
  // spit; the shelf on either side is the ordinary shelf. Column counts are
  // fixed per strip and each band is its own zone, so the fine grid still
  // nests exactly in its parent and the strips still meet row for row.
  const s1Row=Math.min(p.terrainLength*.5,s0+COAST_STRIP_LENGTH);
  const spitHalf=spit?p.spit.nodes.reduce((m,n)=>Math.max(m,n.width),0)+(Math.min(...p.spit.nodes.map(n=>n.u))-p.spit.bounds.minU)+6:0;
  const spitCentre=s=>{let best=p.spit.nodes[0];for(const n of p.spit.nodes)if(Math.abs(n.s-s)<Math.abs(best.s-s))best=n;return best.u;};
  const spitEdges=(s,near)=>{const c=spitCentre(s)-shorePosition(s,p),b=Math.min(near?-48:-32,c+spitHalf);return [Math.max(-p.coastOffshore,Math.min(c-spitHalf,b-16)),b];};
  const nearShelf=spit&&Math.max(...[s0,s1Row].map(s=>-32-spitEdges(s,false)[1]))>=48;
  const farShelf=spit&&Math.max(...[s0,s1Row].map(s=>spitEdges(s,nearShelf)[0]+p.coastOffshore))>=32;
  const shelfBase=len=>Math.max(8,Math.ceil(len/8/8)*8);
  const spitBands=s=>{
    const [a,b]=spitEdges(s,nearShelf),bands=[];
    if(farShelf)bands.push([-p.coastOffshore,a,shelfBase(Math.max(...[s0,s1Row].map(t=>spitEdges(t,nearShelf)[0]+p.coastOffshore)))]);
    bands.push([farShelf?a:-p.coastOffshore,nearShelf?b:-32,Math.max(8,Math.ceil(2*spitHalf/4/8)*8)*4]);
    if(nearShelf)bands.push([b,-32,shelfBase(Math.max(...[s0,s1Row].map(t=>-32-spitEdges(t,true)[1])))]);
    return bands;
  };
  const s1=Math.min(p.terrainLength*.5,s0+COAST_STRIP_LENGTH);
  const plateauFixed=plateauCut(p);
  let zoneEdges=[];
  const columnsAt = s => {
    const qs=[];
    // Resolve the wave across the shore even in the far LOD. Terrain rows
    // follow the bluff's foot and crown instead of cutting across its bend.
    // Let the unified V2 coast surface fade out where coastMask itself begins.
    // Its offshore edge is therefore outside the visible surf band rather than
    // a material boundary at q=-32.
    if(water) {
      subdivisions(-p.coastOffshore,-32,p.coastOffshore===96&&!spit?[24,12,8][lod]:(spit?shelfColumns:Math.max(8,Math.round(shelfColumns*detail))),qs);
      subdivisions(-32,8,[80,40,24][lod],qs);
      zoneEdges=[-32];
    }
    else {
      const f=coastProfile(s,p),start=f.foot,top=f.top;
      const wet=Math.min(1.4,start*.4),edge=p.terrainLandWidth-48;
      const plateau=plateauAt(s,p);
      const bands=[...(spit?spitBands(s):[[-p.coastOffshore,-32,p.coastOffshore===96?8:shelfColumns]]),[-32,-4,16],[-4,wet,20],[wet,start,12],
        [start,start+f.width*.5,12],[start+f.width*.5,start+f.width*.58,8],[start+f.width*.58,start+f.width*.76,8],
        [start+f.width*.76,top,16],[top,plateau,20],[plateau,plateauFixed,16],[plateauFixed,edge,16],[edge,p.terrainLandWidth,16]];
      for(const [a,b,n] of bands)subdivisions(a,b,Math.max(2,Math.round(n*detail)),qs);
      zoneEdges=spit?[...spitBands(s).slice(1).map(([a])=>a),-32,-4,plateauFixed]:[-4,plateauFixed];
    }
    qs.push(water?8:p.terrainLandWidth);return qs;
  };
  // Row density is not one number per strip. The surf, beach and bluff keep
  // every along-shore row; the shelf under the water and the plateau behind
  // the crown keep every fourth. Each zone is its own regular grid inside the
  // one buffer, so it nests exactly in the parent LOD's zone and the morph
  // stays exact. The shared column is duplicated; the millimetre crack between
  // a fine polyline and a coarse chord is closed by a short skirt below it.
  const columns=columnsAt(s0),width=columns.length;
  const edgeIndex=q=>columns.findIndex(c=>Math.abs(c-q)<1e-6);
  const cuts=[0,...zoneEdges.map(edgeIndex),width-1];
  const steps=water?[spit?1:4,1]:(spit?[...(farShelf?[4]:[]),1,...(nearShelf?[4]:[]),1,1,4]:[4,1,4]);
  const spitZone=spit&&!water?(farShelf?1:0):-1;
  const positions=[],normals=[],uvs=[],indices=[],optics=[],zones=[],split=[];
  for(let z=0;z<steps.length;z++){
    const c0=cuts[z],c1=cuts[z+1],cols=c1-c0+1,rows=along/Math.min(steps[z],along),offset=positions.length/3;
    for(let r=0;r<=rows;r++){
      const s=s0+(s1-s0)*r/rows,qs=columnsAt(s);
      for(let i=c0;i<=c1;i++){const {x,z:zz}=coastPoint(qs[i],s,p),y=water?0:coastHeight(qs[i],s,p);const n=water?{x:0,y:1,z:0}:sampleTerrainNormal(x,zz,p);
        positions.push(x,y,zz);normals.push(n.x,n.y,n.z);uvs.push(x,zz);}
    }
    const quads=new Uint8Array(rows*(cols-1));
    for(let r=0;r<rows;r++)for(let i=0;i<cols-1;i++){const a=offset+r*cols+i,b=a+1,c=a+cols,d=c+1;const ad=parentSplit?parentSplit(z,r,i):(!water&&splitAlongAD(positions,a,b,c,d));quads[r*(cols-1)+i]=ad?1:0;if(ad)indices.push(a,c,d,a,d,b);else indices.push(a,c,b,b,c,d);}
    split.push(quads);
    // The same vertices, every other row and column: the parent grid, for the
    // reflection and refraction passes whose targets cannot resolve more.
    const rs=rows>=2?2:1,cs=z===spitZone?1:cols>=3?2:1;
    for(let r=0;r<rows;r+=rs)for(let i=0;i+cs<cols;i+=cs){const a=offset+r*cols+i,b=a+cs,c=offset+Math.min(rows,r+rs)*cols+i;optics.push(a,c,b,b,c,c+cs);}
    zones.push({offset,rows,cols,step:steps[z],q0:columns[c0],q1:columns[c1]});
  }
  const topVertices=positions.length/3,topTriangles=indices.length/3,opticsTriangles=optics.length/3;
  // Skirts hide only cracks: between strips along the shore, and between the
  // zones of one strip. They hang as deep as the crack can be - a hand on the
  // flat shelf, beach and plateau, the bluff's own scale on the bluff.
  const skirt=[];
  const hang=(from,depth)=>{const k=from*3;positions.push(positions[k],positions[k+1]-depth,positions[k+2]);normals.push(normals[k],normals[k+1],normals[k+2]);uvs.push(uvs[from*2],uvs[from*2+1]);skirt.push({from,depth});return positions.length/3-1;};
  const land=[p.landX,p.landZ];
  const quad=(a,b,c,d,face)=>{
    // Wind the two triangles so the skirt faces the crack side.
    const ax=positions[a*3],az=positions[a*3+2],bx=positions[b*3],bz=positions[b*3+2],cx=positions[c*3],cz=positions[c*3+2];
    const ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az);
    // Vertical quad: the horizontal normal is the edge direction rotated. Test it against the face direction.
    const ex=bx-ax,ez=bz-az,nx=ez,nz=-ex,dot=nx*face[0]+nz*face[1];
    if(dot*(ny===0?1:1)>=0)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d);
  };
  if(!water){
    const sMid=s0+(s1-s0)*.5,deep=Math.max(2,p.terrainCliffHeight*.8);
    const depthAt=q=>{const slope=Math.abs(coastHeight(q+.5,sMid,p)-coastHeight(q-.5,sMid,p));return .45+(deep-.45)*Math.min(1,slope/.35);};
    for(const zone of zones){
      const {offset,rows,cols}=zone,qs=columnsAt(s0).slice(cuts[zones.indexOf(zone)],cuts[zones.indexOf(zone)+1]+1);
      const depths=qs.map(depthAt);
      for(const [row,sign] of [[0,-1],[rows,1]]){
        const face=[p.alongX*sign,p.alongZ*sign],start=positions.length/3;
        for(let i=0;i<cols;i++)hang(offset+row*cols+i,depths[i]);
        for(let i=0;i<cols-1;i++){const a=offset+row*cols+i;quad(a,a+1,start+i,start+i+1,face);}
      }
    }
    for(let z=0;z<zones.length-1;z++){
      // The finer zone's edge polyline and the coarser zone's chord: a skirt from each, facing the other.
      const left=zones[z],right=zones[z+1];
      for(const [zone,col,sign] of [[left,left.cols-1,1],[right,0,-1]]){
        const face=[land[0]*sign,land[1]*sign],start=positions.length/3;
        for(let r=0;r<=zone.rows;r++)hang(zone.offset+r*zone.cols+col,.45);
        for(let r=0;r<zone.rows;r++){const a=zone.offset+r*zone.cols+col;quad(a,a+zone.cols,start+r,start+r+1,face);}
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  if(water){geometry.boundingBox.min.y=-.5;geometry.boundingBox.max.y=.5;geometry.boundingSphere.radius+=.5;}
  // Skirts come along unchanged: the coarse rim and the fine skirt top differ by a chord no optics target resolves.
  const opticsIndex=water?null:new THREE.BufferAttribute(new (positions.length/3>65535?Uint32Array:Uint16Array)([...optics,...indices.slice(topTriangles*3)]),1);
  geometry.userData={lod,water,width,along,zones,split,skirt,topVertices,topTriangles,opticsTriangles,opticsIndex};return geometry;
}
// Detail follows what the screen can resolve, not metres: a grid cell should
// cover a few pixels whatever the lens or the window. LOD 0 while the half-metre
// row is about four pixels wide, LOD 1 while the metre is about three.
export const TERRAIN_LOD_METRES_PER_PIXEL=Object.freeze([.14,.42]);
export function terrainMetresPerPixel(distance,fovDeg=24,viewportHeight=900) { return 2*Math.max(0,distance)*Math.tan(fovDeg*Math.PI/360)/Math.max(1,viewportHeight); }
export function terrainLod(metresPerPixel,lowPower=false) { return metresPerPixel<TERRAIN_LOD_METRES_PER_PIXEL[0]?(lowPower?1:0):metresPerPixel<TERRAIN_LOD_METRES_PER_PIXEL[1]?1:2; }

// Nested zones retain the foot, landslide bench and headwall at every LOD.
// Every zone of the fine strip is a regular grid twice as dense as the same
// zone of its parent, so a fine vertex lands on the parent's actual triangle
// by plain bilinear weights, including X/Z: moving only height would leave a
// coastline snap as the curved rows change.
export function buildTerrainStrip(p,s0,lod=2,water=false){
 if(water)return buildStrip(p,s0,lod,true);
 const chain=[buildStrip(p,s0,2)];
 for(let level=1;level>=lod;level--)chain.push(buildStrip(p,s0,level,false,splitOf(chain.at(-1))));
 const geometry=chain.pop();
 if(lod===2)return geometry;
 const coarse=chain.pop();
 const cp=coarse.attributes.position.array,cn=coarse.attributes.normal.array;
 const fine=geometry.attributes.position.array;
 const positions=new Float32Array(fine.length),normals=new Float32Array(fine.length);
 geometry.userData.zones.forEach((zone,z)=>{
  const parent=coarse.userData.zones[z],{rows,cols,offset}=zone,pr=parent.rows,pc=parent.cols,po=parent.offset;
  for(let row=0;row<=rows;row++)for(let col=0;col<cols;col++){
   const at=(offset+row*cols+col)*3;
   const x=col*(pc-1)/(cols-1),y=row*pr/rows,ix=Math.min(pc-2,Math.floor(x)),iy=Math.min(pr-1,Math.floor(y));
   const fx=x-ix,fy=y-iy,a=po+iy*pc+ix,b=a+1,c=a+pc,d=c+1;
   const [ids,weights]=coarse.userData.split[z][iy*(pc-1)+ix]===1
    ?(fy>=fx?[[a,c,d],[1-fy,fy-fx,fx]]:[[a,d,b],[1-fx,fy,fx-fy]])
    :(fx+fy<=1?[[a,c,b],[1-fx-fy,fy,fx]]:[[b,c,d],[1-fy,1-fx,fx+fy-1]]);
   for(let k=0;k<3;k++){positions[at+k]=ids.reduce((sum,id,i)=>sum+cp[id*3+k]*weights[i],0);normals[at+k]=ids.reduce((sum,id,i)=>sum+cn[id*3+k]*weights[i],0);}
  }
 });
 geometry.userData.skirt.forEach(({from,depth},i)=>{
  const at=(geometry.userData.topVertices+i)*3,src=from*3;
  for(let k=0;k<3;k++){positions[at+k]=positions[src+k];normals[at+k]=normals[src+k];}
  positions[at+1]-=depth;
 });
 geometry.morphAttributes.position=[new THREE.Float32BufferAttribute(positions,3)];
 geometry.morphAttributes.normal=[new THREE.Float32BufferAttribute(normals,3)];
 geometry.computeBoundingBox();geometry.computeBoundingSphere();coarse.dispose();chain.forEach(g=>g.dispose());return geometry;
}
