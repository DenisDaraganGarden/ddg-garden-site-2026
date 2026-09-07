import * as THREE from 'three';

// Standard PBR all the way through the common lighting / shadow / fog path.
// Only albedo and millimetre surface relief are procedural. No time uniform.
const COMMON = /* glsl */`
varying vec2 vWoodUv;
uniform float uWoodBleach;
uniform float uWoodGrain;
uniform float uWoodWetness;
uniform float uWoodBark;
float woodHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float woodNoise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(woodHash(i),woodHash(i+vec2(1,0)),f.x),mix(woodHash(i+vec2(0,1)),woodHash(i+vec2(1,1)),f.x),f.y);
}
float woodRelief(vec2 p) {
  float a=p.x*6.2831853;
  float drift=sin(p.y*.73)*.7+sin(p.y*2.13)*.16;
  float broad=sin(a*7.0+drift)*.22+sin(a*13.0+drift*.7)*.16;
  float fissure=pow(max(0.0,sin(a*19.0+drift+sin(a*3.0)*.55)),24.0);
  float fine=sin(a*67.0+drift*2.0+sin(p.y*1.7)*.4);
  float aa=1.0-smoothstep(.1,1.4,fwidth(p.x)*67.0*6.2831853);
  float broken=woodNoise(vec2(sin(a)*4.0,p.y*.64));
  return broad-fissure*(.25+broken*1.4)+fine*.09*aa;
}
float woodBarkMask(vec2 p) {
  float n=woodNoise(vec2(sin(p.x*6.2831853)*2.0,p.y*.62));
  return smoothstep(1.0-uWoodBark*.95,1.12-uWoodBark*.95,n);
}
vec3 woodBump(vec3 n,float height) {
  vec3 sx=dFdx(-vViewPosition), sy=dFdy(-vViewPosition);
  vec3 r1=cross(sy,n), r2=cross(n,sx);
  float det=dot(sx,r1);
  vec3 grad=sign(det)*(dFdx(height)*r1+dFdy(height)*r2);
  return normalize(abs(det)*n-grad);
}
`;

export function createDeadwoodMaterials(maps = []) {
  const uniforms = { uWoodBleach: { value: .78 }, uWoodGrain: { value: .65 }, uWoodWetness: { value: 0 }, uWoodBark: { value: .28 } };
  const wood = new THREE.MeshStandardMaterial({ color: '#79776f', roughness: .94, vertexColors: true,
    map: maps[0] ?? null, normalMap: maps[1] ?? null, normalScale: new THREE.Vector2(.55, .55) });
  const endGrain = new THREE.MeshStandardMaterial({ color: '#847967', roughness: .98, vertexColors: true });
  for (const [material, isEnd] of [[wood, false], [endGrain, true]]) {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWoodUv;');
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvWoodUv=uv;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + COMMON);
      if (!isEnd) shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', /* glsl */`
        #ifdef USE_MAP
        vec3 barkSample=texture2D(map,vMapUv).rgb;
        float barkLuma=dot(barkSample,vec3(.2126,.7152,.0722));
        float retainedBark=woodBarkMask(vWoodUv);
        // Denis's oleaster tile remains in patches; a faint compressed fibre
        // texture also breaks the perfect procedural lines on stripped wood.
        diffuseColor.rgb*=mix(vec3(.84+barkLuma*.72),barkSample*2.0,retainedBark*.78);
        #endif
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', isEnd ? /* glsl */`
        #include <color_fragment>
        vec2 p=vWoodUv;
        float angle=atan(p.y,p.x), radius=length(p);
        float ring=sin(radius*790.0+sin(angle*3.0)*.9+sin(angle*7.0)*.3);
        float ringAA=1.0-smoothstep(.4,2.5,fwidth(radius)*790.0);
        float splits=pow(max(0.0,sin(angle*7.0+sin(radius*9.0)*.25)),70.0)*smoothstep(.015,.08,radius);
        float fibre=woodNoise(p*vec2(190.0,170.0));
        diffuseColor.rgb=mix(diffuseColor.rgb*vec3(.87,.8,.7),vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)))*1.04,uWoodBleach*.7);
        diffuseColor.rgb*=.9+ring*.055*ringAA-splits*.4+fibre*.13;
        diffuseColor.rgb*=1.0-uWoodWetness*.38;
      ` : /* glsl */`
        #include <color_fragment>
        vec2 p=vWoodUv;
        float relief=woodRelief(p);
        float weatherPatch=woodNoise(vec2(sin(p.x*6.2831853)*1.7,p.y*.43));
        float silver=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        diffuseColor.rgb=mix(diffuseColor.rgb*vec3(.77,.68,.56),vec3(silver)*vec3(1.02,1.025,1.0),uWoodBleach);
        diffuseColor.rgb*=.87+weatherPatch*.22+relief*uWoodGrain*.24;
        diffuseColor.rgb*=1.0-uWoodWetness*.38;
      `);
      if (!isEnd) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>',
        THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale*(.12+woodBarkMask(vWoodUv)*.88);') +
        '\nnormal=woodBump(normal,woodRelief(vWoodUv)*uWoodGrain*.0011);');
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', /* glsl */`
        #include <roughnessmap_fragment>
        roughnessFactor=clamp(roughnessFactor-uWoodWetness*.36,.4,1.0);
      `);
    };
    material.customProgramCacheKey = () => `ddg-deadwood-${isEnd ? 'end' : 'side'}-1`;
  }
  return { wood, endGrain, uniforms,
    update({ bleach = .78, grain = .65, wetness = 0, bark = .28, wireframe = false } = {}) {
      uniforms.uWoodBleach.value = bleach; uniforms.uWoodGrain.value = grain; uniforms.uWoodWetness.value = wetness;
      uniforms.uWoodBark.value = bark;
      wood.wireframe = wireframe; endGrain.wireframe = wireframe;
    },
    dispose() { wood.dispose(); endGrain.dispose(); },
  };
}
