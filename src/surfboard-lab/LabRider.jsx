import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import SurfboardModel from '../components/surfboard/SurfboardModel';
import RiderModel from '../components/surfboard/RiderModel';
import { updateRiderModel } from '../components/surfboard/riderMesh';
import { lookRiderBody, updateRiderBody, useRiderBody } from '../components/surfboard/riderBody';
import { createBoardBody, createBoardState, stepBoard } from '../components/surfboard/boardPhysics';
import { deckHeight, halfWidth } from '../components/surfboard/boardShape';
import { createRider, resetRider, stepRider } from '../components/surfboard/riderController';

// The rider on the lab's board, run by the scene's own physics on still water
// (riderController, boardPhysics — what play runs, frame for frame): lying,
// paddling, riding, or thrown into the water to swim back and climb on. The
// lab only asks: its buttons are his intents, and riding it tows the board at
// a steady speed, since a stopped board cannot hold a standing man. The
// picture follows the board — the group under it is shifted back by the
// board's travel — so he stays in the studio's frame however far he goes.

const MAX_FRAME = 0.05;
const SUBSTEP = 1 / 120;
// Riding: towed up to this speed (m/s) at this rate (m/s²) — as a wave takes
// a board, he gets up once it runs (a board snatched from under him throws
// him, riderController's slam) — a gentle glide on flat water.
const TOW = 2.5;
const TOW_RATE = 1.5;
const TOW_POP = 1.4;
// «В воду»: the shove off the rail, sideways (m/s).
const SHOVE = 2.2;
const calm = (x, z, t, out) => {
  out.height = 0; out.vx = 0; out.vy = 0; out.vz = 0; out.whitewater = 0; out.ground = -Infinity;
  return out;
};
const calmAt = (x, z, out) => calm(x, z, 0, out);
const noseYaw = (q) => Math.atan2(2 * (q[0] * q[2] + q[1] * q[3]), 1 - 2 * (q[0] * q[0] + q[1] * q[1]));

export default function LabRider({ hull, dims, board, lighting, pose, look, pace, wireframe, onState, onClimbed }) {
  const ridden = useMemo(() => createBoardBody(hull, {
    boardMass: board.surfboardMass, riderMass: board.surfboardRiderMass,
    tuning: { paddle: board.surfboardPaddle, carve: board.surfboardCarve, balance: board.surfboardBalance },
  }), [board.surfboardBalance, board.surfboardCarve, board.surfboardMass, board.surfboardPaddle, board.surfboardRiderMass, hull]);
  const empty = useMemo(() => createBoardBody(hull, { boardMass: board.surfboardMass, riderMass: 0 }), [board.surfboardMass, hull]);
  // A new board shape is a new session: the board on the water, he on it.
  const session = useMemo(() => {
    const state = createBoardState({ y: -0.07 });
    const rider = createRider({
      length: dims.length,
      deckY: (x, z) => deckHeight(dims, x, z),
      halfWidth: (z) => halfWidth(dims, z / dims.length + 0.5),
    });
    const view = { p: state.p, q: state.q, v: state.v, w: state.w, speed: 0, wipeout: false };
    resetRider(rider, view);
    return {
      state, rider, view, time: 0, tow: 0, shove: false, push: false, reported: null, wet: false,
      intent: { lean: 0, trim: 0, crouch: 0, grab: 0, lookBack: 0, strokeLeft: 0, strokeRight: 0, popUp: 0 },
    };
  }, [dims]);
  const body = useRiderBody(look !== 'skeleton');
  const frame = useRef(null);
  const boardRef = useRef(null);
  const sticks = useRef(null);

  // «В воду» is a shove, once per press of the button.
  useEffect(() => { if (pose === 'swim') session.shove = true; }, [pose, session]);
  useEffect(() => { if (body) lookRiderBody(body, look); }, [body, look]);

  useFrame((_, delta) => {
    const s = session;
    const { state, rider, intent, view } = s;
    const dt = Math.min(delta, MAX_FRAME) * pace;
    if (dt > 0) {
      s.time += dt;
      const on = rider.out.onBoard;
      stepBoard(state, on ? ridden : empty, on ? rider.out.input : null, calm, s.time, dt, { substep: SUBSTEP, external: rider.out.leash });
      const yaw = noseYaw(state.q);
      s.tow = pose === 'stand' && on ? Math.min(TOW, s.tow + TOW_RATE * dt) : 0;
      if (s.tow > 0) {
        state.v[0] = s.tow * Math.sin(yaw); state.v[2] = s.tow * Math.cos(yaw);
      } else if (pose === 'prone' && on) {
        state.v[0] *= 0.9; state.v[2] *= 0.9;
      }
      // His intents: forward held to paddle; a press to get up; the shove.
      intent.trim = pose === 'paddle' && rider.state === 'prone' ? 1 : 0;
      if (s.tow >= TOW_POP && rider.state === 'prone') intent.popUp += 1;
      view.speed = Math.hypot(state.v[0], state.v[2]);
      // The shove: the board's own signal for a throw (as a wipeout gives it),
      // then, once he has let go (his bodies free), the push off the rail.
      view.wipeout = s.shove && on;
      if (view.wipeout) { s.shove = false; s.push = true; }
      if (s.push && rider.state === 'fallen') {
        s.push = false;
        const sx = Math.cos(yaw), sz = -Math.sin(yaw);
        rider.world.bodies.forEach((b) => { b.v[0] += SHOVE * sx; b.v[1] += 1; b.v[2] += SHOVE * sz; });
      }
      stepRider(rider, { dt, board: view, intent, water: calmAt, ground: null });
      if (!rider.world.bodies.every((b) => Number.isFinite(b.x[0] + b.x[1] + b.x[2] + b.q[3]))) resetRider(rider, view);
      // Back on the board after a swim, he lies there till asked again.
      if (!rider.out.onBoard) s.wet = true;
      if (s.wet && rider.state === 'prone') { s.wet = false; onClimbed?.(); }
    }
    frame.current?.position.set(-state.p[0], 0, -state.p[2]);
    boardRef.current?.position.set(state.p[0], state.p[1], state.p[2]);
    boardRef.current?.quaternion.set(state.q[0], state.q[1], state.q[2], state.q[3]);
    updateRiderModel(sticks.current, rider);
    updateRiderBody(body, rider);
    if (rider.state !== s.reported) { s.reported = rider.state; onState?.(rider.state); }
  });

  return (
    <group ref={frame}>
      <group ref={boardRef}>
        <SurfboardModel settings={board} lighting={lighting} wireframe={wireframe} />
      </group>
      {body && <primitive object={body} visible={look !== 'skeleton'} />}
      <RiderModel ref={sticks} visible={look !== 'human' || !body} />
    </group>
  );
}
