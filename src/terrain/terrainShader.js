import * as THREE from 'three';
import { coastWeather } from './settings.js';
import { landformsShader } from './terrainLandforms.js';
export const coastShader = /* glsl */`
uniform vec4 uCoastShape;
uniform vec4 uCoastDimensions;
uniform vec4 uCoastDetail;
uniform vec4 uCoastSurface;
uniform vec4 uCoastSurf;
uniform vec4 uCoastGeology;
// xy: downwind direction in world xz, z: swell strength, w: storm.
uniform vec4 uCoastSwell;
${landformsShader}
vec2 coastLand() { return vec2(sin(uCoastShape.y),-cos(uCoastShape.y)); }
vec2 coastAlong() { return vec2(cos(uCoastShape.y),sin(uCoastShape.y)); }
float coastShore(float s) {
 float cape=exp(-pow((s-uCoastDetail.w)/uCoastSurface.x,2.0));
 float originCape=exp(-pow(uCoastDetail.w/uCoastSurface.x,2.0));
 return uCoastShape.z+uCoastDetail.y*(sin(s*.008)+(cos(s*.019)-1.0)*.24)-uCoastDetail.z*(cape-originCape);
}
vec2 coastLocal(vec2 worldXZ) {
 float s=dot(worldXZ,coastAlong());
 return vec2(dot(worldXZ,coastLand())-coastShore(s),s);
}
float coastMask(vec2 qs) {
 return uCoastShape.x*smoothstep(-96.0,-72.0,qs.x)*(1.0-smoothstep(uCoastDimensions.y-48.0,uCoastDimensions.y,qs.x))*(1.0-smoothstep(uCoastDimensions.x*.5-64.0,uCoastDimensions.x*.5,abs(qs.y)));
}
float coastHeight(vec2 qs) {
 float q=qs.x,s=qs.y,seed=uCoastShape.w*.137;
 float shelf=-uCoastSurface.y*(1.0-exp(min(q,0.0)/12.0));
 if(q<=0.0)return mix(-uCoastSurface.y,shelf,coastMask(qs));
 vec3 f=coastLandforms(s);vec4 profile=coastProfile(s,f);
 float foot=profile.x,top=profile.y,bank=profile.z,width=top-foot;
 float t=smoothstep(foot,top,q);
 float bench=.4*smoothstep(foot,foot+width*.58,q)+.6*smoothstep(foot+width*.76,top,q);
 float scarp=.18*smoothstep(foot,foot+width*.6,q)+.82*smoothstep(foot+width*.5,top,q);
 float cliff=mix(mix(scarp,bench,f.x),t,f.z);
 float recovery=smoothstep(top,top+max(6.0,bank*3.0),q);
 float slump=(f.x*.16+f.y*.58)*(1.0-recovery);
 float beach=min(q,profile.w)*.035;
 float talus=f.x*bank*.1*sin(t*3.14159265359)*(1.0-f.z);
 float flow=sin(s*.72+sin(s*.131+seed)+q*.075);
 float rill=exp(-pow(flow/.24,2.0));
 float erosion=-rill*min(.42,bank*.07)*uCoastGeology.x*sin(t*3.14159265359)*(1.0-f.z*.8);
 float dryNoise=(sin(q*.71+s*.19+seed)*.025+sin(s*.41-q*.27)*.04)*uCoastSurface.z*smoothstep(1.0,6.0,q);
 float upland=(sin(s*.081+q*.067+seed)*.18+sin(s*.027-q*.103)*.12)*uCoastSurface.z*smoothstep(top,top+8.0,q);
 return mix(-uCoastSurface.y,shelf+beach+cliff*bank*(1.0-slump)+talus+erosion+dryNoise+upland,coastMask(qs));
}
// The pond simulation owns deep water.  The shoreline strips take over through
// this depth interval, so the handoff follows an isobath instead of the pond's
// square render-target boundary.
float coastPondWeight(vec2 qs) {
 return smoothstep(.4,.8,-coastHeight(qs))*coastMask(qs)+(1.0-coastMask(qs));
}
float coastWave(vec2 qs,float time) {
 float phase=qs.x*1.15-time*6.28318530718/uCoastSurf.y+qs.y*.015;
 return sin(phase)*uCoastSurf.x*(1.0-smoothstep(0.0,4.0,qs.x))*(.76+.24*sin(qs.y*.071+time*.23))*smoothstep(-32.0,-22.0,qs.x)*coastMask(qs);
}
float coastNoise(vec2 p) {
 vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 vec4 h=fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1,0),vec2(127.1,311.7)),dot(i+vec2(0,1),vec2(127.1,311.7)),dot(i+vec2(1,1),vec2(127.1,311.7))))*43758.5453);
 return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
}
float coastWetnessAtHeight(vec2 qs,float time,float ground) {
 float recent=max(coastWave(qs,time),max(coastWave(qs,time-.7)*.85,coastWave(qs,time-1.4)*.65));
 float margin=max(.04,uCoastSurface.w*.035),level=max(margin,recent);
 return (1.0-smoothstep(level,level+.055,ground))*coastMask(qs);
}
float coastWetness(vec2 qs,float time){return coastWetnessAtHeight(qs,time,coastHeight(qs));}
vec3 coastBloomTint(vec3 color,vec2 qs,float time) {
 // Drifting cyanobacterial patches, mixed into the body of the water.
 float bloomPatch=smoothstep(.27,.76,coastNoise(qs*.028+vec2(time*.004,-time*.002)));
 float bloom=uCoastGeology.w*bloomPatch*uCoastShape.x;
 return mix(color,color*vec3(.64,1.12,.56)+vec3(.003,.008,.001),bloom*.65);
}
float coastFoamAtHeight(vec2 qs,vec3 world,float time,float ground) {
 float depth=coastWave(qs,time)-ground;
 float front=exp(-pow(depth/.055,2.0));
 float receding=coastWave(qs,time-.8)-ground;
 float remnant=exp(-pow(receding/.06,2.0))*(1.0-smoothstep(.0,.11,-depth))*.38;
 float breaker=pow(max(0.0,sin(qs.x*1.15-time*6.28318530718/uCoastSurf.y+qs.y*.015)),9.0)*(1.0-smoothstep(.05,.65,depth));
 vec2 foamUv=world.xz*9.0-vec2(time*.24,time*.08);
 float cells=coastNoise(foamUv),fine=coastNoise(foamUv*3.2);
 float grain=smoothstep(.26,.68,cells*.65+fine*.35);
 float wetWindow=smoothstep(-.08,.015,depth);
 return clamp((front*.95+remnant+breaker*.25*wetWindow)*grain*uCoastSurf.z,0.0,.9)*coastMask(qs)*smoothstep(-18.0,-2.0,qs.x)*(1.0-smoothstep(4.0,7.0,qs.x));
}
float coastFoam(vec2 qs,vec3 world,float time){return coastFoamAtHeight(qs,world,time,coastHeight(qs));}
`;
export function createCoastUniforms() {
 return {uCoastLandforms:{value:new THREE.Vector4()},uCoastShape:{value:new THREE.Vector4()},uCoastDimensions:{value:new THREE.Vector4()},uCoastDetail:{value:new THREE.Vector4()},uCoastSurface:{value:new THREE.Vector4()},uCoastSurf:{value:new THREE.Vector4()},uCoastGeology:{value:new THREE.Vector4()},uCoastSwell:{value:new THREE.Vector4(0,-1,1,0)}};
}
export function syncCoastUniforms(uniforms,p) {
 uniforms.uCoastShape.value.set(p.terrainEnabled?1:0,p.terrainBearing*Math.PI/180,p.terrainOffset,p.terrainSeed);
 uniforms.uCoastDimensions.value.set(p.terrainLength,p.terrainLandWidth,p.terrainBeachWidth,p.terrainCliffHeight);
 uniforms.uCoastDetail.value.set(p.terrainCliffSlope,p.terrainCurve,p.terrainCapeDepth,p.terrainCapePosition);
 uniforms.uCoastSurface.value.set(p.terrainCapeWidth,p.waterDepth??p.waterDepthMeters??1.25,p.terrainRelief,p.terrainWetBand);
 uniforms.uCoastLandforms.value.set(p.terrainFeatureScale,p.terrainLandslides,p.terrainPaths,p.terrainPathWidth);
 const weather=coastWeather(p);
 uniforms.uCoastSurf.value.set(weather.height,weather.period,weather.foam,p.terrainShells);
 uniforms.uCoastGeology.value.set(p.terrainErosion,p.terrainSoil,p.terrainWeathering,p.terrainBloom);
 const bearing=(p.terrainWindBearing??0)*Math.PI/180;
 uniforms.uCoastSwell.value.set(Math.sin(bearing),-Math.cos(bearing),weather.swell,p.terrainStorm??0);
}
