import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import SurfboardModel from '../components/surfboard/SurfboardModel';
import RiderModel from '../components/surfboard/RiderModel';
import { updateRiderModel } from '../components/surfboard/riderMesh';
import { lookRiderBody, updateRiderBody, useRiderBody } from '../components/surfboard/riderBody';
import { createBoardBody, createBoardState, stepBoard } from '../components/surfboard/boardPhysics';
import { deckHeight, halfWidth } from '../components/surfboard/boardShape';
import { createRider, resetRider, stepRider } from '../components/surfboard/riderController';
import { createControls, createPose, proneControls, solvePose, swimControls } from '../components/surfboard/riderPose';
import { STROKE_KEYS, SWIM_KEYS } from '../components/surfboard/poseTuning';
import { REST, SEGMENT, SEGMENT_CENTRE, SEGMENT_NAMES } from '../components/surfboard/riderSkeleton';
import { qRotate } from '../components/surfboard/ragdoll';

// The rider on the lab's board, run by the scene's own physics on still water
// (riderController, boardPhysics — what play runs, frame for frame): lying,
// paddling, riding, or thrown into the water to swim back and climb on. The
// lab only asks: its buttons are his intents, and riding it tows the board at
// a steady speed, since a stopped board cannot hold a standing man. The
// picture follows the board — the group under it is shifted back by the
// board's travel — so he stays in the studio's frame however far he goes.
//
// Editing a pose, the physics stops and he is shown exactly as the pose
// builder (riderPose.js) puts him, nothing pulling at him: lying on the board
// resting on the water line; paddling, the same at one of the four moments of
// a stroke; swimming, alone at the surface, at a moment of the crawl. A point
// on each part he can be moved by — pelvis, chest, head, hands, elbows,
// knees, feet — and the arrows on the chosen one move it; what moves is
// Denis's correction (poseTuning.js), on top of the pose the code builds.

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
// Editing: the board's height, the draft his weight gives it.
const REST_DRAFT = -0.07;
const ALL_PARTS = ['pelvis', 'chest', 'head', 'handL', 'handR', 'elbowL', 'elbowR', 'kneeL', 'kneeR', 'footL', 'footR'];
// What each pose lets be moved: paddling moves only the arms (lying holds
// the rest of him).
const POSE_PARTS = { prone: ALL_PARTS, paddle: ['handL', 'handR', 'elbowL', 'elbowR'], swim: ALL_PARTS };
// A drag of the chest or the head turns it about its joint: this far is a
// radian (m).
const CHEST_ARM = 0.3, HEAD_ARM = 0.15;
const DEG = 180 / Math.PI;
const calm = (x, z, t, out) => {
  out.height = 0; out.vx = 0; out.vy = 0; out.vz = 0; out.whitewater = 0; out.ground = -Infinity;
  return out;
};
const calmAt = (x, z, out) => calm(x, z, 0, out);
const noseYaw = (q) => Math.atan2(2 * (q[0] * q[2] + q[1] * q[3]), 1 - 2 * (q[0] * q[0] + q[1] * q[1]));

// A joint's place in the board frame, from the segment that carries it.
const offset = [0, 0, 0];
function jointAt(pose, segment, restJoint) {
  const i = SEGMENT[segment], c = SEGMENT_CENTRE[segment];
  offset[0] = restJoint[0] - c[0]; offset[1] = restJoint[1] - c[1]; offset[2] = restJoint[2] - c[2];
  qRotate(pose.rotation[i], offset, offset);
  return new THREE.Vector3(pose.position[i][0] + offset[0], pose.position[i][1] + offset[1], pose.position[i][2] + offset[2]);
}
// Every part's point on the lying pose, in the board frame, and the joints a
// knee's or an elbow's direction is taken from.
function posePoints(pose, controls) {
  const at = (name) => new THREE.Vector3(...pose.position[SEGMENT[name]]);
  const points = { pelvis: at('pelvis'), chest: at('chest'), head: at('head') };
  for (const side of ['L', 'R']) {
    points[`hand${side}`] = jointAt(pose, `forearm${side}`, REST[`wrist${side}`]);
    points[`elbow${side}`] = jointAt(pose, `upperArm${side}`, REST[`elbow${side}`]);
    points[`knee${side}`] = jointAt(pose, `thigh${side}`, REST[`knee${side}`]);
    points[`foot${side}`] = new THREE.Vector3(...controls[`sole${side}`]);
    points[`shoulder${side}`] = jointAt(pose, `upperArm${side}`, REST[`shoulder${side}`]);
    points[`hip${side}`] = jointAt(pose, `thigh${side}`, REST[`hip${side}`]);
    points[`ankle${side}`] = jointAt(pose, `shin${side}`, REST[`ankle${side}`]);
  }
  return points;
}
const poleTowards = (point, from, to) => {
  const pole = point.clone().sub(from.clone().add(to).multiplyScalar(0.5));
  return pole.lengthSq() > 1e-8 ? pole.normalize().toArray() : null;
};

