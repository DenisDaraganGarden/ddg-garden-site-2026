import assert from 'node:assert/strict';
import {createTerrainDefinition,createTerrainQuery} from '../src/terrain/terrainModel.js';
import {buildCoastRocks,attachRockCollisions} from '../src/terrain/terrainRocks.js';
import {createCoastPlanting} from '../src/plants/coastPlanting.js';
import {DEFAULT_SHRUB_SETTINGS,normalizeShrubSettings,shrubAssetSettings} from '../src/plants/settings.js';
import {createPlantCover} from '../src/plants/plantCover.js';
let checked=0;
for(const input of [{},{terrainBearing:275,terrainCliffSlope:20,terrainCliffHeight:4},{terrainLength:128,terrainCliffHeight:22,terrainRocks:1}]){
 const definition=createTerrainDefinition(input),query=attachRockCollisions(createTerrainQuery(definition),buildCoastRocks(definition));
 const options={...DEFAULT_SHRUB_SETTINGS,shrubsCount:128};
 const plants=createCoastPlanting(query,definition,options);
 assert.deepEqual(plants,createCoastPlanting(query,definition,options));assert.ok(plants.length>20);
 for(const p of plants){const surface=query.surfaceAt(p.x,p.z,0);assert.equal(p.y,surface.height);assert.ok(surface.wetness<.15&&surface.normal.y>.64&&surface.vegetation.shrubs>0);assert.notEqual(surface.habitat,'rock');assert.ok(p.dryness>=0&&p.dryness<=1);checked++;}
 const changed=createCoastPlanting(query,definition,{...options,shrubsDryness:.9,shrubsGusts:1,shrubsPatchContrast:1});assert.deepEqual(changed.map(p=>[p.x,p.y,p.z]),plants.map(p=>[p.x,p.y,p.z]));
 assert.equal(createCoastPlanting(query,definition,{shrubsEnabled:false}).length,0);
 assert.equal(createCoastPlanting(query,definition,options,()=>1).length,0,'future paths exclude plants through the shared mask');
 const cover=createPlantCover(plants);assert.equal(cover.texture.image.data.length,256*256*4);cover.dispose();
}
assert.equal(normalizeShrubSettings({shrubsCount:Infinity}).shrubsCount,512);assert.equal(normalizeShrubSettings({shrubsCount:99999}).shrubsCount,2048);assert.equal(normalizeShrubSettings({shrubsDryness:-1}).shrubsDryness,0);
const asset=shrubAssetSettings({}, {speed:7,bearing:182});assert.equal(asset.wind,7);assert.equal(asset.windBearing,182);
console.log(JSON.stringify({passed:true,anchoredPlants:checked,axes:'N -Z; E +X; Y up',habitat:'analytic terrain and rock query'}));
