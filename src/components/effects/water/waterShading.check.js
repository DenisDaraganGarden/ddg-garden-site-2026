import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./waterShading.js', import.meta.url), 'utf8');
const foamStart = source.indexOf('float waterFoam(');
const foamEnd = source.indexOf('vec3 shadeWater(', foamStart);
assert.ok(foamStart >= 0 && foamEnd > foamStart, 'water foam shader is present');
const foam = source.slice(foamStart, foamEnd);

// The carrier (foam field or breaker profile) supplies motion. A second
// time-scroll of the lace makes it crawl independently across a frozen sea.
assert.ok(!/uTime/.test(foam), 'foam detail has no independent time scroll');
// Microstructure may make holes and strands, but must not become a local HDR
// gain for every Worley cell. The bounded factor preserves foam brightness as
// the artist-facing control.
assert.ok(foam.includes('float strands ='), 'foam retains a thin porous edge');
assert.ok(source.includes('foamLit *= mix(0.82, 0.98, bubbles);'), 'foam porosity is a bounded attenuation, not a bright bubble lobe');

const refractionStart = source.indexOf('vec3 waterCapturedRefraction(');
const refractionEnd = source.indexOf('// Two scrolling slices', refractionStart);
assert.ok(refractionStart >= 0 && refractionEnd > refractionStart, 'captured refraction shader is present');
const refraction = source.slice(refractionStart, refractionEnd);
// The captured scene remains exact at a zero path: hue is an absorption and
// scattering tint of the medium, not a blanket multiplication of the capture.
assert.ok(refraction.includes('vec3 waterTransmissionTint = waterHue / max('), 'water colour supplies a finite refraction hue');
assert.ok(refraction.includes('vec3 hueAbsorption = (vec3(1.0) - waterTransmissionTint) * density * 0.16;'), 'water hue only attenuates turbid water');
assert.ok(refraction.includes('vec3 transmittance = exp('), 'refraction retains Beer-Lambert transmission');
assert.ok(refraction.includes('scatterColor *= mix(vec3(1.0), waterTransmissionTint, 0.42);'), 'scattering colour is tinted instead of replaced');
assert.ok(!/captured\.rgb\s*\*\s*waterTransmissionTint/.test(refraction), 'capture is not blanket-tinted at zero path');

console.log('waterShading: carrier-bound porous foam and depth-only water-hue refraction');
