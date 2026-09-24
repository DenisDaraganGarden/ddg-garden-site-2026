import { createWalker, crouchControls, jumpControls, jumpLegs, landWalker, resetWalker, RUN_SPEED, SPREADS, stepWalker, walkControls, WALK_SPEED } from '../components/surfboard/riderWalk.js';
import { blendControls, copyControls, createControls, createPose, solvePose } from '../components/surfboard/riderPose.js';
import { SEGMENT_NAMES } from '../components/surfboard/riderSkeleton.js';
import { groundHeight, rayDistance } from './walkGround.js';

// Прогулка по проекту: тот же человек, что на доске (riderWalk.js — шаг,
// перекат стопы, таз над ногами, руки маятником), без доски. Поза — не
// физика, а решённый скелет (riderPose.js solvePose) прямо в кости модели.
//
// Земля — walkGround.js: нога ищет пол не выше колена над тем, где он стоит,
// поэтому встаёт на ступень и сходит с неё, а навес над головой не мешает.
// Выше STEP_UP — уступ (скамья, край террасы): стоп, можно запрыгнуть. Стены
// — лучами выше шага, на поясе и груди; в стену не идёт, а скользит вдоль
// неё. Под ногами пропасть глубже FALL — падает, как в прыжке без толчка.
export const STEP_UP = 0.42;
const RADIUS = 0.28;
// Лучи стен — выше шага: то, что ниже, — ступень или уступ, их ищет пол.
const WALL_HEIGHTS = [0.6, 1.05, 1.5];
const HEADROOM = 2.2;
const FALL = 0.55;
const G = 9.81, JUMP_UP = 2.9, LOAD = 0.12, GIVE = 0.13;
// В воздухе ход правится к кнопкам (1/с): к уступу прыгают и с места.
const AIR = 4;
const STYLE = Object.freeze({ tuck: 1, handL: SPREADS[0], handR: SPREADS[0], hugUp: null, legs: 0, spin: 0, give: 1, head: [0, 0] });
// Поворот к цели (рад/с): идя — быстро, стоя — шагами.
const TURN = 7, TURN_STANDING = 2.3;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// Куда встанет нога с пола floor: не выше шага вверх; за обрывом глубже FALL
// — шаг в воздух на прежней высоте, а дальше тело с края падает.
const footing = (g, floor) => (x, z) => { const h = groundHeight(g, x, z, floor + STEP_UP); return h >= floor - FALL ? h : floor; };

export function createWalk() {
    return {
        walker: createWalker(), mode: 'walk', t: 0, turning: false,
        leap: { p: [0, 0, 0], v: [0, 0, 0], yaw: 0, floor: 0, tuck: 0, reach: 0, t: 0, up: 0 },
        safe: { x: 0, z: 0, y: 0, yaw: 0 },
        aim: createControls(), controls: createControls(), from: createControls(), blend: 1, blendFor: 0.2,
        pose: createPose(), bodies: SEGMENT_NAMES.map(() => ({ x: [0, 0, 0], q: [0, 0, 0, 1] })),
    };
}

// Встать в (x, z) у высоты y (точка, куда смотрела камера), лицом по yaw.
export function resetWalk(s, g, { x, y, z, yaw = 0 }) {
    const top = groundHeight(g, x, z, y + 0.5);
    const floor = Number.isFinite(top) ? top : y;
    resetWalker(s.walker, { x, z, yaw, ground: footing(g, floor) });
    s.mode = 'walk'; s.t = 0; s.turning = false;
    Object.assign(s.safe, { x, z, y: floor, yaw });
    pose(s, 0);
    copyControls(s.aim, s.from); copyControls(s.aim, s.controls); s.blend = 1;
    solveBodies(s);
    return s;
}

const blend = (s, seconds) => { copyControls(s.controls, s.from); s.blend = 0; s.blendFor = seconds; };

