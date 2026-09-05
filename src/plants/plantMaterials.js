import * as THREE from 'three';

export const PLANT_WIND_GLSL = /* glsl */`
uniform float uPlantTime;
uniform vec2 uPlantWind;
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
 return .55+.24*sin(uPlantTime*1.05+origin.x*.37-origin.y*.24)+.16*sin(uPlantTime*2.3+origin.x*.2+origin.y*.31);
}
float leafFlutter(){return sin(uPlantTime*7.7+phase)*uPlantFlutter*min(length(uPlantWind)*plantExposure*.16,1.0)*leafWeight*leafWeight*.25;}
vec3 plantWindPoint(vec3 p){
 p=leafPivot+plantRotate(p-leafPivot,leafAxis,leafFlutter());
 p.xz+=plantLocalWind()*plantGust()*.009*max(p.y,0.0)*max(p.y,0.0);return p;
}
vec3 plantWindNormal(vec3 n){
 n=plantRotate(n,leafAxis,leafFlutter());
 vec2 shear=plantLocalWind()*plantGust()*.018*max(position.y,0.0);
 n.y-=dot(shear,n.xz);return normalize(n);
}
`;
function patchWind(shader,uniforms){
 Object.assign(shader.uniforms,uniforms);
 shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+PLANT_WIND_GLSL).replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal=plantWindNormal(objectNormal);').replace('#include <begin_vertex>','vec3 transformed=plantWindPoint(position);');
}
const frontUv='vec2(vMapUv.x,vMapUv.y*.5+(gl_FrontFacing?0.0:.5))';
export function plantUniforms(){return {uPlantTime:{value:0},uPlantWind:{value:new THREE.Vector2()},uPlantFlutter:{value:.55},uPlantDryness:{value:.22},uPlantTransmission:{value:.65}};}
export function makePlantMaterials(atlas,uniforms,{bake=false}={}) {
 const bark=new THREE.MeshStandardMaterial({color:'#685b44',roughness:.95,vertexColors:true});
 bark.defines={USE_UV:''};
 const leaves=new THREE.MeshStandardMaterial({map:atlas.color.texture,normalMap:atlas.normal.texture,normalScale:new THREE.Vector2(.22,.22),roughness:.73,metalness:0,side:THREE.DoubleSide,alphaTest:.43,alphaToCoverage:true,vertexColors:true});
 const barkDepth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
 const leafDepth=new THREE.MeshDepthMaterial({map:atlas.color.texture,alphaTest:.43,depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
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
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uPlantDryness;\nuniform float uPlantTransmission;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.15,.88,.48),uPlantDryness*.7);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replaceAll('vNormalMapUv','vec2(vNormalMapUv.x,vNormalMapUv.y*.5+(gl_FrontFacing?0.0:.5))'));
    if(!bake)shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
      for(int i=0;i<NUM_DIR_LIGHTS;i++){
        float through=max(dot(-normal,directionalLights[i].direction),0.0);
        reflectedLight.directDiffuse+=diffuseColor.rgb*directionalLights[i].color*through*uPlantTransmission*.12;
      }
      #endif`);
   }
  };
  m.customProgramCacheKey=()=>`oleaster-${m.type}-${m===leaves?'leaf':m===leafDepth?'cutout':'bark'}-4`;
 }
 return {bark,leaves,barkDepth,leafDepth,dispose(){for(const m of [bark,leaves,barkDepth,leafDepth])m.dispose();}};
}
export function updatePlantUniforms(uniforms,settings,time){
 const angle=settings.windBearing*Math.PI/180;
 uniforms.uPlantTime.value=time;uniforms.uPlantWind.value.set(Math.sin(angle)*settings.wind,-Math.cos(angle)*settings.wind);
 uniforms.uPlantFlutter.value=settings.flutter;uniforms.uPlantDryness.value=settings.dryness;uniforms.uPlantTransmission.value=settings.translucency;
}
