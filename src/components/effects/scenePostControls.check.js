// Run: node src/components/effects/scenePostControls.check.js
//
// Post controls that used to act on a sliver of their range: each must now act
// over all of it, and each must keep the frame it has always drawn at the value
// the scenes carry (bloom radius 58%, ray decay 0.93).

import assert from 'node:assert/strict';
import { bloomBlurSteps, sunRayFadeStart } from './scenePostShaders.js';
import { createCloudShadowUniforms, updateCloudShadowUniforms } from './sky/painterly/cloudShadowRuntime.js';

const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);
const spread = (steps) => steps.reduce((sum, step) => sum + step * step, 0);
const LIMITS = [1.05, 2, 3, 4];

// --- bloom radius ------------------------------------------------------------

for (const lowPower of [false, true]) {
  const tier = lowPower ? 'low power' : 'desktop';
  // The old formula at 58%, where it had long since hit its cap.
  const old58 = lowPower ? [1.05] : [1.05, 2];
  const steps58 = bloomBlurSteps(0.58, lowPower);
  assert.equal(steps58.length, old58.length, `${tier}: 58% keeps its passes`);
  steps58.forEach((step, index) => near(step, old58[index], `${tier}: 58% keeps its step ${index}`));
  // And its minimum at 0, where the old formula started.
  bloomBlurSteps(0, lowPower).forEach((step, index) => near(step, [0.8, 1.4][index], `${tier}: 0 keeps its step ${index}`));

  let previous = spread(bloomBlurSteps(0, lowPower));
  let largestJump = 0;
  for (let percent = 1; percent <= 100; percent += 1) {
    const steps = bloomBlurSteps(percent / 100, lowPower);
    steps.forEach((step, index) => assert.ok(step <= LIMITS[index] + 1e-9, `${tier} ${percent}%: pass ${index} stays a tent (${step})`));
    const current = spread(steps);
    assert.ok(current > previous, `${tier}: ${percent}% is wider than ${percent - 1}%`);
    largestJump = Math.max(largestJump, current / previous);
    previous = current;
  }
  assert.ok(largestJump < 1.07, `${tier}: no 1% step jumps the width (${largestJump})`);
  assert.ok(previous > spread(steps58) * (lowPower ? 2.5 : 3.5), `${tier}: 100% is a much wider glow than 58%`);
}
assert.equal(bloomBlurSteps(1).length, 4, 'the widest glow uses all four passes');

// --- sun ray decay ---------------------------------------------------------------

near(sunRayFadeStart(0.93), 0.68, 'the default keeps the old 68% plateau');
near(sunRayFadeStart(0.72), 0, 'the lowest decay fades from the disc');
near(sunRayFadeStart(0.995), 0.95, 'the highest holds the rays almost to their reach');
for (let decay = 0.725; decay <= 0.995; decay += 0.005) {
  assert.ok(sunRayFadeStart(decay) > sunRayFadeStart(decay - 0.005), `decay ${decay.toFixed(3)} acts`);
}

// --- cloud shadow strength -----------------------------------------------------

{
  const descriptor = { enabled: true, texture: { isTexture: true }, strength: 0 };
  const receivers = updateCloudShadowUniforms(createCloudShadowUniforms(), descriptor);
  assert.equal(receivers.uDdgCloudShadowEnabled.value, 0, 'strength 0 casts no shadow on receivers');
  const post = updateCloudShadowUniforms(createCloudShadowUniforms(), descriptor, 1);
  assert.equal(post.uDdgCloudShadowEnabled.value, 1, 'the post pass still sees the clouds: shafts and rain');
  assert.equal(post.uDdgCloudShadowStrength.value, 1, 'and sees them whole');
  assert.equal(updateCloudShadowUniforms(createCloudShadowUniforms(), { ...descriptor, enabled: false }, 1).uDdgCloudShadowEnabled.value, 0,
    'no clouds, no shafts');
}

console.log('scenePostControls: bloom radius, ray decay and cloud-shadow independence hold');
