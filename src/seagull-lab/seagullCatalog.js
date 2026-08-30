export const SEAGULL_ASSET = Object.freeze({
  model: '/models/seagull/seagull-flight.glb',
  textures: {
    albedo: '/models/seagull/textures/seagull_albedo.webp',
    normal: '/models/seagull/textures/seagull_normal.webp',
    orm: '/models/seagull/textures/seagull_orm.webp',
    specular: '/models/seagull/textures/seagull_specular.webp',
  },
  source: {
    triangles: 8765,
    bones: 162,
    influences: 9,
  },
  web: {
    triangles: 5607,
    bones: 22,
    exportedJoints: 23,
    influences: 4,
    wingspan: 1,
    bodyLength: 0.48,
  },
  flight: {
    defaultCount: 9,
    stressCount: 18,
    wingbeatHz: [3.33, 4.29],
    cruiseSpeed: [9.5, 15.7],
    nearestNeighbor: 1.5,
    normalHeight: [12, 28],
    lowTransitHeight: [2, 8],
  },
});

export const MODE_COUNTS = Object.freeze({
  flight: SEAGULL_ASSET.flight.defaultCount,
  landing: SEAGULL_ASSET.flight.defaultCount,
  glide: 3,
  specimen: 1,
  stress: SEAGULL_ASSET.flight.stressCount,
});
