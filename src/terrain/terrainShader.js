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
// The surf, in one function the CPU mirrors (terrainModel.js sampleCoastWave):
// keep the two identical. A train is never one straight wave: three
// incommensurate sines drift its phase and height along the shore, so crests
// and run-up scallop. Shoaling steepens the front toward the break, then the
// sheet runs up the beach and dies four metres in.
float coastWaveJitter(float s,float time){return sin(s*.041+time*.03)*.55+sin(s*.017-time*.021+1.7)*.35+sin(s*.093+time*.05+.6)*.2;}
float coastWavePhase(vec2 qs,float time){return qs.x*1.15-time*6.28318530718/uCoastSurf.y+qs.y*.015+coastWaveJitter(qs.y,time)*1.3;}
float coastWave(vec2 qs,float time) {
 float q=qs.x,s=qs.y,phase=coastWavePhase(qs,time);
 float amp=.78+.22*sin(s*.071+time*.23)+.18*sin(s*.029-time*.017+2.4)+(.12*sin(s*.31+time*.4)+.08*sin(s*.53-time*.27))*smoothstep(-8.0,0.0,q);
 float skew=smoothstep(-18.0,-4.0,q);
 float w=sin(phase)+.3*skew*sin(2.0*phase-1.25);
 float shoal=1.0+.55*smoothstep(-14.0,-4.0,q);
 return w*uCoastSurf.x*amp*shoal*(1.0-smoothstep(0.0,4.5,q))*smoothstep(-32.0,-22.0,q)*coastMask(qs);
}
float coastNoise(vec2 p) {
 vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 vec4 h=fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1,0),vec2(127.1,311.7)),dot(i+vec2(0,1),vec2(127.1,311.7)),dot(i+vec2(1,1),vec2(127.1,311.7))))*43758.5453);
 return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
}
float coastWetnessAtHeight(vec2 qs,float time,float ground) {
 float recent=max(coastWave(qs,time),max(coastWave(qs,time-.7)*.85,coastWave(qs,time-1.4)*.65));
 float margin=max(.04,uCoastSurface.w*.035),level=max(margin,recent);
 // Drying is gradual and ragged, not a contour line.
 float rag=(coastNoise(qs*vec2(.9,.35)+vec2(3.1,0.0))-.5)*.05;
 return (1.0-smoothstep(level+rag,level+rag+.1,ground))*coastMask(qs);
}
float coastWetness(vec2 qs,float time){return coastWetnessAtHeight(qs,time,coastHeight(qs));}
vec3 coastBloomTint(vec3 color,vec2 qs,float time) {
 // Drifting cyanobacterial patches, mixed into the body of the water.
 float bloomPatch=smoothstep(.27,.76,coastNoise(qs*.028+vec2(time*.004,-time*.002)));
 float bloom=uCoastGeology.w*bloomPatch*uCoastShape.x;
 return mix(color,color*vec3(.64,1.12,.56)+vec3(.003,.008,.001),bloom*.65);
}
// Foam is three things the photographs show: the white water of the broken
// crest riding the sheet up the beach, a thin lace where the sheet thins to
// nothing, and the sparse bubbles it leaves on the wet sand. The texture is a
// sheet with holes, never a cut-out.
float coastFoamAtHeight(vec2 qs,vec3 world,float time,float ground) {
 float q=qs.x,depth=coastWave(qs,time)-ground;
 // A narrow crest line that peaks where the wave breaks and thins up the swash.
 float crest=pow(max(0.0,sin(coastWavePhase(qs,time)-.4)),7.0);
 float breakZone=smoothstep(-10.0,-5.0,q)*exp(-max(q+5.0,0.0)/3.5);
 float whitewater=crest*breakZone*smoothstep(-.03,.06,depth);
 // Streaks with clear water between them, drifting shoreward with the sheet.
 vec2 flow=world.xz*1.6+coastLand()*time*.35;
 float sheet=smoothstep(.2,.8,coastNoise(flow))*mix(.6,1.0,coastNoise(world.xz*7.0-vec2(time*.5,time*.2)));
 float lace=exp(-pow(depth/.035,2.0))*mix(.35,1.0,coastNoise(world.xz*11.0+vec2(time*.4,0.0)));
 float receding=coastWave(qs,time-.8)-ground;
 float bubbles=exp(-pow(receding/.07,2.0))*(1.0-smoothstep(.0,.1,-depth))*smoothstep(.62,.9,coastNoise(world.xz*13.0+vec2(0.0,time*.15)))*.5;
 float foam=whitewater*sheet*.7+lace*.75+bubbles;
 return clamp(foam*uCoastSurf.z,0.0,.8)*coastMask(qs)*smoothstep(-18.0,-2.0,q)*(1.0-smoothstep(4.0,7.0,q));
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
