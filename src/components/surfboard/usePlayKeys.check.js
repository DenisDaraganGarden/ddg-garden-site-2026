import assert from 'node:assert/strict';
import { POP_HOLD_MS, createPlayControls, startsPlay } from './usePlayKeys.js';
import { getSurfPlaySnapshot, surfPlay } from './surfPlayStore.js';

// Drive the play controls with fake events, a fake canvas and a fake gamepad,
// and read the shared store: keys that ramp instead of snapping, the captured
// mouse as a stick, the pad's axes, triggers and buttons, edges that fire once,
// the legacy input the board still reads, and a clean release on blur and exit.
globalThis.window ??= { innerHeight: 1000 }; // the drag turns by the window's height

const key = (code, extra = {}) => {
  const event = { code, repeat: false, metaKey: false, ctrlKey: false, prevented: false, stopped: false, ...extra };
  event.preventDefault = () => { event.prevented = true; };
  event.stopPropagation = () => { event.stopped = true; };
  return event;
};
const near = (actual, expected, message, eps = 1e-9) => assert.ok(Math.abs(actual - expected) <= eps, `${message}: ${actual}, expected ${expected}`);

let pads = [];
let unlocks = 0;
let stops = 0;
const env = { gamepads: () => pads, unlock: (element) => { if (element) unlocks += 1; } };
const controls = createPlayControls(() => { stops += 1; }, env);
const run = (seconds, steps = 30) => { for (let i = 0; i < steps; i += 1) controls.frame(seconds / steps); };
const { intent, input, mouse, look } = surfPlay;
const analog = () => [intent.lean, intent.trim, intent.crouch, intent.grab, intent.lookBack];

// Keyboard: a tap is a small lean, a hold a full carve, and letting go comes back.
controls.keydown(key('KeyD'));
assert.equal(intent.device, 'keyboard');
run(0.1);
near(intent.lean, 0.4, 'a 0.1 s tap leans 0.4');
near(input.right, 0.4, 'the legacy input follows the intent');
controls.keyup(key('KeyD'));
run(0.1);
assert.equal(intent.lean, 0, 'the tap is gone 0.1 s after the key');
controls.keydown(key('KeyD'));
run(0.3);
assert.equal(intent.lean, 1, 'a held key reaches a full carve in 0.25 s');
assert.equal(input.right, 1);
controls.keyup(key('KeyD'));
run(0.1);
near(intent.lean, 0.5, 'and lets go over 0.2 s');
run(0.1);
assert.equal(intent.lean, 0);
controls.keydown(key('KeyD'));
run(0.3);
controls.keyup(key('KeyD'));
controls.keydown(key('KeyA'));
run(0.1);
near(intent.lean, 0.5, 'from right to left it first comes back');
run(0.4);
assert.deepEqual([intent.lean, input.left, input.right], [-1, 1, 0], 'then carves the other way');
controls.keyup(key('KeyA'));

controls.keydown(key('KeyW'));
controls.keydown(key('ArrowUp'));
controls.keyup(key('KeyW'));
run(0.3);
assert.deepEqual([intent.trim, input.forward], [1, 1], 'forward stays while ↑ is still held');
controls.keyup(key('ArrowUp'));
controls.keydown(key('KeyS'));
run(0.5);
assert.deepEqual([intent.trim, input.forward, input.back], [-1, 0, 1]);
controls.keyup(key('KeyS'));

controls.keydown(key('ShiftLeft'));
run(0.1);
near(intent.crouch, 0.4, 'Shift crouches as a ramp');
assert.equal(input.pump, false);
run(0.1);
assert.equal(input.pump, true, 'past half a crouch the legacy pump is on');
controls.keydown(key('KeyQ'));
run(0.3);
assert.equal(intent.lookBack, 1);
controls.release();
assert.deepEqual(analog(), [0, 0, 0, 0, 0], 'blur lets go of every held key at once');
assert.deepEqual([input.forward, input.back, input.left, input.right, input.pump], [0, 0, 0, 0, false]);
run(0.3);
assert.deepEqual(analog(), [0, 0, 0, 0, 0], 'and nothing comes back after it');

