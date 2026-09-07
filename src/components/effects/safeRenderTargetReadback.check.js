import { readRenderTargetPixelsWithPboGuard } from './safeRenderTargetReadback.js';
import assert from 'node:assert/strict';

const PBO = 0x88eb;
const BINDING = 0x88ed;
const original = { id: 'async-probe-pbo' };
const calls = [];
let bound = original;
const gl = {
  PIXEL_PACK_BUFFER: PBO,
  PIXEL_PACK_BUFFER_BINDING: BINDING,
  getParameter: (key) => key === BINDING ? bound : null,
  bindBuffer: (target, value) => { calls.push([target, value]); bound = value; },
};
const target = {};
const output = new Uint8Array(4);
const renderer = {
  getContext: () => gl,
  readRenderTargetPixels: (_target, _x, _y, _width, _height, result) => {
    if (bound !== null) throw new Error('read ran with a PIXEL_PACK_BUFFER bound');
    result[0] = 17;
  },
};
if (!readRenderTargetPixelsWithPboGuard(renderer, target, 0, 0, 1, 1, output)) throw new Error('missing prior binding report');
if (bound !== original || output[0] !== 17 || calls.length !== 2 || calls[0][1] !== null || calls[1][1] !== original) throw new Error('success path did not restore PBO');
renderer.readRenderTargetPixels = () => { if (bound !== null) throw new Error('read ran bound'); throw new Error('expected read failure'); };
assert.throws(() => readRenderTargetPixelsWithPboGuard(renderer, target, 0, 0, 1, 1, output), /expected read failure/);
if (bound !== original) throw new Error('throw path did not restore PBO');
console.log('safeRenderTargetReadback: PBO detached during read and restored on success/throw');
