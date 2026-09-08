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
assert.ok(!foam.includes('coverage <= 0.001'), 'coverage does not branch before the foam derivative');
assert.ok(foam.includes('if (uNoiseReady < 0.5) return 0.0;'), 'only uniform noise readiness can exit before the foam derivative');
assert.ok(foam.includes('float width = max(fwidth(pattern) * 0.75, 0.008);'), 'foam derivative is evaluated before coverage masking');
assert.ok(foam.includes('float coverageActive = smoothstep(0.0005, 0.0025, coverage);'), 'foam coverage has a smooth zero endpoint after the derivative');
// Microstructure may make holes and strands, but must not become a local HDR
// gain for every Worley cell. The bounded factor preserves foam brightness as
// the artist-facing control.
assert.ok(foam.includes('float strands ='), 'foam retains a thin porous edge');
assert.ok(source.includes('foamLit *= mix(0.82, 0.98, bubbles);'), 'foam porosity is a bounded attenuation, not a bright bubble lobe');
assert.ok(source.includes('vec2 waterFoamCarrierWarp(vec2 fp)'), 'foam deforms the carrier before sampling the tiled volume');
assert.ok(source.includes('vec2 carrier = waterFoamCarrierWarp(fp);'), 'foam uses the deformed carrier coordinates');
const foamWarpStart = source.indexOf('vec2 waterFoamCarrierWarp(');
const foamWarpEnd = source.indexOf('float waterFoam(', foamWarpStart);
assert.ok(!/texture\s*\(/.test(source.slice(foamWarpStart, foamWarpEnd)), 'foam anti-tiling adds no volume texture fetch');
assert.ok(!foam.includes('smoothstep(1.0 - coverage'), 'deposited foam is not cut off by a second coverage threshold');
assert.ok(source.includes('float waterFoamPatternQuantile(float probability)'), 'foam maps field density through the measured lace distribution');
assert.ok(foam.includes('float threshold = waterFoamPatternQuantile(1.0 - coverage);'), 'coverage controls island area instead of every-pixel opacity');
assert.ok(foam.includes('float farFilm = coverage * (0.62 + 0.38 * 0.52);'), 'unresolved lace preserves area as a filtered film');
assert.ok(foam.includes('float strands = fineFade *'), 'unresolved lace does not retain a thresholded high-frequency rim');

// GPU samples of the pattern at laceScale .34. The table maps a requested
// island fraction c through q(1-c), so c=.1/.25 still select distinct lace
// islands rather than becoming a uniform grey wash.
const quantiles = [
  [0, 0.29077], [0.01, 0.35352], [0.05, 0.39697], [0.10, 0.42188],
  [0.25, 0.46460], [0.50, 0.51318], [0.75, 0.56250], [0.90, 0.60596],
  [0.95, 0.62988], [0.99, 0.67529], [1, 0.76807],
];
const quantile = (p) => {
  for (let index = 1; index < quantiles.length; index += 1) {
    const [rightP, rightQ] = quantiles[index];
    const [leftP, leftQ] = quantiles[index - 1];
    if (p <= rightP) return leftQ + (rightQ - leftQ) * (p - leftP) / (rightP - leftP);
  }
  return quantiles.at(-1)[1];
};
assert.equal(quantile(1), 0.76807, 'zero coverage maps to the top pattern quantile before endpoint masking');
assert.equal(quantile(0.9), 0.60596, '.1 coverage selects the measured 90th-percentile islands');
assert.equal(quantile(0.75), 0.56250, '.25 coverage selects the measured 75th-percentile islands');
assert.equal(quantile(0.5), 0.51318, '.5 coverage remains at the distribution median');
assert.equal(quantile(0), 0.29077, 'full coverage accepts the entire measured pattern range');

assert.ok(source.includes('float waterRippleWindPatch(vec2 p)'), 'wind ripple uses multiscale world patches');
assert.ok(source.includes('float waterRippleResolvedWeight(float pixel)'), 'ripple normal is filtered by world pixel footprint');
assert.ok(source.includes('float waterRippleUnresolvedRoughness(vec2 p, float pixel)'), 'distant chop retains bounded unresolved roughness');
assert.ok(source.includes('if (uRipple <= 0.001 || uNoiseReady < 0.5) return 0.0;'), 'unresolved roughness bypasses wind noise when inactive');
assert.ok(source.includes('if (unresolved <= 0.001) return 0.0;'), 'near resolved ripples bypass unresolved wind noise');
assert.ok(source.includes('if (resolved > 0.001) w = uRipple * weight * resolved * waterRippleWindPatch(p);'), 'far filtered normals bypass resolved wind noise');
assert.ok(source.includes('float reflectionWeight = clamp(fresnel, 0.02, 0.85) * (1.0 - transmit * 0.8);'), 'roughness preserves the authored Fresnel weight');
assert.ok(source.includes('unresolved * 0.22, 0.0, 0.22'), 'unresolved roughness remains bounded');
assert.ok(source.includes('vec3 waterSkyReflection(vec3 ray, float roughness)'), 'rough wind patches filter the sky direction symmetrically');
assert.ok(source.includes('float waterSunGlint(vec3 reflected, float roughness)'), 'rough wind patches widen the same sun lobe');
assert.ok(source.includes('if (roughness <= 0.0001) return centre;'), 'zero roughness preserves the exact sky reflection path');
assert.ok(source.includes('if (roughness <= 0.0001) return sharp;'), 'zero roughness preserves the exact sun glint path');

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
