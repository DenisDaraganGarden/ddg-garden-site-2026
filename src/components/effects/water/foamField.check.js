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
const breaking = read('./BreakingWaves.jsx') + read('./ShoreWater.jsx');

// A sub-pixel breaker lip can interpolate its thickness outside the triangle
// at an MSAA pixel centre. Beer-Lambert accepts only a physical path length:
// a negative path turns into an exponential HDR firefly.
assert.ok(shading.includes('thickness = max(thickness, 0.0);'), 'water Beer path cannot become negative at a thin-sheet edge');
assert.ok(shading.includes('foamCoverage = clamp(foamCoverage, 0.0, 1.0);'), 'water foam coverage stays physical at a thin-sheet edge');
assert.ok(breaking.includes('float alpha = clamp(vAlpha, 0.0, 1.0);'), 'breaker sheet clamps MSAA edge alpha before blending');
assert.ok(foam.includes('alongCrest * uBorePeelSpan * uBoreFrame.y'), 'wet trail uses the local breaker event span');
assert.ok(foam.includes('uniforms.uBorePeelSpan.value = surfPeelSpan(settings);'), 'foam and loft share the same event-length calculation');
assert.ok(foam.includes('settings.surfFreeze ? 0 : (settings.surfPeel ?? 0)'), 'frozen inspection removes peel from both the foam and geometry');
assert.ok(foam.includes('const step = frozen ? 0 :'), 'frozen surf stops foam advection and decay');
assert.ok(foam.includes('uniforms.uGerstnerTime.value = frozen ? field.freezeTime : time;'), 'frozen surf keeps a fixed foam source seed');
assert.ok(foam.includes('gerstnerNoise(traceP * 2.37'), 'bore trace breaks in both coast axes rather than repeating one along-crest stripe');
assert.ok(foam.includes('ragged * 3.2, behind'), 'a bore deposits an offshore tail rather than an equal full-coast band');
assert.ok(foam.includes('float across = tail * front;'), 'the narrow symmetric cross-mask does not cut the intended tail short');
assert.ok(foam.includes('float(i) * 17.3'), 'trace seed is a stable bore slot, never its moving position');
assert.ok(!foam.includes('bore.x * 0.043'), 'trace does not translate its material stamp with the crest');
assert.ok(surface.includes('mix(crest * 0.9, memory.x, memory.z)'), 'deposited density is not thresholded a second time in open water');
assert.ok(breaking.includes('max(vFoam * 0.95, max(memory.x * memory.z, crest * 0.9 * (1.0 - memory.z)))'), 'the breaker keeps deposited foam independently of analytic threshold');

assert.ok(foam.includes('export const foamFreezeKey = (settings = {})'), 'frozen phase has a stable settings-derived seed');
assert.ok(foam.includes('field.freezeKey !== nextFreezeKey'), 'changing frozen phase clears the old trace before reseeding');
assert.ok(foam.includes('settings.foamDeposit, settings.foamLife'), 'frozen reseed includes foam-density parameters');
assert.ok(foam.includes('settings.wavelength, settings.amplitude, settings.steepness'), 'frozen reseed includes carrier shape');
assert.ok(foam.includes('live carrier must not inherit the deliberately static inspection'), 'leaving freeze clears its static trace before live advection');
assert.ok(foam.includes('uniform sampler2D uBoreLine;'), 'foam pass receives the per-ribbon break-line texture');
assert.ok(foam.includes('float qBore = qBoreBase - uBoreRefraction * (line.x - line.z);'), 'foam maps each refracted section back into its mean bore frame');
assert.ok(foam.includes('smoothstep(0.0, 0.04, alongCrest)'), 'foam source uses the loft end taper');
assert.ok(foam.includes('if (bore.y <= 0.0001) continue;'), 'inactive bore slots skip line texture fetches');
assert.ok(foam.includes('field.lineTexture.dispose();'), 'foam field owns and disposes its line texture');
assert.ok(breaking.includes('foamBores.breakLines[ribbon.index].set(line);'), 'breaking waves publish their actual break line to foam');
assert.ok(breaking.includes('foamBores.breakVisible[ribbon.index].set(visible);'), 'foam receives the same spit-gap mask as the loft');
assert.ok(foam.includes('Math.round(cameraX / texel) * texel'), 'sub-texel camera motion does not translate a world-space pattern');
const surf = read('./surfProfile.js') + read('./coastFrame.js') + read('./coastBreakLine.js');

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
assert.equal(argumentCount(shading, 'vec3 shadeWater')[0], 10);
for (const [name, source] of [['GerstnerWaterSurface', surface], ['BreakingWaves', breaking]]) {
  argumentCount(source, '\\bshadeWater').forEach((count) => assert.equal(count, 10, `${name} calls shadeWater with ${count} arguments`));
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
  ...[...breaking.matchAll(/^\s{4,6}(u\w+):\s*\{/gm)].map((match) => match[1]),
  ...[...shading.matchAll(/^\s{4}(u\w+):\s*\{/gm)].map((match) => match[1]),
  ...[...surf.matchAll(/(u\w+):\s*\{\s*value/g)].map((match) => match[1]),
  ...[...(read('./foamField.js') + read('./gerstnerWaves.js')).matchAll(/^\s{4}(u\w+):\s*\{/gm)].map((match) => match[1]),
]);
assert.ok(surfDeclared.length >= 15, `expected the surf shaders to declare uniforms, found ${surfDeclared.length}`);
surfDeclared.forEach((name) => assert.ok(surfCreated.has(name), `uniform ${name} is declared in a surf shader but never created`));

console.log(`foamField: ${declared.length} foam and ${surfDeclared.length} surf uniforms bound, gerstnerDisplace/shadeWater call sites agree`);
