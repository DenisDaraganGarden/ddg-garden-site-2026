import * as THREE from 'three';
import {preserveRenderer} from './plantAtlases.js';

// One light on every level. On the first frame the card is rendered beside the
// geometry it stands for - under the scene's own environment and key light, the
// same camera, at the three sizes a card is seen at (its own frame, a mid card,
// a far card, a farther one), lit from behind the camera and against it - and the ratios of
// mean luminance, saturation and silhouette go into the card's uniforms, which
// the shader interpolates by the mip it samples and by how much the sun is in
// front of the viewer. Self-shadow, the bark grain, the twigs the bake loses,
// the leaf/bark restore and the card's transmission on every pixel are all
// inside those numbers: one measurement per species under its own light
// instead of hand-tuned constants, spread over the first frames one
// measurement at a time (a generator), so no frame pays for all of it. The
// comparison is made the way the eye
// makes it: an antialiased buffer with alpha-to-coverage, as on screen. Each
// view is drawn over black and over white; their difference is the visible
// coverage of every pixel, the black pass divided by it the plant's own
// colour, weighed by that coverage, after tone mapping.
export const CARD_MIPS=Object.freeze([0,.6,1.5,2.5,3.5]);
const LUM=[.2126,.7152,.0722],ELEVATION=.15;

// three's ACESFilmicToneMapping, for read-back linear values.
function aces(r,g,b,exposure){
 r*=exposure/.6;g*=exposure/.6;b*=exposure/.6;
 let x=.59719*r+.35458*g+.04823*b,y=.076*r+.90834*g+.01566*b,z=.0284*r+.13383*g+.83777*b;
 const fit=v=>(v*(v+.0245786)-.000090537)/(v*(.983729*v+.432951)+.238081);
 x=fit(x);y=fit(y);z=fit(z);
 const o=[1.60475*x-.53108*y-.07367*z,-.10208*x+1.10813*y-.00605*z,-.00327*x-.07276*y+1.07602*z];
 return o.map(c=>{c=Math.max(0,Math.min(1,c));return c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055;});
}
// The scene's light, transplanted: the key light keeps its world direction,
// colour and intensity and gets a shadow camera fitted to the plant; sky and
// ambient come along as they are; the point lights of the editor do not.
function transplantLights(scene,stage,height,centre){
 const lights=[];let key=null;
 scene?.traverse(o=>{if(!o.isLight||!o.visible)return;if(o.isDirectionalLight){if(!key||o.intensity>key.intensity)key=o;}else if(o.isHemisphereLight||o.isAmbientLight)lights.push(o.clone());});
 const sun=new THREE.DirectionalLight(key?key.color:0xffffff,key?key.intensity:1.8);
 const direction=new THREE.Vector3(Math.sin(2.2)*Math.cos(.9),Math.sin(.9),Math.cos(2.2)*Math.cos(.9));
 if(key){key.getWorldPosition(direction).sub(key.target.getWorldPosition(new THREE.Vector3()));if(direction.lengthSq()<1e-8)direction.set(0,1,0);direction.normalize();}
 sun.position.copy(centre).addScaledVector(direction,height*6);sun.target.position.copy(centre);
 sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.bias=-.0004;sun.shadow.normalBias=.02;
 const sc=sun.shadow.camera;sc.left=-height;sc.right=height;sc.bottom=-height;sc.top=height;sc.near=.1;sc.far=height*12;
 if(!lights.length)lights.push(new THREE.HemisphereLight(0xffffff,0x77746b,scene?.environment?0:1));
 stage.add(sun,sun.target,...lights);
 stage.environment=scene?.environment??null;stage.environmentIntensity=scene?.environmentIntensity??1;
 return {lights:[sun,...lights],direction};
}

