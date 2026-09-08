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
// The water's foam field where the surf hands the beach its swash: r foam on the sand, b wet sand. Zero outside its window.
uniform sampler2D uSwashField;uniform vec3 uSwashWindow;uniform float uSwashEnabled;
vec3 swashField(vec2 worldXZ){
 if(uSwashEnabled<.5)return vec3(0.0);
 vec2 uv=(worldXZ-uSwashWindow.xy)/(2.0*uSwashWindow.z)+.5;
 // The weight fades over the window's rim; plain clamps, since smoothstep with reversed edges is undefined in GLSL.
 float w=clamp(min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y))/.06,0.0,1.0);
 if(w<=0.0)return vec3(0.0);
 return texture2D(uSwashField,uv).rgb*w;
}
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
// The trodden dry beach: dents and hollows at two scales, 0..1 deep.
float sandDents(vec2 p){return smoothstep(.5,.72,coastNoise(p))*.7+smoothstep(.55,.8,coastNoise(p*2.15+vec2(5.0,2.0)))*.3;}
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
  uPondNormalMap:{value:null},uPondTexel:{value:new THREE.Vector2(1/256,1/256)},uPondExtent:{value:34},uCausticsParams:{value:new THREE.Vector4(0,1,1,0)},uCausticsLight:{value:new THREE.Vector3(0,1,0)},uCausticsKey:{value:1},
  uSwashField:{value:null},uSwashWindow:{value:new THREE.Vector3(0,0,1)},uSwashEnabled:{value:0}};
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
   vec2 qs=coastLocal(vTerrainWorld.xz),surfQS=coastSurfLocal(qs);float groundY=vTerrainWorld.y;
   vec3 forms=coastLandforms(qs.y);vec4 profile=coastProfile(qs.y,forms);
   float rockWeight=max(uRockOnly,1.0-smoothstep(.70,.965,abs(terrainN.y)));
   // The swash lives in a band around the waterline; the bluff and plateau skip it.
   bool surfBand=surfQS.x>-26.0&&surfQS.x<12.0;
   float wet=surfBand?coastWetnessAtHeight(qs,uTerrainTime,groundY):(groundY<0.0?coastMask(qs):0.0);
   float caustic=groundY<-.02?shelfCaustics(vTerrainWorld.xz,-groundY-.02):0.0;
   float foamTrace=surfBand?coastSandFoamAtHeight(qs,vTerrainWorld,uTerrainTime,groundY)*smoothstep(.28,.88,terrainN.y)*(1.0-rockWeight*.32):0.0;
   // The surf's own swash, from the water's foam field: the sand a bore's
   // run-up sheet has wetted, and the lace it left, in the same reticulated
   // foam this shader draws for its own wave.
   vec3 swash=swashField(vTerrainWorld.xz);
   if(surfBand&&groundY>-.02){wet=max(wet,swash.b);foamTrace=max(foamTrace,min(swash.r*1.3,.9)*(.5+.5*coastLace(vTerrainWorld.xz,11.0,vec2(0.0)))*smoothstep(.28,.88,terrainN.y)*(1.0-rockWeight*.32));}
   float path=coastPathMask(qs)*(1.0-uRockOnly);
   // Height above the run-up envelope the wet sand dries by, frozen in time so
   // what the sea leaves along that line does not float with the tide.
   float sandSeed=uCoastShape.w*.031,margin=max(.04,uCoastSurface.w*.035);
   float runup=(surfBand&&surfQS.x>0.0)?max(margin,coastWaveGain(qs,0.0)):margin,above=groundY-runup;
   float dist=distance(cameraPosition,vTerrainWorld);
   // The dry beach: from just above the run-up to the foot of the bluff, flat.
   float dryBeach=(1.0-wet)*smoothstep(.01,.06,above)*(1.0-smoothstep(profile.x-3.0,profile.x+1.0,qs.x))*smoothstep(.9,.97,terrainN.y)*coastMask(qs)*(1.0-uRockOnly);
   float variety=uCoastSand.x*dryBeach,loose=variety*(1.0-smoothstep(14.0,30.0,dist));
   float shellMask=uCoastSurf.w*smoothstep(-.4,1.0,surfQS.x)*(1.0-smoothstep(4.0,max(7.0,uCoastDimensions.z*.8),surfQS.x));
   shellMask*=mix(.56,1.0,coastNoise(qs*.24+vec2(17.3,uCoastShape.w*.031)));
   // Coarse shell hash also lies where the storm sea left it, a line above the
   // run-up along some stretches, and in patches over the dry beach.
   float shellLine=exp(-pow((above-.15)/.06,2.0))*smoothstep(.35,.7,coastNoise(vec2(qs.y*.05,4.0)+sandSeed))*mix(.4,1.0,coastNoise(vec2(qs.y*.8,qs.x*1.5)+sandSeed));
   float shellPatches=smoothstep(.58,.78,coastPatch(vTerrainWorld.xz,6.0,uCoastShape.w*.37+19.0))*.7;
   shellMask=max(shellMask,uCoastSurf.w*max(shellLine,shellPatches)*dryBeach);
   vec2 coverUv=(vTerrainWorld.xz-uPlantCoverBounds.xy)/uPlantCoverBounds.zw;vec3 cover=vec3(0.0);
   if(uPlantCoverEnabled>.5&&all(greaterThanEqual(coverUv,vec2(0)))&&all(lessThanEqual(coverUv,vec2(1))))cover=texture2D(uPlantCover,coverUv).rgb;
   float soilCap=smoothstep(profile.x+max(.1,(profile.y-profile.x)*.4),profile.y+max(.2,profile.z*.3),qs.x)*smoothstep(.55,.93,terrainN.y)*(1.0-uRockOnly);
   float colony=ecologyPatch(vTerrainWorld.xz,uPlantEcology.y,uPlantField.x);
   float moisture=coastNoise(vTerrainWorld.xz*.085+vec2(11.3,28.1));
   float rootCover=(cover.r*.65+cover.g)*smoothstep(.55,.93,terrainN.y)*(1.0-uRockOnly);
   float coverWeight=clamp(soilCap*(.28+.62*smoothstep(.22,.72,moisture))+rootCover,0.0,1.0)*uTerrainGroundCover*(1.0-wet)*(1.0-path);
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
    vec2 sandUv=terrainParallaxUv(sandNormalUv,viewWorld.xz,viewWorld.y,shellMask>.25?1.0:0.0,.024/1.2*shellMask+.008+loose*.02);
    ground=terrainSample(0.0,sandUv,sandDx,sandDy);
    if(shellMask>.01)ground=terrainBlend(ground,terrainSample(1.0,sandUv,sandDx,sandDy),shellMask);
    ground.color*=mix(vec3(1.0),vec3(.66,.56,.41),soilCap*uCoastGeology.y*(1.0-shellMask));
    // Loose sand (Denis's photos of the strand): the dry beach is trodden and
    // wind-blown into dents and hollows, rougher and puffier than the packed
    // wet sand. They shape the normal and shade the hollows, and fade before
    // they could shimmer from afar. Broad pink-grey drifts of heavier grains;
    // dark streaks of heavy minerals along the strand.
    if(variety>.01){
     if(loose>.01){
      vec2 dp=vTerrainWorld.xz*3.3+sandSeed;float dent=sandDents(dp),e=.2;
      vec2 grad=vec2(sandDents(dp+vec2(e,0.0))-dent,sandDents(dp+vec2(0.0,e))-dent)/e;
      ground.normal=normalize(vec3(ground.normal.xy+grad*.22*loose,ground.normal.z));
      ground.color*=1.0-dent*loose*.2;
      ground.surface.r=mix(ground.surface.r,.95,loose*.4);
     }
     float drift=coastPatch(vTerrainWorld.xz,11.0,uCoastShape.w*.37+5.0);
     ground.color*=mix(vec3(1.0),mix(vec3(1.0,.93,.88),vec3(.95,.97,1.0),drift),.5*variety);
     float streaks=smoothstep(.62,.82,coastNoise(vec2(qs.y*.35,qs.x*2.2)+sandSeed))*exp(-pow((above-.1)/.08,2.0))*(1.0-smoothstep(20.0,60.0,dist));
     ground.color*=1.0-streaks*.35*variety;
    }
    // The backwash combs ripples into the wet sand of the swash too, continuing the bed's.
    float wetRipples=uCoastBed.y*wet*smoothstep(-.02,.03,groundY)*(1.0-smoothstep(10.0,28.0,dist))*(1.0-shellMask*.6);
    if(wetRipples>.01){
     float wobble=(coastNoise(qs*vec2(.25,.7)+vec2(3.0,1.0))-.5)*5.0+coastNoise(qs*vec2(.5,2.0)+vec2(7.0,2.0))*1.5;
     ground.normal=normalize(vec3(ground.normal.xy-coastLand()*cos(qs.x*44.88+wobble)*.3*wetRipples,ground.normal.z));
    }
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
     // The metre-scale detail shimmers once a pixel spans metres of bed; from
     // there it settles to its mean and only the field itself remains.
     float bedDetail=1.0-smoothstep(.15,.8,fwidth(qs.x)+fwidth(qs.y));
     float rag=mix(.5,coastNoise(qs*vec2(.9,.35)+bedSeed),bedDetail);
     float streak=mix(.5,coastNoise(vec2(qs.y*1.3,qs.x*.25)+bedSeed.yx),bedDetail);
     bed.x=smoothstep(.08,.55,bed.x*mix(.7,1.3,rag))*mix(.6,1.0,streak);
     bed.y=smoothstep(.05,.6,bed.y*mix(.7,1.2,rag));
     bed.z=smoothstep(.12,.6,bed.z*mix(.6,1.4,mix(.5,coastNoise(qs*1.7+vec2(9.0,4.0)),bedDetail)));
     if(bed.y>.01){TerrainSample silt=terrainSample(3.0,sandUv*.667,sandDx*.667,sandDy*.667);silt.color*=vec3(.42,.44,.38);ground=terrainBlend(ground,silt,bed.y);}
     if(bed.x>.01){TerrainSample weed=terrainSample(4.0,sandUv*.75,sandDx*.75,sandDy*.75);weed.color*=vec3(.36,.46,.24);weed.surface.r=max(weed.surface.r,.8);ground=terrainBlend(ground,weed,bed.x);}
     if(bed.z>.01){TerrainSample bank=terrainSample(1.0,sandUv,sandDx,sandDy);bank.color*=vec3(.3,.3,.28);ground=terrainBlend(ground,bank,bed.z);}
     float ripples=uCoastBed.y*smoothstep(.15,.5,depth)*(1.0-smoothstep(2.5,4.0,depth))*(1.0-smoothstep(10.0,28.0,distance(cameraPosition,vTerrainWorld)))*(1.0-bed.x)*(1.0-bed.y*.7);
     if(ripples>.01){
      // Crests parallel to the shore, 14 cm apart, bending and forking.
      float wobble=(coastNoise(qs*vec2(.25,.7)+vec2(3.0,1.0))-.5)*5.0+coastNoise(qs*vec2(.5,2.0)+vec2(7.0,2.0))*1.5;
      float ripplePhase=qs.x*44.88+wobble;
      ground.normal=normalize(vec3(ground.normal.xy-coastLand()*cos(ripplePhase)*(1.0-smoothstep(1.2,5.0,fwidth(ripplePhase)))*.45*ripples,ground.normal.z));
     }
    }
    // Moist islands (Denis: the Azov shore, not a desert): where water gathers
    // and shade keeps it - the seep of the bluff, the calm back of the swash,
    // the halos of shrubs, trees and boulders (uPlantCover.b) - the sand
    // greens with fresh turf in patches, and the litter under the crowns is
    // fresher too. The material only; the tufts do not read this yet.
    float oasis=0.0;
    if(uCoastSoil.w>.01&&groundY>.05){
     // The damp back of the beach just past the wet band the swash leaves (the
     // same envelope coastWetnessAtHeight dries by): a ragged strip a quarter
     // metre up the beach, only along some stretches of the shore.
     // The run-up envelope is zero past the surf band, so the strip is a height
     // above the wet margin everywhere on the dry beach - no seam where the band ends.
     float seed=uCoastShape.w*.031,shoreRag=(coastNoise(vec2(qs.y*.2,5.0)+seed)-.5)*.1,calm=0.0;
     if(qs.x>0.0){
      float gain=surfBand?coastWaveGain(qs,uTerrainTime):0.0;
      float above=groundY-max(max(.04,uCoastSurface.w*.035),gain)-.1+shoreRag;
      calm=smoothstep(0.0,.04,above)*(1.0-smoothstep(.16,.3,above))*smoothstep(.25,.5,coastNoise(vec2(qs.y*.04,2.0)+seed));
     }
     float moist=max(max(seep,calm),cover.b);
     float islands=smoothstep(.38,.62,coastPatch(vTerrainWorld.xz,4.5,uCoastShape.w*.37+71.0));
     // The strip along the water is continuous where it is at all; the other islands are patches.
     float core=max(moist*mix(.45,1.0,islands),calm*.85)*(1.0-wet)*(1.0-path)*smoothstep(.75,.9,terrainN.y)*coastMask(qs);
     // The slider scales the islands: a soft knee, so the cores are full turf and the fringe fades; the sand shows through the clumps.
     oasis=smoothstep(.05,.5,core*1.6*uCoastSoil.w)*mix(.6,1.0,coastNoise(vTerrainWorld.xz*1.3+vec2(4.0,1.0)))*.85;
    }
    if(coverWeight>.01){
     float coverDry=dryness*(1.0-oasis*.6);
     vec2 grassUv=terrainParallaxUv(groundNormalUv,viewWorld.xz,viewWorld.y,4.0,.012/1.6);
     TerrainSample turf=terrainSample(4.0,grassUv,groundDx,groundDy);
     turf=terrainBlend(turf,terrainSample(5.0,grassUv,groundDx,groundDy),coverDry);
     turf.color=gradeCover(turf.color,coverDry);
     ground=terrainBlend(ground,turf,coverWeight);
    }
    if(oasis>.01){
     vec2 oasisUv=vTerrainWorld.xz/2.0*uTerrainScale+terrainDomainWarp(vTerrainWorld.xz);
     TerrainSample moss=terrainSample(6.0,oasisUv,dFdx(oasisUv),dFdy(oasisUv));
     moss.color=gradeCover(moss.color,0.0)*uCoastOasisTint;
     ground=terrainBlend(ground,moss,oasis);
    }
    // Wrack (Denis's photo of the Azov strand): the weed the sea throws up
    // and leaves along the run-up line - the envelope the wet sand dries by,
    // frozen in time so the line does not float - in strands and clumps along
    // some stretches of the shore, fed by the meadows of the shelf and by
    // storms. Last storm's line lies a little up the beach, dried brown.
    // Parallax on the cover layer gives the clumps their body.
    if(uCoastWrack.x>.01&&surfBand&&surfQS.x>0.0&&groundY>-.02){
     float seed=uCoastShape.w*.031;
     float stretch=smoothstep(.28,.6,coastNoise(vec2(qs.y*.03,9.0)+seed));
     float freshLine=exp(-pow((above-.02)/.05,2.0)),oldLine=exp(-pow((above-.18)/.06,2.0))*.6;
     float strands=coastNoise(vec2(qs.y*1.4,qs.x*4.0)+seed*7.0),clumps=coastNoise(vTerrainWorld.xz*2.6+vec2(3.0,seed));
     float amount=uCoastWrack.x*(.35+.65*uCoastShelf.y)*(1.0+uCoastSwell.w*.8)*stretch;
     // Discrete clumps with crisp edges: the line sets how many, the slider how dense.
     float line=freshLine+oldLine,t=.66-amount*.3;
     float wrack=smoothstep(t,t+.1,strands*.5+clumps*.5+(line-1.0)*.35)*step(.05,line)*(1.0-path)*(1.0-uRockOnly)*min(1.0,amount*2.5);
     if(wrack>.01){
      float age=oldLine/(line+1e-3);
      vec2 wrackUv=terrainParallaxUv(groundNormalUv,viewWorld.xz,viewWorld.y,6.0,.05/2.0);
      TerrainSample weed=terrainSample(6.0,wrackUv,groundDx,groundDy);
      weed.color*=mix(vec3(.62,.8,.3),vec3(.32,.28,.18),age)*(1.0-wrack*(1.0-wrack)*1.2);
      weed.surface.r=mix(.35,.85,age);
      ground=terrainBlend(ground,weed,wrack);
      // Lying on the wet sand, the clumps themselves are not darkened as sand is.
      wet*=1.0-wrack*.6;
     }
    }
    // The steppe from afar: the grass field level (plants/grassField.js),
    // Denis's turf under the tufts near by and the whole meadow beyond reach.
    float field=grassFieldWeight(qs,profile,terrainN,path,vTerrainWorld.xz,dist);
    // The rim of the bluff: turf to the very edge of the crest, as on the shore
    // itself - Denis's turf tiles at full weight however near the camera, with
    // their own tint and greener than the steppe. The inland edge is ragged,
    // the paths cut through, and the face below takes over by slope.
    float rim=0.0;
    if(uCoastSoil.z>.01&&qs.x>profile.y-1.0&&qs.x<profile.y+uCoastSoil.z*1.6){
     float rag=(coastNoise(vec2(qs.y*.13,3.0)+uCoastShape.w*.031)-.5)*uCoastSoil.z*.9;
     rim=smoothstep(profile.y-.6,profile.y+.4,qs.x)*(1.0-smoothstep(uCoastSoil.z*.6,uCoastSoil.z*1.3,qs.x-profile.y+rag))*smoothstep(.72,.9,terrainN.y)*(1.0-path)*coastMask(qs);
     rim*=mix(.75,1.0,coastNoise(vTerrainWorld.xz*.45+vec2(2.0,9.0)));
    }
    float rimShare=rim/max(max(field,rim),1e-3);
    field=max(field,rim);
    if(field>.01){
     vec2 fieldUv=vTerrainWorld.xz/2.0*uTerrainScale+terrainDomainWarp(vTerrainWorld.xz);
     vec2 fieldDx=dFdx(fieldUv),fieldDy=dFdy(fieldUv);
     float fieldDry=mix(dryness,dryness*.35,rimShare);
     TerrainSample meadow=terrainSample(6.0,fieldUv,fieldDx,fieldDy);
     meadow=terrainBlend(meadow,terrainSample(7.0,fieldUv,fieldDx,fieldDy),fieldDry);
     float gust=grassGust(vTerrainWorld.xz,uTerrainTime);
     vec3 fieldTint=mix(mix(uGrassFieldFresh,uGrassFieldDry,fieldDry),uCoastRimTint,rimShare);
     meadow.color=gradeCover(meadow.color,fieldDry)*fieldTint*(1.0-uGrassField.z*gust*.35)*mix(1.0,mix(.7,1.0,meadow.surface.b),uGrassFieldScale.z);
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
     float fresh=(1.0-smoothstep(.3,.6,abs(terrainN.y)))*(1.0-uCoastGeology.z*.6)*smoothstep(.5,.8,coastPatch(vec2(qs.y,groundY*2.6),4.0,seed*30.0+9.0));
     fresh=clamp(fresh,0.0,1.0)*(1.0-talusTier);
     float bedPhase=groundY*19.0+(coastNoise(vec2(qs.y*.05,groundY*.3)+seed)-.5)*5.0+sin(qs.y*.077)*1.5,beds=sin(bedPhase);
     float coarse=coastNoise(vec2(qs.y*.03,groundY*.9)+seed)-.5;
     float steep=(1.0-smoothstep(.5,.9,abs(terrainN.y)))*(1.0-smoothstep(30.0,90.0,dist));
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
 material.customProgramCacheKey=()=> 'azov-coast-layered-pbr-v13';return material;
}
