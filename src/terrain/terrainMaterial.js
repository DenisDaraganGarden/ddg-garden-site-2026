import * as THREE from 'three';
import { coastShader, createCoastUniforms, syncCoastUniforms } from './terrainShader.js';
import { PLANT_FIELD_GLSL,ecologyUniforms } from '../plants/plantEcology.js';
const fragment=/* glsl */`
${coastShader}
${PLANT_FIELD_GLSL}
varying vec3 vTerrainWorld;
varying vec3 vTerrainNormal;
uniform highp sampler2DArray uTerrainColor;
uniform highp sampler2DArray uTerrainNormal;
uniform highp sampler2DArray uTerrainSurface;
uniform sampler2D uPlantCover;uniform vec4 uPlantCoverBounds;uniform float uPlantCoverEnabled;
uniform float uRockLayer;uniform float uTerrainTime;uniform float uTerrainScale;uniform float uTerrainParallax;uniform float uRockOnly;uniform float uTerrainGroundCover;
uniform sampler2D uPondNormalMap;uniform vec2 uPondTexel;uniform float uPondExtent;uniform vec4 uCausticsParams;uniform vec3 uCausticsLight;uniform float uCausticsKey;
struct TerrainSample{vec3 color;vec3 surface;vec3 normal;};
vec3 pondNormalAt(vec2 uv){return normalize(texture2D(uPondNormalMap,uv).rgb*2.0-1.0);}
// The pond's caustics, cast onto the shelf that took over as its bed. The
// same differential-area focus the old bed used: a refracted patch is bright
// only where rays truly converge. uCausticsParams: intensity, scale,
// sharpness, turbidity.
float shelfCaustics(vec2 world,float depth){
 if(uCausticsParams.x<=0.0||depth<=0.0)return 0.0;
 vec2 uv=vec2(world.x/uPondExtent+.5,.5-world.y/uPondExtent);
 // The simulation ends at the pond square; the light must not. Four metres of fade.
 float inside=smoothstep(0.0,.12,min(min(uv.x,uv.y),min(1.0-uv.x,1.0-uv.y)));
 if(inside<=0.0)return 0.0;
 vec2 texel=uPondTexel;vec3 light=normalize(uCausticsLight);float scale=.06*uCausticsParams.y;
 vec3 n=pondNormalAt(uv);
 vec3 rL=refract(-light,pondNormalAt(uv-vec2(texel.x,0.0)),.75),rR=refract(-light,pondNormalAt(uv+vec2(texel.x,0.0)),.75);
 vec3 rD=refract(-light,pondNormalAt(uv-vec2(0.0,texel.y)),.75),rU=refract(-light,pondNormalAt(uv+vec2(0.0,texel.y)),.75);
 vec2 pL=(uv-vec2(texel.x,0.0))+rL.xz*(depth/max(-rL.y,.2))*scale,pR=(uv+vec2(texel.x,0.0))+rR.xz*(depth/max(-rR.y,.2))*scale;
 vec2 pD=(uv-vec2(0.0,texel.y))+rD.xz*(depth/max(-rD.y,.2))*scale,pU=(uv+vec2(0.0,texel.y))+rU.xz*(depth/max(-rU.y,.2))*scale;
 vec2 dX=(pR-pL)*.5,dY=(pU-pD)*.5;
 float area=abs(dX.x*dY.y-dX.y*dY.x),flatArea=max(texel.x*texel.y,1e-8);
 float sharp=clamp(uCausticsParams.z,0.0,1.0),compression=clamp(flatArea/max(area,flatArea*.12),0.0,7.0);
 float threshold=mix(1.02,1.34,sharp),veins=smoothstep(threshold,threshold+mix(.5,.16,sharp),compression);
 float slope=clamp(1.0-n.y,0.0,1.0);
 float c=(veins*.72+max(compression-1.0,0.0)*.16)*(.5+clamp(slope*6.5,0.0,1.6)*.72)*uCausticsParams.x;
 float turbidity=clamp(uCausticsParams.w,0.0,1.0),density=turbidity*(.45+.55*turbidity);
 vec3 r=refract(-light,n,.75);
 c*=clamp(-r.y*1.2,0.0,1.0)*exp(-depth*(.015+density*.55))*clamp(uCausticsKey,0.0,4.0);
 // The old bed was dark and took this as added light; pale sand takes it as a
 // multiplier, so the veins are capped before they can whiten the shelf.
 return min(c,1.2)*inside;
}
vec2 terrainDomainWarp(vec2 world){
 vec2 p=world*.075+vec2(uCoastShape.w*.017,19.37);
 return (vec2(coastNoise(p),coastNoise(p.yx+vec2(43.11,7.29)))-.5)*.46;
}
// Two translated samples, smoothly selected in metre space. Explicit gradients
// keep mip selection stable across the stochastic offsets and grazing parallax.
TerrainSample terrainSample(float layer,vec2 uv,vec2 dx,vec2 dy){
 float k=coastNoise(uv*.16+vec2(31.7,uCoastShape.w*.031))*8.0,id=floor(k),t=smoothstep(.2,.8,fract(k));
 vec2 a=uv+sin(vec2(3.0,7.0)*(id+1.0))*3.1,b=uv+sin(vec2(3.0,7.0)*(id+2.0))*3.1;
 TerrainSample m;
 m.color=mix(textureGrad(uTerrainColor,vec3(a,layer),dx,dy).rgb,textureGrad(uTerrainColor,vec3(b,layer),dx,dy).rgb,t);
 m.surface=mix(textureGrad(uTerrainSurface,vec3(a,layer),dx,dy).rgb,textureGrad(uTerrainSurface,vec3(b,layer),dx,dy).rgb,t);
 m.normal=normalize(mix(textureGrad(uTerrainNormal,vec3(a,layer),dx,dy).rgb,textureGrad(uTerrainNormal,vec3(b,layer),dx,dy).rgb,t)*2.0-1.0);
 return m;
}
float terrainHeightMap(float layer,vec2 uv){
 float k=coastNoise(uv*.16+vec2(31.7,uCoastShape.w*.031))*8.0,id=floor(k),t=smoothstep(.2,.8,fract(k));
 vec2 a=uv+sin(vec2(3.0,7.0)*(id+1.0))*3.1,b=uv+sin(vec2(3.0,7.0)*(id+2.0))*3.1;
 return mix(textureLod(uTerrainSurface,vec3(a,layer),0.0).b,textureLod(uTerrainSurface,vec3(b,layer),0.0).b,t);
}
TerrainSample terrainBlend(TerrainSample a,TerrainSample b,float weight){
 float w=clamp(weight+weight*(1.0-weight)*(b.surface.b-a.surface.b)*1.4,0.0,1.0);
 TerrainSample m;m.color=mix(a.color,b.color,w);m.surface=mix(a.surface,b.surface,w);m.normal=normalize(mix(a.normal,b.normal,w));return m;
}
vec2 terrainParallaxUv(vec2 uv,vec2 viewAcross,float viewUp,float layer,float relief){
 float dist=distance(cameraPosition,vTerrainWorld);
 if(uTerrainParallax<.01||dist>18.0)return uv;
 float fade=1.0-smoothstep(6.0,18.0,dist);
 vec2 ray=clamp(viewAcross/max(abs(viewUp),.25),vec2(-2.5),vec2(2.5))*relief*uTerrainParallax*fade;
 vec2 stepUv=ray/12.0;float depth=0.0;vec2 at=uv+ray*.5;
 for(int i=0;i<12;i++){if(depth>=1.0-terrainHeightMap(layer,at))break;at-=stepUv;depth+=1.0/12.0;}
 float after=1.0-terrainHeightMap(layer,at)-depth;
 float before=1.0-terrainHeightMap(layer,at+stepUv)-depth+1.0/12.0;
 return mix(at,at+stepUv,clamp(after/(after-before-.00001),0.0,1.0));
}
vec3 terrainNormal(vec3 n,vec3 pos,vec2 uv,vec3 mapN){
 vec3 dp1=dFdx(pos),dp2=dFdy(pos);vec2 duv1=dFdx(uv),duv2=dFdy(uv);
 vec3 dp2perp=cross(dp2,n),dp1perp=cross(n,dp1);
 vec3 T=dp2perp*duv1.x+dp1perp*duv2.x,B=dp2perp*duv1.y+dp1perp*duv2.y;
 float inv=inversesqrt(max(max(dot(T,T),dot(B,B)),1e-12));
 mapN.xy*=mix(.45,1.0,clamp(uCoastSurface.z,0.0,1.0));
 return normalize(mat3(T*inv,B*inv,n)*mapN);
}
`;
export function createTerrainMaterial(textures,p,rockOnly=false){
 const uniforms={...createCoastUniforms(),...ecologyUniforms(),
  uTerrainColor:{value:textures.color},uTerrainNormal:{value:textures.normal},uTerrainSurface:{value:textures.surface},
  uPlantCover:{value:null},uPlantCoverBounds:{value:new THREE.Vector4(0,0,1,1)},uPlantCoverEnabled:{value:0},
  uTerrainTime:{value:0},uTerrainScale:{value:p.terrainTextureScale},uTerrainParallax:{value:p.terrainParallax},uTerrainGroundCover:{value:p.terrainGroundCover},uRockLayer:{value:rockOnly?2:3},uRockOnly:{value:rockOnly?1:0},
  uPondNormalMap:{value:null},uPondTexel:{value:new THREE.Vector2(1/256,1/256)},uPondExtent:{value:34},uCausticsParams:{value:new THREE.Vector4(0,1,1,0)},uCausticsLight:{value:new THREE.Vector3(0,1,0)},uCausticsKey:{value:1}};
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
   vec2 qs=coastLocal(vTerrainWorld.xz);float groundY=coastHeight(qs);
   vec3 forms=coastLandforms(qs.y);vec4 profile=coastProfile(qs.y,forms);
   float rockWeight=max(uRockOnly,1.0-smoothstep(.70,.965,abs(terrainN.y)));
   float wet=coastWetnessAtHeight(qs,uTerrainTime,groundY);
   float caustic=groundY<-.02?shelfCaustics(vTerrainWorld.xz,-groundY-.02):0.0;
   float foamTrace=coastFoamAtHeight(qs,vTerrainWorld,uTerrainTime,groundY)*smoothstep(.28,.88,terrainN.y)*(1.0-rockWeight*.32);
   float path=coastPathMask(qs)*(1.0-uRockOnly);
   float shellMask=uCoastSurf.w*smoothstep(-.4,1.0,qs.x)*(1.0-smoothstep(4.0,max(7.0,uCoastDimensions.z*.8),qs.x));
   shellMask*=mix(.56,1.0,coastNoise(qs*.24+vec2(17.3,uCoastShape.w*.031)));
   vec2 coverUv=(vTerrainWorld.xz-uPlantCoverBounds.xy)/uPlantCoverBounds.zw,cover=vec2(0.0);
   if(uPlantCoverEnabled>.5&&all(greaterThanEqual(coverUv,vec2(0)))&&all(lessThanEqual(coverUv,vec2(1))))cover=texture2D(uPlantCover,coverUv).rg;
   float soilCap=smoothstep(profile.x+max(.1,(profile.y-profile.x)*.4),profile.y+max(.2,profile.z*.3),qs.x)*smoothstep(.55,.93,terrainN.y)*(1.0-uRockOnly);
   float colony=ecologyPatch(vTerrainWorld.xz,uPlantEcology.y,uPlantField.x);
   float moisture=coastNoise(vTerrainWorld.xz*.085+vec2(11.3,28.1));
   float rootCover=(cover.r*.65+cover.g)*smoothstep(.55,.93,terrainN.y)*(1.0-uRockOnly);
   float coverWeight=clamp(soilCap*(.28+.62*smoothstep(.22,.72,moisture))+rootCover,0.0,1.0)*uTerrainGroundCover*(1.0-wet)*(1.0-path);
   float dryness=clamp(uPlantEcology.x+4.0*uPlantEcology.x*(1.0-uPlantEcology.x)*((colony-.5)*uPlantEcology.z*1.8+(uCoastGeology.z-.5)*.24),0.0,1.0);
   vec2 sandNormalUv=vTerrainWorld.xz/1.2*uTerrainScale+terrainDomainWarp(vTerrainWorld.xz);
   vec2 sandDx=dFdx(sandNormalUv),sandDy=dFdy(sandNormalUv);
   vec2 groundNormalUv=vTerrainWorld.xz/1.6*uTerrainScale+terrainDomainWarp(vTerrainWorld.xz);
   vec2 groundDx=dFdx(groundNormalUv),groundDy=dFdy(groundNormalUv);
   vec3 triWeight=pow(abs(terrainN),vec3(6.0));triWeight/=max(dot(triWeight,vec3(1.0)),.001);
   float rockLayer=uRockLayer,rockTile=uRockLayer<2.5?2.8:1.8;
   vec2 uvX=vTerrainWorld.zy/rockTile*uTerrainScale+terrainDomainWarp(vTerrainWorld.zy);
   vec2 uvY=vTerrainWorld.xz/rockTile*uTerrainScale+terrainDomainWarp(vTerrainWorld.xz);
   vec2 uvZ=vTerrainWorld.xy/rockTile*uTerrainScale+terrainDomainWarp(vTerrainWorld.xy);
   vec2 rockNormalUvX=uvX,rockNormalUvY=uvY,rockNormalUvZ=uvZ;
   vec2 dxX=dFdx(uvX),dyX=dFdy(uvX),dxY=dFdx(uvY),dyY=dFdy(uvY),dxZ=dFdx(uvZ),dyZ=dFdy(uvZ);
   TerrainSample ground;ground.color=vec3(.5);ground.surface=vec3(.9,1.0,.5);ground.normal=vec3(0,0,1);
   if(rockWeight<.999){
    vec2 sandUv=terrainParallaxUv(sandNormalUv,viewWorld.xz,viewWorld.y,shellMask>.25?1.0:0.0,.024/1.2*shellMask+.008);
    ground=terrainSample(0.0,sandUv,sandDx,sandDy);
    if(shellMask>.01)ground=terrainBlend(ground,terrainSample(1.0,sandUv,sandDx,sandDy),shellMask);
    ground.color*=mix(vec3(1.0),vec3(.66,.56,.41),soilCap*uCoastGeology.y*(1.0-shellMask));
    if(coverWeight>.01){
     vec2 grassUv=terrainParallaxUv(groundNormalUv,viewWorld.xz,viewWorld.y,4.0,.012/1.6);
     TerrainSample turf=terrainSample(4.0,grassUv,groundDx,groundDy);
     turf=terrainBlend(turf,terrainSample(5.0,grassUv,groundDx,groundDy),dryness);
     ground=terrainBlend(ground,turf,coverWeight);
    }
    ground.color=mix(ground.color,ground.color*vec3(.72,.66,.53),path*.38);
   }
   vec3 rockColor=vec3(0),rockSurface=vec3(0),rockMapX=vec3(0,0,1),rockMapY=vec3(0,0,1),rockMapZ=vec3(0,0,1);
   if(rockWeight>.001){
    if(triWeight.x>.002){uvX=terrainParallaxUv(uvX,viewWorld.zy,viewWorld.x,rockLayer,.028/rockTile);TerrainSample m=terrainSample(rockLayer,uvX,dxX,dyX);rockColor+=m.color*triWeight.x;rockSurface+=m.surface*triWeight.x;rockMapX=m.normal;}
    if(triWeight.y>.002){TerrainSample m=terrainSample(rockLayer,uvY,dxY,dyY);rockColor+=m.color*triWeight.y;rockSurface+=m.surface*triWeight.y;rockMapY=m.normal;}
    if(triWeight.z>.002){uvZ=terrainParallaxUv(uvZ,viewWorld.xy,viewWorld.z,rockLayer,.028/rockTile);TerrainSample m=terrainSample(rockLayer,uvZ,dxZ,dyZ);rockColor+=m.color*triWeight.z;rockSurface+=m.surface*triWeight.z;rockMapZ=m.normal;}
    float strata=coastNoise(vec2(qs.y*.095,groundY*2.4+sin(qs.y*.077)*.26));
    float cap=smoothstep(profile.z+profile.w*.035-.55,profile.z+profile.w*.035+.06,groundY)*uCoastGeology.y*(1.0-uRockOnly);
    rockColor*=mix(vec3(1.0),vec3(.39,.34,.25),cap);
    rockColor*=mix(vec3(.93,.86,.76),vec3(1.13,1.1,.95),strata*.7+uCoastGeology.z*.3);
   }
   vec3 surfaceData=mix(ground.surface,rockSurface,rockWeight);
   vec3 terrainColor=mix(ground.color,rockColor,rockWeight);
   float macroVariation=.88+.22*coastNoise(vTerrainWorld.xz*.21+vec2(5.2,42.9));
   diffuseColor.rgb=mix(terrainColor*mix(1.0,.53,wet),vec3(.82,.84,.78),foamTrace*.22)*macroVariation;
   diffuseColor.rgb*=1.0+caustic*.5;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(surfaceData.r,.4,wet);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   vec3 groundViewN=terrainNormal(normal,-vViewPosition,sandNormalUv,ground.normal);
   vec3 rockViewN=normal;
   if(rockWeight>.001)rockViewN=normalize(terrainNormal(normal,-vViewPosition,rockNormalUvX,rockMapX)*triWeight.x+terrainNormal(normal,-vViewPosition,rockNormalUvY,rockMapY)*triWeight.y+terrainNormal(normal,-vViewPosition,rockNormalUvZ,rockMapZ)*triWeight.z);
   normal=normalize(mix(groundViewN,rockViewN,rockWeight));
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>','#include <aomap_fragment>\nreflectedLight.indirectDiffuse*=surfaceData.g;');
 };
 material.customProgramCacheKey=()=> 'azov-coast-layered-pbr-v3';return material;
}
