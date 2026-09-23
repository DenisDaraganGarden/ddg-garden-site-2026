import { useEffect } from 'react';
import { SURF_CAMERAS, cycleSurfCamera, setSurfCamera, surfPlay } from './surfPlayStore.js';

// Held keys drive an axis for as long as they are down. W and ↑ are tracked
// apart, so letting go of one while the other is still held keeps the axis.
const HELD = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'pump', ShiftRight: 'pump',
};
// Pop is an edge for the physics, but a tap can begin and end between two
// frames. It stays true this long after the key goes down; the board's pop
// cooldown (0.8 s) makes that one pop, and the scene may clear it on reading.
export const POP_HOLD_MS = 250;
const EDGE = /^(Space|KeyC|KeyR|KeyT|KeyP|Escape|Tab|Digit[1-4])$/;
const PITCH_LIMIT = 1.2;
const ZOOM_LIMITS = [0.4, 3];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
// Text fields keep their letters. A slider, a checkbox or a button keeps
// focus after a click, and P under «Играть ▸ (P)» still plays from there, the
// way Space still pauses.
const isTypingTarget = (target) => Boolean(target?.closest?.('textarea,select,[contenteditable=true],dialog'))
  || (target?.tagName === 'INPUT' && !['checkbox', 'range', 'button'].includes(target.type));
export const startsPlay = (event) => event.code === 'KeyP' && !event.repeat && !event.defaultPrevented
  && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && !isTypingTarget(event.target);

// The play controls as plain handlers over the shared store, so a node check
// can drive them with fake events. Keys are taken in the capture phase and
// stopped there: the editor's own listeners (tools, Space pause, Tab, flight)
// never see a key that belongs to the board. ⌘/Ctrl combinations pass through
// to the browser and the app menu.
//
// Look: yaw turns the view about +Y in three.js's sense (positive = left), so
// dragging right makes it negative; pitch is positive looking up, so dragging
// down makes it negative. One window height of drag is a full turn, as with
// the editor's orbit. The wheel scales the camera distance (down = farther).
export function createPlayControls(stop) {
  const held = new Set();
  let popTimer = 0;
  let drag = null;

  const syncHeld = () => {
    const { input } = surfPlay;
    input.forward = 0; input.back = 0; input.left = 0; input.right = 0; input.pump = false;
    held.forEach((code) => {
      const axis = HELD[code];
      if (axis === 'pump') input.pump = true;
      else input[axis] = 1;
    });
  };
  const release = () => {
    held.clear();
    drag = null;
    syncHeld();
  };

  const keydown = (event) => {
    if (event.metaKey || event.ctrlKey) return false;
    const { code } = event;
    if (HELD[code]) {
      held.add(code);
      syncHeld();
    } else if (!EDGE.test(code)) return false;
    // A held edge key fires once: P held down would leave and come back.
    else if (event.repeat) { /* swallowed */ }
    else if (code === 'Space') {
      surfPlay.input.pop = true;
      clearTimeout(popTimer);
      popTimer = setTimeout(() => { surfPlay.input.pop = false; }, POP_HOLD_MS);
    } else if (code === 'KeyC') cycleSurfCamera();
    else if (code.startsWith('Digit')) setSurfCamera(SURF_CAMERAS[Number(code.slice(5)) - 1]);
    else if (code === 'KeyR') surfPlay.respawnRequest += 1;
    else if (code === 'KeyT') surfPlay.checkpointRequest += 1;
    else if (code === 'Escape' || code === 'KeyP') stop();
    // Tab only is swallowed: it would walk the focus through hidden chrome.
    event.preventDefault();
    event.stopPropagation();
    return true;
  };
  const keyup = (event) => {
    if (HELD[event.code]) {
      held.delete(event.code);
      syncHeld();
    }
    // A button that kept focus would click on Space's keyup.
    if (HELD[event.code] || event.code === 'Space') event.preventDefault();
  };

  const onCanvas = (event) => event.target?.tagName === 'CANVAS' && Boolean(event.target.closest?.('.home-editor-render-frame'));
  const pointerdown = (event) => {
    if ((event.button === 0 || event.button === 2) && onCanvas(event)) drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const pointermove = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const { look } = surfPlay;
    const turn = (2 * Math.PI) / Math.max(1, window.innerHeight);
    look.yaw -= (event.clientX - drag.x) * turn;
    look.pitch = clamp(look.pitch - (event.clientY - drag.y) * turn, -PITCH_LIMIT, PITCH_LIMIT);
    drag.x = event.clientX; drag.y = event.clientY;
  };
  const pointerup = (event) => {
    if (drag?.id === event.pointerId) drag = null;
  };
  const wheel = (event) => {
    if (!onCanvas(event)) return;
    event.preventDefault();
    surfPlay.look.zoom = clamp(surfPlay.look.zoom * Math.exp(event.deltaY * 0.001), ...ZOOM_LIMITS);
  };

  const dispose = () => {
    clearTimeout(popTimer);
    surfPlay.input.pop = false;
    release();
  };

  return { keydown, keyup, release, pointerdown, pointermove, pointerup, wheel, dispose };
}

// Outside play, P starts it; inside, the board owns the keyboard and the drag.
export function usePlayKeys(playing, start, stop) {
  useEffect(() => {
    if (!playing) {
      const keydown = (event) => {
        if (!startsPlay(event)) return;
        event.preventDefault();
        start();
      };
      window.addEventListener('keydown', keydown);
      return () => window.removeEventListener('keydown', keydown);
    }

    const controls = createPlayControls(stop);
    const listeners = [
      ['keydown', controls.keydown, true],
      ['keyup', controls.keyup, true],
      ['blur', controls.release, false],
      ['pointerdown', controls.pointerdown, true],
      ['pointermove', controls.pointermove, false],
      ['pointerup', controls.pointerup, false],
      ['pointercancel', controls.pointerup, false],
      ['wheel', controls.wheel, { passive: false }],
    ];
    listeners.forEach(([type, listener, options]) => window.addEventListener(type, listener, options));
    return () => {
      listeners.forEach(([type, listener, options]) => window.removeEventListener(type, listener, options));
      controls.dispose();
    };
  }, [playing, start, stop]);
}

export default usePlayKeys;
