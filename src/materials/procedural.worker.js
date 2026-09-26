import { generateSurface, surfaceRecipe } from './procedural.js';
import { mapsFromRecipe, toBytes } from '../../scripts/materialMaps.mjs';

self.onmessage = ({ data }) => {
    try {
        const { surface, extent, source, ticket, size = 512 } = data;
        const built = generateSurface(surface, size, size, extent, source);
        const maps = mapsFromRecipe(built.rgb, size, size, surfaceRecipe(surface), built.extent, built.height);
        const result = { ticket, size, rgb: built.rgb, normal: maps.normal, height: toBytes(maps.height), roughness: toBytes(maps.roughness), ao: toBytes(maps.ao) };
        self.postMessage(result, [result.rgb.buffer, result.normal.buffer, result.height.buffer, result.roughness.buffer, result.ao.buffer]);
    } catch (error) { self.postMessage({ ticket: data.ticket, error: error.message }); }
};
