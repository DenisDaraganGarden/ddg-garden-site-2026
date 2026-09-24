import assert from 'node:assert/strict';
import { hintsFor } from './surfHints.js';

// The HUD shows only what can be done where he is, in the words of the moment:
// each context's keys and what F and L would do there.

const at = (rider, more = {}) => ({ device: 'keyboard', rider, board: null, leash: null, swimBack: false, jumpFrom: null, ...more });
const says = (snapshot) => hintsFor(snapshot).hints.map(([keys, [ru]]) => `${keys.map((k) => (typeof k.label === 'string' ? k.label : k.label[0])).join('+')} ${ru}`);

assert.deepEqual(says(at('prone', { board: 'jump', leash: 'off' })), ['W грести', 'A+D рулить', 'пробел встать', 'F спрыгнуть'], 'lying: paddle, steer, stand up, jump off');
assert.deepEqual(says(at('stand', { board: 'jump' })), ['A+D наклон', 'shift присед', 'пробел прыжок', 'F спрыгнуть'], 'riding: lean, crouch, pop, jump off');
assert.deepEqual(says(at('popup')), ['A+D наклон', 'shift присед', 'пробел прыжок'], 'getting up is as good as standing, F not yet');
assert.deepEqual(says(at('walk', { board: 'lift', leash: 'off' })), ['W+A+S+D идти', 'shift бежать', 'пробел прыжок', 'F взять доску', 'L отстегнуть лиш'], 'on his feet by the board in the shallows');
assert.deepEqual(says(at('walk', { board: 'put', leash: 'off' })).slice(3), ['F положить доску', 'L отстегнуть лиш'], 'carrying it');
assert.deepEqual(says(at('walk', { board: 'climb', leash: 'on' })).slice(3), ['F залезть', 'L пристегнуть лиш'], 'beside it afloat, unleashed');
assert.deepEqual(says(at('walk')), ['W+A+S+D идти', 'shift бежать', 'пробел прыжок'], 'far from it, the leash off: nothing for F or L');
assert.deepEqual(says(at('jump', { jumpFrom: 'ground', board: null, leash: 'off' })), says(at('walk', { leash: 'off' })), 'a jump on his feet keeps the row');
assert.deepEqual(says(at('jump', { jumpFrom: 'prone' })), [], 'off the board, in the air: nothing');
assert.deepEqual(says(at('swim', { board: 'climb' })), ['W плыть', 'A+D поворот', 'shift быстрее', 'F залезть'], 'swimming by the board');
assert.deepEqual(says(at('swim', { swimBack: true })), ['A+D плыть самому'], 'swimming back by himself: steer to swim yourself');
assert.deepEqual(says(at('fallen')), [], 'falling: nothing');
assert.deepEqual(says(at('prone', { device: 'gamepad', board: 'jump' })), ['L грести', 'A встать', 'X спрыгнуть'], 'the gamepad in its own buttons');
assert.deepEqual(says(at('walk', { device: 'gamepad', board: 'lift', leash: 'off' })).slice(3), ['X взять доску', '↓ отстегнуть лиш'], 'and on his feet');
assert.notEqual(hintsFor(at('walk', { board: 'lift' })).id, hintsFor(at('walk', { board: 'put' })).id, 'a new F is a new row');

console.log('surfHints: lying, riding, on his feet, carrying, swimming and falling each show their own keys, F and L in the words of the moment, the gamepad in its buttons');
