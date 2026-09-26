/*
 * Numeric scrubbing for the standalone Ouroboros UI study.
 *
 * Public API:
 *   window.setupOuroborosNumericScrub({
 *     root = document, selector = 'input[type="number"]', pixelsPerStep = 4,
 *     finePixelsPerStep = 20, threshold = 3, emitEvents = true,
 *     onStart({ input, initial, gesture }),
 *     onPreview({ input, initial, value, gesture }),
 *     onCommit({ input, initial, value, changed, gesture }),
 *     onCancel({ input, initial, value, changed, gesture }) => false
 *   }) -> cleanup()
 *
 * The callbacks are deliberately model-agnostic. With emitEvents (the default),
 * preview dispatches a bubbling `input` event and commit/cancel dispatches a
 * bubbling `change` event. That lets the existing app.js commitField/history
 * path stay the single writer. Returning false from onCancel suppresses the
 * default rollback events when an integration restores its own transaction.
 * An integration that owns all transactions can set emitEvents:false and write
 * state from the callbacks instead.
 *
 * Pointer behaviour:
 * - primary-button horizontal drag changes by input.step, clamped to min/max;
 * - Shift requires five times more movement per step for fine adjustments;
 * - a click without crossing threshold remains a normal focused number input;
 * - double click selects its text; Escape and pointercancel restore the initial
 *   DOM value. `onCancel` is where an owning app can discard its undo gesture.
 */
