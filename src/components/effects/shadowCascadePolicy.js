// Pure policy only. The CSM adapter is deliberately separate: Three's addon
// needs every Standard/Physical material registered before it can be enabled.
// Keeping the selection here makes the published setting stable while devices
// without that adapter retain the existing single-map renderer.

export function resolveShadowCascadeCount({
  requested = 'auto',
  isLowPower = false,
  isMobileDevice = false,
  csmReady = false,
} = {}) {
  if (!csmReady || isLowPower || isMobileDevice || requested === 1 || requested === '1') return 1;
  if (requested === 2 || requested === '2' || requested === 'auto') return 2;
  return 1;
}
