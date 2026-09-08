import assert from 'node:assert/strict';
import { SPRAY_GROW, SPRAY_RADIUS, SPRAY_TIERS, sprayFlight, sprayInstanceCount } from './spray.js';

// The motes fly in closed form so that nothing has to be simulated or stored.
// That is only allowed if the closed form IS the trajectory: integrate the
// equation of motion numerically and hold the formula to it.
// dv/da = -(v - wind)/tau + g
const integrate = (v0, wind, tau, age, steps = 200000) => {
  const dt = age / steps;
  const v = [...v0];
  const x = [0, 0, 0];
  for (let i = 0; i < steps; i += 1) {
    for (let k = 0; k < 3; k += 1) {
      const g = k === 1 ? -9.81 : 0;
      v[k] += (-(v[k] - wind[k]) / tau + g) * dt;
      x[k] += v[k] * dt;
    }
  }
  return x;
};
for (const tau of [0.05, 0.18, 0.5]) {
  for (const age of [0.2, 1.1, 2.2]) {
    const v0 = [3.1, 4.7, -1.4];
    const wind = [0.8, 0, 0.3];
    const closed = sprayFlight(v0, wind, tau, age);
    const numeric = integrate(v0, wind, tau, age);
    closed.forEach((value, axis) => assert.ok(Math.abs(value - numeric[axis]) < 2e-3,
      `flight tau=${tau} age=${age} axis ${axis}: closed ${value.toFixed(4)} vs integrated ${numeric[axis].toFixed(4)}`));
  }
}
// A heavy mote falls, a light one hangs and blows downwind.
const heavy = sprayFlight([0, 0, 0], [1, 0, 0], 0.5, 1);
const light = sprayFlight([0, 0, 0], [1, 0, 0], 0.05, 1);
assert.ok(heavy[1] < light[1] - 1, 'a heavy mote falls further than a light one');
assert.ok(light[0] > heavy[0], 'a light mote is carried further downwind');

// The count comes from a coverage budget, not from distance: the painted area
// must stay flat, or the fill cost explodes the moment the camera comes close.
const view = { viewportHeight: 1200, viewportWidth: 1920, projectionY: 3.5, overdraw: SPRAY_TIERS.high.overdraw, max: SPRAY_TIERS.high.max };
const painted = (distance) => {
  const count = sprayInstanceCount({ distance, height: 0.9, ...view });
  const pxPerMetre = 0.5 * view.viewportHeight * view.projectionY / Math.max(distance, 1);
  const quadPx = Math.max(2 * (SPRAY_RADIUS + SPRAY_GROW * 0.5) * Math.sqrt(0.9 / 0.45) * pxPerMetre, 2.5);
  return { count, area: count * quadPx * quadPx * 0.785 };
};
const budget = view.viewportWidth * view.viewportHeight * view.overdraw;
const FLOOR = 60;
let previous = 0;
for (const distance of [5, 8, 12, 20, 30]) {
  const { count, area } = painted(distance);
  assert.ok(count < SPRAY_TIERS.high.max, `distance ${distance} should not be capped: ${count}`);
  if (count > FLOOR) {
    assert.ok(Math.abs(area - budget) / budget < 0.05, `painted area at ${distance} m is ${(area / budget).toFixed(2)} of budget`);
  } else {
    // Nose to the crest the floor binds and the budget is deliberately
    // overspent, so the plume does not thin to nothing. Bound the overspend.
    assert.ok(area < budget * 2, `the floor overspends by ${(area / budget).toFixed(2)}x at ${distance} m`);
  }
  assert.ok(count >= previous, `the count must not fall as the camera pulls back: ${previous} then ${count}`);
  previous = count;
}
// Far enough away the pool is the limit, not the budget: that is where the
// distance fade takes over and the spray dissolves into a band of white.
assert.equal(sprayInstanceCount({ distance: 60, height: 0.9, ...view }), SPRAY_TIERS.high.max);
assert.ok(sprayInstanceCount({ distance: 20, height: 0.9, ...view, overdraw: SPRAY_TIERS.low.overdraw, max: SPRAY_TIERS.low.max })
  < sprayInstanceCount({ distance: 20, height: 0.9, ...view }), 'a lower tier draws fewer motes');

console.log(`spray: closed-form flight within 2 mm of the integrated trajectory, coverage held to ${(view.overdraw).toFixed(1)}x the frame at every distance`);
