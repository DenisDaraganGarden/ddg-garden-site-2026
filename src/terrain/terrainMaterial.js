import * as THREE from 'three';
import { coastShader, createCoastUniforms, syncCoastUniforms } from './terrainShader.js';
const fragment = /* glsl */`
${coastShader}
varying vec3 vTerrainWorld;
varying vec3 vTerrainNormal;
uniform sampler2D uSandColor;uniform sampler2D uSandNormal;uniform sampler2D uSandSurface;
uniform sampler2D uShellColor;uniform sampler2D uShellNormal;uniform sampler2D uShellSurface;
uniform sampler2D uRockColor;uniform sampler2D uRockNormal;uniform sampler2D uRockSurface;
uniform sampler2D uPlantCover;uniform vec4 uPlantCoverBounds;uniform float uPlantCoverEnabled;
uniform float uTerrainTime;uniform float uTerrainScale;uniform float uTerrainParallax;uniform float uRockOnly;
vec2 terrainParallaxUv(vec2 uv,vec2 viewAcross,float viewUp,sampler2D heightMap,float relief) {
 if(uTerrainParallax<.01||distance(cameraPosition,vTerrainWorld)>22.0)return uv;
 float fade=1.0-smoothstep(8.0,22.0,distance(cameraPosition,vTerrainWorld));
 vec2 ray=clamp(viewAcross/max(abs(viewUp),.22),vec2(-3.0),vec2(3.0))*relief*uTerrainParallax*fade;
 vec2 stepUv=ray/16.0;float layer=0.0;vec2 at=uv+ray*.5;
 for(int i=0;i<16;i++){if(layer>=1.0-texture2D(heightMap,at).b)break;at-=stepUv;layer+=.0625;}
 float after=1.0-texture2D(heightMap,at).b-layer;
 float before=1.0-texture2D(heightMap,at+stepUv).b-layer+.0625;
 float weight=clamp(after/(after-before-.00001),0.0,1.0);
 return mix(at,at+stepUv,weight);
}
vec3 terrainNormal(vec3 n,vec3 position,vec2 uv,vec3 mapN) {
 vec3 dp1=dFdx(position),dp2=dFdy(position);vec2 duv1=dFdx(uv),duv2=dFdy(uv);
 vec3 dp2perp=cross(dp2,n),dp1perp=cross(n,dp1);
 vec3 T=dp2perp*duv1.x+dp1perp*duv2.x,B=dp2perp*duv1.y+dp1perp*duv2.y;
 float inv=inversesqrt(max(max(dot(T,T),dot(B,B)),1e-12));
 mapN.xy*=uCoastSurface.z;return normalize(mat3(T*inv,B*inv,n)*mapN);
}
// Two low-frequency value-noise samples bend the physical UV domain by less
// than half a tile. It breaks repeated tile boundaries without the 3x texture
// reads of stochastic texture blending, and the same result drives every PBR
// map so colour, normal and height never slide apart.
vec2 terrainDomainWarp(vec2 world) {
 vec2 p=world*.075+vec2(uCoastShape.w*.017,19.37);
 return (vec2(coastNoise(p),coastNoise(p.yx+vec2(43.11,7.29)))-.5)*.46;
}
float terrainLocalSummit(vec2 qs) {
 float cape=exp(-pow((qs.y-uCoastDetail.w)/max(uCoastSurface.x,.001),2.0));
 return max(.25,uCoastDimensions.w*(.82+.18*sin(qs.y*.012+1.1))*(1.0-.42*cape));
}
`;
export function createTerrainMaterial(textures,p,rockOnly=false) {
 const uniforms={...createCoastUniforms(),uPlantCover:{value:null},uPlantCoverBounds:{value:new THREE.Vector4(0,0,1,1)},uPlantCoverEnabled:{value:0},uTerrainTime:{value:0},uTerrainScale:{value:p.terrainTextureScale},uTerrainParallax:{value:p.terrainParallax},uRockOnly:{value:rockOnly?1:0}};
 for(const [type,name] of [['Sand','sand'],['Shell','shells'],['Rock','sandstone']])for(const channel of ['Color','Normal','Surface'])uniforms['u'+type+channel]={value:textures[name+'-'+channel.toLowerCase()]};
 syncCoastUniforms(uniforms,p);
 const material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.85,metalness:0,side:THREE.FrontSide});
 material.name=rockOnly?'azov-sandstone-boulders':'azov-coast-pbr';material.userData.coastUniforms=uniforms;
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader='varying vec3 vTerrainWorld;\nvarying vec3 vTerrainNormal;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
   vec4 terrainWorld=vec4(transformed,1.0);
   #ifdef USE_INSTANCING
   terrainWorld=instanceMatrix*terrainWorld;
   #endif
   vTerrainWorld=(modelMatrix*terrainWorld).xyz;
   vTerrainNormal=inverseTransformDirection(transformedNormal,viewMatrix);
  `);
  shader.fragmentShader=fragment+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
   vec3 terrainN=normalize(vTerrainNormal),viewWorld=cameraPosition-vTerrainWorld;
   vec2 qs=coastLocal(vTerrainWorld.xz);
   float rockWeight=max(uRockOnly,1.0-smoothstep(.65,.94,abs(terrainN.y)));
   float wet=coastWetness(qs,uTerrainTime);
   float foamTrace=coastFoam(qs,vTerrainWorld,uTerrainTime)*smoothstep(.28,.88,terrainN.y)*(1.0-rockWeight*.32);
   float shellMask=uCoastSurf.w*smoothstep(-.4,1.0,qs.x)*(1.0-smoothstep(4.0,max(7.0,uCoastDimensions.z*.8),qs.x));
   shellMask*=mix(.56,1.0,coastNoise(qs*.24+vec2(17.3,uCoastShape.w*.031)));
   vec2 sandBasisUv=vTerrainWorld.xz/1.2*uTerrainScale;
   vec2 sandWarp=terrainDomainWarp(vTerrainWorld.xz);
   vec2 sandNormalUv=sandBasisUv+sandWarp;
   vec2 sandUv=sandNormalUv;
   sandUv=terrainParallaxUv(sandUv,viewWorld.xz,viewWorld.y,uShellSurface,.024/1.2*shellMask+.01);
   vec3 groundColor=mix(texture2D(uSandColor,sandUv).rgb,texture2D(uShellColor,sandUv).rgb,shellMask);
   vec3 groundSurface=mix(texture2D(uSandSurface,sandUv).rgb,texture2D(uShellSurface,sandUv).rgb,shellMask);
   vec3 groundNormal=normalize(mix(texture2D(uSandNormal,sandUv).rgb*2.0-1.0,texture2D(uShellNormal,sandUv).rgb*2.0-1.0,shellMask));
   vec3 triWeight=pow(abs(terrainN),vec3(6.0));triWeight/=max(dot(triWeight,vec3(1.0)),.001);
   vec2 uvX=vTerrainWorld.zy/2.8*uTerrainScale,uvY=vTerrainWorld.xz/2.8*uTerrainScale,uvZ=vTerrainWorld.xy/2.8*uTerrainScale;
   vec2 rockNormalUvX=uvX,rockNormalUvY=uvY,rockNormalUvZ=uvZ;
   vec3 rockColor=vec3(0.0),rockSurface=vec3(0.8,1.0,.5);
   if(rockWeight>.01){
     uvX+=terrainDomainWarp(vTerrainWorld.zy);
     uvY+=sandWarp;
     uvZ+=terrainDomainWarp(vTerrainWorld.xy);
     rockNormalUvX=uvX;rockNormalUvY=uvY;rockNormalUvZ=uvZ;
     uvX=terrainParallaxUv(uvX,viewWorld.zy,viewWorld.x,uRockSurface,.05/2.8);
     uvZ=terrainParallaxUv(uvZ,viewWorld.xy,viewWorld.z,uRockSurface,.05/2.8);
     rockColor=texture2D(uRockColor,uvX).rgb*triWeight.x+texture2D(uRockColor,uvY).rgb*triWeight.y+texture2D(uRockColor,uvZ).rgb*triWeight.z;
     rockSurface=texture2D(uRockSurface,uvX).rgb*triWeight.x+texture2D(uRockSurface,uvY).rgb*triWeight.y+texture2D(uRockSurface,uvZ).rgb*triWeight.z;
   }
   vec3 surfaceData=mix(groundSurface,rockSurface,rockWeight);
   vec3 terrainColor=mix(groundColor,rockColor,rockWeight);
   // The clay/soil cap only settles onto the flatter local summit. Erosion
   // exposes ochre beneath it; weathering fades that exposed sandstone toward
   // sandy limestone while retaining the authored PBR texture detail.
   float localHeight=clamp(coastHeight(qs)/terrainLocalSummit(qs),0.0,1.0);
   float flatTop=smoothstep(.62,.9,terrainN.y);
   float soilCap=(1.0-uRockOnly)*flatTop*smoothstep(.68-mix(.04,.26,uCoastGeology.y),.98,localHeight)*uCoastGeology.y;
   float strata=coastNoise(vec2(qs.y*.055,coastHeight(qs)*1.45+qs.x*.04));
   float exposed=rockWeight*(1.0-soilCap);
   vec3 ochreTint=vec3(1.16,.79,.48);
   vec3 limestoneTint=vec3(1.13,1.02,.73);
   terrainColor=mix(terrainColor,terrainColor*ochreTint,exposed*(.18+.42*strata)*uCoastGeology.x);
   terrainColor=mix(terrainColor,terrainColor*limestoneTint,exposed*(.10+.34*strata)*uCoastGeology.z);
   terrainColor=mix(terrainColor,terrainColor*vec3(.44,.30,.16),soilCap);
   vec2 coverUv=(vTerrainWorld.xz-uPlantCoverBounds.xy)/uPlantCoverBounds.zw;
   if(uPlantCoverEnabled>.5&&uRockOnly<.5&&all(greaterThanEqual(coverUv,vec2(0)))&&all(lessThanEqual(coverUv,vec2(1)))){
     vec2 cover=texture2D(uPlantCover,coverUv).rg*(1.0-wet)*smoothstep(.64,.9,terrainN.y);
     terrainColor=mix(terrainColor,terrainColor*vec3(.68,.57,.34),cover.r*.55);
     terrainColor=mix(terrainColor,terrainColor*vec3(.54,.67,.38),cover.g*.5);
   }
   float macroVariation=.93+.14*(sandWarp.x+sandWarp.y);
   vec3 wetColor=terrainColor*mix(1.0,.53,wet);
   diffuseColor.rgb=mix(wetColor,vec3(.82,.84,.78),foamTrace*.22)*macroVariation;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(surfaceData.r,.27,wet);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   vec3 groundViewN=terrainNormal(normal,-vViewPosition,sandNormalUv,groundNormal);
   vec3 rockViewN=normal;
   if(rockWeight>.01){
     rockViewN=normalize(terrainNormal(normal,-vViewPosition,rockNormalUvX,texture2D(uRockNormal,uvX).rgb*2.0-1.0)*triWeight.x+terrainNormal(normal,-vViewPosition,rockNormalUvY,texture2D(uRockNormal,uvY).rgb*2.0-1.0)*triWeight.y+terrainNormal(normal,-vViewPosition,rockNormalUvZ,texture2D(uRockNormal,uvZ).rgb*2.0-1.0)*triWeight.z);
   }
   normal=normalize(mix(groundViewN,rockViewN,rockWeight));
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>','#include <aomap_fragment>\nreflectedLight.indirectDiffuse*=surfaceData.g;');
 };
 material.customProgramCacheKey=()=> 'azov-coast-pbr-v2';return material;
}
