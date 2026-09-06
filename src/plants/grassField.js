import * as THREE from 'three';
import {coastWeather} from '../terrain/settings.js';

// The far level of the grass: no geometry, the terrain paints the steppe in
// its own shader. Denis's turf tiles are two layers of the terrain arrays;
// where the plateau is suitable the field blends them in, and the wind runs
// bands across it at sixty percent of its speed. Near the camera the field
// only lays turf under the tufts; from `blend` metres on it is the meadow.
export const GRASS_FIELD_GLSL=/* glsl */`
uniform vec4 uGrassField;      // coverage, cluster contrast, wave strength, sheen
uniform vec4 uGrassFieldScale; // band scale (m), blend distance (m), root darkening, seed
uniform vec3 uGrassFieldFresh;uniform vec3 uGrassFieldDry;
uniform vec4 uGrassWind;       // downwind xz, speed, storm
float grassFieldWeight(vec2 qs,vec4 profile,vec3 n,float path,vec2 world,float dist){
 float plateau=smoothstep(profile.y+1.0,profile.y+6.0,qs.x)*smoothstep(.86,.95,abs(n.y));
 float clusters=mix(1.0,ecologyPatch(world,32.0,uGrassFieldScale.w),uGrassField.y);
 float fine=mix(1.0,coastNoise(world*.11+vec2(3.0,uGrassFieldScale.w)),uGrassField.y*.6);
 float reach=mix(.35,1.0,smoothstep(uGrassFieldScale.y*.4,uGrassFieldScale.y,dist));
 return clamp(uGrassField.x*plateau*clusters*fine*reach*(1.0-path)*coastMask(qs),0.0,1.0);
}
// Gust bands: value noise stretched across the wind, carried downwind, with a
// finer ripple and a slow pulse, so a wave rolls over the steppe rather than
// the grass trembling in place.
float grassGust(vec2 world,float time){
 vec2 dir=uGrassWind.xy;vec2 perp=vec2(-dir.y,dir.x);float speed=uGrassWind.z;
 float along=dot(world,dir)-time*(.6*speed+.4),across=dot(world,perp);
 float scale=max(3.0,uGrassFieldScale.x);
 float bands=coastNoise(vec2(along/scale,across/(scale*3.5)));
 float ripple=coastNoise(vec2(along/(scale*.22)+7.0,across/(scale*.9)));
 float pulse=.5+.5*sin(along/(scale*1.7)+sin(along/(scale*5.0))*1.3);
 float g=bands*.6+ripple*.25+pulse*.15;
 return smoothstep(.35,.85,g)*min(1.0,(speed+uGrassWind.w*8.0)/6.0);
}
`;
export function grassFieldUniforms(){
 return {uGrassField:{value:new THREE.Vector4(.85,.6,.6,.35)},uGrassFieldScale:{value:new THREE.Vector4(9,60,.5,23)},uGrassFieldFresh:{value:new THREE.Color('#ffffff')},uGrassFieldDry:{value:new THREE.Color('#ffffff')},uGrassWind:{value:new THREE.Vector4(0,-1,4,0)}};
}
export function syncGrassFieldUniforms(uniforms,s,p){
 const on=s.grassEnabled===false?0:1;
 uniforms.uGrassField.value.set(on*(s.grassFieldCoverage??.85),s.grassFieldContrast??.6,s.grassFieldWaves??.6,s.grassFieldSheen??.35);
 uniforms.uGrassFieldScale.value.set(s.grassFieldScale??9,s.grassFieldBlend??60,s.grassFieldHeight??.5,s.grassSeed??23);
 uniforms.uGrassFieldFresh.value.set(s.grassFieldFresh??'#ffffff');uniforms.uGrassFieldDry.value.set(s.grassFieldDry??'#ffffff');
 const bearing=(p.terrainWindBearing??0)*Math.PI/180,weather=coastWeather(p);
 uniforms.uGrassWind.value.set(Math.sin(bearing),-Math.cos(bearing),weather.wind,p.terrainStorm??0);
}
