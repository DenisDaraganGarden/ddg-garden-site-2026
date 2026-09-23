import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { boardDimensions, deckHeight } from './boardShape';
import { createSurfWater } from './surfWater';
import { surfPlay } from './surfPlayStore';

// The camera while riding. It drives the scene's one default camera (the
// shadows, the mirror, the sky and the final render all read that one), after
// the board has moved this frame (-8) and before the shadows fit to it (-4)
// and the sky copies its matrix (-3). The editor's orbit is switched off for
// as long as the ride lasts; camera.up is never touched, the roll of the
// first-person view is in the quaternion.
//
//  chase  behind and above the board along its heading, the horizon level
//  first  the rider's eye: lying on the board, then standing once he rides
//  side   from the channel: beside the wave along the crest, on its face side
//         (toward the shore) and up, so the crest never stands in between
//  orbit  around the board, by the mouse
//
// The mouse is the shell's (usePlayKeys writes surfPlay.look): yaw turns the
// view about +Y (positive = left), pitch tilts it (positive = up), zoom scales
// the distance. Chase and first person drift back to straight ahead once the
// hand lets go. Wherever it goes, the camera stays above the water and sand.

const CHASE = { distance: 4.8, elevation: 0.3, ahead: 2.5, fov: 62 };
const SIDE = { along: 9, shoreward: 6, up: 2.5, fov: 45 };
const ORBIT = { distance: 6, elevation: 0.35, fov: 55 };
// The rider's eye above the deck, and how far from the middle along it:
// lying, the head is ahead of the middle; standing, over the back foot.
const EYE = { prone: 0.45, standing: 1.55, proneZ: 0.35, standingZ: -0.12 };
// The share of the board's roll the first-person horizon follows.
const EYE_ROLL = 0.35;
// Clearance over the water and the ground at the camera, m.
const WATER_CLEARANCE = 0.35;
const EYE_CLEARANCE = 0.15;
const GROUND_CLEARANCE = 0.3;
// A look left alone this long (s) drifts home at this rate (1/s).
const LOOK_HOLD = 0.6;
const LOOK_RETURN = 0.8;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// A critically damped follow (the Game Programming Gems 4 form of it): the
// camera eases onto a moving target without overshoot, at any frame rate.
function follow(value, velocity, target, omega, dt) {
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = value - target;
  const temp = (velocity + omega * change) * dt;
  return [target + (change + temp) * decay, (velocity - omega * temp) * decay];
}
function followVector(value, velocity, target, omega, dt) {
  for (const axis of ['x', 'y', 'z']) {
    [value[axis], velocity[axis]] = follow(value[axis], velocity[axis], target[axis], omega, dt);
  }
}

const boardQuaternion = new THREE.Quaternion();
const boardPosition = new THREE.Vector3();
const nose = new THREE.Vector3();
const side = new THREE.Vector3();
const desired = new THREE.Vector3();
const aim = new THREE.Vector3();
const eyeEuler = new THREE.Euler(0, 0, 0, 'YXZ');

