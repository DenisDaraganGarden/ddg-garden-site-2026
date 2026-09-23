import assert from 'node:assert/strict';
import { POP_HOLD_MS, createPlayControls, startsPlay } from './usePlayKeys.js';
import { surfPlay } from './surfPlayStore.js';

// Drive the play keys with fake events and read the shared store: two keys on
// one axis, edges that fire once, keys the board does not own, and a clean
// release when the window loses focus or play ends.
const key = (code, extra = {}) => {
  const event = { code, repeat: false, metaKey: false, ctrlKey: false, prevented: false, stopped: false, ...extra };
  event.preventDefault = () => { event.prevented = true; };
  event.stopPropagation = () => { event.stopped = true; };
  return event;
};
let stops = 0;
const controls = createPlayControls(() => { stops += 1; });
const { input } = surfPlay;

controls.keydown(key('KeyW'));
controls.keydown(key('ArrowUp'));
controls.keyup(key('KeyW'));
assert.equal(input.forward, 1, 'forward stays while ↑ is still held');
controls.keyup(key('ArrowUp'));
assert.equal(input.forward, 0);

controls.keydown(key('KeyD'));
controls.keydown(key('ShiftLeft'));
assert.deepEqual([input.right, input.pump], [1, true]);
controls.release();
assert.deepEqual([input.right, input.pump], [0, false], 'blur lets go of every held key');

const pop = key('Space');
assert.equal(controls.keydown(pop), true);
assert.ok(input.pop && pop.prevented && pop.stopped, 'Space pops and never reaches the pause handler');

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

setTimeout(() => {
  assert.equal(input.pop, false, 'pop is a short pulse');
  controls.dispose();
  console.log('playKeys: axes, edges, pass-through, release and P from a focused control — ok');
}, POP_HOLD_MS + 20);