// Упрётся ли шаг (mx, mz) из (px, pz) в стену или в уступ выше STEP_UP.
function blocked(g, px, pz, floor, mx, mz) {
    const length = Math.hypot(mx, mz);
    if (length < 1e-6) return false;
    const ux = mx / length, uz = mz / length;
    const top = groundHeight(g, px + mx + ux * RADIUS * 0.5, pz + mz + uz * RADIUS * 0.5, floor + HEADROOM);
    if (top > floor + STEP_UP) return true;
    for (const h of WALL_HEIGHTS) if (rayDistance(g, px, floor + h, pz, ux, 0, uz, length + RADIUS) < Infinity) return true;
    return false;
}
// Шаг в стену — вдоль неё: сначала весь, потом по одной оси, иначе на месте.
function collide(s, g, px, pz) {
    const w = s.walker, mx = w.x - px, mz = w.z - pz;
    if (!blocked(g, px, pz, w.groundY, mx, mz)) return;
    if (Math.abs(mx) > 1e-6 && !blocked(g, px, pz, w.groundY, mx, 0)) { w.z = pz; return; }
    if (Math.abs(mz) > 1e-6 && !blocked(g, px, pz, w.groundY, 0, mz)) { w.x = px; return; }
    w.x = px; w.z = pz;
    w.speed *= 0.5;
}

function takeoff(s, up) {
    const w = s.walker, leap = s.leap;
    leap.p[0] = s.aim.pelvis[0]; leap.p[1] = s.aim.pelvis[1]; leap.p[2] = s.aim.pelvis[2];
    leap.v[0] = Math.sin(w.yaw) * w.speed; leap.v[1] = up; leap.v[2] = Math.cos(w.yaw) * w.speed;
    leap.yaw = w.yaw; leap.floor = w.groundY; leap.tuck = 0; leap.reach = 0; leap.t = 0; leap.up = up;
    s.mode = 'air';
    blend(s, 0.12);
}

// Один кадр. input: { moveYaw, amount 0..1 (куда и насколько идти), run 0..1,
// jump (нажат в этом кадре), faceYaw (куда смотреть стоя; от первого лица —
// взгляд), instant (от первого лица: тело сразу по ходу) }.
export function stepWalk(s, input, g, dt) {
    if (!(dt > 0)) return s;
    const w = s.walker;
    if (s.mode !== 'air') {
        const level = w.groundY + STEP_UP, floor = w.groundY;
        const going = input.amount > 0.05 && s.mode === 'walk';
        let turn = 0, back = false;
        if (going) {
            // От глаз назад — пятится лицом вперёд, а не разворачивается.
            back = Boolean(input.instant) && Math.abs(wrap(input.moveYaw - (input.faceYaw ?? input.moveYaw))) > 1.9;
            if (input.instant) w.yaw = back ? wrap(input.moveYaw + Math.PI) : input.moveYaw;
            else w.yaw += clamp(wrap(input.moveYaw - w.yaw), -TURN * dt, TURN * dt);
            s.turning = false;
        } else if (input.faceYaw !== undefined) {
            // Стоя поворачивается к взгляду шагами, когда тот ушёл далеко.
            const diff = wrap(input.faceYaw - w.yaw);
            if (Math.abs(diff) > 0.6) s.turning = true;
            if (s.turning) turn = clamp(diff / (TURN_STANDING * dt), -1, 1);
            if (Math.abs(diff) < 0.05) s.turning = false;
        }
        const px = w.x, pz = w.z;
        stepWalker(w, { dt, forward: going ? (back ? -input.amount : input.amount) : 0, turn, run: input.run, ground: footing(g, floor) });
        collide(s, g, px, pz);
        const under = groundHeight(g, w.x, w.z, level);
        if (!Number.isFinite(under) || floor - under > FALL) {
            pose(s, dt);
            takeoff(s, 0);
        } else {
            if (!w.feet.L.swing && !w.feet.R.swing) Object.assign(s.safe, { x: w.x, z: w.z, y: w.groundY, yaw: w.yaw });
            if (input.jump && s.mode === 'walk') { s.mode = 'crouch'; s.t = 0; blend(s, 0.08); }
            if (s.mode === 'crouch') { s.t += dt; if (s.t >= LOAD) { pose(s, dt); takeoff(s, JUMP_UP); } }
        }
    } else {
        const leap = s.leap, p = leap.p, v = leap.v;
        leap.t += dt;
        if (input.amount > 0.05) {
            const want = Math.max(Math.hypot(v[0], v[2]), input.amount * WALK_SPEED), k = 1 - Math.exp(-AIR * dt);
            v[0] += (Math.sin(input.moveYaw) * want - v[0]) * k;
            v[2] += (Math.cos(input.moveYaw) * want - v[2]) * k;
            leap.yaw = input.instant ? input.moveYaw : leap.yaw + clamp(wrap(input.moveYaw - leap.yaw), -TURN * dt, TURN * dt);
        }
        // В воздухе в стену не летит: горизонтальная скорость гаснет.
        const hx = v[0] * dt, hz = v[2] * dt, feet = p[1] - jumpLegs(leap.tuck, leap.reach);
        if ((hx || hz) && [0.3, 0.9].some((h) => rayDistance(g, p[0], feet + h, p[2], hx / Math.hypot(hx, hz), 0, hz / Math.hypot(hx, hz), Math.hypot(hx, hz) + RADIUS) < Infinity)) { v[0] = 0; v[2] = 0; }
        p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
        v[1] -= G * dt;
        const surface = groundHeight(g, p[0], p[2], p[1]);
        leap.tuck = smoothstep(0.04, 0.26, leap.t);
        const drop = p[1] - jumpLegs(0, 0) - surface;
        const untilDown = (v[1] + Math.sqrt(Math.max(v[1] * v[1] + 2 * G * drop, 0))) / G;
        leap.reach = 1 - smoothstep(0.08, 0.24, untilDown);
        if (v[1] < 0 && Number.isFinite(surface) && p[1] - jumpLegs(leap.tuck, leap.reach) <= surface) {
            const along = v[0] * Math.sin(leap.yaw) + v[2] * Math.cos(leap.yaw);
            resetWalker(w, { x: p[0], z: p[2], yaw: leap.yaw, ground: footing(g, surface), speed: clamp(along, 0, RUN_SPEED) });
            landWalker(w, GIVE * clamp(-v[1] / 4, 0.4, 1.2));
            s.mode = 'walk';
            blend(s, 0.22);
        } else if (p[1] < s.safe.y - 60 || leap.t > 8) {
            // Упал за край мира — снова там, где стоял последний раз.
            resetWalk(s, g, { ...s.safe, y: s.safe.y + 0.1 });
            return s;
        }
    }
    pose(s, dt);
    solveBodies(s);
    return s;
}

