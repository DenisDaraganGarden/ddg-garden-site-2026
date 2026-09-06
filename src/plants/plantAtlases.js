import * as THREE from 'three';
import {PLANT_FIELD_GLSL,PLANT_BEND_GLSL,ecologyUniforms} from './plantEcology.js';

function target(w,h){const rt=new THREE.WebGLRenderTarget(w,h,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType,depthBuffer:true,minFilter:THREE.LinearMipmapLinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:true});rt.texture.colorSpace=THREE.NoColorSpace;return rt;}
function preserveRenderer(renderer,fn){
 const old={target:renderer.getRenderTarget(),tone:renderer.toneMapping,clear:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha(),auto:renderer.autoClear,xr:renderer.xr.enabled,viewport:renderer.getViewport(new THREE.Vector4())};
 renderer.xr.enabled=false;renderer.toneMapping=THREE.NoToneMapping;renderer.setClearColor(0,0);renderer.autoClear=true;
 try{return fn();}finally{renderer.setRenderTarget(old.target);renderer.toneMapping=old.tone;renderer.setClearColor(old.clear,old.alpha);renderer.autoClear=old.auto;renderer.xr.enabled=old.xr;renderer.setViewport(old.viewport);}
}
// Render metric leaf silhouettes into real RGBA. The AI source supplies colour
// microdetail only; its printed background is never used as an opacity mask.
export function bakeLeafAtlas(renderer,source){
 const color=target(1024,1024),normal=target(1024,1024),scene=new THREE.Scene(),camera=new THREE.Camera();
 const geometry=new THREE.PlaneGeometry(2,2);
 const material=new THREE.ShaderMaterial({uniforms:{uSource:{value:source},uNormals:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0,1);}',fragmentShader:/* glsl */`
 varying vec2 vUv;uniform sampler2D uSource;uniform float uNormals;
 void main(){
  float cell=floor(vUv.x*4.0),row=floor(vUv.y*2.0),t=fract(vUv.y*2.0),x=fract(vUv.x*4.0)*2.0-1.0;
  float shape=pow(max(sin(clamp((t-.055)/.94,0.0,1.0)*3.14159265),0.0),.79)*.89;
  shape=max(shape,(1.0-smoothstep(.065,.13,t))*.042);
  float alpha=(1.0-smoothstep(shape-.013,shape+.013,abs(x)))*smoothstep(0.0,.014,t)*(1.0-smoothstep(.985,1.0,t));

  float centres[4];centres[0]=.169;centres[1]=.392;centres[2]=.613;centres[3]=.831;
  float y=row<.5 ? mix(.511,.957,t) : mix(.042,.480,t);
  float sourceWidth=pow(max(sin(clamp((t-.07)/.94,0.0,1.0)*3.14159265),0.0),.84)*.044;
  vec3 albedo=texture2D(uSource,vec2(centres[int(cell)]+clamp(x,-shape+.01,shape-.01)*sourceWidth*.93,y)).rgb;
  // Normalize the photographic source to leaf reflectance; the silver reverse
  // stays lighter without behaving like white paper under the shared lighting.
  albedo*=row<.5?vec3(.66,.87,.63):vec3(.55,.62,.65);
  albedo=mix(vec3(.12,.15,.07),albedo,smoothstep(.06,.10,t));
  // A leaf's minute ridge and rolled edges are a tangent-space normal field.
  float vein=exp(-abs(x)*35.0)*sign(x)*.12;
  vec3 n=normalize(vec3(x*.34+vein,.06*cos(t*3.14159),1.0));
  gl_FragColor=vec4(mix(albedo,n*.5+.5,uNormals),alpha);
 }`,depthWrite:false,depthTest:false});
 const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);
 preserveRenderer(renderer,()=>{renderer.setRenderTarget(color);renderer.render(scene,camera);material.uniforms.uNormals.value=1;renderer.setRenderTarget(normal);renderer.render(scene,camera);});
 material.dispose();geometry.dispose();return {color,normal,dispose(){color.dispose();normal.dispose();}};
}
export function bakePlantImpostor(renderer,model,geometries,atlas,frameSize=256){
 const atlasWidth=frameSize*4,atlasHeight=frameSize*6;
 const color=target(atlasWidth,atlasHeight),normal=target(atlasWidth,atlasHeight),position=target(atlasWidth,atlasHeight),scene=new THREE.Scene();
 // The same cutout rules as the near material: a split leaf atlas or a
 // single-sided species atlas, with that atlas' alpha threshold.
 const split=!atlas.singleSided,cutout=(atlas.alphaTest??.43).toFixed(2),leafUv=split?'vec2(vLeafUv.x,vLeafUv.y*.5)':'vLeafUv';
 const bark=new THREE.MeshBasicMaterial({color:'#7e735d',vertexColors:true});
 const leaf=new THREE.MeshBasicMaterial({map:atlas.color.texture,side:THREE.DoubleSide,alphaTest:Number(cutout),vertexColors:true});
 if(split)leaf.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replaceAll('vMapUv','vec2(vMapUv.x,vMapUv.y*.5+(gl_FrontFacing?0.0:.5))'));};
 const tree=new THREE.Mesh(geometries.bark,bark),canopy=new THREE.Mesh(geometries.leaf,leaf);scene.add(tree,canopy);
 const box=geometries.bark.userData.baseBounds.clone().union(geometries.leaf.userData.baseBounds),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
 const width=Math.max(size.x,size.z)*1.15,height=Math.max(size.x,size.y,size.z)*1.15;
 const positionMaterial=leafPass=>new THREE.ShaderMaterial({
  uniforms:{uMin:{value:box.min},uSize:{value:size},uAtlas:{value:atlas.color.texture},uLeaf:{value:leafPass?1:0}},side:leafPass?THREE.DoubleSide:THREE.FrontSide,
  vertexShader:'varying vec3 vRest;varying vec2 vLeafUv;void main(){vRest=position;vLeafUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1);}',
  fragmentShader:`uniform vec3 uMin;uniform vec3 uSize;uniform sampler2D uAtlas;uniform float uLeaf;varying vec3 vRest;varying vec2 vLeafUv;void main(){if(uLeaf>.5&&texture2D(uAtlas,${leafUv}).a<${cutout})discard;gl_FragColor=vec4((vRest-uMin)/uSize,uLeaf);}`
 });
 const positionBark=positionMaterial(false),positionLeaf=positionMaterial(true);
 const camera=new THREE.OrthographicCamera(-width/2,width/2,height/2,-height/2,.01,20);
 const normalBark=new THREE.MeshNormalMaterial(),normalLeaf=new THREE.MeshNormalMaterial({side:THREE.DoubleSide});
 // MeshNormalMaterial has no map/alphaTest path; preserve the exact leaf cutout.
 normalLeaf.onBeforeCompile=shader=>{shader.uniforms.uLeafAtlas={value:atlas.color.texture};shader.vertexShader=shader.vertexShader.replace('void main() {','varying vec2 vLeafUv;\nvoid main() {\nvLeafUv=uv;');shader.fragmentShader=shader.fragmentShader.replace('void main() {',`varying vec2 vLeafUv;uniform sampler2D uLeafAtlas;\nvoid main() {\nif(texture2D(uLeafAtlas,${leafUv}).a<${cutout})discard;`);};
 normalLeaf.customProgramCacheKey=()=>`plant-impostor-normal-${leafUv}-${cutout}`;
 preserveRenderer(renderer,()=>{
  for(const [rt,barkPass,leafPass]of [[color,bark,leaf],[normal,normalBark,normalLeaf],[position,positionBark,positionLeaf]]){
   tree.material=barkPass;canopy.material=leafPass;
   rt.viewport.set(0,0,atlasWidth,atlasHeight);renderer.setRenderTarget(rt);renderer.clear();renderer.autoClear=false;
   for(let i=0;i<24;i++){
    const angle=(i%8)*Math.PI/4,elevation=Math.floor(i/8)*Math.PI/4;
    camera.position.set(center.x+Math.sin(angle)*Math.cos(elevation)*6,center.y+Math.sin(elevation)*6,center.z+Math.cos(angle)*Math.cos(elevation)*6);
    camera.up.set(-Math.sin(angle)*Math.sin(elevation),Math.cos(elevation),-Math.cos(angle)*Math.sin(elevation));camera.lookAt(center);camera.updateMatrixWorld();
    rt.viewport.set((i%4)*frameSize,Math.floor(i/4)*frameSize,frameSize,frameSize);renderer.setRenderTarget(rt);renderer.render(scene,camera);
   }
  }
 });
 for(const m of [bark,leaf,normalBark,normalLeaf,positionBark,positionLeaf])m.dispose();
 return {color,normal,position,width,height,center,min:box.min,size,frameSize,views:24,dispose(){color.dispose();normal.dispose();position.dispose();}};
}
export function makeImpostorMaterial(atlas,sharedUniforms){
 const uniforms={...(sharedUniforms??{...ecologyUniforms(),uPlantTime:{value:0},uPlantWind:{value:new THREE.Vector2()}}),uPlantImpostorCenter:{value:atlas.center},uPlantPositionAtlas:{value:atlas.position.texture},uPlantAtlasMin:{value:atlas.min},uPlantAtlasSize:{value:atlas.size}};
 const material=new THREE.MeshStandardMaterial({map:atlas.color.texture,normalMap:atlas.normal.texture,normalScale:new THREE.Vector2(1,1),roughness:.85,alphaTest:.22,alphaToCoverage:true,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
    ${PLANT_BEND_GLSL}
    uniform vec3 uPlantImpostorCenter;varying float vPlantFrame;attribute float plantExposure;attribute float plantHabitat;varying float vPlantHabitat;varying vec3 vPlantRoot;varying vec3 vPlantBasis;
    mat3 plantBillboardRotation(){
      vec4 middle=modelMatrix*instanceMatrix*vec4(uPlantImpostorCenter,1);
      vec3 viewTo=cameraPosition-middle.xyz;
      if(length(viewTo.xz)<.0001)viewTo.z=1.0;
      vec3 right=normalize(vec3(viewTo.z,0,-viewTo.x));
      vec3 forward=normalize(viewTo),up=normalize(cross(forward,right));
      mat3 localBasis=mat3(normalize(instanceMatrix[0].xyz),normalize(instanceMatrix[1].xyz),normalize(instanceMatrix[2].xyz));
      return transpose(localBasis)*mat3(right,up,forward);
    }`);
  shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
    objectNormal=plantBillboardRotation()*objectNormal;`);
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`vec3 transformed=plantBillboardRotation()*(position-uPlantImpostorCenter)+uPlantImpostorCenter;
    vec4 root=modelMatrix*instanceMatrix*vec4(0,0,0,1);
    vec3 viewTo=cameraPosition-(modelMatrix*instanceMatrix*vec4(uPlantImpostorCenter,1)).xyz;
      if(length(viewTo.xz)<.0001)viewTo.z=1.0;
    float yaw=atan(instanceMatrix[2].x,instanceMatrix[2].z);
    vPlantRoot=root.xyz;vPlantBasis=vec3(sin(yaw),cos(yaw),length(instanceMatrix[0].xyz));vPlantHabitat=plantHabitat;
    float angle=atan(viewTo.x,viewTo.z)-yaw;
    float elevation=asin(clamp(viewTo.y/length(viewTo),-1.0,1.0));
    vPlantFrame=mod(floor(angle/0.78539816+.5)+8.0,8.0)+clamp(floor(elevation/0.78539816+.5),0.0,2.0)*8.0;
    float wave=plantBend(root.xz);
    vec2 windLocal=vec2(uPlantWind.x*cos(yaw)-uPlantWind.y*sin(yaw),uPlantWind.x*sin(yaw)+uPlantWind.y*cos(yaw))*plantExposure;
    float h=max(transformed.y,0.0);transformed.xz+=windLocal*wave*h*h;
    transformed.y/=sqrt(1.0+dot(windLocal,windLocal)*wave*wave*h*h);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   ${PLANT_FIELD_GLSL}
   varying float vPlantFrame;varying float vPlantHabitat;varying vec3 vPlantRoot;varying vec3 vPlantBasis;
   uniform sampler2D uPlantPositionAtlas;uniform vec3 uPlantAtlasMin;uniform vec3 uPlantAtlasSize;
   vec2 plantAtlasUv(vec2 uv){return (uv*.98+.01+vec2(mod(vPlantFrame,4.0),floor(vPlantFrame/4.0)))/vec2(4,6);}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec4 restSample=texture2D(uPlantPositionAtlas,plantAtlasUv(vMapUv));
   float coverage=max(texture2D(map,plantAtlasUv(vMapUv)).a,.001);
   vec3 rest=uPlantAtlasMin+restSample.rgb/coverage*uPlantAtlasSize;
   vec3 worldRest=vPlantRoot+vec3(rest.x*vPlantBasis.y+rest.z*vPlantBasis.x,rest.y,-rest.x*vPlantBasis.x+rest.z*vPlantBasis.y)*vPlantBasis.z;
   diffuseColor.rgb=mix(diffuseColor.rgb,plantFoliageColor(diffuseColor.rgb,worldRest,vPlantHabitat),clamp(restSample.a/coverage,0.0,1.0));`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replaceAll('vMapUv','plantAtlasUv(vMapUv)').replace('diffuseColor *= sampledDiffuseColor;', 'sampledDiffuseColor.rgb /= max(sampledDiffuseColor.a, .001); diffuseColor *= sampledDiffuseColor;')).replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replaceAll('texture2D( normalMap, vNormalMapUv ).xyz', '(texture2D(normalMap,plantAtlasUv(vNormalMapUv)).xyz / max(texture2D(normalMap,plantAtlasUv(vNormalMapUv)).a,.001))'));
 };
 const depth=new THREE.MeshDepthMaterial({map:atlas.color.texture,alphaTest:.22,depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
 depth.onBeforeCompile=material.onBeforeCompile;depth.customProgramCacheKey=()=> 'oleaster-24-view-depth-v4';
 material.addEventListener('dispose',()=>depth.dispose());material.userData.depth=depth;
 material.customProgramCacheKey=()=> 'oleaster-24-view-impostor-v4';material.userData.uniforms=uniforms;return material;
}
