// A critically damped follow (the Game Programming Gems 4 form of it): the
// camera eases onto a moving target without overshoot, at any frame rate, and
// its speed never breaks — a kink or a jump in the target is an acceleration,
// not a jolt. [value, velocity] out.
export function follow(value, velocity, target, omega, dt) {
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = value - target;
  const temp = (velocity + omega * change) * dt;
  return [target + (change + temp) * decay, (velocity - omega * temp) * decay];
}
export function followVector(value, velocity, target, omega, dt) {
  for (const axis of ['x', 'y', 'z']) {
    [value[axis], velocity[axis]] = follow(value[axis], velocity[axis], target[axis], omega, dt);
  }
}
