import * as THREE from 'three';

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
export function bakePlantImpostor(renderer,model,geometries,atlas){
 const color=target(1024,512),normal=target(1024,512),scene=new THREE.Scene();
 const bark=new THREE.MeshBasicMaterial({color:'#7e735d',vertexColors:true});
 const leaf=new THREE.MeshBasicMaterial({map:atlas.color.texture,side:THREE.DoubleSide,alphaTest:.43,vertexColors:true});
 leaf.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replaceAll('vMapUv','vec2(vMapUv.x,vMapUv.y*.5+(gl_FrontFacing?0.0:.5))'));};
 const tree=new THREE.Mesh(geometries.bark,bark),canopy=new THREE.Mesh(geometries.leaf,leaf);scene.add(tree,canopy);
 const box=geometries.bark.userData.baseBounds.clone().union(geometries.leaf.userData.baseBounds),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
 const width=Math.max(size.x,size.z)*1.15,height=size.y*1.08;
 const camera=new THREE.OrthographicCamera(-width/2,width/2,height/2,-height/2,.01,20);
 const normalBark=new THREE.MeshNormalMaterial(),normalLeaf=new THREE.MeshNormalMaterial({side:THREE.DoubleSide});
 // MeshNormalMaterial has no map/alphaTest path; preserve the exact leaf cutout.
 normalLeaf.onBeforeCompile=shader=>{shader.uniforms.uLeafAtlas={value:atlas.color.texture};shader.vertexShader=shader.vertexShader.replace('void main() {','varying vec2 vLeafUv;\nvoid main() {\nvLeafUv=uv;');shader.fragmentShader=shader.fragmentShader.replace('void main() {','varying vec2 vLeafUv;uniform sampler2D uLeafAtlas;\nvoid main() {\nif(texture2D(uLeafAtlas,vec2(vLeafUv.x,vLeafUv.y*.5)).a<.43)discard;');};
 preserveRenderer(renderer,()=>{
  for(const [rt,normalPass]of [[color,false],[normal,true]]){
   tree.material=normalPass?normalBark:bark;canopy.material=normalPass?normalLeaf:leaf;
   rt.viewport.set(0,0,1024,512);renderer.setRenderTarget(rt);renderer.clear();renderer.autoClear=false;
   for(let i=0;i<8;i++){
    const angle=i*Math.PI/4;camera.position.set(center.x+Math.sin(angle)*6,center.y,center.z+Math.cos(angle)*6);camera.lookAt(center);camera.updateMatrixWorld();
    rt.viewport.set((i%4)*256,Math.floor(i/4)*256,256,256);renderer.setRenderTarget(rt);renderer.render(scene,camera);
   }
  }
 });
 for(const m of [bark,leaf,normalBark,normalLeaf])m.dispose();
 return {color,normal,width,height,center,dispose(){color.dispose();normal.dispose();}};
}
export function makeImpostorMaterial(atlas){
 const uniforms={uImpostorTime:{value:0},uImpostorWind:{value:new THREE.Vector2()},uImpostorDryness:{value:.22}};
 const material=new THREE.MeshStandardMaterial({map:atlas.color.texture,normalMap:atlas.normal.texture,normalScale:new THREE.Vector2(.75,.75),roughness:.85,alphaTest:.22,alphaToCoverage:true,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
    varying float vPlantFrame;attribute float plantExposure;uniform float uImpostorTime;uniform vec2 uImpostorWind;
    mat3 plantBillboardRotation(){
      vec4 root=modelMatrix*instanceMatrix*vec4(0,0,0,1);
      vec3 viewTo=cameraPosition-root.xyz;
      if(length(viewTo.xz)<.0001)viewTo.z=1.0;
      vec3 right=normalize(vec3(viewTo.z,0,-viewTo.x));
      vec3 forward=normalize(vec3(viewTo.x,0,viewTo.z));
      mat3 localBasis=mat3(normalize(instanceMatrix[0].xyz),normalize(instanceMatrix[1].xyz),normalize(instanceMatrix[2].xyz));
      return transpose(localBasis)*mat3(right,vec3(0,1,0),forward);
    }`);
  shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
    objectNormal=plantBillboardRotation()*objectNormal;`);
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`vec3 transformed=position;
    vec4 root=modelMatrix*instanceMatrix*vec4(0,0,0,1);
    vec3 viewTo=cameraPosition-root.xyz;
      if(length(viewTo.xz)<.0001)viewTo.z=1.0;
    float yaw=atan(instanceMatrix[2].x,instanceMatrix[2].z);
    float angle=atan(viewTo.x,viewTo.z)-yaw;
    vPlantFrame=mod(floor(angle/0.78539816+.5)+8.0,8.0);
    float wave=.55+.24*sin(uImpostorTime*1.05+root.x*.37-root.z*.24)+.16*sin(uImpostorTime*2.3+root.x*.2+root.z*.31);
    vec3 right=normalize(vec3(viewTo.z,0,-viewTo.x));
    transformed.x+=dot(uImpostorWind,right.xz)*plantExposure*.009*transformed.y*transformed.y*wave;
    transformed=plantBillboardRotation()*transformed;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   varying float vPlantFrame;uniform float uImpostorDryness;
   vec2 plantAtlasUv(vec2 uv){return (uv*.98+.01+vec2(mod(vPlantFrame,4.0),floor(vPlantFrame/4.0)))/vec2(4,2);}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.15,.88,.48),uImpostorDryness*.7);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replaceAll('vMapUv','plantAtlasUv(vMapUv)').replace('diffuseColor *= sampledDiffuseColor;', 'sampledDiffuseColor.rgb /= max(sampledDiffuseColor.a, .001); diffuseColor *= sampledDiffuseColor;')).replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replaceAll('texture2D( normalMap, vNormalMapUv ).xyz', '(texture2D(normalMap,plantAtlasUv(vNormalMapUv)).xyz / max(texture2D(normalMap,plantAtlasUv(vNormalMapUv)).a,.001))'));
 };
 material.customProgramCacheKey=()=> 'oleaster-eight-view-impostor-v2';material.userData.uniforms=uniforms;return material;
}
