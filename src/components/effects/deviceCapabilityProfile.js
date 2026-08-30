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