// Edges: once per press, never on a repeat, never for keys the board does not use.
const pops = intent.popUp;
const pop = key('Space');
assert.equal(controls.keydown(pop), true);
assert.ok(input.pop && pop.prevented && pop.stopped, 'Space pops and never reaches the pause handler');
controls.keydown(key('Space', { repeat: true }));
assert.equal(intent.popUp, pops + 1, 'a held Space pops once');
run(POP_HOLD_MS / 1000 - 0.05);
assert.equal(input.pop, true);
run(0.1);
assert.equal(input.pop, false, 'pop is a short pulse');

const [boards, leashes] = [intent.board, intent.leash];
controls.keydown(key('KeyF'));
controls.keydown(key('KeyF', { repeat: true }));
controls.keydown(key('KeyL'));
assert.deepEqual([intent.board, intent.leash], [boards + 1, leashes + 1], 'F is the board and L the leash, once a press');
const keysWere = surfPlay.keysOpen;
controls.keydown(key('KeyH'));
assert.equal(surfPlay.keysOpen, !keysWere, 'H opens the list of keys');
controls.keydown(key('KeyH'));
assert.equal(surfPlay.keysOpen, keysWere, 'and closes it');

controls.keydown(key('KeyC'));
assert.equal(surfPlay.camera, 'first');
controls.keydown(key('KeyC', { repeat: true }));
assert.equal(surfPlay.camera, 'first', 'a held C does not keep cycling');
controls.keydown(key('Digit3'));
assert.equal(surfPlay.camera, 'side');

const [respawn, checkpoint] = [surfPlay.respawnRequest, surfPlay.checkpointRequest];
controls.keydown(key('KeyR'));
controls.keydown(key('KeyT'));
assert.deepEqual([surfPlay.respawnRequest, surfPlay.checkpointRequest], [respawn + 1, checkpoint + 1]);

controls.keydown(key('KeyP', { repeat: true }));
assert.equal(stops, 0, 'P held from the start does not leave at once');
controls.keydown(key('Escape'));
assert.equal(stops, 1);

const menu = key('KeyR', { metaKey: true });
assert.equal(controls.keydown(menu), false);
assert.ok(!menu.prevented, '⌘R still reloads');
assert.equal(controls.keydown(key('KeyV')), false, 'keys the board does not use pass through');

// Mouse, free: a drag looks around, a click captures it (the raw motion
// first, the plain lock when that is refused).
const canvas = {
  tagName: 'CANVAS',
  closest: () => ({}),
  requests: [],
  requestPointerLock(options) {
    this.requests.push(options);
    return options ? Promise.reject(new Error('no unadjusted movement here')) : Promise.resolve();
  },
};
const yaw = look.yaw;
controls.pointerdown({ pointerId: 1, button: 0, target: canvas, clientX: 100, clientY: 100 });
controls.pointermove({ pointerId: 1, clientX: 150, clientY: 100 });
controls.pointerup({ pointerId: 1, button: 0, clientX: 150, clientY: 100 });
assert.ok(look.yaw < yaw, 'dragging right turns the view');
assert.equal(canvas.requests.length, 0, 'a drag is not a click');
controls.pointerdown({ pointerId: 2, button: 2, target: canvas, clientX: 100, clientY: 100 });
controls.pointerup({ pointerId: 2, button: 2, clientX: 100, clientY: 100 });
assert.equal(canvas.requests.length, 0, 'a right click is not a capture');
controls.pointerdown({ pointerId: 2, button: 0, target: canvas, clientX: 100, clientY: 100 });
controls.pointerup({ pointerId: 2, button: 0, clientX: 102, clientY: 101 });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepEqual(canvas.requests, [{ unadjustedMovement: true }, undefined]);
assert.equal(mouse.locked, false, 'captured only once the browser says so');
controls.mouse({ movementX: 50, buttons: 1 });
assert.deepEqual([mouse.x, intent.strokeLeft], [0, 0], 'a free mouse neither steers nor strokes');

