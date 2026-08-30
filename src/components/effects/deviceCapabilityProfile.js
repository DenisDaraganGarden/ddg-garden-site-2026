export const DEVICE_PERFORMANCE_TIER = Object.freeze({
  low: 'low',
  medium: 'medium',
  high: 'high',
});

export function classifyDevicePerformance({ deviceMemory = null, hardwareConcurrency = null } = {}) {
  const hasMemoryHint = typeof deviceMemory === 'number' && Number.isFinite(deviceMemory);
  const hasCoreHint = typeof hardwareConcurrency === 'number' && Number.isFinite(hardwareConcurrency);

  // Four gigabytes is common on capable, multi-core Android phones. It merits
  // smaller transient targets, not a low-DPR canvas with MSAA switched off.
  if (hasMemoryHint && (deviceMemory <= 2 || (deviceMemory <= 3 && hasCoreHint && hardwareConcurrency <= 4))) {
    return DEVICE_PERFORMANCE_TIER.low;
  }
  if (!hasMemoryHint && hasCoreHint && hardwareConcurrency <= 2) {
    return DEVICE_PERFORMANCE_TIER.low;
  }
  if ((hasMemoryHint && deviceMemory <= 6) || (!hasMemoryHint && hasCoreHint && hardwareConcurrency <= 6)) {
    return DEVICE_PERFORMANCE_TIER.medium;
  }
  return DEVICE_PERFORMANCE_TIER.high;
}

export function readRuntimeDevicePerformanceTier() {
  if (typeof navigator === 'undefined') {
    return DEVICE_PERFORMANCE_TIER.high;
  }

  return classifyDevicePerformance({
    deviceMemory: navigator.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
  });
}

// A DPR-3 phone can request a 3× render scale through authored settings. The
// final frame is a shader-heavy 3D image, not text: two physical pixels per CSS
// pixel stay crisp while the third costs another 125% shaded area. Desktop
// monitors keep their authored cap; only touch-primary runtimes get this guard.
export function capRuntimePixelRatio({ devicePixelRatio = 1, touchPrimary = false } = {}) {
  const physicalRatio = Math.max(1, Number(devicePixelRatio) || 1);
  return touchPrimary ? Math.min(physicalRatio, 2) : physicalRatio;
}
