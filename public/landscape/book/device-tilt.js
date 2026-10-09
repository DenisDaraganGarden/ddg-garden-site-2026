// Optional mobile camera parallax. It never opens, turns, or deforms the book.
// Contract: window.bookReader.setTilt(x, y), window.bookReader.resetTilt(), and
// document's `book-reader-state` event with { language, active, busy, overlay, phase }.

const INSTANCE_KEY = '__daraganDeviceTilt';
const ACTIVE_PHASE = /^(drag|dragging|turn|turning|cover|opening|closing|focus|zoom)/i;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const shortestAngleDelta = (value, reference) => ((value - reference + 540) % 360) - 180;

function screenAngle() {
  const angle = globalThis.screen?.orientation?.angle ?? globalThis.orientation ?? 0;
  return ((Number(angle) % 360) + 360) % 360;
}

function screenRelativeTilt(beta, gamma) {
  // beta/gamma describe the device axes. Re-map them so x/y keep their visual
  // meaning while the reader rotates between portrait and landscape.
  switch (screenAngle()) {
    case 90: return { x: -beta, y: gamma };
    case 180: return { x: -gamma, y: -beta };
    case 270: return { x: beta, y: -gamma };
    default: return { x: gamma, y: beta };
  }
}

/**
 * Connects an explicit #device-tilt opt-in to a deliberately tiny camera
 * parallax. Calling cleanup removes every listener and resets the camera.
 */