// Mouse, captured: a stick on the unit disc that drifts home.
controls.lockChange(canvas);
assert.deepEqual([mouse.locked, intent.device, getSurfPlaySnapshot().mouseLocked], [true, 'mouse', true]);
controls.mouse({ movementX: 110, movementY: 0, buttons: 0 });
near(mouse.x, 0.5, '110 px is half the stick');
controls.frame(0);
near(intent.lean, (0.5 - 0.06) / 0.94, 'the stick leans from the edge of its deadzone');
near(input.right, intent.lean, 'the legacy input follows the mouse too');
controls.mouse({ movementX: 0, movementY: -660, buttons: 0 });
near(Math.hypot(mouse.x, mouse.y), 1, 'the stick stays on the unit disc');
controls.frame(0);
assert.ok(intent.trim > 0.9 && input.forward > 0.9, 'the mouse pushed away is weight forward');
const reach = Math.hypot(mouse.x, mouse.y);
run(1.5, 90);
near(Math.hypot(mouse.x, mouse.y), reach / 2, 'let go, the stick halves in 1.5 s');
run(12, 60);
assert.deepEqual([intent.lean, intent.trim], [0, 0], 'and the deadzone takes the rest');
controls.mouse({ movementX: 8, movementY: 0, buttons: 0 });
controls.frame(0);
assert.equal(intent.lean, 0, 'a nudge inside the deadzone does not steer');

const [left, right] = [intent.strokeLeft, intent.strokeRight];
controls.mouse({ buttons: 1 });
assert.equal(intent.strokeLeft, left + 1, 'LMB is a stroke of the left arm');
run(0.1);
near(intent.crouch, 0.4, 'and a crouch that ramps');
controls.mouse({ movementX: 3, buttons: 1 });
assert.equal(intent.strokeLeft, left + 1, 'moving with the button held is not another stroke');
controls.mouse({ buttons: 3 });
assert.equal(intent.strokeRight, right + 1, 'RMB chorded in is a stroke of the right arm');
run(0.3);
assert.deepEqual([intent.crouch, intent.grab], [1, 1]);
controls.mouse({ buttons: 4 });
run(0.3);
assert.deepEqual([intent.crouch, intent.grab, intent.lookBack], [0, 0, 1], 'the middle button looks back');
controls.mouse({ buttons: 0 });
run(0.3);
assert.equal(intent.lookBack, 0);
const context = { prevented: false, preventDefault() { this.prevented = true; } };
controls.contextmenu(context);
assert.ok(context.prevented, 'no browser menu while the mouse steers');

controls.mouse({ movementX: 150, buttons: 1 });
controls.keydown(key('Escape'));
assert.deepEqual([stops, unlocks], [1, 1], 'an Esc that gets through lets go of the mouse, not the ride');
controls.lockChange(null);
controls.frame(0);
assert.deepEqual([mouse.locked, mouse.x, mouse.y, intent.lean, intent.device], [false, 0, 0, 0, 'keyboard'], 'let go, the stick is gone');
run(0.3);
assert.equal(intent.crouch, 0, 'and so is the button that was held');
const drag = look.yaw;
controls.pointerdown({ pointerId: 3, button: 2, target: canvas, clientX: 100, clientY: 100 });
controls.pointermove({ pointerId: 3, clientX: 60, clientY: 100 });
controls.pointerup({ pointerId: 3, button: 2, clientX: 60, clientY: 100 });
assert.ok(look.yaw > drag, 'the drag looks around again');
controls.keydown(key('Escape'));
assert.equal(stops, 2, 'the next Esc leaves');

