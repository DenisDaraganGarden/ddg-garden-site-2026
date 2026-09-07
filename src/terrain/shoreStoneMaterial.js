import * as THREE from 'three';

export const SHORE_STONE_MAPS = ['albedo', 'normal', 'surface'].map((name) => `/textures/shore-stone/limestone-${name}.webp`);

// Caller owns the shared texture copies. Triplanar coordinates are in metres,
// before the ring's placement; geometry size never stretches the mineral grain.
export function createStoneRingMaterial(maps) {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, vertexColors: true });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      stoneAlbedo: { value: maps[0] }, stoneNormal: { value: maps[1] }, stoneSurface: { value: maps[2] },
    });
    const varying = /* glsl */`
      varying vec3 vStonePoint;
      varying vec3 vStoneNormal;
      varying mat3 vStoneToView;
    `;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nattribute vec3 stoneOffset;\n${varying}`);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      mat3 stoneBasis = mat3(1.0);
      float stoneScale = 1.0;
      #ifdef USE_INSTANCING
        stoneBasis = mat3(instanceMatrix);
        stoneScale = length(stoneBasis[0]);
        stoneBasis[0] /= dot(stoneBasis[0], stoneBasis[0]);
        stoneBasis[1] /= dot(stoneBasis[1], stoneBasis[1]);
        stoneBasis[2] /= dot(stoneBasis[2], stoneBasis[2]);
      #endif
      vStonePoint = position * stoneScale + stoneOffset;
      vStoneNormal = normal;
      vStoneToView = normalMatrix * stoneBasis;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${varying}
      uniform sampler2D stoneAlbedo;
      uniform sampler2D stoneNormal;
      uniform sampler2D stoneSurface;
      vec3 stoneSample(sampler2D tex, vec3 p, vec3 w) {
        return texture2D(tex,p.yz).rgb*w.x + texture2D(tex,p.xz).rgb*w.y + texture2D(tex,p.xy).rgb*w.z;
      }
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', /* glsl */`
      #include <color_fragment>
      vec3 stoneN = normalize(vStoneNormal);
      vec3 stoneW = pow(abs(stoneN), vec3(4.0));
      stoneW /= dot(stoneW, vec3(1.0));
      vec3 stoneP = vStonePoint / .60;
      vec3 stoneData = stoneSample(stoneSurface, stoneP, stoneW);
      diffuseColor.rgb *= stoneSample(stoneAlbedo, stoneP, stoneW);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= stoneData.g;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', /* glsl */`
      #include <normal_fragment_maps>
      vec3 stoneNX = texture2D(stoneNormal, stoneP.yz).xyz * 2.0 - 1.0;
      vec3 stoneNY = texture2D(stoneNormal, stoneP.xz).xyz * 2.0 - 1.0;
      vec3 stoneNZ = texture2D(stoneNormal, stoneP.xy).xyz * 2.0 - 1.0;
      // Blend surface gradients; a flat normal map preserves the mesh normal
      // exactly, including the intersections of all three projection axes.
      vec3 stoneGradient = vec3(0.0, stoneNX.xy / max(.2, stoneNX.z)) * stoneW.x
        + vec3(stoneNY.x, 0.0, stoneNY.y) / max(.2, stoneNY.z) * stoneW.y
        + vec3(stoneNZ.xy / max(.2, stoneNZ.z), 0.0) * stoneW.z;
      stoneGradient -= stoneN * dot(stoneN, stoneGradient);
      normal = normalize(vStoneToView * normalize(stoneN + stoneGradient));
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= stoneData.r;');
  };
  material.customProgramCacheKey = () => 'ddg-shore-stone-pbr-2';
  return material;
}
