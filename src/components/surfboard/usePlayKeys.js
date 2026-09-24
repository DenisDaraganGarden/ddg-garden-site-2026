import { useEffect } from 'react';
import { SURF_CAMERAS, cycleSurfCamera, publishSurfPlay, setSurfCamera, surfPlay } from './surfPlayStore.js';

// Held keys and what each asks of the rider. W and ↑ are tracked apart, so
// letting go of one while the other is still held keeps the axis.
const HELD = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'crouch', ShiftRight: 'crouch', KeyQ: 'lookBack',
};
// Pop is an edge for the physics, but a tap can begin and end between two
// frames. It stays true this long after the press; the board's pop cooldown
// (0.8 s) makes that one pop, and the scene may clear it on reading.
export const POP_HOLD_MS = 250;
const EDGE = /^(Space|KeyC|KeyF|KeyH|KeyL|KeyR|KeyT|KeyP|Escape|Tab|Digit[1-4])$/;
const PITCH_LIMIT = 1.2;
const ZOOM_LIMITS = [0.4, 3];
// A held key or button goes from rest to full in RISE seconds and back in
// FALL: a tap is a small lean, a hold a full carve, and nothing snaps.
const RISE = 0.25;
const FALL = 0.2;
// The captured mouse is a stick. This much travel (px) is full deflection;
// left alone it drifts home, halving every STICK_HALF_LIFE seconds, so a hand
// that lets go straightens up slowly; inside the deadzone a resting hand does
// not steer.
const STICK_TRAVEL = 220;
const STICK_HALF_LIFE = 1.5;
const STICK_DEADZONE = 0.06;
// A press on the canvas that travels less than this (px) is a click and
// captures the mouse; a longer one stays a drag of the view, as in the picker.
const CLICK_SLOP = 4;
// The gamepad, standard mapping. The sticks share a radial deadzone; a trigger
// is a stroke when pulled past TRIGGER_ON and ready for the next one below
// TRIGGER_OFF, so a finger resting near half does not stroke twice. The right
// stick turns the view at these rates (rad/s) at full deflection.
export const PAD_DEADZONE = 0.15;
const TRIGGER_DEADZONE = 0.05;
const TRIGGER_ON = 0.5;
const TRIGGER_OFF = 0.35;
export const LOOK_YAW_RATE = 2.5;
export const LOOK_PITCH_RATE = 1.5;
export const BUTTON = { A: 0, B: 1, X: 2, Y: 3, LB: 4, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13 };
const PAD_BUTTONS = 17;
const AXES = ['lean', 'trim', 'crouch', 'grab', 'lookBack'];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const zero = (target) => AXES.forEach((axis) => { target[axis] = 0; });
// Toward the target at the rise rate while moving away from rest, at the fall
// rate coming back, crossing to the other side included.
const slew = (value, target, dt) => {
  const step = (Math.abs(target) > Math.abs(value) && target * value >= 0 ? 1 / RISE : 1 / FALL) * dt;
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
};
// A radial deadzone rescaled from its edge: the stick keeps its direction, and
// full deflection is still full. Writes into `out`, so a frame allocates nothing.
export const radial = (out, x, y, deadzone) => {
  const r = Math.hypot(x, y);
  const k = r > deadzone ? Math.min(1, (r - deadzone) / (1 - deadzone)) / r : 0;
  out.x = x * k; out.y = y * k;
  return out;
};
export const trigger = (value) => clamp((value - TRIGGER_DEADZONE) / (1 - TRIGGER_DEADZONE), 0, 1);
const buttonDown = (button, index, was) => (index === BUTTON.LT || index === BUTTON.RT
  ? button.value > (was ? TRIGGER_OFF : TRIGGER_ON)
  : button.pressed);

// Text fields keep their letters. A slider, a checkbox or a button keeps
// focus after a click, and P under «Играть ▸ (P)» still plays from there, the
// way Space still pauses.
const isTypingTarget = (target) => Boolean(target?.closest?.('textarea,select,[contenteditable=true],dialog'))
  || (target?.tagName === 'INPUT' && !['checkbox', 'range', 'button'].includes(target.type));
