import * as THREE from 'three';

// What a PBR surface means in this scene, in one place.
//
// This covers the objects built on MeshStandard/MeshPhysical - the boat and the
// sculpture. The water, the seabed shading and the plants run their own shaders
// and light themselves; they follow the same environment value below, but their
// response to it lives in their GLSL.

// How much of the environment a surface returns, relative to the authored
// intensity. `lighting.environment.reflection` is that intensity as a fraction
// (100% -> 1.0), and every material multiplies it by its own factor rather than
// inventing a divisor: painted wood returns far less than wet stone, and that is
// a property of the material, not a different reading of the same setting.
//
// The seabed and the lily pads sit at 1.0. The two numbers here reproduce the
// reflections the boat and the sculpture were authored with, back when they were
// buried in hand-picked divisors of 260 and 220 - which quietly gave those two
// objects a third of the environment everything else was getting.
export const ENV_REFLECTION_SCALE = Object.freeze({
  boat: 0.385,
  sculpture: 0.455,
});

// HTML colour pickers describe a perceptual sRGB swatch, while material colour
// uniforms live in linear light. In this deliberately dark scene, feeding the
// converted near-black value straight into a material turned a visibly grey
// swatch into almost zero reflected energy. This adapter keeps the picker's
// value as an art-directed linear albedo while preserving its hue.
export function colorPickerToArtisticAlbedo(value, fallback = '#ffffff') {
  const color = new THREE.Color();

  try {
    color.set(value || fallback);
  } catch {
    color.set(fallback);
  }

  return color.convertLinearToSRGB();
}

// The boat's supplied base-colour map is intentionally very dark charcoal.
// Multiplying it by another dark picker value erased the grain completely. For
// a textured material the picker therefore acts as a tint, and this explicit
// map gain restores the authored wood values before tone mapping.
export function createLiftedTextureTint(value, gain = 7.5) {
  const tint = colorPickerToArtisticAlbedo(value);
  const peak = Math.max(tint.r, tint.g, tint.b);

  if (peak > 1e-5) {
    tint.multiplyScalar(1 / peak);
  } else {
    tint.setRGB(1, 1, 1);
  }

  tint.lerp(new THREE.Color(1, 1, 1), 0.45);
  const valueResponse = THREE.MathUtils.lerp(0.68, 1, Math.sqrt(Math.min(peak, 1)));
  return tint.multiplyScalar(gain * valueResponse);
}

// Colour maps carry sRGB; roughness, metalness, normal and bump carry numbers
// and must stay linear. Mixing the two up is nearly invisible in a scene this
// dark - until the exposure moves, and then every material is wrong at once.
export function configureMaps(gl, { color = [], data = [] }) {
  const anisotropy = Math.min(gl.capabilities.getMaxAnisotropy(), 8);

  color.forEach((texture) => {
    if (!texture) {
      return;
    }

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
  });

  data.forEach((texture) => {
    if (!texture) {
      return;
    }

    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = anisotropy;
  });
}
