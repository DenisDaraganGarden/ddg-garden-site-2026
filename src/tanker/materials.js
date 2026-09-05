import * as THREE from 'three';

function shipPaint(color, { metalness = 0.18, roughness = 0.66, weathered = false, procedural = true } = {}) {
  const material = new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const uniforms = {
    uTankerWear: { value: 0.28 },
    uTankerWetness: { value: 0.35 },
  };
  material.userData.tankerUniforms = uniforms;
  if (weathered && procedural) {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `varying vec3 vTankerPosition;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTankerPosition = position;');
      shader.fragmentShader = `
        uniform float uTankerWear;
        uniform float uTankerWetness;
        varying vec3 vTankerPosition;
        float tankerHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        ${shader.fragmentShader}`
        .replace('#include <color_fragment>', `
          #include <color_fragment>
          float streakSeed = tankerHash(floor(vTankerPosition.xz * 1.4));
          float streak = smoothstep(0.73, 0.99, streakSeed)
            * (0.4 + 0.6 * sin(vTankerPosition.y * 0.25 + streakSeed * 8.0));
          float plate = tankerHash(floor(vTankerPosition.xy / vec2(4.8, 2.0)));
          float tide = 1.0 - smoothstep(-0.3, 1.3, vTankerPosition.y);
          diffuseColor.rgb *= mix(1.0, 0.91 + plate * 0.14, uTankerWear);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.055, 0.018), streak * uTankerWear * 0.6);
          diffuseColor.rgb *= 1.0 - tide * uTankerWetness * 0.24;
        `)
        .replace('#include <roughnessmap_fragment>', `
          #include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor + streak * uTankerWear * 0.22
            - tide * uTankerWetness * 0.34, 0.18, 0.98);
        `);
    };
    material.customProgramCacheKey = () => 'ddg-tanker-paint-v1';
  }
  return material;
}

export function createTankerMaterials({ procedural = true } = {}) {
  const paint = (color, options) => shipPaint(color, { ...options, procedural });
  return {
    red: paint('#a62f23', { weathered: true }),
    underwater: paint('#382c29', { weathered: true, roughness: 0.78 }),
    deck: paint('#4c5650', { roughness: 0.8 }),
    white: paint('#e8e6d9', { weathered: true, metalness: 0.05, roughness: 0.52 }),
    glass: paint('#172b30', { metalness: 0.5, roughness: 0.19 }),
    graphite: paint('#303331', { metalness: 0.4, roughness: 0.65 }),
    metal: paint('#b8b9aa', { metalness: 0.6, roughness: 0.46 }),
    pipe: paint('#758477', { metalness: 0.4, roughness: 0.53 }),
    orange: paint('#d47c27', { metalness: 0.05 }),
    port: new THREE.MeshStandardMaterial({ color: '#661313', emissive: '#f12213', emissiveIntensity: 0 }),
    starboard: new THREE.MeshStandardMaterial({ color: '#174a30', emissive: '#20ed67', emissiveIntensity: 0 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#e5d8b5', emissive: '#ffdf94', emissiveIntensity: 0 }),
  };
}

export function updateTankerMaterials(materials, { wear = 0.28, wetness = 0.35, roughness = 0.66, night = 0, wireframe = false, color = '#a62f23' } = {}) {
  materials.red.color.set(color);
  materials.red.roughness = roughness;
  for (const material of Object.values(materials)) {
    const uniforms = material.userData.tankerUniforms;
    if (uniforms) {
      uniforms.uTankerWear.value = wear;
      uniforms.uTankerWetness.value = wetness;
    }
    material.wireframe = wireframe;
  }
  for (const key of ['port', 'starboard', 'lamp']) materials[key].emissiveIntensity = Math.max(0, night) * 2.8;
}