// Gamepad: the first connected standard pad; what it wakes up with is no press.
const pad = {
  index: 1, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
};
const effects = [];
pad.vibrationActuator = { playEffect: (type, params) => { effects.push([type, params]); return Promise.resolve(); } };
const press = (index, value = 1) => { pad.buttons[index] = { pressed: value > 0.1, value }; };
const tap = (index) => { press(index); controls.frame(1 / 60); controls.frame(1 / 60); press(index, 0); controls.frame(1 / 60); };
const oddPad = { index: 0, connected: true, mapping: '', axes: [1, 1, 1, 1], buttons: [{ pressed: true, value: 1 }] };

press(0);
pads = [oddPad, pad];
const padPops = intent.popUp;
controls.frame(1 / 60);
assert.deepEqual([surfPlay.gamepad, getSurfPlaySnapshot().gamepad], [true, true]);
assert.equal(intent.popUp, padPops, 'the press that woke the pad is not a pop');
assert.equal(intent.lean, 0, 'a pad without the standard mapping is not read');
press(0, 0);
controls.frame(1 / 60);
tap(0);
assert.deepEqual([intent.popUp, input.pop, intent.device], [padPops + 1, true, 'gamepad'], 'A pops once per press');
controls.keydown(key('KeyD'));
assert.equal(intent.device, 'keyboard');
controls.keyup(key('KeyD'));

assert.equal(typeof surfPlay.rumble, 'function');
surfPlay.rumble(1.4, 0.3, 120);
assert.deepEqual(effects, [['dual-rumble', { startDelay: 0, duration: 120, strongMagnitude: 1, weakMagnitude: 0.3 }]]);

run(0.3);
pad.axes[0] = 0.12;
controls.frame(0);
assert.deepEqual([intent.lean, intent.device], [0, 'keyboard'], 'inside the deadzone the stick is nobody');
pad.axes[0] = 0.575;
controls.frame(0);
near(intent.lean, 0.5, 'the left stick leans from the edge of its deadzone');
assert.equal(intent.device, 'gamepad');
pad.axes[0] = 0; pad.axes[1] = -1;
controls.frame(0);
assert.deepEqual([intent.lean, intent.trim, input.forward], [0, 1, 1], 'pushed up is weight forward');
pad.axes[1] = 0;

look.yaw = 0; look.pitch = 0;
pad.axes[2] = 1;
controls.frame(0.1);
near(look.yaw, -0.25, 'the right stick turns the view 2.5 rad/s');
pad.axes[2] = 0; pad.axes[3] = -1;
controls.frame(0.1);
near(look.pitch, 0.15, 'and tilts it 1.5 rad/s');
run(2);
assert.equal(look.pitch, 1.2, 'no further than the drag goes');
pad.axes[3] = 0;

const [padLeft, padRight] = [intent.strokeLeft, intent.strokeRight];
press(7, 0.3);
controls.frame(0);
near(intent.crouch, 0.25 / 0.95, 'RT crouches as far as it is pulled');
assert.equal(intent.strokeRight, padRight, 'a light squeeze is not a stroke');
press(7, 0.8);
controls.frame(0);
assert.equal(intent.strokeRight, padRight + 1, 'pulled past half, it strokes');
press(7, 0.45);
controls.frame(0);
press(7, 0.9);
controls.frame(0);
assert.equal(intent.strokeRight, padRight + 1, 'easing off a little is not a new stroke');
press(7, 0);
controls.frame(0);
press(7, 0.9);
controls.frame(0);
assert.equal(intent.strokeRight, padRight + 2);
press(7, 0);
press(6, 0.6);
controls.frame(0);
assert.equal(intent.strokeLeft, padLeft + 1, 'LT strokes the left arm');
near(intent.grab, 0.55 / 0.95, 'and grabs the rail as far as it is pulled');
press(6, 0);
controls.frame(0);
assert.deepEqual([intent.crouch, intent.grab], [0, 0], 'the triggers let go at once, as the hand does');

