import * as THREE from 'three';

export const ROCK_TEXTURE_TYPES = Object.freeze(['limestone', 'coquina']);
export const ROCK_MAP_NAMES = Object.freeze(ROCK_TEXTURE_TYPES.flatMap((type) => ['color', 'normal', 'surface'].map((map) => `${type}-${map}`)));
export const rockMapUrl = (name, lowPower = false) => `/textures/rocks/${lowPower ? 'mobile/' : ''}${name}.webp`;

// TextureLoader's source cache is shared; the collection owns the cloned GPU
// textures and disposes them on unmount. Six samplers/maps for the whole set.
export function createRockTextureSet(loaded, anisotropy = 4) {
  const maps = {};
  ROCK_MAP_NAMES.forEach((name, i) => {
    const map = loaded[i].clone();
    map.colorSpace = name.endsWith('-color') ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = anisotropy;
    map.needsUpdate = true;
    map.name = `azov-rock-${name}`;
    const type = name.slice(0, name.lastIndexOf('-')), channel = name.slice(name.lastIndexOf('-') + 1);
    (maps[type] ??= {})[channel] = map;
  });
  const bytes = loaded.reduce((sum, map) => sum + map.image.width * map.image.height * 4 * 4 / 3, 0);
  return { maps, bytes, dispose() { Object.values(maps).forEach((set) => Object.values(set).forEach((map) => map.dispose())); } };
}
