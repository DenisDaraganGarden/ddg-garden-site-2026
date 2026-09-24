// Run: node src/features/home-scene/components/editor/help/helpTables.check.js
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// The «?» texts against the parameter reference (docs/engine-parameters.json,
// npm run build:reference): every parameter of the editor has one, in Russian
// and in English; no text is keyed to a parameter that does not exist (a typo
// would never show); and each fits the tooltip — a few lines, not a page.

const here = new URL('.', import.meta.url);
const reference = JSON.parse(readFileSync(new URL('../../../../../../docs/engine-parameters.json', import.meta.url), 'utf8'));
const keys = new Set(reference.rows.map((row) => row.key));
// Shown only in some states — a selected placed object of that kind (a model,
// a SketchUp model, a shrub, a rock), FSR switched on, the gulls or the shore
// switched on (a silent object's track leaves the mixer) — so the reference,
// collected without them, cannot list them.
const CONDITIONAL = [
    'placedObjects[].tiltX', 'placedObjects[].tiltZ', 'placedObjects[].hidden', 'placedObjects[].wet', 'placedObjects[].collision', 'sketchupModels[].faceCamera', 'sketchupModels[].crowns',
    'placedObjects[].dryness', 'placedObjects[].size', 'placedObjects[].squash', 'placedObjects[].stretch', 'placedObjects[].variant', 'placedObjects[].tilt',
    'upscaleQuality', 'upscaleSharpness',
    ...['birds', 'shore'].flatMap((track) => [
        ...['enabled', 'gain'].map((key) => `audio.tracks.${track}.${key}`),
        ...['x', 'y', 'z', 'refDistance', 'maxDistance', 'rolloff'].map((key) => `audio.emitters.${track}.${key}`),
    ]),
];
CONDITIONAL.forEach((key) => keys.add(key));
const MAX = 260;
// Окружение — только в проекте «Участок» (help/surroundings.js), а справочник
// собран на редакторе сайта.
['surroundingsEnabled', 'surroundingsRadius', 'surroundingsBuildings', 'surroundingsTrees', 'surroundingsFences', 'surroundingsRelief', 'northAngle',
    'surroundingsOffsetX', 'surroundingsOffsetZ', 'surroundingsClear', 'surroundingsBuildingColor', 'surroundingsGroundColor', 'surroundingsRoadColor',
    'surroundingsGreenColor', 'surroundingsWaterColor'].forEach((key) => keys.add(key));

const help = new Map();
for (const file of readdirSync(here).filter((name) => name.endsWith('.js') && name !== 'index.js' && !name.endsWith('.check.js'))) {
    const table = (await import(new URL(file, here))).default;
    for (const [key, entry] of Object.entries(table)) {
        assert.ok(!help.has(key) || help.get(key).file === file, `«${key}» is written twice (${help.get(key)?.file}, ${file})`);
        assert.ok(Array.isArray(entry) && entry.length === 2, `«${key}» in ${file}: [ru, en]`);
        entry.forEach((text, i) => {
            assert.ok(typeof text === 'string' && text.trim().length >= 12, `«${key}» in ${file}: ${['ru', 'en'][i]} text is there`);
            assert.ok(text.length <= MAX, `«${key}» in ${file}: ${['ru', 'en'][i]} text fits the tooltip (${text.length} > ${MAX})`);
        });
        assert.ok(/[а-яё]/i.test(entry[0]), `«${key}» in ${file}: the first text is Russian`);
        help.set(key, { file, entry });
    }
}

const unknown = [...help.keys()].filter((key) => !keys.has(key));
assert.deepEqual(unknown, [], `texts keyed to no parameter: ${unknown.join(', ')}`);
const missing = [...keys].filter((key) => !help.has(key));
assert.deepEqual(missing, [], `parameters without a «?»: ${missing.join(', ')}`);

console.log(`help: all ${keys.size} parameters have a «?» in Russian and English, none keyed to a parameter that does not exist, each fits the tooltip`);