const before = [surfPlay.camera, intent.duck, surfPlay.respawnRequest, surfPlay.checkpointRequest, intent.board, intent.leash];
tap(3);
tap(1);
tap(8);
tap(12);
tap(2);
tap(13);
assert.deepEqual([surfPlay.camera, intent.duck, surfPlay.respawnRequest, surfPlay.checkpointRequest, intent.board, intent.leash],
  ['orbit', before[1] + 1, before[2] + 1, before[3] + 1, before[4] + 1, before[5] + 1], 'Y, B, View, D-pad ↑, X (the board) and D-pad ↓ (the leash) fire once per press');
look.yaw = 0.5; look.pitch = 0.3; look.zoom = 2;
tap(11);
assert.deepEqual([look.yaw, look.pitch, look.zoom], [0, 0, 1], 'the right stick click puts the view back');
press(4);
run(0.3);
assert.equal(intent.lookBack, 1, 'LB held looks back');
press(4, 0);
run(0.3);
assert.equal(intent.lookBack, 0);
tap(9);
assert.equal(stops, 3, 'Menu leaves, once');

// The ride ends or the window goes: everything held lets go, the pad and the
// mouse are given back.
pad.axes[0] = 1;
press(7, 1);
controls.frame(1 / 60);
controls.release();
assert.deepEqual(analog(), [0, 0, 0, 0, 0], 'blur zeroes the pad too');
const awayPops = intent.popUp;
press(0);
controls.frame(1 / 60);
assert.equal(intent.strokeRight, padRight + 3, 'a trigger held through a blur does not stroke again');
assert.equal(intent.popUp, awayPops, 'nor does a button pressed while the window was away');
press(0, 0);
pad.axes[0] = 0;
press(7, 0);
pads = [oddPad];
controls.padChange();
controls.frame(1 / 60);
assert.deepEqual([surfPlay.gamepad, surfPlay.rumble, getSurfPlaySnapshot().gamepad], [false, null, false], 'unplugged, the pad and its rumble are gone');
pads = [pad];
controls.frame(1 / 60);
assert.equal(surfPlay.gamepad, true);

controls.lockChange(canvas);
controls.mouse({ movementX: 100, buttons: 1 });
controls.keydown(key('KeyW'));
run(0.2);
controls.dispose();
assert.deepEqual(analog(), [0, 0, 0, 0, 0], 'the end of the ride zeroes the intent');
assert.deepEqual([mouse.locked, mouse.x, surfPlay.rumble, surfPlay.gamepad, input.forward, input.pop], [false, 0, null, false, 0, false]);
assert.equal(unlocks, 2, 'and gives the mouse back');

// Outside play: P starts it from the canvas and from a slider, checkbox or
// button that kept focus after a click, never from a text field or a dialog.
const element = (tagName, type, inside = '') => ({ tagName, type, closest: (selector) => (selector.split(',').some((part) => part === tagName.toLowerCase() || part === inside) ? {} : null) });
for (const target of [element('CANVAS'), element('INPUT', 'range'), element('INPUT', 'checkbox'), element('INPUT', 'button'), element('BUTTON')]) {
  assert.equal(startsPlay(key('KeyP', { target })), true, `P plays from ${target.tagName} ${target.type ?? ''}`);
}
for (const target of [element('INPUT', 'text'), element('INPUT', 'number'), element('TEXTAREA'), element('INPUT', 'range', 'dialog')]) {
  assert.equal(startsPlay(key('KeyP', { target })), false, `P types into ${target.tagName} ${target.type ?? ''}`);
}
assert.equal(startsPlay(key('KeyP', { target: element('CANVAS'), repeat: true })), false, 'a held P does not start twice');
assert.equal(startsPlay(key('KeyP', { target: element('CANVAS'), metaKey: true })), false, '⌘P prints');

console.log('playKeys: keyboard ramps, mouse stick and buttons, gamepad sticks, triggers and edges, legacy input, release and P from a focused control — ok');
