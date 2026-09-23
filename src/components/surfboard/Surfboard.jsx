import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import SurfboardModel from './SurfboardModel';
import { boardDimensions, buildBoardHull } from './boardShape';
import { createBoardBody, createBoardState, resetBoard, stepBoard } from './boardPhysics';
import { createSurfWater } from './surfWater';
import { surfAlongAt, surfLineup } from './lineup';
import { publishSurfPlay, surfPlay } from './surfPlayStore';

// The surfboard in the scene: the physics body on the water the GPU draws.
//
// Two groups. 'surfboard-anchor' is the checkpoint, the board's home: in the
// editor it stands there turned to the checkpoint's heading, so the gizmo,
// «Показать» and the technical view all read it. 'surfboard' is the board
// itself, wherever the physics has carried it, written relative to the anchor.
// In play the anchor steps aside to the origin and the board is in the world.
//
// Editor: an empty board (nobody on it) moored to the checkpoint, bobbing on
// the real waves where Denis put it. Play: the rider's body, the keys from
// surfPlayStore, no mooring. Everything per frame lives in refs and the store,
// never in settings.

// The water under 24 hull points at 120 Hz: every check of the physics passes
// at this substep, and it halves the samples of the default 240 Hz.
const SUBSTEP = 1 / 120;
// A frame longer than this (a hitch, a hidden tab) is cut short, not replayed.
const MAX_FRAME = 0.05;
// After a wipeout, a moment to see it before the board comes back.
const WIPEOUT_RESPAWN = 1.5;
// The HUD hears from the board at about 8 Hz, and at once when a state flips.
const PUBLISH_INTERVAL = 0.125;
// Where the board lands on a respawn: an empty board draws a centimetre, the
// prone rider's weight sinks it to its deck a hand's width under.
const EMPTY_DRAFT = 0.01;
const RIDDEN_DRAFT = 0.12;
// With no surf drawn, the automatic checkpoint is on the water this far in
// front of the camera, nose where the camera looks.
const AHEAD = 10;
const DEG = Math.PI / 180;
// A paused editor steps no physics, so a board put down there is settled
// against the water as it stands: this much frozen time, this much of it per
// frame (a few milliseconds), and again once the water under it moves by this
// much at the tail, middle or nose (m).
const SETTLE_TIME = 1.5;
const SETTLE_SLICE = 0.3;
const SETTLE_STEP = 0.1;
const SETTLE_CHANGE = 0.005;
// Standing water has no orbital flow to hold a board on its slope, so it would
// slide down it at the editor's soft mooring (4 /s², up to 1.6 m off in 1.5 s
// on testy's breaker); held four times firmer it is at rest within 0.7 m.
const SETTLE_MOOR = 16;

const worldPosition = new THREE.Vector3();
const worldQuaternion = new THREE.Quaternion();
const anchorInverse = new THREE.Quaternion();
const cameraDirection = new THREE.Vector3();

const noseYaw = (q) => Math.atan2(2 * (q[0] * q[2] + q[1] * q[3]), 1 - 2 * (q[0] * q[0] + q[1] * q[1]));

