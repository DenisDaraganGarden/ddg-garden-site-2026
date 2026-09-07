import * as THREE from 'three';

const COMMON = /* glsl */`
varying vec3 vRemPoint;
varying float vRemHeight;
varying vec2 vRemUv;
uniform float remCorrosion;
uniform float remAlgae;
uniform float remWaterline;
uniform float remWetness;
float remHash(vec3 p) { p=fract(p*.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
float remNoise(vec3 p) {
  vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(remHash(i),remHash(i+vec3(1,0,0)),f.x),mix(remHash(i+vec3(0,1,0)),remHash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(remHash(i+vec3(0,0,1)),remHash(i+vec3(1,0,1)),f.x),mix(remHash(i+vec3(0,1,1)),remHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float remFiltered(vec3 p) {
  float footprint=max(length(dFdx(p)),length(dFdy(p)));
  return mix(remNoise(p),.5,smoothstep(.4,1.4,footprint));
}
vec3 remBump(vec3 n,float height) {
  vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition),r1=cross(sy,n),r2=cross(n,sx);
  float det=dot(sx,r1);
  return normalize(abs(det)*n-sign(det)*(dFdx(height)*r1+dFdy(height)*r2));
}
`;

// Both recipes extend the standard material, retaining the project's light,
// depth, fog and reflection paths. All detail has a physical metre scale.
export function createRemainsMaterials(woodMaps = []) {
  const uniforms = { remCorrosion: { value: .86 }, remAlgae: { value: .78 }, remWaterline: { value: .38 }, remWetness: { value: .3 } };
  const metal = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: .6, roughness: .75 });
  const wood = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0, roughness: .96, map: woodMaps[0] ?? null });
  for (const [material, timber] of [[metal, false], [wood, true]]) {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRemPoint; varying float vRemHeight; varying vec2 vRemUv;');
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`
        #include <begin_vertex>
        vRemPoint=position; vRemUv=uv;
        vec4 remWorld=vec4(position,1.0);
        #ifdef USE_INSTANCING
          remWorld=instanceMatrix*remWorld;
        #endif
        vRemHeight=(modelMatrix*remWorld).y;
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + COMMON);
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', timber ? /* glsl */`
        #ifdef USE_MAP
          // The existing bark image only supplies irregular fibre at 55 cm ×
          // 1.1 m; rot, splits, wet wood and algae are independently shaded.
          vec3 fibreSample=texture2D(map,vRemUv/vec2(.55,1.1)).rgb;
          float fibreImage=dot(fibreSample,vec3(.2126,.7152,.0722));
          diffuseColor.rgb*=.72+fibreImage*.9;
        #endif
      ` : '#include <map_fragment>');
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        vec3 rp=vRemPoint;
        float patch=remNoise(rp*4.7), medium=remFiltered(rp*37.0), grain=remFiltered(rp*210.0);
        float waterEdge=remWaterline+(remNoise(rp*vec3(5.0,2.0,5.0))-.5)*.16;
        float submerged=1.0-smoothstep(waterEdge-.12,waterEdge+.04,vRemHeight);
        float damp=clamp(submerged*.86+remWetness*.35,0.0,1.0);
        float algae=remAlgae*submerged*smoothstep(.23,.65,remNoise(rp*vec3(10.0,3.0,10.0)));
        float relief=0.0;
      ` + (timber ? /* glsl */`
        vec2 fibreP=vRemUv;
        float warp=(remNoise(vec3(fibreP*vec2(4.0,1.5),1.0))-.5)*.7;
        float ridges=remFiltered(vec3(fibreP*vec2(130.0,2.4)+vec2(warp,0),2.0));
        float splits=pow(1.0-ridges,5.0)*5.0;
        float threads=remFiltered(vec3(fibreP*vec2(650.0,9.0),6.0));
        vec3 dry=mix(vec3(.15,.113,.078),vec3(.39,.36,.29),smoothstep(.22,.8,patch));
        dry*=.74+ridges*.43+threads*.18;
        dry*=1.0-clamp(splits*.75,0.0,.65);
        diffuseColor.rgb*=dry*mix(vec3(1),vec3(.38,.36,.29),damp);
        relief=(ridges-.5)*.004+(threads-.5)*.0008-splits*.003;
      ` : /* glsl */`
        float oxidized=smoothstep(1.02-remCorrosion,1.29-remCorrosion,patch*.68+medium*.32);
        float crust=remFiltered(rp*82.0);
        vec3 oxide=mix(vec3(.10,.037,.016),vec3(.43,.145,.04),smoothstep(.22,.78,medium));
        oxide=mix(oxide,vec3(.045,.029,.018),smoothstep(.60,.82,patch)*.73);
        oxide*=.76+grain*.48;
        vec3 iron=vec3(.085,.085,.078)*(.65+crust*.55);
        diffuseColor.rgb*=mix(iron,oxide,oxidized)*(1.0-damp*.27);
        relief=(medium-.5)*.0016+(crust-.5)*.0018+(grain-.5)*.00075;
      `) + /* glsl */`
        vec3 weed=mix(vec3(.055,.07,.021),vec3(.15,.19,.055),grain);
        diffuseColor.rgb=mix(diffuseColor.rgb,weed,algae*.88);
        relief+=(grain-.5)*algae*.0018;
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=clamp(' + (timber ? '.97-damp*.31-algae*.17' : '.53+oxidized*.43-damp*.22-algae*.12') + ',.32,1.0);');
      if (!timber) shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=.86*(1.0-oxidized)*(1.0-algae);');
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal=remBump(normal,relief);');
    };
    material.customProgramCacheKey = () => `ddg-shore-remains-${timber ? 'timber' : 'iron'}-1`;
  }
  return { metal, wood, uniforms,
    update({ corrosion = .86, algae = .78, waterline = .38, wetness = .3, wireframe = false } = {}) {
      uniforms.remCorrosion.value = corrosion; uniforms.remAlgae.value = algae; uniforms.remWaterline.value = waterline; uniforms.remWetness.value = wetness;
      metal.wireframe = wireframe; wood.wireframe = wireframe;
    },
    dispose() { metal.dispose(); wood.dispose(); },
  };
}