const flight = { x: 0, y: 0, z: 0, yaw: 0, t: 0, floor: 0, tuck: 0, reach: 0, hug: 0, style: STYLE };
function pose(s, dt) {
    const w = s.walker;
    if (s.mode === 'air') {
        const leap = s.leap;
        Object.assign(flight, { x: leap.p[0], y: leap.p[1], z: leap.p[2], yaw: leap.yaw, t: leap.t, floor: leap.t < 0.3 ? leap.floor : -Infinity, tuck: leap.tuck, reach: leap.reach });
        jumpControls(flight, s.aim);
    } else {
        walkControls(w, s.aim, null);
        if (s.mode === 'crouch') crouchControls(s.aim, w.yaw, smoothstep(0, 1, s.t / LOAD));
    }
    s.blend = Math.min(1, s.blend + dt / s.blendFor);
    blendControls(s.from, s.aim, smoothstep(0, 1, s.blend), s.controls);
}
function solveBodies(s) {
    solvePose(s.controls, s.pose);
    s.bodies.forEach((body, i) => {
        const p = s.pose.position[i], q = s.pose.rotation[i];
        body.x[0] = p[0]; body.x[1] = p[1]; body.x[2] = p[2];
        body.q[0] = q[0]; body.q[1] = q[1]; body.q[2] = q[2]; body.q[3] = q[3];
    });
}

// Одно слово для подсказок: стоит, идёт, бежит, прыжок, падает.
export const walkState = (s) => (s.mode === 'air' ? (s.leap.up > 0 ? 'jump' : 'fall') : s.mode === 'crouch' ? 'jump'
    : Math.abs(s.walker.speed) < 0.1 ? 'stand' : s.walker.run > 0.5 ? 'run' : 'walk');

// Куда смотрит глаз: над тазом на высоту глаз, чуть вперёд по взгляду.
export const EYE_ABOVE_PELVIS = 0.66;
