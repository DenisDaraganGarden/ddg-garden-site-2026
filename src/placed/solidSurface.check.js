// Run: node src/placed/solidSurface.check.js
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { boardAgainstSolid, hasSolids, heightfieldAt, setSolid, solidHeightAt, solidHeightfield } from './solidSurface.js';

// A 4 m box with its top at 1.5 m, and a 60° roof ramp beside it: the grid
// knows the box top inside, nothing outside, the ramp's slope between, and a
// scan of tiny triangles still marks its ground. Solid models add up by the
// highest, and an object asks past its own.
const scene = new THREE.Group();
const block = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 4));
block.position.set(10, 0.5, -5);
scene.add(block);
const ramp = new THREE.Mesh(new THREE.PlaneGeometry(4, 4));
ramp.rotation.x = -Math.PI / 2 + Math.PI / 6; // tilted up toward -z
ramp.position.set(20, 1, -5);
scene.add(ramp);

const field = solidHeightfield(scene);
assert.ok(Math.abs(heightfieldAt(field, 10, -5) - 1.5) < 1e-6, 'the box top in its middle');
assert.ok(Math.abs(heightfieldAt(field, 11.8, -3.2) - 1.5) < 1e-6, 'and near its corner');
assert.equal(heightfieldAt(field, 15, -5), -Infinity, 'nothing between the box and the ramp');
assert.equal(heightfieldAt(field, 10, 20), -Infinity, 'nothing off the models');
{
    const slope = (heightfieldAt(field, 20, -6) - heightfieldAt(field, 20, -4)) / 2;
    assert.ok(Math.abs(slope - Math.tan(Math.PI / 6)) < 0.03, `the ramp's slope (${slope.toFixed(3)} vs ${Math.tan(Math.PI / 6).toFixed(3)})`);
}

// A dense scan: triangles far smaller than a cell still make the ground.
{
    const scan = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 128));
    scan.position.set(0, 0.2, 0);
    const dome = solidHeightfield(scan);
    assert.ok(Math.abs(heightfieldAt(dome, 0, 0) - 1.2) < 0.02, `a scan's top (${heightfieldAt(dome, 0, 0).toFixed(3)})`);
}

setSolid('block', field);
setSolid('floor', { x0: 0, z0: -10, cell: 1, nx: 31, nz: 11, heights: new Float32Array(31 * 11).fill(0.2) });
assert.ok(hasSolids());
assert.ok(Math.abs(solidHeightAt(10, -5) - 1.5) < 1e-6, 'the highest solid wins');
assert.ok(Math.abs(solidHeightAt(10, -5, 'block') - 0.2) < 1e-6, 'an object asks past itself');
// The board against them: a 1.8 m board at the waterline with its nose in the
// box is against a wall; over the 0.2 m floor it rides; turned 90° it clears
// a wall its nose touched, where its rail does not reach.
{
    const level = [0, 0, 0, 1], turned = [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)];
    assert.equal(boardAgainstSolid([10, 0, -7.5], level, 1.8, 0.5, 0.35), true, 'nose into the 1.5 m box: a wall');
    assert.equal(boardAgainstSolid([25, 0, -8], level, 1.8, 0.5, 0.35), false, 'over the 0.2 m floor: it rides');
    assert.equal(boardAgainstSolid([10, 1.5, -5], level, 1.8, 0.5, 0.35), false, 'resting on the box top: no wall');
    assert.equal(boardAgainstSolid([10, 0, -7.5], turned, 1.8, 0.5, 0.35), false, 'turned side-on, clear of it');
}
setSolid('block', null); setSolid('floor', null);
assert.equal(solidHeightAt(10, -5), -Infinity);
assert.ok(!hasSolids());

console.log('solidSurface: box top inside and nothing outside, a ramp keeps its slope, a dense scan marks its ground, the highest solid wins, an object asks past itself, a board stops at a wall and rides a low floor');
