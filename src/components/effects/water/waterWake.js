// Wakes: what things moving on the water leave in it, for every water surface
// to draw. Two kinds, both in world space and in scene time:
//  - rings: a point where the water was cut or struck, spreading as a ring of
//    small waves. A moving board leaves a row of them, which is its V wake; a
//    hand entering the water, a fall and a landing leave one each.
//  - foam: the path a board has cut since the foam field last read it
//    (foamField.js stamps it into its memory, which then carries and ages it
//    like any other foam).
// One record for the scene, like the play store: whatever moves writes into
// it, the water reads it.

export const WAKE_RINGS = 32;
export const WAKE_FOAM = 4;
// Seconds a ring is drawn for: by then it has spread and faded to nothing.
export const WAKE_LIFE = 4;
// The ring's front runs out at about the group speed of the half-metre waves
// it is made of (m/s); its packet widens and its waves lengthen as it goes, as
// the longer waves of a splash outrun the short ones.
export const WAKE_SPEED = 0.9;
export const wakeSpread = (age) => 0.25 + 0.3 * age;
export const wakeWavelength = (age) => 0.45 + 0.25 * age;
// How far from its centre a ring's waves reach at this age (m): the front and
// three packet widths beyond it, where the packet is under a ten-thousandth.
export const wakeReach = (age) => WAKE_SPEED * age + 0.15 + 3 * wakeSpread(age);

export function createWaterWake() {
  return {
    rings: Array.from({ length: WAKE_RINGS }, () => ({ x: 0, z: 0, age: WAKE_LIFE, strength: 0 })),
    next: 0,
    foam: Array.from({ length: WAKE_FOAM }, () => ({ x0: 0, z0: 0, x1: 0, z1: 0, halfWidth: 0, strength: 0 })),
    foamCount: 0,
  };
}

export const waterWake = createWaterWake();

// strength: 1 is a board at speed; the waves' height scales with it.
export function wakeRing(wake, x, z, strength) {
  if (!(strength > 0) || !Number.isFinite(x + z)) return;
  const ring = wake.rings[wake.next];
  wake.next = (wake.next + 1) % WAKE_RINGS;
  ring.x = x; ring.z = z; ring.age = 0; ring.strength = Math.min(strength, 2);
}

// A stretch of foam from (x0, z0) to (x1, z1), halfWidth either side of it;
// strength is the foam's cover there, 0..1. A point is a stretch of no length.
export function wakeFoam(wake, x0, z0, x1, z1, halfWidth, strength) {
  if (!(strength > 0) || !Number.isFinite(x0 + z0 + x1 + z1 + halfWidth)) return;
  let slot = wake.foamCount < WAKE_FOAM ? wake.foam[wake.foamCount++] : null;
  if (!slot) {
    // Full until the field reads it: the weakest stretch gives way.
    slot = wake.foam.reduce((weakest, entry) => (entry.strength < weakest.strength ? entry : weakest));
    if (slot.strength >= strength) return;
  }
  slot.x0 = x0; slot.z0 = z0; slot.x1 = x1; slot.z1 = z1;
  slot.halfWidth = Math.max(halfWidth, 0); slot.strength = Math.min(strength, 1);
}

export function ageWake(wake, dt) {
  if (!(dt > 0)) return;
  for (const ring of wake.rings) {
    if (ring.strength <= 0) continue;
    ring.age += dt;
    if (ring.age >= WAKE_LIFE) ring.strength = 0;
  }
}

export function clearWake(wake) {
  for (const ring of wake.rings) { ring.strength = 0; ring.age = WAKE_LIFE; }
  wake.foamCount = 0;
}

// Into a shader's uniforms: per ring (x, z, age, strength), strength 0 for an
// empty slot, and the circle every live ring's waves lie in (centre x, z,
// radius, 1 if any ring is live) so the water outside it skips the loop.
// rings and bounds take .set(x, y, z, w), as THREE.Vector4 does.
export function writeWakeRings(wake, rings, bounds) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity, live = 0;
  wake.rings.forEach((ring, i) => {
    if (!(ring.strength > 0)) { rings[i].set(0, 0, 0, 0); return; }
    rings[i].set(ring.x, ring.z, ring.age, ring.strength);
    const reach = wakeReach(ring.age);
    minX = Math.min(minX, ring.x - reach); maxX = Math.max(maxX, ring.x + reach);
    minZ = Math.min(minZ, ring.z - reach); maxZ = Math.max(maxZ, ring.z + reach);
    live += 1;
  });
  if (!live) { bounds.set(0, 0, 0, 0); return 0; }
  bounds.set((minX + maxX) / 2, (minZ + maxZ) / 2, Math.hypot(maxX - minX, maxZ - minZ) / 2, 1);
  return live;
}

// The foam laid since the last read, into (x0, z0, x1, z1) and (halfWidth,
// strength, 0, 0) per slot; the record is then empty. Returns how many.
export function takeWakeFoam(wake, segments, shapes) {
  const count = wake.foamCount;
  for (let i = 0; i < WAKE_FOAM; i += 1) {
    const entry = wake.foam[i];
    if (i < count) {
      segments[i].set(entry.x0, entry.z0, entry.x1, entry.z1);
      shapes[i].set(entry.halfWidth, entry.strength, 0, 0);
    } else {
      shapes[i].set(0, 0, 0, 0);
    }
  }
  wake.foamCount = 0;
  return count;
}