// The correction a drag makes in pose `name` (at stroke moment `key`): the
// part's point, now at `point`, moved by `delta` (the pose's frame) from where
// it was when the drag began (`start` the corrections then, `points` the
// parts' points then). A hand, paddling or swimming, moves its stroke at
// that moment.
function dragged(name, key, part, start, points, point, delta) {
  const all = structuredClone(start), t = all[name];
  const move = [delta.x, delta.y, delta.z];
  const shift = (value) => value.map((v, i) => v + move[i]);
  const side = part.slice(-1);
  if (part.startsWith('hand') && name !== 'prone') t[`stroke${side}`][key] = shift(t[`stroke${side}`][key]);
  else if (part === 'pelvis' || part.startsWith('hand') || part.startsWith('foot')) t[part] = shift(t[part]);
  else if (part === 'chest') t.chest += Math.atan2(delta.y, CHEST_ARM) * DEG;
  else if (part === 'head') t.head = [t.head[0] + Math.atan2(delta.y, HEAD_ARM) * DEG, t.head[1] + Math.atan2(delta.x, HEAD_ARM) * DEG];
  else if (part.startsWith('elbow')) t[part] = poleTowards(point, points[`shoulder${side}`], points[`hand${side}`]);
  else if (part.startsWith('knee')) t[part] = poleTowards(point, points[`hip${side}`], points[`ankle${side}`]);
  return all;
}

export default function LabRider({
  hull, dims, board, lighting, pose, look, pace, wireframe, onState, onClimbed,
  editing = false, editPose = 'prone', editKey = 0, tuning = null, part = null, onPart, onTuning,
}) {
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

  // The pose the code builds with the corrections of the moment (riderPose
  // holds them: the lab sets them there, so the physics has them too) — on
  // the board resting on its draft, or swimming at the surface — and the
  // parts' points.
  const swimming = editPose === 'swim';
  const lift = useMemo(() => new THREE.Vector3(0, swimming ? 0 : REST_DRAFT, 0), [swimming]);
  const still = useMemo(() => {
    const controls = createControls(), built = createPose();
    if (swimming) swimControls({ strokeL: SWIM_KEYS[editKey], strokeR: SWIM_KEYS[editKey], kick: 0, lift: 1 }, controls);
    else {
      const phase = editPose === 'paddle' ? STROKE_KEYS[editKey] : -1;
      proneControls(session.rider.board, { strokeL: phase, strokeR: phase, arch: 0.6, kick: 0 }, controls);
    }
    solvePose(controls, built);
    const bodies = SEGMENT_NAMES.map((_, i) => ({
      x: [built.position[i][0], built.position[i][1] + lift.y, built.position[i][2]],
      q: built.rotation[i],
    }));
    return { rider: { world: { bodies } }, points: posePoints(built, controls) };
  }, [editKey, editPose, lift, session, swimming, tuning]); // eslint-disable-line react-hooks/exhaustive-deps -- tuning is read through riderPose
  const parts = POSE_PARTS[editPose];

  // The arrows ride an empty put on the chosen part; a drag turns how far it
  // went from where it began into the correction.
  const target = useMemo(() => new THREE.Object3D(), []);
  const drag = useRef(null);
  useEffect(() => {
    if (editing && parts.includes(part) && !drag.current) target.position.copy(still.points[part]).add(lift);
  }, [editing, lift, part, parts, still, target]);
  const startDrag = () => { drag.current = { tuning: structuredClone(tuning), points: still.points, from: target.position.clone() }; };
  const moveDrag = () => {
    const d = drag.current;
    if (!d || !part) return;
    const delta = target.position.clone().sub(d.from);
    onTuning?.(dragged(editPose, editKey, part, d.tuning, d.points, target.position.clone().sub(lift), delta));
  };
  const endDrag = () => { drag.current = null; };

  useFrame((_, delta) => {
    const s = session;
    const { state, rider, intent, view } = s;
    if (editing) {
      frame.current?.position.set(0, 0, 0);
      if (boardRef.current) boardRef.current.visible = !swimming;
      boardRef.current?.position.set(0, REST_DRAFT, 0);
      boardRef.current?.quaternion.set(0, 0, 0, 1);
      updateRiderModel(sticks.current, still.rider);
      updateRiderBody(body, still.rider);
      return;
    }
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
    if (boardRef.current) boardRef.current.visible = true;
    boardRef.current?.position.set(state.p[0], state.p[1], state.p[2]);
    boardRef.current?.quaternion.set(state.q[0], state.q[1], state.q[2], state.q[3]);
    updateRiderModel(sticks.current, rider);
    updateRiderBody(body, rider);
    if (rider.state !== s.reported) { s.reported = rider.state; onState?.(rider.state); }
  });

  return (
    <>
      <group ref={frame}>
        <group ref={boardRef}>
          <SurfboardModel settings={board} lighting={lighting} wireframe={wireframe} />
        </group>
        {body && <primitive object={body} visible={look !== 'skeleton'} />}
        <RiderModel ref={sticks} visible={look !== 'human' || !body} />
      </group>
      {editing && <>
        {parts.map((name) => (
          <mesh
            key={name}
            position={still.points[name].clone().add(lift)}
            renderOrder={10}
            onClick={(event) => { event.stopPropagation(); onPart?.(name); }}
          >
            <sphereGeometry args={[name === part ? 0.034 : 0.026, 20, 14]} />
            <meshBasicMaterial color={name === part ? '#1d2a24' : '#d4622e'} depthTest={false} transparent opacity={0.92} />
          </mesh>
        ))}
        <primitive object={target} />
        {parts.includes(part) && <TransformControls object={target} mode="translate" size={0.7} onMouseDown={startDrag} onObjectChange={moveDrag} onMouseUp={endDrag} />}
      </>}
    </>
  );
}
