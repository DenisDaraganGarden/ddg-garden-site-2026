const MIN_BEAM_DEGREES = 12;
const MAX_BEAM_DEGREES = 70;
const DEFAULT_BEAM_DEGREES = 34;

let controls = {
  available: false,
  enabled: false,
  beamDegrees: DEFAULT_BEAM_DEGREES,
};

const runtime = {
  enabled: controls.enabled,
  beamDegrees: controls.beamDegrees,
  clientX: -100,
  clientY: -100,
  pointerInsideFrame: false,
};

const listeners = new Set();

const publishControls = (nextControls) => {
  controls = nextControls;
  runtime.enabled = nextControls.enabled;
  runtime.beamDegrees = nextControls.beamDegrees;
  listeners.forEach((listener) => listener());
};

export const getCursorFlashlightSnapshot = () => controls;
export const getCursorFlashlightServerSnapshot = () => controls;
export const getCursorFlashlightRuntime = () => runtime;

export const subscribeToCursorFlashlight = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const setCursorFlashlightAvailable = (available) => {
  const nextAvailable = Boolean(available);
  if (nextAvailable === controls.available) {
    return;
  }

  publishControls({
    ...controls,
    available: nextAvailable,
    enabled: nextAvailable ? controls.enabled : false,
  });
};

export const setCursorFlashlightEnabled = (enabled) => {
  const nextEnabled = Boolean(enabled);
  if (nextEnabled === controls.enabled) {
    return;
  }

  publishControls({ ...controls, enabled: nextEnabled });
};

export const toggleCursorFlashlight = () => {
  publishControls({ ...controls, enabled: !controls.enabled });
};

export const adjustCursorFlashlightBeam = (wheelDelta) => {
  const direction = Math.sign(wheelDelta);
  if (direction === 0) {
    return;
  }

  const beamDegrees = Math.min(
    MAX_BEAM_DEGREES,
    Math.max(MIN_BEAM_DEGREES, controls.beamDegrees + (direction * 3)),
  );

  if (beamDegrees === controls.beamDegrees) {
    return;
  }

  publishControls({ ...controls, beamDegrees });
};

export const updateCursorFlashlightPointer = (clientX, clientY, pointerInsideFrame) => {
  runtime.clientX = clientX;
  runtime.clientY = clientY;
  runtime.pointerInsideFrame = Boolean(pointerInsideFrame);
};

export const hideCursorFlashlight = () => {
  runtime.pointerInsideFrame = false;
};
