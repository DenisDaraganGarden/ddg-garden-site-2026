import * as THREE from 'three';

export const ECOLOGY_DEFAULTS = Object.freeze({fieldSeed:23,patchScale:7,patchContrast:.8,crownVariation:.48,crownScale:.8,gustStrength:.7,lodging:.35});
const clamp=x=>Math.max(0,Math.min(1,x));
// Smooth metre-space field. No random value per instance or view-dependent UVs.
export function ecologyPatch(x,z,scale,seed=23){
 const a=x/Math.max(.1,scale),b=z/Math.max(.1,scale),phase=seed*.713;
 const warp=Math.sin(a*1.7-b*1.3+phase)*.7;
 return .5+.25*Math.sin(a*2.1+b*.9+warp+phase)+.17*Math.sin(b*2.7-a*.6+phase*1.7)+.08*Math.sin(a*4.3+b*3.2-phase*.8);
}
export function plantDrynessAt(x,y,z,settings={},habitat=.5){
 const s={...ECOLOGY_DEFAULTS,dryness:.22,...settings};
 const colony=ecologyPatch(x,z,s.patchScale,s.fieldSeed);
 const crown=ecologyPatch(x+y*.47,z-y*.31,s.crownScale,s.fieldSeed+17);
 // Endpoints still mean fully fresh / fully dry regardless of variation.
 const envelope=4*s.dryness*(1-s.dryness);
 return clamp(s.dryness+envelope*((colony-.5)*s.patchContrast*1.8+(crown-.5)*s.crownVariation+(habitat-.5)*.24));
}
export const PLANT_FIELD_GLSL=/* glsl */`
uniform vec4 uPlantEcology;
uniform vec4 uPlantField;
float ecologyPatch(vec2 p,float scale,float seed){
 vec2 q=p/max(.1,scale);float phase=seed*.713;
 float warp=sin(q.x*1.7-q.y*1.3+phase)*.7;
 return .5+.25*sin(q.x*2.1+q.y*.9+warp+phase)+.17*sin(q.y*2.7-q.x*.6+phase*1.7)+.08*sin(q.x*4.3+q.y*3.2-phase*.8);
}
float plantDrynessAt(vec3 p,float habitat){
 float colony=ecologyPatch(p.xz,uPlantEcology.y,uPlantField.x);
 float crown=ecologyPatch(p.xz+p.y*vec2(.47,-.31),uPlantField.y,uPlantField.x+17.0);
 float d=uPlantEcology.x;
 return clamp(d+4.0*d*(1.0-d)*((colony-.5)*uPlantEcology.z*1.8+(crown-.5)*uPlantEcology.w+(habitat-.5)*.24),0.0,1.0);
}
vec3 plantFoliageColor(vec3 albedo,vec3 restWorld,float habitat){
 float dry=plantDrynessAt(restWorld,habitat);
 float luminance=dot(albedo,vec3(.2126,.7152,.0722));
 vec3 fresh=albedo*vec3(.84,1.06,.76);
 vec3 straw=luminance*vec3(1.38,1.08,.57);
 return mix(fresh,straw,smoothstep(.12,.92,dry));
}
`;
export function ecologyUniforms(){return {uPlantEcology:{value:new THREE.Vector4(.22,7,.8,.48)},uPlantField:{value:new THREE.Vector4(23,.8,.7,.35)}};}
export function updateEcologyUniforms(uniforms,settings){
 const s={...ECOLOGY_DEFAULTS,dryness:.22,...settings};
 uniforms.uPlantEcology.value.set(s.dryness,s.patchScale,s.patchContrast,s.crownVariation);
 uniforms.uPlantField.value.set(s.fieldSeed,s.crownScale,s.gustStrength,s.lodging);
}

// Travelling gusts and a spatially coherent prevailing lean. Both are shared
// by bark, leaves, depth pass and projected LOD; the root stays exactly fixed.
export const PLANT_BEND_GLSL=/* glsl */`
uniform float uPlantTime;
uniform vec2 uPlantWind;
${PLANT_FIELD_GLSL}
float plantBend(vec2 root){
 float speed=length(uPlantWind);vec2 direction=uPlantWind/max(speed,.001);
 float travel=dot(root,direction)*.23-uPlantTime*(.6+speed*.09);
 float front=pow(.5+.5*sin(travel+sin(travel*.37)*.8),3.0);
 float pulse=.5+.5*sin(travel*1.91+root.x*.13-root.y*.07);
 float gust=.3+uPlantField.z*(front*.9+pulse*.24);
 float lay=ecologyPatch(root,uPlantEcology.y*.7,uPlantField.x+41.0);
 return (.009*gust+.032*uPlantField.w*smoothstep(.25,.8,lay))*min(1.0,14.0/max(speed,.001));
}
`;