export default function Surfboard({
  settings,
  lighting,
  seaSettings,
  terrainDefinition,
  terrainQuery,
  surfRibbons,
  orbitRef,
  playing = false,
  onCheckpoint,
}) {
  const { camera, invalidate } = useThree();
  const anchorRef = useRef(null);
  const boardRef = useRef(null);
  const {
    surfboardLength, surfboardWidth, surfboardThickness, surfboardNoseRocker, surfboardTailRocker,
    surfboardMass, surfboardRiderMass, surfboardPaddle, surfboardCarve, surfboardBalance,
  } = settings;

  const hull = useMemo(() => buildBoardHull(boardDimensions({
    surfboardLength, surfboardWidth, surfboardThickness, surfboardNoseRocker, surfboardTailRocker,
  })), [surfboardLength, surfboardWidth, surfboardThickness, surfboardNoseRocker, surfboardTailRocker]);
  const riddenBody = useMemo(() => createBoardBody(hull, {
    boardMass: surfboardMass,
    riderMass: surfboardRiderMass,
    tuning: { paddle: surfboardPaddle, carve: surfboardCarve, balance: surfboardBalance },
  }), [hull, surfboardBalance, surfboardCarve, surfboardMass, surfboardPaddle, surfboardRiderMass]);
  const emptyBody = useMemo(() => createBoardBody(hull, { boardMass: surfboardMass, riderMass: 0 }), [hull, surfboardMass]);
  const water = useMemo(() => createSurfWater({
    seaSettings,
    coastDefinition: terrainDefinition,
    getCamera: () => camera.position,
    surfRibbons,
    terrainHeight: terrainQuery?.heightAt ?? null,
  }), [camera, seaSettings, surfRibbons, terrainDefinition, terrainQuery]);

  // The ride outlives rebuilds of the body and the water: a slider moved in
  // the editor reshapes the board where it floats instead of dropping it.
  const rideRef = useRef(null);
  if (!rideRef.current) {
    rideRef.current = {
      state: createBoardState(),
      mode: null,          // 'edit' | 'play' the last frame ran in
      spot: null,          // the automatic checkpoint, kept while editing
      spotSurf: null,      // the surf settings it was found with
      auto: null,
      placed: null,        // the checkpoint the moored board was last put at
      respawnRequest: surfPlay.respawnRequest,
      checkpointRequest: surfPlay.checkpointRequest,
      wipeoutAt: null,
      settleLeft: 0,       // frozen seconds a paused board still has to settle
      probe: null,         // the water under it when it last settled
      body: null,          // the empty body it last settled with
      publishedAt: -Infinity,
      discrete: '',
      frame: 0,
      physicsMs: 0,
      sample: {},
    };
  }

  useEffect(() => () => {
    surfPlay.board.ready = false;
    // No board, no spot to pin: leaving auto falls back to the stored fields.
    surfPlay.home = null;
    publishSurfPlay();
  }, []);

  // The automatic checkpoint: the lineup at the coast s of `at`, or with no
  // surf drawn, on the water in front of the camera.
  const lineupAt = (at) => {
    const spot = surfRibbons?.count ? surfLineup(surfRibbons, surfAlongAt(surfRibbons, at.x, at.z)) : null;
    if (spot) return spot;
    camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    if (cameraDirection.lengthSq() < 1e-6) cameraDirection.set(0, 0, -1);
    cameraDirection.normalize();
    return {
      x: camera.position.x + cameraDirection.x * AHEAD,
      z: camera.position.z + cameraDirection.z * AHEAD,
      yaw: Math.atan2(cameraDirection.x, cameraDirection.z),
    };
  };
  const manualCheckpoint = () => ({
    x: settings.surfboardCheckpointX,
    z: settings.surfboardCheckpointZ,
    yaw: settings.surfboardCheckpointYaw * DEG,
  });
  const viewPoint = () => orbitRef?.current?.target ?? camera.position;

  // On the sand the board rests on the ground (its origin is its lowest
  // rocker point), not buried at the height the sea would have there.
  const place = (ride, spot, time, draft) => {
    const at = water.sample(spot.x, spot.z, time, ride.sample);
    resetBoard(ride.state, { x: spot.x, y: Math.max(at.height - draft, at.ground), z: spot.z, yaw: spot.yaw });
    ride.wipeoutAt = null;
    ride.settleLeft = SETTLE_TIME;
  };

  // The water a paused board lies on, at its tail, middle and nose. It moves
  // when a sea or surf setting redraws it, or when the camera does: the drawn
  // sea drops trains by the camera's distance (surfWater's cell cut), so the
  // swell under a board framed from afar appears once «Показать» comes close.
  // The first look after the clock stopped only takes note: that board was
  // floating on this very water a frame ago.
  const waterMoved = (ride, spot, time) => {
    const sx = Math.sin(spot.yaw) * hull.length / 2, sz = Math.cos(spot.yaw) * hull.length / 2;
    const heights = [-1, 0, 1].map((k) => water.sample(spot.x + sx * k, spot.z + sz * k, time, ride.sample).height);
    const first = !ride.probe;
    const moved = first || heights.some((height, k) => Math.abs(height - ride.probe[k]) > SETTLE_CHANGE);
    if (moved) ride.probe = heights;
    return moved && !first;
  };

  useFrame((frame, delta) => {
    const anchor = anchorRef.current;
    const board = boardRef.current;
    const ride = rideRef.current;
    if (!anchor || !board) return;
    const { state } = ride;
    const time = frame.clock.elapsedTime;
    const dt = Math.min(delta, MAX_FRAME);
    const mode = playing ? 'play' : 'edit';
    const auto = settings.surfboardCheckpointAuto;

    // The editor's automatic spot: found once, then only re-found at the same
    // place along the coast when the surf itself changes, so moving the camera
    // never drags the board after it.
    if (auto && ride.auto !== true) ride.spot = null;
    ride.auto = auto;
    const surf = surfRibbons?.count ? surfRibbons.settings : null;
    if (auto && (!ride.spot || (surf && ride.spotSurf !== surf))) {
      ride.spot = lineupAt(ride.spot ?? viewPoint());
      ride.spotSurf = surf;
    }
    const checkpoint = auto ? ride.spot : manualCheckpoint();
    // Where the board waits, for leaveAuto to pin when an edit turns auto
    // off. Play keeps the last editor spot: nothing there leaves auto.
    if (mode === 'edit') surfPlay.home = checkpoint;
    // A reshaped or reweighed board floats differently: settle it again.
    if (ride.body !== emptyBody) {
      ride.body = emptyBody;
      ride.settleLeft = SETTLE_TIME;
    }
    // Wherever the ride goes, R and a wipeout bring it back out to the lineup
    // level with it. With no surf drawn lineupAt only looks ahead of the
    // camera, so it goes back to the spawn, which the auto checkpoint holds.
    const respawnSpot = () => (auto && surfRibbons?.count ? lineupAt({ x: state.p[0], z: state.p[2] }) : checkpoint);

    if (ride.mode !== mode) {
      if (mode === 'play') {
        // Play starts in the lineup at the editor's view, or at the checkpoint.
        const spawn = auto ? lineupAt(viewPoint()) : checkpoint;
        if (auto) { ride.spot = spawn; ride.spotSurf = surf; }
        place(ride, spawn, time, RIDDEN_DRAFT);
      } else {
        place(ride, checkpoint, time, EMPTY_DRAFT);
        ride.placed = checkpoint;
      }
      ride.mode = mode;
      ride.respawnRequest = surfPlay.respawnRequest;
      ride.checkpointRequest = surfPlay.checkpointRequest;
    }

    if (mode === 'play') {
      if (surfPlay.respawnRequest !== ride.respawnRequest) {
        ride.respawnRequest = surfPlay.respawnRequest;
        place(ride, respawnSpot(), time, RIDDEN_DRAFT);
      }
      if (surfPlay.checkpointRequest !== ride.checkpointRequest) {
        ride.checkpointRequest = surfPlay.checkpointRequest;
        onCheckpoint?.({
          x: Math.round(state.p[0] * 100) / 100,
          z: Math.round(state.p[2] * 100) / 100,
          yaw: Math.round(noseYaw(state.q) / DEG),
        });
      }
    } else if (!ride.placed || ride.placed.x !== checkpoint.x || ride.placed.z !== checkpoint.z || ride.placed.yaw !== checkpoint.yaw) {
      // The checkpoint moved (gizmo, sliders, auto): the board goes with it
      // at once, even with the clock paused, and settles there.
      place(ride, checkpoint, time, EMPTY_DRAFT);
      ride.placed = checkpoint;
    }

    if (dt > 0) {
      const started = performance.now();
      if (mode === 'play') {
        stepBoard(state, riddenBody, surfPlay.input, water.sample, time, dt, { substep: SUBSTEP });
        // Pop is an edge: one frame's kick per press.
        surfPlay.input.pop = false;
      } else {
        stepBoard(state, emptyBody, null, water.sample, time, dt, {
          substep: SUBSTEP,
          moor: { x: checkpoint.x, z: checkpoint.z, yaw: checkpoint.yaw },
        });
      }
      ride.physicsMs += (performance.now() - started - ride.physicsMs) * 0.1;
      // Whatever the water ever hands it, a lost board comes home rather than
      // taking NaN into the scene graph and the mirror.
      if (!(Number.isFinite(state.p[0] + state.p[1] + state.p[2]) && Number.isFinite(state.q[3]))) {
        place(ride, checkpoint, time, mode === 'play' ? RIDDEN_DRAFT : EMPTY_DRAFT);
      }
      // A running clock settles the board by itself; what is left of a settle
      // is finished if the clock stops before it would have.
      ride.settleLeft -= dt;
      ride.probe = null;
    } else if (mode === 'edit') {
      if (waterMoved(ride, checkpoint, time)) ride.settleLeft = SETTLE_TIME;
      if (ride.settleLeft > 0) {
        // The paused instant's water, standing still: its flow would push a
        // board on for ever. A slice per frame, and a frame asked for until the
        // settle is done (the editor draws on demand), plus one for the mirror.
        const frozen = (x, z, _time, out) => {
          water.sample(x, z, time, out);
          out.vx = 0; out.vy = 0; out.vz = 0;
          return out;
        };
        const moor = { x: checkpoint.x, z: checkpoint.z, yaw: checkpoint.yaw, stiffness: SETTLE_MOOR };
        for (let left = Math.min(ride.settleLeft, SETTLE_SLICE); left > 1e-6; left -= SETTLE_STEP) {
          stepBoard(state, emptyBody, null, frozen, time, Math.min(left, SETTLE_STEP), { substep: SUBSTEP, moor });
        }
        ride.settleLeft -= SETTLE_SLICE;
        invalidate();
      }
    }

    // A wipeout: the rider paddles back out to the lineup; the empty board a
    // breaker turned over in the editor is put back the right way up, or it
    // would float on its deck at the checkpoint for good.
    if (state.wipeout) {
      ride.wipeoutAt ??= time;
      if (time - ride.wipeoutAt > WIPEOUT_RESPAWN) {
        if (mode === 'play') place(ride, respawnSpot(), time, RIDDEN_DRAFT);
        else place(ride, checkpoint, time, EMPTY_DRAFT);
      }
    }

    // Pose: in the world while playing, relative to the checkpoint otherwise.
    worldPosition.set(state.p[0], state.p[1], state.p[2]);
    worldQuaternion.set(state.q[0], state.q[1], state.q[2], state.q[3]);
    if (mode === 'play') {
      anchor.position.set(0, 0, 0);
      anchor.rotation.set(0, 0, 0);
      board.position.copy(worldPosition);
      board.quaternion.copy(worldQuaternion);
    } else {
      anchor.position.set(checkpoint.x, 0, checkpoint.z);
      anchor.rotation.set(0, checkpoint.yaw, 0);
      anchorInverse.copy(anchor.quaternion).invert();
      board.position.copy(worldPosition).sub(anchor.position).applyQuaternion(anchorInverse);
      board.quaternion.copy(anchorInverse).multiply(worldQuaternion);
    }
    // A moving board keeps the mirror at its active rate (WaterReflections).
    const w = state.w;
    anchor.userData.ddgDynamicReflection = dt > 0 && (state.speed > 0.02 || w[0] * w[0] + w[1] * w[1] + w[2] * w[2] > 4e-4);

    // The store: plain numbers every frame; React hears of it a few times a
    // second, or at once when something it shows flips.
    const out = surfPlay.board;
    out.ready = true;
    out.x = state.p[0]; out.y = state.p[1]; out.z = state.p[2];
    out.yaw = noseYaw(state.q);
    out.vx = state.v[0]; out.vy = state.v[1]; out.vz = state.v[2];
    out.qx = state.q[0]; out.qy = state.q[1]; out.qz = state.q[2]; out.qw = state.q[3];
    out.speed = state.speed; out.planing = state.planing;
    out.onFace = state.onFace; out.airborne = state.airborne; out.wipeout = state.wipeout;
    // The rider's posture as the physics holds him (its own rule on the ground
    // speed where the state carries none), and the breaker under the board.
    out.riding = state.riding;
    const under = water.sample(state.p[0], state.p[2], time, ride.sample);
    out.onBreaker = under.onBreaker;
    const discrete = `${mode}${out.onFace}${out.airborne}${out.wipeout}`;
    if (discrete !== ride.discrete || (mode === 'play' && time - ride.publishedAt >= PUBLISH_INTERVAL)) {
      ride.discrete = discrete;
      ride.publishedAt = time;
      publishSurfPlay();
    }

    if (import.meta.env.DEV && typeof window !== 'undefined' && ride.frame++ % 6 === 0) {
      window.__DDG_BOARD__ = {
        mode,
        position: { x: state.p[0], y: state.p[1], z: state.p[2] },
        yaw: noseYaw(state.q) / DEG,
        up: 1 - 2 * (state.q[0] * state.q[0] + state.q[2] * state.q[2]),
        speed: state.speed,
        contact: state.contact,
        planing: state.planing,
        onFace: state.onFace,
        airborne: state.airborne,
        wipeout: state.wipeout,
        waterHeight: under.height,
        whitewater: under.whitewater,
        onBreaker: under.onBreaker,
        checkpoint: { ...checkpoint, auto },
        surf: { revision: surfRibbons?.revision ?? 0, count: surfRibbons?.count ?? 0 },
        physicsMs: ride.physicsMs,
        time,
      };
    }
  }, -8);

  return (
    <group ref={anchorRef} name="surfboard-anchor">
      <group ref={boardRef} name="surfboard">
        <SurfboardModel settings={settings} lighting={lighting} />
      </group>
    </group>
  );
}
