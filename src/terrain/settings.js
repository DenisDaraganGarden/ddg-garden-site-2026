export const DEFAULT_TERRAIN_SETTINGS = Object.freeze({
  terrainEnabled: true, terrainSeed: 37, terrainBearing: 90, terrainOffset: 12,
  terrainLength: 1600, terrainLandWidth: 280, terrainBeachWidth: 18,
  terrainCliffHeight: 7, terrainCliffSlope: 3.5, terrainCurve: 12,
  terrainCapeDepth: 28, terrainCapePosition: -180, terrainCapeWidth: 100,
  terrainShells: 0.75, terrainRocks: 0.55, terrainTextureScale: 1,
  terrainRocksEnabled: true, terrainRockSize: 1, terrainDebris: 0.55,
  terrainPebblesEnabled: true, terrainPebbles: 0.6, terrainPebbleSize: 1,
  terrainRelief: 0.7, terrainParallax: 0.7, terrainWetBand: 2.4,
  terrainFoam: 0.75, terrainWaveHeight: 0.12, terrainWavePeriod: 6,
  terrainWindBearing: 290, terrainWindSpeed: 4,
  terrainErosion: .55, terrainSoil: .45, terrainWeathering: .5, terrainBloom: 0, terrainStorm: 0,
  terrainFeatureScale: 64, terrainLandslides: .85, terrainPaths: .4, terrainPathWidth: 1.3,
  terrainGroundCover: .85,
  // The ground of the bluff: the talus run out onto the beach (also a geometry key), the beds and rain rills of the face.
  terrainTalus: .6, terrainStrata: .6,
  // The rim of the bluff: turf to the very edge of the crest, this many metres inland, with its own tint.
  terrainRimWidth: 8, terrainRimColor: '#86ad55',
  // Moist islands: the sand greens where water gathers and shade keeps it.
  terrainOasis: .6, terrainOasisColor: '#7f9c58',
  // Wrack: the weed the sea throws up along the run-up line.
  terrainWrack: .6,
  terrainSaturation: 1, terrainContrast: 1, terrainBrightness: 1, terrainGreen: 1, terrainDry: 1,
  // The bed of the shelf: the offshore slope past the near-shore knee (m per 100 m), then what lies on the sand.
  terrainShelfSlope: 1.2, terrainWeed: .55, terrainSilt: .4, terrainMussels: .3, terrainBedScale: 42, terrainRipples: .6,
});
export const TERRAIN_RANGES = {
  terrainSeed: [1,9999,1], terrainBearing: [0,360,1], terrainOffset: [-200,200,.5],
  terrainLength: [128,4096,64], terrainLandWidth: [80,800,10], terrainBeachWidth: [4,60,.5],
  terrainCliffHeight: [0,22,.1], terrainCliffSlope: [2,24,.5], terrainCurve: [0,45,.5],
  terrainCapeDepth: [0,90,1], terrainCapePosition: [-1200,1200,5], terrainCapeWidth: [30,300,5],
  terrainShells:[0,1,.01], terrainRocks:[0,1,.01], terrainTextureScale:[.4,3,.05],
  terrainRockSize:[.4,2.5,.05], terrainDebris:[0,1,.01], terrainPebbles:[0,1,.01], terrainPebbleSize:[.5,2,.05],
  terrainRelief:[0,1.5,.01], terrainParallax:[0,1,.01], terrainWetBand:[.5,6,.1],
  terrainFoam:[0,1.5,.01], terrainWaveHeight:[0,.3,.01], terrainWavePeriod:[3,12,.1],
  terrainWindBearing:[0,360,1], terrainWindSpeed:[0,18,.1],
  terrainErosion:[0,1,.01], terrainSoil:[0,1,.01], terrainWeathering:[0,1,.01], terrainBloom:[0,1,.01], terrainStorm:[0,1,.01],
  terrainFeatureScale:[24,160,1], terrainLandslides:[0,1,.01], terrainPaths:[0,1,.01], terrainPathWidth:[.6,4,.1], terrainGroundCover:[0,1,.01], terrainTalus:[0,1,.01], terrainStrata:[0,1,.01], terrainRimWidth:[0,30,.5], terrainRimColor:null, terrainOasis:[0,1,.01], terrainOasisColor:null, terrainWrack:[0,1,.01],
  terrainSaturation:[0,2,.05], terrainContrast:[.5,1.6,.05], terrainBrightness:[.5,1.6,.05], terrainGreen:[0,2,.05], terrainDry:[0,2,.05],
  terrainShelfSlope:[0,5,.1], terrainWeed:[0,1,.01], terrainSilt:[0,1,.01], terrainMussels:[0,1,.01], terrainBedScale:[8,120,1], terrainRipples:[0,1,.01],
};
export function normalizeTerrainSettings(source={}) {
  const out = {};
  for (const [key, fallback] of Object.entries(DEFAULT_TERRAIN_SETTINGS)) {
    if (typeof fallback === 'boolean') { out[key] = typeof source[key] === 'boolean' ? source[key] : fallback; continue; }
    if (typeof fallback === 'string') { out[key] = /^#[0-9a-f]{6}$/i.test(source[key] ?? '') ? source[key] : fallback; continue; }
    const number = Number(source[key]); const [min,max] = TERRAIN_RANGES[key];
    out[key] = source[key] != null && Number.isFinite(number) ? Math.max(min,Math.min(max,number)) : fallback;
  }
  out.terrainSeed=Math.round(out.terrainSeed);
  out.terrainLandWidth=Math.max(out.terrainLandWidth,out.terrainBeachWidth*1.12+out.terrainCliffSlope*1.18+out.terrainCliffHeight*6.6+76);
  return out;
}
// Artist-controlled weather envelope shared by CPU probes and GPU uniforms.
export function coastWeather(p) {
  const storm=p.terrainStorm??0,wind=p.terrainWindSpeed+storm*8;
  return {height:p.terrainWaveHeight*(1+storm*.6),period:p.terrainWavePeriod*(1-storm*.22),
    foam:p.terrainFoam*(1+storm*.45),wind,
    // Open-water swell, one number the far field, the pond's drift and the
    // tanker's roll all read: 1 at the default 4 m/s, more in wind and storm.
    swell:Math.min(3,.4+wind*.15+storm*1.2),swellBearing:p.terrainWindBearing};
}

export const TERRAIN_GEOMETRY_KEYS=['terrainEnabled','terrainSeed','terrainBearing','terrainOffset','terrainLength','terrainLandWidth','terrainBeachWidth','terrainCliffHeight','terrainCliffSlope','terrainCurve','terrainCapeDepth','terrainCapePosition','terrainCapeWidth','terrainRelief','terrainErosion','terrainFeatureScale','terrainLandslides','terrainPaths','terrainShelfSlope','terrainTalus'];
export function terrainGeometryKey(p){return JSON.stringify(Object.fromEntries(TERRAIN_GEOMETRY_KEYS.map(key=>[key,p[key]]).concat([['waterDepthMeters',p.waterDepthMeters??p.waterDepth]])));}