(function () {
  'use strict';

  const DEFAULTS = Object.freeze({
    root: document,
    selector: 'input[type="number"]',
    pixelsPerStep: 4,
    finePixelsPerStep: 20,
    threshold: 3,
    emitEvents: true,
    onStart: null,
    onPreview: null,
    onCommit: null,
    onCancel: null,
  });

  const number = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const precisionFor = (value) => {
    const source = String(value);
    if (/e-/i.test(source)) return Math.max(0, Number(source.split(/e-/i)[1]));
    const point = source.indexOf('.');
    return point < 0 ? 0 : source.length - point - 1;
  };

  const detail = (gesture, value = gesture.value) => ({
    input: gesture.input,
    initial: gesture.initial,
    value,
    changed: gesture.changed,
    gesture,
  });

  window.setupOuroborosNumericScrub = function setupOuroborosNumericScrub(options = {}) {
    const settings = { ...DEFAULTS, ...options };
    const root = settings.root || document;
    let active = null;

    const matches = (target) => target instanceof HTMLInputElement
      && target.matches(settings.selector)
      && target.type === 'number'
      && !target.disabled
      && !target.readOnly;

    const dispatch = (input, type) => input.dispatchEvent(new Event(type, { bubbles: true }));

    const write = (gesture, value) => {
      const next = String(value);
      if (gesture.input.value === next) return;
      gesture.input.value = next;
      gesture.value = value;
      gesture.changed = value !== gesture.initial;
      settings.onPreview?.(detail(gesture));
      if (settings.emitEvents) dispatch(gesture.input, 'input');
    };

    const end = (kind) => {
      const gesture = active;
      if (!gesture) return;
      active = null;
      const { input } = gesture;
      input.classList.remove('ouroboros-scrubbing');
      input.removeAttribute('data-scrubbing');
      try { input.releasePointerCapture(gesture.pointerId); } catch { /* capture may already be gone */ }

      // A click belongs to the native number field. It neither starts a
      // transaction nor emits synthetic change events.
      if (!gesture.moved) return;

      if (kind === 'cancel') {
        // Restore DOM before the callback. With emitEvents the existing input
        // handler also sees the rollback and can coalesce the current undo item.
        input.value = String(gesture.initial);
        gesture.value = gesture.initial;
        gesture.changed = false;
        const handled = settings.onCancel?.(detail(gesture));
        if (settings.emitEvents && handled !== false) {
          dispatch(input, 'input');
          dispatch(input, 'change');
        }
        return;
      }

      settings.onCommit?.(detail(gesture));
      if (settings.emitEvents && gesture.changed) dispatch(input, 'change');
    };

    const onPointerDown = (event) => {
      if (event.button !== 0 || !matches(event.target) || active) return;
      const input = event.target;
      const min = number(input.min, -Infinity);
      const max = number(input.max, Infinity);
      const step = Math.abs(number(input.step, 1)) || 1;
      const initial = Math.min(max, Math.max(min, number(input.value, 0)));
      active = {
        input,
        pointerId: event.pointerId,
        startX: event.clientX,
        initial,
        value: initial,
        min,
        max,
        step,
        precision: Math.max(precisionFor(step), precisionFor(initial)),
        moved: false,
        changed: false,
        lastX: event.clientX,
        fractionalSteps: 0,
        accumulatedSteps: 0,
      };
      // Do not preventDefault here: a plain click must preserve normal focusing,
      // caret placement and keyboard number entry.
      try { input.setPointerCapture(event.pointerId); } catch { /* best effort */ }
    };

    const onPointerMove = (event) => {
      const gesture = active;
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const delta = event.clientX - gesture.startX;
      if (!gesture.moved && Math.abs(delta) < settings.threshold) return;

      if (!gesture.moved) {
        gesture.moved = true;
        gesture.input.classList.add('ouroboros-scrubbing');
        gesture.input.dataset.scrubbing = 'true';
        // A plain click must not create an undo checkpoint. Starting here also
        // happens after focus has settled, so blur from the previous field
        // cannot cancel a newly captured checkpoint.
        settings.onStart?.(detail(gesture));
      }
      event.preventDefault();

      const sensitivity = event.shiftKey ? settings.finePixelsPerStep : settings.pixelsPerStep;
      // Accumulate fractional *steps*, not absolute pixels. Changing Shift
      // midway therefore changes only subsequent movement and never jumps back
      // to a value calculated from startX under a different sensitivity.
      gesture.fractionalSteps += (event.clientX - gesture.lastX) / Math.max(1, sensitivity);
      gesture.lastX = event.clientX;
      const steps = Math.trunc(gesture.fractionalSteps);
      gesture.fractionalSteps -= steps;
      if (!steps) return;

      gesture.accumulatedSteps += steps;
      let value = gesture.initial + gesture.accumulatedSteps * gesture.step;
      value = Math.min(gesture.max, Math.max(gesture.min, value));
      // Avoid values such as 0.30000000000000004 while retaining declared step.
      value = Number(value.toFixed(gesture.precision));
      write(gesture, value);
    };

    const onPointerUp = (event) => {
      if (active && event.pointerId === active.pointerId) end('commit');
    };

    const onPointerCancel = (event) => {
      if (active && event.pointerId === active.pointerId) end('cancel');
    };

    const onLostCapture = (event) => {
      if (active && event.pointerId === active.pointerId) end('cancel');
    };

    const onBlur = (event) => {
      if (active && event.target === active.input) end('cancel');
    };

    const onDoubleClick = (event) => {
      if (!matches(event.target)) return;
      event.target.focus({ preventScroll: true });
      try { event.target.select(); } catch { /* number selection varies by browser */ }
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && active) {
        event.preventDefault();
        event.stopImmediatePropagation();
        end('cancel');
      }
    };

    const onWindowBlur = () => {
      if (active) end('cancel');
    };

    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove, { passive: false });
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerCancel);
    root.addEventListener('lostpointercapture', onLostCapture, true);
    root.addEventListener('focusout', onBlur, true);
    root.addEventListener('dblclick', onDoubleClick);
    root.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onWindowBlur);

    return function cleanupOuroborosNumericScrub() {
      if (active) end('cancel');
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('pointercancel', onPointerCancel);
      root.removeEventListener('lostpointercapture', onLostCapture, true);
      root.removeEventListener('focusout', onBlur, true);
      root.removeEventListener('dblclick', onDoubleClick);
      root.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onWindowBlur);
    };
  };
}());
