import * as THREE from 'three';
import { coastShader, createCoastUniforms, syncCoastUniforms } from '../../../terrain/terrainShader.js';
import { coastHeight } from '../../../terrain/terrainModel.js';

// The water's knowledge of the coast. Every water surface that has to meet the
// shore — the open swell, the breakers, the foam field — reads the terrain's
// own coast frame (q across the shore from the waterline, s along it, the same
// GLSL twin the ground is built from), so the spit, the cape and the curve of
// the beach are the same for the sand and the sea.

export const BREAK_SAMPLES = 48;

export const coastWaterShader = /* glsl */`
${coastShader}
// The swell dies toward the beach: a share of it goes where the breakers take
// over (uSwellFade.x, the break line), the rest before the waterline.
uniform vec2 uSwellFade;
vec2 coastPoint(float q, float s) {
  return coastLand() * (coastShore(s) + q) + coastAlong() * s;
}
float coastSwellFade(float q) {
  if (uSwellFade.y <= 0.0) return 1.0;
  float qb = uSwellFade.x;
  return (1.0 - 0.65 * smoothstep(qb - uSwellFade.y, qb, q)) * (1.0 - smoothstep(min(qb * 0.5, -6.0), -1.0, q));
}
`;

export function createCoastWaterUniforms() {
  return { ...createCoastUniforms(), uSwellFade: { value: new THREE.Vector2(-10, 0) } };
}

// breakQ: where the swell hands over to the breakers (metres from the
// waterline, negative at sea); fadeWidth 0 leaves the swell alone.
export function syncCoastWaterUniforms(uniforms, coast, breakQ = -10, fadeWidth = 30) {
  if (!coast?.definition) { uniforms.uSwellFade.value.set(breakQ, 0); return; }
  syncCoastUniforms(uniforms, coast.definition);
  uniforms.uSwellFade.value.set(breakQ, fadeWidth);
}

// Where a wave of this height breaks along the coast: for each section of the
// crest, the first place coming in from offshore where the water is shallower
// than H / 0.78 (the depth-induced breaking criterion, γ = 0.78). Returns q per
// section; a spit or shoal in the way pulls the line out to sea there, which
// is what bends the crest around it.
export function coastBreakLine(definition, height, along0, length, samples = BREAK_SAMPLES, gamma = 0.78) {
  const depthAtBreak = Math.max(height, 0.05) / gamma;
  const line = new Float32Array(samples + 1);
  // No wave this lab draws breaks farther out than this; the shelf beyond only deepens.
  const start = -160;
  for (let i = 0; i <= samples; i += 1) {
    const s = along0 + (i / samples) * length;
    // A crossing from deeper to shallower water; a coast that is shallow all
    // the way out has no unbroken wave to offer, and gets the waterline.
    let found = -1.5;
    let deep = -coastHeight(start, s, definition) > depthAtBreak;
    for (let q = start + 2; q <= 0; q += 2) {
      const shallow = -coastHeight(q, s, definition) <= depthAtBreak;
      if (!(deep && shallow)) { deep = !shallow; continue; }
      let lo = q - 2, hi = q;
      for (let k = 0; k < 8; k += 1) {
        const mid = (lo + hi) / 2;
        if (-coastHeight(mid, s, definition) <= depthAtBreak) hi = mid; else lo = mid;
      }
      found = hi;
      break;
    }
    line[i] = found;
  }
  return line;
}

export const breakLineMean = (line) => line.reduce((sum, q) => sum + q, 0) / line.length;
