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
// x: shelf slope past the near-shore knee (m per 100 m), y: weed meadows, z: silt, w: mussel beds.
uniform vec4 uCoastShelf;
// x: scale of the bed patches (m), y: ripple marks on the sand.
uniform vec4 uCoastBed;
// x: talus run out of the bluff onto the beach, y: beds and rain rills of the face, z: width of the turf rim of the crest (m), w: moist islands.
uniform vec4 uCoastSoil;
uniform vec3 uCoastRimTint;uniform vec3 uCoastOasisTint;
// x: wrack thrown up along the run-up line.
uniform vec4 uCoastWrack;
// x: loose sand of the dry beach.
uniform vec4 uCoastSand;
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
// The shelf keeps deepening past the knee of the near-shore curve, so the sand
// fades into the water before the strips end at -96 m instead of stopping on
// one drawn line. The CPU mirrors this in terrainModel.js coastShelfDrop.
float coastShelfDrop(vec2 qs) {
 float ends=1.0-smoothstep(uCoastDimensions.x*.5-64.0,uCoastDimensions.x*.5,abs(qs.y));
 return -uCoastShelf.x*.01*max(min(-qs.x,96.0)-24.0,0.0)*ends*uCoastShape.x;
}
float coastHeight(vec2 qs) {
 float q=qs.x,s=qs.y,seed=uCoastShape.w*.137;
 float shelf=-uCoastSurface.y*(1.0-exp(min(q,0.0)/12.0));
 if(q<=0.0)return mix(-uCoastSurface.y,shelf,coastMask(qs))+coastShelfDrop(qs);
 vec3 f=coastLandforms(s);vec4 profile=coastProfile(s,f);
 float foot=profile.x,top=profile.y,bank=profile.z,width=top-foot;
 float t=smoothstep(foot,top,q);
 float bench=.4*smoothstep(foot,foot+width*.58,q)+.6*smoothstep(foot+width*.76,top,q);
 float scarp=.18*smoothstep(foot,foot+width*.6,q)+.82*smoothstep(foot+width*.5,top,q);
 float cliff=mix(mix(scarp,bench,f.x),t,f.z);
 float recovery=smoothstep(top,top+max(6.0,bank*3.0),q);
 float slump=(f.x*.16+f.y*.58)*(1.0-recovery);
 float beach=min(q,profile.w)*.035;
 float toe=((q-foot)/max(width,1.0)-.12)/.26;
 float talus=f.x*bank*.2*uCoastSoil.x*exp(-toe*toe)*(1.0-f.z)*smoothstep(1.0,4.0,q);
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
// The envelope: how high the water can climb at this point of the beach.
float coastWaveGain(vec2 qs,float time) {
 float q=qs.x,s=qs.y;
 float amp=.78+.22*sin(s*.071+time*.23)+.18*sin(s*.029-time*.017+2.4)+(.12*sin(s*.31+time*.4)+.08*sin(s*.53-time*.27))*smoothstep(-8.0,0.0,q);
 float shoal=1.0+.55*smoothstep(-14.0,-4.0,q);
 return uCoastSurf.x*amp*shoal*(1.0-smoothstep(0.0,4.5,q))*smoothstep(-32.0,-22.0,q)*coastMask(qs);
}
float coastWave(vec2 qs,float time) {
 float q=qs.x,phase=coastWavePhase(qs,time);
 float skew=smoothstep(-18.0,-4.0,q);
 float w=sin(phase)+.3*skew*sin(2.0*phase-1.25);
 return w*coastWaveGain(qs,time);
}
float coastNoise(vec2 p) {
 vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 vec4 h=fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1,0),vec2(127.1,311.7)),dot(i+vec2(0,1),vec2(127.1,311.7)),dot(i+vec2(1,1),vec2(127.1,311.7))))*43758.5453);
 return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
}
// Sand stays dark for minutes, so the wet band follows the envelope of the
// run-up, not the wave of this second. The CPU mirrors this in
// terrainModel.js sampleCoastWetness: keep the two identical.
float coastWetnessAtHeight(vec2 qs,float time,float ground) {
 float margin=max(.04,uCoastSurface.w*.035),level=max(margin,coastWaveGain(qs,time));
 // Drying is gradual and ragged, not a contour line.
 float rag=(coastNoise(qs*vec2(.9,.35)+vec2(3.1,0.0))-.5)*.05;
 return (1.0-smoothstep(level+rag,level+rag+.1,ground))*coastMask(qs);
}
float coastWetness(vec2 qs,float time){return coastWetnessAtHeight(qs,time,coastHeight(qs));}
// The plants' ecology patch (plantEcology.js), repeated here because the water
// shaders carry the coast chunk without the plant chunk: a smooth metre-space
// field, 0..1, with the same CPU twin in terrainModel.js.
float coastPatch(vec2 p,float scale,float seed) {
 vec2 q=p/max(scale,1.0);float phase=seed*.713;
 float warp=sin(q.x*1.7-q.y*1.3+phase)*.7;
 return .5+.25*sin(q.x*2.1+q.y*.9+warp+phase)+.17*sin(q.y*2.7-q.x*.6+phase*1.7)+.08*sin(q.x*4.3+q.y*3.2-phase*.8);
}
// What lies on the sand of the shelf, by depth: the surf keeps the first half
// metre bare, eelgrass and weed take the middle of the shelf, silt settles in
// the calm deeper water, mussel banks sit as small dark islands. The patches
// are stretched along the shore the way the currents lay them. depth: water
// over the bed in metres; the zones read it as a fraction of the authored
// depth, so the pattern spans the shelf whatever the depth. x: weed, y: silt,
// z: mussels. The CPU twin is terrainModel.js sampleSeabedCover; the terrain
// material adds ragged edges and streaks the twin leaves out.
vec3 coastBedCover(vec2 qs,float depth) {
 float f=depth/max(uCoastSurface.y,.1),seed=uCoastShape.w*.37,scale=max(uCoastBed.x,4.0);
 vec2 p=vec2(qs.y,qs.x*2.2);
 float meadow=coastPatch(p,scale,seed+3.0);
 float calm=coastPatch(p+vec2(190.0,70.0),scale*1.9,seed+11.0);
 float bank=coastPatch(p*vec2(1.0,.6)+vec2(41.0,0.0),scale*.45,seed+27.0);
 float wash=smoothstep(.25,.6,depth);
 float weed=uCoastShelf.y*wash*smoothstep(.12,.45,f)*(1.0-smoothstep(.9,1.3,f))*smoothstep(.5,.75,meadow);
 float silt=uCoastShelf.z*smoothstep(.45,1.0,f)*smoothstep(.45,.7,calm);
 float mussels=uCoastShelf.w*wash*smoothstep(.3,.8,f)*smoothstep(.62,.8,bank);
 return clamp(vec3(weed,silt,mussels),0.0,1.0)*coastMask(qs);
}
// The ground at the foot of the bluff. x talus: the tongue of loose loam run
// out of the bluff onto the beach, lobed along the shore. y seep: ground
// moisture where the bluff drains - its foot, the toes of slides, the mouths
// of ravines across the beach. The CPU twin is terrainModel.js
// sampleCoastSoil: keep the two identical.
vec2 coastSoil(vec2 qs,vec3 f,vec4 profile) {
 float q=qs.x,s=qs.y,foot=profile.x,width=profile.y-profile.x,bank=profile.z,seed=uCoastShape.w*.37,amount=uCoastSoil.x;
 float reach=(1.2+bank*(.3+f.x*.7))*(.4+amount);
 float lobes=coastPatch(vec2(s,(q-foot)*1.4),3.5+f.x*5.0,seed+53.0);
 float run=reach*mix(.25,1.35,lobes),d=foot-q;
 float talus=(1.0-smoothstep(run*.4,run,d))*(1.0-smoothstep(foot+width*.3,foot+width*.5,q))*min(1.0,amount*1.6)*(.7+.3*f.x);
 float spots=mix(.5,1.0,coastPatch(vec2(s+77.0,q*2.0),5.0,seed+41.0));
 float footSeep=smoothstep(foot-1.5-reach*.3,foot-.2,q)*(1.0-smoothstep(foot+.5+width*.15,foot+1.5+width*.3,q))*(.3+.7*max(f.x,f.y));
 float mouth=f.y*.6*smoothstep(-2.0,0.0,q)*(1.0-smoothstep(profile.w*.8,profile.w*1.2,q));
 return clamp(vec2(talus,max(footSeep,mouth)*spots),0.0,1.0)*coastMask(qs);
}
// The summer bloom, 0..1 times the slider: giant masses of green water that
// drift downwind, smaller patches inside them, thicker over the meadows that
// feed it. depth: water over the bed (a large number where there is no bed).
float coastBloom(vec2 qs,float time,float depth) {
 vec2 drift=vec2(dot(uCoastSwell.xy,coastLand()),dot(uCoastSwell.xy,coastAlong()))*time*.04;
 float masses=smoothstep(.32,.7,coastNoise(qs*.011+drift+vec2(3.0,uCoastShape.w*.01)));
 float patches=smoothstep(.27,.76,coastNoise(qs*.028+drift*1.5+vec2(uCoastShape.w*.02,0.0)));
 float meadows=coastBedCover(qs,depth).x;
 return uCoastGeology.w*uCoastShape.x*clamp(masses*.6+patches*.5+meadows*.35,0.0,1.0);
}
// Cyanobacteria in the body of the water: green-yellow, mixed in by the amount.
vec3 coastBloomColor(vec3 color,float bloom){return mix(color,color*vec3(.64,1.12,.56)+vec3(.003,.008,.001),bloom*.65);}
vec3 coastBloomTint(vec3 color,vec2 qs,float time){return coastBloomColor(color,coastBloom(qs,time,1e3));}
// The swash, with no history buffer. At one point of the beach the wave is
// gain*w(phase), and the phase falls at 2*pi/T per second; a point at height
// ground is covered while w(phase) > ground/gain. So the moment the water last
// left it is analytic - one Newton step on the skewed wave from the arcsine
// guess - and every device computes the same seconds since, the same run-up
// line, the same edge. depth: water over the point now (metres, negative on
// dry sand). reach: ground/gain, 1 at the highest point the water climbs.
// since: seconds since the water left. falling: 1 while the level drops.
struct CoastSwash{float depth;float reach;float since;float falling;};
CoastSwash coastSwashAt(vec2 qs,float time,float ground) {
 CoastSwash w;
 float phase=coastWavePhase(qs,time),gain=coastWaveGain(qs,time);
 float skew=.3*smoothstep(-18.0,-4.0,qs.x);
 w.depth=coastWave(qs,time)-ground;
 w.reach=ground/max(gain,1e-4);
 float r=clamp(w.reach,-1.0,1.0),a=asin(r);
 float f=sin(a)+skew*sin(2.0*a-1.25)-r,df=cos(a)+2.0*skew*cos(2.0*a-1.25);
 a-=f/max(df,.2);
 w.since=mod(a-phase,6.28318530718)*uCoastSurf.y/6.28318530718;
 w.falling=cos(phase)>0.0?1.0:0.0;
 return w;
}
// Tongues along the run-up edge: a few centimetres, drifting along the shore.
// The water surface cuts on this same edge, so lace and water agree.
float coastEdgeRag(vec2 qs,float time) {
 float tongues=(coastNoise(vec2(qs.y*.55,qs.x*1.6)+vec2(time*.12,0.0))-.5)*.05;
 float lobes=(coastNoise(vec2(qs.y*.16+time*.04,qs.x*.35+11.0))-.5)*.16;
 return (tongues+lobes)*coastMask(qs);
}
// Reticulated foam: the ridges of value noise are the bubble rafts, the
// troughs between them the holes. A sheet with holes, never a cut-out.
float coastLace(vec2 world,float scale,vec2 drift) {
 float n=coastNoise(world*scale+drift);
 float web=1.0-abs(2.0*n-1.0);
 float fine=1.0-abs(2.0*coastNoise(world*scale*3.1+drift*1.7+vec2(5.0,9.0))-1.0);
 return web*web*(.55+.45*fine*fine);
}
// x: foam on the water (edge lace, the bore's white water, backwash streaks).
// y: foam left on the sand, popping over the seconds, thickest on the run-up line.
vec2 coastFoamTerms(vec2 qs,vec3 world,float time,float ground) {
 float q=qs.x;
 CoastSwash w=coastSwashAt(qs,time,ground);
 float depth=w.depth-coastEdgeRag(qs,time);
 float laceFine=coastLace(world.xz,11.0,coastLand()*time*.25);
 float laceCoarse=coastLace(world.xz,3.2,coastLand()*time*.12+vec2(7.0,3.0));
 // The edge line widens with distance so it still reads as a line from afar.
 float edgeWidth=.04+distance(cameraPosition,world)*.0025;
 float edge=exp(-pow(max(depth,0.0)/edgeWidth,2.0))*smoothstep(-.012,.004,depth);
 float lace=edge*(.45+.55*laceFine)*(.6+.4*laceCoarse);
 // The broken crest: one white line where the wave breaks, a thinner trail of
 // it carried up the beach by the sheet, in streaks stretched across the sand.
 float crest=pow(max(0.0,sin(coastWavePhase(qs,time)-.45)),3.0);
 float breakZone=exp(-pow((q+5.0)/2.6,2.0));
 float carry=smoothstep(-5.0,.5,q)*(1.0-smoothstep(.5,4.0,q))*.35;
 float streaks=smoothstep(.35,.85,coastNoise(vec2(qs.y*2.6,qs.x*.55-time*.6)))*mix(.5,1.0,coastNoise(world.xz*9.0-vec2(time*.4,time*.2)));
 float sheet=crest*(breakZone+carry)*streaks*smoothstep(0.0,.05,depth)*(.3+.7*laceCoarse);
 // Backwash: while the level falls, thin foam is combed seaward.
 float backwash=w.falling*smoothstep(0.0,.08,depth)*(1.0-smoothstep(.08,.3,depth))*smoothstep(.55,.9,coastNoise(vec2(qs.y*3.0,qs.x*.8+time*.9)))*.5;
 // Residue on the sand: what the sheet leaves, popping as the seconds pass.
 // Right behind the edge the exact depth stands in for the first second.
 float dry=1.0-smoothstep(-.02,.005,depth);
 float justLeft=exp(min(depth,0.0)/.05);
 float popped=exp(-w.since/(9.0*(1.0+uCoastSwell.w*.6)));
 float runupLine=exp(-pow((w.reach-.94)/.07,2.0));
 float bubbles=smoothstep(.45,.9,laceFine);
 float residue=dry*max(justLeft,popped)*(.12+.88*runupLine)*(.04+.96*bubbles)*pow(laceCoarse,1.5)*(1.0-smoothstep(.96,1.06,w.reach));
 // Surf is patchy along the shore: some stretches foam, some run clear.
 float surfPatch=.6+.4*coastNoise(vec2(qs.y*.07+time*.01,qs.x*.05+3.0));
 float span=coastMask(qs)*smoothstep(-18.0,-2.0,q)*(1.0-smoothstep(5.0,9.0,q))*uCoastSurf.z*surfPatch;
 return clamp(vec2(lace+sheet*.9+backwash,residue*.9+lace*.5)*span,0.0,.9);
}
float coastFoamAtHeight(vec2 qs,vec3 world,float time,float ground){return coastFoamTerms(qs,world,time,ground).x;}
float coastSandFoamAtHeight(vec2 qs,vec3 world,float time,float ground){return coastFoamTerms(qs,world,time,ground).y;}
float coastFoam(vec2 qs,vec3 world,float time){return coastFoamAtHeight(qs,world,time,coastHeight(qs));}
`;
export function createCoastUniforms() {
 return {uCoastLandforms:{value:new THREE.Vector4()},uCoastShape:{value:new THREE.Vector4()},uCoastDimensions:{value:new THREE.Vector4()},uCoastDetail:{value:new THREE.Vector4()},uCoastSurface:{value:new THREE.Vector4()},uCoastSurf:{value:new THREE.Vector4()},uCoastGeology:{value:new THREE.Vector4()},uCoastSwell:{value:new THREE.Vector4(0,-1,1,0)},uCoastShelf:{value:new THREE.Vector4()},uCoastBed:{value:new THREE.Vector4(42,0,0,0)},uCoastSoil:{value:new THREE.Vector4(.6,.6,8,0)},uCoastRimTint:{value:new THREE.Color('#86ad55')},uCoastOasisTint:{value:new THREE.Color('#7f9c58')},uCoastWrack:{value:new THREE.Vector4(.6,0,0,0)},uCoastSand:{value:new THREE.Vector4(.6,0,0,0)}};
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
 uniforms.uCoastShelf?.value.set(p.terrainShelfSlope??0,p.terrainWeed??0,p.terrainSilt??0,p.terrainMussels??0);
 uniforms.uCoastBed?.value.set(p.terrainBedScale??42,p.terrainRipples??0,0,0);
 uniforms.uCoastSoil?.value.set(p.terrainTalus??.6,p.terrainStrata??.6,p.terrainRimWidth??8,p.terrainOasis??.6);
 uniforms.uCoastRimTint?.value.set(p.terrainRimColor??'#86ad55');uniforms.uCoastOasisTint?.value.set(p.terrainOasisColor??'#7f9c58');
 uniforms.uCoastWrack?.value.set(p.terrainWrack??.6,0,0,0);
 uniforms.uCoastSand?.value.set(p.terrainLooseSand??.6,0,0,0);
 if(uniforms.uTerrainGrade){uniforms.uTerrainGrade.value.set(p.terrainSaturation??1,p.terrainContrast??1,p.terrainBrightness??1,p.terrainGreen??1);uniforms.uTerrainGradeDry.value=p.terrainDry??1;}
 const bearing=(p.terrainWindBearing??0)*Math.PI/180;
 uniforms.uCoastSwell.value.set(Math.sin(bearing),-Math.cos(bearing),weather.swell,p.terrainStorm??0);
}
