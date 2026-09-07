// Run: node src/components/effects/renderTargetCapabilities.check.js

import assert from 'node:assert/strict';
import {
  formatRenderTargetCapabilities,
  isSoftwareRendererName,
  selectOpticsTarget,
} from './renderTargetCapabilities.js';
import { buildRuntimeQualityProfile, QUALITY_TIER } from './qualityProfile.js';

assert.equal(
  isSoftwareRendererName('ANGLE (Google, Vulkan SwiftShader Device (Subzero))'),
  true,
  'SwiftShader must use the low-cost sky bootstrap instead of blocking first paint',
);
assert.equal(
  isSoftwareRendererName('ANGLE Metal Renderer: Apple M3 Max'),
  false,
  'a hardware renderer must retain the authored high-detail sky',
);
assert.equal(
  buildRuntimeQualityProfile('public', 1440, { softwareRenderer: true }).qualityTier,
  QUALITY_TIER.low,
  'a software renderer must downgrade the whole scene, not only its framebuffer formats',
);

assert.deepEqual(
  selectOpticsTarget({
    'half-float': { depthTexture: true, depthRenderbuffer: true },
    rgba8: { depthTexture: true, depthRenderbuffer: true },
  }),
  { colorType: 'half-float', depthMode: 'texture' },
  'optics should retain half-float and sampled depth whenever the actual framebuffer permits it',
);

assert.deepEqual(
  selectOpticsTarget({
    'half-float': { depthTexture: false, depthRenderbuffer: true },
    rgba8: { depthTexture: true, depthRenderbuffer: true },
  }),
  { colorType: 'rgba8', depthMode: 'texture' },
  'sampled depth must win over HDR colour when a strict WebView rejects the combined target',
);

assert.deepEqual(
  selectOpticsTarget({
    'half-float': { depthTexture: false, depthRenderbuffer: true },
    rgba8: { depthTexture: false, depthRenderbuffer: true },
  }),
  { colorType: 'half-float', depthMode: 'renderbuffer' },
  'half-float remains preferred when both formats require analytic depth',
);

assert.deepEqual(
  selectOpticsTarget({
    'half-float': { depthTexture: false, depthRenderbuffer: false },
    rgba8: { depthTexture: true, depthRenderbuffer: false },
  }),
  { colorType: 'rgba8', depthMode: 'texture' },
  'RGBA8 is the compatibility fallback when a claimed half-float attachment is incomplete',
);

assert.equal(
  formatRenderTargetCapabilities({
    post: { halfFloatDepthStencil: false, rgba8DepthStencil: true },
    optics: { colorType: 'rgba8', depthMode: 'none' },
  }),
  'post: RGBA8 + D24S8 (no MSAA resolve); optics: RGBA8 + analytic depth',
  'diagnostics must expose that single-sample attachment support is not proof of a multisample resolve',
);

assert.equal(
  formatRenderTargetCapabilities({
    post: { halfFloatDepthStencil: false, rgba8DepthStencil: false },
    optics: { colorType: 'rgba8', depthMode: 'none' },
  }),
  'post: disabled (no MSAA resolve); optics: RGBA8 + analytic depth',
  'diagnostics must not claim a depth-stencil fallback that the probe rejected',
);

assert.equal(
  formatRenderTargetCapabilities({
    post: { halfFloatDepthStencil: true, rgba8DepthStencil: true, msaaHalfFloatResolve: true, msaaRgba8Resolve: true },
    optics: { colorType: 'half-float', depthMode: 'texture' },
  }),
  'post: RGBA16F + D24S8 (MSAA HDR); optics: RGBA16F + depth texture',
  'diagnostics must distinguish a verified HDR multisample resolve from an untested attachment pair',
);

console.log('renderTargetCapabilities: all checks passed');