export const startsPlay = (event) => event.code === 'KeyP' && !event.repeat && !event.defaultPrevented
  && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && !isTypingTarget(event.target);

// The raw motion of the hand if the browser gives it, the accelerated one if
// not. A refusal (Chrome refuses for a moment after Esc) leaves the drag.
const requestLock = (element) => {
  const plain = () => {
    try { element.requestPointerLock()?.catch?.(() => {}); } catch { /* refused: the drag stays */ }
  };
  try {
    element.requestPointerLock({ unadjustedMovement: true })?.catch?.(plain);
  } catch {
    plain();
  }
};

// What the controls need from the page, apart so a node check can stand in.
// A page without the permission for gamepads throws rather than answering.
const browser = {
  gamepads: () => {
    try { return navigator.getGamepads?.() ?? []; } catch { return []; }
  },
  unlock: (element) => {
    if (element && document.pointerLockElement === element) document.exitPointerLock?.();
  },
};

// The play controls as plain handlers over the shared store, so a node check
// can drive them with fake events. Keyboard, mouse and gamepad all write one
// intent: the held keys and buttons ramp, the sticks are analog already, and
// every device adds in, so whichever hand moves is the one that steers. The
// legacy `input` is derived from the intent every frame for the board that
// still reads it.
//
// Keys are taken in the capture phase and stopped there: the editor's own
// listeners (tools, Space pause, Tab, flight) never see a key that belongs to
// the board. ⌘/Ctrl combinations pass through to the browser and the app menu.
//
// Look: yaw turns the view about +Y in three.js's sense (positive = left), so
// dragging right makes it negative; pitch is positive looking up, so dragging
// down makes it negative. One window height of drag is a full turn, as with
// the editor's orbit. The wheel scales the camera distance (down = farther).
export function createPlayControls(stop, env = browser) {
  const held = new Set();
  const want = { lean: 0, trim: 0, crouch: 0, lookBack: 0 };
  const ramp = { lean: 0, trim: 0, crouch: 0, grab: 0, lookBack: 0 };
  const pad = { index: -1, stale: true, lean: 0, trim: 0, crouch: 0, grab: 0, lookBack: 0, down: new Uint8Array(PAD_BUTTONS) };
  const scratch = { x: 0, y: 0 };
  let buttons = 0; // mouse buttons held while captured, MouseEvent.buttons bits
  let drag = null;
  let lockTarget = null;
  let clock = 0;
  let popAt = -1;

  // The legend follows the hand; the HUD hears only a change.
  const steerWith = (device) => {
    if (surfPlay.intent.device === device) return;
    surfPlay.intent.device = device;
    publishSurfPlay();
  };
  const holding = (axis) => {
    for (const code of held) if (HELD[code] === axis) return 1;
    return 0;
  };
  const syncHeld = () => {
    want.trim = holding('forward') - holding('back');
    want.lean = holding('right') - holding('left');
    want.crouch = holding('crouch');
    want.lookBack = holding('lookBack');
  };
  const popUp = () => {
    surfPlay.intent.popUp += 1;
    surfPlay.input.pop = true;
    popAt = clock;
  };
  // The board still reads the on/off input until it moves to the intent.
  const derive = () => {
    const { intent, input } = surfPlay;
    input.forward = Math.max(intent.trim, 0);
    input.back = Math.max(-intent.trim, 0);
    input.left = Math.max(-intent.lean, 0);
    input.right = Math.max(intent.lean, 0);
    input.pump = intent.crouch > 0.5;
    if (popAt >= 0 && clock - popAt >= POP_HOLD_MS / 1000) {
      input.pop = false;
      popAt = -1;
    }
  };
  // Nothing the hand did while the mouse was captured outlives the capture.
  const dropMouse = () => {
    const { mouse: stick, intent } = surfPlay;
    stick.locked = false; stick.x = 0; stick.y = 0;
    buttons = 0;
    if (intent.device === 'mouse') intent.device = 'keyboard';
  };

  const release = () => {
    const { intent, input, mouse: stick } = surfPlay;
    held.clear();
    syncHeld();
    buttons = 0;
    drag = null;
    stick.x = 0; stick.y = 0;
    zero(ramp); zero(pad); zero(intent);
    // Whatever is held when the pad is read again is not a new press.
    pad.stale = true;
    input.pop = false;
    popAt = -1;
    derive();
  };

  const keydown = (event) => {
    if (event.metaKey || event.ctrlKey) return false;
    const { code } = event;
    if (HELD[code]) {
      held.add(code);
      syncHeld();
      if (!event.repeat) steerWith('keyboard');
    } else if (!EDGE.test(code)) return false;
    // A held edge key fires once: P held down would leave and come back.
    else if (event.repeat) { /* swallowed */ }
    else if (code === 'Space') popUp();
    // The board (jump off it, climb on, carry it, put it down) and the leash.
    else if (code === 'KeyF') surfPlay.intent.board += 1;
    else if (code === 'KeyL') surfPlay.intent.leash += 1;
    // The HUD's full list of keys.
    else if (code === 'KeyH') { surfPlay.keysOpen = !surfPlay.keysOpen; publishSurfPlay(); }
    else if (code === 'KeyC') cycleSurfCamera();
    else if (code.startsWith('Digit')) setSurfCamera(SURF_CAMERAS[Number(code.slice(5)) - 1]);
    else if (code === 'KeyR') surfPlay.respawnRequest += 1;
    else if (code === 'KeyT') surfPlay.checkpointRequest += 1;
    // The browser usually keeps this Esc to itself and lets go of the mouse;
    // one that does get through lets go of it too. The next Esc leaves.
    else if (code === 'Escape' && surfPlay.mouse.locked) env.unlock(lockTarget);
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

  // The free mouse drags the view; a click on the canvas captures it.
  const onCanvas = (event) => event.target?.tagName === 'CANVAS' && Boolean(event.target.closest?.('.home-editor-render-frame'));
  const pointerdown = (event) => {
    if (surfPlay.mouse.locked || (event.button !== 0 && event.button !== 2) || !onCanvas(event)) return;
    drag = { id: event.pointerId, button: event.button, target: event.target, x: event.clientX, y: event.clientY, x0: event.clientX, y0: event.clientY };
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
    if (drag?.id !== event.pointerId) return;
    if (drag.button === 0 && Math.hypot(event.clientX - drag.x0, event.clientY - drag.y0) <= CLICK_SLOP) {
      lockTarget = drag.target;
      requestLock(lockTarget);
    }
    drag = null;
  };
  const pointercancel = (event) => {
    if (drag?.id === event.pointerId) drag = null;
  };
  const wheel = (event) => {
    if (!onCanvas(event)) return;
    event.preventDefault();
    surfPlay.look.zoom = clamp(surfPlay.look.zoom * Math.exp(event.deltaY * 0.001), ...ZOOM_LIMITS);
  };

  // The captured mouse (mousedown, mousemove, mouseup): its motion pushes the
  // stick, its buttons are the arms. A chord (a second button while the first
  // is held) arrives only as a change of `buttons`, so presses are read from
  // that mask and not from which button the event names.
  const mouse = (event) => {
    const { intent, mouse: stick } = surfPlay;
    if (!stick.locked) return;
    stick.x += (event.movementX || 0) / STICK_TRAVEL;
    stick.y += (event.movementY || 0) / STICK_TRAVEL;
    const r = Math.hypot(stick.x, stick.y);
    if (r > 1) { stick.x /= r; stick.y /= r; }
    const next = event.buttons | 0;
    const pressed = next & ~buttons;
    if (pressed & 1) intent.strokeLeft += 1;
    if (pressed & 2) intent.strokeRight += 1;
    buttons = next;
    steerWith('mouse');
  };
  const contextmenu = (event) => {
    if (surfPlay.mouse.locked) event.preventDefault();
  };
  // pointerlockchange: `element` is document.pointerLockElement.
  const lockChange = (element) => {
    const locked = Boolean(element) && element === lockTarget;
    if (locked === surfPlay.mouse.locked) return;
    drag = null;
    if (locked) {
      const { mouse: stick, intent } = surfPlay;
      stick.locked = true; stick.x = 0; stick.y = 0;
      intent.device = 'mouse';
    } else dropMouse();
    publishSurfPlay();
  };

  // Chrome hands out a fresh snapshot of the pad on every poll, so the
  // actuator is looked up when the board asks, not kept from the frame the
  // pad was found. A pad that cannot vibrate right now just refuses.
  const rumbleFor = (index) => (strong, weak, ms) => {
    env.gamepads()[index]?.vibrationActuator?.playEffect?.('dual-rumble', {
      startDelay: 0,
      duration: ms,
      strongMagnitude: clamp(strong, 0, 1),
      weakMagnitude: clamp(weak, 0, 1),
    })?.catch?.(() => {});
  };
  // Whatever is already held when a pad is taken (the press that woke it for
  // the page, a button kept down through a blur) is not a press.
  const takePad = (found) => {
    pad.index = found ? found.index : -1;
    pad.stale = false;
    zero(pad);
    for (let i = 0; i < PAD_BUTTONS; i += 1) {
      const button = found?.buttons[i];
      pad.down[i] = button && buttonDown(button, i, false) ? 1 : 0;
    }
    surfPlay.rumble = found?.vibrationActuator ? rumbleFor(found.index) : null;
    if (surfPlay.gamepad !== Boolean(found)) {
      surfPlay.gamepad = Boolean(found);
      publishSurfPlay();
    }
  };
  const padChange = () => { pad.stale = true; };
  const pollPad = (dt) => {
    const pads = env.gamepads();
    let found = null;
    for (let i = 0; i < pads.length && !found; i += 1) {
      if (pads[i]?.connected && pads[i].mapping === 'standard') found = pads[i];
    }
    if (pad.stale || (found ? found.index : -1) !== pad.index) takePad(found);
    if (!found) return;
    const { intent, look } = surfPlay;
    const { axes } = found;
    radial(scratch, axes[0] || 0, axes[1] || 0, PAD_DEADZONE);
    pad.lean = scratch.x;
    pad.trim = -scratch.y;
    let active = scratch.x !== 0 || scratch.y !== 0;
    radial(scratch, axes[2] || 0, axes[3] || 0, PAD_DEADZONE);
    if (scratch.x !== 0 || scratch.y !== 0) {
      active = true;
      look.yaw -= scratch.x * LOOK_YAW_RATE * dt;
      look.pitch = clamp(look.pitch - scratch.y * LOOK_PITCH_RATE * dt, -PITCH_LIMIT, PITCH_LIMIT);
    }
    const keys = found.buttons;
    pad.crouch = trigger(keys[BUTTON.RT]?.value || 0);
    pad.grab = trigger(keys[BUTTON.LT]?.value || 0);
    pad.lookBack = keys[BUTTON.LB]?.pressed ? 1 : 0;
    if (pad.crouch > 0 || pad.grab > 0) active = true;
    for (let i = 0; i < PAD_BUTTONS && i < keys.length; i += 1) {
      const was = pad.down[i] === 1;
      const down = buttonDown(keys[i], i, was);
      pad.down[i] = down ? 1 : 0;
      if (down) active = true;
      if (!down || was) continue;
      if (i === BUTTON.A) popUp();
      else if (i === BUTTON.B) intent.duck += 1;
      else if (i === BUTTON.X) intent.board += 1;
      else if (i === BUTTON.DOWN) intent.leash += 1;
      else if (i === BUTTON.Y) cycleSurfCamera();
      else if (i === BUTTON.LT) intent.strokeLeft += 1;
      else if (i === BUTTON.RT) intent.strokeRight += 1;
      else if (i === BUTTON.VIEW) surfPlay.respawnRequest += 1;
      else if (i === BUTTON.UP) surfPlay.checkpointRequest += 1;
      else if (i === BUTTON.RS) { look.yaw = 0; look.pitch = 0; look.zoom = 1; }
      else if (i === BUTTON.MENU) stop();
    }
    if (active) steerWith('gamepad');
  };

  // Once per animation frame while playing: read the pad, ease the held keys
  // and buttons, let the mouse stick drift home, and add it all into the intent.
  const frame = (dt) => {
    const { intent, mouse: stick } = surfPlay;
    clock += dt;
    pollPad(dt);
    const keep = Math.exp(-Math.LN2 * dt / STICK_HALF_LIFE);
    stick.x *= keep; stick.y *= keep;
    ramp.lean = slew(ramp.lean, want.lean, dt);
    ramp.trim = slew(ramp.trim, want.trim, dt);
    ramp.crouch = slew(ramp.crouch, (want.crouch || buttons & 1) ? 1 : 0, dt);
    ramp.grab = slew(ramp.grab, buttons & 2 ? 1 : 0, dt);
    ramp.lookBack = slew(ramp.lookBack, (want.lookBack || buttons & 4 || pad.lookBack) ? 1 : 0, dt);
    radial(scratch, stick.x, stick.y, STICK_DEADZONE);
    intent.lean = clamp(ramp.lean + scratch.x + pad.lean, -1, 1);
    intent.trim = clamp(ramp.trim - scratch.y + pad.trim, -1, 1);
    intent.crouch = Math.max(ramp.crouch, pad.crouch);
    intent.grab = Math.max(ramp.grab, pad.grab);
    intent.lookBack = ramp.lookBack;
    derive();
  };

  const dispose = () => {
    release();
    env.unlock(lockTarget);
    dropMouse();
    surfPlay.rumble = null;
    surfPlay.gamepad = false;
  };

  return {
    keydown, keyup, release, pointerdown, pointermove, pointerup, pointercancel, wheel,
    mouse, contextmenu, lockChange, padChange, frame, dispose,
  };
}

// Outside play, P starts it; inside, the board owns the keyboard, the mouse
// and the gamepad, read by one animation-frame loop that lives only while the
// ride does and waits while the window is away.
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
    let raf = 0;
    let last = 0;
    const tick = (time) => {
      raf = requestAnimationFrame(tick);
      controls.frame(last ? Math.min((time - last) / 1000, 0.1) : 0);
      last = time;
    };
    const run = () => {
      if (raf) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    };
    const halt = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const blur = () => {
      halt();
      controls.release();
    };
    const lockChange = () => controls.lockChange(document.pointerLockElement);
    const listeners = [
      [window, 'keydown', controls.keydown, true],
      [window, 'keyup', controls.keyup, true],
      [window, 'blur', blur, false],
      [window, 'focus', run, false],
      [window, 'pointerdown', controls.pointerdown, true],
      [window, 'pointermove', controls.pointermove, false],
      [window, 'pointerup', controls.pointerup, false],
      [window, 'pointercancel', controls.pointercancel, false],
      [window, 'mousedown', controls.mouse, true],
      [window, 'mousemove', controls.mouse, true],
      [window, 'mouseup', controls.mouse, true],
      [window, 'contextmenu', controls.contextmenu, true],
      [window, 'wheel', controls.wheel, { passive: false }],
      [window, 'gamepadconnected', controls.padChange, false],
      [window, 'gamepaddisconnected', controls.padChange, false],
      [document, 'pointerlockchange', lockChange, false],
    ];
    listeners.forEach(([target, type, listener, options]) => target.addEventListener(type, listener, options));
    run();
    return () => {
      listeners.forEach(([target, type, listener, options]) => target.removeEventListener(type, listener, options));
      halt();
      controls.dispose();
    };
  }, [playing, start, stop]);
}

export default usePlayKeys;
