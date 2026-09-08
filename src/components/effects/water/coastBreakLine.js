import { coastHeight } from '../../../terrain/terrainModel.js';

// Pure maths of the break line, apart from the GPU plumbing in coastFrame.js
// so a node check can run it against the real coast.

export const BREAK_SAMPLES = 48;

// Where a wave of this height breaks along the coast: for each section of the
// crest, the first place coming in from offshore where the water is shallower
// than H / 0.78 (the depth-induced breaking criterion, γ = 0.78). Returns q per
// section; a spit or shoal in the way pulls the line out to sea there, which
// is what bends the crest around it.
// heightAt(s): the wave's height at that section, when it varies along the
// crest; the plain height otherwise.
export function coastBreakLine(definition, height, along0, length, samples = BREAK_SAMPLES, gamma = 0.78, heightAt = null) {
  const line = new Float32Array(samples + 1);
  // No wave this lab draws breaks farther out than this; the shelf beyond only deepens.
  const start = -160;
  for (let i = 0; i <= samples; i += 1) {
    const s = along0 + (i / samples) * length;
    const depthAtBreak = Math.max(heightAt ? heightAt(s) : height, 0.05) / gamma;
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
  // The samples are 6 m apart and the ribbon's columns 1.75 m: read raw, the
  // line is a polyline and the crest kinks by up to 17 degrees where the spit's
  // shoal pulls it out. One 1-2-1 pass costs nothing and, on the open beach
  // where every sample is equal, changes nothing.
  const smoothed = Float32Array.from(line);
  for (let i = 1; i < samples; i += 1) smoothed[i] = 0.25 * line[i - 1] + 0.5 * line[i] + 0.25 * line[i + 1];
  return smoothed;
}

export const breakLineMean = (line) => line.reduce((sum, q) => sum + q, 0) / line.length;