export function setupDeviceTilt(options = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return { cleanup() {} };
  if (!options.force && window[INSTANCE_KEY]) return window[INSTANCE_KEY];

  const button = options.button ?? document.querySelector('#device-tilt');
  const status = options.status ?? document.querySelector('#tilt-status');
  let reader = options.bookReader ?? window.bookReader;
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const coarseQuery = window.matchMedia?.('(pointer: coarse)');
  // ±1 means a 2° camera envelope inside book.js; physical input remains
  // deliberately wider so normal hand jitter never pins the camera at an edge.
  const inputRangeDegrees = clamp(Number(options.inputRangeDegrees ?? 16), 12, 20);
  const deadzone = clamp(Number(options.deadzone ?? .055), 0, .2);

  let destroyed = false;
  let wanted = false;
  let listening = false;
  let pointerHeld = false;
  let calibration = null;
  let state = reader?.getState?.() ?? {};
  let requestToken = 0;
  let pendingPermission = false;
  let missingReadingTimer = 0;
  let statusKey = null;

  const language = () => state?.language === 'en' ? 'en' : 'ru';
  const copy = {
    off: { ru: 'Наклон выключен', en: 'Tilt off' },
    active: { ru: 'Наклон включён', en: 'Tilt on' },
    paused: { ru: 'Наклон приостановлен', en: 'Tilt paused' },
    permission: { ru: 'Разрешите наклон', en: 'Allow tilt' },
    denied: { ru: 'Доступ к наклону отклонён', en: 'Tilt access denied' },
    unavailable: { ru: 'Наклон недоступен', en: 'Tilt unavailable' },
    noReading: { ru: 'Датчик не отвечает', en: 'Sensor unavailable' },
    reduced: { ru: 'Уменьшение движения включено', en: 'Reduced motion is on' },
  };
  const setStatus = key => {
    statusKey = key;
    if (status) status.textContent = copy[key][language()];
  };
  const clearStatus = () => {
    statusKey = null;
    if (status) status.textContent = '';
  };
  const localizeButton = () => {
    if (button) button.textContent = language() === 'en' ? 'Tilt' : 'Наклон';
  };
  const setButton = (pressed, disabled = false) => {
    if (!button) return;
    button.setAttribute('aria-pressed', String(pressed));
    button.disabled = disabled;
  };
  const reset = () => reader?.resetTilt?.();
  const readerReady = () => Boolean(reader?.setTilt && reader?.resetTilt);
  const isSupported = () => Boolean(window.DeviceOrientationEvent) && (window.isSecureContext || location.hostname === 'localhost');
  const shouldOffer = () => Boolean(button && readerReady() && state?.ready === true && isSupported() && coarseQuery?.matches);
  const updateAvailability = () => {
    localizeButton();
    if (!button) return;
    button.hidden = !shouldOffer();
    button.disabled = !shouldOffer() || pendingPermission;
  };

  const readerPausesTilt = () => {
    const phase = String(state?.phase ?? '');
    return state?.ready !== true || document.hidden || motionQuery?.matches || pointerHeld || state?.active === false || Boolean(state?.busy || state?.overlay) || ACTIVE_PHASE.test(phase);
  };

  const clearMissingReadingTimer = () => {
    if (missingReadingTimer) window.clearTimeout(missingReadingTimer);
    missingReadingTimer = 0;
  };

  const stopListening = () => {
    if (listening) window.removeEventListener('deviceorientation', onOrientation);
    listening = false;
    clearMissingReadingTimer();
    calibration = null;
    reset();
  };

  const disable = (statusKey = 'off') => {
    wanted = false;
    pendingPermission = false;
    requestToken += 1;
    stopListening();
    setButton(false, false);
    setStatus(statusKey);
  };

  const onOrientation = event => {
    const { beta, gamma } = event;
    if (typeof beta !== 'number' || typeof gamma !== 'number' || !Number.isFinite(beta) || !Number.isFinite(gamma) || !wanted || pendingPermission || readerPausesTilt()) return;
    clearMissingReadingTimer();
    const reading = screenRelativeTilt(beta, gamma);
    if (!calibration) {
      calibration = reading;
      reset();
      return;
    }
    const x = clamp(shortestAngleDelta(reading.x, calibration.x) / inputRangeDegrees, -1, 1);
    const y = clamp(shortestAngleDelta(reading.y, calibration.y) / inputRangeDegrees, -1, 1);
    reader?.setTilt?.(Math.abs(x) < deadzone ? 0 : x, Math.abs(y) < deadzone ? 0 : y);
  };

  const startListening = () => {
    if (destroyed || !wanted || pendingPermission || listening || readerPausesTilt()) return;
    calibration = null;
    window.addEventListener('deviceorientation', onOrientation, { passive: true });
    listening = true;
    clearMissingReadingTimer();
    missingReadingTimer = window.setTimeout(() => {
      if (!destroyed && wanted && listening && !calibration) disable('noReading');
    }, 2200);
    setButton(true, false);
    setStatus('active');
  };

  const refresh = () => {
    if (destroyed || !wanted || pendingPermission) return;
    if (motionQuery?.matches) return disable('reduced');
    if (readerPausesTilt()) {
      if (listening) stopListening();
      setButton(true, false);
      setStatus('paused');
      return;
    }
    startListening();
  };

  const enableFromClick = async () => {
    if (wanted || destroyed) {
      if (wanted) disable();
      return;
    }
    if (!shouldOffer()) {
      updateAvailability();
      setStatus('unavailable');
      return;
    }
    if (motionQuery?.matches) {
      setStatus('reduced');
      return;
    }
    const token = ++requestToken;
    wanted = true;
    pendingPermission = true;
    setButton(true, true);
    setStatus('permission');
    let permission;
    try {
      const requestPermission = window.DeviceOrientationEvent.requestPermission;
      permission = typeof requestPermission === 'function' ? await requestPermission.call(window.DeviceOrientationEvent) : 'granted';
    } catch {
      pendingPermission = false;
      if (!destroyed && token === requestToken && wanted) disable('denied');
      return;
    }
    pendingPermission = false;
    // Permission may settle after the reader was closed, hidden, or explicitly
    // switched off. Never attach a sensor in that stale session.
    if (destroyed || token !== requestToken || !wanted || document.hidden) return;
    if (permission !== 'granted') return disable('denied');
    setButton(true, false);
    refresh();
  };

  const onState = event => {
    reader = options.bookReader ?? window.bookReader ?? reader;
    state = event.detail ?? reader?.getState?.() ?? state;
    updateAvailability();
    if (statusKey) setStatus(statusKey);
    if (!readerReady()) return;
    refresh();
  };
  const onVisibility = () => {
    if (document.hidden) {
      if (pendingPermission) {
        // A transient activation cannot be carried across backgrounding. The
        // caller must opt in again instead of starting from a late resolution.
        wanted = false;
        pendingPermission = false;
        requestToken += 1;
        reset();
        setButton(false, false);
        setStatus('off');
        return;
      }
      if (listening) stopListening();
      if (wanted) setStatus('paused');
      // An outstanding iOS permission prompt must not activate on return.
      requestToken += 1;
      return;
    }
    refresh();
  };
  const onScreenRotation = () => {
    calibration = null;
    reset();
  };
  const onPointerDown = event => {
    if (event.target?.closest?.('#device-tilt')) return;
    pointerHeld = true;
    refresh();
  };
  const onPointerEnd = () => {
    pointerHeld = false;
    refresh();
  };
  const onPageHide = () => disable();
  const onPageShow = () => {
    reset();
    updateAvailability();
    clearStatus();
  };
  const onCoarseChange = () => {
    if (!shouldOffer() && wanted) disable();
    updateAvailability();
  };

  button?.addEventListener('click', enableFromClick);
  document.addEventListener('book-reader-state', onState);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerEnd, true);
  document.addEventListener('pointercancel', onPointerEnd, true);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('orientationchange', onScreenRotation);
  window.screen?.orientation?.addEventListener?.('change', onScreenRotation);
  motionQuery?.addEventListener?.('change', refresh);
  coarseQuery?.addEventListener?.('change', onCoarseChange);

  // Do not show a desktop/early-load error. The state event will unhide this
  // control once the mobile reader exposes its camera contract.
  updateAvailability();

  const controller = {
    enable: enableFromClick,
    disable,
    cleanup() {
      if (destroyed) return;
      destroyed = true;
      disable();
      button?.removeEventListener('click', enableFromClick);
      document.removeEventListener('book-reader-state', onState);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerEnd, true);
      document.removeEventListener('pointercancel', onPointerEnd, true);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('orientationchange', onScreenRotation);
      window.screen?.orientation?.removeEventListener?.('change', onScreenRotation);
      motionQuery?.removeEventListener?.('change', refresh);
      coarseQuery?.removeEventListener?.('change', onCoarseChange);
      if (window[INSTANCE_KEY] === controller) delete window[INSTANCE_KEY];
    },
  };
  window[INSTANCE_KEY] = controller;
  return controller;
}

export function autoSetupDeviceTilt() {
  if (typeof document === 'undefined') return;
  const connect = () => setupDeviceTilt();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', connect, { once: true });
  else connect();
}

autoSetupDeviceTilt();
