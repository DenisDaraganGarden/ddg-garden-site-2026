// Production catalogue deliberately contains only runtime metadata.  The source
// Blender files and asset-lab look-dev remain outside the published scene.
export const FISH_SPECIES_ORDER = Object.freeze(['pike', 'perch', 'roach']);

export const FISH_CATALOG = Object.freeze({
  pike: Object.freeze({
    id: 'pike',
    name: 'Щука',
    latin: 'Esox lucius',
    role: 'solitary-predator',
    glb: '/models/fish/pike.glb?v=4',
    length: 0.92,
    halfHeight: 0.1023,
    vertices: 480,
    triangles: 908,
    bones: 10,
    clearcoat: 0.42,
    iridescence: 0.035,
    pectoralBones: Object.freeze([3, 4]),
    physics: Object.freeze({
      cruiseSpeed: 0.24, maxSpeed: 0.78, burstSpeed: 1.58, maxForce: 0.92,
      turnRate: 2.4, drag: 0.74, buoyancy: 0.58, neighborRadius: 0.58,
      separationRadius: 0.34, waveAmplitude: 0.11, waveFrequency: 2.1,
    }),
  }),
  perch: Object.freeze({
    id: 'perch',
    name: 'Окунь',
    latin: 'Perca fluviatilis',
    role: 'loose-school',
    glb: '/models/fish/perch.glb?v=4',
    length: 0.38,
    halfHeight: 0.0957,
    vertices: 358,
    triangles: 664,
    bones: 9,
    clearcoat: 0.52,
    iridescence: 0.075,
    pectoralBones: Object.freeze([2, 3]),
    physics: Object.freeze({
      cruiseSpeed: 0.34, maxSpeed: 0.78, burstSpeed: 1.05, maxForce: 1.25,
      turnRate: 4.1, drag: 0.86, buoyancy: 0.8, neighborRadius: 0.58,
      separationRadius: 0.22, waveAmplitude: 0.16, waveFrequency: 3.25,
    }),
  }),
  roach: Object.freeze({
    id: 'roach',
    name: 'Плотва',
    latin: 'Rutilus rutilus',
    role: 'dense-school',
    glb: '/models/fish/roach.glb?v=4',
    length: 0.18,
    halfHeight: 0.04224,
    vertices: 256,
    triangles: 460,
    bones: 8,
    clearcoat: 0.62,
    iridescence: 0.14,
    pectoralBones: Object.freeze([2, 3]),
    physics: Object.freeze({
      cruiseSpeed: 0.39, maxSpeed: 0.88, burstSpeed: 1.16, maxForce: 1.58,
      turnRate: 5.7, drag: 0.96, buoyancy: 1, neighborRadius: 0.45,
      separationRadius: 0.12, waveAmplitude: 0.19, waveFrequency: 4.5,
    }),
  }),
});

export const FISH_DEFAULT_COUNTS = Object.freeze({ pike: 1, perch: 11, roach: 38 });
export const FISH_MAX_AGENTS = 50;
export const FISH_MIN_AGENTS = 0;

export const FISH_TEXTURES = Object.freeze(Object.fromEntries(
  FISH_SPECIES_ORDER.map((species) => [species, Object.freeze({
    albedo: `/models/fish/textures/${species}/${species}_albedo.webp`,
    normal: `/models/fish/textures/${species}/${species}_normal.webp`,
    orm: `/models/fish/textures/${species}/${species}_orm.webp`,
    specular: `/models/fish/textures/${species}/${species}_specular.webp`,
  })]),
));