export default function SurfPlayCamera({ settings, orbitRef, seaSettings, terrainDefinition, terrainQuery, surfRibbons }) {
  const { camera } = useThree();
  const water = useMemo(() => createSurfWater({
    seaSettings,
    coastDefinition: terrainDefinition,
    getCamera: () => camera.position,
    surfRibbons,
    terrainHeight: terrainQuery?.heightAt ?? null,
  }), [camera, seaSettings, surfRibbons, terrainDefinition, terrainQuery]);
  const { surfboardLength, surfboardWidth, surfboardThickness, surfboardNoseRocker, surfboardTailRocker } = settings;
  const deck = useMemo(() => {
    const dims = boardDimensions({ surfboardLength, surfboardWidth, surfboardThickness, surfboardNoseRocker, surfboardTailRocker });
    return { prone: deckHeight(dims, 0, EYE.proneZ), standing: deckHeight(dims, 0, EYE.standingZ) };
  }, [surfboardLength, surfboardNoseRocker, surfboardTailRocker, surfboardThickness, surfboardWidth]);
  const rigRef = useRef(null);
  if (!rigRef.current) {
    rigRef.current = {
      mode: null,
      position: new THREE.Vector3(), velocity: new THREE.Vector3(),
      look: new THREE.Vector3(), lookVelocity: new THREE.Vector3(),
      heading: 0, headingVelocity: 0,
      orbitBase: 0,
      side: 1,
      lookYaw: 0, lookPitch: 0, lookMovedAt: -Infinity,
      orbit: null,         // the editor's orbit controls this ride switched off
      sample: {},
    };
  }

  // What the ride borrows from the editor's camera, given back as it was.
  useEffect(() => {
    const saved = { near: camera.near, far: camera.far, fov: camera.fov };
    const rig = rigRef.current;
    return () => {
      camera.up.set(0, 1, 0);
      camera.near = saved.near;
      camera.far = saved.far;
      camera.fov = saved.fov;
      camera.updateProjectionMatrix();
      if (rig.orbit) rig.orbit.enabled = true;
      rig.orbit = null;
    };
  }, [camera]);

  useFrame((frame, delta) => {
    const rig = rigRef.current;
    const board = surfPlay.board;
    // Leaving play: the shell has already put the editor's pose back.
    if (!surfPlay.playing || !board.ready) return;
    // Every frame: the gizmo and the boat's drag hand the orbit back when they end.
    if (orbitRef?.current) {
      orbitRef.current.enabled = false;
      rig.orbit = orbitRef.current;
    }
    const dt = Math.min(delta, 0.1);
    const time = frame.clock.elapsedTime;
    const { look } = surfPlay;
    const mode = surfPlay.camera;
    const snap = rig.mode !== mode;

    boardPosition.set(board.x, board.y, board.z);
    boardQuaternion.set(board.qx, board.qy, board.qz, board.qw);
    nose.set(0, 0, 1).applyQuaternion(boardQuaternion);
    // The heading the chase camera swings to, eased so a carve does not whip it.
    const heading = Math.hypot(nose.x, nose.z) > 0.2 ? Math.atan2(nose.x, nose.z) : rig.heading;
    if (snap || rig.mode === null) {
      rig.heading = heading;
      rig.headingVelocity = 0;
    } else {
      const target = rig.heading + Math.atan2(Math.sin(heading - rig.heading), Math.cos(heading - rig.heading));
      [rig.heading, rig.headingVelocity] = follow(rig.heading, rig.headingVelocity, target, 3, dt);
    }
    if (snap && mode === 'orbit') rig.orbitBase = rig.heading;
    rig.mode = mode;
    // A released look drifts back to straight ahead behind the board.
    if (look.yaw !== rig.lookYaw || look.pitch !== rig.lookPitch) rig.lookMovedAt = time;
    if (time - rig.lookMovedAt > LOOK_HOLD && (mode === 'chase' || mode === 'first')) {
      const keep = Math.exp(-LOOK_RETURN * dt);
      look.yaw *= keep;
      look.pitch *= keep;
    }
    rig.lookYaw = look.yaw;
    rig.lookPitch = look.pitch;

    let fov = CHASE.fov;
    let clearance = WATER_CLEARANCE;
    if (mode === 'first') {
      fov = settings.surfboardCameraFov;
      clearance = EYE_CLEARANCE;
      // Lying down until he rides: the posture the physics holds him in, not
      // a guess from the ground speed, which swings with every swell's orbit.
      const { riding } = board;
      desired.set(0, THREE.MathUtils.lerp(deck.prone + EYE.prone, deck.standing + EYE.standing, riding), THREE.MathUtils.lerp(EYE.proneZ, EYE.standingZ, riding))
        .applyQuaternion(boardQuaternion).add(boardPosition);
      if (snap) { rig.position.copy(desired); rig.velocity.set(0, 0, 0); } else followVector(rig.position, rig.velocity, desired, 18, dt);
      // Where he looks: along the nose, and more along the track as it speeds.
      const speed = Math.hypot(board.vx, board.vz);
      const track = speed > 0.3 ? 0.6 * smoothstep(1, 4, speed) : 0;
      const fx = nose.x * (1 - track) + (speed > 0.3 ? board.vx / speed : 0) * track;
      const fz = nose.z * (1 - track) + (speed > 0.3 ? board.vz / speed : 0) * track;
      side.set(1, 0, 0).applyQuaternion(boardQuaternion);
      const roll = Math.asin(clamp(side.y, -0.6, 0.6));
      // A camera looks down its −Z: yaw it half a turn from the direction.
      eyeEuler.set(clamp(-0.08 + look.pitch, -1.3, 1.3), Math.atan2(fx, fz) + Math.PI + look.yaw, -EYE_ROLL * roll);
    } else if (mode === 'side') {
      fov = SIDE.fov;
      // Along the crest the way he rides it (with some hysteresis), and in
      // front of the face: from out to sea the crest hides a rider on the face.
      const landX = terrainDefinition?.terrainEnabled ? terrainDefinition.landX : Math.sin(rig.heading);
      const landZ = terrainDefinition?.terrainEnabled ? terrainDefinition.landZ : Math.cos(rig.heading);
      const alongSpeed = board.vx * -landZ + board.vz * landX;
      if (Math.abs(alongSpeed) > 0.8) rig.side = Math.sign(alongSpeed);
      const reach = look.zoom;
      desired.set(
        board.x + (-landZ * rig.side * SIDE.along + landX * SIDE.shoreward) * reach,
        board.y + SIDE.up * reach,
        board.z + (landX * rig.side * SIDE.along + landZ * SIDE.shoreward) * reach,
      );
      if (snap) { rig.position.copy(desired); rig.velocity.set(0, 0, 0); } else followVector(rig.position, rig.velocity, desired, 2.5, dt);
      aim.set(board.x, board.y + 0.5, board.z);
    } else {
      const orbit = mode === 'orbit';
      if (orbit) fov = ORBIT.fov;
      const azimuth = (orbit ? rig.orbitBase : rig.heading) + look.yaw;
      const elevation = clamp((orbit ? ORBIT.elevation : CHASE.elevation) - look.pitch, -0.2, 1.45);
      const distance = (orbit ? ORBIT.distance : CHASE.distance) * look.zoom;
      desired.set(
        board.x - Math.sin(azimuth) * Math.cos(elevation) * distance,
        board.y + 0.4 + Math.sin(elevation) * distance,
        board.z - Math.cos(azimuth) * Math.cos(elevation) * distance,
      );
      // Orbit answers the hand directly; the chase trails a little.
      if (snap || orbit) { rig.position.copy(desired); rig.velocity.set(0, 0, 0); } else followVector(rig.position, rig.velocity, desired, 6, dt);
      const ahead = orbit ? 0 : CHASE.ahead;
      aim.set(board.x + Math.sin(azimuth) * ahead, board.y + 0.5, board.z + Math.cos(azimuth) * ahead);
    }

    // Above the water (the breaker included) and the sand at the camera.
    const surface = water.sample(rig.position.x, rig.position.z, time, rig.sample);
    let floor = surface.height + clearance;
    if (terrainQuery) floor = Math.max(floor, terrainQuery.heightAt(rig.position.x, rig.position.z) + GROUND_CLEARANCE);
    if (rig.position.y < floor) {
      rig.position.y = floor;
      rig.velocity.y = Math.max(rig.velocity.y, 0);
    }

    camera.position.copy(rig.position);
    if (mode === 'first') {
      camera.quaternion.setFromEuler(eyeEuler);
    } else {
      if (snap) { rig.look.copy(aim); rig.lookVelocity.set(0, 0, 0); } else followVector(rig.look, rig.lookVelocity, aim, 10, dt);
      camera.lookAt(rig.look);
    }
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }, -6);

  return null;
}