export function* calibratePlantCard(renderer,scene,geometry,materials,farGeometry,farMaterial,impostor,model){
 const frame=impostor.frameSize,size=Math.min(1024,Math.ceil(frame*1.2)),height=Math.max(.2,model.height),centre=impostor.center,exposure=renderer.toneMappingExposure;
 const rt=new THREE.WebGLRenderTarget(size,size,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType,depthBuffer:true,samples:4});rt.texture.colorSpace=THREE.NoColorSpace;
 const pixels=new Uint8Array(size*size*4),white=new Uint8Array(size*size*4),stage=new THREE.Scene(),BLACK=new THREE.Color(0,0,0),WHITE=new THREE.Color(1,1,1);
 const {lights,direction}=transplantLights(scene,stage,height,centre);
 // Two views: the sun behind the camera, and the sun in front of it.
 const sunAzimuth=Math.atan2(direction.x,direction.z),VIEWS=[sunAzimuth,sunAzimuth+Math.PI];
 const identity=new THREE.Matrix4();
 const near=[new THREE.InstancedMesh(geometry.bark,materials.bark,1),new THREE.InstancedMesh(geometry.leaf,materials.leaves,1)];
 near[0].customDepthMaterial=materials.barkDepth;near[1].customDepthMaterial=materials.leafDepth;
 const far=new THREE.InstancedMesh(farGeometry,farMaterial,1);far.customDepthMaterial=farMaterial.userData.depth;
 for(const m of [...near,far]){m.setMatrixAt(0,identity);m.instanceMatrix.needsUpdate=true;m.castShadow=true;m.receiveShadow=true;m.frustumCulled=false;}
 const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,height*40),dir=new THREE.Vector3();
 const u=farMaterial.userData.uniforms,gain=u.uPlantCardGain.value,gainBack=u.uPlantCardGainBack.value,chroma=u.uPlantCardChroma.value,cut=u.uPlantCardCut.value;
 gain.fill(1);gainBack.fill(1);chroma.fill(1);cut.set(1,0);
 // Coverage-weighted mean tone-mapped luminance and saturation, and the
 // covered area, of the plant seen from `azimuth` at the window the mip asks for.
 const measure=(meshes,mip,azimuth)=>{
  const s=Math.max(24,Math.min(size,Math.ceil(frame/2**mip*1.2))),sum={n:0,solid:0,lum:0,sat:0};
  dir.set(Math.sin(azimuth)*Math.cos(ELEVATION),Math.sin(ELEVATION),Math.cos(azimuth)*Math.cos(ELEVATION));
  camera.position.copy(centre).addScaledVector(dir,height*8);camera.up.set(0,1,0);camera.lookAt(centre);
  const span=height*1.15*s/(frame/2**mip)*.5;camera.left=-span;camera.right=span;camera.top=span;camera.bottom=-span;camera.updateProjectionMatrix();
  for(const o of stage.children.filter(o=>o.isMesh))stage.remove(o);for(const m of meshes)stage.add(m);
  preserveRenderer(renderer,()=>{
   const shadows={enabled:renderer.shadowMap.enabled,auto:renderer.shadowMap.autoUpdate};renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=true;
   try{
    // The window lives on the target itself: the shadow pass inside render()
    // re-applies it, a renderer viewport it would reset (and scale by DPR).
    rt.viewport.set(0,0,s,s);rt.scissor.set(0,0,s,s);rt.scissorTest=true;renderer.setRenderTarget(rt);
    renderer.setClearColor(BLACK,0);renderer.clear();renderer.render(stage,camera);renderer.readRenderTargetPixels(rt,0,0,s,s,pixels);
    renderer.setClearColor(WHITE,1);renderer.clear();renderer.render(stage,camera);renderer.readRenderTargetPixels(rt,0,0,s,s,white);
   }finally{renderer.shadowMap.enabled=shadows.enabled;renderer.shadowMap.autoUpdate=shadows.auto;}
  });
  for(let i=0,end=s*s*4;i<end;i+=4){
   const c=Math.max(0,Math.min(1,1-((white[i]-pixels[i])+(white[i+1]-pixels[i+1])+(white[i+2]-pixels[i+2]))/765));if(c<=.02)continue;
   const [r,g,b]=aces(pixels[i]/255/c,pixels[i+1]/255/c,pixels[i+2]/255/c,exposure),hi=Math.max(r,g,b);
   sum.n+=c;if(c>.35)sum.solid++;sum.lum+=c*(r*LUM[0]+g*LUM[1]+b*LUM[2]);sum.sat+=c*(hi>.01?(hi-Math.min(r,g,b))/hi:0);
  }
  return {n:sum.n,solid:sum.solid,lum:sum.n>0?sum.lum/sum.n:0,sat:sum.n>0?sum.sat/sum.n:0};
 };
 const started=performance.now(),result={gain:[1,1,1,1,1],gainBack:[1,1,1,1,1],chroma:[1,1,1,1,1],cover:[1,1,1,1,1],nearCut:1,farBoost:0,geoLum:[],cardLum:[],light:scene?.environment?'scene':'rig'};
 try{
  const geo=[[],[]];
  for(let view=0;view<2;view++)for(let i=0;i<CARD_MIPS.length;i++){
   geo[view][i]=measure(near,CARD_MIPS[i],VIEWS[view]);
   // A stage that reads back black over the whole window is not measuring the
   // plant (a renderer with a pass of its own in the way): leave the card as it is.
   if(view===0&&i===0&&(geo[0][0].lum<.02||geo[0][0].n>.9*size*size)){result.light='invalid';return result;}
   yield;
  }
  // Luminance: the correction acts before tone mapping, so each gain is fitted
  // in steps against the tone-mapped result, the front view first and the
  // back view on top of it (the shader mixes the two by the sun's position).
  const fitGain=function*(view,target,i){
   const want=geo[view][i];if(want.n<16)return null;
   let g=1,card=null;
   for(let step=0;step<3;step++){
    target[i]=g;card=measure([far],CARD_MIPS[i],VIEWS[view]);yield;if(card.n<16)return null;
    if(view===0&&step===0){result.geoLum[i]=Math.round(want.lum*255);result.cardLum[i]=Math.round(card.lum*255);}
    // A pale card is lifted at most a little: past that the brightest bark clips to white.
    g=THREE.MathUtils.clamp(g*want.lum/Math.max(1e-3,card.lum),.35,1.15);
   }
   target[i]=g;return {gain:Number(g.toFixed(3)),card,want};
  };
  for(let i=0;i<CARD_MIPS.length;i++){
   const front=yield* fitGain(0,gain,i);
   if(front){result.gain[i]=front.gain;result.chroma[i]=THREE.MathUtils.clamp(front.want.sat/Math.max(1e-3,front.card.sat),.4,1.2);result.cover[i]=Number((front.want.n/front.card.n).toFixed(3));chroma[i]=result.chroma[i];}
   const back=yield* fitGain(1,gainBack,i);if(back)result.gainBack[i]=back.gain;else gainBack[i]=result.gain[i];
  }
  // Silhouette, as the eye reads it: the pixels a level covers solidly (over a
  // third). Near, the card can be denser than the leaves (its cutout is lower);
  // far, its mips blur what the geometry keeps crisp. The alpha is scaled at
  // mip 0 and boosted with mip until the solid counts meet, from a few candidates.
  const fit=function*(i,set,candidates){
   const want=geo[0][i].solid;if(want<16)return null;
   let best=candidates[0],bestError=Infinity;
   for(const k of candidates){set(k);const got=measure([far],CARD_MIPS[i],VIEWS[0]).solid;yield;const error=Math.abs(want/Math.max(1,got)-1);if(error<bestError){best=k;bestError=error;}}
   set(best);return best;
  };
  result.nearCut=(yield* fit(0,k=>{cut.x=k;},[1,.85,.7,.55,.45]))??1;
  result.farBoost=(yield* fit(4,k=>{cut.y=k;},[0,.3,.6,1,1.5,2.2]))??0;
  result.solid=[geo[0][0].solid,geo[0][4].solid];
  result.chroma=result.chroma.map(n=>Number(n.toFixed(3)));result.ms=Math.round(performance.now()-started);
  return result;
 }finally{
  for(const m of [...near,far])m.dispose();
  for(const l of lights)l.dispose?.();
  rt.dispose();
 }
}
