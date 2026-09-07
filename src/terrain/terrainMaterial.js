import * as THREE from 'three';
import { coastShader, createCoastUniforms, syncCoastUniforms } from './terrainShader.js';
import { PLANT_FIELD_GLSL,ecologyUniforms } from '../plants/plantEcology.js';
import { GRASS_FIELD_GLSL,grassFieldUniforms } from '../plants/grassField.js';
const fragment=/* glsl */`
${coastShader}
${PLANT_FIELD_GLSL}
${GRASS_FIELD_GLSL}
varying vec3 vTerrainWorld;
varying vec3 vTerrainNormal;
uniform highp sampler2DArray uTerrainColor;
uniform highp sampler2DArray uTerrainNormal;
uniform highp sampler2DArray uTerrainSurface;
uniform sampler2D uPlantCover;uniform vec4 uPlantCoverBounds;uniform float uPlantCoverEnabled;
uniform vec4 uTerrainGrade;uniform float uTerrainGradeDry;
uniform float uRockLayer;uniform float uTerrainTime;uniform float uTerrainOptics;uniform float uTerrainScale;uniform float uTerrainParallax;uniform float uRockOnly;uniform float uTerrainGroundCover;
uniform sampler2D uPondNormalMap;uniform vec2 uPondTexel;uniform float uPondExtent;uniform vec4 uCausticsParams;uniform vec3 uCausticsLight;uniform float uCausticsKey;
struct TerrainSample{vec3 color;vec3 surface;vec3 normal;};
// The daylight soils of the Taganrog bluffs (linear): fresh scarp #C4A472,
// weathered crust #9A7C58, humus #5F4C38, dry talus #C6AC80 - and the loam
// texture's own mean #91673D, so a tint of target/mean recolours it exactly.
const vec3 SOIL_FRESH=vec3(.552,.371,.168),SOIL_CRUST=vec3(.323,.202,.098),SOIL_HUMUS=vec3(.114,.072,.040),SOIL_TALUS=vec3(.565,.413,.216),SOIL_LOAM=vec3(.283,.136,.047);
// The artist's grading of the albedo: saturation around its own luminance,
// contrast around mid grey, then level. Fresh and dry cover each get their
// own saturation so the meadow can be greener or strawier than authored.
vec3 gradeSaturation(vec3 c,float s){float l=dot(c,vec3(.2126,.7152,.0722));return max(mix(vec3(l),c,s),0.0);}
vec3 gradeTerrain(vec3 c){c=gradeSaturation(c,uTerrainGrade.x);c=(c-.18)*uTerrainGrade.y+.18;return max(c*uTerrainGrade.z,0.0);}
vec3 gradeCover(vec3 c,float dryness){return gradeSaturation(c,mix(uTerrainGrade.w,uTerrainGradeDry,dryness));}
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
 const uniforms={...createCoastUniforms(),...ecologyUniforms(),...grassFieldUniforms(),
  uTerrainColor:{value:textures.color},uTerrainNormal:{value:textures.normal},uTerrainSurface:{value:textures.surface},
  uPlantCover:{value:null},uPlantCoverBounds:{value:new THREE.Vector4(0,0,1,1)},uPlantCoverEnabled:{value:0},
  uTerrainGrade:{value:new THREE.Vector4(1,1,1,1)},uTerrainGradeDry:{value:1},
  uTerrainTime:{value:0},uTerrainOptics:{value:0},uTerrainScale:{value:p.terrainTextureScale},uTerrainParallax:{value:p.terrainParallax},uTerrainGroundCover:{value:p.terrainGroundCover},uRockLayer:{value:rockOnly?2:3},uRockOnly:{value:rockOnly?1:0},
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
  // The optics passes cut the beach on the run-up water itself, not on the flat
  // clip plane at the still line: refraction keeps what the sheet covers (the
  // sand the swash shows through itself), reflection the rest. Replacing the
  // chunk also frees the terrain from the renderer's global planes.
  shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`
   if(uTerrainOptics>.5){
    vec2 opticsQS=coastLocal(vTerrainWorld.xz);
    float opticsWater=coastMask(opticsQS)>.001?coastWave(opticsQS,uTerrainTime)+coastEdgeRag(opticsQS,uTerrainTime):0.0;
    if(uTerrainOptics<1.5){if(vTerrainWorld.y>opticsWater+.08)discard;}
    else if(vTerrainWorld.y<opticsWater-.02)discard;
   }`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
   vec3 terrainN=normalize(vTerrainNormal),viewWorld=cameraPosition-vTerrainWorld;
   // The mesh is the analytic height at its vertices, so the drawn surface is
   // the ground here to within the display error - millimetres on the beach,
   // where wetness and foam read it - and forty transcendentals a pixel cheaper.
   vec2 qs=coastLocal(vTerrainWorld.xz);float groundY=vTerrainWorld.y;
   vec3 forms=coastLandforms(qs.y);vec4 profile=coastProfile(qs.y,forms);
   float rockWeight=max(uRockOnly,1.0-smoothstep(.70,.965,abs(terrainN.y)));
   // The swash lives in a band around the waterline; the bluff and plateau skip it.
   bool surfBand=qs.x>-26.0&&qs.x<12.0;
   float wet=surfBand?coastWetnessAtHeight(qs,uTerrainTime,groundY):(groundY<0.0?coastMask(qs):0.0);
   float caustic=groundY<-.02?shelfCaustics(vTerrainWorld.xz,-groundY-.02):0.0;
   float foamTrace=surfBand?coastSandFoamAtHeight(qs,vTerrainWorld,uTerrainTime,groundY)*smoothstep(.28,.88,terrainN.y)*(1.0-rockWeight*.32):0.0;
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
   float dist=distance(cameraPosition,vTerrainWorld);
   // The ground at the foot of the bluff (terrainShader.js coastSoil): x the
   // talus tongue run out onto the beach, y the seep where the bluff drains.
   // Only the beach and the face can carry either; the shelf and plateau skip it.
   vec2 soil=qs.x>-2.0&&qs.x<profile.y?coastSoil(qs,forms,profile):vec2(0.0);float seep=soil.y;
   // Height up the face, 0 at the foot and 1 at the crown as coastHeight
   // lowers it on slides and ravines: the tiers of the bluff read from this.
   float footY=min(profile.x,profile.w)*.035,crestY=footY+profile.z*(1.0-forms.x*.16-forms.y*.58);
   float hN=clamp((groundY-footY)/max(crestY-footY,.5),0.0,1.0);
   // Seepage keeps the cover green: the plants read the same field (vegetation.dryness).
   float dryness=clamp(uPlantEcology.x+4.0*uPlantEcology.x*(1.0-uPlantEcology.x)*((colony-.5)*uPlantEcology.z*1.8+(uCoastGeology.z*(1.0-seep*.5)-.5)*.24),0.0,1.0)*(1.0-seep*.5);
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
    // The run-out of the bluff onto the beach: loose loam in lobes, the sand
    // showing through at the fringe where the sheet thins and stays damp.
    if(soil.x>.01){
     TerrainSample talus=terrainSample(3.0,sandUv*.667,sandDx*.667,sandDy*.667);
     float fringe=smoothstep(0.0,.4,soil.x)*(1.0-smoothstep(.4,.85,soil.x));
     talus.color*=SOIL_CRUST/SOIL_LOAM*(1.0-fringe*.25);
     ground=terrainBlend(ground,talus,smoothstep(.02,.55,soil.x));
    }
    // The bed of the shelf (terrainShader.js coastBedCover): silt in the calm,
    // weed meadows on the middle of the shelf, mussel banks as dark islands -
    // three of the layers already resident, tinted, with ragged edges and
    // streaks from value noise the CPU twin leaves out. Then the ripple marks
    // the waves comb into the bare sand, as a tilt of the sand normal.
    if(groundY<-.02&&dot(uCoastShelf.yzw,vec3(1.0))+uCoastBed.y>.001){
     float depth=-groundY;
     vec3 bed=coastBedCover(qs,depth);
     vec2 bedSeed=vec2(uCoastShape.w*.05,0.0);
     float rag=coastNoise(qs*vec2(.9,.35)+bedSeed);
     float streak=coastNoise(vec2(qs.y*1.3,qs.x*.25)+bedSeed.yx);
     bed.x=smoothstep(.08,.55,bed.x*mix(.7,1.3,rag))*mix(.6,1.0,streak);
     bed.y=smoothstep(.05,.6,bed.y*mix(.7,1.2,rag));
     bed.z=smoothstep(.12,.6,bed.z*mix(.6,1.4,coastNoise(qs*1.7+vec2(9.0,4.0))));
     if(bed.y>.01){TerrainSample silt=terrainSample(3.0,sandUv*.667,sandDx*.667,sandDy*.667);silt.color*=vec3(.42,.44,.38);ground=terrainBlend(ground,silt,bed.y);}
     if(bed.x>.01){TerrainSample weed=terrainSample(4.0,sandUv*.75,sandDx*.75,sandDy*.75);weed.color*=vec3(.36,.46,.24);weed.surface.r=max(weed.surface.r,.8);ground=terrainBlend(ground,weed,bed.x);}
     if(bed.z>.01){TerrainSample bank=terrainSample(1.0,sandUv,sandDx,sandDy);bank.color*=vec3(.3,.3,.28);ground=terrainBlend(ground,bank,bed.z);}
     float ripples=uCoastBed.y*smoothstep(.15,.5,depth)*(1.0-smoothstep(2.5,4.0,depth))*(1.0-smoothstep(10.0,28.0,distance(cameraPosition,vTerrainWorld)))*(1.0-bed.x)*(1.0-bed.y*.7);
     if(ripples>.01){
      // Crests parallel to the shore, 14 cm apart, bending and forking.
      float wobble=(coastNoise(qs*vec2(.25,.7)+vec2(3.0,1.0))-.5)*5.0+coastNoise(qs*vec2(.5,2.0)+vec2(7.0,2.0))*1.5;
      ground.normal=normalize(vec3(ground.normal.xy-coastLand()*cos(qs.x*44.88+wobble)*.45*ripples,ground.normal.z));
     }
    }
    if(coverWeight>.01){
     vec2 grassUv=terrainParallaxUv(groundNormalUv,viewWorld.xz,viewWorld.y,4.0,.012/1.6);
     TerrainSample turf=terrainSample(4.0,grassUv,groundDx,groundDy);
     turf=terrainBlend(turf,terrainSample(5.0,grassUv,groundDx,groundDy),dryness);
     turf.color=gradeCover(turf.color,dryness);
     ground=terrainBlend(ground,turf,coverWeight);
    }
    // The steppe from afar: the grass field level (plants/grassField.js),
    // Denis's turf under the tufts near by and the whole meadow beyond reach.
    float field=grassFieldWeight(qs,profile,terrainN,path,vTerrainWorld.xz,distance(cameraPosition,vTerrainWorld));
    if(field>.01){
     vec2 fieldUv=vTerrainWorld.xz/2.0*uTerrainScale+terrainDomainWarp(vTerrainWorld.xz);
     vec2 fieldDx=dFdx(fieldUv),fieldDy=dFdy(fieldUv);
     TerrainSample meadow=terrainSample(6.0,fieldUv,fieldDx,fieldDy);
     meadow=terrainBlend(meadow,terrainSample(7.0,fieldUv,fieldDx,fieldDy),dryness);
     float gust=grassGust(vTerrainWorld.xz,uTerrainTime);
     vec3 fieldTint=mix(uGrassFieldFresh,uGrassFieldDry,dryness);
     meadow.color=gradeCover(meadow.color,dryness)*fieldTint*(1.0-uGrassField.z*gust*.35)*mix(1.0,mix(.7,1.0,meadow.surface.b),uGrassFieldScale.z);
     meadow.normal=normalize(vec3(meadow.normal.xy+uGrassWind.xy*gust*uGrassField.z*.3,meadow.normal.z));
     float sheen=pow(max(dot(normalize(viewWorld.xz),-uGrassWind.xy),0.0),3.0)*gust*uGrassField.w;
     meadow.color+=fieldTint*sheen*.18;
     ground=terrainBlend(ground,meadow,field);
    }
    // A path through the meadow is trampled turf, not darkened sand.
    float trampled=smoothstep(.15,.6,coastPathMask(qs))*uGrassField.x*plateauField(qs,profile,terrainN)*coastMask(qs);
    if(trampled>.01){
     vec2 wornUv=vTerrainWorld.xz/2.0*uTerrainScale+terrainDomainWarp(vTerrainWorld.xz);
     ground=terrainBlend(ground,terrainSample(8.0,wornUv,dFdx(wornUv),dFdy(wornUv)),trampled);
    }
    ground.color=mix(ground.color,ground.color*vec3(.72,.66,.53),path*.38);
   }
   vec3 rockColor=vec3(0),rockSurface=vec3(0),rockMapX=vec3(0,0,1),rockMapY=vec3(0,0,1),rockMapZ=vec3(0,0,1);
   if(rockWeight>.001){
    if(triWeight.x>.002){uvX=terrainParallaxUv(uvX,viewWorld.zy,viewWorld.x,rockLayer,.028/rockTile);TerrainSample m=terrainSample(rockLayer,uvX,dxX,dyX);rockColor+=m.color*triWeight.x;rockSurface+=m.surface*triWeight.x;rockMapX=m.normal;}
    if(triWeight.y>.002){TerrainSample m=terrainSample(rockLayer,uvY,dxY,dyY);rockColor+=m.color*triWeight.y;rockSurface+=m.surface*triWeight.y;rockMapY=m.normal;}
    if(triWeight.z>.002){uvZ=terrainParallaxUv(uvZ,viewWorld.xy,viewWorld.z,rockLayer,.028/rockTile);TerrainSample m=terrainSample(rockLayer,uvZ,dxZ,dyZ);rockColor+=m.color*triWeight.z;rockSurface+=m.surface*triWeight.z;rockMapZ=m.normal;}
    if(uRockLayer>2.5){
     // The bluff in tiers, by height up the face, as the Taganrog shore reads
     // in daylight: the cold dark humus cap with the damp band under the turf,
     // the loess with thin pale beds and rain rills the whole height, the
     // loose talus at the foot. Fresh scarps are the steep faces, lighter and
     // warmer; weathering turns them to the darker crust. The beds and rills
     // fade with distance so they cannot shimmer from afar.
     float seed=uCoastShape.w*.031,strata=uCoastSoil.y*1.4*(1.0-smoothstep(40.0,120.0,dist));
     float capEdge=hN+(coastNoise(vec2(qs.y*.09,7.0)+seed)-.5)*.16;
     float cap=smoothstep(.78,.88,capEdge)*(.55+.45*uCoastGeology.y)*(1.0-uRockOnly),underCap=smoothstep(.62,.78,capEdge)*(1.0-cap)*(1.0-uRockOnly);
     float talusTier=max(1.0-smoothstep(.2,.42,hN),uRockOnly);
     float fresh=smoothstep(.6,.3,abs(terrainN.y))*(1.0-uCoastGeology.z*.6)*smoothstep(.5,.8,coastPatch(vec2(qs.y,groundY*2.6),4.0,seed*30.0+9.0));
     fresh=clamp(fresh,0.0,1.0)*(1.0-talusTier);
     float bedPhase=groundY*19.0+(coastNoise(vec2(qs.y*.05,groundY*.3)+seed)-.5)*5.0+sin(qs.y*.077)*1.5,beds=sin(bedPhase);
     float coarse=coastNoise(vec2(qs.y*.03,groundY*.9)+seed)-.5;
     float steep=smoothstep(.9,.5,abs(terrainN.y))*(1.0-smoothstep(30.0,90.0,dist));
     vec2 streakUv=vec2(qs.y*1.9+sin(groundY*.9)*.25,groundY*.11)+seed;
     float streaks=(coastNoise(streakUv)-.5)*2.0,streakSlope=(coastNoise(streakUv+vec2(.15,0.0))-coastNoise(streakUv))*6.0;
     float flow=sin(qs.y*.72+sin(qs.y*.131+uCoastShape.w*.137)+qs.x*.075);
     float rill=exp(-pow(flow/.24,2.0))*uCoastGeology.x*smoothstep(.15,.5,hN)*(1.0-smoothstep(.75,.9,hN));
     float face=(1.0-talusTier)*(1.0-cap);
     vec3 tone=mix(mix(SOIL_CRUST,SOIL_FRESH,fresh),mix(SOIL_TALUS,SOIL_CRUST,.35),talusTier*.85);
     tone=mix(tone,SOIL_HUMUS,cap);
     rockColor*=tone/SOIL_LOAM*(1.0+(.055*beds+.2*coarse)*strata*face)*(1.0-(.14*streaks*steep+.22*rill)*strata*face)*(1.0-underCap*.25);
     // The harder beds stand out as ridges and the rills cut grooves: a tilt of
     // the wall's normal in the two vertical projections (map y is world Y in
     // both; map x is world Z in the X projection and world X in the Z one).
     float relief=strata*face*steep;
     vec2 along=coastAlong();
     rockMapX.xy+=vec2(streakSlope*along.y*.35,cos(bedPhase)*.28)*relief;
     rockMapZ.xy+=vec2(streakSlope*along.x*.35,cos(bedPhase)*.28)*relief;
    }else{
     float strata=coastNoise(vec2(qs.y*.095,groundY*2.4+sin(qs.y*.077)*.26));
     rockColor*=mix(vec3(.93,.86,.76),vec3(1.13,1.1,.95),strata*.7+uCoastGeology.z*.3);
    }
   }
   // Loam over sand by height, not a fade: the lumps stand out of the sand.
   float rockW=clamp(rockWeight+rockWeight*(1.0-rockWeight)*(rockSurface.b-ground.surface.b)*1.4,0.0,1.0);
   vec3 surfaceData=mix(ground.surface,rockSurface,rockW);
   vec3 terrainColor=mix(ground.color,rockColor,rockW);
   float macroVariation=.88+.22*coastNoise(vTerrainWorld.xz*.21+vec2(5.2,42.9));
   // Seepage darkens the ground the way the swash does, without the foam.
   float damp=max(wet,seep*.8);
   diffuseColor.rgb=mix(gradeTerrain(terrainColor)*mix(1.0,.53,damp),vec3(.86,.87,.82),foamTrace)*macroVariation;
   diffuseColor.rgb*=1.0+caustic*.5;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(surfaceData.r,.4,damp);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   vec3 groundViewN=terrainNormal(normal,-vViewPosition,sandNormalUv,ground.normal);
   vec3 rockViewN=normal;
   if(rockWeight>.001)rockViewN=normalize(terrainNormal(normal,-vViewPosition,rockNormalUvX,rockMapX)*triWeight.x+terrainNormal(normal,-vViewPosition,rockNormalUvY,rockMapY)*triWeight.y+terrainNormal(normal,-vViewPosition,rockNormalUvZ,rockMapZ)*triWeight.z);
   normal=normalize(mix(groundViewN,rockViewN,rockW));
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>','#include <aomap_fragment>\nreflectedLight.indirectDiffuse*=surfaceData.g;');
 };
 material.customProgramCacheKey=()=> 'azov-coast-layered-pbr-v9';return material;
}
