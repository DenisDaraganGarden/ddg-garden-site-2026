import { parentPort, workerData } from 'node:worker_threads';
import { generateSurface } from '../src/materials/procedural.js';
const { surface, width, height, extent, source } = workerData;
const built = generateSurface(surface, width, height, extent, source);
parentPort.postMessage(built, [built.rgb.buffer, built.height.buffer]);
