import * as THREE from 'three';
import {PLANT_FIELD_GLSL,PLANT_BEND_GLSL,ecologyUniforms,updateEcologyUniforms} from './plantEcology.js';

export const PLANT_WIND_GLSL = /* glsl */`
${PLANT_BEND_GLSL}
uniform float uPlantFlutter;
attribute vec3 leafPivot;
attribute vec3 leafAxis;
attribute float leafWeight;
attribute float phase;
attribute float plantExposure;
vec3 plantRotate(vec3 v,vec3 axis,float angle){float s=sin(angle),c=cos(angle);return v*c+cross(axis,v)*s+axis*dot(axis,v)*(1.0-c);}
vec2 plantLocalWind(){
 vec2 w=uPlantWind;
 #ifdef USE_INSTANCING
 mat3 basis=mat3(instanceMatrix);
 w=vec2(dot(normalize(basis[0]),vec3(uPlantWind.x,0,uPlantWind.y)),dot(normalize(basis[2]),vec3(uPlantWind.x,0,uPlantWind.y)));
 #endif
 return w*plantExposure;
}
float plantGust(){
 vec2 origin=vec2(0);
 #ifdef USE_INSTANCING
 origin=instanceMatrix[3].xz;
 #endif
 return plantBend(origin);
}
float leafFlutter(){return sin(uPlantTime*7.7+phase)*uPlantFlutter*min(length(uPlantWind)*plantExposure*.16,1.0)*leafWeight*leafWeight*.25;}
vec3 plantWindPoint(vec3 p){
 p=leafPivot+plantRotate(p-leafPivot,leafAxis,leafFlutter());
 vec2 bend=plantLocalWind()*plantGust();float h=max(p.y,0.0);
 p.xz+=bend*h*h;p.y/=sqrt(1.0+dot(bend,bend)*h*h);return p;
}
vec3 plantWindNormal(vec3 n){
 n=plantRotate(n,leafAxis,leafFlutter());
 vec2 shear=plantLocalWind()*plantGust()*2.0*max(position.y,0.0);
 float compression=pow(1.0+dot(shear,shear)*.25,1.5);
 n.y=(n.y-dot(shear,n.xz))*compression;return normalize(n);
}
`;
function patchWind(shader,uniforms){
 Object.assign(shader.uniforms,uniforms);
 shader.vertexShader=shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float plantHabitat;varying float vPlantHabitat;varying vec3 vPlantRestWorld;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 plantRest=vec4(position,1.0);\n#ifdef USE_INSTANCING\nplantRest=instanceMatrix*plantRest;\n#endif\nvPlantRestWorld=(modelMatrix*plantRest).xyz;vPlantHabitat=plantHabitat;');
 shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+PLANT_WIND_GLSL).replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal=plantWindNormal(objectNormal);').replace('#include <begin_vertex>','vec3 transformed=plantWindPoint(position);');
}
export function plantUniforms(){return {...ecologyUniforms(),uPlantTime:{value:0},uPlantWind:{value:new THREE.Vector2()},uPlantFlutter:{value:.55},uPlantTransmission:{value:.65}};}
export function makePlantMaterials(atlas,uniforms,{bake=false}={}) {
 // The leaf atlas keeps its back face in the lower half; a single-sided
 // species atlas shows the same cutout from both faces.
 const split=!atlas.singleSided,frontUv=split?'vec2(vMapUv.x,vMapUv.y*.5+(gl_FrontFacing?0.0:.5))':'vMapUv',cutout=atlas.alphaTest??.43,scale=atlas.normalScale??.22;
 const bark=new THREE.MeshStandardMaterial({color:'#685b44',roughness:.95,vertexColors:true});
 bark.defines={USE_UV:''};
 const leaves=new THREE.MeshStandardMaterial({map:atlas.color.texture,normalMap:atlas.normal.texture,normalScale:new THREE.Vector2(scale,scale),roughness:.73,metalness:0,side:THREE.DoubleSide,alphaTest:cutout,alphaToCoverage:true,vertexColors:true,
  roughnessMap:atlas.surface?.texture??null,aoMap:atlas.surface?.texture??null,aoMapIntensity:.75});
 const barkDepth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
 const leafDepth=new THREE.MeshDepthMaterial({map:atlas.color.texture,alphaTest:cutout,depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
 for(const m of [bark,leaves,barkDepth,leafDepth]){
  m.onBeforeCompile=shader=>{
   patchWind(shader,uniforms);
   if(m===bark){
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float grain=sin(vUv.x*219.0+sin(vUv.y*3.7)*1.3)*sin(vUv.y*49.0+vUv.x*19.0);
      float fissure=pow(max(sin(vUv.x*91.0+sin(vUv.y*.7)*.6),0.0),12.0);
      diffuseColor.rgb*=.86+grain*.09-fissure*.17;`);
   }
   if(m===leaves||m===leafDepth){
    shader.fragmentShader=shader.fragmentShader.replace('texture2D( map, vMapUv )',`texture2D( map, ${frontUv} )`);
    // Current Three expands map_fragment later; override its chunk explicitly.
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replaceAll('vMapUv',frontUv));
   }
   if(m===leaves){
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vPlantRestWorld;varying float vPlantHabitat;uniform float uPlantTransmission;\n'+PLANT_FIELD_GLSL);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=plantFoliageColor(diffuseColor.rgb,vPlantRestWorld,vPlantHabitat);');
    if(split)shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replaceAll('vNormalMapUv','vec2(vNormalMapUv.x,vNormalMapUv.y*.5+(gl_FrontFacing?0.0:.5))'));
    // Backlight through a thin leaf; a surface map says per pixel how thin
    // (awn plumes and panicle hairs glow, stem bases do not).
    if(!bake)shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
      float plantThin=1.0;
      #ifdef USE_ROUGHNESSMAP
      plantThin=texture2D(roughnessMap,vRoughnessMapUv).b*1.7;
      #endif
      #if NUM_DIR_LIGHTS > 0
      for(int i=0;i<NUM_DIR_LIGHTS;i++){
        float through=max(dot(-normal,directionalLights[i].direction),0.0);
        reflectedLight.directDiffuse+=diffuseColor.rgb*directionalLights[i].color*through*uPlantTransmission*plantThin*.12;
      }
      #endif`);
   }
  };
  m.customProgramCacheKey=()=>`oleaster-${m.type}-${m===leaves?'leaf':m===leafDepth?'cutout':'bark'}-${split?'split':'single'}-${atlas.surface?'surface':'plain'}-6`;
 }
 return {bark,leaves,barkDepth,leafDepth,dispose(){for(const m of [bark,leaves,barkDepth,leafDepth])m.dispose();}};
}
export function updatePlantUniforms(uniforms,settings,time){
 updateEcologyUniforms(uniforms,settings);
 const angle=settings.windBearing*Math.PI/180;
 uniforms.uPlantTime.value=time;uniforms.uPlantWind.value.set(Math.sin(angle)*settings.wind,-Math.cos(angle)*settings.wind);
 uniforms.uPlantFlutter.value=settings.flutter;uniforms.uPlantTransmission.value=settings.translucency;
}
