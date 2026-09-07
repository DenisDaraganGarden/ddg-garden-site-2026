// Async WebGL probes can leave a PIXEL_PACK_BUFFER bound while awaiting a
// fence. WebGL forbids ordinary typed-array readPixels in that state. Guard a
// synchronous read without changing the caller's async probe ownership.
export function readRenderTargetPixelsWithPboGuard(renderer, target, x, y, width, height, output) {
  const gl = renderer.getContext();
  const pboTarget = gl.PIXEL_PACK_BUFFER;
  const binding = pboTarget ? gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) : null;
  if (pboTarget) gl.bindBuffer(pboTarget, null);
  try {
    renderer.readRenderTargetPixels(target, x, y, width, height, output);
  } finally {
    if (pboTarget) gl.bindBuffer(pboTarget, binding);
  }
  return Boolean(binding);
}
