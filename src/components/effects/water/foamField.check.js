import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The foam field lives entirely on the GPU, so what breaks it silently is not
// arithmetic but disagreement: a shader function whose call sites drift apart,
// or a uniform the pass declares and the JS never creates. Both are text, and
// both are checkable without a context.
const read = (name) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
const gerstner = read('./gerstnerWaves.js');
const foam = read('./foamField.js');
const surface = read('./GerstnerWaterSurface.jsx');
const shading = read('./waterShading.js');
const breaking = read('./BreakingWaves.jsx');
const surf = read('./surfProfile.js');

// Arguments of every call/declaration of `call`: top-level commas between the
// matching parentheses, so a nested call inside an argument still counts as one.
const argumentCount = (source, call) => [...source.matchAll(new RegExp(`${call}\\(`, 'g'))].map((match) => {
  let depth = 1, count = 1;
  for (let i = match.index + match[0].length; i < source.length && depth > 0; i += 1) {
    const char = source[i];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 1) count += 1;
  }
  return count;
});

// gerstnerDisplace hands out the orbital velocity the foam rides on: every
// caller has to take it, or the shader will not compile.
const displaceArity = argumentCount(gerstner, 'vec3 gerstnerDisplace')[0];
assert.equal(displaceArity, 6, 'gerstnerDisplace should take p, fade, cell and three outputs');
for (const [name, source] of [['foamField', foam], ['GerstnerWaterSurface', surface]]) {
  const calls = argumentCount(source, '\\bgerstnerDisplace').filter((count) => count === displaceArity);
  assert.ok(calls.length > 0, `${name} calls gerstnerDisplace with the wrong number of arguments`);
}
// Foam age reaches the lace through shadeWater, in the same slot everywhere.
assert.equal(argumentCount(shading, 'vec3 shadeWater')[0], 9);
for (const [name, source] of [['GerstnerWaterSurface', surface], ['BreakingWaves', breaking]]) {
  argumentCount(source, '\\bshadeWater').forEach((count) => assert.equal(count, 9, `${name} calls shadeWater with ${count} arguments`));
}

// Every uniform the foam pass declares has to be created in JS: an unbound one
// reads as zero, and zero density is a field that quietly never fills.
const declared = [...foam.matchAll(/^\s*uniform\s+\w+\s+(\w+)\s*(\[[^\]]*\])?;/gm)].map((match) => match[1]);
const created = new Set([
  ...[...foam.matchAll(/^\s{6}(u\w+):\s*\{/gm)].map((match) => match[1]),
  ...[...gerstner.matchAll(/^\s{4}(uGerstner\w+):\s*\{/gm)].map((match) => match[1]),
  ...[...foam.matchAll(/^\s{4}(uFoam\w+):\s*\{/gm)].map((match) => match[1]),
]);
assert.ok(declared.length >= 15, `expected the foam shaders to declare uniforms, found ${declared.length}`);
declared.forEach((name) => assert.ok(created.has(name), `uniform ${name} is declared in a foam shader but never created`));

// The surf loft declares its uniforms across two files; all of them have to be
// created by the ribbons.
const surfDeclared = [...(surf + breaking).matchAll(/^\s*uniform\s+\w+\s+(u\w+)\s*;/gm)].map((match) => match[1]);
const surfCreated = new Set([
  ...[...breaking.matchAll(/^\s{6}(u\w+):\s*\{/gm)].map((match) => match[1]),
  ...[...shading.matchAll(/^\s{4}(u\w+):\s*\{/gm)].map((match) => match[1]),
]);
assert.ok(surfDeclared.length >= 15, `expected the surf shaders to declare uniforms, found ${surfDeclared.length}`);
surfDeclared.forEach((name) => assert.ok(surfCreated.has(name), `uniform ${name} is declared in a surf shader but never created`));

console.log(`foamField: ${declared.length} foam and ${surfDeclared.length} surf uniforms bound, gerstnerDisplace/shadeWater call sites agree`);
